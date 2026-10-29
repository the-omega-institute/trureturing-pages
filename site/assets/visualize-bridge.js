/* Pages integration for the independently published Visualize collection. */
(function () {
  'use strict';
  const runtime = window.TRV;
  if (!runtime) return;
  const base = new URL('../', document.currentScript.src);
  const requested = new URLSearchParams(location.search).get('lang');
  if (requested === 'zh-CN') runtime.setLang('zh');
  const home = document.querySelector('.hub .top .status');
  let atlas;
  if (home) {
    atlas = document.createElement('a');
    atlas.className = 'pill pages-atlas-link';
    home.prepend(atlas);
  }
  function updateHome() {
    if (!atlas) return;
    const url = new URL('../atlas.html', base);
    url.searchParams.set('lang', runtime.lang() === 'zh' ? 'zh-CN' : 'en');
    atlas.href = url.href;
    atlas.textContent = runtime.L('← 理论图谱', '← Atlas');
  }
  updateHome();
  runtime.onLang(updateHome);
  // Capture dynamic registry links as well as the visualization's return link.
  for (const event of ['click', 'auxclick']) document.addEventListener(event, e => {
    const anchor = e.target.closest?.('a[href]');
    if (!anchor) return;
    const url = new URL(anchor.href);
    if (url.origin === base.origin && url.pathname.startsWith(base.pathname)) {
      url.searchParams.set('lang', runtime.lang());
      anchor.href = url.href;
    }
  }, true);
})();
