// Weights come from the generated controls, which use the versioned Python policy.
export function assessmentScore(dimensions, weights) {
  const selected = Object.keys(weights);
  if (!selected.length) throw new Error('Select at least one dimension');
  let points = 0, covered = 0, total = 0;
  for (const key of selected) {
    const weight = weights[key]; total += weight;
    if (Object.hasOwn(dimensions, key)) {
      const level = dimensions[key].level;
      if (!Number.isInteger(level) || level < 0 || level > 4) throw new Error('Invalid assessment level');
      covered += weight; points += weight * level / 4;
    }
  }
  const round = value => Math.round(value * 100) / 100;
  return {score: covered === total ? round(points * 100 / total) : null,
    evidenced_score: round(points * 100 / total), coverage: round(covered * 100 / total),
    status: covered === total ? 'complete' : covered ? 'partial' : 'pending'};
}

export function compareAssessments(a, b) {
  const order = {complete: 0, partial: 1, pending: 2};
  return order[a.status] - order[b.status] || b.evidenced_score - a.evidenced_score
    || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
