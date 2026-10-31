/** GitHub Pages serves these HTML documents at their extensionless paths. */
const PAGES = new Set([
  'index', 'atlas', 'atlas-explorer', 'research', 'conjectures', 'ranking',
  'evolution', 'evolution-structure', 'library-history', 'library-version',
  'contribute', 'discover', 'millennium', 'conclusions', 'dag', 'spaces',
  'version-status', 'open-math',
]);
const DEFAULT_ROOT = new URL('../', import.meta.url).href;

export function pageURL(href, root = DEFAULT_ROOT) {
  const scope = new URL(root), url = new URL(href, scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return url.href;
  const relative = url.pathname.slice(scope.pathname.length);
  const name = relative.replace(/\.html$/, '');
  if (PAGES.has(name) && !relative.includes('/')) {
    url.pathname = scope.pathname + (name === 'index' ? '' : name);
  }
  return url.href;
}

export function isPageURL(href, root = DEFAULT_ROOT) {
  const scope = new URL(root), url = new URL(href, scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return false;
  const relative = url.pathname.slice(scope.pathname.length);
  // Sources, downloads and API endpoints retain their literal resource URLs.
  if (/(?:^|\/)(?:assets|proofs|data|api\/v\d+)(?:\/|$)/.test(relative) || relative.startsWith('auth/')) return false;
  return /\/$/.test(url.pathname) || /\.html$/.test(relative) || PAGES.has(relative);
}
