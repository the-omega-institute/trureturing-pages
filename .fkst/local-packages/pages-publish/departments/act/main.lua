-- act — run the deterministic projector to regenerate the published DAG view,
-- then verify the output read-only before allowing a record. The projection IS
-- the act (oracle 33876626: a deterministic regeneration is act, not verify);
-- verify only reads and never re-runs the projector to "repair" a mismatch.
local M = {}
local core = require("core")

M.spec = {
  consumes = { "pages_reproject" },
  produces = { "pages_published" },
  stall_window = "10m",
}

function pipeline(event)
  local p = event.payload or {}
  local pth, perr = core.paths(p.snapshot_path)
  if not pth then
    log.error("act: " .. tostring(perr))
    return
  end
  -- exec_argv: no shell, no quoting; rate pool derives from "python3".
  local res = exec_argv({
    argv = { "python3", pth.script, pth.raw, pth.out, pth.snap },
    timeout = 120,
  })
  if res.exit_code ~= 0 then
    log.error("act: projector exit=" .. tostring(res.exit_code) .. " stderr=" .. tostring(res.stderr))
    return
  end
  local ok, why = core.verify(json.decode(file.read(pth.out)), p.snapshot_digest)
  if not ok then
    log.error("act: read-only verify failed: " .. tostring(why))
    return
  end
  raise("pages_published", {
    snapshot_digest = p.snapshot_digest,
    snapshot_path = pth.snap,
  })
end

return M
