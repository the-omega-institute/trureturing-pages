local core = require("core")
local t = fkst.test

return {
  test_paths_derives_host_facts = function()
    local p = core.paths("/repo/content/source/source-snapshot.v1.blessed.json")
    t.eq(p.repo_root, "/repo/")
    t.eq(p.snap, "/repo/content/source/source-snapshot.v1.blessed.json")
    t.eq(p.raw, "/repo/content/source/truth-graph.raw.v1.json")
    t.eq(p.out, "/repo/site/data/truth-graph.v1.json")
    t.eq(p.pubs, "/repo/site/data/publications.jsonl")
    t.eq(p.script, "/repo/lib/truthgraph_project.py")
  end,
  test_paths_rejects_non_blessed = function()
    local p, err = core.paths("/repo/other/file.json")
    t.is_nil(p)
    t.is_true(type(err) == "string")
  end,
  test_paths_rejects_empty = function()
    local p = core.paths("")
    t.is_nil(p)
  end,
  test_blessed_digest = function()
    t.eq(core.blessed_digest({ truth_graph_sha256 = "7d17" }), "7d17")
    t.is_nil(core.blessed_digest(nil))
    t.is_nil(core.blessed_digest({}))
  end,
  test_published_digest = function()
    t.eq(core.published_digest({ source_snapshot = { truth_graph_sha256 = "7d17" } }), "7d17")
    t.is_nil(core.published_digest({}))
    t.is_nil(core.published_digest({ source_snapshot = "x" }))
  end,
  test_needs_reproject_true_when_absent = function()
    t.is_true(core.needs_reproject("abc", nil))
  end,
  test_needs_reproject_true_when_differ = function()
    t.is_true(core.needs_reproject("abc", "def"))
  end,
  test_needs_reproject_false_when_equal = function()
    t.eq(core.needs_reproject("abc", "abc"), false)
  end,
  test_needs_reproject_false_when_no_blessed = function()
    t.eq(core.needs_reproject(nil, "def"), false)
    t.eq(core.needs_reproject("", "def"), false)
  end,
  test_verify_ok = function()
    local proj = {
      synthetic = false,
      source_snapshot = { truth_graph_sha256 = "7d17" },
      counts = { shown = 5, shown_closed = 3, shown_open = 2, shown_tail = 0 },
    }
    local ok, why = core.verify(proj, "7d17")
    t.is_true(ok)
    t.is_nil(why)
  end,
  test_verify_rejects_digest_mismatch = function()
    local proj = {
      synthetic = false,
      source_snapshot = { truth_graph_sha256 = "other" },
      counts = { shown = 0, shown_closed = 0, shown_open = 0, shown_tail = 0 },
    }
    t.eq(core.verify(proj, "7d17"), false)
  end,
  test_verify_rejects_synthetic = function()
    local proj = {
      synthetic = true,
      source_snapshot = { truth_graph_sha256 = "7d17" },
      counts = { shown = 0, shown_closed = 0, shown_open = 0, shown_tail = 0 },
    }
    t.eq(core.verify(proj, "7d17"), false)
  end,
  test_verify_rejects_unclosed_counts = function()
    local proj = {
      synthetic = false,
      source_snapshot = { truth_graph_sha256 = "7d17" },
      counts = { shown = 9, shown_closed = 3, shown_open = 2, shown_tail = 0 },
    }
    t.eq(core.verify(proj, "7d17"), false)
  end,
  test_receipt_line_is_json = function()
    local line = core.receipt_line("7d17c2", "site/data/truth-graph.v1.json", 1786803322)
    local decoded = json.decode(line)
    t.eq(decoded.snapshot_digest, "7d17c2")
    t.eq(decoded.out, "site/data/truth-graph.v1.json")
    t.eq(decoded.recorded_at_unix, 1786803322)
  end,
}
