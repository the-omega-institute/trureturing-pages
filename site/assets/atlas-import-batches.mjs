// Preserve every directed import while sharing draw calls. Alpha belongs to
// each style bucket; dropping it makes distant context as bright as the focus.
export function partitionImportEdges(edges, colorFor, widthFor) {
  const batches = new Map();
  for (const edge of edges) {
    const value = colorFor(edge);
    const rgba = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(value);
    const alpha = rgba ? Math.max(0, Math.min(1, Number(rgba[4]))) : 1;
    const opacity = (widthFor(edge) > 1 ? 0.46 : 0.18) * alpha;
    const color = rgba ? `rgb(${rgba[1]},${rgba[2]},${rgba[3]})` : value;
    if (!batches.has(opacity)) batches.set(opacity, { opacity, members: [] });
    batches.get(opacity).members.push({ edge, color });
  }
  return [...batches.values()];
}
