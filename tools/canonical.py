import hashlib
import json


def canonical_bytes(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(obj):
    return hashlib.sha256(canonical_bytes(obj)).hexdigest()
