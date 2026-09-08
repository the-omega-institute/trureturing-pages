import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCatalog, validateNotes, emptyNotes, selectEntries, sourceURL,
  questionURL, STAGES, validateSource, arxivURL, latestSourceDate } from "../site/assets/research-workbench-core.mjs";
const data = JSON.parse(await readFile(new URL("../site/assets/research-catalog.json", import.meta.url)));
const entries = validateCatalog(data), ids = new Set(entries.map(e => e.id));
const copy = () => structuredClone(data);
const source = () => structuredClone(data.families.find(f => f.source).source);
const note = { stage:"working", starred:true, note:"Read source before proving.", updated:"2026-09-07T00:00:00.000Z" };
const legacyIds = [
  "golden-ratio-base4-dfao-minimality", "dfao-sparse-distinguishability", "dfao-finite-unsat",
  "mub-six-fourth-basis", "mub-basis-context", "mub-joint-compatibility",
  "base-phi-negative-prefix-trident", "negative-prefix-transducer", "negative-prefix-return-itinerary",
  "ordered-zeckendorf-long-game-strategy", "lgs-switch-order", "lgs-bellman-exchange",
  "random-zeckendorf-game-gaussianity", "game-path-measures", "game-regenerative-barrier",
  "wall-sun-sun-golden-unit-lift", "pisano-matrix-order", "pisano-first-lift-defect",
  "zeckendorf-polynomial-maximum-order-complexity", "polynomial-successor-certificate", "polynomial-carry-window",
];

test("sixteen families and thirty-four proposed subproblems have unique IDs", () => {
  assert.equal(data.families.length, 16); assert.equal(entries.length, 50);
  assert.equal(entries.filter(e => e.kind === "open-question").length, 16);
  assert.equal(ids.size, entries.length);
});
test("source links are pinned without inventing upstream dossiers", () => {
  for (const e of entries) {
    const url = new URL(sourceURL(e));
    if (e.source) {
      assert.equal(url.hostname, "arxiv.org");
      assert.equal(url.pathname, `/abs/${e.source.arxiv_id}${e.source.version}`);
      assert.equal(sourceURL(e).includes("Problems/"), false);
    } else {
      assert.equal(url.hostname, "github.com");
      assert.ok(url.pathname.includes(`/blob/${data.source_commit}/Problems/`));
    }
    assert.ok(e.doi.startsWith("10.48550/arXiv."));
    for (const gid of e.anchors) {
      assert.ok(sourceURL(e, gid).includes(`/blob/${e.sourceCommit}/`));
      assert.ok(sourceURL(e, gid).endsWith(`${gid}.lean`));
    }
  }
});
test("reject duplicate IDs and dangling related targets", () => {
  const a=copy(); a.families[0].targets[0].id=a.families[0].id;
  assert.throws(()=>validateCatalog(a), /duplicate/);
  const b=copy(); b.families[0].targets[0].related=["missing"];
  assert.throws(()=>validateCatalog(b), /Unresolved/);
});
test("reject unsafe metadata, anchors and incomplete content", () => {
  for (const change of [d=>d.source_commit="dev", d=>d.families[0].doi="javascript:bad",
    d=>d.families[0].anchors=["D5/../../evil"], d=>d.families[0].targets[0].next_step=""])
    {const d=copy();change(d);assert.throws(()=>validateCatalog(d));}
});
test("token search covers source titles, locators, IDs, anchors and Chinese keywords", () => {
  assert.ok(selectEntries(entries,{q:"MUB BASIS"}).length>0);
  assert.ok(selectEntries(entries,{q:"六维"}).some(e=>e.id==="mub-six-fourth-basis"));
  assert.ok(selectEntries(entries,{q:"WDigits"}).length>0);
  assert.ok(selectEntries(entries,{q:"2606.09096 COROLLARY"}).some(e=>e.id==="suzuki-boundary-characteristic-limit"));
  assert.ok(selectEntries(entries,{q:"Gaussian row submatrices"}).some(e=>e.id==="balan-wang-universal-stability"));
  assert.equal(selectEntries(entries,{q:"not-in-the-catalog"}).length,0);
});
test("composable field, kind, horizon and exact node filters", () => {
  assert.equal(selectEntries(entries,{area:"Automata",kind:"certificate"}).length,1);
  const walls=selectEntries(entries,{scope:"wall",kind:"open-question"});
  assert.ok(walls.some(e=>e.id==="mub-six-fourth-basis"));
  assert.ok(walls.every(e=>e.scope==="wall" && e.kind==="open-question"));
  const selected=selectEntries(entries,{node:"D5/S3/Arith/GoldenApparition"});
  assert.equal(selected.length,3); assert.ok(selected.every(e=>e.area==="Arithmetic"));
});
test("progress filters are local and cannot promote a proof", () => {
  const local={ [entries[0].id]:note };
  assert.equal(selectEntries(entries,{stage:"working"},local).length,1);
  assert.equal(selectEntries(entries,{starred:true},local).length,1);
  assert.equal(selectEntries(entries,{stage:"unstarted"},local).length,entries.length-1);
  assert.equal(Object.hasOwn(STAGES,"proved"),false);
  assert.equal(entries[0].kind,"open-question");
});
test("sorts are deterministic without mutating catalog order", () => {
  const order=entries.map(e=>e.id);
  assert.equal(selectEntries(entries,{sort:"recent"},{[entries[5].id]:note})[0].id,entries[5].id);
  selectEntries(entries,{sort:"title"});selectEntries(entries,{sort:"literature"});
  assert.deepEqual(entries.map(e=>e.id),order);
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
test("permalinks discard every hiding filter and retain the Pages subpath", () => {
  const url=new URL(questionURL("https://example.test/project/research.html#rl=unreviewed&ra=Arithmetic&node=D5%2FFoo",entries[0].id));
  assert.equal(url.pathname,"/project/research.html");
  assert.equal(url.hash,`#rp=${entries[0].id}`);
  assert.throws(()=>questionURL(url,"<script>"));
});
test("finite UNSAT target retains the right implication direction", () => {
  const e=entries.find(e=>e.id==="dfao-finite-unsat");
  assert.match(e.success,/must satisfy the sample/);assert.match(e.success,/completeness is unnecessary/);
});
test("all twenty-one legacy IDs and their old notebooks survive the expansion", () => {
  const n=emptyNotes("2026-09-07.1");
  for(const id of legacyIds){assert.ok(ids.has(id),id);n.entries[id]=note;}
  const result=validateNotes(n,ids);
  assert.equal(result.skipped,0);assert.equal(Object.keys(result.notes.entries).length,21);
});
test("nine parent questions have complete versioned primary sources", () => {
  const added=data.families.filter(f=>f.source);
  assert.equal(added.length,9);
  for(const f of added){
    assert.match(f.source_commit,/^[a-f0-9]{40}$/);
    validateSource(f.source,data.reviewed);
    assert.ok(f.targets.every(t=>entries.find(e=>e.id===t.id).source===f.source));
  }
});
test("nine unique checked arXiv versions back primary questions and updates", () => {
  const records=data.families.flatMap(f=>[f.source,...(f.updates||[])]).filter(Boolean);
  assert.deepEqual([...new Set(records.map(s=>s.arxiv_id+s.version))].sort(),
    ["2503.04122v1","2509.16034v1","2509.16150v2","2511.22755v1","2603.29571v1","2606.09096v1","2606.13903v1","2607.06249v1","2608.03723v1"]);
});
test("source dates are real calendar dates with ordered chronology", () => {
  for(const change of [s=>s.submitted="2026-02-30",s=>s.checked="2026-9-7",
    s=>s.revised="2027-01-01",s=>s.submitted="2026-09-09",s=>s.checked="2026-09-09"]){
    const s=source();change(s);assert.throws(()=>validateSource(s,data.reviewed));
  }
});
test("reject unversioned, injected or malformed arXiv identities", () => {
  for(const patch of [{version:""},{version:"v0"},{version:"v1/../../bad"},
    {arxiv_id:"2613.12345"},{arxiv_id:"2606.09096?x=1"},{status:"resolved"}])
    assert.throws(()=>arxivURL({...source(),...patch}));
});
test("a proved or obstructed source cannot silently become an open parent", () => {
  for(const status of ["proved-in-source","route-obstruction","context"]){
    const d=copy();d.families.find(f=>f.source).source.status=status;
    assert.throws(()=>validateCatalog(d),/mismatch/);
  }
  const d=copy();d.families.find(f=>f.source).doi="10.48550/arXiv.2401.00001";
  assert.throws(()=>validateCatalog(d),/mismatch/);
});
test("per-family pins and source updates are validated", () => {
  for(const patch of [f=>f.source_commit="dev",f=>f.updates={},
    f=>f.updates=[source(),source()],f=>f.updates=[{...source(),note:""}]]){
    const d=copy();patch(d.families[0]);assert.throws(()=>validateCatalog(d));
  }
});
test("literature filters compose without changing personal progress", () => {
  const added=selectEntries(entries,{literature:"new",kind:"open-question"});
  assert.equal(added.length,9);
  assert.equal(selectEntries(entries,{literature:"new"}).length,27);
  assert.ok(selectEntries(entries,{literature:"updates"}).every(e=>e.updates.length));
  assert.ok(selectEntries(entries,{literature:"unreviewed"}).every(e=>!e.source&&!e.updates.length));
  assert.equal(selectEntries(entries,{literature:"unknown"}).length,0);
});
test("paper revision sorting does not use review dates or HTML generation dates", () => {
  const sorted=selectEntries(entries,{sort:"literature"});
  assert.equal(latestSourceDate(sorted[0]),"2026-08-04");
  assert.equal(latestSourceDate(sorted.at(-1)),"");
  const survey=entries.find(e=>e.id==="sic-povm-all-dimensions");
  assert.equal(latestSourceDate(survey),"2026-03-31");
  const old=entries.find(e=>e.id==="base-phi-negative-prefix-trident");
  assert.equal(latestSourceDate(old),"2026-03-11");
});
test("reported results do not resolve parent conjectures", () => {
  const bw=entries.find(e=>e.id==="balan-wang-universal-stability");
  assert.equal(bw.source.status,"open-in-source");
  assert.equal(bw.updates[0].status,"proved-in-source");
  assert.match(bw.gap,/every.*deterministic/);
  const mub=entries.find(e=>e.id==="mub-six-fourth-basis");
  assert.equal(mub.updates[0].status,"route-obstruction");
  assert.equal(mub.source,undefined);
  assert.match(entries.find(e=>e.id==="mub-projector-sos-scope").success,/four|4/);
});

test("completed results connect to distinct unfinished families and targets", async () => {
  const results=JSON.parse(await readFile(new URL("../site/assets/research-news.json",import.meta.url))).results;
  const followups=data.families.filter(f=>f.builds_on);
  assert.equal(followups.length,3);
  for(const family of followups){
    assert.ok(results.some(r=>r.id===family.builds_on));
    assert.notEqual(family.id,family.builds_on);
    assert.ok(family.targets.every(t=>entries.find(e=>e.id===t.id).buildsOn===family.builds_on));
    assert.equal(family.source.status,"open-in-source");
  }
  const bad=copy();bad.families[0].builds_on="../../unsafe";
  assert.throws(()=>validateCatalog(bad),/result connection/);
  assert.match(entries.find(e=>e.id==="greedy-three-sumfree-third-seed-one").gap,/violates.*d>=2/);
  assert.match(entries.find(e=>e.id==="pochhammer-higher-even-intervals").gap,/original conjunction is false/);
});
