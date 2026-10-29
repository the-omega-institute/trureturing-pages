/* trureturing-visualize · shared runtime (window.TRV)
   Small helpers every visualization uses: language switch, palette, canvas sizing, toast, glitch, theory drawer, seeded RNG.
   Load it in <head>, before any page script (src="../../assets/shell.js" from a viz page).
   It sets <html data-lang> immediately, so the paired .zh / .en fragments never flash both languages. */
(function () {
  'use strict';
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- language: ?lang= beats the remembered choice, which beats the browser language ---------- */
  const LANGS = ['zh', 'en'], KEY = 'trv-lang';
  function detectLang() {
    try { const q = new URLSearchParams(location.search).get('lang'); if (LANGS.includes(q)) return q; } catch (e) { /* ignore */ }
    try { const s = localStorage.getItem(KEY); if (LANGS.includes(s)) return s; } catch (e) { /* storage may be blocked */ }
    return /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
  }
  let lang = detectLang();
  const root = document.documentElement;
  root.dataset.lang = lang;
  const langListeners = [];
  /** Pick the string for the current language. */
  const L = (zh, en) => (lang === 'en' ? en : zh);
  function applyLang() {
    root.dataset.lang = lang;
    root.lang = lang === 'zh' ? 'zh-CN' : 'en';
    if (!root.dataset.titleZh) root.dataset.titleZh = document.title;
    const title = lang === 'en' ? root.dataset.titleEn : root.dataset.titleZh;
    if (title) document.title = title;
    document.querySelectorAll('[data-lang-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.langSet === lang)));
    document.querySelectorAll('[data-aria-en]').forEach((el) => {
      if (!el.dataset.ariaZh) el.dataset.ariaZh = el.getAttribute('aria-label') || '';
      el.setAttribute('aria-label', lang === 'en' ? el.dataset.ariaEn : el.dataset.ariaZh);
    });
  }
  function setLang(next) {
    if (!LANGS.includes(next) || next === lang) return;
    lang = next;
    try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
    try { const u = new URL(location.href); if (u.searchParams.has('lang')) { u.searchParams.set('lang', next); history.replaceState(null, '', u); } } catch (e) { /* ignore */ }
    applyLang();
    // a toast in the old language disappears at once instead of fading out over the new interface
    document.querySelectorAll('.toast').forEach((t) => { t.style.transition = 'none'; t.style.opacity = '0'; void t.offsetWidth; t.style.transition = ''; });
    langListeners.forEach((fn) => fn(lang));
  }
  document.addEventListener('DOMContentLoaded', () => {
    applyLang();
    document.querySelectorAll('[data-lang-set]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.langSet)));
  });

  /** CSS colours for 2D canvases; keep in step with the tokens in theme.css. */
  const palette = {
    ink: '#d4efff', dim: '#6f8ea5', faint: '#34506a',
    cyan: '#19f0ff', magenta: '#ff2fd0', amber: '#ffc83d',
    sigma: '#cfe3ff', ok: '#46ffb2', warn: '#ff5064'
  };
  /** Linear RGB triples for WebGL shaders. */
  const rgb = {
    cyan: [0.10, 0.94, 1.0], magenta: [1.0, 0.18, 0.82], sigma: [0.78, 0.88, 1.0],
    pre: [0.86, 0.93, 1.0], amber: [1.0, 0.78, 0.24], gray: [0.46, 0.56, 0.66]
  };
  const fonts = { data: '"JetBrains Mono", monospace', body: '"Noto Sans SC", sans-serif' };

  /** Match a canvas backing store to its CSS box; returns the device pixel ratio used. */
  function fitCanvas(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(10, Math.round(cv.clientWidth * dpr));
    const h = Math.max(10, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return dpr;
  }

  const toastTimers = new WeakMap();
  /** Show a transient message in a .toast element. */
  function toast(el, html, ms) {
    if (!el) return;
    el.innerHTML = html;
    el.style.opacity = '1';
    clearTimeout(toastTimers.get(el));
    toastTimers.set(el, setTimeout(() => { el.style.opacity = '0'; }, ms || 4200));
  }

  /** One glitch pulse on the .logo inside root. */
  function glitch(root) {
    if (reduceMotion || !root) return;
    root.classList.remove('glitching');
    void root.offsetWidth;
    root.classList.add('glitching');
  }
  function startGlitch(root, every) {
    glitch(root);
    if (!reduceMotion) setInterval(() => glitch(root), every || 9000);
  }

  /** Wire a theory drawer. Escape closes it; returns { isOpen, open, close }. */
  function drawer(opts) {
    const d = opts.drawer, openBtn = opts.open, closeBtn = opts.close;
    const api = {
      isOpen: () => !d.hidden,
      open: () => { d.hidden = false; if (closeBtn) closeBtn.focus(); },
      close: () => { d.hidden = true; if (openBtn) openBtn.focus(); }
    };
    if (openBtn) openBtn.addEventListener('click', api.open);
    if (closeBtn) closeBtn.addEventListener('click', api.close);
    d.addEventListener('click', (ev) => { if (ev.target === d) api.close(); });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && api.isOpen()) { ev.stopImmediatePropagation(); api.close(); }
    }, true);
    return api;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
  const smooth = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

  window.TRV = {
    reduceMotion, palette, rgb, fonts, fitCanvas, toast, glitch, startGlitch, drawer, mulberry32, gauss, smooth,
    L, lang: () => lang, setLang, onLang: (fn) => langListeners.push(fn)
  };
})();
