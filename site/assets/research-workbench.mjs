import { STORAGE_KEY, STAGES, KINDS, SCOPES, validateCatalog, validateNotes,
  emptyNotes, selectEntries, sourceURL, questionURL, SOURCE_STATES, arxivURL } from "./research-workbench-core.mjs";

const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const link = (text, href) => Object.assign(el("a", text), { href });
const button = (text, action) => {
  const node = el("button", text); node.type = "button";
  node.addEventListener("click", action); return node;
};
export async function mountResearchWorkbench() {
  const home = document.querySelector(".research-home");
  if (!home || document.querySelector("#research-workbench")) return;
  const response = await fetch(new URL("./research-catalog.json", import.meta.url));
  if (!response.ok) throw new Error(`Research catalog HTTP ${response.status}`);
  const catalog = await response.json(), entries = validateCatalog(catalog);
  const known = new Set(entries.map(item => item.id));
  const released = new Map([...home.querySelectorAll(".problem-row")].map(row =>
    [new URL(row.href).pathname.split("/").filter(Boolean).at(-1), row.href]));
  const resolutions = new Map([...home.querySelectorAll(".resolved-question[data-problem-slug]")]
    .filter(row => ["proved", "refuted"].includes(row.dataset.resolutionKind))
    .map(row => [row.dataset.problemSlug, { kind: row.dataset.resolutionKind, href: `#${row.id}` }]));
  const activeFamilies = catalog.families.filter(family => !resolutions.has(family.id));
  let notes = emptyNotes(catalog.revision), storageWarning = "";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const restored = validateNotes(JSON.parse(raw), known);
      notes = restored.notes;
      if (restored.skipped) storageWarning = `${restored.skipped} entries are outside this catalog. Keep your previous export.`;
      if (notes.catalog_revision !== catalog.revision)
        storageWarning += " Catalog changed. Recheck the sources behind your saved notes.";
    }
  } catch {
    storageWarning = "Saved notebook could not be read. Changes are kept in memory until saving succeeds; export a backup.";
  }
  const css = document.createElement("link"); css.rel = "stylesheet";
  css.href = new URL("./research-workbench.css", import.meta.url).href;
  document.head.append(css);
  const host = el("section", undefined, "research-workbench");
  host.id = "research-workbench"; host.setAttribute("aria-labelledby", "workbench-title");
  const heading = el("div", undefined, "rw-heading"), title = el("h2", "Our research directions");
  title.id = "workbench-title";
  heading.append(title, el("p", `${new Set(activeFamilies.map(f => f.area)).size} fields / ${activeFamilies.length} open questions & conjectural routes / ${activeFamilies.reduce((sum, family) => sum + family.targets.length, 0)} proposed targets`));
  const boundary = el("p", "Catalog and browser notes are advisory. Released proofs, source dossiers and their history remain separate below.", "rw-boundary");
  const provenance = el("details", undefined, "rw-provenance");
  provenance.append(el("summary", `Source review: ${catalog.reviewed} / per-question repository pins`),
    el("p", catalog.review_scope), link("Legacy dossier source commit", `https://github.com/${catalog.source_repo}/commit/${catalog.source_commit}`));
  const tools = el("div", undefined, "rw-tools"), filters = {};
  const field = (name, label, options) => {
    const wrap = el("div", undefined, "rw-field"), caption = el("label", label);
    const input = el(options ? "select" : "input");
    input.id = `rw-${name}`; caption.htmlFor = input.id;
    if (options) for (const [value, text] of options) {
      const option = el("option", text); option.value = value; input.append(option);
    } else { input.type = "search"; input.placeholder = "Question, next step, DOI, or Lean anchor"; }
    wrap.append(caption, input); tools.append(wrap); filters[name] = input;
  };
  field("q", "Search the research bank");
  field("area", "Field", [["", "All fields"], ...[...new Set(entries.map(e => e.area))].sort().map(x => [x, x])]);
  field("kind", "Question type", [["", "All question types"], ...Object.entries(KINDS)]);
  field("scope", "Horizon", [["", "All horizons"], ...Object.entries(SCOPES)]);
  field("stage", "My progress", [["", "All local stages"], ...Object.entries(STAGES)]);
  field("literature", "Literature", [["", "All source records"], ["new", "New arXiv questions"], ["updates", "Related source updates"], ["unreviewed", "Not rechecked this round"]]);
  field("sort", "Sort", [["family", "Source families"], ["literature", "Latest paper revision"], ["recent", "Recently updated notes"], ["title", "Title"]]);
  const advanced = el("details", undefined, "rw-advanced");
  const advancedSummary = el("summary", "Filter and sort");
  const filterGrid = el("div", undefined, "rw-filter-grid");
  for (const field of [...tools.children].slice(1)) filterGrid.append(field);
  advanced.append(advancedSummary, filterGrid); tools.append(advanced);
  advanced.open = false;
  const actions = el("div", undefined, "rw-actions");
  const starLabel = el("label", undefined, "rw-checkbox"), stars = el("input");
  stars.type = "checkbox"; stars.id = "rw-starred";
  starLabel.append(stars, document.createTextNode("My shortlist"));
  const count = el("p", "", "rw-count"); count.id = "rw-count"; count.setAttribute("role", "status");
  const status = el("p", storageWarning || "Personal progress is saved in this browser only. Export to move it between devices.", "rw-storage-status");
  status.id = "rw-storage-status"; status.setAttribute("role", "status");
  const cards = el("div", undefined, "rw-cards"); cards.id = "rw-cards";
  const browser = el("details", undefined, "rw-bank"); browser.id = "research-bank";
  browser.append(el("summary", "Question bank & notebook"));
  const searchLink = link("", "#research-bank"); searchLink.className = "rw-search-link";
  searchLink.title = "Search questions"; searchLink.setAttribute("aria-label", "Search questions");
  const searchIcon = el("i"); searchIcon.dataset.lucide = "search"; searchLink.append(searchIcon);
  searchLink.addEventListener("click", () => { browser.open = true; requestAnimationFrame(() => filters.q.focus()); });
  heading.append(searchLink);
  const directions = el("div", undefined, "rw-directions");
  const areaNav = el("nav", undefined, "rw-area-nav");
  areaNav.setAttribute("aria-label", "Research fields");
  const areas = [...new Set(activeFamilies.map(f => f.area))];
  const areaIcons = ["workflow", "orbit", "binary", "git-branch", "chart-no-axes-combined", "hash", "scan-line", "waves", "focus", "chart-network"];
  for (const [index, area] of areas.entries()) {
    const families = activeFamilies.filter(f => f.area === area);
    const id = `research-field-${index + 1}`;
    const areaLink = link(area, `#${id}`);
    areaLink.append(el("small", String(families.length)));
    areaNav.append(areaLink);
    const section = el("section", undefined, "rw-direction"); section.id = id;
    const areaHeading = el("h3", undefined, "rw-direction-title");
    const symbol = el("i"); symbol.dataset.lucide = areaIcons[index % areaIcons.length];
    areaHeading.append(symbol, document.createTextNode(area));
    section.style.setProperty("--direction-accent", ["#81cdbf", "#bba6df", "#e3c579", "#b8d780", "#8cbbdf"][index % 5]);
    section.append(areaHeading);
    for (const family of families) {
      const question = el("article", undefined, "rw-frontier-question");
      const name = el("h4"); name.append(link(family.title, questionURL(location.href, family.id)));
      question.append(el("p", `${SCOPES[family.scope]} / ${family.source?.status === "conditional-route" ? "Conjectural route" : "Source question"}`, "rw-frontier-meta"), name);
      question.append(el("p", "Proposed next step", "rw-next-label"), el("p", family.next_step, "rw-next-step"));
      const targets = el("div", undefined, "rw-frontier-targets");
      for (const target of family.targets) targets.append(link(target.title, questionURL(location.href, target.id)));
      question.append(targets); section.append(question);
    }
    directions.append(section);
  }
  const empty = el("p", "No questions match. Clear filters or select another field.", "rw-empty"); empty.hidden = true;
  let visible = [], selectedNode = "", focusId = "";
  const paramNames = { q: "rq", area: "ra", kind: "rk", scope: "rh", stage: "rs", sort: "ro", literature: "rl" };
  function readURL() {
    const params = new URLSearchParams(location.hash.slice(1));
    for (const [name, key] of Object.entries(paramNames))
      filters[name].value = params.get(key) || (name === "q" ? params.get("q") || "" : name === "sort" ? "family" : "");
    stars.checked = params.get("rw") === "1";
    selectedNode = params.get("node") || "";
    focusId = params.get("rp") || "";
    if (known.has(focusId)) {
      // A direct link takes precedence over stale filters, including node filters.
      for (const [name, input] of Object.entries(filters)) input.value = name === "sort" ? "family" : "";
      stars.checked = false; selectedNode = "";
    }
    if (location.hash === "#research-bank" || focusId || selectedNode || Object.values(paramNames).some(key => params.has(key)) || params.has("q") || params.has("rw")) {
      browser.open = true;
      advanced.open = Object.entries(filters).some(([name, input]) => name !== "q" && name !== "sort" && input.value);
    }
  }
  function writeURL() {
    const params = new URLSearchParams(location.hash.slice(1));
    for (const [name, key] of Object.entries(paramNames)) {
      params.delete(key);
      if (filters[name].value && !(name === "sort" && filters[name].value === "family")) params.set(key, filters[name].value);
    }
    params.delete("rp"); params.delete("rw"); params.delete("q");
    if (stars.checked) params.set("rw", "1");
    if (!selectedNode) params.delete("node");
    const url = new URL(location.href); url.hash = params.toString();
    history.replaceState(null, "", url); focusId = "";
  }
  let writes = Promise.resolve();
  let pending = {};
  function saveNotes() {
    const save = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const latest = raw ? validateNotes(JSON.parse(raw), known).notes : emptyNotes(catalog.revision);
        const merged = { ...notes.entries, ...latest.entries };
        for (const [id, patch] of Object.entries(pending)) merged[id] = { ...merged[id], ...patch };
        notes = { ...emptyNotes(catalog.revision), entries: merged };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
        pending = {};
        status.textContent = "Saved in this browser. Shared progress requires a GitHub record.";
        return true;
      } catch {
        status.textContent = "Browser storage unavailable or full. Your changes remain in memory; export them before leaving.";
        return false;
      }
    };
    // Serialize read/merge/write across tabs; only edited fields replace stored values.
    writes = writes.then(() => navigator.locks ? navigator.locks.request(STORAGE_KEY, save) : save())
      .catch(() => { status.textContent = "Notebook saving failed. Export your in-memory changes before leaving."; return false; });
    return writes;
  }
  function persist(id, patch) {
    const prior = notes.entries[id] || { stage: "unstarted", starred: false, note: "" };
    const update = { ...patch, updated: new Date().toISOString() };
    notes.entries[id] = { ...prior, ...update };
    pending[id] = { ...pending[id], ...update };
    notes.catalog_revision = catalog.revision;
    status.textContent = "Saving in this browser...";
    saveNotes();
  }
  function detailText(parent, label, value) {
    parent.append(el("h4", label), el("p", value));
  }
  function sourceRecord(source, label) {
    const record = el("section", undefined, "rw-literature");
    record.append(el("h4", label), el("p", SOURCE_STATES[source.status], "rw-source-status"));
    record.append(link(`${source.title} / arXiv:${source.arxiv_id}${source.version}`, arxivURL(source)));
    record.append(el("p", source.locator, "rw-source-locator"));
    const dates = el("p", undefined, "rw-source-dates");
    for (const [key, caption] of [["submitted", "Submitted"], ["revised", "Revised"], ["checked", "Checked"]]) {
      if (dates.childNodes.length) dates.append(document.createTextNode(" / "));
      const time = el("time", source[key]); time.dateTime = source[key];
      dates.append(document.createTextNode(`${caption}: `), time);
    }
    record.append(dates, el("p", source.note));
    return record;
  }
  function renderCard(item) {
    const saved = notes.entries[item.id] || { stage: "unstarted", starred: false, note: "" };
    const resolution = resolutions.get(item.familyId);
    const card = el("details", undefined, "rw-card"); card.id = `question-${item.id}`;
    card.dataset.questionId = item.id;
    const summary = el("summary"), label = el("div", undefined, "rw-card-label");
    label.append(el("span", `${item.area} / ${KINDS[item.kind]}`, "rw-eyebrow"), el("h3", item.title));
    const stageText = el("span", `My progress: ${STAGES[saved.stage]}`, "rw-stage");
    summary.append(label, stageText);
    if (resolution) summary.append(el("span", item.id === item.familyId
      ? `Source-recorded ${resolution.kind}` : "Parent resolved / target needs reassessment", "rw-source-badge"));
    if (item.source || item.updates.length) summary.append(el("span",
      item.source ? `Source ${item.source.arxiv_id}${item.source.version}` : "Related literature update", "rw-source-badge"));
    card.append(summary);
    const body = el("div", undefined, "rw-card-body");
    body.append(el("p", item.question, "rw-question"));
    const info = el("p", `${SCOPES[item.scope]} / ${item.kind === "open-question" ? (item.source ? SOURCE_STATES[item.source.status] : "Parent literature status: not rechecked") : "Proposed target, no completion asserted"}`, "rw-meta");
    body.append(info);
    if (resolution) body.append(link(item.id === item.familyId
      ? `Source-recorded ${resolution.kind}: result and scope`
      : "Parent result / no completion asserted for this target", resolution.href));
    if (item.id !== item.familyId) body.append(link(`Parent: ${item.familyTitle}`, questionURL(location.href, item.familyId)));
    detailText(body, "Why this belongs in trureturing", item.foothold);
    detailText(body, "Research gap to recheck", item.gap);
    detailText(body, "Next concrete step", item.next_step);
    detailText(body, "What would count as progress", item.success);
    if (item.source) body.append(sourceRecord(item.source, "Family source / exact question location"));
    for (const update of item.updates) body.append(sourceRecord(update, "Related literature update / scope matters"));
    const sources = el("div", undefined, "rw-links");
    sources.append(link(item.source ? "Pinned arXiv source" : "Pinned source dossier", sourceURL(item)), link(`DOI: ${item.doi}`, `https://doi.org/${item.doi}`));
    if (released.has(item.familyId)) sources.append(link("Released dossier and history", released.get(item.familyId)));
    body.append(sources);
    const anchors = el("details", undefined, "rw-anchors"), list = el("ul");
    anchors.append(el("summary", `${item.anchors.length} repository anchors at ${item.sourceCommit.slice(0, 12)} (release status separate)`));
    for (const gid of item.anchors) { const li = el("li"); li.append(link(gid, sourceURL(item, gid))); list.append(li); }
    anchors.append(list); body.append(anchors);
    if (item.related.length) {
      const related = el("div", undefined, "rw-related"); related.append(el("h4", "Related targets / suggested connections"));
      for (const id of item.related) related.append(link(entries.find(e => e.id === id).title, questionURL(location.href, id)));
      body.append(related);
    }
    const notebook = el("fieldset", undefined, "rw-notebook"); notebook.append(el("legend", "My notebook / this browser"));
    const stageLabel = el("label", "Stage"), stage = el("select"); stage.id = `stage-${item.id}`; stageLabel.htmlFor = stage.id;
    for (const [value, text] of Object.entries(STAGES)) { const option = el("option", text); option.value = value; stage.append(option); }
    stage.value = saved.stage;
    stage.addEventListener("change", () => { persist(item.id, { stage: stage.value }); stageText.textContent = `My progress: ${STAGES[stage.value]}`; if (filters.stage.value) render(); });
    const star = button(saved.starred ? "Remove from shortlist" : "Add to shortlist", () => {
      const value = !notes.entries[item.id]?.starred; persist(item.id, { starred: value });
      star.textContent = value ? "Remove from shortlist" : "Add to shortlist"; star.setAttribute("aria-pressed", String(value));
      if (stars.checked) render();
    }); star.setAttribute("aria-pressed", String(saved.starred));
    const noteLabel = el("label", "Notes, blockers and PR / evidence links"), note = el("textarea");
    note.id = `note-${item.id}`; noteLabel.htmlFor = note.id; note.maxLength = 10000; note.rows = 3; note.value = saved.note;
    note.addEventListener("input", () => persist(item.id, { note: note.value }));
    notebook.append(stageLabel, stage, star, noteLabel, note);
    const footer = el("div", undefined, "rw-links");
    const issue = new URL("https://github.com/the-omega-institute/trureturing/issues/new");
    issue.searchParams.set("title", `[Research] ${item.title}`);
    issue.searchParams.set("body", `Research target: ${item.id}\nSource: ${sourceURL(item)}\n\nProposed next step: ${item.next_step}\n\nProgress and evidence:\n\nRemaining gap:\n`);
    footer.append(link("Permalink", questionURL(location.href, item.id)), link("Record progress on GitHub", issue.href));
    body.append(notebook, footer); card.append(body); return card;
  }
  function render() {
    const criteria = Object.fromEntries(Object.entries(filters).map(([key, input]) => [key, input.value]));
    visible = selectEntries(entries, { ...criteria, starred: stars.checked, node: selectedNode }, notes.entries);
    const activeFilters = [filters.area, filters.kind, filters.scope, filters.stage, filters.literature].filter(input => input.value).length;
    advancedSummary.textContent = `Filter and sort${activeFilters ? ` / ${activeFilters} active` : ""}`;
    count.textContent = `${visible.length} of ${entries.length} questions and targets${selectedNode ? " / selected source anchor" : ""}`;
    empty.hidden = visible.length > 0;
    cards.replaceChildren(...visible.map(renderCard));
    if (focusId) {
      const card = document.getElementById(`question-${focusId}`);
      if (card) { card.open = true; card.querySelector("summary").focus(); card.scrollIntoView({ block: "nearest" }); }
      else status.textContent = "That question ID is not in this catalog. All matching entries are shown.";
    }
  }
  const reset = button("Clear filters", () => {
    for (const [name, input] of Object.entries(filters)) input.value = name === "sort" ? "family" : "";
    stars.checked = false; selectedNode = ""; writeURL(); render();
  });
  const pick = button("Pick a next target", () => {
    const candidates = visible.filter(e => e.kind !== "open-question");
    if (!candidates.length) { status.textContent = "No subproblems in this selection. Clear the question-type filter."; return; }
    const item = candidates[Math.floor(Math.random() * candidates.length)];
    location.href = questionURL(location.href, item.id);
  });
  const download = button("Export notebook", async () => {
    await saveNotes();
    const blob = new Blob([JSON.stringify(notes, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = link("Download", url);
    a.download = "trureturing-research-notebook.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const input = el("input"); input.type = "file"; input.accept = ".json,application/json"; input.hidden = true;
  input.addEventListener("change", async () => {
    const file = input.files[0]; if (!file) return;
    try {
      if (file.size > 1000000) throw new Error("Notebook exceeds 1 MB.");
      const imported = validateNotes(JSON.parse(await file.text()), known);
      // Validate the entire file before changing any current entry.
      notes.entries = { ...notes.entries, ...imported.notes.entries };
      for (const [id, entry] of Object.entries(imported.notes.entries)) pending[id] = { ...entry };
      let message = `Imported ${Object.keys(imported.notes.entries).length} entries; ${imported.skipped} unknown IDs skipped.`;
      if (imported.notes.catalog_revision !== catalog.revision) message += " Catalog revisions differ; recheck sources.";
      notes.catalog_revision = catalog.revision;
      if (!await saveNotes()) message += " Storage unavailable; export before leaving.";
      status.textContent = message; render();
    } catch (error) { status.textContent = `Import rejected; existing notes unchanged. ${error.message}`; }
    finally { input.value = ""; }
  });
  actions.append(starLabel, reset, pick, download, button("Import notebook", () => input.click()), input);
  browser.append(tools, actions, count, status, cards, empty);
  provenance.append(boundary);
  host.append(heading, areaNav, directions, browser, provenance);
  for (const [name, control] of Object.entries(filters)) control.addEventListener(name === "q" ? "input" : "change", () => { writeURL(); render(); });
  stars.addEventListener("change", () => { writeURL(); render(); });
  window.addEventListener("hashchange", () => { readURL(); render(); });
  // Preserve the original server-rendered page as a working fallback and archive entrypoint.
  const oldStats = home.querySelector(".research-stats"), oldBrowser = home.querySelector(".research-browser");
  if (oldStats && oldBrowser) {
    const archive = el("details", undefined, "rw-release-browser");
    archive.id = "research-release-dossiers";
    archive.append(el("summary", "Release-bound dossiers, source graphs and version history"));
    oldStats.before(host, archive); archive.append(oldStats, oldBrowser);
  } else home.append(host);
  readURL(); render();
  window.lucide?.createIcons();
}
