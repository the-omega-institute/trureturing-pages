-- core.lua — pure lifecycle logic for the repository-local pages-publish package.
--
-- No host-authority side effects live here (no file.write, exec, raise, log). The
-- C# pages CLI owns projection parsing, digest binding, schema/count validation,
-- deterministic rendering, and atomic installation. Lua owns only this repository's
-- event routing, path derivation, dedup comparison, and receipt bookkeeping.
local M = {}

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
    cli_project = repo_root .. "src/Trureturing.Pages.Cli",
  }
end

function M.is_digest(d)
  return type(d) == "string" and #d == 64 and d:match("^[0-9a-f]+$") ~= nil
end

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

function M.needs_reproject(blessed_dig, published_dig)
  if not M.is_digest(blessed_dig) then
    return false
  end
  return blessed_dig ~= published_dig
end

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

function M.receipt_line(digest, out_rel, ts_unix)
  return string.format(
    '{"snapshot_digest":%q,"out":%q,"recorded_at_unix":%d}\n',
    tostring(digest), tostring(out_rel), math.floor(ts_unix or 0))
end

return M
