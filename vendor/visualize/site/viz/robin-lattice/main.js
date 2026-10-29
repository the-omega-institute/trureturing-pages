/* ROBIN//LATTICE · Robin 证书着色 · 素数指数格上的点、边、面与纤维
   Every integer n is a point of the prime-exponent lattice; multiplying by a prime is an edge. The page colours each
   n > 5040 by the strength of the evidence for Robin's inequality σ(n)/n < e^γ log log n: a frozen Lean theorem on the
   7- and 11-smooth families, a chain of Lean prime replacements from the compression, the frozen 5040 optimum plus one
   numerical threshold, a Lean edge/fibre rule with a floating-point edge test, or numbers only. The 3D view is the AURIC
   projection (a₂ + a₇, a₃, a₅ + a₇) with κ = a₇ offset along a fibre; the charts show the κ fibre, a prime fibre, the
   mixed difference on a face, the continuous relaxation and the coverage of (5040, X]. Floating-point numbers are used
   only where the colour says so. Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants and arithmetic
   ===================================================================== */
const { fitCanvas, L: T } = TRV;
const PAL = TRV.palette;
const GAMMA = 0.5772156649015329, EG = Math.exp(GAMMA);
const VIOLET = '#9d8cff';
const CAT_CSS = { lean: PAL.ok, chain: PAL.cyan, bound: VIOLET, edge: PAL.magenta, num: PAL.dim, out: PAL.faint, viol: PAL.warn, fail: PAL.warn };
const CAT_RGB = { lean: [0.27, 1, 0.7], chain: [0.1, 0.94, 1], bound: [0.62, 0.55, 1], edge: [1, 0.18, 0.82], num: [0.44, 0.56, 0.65], out: [0.2, 0.3, 0.42], viol: [1, 0.31, 0.39], fail: [1, 0.31, 0.39] };
const CERTIFIED = new Set(['lean', 'chain', 'bound', 'edge']);
const FIRST_PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113];
const N_MAX = 1e12;              // the page accepts n ≤ 10¹²
const BOUND_START = 5600;        // e^γ log log n > 403/105 = Z(5040) for n ≥ 5600 (a floating-point threshold)

/** Primes up to 10⁶ by a sieve: enough to factor every n ≤ 10¹². */
const PRIMES = (() => {
  const M = 1000000, comp = new Uint8Array(M + 1), out = [];
  for (let i = 2; i <= M; i++) { if (comp[i]) continue; out.push(i); for (let j = i * i; j <= M; j += i) comp[j] = 1; }
  return out;
})();
/** Factorization as [[p, a], …] with p increasing. */
function factor(n) {
  const f = []; let m = n;
  for (const p of PRIMES) {
    if (p * p > m) break;
    if (m % p === 0) { let a = 0; while (m % p === 0) { m /= p; a++; } f.push([p, a]); }
  }
  if (m > 1) f.push([m, 1]);
  return f;
}
const S = (p, a) => (1 - Math.pow(p, -(a + 1))) / (1 - 1 / p);                 // S_p(a) = 1 + 1/p + … + 1/p^a
const Zof = (f) => f.reduce((z, [p, a]) => z * S(p, a), 1);                     // Z(n) = σ(n)/n
const cap = (n) => EG * Math.log(Math.log(n));                                  // e^γ log log n
const capL = (L) => EG * Math.log(L);                                           // the same with L = log n
const valOf = (f, p) => { const e = f.find(([q]) => q === p); return e ? e[1] : 0; };
function sigmaFraction(f) {   // σ(n)/n reduced, as a string, with BigInt
  let nu = 1n, de = 1n;
  for (const [p, a] of f) { const P = BigInt(p); nu *= (P ** BigInt(a + 1) - 1n); de *= (P - 1n) * P ** BigInt(a); }
  const g = (x, y) => { while (y) [x, y] = [y, x % y]; return x; };
  const d = g(nu, de); return `${nu / d}/${de / d}`;
}
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (k) => String(k).split('').map((d) => SUP[+d]).join('');
const fmtFac = (f) => (f.length ? f.map(([p, a]) => (a > 1 ? `${p}${sup(a)}` : `${p}`)).join('·') : '1');
const num = (v, d = 4) => (v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(d));
const sci = (v) => (v === 0 ? '0' : Math.abs(v) >= 1e-3 && Math.abs(v) < 1e4 ? v.toPrecision(4) : v.toExponential(2));

/** The edge test of PrimeFiberPropagation for n → n·p^r with a = v_p(n), in floating point. */
function edgeTest(logN, p, a, r) {
  const lhs = (S(p, a + r) / S(p, a) - 1) * Math.log(logN), rhs = Math.log1p(r * Math.log(p) / logN);
  return { lhs, rhs, pass: lhs <= rhs };
}
/** The compression: the i-th smallest prime of n becomes the i-th prime, exponents kept. */
function compression(f) { let c = 1; f.forEach(([, a], i) => { c *= Math.pow(FIRST_PRIMES[i], a); }); return c; }

/* =====================================================================
   2. Evidence classes
   ===================================================================== */
const classMemo = new Map();
/** The strongest available evidence for Robin's inequality at n, with the rule that supplies it. */
function classify(n, depth = 0) {
  if (classMemo.has(n)) return classMemo.get(n);
  const f = factor(n), Z = Zof(f), w = f.length;
  let res = null;
  if (n <= 5040) res = { cat: n >= 16 && Z >= cap(n) ? 'viol' : 'out', rule: 'domain' };
  else if (f.every(([p]) => p <= 7)) res = { cat: 'lean', rule: 'seven' };
  else if (f.every(([p]) => p <= 11)) res = { cat: 'lean', rule: 'eleven' };
  else if (w <= 5 && compression(f) > 5040) {
    const c = compression(f), steps = [];
    for (let i = w - 1; i >= 0; i--) if (f[i][0] !== FIRST_PRIMES[i]) steps.push([FIRST_PRIMES[i], f[i][0], f[i][1]]);
    res = { cat: 'chain', rule: 'replace', c, base: w <= 4 ? 'seven' : 'eleven', steps };
  } else if (w <= 5 && n >= BOUND_START) res = { cat: 'bound', rule: 'optimum', c: compression(f) };
  else {
    if (depth < 4) {
      outer: for (const [p, a] of f) {
        let pr = 1;
        for (let r = 1; r <= a; r++) {
          pr *= p; const M = n / pr;
          if (M <= 5040) continue;
          const sub = classify(M, depth + 1);
          if (!CERTIFIED.has(sub.cat)) continue;
          const t = edgeTest(Math.log(M), p, a - r, r);
          if (t.pass) { res = { cat: 'edge', rule: 'edge', from: M, p, r, test: t }; break outer; }
        }
      }
    }
    if (!res) res = { cat: Z < cap(n) ? 'num' : 'fail', rule: 'numeric' };
  }
  if (depth === 0 || res.cat !== 'num') classMemo.set(n, res);
  return res;
}
function info(n) {
  const f = factor(n), Z = Zof(f), C = n > 15 ? Math.log(cap(n) / Z) : null;
  const a2 = valOf(f, 2), a3 = valOf(f, 3), a5 = valOf(f, 5), a7 = valOf(f, 7);
  return { n, f, Z, cap: n > 15 ? cap(n) : null, M: n > 15 ? cap(n) - Z : null, C, omega: f.length, a2, a3, a5, a7, a11: valOf(f, 11), U: a2 + a7, V: a3, W: a5 + a7, kappa: a7, ...classify(n) };
}

/* =====================================================================
   3. The lattice box: 2^a₂ 3^a₃ 5^a₅ 7^a₇ 11^s, AURIC position (a₂ + a₇, a₃, a₅ + a₇) and κ = a₇
   ===================================================================== */
const BOX = { a2: 7, a3: 4, a5: 3, a7: 3 };
const BOX_MAX = [BOX.a2, BOX.a3, BOX.a5, BOX.a7];
const LAT_PRIMES = [2, 3, 5, 7];
const KDIR = [-0.2, 0.3, 0.2];   // the κ offset in the scene: a short step out of the projected position
function scenePos(U, V, W, kappa) {
  return [(U - 5) * 0.62 + kappa * KDIR[0], (V - 2) * 0.9 + kappa * KDIR[1], (W - 3) * 0.62 + kappa * KDIR[2]];
}
function buildLattice(slice) {
  const verts = [], index = new Map();
  for (let a2 = 0; a2 <= BOX.a2; a2++) for (let a3 = 0; a3 <= BOX.a3; a3++) for (let a5 = 0; a5 <= BOX.a5; a5++) for (let a7 = 0; a7 <= BOX.a7; a7++) {
    const n = 2 ** a2 * 3 ** a3 * 5 ** a5 * 7 ** a7 * 11 ** slice;
    index.set(n, verts.length);
    verts.push({ n, e: [a2, a3, a5, a7], U: a2 + a7, V: a3, W: a5 + a7, kappa: a7, pos: scenePos(a2 + a7, a3, a5 + a7, a7), cls: classify(n) });
  }
  const edges = [];
  for (const v of verts) LAT_PRIMES.forEach((p, k) => {
    if (v.e[k] >= BOX_MAX[k]) return;
    const w = verts[index.get(v.n * p)];
    edges.push({ a: v, b: w, p, test: v.n > 15 ? edgeTest(Math.log(v.n), p, v.e[k], 1) : null });
  });
  return { slice, verts, index, edges };
}

/* =====================================================================
   4. Fibres, faces, the continuous relaxation, coverage and prefix families
   ===================================================================== */
/** The κ fibre through n: same (U, V, W) and the same cofactor outside {2, 3, 5, 7}. */
function kappaFibre(n) {
  const I = info(n), restN = I.f.filter(([p]) => p > 7).reduce((m, [p, a]) => m * p ** a, 1), out = [];
  for (let k = 0; k <= Math.min(I.U, I.W); k++) {
    const m = 2 ** (I.U - k) * 3 ** I.V * 5 ** (I.W - k) * 7 ** k * restN;
    if (m > N_MAX) continue;
    const J = info(m); out.push({ kappa: k, n: m, Z: J.Z, M: J.M, C: J.C, cat: J.cat, frac: sigmaFraction(J.f) });
  }
  return { base: [I.U, I.V, I.W], rest: restN, members: out };
}
/** The fibre n·q^k: per layer the edge test and the log margin, from the exponent of q alone. */
function primeFibre(n, q, K = 9) {
  const f = factor(n), a = valOf(f, q), Z0 = Zof(f), L0 = Math.log(n), layers = [];
  for (let k = 0; k <= K; k++) {
    const L = L0 + k * Math.log(q), Z = Z0 * S(q, a + k) / S(q, a), t = edgeTest(L, q, a + k, 1);
    layers.push({ k, L, Z, C: Math.log(capL(L) / Z), M: capL(L) - Z, lhs: t.lhs, rhs: t.rhs, pass: t.pass, excess: S(q, a + k + 1) / S(q, a + k) - 1, excessExact: (q - 1) / (q * (Math.pow(q, a + k + 1) - 1)) });
  }
  const startCls = classify(n), first = layers[0];
  const theorem = CERTIFIED.has(startCls.cat) && L0 >= 3 && first.pass;
  return { n, q, a, layers, startCls, first, theorem, allPass: layers.every((l) => l.pass) };
}
/** The face n, np, nq, npq: the four log margins, the mixed difference and the face-loss bounds. */
function face(n, p, q) {
  const f = factor(n), Z = Zof(f), ap = valOf(f, p), aq = valOf(f, q), L = Math.log(n), h = Math.log(p), k = Math.log(q);
  const Zp = Z * S(p, ap + 1) / S(p, ap), Zq = Z * S(q, aq + 1) / S(q, aq), Zpq = Zp * S(q, aq + 1) / S(q, aq);
  const C = (LL, ZZ) => Math.log(capL(LL) / ZZ);
  const c0 = C(L, Z), cp = C(L + h, Zp), cq = C(L + k, Zq), cpq = C(L + h + k, Zpq);
  const g = (x) => Math.log(Math.log(x));
  const gmix = g(L + h + k) - g(L + h) - g(L + k) + g(L);
  const K = (x) => (Math.log(x) + 1) / (x * x * Math.log(x) ** 2);
  return { n, p, q, corners: [n, n * p, n * q, n * p * q], C: [c0, cp, cq, cpq], Z: [Z, Zp, Zq, Zpq], mixed: cpq - cp - cq + c0, gmix, loss: -gmix, lo: h * k * K(L + h + k), hi: h * k * K(L), product: Z * Zpq - Zp * Zq, predicted: cp + cq - c0 };
}
/** The worst continuous allocation over a prime set at L = log n: u_p = (log T − log p)₊ and the maximum of Z. */
function relaxation(P, L) {
  const F = (t) => P.reduce((s, p) => s + Math.max(0, t - Math.log(p)), 0) - L;   // in t = log T
  let lo = Math.log(P[0]), hi = L + Math.log(P[P.length - 1]) + 1;
  for (let i = 0; i < 90; i++) { const mid = (lo + hi) / 2; if (F(mid) < 0) lo = mid; else hi = mid; }
  const Tt = Math.exp((lo + hi) / 2);
  const R = P.reduce((r, p) => r * (p < Tt ? (1 - 1 / Tt) / (1 - 1 / p) : 1), 1);
  return { T: Tt, R, active: P.filter((p) => p < Tt).length };
}
const SEVEN_SMOOTH = (() => {   // every 7-smooth n ≤ 10⁷ with its Z
  const out = [];
  for (let a = 1; a <= 1e7; a *= 2) for (let b = a; b <= 1e7; b *= 3) for (let c = b; c <= 1e7; c *= 5) for (let d = c; d <= 1e7; d *= 7) out.push(d);
  return out.sort((x, y) => x - y).map((n) => ({ n, Z: Zof(factor(n)) }));
})();
/** Prefix families: M_k = ∏ p/(p − 1), the danger range log log N < e^{−γ} M_k, and log log of the primorial. */
const PREFIX = (() => {
  const out = []; let M = 1, logPrim = 0;
  FIRST_PRIMES.forEach((p, i) => { M *= p / (p - 1); logPrim += Math.log(p); out.push({ k: i + 1, p, M, llT: M / EG, llN: Math.log(logPrim), gap: M / EG - Math.log(logPrim) }); });
  return out;
})();
const coverMemo = new Map();
const COVER_CATS = ['lean', 'chain', 'bound', 'edge', 'num', 'fail'];
/** Every integer in (5040, X] with its evidence class, by a smallest-prime-factor sieve. */
function coverage(X) {
  if (coverMemo.has(X)) return coverMemo.get(X);
  const spf = new Int32Array(X + 1);
  for (let i = 2; i <= X; i++) if (!spf[i]) { for (let j = i; j <= X; j += i) if (!spf[j]) spf[j] = i; }
  const code = new Uint8Array(X + 1), CODE = { lean: 1, chain: 2, bound: 3, edge: 4, num: 5, fail: 6 };
  const counts = Object.fromEntries(COVER_CATS.map((c) => [c, 0])), byOmega = {}, bins = [];
  const lo = Math.log10(5040), hi = Math.log10(X), NB = 16;
  for (let b = 0; b < NB; b++) bins.push({ lo: lo + (hi - lo) * b / NB, hi: lo + (hi - lo) * (b + 1) / NB, total: 0, ...Object.fromEntries(COVER_CATS.map((c) => [c, 0])) });
  const frontier = [];
  for (let N = 5041; N <= X; N++) {
    const f = []; let m = N;
    while (m > 1) { const p = spf[m]; let a = 0; while (m % p === 0) { m /= p; a++; } f.push([p, a]); }
    const w = f.length; let cat = null;
    if (f[w - 1][0] <= 11) cat = 'lean';
    else if (w <= 5 && compression(f) > 5040) cat = 'chain';
    else if (w <= 5 && N >= BOUND_START) cat = 'bound';
    else {
      outer: for (const [p, a] of f) {
        let pr = 1;
        for (let r = 1; r <= a; r++) {
          pr *= p; const M = N / pr;
          if (M <= 5040 || code[M] < 1 || code[M] > 4) continue;
          if (edgeTest(Math.log(M), p, a - r, r).pass) { cat = 'edge'; break outer; }
        }
      }
      if (!cat) cat = Zof(f) < cap(N) ? 'num' : 'fail';
    }
    code[N] = CODE[cat]; counts[cat]++;
    (byOmega[w] = byOmega[w] || Object.fromEntries(COVER_CATS.map((c) => [c, 0])))[cat]++;
    const bi = Math.min(NB - 1, Math.floor((Math.log10(N) - lo) / (hi - lo) * NB)); bins[bi][cat]++; bins[bi].total++;
    if ((cat === 'num' || cat === 'fail') && frontier.length < 400) frontier.push(N);
  }
  let firstOmega6Num = null;
  for (let N = 30030; N <= X && firstOmega6Num === null; N++) if (code[N] === 5 && factor(N).length >= 6) firstOmega6Num = N;
  const res = { X, total: X - 5040, counts, byOmega, bins, frontier, firstOmega6Num };
  coverMemo.set(X, res);
  return res;
}

/* =====================================================================
   5. State and presets
   ===================================================================== */
const MODES = ['lattice', 'kappa', 'fibre', 'face', 'cover'];
const St = { mode: 'lattice', n: 5040, slice: 0, edge: 'grad', q: 11, p: 2, fq: 3, xExp: 6, preset: 'core' };
const PRESETS = {
  core: { mode: 'lattice', n: 5040, slice: 0, edge: 'grad',
    zh: '5040 = 2⁴·3²·5·7 的 Z = 403/105 ≈ 3.8381 高出容量 e^γ log log 5040 ≈ 3.8169：它是被 Robin 判据排除在外的端点（红）。它的邻居 10080、7560、15120 都在七光滑族里，由冻结的 Lean 定理直接着成绿色。',
    en: '5040 = 2⁴·3²·5·7 has Z = 403/105 ≈ 3.8381 above the capacity e^γ log log 5040 ≈ 3.8169: it is the endpoint excluded by Robin’s criterion (red). Its neighbours 10080, 7560 and 15120 lie in the 7-smooth family and are coloured green directly by the frozen Lean theorem.' },
  kappa: { mode: 'kappa', n: 7560, slice: 0,
    zh: '位置 (U, V, W) = (4, 3, 2) 上有三个整数：κ = 0 的 10800、κ = 1 的 7560、κ = 2 的 5292。投影完全相同，余量却是 0.410、0.090、0.811——中间那个最靠近边界。颜色必须带着 κ。',
    en: 'Three integers sit at (U, V, W) = (4, 3, 2): 10800 with κ = 0, 7560 with κ = 1 and 5292 with κ = 2. The projections coincide, yet the margins are 0.410, 0.090 and 0.811, the middle one closest to the boundary. The colour has to carry κ.' },
  fibre: { mode: 'fibre', n: 10080, q: 11,
    zh: '10080 → 110880 的首层检验：增量 1/11 乘 log log 10080 ≈ 0.202，不超过 log(1 + log 11 / log 10080) ≈ 0.231。Lean 定理 edgeTest_mul_prime_pow 推出之后每一层都通过，于是整条纤维 10080·11ᵏ 都满足 Robin。',
    en: 'The first layer 10080 → 110880: the excess 1/11 times log log 10080 ≈ 0.202 is at most log(1 + log 11 / log 10080) ≈ 0.231. The Lean theorem edgeTest_mul_prime_pow then makes every later layer pass, so the whole fibre 10080·11ᵏ satisfies Robin’s inequality.' },
  fail: { mode: 'fibre', n: 27440, q: 11,
    zh: '27440 = 2⁴·5·7³ 乘 11：左边 0.2113 大于右边 0.2108，检验差一点不过。可 301840 的 Robin 比值只有约 0.655，余量很大——检验丢掉了已有余量，只是充分条件。',
    en: '27440 = 2⁴·5·7³ times 11: the left side 0.2113 exceeds the right side 0.2108, so the test fails by a hair. Yet 301840 has a Robin ratio of about 0.655, a wide margin: the test throws away the margin already there and is only sufficient.' },
  face: { mode: 'face', n: 10080, p: 2, fq: 3,
    zh: '10080 的 2 × 3 面：Z 在四个角上精确满足 Z(n)Z(6n) = Z(2n)Z(3n)，所以 C 的混合差只剩 log log 的混合差 ≈ −0.004637。第四个角的余量要比三个角的“加法预测”少这么多。',
    en: 'The 2 × 3 face of 10080: Z at the four corners satisfies Z(n)Z(6n) = Z(2n)Z(3n) exactly, so the mixed difference of C is the mixed difference of log log alone, ≈ −0.004637. The fourth corner has that much less margin than the “additive prediction” from the other three.' },
  replace: { mode: 'lattice', n: 18720, slice: 0,
    zh: '18720 = 2⁵·3²·5·13 有四个不同素因子，压缩数是 2⁵·3²·5·7 = 10080（七光滑，Lean 定理）。把 7 换成 13：robinAt_prime_replace 推出 18720 满足 Robin。格点上高亮的是它的压缩数。',
    en: '18720 = 2⁵·3²·5·13 has four distinct primes, and its compression is 2⁵·3²·5·7 = 10080 (7-smooth, a Lean theorem). Swap 7 for 13: robinAt_prime_replace gives Robin’s inequality at 18720. The highlighted lattice vertex is its compression.' },
  cover: { mode: 'cover', xExp: 6,
    zh: '(5040, 10⁶] 的每个整数按最强证据着色：青色和紫色覆盖了几乎全部不同素因子 ≤ 5 的整数；剩下的前沿是不同素因子 ≥ 6 的整数，只能靠边检验或只有数值。右图：第 k 个前缀族的有限危险范围随 k 无界增长。',
    en: 'Every integer in (5040, 10⁶] coloured by its strongest evidence: cyan and violet cover almost all integers with at most five distinct primes; the remaining frontier is the integers with six or more, reached only by the edge test or by numbers alone. Side chart: the finite danger range of the k-th prefix family grows without bound in k.' }
};
let MODEL = null, dirty = true, frameCount = 0, syncedKey = '';
function rebuild() { MODEL = buildLattice(St.slice); dirty = true; }
const stateKey = () => [St.mode, St.n, St.slice, St.edge, St.q, St.p, St.fq, St.xExp, St.preset, TRV.lang()].join('|');

/* =====================================================================
   6. DOM helpers and certificate text
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const catName = (c) => ({
  lean: T('Lean 定理直接覆盖', 'covered by a Lean theorem'), chain: T('Lean 定理链（换素数）', 'Lean theorem chain (prime swaps)'),
  bound: T('5040 最优定理 + 数值阈值', '5040 optimum + numerical threshold'), edge: T('Lean 边规则 + 浮点检验', 'Lean edge rule + floating-point test'),
  num: T('只有数值', 'numbers only'), out: T('n ≤ 5040，不在判据范围内', 'n ≤ 5040, outside the criterion'),
  viol: T('n ≤ 5040 且不等式不成立（判据本来就排除）', 'n ≤ 5040 and the inequality fails (excluded by the criterion)'),
  fail: T('数值上不等式不成立', 'the inequality fails numerically')
})[c];
const catShort = (c) => ({
  lean: 'Lean', chain: T('Lean 定理链', 'Lean chain'), bound: T('最优 + 阈值', 'optimum + threshold'), edge: T('边规则', 'edge rule'),
  num: T('只有数值', 'numbers only'), out: '≤ 5040', viol: T('≤ 5040 · 不成立', '≤ 5040 · fails'), fail: T('不成立', 'fails')
})[c];
function certText(I) {
  const n = I.n, base = I.base === 'seven' ? 'robin_seven_smooth' : 'robin_eleven_smooth';
  switch (I.rule) {
    case 'domain': return I.cat === 'viol'
      ? T(`<b>${n}</b> ≤ 5040 且 Z(n) ≥ e<sup>γ</sup> log log n。Robin 判据只要求 n &gt; 5040，这不是反例。`, `<b>${n}</b> ≤ 5040 with Z(n) ≥ e<sup>γ</sup> log log n. Robin’s criterion only concerns n &gt; 5040; this is not a counterexample.`)
      : T(`<b>${n}</b> ≤ 5040，不在 Robin 判据的量词范围内。`, `<b>${n}</b> ≤ 5040, outside the range of Robin’s criterion.`);
    case 'seven': return T('七光滑且大于 5040：<code>robin_seven_smooth</code> 直接给出。', '7-smooth and above 5040: <code>robin_seven_smooth</code> gives it directly.');
    case 'eleven': return T('十一光滑且大于 5040：<code>robin_eleven_smooth</code> 直接给出。', '11-smooth and above 5040: <code>robin_eleven_smooth</code> gives it directly.');
    case 'replace': return T(`压缩数 c(n) = <b>${I.c}</b> &gt; 5040 由 <code>${base}</code> 覆盖；再用 <code>robinAt_prime_replace</code> 依次换素数 ${I.steps.map(([p, q]) => `${p}→${q}`).join('，')}（从大到小，每步 p ≤ q 且都不整除其余部分，页面按精确整数核对）。`,
      `The compression c(n) = <b>${I.c}</b> &gt; 5040 is covered by <code>${base}</code>; then <code>robinAt_prime_replace</code> swaps ${I.steps.map(([p, q]) => `${p}→${q}`).join(', ')} (largest first; each step has p ≤ q, both prime to the rest, checked by the page in exact integers).`);
    case 'optimum': return T(`压缩数 c(n) = <b>${I.c}</b> ≤ 5040：换素数使 Z(n) ≤ Z(c(n))，冻结的 <code>golden_resource_unique_optimum</code> 给出 Z(c(n)) ≤ 403/105；n ≥ 5600 时 e<sup>γ</sup> log log n &gt; 403/105（浮点核对的阈值）。`,
      `The compression c(n) = <b>${I.c}</b> ≤ 5040: prime swaps give Z(n) ≤ Z(c(n)), and the frozen <code>golden_resource_unique_optimum</code> gives Z(c(n)) ≤ 403/105; for n ≥ 5600, e<sup>γ</sup> log log n &gt; 403/105 (a threshold checked in floating point).`);
    case 'edge': return T(`从已着色的 <b>${I.from}</b> 沿边 ×${I.p}${I.r > 1 ? sup(I.r) : ''} 而来：浮点边检验 ${sci(I.test.lhs)} ≤ ${sci(I.test.rhs)}，<code>robinAt_mul_of_edgeTest</code> 传递 Robin 不等式。`,
      `Reached from the coloured <b>${I.from}</b> along the edge ×${I.p}${I.r > 1 ? sup(I.r) : ''}: floating-point edge test ${sci(I.test.lhs)} ≤ ${sci(I.test.rhs)}, and <code>robinAt_mul_of_edgeTest</code> carries Robin’s inequality.`);
    default: return I.cat === 'num'
      ? T(`没有可用的证书规则。数值上 Z(n) = ${num(I.Z, 5)} &lt; ${num(I.cap, 5)}，但这只是浮点读数。`, `No certificate rule applies. Numerically Z(n) = ${num(I.Z, 5)} &lt; ${num(I.cap, 5)}, but that is a floating-point reading.`)
      : T('数值上不等式不成立。', 'The inequality fails numerically.');
  }
}

/* =====================================================================
   7. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 16000, PTS_MAX = 1200;
const CAMS = { iso: [0.8, 1.05, 12], front: [0.0001, 1.5, 11.5], top: [0.0001, 0.06, 11.5] };
const cam = { theta: 0.8, phi: 1.05, r: 12, tTheta: 0.8, tPhi: 1.05, tR: 12 };
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
    d.innerHTML = '<span class="zh">这个浏览器没有提供 WebGL，三维视图无法显示。下方的两张图和右侧读数仍然可用。</span><span class="en">This browser does not provide WebGL, so the 3D view cannot be shown. The two charts below and the readouts still work.</span>';
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
/** The lattice vertex standing for the selection: n itself, or its compression for a prime-swap certificate. */
function selectedVertex() { if (MODEL.index.has(St.n)) return St.n; const I = info(St.n); return I.cat === 'chain' && MODEL.index.has(I.c) ? I.c : null; }
/** Vertices to emphasise in the current view, by n. */
function focusSet() {
  const out = new Set(), sel = selectedVertex();
  if (sel !== null) out.add(sel);
  if (St.mode === 'kappa') for (const m of kappaFibre(St.n).members) if (MODEL.index.has(m.n)) out.add(m.n);
  if (St.mode === 'fibre') { let m = St.n; for (let k = 0; k < 10 && m <= N_MAX; k++, m *= St.q) if (MODEL.index.has(m)) out.add(m); }
  if (St.mode === 'face') for (const m of face(St.n, St.p, St.fq).corners) if (MODEL.index.has(m)) out.add(m);
  return out;
}
function updateGL() {
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, ca, cb, k) => { if (v + 2 > LINES_MAX) return; Pp.set(a, 3 * v); Cc[3 * v] = ca[0] * k; Cc[3 * v + 1] = ca[1] * k; Cc[3 * v + 2] = ca[2] * k; v++; Pp.set(b, 3 * v); Cc[3 * v] = cb[0] * k; Cc[3 * v + 1] = cb[1] * k; Cc[3 * v + 2] = cb[2] * k; v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array.set(p, 3 * np); PT.aColor.array.set(col, 3 * np); PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  const focus = focusSet(), sel = selectedVertex(), dim = St.mode === 'kappa' || St.mode === 'fibre' || St.mode === 'face';
  for (const e of MODEL.edges) {
    const both = focus.has(e.a.n) && focus.has(e.b.n), k = dim ? (both ? 0.95 : 0.12) : 0.34;
    if (St.edge === 'test') { const col = !e.test ? CAT_RGB.out : e.test.pass ? [0.35, 0.85, 1] : [1, 0.25, 0.75]; seg(e.a.pos, e.b.pos, col, col, k); }
    else seg(e.a.pos, e.b.pos, CAT_RGB[e.a.cls.cat], CAT_RGB[e.b.cls.cat], k);
  }
  if (St.mode === 'kappa') {   // the κ fibre as an amber polyline
    const ms = kappaFibre(St.n).members.filter((m) => MODEL.index.has(m.n)).map((m) => MODEL.verts[MODEL.index.get(m.n)].pos);
    for (let i = 0; i + 1 < ms.length; i++) seg(ms[i], ms[i + 1], TRV.rgb.amber, TRV.rgb.amber, 1);
  }
  for (const vtx of MODEL.verts) {
    const isSel = vtx.n === sel, inF = focus.has(vtx.n);
    dot(vtx.pos, isSel ? TRV.rgb.amber : CAT_RGB[vtx.cls.cat], dim && !inF ? 0.35 : 1, isSel ? 3.4 : inF ? 2.6 : 1.7);
  }
  Lb.position.needsUpdate = true; Lb.color.needsUpdate = true; lines.geometry.setDrawRange(0, v);
  PT.position.needsUpdate = true; PT.aColor.needsUpdate = true; PT.aAlpha.needsUpdate = true; PT.aSize.needsUpdate = true; pts.geometry.setDrawRange(0, np);
}
function updateCamera(dtSec) {
  const k = TRV.reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.45 : 1);
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
const drag = { x: 0, y: 0, pts: new Map(), pinch: 0, moved: 0 };
stage.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest('.chip')) return;
  stage.setPointerCapture(ev.pointerId);
  drag.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); drag.x = ev.clientX; drag.y = ev.clientY; drag.moved = 0;
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()]; drag.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
});
stage.addEventListener('pointermove', (ev) => {
  if (!drag.pts.has(ev.pointerId)) return;
  drag.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(28, Math.max(6, cam.tR * drag.pinch / d)); drag.pinch = d; drag.moved += 10; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => {
  if (!drag.pts.has(ev.pointerId)) return;
  drag.pts.delete(ev.pointerId); if (drag.pts.size === 0) drag.pinch = 0;
  if (ev.type === 'pointerup' && drag.moved < 6 && glOK) pickAt(ev.clientX, ev.clientY);
};
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(28, Math.max(6, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });
function pickAt(cx, cy) {
  const rect = stage.getBoundingClientRect(), x = cx - rect.left, y = cy - rect.top;
  let best = null, bd = 16;
  for (const v of MODEL.verts) { const q = proj3(v.pos); if (q.z > 1) continue; const d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = v; } }
  if (best) { selectN(best.n); custom(); }
}

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
  let k = 0;
  const put = (text, p, cls) => { const el = tagAt(k++, cls); el.textContent = text; placeTag(el, p); };
  put('×2 → U', scenePos(BOX.a2 + 0.9, 0, 0, 0), 'ax');
  put('×3 → V', scenePos(0, BOX.a3 + 0.6, 0, 0), 'ax');
  put('×5 → W', scenePos(0, 0, BOX.a5 + 0.9, 0), 'ax');
  put('×7 = (1, 0, 1) + κ', scenePos(1.3, -0.35, 1.3, 1), 'ax');
  const sel = selectedVertex();
  if (sel !== null) { const v = MODEL.verts[MODEL.index.get(sel)]; put(sel === St.n ? `n = ${sel}` : `c(n) = ${sel}`, [v.pos[0], v.pos[1] + 0.32, v.pos[2]], 'sel'); }
  if (St.mode === 'kappa') for (const m of kappaFibre(St.n).members) if (MODEL.index.has(m.n) && m.n !== sel) { const v = MODEL.verts[MODEL.index.get(m.n)]; put(`κ=${m.kappa}: ${m.n}`, [v.pos[0], v.pos[1] + 0.3, v.pos[2]], 'cy'); }
  if (St.mode === 'face') for (const m of face(St.n, St.p, St.fq).corners.slice(1)) if (MODEL.index.has(m)) { const v = MODEL.verts[MODEL.index.get(m)]; put(String(m), [v.pos[0], v.pos[1] + 0.3, v.pos[2]], 'cy'); }
  if (MODEL.index.has(5040) && sel !== 5040) { const v = MODEL.verts[MODEL.index.get(5040)]; put('5040', [v.pos[0], v.pos[1] - 0.3, v.pos[2]], 'mg'); }
  for (let i = k; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}

/* =====================================================================
   9. 2D charts
   ===================================================================== */
function frame2d(cv, pl0 = 46) {
  const dpr = fitCanvas(cv), ctx = cv.getContext('2d'), Wd = cv.width, Hh = cv.height;
  ctx.clearRect(0, 0, Wd, Hh);
  const pl = pl0 * dpr, pr = 12 * dpr, pt = 10 * dpr, pb = 20 * dpr;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  return { dpr, ctx, W: Wd, Hh, pl, pt, iw: Wd - pl - pr, ih: Hh - pt - pb };
}
const yTicks = (ctx, dpr, pl, Y, vals, fmt) => { ctx.fillStyle = PAL.dim; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of vals) ctx.fillText(fmt(g), pl - 4 * dpr, Y(g)); };
const xTicks = (ctx, dpr, pt, ih, X, vals, fmt) => { ctx.fillStyle = PAL.dim; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const g of vals) ctx.fillText(fmt(g), X(g), pt + ih + 3 * dpr); };
const hline = (ctx, y, pl, iw, col, dpr) => { ctx.strokeStyle = col; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(pl + iw, y); ctx.stroke(); ctx.setLineDash([]); };
const vline = (ctx, x, pt, ih, col, dpr) => { ctx.strokeStyle = col; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + ih); ctx.stroke(); ctx.setLineDash([]); };
const meta = (id, items) => { $(id).innerHTML = items.map(([c, s]) => `<span class="it"><i style="display:inline-block;width:10px;height:3px;background:${c};vertical-align:middle;margin:0 4px 0 8px"></i>${s}</span>`).join(''); };
function niceTicks(lo, hi, n = 4) {
  const raw = (hi - lo) / n, step = Math.pow(10, Math.floor(Math.log10(raw))), m = ([1, 2, 5, 10].find((k) => raw <= k * step) || 10) * step, out = [];
  for (let v = Math.ceil(lo / m) * m; v <= hi + 1e-12; v += m) out.push(+v.toFixed(10));
  return out;
}
const logTicks = (y0, y1) => { const out = []; for (let e = Math.ceil(y0); e <= y1; e++) out.push(10 ** e); return out; };

function drawLatticeMain() {   // Z(n) against log n for the box, with the Robin capacity
  const F = frame2d(cv1); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, vs = MODEL.verts.filter((v) => v.n >= 16);
  const xs = vs.map((v) => Math.log(v.n)), zs = vs.map((v) => Zof(factor(v.n)));
  const x0 = Math.max(2.8, Math.min(...xs)), x1 = Math.max(...xs) + 0.2, y0 = 1, y1 = Math.max(4.4, Math.max(...zs) + 0.2);
  const X = (x) => pl + (x - x0) / (x1 - x0) * iw, Y = (y) => pt + ih - (y - y0) / (y1 - y0) * ih;
  yTicks(ctx, dpr, pl, Y, niceTicks(y0, y1), (v) => v.toFixed(1)); xTicks(ctx, dpr, pt, ih, X, niceTicks(x0, x1, 6), (v) => v.toFixed(0));
  ctx.strokeStyle = PAL.amber; ctx.lineWidth = 1.4 * dpr; ctx.beginPath();
  for (let i = 0; i <= 200; i++) { const x = x0 + (x1 - x0) * i / 200, y = Math.max(y0, capL(x)); i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)); }
  ctx.stroke(); ctx.lineWidth = 1;
  vline(ctx, X(Math.log(5040)), pt, ih, PAL.warn, dpr);
  vs.forEach((v, i) => { ctx.fillStyle = CAT_CSS[v.cls.cat]; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(X(xs[i]), Y(zs[i]), 2.2 * dpr, 0, 7); ctx.fill(); });
  ctx.globalAlpha = 1;
  const xn = Math.log(St.n);
  if (St.n >= 16 && xn <= x1 && xn >= x0) { const I = info(St.n); ctx.strokeStyle = PAL.amber; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.arc(X(xn), Y(Math.min(y1, I.Z)), 5 * dpr, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
  $('c1Title').textContent = T(`Z(n) = σ(n)/n 对 log n（格点切片 a₁₁ = ${St.slice}）`, `Z(n) = σ(n)/n AGAINST log n (LATTICE SLICE a₁₁ = ${St.slice})`);
  meta('c1Meta', [[PAL.amber, T('容量 e^γ log log n', 'capacity e^γ log log n')], [PAL.warn, 'log 5040']]);
}
function drawLatticeSide() {   // the continuous relaxation against integers
  const F = frame2d(cv2, 40); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, x0 = Math.log(5040) - 0.3, x1 = Math.log(1e7);
  const curve = (fn) => { const out = []; for (let i = 0; i <= 160; i++) { const x = x0 + (x1 - x0) * i / 160; out.push([x, fn(x)]); } return out; };
  const capC = curve(capL), r4 = curve((x) => relaxation([2, 3, 5, 7], x).R), r5 = curve((x) => relaxation([2, 3, 5, 7, 11], x).R);
  const bins = []; for (const s of SEVEN_SMOOTH) { if (s.n < 4000) continue; const x = Math.log(s.n), b = Math.floor((x - x0) / 0.12); if (!bins[b] || bins[b][1] < s.Z) bins[b] = [x, s.Z]; }
  const all = [...capC, ...r4, ...r5].map((p) => p[1]), y0 = Math.min(...all) - 0.05, y1 = Math.max(...all) + 0.05;
  const X = (x) => pl + (x - x0) / (x1 - x0) * iw, Y = (y) => pt + ih - (y - y0) / (y1 - y0) * ih;
  yTicks(ctx, dpr, pl, Y, niceTicks(y0, y1, 3), (v) => v.toFixed(1)); xTicks(ctx, dpr, pt, ih, X, niceTicks(x0, x1, 4), (v) => v.toFixed(0));
  const line = (p2, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w * dpr; ctx.beginPath(); p2.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke(); ctx.lineWidth = 1; };
  line(r5, VIOLET, 1); line(r4, PAL.magenta, 1.4); line(capC, PAL.amber, 1.4);
  for (const b of bins) if (b) { ctx.fillStyle = PAL.ok; ctx.beginPath(); ctx.arc(X(b[0]), Y(b[1]), 1.8 * dpr, 0, 7); ctx.fill(); }
  vline(ctx, X(Math.log(6000)), pt, ih, PAL.dim, dpr);
  $('c2Title').textContent = T('连续松弛（指数取实数）对整数格点', 'CONTINUOUS RELAXATION (REAL EXPONENTS) AGAINST INTEGERS');
  meta('c2Meta', [[PAL.amber, T('容量', 'capacity')], [PAL.magenta, T('松弛最大值 {2,3,5,7}', 'relaxed max {2,3,5,7}')], [VIOLET, '{2,…,11}'], [PAL.ok, T('七光滑整数的最大 Z', 'max Z of 7-smooth')]]);
}
function bars(F, vals, labels, colors) {
  const { ctx, dpr, pl, pt, iw, ih } = F, y0 = Math.min(0, ...vals) - 0.02 * (Math.max(...vals.map(Math.abs)) || 1), y1 = Math.max(0, ...vals) + 0.06 * (Math.max(...vals.map(Math.abs)) || 1);
  const bw = iw / vals.length, X = (i) => pl + (i + 0.5) * bw, Y = (v) => pt + ih - (v - y0) / (y1 - y0) * ih;
  yTicks(ctx, dpr, pl, Y, niceTicks(y0, y1, 3), (v) => (Math.abs(v) < 0.1 && v !== 0 ? v.toFixed(3) : v.toFixed(2)));
  hline(ctx, Y(0), pl, iw, PAL.faint, dpr);
  vals.forEach((v, i) => { ctx.fillStyle = colors[i]; const ya = Y(Math.max(0, v)), yb = Y(Math.min(0, v)); ctx.fillRect(X(i) - bw * 0.3, ya, bw * 0.6, Math.max(1, yb - ya)); ctx.fillStyle = PAL.dim; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(labels[i], X(i), pt + ih + 3 * dpr); });
  return { X, Y, bw };
}
function drawKappa() {
  const K = kappaFibre(St.n), ms = K.members;
  { const F = frame2d(cv1); if (F.iw < 60 || F.ih < 40) return;
    bars(F, ms.map((m) => m.M ?? 0), ms.map((m) => `κ=${m.kappa} · ${m.n}`), ms.map((m) => CAT_CSS[m.cat]));
    $('c1Title').textContent = T(`κ 纤维上的余量 M(n)，位置 (U, V, W) = (${K.base.join(', ')})`, `MARGIN M(n) ALONG THE κ FIBRE AT (U, V, W) = (${K.base.join(', ')})`);
    meta('c1Meta', []); }
  { const F = frame2d(cv2, 40); if (F.iw < 60 || F.ih < 40) return;
    const { ctx, dpr, pl, pt, iw, ih } = F, zs = ms.flatMap((m) => [m.Z, m.n > 15 ? cap(m.n) : m.Z]), y0 = Math.min(...zs) - 0.1, y1 = Math.max(...zs) + 0.1;
    const bw = iw / Math.max(1, ms.length), X = (i) => pl + (i + 0.5) * bw, Y = (y) => pt + ih - (y - y0) / (y1 - y0) * ih;
    yTicks(ctx, dpr, pl, Y, niceTicks(y0, y1, 3), (v) => v.toFixed(2));
    ms.forEach((m, i) => { ctx.fillStyle = PAL.cyan; ctx.fillRect(X(i) - bw * 0.28, Y(m.Z), bw * 0.24, pt + ih - Y(m.Z)); if (m.n > 15) { ctx.fillStyle = PAL.amber; ctx.fillRect(X(i) + bw * 0.04, Y(cap(m.n)), bw * 0.24, pt + ih - Y(cap(m.n))); } ctx.fillStyle = PAL.dim; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(`κ=${m.kappa}`, X(i), pt + ih + 3 * dpr); });
    $('c2Title').textContent = T('Z(n)（青）与容量（琥珀）', 'Z(n) (CYAN) AND THE CAPACITY (AMBER)'); meta('c2Meta', []); }
}
function drawFibre() {
  const Fb = primeFibre(St.n, St.q), ls = Fb.layers;
  { const F = frame2d(cv1, 52); if (F.iw < 60 || F.ih < 40) return;
    const { ctx, dpr, pl, pt, iw, ih } = F, all = ls.flatMap((l) => [l.lhs, l.rhs]).filter((v) => v > 0), y0 = Math.log10(Math.min(...all)) - 0.3, y1 = Math.log10(Math.max(...all)) + 0.3;
    const bw = iw / ls.length, X = (k) => pl + (k + 0.5) * bw, Y = (v) => pt + ih - (Math.log10(v) - y0) / (y1 - y0) * ih;
    yTicks(ctx, dpr, pl, Y, logTicks(y0, y1), (v) => `1e${Math.round(Math.log10(v))}`);
    ls.forEach((l) => { ctx.globalAlpha = 0.85; ctx.fillStyle = l.pass ? PAL.cyan : PAL.magenta; ctx.fillRect(X(l.k) - bw * 0.32, Y(l.lhs), bw * 0.3, pt + ih - Y(l.lhs)); ctx.fillStyle = PAL.amber; ctx.fillRect(X(l.k) + bw * 0.02, Y(l.rhs), bw * 0.3, pt + ih - Y(l.rhs)); ctx.globalAlpha = 1; });
    xTicks(ctx, dpr, pt, ih, X, ls.map((l) => l.k), (k) => `k=${k}`);
    $('c1Title').textContent = T(`边检验沿纤维 ${St.n}·${St.q}ᵏ：左边（青＝通过，品红＝不过）与右边（琥珀）`, `EDGE TEST ALONG ${St.n}·${St.q}ᵏ: LEFT SIDE (CYAN PASS, MAGENTA FAIL) AND RIGHT SIDE (AMBER)`);
    meta('c1Meta', [[PAL.cyan, T('(增量)·log log n', '(excess)·log log n')], [PAL.amber, 'log(1 + log q / log n)']]); }
  { const F = frame2d(cv2, 40); if (F.iw < 60 || F.ih < 40) return;
    const { ctx, dpr, pl, pt, iw, ih } = F, cs = ls.map((l) => l.C), y0 = Math.min(0, ...cs) - 0.02, y1 = Math.max(...cs) + 0.02;
    const X = (k) => pl + (k / (ls.length - 1)) * iw, Y = (v) => pt + ih - (v - y0) / (y1 - y0) * ih;
    yTicks(ctx, dpr, pl, Y, niceTicks(y0, y1, 3), (v) => v.toFixed(2)); hline(ctx, Y(0), pl, iw, PAL.warn, dpr);
    ctx.strokeStyle = PAL.ink; ctx.beginPath(); ls.forEach((l, i) => (i ? ctx.lineTo(X(l.k), Y(l.C)) : ctx.moveTo(X(l.k), Y(l.C)))); ctx.stroke();
    ls.forEach((l) => { ctx.fillStyle = Fb.theorem ? VIOLET : PAL.dim; ctx.beginPath(); ctx.arc(X(l.k), Y(l.C), 2.6 * dpr, 0, 7); ctx.fill(); });
    xTicks(ctx, dpr, pt, ih, X, ls.map((l) => l.k), (k) => String(k));
    $('c2Title').textContent = T('对数余量 C(n·qᵏ)', 'LOG MARGIN C(n·qᵏ)'); meta('c2Meta', [[PAL.warn, 'C = 0']]); }
}
function drawFace() {
  const Fc = face(St.n, St.p, St.fq);
  { const F = frame2d(cv1); if (F.iw < 60 || F.ih < 40) return;
    const vals = [...Fc.C, Fc.predicted], labels = ['n', `${St.p}n`, `${St.fq}n`, `${St.p * St.fq}n`, T('加法预测', 'additive')];
    const { X, Y, bw } = bars(F, vals, labels, [PAL.cyan, PAL.cyan, PAL.cyan, PAL.amber, PAL.dim]);
    const ctx = F.ctx; ctx.strokeStyle = PAL.magenta; ctx.lineWidth = 1.5 * F.dpr; ctx.beginPath(); ctx.moveTo(X(3) + bw * 0.3, Y(Fc.C[3])); ctx.lineTo(X(4) - bw * 0.3, Y(Fc.predicted)); ctx.stroke(); ctx.lineWidth = 1;
    $('c1Title').textContent = T(`面 ${St.n}、×${St.p}、×${St.fq} 四个角的对数余量 C`, `LOG MARGIN C AT THE FOUR CORNERS OF THE FACE ${St.n}, ×${St.p}, ×${St.fq}`);
    meta('c1Meta', [[PAL.magenta, T(`差 = 面损失 ${sci(Fc.loss)}`, `gap = face loss ${sci(Fc.loss)}`)]]); }
  { const F = frame2d(cv2, 52); if (F.iw < 60 || F.ih < 40) return;
    const { ctx, dpr, pl, pt, iw, ih } = F, rows = [];
    for (let j = 0; j <= 12; j++) { const m = St.n * St.p ** j; if (m > N_MAX) break; rows.push([Math.log(m), face(m, St.p, St.fq)]); }
    const all = rows.flatMap(([, f]) => [f.loss, f.lo, f.hi]), y0 = Math.log10(Math.min(...all)) - 0.1, y1 = Math.log10(Math.max(...all)) + 0.1;
    const x0 = rows[0][0], x1 = rows[rows.length - 1][0], X = (x) => pl + (x - x0) / ((x1 - x0) || 1) * iw, Y = (v) => pt + ih - (Math.log10(v) - y0) / (y1 - y0) * ih;
    yTicks(ctx, dpr, pl, Y, logTicks(y0, y1), (v) => `1e${Math.round(Math.log10(v))}`); xTicks(ctx, dpr, pt, ih, X, niceTicks(x0, x1, 4), (v) => v.toFixed(0));
    const line = (sel, col) => { ctx.strokeStyle = col; ctx.beginPath(); rows.forEach(([x, f], i) => (i ? ctx.lineTo(X(x), Y(sel(f))) : ctx.moveTo(X(x), Y(sel(f))))); ctx.stroke(); };
    line((f) => f.hi, PAL.dim); line((f) => f.lo, PAL.dim); line((f) => f.loss, PAL.magenta);
    $('c2Title').textContent = T(`面损失沿 ${St.n}·${St.p}ʲ 的衰减（对 log n）`, `FACE LOSS ALONG ${St.n}·${St.p}ʲ (AGAINST log n)`);
    meta('c2Meta', [[PAL.magenta, 'A'], [PAL.dim, 'hk·K(L+h+k) ≤ A ≤ hk·K(L)']]); }
}
function drawCover() {
  const Cv = coverage(Math.round(10 ** St.xExp));
  { const F = frame2d(cv1, 40); if (F.iw < 60 || F.ih < 40) return;
    const { ctx, dpr, pl, pt, iw, ih } = F, bw = iw / Cv.bins.length, Y = (v) => pt + ih - v * ih;
    yTicks(ctx, dpr, pl, Y, [0, 0.5, 1], (v) => `${Math.round(v * 100)}%`);
    Cv.bins.forEach((b, i) => { let acc = 0; for (const c of COVER_CATS) { const fr = b.total ? b[c] / b.total : 0; if (!fr) continue; ctx.fillStyle = CAT_CSS[c]; ctx.fillRect(pl + i * bw + 1, Y(acc + fr), bw - 2, Y(acc) - Y(acc + fr)); acc += fr; } });
    const lo = Cv.bins[0].lo, hi = Cv.bins[Cv.bins.length - 1].hi;
    xTicks(ctx, dpr, pt, ih, (v) => pl + (v - lo) / (hi - lo) * iw, [4, 5, 6].filter((e) => e >= lo && e <= hi), (e) => `10${sup(e)}`);
    $('c1Title').textContent = T('(5040, X] 中各证据类别的比例（按 log₁₀ n 分箱）', 'SHARE OF EACH EVIDENCE CLASS IN (5040, X] (BINS IN log₁₀ n)');
    meta('c1Meta', [[PAL.ok, 'Lean'], [PAL.cyan, T('定理链', 'chain')], [VIOLET, T('最优 + 阈值', 'optimum')], [PAL.magenta, T('边', 'edge')], [PAL.dim, T('数值', 'numbers')]]); }
  { const F = frame2d(cv2, 40); if (F.iw < 60 || F.ih < 40) return;
    const { ctx, dpr, pl, pt, iw, ih } = F, rows = PREFIX.slice(0, 25), all = rows.flatMap((r) => [r.llT, r.llN]), y0 = Math.min(...all) - 0.2, y1 = Math.max(...all) + 0.2;
    const X = (k) => pl + (k - 1) / (rows.length - 1) * iw, Y = (v) => pt + ih - (v - y0) / (y1 - y0) * ih;
    yTicks(ctx, dpr, pl, Y, niceTicks(y0, y1, 3), (v) => v.toFixed(1)); xTicks(ctx, dpr, pt, ih, X, [1, 5, 10, 15, 20, 25], (k) => `k=${k}`);
    const line = (sel, col) => { ctx.strokeStyle = col; ctx.lineWidth = 1.4 * dpr; ctx.beginPath(); rows.forEach((r, i) => (i ? ctx.lineTo(X(r.k), Y(sel(r))) : ctx.moveTo(X(r.k), Y(sel(r))))); ctx.stroke(); ctx.lineWidth = 1; };
    line((r) => r.llT, PAL.amber); line((r) => r.llN, PAL.cyan);
    $('c2Title').textContent = T('第 k 个前缀族：危险范围上端 e^{−γ}M_k 与素数阶乘的 log log', 'k-TH PREFIX FAMILY: TOP OF THE DANGER RANGE e^{−γ}M_k AND log log OF THE PRIMORIAL');
    meta('c2Meta', [[PAL.amber, 'e^{−γ}M_k'], [PAL.cyan, 'log log p_k#']]); }
}
function drawCharts() {
  if (St.mode === 'lattice') { drawLatticeMain(); drawLatticeSide(); }
  else if (St.mode === 'kappa') drawKappa();
  else if (St.mode === 'fibre') drawFibre();
  else if (St.mode === 'face') drawFace();
  else drawCover();
}

/* =====================================================================
   10. Readouts and controls
   ===================================================================== */
function setRo(rows) {
  for (let i = 0; i < 6; i++) { const r = rows[i]; $(`ro${i + 1}L`).textContent = r ? r[0] : ''; $(`ro${i + 1}`).innerHTML = r ? r[1] : ''; $(`ro${i + 1}`).parentElement.hidden = !r; }
}
function pill(id, label, value) { $(id).innerHTML = `${label} <strong>${value}</strong>`; }
const coverStats = (Cv) => {
  const cert = Cv.counts.lean + Cv.counts.chain + Cv.counts.bound + Cv.counts.edge;
  const sumOmega = (pred) => Object.entries(Cv.byOmega).filter(([w]) => pred(+w)).reduce((s, [, o]) => s + o.num + o.fail, 0);
  return { cert, numLe5: sumOmega((w) => w <= 5), numGe6: sumOmega((w) => w >= 6) };
};
function readouts() {
  if (St.mode === 'cover') {
    const X = Math.round(10 ** St.xExp), Cv = coverage(X), st = coverStats(Cv), pc = (k) => `${(100 * Cv.counts[k] / Cv.total).toFixed(2)}%`;
    setRo([[T('整数个数 (5040, X]', 'integers in (5040, X]'), `${Cv.total}`], [T('有证书', 'certified'), `${(100 * st.cert / Cv.total).toFixed(3)}%`], ['Lean', pc('lean')], [T('定理链 + 最优', 'chain + optimum'), `${pc('chain')} + ${pc('bound')}`], [T('边规则', 'edge rule'), pc('edge')], [T('只有数值（ω ≤ 5 / ω ≥ 6）', 'numbers only (ω ≤ 5 / ω ≥ 6)'), `${st.numLe5} / ${st.numGe6}`]]);
    $('certNote').innerHTML = T(`只有数值的整数里，ω ≤ 5 的全在 5041–5599 之间（压缩数 ≤ 5040、又在阈值 5600 以下）；ω ≥ 6 的才是真正的前沿${Cv.firstOmega6Num ? `，最小的是 <b>${Cv.firstOmega6Num}</b> = ${fmtFac(factor(Cv.firstOmega6Num))}` : ''}。数值上它们全都满足 Robin，只是没有证书。`,
      `Among integers with numbers only, those with ω ≤ 5 all lie in 5041–5599 (compression ≤ 5040, below the threshold 5600); those with ω ≥ 6 are the real frontier${Cv.firstOmega6Num ? `, the smallest being <b>${Cv.firstOmega6Num}</b> = ${fmtFac(factor(Cv.firstOmega6Num))}` : ''}. Numerically all of them satisfy Robin’s inequality; they only lack a certificate.`);
    $('roAside').textContent = `X = ${X.toLocaleString('en-US')}`;
    pill('pillA', 'X', X.toLocaleString('en-US')); pill('pillB', T('有证书', 'certified'), `${(100 * st.cert / Cv.total).toFixed(3)}%`); pill('pillC', T('前沿 ω ≥ 6', 'frontier ω ≥ 6'), String(st.numGe6));
    return;
  }
  const I = info(St.n);
  $('roAside').textContent = `n = ${St.n}`;
  const evidence = [T('证据', 'evidence'), `<span style="color:${CAT_CSS[I.cat]}">${catName(I.cat)}</span>`];
  const rows = [[T('n 的分解', 'factorization of n'), `${St.n} = ${fmtFac(I.f)}`], ['σ(n)/n', `${sigmaFraction(I.f)} <small>≈ ${num(I.Z, 5)}</small>`], [T('容量 e^γ log log n', 'capacity e^γ log log n'), num(I.cap, 5)], [T('余量 M(n)', 'margin M(n)'), num(I.M, 5)]];
  if (St.mode === 'lattice') rows.push([T('AURIC 位置 · κ', 'AURIC position · κ'), `(${I.U},${I.V},${I.W}) κ=${I.kappa}`], evidence);
  if (St.mode === 'kappa') rows.push([T('κ 纤维成员', 'κ fibre members'), kappaFibre(St.n).members.map((m) => `${m.n}`).join(' · ')], evidence);
  if (St.mode === 'fibre') { const Fb = primeFibre(St.n, St.q); rows.push([T(`首层检验 ×${St.q}`, `first layer ×${St.q}`), `${sci(Fb.first.lhs)} ${Fb.first.pass ? '≤' : '>'} ${sci(Fb.first.rhs)}`], [T('增量 Z(nq)/Z(n) − 1', 'excess Z(nq)/Z(n) − 1'), `1/(${St.q}·σ(${St.q}${sup(Fb.a)})) = ${sci(Fb.first.excess)}`]); }
  if (St.mode === 'face') { const Fc = face(St.n, St.p, St.fq); rows.push([T('C 的混合差 = log log 的混合差', 'mixed difference of C = of log log'), `${sci(Fc.mixed)} = ${sci(Fc.gmix)}`], [T('面损失与界', 'face loss and bounds'), `${sci(Fc.lo)} ≤ ${sci(Fc.loss)} ≤ ${sci(Fc.hi)}`]); }
  setRo(rows);
  let note = certText(I);
  if (St.mode === 'fibre') {
    const Fb = primeFibre(St.n, St.q);
    note += ' ' + (Fb.theorem ? T(`首层通过且 n 已着色、log n ≥ 3：<code>robinAt_mul_prime_pow</code> 推出整条纤维 ${St.n}·${St.q}ᵏ 都满足 Robin。`, `The first layer passes, n is coloured and log n ≥ 3: <code>robinAt_mul_prime_pow</code> gives Robin’s inequality on the whole fibre ${St.n}·${St.q}ᵏ.`)
      : Fb.first.pass ? T('首层通过，但起点没有证书，纤维定理用不上。', 'The first layer passes, but the start has no certificate, so the fibre theorem does not apply.')
        : T(`首层不通过：纤维定理用不上。真实余量见右图——第 1 层的 C 仍为 ${num(Fb.layers[1].C, 3)}。`, `The first layer fails: the fibre theorem does not apply. The actual margin is in the side chart; layer 1 still has C = ${num(Fb.layers[1].C, 3)}.`));
  }
  if (St.mode === 'face') { const Fc = face(St.n, St.p, St.fq); note += ' ' + T(`四角乘积 Z(n)Z(npq) − Z(np)Z(nq) = ${sci(Fc.product)}（精确为 0，此为舍入）；所以三个角都安全时，第四个角还要再付 ${sci(Fc.loss)}。`, `Corner product Z(n)Z(npq) − Z(np)Z(nq) = ${sci(Fc.product)} (exactly 0; this is rounding); so with three safe corners the fourth still pays ${sci(Fc.loss)}.`); }
  if (St.mode === 'lattice' && !MODEL.index.has(St.n)) note += ' ' + (I.cat === 'chain' && MODEL.index.has(I.c) ? T(`n 不在格点框里；高亮的是它的压缩数 ${I.c}。`, `n is outside the lattice box; the highlighted vertex is its compression ${I.c}.`) : T('n 不在当前格点框里。', 'n is outside the current lattice box.'));
  $('certNote').innerHTML = note;
  pill('pillA', 'n', String(St.n)); pill('pillB', T('证据', 'evidence'), catShort(I.cat)); pill('pillC', 'M(n)', num(I.M, 4));
}
function hud() {
  const I = info(St.n);
  $('hudBig').textContent = { lattice: T('格点 · AURIC 投影', 'LATTICE · AURIC PROJECTION'), kappa: T('κ 纤维', 'κ FIBRE'), fibre: T(`素数纤维 ×${St.q}`, `PRIME FIBRE ×${St.q}`), face: T(`面 ×${St.p} × ×${St.fq}`, `FACE ×${St.p} × ×${St.fq}`), cover: T('覆盖', 'COVERAGE') }[St.mode];
  $('hudSub').textContent = St.mode === 'cover' ? T('格点颜色不变；覆盖统计见下方两图与右侧读数。', 'The lattice colours are unchanged; coverage is in the two charts and the readouts.')
    : T(`n = ${St.n} · ${catName(I.cat)} · 位置 (a₂ + a₇, a₃, a₅ + a₇)，κ = a₇ 沿纤维错开`, `n = ${St.n} · ${catName(I.cat)} · position (a₂ + a₇, a₃, a₅ + a₇), κ = a₇ offset along the fibre`);
}
const MODE_NOTES = {
  lattice: ['点按证据着色；点击顶点或在上方输入 n 来选中。边连接 ×2、×3、×5、×7；“边检验”配色显示每条边是否通过 Lean 边规则的浮点检验（青＝通过，品红＝不过）。', 'Points are coloured by evidence; click a vertex or type n above to select it. Edges join ×2, ×3, ×5, ×7; the “edge test” colouring shows whether each edge passes the floating-point check of the Lean edge rule (cyan pass, magenta fail).'],
  kappa: ['同一 AURIC 位置上的整数只差 κ = a₇：多一个 7、少一个 2 和一个 5，整数乘 7/10。', 'Integers at one AURIC position differ only in κ = a₇: one more 7 and one fewer 2 and 5 multiplies the integer by 7/10.'],
  fibre: ['沿 n·qᵏ 逐层做边检验。Lean 定理：只要首层通过（且 n 已着色、log n ≥ 3），每一层都通过。', 'The edge test layer by layer along n·qᵏ. Lean theorem: once the first layer passes (with n coloured and log n ≥ 3), every layer passes.'],
  face: ['n、np、nq、npq 构成一块面。四角乘积恒等，混合差只来自 log log 的凹性。', 'n, np, nq, npq form a face. The corner product is an identity, so the mixed difference comes only from the concavity of log log.'],
  cover: ['统计 (5040, X] 的每个整数；X 越大越慢（10⁶ 约一秒）。', 'Counts every integer in (5040, X]; larger X is slower (10⁶ takes about a second).']
};
function syncOutputs() {
  const key = stateKey();
  if (key === syncedKey && !dirty) return;
  syncedKey = key; dirty = false;
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === St.mode)));
  document.querySelectorAll('#sliceChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.slice === St.slice)));
  document.querySelectorAll('#edgeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.edge === St.edge)));
  document.querySelectorAll('#qChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.q === St.q)));
  document.querySelectorAll('#pChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.p === St.p)));
  document.querySelectorAll('#fqChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.fq === St.fq)));
  $('qField').hidden = St.mode !== 'fibre'; $('faceField').hidden = St.mode !== 'face'; $('xField').hidden = St.mode !== 'cover';
  $('oX').textContent = Math.round(10 ** St.xExp).toLocaleString('en-US');
  $('xx').value = String(St.xExp);
  $('modeNote').textContent = T(...MODE_NOTES[St.mode]);
  $('presetNote').innerHTML = St.preset ? T(PRESETS[St.preset].zh, PRESETS[St.preset].en) : T('自定义设置。', 'Custom settings.');
  readouts(); hud(); drawCharts();
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === St.preset))); }
function custom() { St.preset = null; markPreset(); dirty = true; }
function selectN(n) { St.n = n; $('nInput').value = String(n); $('nErr').textContent = ''; dirty = true; }
function parseN(text) {
  const t = String(text).replace(/[\s,_]/g, '');
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t); return Number.isSafeInteger(n) && n >= 2 && n <= N_MAX ? n : null;
}
function goN() {
  const n = parseN($('nInput').value);
  if (n === null) { $('nErr').textContent = T('请输入 2 到 10¹² 之间的整数。', 'Enter an integer between 2 and 10¹².'); return; }
  selectN(n); custom();
}
$('nGo').addEventListener('click', goN);
$('nInput').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') goN(); });
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => { St.mode = b.dataset.mode; custom(); }));
document.querySelectorAll('#sliceChips .chip').forEach((b) => b.addEventListener('click', () => { St.slice = +b.dataset.slice; rebuild(); custom(); }));
document.querySelectorAll('#edgeChips .chip').forEach((b) => b.addEventListener('click', () => { St.edge = b.dataset.edge; custom(); }));
document.querySelectorAll('#qChips .chip').forEach((b) => b.addEventListener('click', () => { St.q = +b.dataset.q; custom(); }));
document.querySelectorAll('#pChips .chip').forEach((b) => b.addEventListener('click', () => { St.p = +b.dataset.p; if (St.fq === St.p) St.fq = [3, 5, 7, 11].find((x) => x !== St.p); custom(); }));
document.querySelectorAll('#fqChips .chip').forEach((b) => b.addEventListener('click', () => { St.fq = +b.dataset.fq; if (St.fq === St.p) St.p = [2, 3, 5, 7].find((x) => x !== St.fq); custom(); }));
$('xx').addEventListener('input', () => { St.xExp = Math.min(6, Math.max(4, Math.round(parseFloat($('xx').value) * 4) / 4)); custom(); });
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const P = PRESETS[name]; if (!P) return;
  St.preset = name; St.mode = P.mode;
  for (const k of ['slice', 'edge', 'q', 'p', 'fq', 'xExp']) if (P[k] !== undefined) St[k] = P[k];
  if (P.n !== undefined) selectN(P.n);
  if (MODEL === null || MODEL.slice !== St.slice) rebuild();
  markPreset(); dirty = true;
  const toastText = {
    core: T('<b>5040</b>：Z = 403/105 高出容量，是判据排除的端点。', '<b>5040</b>: Z = 403/105 exceeds the capacity; the endpoint the criterion excludes.'),
    fibre: T('首层通过 ⇒ 整条纤维 <b>10080·11ᵏ</b> 满足 Robin（Lean）。', 'First layer passes ⇒ the whole fibre <b>10080·11ᵏ</b> satisfies Robin (Lean).'),
    fail: T('检验不过，<b>301840</b> 的比值仍只有 0.655。', 'The test fails, yet <b>301840</b> has ratio 0.655.'),
    cover: T('前沿：不同素因子 ≥ 6 的整数。', 'The frontier: integers with six or more distinct primes.')
  }[name];
  if (toastText) TRV.toast($('toast'), toastText, 3600);
}
document.querySelectorAll('.preset').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
document.addEventListener('keydown', (ev) => {
  if (ev.target && ev.target.tagName === 'INPUT') return;
  const k = MODES.indexOf(St.mode);
  if (ev.key === 'ArrowRight') { St.mode = MODES[(k + 1) % MODES.length]; custom(); }
  else if (ev.key === 'ArrowLeft') { St.mode = MODES[(k + MODES.length - 1) % MODES.length]; custom(); }
});

/* =====================================================================
   11. Frame loop, probe, thumbnail
   ===================================================================== */
TRV.startGlitch($('app'));
TRV.drawer({ drawer: $('drawer'), open: $('infoBtn'), close: $('drawerClose') });
let lastT = performance.now();
function resize() {
  if (glOK) { const r = stage.getBoundingClientRect(); renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false); camera.aspect = Math.max(0.2, r.width / Math.max(1, r.height)); camera.updateProjectionMatrix(); }
  dirty = true;
}
function frame(tms) {
  frameCount++;
  const dtSec = Math.min(0.1, (tms - lastT) / 1000); lastT = tms;
  syncOutputs();
  if (glOK) { updateCamera(dtSec); updateGL(); renderer.render(scene3, camera); updateTags(); }
  requestAnimationFrame(frame);
}
TRV.onLang(() => { syncedKey = ''; dirty = true; });
new ResizeObserver(() => { dirty = true; }).observe(cv1);
new ResizeObserver(() => { dirty = true; }).observe(cv2);

/* read-only probe for automated browser tests */
window.RL_DEBUG = {
  pending: () => dirty || syncedKey !== stateKey(),
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(St)),
  info: (n) => { const I = info(n ?? St.n); return { n: I.n, f: I.f, Z: I.Z, cap: I.cap, M: I.M, C: I.C, omega: I.omega, U: I.U, V: I.V, W: I.W, kappa: I.kappa, cat: I.cat, rule: I.rule, c: I.c ?? null, base: I.base ?? null, steps: I.steps ?? null, from: I.from ?? null, p: I.p ?? null, r: I.r ?? null, frac: sigmaFraction(I.f) }; },
  factor: (n) => factor(n),
  compression: (n) => compression(factor(n)),
  kappaFibre: (n) => kappaFibre(n ?? St.n),
  primeFibre: (n, q) => { const F = primeFibre(n ?? St.n, q ?? St.q); return { a: F.a, theorem: F.theorem, allPass: F.allPass, layers: F.layers, startCat: F.startCls.cat }; },
  face: (n, p, q) => face(n ?? St.n, p ?? St.p, q ?? St.fq),
  relaxation: (P, L) => relaxation(P, L),
  prefix: () => PREFIX,
  coverage: (X) => { const C = coverage(X); return { X: C.X, total: C.total, counts: C.counts, byOmega: C.byOmega, frontier: C.frontier.slice(0, 50), firstOmega6Num: C.firstOmega6Num, stats: coverStats(C) }; },
  lattice: () => ({ slice: MODEL.slice, verts: MODEL.verts.map((v) => ({ n: v.n, e: v.e, U: v.U, V: v.V, W: v.W, kappa: v.kappa, cat: v.cls.cat, pos: v.pos })), edges: MODEL.edges.map((e) => ({ a: e.a.n, b: e.b.n, p: e.p, pass: e.test ? e.test.pass : null })) }),
  screenOf: (n) => { if (!glOK || !MODEL.index.has(n)) return null; const q = proj3(MODEL.verts[MODEL.index.get(n)].pos), r = stage.getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; },
  selectedVertex: () => selectedVertex(),
  focus: () => [...focusSet()].sort((a, b) => a - b),
  edgeTest: (logN, p, a, r) => edgeTest(logN, p, a, r)
};
window.TRV_THUMB = () => { applyPreset('core'); setCamPreset('iso'); };

initGL();
rebuild();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('core');
requestAnimationFrame(frame);
})();
