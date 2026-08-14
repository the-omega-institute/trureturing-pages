import json
from pathlib import Path
from tools import validate as validator

class SnapshotError(ValueError):
    pass

class SnapshotProvider:
    def load_snapshot(self, path):
        try:
            with open(path, encoding="utf-8") as stream:
                value = json.load(stream, object_pairs_hook=validator.reject_duplicate_object_members)
            schema_path = Path(__file__).resolve().parents[1] / "schemas" / "source-snapshot.v1.schema.json"
            with open(schema_path, encoding="utf-8") as stream:
                schema = json.load(stream)
            validator.check_schema(schema)
            validator.validate(schema, value)
            validator.validate_semantics(value)
            return value
        except (OSError, json.JSONDecodeError, validator.ValidationError, validator.UnsupportedSchema) as exc:
            raise SnapshotError(str(exc)) from exc

class DeriveStateProbe:
    def probe(self):
        return {"available": False, "reason": "authoritative DAG unavailable in Phase B"}
