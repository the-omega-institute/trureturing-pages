/* AURIC//PYRAMID · FIB-ATOM 金字塔 · 平均值看见什么、看不见什么
   Three positions (low x, middle z, high y) with xz = yz = 0 give five legal modes 0, 2, 3, 5, 25. The substitution tree
   α → β, β → ⟨β, α⟩ and the Fibonacci count of legal words; the pyramid {X, Y, Z ≥ 0, X + Z ≤ 1, Y + Z ≤ 1} of average
   occupancies with a Monte Carlo cloud; the hidden fibre κ = p₂₅ with its rescaled Fréchet interval, the base determinant
   Δ = rκ − XY and the product completion; and the gluing of windows along a path (Markov completion) against an odd cycle.
   Frozen Lean anchors and theory-volume results are named in the page text. Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, ok: OK, cyan: CY, magenta: MG } = TRV.palette;
const MODES = ['tree', 'pyramid', 'fiber', 'glue'];
const NLEV = 10, NCLOUD = 1600, NSAMPLES = 48;
const RUN = { tree: 16, pyramid: 14, fiber: 12, glue: 16 };
const MODE_KEYS = ['0', '2', '3', '5', '25'];
const VERT = { 0: [0, 0, 0], 2: [1, 0, 0], 3: [0, 0, 1], 5: [0, 1, 0], 25: [1, 1, 0] };   // (X, Y, Z): low end, high end, middle
const PRINTED = { 0: '000', 2: '100', 3: '010', 5: '001', 25: '101' };   // printed low – middle – high
const fib = (k) => { let a = 0, b = 1; for (let i = 0; i < k; i++) [a, b] = [b, a + b]; return a; };

/* =====================================================================
   2. The substitution tree and legal words
   ===================================================================== */
function treeT(n) { let a = 'a', b = 'b'; if (n === 0) return a; for (let k = 1; k < n; k++) [a, b] = [b, [b, a]]; return b; }   // T₀ = α, T₁ = β, T_{k+2} = ⟨T_{k+1}, T_k⟩
const leavesOf = (t) => (typeof t === 'string' ? t : leavesOf(t[0]) + leavesOf(t[1]));
function treeStats(n) {
  const t = treeT(n), s = leavesOf(t), A = [...s].filter((c) => c === 'a').length, B = s.length - A;
  return { tree: t, leaves: s, A, B, quantity: 2 * A + 3 * B };
}
function legalWords(n) {   // words of length n with no two adjacent 1s, printed position 0 first
  const out = []; for (let m = 0; m < 1 << n; m++) if ((m & (m >> 1)) === 0) out.push(Array.from({ length: n }, (_, i) => (m >> i) & 1).join(''));
  return out;
}

/* =====================================================================
   3. The pyramid and the hidden fibre
   ===================================================================== */
const insidePyramid = (X, Y, Z) => X >= -1e-12 && Y >= -1e-12 && Z >= -1e-12 && X + Z <= 1 + 1e-12 && Y + Z <= 1 + 1e-12;
function fiberAt(X, Y, Z, f) {   // the five-mode laws with means (X, Y, Z): κ = p₂₅ ranges over [max(0, X + Y − r), min(X, Y)]
  const r = 1 - Z, kLo = Math.max(0, X + Y - r), kHi = Math.min(X, Y), kappa = kLo + (kHi - kLo) * Math.min(1, Math.max(0, f));
  const p = [r - X - Y + kappa, X - kappa, Z, Y - kappa, kappa];   // order 0, 2, 3, 5, 25
  const delta = p[0] * p[4] - p[1] * p[3];
  return { r, kLo, kHi, kappa, p, width: kHi - kLo, delta, bound: r * r / 4, kStar: r > 0 ? X * Y / r : 0, condCov: r > 0 ? delta / (r * r) : null, cov: kappa - X * Y };
}

/* =====================================================================
   4. Gluing windows: paths and cycles
   ===================================================================== */
const isIndep = (m, n, cyc) => (m & (m >> 1)) === 0 && !(cyc && n > 2 && (m & 1) && ((m >> (n - 1)) & 1));
const popcount = (m) => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
function alphaOf(n, cyc) { let a = 0; for (let m = 0; m < 1 << n; m++) if (isIndep(m, n, cyc)) a = Math.max(a, popcount(m)); return a; }
function gluing(graph, n, t) {
  const cyc = graph === 'cycle', alpha = alphaOf(n, cyc), threshold = cyc ? alpha / n : 0.5, feasible = t <= threshold + 1e-12;
  const dist = new Map();
  if (feasible) {
    if (!cyc) {   // Markov completion: a chosen position is followed by an unchosen one; after an unchosen one choose with t/(1 − t)
      const q = t < 1 ? t / (1 - t) : 0;
      for (let m = 0; m < 1 << n; m++) {
        if (!isIndep(m, n, false)) continue;
        let pr = (m & 1) ? t : 1 - t;
        for (let i = 1; i < n && pr > 0; i++) { const prev = (m >> (i - 1)) & 1, cur = (m >> i) & 1; pr *= prev ? (cur ? 0 : 1) : (cur ? q : 1 - q); }
        if (pr > 0) dist.set(m, (dist.get(m) || 0) + pr);
      }
    } else {   // a uniform rotation of a largest independent set with probability λ = tn/α, otherwise the empty set
      const lam = alpha > 0 ? t * n / alpha : 0; let base = 0; for (let k = 0; k < alpha; k++) base |= 1 << (2 * k);
      for (let s = 0; s < n; s++) { const m = ((base << s) | (base >>> (n - s))) & ((1 << n) - 1); dist.set(m, (dist.get(m) || 0) + lam / n); }
      if (lam < 1) dist.set(0, (dist.get(0) || 0) + 1 - lam);
    }
  }
  const entries = [...dist.entries()].filter(([, p]) => p > 1e-15).sort((a, b) => a[0] - b[0]);
  const marg = Array.from({ length: n }, (_, i) => entries.reduce((s, [m, p]) => s + (((m >> i) & 1) ? p : 0), 0));
  return { cyc, n, t, alpha, threshold, feasible, entries, marg };
}

/* =====================================================================
   5. State and presets
   ===================================================================== */
const S = { mode: 'pyramid', u: 0.5, v: 0.5, z: 0, graph: 'path', n: 7, seed: 1, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'slice' };
const PRESETS = {
  tree: { mode: 'tree', frac: 0, play: true,
    zh: '替换 α → β、β → ⟨β, α⟩ 一层层展开：叶子数、α 与 β 的个数都是斐波那契数，按“α 记 2、β 记 3”读出的数量是 F(n + 3)。右图同时数长 n 的合法位串，恰为 F(n + 2)。',
    en: 'Unfold the substitution α → β, β → ⟨β, α⟩ level by level: the numbers of leaves, of α and of β are Fibonacci numbers, and the quantity read as “α counts 2, β counts 3” is F(n + 3). The side chart counts the legal words of length n, exactly F(n + 2).' },
  five: { mode: 'tree', frac: 0.3, play: false,
    zh: 'n = 3：没有两个相邻 1 的三位串恰有 F(5) = 5 个——000、100、010、001、101，正是五种模式 0、2、3、5、25（印刷次序：低端、中间、高端）。',
    en: 'n = 3: there are exactly F(5) = 5 three-letter words with no two adjacent 1s, namely 000, 100, 010, 001, 101, which are the five modes 0, 2, 3, 5, 25 (printed low end, middle, high end).' },
  slice: { mode: 'pyramid', u: 0.5, v: 0.5, frac: 0, play: true,
    zh: '把截面从底面推到顶点：高度 Z 处是边长 1 − Z 的正方形，体积累计到 1/3。立方体里随机撒的点，落在金字塔里的约占三分之一（蒙特卡罗）。',
    en: 'Push the slice from the base to the apex: at height Z it is a square of side 1 − Z, and the volume adds up to 1/3. Of the points scattered at random in the cube, about a third land in the pyramid (Monte Carlo).' },
  same: { mode: 'fiber', u: 0.5, v: 0.5, z: 0, frac: 0, play: true,
    zh: '平均点 (½, ½, 0) 不变，隐藏量 κ 从 0 走到 ½：分布从“只低端与只高端各半”连续变到“全空与两端都选各半”。平均值完全看不出这条差别。',
    en: 'Keep the average point (½, ½, 0) fixed and move the hidden quantity κ from 0 to ½: the law changes continuously from “low end only and high end only, half each” to “empty and both ends, half each”. The averages cannot see this difference at all.' },
  uniform: { mode: 'fiber', u: 0.5, v: 0.5, z: 0.2, frac: 0.5, play: false,
    zh: '五种模式各 1/5：平均点 (2/5, 2/5, 1/5)，κ = 1/5 正是乘积补全 κ* = XY/r，此时 Δ = 0（中间空着时两端独立），但整体协方差仍是 XYZ/r = 1/25。',
    en: 'Each mode with probability 1/5: the average point is (2/5, 2/5, 1/5), and κ = 1/5 is exactly the product completion κ* = XY/r, so Δ = 0 (the ends independent when the middle is empty), yet the overall covariance is still XYZ/r = 1/25.' },
  face: { mode: 'fiber', u: 0, v: 0.6, z: 0.3, frac: 0, play: false,
    zh: '点在侧面 X = 0 上：低端从不被选，κ 只能是 0，区间宽度为零——平均值唯一决定了整个分布。四个三角侧面都是这样。',
    en: 'A point on the side face X = 0: the low end is never chosen, κ must be 0 and the interval has width zero, so the averages determine the whole law. All four triangular side faces behave this way.' },
  path: { mode: 'glue', graph: 'path', n: 7, frac: 0, play: true,
    zh: '七个位置排成路径，每个位置的占用 t 从 0 加到 ½：只要相邻约束 2t ≤ 1 成立就能实现（已冻结）。页面用 Markov 拼接构造分布并抽样。',
    en: 'Seven positions in a path, every occupancy t rising from 0 to ½: it is achievable as long as the neighbour constraint 2t ≤ 1 holds (frozen). The page builds the law by Markov gluing and samples from it.' },
  odd: { mode: 'glue', graph: 'cycle', n: 5, frac: 0, play: true,
    zh: '五个位置连成环：每条边的约束一直满足，但 t 超过 2/5 就不可实现——任何选法最多两个点，平均和至多 2。到 t = ½ 时，局部全对，整体失败。',
    en: 'Five positions joined in a cycle: every edge constraint keeps holding, but beyond t = 2/5 the occupancies cannot be realized, because any choice has at most two positions and the average sum is at most 2. At t = ½ every local check passes and the whole fails.' }
};

/* =====================================================================
   6. The model
   ===================================================================== */
let MODEL = null, dirty = true;
function build() {
  const M = { mode: S.mode };
  if (S.mode === 'tree') M.stats = Array.from({ length: NLEV + 1 }, (_, n) => { const s = treeStats(n); return { n, leaves: s.leaves.length, A: s.A, B: s.B, quantity: s.quantity, words: legalWords(n).length }; });
  if (S.mode === 'pyramid') {
    const rng = TRV.mulberry32(S.seed * 7919 + 11);
    M.cloud = Array.from({ length: NCLOUD }, () => { const X = rng(), Y = rng(), Z = rng(); return [X, Y, Z, insidePyramid(X, Y, Z)]; });
    M.cloudInside = M.cloud.filter((c) => c[3]).length;
  }
  if (S.mode === 'glue') { M.rng = TRV.mulberry32(S.seed * 104729 + S.n * 31 + (S.graph === 'cycle' ? 7 : 0)); M.samples = []; M.sampleKey = null; M.cum = null; }
  MODEL = M;
}
function progress() {
  const M = MODEL, f = Math.min(1, Math.max(0, S.nowFrac));
  if (M.mode === 'tree') { const n = Math.round(f * NLEV); return { n, ...treeStats(n), words: legalWords(n) }; }
  if (M.mode === 'pyramid') { const Z = f, X = S.u * (1 - Z), Y = S.v * (1 - Z); return { X, Y, Z, inside: insidePyramid(X, Y, Z), sliceArea: (1 - Z) ** 2, volBelow: (1 - (1 - Z) ** 3) / 3 }; }
  if (M.mode === 'fiber') { const Z = S.z, X = S.u * (1 - Z), Y = S.v * (1 - Z); return { X, Y, Z, f, ...fiberAt(X, Y, Z, f) }; }
  return gluing(S.graph, S.n, 0.5 * f);
}
function drawSample(G) {   // one configuration from the constructed law
  let x = MODEL.rng(), acc = 0; for (const [m, p] of G.entries) { acc += p; if (x <= acc) return m; } return G.entries.length ? G.entries[G.entries.length - 1][0] : 0;
}

/* =====================================================================
   7. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const num = (v, d = 4) => (v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(d));
const z0 = (v) => (Math.abs(v) < 1e-12 ? 0 : v);
const MODE_CSS = { 0: INK, 2: CY, 3: AM, 5: MG, 25: OK };
const MODE_RGB = { 0: [0.85, 0.9, 1], 2: COL.cyan, 3: COL.amber, 5: COL.magenta, 25: [0.27, 1, 0.7] };

/* =====================================================================
   8. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 20000, PTS_MAX = NCLOUD + 400;
const CAMS = { iso: [0.75, 1.1, 15], front: [0.0001, 1.5, 14], top: [0.0001, 0.06, 14] };
const cam = { theta: 0.75, phi: 1.1, r: 14, tTheta: 0.75, tPhi: 1.1, tR: 14 };
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
const SC = 5;
const W3 = (X, Y, Z) => [(X - 0.5) * SC, Z * SC - 2.1, (Y - 0.5) * SC];   // (X, Y, Z) → scene, Z up
const PYR_EDGES = [[0, 2], [2, 25], [25, 5], [5, 0], [0, 3], [2, 3], [25, 3], [5, 3]];
function treeLayout(t) {   // leaves left to right, internal nodes above the middle of their children
  const nodes = [], edges = []; let leafIdx = 0;
  const walk = (s, depth) => {
    if (typeof s === 'string') { const id = nodes.length; nodes.push({ x: leafIdx++, depth, leaf: s }); return id; }
    const id = nodes.length; nodes.push({ x: 0, depth, leaf: null });
    const a = walk(s[0], depth + 1), b = walk(s[1], depth + 1); nodes[id].x = (nodes[a].x + nodes[b].x) / 2; edges.push([id, a], [id, b]); return id;
  };
  walk(t, 0);
  return { nodes, edges, nLeaves: leafIdx, depth: Math.max(...nodes.map((d) => d.depth)) };
}
function glueLayout(G) {
  const n = G.n; return Array.from({ length: n }, (_, i) => G.cyc ? [2.8 * Math.cos(2 * Math.PI * i / n - Math.PI / 2), -1.6, 2.8 * Math.sin(2 * Math.PI * i / n - Math.PI / 2)] : [-4.8 + 9.6 * i / Math.max(1, n - 1), -1.6, 0]);
}
function updateGL() {
  const M = MODEL, pr = progress();
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp[3 * v] = a[0]; Pp[3 * v + 1] = a[1]; Pp[3 * v + 2] = a[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; Pp[3 * v] = b[0]; Pp[3 * v + 1] = b[1]; Pp[3 * v + 2] = b[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  const pyramid = (k) => { for (const [a, b] of PYR_EDGES) seg(W3(...VERT[a]), W3(...VERT[b]), COL.gray, k); };
  if (M.mode === 'tree') {
    const L = treeLayout(pr.tree), w = Math.max(1, L.nLeaves - 1), dy = 5.2 / Math.max(1, L.depth), P = (d) => [-5 + 10 * d.x / w, 2.8 - d.depth * dy, 0];
    for (const [a, b] of L.edges) seg(P(L.nodes[a]), P(L.nodes[b]), COL.gray, 0.55);
    for (const d of L.nodes) if (d.leaf) dot(P(d), d.leaf === 'a' ? COL.cyan : COL.magenta, 1, L.nLeaves > 40 ? 1.1 : 2.2); else dot(P(d), COL.gray, 0.7, 0.8);
  } else if (M.mode === 'pyramid') {
    pyramid(0.75);
    const Z = pr.Z, s = 1 - Z; const sq = [[0, 0], [s, 0], [s, s], [0, s]];
    for (let i = 0; i < 4; i++) seg(W3(sq[i][0], sq[i][1], Z), W3(sq[(i + 1) % 4][0], sq[(i + 1) % 4][1], Z), COL.amber, 0.9);
    for (const [X, Y, Zc, inn] of M.cloud) { const near = Math.abs(Zc - Z) < 0.04; dot(W3(X, Y, Zc), inn ? COL.cyan : COL.magenta, inn ? (near ? 1 : 0.55) : (near ? 0.6 : 0.16), near ? 1.1 : 0.7); }
    dot(W3(pr.X, pr.Y, pr.Z), [1, 1, 1], 1, 1.4);
    for (const k of MODE_KEYS) dot(W3(...VERT[k]), MODE_RGB[k], 1, 2);
  } else if (M.mode === 'fiber') {
    pyramid(0.6);
    const P = W3(pr.X, pr.Y, pr.Z);
    MODE_KEYS.forEach((k, i) => { const w = pr.p[i]; seg(P, W3(...VERT[k]), MODE_RGB[k], 0.15 + 0.85 * Math.min(1, w * 2)); dot(W3(...VERT[k]), MODE_RGB[k], 0.3 + 0.7 * Math.min(1, w * 2), 0.9 + 6 * Math.sqrt(w)); });
    seg(W3(...VERT[0]), W3(...VERT[25]), COL.amber, 0.25 + 0.6 * Math.min(1, (pr.p[0] + pr.p[4]) * 1.5));   // the square relation v₀ + v₂₅ = v₂ + v₅
    seg(W3(...VERT[2]), W3(...VERT[5]), COL.cyan, 0.25 + 0.6 * Math.min(1, (pr.p[1] + pr.p[3]) * 1.5));
    dot(P, [1, 1, 1], 1, 1.5);
  } else {
    const G = pr, pos = glueLayout(G), last = M.samples.length ? M.samples[M.samples.length - 1] : 0;
    for (let i = 0; i < G.n - 1 + (G.cyc ? 1 : 0); i++) seg(pos[i], pos[(i + 1) % G.n], COL.gray, 0.6);
    for (let i = 0; i < G.n; i++) {
      const h = 3.2 * G.t / 0.5, col = G.feasible ? COL.cyan : COL.magenta, b = pos[i];
      for (const o of [-0.08, 0, 0.08]) seg([b[0] + o, b[1], b[2]], [b[0] + o, b[1] + h, b[2]], col, o ? 0.5 : 0.95);
      dot([b[0], b[1] + h, b[2]], col, 1, 0.7);
      dot(b, G.feasible && ((last >> i) & 1) ? COL.amber : COL.gray, G.feasible && ((last >> i) & 1) ? 1 : 0.5, G.feasible && ((last >> i) & 1) ? 1.6 : 0.8);
    }
  }
  lines.geometry.setDrawRange(0, v); Lb.position.needsUpdate = true; Lb.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 60 * renderer.getPixelRatio() * (stage.clientHeight / 600);
}

/* =====================================================================
   9. Camera
   ===================================================================== */
let camName = 'iso';
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.5 : 1);
  camera.position.set(r * sp * Math.sin(cam.theta), 0.4 + r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0, 0.4, 0);
}
function setCamPreset(name) {
  const p = CAMS[name]; if (!p) return; camName = name;
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
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(30, Math.max(7, cam.tR * drag.pinch / d)); drag.pinch = d; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY;
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => { if (!drag.pts.has(ev.pointerId)) return; drag.pts.delete(ev.pointerId); if (drag.pts.size === 0) drag.pinch = 0; };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(30, Math.max(7, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   10. Tags
   ===================================================================== */
const tagPool = [];
function tagAt(k, cls) { while (tagPool.length <= k) { const el = document.createElement('div'); el.className = 'tag raw'; tagsBox.appendChild(el); tagPool.push(el); } const el = tagPool[k]; el.className = 'tag raw ' + cls; return el; }
function placeTag(el, p, show = true) {
  if (!glOK || !show) { el.style.display = 'none'; return; }
  const q = proj3(p); if (q.z > 1 || q.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const w = el.offsetWidth, W = stage.clientWidth, x = Math.min(W - w / 2 - 6, Math.max(w / 2 + 6, q.x));
  el.style.left = x + 'px'; el.style.top = q.y + 'px';
}
function updateTags() {
  const M = MODEL, pr = progress(); let k = 0;
  const put = (text, p, cls) => { const el = tagAt(k++, cls); el.textContent = text; placeTag(el, p); };
  if (M.mode === 'tree') {
    put(`T${pr.n}`, [0, 3.35, 0], 'hot'); put(T(`${pr.leaves.length} 片叶子`, `${pr.leaves.length} leaves`), [0, -3, 0], '');
    if (pr.leaves.length <= 21) { const L = treeLayout(pr.tree), w = Math.max(1, L.nLeaves - 1), dy = 5.2 / Math.max(1, L.depth); for (const d of L.nodes) if (d.leaf) put(d.leaf === 'a' ? 'α' : 'β', [-5 + 10 * d.x / w, 2.8 - d.depth * dy - 0.42, 0], d.leaf === 'a' ? 'cy' : 'mg'); }
  }
  else if (M.mode === 'pyramid' || M.mode === 'fiber') {
    const off = { 0: [-0.1, 0.06, -0.1], 2: [0.16, 0, -0.16], 5: [-0.16, 0, 0.16], 25: [0.18, 0.05, -0.14], 3: [0.12, -0.02, -0.12] };   // [dX, dZ, dY]
    for (const key of MODE_KEYS) { const q = VERT[key], o = off[key]; put(`[${key === '0' ? 'null' : key}] ${PRINTED[key]}`, W3(q[0] + o[0], q[1] + o[2], q[2] + o[1]), key === '3' ? 'hot' : ''); }
    if (M.mode === 'pyramid') put(`Z = ${num(pr.Z, 2)}`, W3(1.05, -0.1, pr.Z), 'cy');
    else put(`κ = ${num(pr.kappa, 3)}`, W3(pr.X, pr.Y, pr.Z + 0.12), 'cy');
  } else {
    const pos = glueLayout(pr); pos.forEach((b, i) => { if (pr.n <= 11) put(String(i + 1), [b[0], b[1] - 0.45, b[2]], ''); });
    put(pr.cyc ? `C${pr.n}` : `P${pr.n}`, pr.cyc ? [0, 0.4, 0] : [0, 2.2, 0], 'hot');
  }
  for (let i = k; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}

/* =====================================================================
   11. 2D panels
   ===================================================================== */
function frame2d(cv, pl0 = 46) {
  const dpr = fitCanvas(cv), ctx = cv.getContext('2d'), Wd = cv.width, Hh = cv.height;
  ctx.clearRect(0, 0, Wd, Hh);
  const pl = pl0 * dpr, pr = 12 * dpr, pt = 10 * dpr, pb = 20 * dpr;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  return { dpr, ctx, W: Wd, Hh, pl, pt, iw: Wd - pl - pr, ih: Hh - pt - pb };
}
const yTicks = (ctx, dpr, pl, Y, vals, fmt) => { ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of vals) ctx.fillText(fmt(g), pl - 4 * dpr, Y(g)); };
const xTicks = (ctx, dpr, pt, ih, X, vals, fmt) => { ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const g of vals) ctx.fillText(fmt(g), X(g), pt + ih + 3 * dpr); };
const vline = (ctx, x, pt, ih, col, dpr) => { ctx.strokeStyle = col; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + ih); ctx.stroke(); ctx.setLineDash([]); };
function squareBox(F) { const { pl, pt, iw, ih } = F, side = Math.min(iw, ih); return { x0: pl + (iw - side) / 2, y0: pt, side }; }
function drawMain() {
  const M = MODEL, F = frame2d(cv1); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  if (M.mode === 'tree') {
    const st = M.stats, top = Math.log10(Math.max(...st.map((s) => s.quantity)) * 1.3) + 0.3, X = (n) => pl + (n + 0.5) / (NLEV + 1) * iw, Y = (v) => pt + ih - (Math.log10(v) + 0.3) / top * ih, bw = iw / (NLEV + 1) / 4;
    yTicks(ctx, dpr, pl, Y, [1, 10, 100], String); xTicks(ctx, dpr, pt, ih, X, st.map((s) => s.n), (n) => `n=${n}`);
    st.forEach((s) => { [[s.leaves, CY], [s.words, OK], [s.quantity, AM]].forEach(([val, col], j) => { ctx.fillStyle = col; ctx.globalAlpha = s.n <= pr.n ? 0.85 : 0.25; ctx.fillRect(X(s.n) + (j - 1.5) * bw, Y(val), bw * 0.9, pt + ih - Y(val)); }); });
    ctx.globalAlpha = 1; vline(ctx, X(pr.n), pt, ih, AM, dpr);
    $('c1Title').textContent = T('每一层：叶子数 F(n + 1)（青）、长 n 的合法位串 F(n + 2)（绿）、数量读数 F(n + 3)（琥珀）', 'PER LEVEL: LEAVES F(n + 1) (CYAN), LEGAL WORDS OF LENGTH n F(n + 2) (GREEN), QUANTITY F(n + 3) (AMBER)');
    $('c1Meta').textContent = T('对数纵轴；三条斐波那契数列错开一位', 'log scale; three Fibonacci sequences, shifted by one');
  } else if (M.mode === 'pyramid') {
    const B = squareBox(F), P = (x, y) => [B.x0 + x * B.side, B.y0 + B.side - y * B.side], s = 1 - pr.Z;
    ctx.strokeStyle = FAINT; ctx.strokeRect(B.x0, B.y0, B.side, B.side);
    ctx.fillStyle = CY; ctx.globalAlpha = 0.12; ctx.fillRect(P(0, s)[0], P(0, s)[1], s * B.side, s * B.side); ctx.globalAlpha = 1;
    ctx.strokeStyle = AM; ctx.lineWidth = 1.5 * dpr; ctx.strokeRect(P(0, s)[0], P(0, s)[1], s * B.side, s * B.side); ctx.lineWidth = 1;
    for (const [X, Y, Zc, inn] of M.cloud) if (Math.abs(Zc - pr.Z) < 0.04) { const q = P(X, Y); ctx.fillStyle = inn ? CY : MG; ctx.globalAlpha = inn ? 0.9 : 0.45; ctx.fillRect(q[0] - 1.5 * dpr, q[1] - 1.5 * dpr, 3 * dpr, 3 * dpr); }
    ctx.globalAlpha = 1; const q = P(pr.X, pr.Y); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(q[0], q[1], 4 * dpr, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = DIM; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('X →', B.x0 + B.side + 6 * dpr, B.y0 + B.side - 12 * dpr); ctx.fillText('Y ↑', B.x0 - 26 * dpr, B.y0);
    $('c1Title').textContent = T(`高度 Z = ${num(pr.Z, 2)} 的截面：边长 1 − Z 的正方形（琥珀）；附近的随机点里，青 = 在金字塔内，品红 = 在外`, `THE SLICE AT HEIGHT Z = ${num(pr.Z, 2)}: A SQUARE OF SIDE 1 − Z (AMBER); OF THE RANDOM POINTS NEARBY, CYAN = INSIDE, MAGENTA = OUTSIDE`);
    $('c1Meta').textContent = T('白点 = 当前平均点', 'white dot = the current average point');
  } else if (M.mode === 'fiber') {
    const B = squareBox(F), r = pr.r, P = (x, y) => [B.x0 + x / Math.max(r, 1e-9) * B.side, B.y0 + B.side - y / Math.max(r, 1e-9) * B.side], N = 48, cell = B.side / N;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x = (i + 0.5) / N * r, y = (j + 0.5) / N * r, w = Math.min(x, y, r - x, r - y) / Math.max(r / 2, 1e-9); ctx.fillStyle = AM; ctx.globalAlpha = 0.08 + 0.8 * w; ctx.fillRect(B.x0 + i * cell, B.y0 + B.side - (j + 1) * cell, cell + 0.5, cell + 0.5); }
    ctx.globalAlpha = 1; ctx.strokeStyle = FAINT; ctx.strokeRect(B.x0, B.y0, B.side, B.side);
    const q = P(pr.X, pr.Y); ctx.strokeStyle = CY; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.arc(q[0], q[1], 5 * dpr, 0, 2 * Math.PI); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = DIM; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(`X ∈ [0, ${num(r, 2)}] →`, B.x0 + B.side + 6 * dpr, B.y0 + B.side - 12 * dpr);
    $('c1Title').textContent = T(`Z = ${num(pr.Z, 2)} 截面上 κ 区间的宽度 min{X, Y, r − X, r − Y}：边上为零，中心最宽 r/2`, `WIDTH OF THE κ INTERVAL, min{X, Y, r − X, r − Y}, ON THE SLICE Z = ${num(pr.Z, 2)}: ZERO ON THE EDGES, WIDEST (r/2) IN THE CENTRE`);
    $('c1Meta').textContent = T('青圈 = 当前平均点', 'cyan ring = the current average point');
  } else {
    const ns = [3, 4, 5, 6, 7, 8, 9, 10, 11], X = (n) => pl + (n - 3 + 0.5) / ns.length * iw, Y = (v) => pt + ih - v / 0.6 * ih;
    yTicks(ctx, dpr, pl, Y, [0, 0.2, 0.4, 0.5], (v) => v.toFixed(1)); xTicks(ctx, dpr, pt, ih, X, ns, (n) => `n=${n}`);
    ctx.strokeStyle = FAINT; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(pl, Y(0.5)); ctx.lineTo(pl + iw, Y(0.5)); ctx.stroke(); ctx.setLineDash([]);
    for (const n of ns) { const th = Math.floor(n / 2) / n, here = pr.cyc && n === pr.n; ctx.fillStyle = n % 2 ? MG : CY; ctx.globalAlpha = here ? 1 : 0.55; ctx.fillRect(X(n) - iw / ns.length * 0.3, Y(th), iw / ns.length * 0.6, pt + ih - Y(th)); }
    ctx.globalAlpha = 1; ctx.strokeStyle = AM; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.moveTo(pl, Y(pr.t)); ctx.lineTo(pl + iw, Y(pr.t)); ctx.stroke(); ctx.lineWidth = 1;
    $('c1Title').textContent = T('环 Cₙ 上能实现的最大均匀占用 ⌊n/2⌋/n：偶环到 ½（青），奇环到不了（品红）；虚线 = 相邻约束允许的 ½，琥珀 = 当前 t', 'LARGEST ACHIEVABLE UNIFORM OCCUPANCY ⌊n/2⌋/n ON A CYCLE Cₙ: EVEN CYCLES REACH ½ (CYAN), ODD ONES DO NOT (MAGENTA); DASHES = ½ ALLOWED BY THE NEIGHBOUR CONSTRAINTS, AMBER = CURRENT t');
    $('c1Meta').textContent = T('路径总能到 ½', 'paths always reach ½');
  }
}
function drawSide() {
  const M = MODEL, F = frame2d(cv2, M.mode === 'fiber' ? 40 : 14); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  if (M.mode === 'tree') {
    const n = pr.n, words = pr.words, show = Math.min(words.length, 55), cols = Math.max(1, Math.ceil(show / 6)), rows = Math.ceil(show / cols), cw = iw / cols, rh = ih / Math.max(rows, 1);
    words.slice(0, show).forEach((w, k) => { const c = Math.floor(k / rows), r = k % rows, x0 = pl + c * cw, y0 = pt + r * rh, bw = Math.min(10 * dpr, (cw - 8 * dpr) / Math.max(1, n));
      for (let i = 0; i < n; i++) { ctx.fillStyle = w[i] === '1' ? AM : FAINT; ctx.globalAlpha = w[i] === '1' ? 0.95 : 0.4; ctx.fillRect(x0 + i * bw, y0 + rh * 0.15, bw * 0.85, rh * 0.7); }
      if (n === 3) { const key = Object.keys(PRINTED).find((kk) => PRINTED[kk] === w); ctx.globalAlpha = 1; ctx.fillStyle = MODE_CSS[key]; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`[${key === '0' ? 'null' : key}]`, x0 + n * bw + 6 * dpr, y0 + rh / 2); } });
    ctx.globalAlpha = 1;
    $('c2Title').textContent = T(`长 ${n} 的合法位串（琥珀 = 1），共 ${words.length} 个`, `LEGAL WORDS OF LENGTH ${n} (AMBER = 1), ${words.length} IN ALL`); $('c2Meta').textContent = words.length > show ? T(`只画前 ${show} 个`, `first ${show} shown`) : '';
  } else if (M.mode === 'pyramid') {
    const X = (z) => pl + z * iw, Y = (a) => pt + ih - a * ih * 0.92;
    ctx.fillStyle = CY; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); for (let i = 0; i <= 100; i++) { const z = i / 100 * pr.Z; ctx.lineTo(X(z), Y((1 - z) ** 2)); } ctx.lineTo(X(pr.Z), Y(0)); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = CY; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); for (let i = 0; i <= 100; i++) { const z = i / 100; if (i) ctx.lineTo(X(z), Y((1 - z) ** 2)); else ctx.moveTo(X(z), Y(1)); } ctx.stroke(); ctx.lineWidth = 1;
    xTicks(ctx, dpr, pt, ih, X, [0, 0.5, 1], (z) => `Z=${z}`); vline(ctx, X(pr.Z), pt, ih, AM, dpr);
    $('c2Title').textContent = T(`截面面积 (1 − Z)²；阴影 = 到当前高度为止的体积 ${num(pr.volBelow, 4)}（总体积 1/3）`, `SLICE AREA (1 − Z)²; SHADED = VOLUME UP TO THE CURRENT HEIGHT ${num(pr.volBelow, 4)} (TOTAL 1/3)`); $('c2Meta').textContent = '';
  } else if (M.mode === 'fiber') {
    const bw = iw / 7, Y = (v) => pt + ih - v * ih * 0.9;
    MODE_KEYS.forEach((k, i) => { ctx.fillStyle = MODE_CSS[k]; ctx.globalAlpha = 0.85; ctx.fillRect(pl + i * bw + bw * 0.15, Y(pr.p[i]), bw * 0.7, pt + ih - Y(pr.p[i])); ctx.globalAlpha = 1; ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(`[${k === '0' ? 'null' : k}]`, pl + (i + 0.5) * bw, pt + ih + 3 * dpr); ctx.textBaseline = 'bottom'; ctx.fillStyle = INK; ctx.fillText(num(z0(pr.p[i]), 3), pl + (i + 0.5) * bw, Y(pr.p[i]) - 2 * dpr); });
    yTicks(ctx, dpr, pl, Y, [0, 0.5, 1], (v) => v.toFixed(1));
    const gx = pl + 5.4 * bw, gw = bw * 1.4, B = pr.bound || 1e-9, GY = (d) => pt + ih / 2 - d / B * ih * 0.42;   // the Δ gauge between −r²/4 and r²/4
    ctx.strokeStyle = FAINT; ctx.strokeRect(gx, GY(B), gw, GY(-B) - GY(B)); ctx.beginPath(); ctx.moveTo(gx, GY(0)); ctx.lineTo(gx + gw, GY(0)); ctx.stroke();
    ctx.fillStyle = pr.delta >= 0 ? OK : MG; ctx.fillRect(gx + gw * 0.2, Math.min(GY(0), GY(pr.delta)), gw * 0.6, Math.abs(GY(pr.delta) - GY(0)));
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('Δ', gx + gw / 2, pt + ih + 3 * dpr); ctx.textBaseline = 'bottom'; ctx.fillText('+r²/4', gx + gw / 2, GY(B) - 1 * dpr);
    $('c2Title').textContent = T('五种模式的概率（次序 0, 2, 3, 5, 25）与底面行列式 Δ（在 ±r²/4 之间）', 'PROBABILITIES OF THE FIVE MODES (ORDER 0, 2, 3, 5, 25) AND THE BASE DETERMINANT Δ (BETWEEN ±r²/4)'); $('c2Meta').textContent = '';
  } else {
    const G = pr, rows = Math.max(1, M.samples.length), cw = iw / G.n, rh = ih / NSAMPLES;
    if (!G.feasible) {
      ctx.fillStyle = MG; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${12 * dpr}px ${TRV.fonts.data}`;
      ctx.fillText(T(`Σ 占用 = ${G.n}·${num(G.t, 3)} = ${num(G.n * G.t, 3)} > ${G.alpha} = 最大独立集`, `Σ occupancy = ${G.n}·${num(G.t, 3)} = ${num(G.n * G.t, 3)} > ${G.alpha} = largest independent set`), pl + iw / 2, pt + ih / 2);
      $('c2Title').textContent = T('不可实现：没有任何分布满足这组占用', 'NOT ACHIEVABLE: NO LAW HAS THESE OCCUPANCIES'); $('c2Meta').textContent = '';
    } else {
      M.samples.forEach((m, r) => { for (let i = 0; i < G.n; i++) { ctx.fillStyle = (m >> i) & 1 ? AM : FAINT; ctx.globalAlpha = (m >> i) & 1 ? 0.95 : 0.35; ctx.fillRect(pl + i * cw + cw * 0.1, pt + r * rh + rh * 0.1, cw * 0.8, rh * 0.8); } });
      ctx.globalAlpha = 1;
      $('c2Title').textContent = T(`从构造出的分布里抽样（每行一次，琥珀 = 选中）`, `SAMPLES FROM THE CONSTRUCTED LAW (ONE PER ROW, AMBER = CHOSEN)`); $('c2Meta').textContent = T(`${rows} 次抽样`, `${rows} samples`);
    }
  }
}

/* =====================================================================
   12. Readouts and controls
   ===================================================================== */
let syncedKey = '', toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function setRo(rows) { rows.forEach(([l, v], i) => { $(`ro${i + 1}L`).textContent = l; $(`ro${i + 1}`).textContent = v; }); }
function pill(id, label, value) { $(id).innerHTML = `${label} <strong>${value}</strong>`; }
function readouts() {
  const M = MODEL, pr = progress();
  if (M.mode === 'tree') {
    setRo([[T('层数 n · 叶子数', 'Level n · leaves'), `${pr.n} · ${pr.leaves.length}`], [T('α 的个数 · β 的个数', 'Number of α · number of β'), `${pr.A} · ${pr.B}`],
      [T('数量读数 2·#α + 3·#β · F(n + 3)', 'Quantity 2·#α + 3·#β · F(n + 3)'), `${pr.quantity} · ${fib(pr.n + 3)}`], [T('长 n 的合法位串 · F(n + 2)', 'Legal words of length n · F(n + 2)'), `${pr.words.length} · ${fib(pr.n + 2)}`],
      [T('叶子从左到右', 'Leaves left to right'), pr.leaves.replace(/a/g, 'α').replace(/b/g, 'β').slice(0, 40) + (pr.leaves.length > 40 ? '…' : '')]]);
    pill('pillA', 'n', pr.n); pill('pillB', T('叶', 'LEAVES'), pr.leaves.length); pill('pillC', T('数量', 'QTY'), pr.quantity); pill('pillD', T('位串', 'WORDS'), pr.words.length);
    $('roNote').innerHTML = pr.n === 3 ? T('长 3 的合法位串正是五种模式：000、100、010、001、101 对应 [null]、[2]、[3]、[5]、[25]。', 'The legal words of length 3 are exactly the five modes: 000, 100, 010, 001, 101 are [null], [2], [3], [5], [25].') : T('替换只把 α 换成 β、把 β 换成 ⟨β, α⟩；有序括号不能交换，⟨α, β⟩ ≠ ⟨β, α⟩。', 'The substitution only turns α into β and β into ⟨β, α⟩; the ordered brackets cannot be swapped, ⟨α, β⟩ ≠ ⟨β, α⟩.');
  } else if (M.mode === 'pyramid') {
    setRo([[T('平均点 (X, Y, Z)', 'Average point (X, Y, Z)'), `(${num(pr.X, 3)}, ${num(pr.Y, 3)}, ${num(pr.Z, 3)})`], [T('1 − X − Z · 1 − Y − Z（都 ≥ 0 才可实现）', '1 − X − Z · 1 − Y − Z (both ≥ 0 when achievable)'), `${num(1 - pr.X - pr.Z, 3)} · ${num(1 - pr.Y - pr.Z, 3)}`],
      [T('截面面积 (1 − Z)² · 到此的体积', 'Slice area (1 − Z)² · volume so far'), `${num(pr.sliceArea, 4)} · ${num(pr.volBelow, 4)}`],
      [T('随机点落在金字塔里的比例（蒙特卡罗）', 'Fraction of random points in the pyramid (Monte Carlo)'), `${M.cloudInside}/${NCLOUD} = ${num(M.cloudInside / NCLOUD, 4)} ≈ 1/3`],
      [T('写成凸组合：(1 − t)·底面点 + t·顶点', 'As a convex combination: (1 − t)·base point + t·apex'), `t = ${num(pr.Z, 3)}, ${T('底面点', 'base point')} (${num(S.u, 2)}, ${num(S.v, 2)}, 0)`]]);
    pill('pillA', 'Z', num(pr.Z, 2)); pill('pillB', T('截面', 'SLICE'), num(pr.sliceArea, 3)); pill('pillC', 'VOL', num(pr.volBelow, 3)); pill('pillD', 'MC', num(M.cloudInside / NCLOUD, 3));
    $('roNote').innerHTML = T('金字塔只描述“能实现的平均值”；同一个平均点背后通常有很多不同的分布，见“隐藏纤维”模式。', 'The pyramid only describes which averages are achievable; one average point usually has many different laws behind it, see the hidden-fibre mode.');
  } else if (M.mode === 'fiber') {
    setRo([[T('平均点 (X, Y, Z) · r = 1 − Z', 'Average point (X, Y, Z) · r = 1 − Z'), `(${num(pr.X, 3)}, ${num(pr.Y, 3)}, ${num(pr.Z, 3)}) · ${num(pr.r, 3)}`],
      [T('κ 的区间 [max(0, X + Y − r), min(X, Y)] · 宽度', 'Interval of κ [max(0, X + Y − r), min(X, Y)] · width'), `[${num(pr.kLo, 4)}, ${num(pr.kHi, 4)}] · ${num(pr.width, 4)}`],
      [T('当前 κ · 乘积补全 κ* = XY/r', 'Current κ · product completion κ* = XY/r'), `${num(pr.kappa, 4)} · ${num(pr.kStar, 4)}`],
      [T('Δ = rκ − XY · 界 r²/4', 'Δ = rκ − XY · bound r²/4'), `${num(z0(pr.delta), 5)} · ${num(pr.bound, 5)}`],
      [T('分布 p（0, 2, 3, 5, 25）', 'Law p (0, 2, 3, 5, 25)'), pr.p.map((x) => num(z0(x), 3)).join(', ')]]);
    pill('pillA', 'κ', num(pr.kappa, 3)); pill('pillB', T('宽', 'WIDTH'), num(pr.width, 3)); pill('pillC', 'Δ', num(z0(pr.delta), 3)); pill('pillD', 'κ*', num(pr.kStar, 3));
    $('roNote').innerHTML = pr.width < 1e-12 ? T('这里区间宽度为零：平均值唯一决定了整个分布。', 'Here the interval has width zero: the averages determine the whole law.') : T(`三个平均值不变，κ 可以在宽 ${num(pr.width, 3)} 的区间里任取；两个这样的分布只差 t·(1, −1, 0, −1, 1)。`, `With the three averages fixed, κ can be anything in an interval of width ${num(pr.width, 3)}; two such laws differ only by t·(1, −1, 0, −1, 1).`);
  } else {
    const G = pr, emp = M.samples.length ? Array.from({ length: G.n }, (_, i) => M.samples.reduce((s, m) => s + ((m >> i) & 1), 0) / M.samples.length) : null;
    setRo([[T('图 · 位置数 n', 'Graph · positions n'), `${G.cyc ? T('环', 'cycle') : T('路径', 'path')} · ${G.n}`], [T('每个位置的占用 t · 相邻约束 2t ≤ 1', 'Occupancy t of every position · neighbour constraint 2t ≤ 1'), `${num(G.t, 4)} · ${2 * G.t <= 1 + 1e-12 ? T('满足', 'holds') : T('不满足', 'fails')}`],
      [T('最大独立集 α · 能实现的最大 t', 'Largest independent set α · largest achievable t'), `${G.alpha} · ${num(G.threshold, 4)}`], [T('能否实现', 'Achievable?'), G.feasible ? T('能（页面构造了分布）', 'yes (the page builds a law)') : T('不能', 'no')],
      [T('抽样的平均占用（演示）', 'Average occupancy of the samples (demonstration)'), emp ? `${num(emp.reduce((a, b) => a + b, 0) / G.n, 3)} (${M.samples.length})` : '—']]);
    pill('pillA', G.cyc ? `C${G.n}` : `P${G.n}`, ''); pill('pillB', 't', num(G.t, 3)); pill('pillC', 'MAX', num(G.threshold, 3)); pill('pillD', G.feasible ? 'OK' : 'NO', '');
    $('roNote').innerHTML = G.cyc && G.n % 2 ? T(`奇环 C${G.n}：每条边的约束在 t ≤ ½ 时都满足，但任何选法最多 ${G.alpha} 个点，所以 t 最多 ${G.alpha}/${G.n}。`, `Odd cycle C${G.n}: every edge constraint holds for t ≤ ½, but any choice has at most ${G.alpha} positions, so t is at most ${G.alpha}/${G.n}.`) : G.cyc ? T('偶环是二分图，交替选法让 t 能到 ½。', 'An even cycle is bipartite; the alternating choice lets t reach ½.') : T('路径上满足相邻约束就足够（已冻结）；页面用 Markov 拼接：上一个选了就不选，没选就以 t/(1 − t) 选。', 'On a path the neighbour constraints suffice (frozen); the page glues by Markov: after a chosen position never choose, after an unchosen one choose with t/(1 − t).');
  }
}
const fieldsFor = { tree: [], pyramid: ['uField', 'vField'], fiber: ['uField', 'vField', 'zField'], glue: ['graphField', 'nField'] };
function syncOutputs() {
  if (dirty) { build(); dirty = false; syncedKey = ''; toasted = false; }
  const M = MODEL, key = `${S.mode}|${S.nowFrac}|${S.u}|${S.v}|${S.z}|${S.graph}|${S.n}|${S.seed}|${TRV.lang()}|${M.samples ? M.samples.length : 0}`;
  if (key === syncedKey) return; syncedKey = key;
  const pr = progress();
  readouts();
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  for (const id of ['uField', 'vField', 'zField', 'graphField', 'nField']) $(id).hidden = !fieldsFor[S.mode].includes(id);
  $('uu').value = S.u; $('oU').textContent = S.u.toFixed(2); $('vv').value = S.v; $('oV').textContent = S.v.toFixed(2); $('zz').value = S.z; $('oZ').textContent = S.z.toFixed(2);
  $('nn').value = S.n; $('oN').textContent = String(S.n);
  document.querySelectorAll('#graphChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.graph === S.graph)));
  $('presetNote').innerHTML = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = ({
    tree: T('时间轴 = 层数 n，从 0 到 10。', 'The time axis is the level n, from 0 to 10.'),
    pyramid: T('时间轴 = 截面高度 Z，从 0（底面）到 1（顶点）。u、v 决定平均点在截面里的位置。', 'The time axis is the slice height Z, from 0 (the base) to 1 (the apex). u and v place the average point within the slice.'),
    fiber: T('时间轴 = κ 在可行区间里的位置，从下端到上端。u、v、Z 决定平均点。', 'The time axis is the position of κ in its feasible interval, from the lower end to the upper end. u, v and Z set the average point.'),
    glue: T('时间轴 = 每个位置的占用 t，从 0 到 ½。R 重新抽样。', 'The time axis is the occupancy t of every position, from 0 to ½. R resamples.')
  })[S.mode];
  $('litNote').innerHTML = T('页面上的随机撒点与抽样只是演示；已冻结的定理与理论卷的推导分别标为 LEAN 与 THEORY。', 'The random points and samples on the page are demonstrations; frozen theorems and theory-volume derivations are marked LEAN and THEORY respectively.');
  $('clock').innerHTML = M.mode === 'tree' ? `n ${pr.n}` : M.mode === 'pyramid' ? `Z ${num(pr.Z, 2)}` : M.mode === 'fiber' ? `κ ${num(pr.kappa, 3)}` : `t ${num(pr.t, 3)}`;
  $('hudBig').textContent = ({ tree: () => T(`替换树 T${pr.n} · ${pr.leaves.length} 片叶子`, `substitution tree T${pr.n} · ${pr.leaves.length} leaves`), pyramid: () => T(`金字塔 · 截面 Z = ${num(pr.Z, 2)}`, `pyramid · slice Z = ${num(pr.Z, 2)}`),
    fiber: () => T(`隐藏纤维 · κ = ${num(pr.kappa, 3)}`, `hidden fibre · κ = ${num(pr.kappa, 3)}`), glue: () => T(`${pr.cyc ? '环' : '路径'} n = ${pr.n} · t = ${num(pr.t, 3)}`, `${pr.cyc ? 'cycle' : 'path'} n = ${pr.n} · t = ${num(pr.t, 3)}`) })[M.mode]();
  $('hudSub').textContent = ({ tree: T('青 = α，品红 = β；有序二叉树从上往下长', 'cyan = α, magenta = β; the ordered binary tree grows downward'),
    pyramid: T('五个顶点是五种模式；琥珀方框 = 截面；青点在金字塔内，品红点在外', 'the five vertices are the five modes; amber square = the slice; cyan points inside, magenta outside'),
    fiber: T('白点 = 平均点；连到各顶点的线与顶点大小 = 该模式的概率；琥珀与青两条对角线是正方形关系的两边', 'white dot = the average point; lines to the vertices and vertex sizes = the probabilities of the modes; the amber and cyan diagonals are the two sides of the square relation'),
    glue: T('柱高 = 占用 t（品红 = 不可实现）；琥珀 = 最近一次抽样选中的位置', 'bar height = occupancy t (magenta = not achievable); amber = positions chosen in the latest sample') })[M.mode];
  if (!toasted && S.playing && S.nowFrac >= 1) {
    toasted = true;
    if (M.mode === 'tree') toast(T(`<b>n = 10</b>：${pr.leaves.length} 片叶子，数量 ${pr.quantity} = F(13)，长 10 的合法位串 ${pr.words.length} = F(12)。`, `<b>n = 10</b>: ${pr.leaves.length} leaves, quantity ${pr.quantity} = F(13), ${pr.words.length} = F(12) legal words of length 10.`));
    else if (M.mode === 'pyramid') toast(T('<b>Z = 1</b>：截面缩成顶点 [3]，体积累计到 1/3。', '<b>Z = 1</b>: the slice shrinks to the apex [3], and the volume adds up to 1/3.'));
    else if (M.mode === 'fiber') toast(T(`<b>κ 走完一整段</b>：平均点没动，分布换了宽 ${num(pr.width, 3)} 的一整段。`, `<b>κ has run through its interval</b>: the average point never moved while the law ran through a range of width ${num(pr.width, 3)}.`));
    else toast(pr.feasible ? T(`<b>t = ½</b>：${pr.cyc ? '偶环' : '路径'}上依然可以实现。`, `<b>t = ½</b>: still achievable on this ${pr.cyc ? 'even cycle' : 'path'}.`) : T(`<b>t = ½</b>：每条边都满足约束，整体却不可实现——最多只能到 ${pr.alpha}/${pr.n}。`, `<b>t = ½</b>: every edge constraint holds, yet the whole is not achievable; the limit is ${pr.alpha}/${pr.n}.`));
  }
}
function syncRail() {
  const key = `${S.mode}|${S.graph}|${S.n}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  let marks;
  if (S.mode === 'tree') marks = Array.from({ length: NLEV + 1 }, (_, n) => [n / NLEV, `n=${n}`]);
  else if (S.mode === 'pyramid') marks = [[0, 'Z=0'], [0.5, '0.5'], [1, 'Z=1']];
  else if (S.mode === 'fiber') marks = [[0, T('κ 下端', 'κ low')], [0.5, T('中点', 'middle')], [1, T('κ 上端', 'κ high')]];
  else { const a = Math.floor(S.n / 2) / S.n; marks = [[0, 't=0'], ...(S.graph === 'cycle' && S.n % 2 ? [[2 * a, `${Math.floor(S.n / 2)}/${S.n}`]] : []), [1, 't=½']]; }
  $('marks').innerHTML = marks.map(([f, s], i) => `<i class="${i === 0 ? 'first' : i === marks.length - 1 ? 'last' : ''}" style="left:${(f * 100).toFixed(2)}%">${s}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => {
  const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'pyramid'; if (S.mode === m) return;
  S.mode = m; S.nowFrac = 0; custom(); setCamPreset(m === 'tree' ? 'front' : 'iso');
}));
for (const [id, keyName, lo, hi] of [['uu', 'u', 0, 1], ['vv', 'v', 0, 1], ['zz', 'z', 0, 0.95]]) $(id).addEventListener('input', () => { S[keyName] = Math.min(hi, Math.max(lo, Math.round(parseFloat($(id).value) * 20) / 20)); custom(); });
$('nn').addEventListener('input', () => { S.n = Math.min(11, Math.max(3, parseInt($('nn').value, 10))); custom(); });
document.querySelectorAll('#graphChips .chip').forEach((b) => b.addEventListener('click', () => { const g = b.dataset.graph === 'cycle' ? 'cycle' : 'path'; if (g === S.graph) return; S.graph = g; custom(); }));
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.mode = p.mode; for (const k of ['u', 'v', 'z', 'graph', 'n']) if (p[k] !== undefined) S[k] = p[k];
  S.seed = 1; S.preset = name; markPreset(); dirty = true; setCamPreset(p.mode === 'tree' ? 'front' : 'iso');
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
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) { ev.preventDefault(); const step = MODEL.mode === 'tree' ? 1 / NLEV : 1 / 100; jumpTo(S.nowFrac + (ev.key === 'ArrowRight' ? 1 : -1) * step); }
  else if (ev.key === 'e' || ev.key === 'E') jumpTo(1);
  else if (ev.key === 'r' || ev.key === 'R') { S.seed++; custom(); }
});

/* =====================================================================
   13. Main loop
   ===================================================================== */
let lastT = performance.now(), frameCount = 0, sampleClock = 0;
function resize() {
  if (!glOK) return;
  const r = stage.getBoundingClientRect();
  renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
  camera.aspect = Math.max(0.2, r.width / Math.max(1, r.height)); camera.updateProjectionMatrix();
}
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
  if (MODEL.mode === 'glue') {   // draw a new configuration a few times a second; restart the record when t, n or the graph changes
    const G = progress(), gkey = `${G.cyc}|${G.n}|${G.t}`;
    if (MODEL.sampleKey !== gkey) { MODEL.sampleKey = gkey; MODEL.samples = []; }
    sampleClock += dtSec;
    if (G.feasible && (sampleClock > 0.08 || MODEL.samples.length < 8)) { sampleClock = 0; MODEL.samples.push(drawSample(G)); if (MODEL.samples.length > NSAMPLES) MODEL.samples.shift(); }
  }
  syncOutputs(); syncRail();
  if (glOK) { updateCamera(dtSec); updateGL(); renderer.render(scene3, camera); updateTags(); }
  drawMain(); drawSide();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { syncedKey = ''; syncOutputs(); $('marks').dataset.key = ''; });

/* read-only probe for automated browser tests */
window.AP_DEBUG = {
  pending: () => dirty || !String(syncedKey).startsWith(`${S.mode}|${S.nowFrac}|${S.u}|${S.v}|${S.z}|${S.graph}|${S.n}|${S.seed}|${TRV.lang()}|`),
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, pr = progress(), o = { mode: M.mode, frac: S.nowFrac };
    if (M.mode === 'tree') Object.assign(o, { n: pr.n, leaves: pr.leaves, A: pr.A, B: pr.B, quantity: pr.quantity, words: pr.words, stats: M.stats });
    if (M.mode === 'pyramid') Object.assign(o, { X: pr.X, Y: pr.Y, Z: pr.Z, u: S.u, v: S.v, inside: pr.inside, sliceArea: pr.sliceArea, volBelow: pr.volBelow, cloud: M.cloud, cloudInside: M.cloudInside });
    if (M.mode === 'fiber') Object.assign(o, { X: pr.X, Y: pr.Y, Z: pr.Z, r: pr.r, kLo: pr.kLo, kHi: pr.kHi, kappa: pr.kappa, width: pr.width, p: pr.p, delta: pr.delta, bound: pr.bound, kStar: pr.kStar, condCov: pr.condCov, cov: pr.cov });
    if (M.mode === 'glue') Object.assign(o, { graph: S.graph, n: pr.n, t: pr.t, alpha: pr.alpha, threshold: pr.threshold, feasible: pr.feasible, dist: pr.entries, marg: pr.marg, samples: M.samples.slice() });
    return o;
  },
  inside: (X, Y, Z) => insidePyramid(X, Y, Z),
  fiberAt: (X, Y, Z, f) => fiberAt(X, Y, Z, f),
  gluing: (graph, n, t) => { const G = gluing(graph, n, t); return { alpha: G.alpha, threshold: G.threshold, feasible: G.feasible, dist: G.entries, marg: G.marg }; },
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('slice'); S.playing = false; setPlayUI(); S.nowFrac = 0.35; $('now').value = S.nowFrac; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('slice');
setPlayUI();
requestAnimationFrame(frame);
})();
