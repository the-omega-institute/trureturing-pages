export const normalize = value => String(value).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function search(index, query) {
  const raw = query.trim();
  const identifier = raw.match(/^(?:(?:https?:\/\/)?oeis\.org\/|oeis\s*:?\s*)?(a\d{6})\/?$/i)?.[1]?.toUpperCase();
  if (identifier) return index.records.filter(r => r.identifiers?.oeis === identifier);
  const terms = normalize(raw).split(' ').filter(Boolean);
  if (!terms.length) return index.records.filter(r => r.kind === 'topic');
  return index.records.map(record => {
    const name = normalize([record.title, ...(record.aliases || [])].join(' '));
    const body = normalize([name, record.summary, record.id].join(' '));
    return {record, score: terms.every(t => body.includes(t)) ? (terms.every(t => name.includes(t)) ? 2 : 1) : 0};
  }).filter(r => r.score).sort((a,b) => b.score - a.score || a.record.id.localeCompare(b.record.id)).map(r => r.record);
}
export function connections(index, id) {
  return index.relations.filter(edge => edge.source === id || edge.target === id).map(edge => ({...edge,
    neighbor:index.records.find(r => r.id === (edge.source === id ? edge.target : edge.source)), outgoing:edge.source === id}));
}
