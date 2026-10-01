import { nodeSlug } from './library-core.mjs';

const digestPattern = /^sha256:[a-f0-9]{64}$/;

export function archivedNodeURL(release, node) {
  if (!digestPattern.test(release) || typeof node !== 'string' || !node)
    throw new Error('Invalid archived concept coordinate.');
  return `library-version.html#${new URLSearchParams({ release, node })}`;
}

export async function resolveArchivedNode(library, params) {
  const digest = params.get('snapshot'), release = params.get('release');
  if ((!digest && !release) || (digest && !digestPattern.test(digest)) ||
      (release && !digestPattern.test(release)))
    throw new Error('Invalid archived release coordinate.');
  const index = library.index.entries.findIndex(entry =>
    (!digest || entry.digest === digest) && (!release || entry.truth_release_digest === release));
  if (index < 0) throw new Error('Snapshot is not in the verified Library archive.');
  const snapshot = await library.snapshot(index);
  let node;
  if (params.has('node')) {
    node = snapshot.graph.nodes.find(candidate => candidate.id === params.get('node'));
  } else {
    // Compatibility for previously shared /release/<digest>/node/<slug>/ URLs.
    // Resolve against the verified snapshot, without publishing a file per node.
    const slug = params.get('slug');
    if (!/^[a-f0-9]{64}$/.test(slug || '')) throw new Error('Invalid archived concept slug.');
    for (let start = 0; start < snapshot.graph.nodes.length && !node; start += 128) {
      const batch = snapshot.graph.nodes.slice(start, start + 128);
      const slugs = await Promise.all(batch.map(candidate => nodeSlug(candidate.id)));
      const match = slugs.indexOf(slug);
      if (match >= 0) node = batch[match];
    }
  }
  if (!node) throw new Error('Concept is absent from this release.');
  return { snapshot, node, digest: library.index.entries[index].digest };
}
