/* Index page: renders visualizations.json into cards (in the current language) and animates the hero's double-slit wave field. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const L = TRV.L;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (zh, en) => (TRV.lang() === 'en' && en ? en : zh);

  TRV.startGlitch($('app'), 11000);

  /* ---------- registry → cards ---------- */
  let registry = null, loadError = null;
  function card(v, featured) {
    const theory = (v.theory || []).map((t) => `<div><span class="k">THEORY</span><a href="${esc(t.href)}" target="_blank" rel="noopener">${esc(pick(t.label, t.label_en))}</a></div>`).join('');
    const lean = (v.lean || []).map((t) => `<div><span class="k ok">LEAN ✓</span><a href="${esc(t.href)}" target="_blank" rel="noopener"><code>${esc(t.label)}</code></a></div>`).join('');
    const tagList = TRV.lang() === 'en' && Array.isArray(v.tags_en) ? v.tags_en : (v.tags || []);
    const tags = tagList.map((t) => `<li>${esc(t)}</li>`).join('');
    const title = pick(v.title, v.title_en), second = TRV.lang() === 'en' ? v.title : v.title_en;
    return `<article class="card panel${featured ? ' featured' : ''}">
      <a class="thumb" href="${esc(v.path)}" tabindex="-1" aria-hidden="true">
        <img src="${esc(v.thumbnail)}" alt="" loading="lazy" width="1280" height="720">
        <span class="code">${esc(v.code)}</span>
      </a>
      <div class="body">
        <h3><a href="${esc(v.path)}">${esc(title)}</a></h3>
        ${second ? `<p class="en-title">${esc(second)}</p>` : ''}
        <p class="sum">${esc(pick(v.summary, v.summary_en))}</p>
        ${tags ? `<ul class="tags">${tags}</ul>` : ''}
        <div class="refs">${theory}${lean}</div>
        <div class="actions"><span class="date">ADDED ${esc(v.added)}</span><a class="chip enter" href="${esc(v.path)}">${L('进入 ENTER', 'ENTER')} ▸</a></div>
      </div>
    </article>`;
  }
  function render() {
    if (loadError) {
      const local = location.protocol === 'file:';
      $('grid').innerHTML = `<p class="note">${L('无法读取', 'Could not read')} <code>visualizations.json</code> (${esc(loadError)}). ${local
        ? L('直接打开本地文件时浏览器会拦截读取，请在仓库根目录运行 <code>node scripts/serve.mjs</code> 后访问提示的地址。', 'Browsers block this when the file is opened directly; run <code>node scripts/serve.mjs</code> in the repository and open the address it prints.')
        : L('请刷新页面重试。', 'Reload the page to try again.')}</p>`;
      return;
    }
    if (!registry) return;
    const live = (registry.visualizations || []).filter((v) => v.status === 'live');
    $('countLive').textContent = String(live.length);
    $('indexMeta').textContent = L(`${live.length} 个已发布 · 按登记顺序`, `${live.length} published · in registry order`);
    $('grid').innerHTML = live.length
      ? live.map((v, i) => card(v, i === 0)).join('')
      : `<p class="note">${L('注册表里还没有已发布的可视化。', 'No visualization has been published yet.')}</p>`;
  }
  fetch('visualizations.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((reg) => { registry = reg; render(); })
    .catch((err) => { loadError = err.message; render(); });
  TRV.onLang(render);

  /* ---------- hero field: plane wave through two slits, real part of the field ---------- */
  const cv = $('field');
  const W = 200, H = 76;
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const octx = off.getContext('2d');
  const img = octx.createImageData(W, H);
  const wallX = Math.round(W * 0.5), slitY = [H * 0.5 - 7, H * 0.5 + 7];
  const k = 0.62, omega = 2.2;
  let visible = true, last = 0;
  function draw(t) {
    const d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let f, env;
        if (x < wallX) {
          f = Math.cos(k * x - omega * t) * 0.55;
          env = 0.55;
        } else {
          const dx = x - wallX + 0.5;
          const r1 = Math.hypot(dx, y - slitY[0]), r2 = Math.hypot(dx, y - slitY[1]);
          f = (Math.cos(k * r1 - omega * t) / Math.sqrt(r1 + 2) + Math.cos(k * r2 - omega * t) / Math.sqrt(r2 + 2)) * 2.4;
          env = 1;
        }
        const wall = x === wallX && Math.abs(y - slitY[0]) > 1.5 && Math.abs(y - slitY[1]) > 1.5;
        const i = 4 * (y * W + x);
        if (wall) { d[i] = 31; d[i + 1] = 93; d[i + 2] = 124; d[i + 3] = 255; continue; }
        const a = Math.min(1, Math.abs(f)) * env;
        if (f >= 0) { d[i] = 25 * a; d[i + 1] = 240 * a; d[i + 2] = 255 * a; }
        else { d[i] = 255 * a * 0.85; d[i + 1] = 47 * a * 0.85; d[i + 2] = 208 * a * 0.85; }
        d[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    TRV.fitCanvas(cv);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#02040a'; ctx.fillRect(0, 0, cv.width, cv.height);
    const scale = Math.max(cv.width / W, cv.height / H);
    const dw = W * scale, dh = H * scale;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(off, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
    ctx.globalAlpha = 1;
  }
  function loop(ms) {
    if (visible && !document.hidden && ms - last > 33) { draw(ms / 1000); last = ms; }
    requestAnimationFrame(loop);
  }
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(cv);
  draw(0.8);
  if (!TRV.reduceMotion) requestAnimationFrame(loop);
  window.addEventListener('resize', () => draw(last / 1000 || 0.8));
})();
