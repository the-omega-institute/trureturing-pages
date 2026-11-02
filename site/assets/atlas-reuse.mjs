// Use the released graph's distribution. Zero has a distinct meaning; positive
// counts are divided at their median, 90th and 99th percentiles. Ties stay together.
export function reuseBands(metrics) {
  const values = [...metrics.values()].map(item => item.reach).filter(value => value > 0).sort((a, b) => a - b);
  const max = values.at(-1) || 0;
  const percentile = q => values[Math.floor(q * (values.length - 1))] || 0;
  const cuts = [...new Set([1, percentile(.5) + 1, percentile(.9) + 1, percentile(.99) + 1])].filter(value => value <= max).sort((a, b) => a - b);
  const colors = ["#667f91", "#87b9df", "#6ad7c8", "#edc66d"];
  const bands = cuts.map((min, index) => {
    const upper = cuts[index + 1] ? cuts[index + 1] - 1 : max;
    return { id: String(min), min, max: upper, label: min === upper ? String(min) : `${min}–${upper}`, color: colors[Math.round(index * (colors.length - 1) / Math.max(1, cuts.length - 1))] };
  });
  bands.reverse();
  bands.push({ id: "0", min: 0, max: 0, label: "0", color: "#344e63" });
  return bands;
}
