local core = require("core")
local t = fkst.test

local A = string.rep("a", 64)
local B = string.rep("b", 64)

return {
  test_paths_derives_repository_local_ports = function()
    local p = core.paths("/repo/content/source/source-snapshot.v1.blessed.json")
    t.eq(p.repo_root, "/repo/")
    t.eq(p.raw, "/repo/content/source/truth-graph.raw.v1.json")
    t.eq(p.out, "/repo/site/data/truth-graph.v1.json")
    t.eq(p.pubs, "/repo/site/data/publications.jsonl")
    t.eq(
      p.cli_dll,
      "/repo/src/Trureturing.Pages.Cli/bin/Release/net10.0/Trureturing.Pages.Cli.dll")
  end,
  test_paths_rejects_non_blessed = function()
    local p, err = core.paths("/repo/other/file.json")
    t.is_nil(p); t.is_true(type(err) == "string")
  end,
  test_paths_rejects_empty = function()
    t.is_nil(core.paths(""))
  end,

  test_is_digest_valid = function() t.is_true(core.is_digest(A)) end,
  test_is_digest_too_short = function() t.eq(core.is_digest("7d17"), false) end,
  test_is_digest_too_long = function() t.eq(core.is_digest(string.rep("a", 65)), false) end,
  test_is_digest_uppercase = function() t.eq(core.is_digest(string.rep("A", 64)), false) end,
  test_is_digest_nonhex = function() t.eq(core.is_digest(string.rep("g", 64)), false) end,
  test_is_digest_nonstring = function()
    t.eq(core.is_digest(123), false); t.eq(core.is_digest(nil), false)
  end,

  test_blessed_digest = function()
    t.eq(core.blessed_digest({ truth_graph_sha256 = A }), A)
    t.is_nil(core.blessed_digest(nil)); t.is_nil(core.blessed_digest({}))
  end,
  test_published_digest = function()
    t.eq(core.published_digest({ source_snapshot = { truth_graph_sha256 = A } }), A)
    t.is_nil(core.published_digest({}))
    t.is_nil(core.published_digest({ source_snapshot = "x" }))
  end,

  test_needs_reproject_true_when_absent = function()
    t.is_true(core.needs_reproject(A, nil))
  end,
  test_needs_reproject_true_when_different = function()
    t.is_true(core.needs_reproject(A, B))
  end,
  test_needs_reproject_false_when_equal = function()
    t.eq(core.needs_reproject(A, A), false)
  end,
  test_needs_reproject_false_when_blessed_invalid = function()
    t.eq(core.needs_reproject("abc", B), false)
    t.eq(core.needs_reproject(nil, B), false)
  end,

  test_ledger_empty = function()
    t.eq(core.ledger_has_digest("", A), false)
    t.eq(core.ledger_has_digest(nil, A), false)
  end,
  test_ledger_present = function()
    t.is_true(core.ledger_has_digest(core.receipt_line(A, "o", 1), A))
  end,
  test_ledger_absent = function()
    t.eq(core.ledger_has_digest(core.receipt_line(A, "o", 1), B), false)
  end,
  test_ledger_multiline_present = function()
    local text = core.receipt_line(A, "o", 1) .. core.receipt_line(B, "o", 2)
    t.is_true(core.ledger_has_digest(text, B))
  end,
  test_ledger_skips_malformed_line = function()
    local text = "{bad json\n" .. core.receipt_line(A, "o", 1)
    t.is_true(core.ledger_has_digest(text, A))
  end,

  test_receipt_line_is_json = function()
    local decoded = json.decode(core.receipt_line(
      A,
      "site/data/truth-graph.v1.json",
      1786803322))
    t.eq(decoded.snapshot_digest, A)
    t.eq(decoded.out, "site/data/truth-graph.v1.json")
    t.eq(decoded.recorded_at_unix, 1786803322)
  end,
}
