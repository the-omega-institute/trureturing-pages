import { sha256 } from "./architecture-core.mjs";

const digest = /^sha256:[a-f0-9]{64}$/;
export async function verifiedJSON(base, entry) {
  if (
    !digest.test(entry?.digest) ||
    ![
      `data/library/${entry.digest.slice(7)}.json`,
      `data/library/${entry.digest.slice(7)}.json.gz`,
    ].includes(entry.path)
  )
    throw new Error("Invalid Library artifact coordinate.");
  const response = await fetch(new URL(entry.path, base));
  if (!response.ok) throw new Error(`Library artifact HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const hash =
    "sha256:" +
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  if (hash !== entry.digest)
    throw new Error("Library artifact digest mismatch.");
  const text = entry.path.endsWith(".gz")
    ? await new Response(
        new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
      ).text()
    : new TextDecoder().decode(bytes);
  return JSON.parse(text);
}
export async function loadLibrary(base) {
  const response = await fetch(new URL("data/library-history.v1.json", base), {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Library archive HTTP ${response.status}`);
  const index = await response.json();
  if (
    index.schema_version !== "pages-library-history.v1" ||
    !index.entries?.length ||
    index.entries.at(-1).truth_release_digest !==
      index.current_truth_release_digest
  )
    throw new Error("Invalid Library history.");
  const seen = new Set();
  for (const entry of index.entries) {
    if (
      !digest.test(entry.digest) ||
      !digest.test(entry.truth_release_digest) ||
      !digest.test(entry.atlas_graph_digest) ||
      ![
        `data/library/${entry.digest.slice(7)}.json`,
        `data/library/${entry.digest.slice(7)}.json.gz`,
      ].includes(entry.path) ||
      seen.has(entry.digest)
    )
      throw new Error("Invalid Library history entry.");
    seen.add(entry.digest);
  }
  const manifestResponse = await fetch(
    new URL("data/pages-atlas-manifest.v1.json", base),
    { cache: "no-store" },
  );
  if (!manifestResponse.ok)
    throw new Error(`Atlas manifest HTTP ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  if (
    manifest.schema_version !== "pages-atlas-manifest.v1" ||
    manifest.truth_release_digest !== index.current_truth_release_digest ||
    manifest.atlas_graph_digest !== index.entries.at(-1).atlas_graph_digest
  )
    throw new Error("Library archive does not bind the current Atlas.");
  const cache = new Map();
  return {
    index,
    async snapshot(i) {
      if (!cache.has(i))
        cache.set(
          i,
          verifiedJSON(base, index.entries[i]).then((snapshot) => {
            if (
              snapshot.schema_version !== "pages-library-snapshot.v1" ||
              snapshot.truth_release_digest !==
                index.entries[i].truth_release_digest ||
              snapshot.atlas_graph_digest !==
                index.entries[i].atlas_graph_digest ||
              snapshot.graph?.source_snapshot?.truth_release_digest !==
                snapshot.truth_release_digest
            )
              throw new Error("Library snapshot release mismatch.");
            return snapshot;
          }),
        );
      return cache.get(i);
    },
    async timeline() {
      const value = await verifiedJSON(base, index.timeline);
      if (
        value.schema_version !== "pages-content-timeline.v1" ||
        !value.nodes ||
        !value.problems
      )
        throw new Error("Invalid content timeline.");
      for (const events of [
        ...Object.values(value.nodes),
        ...Object.values(value.problems),
      ]) {
        let last = -1;
        for (const event of events) {
          if (
            !Number.isInteger(event.observation) ||
            event.observation <= last ||
            !index.entries[event.observation]
          )
            throw new Error("Invalid content timeline observation.");
          last = event.observation;
        }
      }
      return value;
    },
  };
}
export async function nodeSlug(id) {
  return (await sha256(id)).slice(7);
}
