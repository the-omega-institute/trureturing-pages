import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCatalog, validateNotes, emptyNotes, selectEntries, sourceURL,
  questionURL, STAGES } from "../site/assets/research-workbench-core.mjs";
const data = JSON.parse(await readFile(new URL("../site/assets/research-catalog.json", import.meta.url)));
const entries = validateCatalog(data), ids = new Set(entries.map(e => e.id));
const copy = () => structuredClone(data);
const note = { stage:"working", starred:true, note:"Read source before proving.", updated:"2026-09-07T00:00:00.000Z" };

test("seven repository source families expand to fourteen proposed subproblems", () => {
  assert.equal(data.families.length, 7); assert.equal(entries.length, 21);
  assert.equal(entries.filter(e => e.kind === "open-question").length, 7);
  assert.equal(new Set(entries.map(e => e.id)).size, 21);
  assert.equal(entries.every(e => e.sourceCommit === data.source_commit), true);
});
test("all source links pin the inspected commit and use complete DOI identifiers", () => {
  for (const e of entries) {
    assert.equal(new URL(sourceURL(e)).hostname, "github.com");
    assert.ok(sourceURL(e).includes(`/blob/${data.source_commit}/Problems/`));
    assert.ok(e.doi.startsWith("10.48550/arXiv."));
    for (const gid of e.anchors) assert.ok(sourceURL(e, gid).endsWith(`${gid}.lean`));
  }
});
test("reject duplicate IDs and dangling related targets", () => {
  const a=copy(); a.families[0].targets[0].id=a.families[0].id;
  assert.throws(()=>validateCatalog(a), /duplicate/);
  const b=copy(); b.families[0].targets[0].related=["missing"];
  assert.throws(()=>validateCatalog(b), /Unresolved/);
});
test("reject unpinned metadata, unsafe anchors, malformed source and incomplete content", () => {
  for (const change of [d=>d.source_commit="dev", d=>d.families[0].doi="javascript:bad",
    d=>d.families[0].anchors=["D5/../../evil"], d=>d.families[0].targets[0].next_step=""])
    {const d=copy();change(d);assert.throws(()=>validateCatalog(d));}
});
test("case-insensitive token search covers targets, repository anchors and Chinese keywords", () => {
  assert.ok(selectEntries(entries,{q:"MUB BASIS"}).length>0);
  assert.equal(selectEntries(entries,{q:"六维"}).length,3);
  assert.ok(selectEntries(entries,{q:"WDigits"}).length>0);
  assert.equal(selectEntries(entries,{q:"not-in-the-catalog"}).length,0);
});
test("composable field, kind, scope and exact node filters", () => {
  assert.equal(selectEntries(entries,{area:"Automata",kind:"certificate"}).length,1);
  assert.equal(selectEntries(entries,{scope:"wall",kind:"open-question"}).length,2);
  const selected=selectEntries(entries,{node:"D5/S3/Arith/GoldenApparition"});
  assert.equal(selected.length,3); assert.ok(selected.every(e=>e.area==="Arithmetic"));
});
test("progress filters are local and cannot promote a proof", () => {
  const local={ [entries[0].id]:note };
  assert.equal(selectEntries(entries,{stage:"working"},local).length,1);
  assert.equal(selectEntries(entries,{starred:true},local).length,1);
  assert.equal(selectEntries(entries,{stage:"unstarted"},local).length,20);
  assert.equal(Object.hasOwn(STAGES,"proved"),false);
  assert.equal(entries[0].kind,"open-question");
});
test("recent and title sorts are deterministic without mutating catalog order", () => {
  const order=entries.map(e=>e.id);
  assert.equal(selectEntries(entries,{sort:"recent"},{[entries[5].id]:note})[0].id,entries[5].id);
  selectEntries(entries,{sort:"title"});assert.deepEqual(entries.map(e=>e.id),order);
});
test("notebook round trip, unknown IDs and revision preservation", () => {
  const n=emptyNotes("previous-revision");n.entries[entries[0].id]=note;n.entries["unknown-id"]=note;
  const {notes,skipped}=validateNotes(JSON.parse(JSON.stringify(n)),ids);
  assert.equal(skipped,1);assert.equal(notes.catalog_revision,"previous-revision");
  assert.deepEqual(notes.entries[entries[0].id],note);
});
test("reject invalid imports before changing any existing notes", () => {
  for(const value of [{...note,stage:"proved"},{...note,starred:"yes"},{...note,note:"x".repeat(10001)},
    {...note,updated:"bad-date"}, {...note,stage:"__proto__"}]) {
    const n=emptyNotes(data.revision);n.entries[entries[0].id]=value;
    const before=JSON.stringify(n);assert.throws(()=>validateNotes(n,ids));assert.equal(JSON.stringify(n),before);
  }
  assert.throws(()=>validateNotes({schema_version:"wrong",entries:{}},ids));
});
test("prototype-like IDs and excessive imports are rejected", () => {
  const bad=JSON.parse('{"schema_version":"pages-research-notes.v1","catalog_revision":"v","entries":{"__proto__":{"stage":"working","starred":true,"note":"","updated":"2026-09-07"}}}');
  assert.throws(()=>validateNotes(bad,ids));
  const n=emptyNotes("v");for(let i=0;i<1001;i++)n.entries[`q-${i}`]=note;
  assert.throws(()=>validateNotes(n,ids),/large/);
});
test("permalinks are stable and discard filters that would hide the target", () => {
  const url=new URL(questionURL("https://example.test/project/research.html#ra=Arithmetic&node=D5%2FFoo",entries[0].id));
  assert.equal(url.pathname,"/project/research.html");
  assert.equal(url.hash,`#rp=${entries[0].id}`);
  assert.throws(()=>questionURL(url,"<script>"));
});
test("finite UNSAT target has the right implication direction", () => {
  const e=entries.find(e=>e.id==="dfao-finite-unsat");
  assert.match(e.success,/must satisfy the sample/);assert.match(e.success,/completeness is unnecessary/);
});
