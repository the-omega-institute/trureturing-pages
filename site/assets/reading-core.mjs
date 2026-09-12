const LEGACY = new Set(['rp','rq','ra','rk','rh','rs','rl','ro','rw','node','q']);
export function questionDestination(href, base) {
  const url = new URL(href, base), current = new URL(base);
  const hash = url.hash.slice(1);
  if (url.origin === current.origin && url.pathname.endsWith('/research.html') &&
      ([...new URLSearchParams(hash).keys()].some(k => LEGACY.has(k)) ||
       ['research-bank','research-release-dossiers','research-workbench'].includes(hash))) {
    url.pathname = url.pathname.replace(/research\.html$/, 'conjectures.html');
  }
  return url.href;
}
export function matchesQuery(text, query) {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean).every(word => text.toLowerCase().includes(word));
}
export function hashTarget(hash) {
  const aliases = {'next-questions':'research-directions', 'research-release-dossiers':'open-problems', 'research-bank':'research-directions', 'research-workbench':'research-directions'};
  const raw = hash.replace(/^#/, '');
  if (aliases[raw]) return aliases[raw];
  const question = new URLSearchParams(raw).get('rp');
  if (question && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(question)) return 'question-' + question;
  try { return decodeURIComponent(raw); } catch { return ''; }
}
