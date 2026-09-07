// Preserve the question bank's existing shared links after its move.
const legacyKeys = new Set([
  "rp",
  "rq",
  "ra",
  "rk",
  "rh",
  "rs",
  "rl",
  "ro",
  "rw",
  "node",
  "q",
]);
const route = () => {
  const hash = location.hash.slice(1);
  if (
    [...new URLSearchParams(hash).keys()].some((key) => legacyKeys.has(key)) ||
    [
      "research-bank",
      "research-release-dossiers",
      "research-workbench",
    ].includes(hash)
  ) {
    location.replace(`conjectures.html${location.search}${location.hash}`);
  }
};
route();
addEventListener("hashchange", route);
globalThis.lucide?.createIcons();
