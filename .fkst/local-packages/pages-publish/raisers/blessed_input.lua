-- Watch the pinned blessed source-snapshot.v1 host fact. A new blessing
-- (a committed change to this file) fires pages_snapshot_seen with the file's
-- absolute path; observe dedups by digest, so re-firing on an unchanged
-- snapshot is harmless.
return {
  type = "file_watch",
  glob = "content/source/source-snapshot.v1.blessed.json",
  produces = "pages_snapshot_seen",
}
