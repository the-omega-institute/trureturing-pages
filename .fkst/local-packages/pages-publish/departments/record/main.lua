-- record — append a durable publication receipt. The receipt is an explicit host
-- filesystem fact (site/data/publications.jsonl); §6 requires durable truth to
-- survive an <RT> wipe, so it is a committed host file, not an <RT>/mark.
--
-- Idempotent under at-least-once delivery: the payload is trigger state only, so
-- record re-reads the published host fact and requires it to still record this
-- digest (a superseded trigger is skipped, not recorded), then appends under a
-- lock only if the digest is not already in the ledger. A replay or a concurrent
-- record therefore cannot write a duplicate receipt.
local M = {}
local core = require("core")

M.spec = {
  consumes = { "pages_published" },
  stall_window = "5m",
}

function pipeline(event)
  local p = event.payload or {}
  local digest = p.snapshot_digest
  local pth, perr = core.paths(p.snapshot_path)
  if not pth then
    error("record: " .. tostring(perr))
  end
  if not core.is_digest(digest) then
    error("record: trigger digest is not a valid sha256: " .. tostring(digest))
  end
  -- §6: re-derive from the published host fact, do not trust the payload alone.
  local published_dig = nil
  if file.exists(pth.out) then
    published_dig = core.published_digest(json.decode(file.read(pth.out)))
  end
  if published_dig ~= digest then
    log.info("record: published output records " .. tostring(published_dig)
      .. ", not trigger " .. digest .. "; skipping superseded receipt")
    return
  end
  -- Idempotent, serialized append on the durable ledger.
  with_lock("pages-publish/publications", function()
    local prior = ""
    if file.exists(pth.pubs) then prior = file.read(pth.pubs) end
    if core.ledger_has_digest(prior, digest) then
      log.info("record: receipt for " .. digest .. " already present; skip")
      return
    end
    file.write(pth.pubs, prior .. core.receipt_line(digest, "site/data/truth-graph.v1.json", now()))
    log.info("record: appended publication receipt for " .. digest)
  end)
end

return M
