/* GAME//GRUNDY · 三个博弈 · 三个结算的问题
   Divisor Nim (a move takes d stones from one heap, d dividing every other heap): Grundy values by the mex recursion on sorted
   heap multisets, with the frozen bound 2·h_min and the 2-adic description of the losing positions. Random subtraction games:
   the winning probability a_n of the player to move, the signed differences d_n and the conserved window J_N of the frozen
   nonconvergence proof. The cordiality game: exact minimax values on trees with ten vertices, a replay of optimal play, and
   moves chosen by clicking vertices. Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, ok: OK, cyan: CY, magenta: MG } = TRV.palette;
const MODES = ['nim', 'random', 'cordial'];
const RUN = { nim: 16, random: 14, cordial: 12 };
const NA = 24, CMAX = 16, NR = 120, NV = 10;
const VIOLET = '#9d8cff';

/* =====================================================================
   2. Divisor Nim
   ===================================================================== */
const GMEMO = new Map();
function grundy(P) {   // P: heap sizes (positive); mex over all legal successors
  const s = P.filter((x) => x > 0).sort((a, b) => a - b), key = s.join(',');
  const hit = GMEMO.get(key); if (hit !== undefined) return hit;
  const seen = new Set();
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && s[i] === s[i - 1]) continue;
    const h = s[i], others = s.slice(0, i).concat(s.slice(i + 1));
    let g = 0; for (const x of others) g = gcdOf(g, x);   // d must divide every other heap, i.e. divide their gcd (any d ≤ h when alone)
    for (let d = 1; d <= h; d++) { if (g && g % d) continue; const Q = others.slice(); if (h - d > 0) Q.push(h - d); seen.add(grundy(Q)); }
  }
  let m = 0; while (seen.has(m)) m++;
  GMEMO.set(key, m); return m;
}
function gcdOf(a, b) { while (b) [a, b] = [b, a % b]; return a; }
const v2 = (x) => { let k = 0; while (x % 2 === 0) { x /= 2; k++; } return k; };
function parityZero(P) { const k = Math.min(...P.map(v2)); return P.filter((x) => v2(x) === k).length % 2 === 0; }   // the frozen description of g = 0
const NIM_CACHE = new Map();
function nimTable(c) {   // g(a, b[, c]) for 1 ≤ a, b ≤ NA
  if (NIM_CACHE.has(c)) return NIM_CACHE.get(c);
  const g = [], ratio = []; let maxRatio = 0, equal = [], zeros = 0, parityOK = 0, viol = 0;
  for (let a = 1; a <= NA; a++) { g.push([]); ratio.push([]); for (let b = 1; b <= NA; b++) {
    const P = c ? [a, b, c] : [a, b], v = grundy(P), hmin = Math.min(...P), r = v / (2 * hmin);
    g[a - 1].push(v); ratio[a - 1].push(r); maxRatio = Math.max(maxRatio, r); if (v === 2 * hmin && a <= b) equal.push(P.slice().sort((x, y) => x - y)); if (v > 2 * hmin) viol++;
    if (v === 0) zeros++; if ((v === 0) === parityZero(P)) parityOK++;
  } }
  const T2 = { c, g, ratio, maxRatio, equal, zeros, parityOK, viol, boards: NA * NA };
  NIM_CACHE.set(c, T2); return T2;
}

/* =====================================================================
   3. Random subtraction games
   ===================================================================== */
function winProbs(S, N) {   // a_0 … a_N: a_n = 0 if no move, else 1 − mean of a_{n−s} over legal s
  const a = []; for (let n = 0; n <= N; n++) { const A = S.filter((s) => s > 0 && s <= n); a.push(A.length ? 1 - A.reduce((t, s) => t + a[n - s], 0) / A.length : 0); }
  return a;
}
function randomData(S) {
  const a = winProbs(S, NR + 1), b = a.map((x, n) => (n % 2 ? -1 : 1) * (1 - 2 * x)), d = b.slice(0, -1).map((x, n) => x + b[n + 1]);
  const M = S.length ? Math.max(...S) : 0, J = [];
  for (let N = M; N <= NR - 1 && M > 0; N++) { let t = 0; for (const s of S) for (let r = 0; r < s; r++) t += d[N - s + r]; J.push([N, t]); }
  const g = S.reduce((x, y) => gcdOf(x, y), 0), allOdd = S.length > 0 && S.every((s) => s % 2 === 1);
  const verdict = !S.length ? 'empty' : allOdd ? (g === 1 ? 'frozen' : 'proof') : (g === 1 ? 'lit' : 'none');
  return { S: S.slice(), a: a.slice(0, NR + 1), d, J, M, gcd: g, allOdd, verdict };
}

/* =====================================================================
   4. The cordiality game
   ===================================================================== */
const TREES = {
  witness: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [0, 8], [0, 9]],
  path: Array.from({ length: 9 }, (_, i) => [i, i + 1]),
  star: Array.from({ length: 9 }, (_, i) => [0, i + 1])
};
const PAIRS = [[0, 4], [1, 5], [2, 6], [3, 7], [8, 9]];   // Impish's pairing in the frozen proof
const popc = (x) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
function makeGame(edges, n) {   // A = Admirable's vertices (label 0), B = Impish's (label 1); Admirable moves when |A| = |B|
  const memo = new Map(), full = (1 << n) - 1;
  const e1 = (A) => { let k = 0; for (const [u, v] of edges) if (((A >> u) & 1) !== ((A >> v) & 1)) k++; return k; };
  const disc = (A) => Math.abs(2 * e1(A) - edges.length);
  const value = (A, B) => {
    const key = A * 1024 + B; const hit = memo.get(key); if (hit !== undefined) return hit;
    const free = full & ~(A | B); let r;
    if (!free) r = disc(A);
    else if (popc(A) === popc(B)) { r = Infinity; for (let v = 0; v < n; v++) if ((free >> v) & 1) r = Math.min(r, value(A | (1 << v), B)); }
    else { r = -Infinity; for (let v = 0; v < n; v++) if ((free >> v) & 1) r = Math.max(r, value(A, B | (1 << v))); }
    memo.set(key, r); return r;
  };
  const best = (A, B) => {   // the first optimal move in vertex order
    const free = full & ~(A | B), adm = popc(A) === popc(B), target = value(A, B);
    for (let v = 0; v < n; v++) if ((free >> v) & 1 && (adm ? value(A | (1 << v), B) : value(A, B | (1 << v))) === target) return v;
    return -1;
  };
  const stateAfter = (moves, t) => { let A = 0, B = 0; for (let i = 0; i < t; i++) { if (i % 2 === 0) A |= 1 << moves[i]; else B |= 1 << moves[i]; } return { A, B }; };
  const complete = (moves) => { const out = moves.slice(); while (out.length < n) { const { A, B } = stateAfter(out, out.length); out.push(best(A, B)); } return out; };
  return { edges, n, value, best, e1, disc, stateAfter, complete, cg: value(0, 0) };
}
const GAMES = {};
const gameFor = (tree) => (GAMES[tree] || (GAMES[tree] = makeGame(TREES[tree], NV)));
let PATH_VALUES = null;
const pathValues = () => PATH_VALUES || (PATH_VALUES = Array.from({ length: 9 }, (_, i) => { const n = i + 2; return [n, makeGame(Array.from({ length: n - 1 }, (_, j) => [j, j + 1]), n).cg]; }));
function treeLayout(tree) {
  if (tree === 'star') return Array.from({ length: NV }, (_, v) => (v === 0 ? [0, 0] : [2.9 * Math.cos(2 * Math.PI * (v - 1) / 9), 2.9 * Math.sin(2 * Math.PI * (v - 1) / 9)]));
  if (tree === 'path') return Array.from({ length: NV }, (_, v) => [-4.5 + v, 0]);
  return Array.from({ length: NV }, (_, v) => (v < 8 ? [-2.6 + v * 0.95, 0] : [-3.4, v === 8 ? -1.2 : 1.2]));
}

/* =====================================================================
   5. State and presets
   ===================================================================== */
const S = { mode: 'nim', set: [3, 5], tree: 'witness', cmoves: null, nowFrac: 0, playing: false, dir: 1, speed: 1, hold: 0, preset: 'nim2' };
const PRESETS = {
  nim2: { mode: 'nim', frac: 0, play: false, cam: 'iso',
    zh: '两堆 Divisor Nim：每根竖线的高度是局面 {a, b} 的 Grundy 值，品红屋顶是本库证明的上界 2·min(a, b)。竖线没有一根穿过屋顶，两堆时最高也只到屋顶的 3/4。',
    en: 'Two-heap Divisor Nim: the height of each stroke is the Grundy value of the position {a, b}, and the magenta roof is the bound 2·min(a, b) proved in this library. No stroke pierces the roof; with two heaps none reaches beyond 3/4 of it.' },
  nim3: { mode: 'nim', frac: 0, play: true, cam: 'iso',
    zh: '加上第三堆 c，从 0 增到 16：屋顶变成 2·min(a, b, c)，常常大幅降低，但 Grundy 值始终在它下面——界对任意多堆都成立。',
    en: 'Add a third heap c, growing from 0 to 16: the roof becomes 2·min(a, b, c), often much lower, yet the Grundy values always stay under it; the bound holds for any number of heaps.' },
  zeros: { mode: 'nim', frac: 0, play: false, cam: 'top',
    zh: '琥珀点是 Grundy 值为 0 的必败局面。冻结定理说：设 k 是两堆 2-adic 阶的较小者，g = 0 当且仅当阶恰为 k 的堆有偶数个——两堆时就是 a、b 含 2 的同一次幂。',
    en: 'Amber dots are losing positions, where the Grundy value is 0. The frozen theorem says: with k the smaller 2-adic valuation, g = 0 exactly when an even number of heaps have valuation k; for two heaps this means a and b carry the same power of 2.' },
  tight: { mode: 'nim', frac: 0.625, play: false, cam: 'iso',
    zh: '第三堆 c = 10：局面 {1, 4, 10} 的 Grundy 值是 2，恰好等于 2·h<sub>min</sub>，界在这里被取到（白点）。所以 2h<sub>min</sub> 不能再改小成别的常数倍。',
    en: 'Third heap c = 10: the position {1, 4, 10} has Grundy value 2, exactly 2·h<sub>min</sub>, so the bound is attained here (white dot). Hence 2h<sub>min</sub> cannot be lowered to a smaller multiple.' },
  odd35: { mode: 'random', set: [3, 5], frac: 0, play: true,
    zh: 'S = {3, 5}，全为奇数：偶数位置（青）的获胜概率趋向 0.375，奇数位置（品红）趋向 0.625，永远不合拢。下方的守恒窗口 J<sub>N</sub> 始终是同一个正数——这正是证明里的矛盾来源。',
    en: 'S = {3, 5}, all odd: the winning probability at even positions (cyan) approaches 0.375 and at odd positions (magenta) 0.625, never meeting. The conserved window J<sub>N</sub> below stays the same positive number, which is exactly where the proof finds its contradiction.' },
  even12: { mode: 'random', set: [1, 2], frac: 0, play: true,
    zh: 'S = {1, 2}，含偶数：偶、奇两条子序列很快合拢到 ½，J<sub>N</sub> 跟着趋于 0。收敛是 Capitelli 与 Somma 的定理（文献）。',
    en: 'S = {1, 2}, with an even move: the even and odd subsequences quickly merge at ½, and J<sub>N</sub> tends to 0 with them. Convergence is the theorem of Capitelli and Somma (literature).' },
  tree10: { mode: 'cordial', tree: 'witness', frac: 0, play: true, cam: 'top',
    zh: '反例树：路径 0–1–…–7，再在 0 上挂 8、9。双方都按最优下（页面的极小极大搜索），终局差是 3。紫色虚线是证明里 Impish 的配对：对手下一点，他就下配对的另一点。',
    en: 'The counterexample tree: the path 0–1–…–7 with 8 and 9 hanging from 0. Both sides play optimally (the page’s minimax search) and the final discrepancy is 3. The violet dashes are Impish’s pairing from the proof: he answers each move with its partner.' },
  path10: { mode: 'cordial', tree: 'path', frac: 0, play: true, cam: 'top',
    zh: '同阶路径 P₁₀：最优对局的终局差只有 1。九条边让差必为奇数，所以 1 已是最小。树的博弈值 3 大于路径的 1，猜想 3.2 不成立。',
    en: 'The path P₁₀ of the same order: optimal play ends with discrepancy only 1. Nine edges make the discrepancy odd, so 1 is the least possible. The tree’s value 3 exceeds the path’s 1, so Conjecture 3.2 fails.' }
};

/* =====================================================================
   6. The model
   ===================================================================== */
let MODEL = null, dirty = true;
function build() {
  const M = { mode: S.mode };
  if (S.mode === 'random') M.R = randomData(S.set);
  if (S.mode === 'cordial') { M.G = gameFor(S.tree); M.moves = S.cmoves ? M.G.complete(S.cmoves) : M.G.complete([]); M.traj = Array.from({ length: NV + 1 }, (_, t) => { const { A, B } = M.G.stateAfter(M.moves, t); return M.G.value(A, B); }); }
  MODEL = M;
}
function progress() {
  const M = MODEL, f = Math.min(1, Math.max(0, S.nowFrac));
  if (M.mode === 'nim') { const c = Math.round(f * CMAX); return { f, c, T: nimTable(c) }; }
  if (M.mode === 'random') { const N = Math.round(f * NR); const J = M.R.J.filter(([n]) => n <= N); return { f, N, J: J.length ? J[J.length - 1][1] : null }; }
  const t = Math.round(f * NV), { A, B } = M.G.stateAfter(M.moves, t), full = (1 << NV) - 1;
  return { f, t, A, B, value: M.G.value(A, B), done: (A | B) === full, turn: t % 2 === 0 ? 'A' : 'I', next: t < NV ? M.moves[t] : null };
}

/* =====================================================================
   7. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const num = (v, d = 3) => (v === null || v === undefined || !isFinite(v) ? '—' : (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d));

/* =====================================================================
   8. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 16000, PTS_MAX = 3000;
const CAMS = { iso: [0.75, 1.0, 15], front: [0.0001, 1.5708, 14], top: [0.0001, 0.06, 15] };
const cam = { theta: 0.75, phi: 1.0, r: 15, tTheta: 0.75, tPhi: 1.0, tR: 15 };
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
const NX = (a) => (a - (NA + 1) / 2) * 0.27, NY = (g) => -1.5 + g * 0.095;
const RX = (n) => (n / NR - 0.5) * 11, RY = (p) => -1.7 + p * 3.4;
const VP = (xy) => [xy[0], 0, xy[1]];
function updateGL() {
  const M = MODEL, pr = progress();
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp[3 * v] = a[0]; Pp[3 * v + 1] = a[1]; Pp[3 * v + 2] = a[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; Pp[3 * v] = b[0]; Pp[3 * v + 1] = b[1]; Pp[3 * v + 2] = b[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  if (M.mode === 'nim') {
    const T2 = pr.T, c = pr.c, lo = NX(0.5), hi = NX(NA + 0.5);
    for (const [x0, z0, x1, z1] of [[lo, lo, hi, lo], [hi, lo, hi, hi], [hi, hi, lo, hi], [lo, hi, lo, lo]]) seg([x0, NY(0), z0], [x1, NY(0), z1], COL.gray, 0.5);
    for (let a = 1; a <= NA; a++) for (let b = 1; b <= NA; b++) {
      const g = T2.g[a - 1][b - 1], r = T2.ratio[a - 1][b - 1], x = NX(a), z = NX(b);
      if (g === 0) dot([x, NY(0), z], COL.amber, 1, 0.9);
      else { seg([x, NY(0), z], [x, NY(g), z], COL.cyan, 0.5 + 0.5 * r); if (r >= 0.999) dot([x, NY(g), z], [1, 1, 1], 1, 1.3); }
    }
    for (let a = 1; a <= NA; a++) for (let b = 1; b < NA; b++) {   // the roof 2·min(a, b, c)
      const h = (p, q) => 2 * Math.min(p, q, c || Infinity);
      seg([NX(a), NY(h(a, b)), NX(b)], [NX(a), NY(h(a, b + 1)), NX(b + 1)], COL.magenta, 0.22); seg([NX(b), NY(h(b, a)), NX(a)], [NX(b + 1), NY(h(b + 1, a)), NX(a)], COL.magenta, 0.22);
    }
  } else if (M.mode === 'random') {
    const R = M.R;
    seg([RX(0), RY(0), 0], [RX(NR), RY(0), 0], COL.gray, 0.5); seg([RX(0), RY(0.5), 0], [RX(NR), RY(0.5), 0], COL.amber, 0.3);
    for (let n = 0; n <= pr.N; n++) { const z = n % 2 ? 0.5 : -0.5, col = n % 2 ? COL.magenta : COL.cyan; seg([RX(n), RY(0), z], [RX(n), RY(R.a[n]), z], col, 0.85); dot([RX(n), RY(R.a[n]), z], col, 0.9, 0.55); }
    if (R.M && pr.N >= R.M) { const x0 = RX(pr.N - R.M), x1 = RX(pr.N); for (const z of [-0.8, 0.8]) seg([x0, RY(-0.08), z], [x1, RY(-0.08), z], [1, 1, 1], 0.6); seg([x0, RY(-0.08), -0.8], [x0, RY(-0.08), 0.8], [1, 1, 1], 0.6); seg([x1, RY(-0.08), -0.8], [x1, RY(-0.08), 0.8], [1, 1, 1], 0.6); }
  } else {
    const G = M.G, P = treeLayout(S.tree).map(VP);
    for (const [a, b] of G.edges) {
      const la = ((pr.A | pr.B) >> a) & 1, lb = ((pr.A | pr.B) >> b) & 1;
      if (la && lb) { const one = ((pr.A >> a) & 1) !== ((pr.A >> b) & 1); seg(P[a], P[b], one ? COL.amber : COL.cyan, one ? 1 : 0.35); }
      else seg(P[a], P[b], COL.gray, 0.5);
    }
    if (S.tree === 'witness') for (const [a, b] of PAIRS) { for (let k = 0; k < 16; k += 2) { const t0 = k / 16, t1 = (k + 1) / 16, dx = P[b][0] - P[a][0], dz = P[b][2] - P[a][2], len = Math.hypot(dx, dz) || 1, at = (t) => [P[a][0] + dx * t - dz / len * Math.sin(Math.PI * t) * 0.9, -0.05, P[a][2] + dz * t + dx / len * Math.sin(Math.PI * t) * 0.9]; seg(at(t0), at(t1), [0.62, 0.55, 1], 0.7); } }
    for (let u = 0; u < NV; u++) {
      const a = (pr.A >> u) & 1, b = (pr.B >> u) & 1;
      dot(P[u], a ? COL.cyan : b ? COL.magenta : COL.gray, a || b ? 1 : 0.6, a || b ? 2.4 : 1.4);
      if (pr.next === u && !pr.done) dot([P[u][0], 0.55, P[u][2]], [1, 1, 1], 0.8, 0.9);
    }
  }
  lines.geometry.setDrawRange(0, v); Lb.position.needsUpdate = true; Lb.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 60 * renderer.getPixelRatio() * (stage.clientHeight / 600);
}

/* =====================================================================
   9. Camera and picking
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.5 : 1);
  camera.position.set(r * sp * Math.sin(cam.theta), r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
}
function setCamPreset(name) {
  const p = CAMS[name]; if (!p) return;
  const near = MODEL ? MODEL.mode === 'cordial' : S.mode === 'cordial';
  let d = (p[0] - cam.theta) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  cam.tTheta = cam.theta + d; cam.tPhi = p[1]; cam.tR = near ? p[2] * 0.72 : p[2];
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === name)));
}
const proj3 = (p) => { const q = new THREE.Vector3(p[0], p[1], p[2]).project(camera), rect = stage.getBoundingClientRect(); return { x: (q.x * 0.5 + 0.5) * rect.width, y: (-q.y * 0.5 + 0.5) * rect.height, z: q.z }; };
function vertexScreen(u) { if (!glOK || MODEL.mode !== 'cordial') return null; const q = proj3(VP(treeLayout(S.tree)[u])), r = stage.getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; }
function playVertex(u) {   // the vertex becomes the move at the current time; both sides then continue optimally
  if (MODEL.mode !== 'cordial') return false;
  const pr = progress(); if (pr.done || (((pr.A | pr.B) >> u) & 1)) return false;
  S.cmoves = MODEL.moves.slice(0, pr.t).concat([u]); S.preset = null; markPreset(); dirty = true;
  S.playing = false; setPlayUI(); S.nowFrac = (pr.t + 1) / NV; $('now').value = S.nowFrac;
  return true;
}
const drag = { x: 0, y: 0, x0: 0, y0: 0, pts: new Map(), pinch: 0 };
stage.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest('.chip')) return;
  stage.setPointerCapture(ev.pointerId);
  drag.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); drag.x = drag.x0 = ev.clientX; drag.y = drag.y0 = ev.clientY;
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()]; drag.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
});
stage.addEventListener('pointermove', (ev) => {
  if (!drag.pts.has(ev.pointerId)) return;
  drag.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(32, Math.max(7, cam.tR * drag.pinch / d)); drag.pinch = d; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY;
  if (Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 4) return;
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => {
  if (!drag.pts.has(ev.pointerId)) return;
  const click = drag.pts.size === 1 && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 4;
  drag.pts.delete(ev.pointerId); if (drag.pts.size === 0) drag.pinch = 0;
  if (click && MODEL && MODEL.mode === 'cordial') {   // pick the nearest vertex within 22 px
    let bestU = -1, bestD = 22; for (let u = 0; u < NV; u++) { const s = vertexScreen(u); if (!s) continue; const d = Math.hypot(s.x - ev.clientX, s.y - ev.clientY); if (d < bestD) { bestD = d; bestU = u; } }
    if (bestU >= 0) playVertex(bestU);
  }
};
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(32, Math.max(7, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   10. Tags
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
  const M = MODEL, pr = progress(); let k = 0;
  const put = (text, p, cls) => { const el = tagAt(k++, cls); el.textContent = text; placeTag(el, p); };
  if (M.mode === 'nim') {
    put('a', [NX(NA + 1.6), NY(0), NX(0.5)], 'tick'); put('b', [NX(0.5), NY(0), NX(NA + 1.6)], 'tick');
    put(pr.c ? `2·min(a, b, ${pr.c})` : '2·min(a, b)', [NX(NA), NY(2 * Math.min(NA, pr.c || NA)) + 0.3, NX(NA)], 'mg');
    for (const P of pr.T.equal.slice(0, 2)) put(`{${P.join(', ')}}`, [NX(P[0]), NY(2 * Math.min(...P)) + 0.35, NX(P[1])], '');
  } else if (M.mode === 'random') {
    put('n', [RX(NR) + 0.4, RY(0), 0], 'tick'); put('½', [RX(0) - 0.4, RY(0.5), 0], 'hot');
    put(T('偶 n', 'even n'), [RX(0) - 0.6, RY(0.15), -0.5], 'cy'); put(T('奇 n', 'odd n'), [RX(0) - 0.6, RY(0.15), 0.5], 'mg');
    if (M.R.M && pr.N >= M.R.M) put(`J = ${num(pr.J, 3)}`, [RX(pr.N - M.R.M / 2), RY(-0.08) - 0.35, 0.8], '');
  } else {
    const P = treeLayout(S.tree).map(VP);
    for (let u = 0; u < NV; u++) { const a = (pr.A >> u) & 1, b = (pr.B >> u) & 1; put(a ? `${u}:0` : b ? `${u}:1` : String(u), [P[u][0], 0.3, P[u][2] - 0.42], a ? 'cy' : b ? 'mg' : ''); }
  }
  for (let i = k; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}

/* =====================================================================
   11. 2D panels
   ===================================================================== */
function frame2d(cv, pl0 = 40) {
  const dpr = fitCanvas(cv), ctx = cv.getContext('2d'), Wd = cv.width, Hh = cv.height;
  ctx.clearRect(0, 0, Wd, Hh);
  const pl = pl0 * dpr, pr = 12 * dpr, pt = 10 * dpr, pb = 20 * dpr;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  return { dpr, ctx, W: Wd, Hh, pl, pt, iw: Wd - pl - pr, ih: Hh - pt - pb };
}
const yTicks = (ctx, dpr, pl, Y, vals, fmt) => { ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of vals) ctx.fillText(fmt(g), pl - 4 * dpr, Y(g)); };
const xTicks = (ctx, dpr, pt, ih, X, vals, fmt) => { ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const g of vals) ctx.fillText(fmt(g), X(g), pt + ih + 3 * dpr); };
const vline = (ctx, x, pt, ih, col, dpr) => { ctx.strokeStyle = col; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + ih); ctx.stroke(); ctx.setLineDash([]); };
const hline = (ctx, y, x0, x1, col, dpr) => { ctx.strokeStyle = col; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]); };
function drawMain() {
  const M = MODEL, F = frame2d(cv1); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  if (M.mode === 'nim') {
    const T2 = pr.T, side = Math.min(iw, ih), x0 = pl + (iw - side) / 2, cell = side / NA;
    for (let a = 1; a <= NA; a++) for (let b = 1; b <= NA; b++) {
      const g = T2.g[a - 1][b - 1], r = T2.ratio[a - 1][b - 1], x = x0 + (b - 1) * cell, y = pt + (a - 1) * cell;
      if (g === 0) { ctx.fillStyle = AM; ctx.globalAlpha = 0.9; } else { ctx.fillStyle = r >= 0.999 ? INK : CY; ctx.globalAlpha = 0.12 + 0.8 * r; }
      ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      if ((g === 0) !== parityZero(pr.c ? [a, b, pr.c] : [a, b])) { ctx.globalAlpha = 1; ctx.strokeStyle = MG; ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2); }
    }
    ctx.globalAlpha = 1; ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const a of [1, 8, 16, 24]) ctx.fillText(`a=${a}`, x0 - 3 * dpr, pt + (a - 0.5) * cell);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const b of [1, 8, 16, 24]) ctx.fillText(`b=${b}`, x0 + (b - 0.5) * cell, pt + side + 2 * dpr);
    $('c1Title').textContent = T(`Grundy 值 g(a, b${pr.c ? `, ${pr.c}` : ''})：亮度 = g / (2·h_min)；琥珀 = g = 0；白 = 取到界`, `GRUNDY VALUE g(a, b${pr.c ? `, ${pr.c}` : ''}): BRIGHTNESS = g / (2·h_min); AMBER = g = 0; WHITE = THE BOUND ATTAINED`);
    $('c1Meta').textContent = T(`品红框 = 与 2-adic 规则不符（共 ${T2.boards - T2.parityOK} 个）`, `magenta frame = disagrees with the 2-adic rule (${T2.boards - T2.parityOK} in all)`);
  } else if (M.mode === 'random') {
    const R = M.R, X = (n) => pl + n / NR * iw, Y = (p) => pt + ih - p * ih;
    yTicks(ctx, dpr, pl, Y, [0, 0.5, 1], (v) => v.toFixed(1)); xTicks(ctx, dpr, pt, ih, X, [0, 30, 60, 90, 120], (v) => `n=${v}`);
    hline(ctx, Y(0.5), pl, pl + iw, FAINT, dpr);
    for (let n = 0; n <= pr.N; n++) { ctx.fillStyle = n % 2 ? MG : CY; ctx.beginPath(); ctx.arc(X(n), Y(R.a[n]), 2.2 * dpr, 0, 2 * Math.PI); ctx.fill(); }
    vline(ctx, X(pr.N), pt, ih, INK, dpr);
    $('c1Title').textContent = T(`S = {${R.S.join(', ')}}：轮到者的获胜概率 a_n（青 = 偶 n，品红 = 奇 n）`, `S = {${R.S.join(', ')}}: WINNING PROBABILITY a_n OF THE PLAYER TO MOVE (CYAN = EVEN n, MAGENTA = ODD n)`);
    $('c1Meta').textContent = '';
  } else {
    const V = pathValues(), bars = V.map(([n, v]) => [`P${n}`, v, CY]).concat([[T('树 T', 'tree T'), gameFor('witness').cg, MG], [T('星', 'star'), gameFor('star').cg, VIOLET]]);
    const bw = iw / bars.length, Y = (v) => pt + ih - v / 4 * ih;
    yTicks(ctx, dpr, pl, Y, [0, 1, 2, 3, 4], String);
    bars.forEach(([lab, v, col], i) => { ctx.fillStyle = col; ctx.globalAlpha = (lab === 'P10' || i >= V.length) ? 0.95 : 0.45; ctx.fillRect(pl + i * bw + bw * 0.2, Y(v), bw * 0.6, pt + ih - Y(v)); ctx.globalAlpha = 1; ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(lab, pl + (i + 0.5) * bw, pt + ih + 3 * dpr); });
    $('c1Title').textContent = T('博弈值 c_g：路径 P₂…P₁₀（青），十顶点的反例树 T（品红）与星（紫）', 'GAME VALUE c_g: PATHS P₂…P₁₀ (CYAN), THE TEN-VERTEX COUNTEREXAMPLE T (MAGENTA) AND THE STAR (VIOLET)');
    $('c1Meta').textContent = T('页面的极小极大搜索', 'the page’s minimax search');
  }
}
function drawSide() {
  const M = MODEL, F = frame2d(cv2, 34); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  if (M.mode === 'nim') {
    const T2 = pr.T, top = 2 * NA + 2, X = (h) => pl + h / top * iw, Y = (g) => pt + ih - g / top * ih;
    yTicks(ctx, dpr, pl, Y, [0, 16, 32, 48], String); xTicks(ctx, dpr, pt, ih, X, [0, 16, 32, 48], (v) => `${v}`);
    ctx.strokeStyle = MG; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(top), Y(top)); ctx.stroke(); ctx.lineWidth = 1;
    ctx.strokeStyle = AM; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); for (let h = 1; h <= NA; h++) { const x = X(2 * h), y = Y(2 * h + Math.floor(Math.log2(h))); if (h === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); ctx.setLineDash([]);
    for (let a = 1; a <= NA; a++) for (let b = 1; b <= NA; b++) { const P = pr.c ? [a, b, pr.c] : [a, b], g = T2.g[a - 1][b - 1], h2 = 2 * Math.min(...P); ctx.fillStyle = g === h2 ? INK : CY; ctx.globalAlpha = 0.5; ctx.fillRect(X(h2) - 1.5 * dpr, Y(g) - 1.5 * dpr, 3 * dpr, 3 * dpr); }
    ctx.globalAlpha = 1;
    $('c2Title').textContent = T('每个局面一点：横 = 2·h_min，纵 = g；品红 = 本库的界 g = 2h_min，琥珀虚线 = Tyagi 原来的界', 'ONE DOT PER POSITION: ACROSS = 2·h_min, UP = g; MAGENTA = THIS LIBRARY’S BOUND g = 2h_min, AMBER DASHES = TYAGI’S EARLIER BOUND'); $('c2Meta').textContent = '';
  } else if (M.mode === 'random') {
    const R = M.R, J = R.J.filter(([n]) => n <= pr.N), X = (n) => pl + n / NR * iw, top = Math.max(2.5, ...R.J.map(([, v]) => v)) * 1.1, Y = (v) => pt + ih - v / top * ih;
    yTicks(ctx, dpr, pl, Y, [0, 2, Math.round(top / 1.1)].filter((v, i, a) => a.indexOf(v) === i), String); xTicks(ctx, dpr, pt, ih, X, [0, 60, 120], (v) => `N=${v}`);
    hline(ctx, Y(2), pl, pl + iw, AM, dpr);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); J.forEach(([n, v], i) => { if (i) ctx.lineTo(X(n), Y(v)); else ctx.moveTo(X(n), Y(v)); }); ctx.stroke(); ctx.lineWidth = 1;
    $('c2Title').textContent = T('窗口和 J_N = Σ_s Σ_{r<s} d_{N−s+r}，d_n = b_n + b_{n+1}；琥珀虚线 = 2', 'WINDOW SUM J_N = Σ_s Σ_{r<s} d_{N−s+r}, d_n = b_n + b_{n+1}; AMBER DASHES = 2'); $('c2Meta').textContent = R.allOdd ? T('全奇：从 N = max S 起不变', 'all odd: constant from N = max S') : T('含偶数：没有守恒', 'an even move: no conservation');
  } else {
    const X = (t) => pl + t / NV * iw, top = Math.max(4, ...MODEL.traj) + 1, Y = (v) => pt + ih - v / top * ih;
    yTicks(ctx, dpr, pl, Y, [0, 1, 2, 3, 4], String); xTicks(ctx, dpr, pt, ih, X, [0, 2, 4, 6, 8, 10], (v) => `t=${v}`);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); MODEL.traj.forEach((v, t) => { if (t) ctx.lineTo(X(t), Y(v)); else ctx.moveTo(X(t), Y(v)); }); ctx.stroke(); ctx.lineWidth = 1;
    MODEL.traj.forEach((v, t) => { ctx.fillStyle = t < NV ? (t % 2 ? MG : CY) : AM; ctx.beginPath(); ctx.arc(X(t), Y(v), 3 * dpr, 0, 2 * Math.PI); ctx.fill(); });
    vline(ctx, X(pr.t), pt, ih, AM, dpr);
    $('c2Title').textContent = T('每步之后局面的值（双方都按最优续下时的终局差）；青 = Admirable 落子前，品红 = Impish 落子前', 'VALUE OF THE POSITION AFTER EACH MOVE (THE FINAL DISCREPANCY UNDER OPTIMAL CONTINUATION); CYAN = BEFORE ADMIRABLE MOVES, MAGENTA = BEFORE IMPISH MOVES'); $('c2Meta').textContent = '';
  }
}

/* =====================================================================
   12. Readouts and controls
   ===================================================================== */
let syncedKey = '', toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function setRo(rows) { rows.forEach(([l, v], i) => { $(`ro${i + 1}L`).textContent = l; $(`ro${i + 1}`).textContent = v; }); }
function pill(id, label, value) { $(id).innerHTML = `${label} <strong>${value}</strong>`; }
function verdictText(R) {
  return ({ frozen: T('全为奇数、最大公因数 1：冻结定理说 a_n 不收敛', 'all odd, gcd 1: the frozen theorem says a_n does not converge'),
    proof: T(`全为奇数、最大公因数 ${R.gcd}：冻结证明的内部引理不需要 gcd 条件，同样不收敛`, `all odd, gcd ${R.gcd}: the frozen proof’s internal lemma needs no gcd condition and gives nonconvergence too`),
    lit: T('含偶数、最大公因数 1：Capitelli–Somma 证明收敛（文献）', 'an even move, gcd 1: Capitelli and Somma prove convergence (literature)'),
    none: T(`含偶数、最大公因数 ${R.gcd}：两条定理都不覆盖`, `an even move, gcd ${R.gcd}: covered by neither theorem`),
    empty: T('空集：没有步可走，a_n ≡ 0（被排除）', 'empty set: no moves, a_n ≡ 0 (excluded)') })[R.verdict];
}
function readouts() {
  const M = MODEL, pr = progress();
  if (M.mode === 'nim') {
    const T2 = pr.T;
    setRo([[T('局面 · 第三堆 c', 'Positions · third heap c'), pr.c ? `{a, b, ${pr.c}} · ${pr.c}` : T('{a, b} · 无', '{a, b} · none')],
      [T('a, b ≤ 24 的局面数 · 超过 2h_min 的', 'Positions with a, b ≤ 24 · above 2h_min'), `${T2.boards} · ${T2.viol}`],
      [T('max g / (2·h_min)', 'max g / (2·h_min)'), num(T2.maxRatio, 3)],
      [T('取到界的局面', 'Positions attaining the bound'), T2.equal.length ? T2.equal.slice(0, 4).map((P) => `{${P.join(', ')}}`).join(' ') + (T2.equal.length > 4 ? ` …（${T2.equal.length}）` : '') : T('无', 'none')],
      [T('g = 0 的局面 · 与 2-adic 规则一致', 'Positions with g = 0 · agreeing with the 2-adic rule'), `${T2.zeros} · ${T2.parityOK}/${T2.boards}`]]);
    pill('pillA', 'c', pr.c || '—'); pill('pillB', 'MAX', num(T2.maxRatio, 2)); pill('pillC', '> 2h', String(T2.viol)); pill('pillD', 'g=0', String(T2.zeros));
    $('roNote').innerHTML = T('单独一堆 n 的 Grundy 值就是 n（冻结）；两堆以上时，可取的数量受其余堆的公因数限制。', 'A single heap n has Grundy value n (frozen); with two or more heaps, what may be taken is limited by the common divisors of the other heaps.');
  } else if (M.mode === 'random') {
    const R = M.R, N = pr.N, ev = N % 2 ? N - 1 : N, od = N % 2 ? N : N - 1;
    setRo([[T('减法集 S · 最大公因数', 'Subtraction set S · gcd'), `{${R.S.join(', ')}} · ${R.gcd || '—'}`],
      [T('步数 n', 'Position n'), String(N)],
      [T('最近的偶、奇项 a_n', 'Latest even and odd terms a_n'), `${ev >= 0 ? num(R.a[ev], 4) : '—'} · ${od >= 0 ? num(R.a[od], 4) : '—'}`],
      [T('窗口和 J_N', 'Window sum J_N'), pr.J === null ? T(`N < max S = ${R.M}`, `N < max S = ${R.M}`) : num(pr.J, 4)],
      [T('结论', 'Verdict'), verdictText(R)]]);
    pill('pillA', 'S', `{${R.S.join(',')}}`); pill('pillB', 'n', String(N)); pill('pillC', 'J', pr.J === null ? '—' : num(pr.J, 3)); pill('pillD', T('奇', 'ODD'), R.allOdd ? '✓' : '✗');
    $('roNote').innerHTML = T('全奇时 a_n 的偶、奇子序列可以各自有极限，但两者不相等；证明并不需要算出这两个极限。', 'With all moves odd, the even and odd subsequences of a_n may each have a limit, but the two differ; the proof does not need to compute them.');
  } else {
    const G = M.G, full = pr.done, e1 = G.e1(pr.A), e0 = G.edges.length - e1;
    setRo([[T('图 · 博弈值 c_g', 'Graph · game value c_g'), `${({ witness: T('反例树 T', 'tree T'), path: 'P₁₀', star: T('星 K₁,₉', 'star K₁,₉') })[S.tree]} · ${G.cg}`],
      [T('已下步数 · 轮到', 'Moves played · to move'), `${pr.t} · ${full ? T('终局', 'over') : pr.turn === 'A' ? 'Admirable (0)' : 'Impish (1)'}`],
      [T('当前局面的值（最优续下）', 'Value of the position (optimal continuation)'), String(pr.value)],
      [T('最优续下时的下一步', 'Next move under optimal play'), full ? '—' : String(M.moves[pr.t])],
      [T('终局 e₁ · e₀ · 差', 'Final e₁ · e₀ · discrepancy'), full ? `${e1} · ${e0} · ${Math.abs(e1 - e0)}` : T('未到终局', 'not over yet')]]);
    pill('pillA', 'c_g', String(G.cg)); pill('pillB', 't', String(pr.t)); pill('pillC', T('值', 'VALUE'), String(pr.value)); pill('pillD', T('轮到', 'TURN'), full ? '—' : pr.turn === 'A' ? 'A' : 'I');
    $('roNote').innerHTML = S.cmoves ? T('你替某一方下了一步，之后双方都按最优续下；值的变化显示这一步好不好。', 'You made a move for one side, and both continue optimally from there; the change in value shows how good that move was.') : T('点任一空顶点，就在当前这一步替轮到的一方落子。', 'Click any free vertex to play it for the side to move at the current step.');
  }
}
const fieldsFor = { nim: [], random: ['setField'], cordial: ['treeField'] };
function syncOutputs() {
  if (dirty) { build(); dirty = false; syncedKey = ''; toasted = false; }
  const M = MODEL, key = `${S.mode}|${S.nowFrac}|${S.set.join(',')}|${S.tree}|${S.cmoves ? S.cmoves.join(',') : ''}|${TRV.lang()}`;
  if (key === syncedKey) return; syncedKey = key;
  const pr = progress();
  readouts();
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  for (const id of ['setField', 'treeField']) $(id).hidden = !fieldsFor[S.mode].includes(id);
  document.querySelectorAll('#setChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(S.set.includes(+b.dataset.s))));
  document.querySelectorAll('#treeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tree === S.tree)));
  $('presetNote').innerHTML = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = ({
    nim: T('时间轴 = 第三堆 c，从 0（只有两堆）到 16。', 'The time axis is the third heap c, from 0 (two heaps only) to 16.'),
    random: T('时间轴 = 已展开的项数 n，从 0 到 120。', 'The time axis is the number of terms n shown, from 0 to 120.'),
    cordial: T('时间轴 = 已下的步数，从 0 到 10；Admirable 先手。', 'The time axis is the number of moves played, from 0 to 10; Admirable moves first.')
  })[S.mode];
  $('litNote').innerHTML = T('表、序列和博弈值都是页面现算的数；冻结的是对一切局面成立的定理。', 'The tables, sequences and game values are numbers computed on the page; what is frozen are theorems about all positions.');
  $('clock').innerHTML = M.mode === 'nim' ? `c ${pr.c}` : M.mode === 'random' ? `n ${pr.N}` : `t ${pr.t}`;
  $('hudBig').textContent = ({ nim: () => T(`Divisor Nim · ${pr.c ? `三堆，c = ${pr.c}` : '两堆'}`, `Divisor Nim · ${pr.c ? `three heaps, c = ${pr.c}` : 'two heaps'}`), random: () => T(`随机减法 · S = {${M.R.S.join(', ')}}`, `random subtraction · S = {${M.R.S.join(', ')}}`),
    cordial: () => T(`二染色博弈 · c_g = ${M.G.cg}`, `cordiality game · c_g = ${M.G.cg}`) })[M.mode]();
  $('hudSub').textContent = ({ nim: T('竖线高 = Grundy 值；品红屋顶 = 2·h_min；琥珀点 = 必败局面；白点 = 取到界', 'stroke height = Grundy value; magenta roof = 2·h_min; amber dots = losing positions; white dots = bound attained'),
    random: T('条高 = 获胜概率 a_n；前排偶数项、后排奇数项；白框 = 守恒窗口', 'bar height = winning probability a_n; even terms in front, odd behind; white frame = the conserved window'),
    cordial: T('青 = Admirable 的 0，品红 = Impish 的 1；琥珀边 = 标签 1；白点 = 最优的下一步；紫虚线 = Impish 的配对', 'cyan = Admirable’s 0, magenta = Impish’s 1; amber edges = label 1; white dot = the optimal next move; violet dashes = Impish’s pairing') })[M.mode];
  if (!toasted && S.playing && S.nowFrac >= 1) {
    toasted = true;
    if (M.mode === 'nim') toast(T(`<b>c = 16</b>：所有局面都在 2·h_min 之下，最大比值 ${num(pr.T.maxRatio, 2)}。`, `<b>c = 16</b>: every position is under 2·h_min, largest ratio ${num(pr.T.maxRatio, 2)}.`));
    else if (M.mode === 'random') toast(M.R.allOdd ? T(`<b>n = 120</b>：偶、奇两条子序列仍然分开，J = ${num(pr.J, 3)} 没有变。`, `<b>n = 120</b>: the even and odd subsequences are still apart, and J = ${num(pr.J, 3)} has not changed.`) : T('<b>n = 120</b>：两条子序列已经合拢。', '<b>n = 120</b>: the two subsequences have merged.'));
    else { const G = M.G, e1 = G.e1(pr.A); toast(T(`<b>终局</b>：差 |e₁ − e₀| = ${Math.abs(2 * e1 - G.edges.length)}。`, `<b>Game over</b>: discrepancy |e₁ − e₀| = ${Math.abs(2 * e1 - G.edges.length)}.`)); }
  }
}
function syncRail() {
  const key = `${S.mode}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  const marks = S.mode === 'nim' ? [[0, T('两堆', 'two heaps')], [0.25, 'c=4'], [0.5, 'c=8'], [0.75, 'c=12'], [1, 'c=16']] : S.mode === 'random' ? [[0, 'n=0'], [0.25, '30'], [0.5, '60'], [0.75, '90'], [1, 'n=120']] : Array.from({ length: NV + 1 }, (_, t) => [t / NV, `${t}`]);
  $('marks').innerHTML = marks.map(([f, s], i) => `<i class="${i === 0 ? 'first' : i === marks.length - 1 ? 'last' : ''}" style="left:${(f * 100).toFixed(2)}%">${s}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => {
  const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'nim'; if (S.mode === m) return;
  S.mode = m; S.nowFrac = 0; S.cmoves = null; custom(); build(); setCamPreset(m === 'random' ? 'front' : m === 'cordial' ? 'top' : 'iso');
}));
document.querySelectorAll('#setChips .chip').forEach((b) => b.addEventListener('click', () => { const s = +b.dataset.s; S.set = S.set.includes(s) ? S.set.filter((x) => x !== s) : S.set.concat([s]).sort((x, y) => x - y); custom(); }));
document.querySelectorAll('#treeChips .chip').forEach((b) => b.addEventListener('click', () => { const t = TREES[b.dataset.tree] ? b.dataset.tree : 'witness'; if (t === S.tree) return; S.tree = t; S.cmoves = null; custom(); }));
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.mode = p.mode; if (p.set) S.set = p.set.slice(); if (p.tree) S.tree = p.tree; S.cmoves = null;
  S.preset = name; markPreset(); dirty = true; build(); setCamPreset(p.cam || (p.mode === 'random' ? 'front' : 'iso'));
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
const stepOf = () => (S.mode === 'nim' ? 1 / CMAX : S.mode === 'random' ? 1 / NR : 1 / NV);
document.addEventListener('keydown', (ev) => {
  if (ev.target && (ev.target.tagName === 'INPUT' && ev.target.type !== 'range')) return;
  if (drawer.isOpen()) return;
  if (ev.key === ' ' && !(ev.target && ev.target.tagName === 'BUTTON')) { ev.preventDefault(); S.playing = !S.playing; S.hold = 0; setPlayUI(); }
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) { ev.preventDefault(); jumpTo(S.nowFrac + (ev.key === 'ArrowRight' ? 1 : -1) * stepOf()); }
  else if (ev.key === 'e' || ev.key === 'E') jumpTo(1);
});

/* =====================================================================
   13. Main loop
   ===================================================================== */
let lastT = performance.now(), frameCount = 0;
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
  syncOutputs(); syncRail();
  if (glOK) { updateCamera(dtSec); updateGL(); renderer.render(scene3, camera); updateTags(); }
  drawMain(); drawSide();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { syncedKey = ''; syncOutputs(); $('marks').dataset.key = ''; });

/* read-only probe for automated browser tests */
window.GG_DEBUG = {
  pending: () => dirty || syncedKey !== `${S.mode}|${S.nowFrac}|${S.set.join(',')}|${S.tree}|${S.cmoves ? S.cmoves.join(',') : ''}|${TRV.lang()}`,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, pr = progress(), o = { mode: M.mode, frac: S.nowFrac };
    if (M.mode === 'nim') Object.assign(o, { c: pr.c, table: pr.T.g, maxRatio: pr.T.maxRatio, equal: pr.T.equal, zeros: pr.T.zeros, parityOK: pr.T.parityOK, viol: pr.T.viol, boards: pr.T.boards });
    if (M.mode === 'random') Object.assign(o, { S: M.R.S, N: pr.N, a: M.R.a, d: M.R.d, J: M.R.J, Jnow: pr.J, gcd: M.R.gcd, allOdd: M.R.allOdd, verdict: M.R.verdict });
    if (M.mode === 'cordial') Object.assign(o, { tree: S.tree, edges: M.G.edges, cg: M.G.cg, moves: M.moves, t: pr.t, A: pr.A, B: pr.B, value: pr.value, traj: M.traj, pathValues: pathValues(), treeValue: gameFor('witness').cg, starValue: gameFor('star').cg });
    return o;
  },
  grundy: (P) => grundy(P),
  vertexScreen: (u) => vertexScreen(u),
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('tree10'); S.playing = false; setPlayUI(); S.nowFrac = 0.6; $('now').value = S.nowFrac; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('nim2');
setPlayUI();
requestAnimationFrame(frame);
})();
