# Published cross-module resolution fixture

Regression for Pages reconciliation run 36389269889.

Source repository: https://github.com/the-omega-institute/trureturing
Source commit: `f51660db17809b11cf6b451fa6f8d1c45fdf3dc8`.
Truth release: `sha256:e94bedc9f62e2fe85c86f5fcfadbcdc9859708416883b58f968d4ed47875e45b`.

- `GStrict.md`: verbatim `Blueprint/D5/S1/Recurrence/Sun/GStrict.md`.
- `sun-lowercase-turan-conjecture-52.md`: verbatim problem dossier from `Problems/`.
- `truth-export.json`: the schema/dialect and two unmodified nodes for GStrict and VStrict from the published bundle's `truth-export.v1.json` (v2 wire contract).

Scribe emits one v1 marker per member of a joint claim. Pages groups distinct
members from one host and of one resolution kind into one problem resolution.
An optional `members` array preserves all evidence while the existing primary
`declaration_gid` remains local to the Markdown host. Every member must have a
Frozen source record and pass the published truth-export gate. Duplicate members,
conflicting kinds, duplicate hosts, and unverified members remain errors.
Legacy single-member resolutions retain their original shape.
