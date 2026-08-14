import subprocess
import os

class ForbiddenCallError(PermissionError):
    pass

def run_checked(cmd, *args, **kwargs):
    argv = list(cmd)
    if argv and os.path.basename(argv[0]) == "gh":
        raise ForbiddenCallError("gh calls are forbidden")
    if argv and os.path.basename(argv[0]) == "git":
        i = 1
        while i < len(argv):
            token = argv[i]
            if token in {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"}: i += 2; continue
            if token.startswith("--git-dir=") or token.startswith("--work-tree=") or token.startswith("--namespace=") or token.startswith("--config-env="):
                i += 1; continue
            if token.startswith("-"): i += 1; continue
            if token in {"push", "fetch", "pull", "remote", "clone"}:
                raise ForbiddenCallError("network git calls are forbidden")
            break
    return subprocess.run(argv, *args, **kwargs)
