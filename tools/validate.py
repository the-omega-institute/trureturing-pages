#!/usr/bin/env python3
import datetime
import json
import re
import sys

try:
    from tools.workid import derive_work_id
except ModuleNotFoundError:
    from workid import derive_work_id


ALLOWED = {
    "type", "required", "properties", "items", "enum", "const", "pattern",
    "additionalProperties", "minimum", "minLength", "minItems", "maxItems",
    "anyOf", "format",
}
META = {"$schema", "title", "description"}
# Leap seconds (:60) are intentionally unsupported.
RFC3339_UTC = re.compile(
    r"^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?Z$"
)


class ValidationError(Exception):
    pass


class UnsupportedSchema(Exception):
    pass


def fail(path, message):
    raise ValidationError(f"{path}: {message}")


def reject_duplicate_object_members(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            fail("$", f"duplicate object member {key}")
        result[key] = value
    return result


def check_schema(schema):
    if not isinstance(schema, dict):
        raise UnsupportedSchema("unsupported schema keyword")
    for key, value in schema.items():
        if key not in ALLOWED and key not in META:
            raise UnsupportedSchema(f"unsupported schema keyword: {key}")
        if key == "format" and value != "date-time":
            raise UnsupportedSchema(f"unsupported schema keyword: format={value}")
        if key == "additionalProperties" and value is not False:
            raise UnsupportedSchema(
                "unsupported schema keyword value: additionalProperties must be false"
            )
    for subschema in schema.get("properties", {}).values():
        check_schema(subschema)
    if "items" in schema:
        check_schema(schema["items"])
    for option in schema.get("anyOf", []):
        check_schema(option)


def same_type(a, b):
    return type(a) is type(b) or (isinstance(a, (int, float)) and not isinstance(a, bool) and isinstance(b, (int, float)) and not isinstance(b, bool))


def validate(schema, value, path="$"):
    if "const" in schema and (not same_type(value, schema["const"]) or value != schema["const"]): fail(path, f"must equal {schema['const']!r}")
    if "enum" in schema and not any(same_type(value, item) and value == item for item in schema["enum"]): fail(path, f"must be one of {schema['enum']!r}")
    expected = schema.get("type")
    type_ok = {"object": isinstance(value, dict), "array": isinstance(value, list), "string": isinstance(value, str), "integer": isinstance(value, int) and not isinstance(value, bool), "boolean": isinstance(value, bool), "null": value is None, "number": isinstance(value, (int, float)) and not isinstance(value, bool)}
    if expected and not type_ok.get(expected, False): fail(path, f"expected {expected}")
    if isinstance(value, dict):
        for name in schema.get("required", []):
            if name not in value: fail(f"{path}.{name}", "missing required property")
        if schema.get("additionalProperties") is False:
            allowed = set(schema.get("properties", {}))
            for name in value:
                if name not in allowed: fail(f"{path}.{name}", "additional property is not allowed")
        for name, subschema in schema.get("properties", {}).items():
            if name in value: validate(subschema, value[name], f"{path}.{name}")
    elif isinstance(value, list) and "items" in schema:
        for i, item in enumerate(value): validate(schema["items"], item, f"{path}[{i}]")
    if isinstance(value, (int, float)) and not isinstance(value, bool) and "minimum" in schema and value < schema["minimum"]: fail(path, f"must be >= {schema['minimum']}")
    if isinstance(value, str) and "minLength" in schema and len(value) < schema["minLength"]: fail(path, f"length must be >= {schema['minLength']}")
    if isinstance(value, list) and "minItems" in schema and len(value) < schema["minItems"]: fail(path, f"must contain at least {schema['minItems']} items")
    if isinstance(value, list) and "maxItems" in schema and len(value) > schema["maxItems"]: fail(path, f"must contain at most {schema['maxItems']} items")
    if isinstance(value, str) and "pattern" in schema and re.fullmatch(schema["pattern"], value) is None: fail(path, "does not match required pattern")
    if "format" in schema:
        if not isinstance(value, str) or RFC3339_UTC.fullmatch(value) is None:
            fail(path, "must be a valid date-time")
        try: datetime.datetime.fromisoformat(value[:-1] + "+00:00")
        except (ValueError, TypeError): fail(path, "must be a valid date-time")
    if "anyOf" in schema:
        for option in schema["anyOf"]:
            try:
                validate(option, value, path)
                break
            except ValidationError:
                pass
        else: fail(path, "does not match anyOf")


def validate_semantics(value):
    if not isinstance(value, dict):
        return
    if value.get("schema") == "work-item.v1":
        expected = derive_work_id(
            value["source_commit"], value["node_gid"], value["pipeline_version"]
        )
        if value["work_id"] != expected:
            fail("$.work_id", "derived mismatch")
    if value.get("schema") == "run-receipt.v1" and value["outcome"] == "accepted":
        digests = [
            value["chain"]["reviews"][seat]["digest"]
            for seat in ("correctness", "value", "falsification")
        ]
        if len(set(digests)) != len(digests):
            fail("$.chain.reviews", "duplicate review digest across seats")


def main(argv):
    if len(argv) != 3:
        print(f"usage: {argv[0]} <schema.json> <instance.json>", file=sys.stderr); return 1
    try:
        with open(argv[1], encoding="utf-8") as stream: schema = json.load(stream)
        with open(argv[2], encoding="utf-8") as stream:
            value = json.load(stream, object_pairs_hook=reject_duplicate_object_members)
        check_schema(schema); validate(schema, value); validate_semantics(value)
    except UnsupportedSchema as exc:
        print(str(exc), file=sys.stderr); return 2
    except (OSError, json.JSONDecodeError, ValidationError) as exc:
        print(str(exc), file=sys.stderr); return 1
    return 0


if __name__ == "__main__": sys.exit(main(sys.argv))
