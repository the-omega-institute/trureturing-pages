/* EXPLICIT//FORMULA · 显式公式 · 用 ζ 的零点重建素数
   The explicit formula with the first 10 000 zeros of ζ (Odlyzko's table, zeros.js): von Mangoldt's formula for ψ(x); Weil's form
   Σ_ρ ĝ(γ) = ĝ(i/2) + ĝ(−i/2) − Σ Λ(n) n^(−1/2) (g(log n) + g(−log n)) + archimedean term, with bump test functions
   φ(u) = exp(−1/(1 − u²)); a prime detector from bumps at ±a; Weil squares g = f ∗ f with every zero term ≥ 0; a hypothetical
   off-line pair 1/2 ± δ + iγ₁; and the zero count N(T) against θ(T)/π + 1. The archimedean term is computed in x-space,
   −(γ_E + log π) g(0) + 2∫₀^∞ [e^(−2x) g(0) − e^(−x/2) g(x)] / (1 − e^(−2x)) dx, which equals (1/2π)∫ ĝ(t)(Re Γ′/Γ(1/4 + it/2) − log π) dt.
   Frozen Lean anchors and literature results are named in the page text. Depends on: assets/vendor/three.r128.min.js, assets/shell.js, zeros.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants and data
   ===================================================================== */
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, ok: OK, cyan: CY, magenta: MG } = TRV.palette;
const MODES = ['psi', 'spikes', 'balance', 'square', 'offline', 'count'];
const RUN_SECONDS = 16, NF = 400, EULER = 0.5772156649015329;
const A_MIN = 0.35, A_MAX = Math.log(40), NA = 900, NS = 2000;
const DELTA_MAX = 0.05, ND = 300;
const L_RANGE = { balance: [0.5, 6, 3], square: [0.3, 3, 1], offline: [2, 4, 3] };
const ZEROS = (() => { const parts = String(window.EF_ZEROS_B36 || '').split(','), z = new Float64Array(parts.length); let acc = 0; for (let i = 0; i < parts.length; i++) { acc += parseInt(parts[i], 36); z[i] = acc / 1e9; } return z; })();
const NZ = ZEROS.length, T_MAX = NZ ? ZEROS[NZ - 1] : 1;

/* von Mangoldt Λ(n) for n ≤ 3000 (enough for every test function on the page: supports reach e^8 ≈ 2981) */
const NMAX = 3000, LAMBDA = new Float64Array(NMAX + 1);
(() => { const comp = new Uint8Array(NMAX + 1); for (let p = 2; p <= NMAX; p++) if (!comp[p]) { for (let q = p * p; q <= NMAX; q += p) comp[q] = 1; for (let pk = p; pk <= NMAX; pk *= p) LAMBDA[pk] = Math.log(p); } })();
const PRIME_POWERS = []; for (let n = 2; n <= NMAX; n++) if (LAMBDA[n] > 0) PRIME_POWERS.push(n);
const isPrime = (n) => LAMBDA[n] > 0 && Math.abs(Math.exp(LAMBDA[n]) - n) < 1e-6;

/* =====================================================================
   2. Numerics: the bump, its transform, quadrature, Γ
   ===================================================================== */
const phi = (u) => (u > -1 && u < 1 ? Math.exp(-1 / (1 - u * u)) : 0);
const BM = 512, BH = 1 / BM, BU = Float64Array.from({ length: BM }, (_, i) => phi(i * BH));
/* ∫_{−1}^{1} φ(u) w(u) du for even w: the trapezoid rule is spectrally accurate for a bump that is flat at ±1 */
function bumpEven(w) { let s = 0.5 * BU[0] * w(0); for (let i = 1; i < BM; i++) s += BU[i] * w(i * BH); return 2 * s * BH; }
function bumpAny(w) { let s = BU[0] * w(0); for (let i = 1; i < BM; i++) s += BU[i] * (w(i * BH) + w(-i * BH)); return s * BH; }
/* φ̂(ξ) = ∫ φ(u) e^(−iξu) du; beyond |ξ| = 900 it is below 10⁻¹⁶ and the trapezoid sum would start to alias */
function phiHat(xi) { xi = Math.abs(xi); if (xi > 900) return 0; let s = 0.5 * BU[0]; for (let i = 1; i < BM; i++) s += BU[i] * Math.cos(xi * i * BH); return 2 * s * BH; }
const GLX = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498, 0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
const GLW = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620, 0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
function glInt(f, a, b, panels) { const h = (b - a) / panels; let s = 0; for (let p = 0; p < panels; p++) { const m = a + (p + 0.5) * h; for (let j = 0; j < 8; j++) s += GLW[j] * f(m + 0.5 * h * GLX[j]); } return s * h / 2; }
/* archimedean term of an even real g supported in [−X, X], from its values in x-space */
function archX(g, g0, X, panels) {
  const f = (x) => (Math.exp(-2 * x) * g0 - Math.exp(-x / 2) * g(x)) / -Math.expm1(-2 * x);
  return -(EULER + Math.log(Math.PI)) * g0 + 2 * glInt(f, 0, X, panels) - g0 * Math.log(-Math.expm1(-2 * X));
}
/* Riemann–Siegel θ(t) = Im log Γ(1/4 + it/2) − (t/2) log π: shift to Re ≥ 10, then Stirling */
function theta(t) {
  let x = 0.25, acc = 0; const y = t / 2;
  while (x < 10) { acc -= Math.atan2(y, x); x += 1; }
  const r2 = x * x + y * y; let im = (x - 0.5) * Math.atan2(y, x) + y * 0.5 * Math.log(r2) - y;
  const ir = x / r2, ii = -y / r2, w2r = ir * ir - ii * ii, w2i = 2 * ir * ii; let pr = ir, pi = ii;
  for (const c of [1 / 12, -1 / 360, 1 / 1260, -1 / 1680, 1 / 1188]) { im += c * pi; const nr = pr * w2r - pi * w2i, ni = pr * w2i + pi * w2r; pr = nr; pi = ni; }
  return im + acc - y * Math.log(Math.PI);
}
function countZeros(t) { let lo = 0, hi = NZ; while (lo < hi) { const m = (lo + hi) >> 1; if (ZEROS[m] <= t) lo = m + 1; else hi = m; } return lo; }
const psiExact = (x) => { let s = 0; for (let n = 2; n <= Math.min(NMAX, x); n++) s += LAMBDA[n]; return s; };

/* =====================================================================
   3. State and presets
   ===================================================================== */
const S = { mode: 'spikes', X: 30, eps: 0.06, L: 3, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'spikes' };
const PRESETS = {
  psi30: { mode: 'psi', X: 30,
    zh: '切比雪夫 ψ(x) 在每个素数幂处跳 log p。播放时一对一对加上零点：先只有光滑的 x，再慢慢长出台阶。用到 600 对零点时台阶已经清楚，跳跃处的小振荡是 Gibbs 现象。',
    en: 'Chebyshev’s ψ(x) jumps by log p at every prime power. Playing adds the zeros pair by pair: first only the smooth x, then the steps grow. By 600 pairs the staircase is clear; the ripples at the jumps are the Gibbs phenomenon.' },
  psi100: { mode: 'psi', X: 100,
    zh: '把 x 放到 100，最多用 2000 对零点。x 越大，相邻素数越挤，需要的零点越多（波长约 2πx/γ）。',
    en: 'x up to 100, with up to 2000 pairs of zeros. The larger x, the more crowded the primes and the more zeros are needed (the wavelength is about 2πx/γ).' },
  spikes: { mode: 'spikes', eps: 0.06,
    zh: '素数探测器：检验函数是放在 ±a 的两个宽 ε 的鼓包，素数项 = 极点项 + 阿基米德项 − 零点和。只用零点算出来的曲线，在每个素数幂 p<sup>k</sup> 处长出高约 log p 的尖峰。',
    en: 'A prime detector: the test function is two bumps of width ε at ±a, and prime term = pole term + archimedean term − zero sum. A curve computed from the zeros alone grows a spike of height about log p at every prime power p<sup>k</sup>.' },
  blur: { mode: 'spikes', eps: 0.2,
    zh: 'ε = 0.2：检验函数更宽，它的傅里叶变换衰减得更快，几百个零点就够了；代价是尖峰变宽，挨得近的素数幂糊在一起。',
    en: 'ε = 0.2: a wider test function has a faster-decaying transform, so a few hundred zeros suffice; the price is wider spikes, and nearby prime powers blur together.' },
  balance: { mode: 'balance', L: 3,
    zh: '一个鼓包 g(x) = φ(x/3)。冻结的等式说：零点一侧 = 极点项 − 素数项 + 阿基米德项。三项各有几个单位大，几乎互相抵消；零点部分和随 K 收敛到同一个小数。',
    en: 'One bump g(x) = φ(x/3). The frozen identity says: zero side = pole term − prime term + archimedean term. The three terms are each a few units and almost cancel; the partial zero sums converge to the same small number as K grows.' },
  square: { mode: 'square', L: 1,
    zh: '平方检验函数 g = f ∗ f，f(x) = φ(x)。线上每个零点贡献 f̂(γ)² ≥ 0，所以零点和非负；它等于素数一侧。Weil 判据（已冻结）：所有这样的平方都非负 ⟺ 黎曼猜想。',
    en: 'A square test function g = f ∗ f with f(x) = φ(x). Every zero on the line contributes f̂(γ)² ≥ 0, so the zero sum is nonnegative, and it equals the prime side. Weil’s criterion (frozen): all such squares are nonnegative ⟺ the Riemann hypothesis.' },
  offline: { mode: 'offline', L: 3,
    zh: '假想：第一个零点离开临界线，成对变成 ½ ± δ + iγ₁。取 f(x) = x sin(γ₁x) φ(x/3)。真实零点的贡献加起来只有约 8 × 10⁻⁵，这一对的贡献约为 −3.6δ²，δ 约 0.005 时总和就变负。这是模型，不是事实。',
    en: 'Hypothetical: the first zero leaves the critical line and becomes the pair ½ ± δ + iγ₁. Take f(x) = x sin(γ₁x) φ(x/3). The real zeros contribute only about 8 × 10⁻⁵ in total, the pair about −3.6δ², and the sum turns negative near δ = 0.005. This is a model, not a fact.' },
  count: { mode: 'count',
    zh: '数零点：N(T) 是 0 &lt; γ ≤ T 的零点个数。光滑项 θ(T)/π + 1 几乎完全跟住它，剩下的涨落 S(T) 在这一段始终很小。',
    en: 'Counting zeros: N(T) is the number of zeros with 0 &lt; γ ≤ T. The smooth term θ(T)/π + 1 follows it almost exactly; the remaining fluctuation S(T) stays small throughout this range.' }
};
const kmaxOf = () => (S.mode === 'psi' ? Math.min(2000, 20 * S.X) : NZ);
const kOf = (f, Kmax) => Math.max(0, Math.round(Math.pow(Kmax + 1, Math.min(1, Math.max(0, f)))) - 1);
const qFrac = (f) => Math.floor(Math.min(1, Math.max(0, f)) * NF + 1e-9) / NF;   // the rail is quantized to NF steps

/* =====================================================================
   4. The model
   ===================================================================== */
let MODEL = null, dirty = true;
function buildPsi(M) {
  const X = S.X, Kmax = kmaxOf(); M.Kmax = Kmax;
  M.xs = Float64Array.from({ length: NS }, (_, i) => 1.05 + (X - 1.05) * i / (NS - 1));
  M.exact = M.xs.map(psiExact);
  M.smooth = M.xs.map((x) => x - Math.log(2 * Math.PI) - 0.5 * Math.log(1 - 1 / (x * x)));
  M.KC = Array.from({ length: NF + 1 }, (_, j) => kOf(j / NF, Kmax));
  const run = Float64Array.from(M.smooth), lx = M.xs.map(Math.log), sx = M.xs.map(Math.sqrt);
  M.curves = []; let k = 0;
  for (let j = 0; j <= NF; j++) {
    for (; k < M.KC[j]; k++) { const g = ZEROS[k], d = 0.25 + g * g; for (let i = 0; i < NS; i++) { const a = g * lx[i]; run[i] -= 2 * sx[i] * (0.5 * Math.cos(a) + g * Math.sin(a)) / d; } }
    M.curves.push(Float32Array.from(run));
  }
  let lo = 0, hi = 0; for (const c of M.curves) for (const v of c) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  M.yLo = lo; M.yHi = Math.max(hi, psiExact(X)) * 1.04;
  M.weight = (t) => 2 / Math.sqrt(0.25 + t * t);
  M.wave = (k, x) => { const g = ZEROS[k], a = g * Math.log(x); return -2 * Math.sqrt(x) * (0.5 * Math.cos(a) + g * Math.sin(a)) / (0.25 + g * g); };
  M.xr = [1.05, X];
}
function buildSpikes(M) {
  const eps = S.eps, Kmax = NZ; M.Kmax = Kmax;
  M.as = Float64Array.from({ length: NA }, (_, i) => A_MIN + (A_MAX - A_MIN) * i / (NA - 1));
  const J = bumpEven((u) => Math.cosh(eps * u / 2));
  M.pole = M.as.map((a) => 4 * eps * Math.cosh(a / 2) * J);
  M.arch = M.as.map((a) => -2 * eps * bumpAny((u) => { const x = a + eps * u; return Math.exp(-x / 2) / -Math.expm1(-2 * x); }));
  M.prime = M.as.map((a) => { let s = 0; for (const n of PRIME_POWERS) { const u = (Math.log(n) - a) / eps; if (u >= 1) break; if (u > -1) s += 2 * LAMBDA[n] / Math.sqrt(n) * phi(u); } return s; });
  M.scale = M.as.map((a) => Math.E * Math.exp(a / 2) / 2);
  M.w = Float64Array.from(ZEROS, (g) => 4 * eps * phiHat(eps * g));
  M.KC = Array.from({ length: NF + 1 }, (_, j) => kOf(j / NF, Kmax));
  const run = new Float64Array(NA); M.zeroCurves = []; let k = 0;
  for (let j = 0; j <= NF; j++) {
    for (; k < M.KC[j]; k++) { const w = M.w[k], g = ZEROS[k]; if (w === 0) continue; for (let i = 0; i < NA; i++) run[i] += w * Math.cos(M.as[i] * g); }
    M.zeroCurves.push(Float64Array.from(run));
  }
  M.target = M.prime.map((v, i) => v * M.scale[i]);
  M.curves = M.zeroCurves.map((z) => Float32Array.from(z, (v, i) => (M.pole[i] + M.arch[i] - v) * M.scale[i]));
  let lo = 0, hi = 0; for (const c of M.curves) for (const v of c) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  M.yLo = Math.max(-2, lo); M.yHi = Math.max(hi, ...M.target) * 1.04;
  const zl = M.zeroCurves[NF]; M.idErr = 0; for (let i = 0; i < NA; i++) M.idErr = Math.max(M.idErr, Math.abs(zl[i] - (M.pole[i] - M.prime[i] + M.arch[i])) * M.scale[i]);
  M.weight = (t) => 4 * eps * phiHat(eps * t);
  M.wave = (k, a) => -M.w[k] * Math.cos(a * ZEROS[k]) * Math.E * Math.exp(a / 2) / 2;
  M.xr = [A_MIN, A_MAX];
}
function cumulate(M, w) { M.w = w; M.cum = new Float64Array(NZ + 1); for (let k = 0; k < NZ; k++) M.cum[k + 1] = M.cum[k] + w[k]; M.Kmax = NZ; }
function buildBalance(M) {
  const L = S.L, g = (x) => phi(x / L), g0 = Math.exp(-1);
  cumulate(M, Float64Array.from(ZEROS, (t) => 2 * L * phiHat(L * t)));
  M.pole = 2 * L * bumpEven((u) => Math.cosh(L * u / 2));
  M.prime = 0; M.primeList = [];
  for (const n of PRIME_POWERS) { const u = Math.log(n) / L; if (u >= 1) break; const v = 2 * LAMBDA[n] / Math.sqrt(n) * phi(u); M.prime += v; M.primeList.push([n, v]); }
  M.arch = archX(g, g0, L, 96); M.rhs = M.pole - M.prime + M.arch;
  M.g = g; M.gSupport = L; M.weight = (t) => 2 * L * phiHat(L * t);
}
function buildSquare(M) {
  const L = S.L, fh = (t) => L * phiHat(L * t);
  const gConv = (y) => { const v = Math.abs(y) / L; if (v >= 2) return 0; let s = 0; for (let i = -BM + 1; i < BM; i++) { const u = i * BH; s += phi(u) * phi(v - u); } return L * s * BH; };
  cumulate(M, Float64Array.from(ZEROS, (t) => 2 * fh(t) ** 2));
  const fi = L * bumpEven((u) => Math.cosh(L * u / 2));
  M.pole = 2 * fi * fi;
  const g0 = gConv(0); M.prime = 0; M.primeList = [];
  for (const n of PRIME_POWERS) { const y = Math.log(n); if (y >= 2 * L) break; const v = 2 * LAMBDA[n] / Math.sqrt(n) * gConv(y); M.prime += v; M.primeList.push([n, v]); }
  M.arch = archX(gConv, g0, 2 * L, 64); M.rhs = M.pole - M.prime + M.arch;
  M.g = gConv; M.gSupport = 2 * L; M.weight = (t) => 2 * fh(t) ** 2;
}
const MO = 2048;
function buildOffline(M) {
  const L = S.L, g1 = ZEROS[0], h = L / MO, f = (x) => x * Math.sin(g1 * x) * phi(x / L);
  const FX = Float64Array.from({ length: MO + 1 }, (_, i) => f(i * h));
  /* f̂(z) = 2∫₀^L f(x) cos(zx) dx at z = t − i·dl: cos(tx − i·dl·x) = cos(tx)cosh(dl·x) + i sin(tx)sinh(dl·x) */
  const fhatC = (t, dl) => { let re = 0, im = 0; for (let i = 1; i < MO; i++) { const x = i * h; re += FX[i] * Math.cos(t * x) * Math.cosh(dl * x); im += FX[i] * Math.sin(t * x) * Math.sinh(dl * x); } return [2 * re * h, 2 * im * h]; };
  const fh = (t) => (Math.abs(Math.abs(t) - g1) * L > 900 ? 0 : fhatC(t, 0)[0]);
  cumulate(M, Float64Array.from(ZEROS, (t) => 2 * fh(t) ** 2));
  M.Son = M.cum[NZ]; M.own = M.w[0];
  M.pairAt = (dl) => { const [a, b] = fhatC(g1, dl); return 4 * (a * a - b * b); };   // 4 Re f̂(γ₁ − iδ)²
  M.ds = Float64Array.from({ length: ND + 1 }, (_, i) => DELTA_MAX * i / ND);
  M.P = M.ds.map(M.pairAt); M.W = M.P.map((p) => M.Son - M.own + p);
  let cross = null; for (let i = 1; i <= ND; i++) if (M.W[i - 1] > 0 && M.W[i] <= 0) { let lo = M.ds[i - 1], hi = M.ds[i]; for (let it = 0; it < 50; it++) { const mid = (lo + hi) / 2; if (M.Son - M.own + M.pairAt(mid) > 0) lo = mid; else hi = mid; } cross = (lo + hi) / 2; break; }
  M.cross = cross;
  /* the prime side of the real data: g = f ∗ f, computed by the trapezoid rule on the same grid */
  const gConv = (y) => { y = Math.abs(y); if (y >= 2 * L) return 0; let s = 0; for (let i = -MO + 1; i < MO; i++) { const x = i * h, u = y - x; if (u <= -L || u >= L) continue; s += (i < 0 ? FX[-i] : FX[i]) * f(u); } return s * h; };
  const fi = 2 * (() => { let s = 0; for (let i = 1; i < MO; i++) s += FX[i] * Math.cosh(i * h / 2); return s * h; })();
  M.pole = 2 * fi * fi; const g0 = gConv(0); M.prime = 0; M.primeList = [];
  for (const n of PRIME_POWERS) { const y = Math.log(n); if (y >= 2 * L) break; const v = 2 * LAMBDA[n] / Math.sqrt(n) * gConv(y); M.prime += v; M.primeList.push([n, v]); }
  M.arch = archX(gConv, g0, 2 * L, 160); M.rhs = M.pole - M.prime + M.arch;
  M.g = gConv; M.gSupport = 2 * L; M.weight = (t) => 2 * fh(t) ** 2; M.fhat = fh;
}
function build() {
  const M = { mode: S.mode };
  if (S.mode === 'psi') buildPsi(M); else if (S.mode === 'spikes') buildSpikes(M); else if (S.mode === 'balance') buildBalance(M);
  else if (S.mode === 'square') buildSquare(M); else if (S.mode === 'offline') buildOffline(M);
  MODEL = M;
}
/* where the rail stands: the number of zeros, the offset δ, or the height T */
function progress() {
  const M = MODEL, f = S.nowFrac;
  if (M.mode === 'offline') { const d = DELTA_MAX * f * f; return { d, P: M.pairAt(d), W: M.Son - M.own + M.pairAt(d) }; }
  if (M.mode === 'count') { const t = T_MAX * f * f; return { t, N: countZeros(t), sm: t > 0 ? theta(t) / Math.PI + 1 : 0 }; }
  const j = Math.round(qFrac(f) * NF);
  if (M.KC) return { j, K: M.KC[j] };
  const K = kOf(qFrac(f), M.Kmax); return { K, zero: M.cum[K] };
}

/* =====================================================================
   5. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const sci = (v, d = 3) => (v === null || v === undefined || !isFinite(v) ? '—' : v === 0 ? '0' : Math.abs(v) < 1e-3 || Math.abs(v) >= 1e5 ? v.toExponential(d - 1) : v.toFixed(d + 2));
const num = (v, d = 6) => (v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(d));
const sub = (k) => String(k).split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c]).join('');

/* =====================================================================
   6. 3D scene: the critical strip, the zeros and their stems, one wave per zero, and the front panel
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 60000, PTS_MAX = 10200;
const SX0 = -4.2, SX1 = -2.2, SXH = -3.2, DEPTH = 9, RX0 = -1.6, RX1 = 4.8, FRONT_Z = 0.5, N_WAVES = 22, STEM_H = 2.2;
const CAMS = { iso: [0.62, 1.1, 15.5], front: [0.0001, 1.45, 15.5], top: [0.0001, 0.06, 15.5] };
const cam = { theta: 0.62, phi: 1.1, r: 15.5, tTheta: 0.62, tPhi: 1.1, tR: 15.5 };
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
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
  float a = (smoothstep(1.0, 0.2, r) * 0.8 + smoothstep(0.35, 0.0, r)) * vA;
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
const tView = () => (MODEL.mode === 'count' ? Math.max(30, progress().t) : 100);
const zDepth = (t) => -t / tView() * DEPTH;
const xRib = (x) => RX0 + (x - MODEL.xr[0]) / (MODEL.xr[1] - MODEL.xr[0]) * (RX1 - RX0);
function updateGL() {
  const M = MODEL, pr = progress(), K = pr.K ?? 0, tv = tView();
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp[3 * v] = a[0]; Pp[3 * v + 1] = a[1]; Pp[3 * v + 2] = a[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; Pp[3 * v] = b[0]; Pp[3 * v + 1] = b[1]; Pp[3 * v + 2] = b[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; };
  const poly = (P, col, k) => { for (let i = 1; i < P.length; i++) seg(P[i - 1], P[i], col, k); };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  // the critical strip 0 ≤ σ ≤ 1, its centre line σ = 1/2 and height marks
  const zb = -DEPTH;
  seg([SX0, 0, 0], [SX0, 0, zb], COL.gray, 0.35); seg([SX1, 0, 0], [SX1, 0, zb], COL.gray, 0.35); seg([SX0, 0, 0], [SX1, 0, 0], COL.gray, 0.35); seg([SX0, 0, zb], [SX1, 0, zb], COL.gray, 0.2);
  seg([SXH, 0, 0], [SXH, 0, zb], COL.amber, 0.45);
  for (let q = 1; q < 5; q++) { const z = zb * q / 5; seg([SX0, 0, z], [SX1, 0, z], COL.gray, 0.1); }
  const nShow = countZeros(tv);
  if (M.mode === 'count') {
    for (let k = 0; k < nShow; k++) dot([SXH, 0, zDepth(ZEROS[k])], COL.cyan, nShow > 2000 ? 0.35 : 0.8, nShow > 2000 ? 0.5 : nShow > 300 ? 0.8 : 1.4);
    // N(t) as a staircase rising with depth, θ(t)/π + 1 beside it, and the fluctuation S(t) as a ribbon
    const step = Math.max(1, Math.floor(nShow / 1200)), hN = (n) => 2.2 * n / Math.max(1, nShow), Pn = [[RX0, 0, 0]], Ps = [], Pth = [];
    for (let k = 0; k < nShow; k += step) { const z = zDepth(ZEROS[k]); Pn.push([RX0, hN(k), z], [RX0, hN(k + 1), z]); const th = theta(ZEROS[k]) / Math.PI + 1; Ps.push([RX1 - 1.2, 1.2 + 0.45 * (k + 0.5 - th), z]); }
    for (let i = 0; i <= 200; i++) { const t = tv * i / 200; Pth.push([RX0 + 0.25, t > 0 ? hN(Math.max(0, theta(t) / Math.PI + 1)) : 0, zDepth(t)]); }
    Pn.push([RX0, hN(nShow), zDepth(tv)]);
    poly(Pn, COL.cyan, 0.9); poly(Pth, COL.amber, 0.6); poly(Ps, COL.magenta, 0.7);
    seg([RX1 - 1.2, 1.2, 0], [RX1 - 1.2, 1.2, zDepth(tv)], COL.gray, 0.25);
  } else {
    // the weight of each zero in the current formula, as a stem, and the weight function along the line (computed once per model)
    if (!M.vis) { const tw = Array.from({ length: 261 }, (_, i) => tv * i / 260); M.vis = { tw, cw: tw.map(M.weight), sw: Array.from({ length: nShow }, (_, k) => M.weight(ZEROS[k])) }; }
    // heights on a signed logarithmic scale spanning 12 decades below the largest weight on the curve
    let wmax = 1e-300; for (const w of M.vis.cw) wmax = Math.max(wmax, Math.abs(w));
    if (M.mode === 'offline') wmax = Math.max(wmax, Math.abs(pr.P));
    const top = Math.log10(wmax), hs = (w) => Math.sign(w) * Math.max(0, Math.log10(Math.abs(w) + 1e-300) - top + 12) / 12 * STEM_H;
    poly(M.vis.tw.map((t, i) => [SXH, hs(M.vis.cw[i]), zDepth(t)]), COL.amber, 0.32);
    const active = M.mode === 'offline' ? NZ : K;
    for (let k = 0; k < nShow; k++) {
      if (M.mode === 'offline' && k === 0) continue;
      const z = zDepth(ZEROS[k]), h = hs(M.vis.sw[k]), on = k < active;
      seg([SXH, 0, z], [SXH, h, z], on ? (h < 0 ? COL.magenta : COL.cyan) : COL.gray, on ? 0.85 : 0.25);
      dot([SXH, 0, z], on ? COL.cyan : COL.gray, on ? 0.9 : 0.4, 1.3);
    }
    if (M.mode === 'offline') {   // the hypothetical pair 1/2 ± δ + iγ₁, σ drawn 20× wider
      const z = zDepth(ZEROS[0]), dx = 20 * pr.d * (SX1 - SX0), h = hs(pr.P / 2);
      for (const s of [-1, 1]) { seg([SXH + s * dx, 0, z], [SXH + s * dx, h, z], COL.magenta, 0.95); dot([SXH + s * dx, 0, z], COL.magenta, 1, 1.9); }
      dot([SXH, 0, z], COL.gray, 0.3, 1.1);
    }
  }
  // one wave per zero (ψ and spikes), laid at the depth of its zero
  if (M.mode === 'psi' || M.mode === 'spikes') {
    const nw = Math.min(N_WAVES, nShow), NP = 220;
    if (!M.waves) { const xs = Array.from({ length: NP + 1 }, (_, i) => M.xr[0] + (M.xr[1] - M.xr[0]) * i / NP); let amax = 1e-300; const ws = []; for (let k = 0; k < nw; k++) { const w = xs.map((x) => M.wave(k, x)); ws.push(w); for (const y of w) amax = Math.max(amax, Math.abs(y)); } M.waves = { xs, ws, amax }; }
    const { xs, ws: waves, amax } = M.waves;
    for (let k = 0; k < nw; k++) { const z = zDepth(ZEROS[k]), on = k < K; poly(xs.map((x, i) => [xRib(x), 0.7 * waves[k][i] / amax, z]), on ? COL.cyan : COL.gray, on ? 0.7 - 0.4 * k / nw : 0.12); }
    // the front panel: the sum with K zeros (amber) and the prime side (white)
    const c = M.curves[pr.j], tgt = M.mode === 'psi' ? M.exact : M.target, xsrc = M.mode === 'psi' ? M.xs : M.as, n = c.length, step = Math.max(1, Math.floor(n / 500));
    const Y = (y) => 0.2 + 2.6 * (y - M.yLo) / (M.yHi - M.yLo), P1 = [], P2 = [];
    for (let i = 0; i < n; i += step) { P1.push([xRib(xsrc[i]), Y(c[i]), FRONT_Z]); P2.push([xRib(xsrc[i]), Y(tgt[i]), FRONT_Z]); }
    poly(P2, COL.gray, 0.55); poly(P1, COL.amber, 0.95);
    seg([RX0, Y(0), FRONT_Z], [RX1, Y(0), FRONT_Z], COL.gray, 0.2);
  } else if (M.mode !== 'count') {
    // the front panel: the test function g(x) on [−X, X] and the prime powers it touches, as stems at ±log n
    const X = M.gSupport * 1.05, NP = 360, P = [];
    if (!M.gvis) { const gx = Array.from({ length: NP + 1 }, (_, i) => -X + 2 * X * i / NP), gv = gx.map((x) => M.g(x)); let gmax = 1e-300; for (const y of gv) gmax = Math.max(gmax, Math.abs(y)); M.gvis = { gx, gv, gmax }; }
    const { gx, gv, gmax } = M.gvis;
    const XF = (x) => RX0 + (x + X) / (2 * X) * (RX1 - RX0);
    gx.forEach((x, i) => P.push([XF(x), 1.4 + 1.2 * gv[i] / gmax, FRONT_Z])); poly(P, COL.gray, 0.6);
    seg([RX0, 1.4, FRONT_Z], [RX1, 1.4, FRONT_Z], COL.gray, 0.18);
    let pmax = 1e-300; for (const [, w] of M.primeList) pmax = Math.max(pmax, Math.abs(w));
    for (const [n, w] of M.primeList) for (const s of [-1, 1]) { const x = XF(s * Math.log(n)); seg([x, 0, FRONT_Z], [x, 1.2 * Math.abs(w) / pmax, FRONT_Z], COL.magenta, 0.8); }
  }
  lines.geometry.setDrawRange(0, v); Lb.position.needsUpdate = true; Lb.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 58 * renderer.getPixelRatio();
}

/* =====================================================================
   7. Camera
   ===================================================================== */
let camName = 'iso';
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.55 : 1), cx = 0.3, cz = -3.0;
  camera.position.set(cx + r * sp * Math.sin(cam.theta), 0.6 + r * Math.cos(cam.phi), cz + r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(cx, 0.6, cz);
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
   8. Tags
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
  const M = MODEL, pr = progress(), tv = tView(); let k = 0;
  const put = (text, p, cls) => { const el = tagAt(k++, cls); el.textContent = text; placeTag(el, p); };
  put('σ = 0', [SX0, -0.3, 0.4], ''); put('σ = ½', [SXH, -0.3, 0.4], 'hot'); put('σ = 1', [SX1, -0.3, 0.4], '');
  put(`t = ${Math.round(tv)}`, [SXH, -0.3, -DEPTH], '');
  if (M.mode === 'count') { put(T(`${countZeros(tv)} 个零点`, `${countZeros(tv)} zeros`), [SXH, 0.5, -DEPTH * 0.5], 'cy'); put('N(t)', [RX0, 2.5, -DEPTH], 'cy'); put('S(t)', [RX1 - 1.2, 2.2, 0], 'mg'); }
  else put(`γ₁ = ${ZEROS[0].toFixed(3)}`, [SXH + 0.5, 0.3, zDepth(ZEROS[0])], 'cy');
  if (M.mode === 'offline') put(T(`½ ± δ（σ 方向放大 20 倍）`, `½ ± δ (σ drawn 20× wider)`), [SXH, -0.7, zDepth(ZEROS[0])], 'mg');
  if (M.mode === 'psi' || M.mode === 'spikes') {
    put(M.mode === 'psi' ? 'ψ(x)' : T('素数一侧', 'PRIME SIDE'), [RX1, 3.0, FRONT_Z], '');
    put(T(`${pr.K} 个零点之和`, `SUM OF ${pr.K} ZEROS`), [RX0 + 0.6, 3.2, FRONT_Z], 'hot');
    put(T('每个零点一条波', 'ONE WAVE PER ZERO'), [RX1 - 0.4, 0.9, zDepth(ZEROS[Math.min(10, NZ - 1)])], 'cy');
  } else if (M.mode !== 'count') {
    put(T('检验函数 g(x)', 'TEST FUNCTION g(x)'), [RX1 - 0.6, 2.9, FRONT_Z], '');
    put(T('素数幂 ±log n', 'PRIME POWERS ±log n'), [RX0 + 0.8, -0.35, FRONT_Z], 'mg');
  }
  for (let i = k; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}

/* =====================================================================
   9. 2D panels
   ===================================================================== */
function frame2d(cv, pl0 = 50) {
  const dpr = fitCanvas(cv), ctx = cv.getContext('2d'), Wd = cv.width, Hh = cv.height;
  ctx.clearRect(0, 0, Wd, Hh);
  const pl = pl0 * dpr, pr = 12 * dpr, pt = 10 * dpr, pb = 20 * dpr;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  return { dpr, ctx, W: Wd, Hh, pl, pt, iw: Wd - pl - pr, ih: Hh - pt - pb };
}
const yTicks = (ctx, dpr, pl, Y, vals, fmt) => { ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of vals) ctx.fillText(fmt(g), pl - 4 * dpr, Y(g)); };
const line = (ctx, xs, ys, X, Y) => { ctx.beginPath(); for (let i = 0; i < xs.length; i++) { const x = X(xs[i]), y = Y(ys[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); };
const asinhScale = (v, s) => Math.asinh(v / s);
function niceTicks(lo, hi, n = 4) { const step0 = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(step0))), m = step0 / p, step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p, out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v); return out; }
function drawMain() {
  const F = frame2d(cv1); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, pr = progress();
  if (M.mode === 'psi' || M.mode === 'spikes') {
    const xs = M.mode === 'psi' ? M.xs : M.as, X = (x) => pl + (x - xs[0]) / (xs[xs.length - 1] - xs[0]) * iw, Y = (y) => pt + ih - (y - M.yLo) / (M.yHi - M.yLo) * ih;
    yTicks(ctx, dpr, pl, Y, niceTicks(M.yLo, M.yHi), (g) => String(+g.toFixed(2)));
    ctx.strokeStyle = FAINT; ctx.beginPath(); ctx.moveTo(pl, Y(0)); ctx.lineTo(pl + iw, Y(0)); ctx.stroke();
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    if (M.mode === 'psi') {
      for (const x of niceTicks(0, M.xs[NS - 1], 6)) if (x >= 1) ctx.fillText(String(x), X(x), pt + ih + 3 * dpr);
      ctx.strokeStyle = DIM; ctx.setLineDash([4 * dpr, 3 * dpr]); line(ctx, M.xs, M.smooth.map((v, i) => M.xs[i]), X, Y); ctx.setLineDash([]);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.4 * dpr; ctx.beginPath(); let prev = 0; ctx.moveTo(X(M.xs[0]), Y(0));   // the exact staircase
      for (const n of PRIME_POWERS) { if (n > M.xs[NS - 1]) break; ctx.lineTo(X(n), Y(prev)); prev += LAMBDA[n]; ctx.lineTo(X(n), Y(prev)); }
      ctx.lineTo(X(M.xs[NS - 1]), Y(prev)); ctx.stroke(); ctx.lineWidth = 1;
    } else {
      let lastX = -1e9; for (const n of PRIME_POWERS) { if (n > 40) break; const x = X(Math.log(n)), w = ctx.measureText(String(n)).width; if (isPrime(n) && x - lastX > w + 4 * dpr) { ctx.fillText(String(n), x, pt + ih + 3 * dpr); lastX = x; } }
      ctx.fillStyle = INK; ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.moveTo(X(M.as[0]), Y(0)); M.as.forEach((a, i) => ctx.lineTo(X(a), Y(M.target[i]))); ctx.lineTo(X(M.as[NA - 1]), Y(0)); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = INK; ctx.globalAlpha = 0.6; line(ctx, M.as, M.target, X, Y); ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = CY; ctx.lineWidth = 1.5 * dpr; line(ctx, xs, M.curves[pr.j], X, Y); ctx.lineWidth = 1;
    $('c1Title').textContent = M.mode === 'psi' ? T('ψ(x)：台阶（白）与用 K 对零点的公式（青）', 'ψ(x): THE STAIRCASE (WHITE) AND THE FORMULA WITH K PAIRS OF ZEROS (CYAN)') : T('素数探测器：素数一侧（白）与只用零点算出的曲线（青）', 'PRIME DETECTOR: THE PRIME SIDE (WHITE) AND THE CURVE FROM THE ZEROS ALONE (CYAN)');
    $('c1Meta').textContent = M.mode === 'psi' ? T(`K = ${pr.K} · 虚线 = x`, `K = ${pr.K} · dashes = x`) : T(`K = ${pr.K} · 横轴 a = log x，标出素数`, `K = ${pr.K} · axis a = log x, primes marked`);
  } else if (M.mode === 'balance' || M.mode === 'square') {
    const Kmax = M.Kmax, lx = (k) => Math.log10(k), X = (k) => pl + lx(k) / lx(Kmax) * iw;
    let lo = M.rhs, hi = M.rhs; for (let k = 1; k <= Kmax; k++) { lo = Math.min(lo, M.cum[k]); hi = Math.max(hi, M.cum[k]); }
    const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1e-12; lo -= pad; hi += pad;
    const Y = (y) => pt + ih - (y - lo) / (hi - lo) * ih;
    yTicks(ctx, dpr, pl, Y, [lo + pad, (lo + hi) / 2, hi - pad], (g) => (Math.abs(g) < 1e-3 || Math.abs(g) >= 1e4 ? g.toExponential(1) : g.toPrecision(2)));
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; [[1, 'K=1'], [10, '10'], [100, '100'], [1000, '10³'], [10000, '10⁴']].forEach(([k, s]) => { if (k <= Kmax) ctx.fillText(s, Math.min(X(k), pl + iw - 8 * dpr), pt + ih + 3 * dpr); });
    ctx.strokeStyle = AM; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(pl, Y(M.rhs)); ctx.lineTo(pl + iw, Y(M.rhs)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = CY; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); for (let k = 1; k <= Kmax; k = k < 100 ? k + 1 : Math.ceil(k * 1.02)) { const x = X(k), y = Y(M.cum[k]); if (k === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); ctx.lineWidth = 1;
    if (pr.K >= 1) { ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(pr.K), Y(M.cum[pr.K]), 4 * dpr, 0, 2 * Math.PI); ctx.fill(); }
    $('c1Title').textContent = T('零点部分和（青）与素数一侧（琥珀虚线）', 'PARTIAL ZERO SUMS (CYAN) AND THE PRIME SIDE (AMBER DASHES)');
    $('c1Meta').textContent = T(`K 取对数刻度 · 现在 K = ${pr.K}`, `K on a log scale · now K = ${pr.K}`);
  } else if (M.mode === 'offline') {
    const s0 = 1e-6, Yv = (v) => asinhScale(v, s0); let lo = Yv(Math.min(...M.W)), hi = Yv(Math.max(...M.W)); const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const X = (d) => pl + d / DELTA_MAX * iw, Y = (v) => pt + ih - (Yv(v) - lo) / (hi - lo) * ih;
    yTicks(ctx, dpr, pl, Y, [-1e-2, -1e-4, 0, 1e-4].filter((g) => Yv(g) > lo && Yv(g) < hi), (g) => (g === 0 ? '0' : g.toExponential(0)));
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const d of [0, 0.01, 0.02, 0.03, 0.04, 0.05]) ctx.fillText(`δ=${d}`, X(d), pt + ih + 3 * dpr);
    ctx.strokeStyle = FAINT; ctx.beginPath(); ctx.moveTo(pl, Y(0)); ctx.lineTo(pl + iw, Y(0)); ctx.stroke();
    ctx.strokeStyle = MG; ctx.lineWidth = 1.5 * dpr; line(ctx, M.ds, M.W, X, Y); ctx.lineWidth = 1;
    if (M.cross !== null) { ctx.strokeStyle = AM; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(X(M.cross), pt); ctx.lineTo(X(M.cross), pt + ih); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(pr.d), Y(pr.W), 4 * dpr, 0, 2 * Math.PI); ctx.fill();
    $('c1Title').textContent = T('假想零点集合的零点和 W(δ)', 'ZERO SUM W(δ) OF THE HYPOTHETICAL ZERO SET');
    $('c1Meta').textContent = T(`纵轴 asinh 刻度 · 虚线：δ = ${num(M.cross, 4)} 处变负`, `asinh scale · dashes: turns negative at δ = ${num(M.cross, 4)}`);
  } else {
    const t = Math.max(1, pr.t), X = (x) => pl + x / t * iw, nMax = Math.max(1, countZeros(t), theta(t) / Math.PI + 1), Y = (y) => pt + ih - y / (nMax * 1.05) * ih;
    yTicks(ctx, dpr, pl, Y, niceTicks(0, nMax, 3), (g) => String(g));
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const x of niceTicks(0, t, 5)) ctx.fillText(String(x), X(x), pt + ih + 3 * dpr);
    ctx.strokeStyle = AM; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); for (let i = 0; i <= 300; i++) { const x = t * i / 300, y = x > 0 ? Math.max(0, theta(x) / Math.PI + 1) : 0; if (i) ctx.lineTo(X(x), Y(y)); else ctx.moveTo(X(x), Y(y)); } ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = CY; ctx.lineWidth = 1.4 * dpr; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); const n = countZeros(t), step = Math.max(1, Math.floor(n / 1500));
    for (let k = 0; k < n; k += step) { ctx.lineTo(X(ZEROS[k]), Y(k)); ctx.lineTo(X(ZEROS[k]), Y(k + 1)); } ctx.lineTo(X(t), Y(n)); ctx.stroke(); ctx.lineWidth = 1;
    $('c1Title').textContent = T('零点个数 N(T)（青）与 θ(T)/π + 1（琥珀虚线）', 'ZERO COUNT N(T) (CYAN) AND θ(T)/π + 1 (AMBER DASHES)');
    $('c1Meta').textContent = `T = ${t.toFixed(1)}`;
  }
}
function drawSide() {
  const F = frame2d(cv2); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, pr = progress();
  if (M.mode === 'psi') {
    const c = M.curves[pr.j], err = Array.from(c, (v, i) => v - M.exact[i]); let m = 0.5; for (const e of err) m = Math.max(m, Math.min(20, Math.abs(e)));
    const X = (x) => pl + (x - M.xs[0]) / (M.xs[NS - 1] - M.xs[0]) * iw, Y = (y) => pt + ih / 2 - Math.max(-m, Math.min(m, y)) / m * ih / 2;
    yTicks(ctx, dpr, pl, Y, [-m, 0, m], (g) => g.toFixed(1));
    ctx.strokeStyle = FAINT; ctx.beginPath(); ctx.moveTo(pl, Y(0)); ctx.lineTo(pl + iw, Y(0)); ctx.stroke();
    ctx.strokeStyle = CY; line(ctx, M.xs, err, X, Y);
    $('c2Title').textContent = T('误差：公式 − ψ(x)', 'ERROR: FORMULA − ψ(x)'); $('c2Meta').textContent = T('跳跃处是 Gibbs 振荡', 'Gibbs ripples at the jumps');
  } else if (M.mode === 'offline') {
    // the three pieces of W(δ) on an asinh scale
    const s0 = 1e-6, bars = [[T('其余真实零点', 'other real zeros'), M.Son - M.own, CY], [T('假想的一对', 'hypothetical pair'), pr.P, MG], ['W(δ)', pr.W, AM]];
    const vmax = Math.max(Math.asinh(Math.abs(M.W[ND]) / s0), ...bars.map(([, v]) => Math.asinh(Math.abs(v) / s0))) * 1.08, Y = (v) => pt + ih / 2 - Math.asinh(v / s0) / vmax * ih / 2, bw = iw / 3;
    yTicks(ctx, dpr, pl, Y, [-1e-3, 0, 1e-4], (g) => (g === 0 ? '0' : g.toExponential(0)));
    ctx.strokeStyle = FAINT; ctx.beginPath(); ctx.moveTo(pl, Y(0)); ctx.lineTo(pl + iw, Y(0)); ctx.stroke();
    bars.forEach(([lab, v, col], i) => { const x = pl + i * bw, y0 = Y(0), y1 = Y(v); ctx.fillStyle = col; ctx.globalAlpha = 0.8; ctx.fillRect(x + bw * 0.22, Math.min(y0, y1), bw * 0.56, Math.max(1, Math.abs(y1 - y0))); ctx.globalAlpha = 1; ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = v >= 0 ? 'bottom' : 'top'; ctx.fillText(sci(v, 2), x + bw / 2, v >= 0 ? y1 - 2 * dpr : y1 + 2 * dpr); ctx.fillStyle = DIM; ctx.textBaseline = 'top'; ctx.fillText(lab, x + bw / 2, pt + ih + 3 * dpr); });
    $('c2Title').textContent = T('W(δ) 的三部分（asinh 刻度）', 'THE THREE PARTS OF W(δ) (ASINH SCALE)'); $('c2Meta').textContent = T('真实零点只贡献非负项', 'the real zeros give only nonnegative terms');
  } else if (M.mode === 'spikes' || M.mode === 'balance' || M.mode === 'square') {
    // weight of every zero on a log scale; the ones in use (or all, for the off-line model) are bright
    const LO = -16, X = (t) => pl + t / T_MAX * iw, Y = (v) => pt + ih - (Math.max(LO, Math.log10(Math.max(1e-300, Math.abs(v)))) - LO) / (2 - LO) * ih;
    yTicks(ctx, dpr, pl, Y, [1, 1e-5, 1e-10, 1e-15], (g) => `1e${Math.round(Math.log10(g))}`);
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const t of [0, 2500, 5000, 7500]) ctx.fillText(`γ=${t}`, X(t), pt + ih + 3 * dpr);
    const active = pr.K, step = Math.max(1, Math.floor(NZ / (iw / dpr * 1.5)));
    for (let k = 0; k < NZ; k += step) { const w = M.w[k]; if (w === 0) continue; ctx.fillStyle = k < active ? (w < 0 ? MG : CY) : FAINT; ctx.fillRect(X(ZEROS[k]), Y(w), Math.max(1, dpr), Math.max(1, dpr)); }
    if (pr.K > 0 && pr.K <= NZ) { ctx.strokeStyle = AM; ctx.beginPath(); ctx.moveTo(X(ZEROS[pr.K - 1]), pt); ctx.lineTo(X(ZEROS[pr.K - 1]), pt + ih); ctx.stroke(); }
    $('c2Title').textContent = T('每个零点的权重 |ĝ(γ)|（对数刻度）', 'WEIGHT OF EACH ZERO |ĝ(γ)| (LOG SCALE)');
    $('c2Meta').textContent = T('琥珀线 = 第 K 个零点；青 = 正，品红 = 负', 'amber line = the K-th zero; cyan = positive, magenta = negative');
  } else {
    // S(T) = N(T) − θ(T)/π − 1, min and max per pixel column
    const t = Math.max(1, pr.t), cols = Math.max(10, Math.floor(iw / dpr)), X = (c) => pl + c / cols * iw, Y = (y) => pt + ih / 2 - y / 2.2 * ih / 2;
    yTicks(ctx, dpr, pl, Y, [-2, 0, 2], (g) => String(g));
    ctx.strokeStyle = FAINT; ctx.beginPath(); ctx.moveTo(pl, Y(0)); ctx.lineTo(pl + iw, Y(0)); ctx.stroke();
    ctx.strokeStyle = CY;
    let k = 0; for (let c = 0; c < cols; c++) {
      const a = t * c / cols, b = t * (c + 1) / cols; if (b < 14) continue;
      while (k < NZ && ZEROS[k] <= a) k++;
      const vals = [k - theta(a) / Math.PI - 1]; let kk = k;
      while (kk < NZ && ZEROS[kk] <= b) { const th = theta(ZEROS[kk]) / Math.PI + 1; vals.push(kk - th, kk + 1 - th); kk++; }
      vals.push(kk - theta(b) / Math.PI - 1);
      ctx.beginPath(); ctx.moveTo(X(c) + 0.5, Y(Math.min(...vals))); ctx.lineTo(X(c) + 0.5, Y(Math.max(...vals)) + 0.5); ctx.stroke();
    }
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const x of niceTicks(0, t, 5)) ctx.fillText(String(x), pl + x / t * iw, pt + ih + 3 * dpr);
    $('c2Title').textContent = T('涨落 S(T) = N(T) − θ(T)/π − 1', 'FLUCTUATION S(T) = N(T) − θ(T)/π − 1'); $('c2Meta').textContent = T('每列画出最小到最大', 'each column spans min to max');
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
  if (M.mode === 'psi') {
    const x = S.X - 0.5, i = Math.round((x - M.xs[0]) / (M.xs[NS - 1] - M.xs[0]) * (NS - 1)), xi = M.xs[i], c = M.curves[pr.j];
    let err = 0, cnt = 0; for (let q = 0; q < NS; q++) if (M.xs[q] >= 2) { err += Math.abs(c[q] - M.exact[q]); cnt++; }
    setRo([[T('用到的零点对数 K（最大 γ）', 'Pairs of zeros used K (largest γ)'), pr.K ? `${pr.K} (γ ≤ ${ZEROS[pr.K - 1].toFixed(2)})` : '0'],
      [T(`精确 ψ(${xi.toFixed(2)})`, `Exact ψ(${xi.toFixed(2)})`), num(M.exact[i], 4)],
      [T(`公式在 x = ${xi.toFixed(2)} 处的值`, `Formula at x = ${xi.toFixed(2)}`), num(c[i], 4)],
      [T('2 ≤ x ≤ X 上的平均 |误差|', 'Mean |error| over 2 ≤ x ≤ X'), num(err / cnt, 4)],
      [T('ψ(X)/X（素数定理：→ 1）', 'ψ(X)/X (prime number theorem: → 1)'), num(psiExact(S.X) / S.X, 4)]]);
    pill('pillK', 'ZEROS', pr.K); pill('pillA', 'ψ(X−½)', num(M.exact[i], 2)); pill('pillB', 'FORMULA', num(c[i], 2));
    $('roNote').innerHTML = T('每对零点贡献 −2Re(x<sup>ρ</sup>/ρ)，振幅约 2√x/γ。和按 γ 由小到大截断。', 'Each pair of zeros contributes −2Re(x<sup>ρ</sup>/ρ), of amplitude about 2√x/γ. The sum is cut off in order of increasing γ.');
  } else if (M.mode === 'spikes') {
    const c = M.curves[pr.j], at = (a) => { const i = Math.round((a - A_MIN) / (A_MAX - A_MIN) * (NA - 1)); return c[i]; };
    let mx = 0; for (let i = 0; i < NA; i++) mx = Math.max(mx, Math.abs(c[i] - M.target[i]));
    setRo([[T('用到的零点 K（最大 γ）', 'Zeros used K (largest γ)'), pr.K ? `${pr.K} (γ ≤ ${ZEROS[pr.K - 1].toFixed(1)})` : '0'],
      [T('a = log 2 处的峰（log 2 = 0.6931）', 'Peak at a = log 2 (log 2 = 0.6931)'), num(at(Math.log(2)), 4)],
      [T('a = log 3 处的峰（log 3 = 1.0986）', 'Peak at a = log 3 (log 3 = 1.0986)'), num(at(Math.log(3)), 4)],
      [T('与素数一侧的最大偏差', 'Largest deviation from the prime side'), sci(mx)],
      [T('用全部 10⁴ 个零点时，等式两边之差（截断误差）', 'With all 10⁴ zeros, the gap between the two sides (truncation)'), sci(M.idErr)]]);
    pill('pillK', 'ZEROS', pr.K); pill('pillA', 'ε', S.eps.toFixed(2)); pill('pillB', 'MAX DEV', sci(mx, 2));
    $('roNote').innerHTML = T('纵轴乘了 e·e<sup>a/2</sup>/2，使 a = log p<sup>k</sup> 处的峰高约为 log p。挨得近的素数幂（例如 log 7 与 log 8）会叠在一起。', 'The vertical axis is multiplied by e·e<sup>a/2</sup>/2 so that the peak at a = log p<sup>k</sup> has height about log p. Close prime powers (such as log 7 and log 8) overlap.');
  } else if (M.mode === 'balance' || M.mode === 'square') {
    const z = M.cum[pr.K];
    setRo([[T('用到的零点 K', 'Zeros used K'), String(pr.K)],
      [T('零点一侧（前 K 个零点及其共轭）', 'Zero side (the first K zeros and their conjugates)'), sci(z, 6)],
      [T('素数一侧：极点 − 素数 + 阿基米德', 'Prime side: pole − prime + archimedean'), sci(M.rhs, 6)],
      [T('两边之差', 'Difference'), sci(z - M.rhs, 2)],
      [T('极点项 · 素数项 · 阿基米德项', 'Pole term · prime term · archimedean term'), `${num(M.pole, 5)} · ${num(M.prime, 5)} · ${num(M.arch, 5)}`]]);
    pill('pillK', 'ZEROS', pr.K); pill('pillA', 'ZERO SIDE', sci(z, 3)); pill('pillB', 'PRIME SIDE', sci(M.rhs, 3));
    $('roNote').innerHTML = M.mode === 'square'
      ? T(`f = φ(x/${S.L})，g = f ∗ f。每个零点贡献 2f̂(γ)² ≥ 0（${M.w.every((w) => w >= 0) ? '这一万项全部非负' : '出现负项'}），所以零点和随 K 只增不减。`, `f = φ(x/${S.L}), g = f ∗ f. Every zero contributes 2f̂(γ)² ≥ 0 (${M.w.every((w) => w >= 0) ? 'all ten thousand terms are nonnegative' : 'a negative term appears'}), so the zero sum never decreases with K.`)
      : T(`g(x) = φ(x/${S.L})。素数项只含 n ≤ e<sup>L</sup> 的素数幂（这里 ${M.primeList.length} 个）。`, `g(x) = φ(x/${S.L}). The prime term involves only prime powers n ≤ e<sup>L</sup> (here ${M.primeList.length} of them).`);
  } else if (M.mode === 'offline') {
    setRo([[T('假想的偏离 δ', 'Hypothetical offset δ'), num(pr.d, 4)],
      [T('真实零点的零点和（全部 10⁴ 个）', 'Zero sum of the real zeros (all 10⁴)'), sci(M.Son, 4)],
      [T('它等于素数一侧（极点 − 素数 + 阿基米德）', 'It equals the prime side (pole − prime + archimedean)'), sci(M.rhs, 4)],
      [T('假想的一对 ½ ± δ + iγ₁ 的贡献', 'Contribution of the hypothetical pair ½ ± δ + iγ₁'), sci(pr.P, 4)],
      [T('假想零点集合的零点和 W(δ)', 'Zero sum W(δ) of the hypothetical zero set'), sci(pr.W, 4)]]);
    pill('pillK', 'δ', num(pr.d, 4)); pill('pillA', 'REAL', sci(M.Son, 2)); pill('pillB', 'W(δ)', sci(pr.W, 2));
    $('roNote').innerHTML = pr.W < 0 ? T('W(δ) &lt; 0：这个假想的零点集合违反 Weil 正性。真实数据里没有这样的零点。', 'W(δ) &lt; 0: this hypothetical zero set violates Weil positivity. The real data contains no such zero.') : T('W(δ) ≥ 0：偏离还太小，压不过其余零点的正贡献。', 'W(δ) ≥ 0: the offset is still too small to outweigh the positive contributions of the other zeros.');
  } else {
    const t = pr.t, n = pr.N, sm = pr.sm;
    const dy = []; for (let j = 4; j <= 12; j++) { const a = 2 ** j; if (2 * a > T_MAX) break; dy.push(`${countZeros(2 * a) - countZeros(a)}`); }
    setRo([[T('高度 T', 'Height T'), num(t, 2)], [T('零点个数 N(T)', 'Zero count N(T)'), String(n)], [T('光滑项 θ(T)/π + 1', 'Smooth term θ(T)/π + 1'), num(sm, 3)],
      [T('涨落 S(T) = N − θ/π − 1', 'Fluctuation S(T) = N − θ/π − 1'), num(n - sm, 3)],
      [T('N(T, 2T)，T = 16, 32, …, 4096', 'N(T, 2T) for T = 16, 32, …, 4096'), dy.join(' · ')]]);
    pill('pillK', 'T', num(t, 1)); pill('pillA', 'N(T)', n); pill('pillB', 'S(T)', num(n - sm, 2));
    $('roNote').innerHTML = T('二进区间里的零点数 N(T, 2T) 一路增长；冻结定理 <code>isNontrivialZero_infinite</code> 保证零点无穷多。', 'The dyadic counts N(T, 2T) keep growing; the frozen theorem <code>isNontrivialZero_infinite</code> guarantees infinitely many zeros.');
  }
}
function syncOutputs() {
  if (dirty) { build(); dirty = false; syncedKey = ''; toasted = false; }
  const M = MODEL, pr = progress(), key = `${S.mode}|${S.nowFrac}|${TRV.lang()}`;
  if (key === syncedKey) return; syncedKey = key;
  readouts();
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  $('xField').hidden = S.mode !== 'psi'; $('epsField').hidden = S.mode !== 'spikes'; $('lField').hidden = !L_RANGE[S.mode];
  $('xx').value = S.X; $('oX').textContent = String(S.X); $('eps').value = S.eps; $('oEps').textContent = S.eps.toFixed(2);
  if (L_RANGE[S.mode]) { const [lo, hi] = L_RANGE[S.mode]; $('ll').min = lo; $('ll').max = hi; $('ll').value = S.L; $('oL').textContent = S.L.toFixed(1); }
  $('presetNote').innerHTML = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = ({
    psi: T('x 轴是 x；白色台阶是 ψ(x)，青色是 von Mangoldt 公式截断到 K 对零点。', 'The axis is x; the white staircase is ψ(x), the cyan curve is von Mangoldt’s formula cut off at K pairs of zeros.'),
    spikes: T('横轴是 a（= log x）；检验函数 g<sub>a</sub> 是 ±a 处的两个鼓包，宽 ε。', 'The axis is a (= log x); the test function g<sub>a</sub> is two bumps of width ε at ±a.'),
    balance: T('检验函数 g(x) = φ(x/L)，φ(u) = e<sup>−1/(1−u²)</sup>。时间轴 = 用到的零点个数 K。', 'Test function g(x) = φ(x/L) with φ(u) = e<sup>−1/(1−u²)</sup>. The time axis is the number K of zeros used.'),
    square: T('检验函数 g = f ∗ f，f(x) = φ(x/L)；ĝ = f̂² ≥ 0。', 'Test function g = f ∗ f with f(x) = φ(x/L); ĝ = f̂² ≥ 0.'),
    offline: T('f(x) = x sin(γ₁x) φ(x/L)，g = f ∗ f。时间轴 = 假想的偏离 δ（0 到 0.05）。', 'f(x) = x sin(γ₁x) φ(x/L), g = f ∗ f. The time axis is the hypothetical offset δ (0 to 0.05).'),
    count: T('时间轴 = 高度 T（0 到 γ₁₀₀₀₀ = 9877.78）。', 'The time axis is the height T (0 to γ₁₀₀₀₀ = 9877.78).')
  })[S.mode];
  $('litNote').innerHTML = T(`零点数据：Odlyzko 表的前 ${NZ} 个零点，γ₁ = ${ZEROS[0].toFixed(9)}，γ<sub>${NZ}</sub> = ${T_MAX.toFixed(9)}。`, `Zero data: the first ${NZ} zeros of Odlyzko’s table, γ₁ = ${ZEROS[0].toFixed(9)}, γ<sub>${NZ}</sub> = ${T_MAX.toFixed(9)}.`);
  $('clock').innerHTML = M.mode === 'offline' ? `δ ${pr.d.toFixed(4)}` : M.mode === 'count' ? `T ${pr.t.toFixed(0)}` : `K ${pr.K}`;
  $('hudBig').textContent = ({ psi: T(`ψ(x) · K = ${pr.K} 对零点`, `ψ(x) · K = ${pr.K} pairs of zeros`), spikes: T(`素数探测器 · ε = ${S.eps.toFixed(2)} · K = ${pr.K}`, `prime detector · ε = ${S.eps.toFixed(2)} · K = ${pr.K}`),
    balance: T(`两边对账 · L = ${S.L} · K = ${pr.K}`, `balance · L = ${S.L} · K = ${pr.K}`), square: T(`Weil 平方 · L = ${S.L} · K = ${pr.K}`, `Weil square · L = ${S.L} · K = ${pr.K}`),
    offline: T(`假想离线零点 · δ = ${pr.d?.toFixed(4)}`, `hypothetical off-line zero · δ = ${pr.d?.toFixed(4)}`), count: T(`零点计数 · T = ${pr.t?.toFixed(1)}`, `zero count · T = ${pr.t?.toFixed(1)}`) })[M.mode];
  $('hudSub').textContent = M.mode === 'count' ? T('临界线上的点 = 已经数到的零点 · 青阶梯 = N(t) · 琥珀 = θ(t)/π + 1 · 品红 = S(t)', 'points on the critical line = the zeros counted so far · cyan steps = N(t) · amber = θ(t)/π + 1 · magenta = S(t)')
    : M.mode === 'psi' || M.mode === 'spikes' ? T('左：临界带，竖线 = 零点的权重（对数刻度）· 右：每个零点一条波 · 前：总和与素数一侧', 'left: the critical strip, stems = weight of each zero (log scale) · right: one wave per zero · front: the sum and the prime side')
      : T('左：临界带，竖线 = ĝ(γ)（对数刻度），曲线 = ĝ(t) · 前：检验函数与它碰到的素数幂', 'left: the critical strip, stems = ĝ(γ) (log scale), curve = ĝ(t) · front: the test function and the prime powers it touches');
  // toasts at the end of a run
  if (!toasted && S.playing && M.mode === 'offline' && M.cross !== null && pr.d >= M.cross) { toasted = true; toast(T(`<b>δ = ${M.cross.toFixed(4)}</b>：零点和变负——这样的零点集合会违反 Weil 正性。`, `<b>δ = ${M.cross.toFixed(4)}</b>: the zero sum turns negative; such a zero set would violate Weil positivity.`)); }
  else if (!toasted && S.playing && S.nowFrac >= 1) {
    toasted = true;
    if (M.mode === 'psi') toast(T(`<b>${pr.K} 对零点</b>：台阶已经成形；跳跃处的振荡是 Gibbs 现象。`, `<b>${pr.K} pairs of zeros</b>: the staircase has formed; the ripples at the jumps are the Gibbs phenomenon.`));
    else if (M.mode === 'spikes') toast(T(`<b>${pr.K} 个零点</b>：尖峰落在素数幂上，与素数一侧最大相差 ${sci(Math.max(...Array.from(M.curves[NF], (v, i) => Math.abs(v - M.target[i]))), 2)}。`, `<b>${pr.K} zeros</b>: the spikes sit on the prime powers, at most ${sci(Math.max(...Array.from(M.curves[NF], (v, i) => Math.abs(v - M.target[i]))), 2)} from the prime side.`));
    else if (M.mode === 'balance' || M.mode === 'square') toast(T(`<b>零点一侧 = 素数一侧</b>：相差 ${sci(M.cum[NZ] - M.rhs, 2)}。`, `<b>Zero side = prime side</b>: they differ by ${sci(M.cum[NZ] - M.rhs, 2)}.`));
    else if (M.mode === 'count') toast(T(`<b>N(${T_MAX.toFixed(2)}) = ${countZeros(T_MAX)}</b>：前一万个零点都数到了。`, `<b>N(${T_MAX.toFixed(2)}) = ${countZeros(T_MAX)}</b>: all ten thousand zeros counted.`));
  }
}
function syncRail() {
  const key = `${S.mode}|${S.X}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  const M = MODEL; let marks;
  if (M.mode === 'offline') marks = [0, 0.01, 0.02, 0.03, 0.04, 0.05].map((d) => [Math.sqrt(d / DELTA_MAX), `δ ${d}`]);
  else if (M.mode === 'count') marks = [0, 1000, 2500, 5000, 7500].map((t) => [Math.sqrt(t / T_MAX), String(t)]).concat([[1, String(NZ)]]);
  else marks = [0, 1, 10, 100, 1000].filter((k) => k < M.Kmax * 0.6).concat([M.Kmax]).map((k) => [Math.log(k + 1) / Math.log(M.Kmax + 1), String(k)]);
  $('marks').innerHTML = marks.map(([f, s], i) => `<i class="${i === 0 ? 'first' : i === marks.length - 1 && f > 0.999 ? 'last' : ''}" style="left:${(f * 100).toFixed(2)}%">${s}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => {
  const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'spikes'; if (S.mode === m) return;
  S.mode = m; if (L_RANGE[m]) S.L = L_RANGE[m][2]; S.nowFrac = 0; custom();
}));
$('xx').addEventListener('input', () => { S.X = Math.min(200, Math.max(20, parseInt($('xx').value, 10))); S.nowFrac = Math.min(S.nowFrac, 1); custom(); });
$('eps').addEventListener('input', () => { S.eps = Math.min(0.3, Math.max(0.03, Math.round(parseFloat($('eps').value) * 100) / 100)); custom(); });
$('ll').addEventListener('input', () => { const [lo, hi] = L_RANGE[S.mode] || [0.5, 6]; S.L = Math.min(hi, Math.max(lo, Math.round(parseFloat($('ll').value) * 10) / 10)); custom(); });
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  for (const k of ['mode', 'X', 'eps', 'L']) if (p[k] !== undefined) S[k] = p[k];
  S.preset = name; markPreset(); dirty = true; setCamPreset('iso');
  S.nowFrac = 0; if (!reduceMotion) { S.dir = 1; S.playing = true; setPlayUI(); }
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
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) { ev.preventDefault(); jumpTo(S.nowFrac + (ev.key === 'ArrowRight' ? 1 : -1) / NF); }
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
      S.nowFrac += S.dir * dtSec * S.speed / RUN_SECONDS;
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 2.2; }
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
window.EF_DEBUG = {
  pending: () => dirty || syncedKey !== `${S.mode}|${S.nowFrac}|${TRV.lang()}`,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, pr = progress(), o = { mode: M.mode, frac: S.nowFrac, Kmax: M.Kmax ?? null, K: pr.K ?? null, nZeros: NZ, zerosHead: Array.from(ZEROS.slice(0, 20)), zeroLast: T_MAX, eps: S.eps, L: S.L, X: S.X };
    if (M.mode === 'psi') Object.assign(o, { xs: Array.from(M.xs), exact: Array.from(M.exact), curve: Array.from(M.curves[pr.j]) });
    if (M.mode === 'spikes') Object.assign(o, { as: Array.from(M.as), pole: Array.from(M.pole), prime: Array.from(M.prime), arch: Array.from(M.arch), scale: Array.from(M.scale), zeroCurve: Array.from(M.zeroCurves[pr.j]), curve: Array.from(M.curves[pr.j]), target: Array.from(M.target), idErr: M.idErr, wHead: Array.from(M.w.slice(0, 50)) });
    if (M.w && M.mode !== 'spikes') Object.assign(o, { wHead: Array.from(M.w.slice(0, 200)), wNonneg: M.w.every((w) => w >= 0), zeroSide: M.cum[pr.K ?? NZ], zeroAll: M.cum[NZ], pole: M.pole, prime: M.prime, arch: M.arch, rhs: M.rhs, primeList: M.primeList.map((x) => x.slice()) });
    if (M.mode === 'offline') Object.assign(o, { d: pr.d, P: pr.P, W: pr.W, Son: M.Son, own: M.own, cross: M.cross });
    if (M.mode === 'count') Object.assign(o, { t: pr.t, N: pr.N, smooth: pr.sm });
    return o;
  },
  theta, countZeros, psiExact,
  pairAt: (d) => (MODEL.pairAt ? MODEL.pairAt(d) : null),
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('spikes'); S.playing = false; setPlayUI(); S.nowFrac = 0.82; $('now').value = S.nowFrac; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('spikes');
S.nowFrac = 0; S.playing = !reduceMotion; $('now').value = S.nowFrac;
setPlayUI();
requestAnimationFrame(frame);
})();
