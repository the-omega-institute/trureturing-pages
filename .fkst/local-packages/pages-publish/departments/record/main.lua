-- record — append a durable publication receipt. The receipt is a git-committed
-- host filesystem fact (site/data/publications.jsonl), not an <RT>/mark: §6
-- fact-source doctrine requires durable truth to survive an <RT> wipe. The
-- ledger is append-only; the dedup key (snapshot_digest) makes replays idempotent
-- at the observe gate rather than here.
local M = {}
local core = require("core")

M.spec = {
  consumes = { "pages_published" },
  stall_window = "5m",
}

function pipeline(event)
  local p = event.payload or {}
  local pth, perr = core.paths(p.snapshot_path)
  if not pth then
    log.error("record: " .. tostring(perr))
    return
  end
  local prior = ""
  if file.exists(pth.pubs) then
    prior = file.read(pth.pubs)
  end
  local line = core.receipt_line(p.snapshot_digest, "site/data/truth-graph.v1.json", now())
  file.write(pth.pubs, prior .. line)
  log.info("record: appended publication receipt for " .. tostring(p.snapshot_digest))
end

return M
