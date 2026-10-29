/* STATE//TRANSFER · 完美态传输 · 量子行走把态送到哪里
   Continuous-time quantum walks U(t) = exp(−iHt) on small graphs: uniform, Krawtchouk and rational-weight chains, a mirror-symmetric
   chain rebuilt from Kay's counterexample spectrum (Lanczos with weights 1/|B′(λ)|), the cube, the oriented circulant G(Z₃₀, {5, 6, 9, 20})
   two unit-phase triangles, a weighted five-site path with interior but no endpoint transfer, and a seventeen-vertex tree under the
   normalized Laplacian. The propagator comes from a complex Hermitian Jacobi diagonalization; zero-transfer sets come from exact
   BigInt powers of the integer skew matrix S = −iH and the Cayley–Hamilton theorem; Kay's sums R_k are exact fractions.
   Frozen Lean anchors and literature results are named in the page text. Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const COL = TRV.rgb, GREEN = [0.27, 1.0, 0.70];
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, ok: OK, cyan: CY, magenta: MG } = TRV.palette;
const GRAPHS = ['uniform', 'kraw', 'rational', 'kay', 'cube', 'z30', 'triT', 'triI', 'potpath', 'tree17'];
const SAMPLES = 700, RUN_SECONDS = 14, PST_LEVEL = 1 - 1e-10, Q_MAX = 48;   // exact transfer shows up as 1 − F at rounding level (≈ 1e-13)
const BAR_HEIGHT = { uniform: 4, kraw: 4, rational: 4, kay: 4, cube: 3.2, z30: 6, triT: 3, triI: 3, potpath: 4, tree17: 3 };   // height of probability 1
const KAY_LAMBDA = [0, 31, 46, 65, 88, 107, 122, 153];
const Z30_SET = [5, 6, 9, 20];
const ALPHA = [-4 * Math.sqrt(3) / 7, 1 / 7];              // α = (−4√3 + i)/7, |α| = 1
const POT_W = [2 * Math.SQRT2, Math.sqrt(5), Math.sqrt(5), 2 * Math.SQRT2];   // the weighted path of the Kirkland refutation
const TAU_INT = Math.PI / Math.SQRT2;                          // interior transfer 1 → 3 at τ = 2π/(2√2)

/* =====================================================================
   2. State and presets
   ===================================================================== */
const S = { graph: 'kraw', N: 9, q: 8, a: 0, b: 8, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'kraw9' };
const PRESETS = {
  uniform3: { graph: 'uniform', N: 3, b: 2,
    zh: '三个格点、两条一样的边。粒子从左端出发，在 t = π/√2 ≈ 2.22 时一点不剩地出现在右端：均匀耦合的短链也能完美传输。注意 t = π 时 F 只有 0.40。',
    en: 'Three sites and two equal edges. The particle starts at the left end and reappears in full at the right end at t = π/√2 ≈ 2.22: a short uniform chain can transfer perfectly. Note that at t = π, F is only 0.40.' },
  uniform6: { graph: 'uniform', N: 6, b: 5,
    zh: '六个格点的均匀链：振幅在链上来回反射、互相干涉，右端的概率起起落落，页面算到 t < 200 都没超过 0.99。态被“打散”了，送不全。',
    en: 'A uniform chain of six sites: the amplitude bounces back and forth and interferes with itself, and the probability at the right end rises and falls without passing 0.99 for all t < 200 the page computes. The state gets scattered and never arrives in full.' },
  kraw9: { graph: 'kraw', N: 9, b: 8,
    zh: '耦合取 Krawtchouk 型 ½√(n(N − n))：中间强、两头弱。九个格点的波包像一块整体平移过去，t = π 时完全出现在右端，再过 π 又回到左端。',
    en: 'Krawtchouk couplings ½√(n(N − n)), strong in the middle and weak at the ends. On nine sites the wave packet moves across as one piece, appears entirely at the right end at t = π, and returns to the left end after another π.' },
  rational5: { graph: 'rational', N: 5, q: 8, b: 4,
    zh: '五个格点，把 Krawtchouk 耦合四舍五入成 1/8 的倍数（有理数）：t = π 时 F = 0.9989，差一点。拖动分母 q：取整越细，差距大体越小（并不单调，q = 40 时只差 1.2 × 10⁻⁷），但冻结定理保证永远不等于 1。',
    en: 'Five sites with the Krawtchouk couplings rounded to multiples of 1/8 (rational numbers): at t = π, F = 0.9989, just short. Drag the denominator q: finer rounding mostly shrinks the gap (not monotonically; at q = 40 it is only 1.2 × 10⁻⁷), but the frozen theorem guarantees it never equals 1.' },
  kay8: { graph: 'kay', N: 8, b: 7,
    zh: '用 Kay 猜想的反例谱 0, 31, 46, 65, 88, 107, 122, 153 反解出的 8 格点镜像对称链：t = π 时完美传输，四个和 R₀ = R₁ = R₂ = R₃ 精确相等——猜想说这不可能。',
    en: 'An 8-site mirror-symmetric chain rebuilt from the counterexample spectrum 0, 31, 46, 65, 88, 107, 122, 153 to Kay’s conjecture: it transfers perfectly at t = π, and the four sums R₀ = R₁ = R₂ = R₃ are exactly equal, which the conjecture said was impossible.' },
  cube: { graph: 'cube', N: 8, b: 7,
    zh: '立方体的八个顶点、所有边耦合都是 1：从一个角出发，t = π/2 时一点不剩地出现在对角。均匀耦合在合适的图上也能把态送得很远。',
    en: 'The eight vertices of a cube, all couplings equal to 1: starting at one corner, the state reappears in full at the opposite corner at t = π/2. On the right graph, uniform couplings can carry a state far.' },
  zero30: { graph: 'z30', N: 30, b: 2,
    zh: '定向循环图 G(Z₃₀, {5, 6, 9, 20})：从 0 出发，振幅铺开到一半顶点，但偶数顶点 2 上的概率永远是 0。Song–Lin 猜想说这样的 v 必须是奇数——这个反例推翻了它。',
    en: 'The oriented circulant G(Z₃₀, {5, 6, 9, 20}): starting at 0 the amplitude spreads over half the vertices, but the probability on the even vertex 2 stays exactly 0 forever. Song and Lin conjectured that such a v must be odd; this counterexample refutes it.' },
  interior5: { graph: 'potpath', N: 5, a: 1, b: 3,
    zh: '五个格点、边权 2√2, √5, √5, 2√2 的路径：从内部顶点 1 出发，t = π/√2 ≈ 2.22 时完全到达 3。Kirkland 等人问：内部完美传输是否总能推出两端之间的完美传输？把起点改成 0、目标改成 4，F 永远到不了 1——冻结定理说不能。',
    en: 'A path of five sites with weights 2√2, √5, √5, 2√2: starting at the interior vertex 1, the state arrives in full at 3 at t = π/√2 ≈ 2.22. Kirkland and coauthors asked whether interior perfect transfer always gives perfect transfer between the ends. Set the start to 0 and the target to 4: F never reaches 1, and the frozen theorem says it cannot.' },
  tree17: { graph: 'tree17', N: 17, a: 0, b: 1,
    zh: '17 个顶点的树：中心连着两片叶子 u、v 和七条两节的臂。用归一化拉普拉斯 I − D⁻½AD⁻½ 当哈密顿量，t = 3π 时 u 上的态完全到达 v。Coutinho 与 Baptista 猜想除了 2、3 个顶点的路径，没有树能做到——这棵树推翻了它。',
    en: 'A tree on 17 vertices: a centre joined to two leaves u, v and to seven arms of two edges each. With the normalized Laplacian I − D⁻½AD⁻½ as the Hamiltonian, the state on u arrives in full at v at t = 3π. Coutinho and Baptista conjectured that no tree except the paths on 2 and 3 vertices does this; this tree refutes it.' },
  universal3: { graph: 'triT', N: 3, b: 2,
    zh: '三角形，边权都是模长 1 的复数 α = (−4√3 + i)/7。它在 t ≈ 8.46 把态送到 2、在 t ≈ 16.93 送到 1：任意两点都能完美传输。猜想说只有 K₂ 和 Circ(0, −i, i) 能做到——这是第三个。',
    en: 'A triangle whose edge weights are the unit complex number α = (−4√3 + i)/7. It carries the state to 2 at t ≈ 8.46 and to 1 at t ≈ 16.93: every pair transfers perfectly. The conjecture said only K₂ and Circ(0, −i, i) can do this; this is a third.' }
};

/* =====================================================================
   3. Linear algebra: complex Hermitian Jacobi, propagator entries
   ===================================================================== */
function hermJacobi(n, Hre, Him) {
  const A = { re: Float64Array.from(Hre), im: Float64Array.from(Him) }, V = { re: new Float64Array(n * n), im: new Float64Array(n * n) };
  for (let i = 0; i < n; i++) V.re[i * n + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A.re[i * n + j] ** 2 + A.im[i * n + j] ** 2;
    if (off < 1e-28) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const hr = A.re[p * n + q], hi = A.im[p * n + q], h = Math.hypot(hr, hi); if (h < 1e-300) continue;
      // make H_pq real by the phase e^{−iφ} on index q, then a real Jacobi rotation in the (p, q) plane
      const er = hr / h, ei = hi / h;
      for (let k = 0; k < n; k++) { const ar = A.re[k * n + q], ai = A.im[k * n + q]; A.re[k * n + q] = ar * er + ai * ei; A.im[k * n + q] = ai * er - ar * ei; }
      for (let k = 0; k < n; k++) { const ar = A.re[q * n + k], ai = A.im[q * n + k]; A.re[q * n + k] = ar * er - ai * ei; A.im[q * n + k] = ai * er + ar * ei; }
      for (let k = 0; k < n; k++) { const vr = V.re[k * n + q], vi = V.im[k * n + q]; V.re[k * n + q] = vr * er + vi * ei; V.im[k * n + q] = vi * er - vr * ei; }
      const app = A.re[p * n + p], aqq = A.re[q * n + q], apq = A.re[p * n + q];
      const th = (aqq - app) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (const M of [A, V]) for (let k = 0; k < n; k++) { const kpR = M.re[k * n + p], kpI = M.im[k * n + p], kqR = M.re[k * n + q], kqI = M.im[k * n + q]; M.re[k * n + p] = c * kpR - s * kqR; M.im[k * n + p] = c * kpI - s * kqI; M.re[k * n + q] = s * kpR + c * kqR; M.im[k * n + q] = s * kpI + c * kqI; }
      for (let k = 0; k < n; k++) { const pkR = A.re[p * n + k], pkI = A.im[p * n + k], qkR = A.re[q * n + k], qkI = A.im[q * n + k]; A.re[p * n + k] = c * pkR - s * qkR; A.im[p * n + k] = c * pkI - s * qkI; A.re[q * n + k] = s * pkR + c * qkR; A.im[q * n + k] = s * pkI + c * qkI; }
    }
  }
  return { lam: Array.from({ length: n }, (_, i) => A.re[i * n + i]), V };
}
/* ψ_v(t) = Σ_k V_vk e^{−iλ_k t} conj(V_ak) for every vertex v */
function psiAt(E, n, a, t) {
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const ph = -E.lam[k] * t, c = Math.cos(ph), s = Math.sin(ph), yr = E.V.re[a * n + k], yi = -E.V.im[a * n + k], wr = yr * c - yi * s, wi = yr * s + yi * c;
    for (let v = 0; v < n; v++) { const xr = E.V.re[v * n + k], xi = E.V.im[v * n + k]; re[v] += xr * wr - xi * wi; im[v] += xr * wi + xi * wr; }
  }
  return { re, im };
}
function ampAt(E, n, v, a, t) { let r = 0, i = 0; for (let k = 0; k < n; k++) { const ph = -E.lam[k] * t, c = Math.cos(ph), s = Math.sin(ph), xr = E.V.re[v * n + k], xi = E.V.im[v * n + k], yr = E.V.re[a * n + k], yi = -E.V.im[a * n + k], pr = xr * yr - xi * yi, pi = xr * yi + xi * yr; r += pr * c - pi * s; i += pr * s + pi * c; } return r * r + i * i; }

/* =====================================================================
   4. Graphs
   ===================================================================== */
const kraw = (N) => Array.from({ length: N - 1 }, (_, i) => 0.5 * Math.sqrt((i + 1) * (N - 1 - i)));
function rationalWeights(N, q) { return kraw(N).map((x) => { const p = Math.max(1, Math.round(x * q)); return { p, q, v: p / q }; }); }
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
const fracStr = (p, q) => { const g = gcd(p, q); return q / g === 1 ? String(p / g) : `${p / g}/${q / g}`; };
/* Kay's spectrum → mirror-symmetric chain: Lanczos on diag(λ − mean) with first-component weights 1/|B′(λ)| */
const KAY = (() => {
  const lam = KAY_LAMBDA, N = lam.length, mean = (lam[0] + lam[N - 1]) / 2;
  const Bp = lam.map((x, k) => lam.reduce((p, y, j) => (j === k ? p : p * (x - y)), 1));
  let w = Bp.map((b) => 1 / Math.abs(b)); const ws = w.reduce((s, x) => s + x, 0); w = w.map((x) => x / ws);
  const L = lam.map((x) => x - mean); let q = w.map(Math.sqrt), qprev = new Array(N).fill(0), beta = 0; const alpha = [], betas = [];
  for (let j = 0; j < N; j++) { const z = q.map((x, k) => L[k] * x), a = z.reduce((s, x, k) => s + x * q[k], 0); alpha.push(a); const r = z.map((x, k) => x - a * q[k] - beta * qprev[k]); beta = Math.sqrt(r.reduce((s, x) => s + x * x, 0)); if (j < N - 1) betas.push(beta); qprev = q; q = r.map((x) => x / beta); }
  // exact R_k = Σ (−1)^n / B′(λ_n) over levels with (λ_n − λ_1) ≡ k (mod 4), with the source's index n starting at 1
  const big = (x) => BigInt(x), bgcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
  const R = [0, 1, 2, 3].map(() => [0n, 1n]);
  lam.forEach((x, n) => { const k = (x - lam[0]) % 4, B = big(Bp[n]), sgn = (n + 1) % 2 === 0 ? 1n : -1n, [p0, q0] = R[k]; let num = p0 * B + sgn * q0, den = q0 * B; const g = bgcd(num, den) || 1n; num /= g; den /= g; if (den < 0n) { num = -num; den = -den; } R[k] = [num, den]; });
  return { couplings: betas, potentials: alpha, R: R.map(([a, b]) => `${a}/${b}`), Bp };
})();
/* exact zero-transfer set from vertex 0 for an integer skew matrix S (H = iS): (S^k)_{0,v} = 0 for k < n ⟺ zero transfer */
function zeroTransferSet(n, Sint) {
  let r = new Array(n).fill(0n); r[0] = 1n; const seen = new Array(n).fill(false); seen[0] = true;
  for (let k = 1; k < n; k++) { const s = new Array(n).fill(0n); for (let i = 0; i < n; i++) if (r[i]) for (let j = 0; j < n; j++) if (Sint[i][j]) s[j] += r[i] * BigInt(Sint[i][j]); r = s; r.forEach((x, j) => { if (x !== 0n) seen[j] = true; }); }
  return seen.map((x, j) => (x ? null : j)).filter((x) => x !== null);
}
function buildGraph(kind, N, q) {
  const G = { kind, edges: [], oriented: false };
  const mk = (n) => { G.n = n; G.re = new Float64Array(n * n); G.im = new Float64Array(n * n); };
  const chain = (w, pot) => { mk(w.length + 1); w.forEach((x, i) => { G.re[i * G.n + i + 1] = x; G.re[(i + 1) * G.n + i] = x; G.edges.push([i, i + 1, x]); }); if (pot) pot.forEach((x, i) => { G.re[i * G.n + i] = x; }); const n = G.n, sp = Math.min(1.25, 9 / Math.max(1, n - 1)); G.pos = Array.from({ length: n }, (_, i) => [(i - (n - 1) / 2) * sp, 0, 0]); };
  if (kind === 'uniform') { chain(new Array(N - 1).fill(1)); G.span = 4 * Math.PI; G.weights = new Array(N - 1).fill('1'); }
  else if (kind === 'kraw') { const w = kraw(N); chain(w); G.span = 2 * Math.PI; G.weights = w.map((x) => x.toFixed(3)); }
  else if (kind === 'rational') { const w = rationalWeights(N, q); chain(w.map((x) => x.v)); G.span = 2 * Math.PI; G.weights = w.map((x) => fracStr(x.p, x.q)); }
  else if (kind === 'kay') { chain(KAY.couplings, KAY.potentials); G.span = 2 * Math.PI; G.weights = KAY.couplings.map((x) => x.toFixed(2)); }
  else if (kind === 'cube') {
    mk(8); for (let a = 0; a < 8; a++) for (let bit = 0; bit < 3; bit++) { const c = a ^ (1 << bit); G.re[a * 8 + c] = 1; if (a < c) G.edges.push([a, c, 1]); }
    G.pos = Array.from({ length: 8 }, (_, a) => [(a & 1 ? 1 : -1) * 1.7, (a & 2 ? 1 : -1) * 1.7 + 0.3, (a & 4 ? 1 : -1) * 1.7]); G.span = 2 * Math.PI;
  } else if (kind === 'z30') {
    mk(30); G.oriented = true; G.S = Array.from({ length: 30 }, () => new Array(30).fill(0));
    for (let a = 0; a < 30; a++) for (const c of Z30_SET) { const b = (a + c) % 30; G.im[a * 30 + b] = 1; G.im[b * 30 + a] = -1; G.S[a][b] = 1; G.S[b][a] = -1; G.edges.push([a, b, 1]); }
    G.pos = Array.from({ length: 30 }, (_, v) => [3.6 * Math.sin(2 * Math.PI * v / 30), 0, -3.6 * Math.cos(2 * Math.PI * v / 30)]); G.span = 12;
  } else if (kind === 'potpath') {
    chain(POT_W); G.span = 2 * Math.PI * Math.SQRT2; G.weights = ['2√2', '√5', '√5', '2√2']; G.mark = TAU_INT; G.markLabel = 'π/√2';
  } else if (kind === 'tree17') {
    // u = 0 and v = 1 hang off the centre c = 2; arm i (1 … 7) is c – x_i – y_i with x_i = 2i + 1, y_i = 2i + 2 (the Lean labelling)
    mk(17); const adj = [[0, 2], [1, 2]]; for (let i = 1; i <= 7; i++) adj.push([2, 2 * i + 1], [2 * i + 1, 2 * i + 2]);
    const deg = new Array(17).fill(0); for (const [x, y] of adj) { deg[x]++; deg[y]++; }
    for (let x = 0; x < 17; x++) G.re[x * 17 + x] = 1;   // normalized Laplacian I − D^{−1/2} A D^{−1/2}
    for (const [x, y] of adj) { const w = -1 / Math.sqrt(deg[x] * deg[y]); G.re[x * 17 + y] = w; G.re[y * 17 + x] = w; G.edges.push([x, y, 1]); }
    const ang = (k) => -Math.PI * 0.62 + Math.PI * 1.24 * k / 6, at = (r, a) => [r * Math.sin(a), 0, -r * Math.cos(a)];
    G.pos = new Array(17); G.pos[2] = [0, 0, 0]; G.pos[0] = at(1.5, Math.PI * 0.86); G.pos[1] = at(1.5, Math.PI * 1.14);
    for (let i = 1; i <= 7; i++) { G.pos[2 * i + 1] = at(2.3, ang(i - 1)); G.pos[2 * i + 2] = at(3.9, ang(i - 1)); }
    G.deg = deg; G.span = 6 * Math.PI; G.mark = 3 * Math.PI;
  } else {
    mk(3); G.oriented = true; const a1 = kind === 'triT' ? ALPHA : [0, -1];
    for (let j = 0; j < 3; j++) { const k1 = (j + 1) % 3, k2 = (j + 2) % 3; G.re[j * 3 + k1] = a1[0]; G.im[j * 3 + k1] = a1[1]; G.re[j * 3 + k2] = a1[0]; G.im[j * 3 + k2] = -a1[1]; G.edges.push([j, k1, 1]); }
    if (kind === 'triI') G.S = [[0, -1, 1], [1, 0, -1], [-1, 1, 0]];          // S = −iH
    G.pos = Array.from({ length: 3 }, (_, v) => [2.4 * Math.sin(2 * Math.PI * v / 3), 0, -2.4 * Math.cos(2 * Math.PI * v / 3)]); G.span = kind === 'triT' ? 9 * Math.PI : 2 * Math.PI;
  }
  return G;
}

/* =====================================================================
   5. The model
   ===================================================================== */
let MODEL = null, dirty = true;
function build() {
  const G = buildGraph(S.graph, S.N, S.q), n = G.n; S.b = Math.min(Math.max(0, S.b), n - 1); S.a = Math.min(Math.max(0, S.a), n - 1);
  const E = hermJacobi(n, G.re, G.im), M = { G, n, E, a: S.a, b: S.b };
  M.ts = Float64Array.from({ length: SAMPLES + 1 }, (_, i) => G.span * i / SAMPLES);
  M.curve = new Float64Array(SAMPLES + 1); M.reach = new Float64Array(n);
  for (let i = 0; i <= SAMPLES; i++) { const p = psiAt(E, n, S.a, M.ts[i]); for (let v = 0; v < n; v++) { const pr = p.re[v] ** 2 + p.im[v] ** 2; if (pr > M.reach[v]) M.reach[v] = pr; } M.curve[i] = p.re[S.b] ** 2 + p.im[S.b] ** 2; }
  // the maximum of F over the window, refined around the best sample
  let top = 0; for (let i = 0; i <= SAMPLES; i++) top = Math.max(top, M.curve[i]);
  let k = 0; while (k < SAMPLES && M.curve[k] < top - 1e-3) k++;     // the first sample near the maximum,
  while (k < SAMPLES && M.curve[k + 1] >= M.curve[k]) k++;            // climbed to the top of its peak (a broad peak is wider than the refinement reaches), then refined
  let tBest = M.ts[k], fBest = M.curve[k], h = G.span / SAMPLES;
  for (let it = 0; it < 40; it++) { for (const dt of [-h, h]) { const t = Math.min(G.span, Math.max(0, tBest + dt)), f = ampAt(E, n, S.b, S.a, t); if (f > fBest) { fBest = f; tBest = t; } } h /= 1.6; }
  M.maxF = fBest; M.tMax = tBest; M.fPi = ampAt(E, n, S.b, S.a, Math.PI); M.fMark = G.mark !== undefined ? ampAt(E, n, S.b, S.a, G.mark) : null;
  // the endpoint pair 0 → 4 of the weighted path over one period π√2 of its spectrum 0, ±2√2, ±3√2
  if (S.graph === 'potpath') { let mx = 0; for (let k = 0; k <= 20000; k++) { const f = ampAt(E, n, 4, 0, Math.PI * Math.SQRT2 * k / 20000); if (f > mx) mx = f; } M.endMax = mx; }
  M.lam = E.lam.slice().sort((x, y) => x - y);
  if (S.graph === 'uniform') { let mx = 0; for (let t = 0; t <= 200; t += 0.01) { const f = ampAt(E, n, S.b, S.a, t); if (f > mx) mx = f; } M.longMax = mx; }
  if (S.graph === 'rational') M.qCurve = Array.from({ length: Q_MAX }, (_, i) => { const H = buildGraph('rational', S.N, i + 1), e = hermJacobi(H.n, H.re, H.im); return 1 - ampAt(e, H.n, H.n - 1, 0, Math.PI); });
  if (G.S) M.zeroSet = zeroTransferSet(n, G.S);
  // first perfect transfer to 1 and to 2: scan for local maxima above 0.999, refine each by golden section, keep the first that reaches PST_LEVEL
  if (S.graph === 'triT' || S.graph === 'triI') M.firstPST = [1, 2].map((v) => {
    const T0 = S.graph === 'triT' ? 30 : 8, dt = 0.0005, f = (t) => ampAt(E, n, v, 0, t);
    let prev = f(0), cur = f(dt);
    for (let t = 2 * dt; t < T0; t += dt) {
      const next = f(t);
      if (cur > 0.999 && cur >= prev && cur >= next) {
        let a = t - 2 * dt, b = t; const r = (Math.sqrt(5) - 1) / 2;
        for (let it = 0; it < 60; it++) { const c = b - r * (b - a), d = a + r * (b - a); if (f(c) > f(d)) b = d; else a = c; }
        const tm = (a + b) / 2; if (f(tm) > PST_LEVEL) return tm;
      }
      prev = cur; cur = next;
    }
    return null;
  });
  MODEL = M;
}
const tNow = () => S.nowFrac * MODEL.G.span;
const piFamily = () => ['uniform', 'kraw', 'rational', 'kay', 'cube', 'triT', 'triI', 'tree17'].includes(MODEL.G.kind);

/* =====================================================================
   6. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const f6 = (v) => (v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(6));
const fNear = (v) => (v === null || !isFinite(v) ? '—' : 1 - v > 1e-11 && 1 - v < 1e-5 ? `1 − ${(1 - v).toExponential(2)}` : f6(v));   // values just below 1 keep their gap visible
const sci = (v) => (v === null || !isFinite(v) ? '—' : v === 0 ? '0' : v < 1e-4 ? v.toExponential(2) : v.toFixed(6));
const graphName = (g) => ({ uniform: T('均匀链', 'uniform chain'), kraw: T('Krawtchouk 链', 'Krawtchouk chain'), rational: T('有理权链', 'rational chain'), kay: T('Kay 反例链', 'Kay chain'), cube: T('立方体', 'cube'), z30: 'G(Z₃₀, {5, 6, 9, 20})', triT: 'Circ(0, α, ᾱ)', triI: 'Circ(0, −i, i)', potpath: T('带权五点路径', 'weighted 5-path'), tree17: T('17 顶点树', '17-vertex tree') })[g];
function phaseRGB(re, im) {
  const a = Math.atan2(im, re), c = Math.cos(a), s = Math.sin(a);
  const w = [Math.max(0, c), Math.max(0, s), Math.max(0, -c), Math.max(0, -s)], cols = [COL.cyan, COL.amber, COL.magenta, GREEN];
  const tot = w.reduce((x, y) => x + y, 0) || 1; return [0, 1, 2].map((i) => w.reduce((acc, wk, k) => acc + wk * cols[k][i], 0) / tot);
}
const piLabel = (t) => { const r = t / Math.PI; for (const d of [1, 2, 4]) { const k = Math.round(r * d); if (Math.abs(r * d - k) < 1e-9) return k === 0 ? '0' : d === 1 ? (k === 1 ? 'π' : `${k}π`) : `${k === 1 ? '' : k}π/${d}`; } return t.toFixed(2); };

/* =====================================================================
   7. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 6000, PTS_MAX = 80;
const CAMS = { iso: [0.55, 1.05, 12.5], front: [0.0001, 1.5, 12.5], top: [0.0001, 0.06, 12.5] };
const cam = { theta: 0.55, phi: 1.05, r: 12.5, tTheta: 0.55, tPhi: 1.05, tR: 12.5 };
let camName = 'iso';
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
const RING_FS = `
varying vec3 vCol; varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
  float ring = smoothstep(0.1, 0.0, abs(r - 0.72)) + smoothstep(0.34, 0.0, r) * 0.9;
  float a = ring * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}`;
const additive = { transparent: true, depthWrite: false, depthTest: false, blending: window.THREE ? THREE.AdditiveBlending : 2 };
function dyn(g, name, n, size) { const a = new THREE.BufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; }
function initGL() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) { renderer = null; }
  if (!renderer || !window.THREE) {
    const d = document.createElement('div'); d.className = 'nogl';
    d.textContent = T('这个浏览器没有提供 WebGL，三维视图无法显示。下方的 F(t) 曲线、顶点图和右侧读数仍然可用。', 'This browser does not provide WebGL, so the 3D view cannot be shown. The F(t) curve, the vertex chart and the readouts still work.');
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
  pts = new THREE.Points(gp, new THREE.ShaderMaterial({ vertexShader: EVT_VS, fragmentShader: RING_FS, uniforms: { uScale: { value: 60 } }, ...additive }));
  pts.frustumCulled = false; scene3.add(pts);
}
function updateGL() {
  const M = MODEL, G = M.G, n = M.n, ps = psiAt(M.E, n, M.a, tNow()), BAR_H = BAR_HEIGHT[G.kind];
  const L = lines.geometry.attributes, Pp = L.position.array, Cc = L.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp.set(a, 3 * v); Cc.set([col[0] * k, col[1] * k, col[2] * k], 3 * v); v++; Pp.set(b, 3 * v); Cc.set([col[0] * k, col[1] * k, col[2] * k], 3 * v); v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array.set(p, 3 * np); PT.aColor.array.set(col, 3 * np); PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  // edges: brightness grows with |weight|; oriented edges get a chevron near their head
  const wmax = Math.max(...G.edges.map((e) => Math.abs(e[2])));
  for (const [a, b, w] of G.edges) {
    const A = G.pos[a], B = G.pos[b], k = 0.15 + 0.5 * Math.abs(w) / wmax;
    seg(A, B, COL.cyan, G.kind === 'z30' ? 0.12 : k);
    if (G.oriented) { const tip = A.map((x, i) => x + 0.72 * (B[i] - x)), d = B.map((x, i) => x - A[i]), len = Math.hypot(...d), u = d.map((x) => x / len), side = [-u[2], 0, u[0]], sz = 0.16;
      seg(tip, tip.map((x, i) => x - sz * u[i] + sz * 0.6 * side[i]), COL.cyan, 0.5); seg(tip, tip.map((x, i) => x - sz * u[i] - sz * 0.6 * side[i]), COL.cyan, 0.5); }
  }
  // vertices: a bar whose height is the probability, coloured by the phase
  const zero = new Set(M.zeroSet || []);
  for (let u = 0; u < n; u++) {
    const P = G.pos[u], pr = ps.re[u] ** 2 + ps.im[u] ** 2, col = phaseRGB(ps.re[u], ps.im[u]), top = [P[0], P[1] + BAR_H * pr, P[2]];
    const hw = G.kind === 'z30' ? 0.07 : 0.1, k = 0.3 + 0.7 * Math.min(1, pr * 3), corners = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];
    if (pr > 1e-6) { corners.forEach(([dx, dz], c) => { const [ex, ez] = corners[(c + 1) % 4]; seg([P[0] + dx, P[1], P[2] + dz], [P[0] + dx, top[1], P[2] + dz], col, k * 0.7); seg([P[0] + dx, top[1], P[2] + dz], [P[0] + ex, top[1], P[2] + ez], col, k); }); }
    const isT = u === M.b, isS = u === M.a;
    dot(P, isT ? COL.amber : isS ? COL.sigma : zero.has(u) ? COL.magenta : COL.gray, isT || isS ? 0.95 : 0.6, isT || isS ? 2.2 : 1.2);
    if (pr > 1e-4) dot(top, col, 0.9, 1.0 + 1.2 * Math.sqrt(pr));
  }
  // the full-probability level above the target
  const PT0 = G.pos[M.b]; for (let q = 0; q < 24; q++) { const a1 = 2 * Math.PI * q / 24, a2 = 2 * Math.PI * (q + 1) / 24, r = 0.28; seg([PT0[0] + r * Math.cos(a1), PT0[1] + BAR_H, PT0[2] + r * Math.sin(a1)], [PT0[0] + r * Math.cos(a2), PT0[1] + BAR_H, PT0[2] + r * Math.sin(a2)], COL.amber, 0.5); }
  lines.geometry.setDrawRange(0, v); L.position.needsUpdate = true; L.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 58 * renderer.getPixelRatio();
}

/* =====================================================================
   8. Camera
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.6 : 1);
  camera.position.set(r * sp * Math.sin(cam.theta), (MODEL ? BAR_HEIGHT[MODEL.G.kind] * 0.3 : 1) + r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  const ly = MODEL ? BAR_HEIGHT[MODEL.G.kind] * 0.3 : 1; camera.up.set(0, 1, 0); camera.lookAt(0, ly, 0);
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
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(26, Math.max(6, cam.tR * drag.pinch / d)); drag.pinch = d; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY;
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => { if (!drag.pts.has(ev.pointerId)) return; drag.pts.delete(ev.pointerId); if (drag.pts.size === 0) drag.pinch = 0; };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(26, Math.max(6, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   9. Tags
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
  const M = MODEL, G = M.G; let k = 0;
  const put = (text, p, cls) => { const el = tagAt(k++, cls); el.textContent = text; placeTag(el, p); };
  const below = (u) => [G.pos[u][0], G.pos[u][1] - 0.5, G.pos[u][2] - (G.kind === 'z30' || G.kind.startsWith('tri') ? 0 : 0.6)];
  put(T(`起点 ${M.a}`, `START ${M.a}`), below(M.a), 'cy');
  put(T(`目标 ${M.b}`, `TARGET ${M.b}`), [G.pos[M.b][0], G.pos[M.b][1] + BAR_HEIGHT[G.kind] + 0.4, G.pos[M.b][2]], 'hot');
  if (G.weights && G.n <= 9) G.edges.forEach(([a, b], i) => put(G.weights[i], [(G.pos[a][0] + G.pos[b][0]) / 2, -0.3, 0.75], ''));
  if (G.kind === 'z30') for (const u of M.zeroSet) if (u % 2 === 0 && u !== M.b) put(String(u), [G.pos[u][0] * 1.12, -0.2, G.pos[u][2] * 1.12], 'mg');
  for (let i = k; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}

/* =====================================================================
   10. 2D panels
   ===================================================================== */
function frame2d(cv, pl0 = 36) {
  const dpr = fitCanvas(cv), ctx = cv.getContext('2d'), Wd = cv.width, Hh = cv.height;
  ctx.clearRect(0, 0, Wd, Hh);
  const pl = pl0 * dpr, pr = 12 * dpr, pt = 10 * dpr, pb = 20 * dpr;
  return { dpr, ctx, W: Wd, Hh, pl, pt, iw: Wd - pl - pr, ih: Hh - pt - pb };
}
function drawCurve() {
  const F = frame2d(cv1, 36); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, span = M.G.span, X = (t) => pl + t / span * iw, Y = (f) => pt + ih - f * ih;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  ctx.strokeStyle = FAINT; ctx.globalAlpha = 0.6; ctx.beginPath(); for (const g of [0, 0.5, 1]) { ctx.moveTo(pl, Y(g)); ctx.lineTo(pl + iw, Y(g)); } ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of [0, 0.5, 1]) ctx.fillText(g.toFixed(1), pl - 4 * dpr, Y(g));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const t of railTicks()) ctx.fillText(piFamily() ? piLabel(t) : String(Math.round(t)), X(t), pt + ih + 3 * dpr);
  const mark = M.G.mark !== undefined ? M.G.mark : piFamily() && Math.PI <= span ? Math.PI : null;
  if (mark !== null) { ctx.strokeStyle = AM; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(X(mark), pt); ctx.lineTo(X(mark), pt + ih); ctx.stroke(); ctx.setLineDash([]); }
  ctx.strokeStyle = CY; ctx.lineWidth = 1.8 * dpr; ctx.beginPath(); M.curve.forEach((f, i) => { if (i) ctx.lineTo(X(M.ts[i]), Y(f)); else ctx.moveTo(X(M.ts[i]), Y(f)); }); ctx.stroke(); ctx.lineWidth = 1;
  const t = tNow(), f = ampAt(M.E, M.n, M.b, M.a, t); ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(t), Y(f), 4 * dpr, 0, 2 * Math.PI); ctx.fill();
  if (M.maxF > PST_LEVEL) { ctx.fillStyle = OK; ctx.beginPath(); ctx.arc(X(M.tMax), Y(1), 3 * dpr, 0, 2 * Math.PI); ctx.fill(); }
  const markLabel = M.G.markLabel || (mark !== null ? piLabel(mark) : '');
  $('c1Meta').textContent = mark !== null ? T(`${M.a} → ${M.b} · 琥珀虚线 = t = ${markLabel}`, `${M.a} → ${M.b} · amber dashes = t = ${markLabel}`) : `${M.a} → ${M.b}`;
}
function drawSide() {
  const F = frame2d(cv2, 36); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, G = M.G;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  if (G.kind === 'rational') {
    const LO = -9, Y = (v) => pt + ih - (Math.max(LO, Math.log10(Math.max(1e-300, v))) - LO) / -LO * ih, bw = iw / Q_MAX;
    ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of [0, -3, -6, -9]) ctx.fillText(`1e${g}`, pl - 4 * dpr, Y(10 ** g));
    M.qCurve.forEach((v, i) => { const x = pl + i * bw, y = Y(v); ctx.fillStyle = i + 1 === S.q ? AM : MG; ctx.globalAlpha = i + 1 === S.q ? 1 : 0.6; ctx.fillRect(x + bw * 0.15, y, bw * 0.7, pt + ih - y); }); ctx.globalAlpha = 1;
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const q of [1, 12, 24, 36, 48]) ctx.fillText(`q=${q}`, pl + (q - 0.5) * bw, pt + ih + 3 * dpr);
    $('c2Title').textContent = T('t = π 时差多少：1 − F(π)', 'HOW FAR SHORT AT t = π: 1 − F(π)');
    $('c2Meta').textContent = T('每根柱子都 > 0（对数坐标）', 'every bar is > 0 (log scale)');
  } else if (G.kind === 'kay') {
    const bw = iw / 4;
    ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('R', pl - 6 * dpr, pt + ih / 2);
    for (let k = 0; k < 4; k++) { const x = pl + k * bw; ctx.fillStyle = OK; ctx.globalAlpha = 0.7; ctx.fillRect(x + bw * 0.2, pt + ih * 0.25, bw * 0.6, ih * 0.75); ctx.globalAlpha = 1; ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(`R${'₀₁₂₃'[k]}`, x + bw / 2, pt + ih + 3 * dpr); ctx.textBaseline = 'bottom'; ctx.font = `${8.5 * dpr}px ${TRV.fonts.data}`; ctx.fillText(KAY.R[k], x + bw / 2, pt + ih * 0.23); ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; }
    $('c2Title').textContent = T('四个和 R_k（M = 4）', 'THE FOUR SUMS R_k (M = 4)');
    $('c2Meta').textContent = T('精确分数，全部相等', 'exact fractions, all equal');
  } else {
    const n = M.n, bw = iw / n, ps = psiAt(M.E, n, M.a, tNow()), zero = new Set(M.zeroSet || []);
    ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of [0, 0.5, 1]) ctx.fillText(g.toFixed(1), pl - 4 * dpr, pt + ih - g * ih);
    for (let u = 0; u < n; u++) {
      const x = pl + u * bw, r = M.reach[u], p = ps.re[u] ** 2 + ps.im[u] ** 2;
      ctx.strokeStyle = zero.has(u) ? MG : u === M.b ? AM : FAINT; ctx.strokeRect(x + bw * 0.12, pt + ih - r * ih, bw * 0.76, Math.max(1, r * ih));
      ctx.fillStyle = u === M.b ? AM : CY; ctx.globalAlpha = 0.85; ctx.fillRect(x + bw * 0.12, pt + ih - p * ih, bw * 0.76, p * ih); ctx.globalAlpha = 1;
      if (zero.has(u)) { ctx.fillStyle = MG; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('0', x + bw / 2, pt + ih - 2 * dpr); }
      if (n <= 12 || u % 5 === 0 || u === M.b) { ctx.fillStyle = u === M.b ? AM : DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(u), x + bw / 2, pt + ih + 3 * dpr); }
    }
    $('c2Title').textContent = T('每个顶点：最高到过多少（框）与此刻（实）', 'EACH VERTEX: HIGHEST SO FAR (BOX) AND NOW (FILL)');
    $('c2Meta').textContent = M.zeroSet ? T('品红 = 精确零传输', 'magenta = exact zero transfer') : T(`时间窗 0 … ${piFamily() ? piLabel(G.span) : +G.span.toFixed(2)}`, `window 0 … ${piFamily() ? piLabel(G.span) : +G.span.toFixed(2)}`);
  }
}

/* =====================================================================
   11. Readouts and controls
   ===================================================================== */
let syncedFrac = NaN, toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function railTicks() { const G = MODEL.G, span = G.span; if (!piFamily()) return Array.from({ length: Math.floor(span / 2) + 1 }, (_, i) => 2 * i); const step = span <= 2.01 * Math.PI ? Math.PI / 2 : span <= 4.01 * Math.PI ? Math.PI : 3 * Math.PI; return Array.from({ length: Math.floor(span / step + 1e-9) + 1 }, (_, i) => i * step); }
function syncOutputs() {
  if (dirty) { build(); dirty = false; toasted = false; }
  const M = MODEL, G = M.G, t = tNow(), ps = psiAt(M.E, M.n, M.a, t), F = ps.re[M.b] ** 2 + ps.im[M.b] ** 2; syncedFrac = S.nowFrac;
  const chain = ['uniform', 'kraw', 'rational'].includes(S.graph);
  document.querySelectorAll('#graphChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.graph === S.graph)));
  $('nField').hidden = !chain; $('qField').hidden = S.graph !== 'rational';
  $('nN').min = S.graph === 'rational' ? '3' : '2'; $('nN').step = S.graph === 'rational' ? '2' : '1'; $('nN').value = S.N; $('oN').textContent = String(S.N);
  $('qq').value = S.q; $('oQ').textContent = String(S.q);
  $('target').max = String(M.n - 1); $('target').value = M.b; $('oB').textContent = String(M.b);
  $('source').max = String(M.n - 1); $('source').value = M.a; $('oA').textContent = String(M.a);
  $('presetNote').textContent = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义参数。', 'Custom settings.');
  $('graphNote').innerHTML = ({
    uniform: T(`${S.N} 个格点，每条边耦合都是 1。`, `${S.N} sites, every coupling equal to 1.`),
    kraw: T(`耦合 J<sub>n</sub> = ½√(n(N − n))；谱是等间距的 −(N − 1)/2, …, (N − 1)/2。`, `Couplings J<sub>n</sub> = ½√(n(N − n)); the spectrum is evenly spaced, −(N − 1)/2, …, (N − 1)/2.`),
    rational: T('Krawtchouk 耦合四舍五入成 1/q 的倍数（至少 1/q），格点数取奇数 2m + 1。', 'Krawtchouk couplings rounded to multiples of 1/q (at least 1/q), with an odd number 2m + 1 of sites.'),
    kay: T('由谱 0, 31, …, 153 用 Lanczos 方法反解出的链（势能为 0）。', 'The chain rebuilt from the spectrum 0, 31, …, 153 by the Lanczos method (zero potentials).'),
    cube: T('立方体的 8 个顶点，12 条边耦合都是 1。', 'The 8 vertices of the cube, all 12 couplings equal to 1.'),
    z30: T('顶点 0 … 29，a → a + c 的弧（c ∈ {5, 6, 9, 20}）在 H 里是 i，反向是 −i。', 'Vertices 0 … 29; an arc a → a + c (c ∈ {5, 6, 9, 20}) is i in H and −i in reverse.'),
    triT: T('H<sub>jk</sub> = a<sub>k−j</sub>，a<sub>1</sub> = α = (−4√3 + i)/7，a<sub>2</sub> = ᾱ，|α| = 1。', 'H<sub>jk</sub> = a<sub>k−j</sub> with a<sub>1</sub> = α = (−4√3 + i)/7, a<sub>2</sub> = ᾱ, |α| = 1.'),
    triI: T('Circ(0, −i, i)：已知的普适完美传输例子。', 'Circ(0, −i, i): the known example with universal perfect transfer.'),
    potpath: T('顶点 0 … 4，边权 2√2, √5, √5, 2√2，势能为 0；谱是 0、±2√2、±3√2，所以每过 π√2 ≈ 4.44 一切回到原样。', 'Vertices 0 … 4, edge weights 2√2, √5, √5, 2√2, zero potentials; the spectrum is 0, ±2√2, ±3√2, so everything returns every π√2 ≈ 4.44.'),
    tree17: T('u = 0、v = 1 挂在中心 c = 2 上；第 i 条臂是 c – x<sub>i</sub> – y<sub>i</sub>，x<sub>i</sub> = 2i + 1，y<sub>i</sub> = 2i + 2。H 是归一化拉普拉斯，度数：中心 9、臂中点 2、叶 1。', 'u = 0 and v = 1 hang off the centre c = 2; arm i is c – x<sub>i</sub> – y<sub>i</sub> with x<sub>i</sub> = 2i + 1, y<sub>i</sub> = 2i + 2. H is the normalized Laplacian; degrees: 9 at the centre, 2 in the middle of each arm, 1 at the leaves.')
  })[S.graph];
  // readouts
  let norm = 0; for (let u = 0; u < M.n; u++) norm += ps.re[u] ** 2 + ps.im[u] ** 2;
  $('roF').textContent = fNear(F);
  $('roMax').textContent = M.maxF < 1e-20 ? T('0（全程为零）', '0 (zero throughout)') : `${fNear(M.maxF)} @ t = ${M.tMax.toFixed(4)}`;
  $('roPi').textContent = fNear(M.fPi);
  $('roNorm').textContent = norm.toFixed(12);
  $('roSpec').textContent = M.lam.slice(0, 12).map((x) => (Math.abs(x) < 5e-10 ? '0' : x.toFixed(3))).join(', ') + (M.lam.length > 12 ? ', …' : '');
  const ro6 = ({
    uniform: () => [T('t < 200 内目标的最大 F', 'Largest F at the target for t < 200'), f6(M.longMax)],
    kraw: () => [T('边权', 'Edge weights'), G.weights.join(', ')],
    rational: () => [T('边权（有理数）', 'Edge weights (rational)'), G.weights.join(', ')],
    kay: () => [T('R₀ = R₁ = R₂ = R₃（精确）', 'R₀ = R₁ = R₂ = R₃ (exact)'), KAY.R.every((r) => r === KAY.R[0]) ? KAY.R[0] : KAY.R.join(' · ')],
    cube: () => [T('完美传输的时刻', 'Time of perfect transfer'), M.maxF > PST_LEVEL ? `t = ${M.tMax.toFixed(6)} ≈ π/2` : '—'],
    z30: () => [T('从 0 出发的零传输顶点（精确）', 'Vertices with zero transfer from 0 (exact)'), M.zeroSet ? M.zeroSet.join(', ') : '—'],
    triT: () => [T('首次完美传输：0 → 1、0 → 2', 'First perfect transfer: 0 → 1, 0 → 2'), M.firstPST.map((x) => (x === null ? '—' : `t ≈ ${x.toFixed(4)}`)).join(' · ')],
    triI: () => [T('首次完美传输：0 → 1、0 → 2', 'First perfect transfer: 0 → 1, 0 → 2'), M.firstPST.map((x) => (x === null ? '—' : `t ≈ ${x.toFixed(4)}`)).join(' · ')],
    potpath: () => [T(`t = π/√2 时 ${M.a} → ${M.b} 的 F · 端点 0 → 4 在一个周期里的最大 F`, `F for ${M.a} → ${M.b} at t = π/√2 · largest F for the ends 0 → 4 over one period`), `${fNear(M.fMark)} · ${f6(M.endMax)}`],
    tree17: () => [T(`t = 3π 时 ${M.a} → ${M.b} 的 F`, `F for ${M.a} → ${M.b} at t = 3π`), fNear(M.fMark)]
  })[S.graph]();
  $('ro6L').textContent = ro6[0]; $('ro6').textContent = ro6[1];
  const zeroB = M.zeroSet && M.zeroSet.includes(M.b);
  $('roNote').innerHTML = zeroB ? T(`顶点 ${M.b} 属于精确零传输集：S 的前 30 个幂在 (0, ${M.b}) 处全为 0，由 Cayley–Hamilton 定理，所有时刻 U(t)<sub>${M.b},0</sub> = 0。${M.b % 2 === 0 ? '它是偶数，所以是 Song–Lin 猜想的反例。' : ''}`, `Vertex ${M.b} is in the exact zero-transfer set: the first 30 powers of S vanish at (0, ${M.b}), so by the Cayley–Hamilton theorem U(t)<sub>${M.b},0</sub> = 0 at every time. ${M.b % 2 === 0 ? 'It is even, so it is a counterexample to the Song–Lin conjecture.' : ''}`)
    : M.maxF > PST_LEVEL ? (S.graph === 'rational'
      ? T(`t = ${M.tMax.toFixed(4)}（不是 π）时 F 与 1 的差小于 10⁻¹⁰。冻结定理只说 t = π 时到不了 1，对别的时刻不作断言。`, `At t = ${M.tMax.toFixed(4)} (not π) F is within 10⁻¹⁰ of 1. The frozen theorem only rules out t = π and says nothing about other times.`)
      : T(`完美传输：t = ${M.tMax.toFixed(4)} 时 F = ${f6(M.maxF)}。`, `Perfect transfer: F = ${f6(M.maxF)} at t = ${M.tMax.toFixed(4)}.`))
      : T(`这个时间窗里目标最多到 ${fNear(M.maxF)}，没有到 1。`, `In this window the target reaches at most ${fNear(M.maxF)}, short of 1.`);
  $('litNote').innerHTML = S.graph === 'potpath' ? T('页面在一个周期里逐点算出端点 0 → 4 的 F：它的最大值小于 1；“任何时刻都不是 1”来自冻结定理的奇偶论证，不是采样。', 'The page samples F for the ends 0 → 4 over one period: its maximum stays below 1; “never 1 at any time” comes from the parity argument of the frozen theorem, not from the sampling.') : S.graph === 'tree17' ? T('页面用 Jacobi 对角化算出 t = 3π 时 F = 1（到舍入误差）；冻结定理给出精确的本征分解。', 'The page finds F = 1 at t = 3π (up to rounding) by Jacobi diagonalization; the frozen theorem gives the exact eigen-decomposition.') : S.graph === 'rational' ? T(`当前 q = ${S.q}：1 − F(π) = ${sci(1 - M.fPi)}。冻结定理保证对每个 q 都大于 0。`, `Now q = ${S.q}: 1 − F(π) = ${sci(1 - M.fPi)}. The frozen theorem guarantees it is positive for every q.`) : T('均匀耦合、Krawtchouk 耦合与立方体的完美传输是文献结果；页面直接计算核对。', 'Perfect transfer with uniform couplings, Krawtchouk couplings and on the cube are literature results; the page checks them by direct computation.');
  // pills, HUD, clock
  $('pillT').innerHTML = `t <strong>${t.toFixed(2)}</strong>`;
  $('pillF').innerHTML = `F <strong>${F.toFixed(4)}</strong>`;
  $('pillMax').innerHTML = `MAX F <strong>${M.maxF.toFixed(4)}</strong>`;
  $('pillG').innerHTML = `GRAPH <strong>${G.n}</strong>`;
  $('clock').innerHTML = piFamily() ? `${(t / Math.PI).toFixed(2)}<small>π</small>` : `${t.toFixed(2)}`;
  $('hudBig').textContent = T(`${graphName(S.graph)} · t = ${t.toFixed(3)} · F = ${F.toFixed(4)}`, `${graphName(S.graph)} · t = ${t.toFixed(3)} · F = ${F.toFixed(4)}`);
  $('hudSub').textContent = T('柱高 = 此刻在该顶点找到粒子的概率 · 颜色 = 振幅相位 · 琥珀圆环 = 目标的满概率高度', 'bar height = probability of finding the particle there now · colour = phase · amber ring = full height at the target');
  if (!toasted && S.playing && M.maxF > PST_LEVEL && Math.abs(t - M.tMax) < G.span / 160) { toasted = true; toast(T(`<b>完美传输</b>：t = ${M.tMax.toFixed(4)}，目标 ${M.b} 上 F = ${f6(M.maxF)}。`, `<b>Perfect transfer</b>: at t = ${M.tMax.toFixed(4)}, F = ${f6(M.maxF)} at target ${M.b}.`)); }
  else if (!toasted && S.playing && S.graph === 'rational' && Math.abs(t - Math.PI) < G.span / 160) { toasted = true; toast(T(`<b>t = π</b>：F = ${f6(M.fPi)}，差 ${sci(1 - M.fPi)}——有理权到不了 1。`, `<b>t = π</b>: F = ${f6(M.fPi)}, short by ${sci(1 - M.fPi)}; rational weights cannot reach 1.`)); }
  else if (!toasted && S.playing && zeroB && S.nowFrac >= 1) { toasted = true; toast(T(`<b>零传输</b>：顶点 ${M.b} 上的概率始终是 0。`, `<b>Zero transfer</b>: the probability at vertex ${M.b} stays 0 throughout.`)); }
}
function syncRail() {
  const key = `${S.graph}|${MODEL.G.span}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  const span = MODEL.G.span, ticks = railTicks();
  $('marks').innerHTML = ticks.map((t, i) => `<i class="${i === 0 ? 'first' : i === ticks.length - 1 && Math.abs(t - span) < 1e-9 ? 'last' : ''}" style="left:${(t / span * 100).toFixed(2)}%">${piFamily() ? piLabel(t) : Math.round(t)}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
const DEFAULT_N = { uniform: 6, kraw: 9, rational: 5, kay: 8, cube: 8, z30: 30, triT: 3, triI: 3, potpath: 5, tree17: 17 };
document.querySelectorAll('#graphChips .chip').forEach((b) => b.addEventListener('click', () => {
  const g = GRAPHS.includes(b.dataset.graph) ? b.dataset.graph : 'kraw'; if (S.graph === g) return;
  S.graph = g; if (!['uniform', 'kraw', 'rational'].includes(g) || (g === 'rational' && S.N % 2 === 0)) S.N = DEFAULT_N[g];
  S.a = g === 'potpath' ? 1 : 0; S.b = g === 'z30' ? 2 : g === 'cube' ? 7 : g === 'potpath' ? 3 : g === 'tree17' ? 1 : (['uniform', 'kraw', 'rational'].includes(g) ? S.N : DEFAULT_N[g]) - 1; S.nowFrac = 0; custom();
}));
$('nN').addEventListener('input', () => { let N = parseInt($('nN').value, 10); if (S.graph === 'rational' && N % 2 === 0) N += 1; S.N = Math.min(12, Math.max(2, N)); S.b = S.N - 1; custom(); });
$('qq').addEventListener('input', () => { S.q = Math.min(Q_MAX, Math.max(1, parseInt($('qq').value, 10))); custom(); });
$('target').addEventListener('input', () => { S.b = parseInt($('target').value, 10); custom(); });
$('source').addEventListener('input', () => { S.a = parseInt($('source').value, 10); custom(); });
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  for (const k of ['graph', 'N', 'b', 'q']) if (p[k] !== undefined) S[k] = p[k];
  S.a = p.a !== undefined ? p.a : 0;
  S.preset = name; markPreset(); dirty = true; setCamPreset('iso');
  if (!reduceMotion) { S.nowFrac = 0; S.dir = 1; S.playing = true; setPlayUI(); }
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
const jumpTo = (t) => { S.playing = false; setPlayUI(); S.nowFrac = Math.min(1, Math.max(0, t / MODEL.G.span)); $('now').value = S.nowFrac; };
document.addEventListener('keydown', (ev) => {
  if (ev.target && (ev.target.tagName === 'INPUT' && ev.target.type !== 'range')) return;
  if (drawer.isOpen()) return;
  if (ev.key === ' ' && !(ev.target && ev.target.tagName === 'BUTTON')) { ev.preventDefault(); S.playing = !S.playing; S.hold = 0; setPlayUI(); }
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) { ev.preventDefault(); jumpTo(tNow() + (ev.key === 'ArrowRight' ? 1 : -1) * MODEL.G.span / 200); }
  else if (ev.key === 'p' || ev.key === 'P') { if (Math.PI <= MODEL.G.span) jumpTo(Math.PI); }
  else if (ev.key === 'm' || ev.key === 'M') jumpTo(MODEL.tMax);
});

/* =====================================================================
   12. Main loop
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
      S.nowFrac += S.dir * dtSec * S.speed / RUN_SECONDS;
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 1.8; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.2; }
    }
    $('now').value = S.nowFrac;
  }
  if (S.nowFrac !== syncedFrac) syncOutputs();
  syncRail();
  if (glOK) { updateCamera(dtSec); updateGL(); renderer.render(scene3, camera); updateTags(); }
  drawCurve(); drawSide();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { syncOutputs(); $('marks').dataset.key = ''; });

/* read-only probe for automated browser tests */
window.ST_DEBUG = {
  pending: () => dirty || S.nowFrac !== syncedFrac,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, G = M.G, t = tNow(), ps = psiAt(M.E, M.n, M.a, t);
    return { graph: G.kind, n: M.n, a: M.a, b: M.b, fMark: M.fMark, endMax: M.endMax ?? null, mark: G.mark ?? null, H: { re: Array.from(G.re), im: Array.from(G.im) }, lam: M.lam.slice(), t, span: G.span, F: ps.re[M.b] ** 2 + ps.im[M.b] ** 2, psi: { re: Array.from(ps.re), im: Array.from(ps.im) },
      maxF: M.maxF, tMax: M.tMax, fPi: M.fPi, curve: Array.from(M.curve), ts: Array.from(M.ts), reach: Array.from(M.reach), weights: G.weights || null, zeroSet: M.zeroSet || null, kayR: KAY.R.slice(),
      qCurve: M.qCurve ? M.qCurve.slice() : null, firstPST: M.firstPST ? M.firstPST.slice() : null, longMax: M.longMax ?? null };
  },
  amp: (v, t) => ampAt(MODEL.E, MODEL.n, v, MODEL.a, t),
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('zero30'); S.playing = false; setPlayUI(); S.nowFrac = 0.35; $('now').value = S.nowFrac; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('kraw9');
S.nowFrac = 0; S.playing = !reduceMotion; $('now').value = S.nowFrac;
setPlayUI();
requestAnimationFrame(frame);
})();
