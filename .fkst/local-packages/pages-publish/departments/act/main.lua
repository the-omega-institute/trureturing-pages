-- act — run the repository-local pages projector and record the publication.
--
-- FKST supplies generic event delivery, process execution, files, and locks. This
-- Lua belongs to trureturing-pages and knows only this repository's local paths,
-- local C# CLI, output, and receipt. Projection semantics live in the C# CLI.
local M = {}
local core = require("core")

M.spec = {
  consumes = { "pages_reproject" },
  stall_window = "10m",
}

local function current_blessed(pth)
  return core.blessed_digest(json.decode(file.read(pth.snap)))
end

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
  if current_blessed(pth) ~= digest then
    log.info("act: trigger " .. digest .. " is obsolete; dropping")
    return
  end

  local res = exec_argv({
    argv = {
      "dotnet", "run",
      "--project", pth.cli_project,
      "--configuration", "Release",
      "--",
      "project",
      "--truth-graph", pth.raw,
      "--snapshot", pth.snap,
      "--output", pth.out,
      "--expected-digest", digest,
    },
    cwd = pth.repo_root,
    timeout = 120,
  })
  if res.exit_code ~= 0 then
    error("act: local projector exit=" .. tostring(res.exit_code)
      .. " stderr=" .. tostring(res.stderr))
  end
  if not file.exists(pth.out) or #file.read(pth.out) == 0 then
    error("act: local projector reported success without a non-empty output")
  end

  -- If the blessing advanced after the local CLI completed, the current snapshot
  -- has its own trigger. Do not record the superseded publication as current.
  if current_blessed(pth) ~= digest then
    log.info("act: blessing advanced after projection; not recording " .. digest)
    return
  end

  with_lock("pages-publish/publications", function()
    if current_blessed(pth) ~= digest then
      log.info("act: blessing advanced before receipt commit; not recording " .. digest)
      return
    end
    local prior = ""
    if file.exists(pth.pubs) then prior = file.read(pth.pubs) end
    if core.ledger_has_digest(prior, digest) then
      log.info("act: receipt for " .. digest .. " already present")
      return
    end
    file.write(pth.pubs, prior .. core.receipt_line(
      digest,
      "site/data/truth-graph.v1.json",
      now()))
  end)
  log.info("act: published + recorded " .. digest)
end

return M
