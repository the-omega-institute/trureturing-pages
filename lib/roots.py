import os
from pathlib import Path

RUNTIME_ROOT = Path(os.path.expanduser("~/.fkst/trureturing-pages/runtime"))
DURABLE_ROOT = Path(os.path.expanduser("~/.fkst/trureturing-pages/durable"))
LOGS_ROOT = Path(os.path.expanduser("~/.fkst/trureturing-pages/logs"))

class OutOfTreeWriteError(PermissionError):
    pass

def _inside(path_real, root_real):
    try:
        return os.path.commonpath((str(path_real), str(root_real))) == str(root_real)
    except ValueError:
        return False


def _has_symlink_component(path, root):
    path_absolute = Path(os.path.abspath(path))
    root_absolute = Path(os.path.abspath(root))
    try:
        relative_parts = path_absolute.relative_to(root_absolute).parts
    except ValueError:
        return True

    current = root_absolute
    if current.is_symlink():
        return True
    for component in relative_parts:
        current = current / component
        if current.is_symlink():
            return True
    return False


def assert_write_allowed(path, allowed_roots):
    path = Path(path)
    path_real = Path(os.path.realpath(path))
    for root in allowed_roots:
        root_real = Path(os.path.realpath(root))
        if _inside(path_real, root_real) and not _has_symlink_component(path, root):
            return path
    raise OutOfTreeWriteError(str(path))
