import { loadLibrary, nodeSlug } from "./library-core.mjs";
const root = document.querySelector("#archived-concept"),
  base = new URL("./", location.href);
const el = (tag, text, className) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
};
let controller,
  epoch = 0;
async function render() {
  const version = ++epoch,
    params = new URLSearchParams(location.hash.slice(1)),
    id = params.get("node"),
    digest = params.get("snapshot");
  controller?.destroy();
  root.replaceChildren(el("p", "Verifying archived content..."));
  const library = await loadLibrary(base),
    index = library.index.entries.findIndex((e) => e.digest === digest);
  if (index < 0)
    throw new Error("Snapshot is not in the verified Library archive.");
  const snapshot = await library.snapshot(index),
    node = snapshot.graph.nodes.find((n) => n.id === id);
  if (!node) throw new Error("Concept is absent from this release.");
  const slug = await nodeSlug(id);
  if (version !== epoch) return;
  const title = node.human_title || node.title || node.id;
  document.title = `${title} | Archived Library`;
  root.replaceChildren();
  const header = el("header", undefined, "knowledge-hero"),
    heading = el("div");
  heading.append(
    el(
      "p",
      `${node.domain || "Unclassified"} / RELEASE ${snapshot.truth_release_digest.slice(7, 19)}`,
      "eyebrow",
    ),
    el("h1", title),
    el(
      "p",
      node.human_abstract ||
        "No authored Blueprint abstract is available for this node.",
      "knowledge-lede",
    ),
  );
  header.append(heading);
  root.append(header);
  const links = el("div", undefined, "dossier-source"),
    current = el("a", "Current concept");
  current.href = `knowledge/node/${slug}/`;
  const history = el("a", "Content history");
  history.href = `library-history.html#node=${encodeURIComponent(id)}`;
  links.append(current, history);
  root.append(links);
  if (node.human_theorem) {
    const section = el("section", undefined, "knowledge-section");
    section.append(el("h2", "Theorem"), el("p", node.human_theorem));
    root.append(section);
  }
  const relations = window.TrureturingRelations.createIndex(snapshot.graph),
    full = window.TrureturingRelations.related(relations, id, { depth: "all" });
  const section = el("section", undefined, "knowledge-section"),
    host = el("div");
  section.append(el("h2", "Relationships in this release"), host);
  root.append(section);
  const navigate = (next) => {
    location.hash = new URLSearchParams({
      snapshot: digest,
      node: next,
    }).toString();
  };
  controller = window.TrureturingRelationMap.mount(host, {
    onSelect: navigate,
  });
  controller.update({ nodes: full.nodes, edges: full.edges, selectedId: id });
  for (const [name, ids] of [
    ["Prerequisites", full.upstream],
    ["Consequences", full.downstream],
    [
      "Related knowledge",
      new Set(full.nodes.map((n) => n.id).filter((n) => !full.lineage.has(n))),
    ],
  ]) {
    const section = el("section", undefined, "knowledge-section"),
      list = el("ul", undefined, "knowledge-relations");
    section.append(el("h2", `${name} (${ids.size})`));
    for (const next of ids) {
      const n = relations.byId.get(next),
        row = el("li"),
        a = el("a", n.human_title || n.title || n.id);
      a.href = `#${new URLSearchParams({ snapshot: digest, node: next })}`;
      row.append(a);
      list.append(row);
    }
    section.append(list);
    root.append(section);
  }
  const provenance = el("section", undefined, "knowledge-section"),
    commit = snapshot.graph.source_snapshot.source_commit;
  provenance.append(
    el("h2", "Exact release coordinate"),
    el("p", snapshot.truth_release_digest),
    el("p", `Source ${commit}`),
  );
  if (node.repo_path) {
    const source = el("a", "Source at this release");
    source.href = `https://github.com/the-omega-institute/trureturing/blob/${commit}/${node.repo_path.split("/").map(encodeURIComponent).join("/")}`;
    provenance.append(source);
  }
  root.append(provenance);
  window.lucide?.createIcons();
}
const fail = (error) => {
  root.replaceChildren(
    el("p", `Archived content unavailable: ${error.message}`),
  );
};
window.addEventListener("hashchange", () => render().catch(fail));
window.addEventListener("pagehide", () => controller?.destroy());
render().catch(fail);
