/* FOURTH//BASIS · 六维第四组互无偏基 · 一个开放问题
   Three known mutually unbiased bases per dimension (Pauli Z, X, Y for d = 2; standard, Fourier ω^{jk}/√d and quadratic-phase
   ω^{jk + j²}/√d for odd primes; their qubit ⊗ qutrit products for d = 6), and a Riemannian gradient descent on the Stiefel
   manifold that looks for a fourth basis (or a single vector) unbiased to all three: D = Σ_r Σ_ij (|(B_r†U)_ij|² − 1/d)², QR
   retraction, backtracking steps, 8 random starts of 400 steps each, all precomputed and replayed along the time rail.
   A third view uses m ≤ 3 of the known bases as a Schmidt-number witness: for the isotropic state v·Φ⁺ + (1 − v)·I/d² with Alice
   measuring the bases and Bob their complex conjugates, the md × md table Q_m of joint probabilities has a trace norm that a frozen
   theorem bounds by 1 + (m − 1)r/d for every state of Schmidt number at most r.
   Frozen Lean anchors, literature results and the open status are named in the page text.
   Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const COL = TRV.rgb, GREEN = [0.27, 1.0, 0.70];
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, ok: OK, cyan: CY, magenta: MG } = TRV.palette;
const DIMS = [2, 3, 5, 6, 7], STARTS = 8, ITERS = 400, SNAP = 5, FOUND = 1e-20, RUN_SECONDS = 24;
const KNOWN = { 2: 3, 3: 4, 4: 5, 5: 6, 6: 3, 7: 8 };            // known numbers of mutually unbiased bases
const BASIS_NAMES = { 2: ['Z', 'X', 'Y'], odd: [['标准', 'standard'], ['傅里叶', 'Fourier'], ['二次相位', 'quadratic phase']], 6: ['Z ⊗ I', 'X ⊗ F', 'Y ⊗ C'] };

/* =====================================================================
   2. State and presets
   ===================================================================== */
const S = { d: 6, target: 'basis', view: 'search', m: 3, seed: 1, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'six' };
const VIEWS = ['search', 'known', 'witness'], WIT_SAMPLES = 200, WIT_RUN = 14;
const PRESETS = {
  six: { d: 6, target: 'basis', view: 'search',
    zh: '六维：给定已知的三组互无偏基，从 8 个随机起点做梯度下降找第四组。每个起点的缺陷都停在 0.3 左右，柱子始终参差不齐。这是数值线索，不是证明。',
    en: 'Dimension six: given the three known mutually unbiased bases, gradient descent looks for a fourth from 8 random starts. Every start stalls with a defect around 0.3, and the bars never level out. This is a numerical lead, not a proof.' },
  five: { d: 5, target: 'basis', view: 'search',
    zh: '五维是素数，共有 6 组互无偏基。同样的搜索，不少起点（每批 8 个里通常 4 到 7 个）的缺陷一路降到 10⁻³⁰：三块柱阵全部齐平在 1/5，第四组找到了。其余起点停在局部极小。',
    en: 'Five is prime and has 6 mutually unbiased bases. With the same search many starts (usually 4 to 7 of every 8) drive the defect down to 10⁻³⁰: all three bar fields level out at 1/5, and a fourth basis is found. The other starts stop in a local minimum.' },
  three: { d: 3, target: 'basis', view: 'search',
    zh: '三维有 d + 1 = 4 组互无偏基，第四组正好把它们凑满。同样的梯度下降，试过的起点全都在几十步内把缺陷降到 10⁻³⁰，三块柱阵全部贴平在 1/3。',
    en: 'Dimension three has d + 1 = 4 mutually unbiased bases, so the fourth completes the set. With the same gradient descent every start tried drives the defect to 10⁻³⁰ within a few dozen steps, and all three bar fields level out at 1/3.' },
  seven: { d: 7, target: 'basis', view: 'search',
    zh: '七维有 d + 1 = 8 组互无偏基，第四组肯定存在。可是 8 个起点里通常只有一两个把缺陷降到 10⁻³⁰，其余停在 0.3 左右的局部极小；按 R 换几批起点，甚至会遇到整批都停住。停住不等于不存在。',
    en: 'Dimension seven has d + 1 = 8 mutually unbiased bases, so a fourth certainly exists. Yet usually only one or two of the 8 starts drive the defect to 10⁻³⁰, and the rest stop in a local minimum around 0.3; press R for new batches and a whole batch may stall. Stalling does not mean nonexistence.' },
  two: { d: 2, target: 'basis', view: 'search',
    zh: '二维最多 d + 1 = 3 组（Z、X、Y），第四组不存在——这是已证的。搜索的缺陷停在 1，和六维的“停住”看起来一样，意义却不同：这里是定理，六维是未知。',
    en: 'Dimension two has at most d + 1 = 3 (Z, X, Y), so a fourth does not exist, and that is proved. The defect stalls at 1, which looks like the stall in six, but the meaning differs: here it is a theorem, in six it is unknown.' },
  sixvec: { d: 6, target: 'vector', view: 'search',
    zh: '六维只找一个与三组都无偏的向量：8 个起点全停在缺陷 0.039。在这组三元组上，数值上连第四组的第一个向量都没有。',
    en: 'Dimension six, looking for just one vector unbiased to all three: all 8 starts stall at defect 0.039. On this triple, numerically, not even the first vector of a fourth basis exists.' },
  fivevec: { d: 5, target: 'vector', view: 'search',
    zh: '对照：五维里找一个与三组都无偏的向量，试过的起点都很快把缺陷降到 10⁻³⁰。同样的搜索在六维里却停在 0.039。',
    en: 'A control: in dimension five every start tried quickly drives the defect of a single vector to 10⁻³⁰. The same search in dimension six stalls at 0.039.' },
  witness6: { d: 6, view: 'witness', m: 3,
    zh: '用六维已知的三组基当纠缠判据：Alice 测这三组，Bob 测它们的复共轭，态是 v·Φ⁺ + (1 − v)·I/36。联合概率表 Q₃ 的迹范数超过 1 + 2r/6，就证明 Schmidt 数大于 r（冻结定理）。时间轴把可见度 v 从 0 扫到 1：v > 1/3 时证出纠缠，v = 1 时证出 Schmidt 数 6。若存在第四组基，门槛能降到 1/4——但第四组是否存在正是开放问题。',
    en: 'The three known bases in dimension six as an entanglement witness: Alice measures them, Bob measures their complex conjugates, and the state is v·Φ⁺ + (1 − v)·I/36. When the trace norm of the joint table Q₃ exceeds 1 + 2r/6, the Schmidt number exceeds r (a frozen theorem). The time rail sweeps the visibility v from 0 to 1: entanglement is certified for v > 1/3, and Schmidt number 6 at v = 1. A fourth basis would lower the threshold to 1/4, but whether one exists is exactly the open problem.' },
  known: { d: 6, view: 'known',
    zh: '已知的三组六维互无偏基两两比较：三块柱阵完全齐平在 1/6。它们由二维的 Z、X、Y 与三维的标准、傅里叶、二次相位基逐个做张量积得到。',
    en: 'The three known bases in dimension six compared pairwise: all three bar fields are perfectly level at 1/6. They come from tensoring the qubit Z, X, Y bases with the qutrit standard, Fourier and quadratic-phase bases one by one.' }
};

/* =====================================================================
   3. Complex matrices (flat, row-major; columns are basis vectors) and the known bases
   ===================================================================== */
const cmat = (n) => ({ n, re: new Float64Array(n * n), im: new Float64Array(n * n) });
function identity(d) { const R = cmat(d); for (let i = 0; i < d; i++) R.re[i * d + i] = 1; return R; }
function fourierLike(d, chirp) { const R = cmat(d); for (let j = 0; j < d; j++) for (let k = 0; k < d; k++) { const a = 2 * Math.PI * (j * k + chirp * j * j) / d; R.re[j * d + k] = Math.cos(a) / Math.sqrt(d); R.im[j * d + k] = Math.sin(a) / Math.sqrt(d); } return R; }
function fromRows(rows) { const d = rows.length, R = cmat(d); rows.forEach((r, i) => r.forEach(([a, b], j) => { R.re[i * d + j] = a; R.im[i * d + j] = b; })); return R; }
function kron(A, B) { const n = A.n, m = B.n, R = cmat(n * m); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < m; k++) for (let l = 0; l < m; l++) { const q = (i * m + k) * n * m + j * m + l, ar = A.re[i * n + j], ai = A.im[i * n + j], br = B.re[k * m + l], bi = B.im[k * m + l]; R.re[q] = ar * br - ai * bi; R.im[q] = ar * bi + ai * br; } return R; }
const S2 = Math.SQRT1_2;
const QUBIT = [identity(2), fromRows([[[S2, 0], [S2, 0]], [[S2, 0], [-S2, 0]]]), fromRows([[[S2, 0], [S2, 0]], [[0, S2], [0, -S2]]])];
function knownBases(d) {
  if (d === 2) return QUBIT;
  if (d === 6) { const Q3 = [identity(3), fourierLike(3, 0), fourierLike(3, 1)]; return [0, 1, 2].map((r) => kron(QUBIT[r], Q3[r])); }
  return [identity(d), fourierLike(d, 0), fourierLike(d, 1)];
}
/* overlap probabilities P[i·cols + j] = |(B† U)_ij|² for a d × cols candidate U */
function overlaps(B, U, cols) {
  const d = B.n, P = new Float64Array(d * cols);
  for (let i = 0; i < d; i++) for (let j = 0; j < cols; j++) { let sr = 0, si = 0; for (let k = 0; k < d; k++) { const ar = B.re[k * d + i], ai = -B.im[k * d + i], br = U.re[k * cols + j], bi = U.im[k * cols + j]; sr += ar * br - ai * bi; si += ar * bi + ai * br; } P[i * cols + j] = sr * sr + si * si; }
  return P;
}
function defectOf(Bs, U, cols) { const d = Bs[0].n; let D = 0; for (const B of Bs) for (const p of overlaps(B, U, cols)) D += (p - 1 / d) ** 2; return D; }
function orthonormalize(V, d, cols) {
  for (let j = 0; j < cols; j++) {
    for (let k = 0; k < j; k++) { let pr = 0, pi = 0; for (let i = 0; i < d; i++) { const ar = V.re[i * cols + k], ai = -V.im[i * cols + k], br = V.re[i * cols + j], bi = V.im[i * cols + j]; pr += ar * br - ai * bi; pi += ar * bi + ai * br; } for (let i = 0; i < d; i++) { const cr = V.re[i * cols + k], ci = V.im[i * cols + k]; V.re[i * cols + j] -= pr * cr - pi * ci; V.im[i * cols + j] -= pr * ci + pi * cr; } }
    let nn = 0; for (let i = 0; i < d; i++) nn += V.re[i * cols + j] ** 2 + V.im[i * cols + j] ** 2; nn = Math.sqrt(nn); for (let i = 0; i < d; i++) { V.re[i * cols + j] /= nn; V.im[i * cols + j] /= nn; }
  }
  return V;
}

/* the table Q_m for Φ⁺ = Σ_j |jj⟩/√d: Alice measures column a of B_l, Bob the conjugate of column b of B_k, so the amplitude is
   ⟨g ⊗ ḡ′|Φ⁺⟩ = Σ_j conj(g_j)·g′_j/√d and the probability |⟨g|g′⟩|²/d; the maximally mixed part contributes 1/d² everywhere */
function witnessTable(Bs, m) {
  const d = Bs[0].n, n = m * d, Q = new Float64Array(n * n);
  for (let l = 0; l < m; l++) for (let a = 0; a < d; a++) for (let k = 0; k < m; k++) for (let b = 0; b < d; b++) {
    let sr = 0, si = 0; for (let j = 0; j < d; j++) { const xr = Bs[l].re[j * d + a], xi = -Bs[l].im[j * d + a], yr = Bs[k].re[j * d + b], yi = Bs[k].im[j * d + b]; sr += xr * yr - xi * yi; si += xr * yi + xi * yr; }
    Q[(l * d + a) * n + k * d + b] = (sr * sr + si * si) / d;
  }
  return Q;
}
function symEig(A, n) {                                     // eigenvalues of a real symmetric matrix by cyclic Jacobi rotations
  const M = Float64Array.from(A);
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += M[i * n + j] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = M[p * n + q]; if (Math.abs(apq) < 1e-300) continue;
      const th = (M[q * n + q] - M[p * n + p]) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < n; k++) { const kp = M[k * n + p], kq = M[k * n + q]; M[k * n + p] = c * kp - sn * kq; M[k * n + q] = sn * kp + c * kq; }
      for (let k = 0; k < n; k++) { const pk = M[p * n + k], qk = M[q * n + k]; M[p * n + k] = c * pk - sn * qk; M[q * n + k] = sn * pk + c * qk; }
    }
  }
  return Array.from({ length: n }, (_, i) => M[i * n + i]);
}
const traceNorm = (Q, n) => symEig(Q, n).reduce((s, x) => s + Math.abs(x), 0);
const mixTable = (Q0, n, d, v) => Q0.map((x) => v * x + (1 - v) / (d * d));
const witBound = (m, d, r) => 1 + (m - 1) * r / d;
const witThreshold = (m, d, r) => (r >= d ? 1 : (d + (m - 1) * r - m) / (m * (d - 1)));   // v above which ‖Q_m(v)‖ exceeds the bound for r

/* =====================================================================
   4. The search: Riemannian gradient descent on the Stiefel manifold {U : U†U = I}
   ===================================================================== */
function descend(Bs, cols, rng) {
  const d = Bs[0].n, gauss = () => Math.sqrt(-2 * Math.log(rng() + 1e-300)) * Math.cos(2 * Math.PI * rng());
  let U = { re: new Float64Array(d * cols), im: new Float64Array(d * cols) };
  for (let k = 0; k < d * cols; k++) { U.re[k] = gauss(); U.im[k] = gauss(); }
  orthonormalize(U, d, cols);
  let D = defectOf(Bs, U, cols), eta = 0.4, stopped = false;
  const hist = new Float64Array(ITERS + 1), snaps = [{ re: U.re.slice(), im: U.im.slice() }];
  hist[0] = D;
  for (let t = 1; t <= ITERS; t++) {
    if (!stopped) {
      // Euclidean gradient G = Σ_r B_r (W_r ∘ (B_r† U)) with W = 4(|B_r† U|² − 1/d)
      const Gr = new Float64Array(d * cols), Gi = new Float64Array(d * cols);
      for (const B of Bs) {
        const Mr = new Float64Array(d * cols), Mi = new Float64Array(d * cols);
        for (let i = 0; i < d; i++) for (let j = 0; j < cols; j++) { let sr = 0, si = 0; for (let k = 0; k < d; k++) { const ar = B.re[k * d + i], ai = -B.im[k * d + i], br = U.re[k * cols + j], bi = U.im[k * cols + j]; sr += ar * br - ai * bi; si += ar * bi + ai * br; } const w = 4 * (sr * sr + si * si - 1 / d); Mr[i * cols + j] = w * sr; Mi[i * cols + j] = w * si; }
        for (let i = 0; i < d; i++) for (let k = 0; k < d; k++) { const br = B.re[i * d + k], bi = B.im[i * d + k]; for (let j = 0; j < cols; j++) { Gr[i * cols + j] += br * Mr[k * cols + j] - bi * Mi[k * cols + j]; Gi[i * cols + j] += br * Mi[k * cols + j] + bi * Mr[k * cols + j]; } }
      }
      // tangent projection G − U·herm(U†G), then a backtracking step along it and the QR retraction
      const A = new Float64Array(2 * cols * cols);
      for (let a = 0; a < cols; a++) for (let b = 0; b < cols; b++) { let sr = 0, si = 0; for (let i = 0; i < d; i++) { const ur = U.re[i * cols + a], ui = -U.im[i * cols + a], gr = Gr[i * cols + b], gi = Gi[i * cols + b]; sr += ur * gr - ui * gi; si += ur * gi + ui * gr; } A[2 * (a * cols + b)] = sr; A[2 * (a * cols + b) + 1] = si; }
      const Sr = new Float64Array(d * cols), Si = new Float64Array(d * cols);
      for (let i = 0; i < d; i++) for (let b = 0; b < cols; b++) { let sr = Gr[i * cols + b], si = Gi[i * cols + b]; for (let a = 0; a < cols; a++) { const hr = (A[2 * (a * cols + b)] + A[2 * (b * cols + a)]) / 2, hi = (A[2 * (a * cols + b) + 1] - A[2 * (b * cols + a) + 1]) / 2, ur = U.re[i * cols + a], ui = U.im[i * cols + a]; sr -= ur * hr - ui * hi; si -= ur * hi + ui * hr; } Sr[i * cols + b] = sr; Si[i * cols + b] = si; }
      let ok = false;
      for (let ls = 0; ls < 30 && !ok; ls++) {
        const V = { re: new Float64Array(d * cols), im: new Float64Array(d * cols) };
        for (let k = 0; k < d * cols; k++) { V.re[k] = U.re[k] - eta * Sr[k]; V.im[k] = U.im[k] - eta * Si[k]; }
        orthonormalize(V, d, cols); const Dv = defectOf(Bs, V, cols);
        if (Dv < D) { U = V; D = Dv; ok = true; eta = Math.min(4, eta * 1.6); } else eta /= 2;
      }
      if (!ok || D < 1e-30) stopped = true;
    }
    hist[t] = D;
    if (t % SNAP === 0) snaps.push({ re: U.re.slice(), im: U.im.slice() });
  }
  return { hist, snaps, U, D };
}

/* =====================================================================
   5. The model
   ===================================================================== */
let MODEL = null, dirty = true;
function build() {
  const d = S.d, Bs = knownBases(d), cols = S.target === 'basis' ? d : 1, M = { d, cols, Bs, view: S.view, target: S.target };
  let pairDev = 0; const pairs = [];
  for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) { const P = overlaps(Bs[a], Bs[b], d); pairs.push(P); for (const p of P) pairDev = Math.max(pairDev, Math.abs(p - 1 / d)); }
  M.pairs = pairs; M.pairDev = pairDev;
  if (S.view === 'witness') {
    const m = Math.min(S.m, d, 3), n = m * d; S.m = m;
    M.m = m; M.wn = n; M.Q0 = witnessTable(Bs, m);
    M.curve = Array.from({ length: WIT_SAMPLES + 1 }, (_, k) => traceNorm(mixTable(M.Q0, n, d, k / WIT_SAMPLES), n));
  }
  if (S.view === 'search') {
    const rng = TRV.mulberry32(S.seed * 2654435761 % 4294967296 + d * 977 + cols);
    M.runs = Array.from({ length: STARTS }, () => descend(Bs, cols, rng));
  }
  MODEL = M;
}
const stepNow = () => Math.min(STARTS * ITERS, Math.round(S.nowFrac * STARTS * ITERS));
function position() { const g = stepNow(); const s = Math.min(STARTS - 1, Math.floor(g / ITERS)), t = g - s * ITERS; return { s, t: g >= STARTS * ITERS ? ITERS : t, g, done: g >= STARTS * ITERS }; }
function witnessNow() {                                    // the table, its trace norm and the certified Schmidt number at v = nowFrac
  const M = MODEL, v = Math.min(1, Math.max(0, S.nowFrac)), Q = mixTable(M.Q0, M.wn, M.d, v), tn = traceNorm(Q, M.wn);
  let r = 0; for (let k = 1; k <= M.d; k++) if (tn > witBound(M.m, M.d, k) + 1e-12) r = k;
  return { v, Q, tn, certified: r + 1, bounds: Array.from({ length: M.d }, (_, k) => witBound(M.m, M.d, k + 1)), thresholds: Array.from({ length: M.d }, (_, k) => witThreshold(M.m, M.d, k + 1)) };
}
function current() {                                        // the candidate shown now and its overlaps with the three bases
  const M = MODEL;
  if (M.view === 'known' || M.view === 'witness') return { P: M.pairs, cols: M.d, D: 0 };
  const { s, t } = position(), run = M.runs[s], snap = run.snaps[Math.min(run.snaps.length - 1, Math.floor(t / SNAP))];
  return { P: M.Bs.map((B) => overlaps(B, snap, M.cols)), cols: M.cols, D: run.hist[t], s, t };
}
function finishedStats() {
  const M = MODEL, { s, t, done } = position(), n = done ? STARTS : s + (t >= ITERS ? 1 : 0);
  let best = Infinity, hits = 0; for (let k = 0; k < n; k++) { const D = M.runs[k].hist[ITERS]; best = Math.min(best, D); if (D < FOUND) hits++; }
  return { n, best: n ? best : null, hits };
}

/* =====================================================================
   6. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const sci = (v) => (v === null || v === undefined || !isFinite(v) ? '—' : v === 0 ? '0' : v < 1e-3 ? v.toExponential(1) : v.toFixed(4));
function basisName(d, r) { if (d === 2 || d === 6) return BASIS_NAMES[d][r]; const n = BASIS_NAMES.odd[r]; return T(n[0], n[1]); }
const pairName = (d, k) => { const [a, b] = [[0, 1], [0, 2], [1, 2]][k]; return `${basisName(d, a)} · ${basisName(d, b)}`; };

/* =====================================================================
   7. 3D scene: three bar fields with the 1/d plane
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines;
const LINES_MAX = 24000;
const CAMS = { iso: [0.5, 1.02, 13], front: [0.0001, 1.45, 13], top: [0.0001, 0.08, 13.5] };
const cam = { theta: 0.5, phi: 1.02, r: 13, tTheta: 0.5, tPhi: 1.02, tR: 13 };
let camName = 'iso';
const additive = { transparent: true, depthWrite: false, depthTest: false, blending: window.THREE ? THREE.AdditiveBlending : 2 };
function dyn(g, name, n, size) { const a = new THREE.BufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; }
function initGL() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) { renderer = null; }
  if (!renderer || !window.THREE) {
    const d = document.createElement('div'); d.className = 'nogl';
    d.textContent = T('这个浏览器没有提供 WebGL，三维视图无法显示。下方的缺陷曲线、组数表和右侧读数仍然可用。', 'This browser does not provide WebGL, so the 3D view cannot be shown. The defect chart, the table of counts and the readouts still work.');
    stage.appendChild(d); return;
  }
  glOK = true;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x02040a, 1);
  scene3 = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
  const g = new THREE.BufferGeometry(); dyn(g, 'position', LINES_MAX, 3); dyn(g, 'color', LINES_MAX, 3);
  lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, ...additive })); lines.frustumCulled = false; scene3.add(lines);
}
const H0 = 1.1;                                              // height of the 1/d plane
/* a tile shows d × cols bars; a single vector (cols = 1) is laid out as one row of d bars */
function tileGeom(d, cols) { const gr = cols === 1 ? 1 : d, gc = cols === 1 ? d : cols, step = Math.min(0.9, 3.0 / Math.max(gr, gc)), w = step * gc, h = step * gr, gap = 0.9; return { gr, gc, step, w, h, gap, x0: (r) => (r - 1) * (w + gap) - w / 2 }; }
function updateGL() {
  const M = MODEL, C = current(), d = M.d, cols = C.cols, G = tileGeom(d, cols);
  const L = lines.geometry.attributes, Pp = L.position.array, Cc = L.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp.set(a, 3 * v); Cc.set([col[0] * k, col[1] * k, col[2] * k], 3 * v); v++; Pp.set(b, 3 * v); Cc.set([col[0] * k, col[1] * k, col[2] * k], 3 * v); v++; };
  if (M.view === 'witness') {
    // one md × md field of bars: height Q·d·2H0 (the same-basis correlations reach 2H0 at v = 1), with the m × m block grid
    const W = witnessNow(), n = M.wn, step = Math.min(0.42, 7.2 / n), w = step * n, x0 = -w / 2, z0 = -w / 2;
    for (let q = 0; q <= M.m; q++) { const o = q * d * step; seg([x0 + o, 0, z0], [x0 + o, 0, z0 + w], COL.amber, 0.5); seg([x0, 0, z0 + o], [x0 + w, 0, z0 + o], COL.amber, 0.5); }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const p = W.Q[i * n + j], h = p * d * 2 * H0, same = Math.floor(i / d) === Math.floor(j / d), col = same ? (i === j ? COL.cyan : COL.gray) : GREEN;
      const cx = x0 + (j + 0.5) * step, cz = z0 + (i + 0.5) * step, hw = step * 0.3, k = i === j ? 1 : 0.55;
      for (const [ox, oz] of [[-hw, -hw], [hw, hw]]) seg([cx + ox, 0, cz + oz], [cx + ox, h, cz + oz], col, k * 0.6);
      seg([cx - hw, h, cz - hw], [cx + hw, h, cz - hw], col, k); seg([cx + hw, h, cz - hw], [cx + hw, h, cz + hw], col, k);
      seg([cx + hw, h, cz + hw], [cx - hw, h, cz + hw], col, k); seg([cx - hw, h, cz + hw], [cx - hw, h, cz - hw], col, k);
    }
    lines.geometry.setDrawRange(0, v); L.position.needsUpdate = true; L.color.needsUpdate = true;
    return;
  }
  for (let r = 0; r < 3; r++) {
    const x0 = G.x0(r), z0 = -G.h / 2, P = C.P[r];
    // the 1/d plane as a wire rectangle with a light grid
    const y = H0;
    seg([x0, y, z0], [x0 + G.w, y, z0], COL.amber, 0.55); seg([x0, y, z0 + G.h], [x0 + G.w, y, z0 + G.h], COL.amber, 0.55);
    seg([x0, y, z0], [x0, y, z0 + G.h], COL.amber, 0.55); seg([x0 + G.w, y, z0], [x0 + G.w, y, z0 + G.h], COL.amber, 0.55);
    for (let q = 1; q < G.gc; q++) seg([x0 + q * G.step, y, z0], [x0 + q * G.step, y, z0 + G.h], COL.amber, 0.12);
    for (let q = 1; q < G.gr; q++) seg([x0, y, z0 + q * G.step], [x0 + G.w, y, z0 + q * G.step], COL.amber, 0.12);
    // the floor outline
    seg([x0, 0, z0], [x0 + G.w, 0, z0], COL.gray, 0.35); seg([x0, 0, z0 + G.h], [x0 + G.w, 0, z0 + G.h], COL.gray, 0.35);
    seg([x0, 0, z0], [x0, 0, z0 + G.h], COL.gray, 0.35); seg([x0 + G.w, 0, z0], [x0 + G.w, 0, z0 + G.h], COL.gray, 0.35);
    // bars: height p·d·H0 (capped at 3H0); colour from green (on the plane) to magenta (far from it)
    for (let i = 0; i < d; i++) for (let j = 0; j < cols; j++) {
      const p = P[i * cols + j], h = Math.min(3 * H0, p * d * H0), dev = Math.min(1, Math.abs(p * d - 1)), col = [0, 1, 2].map((c) => GREEN[c] * (1 - dev) + COL.magenta[c] * dev);
      const gi = cols === 1 ? 0 : i, gj = cols === 1 ? i : j, cx = x0 + (gj + 0.5) * G.step, cz = z0 + (gi + 0.5) * G.step, hw = G.step * 0.28;
      for (const [ox, oz] of [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]]) seg([cx + ox, 0, cz + oz], [cx + ox, h, cz + oz], col, 0.55);
      seg([cx - hw, h, cz - hw], [cx + hw, h, cz - hw], col, 1); seg([cx + hw, h, cz - hw], [cx + hw, h, cz + hw], col, 1);
      seg([cx + hw, h, cz + hw], [cx - hw, h, cz + hw], col, 1); seg([cx - hw, h, cz + hw], [cx - hw, h, cz - hw], col, 1);
      if (p * d > 3) seg([cx - hw, h + 0.08, cz], [cx + hw, h + 0.08, cz], COL.magenta, 1);
    }
  }
  lines.geometry.setDrawRange(0, v); L.position.needsUpdate = true; L.color.needsUpdate = true;
}

/* =====================================================================
   8. Camera
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.7 : 1);
  camera.position.set(r * sp * Math.sin(cam.theta), 0.9 + r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0, 0.9, 0);
}
function setCamPreset(name) {
  const p = CAMS[name]; if (!p) return; camName = name;
  let dd = (p[0] - cam.theta) % (Math.PI * 2);
  if (dd > Math.PI) dd -= Math.PI * 2; if (dd < -Math.PI) dd += Math.PI * 2;
  cam.tTheta = cam.theta + dd; cam.tPhi = p[1]; cam.tR = p[2];
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
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], dd = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(28, Math.max(6, cam.tR * drag.pinch / dd)); drag.pinch = dd; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY;
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => { if (!drag.pts.has(ev.pointerId)) return; drag.pts.delete(ev.pointerId); if (drag.pts.size === 0) drag.pinch = 0; };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(28, Math.max(6, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   9. Tags
   ===================================================================== */
function mkTag(cls) { const el = document.createElement('div'); el.className = 'tag ' + cls; tagsBox.appendChild(el); return el; }
const tagTile = [mkTag('cy raw'), mkTag('cy raw'), mkTag('cy raw')], tagPlane = mkTag('hot raw');
function placeTag(el, p, show = true) {
  if (!glOK || !show) { el.style.display = 'none'; return; }
  const q = proj3(p); if (q.z > 1 || q.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const w = el.offsetWidth, W = stage.clientWidth, x = Math.min(W - w / 2 - 6, Math.max(w / 2 + 6, q.x));
  el.style.left = x + 'px'; el.style.top = q.y + 'px';
}
function updateTags() {
  const M = MODEL, G = tileGeom(M.d, M.view === 'known' ? M.d : M.cols);
  if (M.view === 'witness') {
    const n = M.wn, step = Math.min(0.42, 7.2 / n), w = step * n;
    for (let r = 0; r < 3; r++) {
      tagTile[r].textContent = r < M.m ? basisName(M.d, r) : '';
      placeTag(tagTile[r], [-w / 2 + (r + 0.5) * M.d * step, 0, w / 2 + 0.45], r < M.m);
    }
    tagPlane.textContent = `Q${'₁₂₃'[M.m - 1]}  ${n} × ${n}`; placeTag(tagPlane, [w / 2 + 0.4, 0, -w / 2]);
    return;
  }
  for (let r = 0; r < 3; r++) {
    tagTile[r].textContent = M.view === 'known' ? pairName(M.d, r) : T(`对 ${basisName(M.d, r)}`, `vs ${basisName(M.d, r)}`);
    placeTag(tagTile[r], [G.x0(r) + G.w / 2, 0, G.h / 2 + 0.45]);
  }
  tagPlane.textContent = `1/${M.d}`;
  placeTag(tagPlane, [G.x0(2) + G.w + 0.35, H0, -G.h / 2]);
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
function drawWitness(F) {                                 // ‖Q_m(v)‖_tr against v with the bounds 1 + (m − 1)r/d
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, W = witnessNow(), top = M.m * 1.08, X = (v) => pl + v * iw, Y = (y) => pt + ih - y / top * ih;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (let y = 0; y <= M.m; y++) ctx.fillText(String(y), pl - 4 * dpr, Y(y));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const v of [0, 0.5, 1]) ctx.fillText(`v=${v}`, X(v), pt + ih + 3 * dpr);
  W.bounds.forEach((b, k) => { ctx.strokeStyle = k === 0 ? AM : FAINT; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(pl, Y(b)); ctx.lineTo(pl + iw, Y(b)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = k === 0 ? AM : DIM; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; if (k === 0 || k === M.d - 1 || M.d <= 3) ctx.fillText(`r=${k + 1}`, pl + 3 * dpr, Y(b) - 1); });
  const b1 = W.bounds[0];
  ctx.strokeStyle = CY; ctx.lineWidth = 2 * dpr; ctx.beginPath(); M.curve.forEach((y, k) => { const x = X(k / WIT_SAMPLES); if (k) ctx.lineTo(x, Y(y)); else ctx.moveTo(x, Y(y)); }); ctx.stroke();
  ctx.strokeStyle = OK; ctx.beginPath(); let on = false; M.curve.forEach((y, k) => { if (y > b1 + 1e-12) { const x = X(k / WIT_SAMPLES); if (on) ctx.lineTo(x, Y(y)); else { ctx.moveTo(x, Y(y)); on = true; } } }); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(W.v), Y(W.tn), 3.5 * dpr, 0, 2 * Math.PI); ctx.fill();
  const key = `w|${TRV.lang()}`;
  if ($('c1Meta').dataset.key !== key) {
    $('c1Meta').dataset.key = key;
    const sw = (c, t) => `<span class="it"><span class="sw" style="--c:${c}"></span>${t}</span>`;
    $('c1Meta').innerHTML = `${sw(CY, '‖Q‖')} ${sw(OK, T('超过 r = 1 的界：纠缠', 'above the r = 1 bound: entangled'))} ${sw(AM, T('界', 'bounds'))}`;
  }
}
function drawDefect() {
  const F = frame2d(cv1, 40); if (F.iw < 60 || F.ih < 40) return;
  if (MODEL.view === 'witness') { drawWitness(F); return; }
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, LO = -32, HI = 1, X = (t) => pl + t / ITERS * iw, Y = (D) => pt + ih - (Math.min(HI, Math.max(LO, Math.log10(Math.max(1e-300, D)))) - LO) / (HI - LO) * ih;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  ctx.strokeStyle = FAINT; ctx.globalAlpha = 0.6; ctx.beginPath(); for (const g of [-30, -20, -10, 0]) { ctx.moveTo(pl, Y(10 ** g)); ctx.lineTo(pl + iw, Y(10 ** g)); } ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of [-30, -20, -10, 0]) ctx.fillText(`1e${g}`, pl - 4 * dpr, Y(10 ** g));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const t of [0, ITERS / 2, ITERS]) ctx.fillText(String(t), X(t), pt + ih + 3 * dpr);
  ctx.strokeStyle = OK; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.beginPath(); ctx.moveTo(pl, Y(FOUND)); ctx.lineTo(pl + iw, Y(FOUND)); ctx.stroke(); ctx.setLineDash([]);
  if (M.view === 'known') { ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(T('已知三组两两比较时不做搜索', 'no search while comparing the known three'), pl + iw / 2, pt + ih / 2); }
  else {
    const { s, t } = position();
    M.runs.forEach((run, k) => {
      if (k > s) return; const upto = k < s ? ITERS : t;
      ctx.strokeStyle = k === s ? CY : run.hist[ITERS] < FOUND ? OK : MG; ctx.globalAlpha = k === s ? 1 : 0.55; ctx.lineWidth = (k === s ? 2 : 1.2) * dpr;
      ctx.beginPath(); for (let q = 0; q <= upto; q++) { const y = Y(run.hist[q]); if (q) ctx.lineTo(X(q), y); else ctx.moveTo(X(q), y); } ctx.stroke(); ctx.globalAlpha = 1;
    });
    const run = M.runs[s]; ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(t), Y(run.hist[t]), 3.5 * dpr, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.lineWidth = 1;
  const key = `s|${TRV.lang()}`;
  if ($('c1Meta').dataset.key !== key) {
    $('c1Meta').dataset.key = key;
    const sw = (c, t) => `<span class="it"><span class="sw" style="--c:${c}"></span>${t}</span>`;
    $('c1Meta').innerHTML = `${sw(CY, T('当前起点', 'current start'))} ${sw(OK, T('找到', 'found'))} ${sw(MG, T('停住', 'stalled'))}`;
  }
}
function drawThresholds(F) {                              // the entanglement threshold v > 1/m for every m ≤ d
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, d = M.d, have = Math.min(d, KNOWN[d]), bw = iw / d, Y = (v) => pt + ih - v * ih;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const v of [0, 0.5, 1]) ctx.fillText(String(v), pl - 4 * dpr, Y(v));
  for (let m = 1; m <= d; m++) {
    const x = pl + (m - 1) * bw + bw * 0.18, w = bw * 0.64, th = witThreshold(m, d, 1), sel = m === M.m;
    if (m <= have) { ctx.fillStyle = m <= 3 ? CY : DIM; ctx.globalAlpha = sel ? 0.95 : 0.5; ctx.fillRect(x, Y(th), w, ih - (Y(th) - pt)); ctx.globalAlpha = 1; }
    else { ctx.strokeStyle = MG; ctx.setLineDash([3 * dpr, 2 * dpr]); ctx.strokeRect(x + 0.5, Y(th), w - 1, ih - (Y(th) - pt)); ctx.setLineDash([]); ctx.fillStyle = MG; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('?', x + w / 2, Y(th) - 2 * dpr); }
    if (sel) { ctx.strokeStyle = OK; ctx.lineWidth = 2 * dpr; ctx.strokeRect(x - 2 * dpr, Y(th) - 2 * dpr, w + 4 * dpr, ih - (Y(th) - pt) + 2 * dpr); ctx.lineWidth = 1; }
    ctx.fillStyle = sel ? INK : DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(`m=${m}`, x + w / 2, pt + ih + 3 * dpr);
  }
  $('c2Meta').textContent = d === 6 ? T('柱高 = 1/m · 品红虚框 = 需要第四组以上的基（未知）', 'bar height = 1/m · dashed magenta = needs a fourth basis or more (unknown)') : T('柱高 = 1/m · 页面只构造了其中三组', 'bar height = 1/m · the page constructs three of them');
}
function drawKnown() {
  const F = frame2d(cv2, 26); if (F.iw < 60 || F.ih < 40) return;
  if (MODEL.view === 'witness') { drawThresholds(F); return; }
  const { ctx, dpr, pl, pt, iw, ih } = F, ds = [2, 3, 4, 5, 6, 7], bw = iw / ds.length, unit = ih / 8.4;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const n of [0, 4, 8]) ctx.fillText(String(n), pl - 4 * dpr, pt + ih - n * unit);
  ds.forEach((d, k) => {
    const x = pl + k * bw + bw * 0.2, w = bw * 0.6, known = KNOWN[d], bound = d + 1, sel = d === MODEL.d;
    for (let n = 0; n < bound; n++) {
      const y = pt + ih - (n + 1) * unit;
      if (n < known) { ctx.fillStyle = d === 6 ? AM : CY; ctx.globalAlpha = sel ? 0.95 : 0.55; ctx.fillRect(x, y + 1, w, unit - 2); ctx.globalAlpha = 1; }
      else { ctx.strokeStyle = MG; ctx.setLineDash([3 * dpr, 2 * dpr]); ctx.strokeRect(x + 0.5, y + 1.5, w - 1, unit - 3); ctx.setLineDash([]); ctx.fillStyle = MG; ctx.textAlign = 'center'; ctx.fillText('?', x + w / 2, y + unit / 2); }
    }
    if (sel) { ctx.strokeStyle = OK; ctx.lineWidth = 2 * dpr; ctx.strokeRect(x - 3 * dpr, pt + ih - bound * unit - 3 * dpr, w + 6 * dpr, bound * unit + 3 * dpr); ctx.lineWidth = 1; }
    ctx.fillStyle = sel ? INK : DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(`d=${d}`, x + w / 2, pt + ih + 3 * dpr);
  });
  $('c2Meta').textContent = T('实心 = 已构造 · 虚框 = 上界 d + 1 内未知', 'solid = constructed · dashed = unknown below the bound d + 1');
}

/* =====================================================================
   11. Readouts and controls
   ===================================================================== */
let syncedFrac = NaN, toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function syncOutputs() {
  if (dirty) { build(); dirty = false; toasted = false; }
  const M = MODEL, C = current(), search = M.view === 'search', st = search ? finishedStats() : null, d = M.d; syncedFrac = S.nowFrac;
  document.querySelectorAll('#dimChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.dim === d)));
  document.querySelectorAll('#viewChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === S.view)));
  document.querySelectorAll('#targetChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.target === S.target)));
  $('targetChips').hidden = !search;
  $('presetNote').textContent = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义参数。', 'Custom settings.');
  $('dimNote').innerHTML = d === 6 ? T('六维：已知 3 组，上界 7 组，第四组是否存在未知。', 'Dimension six: 3 known, at most 7, and whether a fourth exists is unknown.')
    : d === 2 ? T('二维：恰有 3 组，上界就是 3。', 'Dimension two: exactly 3, which is the bound.') : T(`${d} 是素数：恰有 d + 1 = ${d + 1} 组。`, `${d} is prime: exactly d + 1 = ${d + 1} exist.`);
  $('targetNote').textContent = S.target === 'basis' ? T(`找 ${d} 个两两正交的向量，每个都与三组已知基无偏。`, `Look for ${d} orthonormal vectors, each unbiased to the three known bases.`) : T('只找一个向量：它是第四组存在的第一步必要条件。', 'Look for one vector only: a first necessary step for a fourth basis.');
  const witness = M.view === 'witness';
  $('mChips').hidden = !witness; $('roSearch').hidden = witness; $('roWit').hidden = !witness;
  document.querySelectorAll('#mChips .chip').forEach((b) => { const m = +b.dataset.m; b.disabled = m > Math.min(3, d); b.setAttribute('aria-pressed', String(witness && m === M.m)); });
  $('c1Title').textContent = witness ? T('判据：‖Q_m‖_tr 随可见度 v', 'THE WITNESS: ‖Q_m‖_tr AGAINST THE VISIBILITY v') : T('缺陷随迭代下降', 'THE DEFECT AGAINST ITERATIONS');
  $('c2Title').textContent = witness ? T('证出纠缠的门槛 v > 1/m', 'THE ENTANGLEMENT THRESHOLD v > 1/m') : T('各维数已知几组', 'HOW MANY ARE KNOWN');
  if (witness) { syncWitness(); return; }
  // readouts
  $('roKnown').textContent = d === 6 ? '≥ 3 / 7' : `${KNOWN[d]} / ${d + 1}`;
  $('roPair').textContent = sci(M.pairDev);
  let cent = 0, sumsq = [0, 0, 0]; C.P.forEach((P, r) => { for (const p of P) { cent = Math.max(cent, Math.abs(p - 1 / d)); sumsq[r] += p * p; } });
  $('roCur').textContent = search ? sci(C.D) : '0';
  $('roBest').textContent = search ? sci(st.best) : '—';
  $('roHits').textContent = search ? `${st.hits} / ${st.n}` : '—';
  $('roCent').textContent = sci(cent);
  if (C.cols === d) {
    const comm = sumsq.map((q) => 2 * (d - q));
    $('roCommL').innerHTML = T(`对易子平方和 Σ‖[P<sub>j</sub>, Q<sub>r</sub>]‖²（三组；互无偏时 = 2(d − 1) = ${2 * (d - 1)}）`, `Squared commutator sums Σ‖[P<sub>j</sub>, Q<sub>r</sub>]‖² (three bases; unbiased gives 2(d − 1) = ${2 * (d - 1)})`);
    $('roComm').textContent = comm.map((x) => x.toFixed(4)).join(' · ');
  } else { $('roCommL').innerHTML = T('对易子平方和（只对整组基计算）', 'Squared commutator sums (computed for whole bases only)'); $('roComm').textContent = '—'; }
  $('roNote').innerHTML = !search
    ? T(`三组已知基两两的重叠全部等于 1/${d}（最大偏差 ${sci(M.pairDev)}，即浮点舍入）。`, `Every overlap between the known bases equals 1/${d} (largest deviation ${sci(M.pairDev)}, i.e. floating-point rounding).`)
    : d === 6 ? T('六维：到目前为止没有起点把缺陷降到 10⁻²⁰ 以下。梯度下降可能停在局部极小，所以这只是数值线索；第四组是否存在是开放问题。', 'Dimension six: so far no start has brought the defect below 10⁻²⁰. Gradient descent can stop in a local minimum, so this is only a numerical lead; whether a fourth basis exists is an open problem.')
      : d === 2 ? T('二维：第四组已证不存在（最多 d + 1 = 3 组），缺陷只能停在正值。', 'Dimension two: a fourth basis provably does not exist (at most d + 1 = 3), so the defect can only stall at a positive value.')
        : T(`${d} 维：第四组存在（共有 ${d + 1} 组）。缺陷降到 10⁻²⁰ 以下的起点就是找到了；停住的起点停在局部极小。`, `Dimension ${d}: a fourth basis exists (there are ${d + 1}). Starts that bring the defect below 10⁻²⁰ have found one; the others stopped in a local minimum.`);
  $('openNote').innerHTML = T('文献状态：Zauner 猜想认为六维最多三组；Prat Colomer 等的三种数值方法都指向没有第四组；Brierley 与 Weigert 的数值是“没有七组”的最强证据。都还不是证明。', 'Literature: Zauner’s conjecture says six has at most three; three numerical methods by Prat Colomer et al. all point to no fourth; the numerics of Brierley and Weigert are the strongest evidence against seven. None of these is a proof yet.');
  // pills, HUD, clock
  const pos = search ? position() : null;
  $('pillD').innerHTML = `d <strong>${d}</strong>`;
  $('pillRun').innerHTML = search ? `START <strong>${pos.s + 1}/${STARTS}</strong>` : 'START <strong>—</strong>';
  $('pillBest').innerHTML = `BEST D <strong>${search ? sci(st.best) : '0'}</strong>`;
  $('pillOpen').innerHTML = `STATUS <strong>${d === 6 ? 'OPEN' : d === 2 ? 'NO (PROVED)' : 'EXISTS'}</strong>`;
  $('hudBig').textContent = search ? T(`d = ${d} · 第 ${pos.s + 1} 个起点 · 第 ${pos.t} 步 · D = ${sci(C.D)}`, `d = ${d} · start ${pos.s + 1} · step ${pos.t} · D = ${sci(C.D)}`) : T(`d = ${d} · 已知三组两两比较`, `d = ${d} · the known three, pairwise`);
  $('hudSub').textContent = T(`柱高 = 重叠概率 |⟨u|v⟩|² · 琥珀平面 = 1/${d} · 绿 = 贴着平面，品红 = 离得远`, `bar height = overlap probability |⟨u|v⟩|² · amber plane = 1/${d} · green = on the plane, magenta = far from it`);
  $('clock').innerHTML = search ? `${pos.s + 1}<small>/${STARTS}</small>` : '—';
  if (search && !toasted && S.playing && pos.done) {
    toasted = true;
    toast(st.hits ? T(`<b>${st.hits} / ${STARTS} 个起点找到了</b>：缺陷降到 10⁻²⁰ 以下，第四组${S.target === 'basis' ? '基' : '的一个向量'}存在。`, `<b>${st.hits} of ${STARTS} starts found it</b>: the defect fell below 10⁻²⁰, so a fourth ${S.target === 'basis' ? 'basis' : 'unbiased vector'} exists.`)
      : T(`<b>8 个起点都没找到</b>：最好的缺陷 ${sci(st.best)}。${d === 6 ? '这是数值线索，不是证明。' : '这里不存在，是已证的。'}`, `<b>None of the 8 starts found one</b>: the best defect is ${sci(st.best)}. ${d === 6 ? 'This is a numerical lead, not a proof.' : 'Here none exists, and that is proved.'}`));
  }
}
function syncWitness() {
  const M = MODEL, d = M.d, m = M.m, W = witnessNow(), sub = '₁₂₃'[m - 1];
  $('targetNote').textContent = T(`Alice 测前 ${m} 组已知基，Bob 测它们的复共轭；态 = v·Φ⁺ + (1 − v)·I/${d * d}。`, `Alice measures the first ${m} known bases and Bob their complex conjugates; the state is v·Φ⁺ + (1 − v)·I/${d * d}.`);
  $('roWm').textContent = `${m} · ${M.wn} × ${M.wn}`;
  $('roWv').textContent = W.v.toFixed(3);
  $('roWq').textContent = W.tn.toFixed(6);
  $('roWb').textContent = W.bounds.map((b) => b.toFixed(3)).join(' · ');
  $('roWr').textContent = W.certified >= 2 ? T(`≥ ${W.certified}（迹范数超过 r = ${W.certified - 1} 的界）`, `≥ ${W.certified} (the trace norm exceeds the bound for r = ${W.certified - 1})`) : T('没有证出纠缠', 'no entanglement certified');
  $('roWt').textContent = W.thresholds.slice(0, d - 1).map((x) => x.toFixed(3)).join(' · ');
  $('roNote').innerHTML = m === 1 ? T('只用一组基时界是 1，而 ‖Q₁‖ ≤ 1：一组基证不出任何纠缠。', 'With one basis the bound is 1 and ‖Q₁‖ ≤ 1: a single basis certifies no entanglement.')
    : T(`这个态的 Q<sub>${m}</sub> 是半正定的，所以 ‖Q<sub>${m}</sub>‖<sub>tr</sub> 就是它的迹 v·${m} + (1 − v)·${m}/${d}；超过 1 + ${m - 1}r/${d} 的条件化成 v > (${d} + ${m - 1}r − ${m})/(${m}·${d - 1})，r = 1 时恰为 1/${m}。`, `For this state Q<sub>${m}</sub> is positive semidefinite, so ‖Q<sub>${m}</sub>‖<sub>tr</sub> is its trace v·${m} + (1 − v)·${m}/${d}; exceeding 1 + ${m - 1}r/${d} becomes v > (${d} + ${m - 1}r − ${m})/(${m}·${d - 1}), which is exactly 1/${m} for r = 1.`);
  $('pillD').innerHTML = `d <strong>${d}</strong>`;
  $('pillRun').innerHTML = `m <strong>${m}</strong>`;
  $('pillBest').innerHTML = `‖Q${sub}‖ <strong>${W.tn.toFixed(3)}</strong>`;
  $('pillOpen').innerHTML = `SCHMIDT <strong>${W.certified >= 2 ? '≥ ' + W.certified : '—'}</strong>`;
  $('hudBig').textContent = `d = ${d} · m = ${m} · v = ${W.v.toFixed(3)} · ‖Q${sub}‖ = ${W.tn.toFixed(4)}`;
  $('hudSub').textContent = T('柱高 = 联合概率 · 青 = 同一组基、同一结果 · 灰 = 同一组基、不同结果 · 绿 = 不同组基', 'bar height = joint probability · cyan = same basis, same outcome · gray = same basis, different outcomes · green = different bases');
  $('clock').innerHTML = `v ${W.v.toFixed(2)}`;
  if (!toasted && S.playing && S.nowFrac >= 1) { toasted = true; toast(T(`<b>v = 1</b>：‖Q${sub}‖ = ${W.tn.toFixed(4)}，证出 Schmidt 数 ≥ ${W.certified}。`, `<b>v = 1</b>: ‖Q${sub}‖ = ${W.tn.toFixed(4)}, Schmidt number ≥ ${W.certified} certified.`)); }
}
function syncRail() {
  const key = `${S.view}|${S.d}|${S.m}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  if (S.view === 'witness') { const t = 1 / Math.min(S.m, S.d, 3); $('marks').innerHTML = [[0, 'v=0'], [t, `1/${Math.round(1 / t)}`], [1, 'v=1']].map(([f, l], i) => `<i class="${i === 0 ? 'first' : i === 2 ? 'last' : ''}" style="left:${(f * 100).toFixed(2)}%">${l}</i>`).join(''); return; }
  $('marks').innerHTML = S.view === 'search' ? Array.from({ length: STARTS + 1 }, (_, i) => `<i class="${i === 0 ? 'first' : i === STARTS ? 'last' : ''}" style="left:${(i / STARTS * 100).toFixed(2)}%">${i}</i>`).join('') : '';
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#dimChips .chip').forEach((b) => b.addEventListener('click', () => { const d = DIMS.includes(+b.dataset.dim) ? +b.dataset.dim : 6; if (S.d !== d) { S.d = d; S.nowFrac = 0; custom(); } }));
document.querySelectorAll('#viewChips .chip').forEach((b) => b.addEventListener('click', () => { const v = VIEWS.includes(b.dataset.view) ? b.dataset.view : 'search'; if (S.view !== v) { S.view = v; S.nowFrac = 0; custom(); } }));
document.querySelectorAll('#mChips .chip').forEach((b) => b.addEventListener('click', () => { const m = Math.min(3, S.d, Math.max(1, +b.dataset.m || 1)); if (S.m !== m) { S.m = m; custom(); } }));
document.querySelectorAll('#targetChips .chip').forEach((b) => b.addEventListener('click', () => { const t = b.dataset.target === 'vector' ? 'vector' : 'basis'; if (S.target !== t) { S.target = t; S.nowFrac = 0; custom(); } }));
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  for (const k of ['d', 'target', 'view', 'm']) if (p[k] !== undefined) S[k] = p[k];
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
document.addEventListener('keydown', (ev) => {
  if (ev.target && (ev.target.tagName === 'INPUT' && ev.target.type !== 'range')) return;
  if (drawer.isOpen()) return;
  if (ev.key === ' ' && !(ev.target && ev.target.tagName === 'BUTTON')) { ev.preventDefault(); S.playing = !S.playing; S.hold = 0; setPlayUI(); }
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) {
    ev.preventDefault(); S.playing = false; setPlayUI();
    if (S.view === 'witness') S.nowFrac = Math.min(1, Math.max(0, Math.round(S.nowFrac * 100 + (ev.key === 'ArrowRight' ? 1 : -1)) / 100));   // v in steps of 0.01
    else { const k = Math.floor(S.nowFrac * STARTS + 1e-9) + (ev.key === 'ArrowRight' ? 1 : -1); S.nowFrac = Math.min(1, Math.max(0, k / STARTS)); }   // the start of the next or previous start
    $('now').value = S.nowFrac;
  }
  else if (ev.key === 'r' || ev.key === 'R') { S.seed++; dirty = true; }
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
  if (S.playing && !scrubbing && S.view !== 'known') {
    if (S.hold > 0) { S.hold -= dtSec; if (S.hold <= 0) { S.nowFrac = S.dir > 0 ? 0 : 1; toasted = false; } }
    else {
      S.nowFrac += S.dir * dtSec * S.speed / (S.view === 'witness' ? WIT_RUN : RUN_SECONDS);
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 2.6; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.2; }
    }
    $('now').value = S.nowFrac;
  }
  if (S.nowFrac !== syncedFrac) syncOutputs();
  syncRail();
  if (glOK) { updateCamera(dtSec); updateGL(); renderer.render(scene3, camera); updateTags(); }
  drawDefect(); drawKnown();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { syncOutputs(); $('marks').dataset.key = ''; });

/* read-only probe for automated browser tests */
const flatM = (A) => ({ re: Array.from(A.re), im: Array.from(A.im) });
window.MUB_DEBUG = {
  pending: () => dirty || S.nowFrac !== syncedFrac,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, C = current(), base = { d: M.d, cols: M.cols, view: M.view, target: M.target, bases: M.Bs.map(flatM), pairDev: M.pairDev, P: C.P.map((p) => Array.from(p)), D: C.D };
    if (M.view === 'known') return base;
    if (M.view === 'witness') { const W = witnessNow(); return { ...base, m: M.m, n: M.wn, v: W.v, Q: Array.from(W.Q), tn: W.tn, certified: W.certified, bounds: W.bounds, thresholds: W.thresholds, curve: M.curve.slice() }; }
    const pos = position(), snap = M.runs[pos.s].snaps[Math.min(M.runs[pos.s].snaps.length - 1, Math.floor(pos.t / SNAP))];
    return { ...base, pos, finals: M.runs.map((r) => r.hist[ITERS]), hist: Array.from(M.runs[pos.s].hist), U: { re: Array.from(snap.re), im: Array.from(snap.im) }, Ufinal: M.runs.map((r) => ({ re: Array.from(r.U.re), im: Array.from(r.U.im) })), stats: finishedStats() };
  },
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('six'); S.playing = false; setPlayUI(); S.nowFrac = 0.12; $('now').value = S.nowFrac; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('six');
S.nowFrac = 0; S.playing = !reduceMotion; $('now').value = S.nowFrac;
setPlayUI();
requestAnimationFrame(frame);
})();
