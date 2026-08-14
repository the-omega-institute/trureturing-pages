import hashlib

try:
    from tools.canonical import canonical_bytes
except ModuleNotFoundError:
    from canonical import canonical_bytes


def derive_work_id(source_commit, node_gid, pipeline_version):
    identity = {
        "source_commit": source_commit,
        "node_gid": node_gid,
        "pipeline_version": pipeline_version,
    }
    return hashlib.sha256(canonical_bytes(identity)).hexdigest()
