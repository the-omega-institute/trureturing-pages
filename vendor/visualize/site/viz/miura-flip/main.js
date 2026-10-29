/* MIURA//FLIP · Miura-ori 翻转图上的高度函数
   Height functions on the m × n grid (neighbouring cells differ by exactly 1) encode Gupta's Miura-ori states; a flip changes a
   strict local extremum by 2. Three models: a flip path chosen greedily so that the flip distance disp((h − h*)/2) drops by one at
   every step (from −A to A it has D(m, n) steps), checked against breadth-first search on small grids; the dispersion of an
   integer 1-Lipschitz function with its best integer centre, against D(m, n) (the frozen inequality (4)); and the proof's
   rearrangement, which sorts every row and then every column. Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, cyan: CY, magenta: MG } = TRV.palette;
const MODES = ['walk', 'disp', 'sort'];
const RUN = { walk: 16, disp: 12, sort: 14 };
const GMIN = 2, GMAX = 9;
const ENUM_STATES = 3000;        // breadth-first search over all states up to this many
const ENUM_LIP = 40000;          // exhaustive 1-Lipschitz enumeration up to this many functions
const MOD3 = [COL.cyan, COL.amber, COL.magenta], MOD3_CSS = [CY, AM, MG];

/* =====================================================================
   2. Grid functions
   ===================================================================== */
const nbrs = (m, n, k) => { const i = Math.floor(k / n), j = k % n, r = []; if (i > 0) r.push(k - n); if (i < m - 1) r.push(k + n); if (j > 0) r.push(k - 1); if (j < n - 1) r.push(k + 1); return r; };
const ramp = (m, n) => Array.from({ length: m * n }, (_, k) => Math.floor(k / n) + (k % n));
const checker = (m, n) => ramp(m, n).map((x) => x % 2);
function isHeight(m, n, h) { for (let k = 0; k < m * n; k++) for (const u of nbrs(m, n, k)) if (Math.abs(h[u] - h[k]) !== 1) return false; return true; }
function isLip(m, n, f) { for (let k = 0; k < m * n; k++) for (const u of nbrs(m, n, k)) if (Math.abs(f[u] - f[k]) > 1) return false; return true; }
function costAt(f, K) { let s = 0; for (const x of f) s += Math.abs(x - K); return s; }
function disp(f) {   // min over integer centres; a lower median is an integer minimizer
  const s = f.slice().sort((a, b) => a - b), K = s[(s.length - 1) >> 1]; return { value: costAt(f, K), K };
}
const Dmn = (m, n) => disp(ramp(m, n)).value;
function extremaOf(m, n, h) {   // strict local minima (every neighbour higher by 1) and maxima (every neighbour lower by 1)
  const minima = [], maxima = [];
  for (let k = 0; k < m * n; k++) { const ns = nbrs(m, n, k); if (ns.every((u) => h[u] === h[k] + 1)) minima.push(k); else if (ns.every((u) => h[u] === h[k] - 1)) maxima.push(k); }
  return { minima, maxima };
}
function flipAt(m, n, h, k) { const { minima, maxima } = extremaOf(m, n, h); if (minima.includes(k)) { const g = h.slice(); g[k] += 2; return g; } if (maxima.includes(k)) { const g = h.slice(); g[k] -= 2; return g; } return null; }
const flipDist = (h1, h2) => disp(h1.map((x, k) => (x - h2[k]) / 2)).value;
function sideOf(m, n, cells) {   // the common sides of all cells (corners belong to two sides)
  if (!cells.length) return [];
  const sides = []; const rows = cells.map((k) => Math.floor(k / n)), cols = cells.map((k) => k % n);
  if (rows.every((i) => i === 0)) sides.push('top'); if (rows.every((i) => i === m - 1)) sides.push('bottom');
  if (cols.every((j) => j === 0)) sides.push('left'); if (cols.every((j) => j === n - 1)) sides.push('right');
  return sides;
}
function randomHeight(m, n, seed) {   // random flips from the ramp
  const rnd = TRV.mulberry32(seed); let h = ramp(m, n);
  for (let t = 0; t < 40 * m * n; t++) { const { minima, maxima } = extremaOf(m, n, h), all = minima.concat(maxima); h = flipAt(m, n, h, all[Math.floor(rnd() * all.length)]); }
  return h.map((x) => x - h[0]);
}
function randomLip(m, n, seed) {   // random ±1 moves from a random height function that keep every neighbouring difference at most 1
  const rnd = TRV.mulberry32(seed ^ 0x5bd1), f = randomHeight(m, n, seed);
  for (let t = 0; t < 80 * m * n; t++) { const k = Math.floor(rnd() * m * n), s = rnd() < 0.5 ? -1 : 1; f[k] += s; if (nbrs(m, n, k).some((u) => Math.abs(f[u] - f[k]) > 1)) f[k] -= s; }
  return f.map((x) => x - f[0]);
}
function geodesic(m, n, h0, h1) {   // greedy: flip the first extremum that lowers the flip distance by one
  const path = [h0.slice()], cells = [null]; let cur = h0.slice(), d = flipDist(cur, h1);
  while (d > 0) {
    const { minima, maxima } = extremaOf(m, n, cur); let next = null, at = -1;
    for (const k of minima.concat(maxima).sort((a, b) => a - b)) { const g = flipAt(m, n, cur, k); if (flipDist(g, h1) === d - 1) { next = g; at = k; break; } }
    if (!next) return { path, cells, stuck: true };
    cur = next; d--; path.push(cur); cells.push(at);
  }
  return { path, cells, stuck: false };
}
function sortRows(m, n, f) { const g = f.slice(); for (let i = 0; i < m; i++) { const r = g.slice(i * n, i * n + n).sort((a, b) => a - b); for (let j = 0; j < n; j++) g[i * n + j] = r[j]; } return g; }
function sortCols(m, n, f) { const g = f.slice(); for (let j = 0; j < n; j++) { const c = []; for (let i = 0; i < m; i++) c.push(g[i * n + j]); c.sort((a, b) => a - b); for (let i = 0; i < m; i++) g[i * n + j] = c[i]; } return g; }
const increasing = (m, n, f) => { for (let k = 0; k < m * n; k++) { if (k % n < n - 1 && f[k + 1] < f[k]) return false; if (k + n < m * n && f[k + n] < f[k]) return false; } return true; };

/* small grids: every state of the flip graph and every 1-Lipschitz function */
const ENUM = new Map();
function heightStates(m, n, cap) {
  const N = m * n, out = [], h = new Array(N).fill(0);
  const rec = (k) => { if (out.length > cap) return; if (k === N) { out.push(h.slice()); return; } const i = Math.floor(k / n), j = k % n; const base = j > 0 ? h[k - 1] : h[k - n];
    for (const v of k === 0 ? [0] : [base - 1, base + 1]) { if (i > 0 && Math.abs(v - h[k - n]) !== 1) continue; h[k] = v; rec(k + 1); } };
  rec(0); return out.length > cap ? null : out;
}
function flipGraph(m, n) {
  const key = `${m}x${n}`; if (ENUM.has(key)) return ENUM.get(key);
  const S = heightStates(m, n, ENUM_STATES); if (!S) { ENUM.set(key, null); return null; }
  const index = new Map(S.map((h, i) => [h.join(','), i])), adj = S.map(() => []);
  S.forEach((h, a) => { const { minima, maxima } = extremaOf(m, n, h); for (const k of minima.concat(maxima)) { const g = flipAt(m, n, h, k), c = g[0]; adj[a].push(index.get(g.map((x) => x - c).join(','))); } });
  let diameter = 0, mismatch = 0, pairs = 0; const degrees = {}; const N = S.length, dist = new Int32Array(N), q = new Int32Array(N), lo = -(m + n), cnt = new Int32Array(2 * (m + n) + 1);
  adj.forEach((a) => { degrees[a.length] = (degrees[a.length] || 0) + 1; });
  for (let s = 0; s < N; s++) {
    dist.fill(-1); dist[s] = 0; q[0] = s; let qe = 1;
    for (let qi = 0; qi < qe; qi++) { const v = q[qi]; for (const w of adj[v]) if (dist[w] < 0) { dist[w] = dist[v] + 1; q[qe++] = w; } }
    for (let t = 0; t < N; t++) {
      if (dist[t] > diameter) diameter = dist[t];
      cnt.fill(0); const A = S[s], B = S[t]; for (let k = 0; k < m * n; k++) cnt[(A[k] - B[k]) / 2 - lo]++;
      let acc = 0, med = 0; const half = (m * n - 1) >> 1; for (let v = 0; v < cnt.length; v++) { acc += cnt[v]; if (acc > half) { med = v; break; } }
      let cost = 0; for (let v = 0; v < cnt.length; v++) cost += cnt[v] * Math.abs(v - med);
      pairs++; if (cost !== dist[t]) mismatch++;
    }
  }
  const r = { states: N, diameter, mismatch, pairs, degrees, connected: true }; ENUM.set(key, r); return r;
}
const LIPENUM = new Map();
function lipMax(m, n) {   // the largest dispersion over every 1-Lipschitz function normalized at the first cell
  const key = `${m}x${n}`; if (LIPENUM.has(key)) return LIPENUM.get(key);
  const N = m * n, f = new Array(N).fill(0); let count = 0, best = -1, over = false;
  const rec = (k) => { if (over) return; if (k === N) { count++; if (count > ENUM_LIP) { over = true; return; } const d = disp(f).value; if (d > best) best = d; return; }
    const i = Math.floor(k / n), j = k % n, base = j > 0 ? f[k - 1] : f[k - n];
    for (const v of k === 0 ? [0] : [base - 1, base, base + 1]) { if (i > 0 && Math.abs(v - f[k - n]) > 1) continue; f[k] = v; rec(k + 1); } };
  rec(0); const r = over ? null : { count, best }; LIPENUM.set(key, r); return r;
}

/* =====================================================================
   3. State and presets
   ===================================================================== */
const S = { mode: 'walk', m: 6, n: 6, fn: 'ramp', seed: 11, tool: 'up', custom: null, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'geo' };
const PRESETS = {
  geo: { mode: 'walk', m: 6, n: 6, fn: 'ramp', frac: 0, play: true,
    zh: '6 × 6：从下斜坡 −A 走到上斜坡 A（A = i + j）。每一步翻转一个严格局部极值，让翻转距离 disp((h − A)/2) 减 1；一共 70 步，正是 D(6, 6)。按卷宗的论证，这就是翻转图的直径。',
    en: '6 × 6: from the downward ramp −A to the upward ramp A (A = i + j). Each step flips one strict local extremum and lowers the flip distance disp((h − A)/2) by 1; there are 70 steps, exactly D(6, 6). By the dossier’s argument, this is the diameter of the flip graph.' },
  small: { mode: 'walk', m: 4, n: 4, fn: 'ramp', frac: 0, play: true,
    zh: '4 × 4：页面列出全部 2604 个状态，用广度优先搜索算出直径 20 = D(4, 4)，并核对每一对状态的翻转距离都等于 disp((h₁ − h₂)/2)。下方是从 −A 到 A 的 20 步。',
    en: '4 × 4: the page lists all 2604 states, finds the diameter 20 = D(4, 4) by breadth-first search, and checks that every pair of states is at flip distance disp((h₁ − h₂)/2). Below are the 20 steps from −A to A.' },
  wander: { mode: 'walk', m: 7, n: 5, fn: 'random', seed: 11, frac: 0, play: true,
    zh: '7 × 5 的一个随机状态走到斜坡 A：路长等于它到 A 的翻转距离，比直径 D(7, 5) 短。点下方网格图里的极值格可以亲手翻转。',
    en: 'A random 7 × 5 state walks to the ramp A: the path length is its flip distance to A, shorter than the diameter D(7, 5). Click an extremal cell in the grid chart below to flip it yourself.' },
  extrema: { mode: 'walk', m: 8, n: 8, fn: 'checker', frac: 0, play: false,
    zh: '棋盘状态 h = (i + j) mod 2：每个格子都是严格局部极值，64 个格子都能翻转，度数 d = 64 是最大的。猜想 8.3 计数的是极值个数固定、极小值不全在同一条边上的状态。',
    en: 'The checkerboard state h = (i + j) mod 2: every cell is a strict local extremum, all 64 can flip, and its degree d = 64 is the largest. Conjecture 8.3 counts the states with a fixed number of extrema whose minima are not all on one side.' },
  ramp: { mode: 'disp', m: 6, n: 6, fn: 'ramp', frac: 0.5, play: false,
    zh: '斜坡 φ = i + j：它的离散度就是 D(6, 6) = 70，最优中心在中间。冻结定理说，任何 1-Lipschitz 函数都不会比它更分散。',
    en: 'The ramp φ = i + j: its dispersion is exactly D(6, 6) = 70, with the best centre in the middle. The frozen theorem says no 1-Lipschitz function is more spread out.' },
  lip: { mode: 'disp', m: 6, n: 6, fn: 'random', seed: 5, frac: 0, play: true,
    zh: '随机的 1-Lipschitz 函数（相邻差可以是 0）。时间轴把中心 K 从低扫到高：Σ|φ − K| 在中位数处最小，那就是离散度，始终不超过 D(6, 6) = 70。',
    en: 'A random 1-Lipschitz function (neighbouring differences may be 0). The time axis sweeps the centre K upwards: Σ|φ − K| is smallest at a median, which is the dispersion, never above D(6, 6) = 70.' },
  sortL: { mode: 'sort', m: 6, n: 6, fn: 'random', seed: 3, frac: 0, play: true,
    zh: '证明的重排：先把每一行从小到大排好，再把每一列排好，得到行列都递增的 F。值的多重集没变，所以离散度不变；相邻差仍不超过 1。最后与斜坡 A 比较：FKG 不等式给出 disp(F) ≤ disp(A) = D。',
    en: 'The proof’s rearrangement: sort every row, then every column, to get an F increasing along rows and columns. The multiset of values is unchanged, so the dispersion is unchanged, and neighbouring differences stay at most 1. Finally compare with the ramp A: the FKG inequality gives disp(F) ≤ disp(A) = D.' },
  sortH: { mode: 'sort', m: 6, n: 6, fn: 'height', seed: 9, frac: 0, play: true,
    zh: '从一个高度函数（相邻差恰为 ±1）开始重排：排序后相邻差变成 0 或 1，不再是高度函数，但仍是 1-Lipschitz——这正是不等式 (4) 要对所有 1-Lipschitz 函数成立的原因。',
    en: 'Rearranging a height function (neighbouring differences exactly ±1): after sorting the differences become 0 or 1, so it is no longer a height function but still 1-Lipschitz. That is why inequality (4) has to hold for every 1-Lipschitz function.' }
};

/* =====================================================================
   4. The model
   ===================================================================== */
let MODEL = null, dirty = true;
function sourceFunction() {
  const { m, n } = S;
  if (S.custom && S.custom.length === m * n) return S.custom.slice();
  if (S.mode === 'walk') return S.fn === 'random' ? randomHeight(m, n, S.seed) : S.fn === 'checker' ? checker(m, n) : ramp(m, n).map((x) => -x);
  if (S.mode === 'sort' && S.fn === 'height') return randomHeight(m, n, S.seed);
  return S.fn === 'random' ? randomLip(m, n, S.seed) : S.fn === 'flat' ? new Array(m * n).fill(0) : ramp(m, n);
}
function build() {
  const { m, n } = S, f = sourceFunction(), D = Dmn(m, n);
  if (S.mode === 'walk') {
    const target = ramp(m, n), g = geodesic(m, n, f, target), lo = Math.min(...g.path.flat()), hi = Math.max(...g.path.flat());
    MODEL = { mode: 'walk', m, n, D, source: f, target, ...g, T: g.path.length - 1, lo, hi, graph: flipGraph(m, n) };
  } else if (S.mode === 'disp') {
    const d = disp(f), lo = Math.min(...f), hi = Math.max(...f);
    MODEL = { mode: 'disp', m, n, D, f, d, lo, hi, lipMax: lipMax(m, n), lip: isLip(m, n, f) };
  } else {
    const R = sortRows(m, n, f), F = sortCols(m, n, R), A = ramp(m, n).map((x) => x + f[0]);
    const all = f.concat(A), lo = Math.min(...all), hi = Math.max(...all);
    MODEL = { mode: 'sort', m, n, D, stages: [f, R, F, A], lo, hi };
  }
}
function progress() {
  const M = MODEL, f = Math.min(1, Math.max(0, S.nowFrac));
  if (M.mode === 'walk') { const t = Math.round(f * M.T), h = M.path[t], ex = extremaOf(M.m, M.n, h); return { f, t, h, ex, dist: flipDist(h, M.target), cell: M.cells[t] }; }
  if (M.mode === 'disp') { const K = Math.round(M.lo - 1 + f * (M.hi - M.lo + 2)); return { f, K, cost: costAt(M.f, K) }; }
  const s = Math.min(3, f * 3), a = Math.min(2, Math.floor(s)), w = TRV.smooth((s - a - 0.35) / 0.65), A = M.stages[a], B = M.stages[a + 1];   // hold each stage, then move
  const stage = s >= 3 ? 3 : w < 0.5 ? a : a + 1;
  return { f, seg: a, stage, h: A.map((x, k) => x + (B[k] - x) * (reduceMotion ? Math.round(w) : w)) };
}

/* =====================================================================
   5. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const neg = (x) => String(x).replace('-', '−');
const sideName = (s) => ({ top: T('上边', 'top'), bottom: T('下边', 'bottom'), left: T('左边', 'left'), right: T('右边', 'right') })[s];

/* =====================================================================
   6. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 20000, PTS_MAX = 2000;
const CAMS = { iso: [0.7, 0.95, 15], front: [0.0001, 1.5, 15], top: [0.0001, 0.06, 14] };
const cam = { theta: 0.7, phi: 0.95, r: 15, tTheta: 0.7, tPhi: 0.95, tR: 15 };
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
function geom() {   // cell size and height scale for the current model
  const M = MODEL, cs = Math.min(0.95, 7.2 / Math.max(M.m, M.n)), span = Math.max(1, M.hi - M.lo), hs = Math.min(0.42, 4.6 / span), mid = (M.hi + M.lo) / 2;
  return { cs, X: (j) => (j - (M.n - 1) / 2) * cs, Z: (i) => (i - (M.m - 1) / 2) * cs, Y: (v) => (v - mid) * hs, floor: (M.lo - 0.6 - mid) * hs };
}
const heightCol = (v, lo, hi) => { const t = hi > lo ? (v - lo) / (hi - lo) : 0.5; return [COL.cyan[0] + (COL.magenta[0] - COL.cyan[0]) * t, COL.cyan[1] + (COL.magenta[1] - COL.cyan[1]) * t, COL.cyan[2] + (COL.magenta[2] - COL.cyan[2]) * t]; };
const mod3 = (v) => ((v % 3) + 3) % 3;
function updateGL() {
  const M = MODEL, pr = progress(), G = geom(), { m, n } = M, h2 = G.cs / 2 * 0.97;
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp[3 * v] = a[0]; Pp[3 * v + 1] = a[1]; Pp[3 * v + 2] = a[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; Pp[3 * v] = b[0]; Pp[3 * v + 1] = b[1]; Pp[3 * v + 2] = b[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  const tile = (k, y, col, kk) => { const i = Math.floor(k / n), j = k % n, x = G.X(j), z = G.Z(i), c = [[x - h2, z - h2], [x + h2, z - h2], [x + h2, z + h2], [x - h2, z + h2]]; for (let e = 0; e < 4; e++) seg([c[e][0], y, c[e][1]], [c[(e + 1) % 4][0], y, c[(e + 1) % 4][1]], col, kk); };
  // the floor grid
  const x0 = G.X(-0.5), x1 = G.X(n - 0.5), z0 = G.Z(-0.5), z1 = G.Z(m - 0.5);
  for (let j = 0; j <= n; j++) seg([G.X(j - 0.5), G.floor, z0], [G.X(j - 0.5), G.floor, z1], COL.gray, 0.28);
  for (let i = 0; i <= m; i++) seg([x0, G.floor, G.Z(i - 0.5)], [x1, G.floor, G.Z(i - 0.5)], COL.gray, 0.28);
  const H = M.mode === 'walk' ? pr.h : M.mode === 'disp' ? M.f : pr.h;
  const colOf = (v) => (M.mode === 'walk' ? MOD3[mod3(Math.round(v))] : heightCol(v, M.lo, M.hi));
  for (let k = 0; k < m * n; k++) {
    const i = Math.floor(k / n), j = k % n, y = G.Y(H[k]), col = colOf(H[k]);
    tile(k, y, col, 0.9);
    if (j < n - 1 && H[k + 1] !== H[k]) { const x = G.X(j) + G.cs / 2, y2 = G.Y(H[k + 1]); for (const dz of [-h2, h2]) seg([x, y, G.Z(i) + dz], [x, y2, G.Z(i) + dz], COL.gray, 0.45); }   // riser to the right neighbour
    if (i < m - 1 && H[k + n] !== H[k]) { const z = G.Z(i) + G.cs / 2, y2 = G.Y(H[k + n]); for (const dx of [-h2, h2]) seg([G.X(j) + dx, y, z], [G.X(j) + dx, y2, z], COL.gray, 0.45); }   // riser to the neighbour below
    if (i === m - 1 || j === n - 1 || i === 0 || j === 0) seg([G.X(j), G.floor, G.Z(i)], [G.X(j), y, G.Z(i)], col, 0.14);
  }
  if (M.mode === 'walk') {
    for (const k of pr.ex.minima) dot([G.X(k % n), G.Y(pr.h[k]) + 0.12, G.Z(Math.floor(k / n))], COL.cyan, 1, 1.5);
    for (const k of pr.ex.maxima) dot([G.X(k % n), G.Y(pr.h[k]) + 0.12, G.Z(Math.floor(k / n))], COL.magenta, 1, 1.5);
    if (pr.cell !== null && pr.cell !== undefined) { const k = pr.cell; tile(k, G.Y(pr.h[k]) + 0.02, [1, 1, 1], 1); dot([G.X(k % n), G.Y(pr.h[k]) + 0.3, G.Z(Math.floor(k / n))], COL.amber, 1, 2.2); }
  } else if (M.mode === 'disp') {
    const yK = G.Y(pr.K);
    for (let j = 0; j <= n; j++) seg([G.X(j - 0.5), yK, z0], [G.X(j - 0.5), yK, z1], COL.amber, 0.35);
    for (let i = 0; i <= m; i++) seg([x0, yK, G.Z(i - 0.5)], [x1, yK, G.Z(i - 0.5)], COL.amber, 0.35);
    for (let k = 0; k < m * n; k++) { const i = Math.floor(k / n), j = k % n; if (M.f[k] !== pr.K) seg([G.X(j), yK, G.Z(i)], [G.X(j), G.Y(M.f[k]), G.Z(i)], M.f[k] > pr.K ? COL.magenta : COL.cyan, 0.9); }
  } else if (pr.stage === 3 || (pr.seg === 2 && pr.f > 0.7)) {
    const A = M.stages[3]; for (let k = 0; k < m * n; k++) dot([G.X(k % n), G.Y(A[k]), G.Z(Math.floor(k / n))], COL.amber, 0.55, 0.9);
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
  camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
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
  const M = MODEL, pr = progress(), G = geom(); let k = 0;
  const put = (text, p, cls) => { const el = tagAt(k++, cls); el.textContent = text; placeTag(el, p); };
  put('(1, 1)', [G.X(0) - 0.3, G.floor, G.Z(0) - 0.3], 'tick'); put(`(${M.m}, ${M.n})`, [G.X(M.n - 1) + 0.3, G.floor, G.Z(M.m - 1) + 0.3], 'tick');
  put('j →', [G.X(M.n - 1) + 0.7, G.floor, G.Z(0) - 0.3], 'tick'); put('i ↓', [G.X(0) - 0.6, G.floor, G.Z(M.m - 1) + 0.6], 'tick');
  if (M.mode === 'walk' && pr.cell !== null && pr.cell !== undefined) { const c = pr.cell; put(T(`第 ${pr.t} 步`, `step ${pr.t}`), [G.X(c % M.n), G.Y(pr.h[c]) + 0.75, G.Z(Math.floor(c / M.n))], 'hot'); }
  if (M.mode === 'disp') put(`K = ${neg(pr.K)}`, [G.X(M.n - 0.5) + 0.6, G.Y(pr.K), G.Z(-0.5)], 'hot');
  if (M.mode === 'sort' && pr.stage === 3) put('A = i + j', [G.X(M.n - 1) + 0.4, G.Y(M.stages[3][M.m * M.n - 1]) + 0.3, G.Z(M.m - 1)], 'hot');
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
let cellHits = null;
function drawGrid(F, x0, w, vals, opt) {   // one grid map: returns its cell geometry in CSS pixels
  const { ctx, dpr, pt, ih } = F, { m, n } = MODEL, c = Math.min(w / n, (ih - 4 * dpr) / m), ox = x0 + (w - c * n) / 2, oy = pt + (ih - c * m) / 2;
  for (let k = 0; k < m * n; k++) {
    const i = Math.floor(k / n), j = k % n, x = ox + j * c, y = oy + i * c, vv = vals[k];
    ctx.fillStyle = opt.mod3 ? MOD3_CSS[mod3(Math.round(vv))] : CY; ctx.globalAlpha = opt.mod3 ? 0.28 : 0.1 + 0.5 * (opt.hi > opt.lo ? (vv - opt.lo) / (opt.hi - opt.lo) : 0.5);
    ctx.fillRect(x + 1, y + 1, c - 2, c - 2); ctx.globalAlpha = 1;
    const mark = opt.min && opt.min.includes(k) ? CY : opt.max && opt.max.includes(k) ? MG : opt.hot === k ? AM : null;
    ctx.strokeStyle = mark || FAINT; ctx.lineWidth = (mark ? 2 : 1) * dpr; ctx.strokeRect(x + 1, y + 1, c - 2, c - 2); ctx.lineWidth = 1;
    if (c > 16 * dpr) { ctx.fillStyle = mark || INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(Math.round(vv * 10) / 10).replace('-', '−'), x + c / 2, y + c / 2); }
  }
  if (opt.label) { ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(opt.label, ox + c * n / 2, oy + c * m + 2 * dpr); }
  return { ox: ox / dpr, oy: oy / dpr, c: c / dpr };
}
function drawMain() {
  const M = MODEL, F = frame2d(cv1, 10); if (F.iw < 60 || F.ih < 40) return;
  const pr = progress(), { pl, iw } = F;
  cv1.classList.toggle('editable', true);
  if (M.mode === 'walk') cellHits = drawGrid(F, pl, iw, pr.h, { mod3: true, min: pr.ex.minima, max: pr.ex.maxima, hot: pr.cell });
  else if (M.mode === 'disp') cellHits = drawGrid(F, pl, iw, M.f, { lo: M.lo, hi: M.hi, hot: null });
  else {
    const half = iw / 2 - 6 * F.dpr;
    cellHits = drawGrid({ ...F, ih: F.ih - 12 * F.dpr }, pl, half, M.stages[0], { lo: M.lo, hi: M.hi, label: 'φ' });
    drawGrid({ ...F, ih: F.ih - 12 * F.dpr }, pl + iw / 2 + 6 * F.dpr, half, M.stages[pr.stage], { lo: M.lo, hi: M.hi, label: [T('φ', 'φ'), T('行已排序', 'rows sorted'), T('F：行、列都已排序', 'F: rows and columns sorted'), T('斜坡 A', 'the ramp A')][pr.stage] });
  }
}
function costChart(F, curves, D) {   // Σ|f − K| against K for several functions, with D as a line
  const { ctx, dpr, pl, pt, iw, ih } = F; let lo = Infinity, hi = -Infinity;
  for (const c of curves) { lo = Math.min(lo, ...c.f); hi = Math.max(hi, ...c.f); }
  lo -= 1; hi += 1; const Ks = []; for (let K = Math.floor(lo); K <= Math.ceil(hi); K++) Ks.push(K);
  const ys = curves.map((c) => Ks.map((K) => costAt(c.f, K))), ymax = Math.max(D, ...ys.flat()) * 1.05;
  const X = (K) => pl + iw * (K - Ks[0]) / Math.max(1, Ks[Ks.length - 1] - Ks[0]), Y = (v) => pt + ih - ih * v / ymax;
  ctx.strokeStyle = AM; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(pl, Y(D)); ctx.lineTo(pl + iw, Y(D)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = AM; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(`D = ${D}`, pl + 4 * dpr, Y(D) - 2 * dpr);
  curves.forEach((c, ci) => { ctx.strokeStyle = c.col; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); Ks.forEach((K, i) => { const x = X(K), y = Y(ys[ci][i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); ctx.lineWidth = 1;
    const mn = Math.min(...ys[ci]), K0 = Ks[ys[ci].indexOf(mn)]; ctx.fillStyle = c.col; ctx.beginPath(); ctx.arc(X(K0), Y(mn), 3.4 * dpr, 0, 2 * Math.PI); ctx.fill(); });
  ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; const step = Math.max(1, Math.ceil(Ks.length / 8)); Ks.forEach((K, i) => { if (i % step === 0) ctx.fillText(String(K).replace('-', '−'), X(K), pt + ih + 3 * dpr); });
  return { X, Y };
}
function drawSide() {
  const M = MODEL, F = frame2d(cv2, 30); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  if (M.mode === 'walk') {
    const Tn = Math.max(1, M.T), dmax = Math.max(1, ...M.path.map((h) => { const e = extremaOf(M.m, M.n, h); return e.minima.length + e.maxima.length; }), M.T);
    const X = (t) => pl + iw * t / Tn, Y = (v) => pt + ih - ih * v / dmax;
    ctx.strokeStyle = CY; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); for (let t = 0; t <= M.T; t++) { const d = M.T - t; if (t) ctx.lineTo(X(t), Y(d)); else ctx.moveTo(X(t), Y(d)); } ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = AM; for (let t = 0; t <= M.T; t++) { const e = extremaOf(M.m, M.n, M.path[t]); ctx.fillRect(X(t) - 1 * dpr, Y(e.minima.length + e.maxima.length) - 1 * dpr, 2 * dpr, 2 * dpr); }
    ctx.strokeStyle = INK; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(X(pr.t), pt); ctx.lineTo(X(pr.t), pt + ih); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('0', X(0), pt + ih + 3 * dpr); ctx.fillText(String(M.T), X(M.T), pt + ih + 3 * dpr);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(dmax), pl - 3 * dpr, pt + 4 * dpr); ctx.fillText('0', pl - 3 * dpr, pt + ih);
    $('c2Meta').textContent = T(`青 = 到 A 的距离 · 琥珀 = 度数 d`, `cyan = distance to A · amber = degree d`);
  } else if (M.mode === 'disp') {
    const g = costChart(F, [{ f: M.f, col: CY }, { f: ramp(M.m, M.n).map((x) => x + M.f[0]), col: MG }], M.D);
    ctx.strokeStyle = INK; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(g.X(pr.K), pt); ctx.lineTo(g.X(pr.K), pt + ih); ctx.stroke(); ctx.setLineDash([]);
    $('c2Meta').textContent = T('青 = Σ|φ − K| · 品红 = 斜坡 · 琥珀线 = D', 'cyan = Σ|φ − K| · magenta = the ramp · amber line = D');
  } else {
    costChart(F, [{ f: pr.h, col: CY }, { f: M.stages[3], col: MG }], M.D);
    $('c2Meta').textContent = T('青 = 当前阶段的 Σ|· − K| · 品红 = 斜坡 A', 'cyan = Σ|· − K| of the current stage · magenta = the ramp A');
  }
}

/* =====================================================================
   10. Readouts and controls
   ===================================================================== */
let syncedKey = '', toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function setRo(rows) { rows.forEach(([l, v], i) => { $(`ro${i + 1}L`).textContent = l; $(`ro${i + 1}`).textContent = v; }); }
function pill(id, label, value) { $(id).innerHTML = `${label} <strong>${value}</strong>`; }
const FN_NAME = { ramp: ['斜坡', 'ramp'], random: ['随机', 'random'], flat: ['平地', 'flat'], checker: ['棋盘', 'checkerboard'], height: ['随机高度函数', 'random height function'] };
const fnLabel = () => (S.custom ? T('自定义', 'custom') : S.mode === 'walk' && S.fn === 'ramp' ? T('下斜坡 −A', 'downward ramp −A') : T(...FN_NAME[S.fn]));
function closedForm(m, n) { if (Math.min(m, n) === 2) return [`⌈${Math.max(m, n)}²/2⌉`, Math.ceil(Math.max(m, n) ** 2 / 2)]; if (m === n) return [`(${m}³ − ${m})/3`, (m ** 3 - m) / 3]; return null; }
function readouts() {
  const M = MODEL, pr = progress(), cf = closedForm(M.m, M.n), grid = `${M.m} × ${M.n}`;
  if (M.mode === 'walk') {
    const a = pr.ex.minima.length, b = pr.ex.maxima.length, sides = sideOf(M.m, M.n, pr.ex.minima), G = M.graph;
    setRo([[T('网格 · 起点', 'Grid · start'), `${grid} · ${fnLabel()}`],
      [T('步数 t / T · 到 A 的翻转距离', 'Step t / T · flip distance to A'), `${pr.t} / ${M.T} · ${pr.dist}`],
      [T('严格极小 a · 极大 b · 度 d', 'Strict minima a · maxima b · degree d'), `${a} · ${b} · ${a + b}`],
      [T('极小值所在的共同边', 'Common side of the minima'), !a ? T('没有极小值', 'no minima') : sides.length ? sides.map(sideName).join(T('、', ', ')) : T('没有：不全在同一条边上', 'none: not all on one side')],
      [T('D(m, n) · 全部状态 · BFS 直径', 'D(m, n) · all states · BFS diameter'), G ? `${M.D} · ${G.states} · ${G.diameter}` : `${M.D} · ${T('太多，不穷举', 'too many to enumerate')}`]]);
    pill('pillA', 'm×n', grid); pill('pillB', 't', `${pr.t}/${M.T}`); pill('pillC', 'd', String(a + b)); pill('pillD', 'D', String(M.D));
    $('roNote').innerHTML = M.stuck ? T('贪心路在这里停住：没有一个翻转能让距离减 1。', 'The greedy path is stuck here: no flip lowers the distance by 1.')
      : G ? T(`页面穷举了 ${G.states} 个状态：直径 ${G.diameter}${G.diameter === M.D ? ' = D(m, n)' : ''}；${G.pairs} 对状态的翻转距离${G.mismatch ? `有 ${G.mismatch} 对` : '全部'}等于 disp((h₁ − h₂)/2)。`, `The page enumerated ${G.states} states: diameter ${G.diameter}${G.diameter === M.D ? ' = D(m, n)' : ''}; ${G.mismatch ? `${G.mismatch} of` : 'all'} ${G.pairs} pairs of states are at flip distance disp((h₁ − h₂)/2).`)
        : T('网格太大，页面不穷举状态；路长等于起点到 A 的翻转距离（页面公式）。', 'The grid is too large to enumerate; the path length equals the flip distance from the start to A (the page’s formula).');
  } else if (M.mode === 'disp') {
    const best = M.d, LM = M.lipMax;
    setRo([[T('网格 · 函数', 'Grid · function'), `${grid} · ${fnLabel()}`],
      [T('中心 K · Σ|φ − K|', 'Centre K · Σ|φ − K|'), `${neg(pr.K)} · ${pr.cost}`],
      [T('disp(φ) · 最优中心', 'disp(φ) · best centre'), `${best.value} · ${neg(best.K)}`],
      [T('D(m, n)', 'D(m, n)') + (cf ? ` · ${cf[0]}` : ''), cf ? `${M.D} · ${cf[1]}` : String(M.D)],
      [T('结论', 'Verdict'), M.lip ? (best.value === M.D ? T('disp(φ) = D(m, n)：取到上界', 'disp(φ) = D(m, n): the bound is attained') : T(`disp(φ) = ${best.value} ≤ D(m, n) = ${M.D}：冻结定理`, `disp(φ) = ${best.value} ≤ D(m, n) = ${M.D}: the frozen theorem`)) : T('不是 1-Lipschitz 函数', 'not a 1-Lipschitz function')]]);
    pill('pillA', 'm×n', grid); pill('pillB', 'K', neg(pr.K)); pill('pillC', 'disp', String(best.value)); pill('pillD', 'D', String(M.D));
    $('roNote').innerHTML = LM ? T(`页面穷举了这个网格上全部 ${LM.count} 个 1-Lipschitz 函数（第一格取 0）：最大离散度 ${LM.best}${LM.best === M.D ? ' = D(m, n)' : ''}。`, `The page enumerated all ${LM.count} 1-Lipschitz functions on this grid (0 at the first cell): the largest dispersion is ${LM.best}${LM.best === M.D ? ' = D(m, n)' : ''}.`)
      : T('点下方网格图的格子可以把值 +1 或 −1（只接受仍是 1-Lipschitz 的修改）。', 'Click a cell of the grid chart below to add +1 or −1 (only changes that keep the function 1-Lipschitz are accepted).');
  } else {
    const [f, R, Fs, A] = M.stages, dF = disp(Fs).value;
    setRo([[T('网格 · 阶段', 'Grid · stage'), `${grid} · ${[T('原函数 φ', 'the function φ'), T('行已排序', 'rows sorted'), T('F：行列都已排序', 'F: rows and columns sorted'), T('与斜坡 A 比较', 'compared with the ramp A')][pr.stage]}`],
      [T('disp：φ · 排行后 · F', 'disp: φ · rows sorted · F'), `${disp(f).value} · ${disp(R).value} · ${dF}`],
      [T('F 行列递增 · 相邻差 ≤ 1', 'F increasing · neighbouring differences ≤ 1'), `${increasing(M.m, M.n, Fs) ? T('是', 'yes') : T('否', 'no')} · ${isLip(M.m, M.n, Fs) ? T('是', 'yes') : T('否', 'no')}`],
      [T('disp(A) = D(m, n)', 'disp(A) = D(m, n)'), String(disp(A).value)],
      [T('结论', 'Verdict'), T(`disp(φ) = disp(F) = ${dF} ≤ ${M.D} = D(m, n)`, `disp(φ) = disp(F) = ${dF} ≤ ${M.D} = D(m, n)`)]]);
    pill('pillA', 'm×n', grid); pill('pillB', T('阶段', 'STAGE'), `${pr.stage}/3`); pill('pillC', 'disp', String(dF)); pill('pillD', 'D', String(M.D));
    $('roNote').innerHTML = isHeight(M.m, M.n, f) ? T('φ 是高度函数（相邻差恰为 ±1）；排序后 F 的相邻差是 0 或 1，不再是高度函数，但仍是 1-Lipschitz。', 'φ is a height function (neighbouring differences exactly ±1); after sorting, F has neighbouring differences 0 or 1, so it is no longer a height function but still 1-Lipschitz.')
      : T('排序不改变值的多重集，所以离散度不变；证明的关键是排序后相邻差仍不超过 1。', 'Sorting keeps the multiset of values, so the dispersion is unchanged; the key point of the proof is that neighbouring differences stay at most 1.');
  }
}
function syncChips() {
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  document.querySelectorAll('#toolChips [data-fn]').forEach((b) => {
    const fn = b.dataset.fn, shown = S.mode === 'walk' ? fn !== 'flat' : true;
    b.hidden = !shown; b.setAttribute('aria-pressed', String(!S.custom && (S.fn === fn || (fn === 'random' && S.fn === 'height'))));
  });
  const ramp = document.querySelector('#toolChips [data-fn="ramp"]'); ramp.querySelector('.zh').textContent = S.mode === 'walk' ? '下斜坡 −A' : '斜坡 i + j'; ramp.querySelector('.en').textContent = S.mode === 'walk' ? 'Downward ramp −A' : 'Ramp i + j';
  let chk = document.querySelector('#toolChips [data-fn="checker"]');
  if (!chk) { chk = document.createElement('button'); chk.className = 'chip'; chk.dataset.fn = 'checker'; chk.innerHTML = '<span class="zh">棋盘</span><span class="en">Checkerboard</span>'; $('flatChip').after(chk); chk.addEventListener('click', () => chooseFn('checker')); }
  chk.hidden = S.mode !== 'walk'; chk.setAttribute('aria-pressed', String(!S.custom && S.fn === 'checker'));
  $('upChip').hidden = $('downChip').hidden = S.mode === 'walk';
  $('upChip').setAttribute('aria-pressed', String(S.tool === 'up')); $('downChip').setAttribute('aria-pressed', String(S.tool === 'down'));
}
function syncOutputs() {
  if (dirty) { build(); dirty = false; syncedKey = ''; toasted = false; }
  const M = MODEL, key = `${S.mode}|${S.nowFrac}|${TRV.lang()}`;
  if (key === syncedKey) return; syncedKey = key;
  const pr = progress();
  readouts(); syncChips();
  $('mm').value = S.m; $('oM').textContent = String(S.m); $('nn').value = S.n; $('oN').textContent = String(S.n);
  $('presetNote').innerHTML = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = ({
    walk: T('时间轴 = 翻转路上的步数。每一步翻转一个严格局部极值（高度 ±2），让到 A 的翻转距离减 1。点网格图里的极值格可以亲手翻转。', 'The time axis is the step along the flip path. Each step flips one strict local extremum (height ±2) and lowers the flip distance to A by 1. Click an extremal cell of the grid chart to flip it yourself.'),
    disp: T('时间轴 = 中心 K，从最低值以下扫到最高值以上。', 'The time axis is the centre K, swept from below the lowest value to above the highest.'),
    sort: T('时间轴 = 重排的阶段：排行、排列、与斜坡比较。', 'The time axis is the stage of the rearrangement: sort rows, sort columns, compare with the ramp.')
  })[S.mode];
  $('litNote').innerHTML = T('地形、翻转路、BFS 直径与穷举都是页面现算的数值；冻结的是不等式 (4) 与猜想 8.3 的多项式计数。', 'The terrain, flip paths, BFS diameters and enumerations are numbers computed on the page; what is frozen are inequality (4) and the polynomial count of Conjecture 8.3.');
  $('c1Title').textContent = ({ walk: T('高度表（底色 = h mod 3；青框 = 极小，品红框 = 极大）', 'The heights (fill = h mod 3; cyan frame = minimum, magenta frame = maximum)'), disp: T('函数值（点格子 +1 / −1）', 'The values (click a cell for +1 / −1)'), sort: T('原函数 φ 与当前阶段', 'The function φ and the current stage') })[S.mode];
  $('c1Meta').textContent = M.mode === 'walk' ? `${pr.t} / ${M.T}` : M.mode === 'disp' ? `K = ${neg(pr.K)}` : '';
  $('c2Title').textContent = ({ walk: T('翻转路：距离与度数', 'The flip path: distance and degree'), disp: T('Σ|φ − K| 对中心 K', 'Σ|φ − K| against the centre K'), sort: T('排序前后的代价曲线', 'Cost curves before and after sorting') })[S.mode];
  $('clock').innerHTML = M.mode === 'walk' ? `t ${pr.t}` : M.mode === 'disp' ? `K ${neg(pr.K)}` : `${T('阶段', 'stage')} ${pr.stage}`;
  $('hudBig').textContent = ({ walk: () => T(`翻转路 · ${pr.t} / ${M.T}`, `flip path · ${pr.t} / ${M.T}`), disp: () => T(`离散度 · K = ${neg(pr.K)}`, `dispersion · K = ${neg(pr.K)}`), sort: () => T('重排 · 排行，再排列', 'rearrangement · rows, then columns') })[M.mode]();
  $('hudSub').textContent = ({ walk: T('地形 = 高度函数（颜色 = h mod 3）；青点 = 严格极小，品红点 = 严格极大；琥珀 = 刚翻转的格子', 'terrain = the height function (colour = h mod 3); cyan dots = strict minima, magenta = strict maxima; amber = the cell just flipped'),
    disp: T('琥珀平面 = 中心 K；竖线 = |φ − K|（品红在上，青在下）', 'amber plane = the centre K; vertical strokes = |φ − K| (magenta above, cyan below)'),
    sort: T('地形在重排的阶段之间过渡；最后一段的琥珀点 = 斜坡 A', 'the terrain moves between the stages of the rearrangement; amber dots in the last stage = the ramp A') })[M.mode];
  if (!toasted && S.playing && S.nowFrac >= 1) {
    toasted = true;
    if (M.mode === 'walk') toast(T(`<b>到达 A</b>：一共 ${M.T} 步${M.T === M.D ? `，正好是 D(${M.m}, ${M.n})` : ''}。`, `<b>Reached A</b>: ${M.T} steps in all${M.T === M.D ? `, exactly D(${M.m}, ${M.n})` : ''}.`));
    else if (M.mode === 'disp') toast(T(`<b>扫完</b>：最小的 Σ|φ − K| = ${M.d.value}，在 K = ${neg(M.d.K)}；D = ${M.D}。`, `<b>Swept</b>: the smallest Σ|φ − K| is ${M.d.value}, at K = ${neg(M.d.K)}; D = ${M.D}.`));
    else toast(T(`<b>重排完成</b>：disp(F) = ${disp(M.stages[2]).value} ≤ D = ${M.D}。`, `<b>Rearranged</b>: disp(F) = ${disp(M.stages[2]).value} ≤ D = ${M.D}.`));
  }
}
function syncRail() {
  const M = MODEL, key = `${S.mode}|${M.mode === 'walk' ? M.T : M.mode === 'disp' ? `${M.lo},${M.hi}` : 0}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  const marks = M.mode === 'walk' ? [[0, 't=0'], [0.5, String(Math.round(M.T / 2))], [1, String(M.T)]]
    : M.mode === 'disp' ? [[0, `K=${M.lo - 1}`], [1, String(M.hi + 1)]]
      : [[0, 'φ'], [1 / 3, T('排行', 'rows')], [2 / 3, 'F'], [1, 'A']];
  $('marks').innerHTML = marks.map(([f, s], i) => `<i class="${i === 0 ? 'first' : i === marks.length - 1 ? 'last' : ''}" style="left:${(f * 100).toFixed(2)}%">${s.replace('-', '−')}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
function chooseFn(fn) {
  if (fn === 'random' && !S.custom && (S.fn === 'random' || S.fn === 'height')) S.seed = (S.seed * 48271 + 7) % 2147483647;
  S.fn = fn === 'random' && S.mode === 'sort' && S.fn === 'height' ? 'height' : fn; S.custom = null; S.nowFrac = 0; custom();
}
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => {
  const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'walk'; if (S.mode === m) return;
  S.mode = m; S.nowFrac = 0; S.custom = null; if (m === 'walk' && S.fn === 'flat') S.fn = 'ramp'; if (m !== 'walk' && S.fn === 'checker') S.fn = 'ramp'; if (m !== 'sort' && S.fn === 'height') S.fn = 'random'; custom();
}));
document.querySelectorAll('#toolChips [data-fn]').forEach((b) => b.addEventListener('click', () => chooseFn(b.dataset.fn)));
$('upChip').addEventListener('click', () => { S.tool = 'up'; syncChips(); });
$('downChip').addEventListener('click', () => { S.tool = 'down'; syncChips(); });
$('mm').addEventListener('input', () => { S.m = Math.min(GMAX, Math.max(GMIN, Math.round(parseFloat($('mm').value)))); S.custom = null; S.nowFrac = 0; custom(); });
$('nn').addEventListener('input', () => { S.n = Math.min(GMAX, Math.max(GMIN, Math.round(parseFloat($('nn').value)))); S.custom = null; S.nowFrac = 0; custom(); });
function cellAt(ev) {
  if (!cellHits) return -1; const r = cv1.getBoundingClientRect(), x = ev.clientX - r.left - cellHits.ox, y = ev.clientY - r.top - cellHits.oy;
  const j = Math.floor(x / cellHits.c), i = Math.floor(y / cellHits.c); return i >= 0 && i < MODEL.m && j >= 0 && j < MODEL.n ? i * MODEL.n + j : -1;
}
cv1.addEventListener('pointerdown', (ev) => {
  const k = cellAt(ev); if (k < 0) return; const M = MODEL, pr = progress();
  if (M.mode === 'walk') {
    const g = flipAt(M.m, M.n, pr.h, k); if (!g) { toast(T('这个格子不是严格局部极值，不能翻转。', 'This cell is not a strict local extremum, so it cannot flip.')); return; }
    S.custom = g; S.nowFrac = 0; S.playing = false; setPlayUI(); custom(); return;
  }
  const f = (M.mode === 'disp' ? M.f : M.stages[0]).slice(); f[k] += S.tool === 'up' ? 1 : -1;
  if (!isLip(M.m, M.n, f)) { toast(T('这样改会让相邻差超过 1，页面不接受。', 'That change would make a neighbouring difference exceed 1, so the page refuses it.')); return; }
  S.custom = f; if (M.mode === 'sort') S.nowFrac = 0; custom();
});
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.mode = p.mode; S.m = p.m; S.n = p.n; S.fn = p.fn; if (p.seed !== undefined) S.seed = p.seed; S.custom = null;
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
const nudge = () => (MODEL.mode === 'walk' ? 1 / Math.max(1, MODEL.T) : MODEL.mode === 'disp' ? 1 / Math.max(1, MODEL.hi - MODEL.lo + 2) : 1 / 3);
document.addEventListener('keydown', (ev) => {
  if (ev.target && (ev.target.tagName === 'INPUT' && ev.target.type !== 'range')) return;
  if (drawer.isOpen()) return;
  if (ev.key === ' ' && !(ev.target && ev.target.tagName === 'BUTTON')) { ev.preventDefault(); S.playing = !S.playing; S.hold = 0; setPlayUI(); }
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) { ev.preventDefault(); jumpTo(S.nowFrac + (ev.key === 'ArrowRight' ? 1 : -1) * nudge()); }
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
window.MF_DEBUG = {
  pending: () => dirty || syncedKey !== `${S.mode}|${S.nowFrac}|${TRV.lang()}`,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, pr = progress(), o = { mode: M.mode, frac: S.nowFrac, m: M.m, n: M.n, D: M.D };
    if (M.mode === 'walk') Object.assign(o, { t: pr.t, T: M.T, h: pr.h, source: M.source, target: M.target, dist: pr.dist, minima: pr.ex.minima, maxima: pr.ex.maxima, sides: sideOf(M.m, M.n, pr.ex.minima), stuck: M.stuck, cells: M.cells, path: M.path, graph: M.graph });
    else if (M.mode === 'disp') Object.assign(o, { f: M.f, K: pr.K, cost: pr.cost, disp: M.d.value, bestK: M.d.K, lip: M.lip, lipMax: M.lipMax });
    else Object.assign(o, { stages: M.stages, stage: pr.stage, h: pr.h });
    return o;
  },
  cellScreen: (k) => { if (!cellHits) return null; const r = cv1.getBoundingClientRect(), i = Math.floor(k / MODEL.n), j = k % MODEL.n; return { x: r.left + cellHits.ox + (j + 0.5) * cellHits.c, y: r.top + cellHits.oy + (i + 0.5) * cellHits.c }; },
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('geo'); S.playing = false; setPlayUI(); S.nowFrac = 0.45; $('now').value = S.nowFrac; setCamPreset('iso'); };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('geo');
setPlayUI();
requestAnimationFrame(frame);
})();
