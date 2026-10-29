/* GENERAL//POSITION · robots, polynomials and outer sets
   A vertex set is in general position when no three of its vertices lie on a common shortest path. Three frozen settlements:
   the mobile general position number of the cylinders C₇ □ Pₛ and C₁₀ □ Pₛ is 4 (Klavžar et al. 2026), the general position
   polynomial ψ(G) of a connected graph is real-rooted exactly for complete graphs (Rather 2026), and a 19-vertex graph refutes
   the outer general position deletion bound of Tian, Dokyeesun and Klavžar. Distances come from breadth-first search; the
   four-robot route replays the Lean construction; ψ is computed by enumerating subsets. Depends on:
   assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, cyan: CY, magenta: MG } = TRV.palette;
const MODES = ['robots', 'poly', 'outer'];
const RUN = { robots: 30, poly: 16, outer: 20 };
const CLASS_RGB = [[1, 0.78, 0.24], [0.1, 0.88, 1], [1, 0.31, 0.85], [0.49, 1, 0.6], [0.62, 0.55, 1]];
const CLASS_CSS = ['#ffc83d', '#19e0ff', '#ff4fd8', '#7dff9a', '#9d8cff'];
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹', SUB = '₀₁₂₃₄₅₆₇₈₉';
const sup = (k) => String(k).split('').map((d) => SUP[+d]).join(''), sub = (k) => String(k).split('').map((d) => SUB[+d]).join('');

/* =====================================================================
   2. Graphs, distances and general position
   ===================================================================== */
function distances(n, edges) {   // all-pairs breadth-first search
  const nb = Array.from({ length: n }, () => []); for (const [a, b] of edges) { nb[a].push(b); nb[b].push(a); }
  const D = Array.from({ length: n }, () => new Int16Array(n).fill(-1));
  for (let s = 0; s < n; s++) { D[s][s] = 0; const q = [s]; for (let i = 0; i < q.length; i++) for (const w of nb[q[i]]) if (D[s][w] < 0) { D[s][w] = D[s][q[i]] + 1; q.push(w); } }
  return { n, D, nb };
}
const between = (D, u, v, w) => D[u][v] + D[v][w] === D[u][w];   // v on a shortest u–w path
function inGP(D, S) {
  for (let i = 0; i < S.length; i++) for (let j = 0; j < S.length; j++) for (let k = 0; k < S.length; k++)
    if (i !== j && j !== k && i !== k && between(D, S[i], S[j], S[k])) return false;
  return true;
}
function cylinderGraph(r, s) {   // vertex y·r + x: column x on the r-cycle, row y on the path
  const edges = [];
  for (let y = 0; y < s; y++) for (let x = 0; x < r; x++) { edges.push([y * r + x, y * r + (x + 1) % r]); if (y + 1 < s) edges.push([y * r + x, (y + 1) * r + x]); }
  return { r, s, edges, ...distances(r * s, edges) };
}

/* the four-robot route of the Lean module: two rows at a time; pattern(b, q) turns by one column every four moves */
const PATTERN = { 7: [[0, 4, 1, 5], [0, 4, 2, 5], [1, 4, 2, 5], [1, 4, 2, 6], [1, 5, 2, 6]], 10: [[0, 5, 1, 6], [0, 5, 2, 6], [0, 5, 2, 7], [1, 5, 2, 7], [1, 6, 2, 7]] };
const ROW_TAG = [0, 0, 1, 1], SHIFT = [[0, 0, 1, 1], [0, 0, 2, 1], [0, 0, 2, 2], [1, 0, 2, 2], [1, 1, 2, 2]];
function fourRoute(r, s) {
  const pat = (b, q) => PATTERN[r][q].map((c) => (b + c) % r), at = (xs, ys) => xs.map((x, i) => ys[i] * r + x);
  const seq = [at(pat(0, 0), ROW_TAG)];
  for (let j = 0; j + 1 < s; j++) {
    for (let b = 0; b < r; b++) for (let q = 1; q <= 4; q++) seq.push(at(pat(b, q), ROW_TAG.map((t) => j + t)));
    if (j + 2 < s) for (let q = 1; q <= 4; q++) seq.push(at(pat(0, 0), SHIFT[q].map((o) => j + o)));
  }
  return seq;
}
const STEP = { 7: 2, 10: 3 };
const REACH_CAP = 4000, COUNT_CAP = 20000;   // safety limits; the correct searches stay far below them (56 and 1120)
function fiveReach(G) {   // breadth-first search over legal moves from the arithmetic progression b + a·i in rows 0 … 4
  const { r, s, D } = G; if (s < 5) return null;
  const start = [0, 1, 2, 3, 4].map((i) => i * r + (STEP[r] * i) % r), key = (S) => S.slice().sort((a, b) => a - b).join(',');
  const seen = new Map([[key(start), 0]]), configs = [start], parent = [-1], mover = [null]; let moves = 0, sideways = 0;
  for (let c = 0; c < configs.length && configs.length < REACH_CAP; c++) {
    const S = configs[c];
    for (let i = 0; i < 5; i++) for (const v of G.nb[S[i]]) {
      if (S.includes(v)) continue;
      const Tn = S.slice(); Tn[i] = v; if (!inGP(D, Tn)) continue;
      moves++; if (Math.floor(v / r) === Math.floor(S[i] / r)) sideways++;
      const k = key(Tn); if (!seen.has(k)) { seen.set(k, configs.length); configs.push(Tn); parent.push(c); mover.push([i, S[i], v]); }
    }
  }
  return { start, configs, parent, mover, moves, sideways, capped: configs.length >= REACH_CAP };
}
function countGP(G, K) {   // general position sets of size K, and how many vertices extend any of them
  const { n, D } = G, S = []; let count = 0, extend = 0;
  const fits = (v) => { for (let i = 0; i < S.length; i++) for (let j = 0; j < S.length; j++) if (i !== j && (between(D, S[i], v, S[j]) || between(D, v, S[i], S[j]))) return false; return true; };
  const rec = (st) => { if (count >= COUNT_CAP) return; if (S.length === K) { count++; for (let v = 0; v < n; v++) if (!S.includes(v) && fits(v)) extend++; return; } for (let v = st; v < n; v++) if (fits(v)) { S.push(v); rec(v + 1); S.pop(); } };
  rec(0); return { count, extend, capped: count >= COUNT_CAP };
}

/* the general position polynomial: α_k by enumerating every subset, the roots by Aberth iteration */
function psiOf(n, D) {
  const a = new Array(n + 1).fill(0); let best = [];
  for (let m = 0; m < (1 << n); m++) { const S = []; for (let i = 0; i < n; i++) if ((m >> i) & 1) S.push(i); if (inGP(D, S)) { a[S.length]++; if (S.length > best.length) best = S; } }
  let d = n; while (d > 0 && a[d] === 0) d--;
  return { a: a.slice(0, d + 1), d, best };
}
const binom = (n, k) => { let c = 1; for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1); return Math.round(c); };
function rootsOf(a) {   // a[0] + a[1] x + … + a[d] x^d
  const d = a.length - 1; if (d < 1) return [];
  if (a.every((c, k) => c === binom(d, k))) return Array.from({ length: d }, () => [-1, 0]);   // (1 + x)^d exactly
  const c = a.map((x) => x / a[d]);
  const ev = ([zr, zi]) => { let pr = 0, pi = 0, dr = 0, di = 0; for (let k = d; k >= 0; k--) { [dr, di] = [dr * zr - di * zi + pr, dr * zi + di * zr + pi]; [pr, pi] = [pr * zr - pi * zi + c[k], pr * zi + pi * zr]; } return [pr, pi, dr, di]; };
  const R = 1 + Math.max(...c.slice(0, d).map(Math.abs));
  let z = Array.from({ length: d }, (_, k) => [0.4 * R * Math.cos(2 * Math.PI * k / d + 0.4), 0.4 * R * Math.sin(2 * Math.PI * k / d + 0.4)]);
  for (let it = 0; it < 500; it++) {
    let move = 0;
    z = z.map((zk, k) => {
      const [pr, pi, dr, di] = ev(zk), den = dr * dr + di * di; if (den === 0) return zk;
      const qr = (pr * dr + pi * di) / den, qi = (pi * dr - pr * di) / den; let sr = 0, si = 0;
      z.forEach((zj, j) => { if (j !== k) { const xr = zk[0] - zj[0], xi = zk[1] - zj[1], m2 = xr * xr + xi * xi; sr += xr / m2; si += -xi / m2; } });
      const br = 1 - (qr * sr - qi * si), bi = -(qr * si + qi * sr), bm = br * br + bi * bi, wr = (qr * br + qi * bi) / bm, wi = (qi * br - qr * bi) / bm;
      move = Math.max(move, Math.hypot(wr, wi)); return [zk[0] - wr, zk[1] - wi];
    });
    if (move < 1e-14) break;
  }
  return z.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}
function polySteps(n, start) {   // the starting graph, then the remaining pairs one at a time in lexicographic order
  const base = [];
  if (start === 'star') for (let i = 1; i < n; i++) base.push([0, i]);
  else { for (let i = 0; i + 1 < n; i++) base.push([i, i + 1]); if (start === 'cycle') base.push([0, n - 1]); }
  const has = (a, b) => base.some(([x, y]) => (x === a && y === b) || (x === b && y === a)), extra = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (!has(a, b)) extra.push([a, b]);
  return { base, extra };
}

/* the 19-vertex counterexample (vertex lists and colouring exactly as in the Lean module) */
const EDGES_H = [[0, 8], [0, 17], [1, 8], [1, 17], [2, 8], [2, 17], [3, 8], [3, 17], [4, 12], [4, 13], [5, 12], [5, 13], [6, 12], [6, 13], [7, 12], [7, 13], [8, 9], [9, 10], [10, 11], [11, 12], [13, 14], [14, 15], [15, 16], [16, 17]];
const EDGES_G = EDGES_H.concat([[8, 18], [13, 18]]);
const COLOUR = [0, 1, 2, 3, 0, 1, 2, 3, 0, 4, 0, 0, 1, 0, 4, 1, 1, 0, 2];
const AB = [0, 1, 2, 3, 4, 5, 6, 7];
function outerData(n, edges) {   // u, w clash when one of them lies on a shortest path from the other to a third vertex
  const { D, nb } = distances(n, edges), clash = Array.from({ length: n }, () => new Array(n).fill(-1));
  for (let u = 0; u < n; u++) for (let w = 0; w < n; w++) if (u !== w) for (let v = 0; v < n; v++) if (v !== u && v !== w && (between(D, u, w, v) || between(D, w, u, v))) { clash[u][w] = v; break; }
  const mask = clash.map((row) => row.reduce((m, v, j) => (v >= 0 ? m | (1 << j) : m), 0));
  let best = 0, arg = 0;
  for (let m = 0; m < (1 << n); m++) { let ok = true; for (let i = 0; i < n && ok; i++) if ((m >> i) & 1 && (m & mask[i])) ok = false; if (ok) { let c = 0, x = m; while (x) { c += x & 1; x >>>= 1; } if (c > best) { best = c; arg = m; } } }
  return { D, nb, clash, number: best, set: Array.from({ length: n }, (_, i) => i).filter((i) => (arg >> i) & 1) };
}
const OUTER_STAGES = 8;

/* =====================================================================
   3. State and presets
   ===================================================================== */
const S = { mode: 'robots', r: 7, s: 5, k: 4, n: 6, start: 'path', nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'cyl7' };
const PRESETS = {
  cyl7: { mode: 'robots', r: 7, s: 5, k: 4, frac: 0, play: true,
    zh: 'C₇ □ P₅：四个机器人按 Lean 里的走法移动。两行一组，每四次横移把整组转动一格，转七次走遍这两行，再用四次竖移进入下一组；每一步之后集合都仍在一般位置。124 步后 35 个顶点全部到过。',
    en: 'C₇ □ P₅: four robots follow the route in the Lean module. Two rows at a time, every four sideways moves turn the group by one column, seven turns cover both rows, and four vertical moves step to the next pair of rows; after every move the set is still in general position. After 124 moves all 35 vertices have been visited.' },
  cyl10: { mode: 'robots', r: 10, s: 6, k: 4, frac: 0, play: true,
    zh: 'C₁₀ □ P₆：同样的走法，图案换成 C₁₀ 上的那一组。216 步走遍 60 个顶点。',
    en: 'C₁₀ □ P₆: the same route with the C₁₀ pattern. 216 moves visit all 60 vertices.' },
  five: { mode: 'robots', r: 7, s: 6, k: 5, frac: 0, play: true,
    zh: 'C₇ □ P₆ 上的五个机器人，列号 0、2、4、6、1（公差 2）。从这里出发只有 6 个可达配置、10 次合法移动，全部是上下移动；列 3 与列 5 永远到不了。',
    en: 'Five robots on C₇ □ P₆ in columns 0, 2, 4, 6, 1 (step 2). From here only 6 configurations are reachable, by 10 legal moves, all of them up or down; columns 3 and 5 are never reached.' },
  tall: { mode: 'robots', r: 10, s: 8, k: 5, frac: 0, play: true,
    zh: 'C₁₀ □ P₈ 上的五个机器人，列号 0、3、6、9、2（公差 3）。行数多了，可达配置有 56 个，但仍然只能上下移动，十列里只到过五列。',
    en: 'Five robots on C₁₀ □ P₈ in columns 0, 3, 6, 9, 2 (step 3). With more rows, 56 configurations are reachable, but the robots still only move up and down and reach five of the ten columns.' },
  p3: { mode: 'poly', n: 3, start: 'path', frac: 0, play: false,
    zh: '路 P₃：任两点都在一般位置，三个点不在。ψ(P₃) = 1 + 3x + 3x²，根是 −1/2 ± (√3/6)i，不是实数。这条路同时是弦图、二部图和无爪图，所以这三类图都不会总是实根。',
    en: 'The path P₃: any two vertices are in general position, all three are not. ψ(P₃) = 1 + 3x + 3x², with roots −1/2 ± (√3/6)i, not real. This path is chordal, bipartite and claw-free at once, so none of these classes is always real-rooted.' },
  toK: { mode: 'poly', n: 6, start: 'path', frac: 0, play: true,
    zh: '从 P₆ 出发一条一条加边，直到 K₆。只要还缺一条边，最大的一般位置集就小于 6，Newton 不等式不成立，ψ 就有非实根；加满时 ψ = (1 + x)⁶，六个根都落在 −1。',
    en: 'Start from P₆ and add edges one at a time up to K₆. While any edge is missing, the largest general position set has fewer than 6 vertices, Newton’s inequality fails and ψ has non-real roots; at the end ψ = (1 + x)⁶ and all six roots sit at −1.' },
  outer: { mode: 'outer', frac: 0, play: true,
    zh: '19 个顶点的反例。先看删去 x 的图：A ∪ B 这 8 个点处于外部一般位置。加上 x 以后，A 与 B 之间多了一条经过 x 的短路，A ∪ B 中出现被挡住的点对；五色染色说明 G 里最多选 5 个，而 8 > 5 + deg x = 7。',
    en: 'The 19-vertex counterexample. First the graph without x: the 8 vertices A ∪ B are in outer general position. With x there is a short route between A and B through x, and pairs in A ∪ B become blocked; the five-colouring shows that at most 5 can be chosen in G, while 8 > 5 + deg x = 7.' },
  colors: { mode: 'outer', frac: 2.5 / OUTER_STAGES, play: false,
    zh: '五色染色：同一颜色的任意两个顶点之间，都有第三个点让其中一个落在另一个到它的最短路上，所以外部一般位置集里每种颜色最多一个点。拖动时间轴逐类查看。',
    en: 'The five-colouring: for any two vertices of the same colour there is a third vertex such that one of them lies on a shortest path from the other to it, so an outer general position set holds at most one vertex of each colour. Drag the time axis to go through the classes.' }
};

/* =====================================================================
   4. The model
   ===================================================================== */
let MODEL = null, dirty = true;
const OUTER = { H: outerData(18, EDGES_H), G: outerData(19, EDGES_G) };
function build() {
  if (S.mode === 'robots') {
    const G = cylinderGraph(S.r, S.s);
    if (S.k === 4) {
      const route = fourRoute(S.r, S.s), first = new Array(G.n).fill(Infinity), legal = [], gp = route.map((c) => inGP(G.D, c));
      route.forEach((c, t) => c.forEach((v) => { if (first[v] === Infinity) first[v] = t; }));
      for (let t = 1; t < route.length; t++) { const i = route[t].findIndex((v, j) => v !== route[t - 1][j]); legal.push(i >= 0 && route[t].filter((v, j) => v !== route[t - 1][j]).length === 1 && G.D[route[t - 1][i]][route[t][i]] === 1 && !route[t - 1].includes(route[t][i]) ? i : -1); }
      const covered = []; let c = 0; const sorted = first.slice().sort((a, b) => a - b); for (let t = 0; t < route.length; t++) { while (c < sorted.length && sorted[c] <= t) c++; covered.push(c); }
      MODEL = { mode: 'robots', G, k: 4, route, first, legal, gp, covered, T: route.length - 1 };
    } else {
      const reach = fiveReach(G), five = countGP(G, 5), first = new Array(G.n).fill(Infinity);
      if (reach) reach.configs.forEach((cfg, t) => cfg.forEach((v) => { if (first[v] === Infinity) first[v] = t; }));
      MODEL = { mode: 'robots', G, k: 5, reach, five, first, T: reach ? reach.configs.length - 1 : 0 };
    }
  } else if (S.mode === 'poly') {
    const { base, extra } = polySteps(S.n, S.start), steps = [];
    for (let t = 0; t <= extra.length; t++) { const edges = base.concat(extra.slice(0, t)), { D } = distances(S.n, edges), ps = psiOf(S.n, D); steps.push({ edges, ...ps, roots: rootsOf(ps.a) }); }
    MODEL = { mode: 'poly', n: S.n, start: S.start, base, extra, steps, T: extra.length };
  } else MODEL = { mode: 'outer', T: OUTER_STAGES - 1 };
}
function progress() {
  const M = MODEL, f = Math.min(1, Math.max(0, S.nowFrac));
  if (M.mode === 'robots') {
    if (M.k === 4) { const x = f * M.T, t = Math.min(M.T, Math.floor(x + 1e-9)), u = t < M.T ? x - t : 0; return { f, t, u, cfg: M.route[t], next: M.route[Math.min(M.T, t + 1)], visited: M.covered[t] }; }
    if (!M.reach) return { f, t: 0, cfg: null, visited: 0 };
    const t = Math.min(M.T, Math.round(f * M.T)), seen = M.first.filter((x) => x <= t).length, cols = new Set(); M.first.forEach((x, v) => { if (x <= t) cols.add(v % M.G.r); });
    return { f, t, cfg: M.reach.configs[t], mover: M.reach.mover[t], visited: seen, cols: [...cols].sort((a, b) => a - b) };
  }
  if (M.mode === 'poly') { const t = Math.min(M.T, Math.round(f * M.T)); return { f, t, st: M.steps[t] }; }
  return { f, stage: Math.min(OUTER_STAGES - 1, Math.floor(f * OUTER_STAGES + 1e-9)) };
}
function newton(st) {   // α₁² against α₀α₂ · 2d/(d − 1), the first Newton inequality for a real-rooted ψ of degree d
  const [a0, a1, a2] = st.a, d = st.d; if (d < 2) return { lhs: a1 * a1, rhs: 0, ok: true };
  return { lhs: a1 * a1, rhs: a0 * a2 * 2 * d / (d - 1), ok: a1 * a1 >= a0 * a2 * 2 * d / (d - 1) - 1e-9 };
}
const isComplete = (st, n) => st.edges.length === n * (n - 1) / 2;
function outerStage(stage) {   // what each stage of the counterexample shows
  if (stage === 0) return { g: 'H', set: AB, cls: -1 };
  if (stage === 1) { const D = OUTER.G; for (const u of AB) for (const w of AB) if (u < w && D.clash[u][w] >= 0) return { g: 'G', set: AB, cls: -1, pair: [u, w, D.clash[u][w]] }; return { g: 'G', set: AB, cls: -1 }; }
  if (stage <= 6) { const c = stage - 2, mem = COLOUR.map((x, i) => (x === c ? i : -1)).filter((i) => i >= 0); return { g: 'G', set: [], cls: c, members: mem }; }
  return { g: 'G', set: OUTER.G.set, cls: -1 };
}

/* =====================================================================
   5. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const polyString = (a) => a.map((c, k) => (c === 0 ? '' : k === 0 ? String(c) : `${c === 1 ? '' : c}x${k > 1 ? sup(k) : ''}`)).filter(Boolean).join(' + ');
const fmtC = ([re, im]) => `${re.toFixed(3)}${Math.abs(im) < 5e-4 ? '' : (im < 0 ? ' − ' : ' + ') + Math.abs(im).toFixed(3) + 'i'}`;
const graphName = (M, t) => {
  const nm = { path: `P${sub(M.n)}`, star: `K${sub(1)},${sub(M.n - 1)}`, cycle: `C${sub(M.n)}` }[M.start];
  return t === M.T ? `K${sub(M.n)}` : t === 0 ? nm : `${nm} + ${t}`;
};

/* =====================================================================
   6. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 20000, PTS_MAX = 1200;
const CAMS = { iso: [0.5, 1.05, 15], front: [0.0001, 1.5, 15], top: [0.0001, 0.06, 14] };
const cam = { theta: 0.5, phi: 1.05, r: 15, tTheta: 0.5, tPhi: 1.05, tR: 15 };
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
/* vertex positions in the scene */
function cylPos(G, v) { const x = v % G.r, y = Math.floor(v / G.r), rad = G.r === 7 ? 2.7 : 3.5, a = 2 * Math.PI * x / G.r; return [rad * Math.sin(a), (y - (G.s - 1) / 2) * 1.05, rad * Math.cos(a)]; }
function polyPos(n, v) { const a = 2 * Math.PI * v / n; return [2.8 * Math.sin(a), 1.1, 2.8 * Math.cos(a)]; }
const SLOT = { 8: 1, 9: 2, 10: 3, 11: 4, 12: 5, 13: 7, 14: 8, 15: 9, 16: 10, 17: 11 };
function outerPos(v) {
  if (v === 18) return [0, 1.3, 0];
  const slot = v < 4 ? 0 : v < 8 ? 6 : SLOT[v], a = 2 * Math.PI * slot / 12, rad = 3.6;
  const h = v < 8 ? ((v % 4) - 1.5) * 0.62 : 0;
  return [rad * Math.sin(a), h, rad * Math.cos(a)];
}
function rootPos(z, sc) { return [z[0] * sc, -1.9, z[1] * sc]; }
function updateGL() {
  const M = MODEL, pr = progress();
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; for (const p of [a, b]) { Pp[3 * v] = p[0]; Pp[3 * v + 1] = p[1]; Pp[3 * v + 2] = p[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; } };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  const lerp = (a, b, u) => a.map((x, i) => x + (b[i] - x) * u);
  if (M.mode === 'robots') {
    const G = M.G, P = (u) => cylPos(G, u), seenAt = M.first, t = pr.t;
    for (const [a, b] of G.edges) seg(P(a), P(b), COL.cyan, 0.24);
    for (let u = 0; u < G.n; u++) { const seen = seenAt[u] <= t; dot(P(u), seen ? COL.cyan : [0.55, 0.65, 0.75], seen ? 0.85 : 0.35, seen ? 1.2 : 0.8); }
    if (M.k === 5 && M.reach && t === M.T) for (let x = 0; x < G.r; x++) if (!pr.cols.includes(x)) for (let y = 0; y + 1 < G.s; y++) seg(P(y * G.r + x), P((y + 1) * G.r + x), COL.magenta, 0.9);
    if (pr.cfg) {
      const cfg = pr.cfg, next = M.k === 4 ? pr.next : null, u = M.k === 4 ? pr.u : 0;
      cfg.forEach((w, i) => { const p = next && next[i] !== w ? lerp(P(w), P(next[i]), reduceMotion ? 0 : u) : P(w); dot(p, COL.amber, 1, 3.2); });
      for (let i = 0; i < cfg.length; i++) for (let j = i + 1; j < cfg.length; j++) seg(P(cfg[i]), P(cfg[j]), COL.amber, 0.12);
      if (M.k === 5 && pr.mover) seg(P(pr.mover[1]), P(pr.mover[2]), COL.magenta, 1);
      if (M.k === 4 && next) { const i = next.findIndex((w, j) => w !== cfg[j]); if (i >= 0) seg(P(cfg[i]), P(next[i]), COL.magenta, 1); }
    }
  } else if (M.mode === 'poly') {
    const st = pr.st, n = M.n, P = (u) => polyPos(n, u), best = new Set(st.best), newest = pr.t > 0 ? M.extra[pr.t - 1] : null;
    for (const [a, b] of st.edges) { const fresh = newest && a === newest[0] && b === newest[1]; seg(P(a), P(b), fresh ? COL.magenta : COL.cyan, fresh ? 1 : 0.45); }
    for (let u = 0; u < n; u++) dot(P(u), best.has(u) ? COL.amber : COL.cyan, 1, best.has(u) ? 2.6 : 1.6);
    const sc = 2.2 / Math.max(1, ...st.roots.map((z) => Math.hypot(z[0], z[1])));
    for (let i = -10; i <= 10; i++) { seg(rootPos([i / 4, -2.6], sc), rootPos([i / 4, 2.6], sc), COL.cyan, i === 0 ? 0.25 : 0.07); seg(rootPos([-2.6, i / 4], sc), rootPos([2.6, i / 4], sc), i === 0 ? COL.amber : COL.cyan, i === 0 ? 0.7 : 0.07); }
    for (const z of st.roots) { const real = Math.abs(z[1]) < 1e-6; dot(rootPos(z, sc), real ? COL.amber : COL.magenta, 1, 2.4); seg(rootPos(z, sc), [rootPos(z, sc)[0], 1.1, rootPos(z, sc)[2]], real ? COL.amber : COL.magenta, 0.08); }
  } else {
    const so = outerStage(pr.stage), g = so.g === 'H' ? 18 : 19, edges = so.g === 'H' ? EDGES_H : EDGES_G, chosen = new Set(so.set);
    for (const [a, b] of edges) seg(outerPos(a), outerPos(b), b === 18 ? COL.magenta : COL.cyan, b === 18 ? 0.9 : 0.4);
    for (let u = 0; u < g; u++) {
      const inCls = so.cls >= 0 && COLOUR[u] === so.cls, col = so.cls >= 0 ? (inCls ? CLASS_RGB[so.cls] : [0.5, 0.6, 0.7]) : chosen.has(u) ? COL.amber : u === 18 ? COL.magenta : COL.cyan;
      dot(outerPos(u), col, so.cls >= 0 && !inCls ? 0.35 : 1, chosen.has(u) || inCls ? 2.8 : 1.4);
    }
    const D = OUTER.G.D, path = (a, b) => { const out = [a]; let x = a; while (x !== b && x !== undefined && b >= 0) { x = OUTER.G.nb[x].find((y) => D[y][b] === D[x][b] - 1); if (x !== undefined) out.push(x); } return out; };
    const drawPath = (p, col) => { for (let i = 0; i + 1 < p.length; i++) seg(outerPos(p[i]), outerPos(p[i + 1]), col, 1); };
    if (so.pair) { const [u, w, x] = so.pair; drawPath(between(D, u, w, x) ? path(u, x) : path(w, x), COL.magenta); }
    if (so.cls >= 0) for (let i = 0; i < so.members.length; i++) for (let j = i + 1; j < so.members.length; j++) { const u = so.members[i], w = so.members[j], x = OUTER.G.clash[u][w]; if (x >= 0) drawPath(between(D, u, w, x) ? path(u, x) : path(w, x), CLASS_RGB[so.cls].map((c) => c * 0.35)); }
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
  const M = MODEL, pr = progress(); let k = 0;
  const put = (text, p, cls) => { const el = tagAt(k++, cls); el.textContent = text; placeTag(el, p); };
  if (M.mode === 'robots') {
    const G = M.G;
    for (let x = 0; x < G.r; x++) put(String(x), cylPos(G, (G.s - 1) * G.r + x).map((c, i) => (i === 1 ? c + 0.45 : c * 1.08)), M.k === 5 && M.reach && pr.t === M.T && !pr.cols.includes(x) ? 'mg' : 'cy');
  } else if (M.mode === 'poly') {
    const st = pr.st, sc = 2.2 / Math.max(1, ...st.roots.map((z) => Math.hypot(z[0], z[1])));
    put(T('复平面上的 ψ 的根', 'roots of ψ in the complex plane'), rootPos([2.4, -2.4], sc), 'hot');
    put('−1', rootPos([-1, 0], sc).map((c, i) => (i === 1 ? c - 0.35 : c)), 'hot');
  } else {
    const so = outerStage(pr.stage);
    put('A', outerPos(0).map((c, i) => (i === 1 ? 1.4 : c * 1.12)), 'hot'); put('B', outerPos(4).map((c, i) => (i === 1 ? 1.4 : c * 1.12)), 'hot');
    if (so.g === 'G') put('x', outerPos(18).map((c, i) => (i === 1 ? c + 0.5 : c)), 'mg');
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
function drawMain() {
  const M = MODEL, F = frame2d(cv1, 40); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  ctx.fillStyle = DIM; ctx.textBaseline = 'top';
  if (M.mode === 'robots' && M.k === 4) {
    const X = (t) => pl + iw * t / M.T, Y = (c) => pt + ih - ih * c / M.G.n;
    ctx.strokeStyle = AM; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(pl, Y(M.G.n)); ctx.lineTo(pl + iw, Y(M.G.n)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = CY; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); M.covered.forEach((c, t) => { if (t) ctx.lineTo(X(t), Y(c)); else ctx.moveTo(X(t), Y(c)); }); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(pr.t), Y(pr.visited), 3.5 * dpr, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(M.G.n), pl - 4 * dpr, Y(M.G.n)); ctx.fillText('0', pl - 4 * dpr, Y(0));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const t of [0, Math.round(M.T / 2), M.T]) ctx.fillText(String(t), X(t), pt + ih + 4 * dpr);
    $('c1Meta').textContent = T('青 = 到过的顶点数 · 琥珀虚线 = 全部顶点', 'cyan = vertices visited · amber dashes = all vertices');
  } else if (M.mode === 'robots') {
    const G = M.G, w = iw / G.r, cols = M.reach ? progress().cols : [];
    for (let x = 0; x < G.r; x++) {
      const seen = cols.includes(x), h = M.reach ? M.first.filter((t, v) => v % G.r === x && t <= pr.t).length / G.s : 0;
      ctx.fillStyle = seen ? 'rgba(25, 224, 255, 0.55)' : 'rgba(255, 79, 216, 0.18)'; ctx.fillRect(pl + x * w + 3 * dpr, pt + ih - ih * Math.max(h, 0.04), w - 6 * dpr, ih * Math.max(h, 0.04));
      ctx.fillStyle = seen ? CY : MG; ctx.textAlign = 'center'; ctx.fillText(String(x), pl + x * w + w / 2, pt + ih + 4 * dpr);
    }
    $('c1Meta').textContent = T('每列中到过的顶点比例 · 品红 = 还没到过的列', 'share of each column visited · magenta = columns not yet visited');
  } else if (M.mode === 'poly') {
    const st = pr.st, n = M.n, top = 1.18 * binom(n, Math.floor(n / 2)), w = iw / (n + 1), Y = (c) => pt + ih - ih * c / top;
    for (let k = 0; k <= n; k++) {
      const c = st.a[k] || 0, x = pl + k * w;
      ctx.strokeStyle = FAINT; ctx.strokeRect(x + 4 * dpr, Y(binom(n, k)), w - 8 * dpr, pt + ih - Y(binom(n, k)));
      ctx.fillStyle = k <= st.d ? (isComplete(st, n) ? 'rgba(255, 200, 61, 0.7)' : 'rgba(25, 224, 255, 0.6)') : 'transparent'; ctx.fillRect(x + 4 * dpr, Y(c), w - 8 * dpr, pt + ih - Y(c));
      ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.fillText(`α${sub(k)}`, x + w / 2, pt + ih + 4 * dpr);
      if (c) { ctx.fillStyle = INK; ctx.textBaseline = 'bottom'; ctx.fillText(String(c), x + w / 2, Y(c) - 2 * dpr); ctx.textBaseline = 'top'; }
    }
    $('c1Meta').textContent = T(`柱 = αₖ · 空框 = (1 + x)${sup(n)} 的系数`, `bars = αₖ · outlines = coefficients of (1 + x)${sup(n)}`);
  } else {
    const vals = [[T('gp₀(G − x)', 'gp₀(G − x)'), OUTER.H.number, CY], [T('gp₀(G)', 'gp₀(G)'), OUTER.G.number, MG]], w = iw / 3, Y = (c) => pt + ih - ih * c / 9;
    vals.forEach(([lab, val, col], i) => { const x = pl + i * w + w * 0.2; ctx.fillStyle = col; ctx.globalAlpha = 0.7; ctx.fillRect(x, Y(val), w * 0.6, pt + ih - Y(val)); ctx.globalAlpha = 1; ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(String(val), x + w * 0.3, Y(val) - 2 * dpr); ctx.fillStyle = DIM; ctx.textBaseline = 'top'; ctx.fillText(lab, x + w * 0.3, pt + ih + 4 * dpr); });
    ctx.strokeStyle = AM; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(pl, Y(OUTER.G.number + 2)); ctx.lineTo(pl + iw, Y(OUTER.G.number + 2)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = AM; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(T('猜想的上界 gp₀(G) + deg x = 7', 'conjectured bound gp₀(G) + deg x = 7'), pl + iw, Y(OUTER.G.number + 2) - 2 * dpr);
    $('c1Meta').textContent = T('穷举得到的外部一般位置数（页面数值）', 'outer general position numbers by exhaustion (page numerics)');
  }
}
function drawSide() {
  const M = MODEL, F = frame2d(cv2, 26); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  if (M.mode === 'robots') {
    const G = M.G, cw = Math.min(iw / G.r, ih / G.s), ox = pl + (iw - cw * G.r) / 2, oy = pt + (ih - cw * G.s) / 2, cfg = new Set(pr.cfg || []);
    for (let y = 0; y < G.s; y++) for (let x = 0; x < G.r; x++) {
      const v = y * G.r + x, px = ox + x * cw, py = oy + (G.s - 1 - y) * cw, seen = M.first[v] <= pr.t;
      ctx.fillStyle = cfg.has(v) ? 'rgba(255, 200, 61, 0.9)' : seen ? 'rgba(25, 224, 255, 0.35)' : 'rgba(255, 255, 255, 0.04)'; ctx.fillRect(px + 1.5 * dpr, py + 1.5 * dpr, cw - 3 * dpr, cw - 3 * dpr);
      if (M.k === 5 && M.reach && pr.t === M.T && !pr.cols.includes(x)) { ctx.strokeStyle = MG; ctx.strokeRect(px + 1.5 * dpr, py + 1.5 * dpr, cw - 3 * dpr, cw - 3 * dpr); }
    }
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (let x = 0; x < G.r; x++) ctx.fillText(String(x), ox + x * cw + cw / 2, oy + G.s * cw + 2 * dpr);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (let y = 0; y < G.s; y++) ctx.fillText(String(y), ox - 4 * dpr, oy + (G.s - 1 - y) * cw + cw / 2);
    $('c2Meta').textContent = T('柱面沿一条竖线剪开：横 = 列，竖 = 行；琥珀 = 机器人，青 = 到过', 'the cylinder cut along a vertical line: across = column, up = row; amber = robots, cyan = visited');
  } else if (M.mode === 'poly') {
    // a frame fitted to the roots: they all have negative real part, so the view runs mostly left of 0
    const st = pr.st, rx = 1.15 * Math.max(1.1, ...st.roots.map((z) => -z[0])), x0 = -rx, x1 = 0.3 * rx, y1 = Math.max(0.3 * rx, ...st.roots.map((z) => 1.4 * Math.abs(z[1])));
    const sc = Math.min(iw / (x1 - x0), ih / (2 * y1)), cx = pl + (iw - sc * (x1 - x0)) / 2 - x0 * sc, cy = pt + ih / 2;
    ctx.strokeStyle = FAINT; ctx.beginPath(); ctx.moveTo(cx, pt); ctx.lineTo(cx, pt + ih); ctx.stroke();
    ctx.strokeStyle = AM; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.moveTo(pl, cy); ctx.lineTo(pl + iw, cy); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let x = Math.ceil(x0 * 2) / 2; x <= x1; x += 0.5) { ctx.strokeStyle = DIM; ctx.beginPath(); ctx.moveTo(cx + x * sc, cy - 3 * dpr); ctx.lineTo(cx + x * sc, cy + 3 * dpr); ctx.stroke(); if (Number.isInteger(x)) ctx.fillText(x === 0 ? '0' : String(x).replace('-', '−'), cx + x * sc, cy + 5 * dpr); }
    for (const z of st.roots) { const real = Math.abs(z[1]) < 1e-6; ctx.fillStyle = real ? AM : MG; ctx.beginPath(); ctx.arc(cx + z[0] * sc, cy - z[1] * sc, 4 * dpr, 0, 2 * Math.PI); ctx.fill(); }
    $('c2Meta').textContent = T('ψ 的根：琥珀 = 实根，品红 = 非实根；琥珀线 = 实轴', 'roots of ψ: amber = real, magenta = non-real; amber line = the real axis');
  } else {
    // the conflict matrix with rows and columns sorted by colour, colour strips on two edges, and the classes listed at the right
    const so = outerStage(pr.stage), order = Array.from({ length: 19 }, (_, i) => i).sort((a, b) => COLOUR[a] - COLOUR[b] || a - b), data = so.g === 'H' ? OUTER.H : OUTER.G, N = so.g === 'H' ? 18 : 19;
    const idx = order.filter((u) => u < N), cell = ih / N, ox = pl + 4 * dpr, oy = pt;
    idx.forEach((u, i) => {
      ctx.fillStyle = CLASS_CSS[COLOUR[u]]; ctx.fillRect(ox - 4 * dpr, oy + i * cell, 3 * dpr, cell - 0.5); ctx.fillRect(ox + i * cell, oy + N * cell + 1 * dpr, cell - 0.5, 3 * dpr);
      idx.forEach((w, j) => {
        if (u === w) return; const blocked = data.clash[u][w] >= 0, same = COLOUR[u] === COLOUR[w], hot = so.cls >= 0 ? same && COLOUR[u] === so.cls : so.set.includes(u) && so.set.includes(w);
        ctx.fillStyle = blocked ? (hot ? (so.cls >= 0 ? CLASS_CSS[so.cls] : MG) : same ? 'rgba(255, 255, 255, 0.28)' : 'rgba(25, 224, 255, 0.16)') : hot ? 'rgba(125, 255, 154, 0.55)' : 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(ox + j * cell + 0.5, oy + i * cell + 0.5, cell - 1, cell - 1);
      });
    });
    const lx = ox + N * cell + 14 * dpr, lh = Math.min(16 * dpr, ih / 6);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let c = 0; c < 5; c++) { const mem = COLOUR.map((x, i) => (x === c && i < N ? i : -1)).filter((i) => i >= 0); ctx.fillStyle = CLASS_CSS[c]; ctx.globalAlpha = so.cls < 0 || so.cls === c ? 1 : 0.35; ctx.fillText(`${c + 1}: ${mem.join(' ')}`, lx, oy + lh * (c + 0.5)); }
    ctx.globalAlpha = 1;
    $('c2Meta').textContent = T('冲突矩阵（按颜色排序）：涂色 = 这对顶点被某条最短路挡住；绿 = 选中的点对互不挡', 'conflict matrix (sorted by colour): filled = this pair is blocked by some shortest path; green = selected pairs that do not block');
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
  if (M.mode === 'robots' && M.k === 4) {
    const G = M.G, ok = M.gp[pr.t] && (pr.t === 0 || M.legal[pr.t - 1] >= 0), frozen = (G.r === 7 || G.r === 10) && G.s >= 5;
    setRo([[T('柱面 · 顶点数', 'Cylinder · vertices'), `C${sub(G.r)} □ P${sub(G.s)} · ${G.n}`], [T('步数', 'Move'), `${pr.t} / ${M.T}`],
      [T('到过的顶点', 'Vertices visited'), `${pr.visited} / ${G.n}`], [T('当前集合一般位置 · 这一步合法', 'Set in general position · move legal'), ok ? '✓ · ✓' : '✗'],
      [T('结论', 'Verdict'), pr.t === M.T ? (frozen ? T('四个机器人走遍全部顶点；r = 7、10，s ≥ 5 时 Mob_gp = 4，冻结定理', 'four robots visit every vertex; for r = 7, 10 and s ≥ 5, Mob_gp = 4, the frozen theorem') : T('四个机器人走遍全部顶点（Lean 的构造对 s ≥ 2 都成立）', 'four robots visit every vertex (the Lean construction works for every s ≥ 2)')) : T('还在走…', 'still moving…')]]);
    pill('pillA', 'r', String(G.r)); pill('pillB', 's', String(G.s)); pill('pillC', T('机器人', 'ROBOTS'), '4'); pill('pillD', T('到过', 'SEEN'), `${pr.visited}/${G.n}`);
    $('roNote').innerHTML = T('每一步只有一个机器人沿一条边走到空顶点，页面在每一步之后重新检查一般位置。', 'Each move takes one robot along one edge to an empty vertex, and the page re-checks general position after every move.');
  } else if (M.mode === 'robots') {
    const G = M.G, R = M.reach;
    setRo([[T('柱面 · 顶点数', 'Cylinder · vertices'), `C${sub(G.r)} □ P${sub(G.s)} · ${G.n}`],
      [T('五元一般位置集 · 可扩成六元的（页面枚举）', 'Five-vertex general position sets · extendable to six (page enumeration)'), `${M.five.capped ? '≥ ' : ''}${M.five.count} · ${M.five.extend}`],
      [T('可达配置 · 合法移动 · 其中横向', 'Reachable configurations · legal moves · sideways'), R ? `${R.capped ? '≥ ' : ''}${R.configs.length} · ${R.moves} · ${R.sideways}` : '—'],
      [T('到过的列', 'Columns reached'), R ? `${pr.cols.join(' ')} (${pr.cols.length}/${G.r})` : '—'],
      [T('结论', 'Verdict'), !R ? T('s < 5：没有五个顶点处于一般位置（页面枚举）', 's < 5: no five vertices are in general position (page enumeration)') : (G.r === 7 || G.r === 10) && G.s >= 5 ? T('五个机器人只能上下移动，空列永远到不了：Mob_gp < 5，冻结定理', 'five robots only move up and down and never reach the empty columns: Mob_gp < 5, the frozen theorem') : '—']]);
    pill('pillA', 'r', String(G.r)); pill('pillB', 's', String(G.s)); pill('pillC', T('机器人', 'ROBOTS'), '5'); pill('pillD', T('列', 'COLS'), R ? `${pr.cols.length}/${G.r}` : '—');
    $('roNote').innerHTML = T(`五个一般位置的顶点在不同的行，列号是公差 ±${STEP[G.r]} 的等差数列；一共 2·${G.r}·C(s, 5) 个这样的集合。`, `Five vertices in general position lie in distinct rows with columns in an arithmetic progression of step ±${STEP[G.r]}; there are 2·${G.r}·C(s, 5) such sets.`);
  } else if (M.mode === 'poly') {
    const st = pr.st, n = M.n, nw = newton(st), complete = isComplete(st, n), maxIm = Math.max(0, ...st.roots.map((z) => Math.abs(z[1])));
    setRo([[T('图 · 边数', 'Graph · edges'), `${graphName(M, pr.t)} · ${st.edges.length} / ${n * (n - 1) / 2}`], ['ψ(G)', polyString(st.a)],
      [T('最大一般位置集 d · 顶点数 n', 'Largest general position set d · vertices n'), `${st.d} · ${n}`],
      [T('Newton：α₁² 对 α₀α₂·2d/(d − 1)', 'Newton: α₁² against α₀α₂·2d/(d − 1)'), `${nw.lhs} ${nw.ok ? '≥' : '<'} ${nw.rhs.toFixed(2)}`],
      [T('结论', 'Verdict'), complete ? T(`完全图：ψ = (1 + x)${sup(n)}，只有实根 −1（冻结定理）`, `complete: ψ = (1 + x)${sup(n)}, only the real root −1 (the frozen theorem)`) : T(`不是完全图：d < n，ψ 有非实根（冻结定理），最大虚部 ${maxIm.toFixed(3)}`, `not complete: d < n and ψ has non-real roots (the frozen theorem); largest imaginary part ${maxIm.toFixed(3)}`)]]);
    pill('pillA', 'n', String(n)); pill('pillB', 'd', String(st.d)); pill('pillC', 'Newton', nw.ok ? '✓' : '✗'); pill('pillD', T('实根', 'REAL'), complete ? '✓' : '✗');
    $('roNote').innerHTML = T(`根：${st.roots.map(fmtC).join('，')}`, `Roots: ${st.roots.map(fmtC).join(', ')}`);
  } else {
    const so = outerStage(pr.stage), names = { H: T('G − x（18 个顶点）', 'G − x (18 vertices)'), G: T('G（19 个顶点）', 'G (19 vertices)') };
    const what = so.g === 'H' ? T('A ∪ B 两两不挡：外部一般位置', 'no pair of A ∪ B is blocked: outer general position')
      : so.pair ? T(`${so.pair[0]} 与 ${so.pair[1]} 被挡住（第三点 ${so.pair[2]}）`, `${so.pair[0]} and ${so.pair[1]} are blocked (third vertex ${so.pair[2]})`)
      : so.cls >= 0 ? T(`颜色 ${so.cls + 1}：{${so.members.join(', ')}} 两两被挡`, `colour ${so.cls + 1}: {${so.members.join(', ')}}, every pair blocked`)
      : T(`一个 5 元外部一般位置集：{${so.set.join(', ')}}`, `a 5-vertex outer general position set: {${so.set.join(', ')}}`);
    setRo([[T('图', 'Graph'), names[so.g]], [T('gp₀(G − x) · gp₀(G)（页面穷举）', 'gp₀(G − x) · gp₀(G) (page exhaustion)'), `${OUTER.H.number} · ${OUTER.G.number}`],
      [T('deg x · 猜想的上界', 'deg x · conjectured bound'), `2 · ${OUTER.G.number + 2}`], [T('这一步', 'This stage'), what],
      [T('结论', 'Verdict'), T(`8 > 5 + 2：x 不是割点，猜想不成立（冻结定理）`, `8 > 5 + 2: x is not a cut vertex, and the conjecture fails (the frozen theorem)`)]]);
    pill('pillA', T('阶段', 'STAGE'), `${pr.stage + 1}/${OUTER_STAGES}`); pill('pillB', 'gp₀(G−x)', String(OUTER.H.number)); pill('pillC', 'gp₀(G)', String(OUTER.G.number)); pill('pillD', 'deg x', '2');
    $('roNote').innerHTML = T('Lean 证明 A ∪ B 在 G − x 中是外部一般位置集，并用五色染色证明 G 中任何外部一般位置集至多 5 个点。', 'Lean proves that A ∪ B is an outer general position set of G − x, and uses the five-colouring to show that every outer general position set of G has at most 5 vertices.');
  }
}
const fieldsFor = { robots: ['cylField'], poly: ['polyField'], outer: [] };
function syncOutputs() {
  if (dirty) { build(); dirty = false; syncedKey = ''; toasted = false; }
  const M = MODEL, key = `${S.mode}|${S.nowFrac}|${TRV.lang()}`;
  if (key === syncedKey) return; syncedKey = key;
  const pr = progress();
  readouts();
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  document.querySelectorAll('#rChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.r === S.r)));
  document.querySelectorAll('#kChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.k === S.k)));
  document.querySelectorAll('#startChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.start === S.start)));
  for (const f of ['cylField', 'polyField']) $(f).hidden = !fieldsFor[S.mode].includes(f);
  $('ss').value = S.s; $('oS').textContent = String(S.s); $('nn').value = S.n; $('oN').textContent = String(S.n);
  $('presetNote').innerHTML = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = M.mode === 'robots' ? (M.k === 4 ? T('时间轴 = 四个机器人的步数。', 'The time axis is the four robots’ move count.') : T('时间轴 = 广度优先搜索找到的可达配置，按找到的先后。', 'The time axis runs through the reachable configurations in the order breadth-first search finds them.'))
    : M.mode === 'poly' ? T('时间轴 = 在起点图上按字典序加上的边数，直到完全图。', 'The time axis is the number of edges added to the starting graph in lexicographic order, up to the complete graph.')
    : T('时间轴 = 反例的八个阶段：G − x，加上 x，五个颜色类，最后是 G 的一个最大外部一般位置集。', 'The time axis runs through eight stages of the counterexample: G − x, adding x, the five colour classes, and finally a largest outer general position set of G.');
  $('litNote').innerHTML = T('图上的计数、搜索与求根都是页面现算的；冻结的是上面三个结论。', 'The counts, searches and roots are computed on the page; what is frozen are the three conclusions above.');
  $('c1Title').textContent = M.mode === 'robots' ? (M.k === 4 ? T('到过的顶点数对步数', 'Vertices visited against moves') : T('每列到过的顶点', 'Visited vertices in each column')) : M.mode === 'poly' ? T('系数 αₖ：k 元一般位置集的个数', 'Coefficients αₖ: general position sets of size k') : T('外部一般位置数', 'Outer general position numbers');
  $('c2Title').textContent = M.mode === 'robots' ? T('展开的柱面', 'The cylinder unrolled') : M.mode === 'poly' ? T('ψ 在复平面上的根', 'Roots of ψ in the complex plane') : T('哪些点对被挡住', 'Which pairs are blocked');
  $('clock').innerHTML = M.mode === 'robots' ? `t ${pr.t}` : M.mode === 'poly' ? `+${pr.t}` : `${pr.stage + 1}/${OUTER_STAGES}`;
  $('hudBig').textContent = M.mode === 'robots' ? `C${sub(M.G.r)} □ P${sub(M.G.s)} · ${M.k} ${T('个机器人', 'robots')}` : M.mode === 'poly' ? `${graphName(M, pr.t)} · ψ = ${polyString(pr.st.a)}` : (outerStage(pr.stage).g === 'H' ? T('G − x · 18 个顶点', 'G − x · 18 vertices') : T('G · 19 个顶点', 'G · 19 vertices'));
  $('hudSub').textContent = M.mode === 'robots' ? T('琥珀 = 机器人及它们之间的连线，青 = 到过的顶点，品红 = 这一步的移动或到不了的列', 'amber = robots and the lines between them, cyan = visited vertices, magenta = this move or the unreachable columns')
    : M.mode === 'poly' ? T('上：图，琥珀 = 一个最大的一般位置集，品红 = 刚加上的边；下：ψ 的根所在的复平面', 'above: the graph, amber = a largest general position set, magenta = the edge just added; below: the complex plane with the roots of ψ')
    : T('圈上 12 个位置，A、B 各是 4 个竖排的点；品红 = x 与它的两条边，或挡住一对点的最短路', '12 positions on the ring, A and B each 4 stacked vertices; magenta = x with its two edges, or a shortest path that blocks a pair');
  if (!toasted && S.playing && S.nowFrac >= 1) {
    toasted = true;
    toast(M.mode === 'robots' ? (M.k === 4 ? T(`<b>走遍</b>：${M.T} 步到过全部 ${M.G.n} 个顶点。`, `<b>Covered</b>: all ${M.G.n} vertices visited in ${M.T} moves.`) : M.reach ? T(`<b>卡住</b>：只到过 ${pr.cols.length} 列，共 ${M.G.r} 列。`, `<b>Stuck</b>: only ${pr.cols.length} of ${M.G.r} columns reached.`) : T('<b>没有</b>五元一般位置集。', '<b>No</b> five-vertex general position set.'))
      : M.mode === 'poly' ? T(`<b>K${sub(M.n)}</b>：ψ = (1 + x)${sup(M.n)}，全部根为 −1。`, `<b>K${sub(M.n)}</b>: ψ = (1 + x)${sup(M.n)}, every root is −1.`)
      : T('<b>反例</b>：8 &gt; 5 + 2。', '<b>Counterexample</b>: 8 &gt; 5 + 2.'));
  }
}
function syncRail() {
  const M = MODEL, key = `${S.mode}|${M.T}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  const marks = M.mode === 'outer' ? Array.from({ length: OUTER_STAGES }, (_, i) => [(i + 0.5) / OUTER_STAGES, i === 0 ? 'G−x' : i === 1 ? '+x' : i < 7 ? `c${i - 1}` : 'max']) : [[0, '0'], [0.5, String(Math.round(M.T / 2))], [1, String(M.T)]];
  $('marks').innerHTML = marks.map(([f, s], i) => `<i class="${i === 0 && f === 0 ? 'first' : f === 1 ? 'last' : ''}" style="left:${(f * 100).toFixed(2)}%">${s}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => { const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'robots'; if (S.mode === m) return; S.mode = m; S.nowFrac = 0; custom(); }));
document.querySelectorAll('#rChips .chip').forEach((b) => b.addEventListener('click', () => { S.r = +b.dataset.r === 10 ? 10 : 7; S.nowFrac = 0; custom(); }));
document.querySelectorAll('#kChips .chip').forEach((b) => b.addEventListener('click', () => { S.k = +b.dataset.k === 5 ? 5 : 4; S.nowFrac = 0; custom(); }));
document.querySelectorAll('#startChips .chip').forEach((b) => b.addEventListener('click', () => { S.start = ['path', 'star', 'cycle'].includes(b.dataset.start) ? b.dataset.start : 'path'; S.nowFrac = 0; custom(); }));
$('ss').addEventListener('input', () => { S.s = Math.min(8, Math.max(2, Math.round(parseFloat($('ss').value)))); S.nowFrac = 0; custom(); });
$('nn').addEventListener('input', () => { S.n = Math.min(9, Math.max(3, Math.round(parseFloat($('nn').value)))); S.nowFrac = 0; custom(); });
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.mode = p.mode; for (const k of ['r', 's', 'k', 'n', 'start']) if (p[k] !== undefined) S[k] = p[k];
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
const stepSize = () => (MODEL.mode === 'outer' ? 1 / OUTER_STAGES : 1 / Math.max(1, MODEL.T));
document.addEventListener('keydown', (ev) => {
  if (ev.target && (ev.target.tagName === 'INPUT' && ev.target.type !== 'range')) return;
  if (drawer.isOpen()) return;
  if (ev.key === ' ' && !(ev.target && ev.target.tagName === 'BUTTON')) { ev.preventDefault(); S.playing = !S.playing; S.hold = 0; setPlayUI(); }
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) {
    ev.preventDefault(); const d = ev.key === 'ArrowRight' ? 1 : -1;
    if (MODEL.mode === 'outer') jumpTo((Math.min(OUTER_STAGES - 1, Math.max(0, progress().stage + d)) + 0.5) / OUTER_STAGES);
    else jumpTo((Math.min(MODEL.T, Math.max(0, progress().t + d))) * stepSize());
  }
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
  if (glOK) {
    updateCamera(dtSec);
    const pr = progress(), k = `${S.mode}|${MODEL.T}|${MODEL.mode === 'robots' ? `${MODEL.G.r}|${MODEL.G.s}|${MODEL.k}|${pr.t}|${MODEL.k === 4 ? pr.u.toFixed(3) : ''}` : MODEL.mode === 'poly' ? `${MODEL.n}|${MODEL.start}|${pr.t}` : pr.stage}`;
    if (k !== glKey) { updateGL(); glKey = k; }
    renderer.render(scene3, camera); updateTags();
  }
  drawMain(); drawSide();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { syncedKey = ''; syncOutputs(); $('marks').dataset.key = ''; });

/* read-only probe for automated browser tests */
window.GP_DEBUG = {
  pending: () => dirty || syncedKey !== `${S.mode}|${S.nowFrac}|${TRV.lang()}`,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, pr = progress();
    if (M.mode === 'robots' && M.k === 4) return { mode: 'robots', k: 4, r: M.G.r, s: M.G.s, T: M.T, t: pr.t, route: M.route, legal: M.legal, gp: M.gp, visited: pr.visited, first: M.first };
    if (M.mode === 'robots') return { mode: 'robots', k: 5, r: M.G.r, s: M.G.s, T: M.T, t: pr.t, five: M.five, configs: M.reach ? M.reach.configs : null, moves: M.reach ? M.reach.moves : 0, sideways: M.reach ? M.reach.sideways : 0, cols: pr.cols || [], cfg: pr.cfg };
    if (M.mode === 'poly') return { mode: 'poly', n: M.n, start: M.start, T: M.T, t: pr.t, edges: pr.st.edges, a: pr.st.a, d: pr.st.d, best: pr.st.best, roots: pr.st.roots, steps: M.steps.map((s) => ({ a: s.a, d: s.d, maxIm: Math.max(0, ...s.roots.map((z) => Math.abs(z[1]))) })) };
    const so = outerStage(pr.stage);
    return { mode: 'outer', stage: pr.stage, graph: so.g, set: so.set, cls: so.cls, members: so.members || null, pair: so.pair || null, outerH: OUTER.H.number, outerG: OUTER.G.number, setG: OUTER.G.set, clashG: OUTER.G.clash, clashH: OUTER.H.clash };
  },
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('cyl7'); S.playing = false; setPlayUI(); S.nowFrac = 0.55; $('now').value = S.nowFrac; setCamPreset('iso'); cam.tR = cam.r = 11; cam.theta = cam.tTheta; cam.phi = cam.tPhi; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('cyl7');
setPlayUI();
requestAnimationFrame(frame);
})();
