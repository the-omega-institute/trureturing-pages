export const normalize = value => String(value).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function search(index, query) {
  const raw = query.trim();
  const identifier = raw.match(/^(?:(?:https?:\/\/)?oeis\.org\/|oeis\s*:?\s*)?(a\d{6})\/?$/i)?.[1]?.toUpperCase();
  if (identifier) return index.records.filter(r => r.identifiers?.oeis === identifier);
  const doi = raw.match(/^(?:(?:https?:\/\/)?(?:dx\.)?doi\.org\/|doi\s*:\s*)?(10\.\d{4,9}\/\S+)$/i)?.[1]?.toLowerCase();
  if (doi) return index.records.filter(r => r.identifiers?.doi === doi);
  const arxiv = raw.match(/^(?:(?:https?:\/\/)?arxiv\.org\/(?:abs|html|pdf)\/|arxiv\s*:\s*)(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?$/i)?.[1];
  if (arxiv) return index.records.filter(r => r.identifiers?.arxiv === arxiv);
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

// A bounded neighborhood keeps the first view legible; omitted neighbors remain in the full list.
export function neighborhood(index, id, limit = 30) {
  const records = new Map(index.records.map(r => [r.id, r]));
  const adjacent = new Map();
  for (const e of index.relations) for (const key of [e.source, e.target]) {
    if (!adjacent.has(key)) adjacent.set(key, []);
    adjacent.get(key).push(e);
  }
  const chosen = new Set(records.has(id) ? [id] : []), frontier = [id];
  for (let depth = 0; depth < 2; depth++) {
    const next = [];
    for (const key of frontier.splice(0)) for (const e of adjacent.get(key) || []) {
      const other = e.source === key ? e.target : e.source;
      if (records.has(other) && !chosen.has(other) && chosen.size < limit) {chosen.add(other); next.push(other);}
    }
    frontier.push(...next);
  }
  const immediate = new Set((adjacent.get(id) || []).flatMap(e => [e.source, e.target]));
  return {records: [...chosen].map(key => records.get(key)), relations: index.relations.filter(e => chosen.has(e.source) && chosen.has(e.target)),
    omitted: [...immediate].filter(key => !chosen.has(key)).length};
}
