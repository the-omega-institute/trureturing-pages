// Parser-blocking on Research: resolve legacy question links before first paint.
(() => {
  if (globalThis.__researchRouteInstalled) return;
  globalThis.__researchRouteInstalled = true;
  const keys = new Set(['rp','rq','ra','rk','rh','rs','rl','ro','rw','node','q']);
  function route() {
    if (!location.pathname.endsWith('/research.html')) return;
    const hash = location.hash.slice(1);
    if ([...new URLSearchParams(hash).keys()].some(k => keys.has(k)) ||
        ['research-bank','research-release-dossiers','research-workbench'].includes(hash)) {
      const url = new URL(location.href); url.pathname = url.pathname.replace(/research\.html$/, 'conjectures.html');
      location.replace(url.href);
    }
  }
  route();
  addEventListener('hashchange', route);
})();
