(function () {
  "use strict";
  window.lucide?.createIcons();
  const input = document.querySelector("#concept-search");
  if (input) {
    const rows = [...document.querySelectorAll(".concept-row")];
    const domain = document.querySelector("#concept-domain"),
      kind = document.querySelector("#concept-kind");
    const previous = document.querySelector("#library-previous"),
      next = document.querySelector("#library-next");
    let page = 0;
    function render() {
      const q = input.value.trim().toLowerCase();
      const matches = rows.filter(
        (row) =>
          (!q || row.dataset.search.includes(q)) &&
          (!domain.value || row.dataset.domain === domain.value) &&
          (!kind.value || row.dataset.kind === kind.value),
      );
      const pages = Math.max(1, Math.ceil(matches.length / 60));
      page = Math.min(page, pages - 1);
      const visible = new Set(matches.slice(page * 60, (page + 1) * 60));
      rows.forEach((row) => {
        row.hidden = !visible.has(row);
      });
      document.querySelector("#concept-count").textContent =
        `${matches.length.toLocaleString()} entries`;
      document.querySelector("#library-page").textContent =
        `${page + 1} / ${pages}`;
      document.querySelector("#library-empty").hidden = Boolean(matches.length);
      previous.disabled = page === 0;
      next.disabled = page + 1 >= pages;
      document.querySelector(".library-pagination").hidden = false;
    }
    for (const element of [input, domain, kind])
      element.addEventListener("input", () => {
        page = 0;
        render();
      });
    previous.addEventListener("click", () => {
      page--;
      render();
      document
        .querySelector(".concept-toolbar")
        .scrollIntoView({ block: "start" });
    });
    next.addEventListener("click", () => {
      page++;
      render();
      document
        .querySelector(".concept-toolbar")
        .scrollIntoView({ block: "start" });
    });
    render();
    return;
  }
  const host = document.querySelector("#knowledge-relation-map");
  if (!host) return;
  const body = document.body.dataset,
    status = document.querySelector("#knowledge-map-status");
  const tabs = [...document.querySelectorAll("[data-relationship-type]")];
  const range = document.querySelector("#knowledge-range");
  let selectedType = "all",
    controller = null,
    index = null;
  function renderList(selector, nodes, label) {
    const root = document.querySelector(selector);
    root.replaceChildren();
    if (!nodes.length) {
      const p = document.createElement("p");
      p.className = "knowledge-empty";
      p.textContent = "None recorded in this release.";
      root.append(p);
      return;
    }
    const list = document.createElement("ul");
    list.className = "knowledge-relations";
    nodes
      .sort((a, b) => a.title.localeCompare(b.title))
      .forEach((node) => {
        const item = document.createElement("li"),
          link = document.createElement("a"),
          title = document.createElement("span"),
          meta = document.createElement("small");
        link.href = `../${node.slug}/`;
        title.textContent = node.title;
        meta.textContent = `${label} / ${node.status || node.state || "Recorded"}`;
        link.append(title, meta);
        item.append(link);
        list.append(item);
      });
    root.append(list);
  }
  function render() {
    if (!index) return;
    const full = window.TrureturingRelations.related(index, body.nodeId, {
      depth: range.value,
    });
    const edges =
      selectedType === "all"
        ? full.edges
        : full.edges.filter((e) => e.category === selectedType);
    const ids = new Set([body.nodeId]);
    edges.forEach((e) => {
      ids.add(e.source);
      ids.add(e.target);
    });
    controller.update({
      nodes: full.nodes.filter((n) => ids.has(n.id)),
      edges,
      selectedId: body.nodeId,
    });
    status.textContent = `${full.nodes.length} related nodes / ${full.edges.length} total relations`;
    tabs.forEach((tab) =>
      tab.setAttribute(
        "aria-selected",
        String(tab.dataset.relationshipType === selectedType),
      ),
    );
    renderList(
      '[data-rel-list="upstream"]',
      [...full.upstream].map((id) => index.byId.get(id)),
      "Proof prerequisite",
    );
    renderList(
      '[data-rel-list="downstream"]',
      [...full.downstream].map((id) => index.byId.get(id)),
      "Proof consequence",
    );
    for (const [type, label] of [
      ["affinity", "Structural affinity"],
      ["document", "Document connection"],
      ["other", "Authored / advisory"],
    ]) {
      const relatedIds = new Set();
      full.edges
        .filter((e) =>
          type === "other"
            ? ["authored", "advisory"].includes(e.category)
            : e.category === type,
        )
        .forEach((e) => {
          if (e.source !== body.nodeId) relatedIds.add(e.source);
          if (e.target !== body.nodeId) relatedIds.add(e.target);
        });
      renderList(
        `[data-rel-list="${type}"]`,
        [...relatedIds]
          .map((id) => index.byId.get(id))
          .filter((node) => type !== "document" || node.kind !== "truth"),
        label,
      );
    }
  }
  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      selectedType = tab.dataset.relationshipType;
      render();
    }),
  );
  range.addEventListener("change", render);
  (async () => {
    const response = await fetch(body.relationsUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const digest =
      "sha256:" +
      [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
        ),
      ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    if (digest !== body.relationsDigest)
      throw new Error("Relationship data does not match this page.");
    const data = JSON.parse(text);
    if (
      data.schema_version !== "pages-knowledge-relations.v1" ||
      data.truth_release_digest !== body.releaseDigest
    )
      throw new Error("Relationship data belongs to a different release.");
    if (!data.nodes.some((n) => n.id === body.nodeId))
      throw new Error("This concept is absent from the relationship data.");
    const edges = data.edges.map(([source, target, layer, status]) => {
      if (!data.nodes[source] || !data.nodes[target])
        throw new Error("Invalid relationship endpoint.");
      return {
        source: data.nodes[source].id,
        target: data.nodes[target].id,
        layer,
        status,
      };
    });
    index = window.TrureturingRelations.createIndex({
      nodes: data.nodes,
      edges,
    });
    controller = window.TrureturingRelationMap.mount(host, {
      onSelect: (id) => {
        location.href = `../${index.byId.get(id).slug}/`;
      },
    });
    document.querySelector("[data-relation-fallback]").hidden = true;
    render();
  })().catch((error) => {
    status.textContent = `Expanded graph unavailable. Static relations remain below. ${error.message}`;
  });
})();
