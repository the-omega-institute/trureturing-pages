-- observe — detect a newly blessed source-snapshot.v1 and, if its truth-graph
-- digest differs from what the site already publishes, trigger a reprojection.
-- Dispatch is folded into observe (oracle 33876626 minimal set): a single
-- deterministic action per blessed snapshot needs no separate dispatch lane.
local M = {}
local core = require("core")

M.spec = {
  consumes = { "pages_snapshot_seen" },
  produces = { "pages_reproject" },
  stall_window = "5m",
}

function pipeline(event)
  local snap_path = event.payload and event.payload.path
  local pth, perr = core.paths(snap_path)
  if not pth then
    -- Malformed trigger: fail closed so it surfaces via retry/DLQ, not a silent ack.
    error("observe: " .. tostring(perr))
  end
  -- The blessed input is authoritative: a decode failure or an invalid digest must
  -- fail closed (propagate), never be treated as "nothing to do".
  local blessed_dig = core.blessed_digest(json.decode(file.read(pth.snap)))
  if not core.is_digest(blessed_dig) then
    error("observe: blessed snapshot has no valid truth_graph_sha256")
  end
  -- The published output is a derived artifact: if it is missing OR corrupt, treat
  -- it as absent so the reprojection repairs it (do not dead-letter on bad output).
  local published_dig = nil
  if file.exists(pth.out) then
    local ok, decoded = pcall(json.decode, file.read(pth.out))
    if ok then
      published_dig = core.published_digest(decoded)
    else
      log.warn("observe: published output is corrupt JSON; treating as missing to repair")
    end
  end
  if not core.needs_reproject(blessed_dig, published_dig) then
    log.info("observe: truth_graph " .. blessed_dig .. " already published")
    return
  end
  raise("pages_reproject", {
    snapshot_digest = blessed_dig,
    snapshot_path = pth.snap,
  })
end

return M
