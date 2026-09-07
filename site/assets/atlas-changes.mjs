import { releaseDelta } from "./evolution-core.mjs";

export function releaseHighlights(snapshots, libraryIndex, timeline) {
  const current = snapshots.at(-1),
    previous = snapshots.at(-2);
  const delta = releaseDelta(previous, current);
  const result = {
    kind: delta.kind,
    added: new Set(delta.added),
    retired: new Set(delta.retired),
    changed: new Set(),
    edgesAdded: new Set(
      (delta.edgesAdded || []).map((edge) => JSON.stringify(edge)),
    ),
    edgesRemoved: delta.edgesRemoved,
    edgesKnown: Array.isArray(delta.edgesAdded),
    contentKnown: false,
    release: current.truth_release_digest,
    previousRelease: previous?.truth_release_digest || null,
  };
  if (delta.kind !== "comparable" || !timeline) return result;
  const index = libraryIndex.entries.length - 1;
  const before = libraryIndex.entries[index - 1],
    after = libraryIndex.entries[index];
  if (
    before?.truth_release_digest !== previous.truth_release_digest ||
    before.atlas_graph_digest !== previous.atlas_graph_digest ||
    after.truth_release_digest !== current.truth_release_digest ||
    after.atlas_graph_digest !== current.atlas_graph_digest
  )
    return result;
  const currentIds = new Set(current.nodes.map((n) => n.id));
  for (const [id, events] of Object.entries(timeline.nodes)) {
    const event = events.at(-1);
    if (
      event?.observation === index &&
      event.present &&
      event.event === "Content changed" &&
      currentIds.has(id) &&
      !result.added.has(id)
    )
      result.changed.add(id);
  }
  result.contentKnown = true;
  return result;
}

export async function loadReleaseHighlights(snapshots, library) {
  const baseline = releaseHighlights(snapshots, library.index, null);
  if (baseline.kind !== "comparable") return baseline;
  return releaseHighlights(snapshots, library.index, await library.timeline());
}
