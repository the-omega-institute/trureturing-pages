import { loadLibrary } from "./library-core.mjs";

export function researchIndex(model, snapshot, graphDigest, source) {
  if (
    snapshot.schema_version !== "pages-library-snapshot.v1" ||
    snapshot.atlas_graph_digest !== graphDigest ||
    snapshot.truth_release_digest !== source.truth_release_digest ||
    snapshot.graph?.source_snapshot?.source_commit !== source.source_commit ||
    !Array.isArray(snapshot.problems)
  )
    throw new Error("Research catalog does not bind this Atlas release.");
  const problems = new Map();
  const byNode = new Map();
  for (const problem of snapshot.problems) {
    if (
      typeof problem?.slug !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(problem.slug) ||
      problems.has(problem.slug) ||
      typeof problem.title !== "string" ||
      !problem.title.trim() ||
      !["theorem", "window", "wall"].includes(problem.triage) ||
      !Array.isArray(problem.motivation_gids) ||
      !problem.motivation_gids.length ||
      problem.motivation_gids.some((id) => typeof id !== "string" || !id) ||
      new Set(problem.motivation_gids).size !== problem.motivation_gids.length
    )
      throw new Error("Invalid research problem metadata.");
    const anchors = problem.motivation_gids.filter(
      (id) => model.byId.get(id)?.kind === "truth",
    );
    const missing = problem.motivation_gids.filter(
      (id) => !anchors.includes(id),
    );
    problems.set(problem.slug, { ...problem, anchors, missing });
    for (const id of anchors) {
      if (!byNode.has(id)) byNode.set(id, []);
      byNode.get(id).push(problem.slug);
    }
  }
  return { problems, byNode };
}

export async function loadResearch(base, model, graphDigest, source) {
  const library = await loadLibrary(base);
  const snapshot = await library.snapshot(library.index.entries.length - 1);
  return { ...researchIndex(model, snapshot, graphDigest, source), library };
}

// Authored research anchors are not open modules or new proof dependencies.
export function researchScope(model, research, slug = null) {
  const anchors = slug
    ? research?.problems.get(slug)?.anchors || []
    : [...(research?.byNode.keys() || [])];
  const ids = new Set(anchors);
  const pending = [...ids];
  for (let i = 0; i < pending.length; i++) {
    for (const parent of model.parents.get(pending[i]) || []) {
      if (model.byId.get(parent)?.kind !== "truth" || ids.has(parent)) continue;
      ids.add(parent);
      pending.push(parent);
    }
  }
  return ids;
}
