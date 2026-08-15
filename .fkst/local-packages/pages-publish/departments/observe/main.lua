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
    log.warn("observe: " .. tostring(perr))
    return
  end
  local blessed_dig = core.blessed_digest(json.decode(file.read(pth.snap)))
  local published_dig = nil
  if file.exists(pth.out) then
    published_dig = core.published_digest(json.decode(file.read(pth.out)))
  end
  if not core.needs_reproject(blessed_dig, published_dig) then
    log.info("observe: truth_graph " .. tostring(blessed_dig) .. " already published")
    return
  end
  raise("pages_reproject", {
    snapshot_digest = blessed_dig,
    snapshot_path = pth.snap,
  })
end

return M
