import { loadLibrary, verifiedJSON, nodeSlug } from "./library-core.mjs";
const base = new URL(document.body.dataset.siteRoot || "./", location.href);
const $ = (selector) => document.querySelector(selector);
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const link = (text, path) => {
  const a = el("a", text);
  a.href = new URL(path, base);
  return a;
};
window.lucide?.createIcons();
for (const math of document.querySelectorAll(".math-inline, .math-display")) {
  window.katex?.render(math.textContent, math, {
    displayMode: math.classList.contains("math-display"),
    throwOnError: false,
    trust: false,
    strict: "ignore",
  });
}
let libraryPromise;
const library = () => (libraryPromise ||= loadLibrary(base));

if ($("#research-search")) {
  const rows = [...document.querySelectorAll(".problem-row")];
  const initial = new URLSearchParams(location.hash.slice(1));
  const node = initial.get("node");
  if (initial.get("q")) $("#research-search").value = initial.get("q");
  if (node) $("#research-clear-node").hidden = false;
  const filter = () => {
    const q = $("#research-search").value.trim().toLowerCase(),
      triage = $("#research-triage").value;
    let count = 0;
    for (const row of rows) {
      row.hidden =
        !row.dataset.search.includes(q) ||
        Boolean(triage && row.dataset.triage !== triage) ||
        Boolean(node && !JSON.parse(row.dataset.gids).includes(node));
      if (!row.hidden) count++;
    }
    $("#research-count").textContent =
      `${count} dossiers${node ? " / selected concept" : ""}`;
    $("#research-empty").hidden = count > 0;
  };
  $("#research-search").addEventListener("input", filter);
  $("#research-triage").addEventListener("change", filter);
  filter();
  const activitySection = document.querySelector(".research-activity");
  const activity = el("details");
  activity.append(
    el("summary", "Development activity"),
    ...activitySection.childNodes,
  );
  activitySection.replaceChildren(activity);
  const activityViewport = matchMedia("(min-width: 761px)");
  activity.open = activityViewport.matches;
  activityViewport.addEventListener("change", (event) => {
    activity.open = event.matches;
  });
  const activityState = el("small", "Checking development activity...");
  activity.append(activityState);
  (async () => {
    const response = await fetch(
      "https://api.github.com/repos/the-omega-institute/trureturing/commits?sha=dev&per_page=4",
      {
        signal: AbortSignal.timeout(8000),
        credentials: "omit",
        headers: { Accept: "application/vnd.github+json" },
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const commits = await response.json();
    if (!Array.isArray(commits)) throw new Error("Invalid development feed");
    const list = el("ol", undefined, "development-feed");
    for (const commit of commits) {
      if (
        !/^[a-f0-9]{40}$/.test(commit.sha) ||
        typeof commit.commit?.message !== "string"
      )
        continue;
      const row = el("li"),
        anchor = el("a", commit.commit.message.split("\n")[0]);
      anchor.href = `https://github.com/the-omega-institute/trureturing/commit/${commit.sha}`;
      row.append(anchor);
      const date = new Date(commit.commit.committer?.date);
      if (Number.isFinite(date.valueOf())) {
        const time = el("time", date.toISOString().slice(0, 10));
        time.dateTime = date.toISOString();
        row.append(time);
      }
      list.append(row);
    }
    activityState.textContent = list.children.length
      ? "Development branch / release status separate"
      : "No development events returned.";
    activity.append(list);
  })().catch(() => {
    activityState.textContent =
      "Live activity unavailable. Source history remains available.";
  });
}

async function historyRows(host, events, archive, nodeId) {
  host.replaceChildren();
  if (!events?.length) {
    host.append(el("p", "No content observations in this archive."));
    return;
  }
  const list = el("ol", undefined, "content-timeline");
  for (const event of events.slice().reverse()) {
    const entry = archive.index.entries[event.observation],
      row = el("li");
    row.append(
      el("strong", event.event),
      el(
        "span",
        `Observation ${event.observation + 1} / ${entry.truth_release_digest.slice(7, 19)}`,
      ),
    );
    if (event.source_changed) row.append(el("small", "Source file changed"));
    if (event.changed_anchors?.length)
      row.append(
        el(
          "small",
          `${event.changed_anchors.length} changed anchors / ${event.review}`,
        ),
      );
    if (nodeId && event.present)
      row.append(
        link(
          "Read this version",
          `release/${entry.truth_release_digest.slice(7)}/node/${await nodeSlug(nodeId)}/`,
        ),
      );
    else
      row.append(
        link(
          "Release contents",
          `library-history.html#release=${entry.truth_release_digest}`,
        ),
      );
    list.append(row);
  }
  host.append(list);
}
for (const host of document.querySelectorAll(
  "[data-content-history], [data-problem-history]",
)) {
  (async () => {
    const archive = await library(),
      timeline = await archive.timeline(),
      id = host.dataset.contentHistory;
    await historyRows(
      host,
      id ? timeline.nodes[id] : timeline.problems[host.dataset.problemHistory],
      archive,
      id,
    );
  })().catch((error) => {
    host.textContent = `History unavailable: ${error.message}`;
  });
}

if ($("#archive-release"))
  (async () => {
    const archive = await library(),
      entries = archive.index.entries;
    const initial = new URLSearchParams(location.hash.slice(1));
    let observation = entries.findLastIndex(
      (e) => e.truth_release_digest === initial.get("release"),
    );
    if (observation < 0) observation = entries.length - 1;
    let snapshot,
      shown = 60,
      revision = 0;
    entries.forEach((entry, i) => {
      const option = el(
        "option",
        `${i + 1} / ${entry.truth_release_digest.slice(7, 19)}`,
      );
      option.value = i;
      $("#archive-release").append(option);
    });
    $("#archive-release").value = observation;
    $("#archive-search").value = initial.get("node") || "";
    $("#archive-release").disabled = false;
    $("#archive-search").disabled = false;
    const render = async () => {
      const token = ++revision,
        q = $("#archive-search").value.trim().toLowerCase();
      const matches = snapshot.graph.nodes.filter((n) =>
        `${n.human_title || n.title || n.id} ${n.id} ${n.domain}`
          .toLowerCase()
          .includes(q),
      );
      const rows = await Promise.all(
        matches.slice(0, shown).map(async (node) => {
          const row = link(
            "",
            `release/${snapshot.truth_release_digest.slice(7)}/node/${await nodeSlug(node.id)}/`,
          );
          row.className = "archive-row";
          const title = el("span");
          title.append(
            el("strong", node.human_title || node.title || node.id),
            el("small", node.domain || "Unclassified"),
          );
          row.append(
            title,
            el("small", node.status || node.state || "Recorded"),
          );
          return row;
        }),
      );
      if (token !== revision) return;
      $("#archive-nodes").replaceChildren(...rows);
      $("#archive-summary").textContent =
        `${matches.length.toLocaleString()} entries / ${snapshot.problems.length} research dossiers / source ${snapshot.graph.source_snapshot.source_commit?.slice(0, 12) || "unavailable"}`;
      $("#archive-more").hidden = shown >= matches.length;
      if (!matches.length)
        $("#archive-nodes").append(el("p", "No entries match this release."));
    };
    let loading = 0;
    const choose = async () => {
      const token = ++loading;
      const next = await archive.snapshot(Number($("#archive-release").value));
      if (token !== loading) return;
      snapshot = next;
      shown = 60;
      history.replaceState(
        null,
        "",
        `#${new URLSearchParams({ release: snapshot.truth_release_digest, ...(initial.get("node") ? { node: initial.get("node") } : {}) })}`,
      );
      await render();
    };
    $("#archive-release").addEventListener("change", () =>
      choose().catch(fail),
    );
    $("#archive-search").addEventListener("input", () => {
      shown = 60;
      if (snapshot) render().catch(fail);
    });
    $("#archive-more").addEventListener("click", () => {
      shown += 60;
      render().catch(fail);
    });
    function fail(error) {
      $("#library-history-status").textContent =
        `Archive unavailable: ${error.message}`;
      $("#archive-nodes").replaceChildren();
    }
    await choose();
    $("#library-history-status").textContent =
      `${entries.length} verified content observations / ${new Set(entries.map((e) => e.truth_release_digest)).size} Truth releases`;
  })().catch((error) => {
    $("#library-history-status").textContent =
      `Archive unavailable: ${error.message}`;
  });

for (const host of document.querySelectorAll("[data-problem-map]"))
  (async () => {
    const key = el("div", undefined, "research-map-key");
    for (const [label, kind] of [
      ["Released dependency", "proof"],
      ["Structural affinity", "affinity"],
      ["Proposed bridge", "proposed"],
    ])
      key.append(el("span", label, kind));
    host.after(key);
    const snapshot = await verifiedJSON(base, {
      path: host.dataset.snapshotPath,
      digest: host.dataset.snapshotDigest,
    });
    const problem = snapshot.problems.find(
      (p) => p.slug === host.dataset.problemMap,
    );
    if (!problem) throw new Error("Problem absent from its source snapshot.");
    const selected = `problem:${problem.slug}`,
      gap = `gap:${problem.slug}`;
    const gids = new Set(problem.motivation_gids);
    const nodes = snapshot.graph.nodes
      .filter((n) => gids.has(n.id))
      .map((n) => ({ ...n, title: n.human_title || n.title || n.id }));
    const edges = snapshot.graph.edges
      .filter((e) => gids.has(e.source) && gids.has(e.target))
      .map((e) => ({
        ...e,
        category: window.TrureturingRelations.category(e),
      }));
    nodes.push(
      {
        id: gap,
        title: "Missing bridge",
        kind: "advisory",
        domain: "Research",
        state: "open",
      },
      {
        id: selected,
        title: problem.title,
        kind: "advisory",
        domain: "Research",
        state: "open",
      },
    );
    for (const node of nodes)
      if (gids.has(node.id))
        edges.push({
          source: node.id,
          target: gap,
          layer: "intuition-proposed",
          category: "advisory",
          status: "proposed",
        });
    edges.push({
      source: gap,
      target: selected,
      layer: "intuition-proposed",
      category: "advisory",
      status: "proposed",
    });
    const controller = window.TrureturingRelationMap.mount(host, {
      onSelect: async (id) => {
        if (gids.has(id))
          location.href = new URL(
            `knowledge/node/${await nodeSlug(id)}/`,
            base,
          );
      },
    });
    controller.update({ nodes, edges, selectedId: selected });
    window.addEventListener("pagehide", () => controller.destroy?.(), {
      once: true,
    });
  })().catch((error) => {
    host.textContent = `Connections unavailable: ${error.message}`;
  });
