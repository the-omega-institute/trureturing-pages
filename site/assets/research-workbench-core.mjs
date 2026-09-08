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
export const SOURCE_STATES = Object.freeze({
  "open-in-source": "Open question in this source",
  "conditional-route": "Conjectural limit / conditional implication",
  "proved-in-source": "Result reported in this source",
  "route-obstruction": "Obstruction reported for this route",
  context: "Related result / context",
});
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function validateSource(source, reviewed) {
  if (!source || typeof source !== "object" || Array.isArray(source) ||
      typeof source.arxiv_id !== "string" || !/^\d{2}(0[1-9]|1[0-2])\.\d{4,5}$/.test(source.arxiv_id) ||
      typeof source.version !== "string" || !/^v[1-9]\d{0,2}$/.test(source.version) ||
      !own(SOURCE_STATES, source.status)) throw new Error("Invalid arXiv source.");
  for (const key of ["title", "locator", "note"]) requireText(source[key], `source/${key}`);
  for (const key of ["submitted", "revised", "checked"])
    if (!validDate(source[key])) throw new Error("Invalid source date.");
  if (!validDate(reviewed) || source.submitted > source.revised || source.revised > source.checked ||
      source.checked > reviewed) throw new Error("Invalid source chronology.");
  return source;
}
export function arxivURL(source) {
  // Also validate when called outside the catalog renderer.
  validateSource(source, source.checked);
  return `https://arxiv.org/abs/${source.arxiv_id}${source.version}`;
}
export function latestSourceDate(item) {
  return [item.source, ...(item.updates || [])].filter(Boolean)
    .map(source => source.revised).sort().at(-1) || "";
}
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
      !validDate(data.reviewed) ||
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
    if (f.builds_on !== undefined && (typeof f.builds_on !== "string" || !slug.test(f.builds_on)))
      throw new Error("Invalid result connection.");
    if (!own(SCOPES, f.scope) || !/^10\.48550\/arXiv\.\d{4}\.\d{4,5}(?:v\d+)?$/.test(f.doi))
      throw new Error("Invalid research scope or DOI.");
    if (f.source_commit !== undefined && (typeof f.source_commit !== "string" ||
        !/^[a-f0-9]{40}$/.test(f.source_commit))) throw new Error("Unpinned family source.");
    if (f.source !== undefined) {
      validateSource(f.source, data.reviewed);
      if (f.doi !== `10.48550/arXiv.${f.source.arxiv_id}` ||
          !["open-in-source", "conditional-route"].includes(f.source.status))
        throw new Error("Parent question/source mismatch.");
    }
    if (f.updates !== undefined) {
      if (!Array.isArray(f.updates) || f.updates.length > 8) throw new Error("Invalid source updates.");
      const seen = new Set();
      for (const update of f.updates) {
        validateSource(update, data.reviewed);
        const key = `${update.arxiv_id}${update.version}/${update.locator}`;
        if (seen.has(key)) throw new Error("Duplicate source update.");
        seen.add(key);
      }
    }
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
      sourceCommit: f.source_commit || data.source_commit, reviewed: data.reviewed,
      source: f.source, updates: f.updates || [], buildsOn: f.builds_on };
    register({ ...f, ...shared, kind: "open-question", related: f.targets.map(t => t.id) });
    for (const t of f.targets) register({ ...t, ...shared });
  }
  for (const item of entries)
    if (item.related.some(id => !ids.has(id) || id === item.id))
      throw new Error(`Unresolved related question: ${item.id}.`);
  return entries;
}
export function sourceURL(item, anchor) {
  if (!anchor && item.source) return arxivURL(item.source);
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
      ...item.keywords, ...item.anchors,
      ...[item.source, ...(item.updates || [])].filter(Boolean).flatMap(source =>
        [source.arxiv_id, source.version, source.title, source.locator, source.note, source.status])].join(" ").toLowerCase();
    return (!filters.area || item.area === filters.area) &&
      (!filters.kind || item.kind === filters.kind) &&
      (!filters.scope || item.scope === filters.scope) &&
      (!filters.literature ||
        (filters.literature === "new" && Boolean(item.source)) ||
        (filters.literature === "updates" && Boolean(item.updates?.length)) ||
        (filters.literature === "unreviewed" && !item.source && !item.updates?.length)) &&
      (!filters.stage || local.stage === filters.stage) &&
      (!filters.starred || local.starred) &&
      (!filters.node || item.anchors.includes(filters.node)) &&
      words.every(word => text.includes(word));
  });
  if (filters.sort === "recent") result.sort((a, b) =>
    (notes[b.id]?.updated || "").localeCompare(notes[a.id]?.updated || "") || a.id.localeCompare(b.id));
  if (filters.sort === "title") result.sort((a, b) => a.title.localeCompare(b.title));
  if (filters.sort === "literature") result.sort((a, b) =>
    latestSourceDate(b).localeCompare(latestSourceDate(a)) || a.id.localeCompare(b.id));
  return result;
}
export function questionURL(url, id) {
  if (!slug.test(id)) throw new Error("Invalid question ID.");
  const result = new URL(url);
  // A shared question link should not inherit filters that can hide its target.
  result.hash = new URLSearchParams({ rp: id }).toString();
  return result.href;
}
