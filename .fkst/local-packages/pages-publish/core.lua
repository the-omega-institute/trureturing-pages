-- core.lua — pure logic for the pages-publish host package.
--
-- No host-authority side effects live here (no file.write, exec, raise, log); the
-- functions are pure so they are unit-tested directly in tests/core_test.lua. The
-- department entrypoints are thin glue that read host facts, call these functions,
-- and raise/write. (json.decode is a pure parser, available in every engine Lua
-- context, and is the only SDK global used here.)
local M = {}

-- The file_watch raiser reports the absolute path of the blessed
-- source-snapshot.v1 file. Every other input/output is a fixed host filesystem
-- fact under the same pages repo root (§6 fact-source doctrine: durable truth is
-- an explicit host filesystem file, never <RT>/marks or cache).
local BLESSED_REL = "content/source/source%-snapshot%.v1%.blessed%.json"

function M.paths(snap_abs)
  if type(snap_abs) ~= "string" or snap_abs == "" then
    return nil, "empty snapshot path"
  end
  local repo_root = snap_abs:gsub(BLESSED_REL .. "$", "")
  if repo_root == snap_abs then
    return nil, "snapshot path is not the blessed source-snapshot.v1 file"
  end
  return {
    repo_root = repo_root,
    snap = snap_abs,
    raw = repo_root .. "content/source/truth-graph.raw.v1.json",
    out = repo_root .. "site/data/truth-graph.v1.json",
    pubs = repo_root .. "site/data/publications.jsonl",
    script = repo_root .. "lib/truthgraph_project.py",
  }
end

-- A blessed/published digest must be a 64-char lowercase-hex SHA-256. Anything
-- else is a malformed fact and must fail closed rather than flow downstream.
function M.is_digest(d)
  return type(d) == "string" and #d == 64 and d:match("^[0-9a-f]+$") ~= nil
end

-- Dedup key = the blessed truth-graph digest. It is a source-derived host fact,
-- not a scratch marker: recovery re-reads it and re-compares, so a wiped <RT>
-- loses nothing (§6 recovery model).
function M.blessed_digest(snap)
  if type(snap) ~= "table" then return nil end
  return snap.truth_graph_sha256
end

function M.published_digest(published)
  if type(published) ~= "table" then return nil end
  local ss = published.source_snapshot
  if type(ss) ~= "table" then return nil end
  return ss.truth_graph_sha256
end

-- Reproject iff the blessed digest is a valid digest and differs from what the
-- currently published projection records.
function M.needs_reproject(blessed_dig, published_dig)
  if not M.is_digest(blessed_dig) then
    return false
  end
  return blessed_dig ~= published_dig
end

-- Inline verification is read-only and never repairs (oracle 33876626: verify may
-- not re-run the projector to "fix" a mismatch). It checks the projection is the
-- expected schema, records the expected snapshot, is real (non-synthetic), that
-- every shown-count field is a present number whose parts close, and that the node
-- array length matches the shown count. Missing fields are rejected, not defaulted.
function M.verify(proj, expected_dig)
  if type(proj) ~= "table" then return false, "projection is not a table" end
  if proj.schema_version ~= "truth-graph.v1" then
    return false, "unexpected schema_version: " .. tostring(proj.schema_version)
  end
  if proj.synthetic ~= false then return false, "projection is synthetic" end
  local d = M.published_digest(proj)
  if d ~= expected_dig then
    return false, "digest mismatch: got " .. tostring(d) .. " want " .. tostring(expected_dig)
  end
  local c = proj.counts
  if type(c) ~= "table" then return false, "counts missing" end
  for _, k in ipairs({ "shown", "shown_closed", "shown_open", "shown_tail" }) do
    if type(c[k]) ~= "number" then
      return false, "counts." .. k .. " missing or non-number"
    end
  end
  if c.shown ~= c.shown_closed + c.shown_open + c.shown_tail then
    return false, "counts not closed: shown=" .. tostring(c.shown)
      .. " sum=" .. tostring(c.shown_closed + c.shown_open + c.shown_tail)
  end
  if type(proj.nodes) ~= "table" then return false, "nodes missing or not a table" end
  if #proj.nodes ~= c.shown then
    return false, "#nodes=" .. tostring(#proj.nodes) .. " != counts.shown=" .. tostring(c.shown)
  end
  return true, nil
end

-- Whether the append-only publications ledger already records a receipt for this
-- digest. This is record's idempotency check (a source-keyed dedup on a durable
-- host fact), so an at-least-once replay does not append a second receipt. A
-- malformed ledger line is skipped rather than allowed to crash the scan.
function M.ledger_has_digest(ledger_text, digest)
  if type(ledger_text) ~= "string" or ledger_text == "" then return false end
  for line in ledger_text:gmatch("[^\n]+") do
    local ok, rec = pcall(json.decode, line)
    if ok and type(rec) == "table" and rec.snapshot_digest == digest then
      return true
    end
  end
  return false
end

-- One JSONL receipt line for the append-only publications ledger (an explicit
-- host filesystem fact; file.write does not itself create a git commit). json has
-- no encode (§2), so the line is built from controlled scalar fields: a validated
-- 64-hex digest, a fixed repo-relative path, and integer Unix seconds (engine now()).
function M.receipt_line(digest, out_rel, ts_unix)
  return string.format(
    '{"snapshot_digest":%q,"out":%q,"recorded_at_unix":%d}\n',
    tostring(digest), tostring(out_rel), math.floor(ts_unix or 0))
end

return M
