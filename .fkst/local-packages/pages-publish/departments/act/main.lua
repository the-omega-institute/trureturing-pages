-- act — publish the DAG view for a blessed snapshot and record the publication in
-- one department, so the durable receipt is created atomically with the publication
-- rather than by a downstream lane re-reading mutable state (which loses receipts
-- under supersession). The chain is observe -> act; act is terminal.
--
-- Correctness under at-least-once delivery:
--  * Obsolete trigger: if the blessing has already advanced past this event, drop
--    it (ack) — the current blessing has its own trigger; retrying can't help.
--  * Real failure (projector nonzero / verify fail): raise, so the child exits
--    nonzero for reliable retry / DLQ, never a silent ack.
--  * Phantom publish: the projector is given the event digest and refuses to write
--    unless the current raw bytes hash to it, so a mid-run input change cannot
--    mutate the live output under a stale trigger.
--  * Idempotent receipt: the ledger append is dedup'd by digest under a lock, so a
--    replay or concurrent act writes at most one receipt per published digest, and
--    a superseding publication keeps the earlier receipt (append-only history).
local M = {}
local core = require("core")

M.spec = {
  consumes = { "pages_reproject" },
  stall_window = "10m",
}

function pipeline(event)
  local p = event.payload or {}
  local digest = p.snapshot_digest
  local pth, perr = core.paths(p.snapshot_path)
  if not pth then
    error("act: " .. tostring(perr))
  end
  if not core.is_digest(digest) then
    error("act: trigger digest is not a valid sha256: " .. tostring(digest))
  end
  -- Obsolete-trigger fast path: re-read the blessing (authoritative; a decode
  -- failure fails closed). If it has moved on, this trigger is superseded — ack.
  local current = core.blessed_digest(json.decode(file.read(pth.snap)))
  if current ~= digest then
    log.info("act: blessing now " .. tostring(current) .. ", trigger " .. digest
      .. " obsolete; dropping (its own trigger handles the current state)")
    return
  end
  -- Project. The projector re-checks sha256(raw) == blessed == this digest and
  -- refuses to write on mismatch, so it cannot mutate the live output for a stale
  -- trigger. Any nonzero exit is a real failure (or a raced move that wrote nothing).
  local res = exec_argv({
    argv = { "python3", pth.script, pth.raw, pth.out, pth.snap, digest },
    timeout = 120,
  })
  if res.exit_code ~= 0 then
    error("act: projector exit=" .. tostring(res.exit_code) .. " stderr=" .. tostring(res.stderr))
  end
  local ok, why = core.verify(json.decode(file.read(pth.out)), digest)
  if not ok then
    error("act: read-only verify failed: " .. tostring(why))
  end
  -- Record the publication atomically with it: idempotent, serialized append to
  -- the append-only ledger. A replay finds the digest already present and skips.
  with_lock("pages-publish/publications", function()
    local prior = ""
    if file.exists(pth.pubs) then prior = file.read(pth.pubs) end
    if core.ledger_has_digest(prior, digest) then
      log.info("act: receipt for " .. digest .. " already present; publication is idempotent")
      return
    end
    file.write(pth.pubs, prior .. core.receipt_line(digest, "site/data/truth-graph.v1.json", now()))
  end)
  log.info("act: published + recorded " .. digest)
end

return M
