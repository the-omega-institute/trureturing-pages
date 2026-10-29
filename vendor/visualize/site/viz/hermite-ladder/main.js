/* HERMITE//LADDER · 量子谐振子 · 能级阶梯与厄米函数
   The oscillator H₀ = Σ_j[−(ħ²/2m)∂_j² + (mω_j²/2)x_j²] with ħ = m = ω₁ = 1. Its eigenfunctions are the normalized Hermite functions
   φ_n (computed by the stable three-term recurrence) with E_n = n + ½; in 2D the products φ_n(x)·ω₂^{1/4}φ_m(√ω₂ y) with
   E = (n + ½) + ω₂(m + ½). A state ψ = Σ c_n φ_n evolves by exact phases e^{−iE_n t}. For a target shape the coefficients are
   integrated numerically on [−16, 16]; the error of the first N terms is Σ_{n≥N}|c_n|², and the energy-weighted sum Σ E_n²|c_n|²
   decides whether H can act on the shape (theory: ACTUAL_OSCILLATOR_GRAPH Theorems 6.1 and 8.1).
   Frozen Lean anchors are named in the page text. Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const COL = TRV.rgb, GREEN = [0.27, 1.0, 0.70];
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, ok: OK, cyan: CY, magenta: MG } = TRV.palette;
const NM = 80, LF = 16, GF = 3201, DXF = 2 * LF / (GF - 1);           // fine grid for the coefficients
const XS = 6.5, GD = 521;                                             // display grid in 1D
const G2 = 72, X2 = 5.5, NM2 = 40, ALPHA2 = 2.5;                       // 2D grid; |α| ≤ 2.5 keeps the state inside the shells n₁ + n₂ < 40
const SCALE_X = 0.62, SCALE_E = 0.3, AMP = 2.2;
const SRC1 = ['eigen', 'coherent', 'cat', 'target'], SRC2 = ['eig2', 'coh2', 'vortex'], TGTS = ['box', 'tri', 'gauss', 'hump'];

/* =====================================================================
   2. State and presets
   ===================================================================== */
const S = { dim: 1, src1: 'coherent', src2: 'coh2', n: 4, n2: 1, alpha: 2, tgt: 'box', terms: 20, ratio: 1.5,
  nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'coherent' };
const PRESETS = {
  ground: { dim: 1, src1: 'eigen', n: 0,
    zh: '基态 Φ₀ 是一个高斯包，能量 ½ħω 不为零——量子谐振子永远停不下来。它是本征态，所以概率密度不随时间变，只有整体相位在转（螺旋绕着 x 轴旋转）。',
    en: 'The ground state Φ₀ is a Gaussian packet with energy ½ħω, not zero: a quantum oscillator never comes to rest. It is an eigenstate, so the probability density does not change in time; only the overall phase turns (the helix spins about the x axis).' },
  excited: { dim: 1, src1: 'eigen', n: 4,
    zh: '第 4 激发态 Φ₄：能量 4.5ħω，有 4 个节点。它也是本征态，密度静止，相位以 4.5 倍于基态的速度转。',
    en: 'The fourth excited state Φ₄: energy 4.5ħω and 4 nodes. It is also an eigenstate: the density stays still while the phase turns 4.5 times as fast as in the ground state.' },
  coherent: { dim: 1, src1: 'coherent', alpha: 2,
    zh: '相干态 |α|=2：系数 c_n = e^{−|α|²/2}α^n/√n! 的泊松分布，平均能级 |α|² = 4。它形状不变地来回摆动，⟨x⟩ 走的正是经典轨迹，周期 2π/ω 一到精确复原。',
    en: 'A coherent state with |α| = 2: the coefficients c_n = e^{−|α|²/2}α^n/√n! follow a Poisson distribution with mean level |α|² = 4. It swings back and forth without changing shape, ⟨x⟩ follows the classical trajectory exactly, and it returns exactly after the period 2π/ω.' },
  cat: { dim: 1, src1: 'cat', alpha: 2.5,
    zh: '两个相反位移的相干态叠加（猫态）：只剩偶数能级。两团在中心相遇时出现干涉条纹，各自分开时条纹消失。',
    en: 'Two coherent states with opposite displacements added together (a cat state): only even levels remain. When the two packets meet at the centre, interference fringes appear; when they separate, the fringes vanish.' },
  box: { dim: 1, src1: 'target', tgt: 'box', terms: 20,
    zh: '用厄米函数拼一个方盒：项数越多，误差越小（完备性），但边缘总有过冲。能量加权和 Σ E²|c|² 却随项数一直涨：方盒的跳跃让 H 作用不上去，它不在 H 的定义域里。',
    en: 'Building a box from Hermite functions: the more terms, the smaller the error (completeness), but the edges always overshoot. The energy-weighted sum Σ E²|c|², however, keeps growing with the number of terms: the box’s jumps leave H nothing to act on, and the box is not in the domain of H.' },
  smooth: { dim: 1, src1: 'target', tgt: 'hump', terms: 20,
    zh: '光滑的双峰：前二十项的误差已小于 10⁻⁹，Σ E²|c|² 很快收敛到一个有限值——光滑形状在 H 的定义域里。',
    en: 'A smooth double hump: the error of the first twenty terms is already below 10⁻⁹, and Σ E²|c|² converges quickly to a finite value: smooth shapes are in the domain of H.' },
  lissajous: { dim: 2, src2: 'coh2', alpha: 2, ratio: 1.5,
    zh: '二维相干态，频率比 ω₂/ω₁ = 3/2：中心走出一条闭合的李萨如曲线，周期 2π·2/ω₁ 后精确复原。把频率比拖到 √2，轨道就永不闭合。',
    en: 'A 2D coherent state with frequency ratio ω₂/ω₁ = 3/2: its centre traces a closed Lissajous curve and returns exactly after the period 2π·2/ω₁. Drag the ratio to √2 and the orbit never closes.' },
  vortex: { dim: 2, src2: 'vortex', ratio: 1,
    zh: '各向同性的二维谐振子，(Φ₁₀ + iΦ₀₁)/√2：两个同能量的态叠加成一个环。密度一动不动，相位却绕着中心转了一整圈——这是角动量为 ħ 的态。',
    en: 'The isotropic 2D oscillator in (Φ₁₀ + iΦ₀₁)/√2: two states of the same energy add up to a ring. The density does not move at all, yet the phase winds once around the centre: this is a state with angular momentum ħ.' }
};

/* =====================================================================
   3. Hermite functions and coefficients
   ===================================================================== */
const xf = Float64Array.from({ length: GF }, (_, i) => -LF + i * DXF);
const xd = Float64Array.from({ length: GD }, (_, i) => -XS + 2 * XS * i / (GD - 1));
/* φ_0 = π^{-1/4}e^{−x²/2}, φ_{n+1} = √(2/(n+1))·x·φ_n − √(n/(n+1))·φ_{n−1} */
function hermiteTable(xs, nmax, scale = 1) {
  const out = [], u = Float64Array.from(xs, (x) => x * Math.sqrt(scale)), pre = Math.pow(scale, 0.25);
  out.push(Float64Array.from(u, (v) => pre * Math.PI ** -0.25 * Math.exp(-v * v / 2)));
  if (nmax > 1) out.push(Float64Array.from(u, (v, i) => Math.SQRT2 * v * out[0][i]));
  for (let n = 1; n + 1 < nmax; n++) out.push(Float64Array.from(u, (v, i) => Math.sqrt(2 / (n + 1)) * v * out[n][i] - Math.sqrt(n / (n + 1)) * out[n - 1][i]));
  return out;
}
const PF = hermiteTable(xf, NM), PD = hermiteTable(xd, NM);
const trap = (f) => { let s = 0; for (let i = 0; i < GF; i++) s += (i === 0 || i === GF - 1 ? 0.5 : 1) * f[i]; return s * DXF; };
const ORTH = (() => { let d = 0; for (let m = 0; m < 40; m++) for (let n = m; n < 40; n++) { let s = 0; const a = PF[m], b = PF[n]; for (let i = 0; i < GF; i++) s += (i === 0 || i === GF - 1 ? 0.5 : 1) * a[i] * b[i]; d = Math.max(d, Math.abs(s * DXF - (m === n ? 1 : 0))); } return d; })();
/* the box takes the fraction of the grid cell around x that lies inside [−1, 2], so its jumps cost only O(dx²) in the trapezoidal rule */
const TARGET_FN = {
  box: (x) => Math.max(0, Math.min(x + DXF / 2, 2) - Math.max(x - DXF / 2, -1)) / DXF, tri: (x) => Math.max(0, 1 - Math.abs(x) / 2),
  gauss: (x) => Math.exp(-((x - 1.5) ** 2) / 2), hump: (x) => Math.exp(-((x - 2) ** 2)) + Math.exp(-((x + 2) ** 2))
};
/* exact L² norms: ∫box² = 3, ∫tri² = 4/3, ∫gauss² = √π, ∫hump² = 2√(π/2)(1 + e^{−8}) */
const TARGET_NORM = { box: Math.sqrt(3), tri: Math.sqrt(4 / 3), gauss: Math.PI ** 0.25, hump: Math.sqrt(2 * Math.sqrt(Math.PI / 2) * (1 + Math.exp(-8))) }, TARGET_COEF = {};
for (const k of TGTS) { const f = Float64Array.from(xf, TARGET_FN[k]); TARGET_COEF[k] = PF.map((p) => trap(Float64Array.from(p, (v, i) => v * f[i])) / TARGET_NORM[k]); }
function coherentCoef(alpha, nmax) { const c = new Float64Array(nmax); let t = Math.exp(-alpha * alpha / 2); for (let n = 0; n < nmax; n++) { c[n] = t; t *= alpha / Math.sqrt(n + 1); } return c; }
/* complex coefficient vectors as {re, im} arrays */
const cvec = (re, im) => ({ re: Float64Array.from(re), im: im ? Float64Array.from(im) : new Float64Array(re.length) });

/* =====================================================================
   4. The model
   ===================================================================== */
let MODEL = null, dirty = true;
function rationalOf(r) { for (let q = 1; q <= 8; q++) { const p = Math.round(r * q); if (p > 0 && Math.abs(p / q - r) < 1e-6) { const g = gcd(p, q); return [p / g, q / g]; } } return null; }
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function build() {
  const M = { dim: S.dim };
  if (S.dim === 2 && S.alpha > ALPHA2) S.alpha = ALPHA2;
  if (S.dim === 1) {
    let c;
    if (S.src1 === 'eigen') { c = new Float64Array(NM); c[S.n] = 1; }
    else if (S.src1 === 'coherent') c = coherentCoef(S.alpha, NM);
    else if (S.src1 === 'cat') { const a = coherentCoef(S.alpha, NM); c = Float64Array.from(a, (v, n) => (n % 2 ? 0 : 2 * v)); const nn = Math.sqrt(c.reduce((s, v) => s + v * v, 0)); c = c.map((v) => v / nn); }
    else c = Float64Array.from(TARGET_COEF[S.tgt]);
    const full = c.slice(), shown = S.src1 === 'target' ? c.map((v, n) => (n < S.terms ? v : 0)) : c;
    const tail = [], ESum = []; let acc = 0, accE = 0;
    for (let n = 0; n <= NM; n++) { tail.push(Math.max(0, 1 - acc)); ESum.push(accE); if (n < NM) { acc += full[n] ** 2; accE += ((n + 0.5) * full[n]) ** 2; } }
    const norm = shown.reduce((s, v) => s + v * v, 0), meanE = shown.reduce((s, v, n) => s + (n + 0.5) * v * v, 0) / Math.max(1e-300, norm);
    const rel = ESum[NM] > 1e-12 ? (ESum[NM] - ESum[40]) / ESum[NM] : 0;
    Object.assign(M, { c: cvec(shown), full, tail, ESum, norm, meanE, inDomain: rel < 0.02, ESumMax: ESum[NM], period: 2 * Math.PI, span: 4 * Math.PI,
      errN: S.src1 === 'target' ? tail[S.terms] : null, target: S.src1 === 'target' ? Float64Array.from(xd, (x) => TARGET_FN[S.tgt](x) / TARGET_NORM[S.tgt]) : null });
  } else {
    const w2 = S.ratio, py = hermiteTable(Float64Array.from({ length: G2 }, (_, i) => -X2 + 2 * X2 * i / (G2 - 1)), NM2, w2), px = hermiteTable(Float64Array.from({ length: G2 }, (_, i) => -X2 + 2 * X2 * i / (G2 - 1)), NM2, 1);
    const one = (k) => { const v = new Float64Array(NM2); v[k] = 1; return cvec(v); };
    let terms;
    if (S.src2 === 'eig2') terms = [{ w: [1, 0], a: one(Math.min(S.n, 8)), b: one(S.n2) }];
    else if (S.src2 === 'coh2') {                     // x: α, y: β = iα, so c_m = e^{−|α|²/2}(iα)^m/√m!
      const base = coherentCoef(S.alpha, NM2), re = new Float64Array(NM2), im = new Float64Array(NM2);
      for (let m = 0; m < NM2; m++) { const ph = [[1, 0], [0, 1], [-1, 0], [0, -1]][m % 4]; re[m] = base[m] * ph[0]; im[m] = base[m] * ph[1]; }
      terms = [{ w: [1, 0], a: cvec(base), b: { re, im } }];
    } else terms = [{ w: [Math.SQRT1_2, 0], a: one(1), b: one(0) }, { w: [0, Math.SQRT1_2], a: one(0), b: one(1) }];
    // joint coefficients c_{nm} = Σ_terms w·a_n·b_m, their weights, and the per-direction marginals
    const cj = new Float64Array(NM2 * NM2), pxm = new Float64Array(NM2), pym = new Float64Array(NM2);
    { const jr = new Float64Array(NM2 * NM2), ji = new Float64Array(NM2 * NM2);
      for (const q of terms) for (let n = 0; n < NM2; n++) for (let m = 0; m < NM2; m++) {
        const ar = q.a.re[n], ai = q.a.im[n], br = q.b.re[m], bi = q.b.im[m], pr = ar * br - ai * bi, pi = ar * bi + ai * br, k = n * NM2 + m;
        jr[k] += q.w[0] * pr - q.w[1] * pi; ji[k] += q.w[0] * pi + q.w[1] * pr;
      }
      for (let k = 0; k < cj.length; k++) { cj[k] = jr[k] ** 2 + ji[k] ** 2; pxm[Math.floor(k / NM2)] += cj[k]; pym[k % NM2] += cj[k]; } }
    const E2 = (n, m) => (n + 0.5) + w2 * (m + 0.5);
    let meanE = 0; for (let n = 0; n < NM2; n++) for (let m = 0; m < NM2; m++) meanE += E2(n, m) * cj[n * NM2 + m];
    const rat = rationalOf(w2), period = rat ? 2 * Math.PI * rat[1] : Infinity, span = rat ? Math.min(2 * period, 16 * Math.PI) : 12 * Math.PI;
    // 2D domain chart: shells n + m < K for K = 0 … NM2 (every shell below NM2 is complete)
    const tail = [], ESum = [];
    for (let K = 0; K <= NM2; K++) { let a = 0, e = 0; for (let n = 0; n < NM2; n++) for (let m = 0; m < NM2; m++) if (n + m < K) { const wgt = cj[n * NM2 + m]; a += wgt; e += E2(n, m) ** 2 * wgt; } tail.push(Math.max(0, 1 - a)); ESum.push(e); }
    const rel2 = ESum[NM2] > 1e-12 ? (ESum[NM2] - ESum[Math.round(NM2 * 2 / 3)]) / ESum[NM2] : 0;
    Object.assign(M, { terms, px, py, w2, pxm, pym, meanE, norm: tail.length ? 1 - tail[NM2] : 1, period, span, rat, tail, ESum, inDomain: rel2 < 0.02, ESumMax: ESum[NM2], errN: null });
    // the centre's path ⟨x⟩, ⟨y⟩ over the whole span
    M.trail = []; for (let k = 0; k <= 240; k++) { const t = span * k / 240, f = field2(M, t); M.trail.push(centre2(f)); }
    M.rho0max = Math.max(...field2(M, 0).dens);
  }
  M.revivalErr = revivalError(M);
  MODEL = M;
}
/* ψ(x, t) on the display grid (1D) */
function psi1(M, t) {
  const re = new Float64Array(GD), im = new Float64Array(GD);
  for (let n = 0; n < NM; n++) {
    const cr = M.c.re[n], ci = M.c.im[n]; if (!cr && !ci) continue;
    const a = -(n + 0.5) * t, co = Math.cos(a), si = Math.sin(a), zr = cr * co - ci * si, zi = cr * si + ci * co, p = PD[n];
    for (let i = 0; i < GD; i++) { re[i] += zr * p[i]; im[i] += zi * p[i]; }
  }
  return { re, im };
}
function meanX1(M, t) {                                // ⟨x⟩ = √2 Σ √(n+1) Re(c̄_n c_{n+1}) with phases, divided by the norm
  let s = 0;
  for (let n = 0; n + 1 < NM; n++) {
    const a = -(n + 0.5) * t, b = -(n + 1.5) * t, ar = M.c.re[n] * Math.cos(a) - M.c.im[n] * Math.sin(a), ai = M.c.re[n] * Math.sin(a) + M.c.im[n] * Math.cos(a);
    const br = M.c.re[n + 1] * Math.cos(b) - M.c.im[n + 1] * Math.sin(b), bi = M.c.re[n + 1] * Math.sin(b) + M.c.im[n + 1] * Math.cos(b);
    s += Math.sqrt(n + 1) * (ar * br + ai * bi);
  }
  return Math.SQRT2 * s / Math.max(1e-300, M.norm);
}
/* ψ(x, y, t) on the 2D grid as a sum of separable products */
function field2(M, t) {
  const re = new Float64Array(G2 * G2), im = new Float64Array(G2 * G2);
  for (const term of M.terms) {
    const A = [new Float64Array(G2), new Float64Array(G2)], B = [new Float64Array(G2), new Float64Array(G2)];
    for (const [vec, tab, freq, out] of [[term.a, M.px, 1, A], [term.b, M.py, M.w2, B]]) {
      for (let n = 0; n < NM2; n++) {
        const cr = vec.re[n], ci = vec.im[n]; if (!cr && !ci) continue;
        const ang = -freq * (n + 0.5) * t, co = Math.cos(ang), si = Math.sin(ang), zr = cr * co - ci * si, zi = cr * si + ci * co, p = tab[n];
        for (let i = 0; i < G2; i++) { out[0][i] += zr * p[i]; out[1][i] += zi * p[i]; }
      }
    }
    const [wr, wi] = term.w;
    for (let j = 0; j < G2; j++) for (let i = 0; i < G2; i++) {
      const pr = A[0][i] * B[0][j] - A[1][i] * B[1][j], pi = A[0][i] * B[1][j] + A[1][i] * B[0][j], k = j * G2 + i;
      re[k] += wr * pr - wi * pi; im[k] += wr * pi + wi * pr;
    }
  }
  const dens = Float64Array.from(re, (v, k) => v * v + im[k] * im[k]);
  return { re, im, dens };
}
const grid2 = (i) => -X2 + 2 * X2 * i / (G2 - 1);
function centre2(f) { let sx = 0, sy = 0, s = 0; for (let j = 0; j < G2; j++) for (let i = 0; i < G2; i++) { const d = f.dens[j * G2 + i]; s += d; sx += d * grid2(i); sy += d * grid2(j); } return [sx / s, sy / s]; }
function revivalError(M) {
  if (!isFinite(M.period)) return null;
  if (M.dim === 1) { const a = psi1(M, 0), b = psi1(M, M.period); let e = 0; for (let i = 0; i < GD; i++) e = Math.max(e, Math.abs(a.re[i] ** 2 + a.im[i] ** 2 - b.re[i] ** 2 - b.im[i] ** 2)); return e; }
  const a = field2(M, 0), b = field2(M, M.period); let e = 0; for (let k = 0; k < a.dens.length; k++) e = Math.max(e, Math.abs(a.dens[k] - b.dens[k])); return e;
}
const tNow = () => S.nowFrac * MODEL.span;

/* =====================================================================
   5. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cvCo = $('coef'), cvDm = $('domain');
const f3 = (v) => (v === null || !isFinite(v) ? '—' : v.toFixed(3));
const sci = (v) => (v === null || !isFinite(v) ? '—' : v < 1e-3 ? v.toExponential(1) : v.toFixed(4));
function phaseRGB(re, im) {                            // hue from the phase: 0 cyan, π/2 amber, π magenta, 3π/2 green
  const a = Math.atan2(im, re), c = Math.cos(a), s = Math.sin(a);
  const w = [Math.max(0, c), Math.max(0, s), Math.max(0, -c), Math.max(0, -s)], cols = [COL.cyan, COL.amber, COL.magenta, GREEN];
  const tot = w.reduce((x, y) => x + y, 0) || 1; return [0, 1, 2].map((i) => w.reduce((acc, wk, k) => acc + wk * cols[k][i], 0) / tot);
}

/* =====================================================================
   6. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts, surf;
const LINES_MAX = 12000, PTS_MAX = 40;
const CAMS1 = { iso: [0.38, 1.36, 11.5], front: [0.0001, 1.5708, 11.5], top: [0.0001, 0.1, 12] };
const CAMS2 = { iso: [0.6, 0.95, 11.5], front: [0.0001, 1.45, 11.5], top: [0.0001, 0.05, 11] };
const cam = { theta: 0.5, phi: 1.25, r: 11.5, tTheta: 0.5, tPhi: 1.25, tR: 11.5, ty: 2, tTy: 2 };
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
    d.textContent = T('这个浏览器没有提供 WebGL，三维视图无法显示。下方的系数图、定义域图和右侧读数仍然可用。', 'This browser does not provide WebGL, so the 3D view cannot be shown. The coefficient chart, the domain chart and the readouts still work.');
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
  const sg = new THREE.PlaneGeometry(2 * X2 * SCALE_X * 1.2, 2 * X2 * SCALE_X * 1.2, G2 - 1, G2 - 1); sg.rotateX(-Math.PI / 2);
  sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(G2 * G2 * 3), 3));
  surf = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: true }));
  surf.visible = false; scene3.add(surf);
}
const X1 = (x) => x * SCALE_X, Y1 = (e) => e * SCALE_E, EAX = -7;   // EAX: the energy axis, left of the helix
function updateGL(time) {
  const M = MODEL, t = tNow();
  const L = lines.geometry.attributes, Pp = L.position.array, Cc = L.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp.set(a, 3 * v); Cc.set([col[0] * k, col[1] * k, col[2] * k], 3 * v); v++; Pp.set(b, 3 * v); Cc.set([col[0] * k, col[1] * k, col[2] * k], 3 * v); v++; };
  const segc = (a, b, ca, cb) => { if (v + 2 > LINES_MAX) return; Pp.set(a, 3 * v); Cc.set(ca, 3 * v); v++; Pp.set(b, 3 * v); Cc.set(cb, 3 * v); v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array.set(p, 3 * np); PT.aColor.array.set(col, 3 * np); PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  if (M.dim === 1) {
    surf.visible = false;
    // the well and the ladder: brighter rungs carry more weight
    let prev = null; for (let i = 0; i <= 160; i++) { const x = -5.2 + 10.4 * i / 160, p = [X1(x), Y1(x * x / 2), -0.6]; if (prev) seg(prev, p, COL.sigma, 0.35); prev = p; }
    for (let n = 0; n <= 12; n++) { const E = n + 0.5, xt = Math.sqrt(2 * E), w = M.c.re[n] ** 2 + M.c.im[n] ** 2; seg([X1(-xt), Y1(E), -0.6], [X1(xt), Y1(E), -0.6], COL.cyan, 0.12 + 0.88 * Math.min(1, Math.sqrt(w) * 1.6)); seg([X1(EAX), Y1(E), -0.6], [X1(EAX) + 0.12, Y1(E), -0.6], COL.cyan, 0.5); }
    seg([X1(EAX), 0, -0.6], [X1(EAX), Y1(13), -0.6], COL.gray, 0.4);
    // ψ(x, t): a helix of (Re, Im) around the mean-energy line, coloured by phase; |ψ|² in the back plane
    const ps = psi1(M, t), y0 = Y1(M.meanE);
    seg([X1(-XS), y0, 0], [X1(XS), y0, 0], COL.gray, 0.35);
    let pPrev = null, cPrev = null, dPrev = null;
    for (let i = 0; i < GD; i++) {
      const x = X1(xd[i]), p = [x, y0 + AMP * ps.re[i], AMP * ps.im[i]], col = phaseRGB(ps.re[i], ps.im[i]), d = [x, y0 + AMP * 1.2 * (ps.re[i] ** 2 + ps.im[i] ** 2), -0.6];
      if (pPrev) { segc(pPrev, p, cPrev, col); seg(dPrev, d, COL.amber, 0.9); }
      if (i % 6 === 0 && (ps.re[i] ** 2 + ps.im[i] ** 2) > 1e-4) seg([x, y0, 0], p, col, 0.35);
      pPrev = p; cPrev = col; dPrev = d;
    }
    if (M.target) { let tp = null; for (let i = 0; i < GD; i += 2) { const p = [X1(xd[i]), y0 + AMP * M.target[i], 0]; if (tp && (i / 2) % 2 === 0) seg(tp, p, COL.magenta, 0.8); tp = p; } }
    const mx = meanX1(M, t); dot([X1(mx), y0, 0], COL.sigma, 0.95, 2.4);
    if (S.src1 === 'coherent' || S.src1 === 'cat') { const xc = Math.SQRT2 * S.alpha * Math.cos(t); dot([X1(xc), Y1(xc * xc / 2), -0.6], COL.magenta, 0.6, 1.6); }
  } else {
    // 2D: the density as a height field coloured by phase, with the centre's path on the floor
    surf.visible = true;
    const f = field2(M, t), pos = surf.geometry.attributes.position, colA = surf.geometry.attributes.color, H = 2.6 / Math.max(1e-9, M.rho0max);
    for (let j = 0; j < G2; j++) for (let i = 0; i < G2; i++) {
      const k = j * G2 + i, vi = j * G2 + i;
      pos.setXYZ(vi, grid2(i) * SCALE_X * 1.2, f.dens[k] * H, grid2(j) * SCALE_X * 1.2);
      const cc = phaseRGB(f.re[k], f.im[k]), bright = 0.05 + 0.95 * Math.min(1, Math.sqrt(f.dens[k] * H / 2.6));
      colA.setXYZ(vi, cc[0] * bright, cc[1] * bright, cc[2] * bright);
    }
    pos.needsUpdate = true; colA.needsUpdate = true;
    for (const E of [1, 2, 3, 4]) { let prev = null; for (let k = 0; k <= 72; k++) { const a = 2 * Math.PI * k / 72, p = [Math.sqrt(2 * E) * Math.cos(a) * SCALE_X * 1.2, 0.01, Math.sqrt(2 * E) / M.w2 * Math.sin(a) * SCALE_X * 1.2]; if (prev) seg(prev, p, COL.sigma, 0.3); prev = p; } }
    const upto = Math.round(S.nowFrac * 240); let tp = null;
    for (let k = 0; k <= upto; k++) { const [cx, cy] = M.trail[k], p = [cx * SCALE_X * 1.2, 0.02, cy * SCALE_X * 1.2]; if (tp) seg(tp, p, COL.amber, 1.0); tp = p; }
    const [cx, cy] = centre2(f); dot([cx * SCALE_X * 1.2, 0.05, cy * SCALE_X * 1.2], COL.sigma, 0.95, 2.4);
  }
  lines.geometry.setDrawRange(0, v); L.position.needsUpdate = true; L.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 58 * renderer.getPixelRatio();
  void time;
}

/* =====================================================================
   7. Camera
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k; cam.ty += (cam.tTy - cam.ty) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.5 : 1);
  camera.position.set(r * sp * Math.sin(cam.theta), cam.ty + r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0, cam.ty, 0);
}
function setCamPreset(name) {
  const p = (S.dim === 1 ? CAMS1 : CAMS2)[name]; if (!p) return; camName = name;
  let d = (p[0] - cam.theta) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  cam.tTheta = cam.theta + d; cam.tPhi = p[1]; cam.tR = p[2]; cam.tTy = camTy();
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === name)));
}
function camTy() { return S.dim === 1 ? 1.8 : 0.6; }
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
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(24, Math.max(5, cam.tR * drag.pinch / d)); drag.pinch = d; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY;
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => { if (!drag.pts.has(ev.pointerId)) return; drag.pts.delete(ev.pointerId); if (drag.pts.size === 0) drag.pinch = 0; };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(24, Math.max(5, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   8. Tags
   ===================================================================== */
function mkTag(cls) { const el = document.createElement('div'); el.className = 'tag ' + cls; tagsBox.appendChild(el); return el; }
const tagWell = mkTag('raw'), tagMean = mkTag('raw'), tagE0 = mkTag('cy raw tick'), tagE12 = mkTag('cy raw tick'), tagDens = mkTag('hot raw'), tagTgt = mkTag('mg raw'), tagCls = mkTag('mg raw');
function labelStaticTags() {
  tagWell.textContent = T('势阱 ½mω²x²', 'WELL ½mω²x²'); tagE0.textContent = 'E₀ = ½ħω'; tagE12.textContent = 'E₁₂ = 12½ħω';
  tagDens.textContent = '|ψ|²'; tagTgt.textContent = T('目标形状', 'TARGET'); tagCls.textContent = T('经典小球', 'CLASSICAL BALL');
}
labelStaticTags();
function placeTag(el, p, show = true) {
  if (!glOK || !show) { el.style.display = 'none'; return; }
  const q = proj3(p); if (q.z > 1 || q.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const w = el.offsetWidth, W = stage.clientWidth, right = el.classList.contains('tick');     // keep the whole tag inside the stage
  const x = right ? Math.min(W - 6, Math.max(w + 6, q.x)) : Math.min(W - w / 2 - 6, Math.max(w / 2 + 6, q.x));
  el.style.left = x + 'px'; el.style.top = q.y + 'px';
}
function updateTags() {
  const M = MODEL, one = M.dim === 1, t = tNow();
  placeTag(tagWell, [X1(4.6) + 0.25, Y1(10.6), -0.6], one);
  placeTag(tagE0, [X1(EAX) - 0.1, Y1(0.5), -0.6], one);
  placeTag(tagE12, [X1(EAX) - 0.1, Y1(12.5), -0.6], one);
  tagMean.textContent = `⟨E⟩ = ${M.meanE.toFixed(2)}ħω`;
  placeTag(tagMean, [X1(XS) + 0.7, Y1(M.meanE), 0], one);
  if (one) { const ps = psi1(M, t); let k = 0, best = -1; for (let i = 0; i < GD; i++) { const d = ps.re[i] ** 2 + ps.im[i] ** 2; if (d > best) { best = d; k = i; } }
    placeTag(tagDens, [X1(xd[k]), Y1(M.meanE) + AMP * 1.2 * best + 0.3, -0.6], true); } else placeTag(tagDens, [0, 0, 0], false);
  placeTag(tagTgt, [X1(3.2), Y1(M.meanE) + 1.2, 0], one && !!M.target);
  const xc = Math.SQRT2 * S.alpha * Math.cos(t);
  placeTag(tagCls, [X1(xc) + (xc >= 0 ? 1.15 : -1.15), Y1(xc * xc / 2) - 0.15, -0.6], one && (S.src1 === 'coherent' || S.src1 === 'cat') && S.alpha > 0.4);
}

/* =====================================================================
   9. 2D panels
   ===================================================================== */
function frame2d(cv, pl0 = 36) {
  const dpr = fitCanvas(cv), ctx = cv.getContext('2d'), Wd = cv.width, Hh = cv.height;
  ctx.clearRect(0, 0, Wd, Hh);
  const pl = pl0 * dpr, pr = 12 * dpr, pt = 10 * dpr, pb = 20 * dpr;
  return { dpr, ctx, W: Wd, Hh, pl, pt, iw: Wd - pl - pr, ih: Hh - pt - pb };
}
function legendBox(F, items, x0, y0) {
  const { ctx, dpr } = F; ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const w = Math.max(...items.map(([t]) => ctx.measureText(t).width)) + 22 * dpr;
  ctx.fillStyle = 'rgba(2, 6, 12, 0.85)'; ctx.fillRect(x0 - 4 * dpr, y0 - 3 * dpr, w + 6 * dpr, items.length * 13 * dpr + 4 * dpr);
  items.forEach(([t, c, dash], k) => { ctx.strokeStyle = c; ctx.lineWidth = 2 * dpr; ctx.setLineDash(dash ? [4 * dpr, 3 * dpr] : []); ctx.beginPath(); ctx.moveTo(x0, y0 + k * 13 * dpr + 6 * dpr); ctx.lineTo(x0 + 14 * dpr, y0 + k * 13 * dpr + 6 * dpr); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = INK; ctx.fillText(t, x0 + 18 * dpr, y0 + k * 13 * dpr); });
}
function drawCoef() {
  const F = frame2d(cvCo); if (F.iw < 40 || F.ih < 30) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL;
  const series = M.dim === 1 ? [[Array.from(M.full, (v) => v * v), CY]] : [[Array.from(M.pxm), CY], [Array.from(M.pym), AM]];
  const logY = M.dim === 1 && S.src1 === 'target', LO = -10;            // shapes: log scale, so the slow decay shows
  const nShow = M.dim === 1 ? (logY ? 60 : Math.max(16, Math.min(60, lastSig(series[0][0]) + 4))) : Math.max(12, Math.min(24, Math.max(lastSig(series[0][0]), lastSig(series[1][0])) + 4));
  const ymax = Math.max(1e-9, ...series.flatMap(([a]) => a.slice(0, nShow))) * 1.12, bw = iw / nShow;
  const hOf = (v) => (logY ? Math.max(0, Math.log10(Math.max(1e-300, v)) - LO) / -LO : v / ymax) * ih;
  const ticks = logY ? [[0, '1e-10'], [0.5, '1e-5'], [1, '1']] : [0, 0.5, 1].map((g) => [g, (g * ymax).toFixed(2)]);
  ctx.strokeStyle = FAINT; ctx.globalAlpha = 0.6; ctx.beginPath(); for (const [g] of ticks) { const y = pt + ih - g * ih; ctx.moveTo(pl, y); ctx.lineTo(pl + iw, y); } ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const [g, lab] of ticks) ctx.fillText(lab, pl - 5 * dpr, pt + ih - g * ih);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const n of [0, Math.round(nShow / 2), nShow - 1]) ctx.fillText(`n=${n}`, pl + (n + 0.5) * bw, pt + ih + 3 * dpr);
  series.forEach(([arr, col], si) => {
    for (let n = 0; n < nShow; n++) {
      const h = hOf(arr[n]), x = pl + n * bw + (series.length === 2 ? si * bw * 0.45 : bw * 0.12), w = series.length === 2 ? bw * 0.42 : bw * 0.76;
      const cut = logY && n >= S.terms;
      ctx.fillStyle = col; ctx.globalAlpha = cut ? 0.2 : 0.85; ctx.fillRect(x, pt + ih - h, Math.max(1, w), h);
    }
  });
  ctx.globalAlpha = 1;
  if (logY) { const x = pl + S.terms * bw; ctx.strokeStyle = MG; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + ih); ctx.stroke(); ctx.setLineDash([]); }
  if (M.dim === 2) legendBox(F, [[T('x 方向 |a_n|²', 'x mode |a_n|²'), CY], [T('y 方向 |b_m|²', 'y mode |b_m|²'), AM]], pl + iw * 0.62, pt + 4 * dpr);
  $('coMeta').textContent = M.dim === 1 ? (logY ? T(`对数刻度 · 前 ${S.terms} 项在品红线左边`, `log scale · the first ${S.terms} terms sit left of the magenta line`) : T(`横轴：能级 n，E_n = n + ½`, `x: level n, E_n = n + ½`)) : T('两个方向各自的能级分布', 'level distribution of each direction');
}
const lastSig = (arr) => { let k = 0; arr.forEach((v, n) => { if (v > 1e-6) k = n; }); return k; };
function drawDomain() {
  const F = frame2d(cvDm, 40); if (F.iw < 40 || F.ih < 30) return;
  const { ctx, dpr, pl, pt, ih } = F, M = MODEL, NN = M.tail.length - 1, iw = F.iw - 30 * dpr;
  const LO = -12, HI = 0, X = (n) => pl + n / NN * iw, Y = (v) => pt + ih - (Math.min(HI, Math.max(LO, Math.log10(Math.max(1e-300, v)))) - LO) / (HI - LO) * ih;
  const emax = Math.max(1e-9, ...M.ESum) * 1.08, YE = (v) => pt + ih - v / emax * ih, ecol = M.inDomain ? OK : MG;
  ctx.strokeStyle = FAINT; ctx.globalAlpha = 0.6; ctx.beginPath(); for (const g of [-12, -8, -4, 0]) { ctx.moveTo(pl, Y(10 ** g)); ctx.lineTo(pl + iw, Y(10 ** g)); } ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = CY; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of [-12, -8, -4, 0]) ctx.fillText(`1e${g}`, pl - 4 * dpr, Y(10 ** g));
  ctx.fillStyle = ecol; ctx.textAlign = 'left'; for (const g of [0, 0.5, 1]) ctx.fillText((g * emax).toFixed(emax < 10 ? 1 : 0), pl + iw + 4 * dpr, YE(g * emax));
  ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const n of [0, Math.round(NN / 2), NN]) ctx.fillText(`N=${n}`, X(n), pt + ih + 3 * dpr);
  const curve = (ys, col) => { ctx.strokeStyle = col; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ys.forEach((y, n) => { if (n) ctx.lineTo(X(n), y); else ctx.moveTo(X(n), y); }); ctx.stroke(); };
  curve(M.tail.map(Y), CY); curve(M.ESum.map(YE), ecol);
  if (M.dim === 1 && S.src1 === 'target') { ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(S.terms), Y(M.tail[S.terms]), 4 * dpr, 0, 2 * Math.PI); ctx.fill(); }
  const key = `${M.dim}|${M.inDomain}|${TRV.lang()}`;
  if ($('dmMeta').dataset.key !== key) {
    $('dmMeta').dataset.key = key;
    const sw = (c, t) => `<span class="it"><span class="sw" style="--c:${c}"></span>${t}</span>`;
    $('dmMeta').innerHTML = M.dim === 1
      ? `${sw(CY, T('误差 Σ<sub>n≥N</sub>|c<sub>n</sub>|²（左，对数）', 'error Σ<sub>n≥N</sub>|c<sub>n</sub>|² (left, log)'))} ${sw(ecol, T('Σ<sub>n&lt;N</sub>E<sub>n</sub>²|c<sub>n</sub>|²（右）', 'Σ<sub>n&lt;N</sub>E<sub>n</sub>²|c<sub>n</sub>|² (right)'))}`
      : `${sw(CY, T('n₁+n₂ ≥ N 的权重（左，对数）', 'weight with n₁+n₂ ≥ N (left, log)'))} ${sw(ecol, T('Σ<sub>n₁+n₂&lt;N</sub>E²|c|²（右）', 'Σ<sub>n₁+n₂&lt;N</sub>E²|c|² (right)'))}`;
  }
}

/* =====================================================================
   10. Readouts and controls
   ===================================================================== */
let syncedFrac = NaN, toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function syncOutputs() {
  if (dirty) { build(); dirty = false; toasted = false; }
  const M = MODEL, t = tNow(); syncedFrac = S.nowFrac;
  $('oN').textContent = String(S.n); $('oN2').textContent = String(S.n2); $('oAlpha').textContent = S.alpha.toFixed(2); $('oTerms').textContent = String(S.terms); $('oRatio').textContent = S.ratio.toFixed(3);
  const one = S.dim === 1;
  $('srcChips1').hidden = !one; $('srcChips2').hidden = one; $('ratioField').hidden = one; $('ratioChips').hidden = one;
  $('nField').hidden = one ? S.src1 !== 'eigen' : S.src2 !== 'eig2'; $('n2Field').hidden = one || S.src2 !== 'eig2';
  $('aField').hidden = one ? !(S.src1 === 'coherent' || S.src1 === 'cat') : S.src2 !== 'coh2';
  $('tgtChips').hidden = !(one && S.src1 === 'target'); $('termsField').hidden = !(one && S.src1 === 'target');
  $('nq').max = one ? '12' : '8'; $('alpha').max = one ? '3.5' : String(ALPHA2); $('alpha').value = S.alpha;
  document.querySelectorAll('#dimChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.dim === S.dim)));
  document.querySelectorAll('#srcChips1 .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.src === S.src1)));
  document.querySelectorAll('#srcChips2 .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.src === S.src2)));
  document.querySelectorAll('#tgtChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tgt === S.tgt)));
  document.querySelectorAll('#ratioChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(parseFloat(b.dataset.ratio) - S.ratio) < 1e-6)));
  // readouts
  $('roE').textContent = M.meanE.toFixed(3); $('roNorm').textContent = M.norm.toFixed(6);
  $('roDom').textContent = M.inDomain ? T(`收敛 · ${M.ESumMax.toFixed(2)}`, `converges · ${M.ESumMax.toFixed(2)}`) : T(`发散 · 前 80 项已 ${M.ESumMax.toFixed(1)}`, `diverges · ${M.ESumMax.toFixed(1)} after 80 terms`);
  $('roT').textContent = isFinite(M.period) ? (M.dim === 1 || !M.rat || M.rat[1] === 1 ? '2π/ω₁ = 6.283' : `2π·${M.rat[1]}/ω₁ = ${M.period.toFixed(3)}`) : T('∞ · 永不精确回归', '∞ · never exact');
  $('roOrth').textContent = ORTH.toExponential(1);
  if (one && S.src1 === 'target') { $('roL6').innerHTML = T(`前 N 项误差 ‖f − f<sub>N</sub>‖²`, `Error of the first N terms ‖f − f<sub>N</sub>‖²`); $('ro6').textContent = sci(M.errN); }
  else if (one) { $('roL6').innerHTML = T('此刻的平均位置 ⟨x⟩', 'Mean position now ⟨x⟩'); $('ro6').textContent = meanX1(M, t).toFixed(3); }
  else { const [cx, cy] = centre2(field2(M, t)); $('roL6').innerHTML = T('此刻的中心 (⟨x⟩, ⟨y⟩)', 'Centre now (⟨x⟩, ⟨y⟩)'); $('ro6').textContent = `(${cx.toFixed(2)}, ${cy.toFixed(2)})`; }
  $('roNote').innerHTML = (isFinite(M.period)
    ? T(`每过一个回归周期，每个系数都乘上同一个相位，概率密度精确复原（数值复原误差 ${M.revivalErr.toExponential(1)}）。`, `After each revival period every coefficient gains the same phase and the probability density returns exactly (numerical revival error ${M.revivalErr.toExponential(1)}).`)
    : T('频率比是无理数：没有任何时刻所有相位同时对齐，永不精确回归。', 'The frequency ratio is irrational: the phases never all line up again, so there is no exact revival.'))
    + ' ' + T(`基态能量 ½ħω 不为零；这个态的平均能量 ⟨E⟩ = ${M.meanE.toFixed(3)}ħω ≥ ½ħω（K 非负）。`, `The ground-state energy ½ħω is not zero; this state has mean energy ⟨E⟩ = ${M.meanE.toFixed(3)}ħω ≥ ½ħω (K is nonnegative).`);
  $('domNote').innerHTML = M.inDomain
    ? T(`Σ E<sub>n</sub>²|c<sub>n</sub>|² 收敛到 ${M.ESumMax.toFixed(3)}：系数衰减得够快，这个态在 H 的定义域里，Hψ 是一个真正的平方可积函数。`, `Σ E<sub>n</sub>²|c<sub>n</sub>|² converges to ${M.ESumMax.toFixed(3)}: the coefficients decay fast enough, the state is in the domain of H, and Hψ is a genuine square-integrable function.`)
    : T(`Σ E<sub>n</sub>²|c<sub>n</sub>|² 一直在涨（前 40 项 ${M.ESum[40].toFixed(1)}，前 80 项 ${M.ESumMax.toFixed(1)}）：这个形状拼得出来，却不在 H 的定义域里——它的跳跃或尖角让二阶导数不是平方可积函数。判断来自前 80 项的数值趋势，是模型计算。`, `Σ E<sub>n</sub>²|c<sub>n</sub>|² keeps growing (${M.ESum[40].toFixed(1)} after 40 terms, ${M.ESumMax.toFixed(1)} after 80): this shape can be built but is not in the domain of H, because its jumps or corners make the second derivative fail to be square-integrable. The verdict comes from the numerical trend of the first 80 terms; it is a model calculation.`);
  // notes
  $('presetNote').textContent = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义参数。', 'Custom settings.');
  $('dimNote').innerHTML = one ? T('一维：x 只有一个方向，能级 E<sub>n</sub> = ħω(n + ½)。', 'One dimension: a single direction x, with levels E<sub>n</sub> = ħω(n + ½).')
    : (M.rat ? T(`二维：E = ħω₁(n₁ + ½) + ħω₂(n₂ + ½)，频率比 ${M.rat[0]}/${M.rat[1]} 是有理数，轨道闭合、精确回归。`, `Two dimensions: E = ħω₁(n₁ + ½) + ħω₂(n₂ + ½); the frequency ratio ${M.rat[0]}/${M.rat[1]} is rational, so orbits close and revivals are exact.`)
      : T('二维：频率比在分母不超过 8 的范围里找不到有理数，按无理数处理：轨道永不闭合。', 'Two dimensions: no fraction with denominator up to 8 matches the ratio, so it is treated as irrational: the orbit never closes.'));
  $('srcNote').innerHTML = one ? ({
    eigen: T(`Φ<sub>${S.n}</sub>：${S.n} 个节点，能量 ${(S.n + 0.5).toFixed(1)}ħω。`, `Φ<sub>${S.n}</sub>: ${S.n} nodes, energy ${(S.n + 0.5).toFixed(1)}ħω.`),
    coherent: T(`平均能级 |α|² = ${(S.alpha ** 2).toFixed(2)}，摆幅 √2|α| = ${(Math.SQRT2 * S.alpha).toFixed(2)}ℓ。`, `Mean level |α|² = ${(S.alpha ** 2).toFixed(2)}, swing √2|α| = ${(Math.SQRT2 * S.alpha).toFixed(2)}ℓ.`),
    cat: T(`|α⟩ + |−α⟩，|α| = ${S.alpha.toFixed(2)}：只剩偶数能级。`, `|α⟩ + |−α⟩ with |α| = ${S.alpha.toFixed(2)}: only even levels remain.`),
    target: T(`用前 ${S.terms} 个厄米函数拼目标形状，误差 ${sci(M.errN)}。按 <kbd>+</kbd><kbd>−</kbd> 增减项数。`, `The first ${S.terms} Hermite functions build the target shape with error ${sci(M.errN)}. Press <kbd>+</kbd><kbd>−</kbd> to add or remove terms.`)
  })[S.src1] : ({
    eig2: T(`Φ<sub>${Math.min(S.n, 8)},${S.n2}</sub>：能量 ${((Math.min(S.n, 8) + 0.5) + S.ratio * (S.n2 + 0.5)).toFixed(3)}ħω₁，密度静止。`, `Φ<sub>${Math.min(S.n, 8)},${S.n2}</sub>: energy ${((Math.min(S.n, 8) + 0.5) + S.ratio * (S.n2 + 0.5)).toFixed(3)}ħω₁, still density.`),
    coh2: T(`两个方向各是一个 |α| = ${S.alpha.toFixed(2)} 的相干态，相位差 90°：中心走李萨如曲线。`, `Each direction holds a coherent state with |α| = ${S.alpha.toFixed(2)}, a quarter period apart: the centre traces a Lissajous curve.`),
    vortex: T(`(Φ₁₀ + iΦ₀₁)/√2。${Math.abs(S.ratio - 1) < 1e-9 ? '各向同性时两项同能量，密度静止。' : '频率比不是 1 时两项能量不同，密度会转动、变形。'}`, `(Φ₁₀ + iΦ₀₁)/√2. ${Math.abs(S.ratio - 1) < 1e-9 ? 'In the isotropic case both terms have the same energy and the density stays still.' : 'With a ratio other than 1 the two terms have different energies, so the density turns and deforms.'}`)
  })[S.src2];
  // pills, clock, HUD
  $('pillT').innerHTML = `t <strong>${t.toFixed(2)}</strong>`;
  $('pillE').innerHTML = `⟨E⟩ <strong>${M.meanE.toFixed(2)}</strong>`;
  $('pillDom').innerHTML = `DOMAIN <strong>${M.inDomain ? 'IN' : 'OUT'}</strong>`;
  $('pillMode').innerHTML = `MODE <strong>${S.dim}D</strong>`;
  const per = isFinite(M.period) ? M.period : 2 * Math.PI;
  $('clock').innerHTML = `${(t / per).toFixed(2)} <small>T</small>`;
  $('hudBig').textContent = one ? T(`t = ${t.toFixed(2)}/ω · 第 ${(t / (2 * Math.PI)).toFixed(2)} 个周期`, `t = ${t.toFixed(2)}/ω · period ${(t / (2 * Math.PI)).toFixed(2)}`) : T(`t = ${t.toFixed(2)}/ω₁ · 频率比 ${S.ratio.toFixed(3)}`, `t = ${t.toFixed(2)}/ω₁ · ratio ${S.ratio.toFixed(3)}`);
  $('hudSub').textContent = one ? T('螺旋 = 复波函数（颜色 = 相位）· 琥珀 = |ψ|² · 发亮的能级 = 权重大的能级', 'helix = complex wave function (colour = phase) · amber = |ψ|² · bright rungs = heavily weighted levels')
    : T('高度 = 概率密度 · 颜色 = 相位 · 琥珀线 = 中心走过的路', 'height = probability density · colour = phase · amber line = path of the centre');
  if (!toasted && S.playing && isFinite(M.period) && t >= M.period - 1e-9) {
    toasted = true;
    toast(T(`<b>精确回归</b>：一个周期后概率密度回到起点（误差 ${M.revivalErr.toExponential(1)}）。`, `<b>Exact revival</b>: after one period the probability density is back where it started (error ${M.revivalErr.toExponential(1)}).`));
  }
}
function syncRail() {
  const key = `${MODEL.span}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  const per = isFinite(MODEL.period) ? MODEL.period : 2 * Math.PI, k = Math.max(1, Math.round(MODEL.span / per));
  $('marks').innerHTML = Array.from({ length: k + 1 }, (_, i) => `<i class="${i === 0 ? 'first' : i === k ? 'last' : ''}" style="left:${(i * per / MODEL.span * 100).toFixed(2)}%">${i ? `${i}T` : '0'}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
function setControls() { $('nq').value = S.n; $('nq2').value = S.n2; $('alpha').value = S.alpha; $('terms').value = S.terms; $('ratio').value = S.ratio; }
$('nq').addEventListener('input', () => { S.n = parseInt($('nq').value, 10); custom(); });
$('nq2').addEventListener('input', () => { S.n2 = parseInt($('nq2').value, 10); custom(); });
$('alpha').addEventListener('input', () => { S.alpha = parseFloat($('alpha').value); custom(); });
$('terms').addEventListener('input', () => { S.terms = parseInt($('terms').value, 10); custom(); });
$('ratio').addEventListener('input', () => { S.ratio = parseFloat($('ratio').value); custom(); });
document.querySelectorAll('#ratioChips .chip').forEach((b) => b.addEventListener('click', () => { const r = parseFloat(b.dataset.ratio); if (isFinite(r)) { S.ratio = r; $('ratio').value = r; custom(); } }));
document.querySelectorAll('#dimChips .chip').forEach((b) => b.addEventListener('click', () => { const d = b.dataset.dim === '2' ? 2 : 1; if (S.dim !== d) { S.dim = d; custom(); setCamPreset(camName); } }));
document.querySelectorAll('#srcChips1 .chip').forEach((b) => b.addEventListener('click', () => { const s = SRC1.includes(b.dataset.src) ? b.dataset.src : 'eigen'; if (S.src1 !== s) { S.src1 = s; custom(); } }));
document.querySelectorAll('#srcChips2 .chip').forEach((b) => b.addEventListener('click', () => { const s = SRC2.includes(b.dataset.src) ? b.dataset.src : 'eig2'; if (S.src2 !== s) { S.src2 = s; custom(); } }));
document.querySelectorAll('#tgtChips .chip').forEach((b) => b.addEventListener('click', () => { const s = TGTS.includes(b.dataset.tgt) ? b.dataset.tgt : 'box'; if (S.tgt !== s) { S.tgt = s; custom(); } }));
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  for (const k of ['dim', 'src1', 'src2', 'n', 'alpha', 'tgt', 'terms', 'ratio']) if (p[k] !== undefined) S[k] = p[k];
  setControls(); S.preset = name; markPreset(); dirty = true; setCamPreset('iso');
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
    const step = Math.PI / 4 / MODEL.span, k = Math.round(S.nowFrac / step) + (ev.key === 'ArrowRight' ? 1 : -1);
    S.nowFrac = Math.min(1, Math.max(0, k * step)); $('now').value = S.nowFrac;
  }
  else if (ev.key === '+' || ev.key === '=' || ev.key === '-' || ev.key === '_') {
    const up = ev.key === '+' || ev.key === '=';
    if (S.dim === 1 && S.src1 === 'target') { S.terms = Math.min(80, Math.max(1, S.terms + (up ? 1 : -1))); $('terms').value = S.terms; custom(); }
    else if (S.dim === 1 && S.src1 === 'eigen') { S.n = Math.min(12, Math.max(0, S.n + (up ? 1 : -1))); $('nq').value = S.n; custom(); }
  }
});

/* =====================================================================
   11. Main loop
   ===================================================================== */
let lastT = performance.now(), tAcc = 0, frameCount = 0;
function resize() {
  if (!glOK) return;
  const r = stage.getBoundingClientRect();
  renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
  camera.aspect = Math.max(0.2, r.width / Math.max(1, r.height)); camera.updateProjectionMatrix();
}
function frame(tms) {
  frameCount++;
  const dtSec = Math.min(0.1, (tms - lastT) / 1000); lastT = tms; tAcc += dtSec;
  if (dirty) syncOutputs();
  if (S.playing && !scrubbing) {
    if (S.hold > 0) { S.hold -= dtSec; if (S.hold <= 0) { S.nowFrac = S.dir > 0 ? 0 : 1; toasted = false; } }
    else {
      const secs = MODEL.span / (2 * Math.PI) * 5;                     // five seconds per natural period 2π/ω₁
      S.nowFrac += S.dir * dtSec * S.speed / secs;
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 1.6; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.6; }
    }
    $('now').value = S.nowFrac;
  }
  if (S.nowFrac !== syncedFrac) syncOutputs();
  syncRail();
  if (glOK) { updateCamera(dtSec); updateGL(tAcc); renderer.render(scene3, camera); updateTags(); }
  drawCoef(); drawDomain();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { labelStaticTags(); syncOutputs(); });

/* read-only probe for automated browser tests */
window.OSC_DEBUG = {
  pending: () => dirty || S.nowFrac !== syncedFrac,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, t = tNow(), base = { dim: M.dim, t, meanE: M.meanE, norm: M.norm, inDomain: M.inDomain, ESum: M.ESum.slice(), tail: M.tail.slice(), period: M.period, span: M.span, revivalErr: M.revivalErr, orth: ORTH };
    if (M.dim === 1) return { ...base, cRe: Array.from(M.c.re), cIm: Array.from(M.c.im), full: Array.from(M.full), errN: M.errN, meanX: meanX1(M, t), xd: Array.from(xd) };
    const f = field2(M, t);
    return { ...base, w2: M.w2, rat: M.rat, pxm: Array.from(M.pxm), pym: Array.from(M.pym), centre: centre2(f), terms: M.terms.map((q) => ({ w: q.w.slice(), aRe: Array.from(q.a.re), aIm: Array.from(q.a.im), bRe: Array.from(q.b.re), bIm: Array.from(q.b.im) })) };
  },
  psi: (t) => { const M = MODEL; if (M.dim !== 1) return null; const p = psi1(M, t); return { re: Array.from(p.re), im: Array.from(p.im) }; },
  density2: (t) => { const M = MODEL; if (M.dim !== 2) return null; return Array.from(field2(M, t).dens); },
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('cat'); S.playing = false; setPlayUI(); S.nowFrac = 0.125; $('now').value = S.nowFrac; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; cam.ty = cam.tTy; }
applyPreset('coherent');
S.nowFrac = 0; S.playing = !reduceMotion; $('now').value = S.nowFrac;
setPlayUI();
requestAnimationFrame(frame);
})();
