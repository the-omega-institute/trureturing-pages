/* LEE-YANG//TREE · 树上的 Lee–Yang 单位圆
   The polynomials P(τ, x) of Fiol, Martínez-Montoya and Rios Fukelman on trees: a sum over splits of the edge totals and over
   spin states. Three models: the three-vertex path with joint weights (the frozen counterexample W₃₁ and its neighbours), the
   source's physical weights with fixed edge totals (the frozen nine-vertex counterexample), and the pair coefficient summed over
   placements (frozen to lie on the circle for every tree). Polynomials are exact (BigInt); roots come from a squarefree
   factorization and Aberth iteration. The 3D view is the complex plane with the distance from the unit circle magnified.
   Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, cyan: CY, magenta: MG } = TRV.palette;
const MODES = ['mix', 'fixed', 'sum'];
const RUN = { mix: 18, fixed: 12, sum: 16 };
const MMAX = 80;                 // joint weights: the weight M of split (3, 3) runs over 1 … MMAX
const OFF_TOL = 1e-7;            // | |x| − 1 | above this counts as off the circle
const SPLIT_CAP = 4096;          // largest number of splits the fixed-total model sums
const EMIN = 2, EMAX = 12;
const TAU_DEN = 20;              // τ = j/20
const weightsOf = (c, M) => [[1, 1, 1], [1, c, 1], [1, 1, M]];

/* =====================================================================
   2. Exact integer polynomials (BigInt, coefficient of x^i at index i)
   ===================================================================== */
const gcdI = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const trim = (P) => { const R = P.slice(); while (R.length > 1 && R[R.length - 1] === 0n) R.pop(); return R.length ? R : [0n]; };
const isZero = (P) => P.length === 1 && P[0] === 0n;
const degOf = (P) => trim(P).length - 1;
function prim(P) { P = trim(P); const g = P.reduce((t, c) => gcdI(t, c), 0n); if (!g) return P; const R = P.map((c) => c / g); return R[R.length - 1] < 0n ? R.map((c) => -c) : R; }
const deriv = (P) => (P.length > 1 ? P.slice(1).map((c, i) => c * BigInt(i + 1)) : [0n]);
function prem(A, B) {   // pseudo-remainder of A by B
  A = trim(A); B = trim(B); const db = B.length - 1, lb = B[db]; let R = A.slice();
  while (R.length - 1 >= db && !isZero(R)) { const dr = R.length - 1, lr = R[dr], sh = dr - db; R = R.map((c) => c * lb); for (let i = 0; i <= db; i++) R[i + sh] -= lr * B[i]; R = trim(R); }
  return R;
}
function pgcd(A, B) { A = prim(A); B = prim(B); if (degOf(A) < degOf(B)) [A, B] = [B, A]; while (!isZero(B)) { const R = prem(A, B); A = B; B = isZero(R) ? [0n] : prim(R); } return prim(A); }
function pdiv(A, B) {   // exact quotient A / B over the integers
  A = trim(A); B = trim(B); const db = B.length - 1, Q = new Array(Math.max(1, A.length - db)).fill(0n), R = A.slice();
  for (let i = A.length - 1; i >= db; i--) { if (R[i] === 0n) continue; const q = R[i] / B[db]; Q[i - db] = q; for (let j = 0; j <= db; j++) R[i - db + j] -= q * B[j]; }
  return trim(Q);
}
function squarefree(P) {   // [[factor, multiplicity], …] with P = content · ∏ factor^multiplicity
  const out = []; let f = prim(P); if (degOf(f) < 1) return out;
  let g = pgcd(f, deriv(f)), w = prim(pdiv(f, g)), k = 1;
  while (degOf(w) > 0) { const y = pgcd(w, g), z = prim(pdiv(w, y)); if (degOf(z) > 0) out.push([z, k]); w = y; g = prim(pdiv(g, y)); k++; }
  return out;
}
const FACT = [1n];
const fact = (n) => { while (FACT.length <= n) FACT.push(FACT[FACT.length - 1] * BigInt(FACT.length)); return FACT[n]; };
const choose = (n, k) => fact(n) / (fact(k) * fact(n - k));
function mulBinomial(P, c, m) {   // P · (1 + c x^m)
  const R = P.concat(new Array(m).fill(0n)); for (let i = 0; i < P.length; i++) R[i + m] += c * P[i]; return R;
}
function palReduce(P) {   // x^{−d} P(x) = R(x + 1/x) for a self-reciprocal P of degree 2d
  const n = P.length - 1, d = n / 2; if (n % 2) return null;
  for (let i = 0; i <= n; i++) if (P[i] !== P[n - i]) return null;
  const D = [[2n], [0n, 1n]];
  for (let i = 2; i <= d; i++) { const r = new Array(i + 1).fill(0n); D[i - 1].forEach((c, j) => { r[j + 1] += c; }); D[i - 2].forEach((c, j) => { r[j] -= c; }); D.push(r); }
  const R = new Array(d + 1).fill(0n); R[0] += P[d];
  for (let i = 1; i <= d; i++) D[i].forEach((c, j) => { R[j] += P[d + i] * c; });
  return R;
}
const cubicDisc = ([d, c, b, a]) => 18n * a * b * c * d - 4n * b ** 3n * d + b * b * c * c - 4n * a * c ** 3n - 27n * a * a * d * d;
function divOneMult(P) {   // multiplicity of the root x = 1 and the cofactor
  let m = 0; P = trim(P);
  for (;;) { if (P.reduce((t, c) => t + c, 0n) !== 0n || P.length < 2) return [m, P]; const Q = new Array(P.length - 1).fill(0n); let r = 0n; for (let i = P.length - 1; i >= 1; i--) { r += P[i]; Q[i - 1] = r; } P = Q; m++; }
}

/* =====================================================================
   3. Roots
   ===================================================================== */
function toFloat(P) {   // scaled floats with the same roots
  let mx = 0n; for (const c of P) { const a = c < 0n ? -c : c; if (a > mx) mx = a; }
  const sh = BigInt(Math.max(0, mx.toString(2).length - 60)); return P.map((c) => Number(c >> sh));
}
function aberth(p) {   // all roots of a real polynomial with simple roots (floats, ascending powers), as [re, im]
  const n = p.length - 1; if (n < 1) return [];
  if (n === 1) return [[-p[0] / p[1], 0]];
  if (n === 2) {
    const [c, b, a] = p, D = b * b - 4 * a * c;
    if (D < 0) return [[-b / (2 * a), Math.sqrt(-D) / (2 * a)], [-b / (2 * a), -Math.sqrt(-D) / (2 * a)]];
    const q = -(b + (b < 0 ? -1 : 1) * Math.sqrt(D)) / 2; return [[q / a, 0], [q ? c / q : 0, 0]];
  }
  const rad = Math.pow(Math.abs(p[0] / p[n]), 1 / n) || 1;
  const z = []; for (let i = 0; i < n; i++) { const t = 2 * Math.PI * (i + 0.37) / n + 0.21; z.push([rad * Math.cos(t), rad * Math.sin(t)]); }
  const div = (a, b) => { const q = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / q, (a[1] * b[0] - a[0] * b[1]) / q]; };
  for (let it = 0; it < 800; it++) {
    let mv = 0;
    for (let i = 0; i < n; i++) {
      const x = z[i]; let f = [p[n], 0], d = [0, 0];
      for (let k = n - 1; k >= 0; k--) { d = [d[0] * x[0] - d[1] * x[1] + f[0], d[0] * x[1] + d[1] * x[0] + f[1]]; f = [f[0] * x[0] - f[1] * x[1] + p[k], f[0] * x[1] + f[1] * x[0]]; }
      if (f[0] === 0 && f[1] === 0) continue;
      const r = div(f, d); let s = [0, 0];
      for (let j = 0; j < n; j++) if (j !== i) { const w = div([1, 0], [x[0] - z[j][0], x[1] - z[j][1]]); s[0] += w[0]; s[1] += w[1]; }
      const st = div(r, [1 - (r[0] * s[0] - r[1] * s[1]), -(r[0] * s[1] + r[1] * s[0])]);
      z[i] = [x[0] - st[0], x[1] - st[1]]; mv = Math.max(mv, Math.hypot(st[0], st[1]));
    }
    if (mv < 1e-15 * rad) break;
  }
  return z;
}
function rootsOf(P) {   // [{re, im, mult}] for an integer polynomial
  const out = [];
  for (const [f, k] of squarefree(P)) {
    if (f.length === 2 && f[0] === -f[1]) { out.push({ re: 1, im: 0, mult: k }); continue; }
    if (f.length === 2 && f[0] === f[1]) { out.push({ re: -1, im: 0, mult: k }); continue; }
    for (const [re, im] of aberth(toFloat(f))) out.push({ re, im, mult: k });
  }
  return out;
}
function summarize(P) {   // roots and how far they are from the unit circle
  const roots = rootsOf(P); let nOff = 0, maxDev = 0, mult1 = 0;
  for (const r of roots) { const dev = Math.abs(Math.hypot(r.re, r.im) - 1); r.dev = dev; r.off = dev > OFF_TOL; if (r.off) nOff += r.mult; maxDev = Math.max(maxDev, dev); if (r.re === 1 && r.im === 0) mult1 = r.mult; }
  return { P: prim(P), deg: degOf(P), roots, nOff, maxDev, mult1 };
}

/* =====================================================================
   4. Trees and the polynomials P(τ, x)
   ===================================================================== */
function mkTree(name, edges) {   // edge i = [child, parent]: the split k_i goes to the child, n_i − k_i to the parent
  const V = edges.reduce((m, [a, b]) => Math.max(m, a, b), 0) + 1, deg = new Array(V).fill(0);
  for (const [a, b] of edges) { deg[a]++; deg[b]++; }
  return { name, V, edges, deg, odd: deg.filter((d) => d % 2).length };
}
const pathTree = (E) => mkTree('path', Array.from({ length: E }, (_, i) => [i + 1, i]));
const starTree = (E) => mkTree('star', Array.from({ length: E }, (_, i) => [i + 1, 0]));
function hubTree(m) { const e = [[1, 0], [2, 0]]; let v = 3; for (let j = 0; j < m; j++) e.push([v++, 1]); for (let j = 0; j < m; j++) e.push([v++, 2]); return mkTree('hub', e); }
function spiderTree(E) { const e = []; let v = 1; for (let i = 0; i + 1 < E; i += 2) { e.push([v, 0], [v + 1, v]); v += 2; } if (E % 2) e.push([v, 0]); return mkTree('spider', e); }
function randomTree(E, seed) {   // decode a Prüfer sequence of E − 1 labels on E + 1 vertices
  const n = E + 1, rnd = TRV.mulberry32(seed), seq = Array.from({ length: n - 2 }, () => Math.floor(rnd() * n)), cnt = new Array(n).fill(0), e = [];
  for (const s of seq) cnt[s]++;
  for (const s of seq) { let leaf = 0; while (cnt[leaf] !== 0) leaf++; e.push([leaf, s]); cnt[leaf] = -1; cnt[s]--; }
  const rest = []; for (let v = 0; v < n; v++) if (cnt[v] === 0) rest.push(v); e.push([rest[1], rest[0]]);
  return mkTree('random', e);
}
const hubM = (E) => Math.max(1, Math.floor((E - 2) / 2));
function treeFor(name, E, seed) {
  if (name === 'path') return pathTree(E);
  if (name === 'star') return starTree(E);
  if (name === 'spider') return spiderTree(E);
  if (name === 'random') return randomTree(E, seed);
  return hubTree(hubM(E));
}
const PATH3 = mkTree('path3', [[0, 1], [2, 1]]);   // 0 → 1 ← 2, the source orientation of the counterexample

function masses(tree, n, k) { const m = new Array(tree.V).fill(0); tree.edges.forEach(([a, b], i) => { m[a] += k[i]; m[b] += n[i] - k[i]; }); return m; }
function forSplits(n, f) {   // every split 1 ≤ k_i ≤ n_i − 1
  const E = n.length, k = new Array(E).fill(1);
  const rec = (i) => { if (i === E) { f(k); return; } for (let s = 1; s <= n[i] - 1; s++) { k[i] = s; rec(i + 1); } };
  rec(0);
}
const splitCount = (n) => n.reduce((t, x) => t * Math.max(0, x - 1), 1);
function mixPoly(c, M, j) {   // the three-vertex path, n = (4, 4), joint weights, τ = j/20: 400 · P scaled to integers
  const W = weightsOf(c, M), n = [4, 4], P = new Array(9).fill(0n), J = BigInt(j), D = BigInt(TAU_DEN);
  forSplits(n, (k) => {
    const m = masses(PATH3, n, k), w = BigInt(W[k[0] - 1][k[1] - 1]);
    for (let st = 0; st < 8; st++) {
      const up = [st & 1, (st >> 1) & 1, (st >> 2) & 1];
      const opp = PATH3.edges.reduce((t, [a, b]) => t + (up[a] !== up[b] ? 1 : 0), 0), e = up.reduce((t, u, v) => t + u * m[v], 0);
      P[e] += w * J ** BigInt(opp) * D ** BigInt(2 - opp);
    }
  });
  return trim(P);
}
function physPoly(tree, n) {   // Σ_k ρ_phys(k) ∏_v (1 + (−1)^{deg v} x^{m_v}) at τ = −1, as an integer polynomial over a denominator
  let acc = [0n], accDen = 1n;
  forSplits(n, (k) => {
    const m = masses(tree, n, k); let num = 1n, den = 1n;
    tree.edges.forEach(([a, b], i) => { const p = k[i], q = n[i] - k[i]; num *= choose(2 * n[i], 2 * p) * fact(2 * p) * fact(2 * q); den *= fact(p - 1) * fact(p) * fact(q - 1) * fact(q); });
    for (let v = 0; v < tree.V; v++) { num *= fact(m[v] - 1); den *= fact(m[v] - tree.deg[v] + 2); }
    let S = [1n]; for (let v = 0; v < tree.V; v++) S = mulBinomial(S, tree.deg[v] % 2 ? -1n : 1n, m[v]);
    const L = accDen / gcdI(accDen, den) * den, fa = L / accDen, fw = L / den * num, R = new Array(Math.max(acc.length, S.length)).fill(0n);
    acc.forEach((x, i) => { R[i] += x * fa; }); S.forEach((x, i) => { R[i] += x * fw; }); acc = R; accDen = L;
  });
  return { num: trim(acc), den: accDen };
}
function addFrac(A, B) { const L = A.den / gcdI(A.den, B.den) * B.den, R = new Array(Math.max(A.num.length, B.num.length)).fill(0n); A.num.forEach((x, i) => { R[i] += x * (L / A.den); }); B.num.forEach((x, i) => { R[i] += x * (L / B.den); }); return { num: trim(R), den: L }; }

/* =====================================================================
   5. State and presets
   ===================================================================== */
const S = { mode: 'mix', c: 10, j: -20, zoomLog: 1.3, tree: 'hub', E: 8, seed: 7, totals: null, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'w31' };
const fracOfM = (M) => (M - 1) / (MMAX - 1);
const PRESETS = {
  w31: { mode: 'mix', c: 10, j: -20, zoomLog: 1.3, frac: fracOfM(31), play: false,
    zh: '三点路径 0 → 1 ← 2，两条边总数都是 4，τ = −1；九种分法的联合权重 W₃₁ 对角线是 (1, 10, 31)，其余是 1。八个根里有四个离开单位圆（离圆距离放大 20 倍画出）。已冻结的反例。',
    en: 'The three-vertex path 0 → 1 ← 2 with both totals 4 and τ = −1; the joint weights W₃₁ of the nine splits have diagonal (1, 10, 31) and 1 elsewhere. Four of the eight roots leave the unit circle (distances drawn 20 times larger). The frozen counterexample.' },
  sweep: { mode: 'mix', c: 10, j: -20, zoomLog: 1.3, frac: 0, play: true,
    zh: 'c = 10，把分法 (3, 3) 的权重 M 从 1 增到 80：M ≤ 30 时根在圆上移动，到 M = 31 两对根相撞后离开圆。M ≥ 31 都离开是卷宗里的散文证明；M ≤ 30 在圆上是页面数值。',
    en: 'With c = 10, raise the weight M of split (3, 3) from 1 to 80: for M ≤ 30 the roots move along the circle, and at M = 31 two pairs collide and leave it. That every M ≥ 31 leaves is a prose proof in the dossier; that M ≤ 30 stays on is a page computation.' },
  lone: { mode: 'mix', c: 1, j: -20, zoomLog: 1.3, frac: 0, play: true,
    zh: 'c = 1，只抬分法 (3, 3) 的权重：M 一路到 80，根始终在圆上（页面数值）。离开圆需要两种不同质量的配置一起占上风。',
    en: 'With c = 1, raise only the weight of split (3, 3): all the way to M = 80 the roots stay on the circle (a page computation). Leaving it takes two configurations with different masses carrying weight together.' },
  interior: { mode: 'mix', c: 10, j: -19, zoomLog: 1.3, frac: fracOfM(60), play: false,
    zh: 'τ = −19/20、M = 60：τ 不在端点也会破。400P = x⁴R(x + 1/x)，R 的判别式为负（卷宗的论证），页面上有四个根离开圆。',
    en: 'τ = −19/20 and M = 60: it breaks away from the endpoint too. Here 400P = x⁴R(x + 1/x) with R of negative discriminant (argued in the dossier), and four roots leave the circle on the page.' },
  e8: { mode: 'fixed', tree: 'hub', E: 8, tot: 3, frac: 0, play: true,
    zh: '原文的物理权重，九点双中心树，每条边总数 3，τ = −1。时间轴是放大倍数：放大 1 倍时什么也看不出，放大到几百倍，两对根才从圆上分开——一个在圆内、它的倒数在圆外，离圆约 0.002。已冻结。',
    en: 'The source’s physical weights on the nine-vertex double hub, every edge total 3, τ = −1. The time axis is the magnification: at ×1 nothing shows, and only at a few hundred times do two pairs of roots separate from the circle, one inside and its reciprocal outside, about 0.002 away. Frozen.' },
  hub4: { mode: 'fixed', tree: 'hub', E: 10, tot: 3, frac: 0.8, play: false,
    zh: '每个枢纽再加一片叶子（十一个顶点、十条边），总数仍全是 3：放大 250 倍也看不到离圆的根（页面数值）。物理权重下哪些树、哪些总数会破，还没有一般结论。',
    en: 'One more leaf on each hub (eleven vertices, ten edges), all totals still 3: even at ×250 no root leaves the circle (a page computation). Which trees and totals break under physical weights has no general answer yet.' },
  pair: { mode: 'sum', tree: 'hub', E: 8, zoomLog: 2, frac: 0, play: true,
    zh: '同一棵九点树，“两条边总数 3、其余 2”共有 28 种放法，逐个加进来：根沿着单位圆移动，不离开它（页面数值）。28 种全部加完就是冻结定理覆盖的配对系数：18 个根全在圆上，x = 1 是 6 重根，正好是六个奇度顶点。',
    en: 'The same nine-vertex tree has 28 placements of “two edges with total 3, the rest 2”; adding them one at a time, the roots move along the unit circle without leaving it (a page computation). With all 28 in, this is the pair coefficient of the frozen theorem: all 18 roots are on the circle, and x = 1 is a sixfold root, matching the six odd-degree vertices.' },
  hub5: { mode: 'sum', tree: 'hub', E: 12, zoomLog: 2.5, frac: 1 / 66, play: false,
    zh: '每个枢纽五片叶子：66 种放法里，两条中心边都取 3 的那一种单独离开圆，它在页面顺序里排第一，所以只加它时有 4 个根离圆。往后播放：从第二个部分和起根都回到圆上，66 种的和全部在圆上，x = 1 是 10 重根。',
    en: 'Five leaves on each hub: among the 66 placements, the one with both central edges at total 3 leaves the circle on its own. It comes first in the page’s order, so with only it summed four roots are off. Play on: from the second partial sum on the roots are back on the circle, and the sum of all 66 lies entirely on it, with x = 1 a tenfold root.' }
};

/* =====================================================================
   6. The model
   ===================================================================== */
let MODEL = null, dirty = true;
const zoomOf = (lg) => Math.pow(10, lg);
const mOfFrac = (f) => 1 + Math.round(Math.min(1, Math.max(0, f)) * (MMAX - 1));
function defaultTotals(tree, t) { return tree.edges.map(() => t); }
function build() {
  if (S.mode === 'mix') {
    const per = []; for (let M = 1; M <= MMAX; M++) { const P = mixPoly(S.c, M, S.j); per[M] = summarize(P); }
    MODEL = { mode: 'mix', per };
  } else if (S.mode === 'fixed') {
    const tree = treeFor(S.tree, S.E, S.seed);
    if (!S.totals || S.totals.length !== tree.edges.length) S.totals = defaultTotals(tree, 3);
    const n = S.totals, pp = physPoly(tree, n), sm = summarize(pp.num), [m1, cof] = divOneMult(sm.P), R = palReduce(cof);
    MODEL = { mode: 'fixed', tree, n: n.slice(), splits: splitCount(n), data: sm, reduction: R ? prim(R) : null };
  } else {
    const tree = treeFor(S.tree, S.E, S.seed), E = tree.edges.length, list = [];
    for (let a = 0; a < E; a++) for (let b = a + 1; b < E; b++) {
      const n = tree.edges.map((_, i) => (i === a || i === b ? 3 : 2)), pp = physPoly(tree, n), sm = summarize(pp.num);
      list.push({ a, b, frac: pp, roots: sm.roots, off: sm.nOff > 0, maxDev: sm.maxDev });
    }
    const partials = [null]; let acc = { num: [0n], den: 1n };
    for (const it of list) { acc = addFrac(acc, it.frac); partials.push(acc); }
    MODEL = { mode: 'sum', tree, list, partials, cache: new Map() };
  }
}
function partialAt(k) {   // roots of the sum of the first k placements
  const M = MODEL; if (k <= 0) return null;
  if (!M.cache.has(k)) M.cache.set(k, summarize(M.partials[k].num));
  return M.cache.get(k);
}
function progress() {
  const M = MODEL, f = Math.min(1, Math.max(0, S.nowFrac));
  if (M.mode === 'mix') { const m = mOfFrac(f), d = M.per[m]; return { f, M: m, d, zoom: zoomOf(S.zoomLog) }; }
  if (M.mode === 'fixed') return { f, d: M.data, zoom: zoomOf(3 * f) };
  const N = M.list.length, k = Math.round(f * N); return { f, k, N, d: partialAt(k), zoom: zoomOf(S.zoomLog) };
}
function mixAlgebra(d) {   // the reciprocal reduction of the joint-weight polynomial
  const [m1, cof] = divOneMult(d.P), R = palReduce(d.P), q = m1 === 2 ? palReduce(cof) : null;
  return { R: R ? prim(R) : null, q: q ? prim(q) : null, disc: q && q.length === 4 ? cubicDisc(prim(q)) : null };
}

/* =====================================================================
   7. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const num = (v, d = 4) => (v === null || v === undefined || !isFinite(v) ? '—' : (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d));
const sci = (v) => (!isFinite(v) ? '—' : v === 0 ? '0' : Math.abs(v) >= 0.01 ? v.toFixed(4) : v.toExponential(2));
const zfmt = (z) => (z >= 100 ? `×${Math.round(z)}` : z >= 10 ? `×${z.toFixed(0)}` : `×${z.toFixed(1)}`);
const polyStr = (P, v = 'x') => {   // descending, compact
  const parts = []; for (let i = P.length - 1; i >= 0; i--) { const c = P[i]; if (c === 0n) continue; const a = c < 0n ? -c : c, s = c < 0n ? '−' : '+', co = a === 1n && i > 0 ? '' : a.toString(), pw = i === 0 ? '' : i === 1 ? v : `${v}${String(i).split('').map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]).join('')}`; parts.push(`${s} ${co}${pw}`); }
  const s = parts.join(' '); return s.startsWith('+ ') ? s.slice(2) : s.replace(/^− /, '−');
};

/* =====================================================================
   8. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 24000, PTS_MAX = 6000;
const CAMS = { iso: [0.45, 0.78, 13], front: [0.0001, 1.45, 13], top: [0.0001, 0.06, 12.5] };
const cam = { theta: 0.45, phi: 0.78, r: 13, tTheta: 0.45, tPhi: 0.78, tR: 13 };
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
const RS = 3, STACK = 0.3;
function disp(re, im, Z) {   // the complex plane with |x| = 1 ± d drawn at radius 1 ± Z·d
  const r = Math.hypot(re, im); if (r === 0) return [0, 0];
  const rr = Math.max(0.06, Math.min(1.9, 1 + Z * (r - 1))); return [RS * rr * re / r, -RS * rr * im / r];
}
const rootCol = (r) => (r.off ? COL.magenta : r.re === 1 && r.im === 0 ? COL.amber : COL.cyan);
function updateGL() {
  const M = MODEL, pr = progress(), Z = pr.zoom;
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp[3 * v] = a[0]; Pp[3 * v + 1] = a[1]; Pp[3 * v + 2] = a[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; Pp[3 * v] = b[0]; Pp[3 * v + 1] = b[1]; Pp[3 * v + 2] = b[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  const ring = (rr, col, k, dash) => { const n = 180; for (let i = 0; i < n; i++) { if (dash && i % 2) continue; const a = 2 * Math.PI * i / n, b = 2 * Math.PI * (i + 1) / n; seg([RS * rr * Math.cos(a), 0, RS * rr * Math.sin(a)], [RS * rr * Math.cos(b), 0, RS * rr * Math.sin(b)], col, k); } };
  seg([-1.95 * RS, 0, 0], [1.95 * RS, 0, 0], COL.gray, 0.35); seg([0, 0, -1.95 * RS], [0, 0, 1.95 * RS], COL.gray, 0.35);
  ring(1, COL.cyan, 0.9, false); ring(0.5, COL.gray, 0.3, true); ring(1.5, COL.gray, 0.3, true);
  const ghost = (r, a, size) => { const [x, z] = disp(r.re, r.im, Z); dot([x, 0, z], r.off ? COL.magenta : COL.gray, a, size); };
  if (M.mode === 'mix') for (let m = 1; m < pr.M; m++) for (const r of M.per[m].roots) ghost(r, r.off ? 0.32 : 0.2, 0.45);
  if (M.mode === 'sum') for (const it of M.list) for (const r of it.roots) ghost(r, it.off ? 0.9 : 0.16, it.off ? 0.95 : 0.5);
  if (pr.d) for (const r of pr.d.roots) {
    const [x, z] = disp(r.re, r.im, Z), col = rootCol(r);
    for (let j = 0; j < r.mult; j++) dot([x, STACK * j, z], col, 1, 1.25);
    if (r.mult > 1) seg([x, 0, z], [x, STACK * (r.mult - 1), z], col, 0.6);
    if (r.off) { const rr = Math.hypot(r.re, r.im); seg([RS * r.re / rr, 0, -RS * r.im / rr], [x, 0, z], COL.magenta, 0.9); }
  }
  lines.geometry.setDrawRange(0, v); Lb.position.needsUpdate = true; Lb.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 60 * renderer.getPixelRatio() * (stage.clientHeight / 600);
}

/* =====================================================================
   9. Camera
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.5 : 1);
  camera.position.set(r * sp * Math.sin(cam.theta), r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0, 0.4, 0);
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
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(30, Math.max(6, cam.tR * drag.pinch / d)); drag.pinch = d; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY;
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => { if (!drag.pts.has(ev.pointerId)) return; drag.pts.delete(ev.pointerId); if (drag.pts.size === 0) drag.pinch = 0; };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(30, Math.max(6, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

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
  const pr = progress(), Z = pr.zoom; let k = 0;
  const put = (text, p, cls) => { const el = tagAt(k++, cls); el.textContent = text; placeTag(el, p); };
  put('|x| = 1', [0, 0.15, -RS - 0.25], 'cy');
  put(`|x| = 1 + ${sci(0.5 / Z)}`, [-RS * 1.5 * 0.7071 - 0.3, 0, RS * 1.5 * 0.7071 + 0.3], 'tick');
  put('Re', [1.95 * RS + 0.3, 0, 0], 'tick'); put('Im', [0, 0, -1.95 * RS - 0.3], 'tick');
  if (pr.d) {
    const one = pr.d.roots.find((r) => r.re === 1 && r.im === 0); if (one) put(`x = 1 ×${one.mult}`, [RS + 0.5, STACK * one.mult + 0.45, 0.35], 'hot');
    const off = pr.d.roots.filter((r) => r.off && r.im >= 0).sort((a, b) => b.dev - a.dev)[0];
    if (off) { const [x, z] = disp(off.re, off.im, Z); put(`|x| = ${num(Math.hypot(off.re, off.im), 5)}`, [x, 0.45, z], 'mg'); }
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
function treeLayout(tree) {   // centre in the middle, its branches split left and right, depth along x
  const adj = Array.from({ length: tree.V }, () => []); tree.edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
  const bfs = (s) => { const d = new Array(tree.V).fill(-1), par = new Array(tree.V).fill(-1), order = [s]; d[s] = 0; for (let i = 0; i < order.length; i++) for (const w of adj[order[i]]) if (d[w] < 0) { d[w] = d[order[i]] + 1; par[w] = order[i]; order.push(w); } return { d, par, order }; };
  let centre = 0, best = Infinity; for (let s = 0; s < tree.V; s++) { const e = Math.max(...bfs(s).d); if (e < best) { best = e; centre = s; } }
  const { d, par, order } = bfs(centre), kids = Array.from({ length: tree.V }, () => []); for (const v of order) if (par[v] >= 0) kids[par[v]].push(v);
  const leaves = (v) => (kids[v].length ? kids[v].reduce((t, w) => t + leaves(w), 0) : 1);
  const side = new Array(tree.V).fill(0), pos = new Array(tree.V);
  let L = 0, R = 0; for (const w of kids[centre].slice().sort((a, b) => leaves(b) - leaves(a))) { const n = leaves(w); if (L <= R) { side[w] = -1; L += n; } else { side[w] = 1; R += n; } }
  for (const v of order) if (par[v] >= 0 && par[v] !== centre) side[v] = side[par[v]];
  const slot = { '-1': 0, 1: 0 }, tot = { '-1': Math.max(1, L), 1: Math.max(1, R) };
  const place = (v) => { if (!kids[v].length) { const s = side[v]; pos[v] = [s * d[v], (slot[s] + 0.5) / tot[s]]; slot[s] += 1; return pos[v][1]; } const ys = kids[v].map(place); pos[v] = [side[v] * d[v], ys.reduce((t, y) => t + y, 0) / ys.length]; return pos[v][1]; };
  for (const w of kids[centre]) place(w);
  pos[centre] = [0, 0.5];
  return { pos, depth: Math.max(1, ...d) };
}
let edgeHits = [];
function drawTree(F, tree, opt) {   // opt: totals, hot (edge set), arrows
  const { ctx, dpr, pl, pt, iw, ih } = F, lay = treeLayout(tree), D = lay.depth;
  const X = (u) => pl + iw * (0.5 + 0.46 * u / D), Y = (y) => pt + 8 * dpr + (ih - 16 * dpr) * y;
  edgeHits = [];
  tree.edges.forEach(([a, b], i) => {
    const A = lay.pos[a], B = lay.pos[b], hot = opt.hot && opt.hot.has(i), t = opt.totals ? opt.totals[i] : null;
    const col = hot ? AM : t === null ? CY : t >= 4 ? MG : t === 3 ? AM : CY;
    ctx.strokeStyle = col; ctx.lineWidth = (hot || t >= 3 ? 2.6 : 1.4) * dpr; ctx.globalAlpha = hot || !opt.hot ? 1 : 0.55;
    ctx.beginPath(); ctx.moveTo(X(A[0]), Y(A[1])); ctx.lineTo(X(B[0]), Y(B[1])); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
    const mx = (X(A[0]) + X(B[0])) / 2, my = (Y(A[1]) + Y(B[1])) / 2;
    if (opt.arrows) { const ux = X(B[0]) - X(A[0]), uy = Y(B[1]) - Y(A[1]), l = Math.hypot(ux, uy), ax = mx + 0.12 * ux, ay = my + 0.12 * uy, s = 6 * dpr; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(ax + s * ux / l, ay + s * uy / l); ctx.lineTo(ax - s * uy / l * 0.6, ay + s * ux / l * 0.6); ctx.lineTo(ax + s * uy / l * 0.6, ay - s * ux / l * 0.6); ctx.fill(); }
    if (t !== null) { ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(String(t), mx, my - 3 * dpr); }
    edgeHits.push({ i, x1: X(A[0]) / dpr, y1: Y(A[1]) / dpr, x2: X(B[0]) / dpr, y2: Y(B[1]) / dpr, mx: mx / dpr, my: my / dpr });
  });
  for (let v = 0; v < tree.V; v++) {
    const [u, y] = lay.pos[v], odd = tree.deg[v] % 2 === 1;
    ctx.fillStyle = '#02040a'; ctx.strokeStyle = odd ? AM : CY; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.arc(X(u), Y(y), 4.2 * dpr, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); ctx.lineWidth = 1;
    if (opt.labels) { ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(v), X(u), Y(y) + 6 * dpr); }
  }
}
function drawMain() {
  const M = MODEL, F = frame2d(cv1, 14); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  cv1.classList.toggle('editable', M.mode === 'fixed');
  if (M.mode === 'mix') {
    const half = { ...F, iw: iw * 0.5 }; drawTree(half, PATH3, { totals: [4, 4], arrows: true, labels: true });
    const W = weightsOf(S.c, pr.M), x0 = pl + iw * 0.58, cell = Math.min((iw * 0.36) / 3, (ih - 22 * dpr) / 3), y0 = pt + 14 * dpr, mx = Math.max(...W.flat());
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      const w = W[a][b], t = Math.log(w) / Math.log(Math.max(2, mx)), x = x0 + b * cell, y = y0 + a * cell;
      ctx.fillStyle = `rgba(255, 200, 61, ${0.08 + 0.5 * t})`; ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.strokeStyle = FAINT; ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.fillStyle = w > 1 ? INK : DIM; ctx.fillText(String(w), x + cell / 2, y + cell / 2);
    }
    ctx.fillStyle = DIM; ctx.textBaseline = 'bottom'; ctx.fillText('ρ(k₁, k₂)', x0 + 1.5 * cell, y0 - 2 * dpr);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (let a = 0; a < 3; a++) ctx.fillText(`k₁=${a + 1}`, x0 - 3 * dpr, y0 + (a + 0.5) * cell);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (let b = 0; b < 3; b++) ctx.fillText(`k₂=${b + 1}`, x0 + (b + 0.5) * cell, y0 + 3 * cell + 2 * dpr);
  } else if (M.mode === 'fixed') {
    drawTree(F, M.tree, { totals: S.totals });
  } else {
    const it = pr.k > 0 ? M.list[pr.k - 1] : null, totals = M.tree.edges.map((_, i) => (it && (i === it.a || i === it.b) ? 3 : 2));
    drawTree(F, M.tree, { totals, hot: new Set(it ? [it.a, it.b] : []) });
  }
}
function drawSide() {   // the y = x + 1/x plane: the unit circle maps onto the interval [−2, 2]
  const F = frame2d(cv2, 34); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress(), Z = pr.zoom, YR = 2.8;
  const X = (y) => pl + iw * (Math.max(-YR, Math.min(YR, y)) + YR) / (2 * YR), Y = (v) => pt + ih / 2 - (ih / 2 - 6 * dpr) * Math.max(-1, Math.min(1, v));
  ctx.strokeStyle = FAINT; ctx.beginPath(); ctx.moveTo(pl, Y(0)); ctx.lineTo(pl + iw, Y(0)); ctx.stroke();
  ctx.strokeStyle = AM; ctx.lineWidth = 3 * dpr; ctx.beginPath(); ctx.moveTo(X(-2), Y(0)); ctx.lineTo(X(2), Y(0)); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const g of [-2, -1, 0, 1, 2]) ctx.fillText(String(g).replace('-', '−'), X(g), pt + ih + 3 * dpr);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`Im ${zfmt(Z)}`, pl + 3 * dpr, pt + 8 * dpr);
  let nOn = 0, nOff = 0;
  if (pr.d) for (const r of pr.d.roots) {
    const q = r.re * r.re + r.im * r.im, yr = r.re + r.re / q, yi = r.im - r.im / q;   // y = x + 1/x
    ctx.fillStyle = r.off ? MG : r.re === 1 && r.im === 0 ? AM : CY; if (r.off) nOff += r.mult; else nOn += r.mult;
    ctx.beginPath(); ctx.arc(X(yr), Y(yi * Z / 2), (r.off ? 3.6 : 2.8) * dpr, 0, 2 * Math.PI); ctx.fill();
  }
  $('c2Meta').textContent = T(`在区间上 ${nOn} · 离开 ${nOff}`, `on the interval ${nOn} · off ${nOff}`);
}

/* =====================================================================
   12. Readouts and controls
   ===================================================================== */
let syncedKey = '', toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function setRo(rows) { rows.forEach(([l, v], i) => { $(`ro${i + 1}L`).textContent = l; $(`ro${i + 1}`).textContent = v; }); }
function pill(id, label, value) { $(id).innerHTML = `${label} <strong>${value}</strong>`; }
const TREE_NAME = { hub: ['双中心', 'double hub'], path: ['路径', 'path'], star: ['星', 'star'], spider: ['蜘蛛', 'spider'], random: ['随机树', 'random tree'] };
const treeLabel = (tree) => { const [zh, en] = TREE_NAME[tree.name] || ['', '']; return tree.name === 'hub' ? T(`${zh} m = ${(tree.edges.length - 2) / 2}`, `${en} m = ${(tree.edges.length - 2) / 2}`) : T(zh, en); };
const isE8 = () => MODEL.mode === 'fixed' && MODEL.tree.name === 'hub' && MODEL.tree.edges.length === 8 && MODEL.n.every((x) => x === 3);
function readouts() {
  const M = MODEL, pr = progress(), d = pr.d;
  if (M.mode === 'mix') {
    const al = mixAlgebra(d), w31 = S.c === 10 && pr.M === 31 && S.j === -TAU_DEN, tau = S.j / TAU_DEN;
    setRo([[T('权重 c · M · τ', 'Weights c · M · τ'), `${S.c} · ${pr.M} · ${num(tau, 2).replace('-', '−')}`],
      [T('次数 · x = 1 的重数', 'Degree · multiplicity of x = 1'), `${d.deg} · ${d.mult1}`],
      [T('离圆的根 · 最大 ||x| − 1|', 'Roots off the circle · largest ||x| − 1|'), `${d.nOff} · ${sci(d.maxDev)}`],
      al.q ? [T('x⁻⁴P = (y − 2)q(y) · disc q', 'x⁻⁴P = (y − 2)q(y) · disc q'), `q = ${polyStr(al.q, 'y')} · ${al.disc.toString().replace('-', '−')}`]
        : [T('x⁻⁴P = R(y)，y = x + 1/x', 'x⁻⁴P = R(y), y = x + 1/x'), al.R ? polyStr(al.R, 'y') : '—'],
      [T('结论', 'Verdict'), d.nOff ? (w31 ? T('有根离开单位圆：这正是冻结的反例 W₃₁', 'Roots leave the unit circle: this is the frozen counterexample W₃₁') : T('有根离开单位圆：这组权重也是猜想 1 的反例（页面数值）', 'Roots leave the unit circle: these weights are also a counterexample to Conjecture 1 (page computation)')) : T('所有根都在单位圆上（页面数值）', 'Every root is on the unit circle (page computation)')]]);
    pill('pillA', 'M', String(pr.M)); pill('pillB', 'τ', num(tau, 2).replace('-', '−')); pill('pillC', 'OFF', String(d.nOff)); pill('pillD', 'Z', zfmt(pr.zoom));
    $('roNote').innerHTML = al.q ? T('τ = −1 时 P 有因子 (x − 1)²；其余部分 x³q(x + 1/x) 的三次式 q 只要有非实根，对应的 x 就不在圆上。判别式为负正是这种情形。', 'At τ = −1, P has the factor (x − 1)²; the rest is x³q(x + 1/x), and as soon as the cubic q has a nonreal root the matching x is off the circle. A negative discriminant is exactly that case.')
      : T('P 是自反的，x⁻⁴P 可以写成 y = x + 1/x 的四次式 R；根都在单位圆上当且仅当 R 的根都是 [−2, 2] 里的实数。', 'P is self-reciprocal, so x⁻⁴P is a quartic R in y = x + 1/x; all roots lie on the unit circle exactly when the roots of R are real and in [−2, 2].');
  } else if (M.mode === 'fixed') {
    const e8 = isE8();
    setRo([[T('树 · 边 · 顶点', 'Tree · edges · vertices'), `${treeLabel(M.tree)} · ${M.tree.edges.length} · ${M.tree.V}`],
      [T('边总数 · 分法数', 'Edge totals · splits'), `${M.n.join(',')} · ${M.splits}`],
      [T('次数 · x = 1 的重数 · 奇度顶点', 'Degree · multiplicity of x = 1 · odd-degree vertices'), `${d.deg} · ${d.mult1} · ${M.tree.odd}`],
      [T('离圆的根 · 最大 ||x| − 1|', 'Roots off the circle · largest ||x| − 1|'), `${d.nOff} · ${sci(d.maxDev)}`],
      [T('结论', 'Verdict'), d.nOff ? (e8 ? T('一个根在圆内、它的倒数在圆外：冻结的物理反例', 'A root inside the circle and its reciprocal outside: the frozen physical counterexample') : T('有根离开单位圆（页面数值）', 'Roots leave the unit circle (page computation)')) : T('所有根都在单位圆上（页面数值）', 'Every root is on the unit circle (page computation)')]]);
    pill('pillA', 'E', String(M.tree.edges.length)); pill('pillB', T('次数', 'DEG'), String(d.deg)); pill('pillC', 'OFF', String(d.nOff)); pill('pillD', 'Z', zfmt(pr.zoom));
    $('roNote').innerHTML = e8 ? T('去掉 (1 − x)⁶ 之后，P 是 x⁹ 乘一个 y = x + 1/x 的九次式；它和 Lean 证明里的 F(y) 只差一个常数倍。', 'After removing (1 − x)⁶, P is x⁹ times a degree-9 polynomial in y = x + 1/x, which differs from F(y) in the Lean proof only by a constant factor.')
      : T('点下方树图里的边可以把它的总数在 2、3、4、5 之间轮换；分法数超过 4096 时页面拒绝计算。', 'Click an edge in the tree chart below to cycle its total through 2, 3, 4 and 5; the page refuses to compute beyond 4096 splits.');
  } else {
    const N = pr.N, off = M.list.filter((it) => it.off), h = M.tree.odd, done = pr.k === N;
    setRo([[T('树 · 边 · 次数 2E + 2', 'Tree · edges · degree 2E + 2'), `${treeLabel(M.tree)} · ${M.tree.edges.length} · ${2 * M.tree.edges.length + 2}`],
      [T('已加入的放法', 'Placements summed'), `${pr.k} / ${N}`],
      [T('x = 1 的重数 · 奇度顶点数', 'Multiplicity of x = 1 · odd-degree vertices'), d ? `${d.mult1} · ${h}` : `— · ${h}`],
      [T('离圆的根 · 最大 ||x| − 1|', 'Roots off the circle · largest ||x| − 1|'), d ? `${d.nOff} · ${sci(d.maxDev)}` : '—'],
      [T('单独离圆的放法 · 结论', 'Placements off the circle alone · verdict'), `${off.length} / ${N} · ` + (done ? (d.nOff ? T('和离开了圆？（与冻结定理矛盾）', 'the sum is off the circle? (contradicts the frozen theorem)') : T('和的全部根都在圆上：冻结定理', 'every root of the sum is on the circle: the frozen theorem')) : T('还没加完', 'not all summed yet'))]]);
    pill('pillA', 'k', `${pr.k}/${N}`); pill('pillB', T('次数', 'DEG'), d ? String(d.deg) : '—'); pill('pillC', 'OFF', d ? String(d.nOff) : '—'); pill('pillD', 'Z', zfmt(pr.zoom));
    $('roNote').innerHTML = off.length ? T(`单独离圆的放法：${off.map((it) => `(${it.a}, ${it.b})`).join('、')}（边的编号，品红色点）。全部加完的和在圆上，这是冻结定理。`, `Placements off the circle on their own: ${off.map((it) => `(${it.a}, ${it.b})`).join(', ')} (edge numbers, magenta points). The full sum is on the circle; that is the frozen theorem.`)
      : T('每一种放法单独看都在圆上（灰点）；全部加完的和在圆上，这是冻结定理。', 'Every placement is on the circle on its own (grey points); the full sum is on the circle, which is the frozen theorem.');
  }
}
const fieldsFor = { mix: ['cField', 'tauField', 'zoomField'], fixed: ['treeField', 'sizeField', 'totField'], sum: ['treeField', 'sizeField', 'zoomField'] };
function syncOutputs() {
  if (dirty) { build(); dirty = false; syncedKey = ''; toasted = false; }
  const M = MODEL, key = `${S.mode}|${S.nowFrac}|${S.zoomLog}|${TRV.lang()}`;
  if (key === syncedKey) return; syncedKey = key;
  const pr = progress();
  readouts();
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  document.querySelectorAll('#treeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tree === S.tree)));
  document.querySelectorAll('#totChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(!!S.totals && S.totals.every((t) => t === parseInt(b.dataset.tot, 10)))));
  for (const f of ['cField', 'tauField', 'treeField', 'sizeField', 'totField', 'zoomField']) $(f).hidden = !fieldsFor[S.mode].includes(f);
  $('cc').value = S.c; $('oC').textContent = String(S.c);
  $('tt').value = S.j / TAU_DEN; $('oT').textContent = num(S.j / TAU_DEN, 2).replace('-', '−');
  const Ereal = M.mode === 'mix' ? 2 : M.tree.edges.length; $('ee').value = S.E; $('oE').textContent = String(Ereal);
  $('zz').value = S.zoomLog; $('oZ').textContent = zfmt(zoomOf(S.zoomLog));
  $('presetNote').innerHTML = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = ({
    mix: T('时间轴 = 分法 (3, 3) 的权重 M，从 1 到 80；滑块设定 c、τ 与放大倍数。', 'The time axis is the weight M of split (3, 3), from 1 to 80; the sliders set c, τ and the magnification.'),
    fixed: T('时间轴 = 放大倍数，从 ×1 到 ×1000。权重是原文 (2.19) 的物理权重，τ = −1。', 'The time axis is the magnification, from ×1 to ×1000. The weights are the physical weights of the source’s (2.19), at τ = −1.'),
    sum: T('时间轴 = 已加入的放法数。每种放法：两条边总数 3，其余 2；物理权重，τ = −1。', 'The time axis counts the placements summed so far. Each placement puts total 3 on two edges and 2 on the rest; physical weights, τ = −1.')
  })[S.mode];
  $('litNote').innerHTML = T('根、离圆距离与各种扫描都是页面现算的数值；冻结的是两个反例和“配对系数的根都在圆上”。', 'The roots, distances and scans are numbers computed on the page; what is frozen are the two counterexamples and the theorem that the pair coefficient has all its roots on the circle.');
  $('c1Title').textContent = ({ mix: T('三点路径与联合权重 ρ(k₁, k₂)', 'The three-vertex path and the joint weights ρ(k₁, k₂)'), fixed: T('树与边总数（琥珀 = 3，品红 = 4 以上；琥珀圈 = 奇度顶点）', 'The tree and its edge totals (amber = 3, magenta = 4 or more; amber rings = odd-degree vertices)'), sum: T('树与当前加入的放法（琥珀 = 总数 3）', 'The tree and the placement just added (amber = total 3)') })[S.mode];
  $('c1Meta').textContent = M.mode === 'sum' ? `${pr.k} / ${pr.N}` : M.mode === 'fixed' ? T(`${M.splits} 种分法`, `${M.splits} splits`) : `M = ${pr.M}`;
  $('c2Title').textContent = T('y = x + 1/x：单位圆 ↔ 区间 [−2, 2]', 'y = x + 1/x: the unit circle ↔ the interval [−2, 2]');
  $('clock').innerHTML = M.mode === 'mix' ? `M ${pr.M}` : M.mode === 'fixed' ? zfmt(pr.zoom) : `k ${pr.k}`;
  $('hudBig').textContent = ({ mix: () => T(`三点路径 · M = ${pr.M}`, `three-vertex path · M = ${pr.M}`), fixed: () => T(`物理权重 · 放大 ${zfmt(pr.zoom)}`, `physical weights · magnified ${zfmt(pr.zoom)}`), sum: () => T(`配对系数 · ${pr.k} / ${pr.N}`, `pair coefficient · ${pr.k} / ${pr.N}`) })[M.mode]();
  $('hudSub').textContent = ({ mix: T('青环 = 单位圆；品红 = 离圆的根；淡点 = 较小 M 时的根；琥珀柱 = x = 1 的重根', 'cyan ring = unit circle; magenta = roots off it; faint dots = roots at smaller M; amber column = the repeated root x = 1'),
    fixed: T('离圆距离按放大倍数画出；品红短线 = 根离圆的位移；竖起的柱 = 重根', 'distances from the circle drawn magnified; magenta strokes = how far a root moved off; columns = repeated roots'),
    sum: T('灰点 = 每种放法单独的根（品红 = 单独离圆）；亮点 = 当前部分和的根', 'grey dots = roots of each placement alone (magenta = off the circle alone); bright dots = roots of the current partial sum') })[M.mode];
  if (!toasted && S.playing && S.nowFrac >= 1) {
    toasted = true; const d = pr.d;
    if (M.mode === 'sum') toast(d && !d.nOff ? T(`<b>${pr.N} 种放法加完</b>：全部 ${d.deg} 个根都在单位圆上，x = 1 是 ${d.mult1} 重根。`, `<b>All ${pr.N} placements summed</b>: all ${d.deg} roots are on the unit circle, with x = 1 a root of multiplicity ${d.mult1}.`) : T('<b>加完了</b>。', '<b>All summed</b>.'));
    else if (M.mode === 'fixed') toast(d.nOff ? T(`<b>放大 1000 倍</b>：${d.nOff} 个根离开圆，最远 ${sci(d.maxDev)}。`, `<b>Magnified ×1000</b>: ${d.nOff} roots are off the circle, the farthest by ${sci(d.maxDev)}.`) : T('<b>放大 1000 倍</b>：仍然没有根离开圆。', '<b>Magnified ×1000</b>: still no root off the circle.'));
    else { const first = MODEL.per.findIndex((x, m) => m >= 1 && x && x.nOff > 0); toast(first > 0 ? T(`<b>M = 80</b>：根从 M = ${first} 起离开单位圆。`, `<b>M = 80</b>: roots have been off the unit circle since M = ${first}.`) : T('<b>M = 80</b>：根始终在单位圆上。', '<b>M = 80</b>: the roots never left the unit circle.')); }
  }
}
function syncRail() {
  const M = MODEL, key = `${S.mode}|${M.mode === 'sum' ? M.list.length : 0}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  const marks = M.mode === 'mix' ? [[0, 'M=1'], [fracOfM(20), '20'], [fracOfM(31), '31'], [fracOfM(60), '60'], [1, '80']]
    : M.mode === 'fixed' ? [[0, '×1'], [1 / 3, '×10'], [2 / 3, '×100'], [1, '×1000']]
      : [[0, 'k=0'], [0.5, String(Math.round(M.list.length / 2))], [1, String(M.list.length)]];
  $('marks').innerHTML = marks.map(([f, s], i) => `<i class="${i === 0 ? 'first' : i === marks.length - 1 ? 'last' : ''}" style="left:${(f * 100).toFixed(2)}%">${s}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => {
  const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'mix'; if (S.mode === m) return;
  S.mode = m; S.nowFrac = 0; if (m === 'fixed') S.totals = null; custom();
}));
$('cc').addEventListener('input', () => { S.c = Math.min(40, Math.max(1, Math.round(parseFloat($('cc').value)))); custom(); });
$('tt').addEventListener('input', () => { S.j = Math.min(TAU_DEN, Math.max(-TAU_DEN, Math.round(parseFloat($('tt').value) * TAU_DEN))); custom(); });
$('zz').addEventListener('input', () => { S.zoomLog = Math.min(3, Math.max(0, Math.round(parseFloat($('zz').value) * 20) / 20)); S.preset = null; markPreset(); });
$('ee').addEventListener('input', () => { S.E = Math.min(EMAX, Math.max(EMIN, Math.round(parseFloat($('ee').value)))); S.totals = null; if (S.mode === 'sum') S.nowFrac = 0; custom(); });
document.querySelectorAll('#treeChips .chip').forEach((b) => b.addEventListener('click', () => {
  const t = b.dataset.tree; if (t === 'random' && S.tree === 'random') S.seed = (S.seed * 48271 + 11) % 2147483647; S.tree = t; S.totals = null; if (S.mode === 'sum') S.nowFrac = 0; custom();
}));
function setTotals(next) {
  if (splitCount(next) > SPLIT_CAP) { toast(T(`分法数 ${splitCount(next)} 超过 ${SPLIT_CAP}，页面不计算这一组总数。`, `${splitCount(next)} splits exceed ${SPLIT_CAP}; the page does not compute these totals.`)); return false; }
  S.totals = next; custom(); return true;
}
document.querySelectorAll('#totChips .chip').forEach((b) => b.addEventListener('click', () => { const t = parseInt(b.dataset.tot, 10); if (MODEL && MODEL.mode === 'fixed') setTotals(MODEL.tree.edges.map(() => t)); }));
cv1.addEventListener('pointerdown', (ev) => {
  if (!MODEL || MODEL.mode !== 'fixed') return;
  const r = cv1.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top; let best = null, bd = 12;
  for (const h of edgeHits) { const dx = h.x2 - h.x1, dy = h.y2 - h.y1, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - h.x1) * dx + (y - h.y1) * dy) / l2)), dd = Math.hypot(x - h.x1 - t * dx, y - h.y1 - t * dy); if (dd < bd) { bd = dd; best = h; } }
  if (!best) return;
  const next = S.totals.slice(); next[best.i] = next[best.i] >= 5 ? 2 : next[best.i] + 1; setTotals(next);
});
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.mode = p.mode; for (const k of ['c', 'j', 'zoomLog', 'tree', 'E']) if (p[k] !== undefined) S[k] = p[k];
  S.totals = p.tot ? treeFor(S.tree, S.E, S.seed).edges.map(() => p.tot) : null;
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
const nudge = () => (MODEL.mode === 'mix' ? 1 / (MMAX - 1) : MODEL.mode === 'sum' ? 1 / Math.max(1, MODEL.list.length) : 0.02);
document.addEventListener('keydown', (ev) => {
  if (ev.target && (ev.target.tagName === 'INPUT' && ev.target.type !== 'range')) return;
  if (drawer.isOpen()) return;
  if (ev.key === ' ' && !(ev.target && ev.target.tagName === 'BUTTON')) { ev.preventDefault(); S.playing = !S.playing; S.hold = 0; setPlayUI(); }
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) { ev.preventDefault(); jumpTo(S.nowFrac + (ev.key === 'ArrowRight' ? 1 : -1) * nudge()); }
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
const big = (P) => (P ? P.map(String) : null);
const rootsOut = (d) => (d ? d.roots.map((r) => ({ re: r.re, im: r.im, mult: r.mult, off: r.off })) : []);
window.LY_DEBUG = {
  pending: () => dirty || syncedKey !== `${S.mode}|${S.nowFrac}|${S.zoomLog}|${TRV.lang()}`,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, pr = progress(), o = { mode: M.mode, frac: S.nowFrac, zoom: pr.zoom };
    const d = pr.d; if (d) Object.assign(o, { coeffs: big(d.P), deg: d.deg, mult1: d.mult1, nOff: d.nOff, maxDev: d.maxDev, roots: rootsOut(d) });
    if (M.mode === 'mix') { const al = mixAlgebra(d); Object.assign(o, { c: S.c, j: S.j, M: pr.M, R: big(al.R), q: big(al.q), disc: al.disc === null ? null : String(al.disc), offByM: M.per.map((x) => (x ? x.nOff : null)) }); }
    else {
      Object.assign(o, { tree: { name: M.tree.name, V: M.tree.V, edges: M.tree.edges, deg: M.tree.deg, odd: M.tree.odd } });
      if (M.mode === 'fixed') Object.assign(o, { totals: M.n, splits: M.splits, reduction: big(M.reduction), e8: isE8() });
      else Object.assign(o, { k: pr.k, N: pr.N, offPlacements: M.list.filter((it) => it.off).map((it) => [it.a, it.b]), placementCoeffs: M.list.map((it) => big(prim(it.frac.num))) });
    }
    return o;
  },
  edgeScreen: (i) => { const h = edgeHits.find((e) => e.i === i); if (!h) return null; const r = cv1.getBoundingClientRect(); return { x: r.left + h.mx, y: r.top + h.my }; },
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('sweep'); S.playing = false; setPlayUI(); S.nowFrac = fracOfM(50); $('now').value = S.nowFrac; setCamPreset('iso'); };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('w31');
setPlayUI();
requestAnimationFrame(frame);
})();
