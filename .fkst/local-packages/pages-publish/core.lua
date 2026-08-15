-- core.lua — pure logic for the pages-publish host package.
--
-- No SDK / host-authority calls live here (no file, exec, raise, log); this
-- module is pure so it is unit-tested directly in tests/core_test.lua. The
-- department entrypoints are thin glue that read host facts, call these
-- functions, and raise. (Same split as examples/codex-package's prompt.lua.)
local M = {}

-- The file_watch raiser reports the absolute path of the blessed
-- source-snapshot.v1 file. Every other input/output is a fixed host filesystem
-- fact under the same pages repo root (§6 fact-source doctrine: durable truth
-- is git-committed host files, never <RT>/marks or cache).
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

-- Reproject iff the blessed digest is valid and differs from what the currently
-- published projection records.
function M.needs_reproject(blessed_dig, published_dig)
  if type(blessed_dig) ~= "string" or blessed_dig == "" then
    return false
  end
  return blessed_dig ~= published_dig
end

-- Inline verification is read-only and never repairs (oracle 33876626: verify
-- may not re-run the projector to "fix" a mismatch). It checks the projection
-- records the expected snapshot, is real (non-synthetic), and that its shown
-- counts are internally closed (shown == closed + open + tail).
function M.verify(proj, expected_dig)
  if type(proj) ~= "table" then return false, "projection is not a table" end
  if proj.synthetic ~= false then return false, "projection is synthetic" end
  local d = M.published_digest(proj)
  if d ~= expected_dig then
    return false, "digest mismatch: got " .. tostring(d) .. " want " .. tostring(expected_dig)
  end
  local c = proj.counts
  if type(c) ~= "table" then return false, "counts missing" end
  local shown = c.shown
  local sum = (c.shown_closed or 0) + (c.shown_open or 0) + (c.shown_tail or 0)
  if shown ~= sum then
    return false, "counts not closed: shown=" .. tostring(shown) .. " sum=" .. tostring(sum)
  end
  return true, nil
end

-- One JSONL receipt line for the durable, git-committed publications ledger.
-- json has no encode (§2), so the line is built from controlled scalar fields
-- (hex digest, repo-relative path, integer Unix seconds from engine now()).
function M.receipt_line(digest, out_rel, ts_unix)
  return string.format(
    '{"snapshot_digest":%q,"out":%q,"recorded_at_unix":%d}\n',
    tostring(digest), tostring(out_rel), math.floor(ts_unix or 0))
end

return M
