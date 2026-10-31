// Parser-blocking on Research: resolve legacy question links before first paint.
(() => {
  if (globalThis.__researchRouteInstalled) return;
  globalThis.__researchRouteInstalled = true;
  const keys = new Set(['rp','rq','ra','rk','rh','rs','rl','ro','rw','node','q']);
  function route() {
    if (!/\/research(?:\.html)?$/.test(location.pathname)) return;
    let hash;
    try { hash = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const legacy = document.getElementById('legacy-result-ids');
    const resultIds = legacy ? JSON.parse(legacy.textContent) : [];
    if ([...new URLSearchParams(hash).keys()].some(k => keys.has(k)) ||
        hash === 'results' || hash === 'result-archive' || hash === 'resolved-questions' ||
        hash.startsWith('resolved-') || ['results-oeis','results-erdos','results-other'].includes(hash) || resultIds.includes(hash) ||
        ['research-bank','research-release-dossiers','research-workbench'].includes(hash)) {
      const url = new URL(location.href); url.pathname = url.pathname.replace(/research(?:\.html)?$/, 'conjectures');
      location.replace(url.href);
    }
  }
  route();
  // A legacy script near the beginning of the head may execute before the ID map.
  addEventListener('DOMContentLoaded', route);
  addEventListener('hashchange', route);
})();
