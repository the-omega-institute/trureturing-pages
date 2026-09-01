(function () {
  "use strict";

  const Core = window.TrureturingTopologyHistoryCore;
  if (!Core) return;

  const state = {
    manifest: null,
    records: [],
    filter: "all",
    section: null,
    status: null,
    timeline: null,
    summary: null
  };

  async function fetchText(path) {
    const response = await fetch(path, {
      cache: "no-store",
      credentials: "omit"
    });
    if (!response.ok) {
      const error = new Error(`${path} returned HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.text();
  }

  async function sha256(text) {
    if (!window.crypto || !window.crypto.subtle || typeof TextEncoder !== "function") {
      throw new Error("This browser cannot verify history digests.");
    }
    const digest = await window.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text)
    );
    return `sha256:${[...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function shortDigest(value) {
    const text = String(value || "");
    return text.startsWith("sha256:")
      ? `${text.slice(7, 15)}…${text.slice(-6)}`
      : text;
  }

  function create(tag, className, text) {
    const value = document.createElement(tag);
    if (className) value.className = className;
    if (text != null) value.textContent = text;
    return value;
  }

  function installSurface() {
    if (state.section) return;
    const main = document.querySelector("main");
    if (!main) return;
    const section = create("section", "topology-history");
    section.id = "topology-history";
    section.setAttribute("aria-labelledby", "topology-history-title");

    const heading = create("header", "topology-history-heading");
    const title = create("div");
    title.append(
      create("p", "eyebrow", "Stable mathematical change"),
      create("h2", null, "Topology Atlas history"),
      create(
        "p",
        "topology-history-lede",
        "Follow stable node identities, certified edge changes, cluster lineage, and frontier movement across truth releases. Page layout movement is excluded."
      )
    );
    title.querySelector("h2").id = "topology-history-title";
    const filters = create("div", "topology-history-filters");
    filters.setAttribute("role", "group");
    filters.setAttribute("aria-label", "Filter Atlas history");
    for (const [kind, label] of [
      ["all", "All"],
      ["nodes", "Nodes"],
      ["edges", "Edges"],
      ["clusters", "Clusters"],
      ["frontier", "Frontier"]
    ]) {
      const button = create("button", null, label);
      button.type = "button";
      button.dataset.historyFilter = kind;
      button.setAttribute("aria-pressed", String(kind === "all"));
      button.addEventListener("click", () => {
        state.filter = kind;
        filters.querySelectorAll("button").forEach((candidate) => {
          candidate.setAttribute(
            "aria-pressed",
            String(candidate.dataset.historyFilter === kind)
          );
        });
        renderTimeline();
      });
      filters.append(button);
    }
    heading.append(title, filters);

    const status = create(
      "p",
      "topology-history-status",
      "Loading release-bound Topology Atlas history…"
    );
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const summary = create("dl", "topology-history-summary");
    const timeline = create("div", "topology-history-timeline");
    timeline.setAttribute("aria-live", "polite");
    section.append(heading, status, summary, timeline);

    const first = main.firstElementChild;
    if (first && first.nextSibling) {
      main.insertBefore(section, first.nextSibling);
    } else {
      main.append(section);
    }
    state.section = section;
    state.status = status;
    state.summary = summary;
    state.timeline = timeline;
  }

  function renderSummary() {
    if (!state.summary) return;
    const summary = Core.aggregate(state.records);
    const values = [
      ["Release transitions", summary.releaseTransitions],
      ["Stable nodes", `+${summary.nodesAdded} / −${summary.nodesRetired}`],
      ["Certified edges", `+${summary.edgesAdded} / −${summary.edgesRemoved}`],
      ["Cluster lineage", `${summary.clusterSplits} splits · ${summary.clusterMerges} merges · ${summary.clusterReorganizations} reorganizations`],
      ["Frontier movement", `+${summary.frontierEntered} / −${summary.frontierLeft}`]
    ];
    state.summary.replaceChildren(...values.flatMap(([term, description]) => {
      const wrapper = create("div");
      wrapper.append(
        create("dt", null, term),
        create("dd", null, String(description))
      );
      return [wrapper];
    }));
  }

  function relationBadge(relation) {
    const value = create(
      "span",
      `topology-history-relation relation-${relation}`,
      String(relation).replaceAll("-", " ")
    );
    return value;
  }

  function atlasLink(nodeId, label) {
    if (!nodeId) return create("span", "topology-history-node", label || "none");
    const link = create("a", "topology-history-node", label || nodeId);
    const params = new URLSearchParams({ node: nodeId, mode: "structure" });
    link.href = `dag.html#${params.toString()}`;
    return link;
  }

  function renderNodeRow(value) {
    const row = create("li", "topology-history-row topology-history-node-row");
    const identity = create("div", "topology-history-identity");
    identity.append(
      relationBadge(value.relation),
      create("code", null, value.stable_node_id)
    );
    const movement = create("div", "topology-history-movement");
    movement.append(
      atlasLink(value.from_node_id, value.from_node_id || "∅"),
      create("span", null, "→"),
      atlasLink(value.to_node_id, value.to_node_id || "∅")
    );
    const detail = create("p", "topology-history-row-detail");
    const parts = [];
    if (value.source_path_changed) parts.push("source path changed");
    if (value.from_primary_role !== value.to_primary_role) {
      parts.push(`role ${value.from_primary_role || "∅"} → ${value.to_primary_role || "∅"}`);
    }
    if (value.added_traits.length) parts.push(`traits +${value.added_traits.join(", ")}`);
    if (value.removed_traits.length) parts.push(`traits −${value.removed_traits.join(", ")}`);
    detail.textContent = parts.join(" · ") || "stable identity retained without role change";
    row.append(identity, movement, detail);
    return row;
  }

  function renderEdgeRow(value) {
    const row = create("li", "topology-history-row topology-history-edge-row");
    const identity = create("div", "topology-history-identity");
    identity.append(
      relationBadge(value.relation),
      create("code", null, `${value.stable_dependency_id} → ${value.stable_dependent_id}`)
    );
    const movement = create("div", "topology-history-movement");
    movement.append(
      atlasLink(value.to_dependency_id || value.from_dependency_id),
      create("span", null, "→"),
      atlasLink(value.to_dependent_id || value.from_dependent_id)
    );
    row.append(identity, movement);
    return row;
  }

  function jaccard(value) {
    return value.denominator
      ? `${value.numerator}/${value.denominator}`
      : "0/1";
  }

  function renderClusterRow(value) {
    const row = create("li", "topology-history-row topology-history-cluster-row");
    const identity = create("div", "topology-history-identity");
    identity.append(
      relationBadge(value.relation),
      create("strong", null, `Hierarchy level ${value.level}`)
    );
    const movement = create("div", "topology-history-movement");
    movement.append(
      create("code", null, value.source_cluster_id || "∅"),
      create("span", null, "→"),
      create("code", null, value.target_cluster_id || "∅")
    );
    const detail = create(
      "p",
      "topology-history-row-detail",
      `${value.overlap_count} shared stable nodes · Jaccard ${jaccard(value.member_jaccard)} · ${value.source_member_count} → ${value.target_member_count} members`
    );
    row.append(identity, movement, detail);
    return row;
  }

  function renderFrontierRow(value) {
    const row = create("li", "topology-history-row topology-history-frontier-row");
    const identity = create("div", "topology-history-identity");
    identity.append(
      relationBadge(value.relation),
      create("code", null, value.stable_node_id)
    );
    row.append(identity);
    return row;
  }

  function rowsFor(record, kind) {
    return Core.rows(record, kind).map((value) => {
      if (kind === "nodes") return renderNodeRow(value);
      if (kind === "edges") return renderEdgeRow(value);
      if (kind === "clusters") return renderClusterRow(value);
      return renderFrontierRow(value);
    });
  }

  function group(title, rows, open) {
    const details = create("details", "topology-history-group");
    details.open = open;
    const summary = create("summary");
    summary.append(
      create("strong", null, title),
      create("span", null, String(rows.length))
    );
    const list = create("ol", "topology-history-list");
    const visible = rows.slice(0, 100);
    list.append(...visible);
    details.append(summary, list);
    if (rows.length > visible.length) {
      details.append(create(
        "p",
        "topology-history-truncated",
        `${rows.length - visible.length} additional transitions remain in the exact delta artifact.`
      ));
    }
    return details;
  }

  function renderRecord(record, index) {
    const delta = record.delta;
    const article = create("article", "topology-history-release");
    const header = create("header");
    const release = create("div");
    release.append(
      create("p", "eyebrow", `Transition ${index + 1}`),
      create("h3", null, `${shortDigest(delta.from_truth_release_digest)} → ${shortDigest(delta.to_truth_release_digest)}`),
      create(
        "p",
        "topology-history-coordinate",
        `Atlas ${shortDigest(delta.from_topology_atlas_digest)} → ${shortDigest(delta.to_topology_atlas_digest)}`
      )
    );
    const digest = create("code", "topology-history-digest", shortDigest(record.digest));
    digest.title = record.digest;
    header.append(release, digest);
    article.append(header);

    const kinds = state.filter === "all"
      ? ["nodes", "edges", "clusters", "frontier"]
      : [state.filter];
    let total = 0;
    kinds.forEach((kind, kindIndex) => {
      const rows = rowsFor(record, kind);
      total += rows.length;
      if (rows.length) {
        article.append(group(
          {
            nodes: "Stable node transitions",
            edges: "Certified edge transitions",
            clusters: "Cluster lineage",
            frontier: "Frontier movement"
          }[kind],
          rows,
          state.filter !== "all" || kindIndex === 0
        ));
      }
    });
    if (!total) {
      article.append(create(
        "p",
        "topology-history-empty",
        `No ${state.filter === "all" ? "structural" : state.filter} transitions in this release delta.`
      ));
    }
    return article;
  }

  function renderTimeline() {
    if (!state.timeline) return;
    state.timeline.replaceChildren(...state.records.map(renderRecord));
  }

  async function load() {
    installSurface();
    let manifestText;
    try {
      manifestText = await fetchText("data/pages-topology-history.v1.json");
    } catch (error) {
      if (error.status === 404) {
        state.status.dataset.tone = "quiet";
        state.status.textContent = "No cross-release Topology Atlas history has been published for this deployment yet.";
        return;
      }
      throw error;
    }
    const manifest = Core.validateManifest(JSON.parse(manifestText));
    const records = [];
    for (const entry of manifest.entries) {
      const text = await fetchText(entry.delta_path);
      const digest = await sha256(text);
      const delta = Core.validateDelta(JSON.parse(text));
      records.push(Core.bindDelta(entry, delta, digest));
    }
    state.manifest = manifest;
    state.records = records;
    state.status.dataset.tone = "ready";
    state.status.textContent = records.length
      ? `${records.length} exact release transition${records.length === 1 ? "" : "s"} verified. Stable identity and certified relation changes are shown below.`
      : "The history manifest is valid and currently contains no release transitions.";
    renderSummary();
    renderTimeline();
  }

  installSurface();
  load().catch((error) => {
    installSurface();
    state.status.dataset.tone = "error";
    state.status.textContent = `Unable to verify Topology Atlas history: ${error.message}`;
  });
}());
