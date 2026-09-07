// Advisory research metadata. This module never reads or writes truth-release state.
export const STORAGE_KEY = "trureturing.pages.research-notes.v1";
export const STAGES = Object.freeze({
  unstarted: "Not started", reading: "Reading", working: "Working",
  blocked: "Blocked", review: "Ready for review",
});
export const KINDS = Object.freeze({
  "open-question": "Source question", bridge: "Bridge target",
  certificate: "Certificate target", "route-test": "Route test",
  "research-question": "Research question",
});
export const SCOPES = Object.freeze({
  theorem: "Focused target", window: "Exploratory", wall: "Long horizon",
});
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function requireText(value, name, max = 6000) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`Invalid ${name}.`);
  return value;
}
export function validateCatalog(data) {
  if (data?.schema_version !== "pages-research-catalog.v1" ||
      data.source_repo !== "the-omega-institute/trureturing" ||
      !/^[a-f0-9]{40}$/.test(data.source_commit) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.reviewed) ||
      !Array.isArray(data.families) || !data.families.length)
    throw new Error("Invalid research catalog header.");
  requireText(data.revision, "catalog revision", 100);
  requireText(data.review_scope, "review scope");
  const entries = [], ids = new Set();
  const register = (item) => {
    if (typeof item.id !== "string" || !slug.test(item.id) || ids.has(item.id)) throw new Error("Invalid or duplicate research ID.");
    ids.add(item.id);
    for (const key of ["title", "question", "gap", "next_step", "success"])
      requireText(item[key], `${item.id}/${key}`);
    if (!own(KINDS, item.kind)) throw new Error("Invalid research target kind.");
    if (!Array.isArray(item.related) || item.related.some(id => typeof id !== "string" || !slug.test(id)))
      throw new Error("Invalid related research IDs.");
    entries.push(item);
  };
  for (const f of data.families) {
    if (!own(SCOPES, f.scope) || !/^10\.48550\/arXiv\.\d{4}\.\d{4,5}(?:v\d+)?$/.test(f.doi))
      throw new Error("Invalid research scope or DOI.");
    requireText(f.area, "research area", 100);
    requireText(f.foothold, "repository foothold");
    if (!Array.isArray(f.anchors) || !f.anchors.length ||
        new Set(f.anchors).size !== f.anchors.length ||
        f.anchors.some(gid => typeof gid !== "string" || !/^D5\/(?:[A-Za-z0-9_]+\/)*[A-Za-z0-9_]+$/.test(gid)))
      throw new Error("Invalid repository anchors.");
    if (!Array.isArray(f.keywords) || f.keywords.some(k => typeof k !== "string") ||
        !Array.isArray(f.targets)) throw new Error("Invalid research family.");
    const shared = { familyId: f.id, familyTitle: f.title, area: f.area, scope: f.scope,
      doi: f.doi, anchors: f.anchors, foothold: f.foothold, keywords: f.keywords,
      sourceCommit: data.source_commit, reviewed: data.reviewed };
    register({ ...f, ...shared, kind: "open-question", related: f.targets.map(t => t.id) });
    for (const t of f.targets) register({ ...t, ...shared });
  }
  for (const item of entries)
    if (item.related.some(id => !ids.has(id) || id === item.id))
      throw new Error(`Unresolved related question: ${item.id}.`);
  return entries;
}
export function sourceURL(item, anchor) {
  return `https://github.com/the-omega-institute/trureturing/blob/${item.sourceCommit}/` +
    (anchor ? `${anchor}.lean` : `Problems/${item.familyId}.md`);
}
export function emptyNotes(revision) {
  return { schema_version: "pages-research-notes.v1", catalog_revision: revision, entries: {} };
}
export function validateNotes(data, knownIds) {
  if (data?.schema_version !== "pages-research-notes.v1" ||
      !data.entries || Array.isArray(data.entries) || typeof data.entries !== "object")
    throw new Error("Unsupported research notebook format.");
  requireText(data.catalog_revision, "notebook catalog revision", 100);
  if (Object.keys(data.entries).length > 1000) throw new Error("Notebook is too large.");
  const clean = emptyNotes(data.catalog_revision);
  let skipped = 0;
  for (const [id, value] of Object.entries(data.entries)) {
    if (!slug.test(id) || !value || !own(STAGES, value.stage) ||
        typeof value.starred !== "boolean" || typeof value.note !== "string" ||
        value.note.length > 10000 || typeof value.updated !== "string" ||
        !Number.isFinite(Date.parse(value.updated)))
      throw new Error(`Invalid notebook entry: ${id}.`);
    if (!knownIds.has(id)) { skipped++; continue; }
    clean.entries[id] = { stage: value.stage, starred: value.starred,
      note: value.note, updated: value.updated };
  }
  return { notes: clean, skipped };
}
export function selectEntries(entries, filters = {}, notes = {}) {
  const words = (filters.q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const result = entries.filter(item => {
    const local = notes[item.id] || { stage: "unstarted", starred: false };
    const text = [item.id, item.title, item.familyTitle, item.area, item.question,
      item.gap, item.next_step, item.foothold, item.success, item.doi,
      ...item.keywords, ...item.anchors].join(" ").toLowerCase();
    return (!filters.area || item.area === filters.area) &&
      (!filters.kind || item.kind === filters.kind) &&
      (!filters.scope || item.scope === filters.scope) &&
      (!filters.stage || local.stage === filters.stage) &&
      (!filters.starred || local.starred) &&
      (!filters.node || item.anchors.includes(filters.node)) &&
      words.every(word => text.includes(word));
  });
  if (filters.sort === "recent") result.sort((a, b) =>
    (notes[b.id]?.updated || "").localeCompare(notes[a.id]?.updated || "") || a.id.localeCompare(b.id));
  if (filters.sort === "title") result.sort((a, b) => a.title.localeCompare(b.title));
  return result;
}
export function questionURL(url, id) {
  if (!slug.test(id)) throw new Error("Invalid question ID.");
  const result = new URL(url);
  // A shared question link should not inherit filters that can hide its target.
  result.hash = new URLSearchParams({ rp: id }).toString();
  return result.href;
}
