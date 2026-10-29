/* LEMNISCATE//AREA · Erdős 最小面积问题
   Unit sublevel sets Λₚ = {|p| < 1} of monic polynomials with roots in a compact set K. Two frozen refutations of Ghosh and
   Ramachandran (2026): on K = [−20, 20] the Fekete polynomial (z² − 400)(z² − 80) has larger area than (z² − 400)(z² − 100),
   and on K = closed unit disc ∪ {4} the competitors (zᴺ − 1)(z − 4)ᵏ make the minimal area decay faster than 1/n. Areas are
   computed numerically: with real roots each vertical slice of Λₚ is an interval, otherwise boundary radii are found in polar
   coordinates about each root. The 3D view is the surface log|p| over the plane. Depends on: assets/vendor/three.r128.min.js,
   assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, cyan: CY, magenta: MG } = TRV.palette;
const MODES = ['fekete', 'decay'];
const RUN = { fekete: 14, decay: 14 };
const RMIN = 0.8, RMAX = 20, KMIN = 2, KMAX = 8, CURVE = 81;
const CERT = { F: { outer: 97 / 1250000, inner: 217 / 1250000 }, G: { outer: 53 / 625000, inner: 849 / 5000000 }, Flower: 7231744e-14, Gupper: 7204616e-14 };   // radii and bounds of the Lean certificate (areas over π)
const rOf = (x) => RMIN * Math.pow(RMAX / RMIN, x), xOfR = (R) => Math.log(R / RMIN) / Math.log(RMAX / RMIN);

/* =====================================================================
   2. Areas of unit sublevel sets
   ===================================================================== */
function logAbsReal(roots, x, y = 0) { let s = 0; for (const a of roots) s += 0.5 * Math.log((x - a) * (x - a) + y * y); return s; }
function sliceHalfHeight(roots, x) {   // |p(x + iy)|² = Π((x − a)² + y²) grows with |y|: solve for the y where it reaches 1
  if (logAbsReal(roots, x) >= 0) return 0;
  let lo = 0, hi = 1; while (logAbsReal(roots, x, Math.sqrt(hi)) < 0) hi *= 4;
  for (let it = 0; it < 64; it++) { const mid = (lo + hi) / 2; if (logAbsReal(roots, x, Math.sqrt(mid)) < 0) lo = mid; else hi = mid; }
  return Math.sqrt(lo);
}
function realIntervals(roots) {   // the maximal real intervals where |p| < 1; one per component of Λₚ
  const r = roots.slice().sort((a, b) => a - b), out = [];
  const crossing = (a, b) => { let lo = a, hi = b; for (let it = 0; it < 200; it++) { const m = (lo + hi) / 2; if (logAbsReal(r, m) < 0) lo = m; else hi = m; } return (lo + hi) / 2; };
  let start = null;
  for (let k = 0; k < r.length; k++) {
    const a = r[k];
    if (start === null) { let b = a - 1; while (logAbsReal(r, b) < 0) b -= 1; start = crossing(a, b); }
    if (k === r.length - 1) { let b = a + 1; while (logAbsReal(r, b) < 0) b += 1; out.push([start, crossing(a, b)]); break; }
    const c = r[k + 1]; let lo = a + (c - a) / 400, hi = c - (c - a) / 400;
    for (let it = 0; it < 90; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (logAbsReal(r, m1) < logAbsReal(r, m2)) lo = m1; else hi = m2; }
    const peak = (lo + hi) / 2;   // log|p| is concave between consecutive real roots
    if (logAbsReal(r, peak) < 0) continue;
    out.push([start, crossing(a, peak)]); start = crossing(c, peak);
  }
  return out;
}
function areaReal(roots, n = 1024) {   // Simpson in θ with x = centre + half·sin θ, which absorbs the square-root ends
  const parts = [];
  for (const [x0, x1] of realIntervals(roots)) {
    const c = (x0 + x1) / 2, h = (x1 - x0) / 2; let s = 0;
    for (let i = 0; i <= n; i++) { const th = -Math.PI / 2 + Math.PI * i / n, w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2; s += w * 2 * sliceHalfHeight(roots, c + h * Math.sin(th)) * h * Math.cos(th); }
    parts.push({ x0, x1, area: s * (Math.PI / n) / 3 });
  }
  return { area: parts.reduce((t, p) => t + p.area, 0), parts };
}
function logAbsDecay(N, k, x, y) {   // log|(zᴺ − 1)(z − 4)ᵏ|
  let re = 1, im = 0; for (let i = 0; i < N; i++) [re, im] = [re * x - im * y, re * y + im * x];
  return 0.5 * Math.log((re - 1) * (re - 1) + im * im) + 0.5 * k * Math.log((x - 4) * (x - 4) + y * y);
}
function areaPolar(logAbs, centres, rmaxOf, nth = 128) {   // components star-shaped about their centres
  const parts = [];
  for (let c = 0; c < centres.length; c++) {
    const [cx, cy] = centres[c], rmax = rmaxOf(c); let s = 0; const radii = [];
    for (let j = 0; j < nth; j++) {
      const t = 2 * Math.PI * (j + 0.5) / nth, ct = Math.cos(t), st = Math.sin(t); let lo = 0, hi = rmax;
      for (let it = 0; it < 56; it++) { const m = (lo + hi) / 2; if (logAbs(cx + m * ct, cy + m * st) < 0) lo = m; else hi = m; }
      s += lo * lo / 2; radii.push(lo);
    }
    parts.push({ cx, cy, area: s * 2 * Math.PI / nth, radii });
  }
  return { area: parts.reduce((t, p) => t + p.area, 0), parts };
}
function decayArea(N, k) {
  const centres = Array.from({ length: N }, (_, j) => [Math.cos(2 * Math.PI * j / N), Math.sin(2 * Math.PI * j / N)]); centres.push([4, 0]);
  return areaPolar((x, y) => logAbsDecay(N, k, x, y), centres, (c) => (c < N ? Math.sin(Math.PI / N) : 1));
}

/* =====================================================================
   3. State and presets
   ===================================================================== */
const S = { mode: 'fekete', rx: 1, N: 10, Nauto: true, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'witness' };
const fracOfC = (R, c) => (c - 0.02 * R) / (0.98 * R), cOf = (R, f) => 0.02 * R + 0.98 * R * Math.min(1, Math.max(0, f));
const kOf = (f) => KMIN + Math.round(Math.min(1, Math.max(0, f)) * (KMAX - KMIN)), fracOfK = (k) => (k - KMIN) / (KMAX - KMIN);
const PRESETS = {
  witness: { mode: 'fekete', R: 20, frac: fracOfC(20, 10), play: false,
    zh: 'K = [−20, 20]、n = 4：Fekete 多项式 F 的根在 ±20、±√80，竞争者 G 把内根放在 ±10。两个水平集都是四个极小的圆盘（半径约 10⁻⁴），G 的总面积更小。Lean 用有理半径的圆盘夹住两边。已冻结。',
    en: 'K = [−20, 20], n = 4: the Fekete polynomial F has roots ±20, ±√80, and the competitor G puts its inner roots at ±10. Both sublevel sets are four tiny discs (radius about 10⁻⁴), and G’s total area is smaller. Lean squeezes both sides between discs of rational radius. Frozen.' },
  scan: { mode: 'fekete', R: 20, frac: 0, play: true,
    zh: '把竞争者的内根 c 从 0 移到 20：c = √80 ≈ 8.94 时竞争者就是 Fekete 本身；c 从这里往外一挪，面积立刻变小，c 在 √80 与约 12.2 之间都比 Fekete 小，最低处在 c ≈ 10.6，约为 Fekete 的 0.94 倍（页面数值）。',
    en: 'Move the competitor’s inner root c from 0 to 20: at c = √80 ≈ 8.94 the competitor is Fekete itself; moving c outwards from there lowers the area at once, every c between √80 and about 12.2 beats Fekete, and the lowest point is at c ≈ 10.6, about 0.94 of Fekete’s (page numerics).' },
  small: { mode: 'fekete', R: 2, frac: 0, play: true,
    zh: 'R = 2（区间的容量为 1）：水平集已经看得见。扫过 c，c 在 R/√5 ≈ 0.89 与约 1.19 之间的竞争者都比 Fekete 小，最低处约为 0.95 倍（页面数值）。',
    en: 'R = 2 (the interval has capacity 1): the sublevel sets are now visible. Sweeping c, every competitor with c between R/√5 ≈ 0.89 and about 1.19 beats Fekete, the best by a factor of about 0.95 (page numerics).' },
  one: { mode: 'fekete', R: 1.2, frac: 0, play: true,
    zh: 'R = 1.2：四个根的水平集连成一片。即便如此，把内根从 R/√5 往两端推，面积一路变小，推到 c = R（两个二重根）时只有 Fekete 的约 0.46 倍——Fekete 仍然不是最小（页面数值）。',
    en: 'R = 1.2: the sublevel set of the four roots is one piece. Even so, pushing the inner roots outwards from R/√5 keeps shrinking the area, down to about 0.46 of Fekete’s at c = R (two double roots); Fekete is still not minimal (page numerics).' },
  decay: { mode: 'decay', N: null, frac: 0, play: true,
    zh: 'K = 闭单位圆盘 ∪ {4}，超限直径为 1。时间轴把 k 从 2 加到 8，取 N = k² + 1：(zᴺ − 1)(z − 4)ᵏ 的面积急剧下降，Lean 证明的上界 20π·2⁻ᵏ 乘上 n = N + k 也趋于 0。已冻结。',
    en: 'K = the closed unit disc ∪ {4}, of transfinite diameter 1. The time axis raises k from 2 to 8 with N = k² + 1: the area of (zᴺ − 1)(z − 4)ᵏ drops sharply, and the Lean bound 20π·2⁻ᵏ times n = N + k also tends to 0. Frozen.' },
  petals: { mode: 'decay', N: null, frac: fracOfK(3), play: false,
    zh: 'N = 10、k = 3：单位圆附近的水平集是 10 片小花瓣，半径约 1/(N|ω − 4|ᵏ)，所以靠近 z = 1（离 4 最近）的花瓣最大，靠近 z = −1 的最小；它们都在环带 1 ± 2⁻³ 里（Lean 的包含关系）。',
    en: 'N = 10, k = 3: near the unit circle the sublevel set is 10 small petals of radius about 1/(N|ω − 4|ᵏ), so the petal near z = 1 (closest to 4) is the largest and the one near z = −1 the smallest; all lie in the annulus 1 ± 2⁻³ (the Lean containment).' },
  far: { mode: 'decay', N: null, frac: 1, play: false,
    zh: 'k = 8、N = 65：孤立点 4 处是 8 重根，它附近的水平集只是一个半径约 4^(−N/k) = 4^(−65/8) ≈ 1.3 × 10⁻⁵ 的小圆盘；正是这个远处的根把单位圆附近的花瓣压得极小。',
    en: 'k = 8, N = 65: the isolated point 4 is a root of multiplicity 8, and the sublevel set near it is a disc of radius about 4^(−N/k) = 4^(−65/8) ≈ 1.3 × 10⁻⁵; this distant root is what squeezes the petals near the unit circle.' },
  rate: { mode: 'decay', N: null, frac: 1, play: false,
    zh: '把 n·Aₙ 画在对数轴上：页面算出的面积与 Lean 的上界都比 1/n 和 1/log n 降得快，所以 Aₙ 不可能是 Θ(1/n)，也不可能是 Θ(1/log n)。',
    en: 'Plot n·Aₙ on a log scale: both the area computed on the page and the Lean bound fall faster than 1/n and 1/log n, so Aₙ can be neither Θ(1/n) nor Θ(1/log n).' }
};

/* =====================================================================
   4. The model
   ===================================================================== */
let MODEL = null, dirty = true;
const R_ = () => rOf(S.rx);
function build() {
  if (S.mode === 'fekete') {
    const R = R_(), u = R / Math.sqrt(5), F = [-R, -u, u, R], aF = areaReal(F, 1024), curve = [];
    for (let i = 0; i < CURVE; i++) { const c = cOf(R, i / (CURVE - 1)); curve.push([c, areaReal([-R, -c, c, R], 256).area]); }
    const best = curve.reduce((b, p) => (p[1] < b[1] ? p : b), curve[0]);
    MODEL = { mode: 'fekete', R, u, F, aF, curve, best, cache: new Map() };
  } else {
    const ks = []; for (let k = KMIN; k <= KMAX; k++) { const N = S.Nauto ? k * k + 1 : S.N, a = decayArea(N, k); ks.push({ k, N, n: N + k, area: a.area, parts: a.parts, bound: 20 * Math.PI * Math.pow(2, -k) }); }
    MODEL = { mode: 'decay', ks };
  }
}
function competitor(c) {   // area of (z² − R²)(z² − c²), cached by c
  const M = MODEL, key = c.toFixed(9); if (!M.cache.has(key)) M.cache.set(key, areaReal([-M.R, -c, c, M.R], 1024)); return M.cache.get(key);
}
function progress() {
  const M = MODEL, f = Math.min(1, Math.max(0, S.nowFrac));
  if (M.mode === 'fekete') { const c = cOf(M.R, f), G = [-M.R, -c, c, M.R], aG = competitor(c); return { f, c, G, aG, ratio: aG.area / M.aF.area }; }
  const k = kOf(f), d = M.ks[k - KMIN]; return { f, k, d };
}
const certOn = () => MODEL.mode === 'fekete' && Math.abs(MODEL.R - 20) < 1e-9;

/* =====================================================================
   5. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const sci = (v, d = 4) => (!isFinite(v) ? '—' : v === 0 ? '0' : Math.abs(v) >= 0.01 && Math.abs(v) < 1e4 ? v.toPrecision(d) : v.toExponential(d - 1));
const fmtR = (R) => (Math.abs(R - Math.round(R)) < 1e-9 ? String(Math.round(R)) : R.toFixed(2));

/* =====================================================================
   6. 3D scene: the surface log|p| over the plane
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 200000, PTS_MAX = 2000;
const CAMS = { iso: [0.35, 1.0, 15], front: [0.0001, 1.45, 15], top: [0.0001, 0.06, 14] };
const cam = { theta: 0.35, phi: 1.0, r: 15, tTheta: 0.35, tPhi: 1.0, tR: 15 };
const EVT_VS = `
attribute vec3 aColor; attribute float aAlpha; attribute float aSize;
uniform float uScale;
varying vec3 vCol; varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aAlpha < 0.004 ? 0.0 : uScale * aSize / max(0.1, -mv.z);
  vCol = aColor; vA = aAlpha;
}`;
const DOT_FS = `
varying vec3 vCol; varying float vA;
void main(){
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.35, r) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}`;
const additive = { transparent: true, depthWrite: false, depthTest: false, blending: window.THREE ? THREE.AdditiveBlending : 2 };
function dyn(g, name, n, size) { const a = new THREE.BufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; }
function initGL() {
  try { renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false, powerPreference: 'high-performance' }); } catch (err) { renderer = null; }
  if (!renderer || !window.THREE) {
    const d = document.createElement('div'); d.className = 'nogl';
    d.textContent = T('这个浏览器没有提供 WebGL，三维视图无法显示。下方的两张图和右侧读数仍然可用。', 'This browser does not provide WebGL, so the 3D view cannot be shown. The two charts below and the readouts still work.');
    stage.appendChild(d); return;
  }
  glOK = true;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x02040a, 1);
  scene3 = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
  const g = new THREE.BufferGeometry(); dyn(g, 'position', LINES_MAX, 3); dyn(g, 'color', LINES_MAX, 3);
  lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, ...additive })); lines.frustumCulled = false; scene3.add(lines);
  const gp = new THREE.BufferGeometry(); dyn(gp, 'position', PTS_MAX, 3); dyn(gp, 'aColor', PTS_MAX, 3); dyn(gp, 'aAlpha', PTS_MAX, 1); dyn(gp, 'aSize', PTS_MAX, 1);
  pts = new THREE.Points(gp, new THREE.ShaderMaterial({ vertexShader: EVT_VS, fragmentShader: DOT_FS, uniforms: { uScale: { value: 60 } }, ...additive }));
  pts.frustumCulled = false; scene3.add(pts);
}
const HMIN = -5, HMAX = 4, HS = 0.42;
function viewBox() {   // the plane region shown, in z-coordinates, and its map to the scene
  const M = MODEL;
  if (M.mode === 'fekete') { const xb = M.R * 1.12 + 0.6, yb = Math.max(0.8, M.R * 0.32); return { x0: -xb, x1: xb, y0: 0, y1: yb, sx: 12.5 / (2 * xb), sy: 4.2 / yb }; }
  return { x0: -1.7, x1: 4.7, y0: -1.7, y1: 1.7, sx: 12.5 / 6.4, sy: 4.2 / 3.4 };
}
function updateGL() {
  const M = MODEL, pr = progress(), V = viewBox();
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp[3 * v] = a[0]; Pp[3 * v + 1] = a[1]; Pp[3 * v + 2] = a[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; Pp[3 * v] = b[0]; Pp[3 * v + 1] = b[1]; Pp[3 * v + 2] = b[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  // each sheet: log|p| over a half plane (Fekete mode: F behind, G in front) or the whole plane (decay mode), with the roots
  const sheets = M.mode === 'fekete'
    ? [{ f: (x, y) => logAbsReal(M.F, x, y), roots: [...new Set(M.F)].map((a) => [a, 0]), side: -1, col: COL.cyan }, { f: (x, y) => logAbsReal(pr.G, x, y), roots: [...new Set(pr.G)].map((a) => [a, 0]), side: 1, col: COL.magenta }]
    : [{ f: (x, y) => logAbsDecay(pr.d.N, pr.d.k, x, y), roots: Array.from({ length: pr.d.N }, (_, j) => [Math.cos(2 * Math.PI * j / pr.d.N), Math.sin(2 * Math.PI * j / pr.d.N)]).concat([[4, 0]]), side: 0, col: COL.cyan }];
  const nx = 150, ny = M.mode === 'fekete' ? 14 : 52, dx = (V.x1 - V.x0) / nx;
  const X = (x) => (x - (V.x0 + V.x1) / 2) * V.sx;
  const Z = (y, side) => (side ? side * (Math.abs(y) * V.sy + 0.08) : y * V.sy);
  // heights: log|p| compressed by tanh on each side of 0, so |p| < 1 stays below the zero plane however large |p| gets
  const grids = sheets.map((S) => { const g = []; for (let i = 0; i <= nx; i++) { const row = []; for (let j = 0; j <= ny; j++) { const x = V.x0 + dx * i, y = V.y0 + (V.y1 - V.y0) * j / ny; row.push([x, y, S.f(x, y)]); } g.push(row); } return g; });
  const pos = grids.flat(2).map((p) => p[2]).filter((h) => h > 0).sort((a, b) => a - b), Sp = Math.max(2, pos.length ? pos[Math.floor(pos.length / 2)] : 2);
  const H = (h) => (h >= 0 ? HMAX * Math.tanh(h / Sp) : HMIN * Math.tanh(-h / -HMIN)) * HS;
  const P = (x, y, h, side) => [X(x), H(h), Z(y, side)];
  sheets.forEach((S, si) => {
    const g = grids[si], tone = (h, k) => (h < 0 ? [COL.amber, 1] : [S.col, k]);
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
      const [x, y, h] = g[i][j], [c, k] = tone(h, 0.3);
      if (i < nx && j % 2 === 0) { const q = g[i + 1][j]; seg(P(x, y, h, S.side), P(q[0], q[1], q[2], S.side), c, k); }
      if (j < ny && i % 3 === 0) { const q = g[i][j + 1]; seg(P(x, y, h, S.side), P(q[0], q[1], q[2], S.side), c, k * 0.8); }
    }
    // a finely sampled funnel about every root: radii from one grid cell down by factors of √10, until log|p| < HMIN − 1
    const nphi = S.side ? 8 : 16, span = S.side ? Math.PI : 2 * Math.PI;
    for (const [ax, ay] of S.roots) {
      const rings = [];
      for (let m = 0; m <= 26; m++) {
        const rho = dx * Math.pow(10, -m / 2), ring = [];
        for (let t = 0; t <= nphi; t++) { const ph = (S.side ? 0 : 0) + span * t / nphi, x = ax + rho * Math.cos(ph), y = ay + rho * Math.sin(ph); ring.push([x, y, S.f(x, S.side ? Math.abs(y) : y)]); }
        rings.push(ring);
        if (Math.max(...ring.map((p) => p[2])) < HMIN - 1) break;
      }
      rings.forEach((ring, m) => ring.forEach((p, t) => {
        const [c, k] = tone(p[2], 0.45);
        if (t < nphi) { const q = ring[t + 1]; seg(P(p[0], p[1], p[2], S.side), P(q[0], q[1], q[2], S.side), c, k); }
        if (m + 1 < rings.length) { const q = rings[m + 1][t]; seg(P(p[0], p[1], p[2], S.side), P(q[0], q[1], q[2], S.side), c, k); }
      }));
      dot([X(ax), HMIN * HS, Z(ay, S.side)], S.side < 0 ? COL.cyan : COL.magenta, 0.9, 1.2);
    }
  });
  if (M.mode === 'fekete') {
    for (let i = 0; i <= 20; i++) { const x = V.x0 + (V.x1 - V.x0) * i / 20; seg([X(x), 0, -((V.y1 - V.y0) * V.sy + 0.08)], [X(x), 0, (V.y1 - V.y0) * V.sy + 0.08], COL.amber, 0.12); }
    seg([X(V.x0), 0, 0], [X(V.x1), 0, 0], COL.amber, 0.5);
    seg([X(-M.R), 0.02, 0], [X(M.R), 0.02, 0], [1, 1, 1], 0.35);
  } else {
    for (let t = 0; t < 120; t++) { const a = 2 * Math.PI * t / 120, b = 2 * Math.PI * (t + 1) / 120; seg([X(Math.cos(a)), 0, Math.sin(a) * V.sy], [X(Math.cos(b)), 0, Math.sin(b) * V.sy], COL.amber, 0.45); }
    dot([X(4), HMIN * HS, 0], COL.amber, 1, 2.2);
  }
  lines.geometry.setDrawRange(0, v); Lb.position.needsUpdate = true; Lb.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 60 * renderer.getPixelRatio() * (stage.clientHeight / 600);
}

/* =====================================================================
   7. Camera
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.5 : 1);
  camera.position.set(r * sp * Math.sin(cam.theta), r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0, -0.6, 0);
}
function setCamPreset(name) {
  const p = CAMS[name]; if (!p) return;
  let d = (p[0] - cam.theta) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  cam.tTheta = cam.theta + d; cam.tPhi = p[1]; cam.tR = p[2];
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === name)));
}
const proj3 = (p) => { const q = new THREE.Vector3(p[0], p[1], p[2]).project(camera), rect = stage.getBoundingClientRect(); return { x: (q.x * 0.5 + 0.5) * rect.width, y: (-q.y * 0.5 + 0.5) * rect.height, z: q.z }; };
const drag = { x: 0, y: 0, pts: new Map(), pinch: 0 };
stage.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest('.chip')) return;
  stage.setPointerCapture(ev.pointerId);
  drag.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); drag.x = ev.clientX; drag.y = ev.clientY;
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()]; drag.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
});
stage.addEventListener('pointermove', (ev) => {
  if (!drag.pts.has(ev.pointerId)) return;
  drag.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(32, Math.max(7, cam.tR * drag.pinch / d)); drag.pinch = d; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY;
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => { if (!drag.pts.has(ev.pointerId)) return; drag.pts.delete(ev.pointerId); if (drag.pts.size === 0) drag.pinch = 0; };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(32, Math.max(7, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   8. Tags
   ===================================================================== */
const tagPool = [];
function tagAt(k, cls) { while (tagPool.length <= k) { const el = document.createElement('div'); el.className = 'tag raw'; tagsBox.appendChild(el); tagPool.push(el); } const el = tagPool[k]; el.className = 'tag raw ' + cls; return el; }
function placeTag(el, p) {
  if (!glOK) { el.style.display = 'none'; return; }
  const q = proj3(p); if (q.z > 1 || q.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const w = el.offsetWidth, W = stage.clientWidth, x = Math.min(W - w / 2 - 6, Math.max(w / 2 + 6, q.x));
  el.style.left = x + 'px'; el.style.top = q.y + 'px';
}
function updateTags() {
  const M = MODEL, pr = progress(), V = viewBox(); let k = 0;
  const X = (x) => (x - (V.x0 + V.x1) / 2) * V.sx;
  const put = (text, p, cls) => { const el = tagAt(k++, cls); el.textContent = text; placeTag(el, p); };
  if (M.mode === 'fekete') {
    put(`F · ±${fmtR(M.R)}, ±${M.u.toFixed(2)}`, [X(V.x1), HMAX * HS * 0.7, -(V.y1 - V.y0) * V.sy], 'cy');
    put(`G · ±${fmtR(M.R)}, ±${pr.c.toFixed(2)}`, [X(V.x1), HMAX * HS * 0.7, (V.y1 - V.y0) * V.sy], 'mg');
    put('log|p| = 0', [X(V.x0), 0.1, 0], 'hot');
  } else {
    put('|z| = 1', [X(0), 0.15, -V.sy - 0.2], 'hot');
    put(`4 · (z − 4)${'⁰¹²³⁴⁵⁶⁷⁸⁹'[pr.k]}`, [X(4), 0.4, 0], 'hot');
  }
  for (let i = k; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}

/* =====================================================================
   9. 2D panels
   ===================================================================== */
function frame2d(cv, pl0 = 46) {
  const dpr = fitCanvas(cv), ctx = cv.getContext('2d'), Wd = cv.width, Hh = cv.height;
  ctx.clearRect(0, 0, Wd, Hh);
  const pl = pl0 * dpr, pr = 12 * dpr, pt = 10 * dpr, pb = 20 * dpr;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  return { dpr, ctx, W: Wd, Hh, pl, pt, iw: Wd - pl - pr, ih: Hh - pt - pb };
}
function logAxis(F, lo, hi) { const { pt, ih } = F, a = Math.log10(lo), b = Math.log10(hi); return (v) => pt + ih - ih * (Math.log10(Math.max(v, lo)) - a) / (b - a); }
function drawMain() {
  const M = MODEL, F = frame2d(cv1, 54); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  const hline = (y, col, dash) => { ctx.strokeStyle = col; if (dash) ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(pl + iw, y); ctx.stroke(); ctx.setLineDash([]); };
  if (M.mode === 'fekete') {
    const vals = M.curve.map((p) => p[1] / Math.PI).concat([M.aF.area / Math.PI]), lo = Math.min(...vals) * 0.7, hi = Math.max(...vals) * 1.4, Y = logAxis(F, lo, hi), X = (c) => pl + iw * c / M.R;
    hline(Y(M.aF.area / Math.PI), CY, false); ctx.fillStyle = CY; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(T('Fekete', 'Fekete'), pl + 4 * dpr, Y(M.aF.area / Math.PI) - 2 * dpr);
    if (certOn()) { hline(Y(CERT.Flower), CY, true); hline(Y(CERT.Gupper), MG, true); }
    ctx.strokeStyle = MG; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); M.curve.forEach(([c, a], i) => { const x = X(c), y = Y(a / Math.PI); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); ctx.lineWidth = 1;
    ctx.strokeStyle = INK; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(X(pr.c), pt); ctx.lineTo(X(pr.c), pt + ih); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = MG; ctx.beginPath(); ctx.arc(X(pr.c), Y(pr.aG.area / Math.PI), 3.5 * dpr, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = CY; ctx.beginPath(); ctx.moveTo(X(M.u), pt + ih); ctx.lineTo(X(M.u), pt + ih - 6 * dpr); ctx.stroke();
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const c of [0, M.R / 4, M.R / 2, 3 * M.R / 4, M.R]) ctx.fillText(`c=${fmtR(c)}`, X(c), pt + ih + 3 * dpr);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(sci(hi, 2), pl - 3 * dpr, pt + 4 * dpr); ctx.fillText(sci(lo, 2), pl - 3 * dpr, pt + ih - 2 * dpr);
    $('c1Meta').textContent = T('品红 = G 的面积/π · 青线 = Fekete · 虚线 = Lean 的界', 'magenta = G’s area/π · cyan line = Fekete · dashes = the Lean bounds');
  } else {
    const ks = M.ks, nAll = ks.map((d) => d.n), Ys = ks.flatMap((d) => [d.n * d.area, d.n * d.bound]), lo = Math.min(...Ys) * 0.5, hi = Math.max(...Ys, 1) * 3, Y = logAxis(F, lo, hi);
    const X = (n) => pl + iw * (Math.log(n) - Math.log(nAll[0])) / (Math.log(nAll[nAll.length - 1]) - Math.log(nAll[0]));
    const ref = (fn, col) => { const c0 = ks[0].n * ks[0].bound / fn(ks[0].n); ctx.strokeStyle = col; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); for (let i = 0; i <= 60; i++) { const n = nAll[0] * Math.pow(nAll[nAll.length - 1] / nAll[0], i / 60), y = Y(n * c0 * fn(n)); if (i) ctx.lineTo(X(n), y); else ctx.moveTo(X(n), y); } ctx.stroke(); ctx.setLineDash([]); };
    ref((n) => 1 / n, DIM); ref((n) => 1 / Math.log(n), FAINT);
    const series = (key, col) => { ctx.strokeStyle = col; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); ks.forEach((d, i) => { const x = X(d.n), y = Y(d.n * d[key]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); ctx.lineWidth = 1; ks.forEach((d) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(d.n), Y(d.n * d[key]), (d.k === pr.k ? 4.2 : 2.6) * dpr, 0, 2 * Math.PI); ctx.fill(); }); };
    series('bound', AM); series('area', CY);
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ks.forEach((d) => ctx.fillText(`n=${d.n}`, X(d.n), pt + ih + 3 * dpr));
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(sci(hi, 2), pl - 3 * dpr, pt + 4 * dpr); ctx.fillText(sci(lo, 2), pl - 3 * dpr, pt + ih - 2 * dpr);
    $('c1Meta').textContent = T('n·Aₙ：琥珀 = Lean 上界 · 青 = 页面面积 · 虚线 = 1/n、1/log n 的趋势', 'n·Aₙ: amber = the Lean bound · cyan = page area · dashes = the 1/n and 1/log n trends');
  }
}
function drawSide() {   // the sublevel set magnified near the roots
  const M = MODEL, F = frame2d(cv2, 8); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  if (M.mode === 'fekete') {
    const boxes = [['F', M.F, M.aF, M.R, CERT.F.outer, CY], ['F', M.F, M.aF, M.u, CERT.F.inner, CY], ['G', pr.G, pr.aG, M.R, CERT.G.outer, MG], ['G', pr.G, pr.aG, pr.c, CERT.G.inner, MG]];
    const w = iw / 4;
    boxes.forEach(([nm, roots, ar, a, rc, col], b) => {
      const part = ar.parts.find((p) => p.x0 <= a + 1e-12 && p.x1 >= a - 1e-12) || ar.parts[0], half = Math.max(part.x1 - part.x0, 1e-12) * 0.62, cx = (part.x0 + part.x1) / 2;
      const x0 = pl + b * w + 4 * dpr, cw = w - 8 * dpr, s = Math.min(cw, ih - 26 * dpr) / (2 * half), ox = x0 + cw / 2, oy = pt + (ih - 26 * dpr) / 2;
      ctx.strokeStyle = FAINT; ctx.strokeRect(x0, pt, cw, ih - 26 * dpr);
      ctx.strokeStyle = col; ctx.lineWidth = 1.6 * dpr; ctx.beginPath();
      for (let i = 0; i <= 120; i++) { const th = -Math.PI / 2 + Math.PI * i / 120, x = (part.x0 + part.x1) / 2 + (part.x1 - part.x0) / 2 * Math.sin(th), y = sliceHalfHeight(roots, x), px = ox + (x - cx) * s, py = oy - y * s; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      for (let i = 120; i >= 0; i--) { const th = -Math.PI / 2 + Math.PI * i / 120, x = (part.x0 + part.x1) / 2 + (part.x1 - part.x0) / 2 * Math.sin(th), y = sliceHalfHeight(roots, x); ctx.lineTo(ox + (x - cx) * s, oy + y * s); }
      ctx.stroke(); ctx.lineWidth = 1;
      if (certOn() && (nm === 'F' || Math.abs(pr.c - 10) < 1e-6)) { ctx.strokeStyle = AM; ctx.setLineDash([3 * dpr, 2 * dpr]); ctx.beginPath(); ctx.arc(ox + (a - cx) * s, oy, rc * s, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ox + (a - cx) * s, oy, 2 * dpr, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(`${nm} · ${a.toFixed(2)}`, x0 + cw / 2, pt + ih - 24 * dpr); ctx.fillText(`${T('宽', 'w')} ${sci(part.x1 - part.x0, 2)}`, x0 + cw / 2, pt + ih - 12 * dpr);
    });
    $('c2Meta').textContent = certOn() ? T('琥珀虚线 = Lean 证书的圆盘（F 的在里面，G 的盖住）', 'amber dashes = the Lean certificate discs (inside F, covering G)') : T('每个根附近的水平集，按各自大小放大', 'the sublevel set near each root, each magnified to fit');
  } else {
    // every petal's largest radius against its argument (log scale), the first-order radius 1/(N|e^{iθ} − 4|^k), the Lean
    // half-width 2^(−k) of the annulus, and at the right the piece at 4 against the Lean radius 2^(−(k−2))
    const d = pr.d, band = Math.pow(2, -d.k), disc4 = Math.pow(2, -(d.k - 2)), rad = d.parts.map((p) => Math.max(...p.radii));
    const first = (t) => 1 / (d.N * Math.pow(Math.hypot(Math.cos(t) - 4, Math.sin(t)), d.k)), lo = Math.min(...rad, first(Math.PI)) / 3, hi = Math.max(band, disc4) * 3;
    const w4 = 64 * dpr, X = (t) => pl + 30 * dpr + (iw - 30 * dpr - w4) * t / (2 * Math.PI), Y = logAxis({ pt, ih: ih - 2 * dpr }, lo, hi), x4 = pl + iw - w4 / 2;
    const hl = (y, x0, x1, col) => { ctx.strokeStyle = col; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]); };
    hl(Y(band), X(0), X(2 * Math.PI), AM); hl(Y(disc4), x4 - w4 / 3, x4 + w4 / 3, AM);
    ctx.strokeStyle = FAINT; ctx.beginPath(); for (let i = 0; i <= 200; i++) { const t = 2 * Math.PI * i / 200; if (i) ctx.lineTo(X(t), Y(first(t))); else ctx.moveTo(X(t), Y(first(t))); } ctx.stroke();
    ctx.strokeStyle = CY; ctx.fillStyle = CY; ctx.lineWidth = 1.4 * dpr;
    rad.slice(0, d.N).forEach((r, j) => { const x = X(2 * Math.PI * j / d.N); ctx.beginPath(); ctx.moveTo(x, Y(lo)); ctx.lineTo(x, Y(r)); ctx.stroke(); ctx.beginPath(); ctx.arc(x, Y(r), 1.8 * dpr, 0, 2 * Math.PI); ctx.fill(); });
    ctx.strokeStyle = AM; ctx.fillStyle = AM; ctx.beginPath(); ctx.moveTo(x4, Y(lo)); ctx.lineTo(x4, Y(rad[d.N])); ctx.stroke(); ctx.beginPath(); ctx.arc(x4, Y(rad[d.N]), 2.4 * dpr, 0, 2 * Math.PI); ctx.fill();
    ctx.lineWidth = 1;
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ['0', 'π/2', 'π', '3π/2', '2π'].forEach((s, i) => ctx.fillText(s, X(i * Math.PI / 2), pt + ih + 3 * dpr)); ctx.fillText('4', x4, pt + ih + 3 * dpr);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(sci(hi, 1), pl, pt + 4 * dpr); ctx.fillText(sci(lo, 1), pl, pt + ih - 4 * dpr);
    ctx.fillStyle = AM; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('2⁻ᵏ', X(2 * Math.PI), Y(band) - 2 * dpr);
    $('c2Meta').textContent = T('每片花瓣的半径（对数纵轴）对辐角；淡线 = 1/(N|e^{iθ} − 4|ᵏ)；虚线 = Lean 环带的半宽 2⁻ᵏ；右端 = 4 附近的一片与 Lean 的半径 2⁻⁽ᵏ⁻²⁾', 'each petal’s radius (log scale) against its argument; faint line = 1/(N|e^{iθ} − 4|ᵏ); dashes = the Lean half-width 2⁻ᵏ of the annulus; right = the piece at 4 against the Lean radius 2⁻⁽ᵏ⁻²⁾');
  }
}

/* =====================================================================
   10. Readouts and controls
   ===================================================================== */
let syncedKey = '', toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function setRo(rows) { rows.forEach(([l, v], i) => { $(`ro${i + 1}L`).textContent = l; $(`ro${i + 1}`).textContent = v; }); }
function pill(id, label, value) { $(id).innerHTML = `${label} <strong>${value}</strong>`; }
function readouts() {
  const M = MODEL, pr = progress();
  if (M.mode === 'fekete') {
    const better = pr.aG.area < M.aF.area, cert = certOn() && Math.abs(pr.c - 10) < 1e-6;
    setRo([[T('R · Fekete 内根 R/√5 · 竞争者内根 c', 'R · Fekete inner root R/√5 · competitor inner root c'), `${fmtR(M.R)} · ${M.u.toFixed(4)} · ${pr.c.toFixed(4)}`],
      [T('面积/π：Fekete F · 竞争者 G', 'Area/π: Fekete F · competitor G'), `${sci(M.aF.area / Math.PI)} · ${sci(pr.aG.area / Math.PI)}`],
      [T('G / F · 曲线上最小的 c', 'G / F · the best c on the curve'), `${pr.ratio.toFixed(4)} · ${M.best[0].toFixed(3)}`],
      [T('Lean 证书（R = 20, c = 10）', 'Lean certificate (R = 20, c = 10)'), certOn() ? `F ≥ 7.231744e-8π · G ≤ 7.204616e-8π` : T('只在 R = 20 时有', 'only at R = 20')],
      [T('结论', 'Verdict'), cert ? T('G 的面积更小：Fekete 不是最小，冻结定理', 'G has smaller area: Fekete is not minimal, the frozen theorem') : better ? T('这个竞争者的面积更小（页面数值）', 'this competitor has smaller area (page numerics)') : T('这个竞争者的面积更大（页面数值）', 'this competitor has larger area (page numerics)')]]);
    pill('pillA', 'R', fmtR(M.R)); pill('pillB', 'c', pr.c.toFixed(2)); pill('pillC', 'G/F', pr.ratio.toFixed(3)); pill('pillD', T('分量', 'PIECES'), `${M.aF.parts.length}·${pr.aG.parts.length}`);
    $('roNote').innerHTML = M.aF.parts.length === 4 ? T('根相距很远时，每个根附近的水平集几乎是半径 1/|p′(a)| 的圆盘，面积约 π Σ 1/|p′(aₖ)|²。Fekete 点组最大化的是 Π|p′(aₖ)|，两者不是同一个目标。', 'With the roots far apart, the sublevel set near each root is almost a disc of radius 1/|p′(a)|, so the area is about π Σ 1/|p′(aₖ)|². A Fekete tuple maximizes Π|p′(aₖ)| instead; the two goals differ.')
      : T('水平集的分量连在一起了：面积由页面沿竖直截线数值积分。', 'The components of the sublevel set have merged: the page integrates the area along vertical slices.');
  } else {
    const d = pr.d, nA = d.n * d.area, nB = d.n * d.bound, lean = d.N === d.k * d.k + 1;
    setRo([[T('k · N · n = N + k', 'k · N · n = N + k'), `${d.k} · ${d.N} · ${d.n}`],
      [T('面积/π（页面数值）', 'Area/π (page numerics)'), sci(d.area / Math.PI)],
      [T('Lean 上界 20·2⁻ᵏ（面积/π）', 'Lean bound 20·2⁻ᵏ (area/π)'), sci(d.bound / Math.PI)],
      [T('n·面积 · n·上界', 'n·area · n·bound'), `${sci(nA)} · ${sci(nB)}`],
      [T('结论', 'Verdict'), lean ? T('Aₙ ≤ 20π·2⁻ᵏ，n·Aₙ → 0：既不是 Θ(1/n)，也不是 Θ(1/log n)，冻结定理', 'Aₙ ≤ 20π·2⁻ᵏ, n·Aₙ → 0: neither Θ(1/n) nor Θ(1/log n), the frozen theorem') : T('N 不是 k² + 1：只有页面数值', 'N is not k² + 1: page numerics only')]]);
    pill('pillA', 'k', String(d.k)); pill('pillB', 'n', String(d.n)); pill('pillC', 'n·A', sci(nA, 2)); pill('pillD', 'N', String(d.N));
    $('roNote').innerHTML = T('单位圆附近的花瓣在单位根 ω 处，半径约 1/(N|ω − 4|ᵏ)：孤立点 4 的 k 重根把每片花瓣的半径再除以 |ω − 4|ᵏ ≥ 3ᵏ。', 'The petals near the unit circle sit at the roots of unity ω with radius about 1/(N|ω − 4|ᵏ): the k-fold root at the isolated point 4 divides each petal’s radius by |ω − 4|ᵏ ≥ 3ᵏ.');
  }
}
const fieldsFor = { fekete: ['rField'], decay: ['nField'] };
function syncOutputs() {
  if (dirty) { build(); dirty = false; syncedKey = ''; toasted = false; }
  const M = MODEL, key = `${S.mode}|${S.nowFrac}|${TRV.lang()}`;
  if (key === syncedKey) return; syncedKey = key;
  const pr = progress();
  readouts();
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  for (const f of ['rField', 'nField']) $(f).hidden = !fieldsFor[S.mode].includes(f);
  $('rr').value = S.rx; $('oR').textContent = fmtR(R_());
  if (M.mode === 'decay') { $('nn').value = pr.d.N; $('oN').textContent = S.Nauto ? `${pr.d.N} = k² + 1` : String(pr.d.N); }
  $('presetNote').innerHTML = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = M.mode === 'fekete' ? T('时间轴 = 竞争者 (z² − R²)(z² − c²) 的内根 c，从 0 到 R；Fekete 的内根是 R/√5。', 'The time axis is the inner root c of the competitor (z² − R²)(z² − c²), from 0 to R; Fekete’s inner root is R/√5.')
    : T('时间轴 = k，从 2 到 8；N 默认取 k² + 1（Lean 用的选择），滑块可以改。', 'The time axis is k, from 2 to 8; N defaults to k² + 1 (the choice used in Lean) and the slider can change it.');
  $('litNote').innerHTML = T('曲面、面积与扫描都是页面现算的数值；冻结的是两个否定结论。', 'The surfaces, areas and scans are numbers computed on the page; what is frozen are the two negative answers.');
  $('c1Title').textContent = M.mode === 'fekete' ? T('竞争者的面积对内根 c（对数纵轴）', 'The competitor’s area against its inner root c (log scale)') : T('n·Aₙ 对 n（对数坐标）', 'n·Aₙ against n (log–log)');
  $('c2Title').textContent = M.mode === 'fekete' ? T('根附近的水平集 {|p| < 1}', 'The sublevel set {|p| < 1} near the roots') : T('花瓣半径对辐角', 'Petal radius against argument');
  $('clock').innerHTML = M.mode === 'fekete' ? `c ${pr.c.toFixed(2)}` : `k ${pr.k}`;
  $('hudBig').textContent = M.mode === 'fekete' ? T(`K = [−${fmtR(M.R)}, ${fmtR(M.R)}] · n = 4`, `K = [−${fmtR(M.R)}, ${fmtR(M.R)}] · n = 4`) : T(`K = 圆盘 ∪ {4} · k = ${pr.k}`, `K = disc ∪ {4} · k = ${pr.k}`);
  $('hudSub').textContent = M.mode === 'fekete' ? T('曲面 = log|p|（截在 −5 到 4）；后半 = Fekete F（青），前半 = 竞争者 G（品红）；琥珀 = 零平面以下，即 |p| < 1', 'surface = log|p| (clipped to −5 … 4); back half = Fekete F (cyan), front half = competitor G (magenta); amber = below the zero plane, i.e. |p| < 1')
    : T('曲面 = log|(zᴺ − 1)(z − 4)ᵏ|；琥珀 = |p| < 1；琥珀圆 = 单位圆；品红点 = 单位根', 'surface = log|(zᴺ − 1)(z − 4)ᵏ|; amber = |p| < 1; amber circle = the unit circle; magenta dots = roots of unity');
  if (!toasted && S.playing && S.nowFrac >= 1) {
    toasted = true;
    toast(M.mode === 'fekete' ? T(`<b>扫完</b>：最小面积在 c ≈ ${M.best[0].toFixed(2)}，是 Fekete 的 ${(M.best[1] / M.aF.area).toFixed(3)} 倍。`, `<b>Swept</b>: the smallest area is at c ≈ ${M.best[0].toFixed(2)}, ${(M.best[1] / M.aF.area).toFixed(3)} times Fekete’s.`)
      : T(`<b>k = 8</b>：n·面积 = ${sci(pr.d.n * pr.d.area, 3)}，n·上界 = ${sci(pr.d.n * pr.d.bound, 3)}。`, `<b>k = 8</b>: n·area = ${sci(pr.d.n * pr.d.area, 3)}, n·bound = ${sci(pr.d.n * pr.d.bound, 3)}.`));
  }
}
function syncRail() {
  const M = MODEL, key = `${S.mode}|${M.mode === 'fekete' ? M.R : 0}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  const marks = M.mode === 'fekete' ? [[0, 'c=0'], [fracOfC(M.R, M.u), 'R/√5'], [1, 'R']] : Array.from({ length: KMAX - KMIN + 1 }, (_, i) => [i / (KMAX - KMIN), `k=${KMIN + i}`]);
  $('marks').innerHTML = marks.map(([f, s], i) => `<i class="${i === 0 ? 'first' : i === marks.length - 1 ? 'last' : ''}" style="left:${(Math.min(1, Math.max(0, f)) * 100).toFixed(2)}%">${s}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => {
  const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'fekete'; if (S.mode === m) return; S.mode = m; S.nowFrac = 0; custom();
}));
$('rr').addEventListener('input', () => { S.rx = Math.min(1, Math.max(0, parseFloat($('rr').value))); custom(); });
$('nn').addEventListener('input', () => { S.N = Math.min(66, Math.max(2, Math.round(parseFloat($('nn').value)))); S.Nauto = false; custom(); });
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.mode = p.mode; if (p.R) S.rx = xOfR(p.R); if (p.mode === 'decay') { S.Nauto = p.N === null; if (p.N) S.N = p.N; }
  S.preset = name; markPreset(); dirty = true;
  S.nowFrac = p.frac; S.playing = !reduceMotion && p.play; S.dir = 1; setPlayUI(); $('now').value = S.nowFrac;
  TRV.glitch($('app'));
}
document.querySelectorAll('.preset').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));

$('now').addEventListener('input', () => { S.nowFrac = parseFloat($('now').value); S.hold = 0; });
let scrubbing = false;
$('now').addEventListener('pointerdown', () => { scrubbing = true; });
window.addEventListener('pointerup', () => { scrubbing = false; });
window.addEventListener('pointercancel', () => { scrubbing = false; });
function setPlayUI() { $('play').textContent = S.playing ? '❚❚' : '▶'; $('play').setAttribute('aria-pressed', String(S.playing)); $('rev').setAttribute('aria-pressed', String(S.dir < 0)); }
$('play').addEventListener('click', () => { S.playing = !S.playing; S.hold = 0; setPlayUI(); });
$('rev').addEventListener('click', () => { S.dir = -S.dir; S.playing = true; S.hold = 0; setPlayUI(); });
document.querySelectorAll('#speedChips .chip').forEach((b) => b.addEventListener('click', () => {
  S.speed = parseFloat(b.dataset.speed);
  document.querySelectorAll('#speedChips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
}));
const drawer = TRV.drawer({ drawer: $('drawer'), open: $('infoBtn'), close: $('drawerClose') });
const jumpTo = (f) => { S.playing = false; setPlayUI(); S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; };
document.addEventListener('keydown', (ev) => {
  if (ev.target && (ev.target.tagName === 'INPUT' && ev.target.type !== 'range')) return;
  if (drawer.isOpen()) return;
  if (ev.key === ' ' && !(ev.target && ev.target.tagName === 'BUTTON')) { ev.preventDefault(); S.playing = !S.playing; S.hold = 0; setPlayUI(); }
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) { ev.preventDefault(); jumpTo(S.nowFrac + (ev.key === 'ArrowRight' ? 1 : -1) * (MODEL.mode === 'decay' ? 1 / (KMAX - KMIN) : 0.01)); }
  else if (ev.key === 'e' || ev.key === 'E') jumpTo(1);
});

/* =====================================================================
   11. Main loop
   ===================================================================== */
let lastT = performance.now(), frameCount = 0;
function resize() {
  if (!glOK) return;
  const r = stage.getBoundingClientRect();
  renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
  camera.aspect = Math.max(0.2, r.width / Math.max(1, r.height)); camera.updateProjectionMatrix();
}
let glKey = '';
function frame(tms) {
  frameCount++;
  const dtSec = Math.min(0.1, (tms - lastT) / 1000); lastT = tms;
  if (dirty) syncOutputs();
  if (S.playing && !scrubbing) {
    if (S.hold > 0) { S.hold -= dtSec; if (S.hold <= 0) { S.nowFrac = S.dir > 0 ? 0 : 1; toasted = false; } }
    else {
      S.nowFrac += S.dir * dtSec * S.speed / RUN[MODEL.mode];
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 2.4; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.2; }
    }
    $('now').value = S.nowFrac;
  }
  syncOutputs(); syncRail();
  if (glOK) { updateCamera(dtSec); const pr = progress(), k = `${S.mode}|${MODEL.mode === 'fekete' ? MODEL.R + '|' + pr.c.toFixed(4) : pr.k + '|' + pr.d.N}`; if (k !== glKey) { updateGL(); glKey = k; } renderer.render(scene3, camera); updateTags(); }
  drawMain(); drawSide();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { syncedKey = ''; syncOutputs(); $('marks').dataset.key = ''; });

/* read-only probe for automated browser tests */
window.LE_DEBUG = {
  pending: () => dirty || syncedKey !== `${S.mode}|${S.nowFrac}|${TRV.lang()}`,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, pr = progress();
    if (M.mode === 'fekete') return { mode: M.mode, frac: S.nowFrac, R: M.R, u: M.u, c: pr.c, F: M.F, G: pr.G, areaF: M.aF.area, areaG: pr.aG.area, partsF: M.aF.parts, partsG: pr.aG.parts, curve: M.curve, best: M.best, cert: certOn() };
    return { mode: M.mode, frac: S.nowFrac, k: pr.k, N: pr.d.N, n: pr.d.n, area: pr.d.area, bound: pr.d.bound, ks: M.ks.map((d) => ({ k: d.k, N: d.N, n: d.n, area: d.area, bound: d.bound })), parts: pr.d.parts.map((p) => ({ cx: p.cx, cy: p.cy, area: p.area, radii: p.radii })) };
  },
  area: (roots) => areaReal(roots, 1024).area,
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('small'); S.playing = false; setPlayUI(); S.nowFrac = 0.55; $('now').value = S.nowFrac; setCamPreset('iso'); };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('witness');
setPlayUI();
requestAnimationFrame(frame);
})();
