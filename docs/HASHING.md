# Hashing

Object digests are SHA-256 over deterministic canonical JSON bytes: keys are sorted, separators are compact (`,` and `:`), and the result is UTF-8 encoded. The object is the parsed file content, excluding no fields.

`snapshot_digest` is the digest of the complete parsed source-snapshot.v1 instance. Any byte-level change that changes the parsed value changes its canonical digest.

## Work ID derivation

`work_id` is the lowercase hexadecimal SHA-256 digest of the canonical JSON bytes for this self-describing object:

```json
{"node_gid":"<node_gid>","pipeline_version":"<pipeline_version>","source_commit":"<source_commit>"}
```

The values are the corresponding work-item fields. Canonical object encoding makes field boundaries unambiguous even when a value contains a delimiter such as `:`.
