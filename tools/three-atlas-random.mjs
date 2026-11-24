// Three.js uses random 32-bit words for internal object UUIDs. Keep the bundle
// compatible with the site's existing secure-context requirement.
export function atlasRandom() {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
}
