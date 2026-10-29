/* UNCERTAINTY//LEDGER · 不确定性账本 · 不对易的代价记在哪里
   The Robertson–Schrödinger identity with its Gram remainder, ΔA²ΔB² = cov² + c² + G, on qubits (density matrices on the Bloch
   ball; for A = a·σ, B = b·σ the remainder is |a×b|²(1 − |r|²)) and on spin j under one-axis twisting e^(−iμJz²/2) with a
   Husimi sphere; then d + 1 mutually unbiased bases in prime dimension d: collision conservation Σ p² = 1 + tr ρ², the
   entropy bound Σ H ≥ (d + 1) log((d + 1)/(1 + tr ρ²)), and a seeded random local search for the least entropy sum.
   Frozen Lean anchors and literature results are named in the page text. Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, ok: OK, cyan: CY, magenta: MG } = TRV.palette;
const MODES = ['qubit', 'spin', 'mub', 'hunt'];
const PRIMES = [2, 3, 5, 7];
const RUN_SECONDS = 16, CURVE_N = 240, SNAPS = 600;
const DEG = Math.PI / 180;
const HUNT_PLAN = { 2: [12, 2500], 3: [24, 2500], 5: [24, 2500], 7: [16, 2500] };   // restarts × iterations per restart
const log2 = (x) => Math.log(x) / Math.LN2;
const H2 = (p) => { let s = 0; for (const x of p) if (x > 1e-300) s -= x * log2(x); return s; };   // Shannon entropy in bits

/* =====================================================================
   2. Complex vectors and matrices
   ===================================================================== */
const cvec = (d) => ({ re: new Float64Array(d), im: new Float64Array(d) });
function cinner(a, b) {   // ⟨a|b⟩ = Σ conj(a_k) b_k
  let re = 0, im = 0;
  for (let k = 0; k < a.re.length; k++) { re += a.re[k] * b.re[k] + a.im[k] * b.im[k]; im += a.re[k] * b.im[k] - a.im[k] * b.re[k]; }
  return { re, im };
}
const axpy = (x, c, y) => { const o = cvec(x.re.length); for (let k = 0; k < x.re.length; k++) { o.re[k] = x.re[k] - c * y.re[k]; o.im[k] = x.im[k] - c * y.im[k]; } return o; };   // x − c·y, c real
const cmat = (n) => ({ n, re: new Float64Array(n * n), im: new Float64Array(n * n) });
function mmul(A, B) {
  const n = A.n, C = cmat(n);
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
    const ar = A.re[i * n + k], ai = A.im[i * n + k]; if (!ar && !ai) continue;
    for (let j = 0; j < n; j++) { const br = B.re[k * n + j], bi = B.im[k * n + j]; C.re[i * n + j] += ar * br - ai * bi; C.im[i * n + j] += ar * bi + ai * br; }
  }
  return C;
}
const mtrace = (A) => { let re = 0, im = 0; for (let i = 0; i < A.n; i++) { re += A.re[i * A.n + i]; im += A.im[i * A.n + i]; } return { re, im }; };
const mshift = (A, c) => { const B = cmat(A.n); B.re.set(A.re); B.im.set(A.im); for (let i = 0; i < A.n; i++) B.re[i * A.n + i] -= c; return B; };   // A − c·I

/* the ledger for a density matrix: cov = Re tr ρA′B′, c = Im tr ρA′B′ = tr ρ[A, B]/2i, G = ΔA²ΔB² − cov² − c² (A′ = A − ⟨A⟩) */
function ledgerRho(rho, A, B) {
  const ea = mtrace(mmul(rho, A)).re, eb = mtrace(mmul(rho, B)).re, Ap = mshift(A, ea), Bp = mshift(B, eb);
  const varA = mtrace(mmul(rho, mmul(Ap, Ap))).re, varB = mtrace(mmul(rho, mmul(Bp, Bp))).re, X = mtrace(mmul(rho, mmul(Ap, Bp)));
  return { meanA: ea, meanB: eb, varA, varB, cov: X.re, comm: X.im, G: varA * varB - X.re * X.re - X.im * X.im };
}
/* the ledger for a unit vector: u = Aψ − ⟨A⟩ψ, v = Bψ − ⟨B⟩ψ, ⟨u, v⟩ = cov + i·c */
function ledgerPure(psi, A, B) {
  const Ap = A(psi), Bp = B(psi), ea = cinner(psi, Ap).re, eb = cinner(psi, Bp).re, u = axpy(Ap, ea, psi), v = axpy(Bp, eb, psi);
  const uu = cinner(u, u).re, vv = cinner(v, v).re, uv = cinner(u, v);
  return { meanA: ea, meanB: eb, varA: uu, varB: vv, cov: uv.re, comm: uv.im, G: uu * vv - uv.re * uv.re - uv.im * uv.im };
}

/* =====================================================================
   3. Qubit: ρ = (I + r·σ)/2, A = a·σ, B = b·σ
   ===================================================================== */
function pauliDot(n) {   // n·σ as a 2 × 2 matrix
  const M = cmat(2); M.re[0] = n[2]; M.re[3] = -n[2]; M.re[1] = n[0]; M.im[1] = -n[1]; M.re[2] = n[0]; M.im[2] = n[1]; return M;
}
function rhoOf(r) { const M = pauliDot(r); for (let k = 0; k < 4; k++) { M.re[k] /= 2; M.im[k] /= 2; } M.re[0] += 0.5; M.re[3] += 0.5; return M; }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const qubitAxes = () => ({ a: [1, 0, 0], b: [Math.cos(S.alpha * DEG), Math.sin(S.alpha * DEG), 0] });
const qubitDir = () => [Math.sin(S.theta * DEG) * Math.cos(S.phi * DEG), Math.sin(S.theta * DEG) * Math.sin(S.phi * DEG), Math.cos(S.theta * DEG)];
function qubitAt(f) {
  const s = 1 - Math.min(1, Math.max(0, f)), n = qubitDir(), r = n.map((x) => s * x), { a, b } = qubitAxes(), rho = rhoOf(r);
  const L = ledgerRho(rho, pauliDot(a), pauliDot(b)), ab = cross(a, b);
  return { s, r, a, b, rho, ...L, Gformula: dot3(ab, ab) * (1 - s * s) };
}

/* =====================================================================
   4. Spin j: basis |j, m⟩ with index k = j − m; coherent states and one-axis twisting
   ===================================================================== */
function spinOps(j) {
  const d = Math.round(2 * j + 1), m = (k) => j - k, jp = (k) => Math.sqrt(j * (j + 1) - m(k) * (m(k) + 1));   // J₊|m⟩ = jp·|m + 1⟩, index k − 1
  const Jx = (v) => { const o = cvec(d); for (let k = 0; k < d; k++) { if (k > 0) { const c = jp(k) / 2; o.re[k - 1] += c * v.re[k]; o.im[k - 1] += c * v.im[k]; } if (k < d - 1) { const c = jp(k + 1) / 2; o.re[k + 1] += c * v.re[k]; o.im[k + 1] += c * v.im[k]; } } return o; };
  const Jy = (v) => { const o = cvec(d); for (let k = 0; k < d; k++) { if (k > 0) { const c = jp(k) / 2; o.re[k - 1] += c * v.im[k]; o.im[k - 1] -= c * v.re[k]; } if (k < d - 1) { const c = jp(k + 1) / 2; o.re[k + 1] -= c * v.im[k]; o.im[k + 1] += c * v.re[k]; } } return o; };
  const Jz = (v) => { const o = cvec(d); for (let k = 0; k < d; k++) { o.re[k] = m(k) * v.re[k]; o.im[k] = m(k) * v.im[k]; } return o; };
  return { d, j, Jx, Jy, Jz };
}
const lnChoose = (n, k) => { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s; };
function coherentAmps(j, th) {   // |c_m| of the coherent state at polar angle θ: √C(2j, j + m) cos^(j+m)(θ/2) sin^(j−m)(θ/2)
  const d = Math.round(2 * j + 1), c = Math.cos(th / 2), s = Math.sin(th / 2), out = new Float64Array(d);
  for (let k = 0; k < d; k++) { const m = j - k; out[k] = Math.exp(0.5 * lnChoose(2 * j, Math.round(j + m))) * Math.pow(c, j + m) * Math.pow(s, j - m); }
  return out;
}
function coherent(j, th, ph) { const a = coherentAmps(j, th), v = cvec(a.length); for (let k = 0; k < a.length; k++) { const m = j - k; v.re[k] = a[k] * Math.cos(-m * ph); v.im[k] = a[k] * Math.sin(-m * ph); } return v; }
function twist(v, j, mu) { const o = cvec(v.re.length); for (let k = 0; k < v.re.length; k++) { const m = j - k, ph = -mu * m * m / 2, c = Math.cos(ph), s = Math.sin(ph); o.re[k] = v.re[k] * c - v.im[k] * s; o.im[k] = v.re[k] * s + v.im[k] * c; } return o; }
const muOf = (f) => Math.PI * Math.min(1, Math.max(0, f));
function spinAt(M, f) {
  const mu = muOf(f), psi = twist(M.psi0, M.ops.j, mu), L = ledgerPure(psi, M.ops.Jy, M.ops.Jz);
  const mean = [cinner(psi, M.ops.Jx(psi)).re, L.meanA, L.meanB];
  return { mu, psi, ...L, meanJ: mean };
}
const HUS_T = 36, HUS_P = 72;
function husimi(M, psi) {   // Q(θ, φ) = |⟨θ, φ|ψ⟩|² on a grid, ⟨θ, φ|ψ⟩ = Σ_m |c_m(θ)| e^(imφ) ψ_m
  const out = new Float64Array(HUS_T * HUS_P), d = M.ops.d, j = M.ops.j; let qmax = 0, qmin = Infinity;
  for (let it = 0; it < HUS_T; it++) {
    const amp = M.husAmp[it];
    for (let ip = 0; ip < HUS_P; ip++) {
      const ph = 2 * Math.PI * ip / HUS_P; let re = 0, im = 0;
      for (let k = 0; k < d; k++) { const m = j - k, c = Math.cos(m * ph), s = Math.sin(m * ph), a = amp[k]; re += a * (c * psi.re[k] - s * psi.im[k]); im += a * (c * psi.im[k] + s * psi.re[k]); }
      const q = re * re + im * im; out[it * HUS_P + ip] = q; qmax = Math.max(qmax, q); qmin = Math.min(qmin, q);
    }
  }
  return { q: out, qmax, qmin };
}

/* =====================================================================
   5. Mutually unbiased bases in prime dimension d
   ===================================================================== */
function mubBases(d) {   // computational basis, then |b, m⟩_k = ω^(bk² + mk)/√d (for d = 2: i^(bk² + 2mk)/√2)
  const B = [], Z = [];
  for (let m = 0; m < d; m++) { const v = cvec(d); v.re[m] = 1; Z.push(v); }
  B.push(Z);
  for (let b = 0; b < d; b++) {
    const basis = [];
    for (let m = 0; m < d; m++) { const v = cvec(d); for (let k = 0; k < d; k++) { const ph = d === 2 ? Math.PI / 2 * (b * k * k + 2 * m * k) : 2 * Math.PI * ((b * k * k + m * k) % d) / d; v.re[k] = Math.cos(ph) / Math.sqrt(d); v.im[k] = Math.sin(ph) / Math.sqrt(d); } basis.push(v); }
    B.push(basis);
  }
  return B;
}
const basisLabels = (d) => (d === 2 ? ['Z', 'X', 'Y'] : ['Z', ...Array.from({ length: d }, (_, b) => `B${b}`)]);
function randomState(d, rng) {   // Haar-random: normalized complex Gaussian vector
  const v = cvec(d); let n = 0;
  for (let k = 0; k < d; k++) { const u1 = Math.max(1e-300, rng()), u2 = rng(), rr = Math.sqrt(-2 * Math.log(u1)); v.re[k] = rr * Math.cos(2 * Math.PI * u2); v.im[k] = rr * Math.sin(2 * Math.PI * u2); n += v.re[k] ** 2 + v.im[k] ** 2; }
  n = Math.sqrt(n); for (let k = 0; k < d; k++) { v.re[k] /= n; v.im[k] /= n; }
  return v;
}
function mixedRho(psi, w) {   // ρ = (1 − w)|ψ⟩⟨ψ| + w·I/d
  const d = psi.re.length, R = cmat(d);
  for (let i = 0; i < d; i++) for (let k = 0; k < d; k++) { R.re[i * d + k] = (1 - w) * (psi.re[i] * psi.re[k] + psi.im[i] * psi.im[k]); R.im[i * d + k] = (1 - w) * (psi.im[i] * psi.re[k] - psi.re[i] * psi.im[k]); }
  for (let i = 0; i < d; i++) R.re[i * d + i] += w / d;
  return R;
}
const expect = (R, e) => { const d = R.n; let s = 0; for (let i = 0; i < d; i++) for (let k = 0; k < d; k++) { const rr = R.re[i * d + k], ri = R.im[i * d + k]; s += (e.re[i] * e.re[k] + e.im[i] * e.im[k]) * rr - (e.re[i] * e.im[k] - e.im[i] * e.re[k]) * ri; } return s; };   // ⟨e|ρ|e⟩
function entropyLedger(bases, R) {
  const probs = bases.map((basis) => basis.map((e) => expect(R, e))), purity = mtrace(mmul(R, R)).re, d = R.n;
  const coll = probs.map((p) => p.reduce((s, x) => s + x * x, 0)), H = probs.map(H2);
  return { probs, purity, collision: coll.reduce((a, b) => a + b, 0), H, Hsum: H.reduce((a, b) => a + b, 0), cSum: coll.reduce((s, c) => s - log2(c), 0), bound: (d + 1) * log2((d + 1) / (1 + purity)) };
}
const purePr = (bases, ur, ui) => bases.map((basis) => basis.map((e) => { let a = 0, b = 0; for (let k = 0; k < ur.length; k++) { a += e.re[k] * ur[k] + e.im[k] * ui[k]; b += e.re[k] * ui[k] - e.im[k] * ur[k]; } return a * a + b * b; }));
const pureH = (bases, ur, ui) => purePr(bases, ur, ui).reduce((s, p) => s + H2(p), 0);

/* the hunt: seeded random local search for min Σ H over pure states; snapshots for the rail */
function runHunt(d, bases, seed) {
  const [R, I] = HUNT_PLAN[d], total = R * I, every = Math.ceil(total / SNAPS), rng = TRV.mulberry32(seed);
  const snaps = [], bests = []; let best = Infinity, bestR = null, bestI = null, it = 0;
  const vr = new Float64Array(d), vi = new Float64Array(d);
  for (let rep = 0; rep < R; rep++) {
    const ur = new Float64Array(d), ui = new Float64Array(d); let n = 0;
    for (let k = 0; k < d; k++) { ur[k] = rng() - 0.5; ui[k] = rng() - 0.5; n += ur[k] ** 2 + ui[k] ** 2; }
    n = Math.sqrt(n); for (let k = 0; k < d; k++) { ur[k] /= n; ui[k] /= n; }
    let f = pureH(bases, ur, ui), step = 0.3;
    for (let s = 0; s < I; s++, it++) {
      let m = 0; for (let k = 0; k < d; k++) { vr[k] = ur[k] + step * (rng() - 0.5); vi[k] = ui[k] + step * (rng() - 0.5); m += vr[k] ** 2 + vi[k] ** 2; }
      m = Math.sqrt(m); for (let k = 0; k < d; k++) { vr[k] /= m; vi[k] /= m; }
      const g = pureH(bases, vr, vi);
      if (g < f) { ur.set(vr); ui.set(vi); f = g; } else step = Math.max(1e-9, step * 0.995);
      if (f < best - 1e-15) { best = f; bestR = Float64Array.from(ur); bestI = Float64Array.from(ui); }
      if (it % every === 0 || it === total - 1) {
        if (!bests.length || bests[bests.length - 1].f !== best) bests.push({ f: best, re: bestR, im: bestI });
        snaps.push({ it, rep, cur: f, best, bi: bests.length - 1 });
      }
    }
  }
  return { R, I, total, snaps, bests };
}

/* =====================================================================
   6. State and presets
   ===================================================================== */
const S = { mode: 'spin', alpha: 90, theta: 60, phi: 30, j: 5, d: 5, seed: 1, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'twist' };
const PRESETS = {
  pure: { mode: 'qubit', alpha: 90, theta: 60, phi: 30, frac: 0, play: false,
    zh: '纯态量子比特，A = σx，B = σy：账只记在协方差和对易子两栏，Gram 余项 G = 0。二维空间里垂直于 ψ 的方向只有一个，所以 Robertson–Schrödinger 总是取等。',
    en: 'A pure qubit with A = σx and B = σy: the ledger has entries only in the covariance and commutator columns, and the Gram remainder is G = 0. In two dimensions only one direction is orthogonal to ψ, so Robertson–Schrödinger is always an equality.' },
  mixed: { mode: 'qubit', alpha: 60, theta: 50, phi: 40, frac: 0, play: true,
    zh: '把布洛赫向量从球面缩到球心（|r| 从 1 到 0），a 与 b 夹 60°：Gram 余项从 0 长到 |a×b|² = 3/4，正好是 |a×b|²(1 − |r|²)。',
    en: 'Shrink the Bloch vector from the sphere to the centre (|r| from 1 to 0) with 60° between a and b: the Gram remainder grows from 0 to |a×b|² = 3/4, exactly |a×b|²(1 − |r|²).' },
  coherent: { mode: 'spin', j: 5, frac: 0, play: false,
    zh: 'j = 5，沿 x 的自旋相干态，A = Jy，B = Jz：ΔJy² = ΔJz² = j/2，对易子项 c = ⟨Jx⟩/2 = 5/2，协方差与余项都是 0——Robertson 取等。',
    en: 'j = 5, the spin coherent state along x, A = Jy and B = Jz: ΔJy² = ΔJz² = j/2, the commutator term is c = ⟨Jx⟩/2 = 5/2, and both the covariance and the remainder are 0, so Robertson is an equality.' },
  twist: { mode: 'spin', j: 5, frac: 0, play: true,
    zh: '单轴扭转强度 μ 从 0 加到 π：账先从对易子（品红）挪到协方差（青），再挪进 Gram 余项（琥珀）。球面上的 Husimi 分布先被拉成香蕉形，再碎成几团。',
    en: 'The one-axis twisting strength μ runs from 0 to π: the balance first moves from the commutator (magenta) to the covariance (cyan), then into the Gram remainder (amber). The Husimi distribution on the sphere is first stretched into a banana, then breaks into blobs.' },
  cat: { mode: 'spin', j: 5, frac: 1, play: false,
    zh: 'j = 5，μ = π：两个相反方向相干态的叠加（猫态）。对易子项和协方差都是 0，ΔJy²·ΔJz² 全部记在 Gram 余项上——Robertson 和 Schrödinger 的下界都只给 0。',
    en: 'j = 5, μ = π: a superposition of two opposite coherent states (a cat state). The commutator term and the covariance are both 0, and all of ΔJy²·ΔJz² is booked in the Gram remainder; the Robertson and Schrödinger bounds both give only 0.' },
  mub5: { mode: 'mub', d: 5, frac: 0, play: true,
    zh: 'd = 5 的六组互无偏基，一个随机纯态逐渐混成 I/5：概率平方和始终等于 1 + tr ρ²（碰撞守恒），熵和始终在冻结下界之上；完全混合时三条曲线相交，下界取等号。',
    en: 'The six mutually unbiased bases of d = 5, with a random pure state mixed gradually into I/5: the squared probabilities always add up to 1 + tr ρ² (collision conservation), and the entropy sum always stays above the frozen bound; at full mixing the three curves meet and the bound is attained.' },
  tight3: { mode: 'hunt', d: 3, frac: 0, play: true,
    zh: 'd = 3：随机局部搜索纯态的最小熵和，找到 4 比特，正好等于冻结下界 4·log₂2。取到下界的态在四组基上都给出 (½, ½, 0)。',
    en: 'd = 3: a random local search for the least entropy sum over pure states finds 4 bits, exactly the frozen bound 4·log₂2. The state that attains it gives (½, ½, 0) in all four bases.' },
  hunt5: { mode: 'hunt', d: 5, frac: 0, play: true,
    zh: 'd = 5：同样的搜索停在约 10.2524 比特，冻结下界是 9.5098——这里下界没有取到（数值搜索，不是证明）。',
    en: 'd = 5: the same search settles at about 10.2524 bits while the frozen bound is 9.5098, so here the bound is not attained (a numerical search, not a proof).' }
};

/* =====================================================================
   7. The model
   ===================================================================== */
let MODEL = null, dirty = true;
function build() {
  const M = { mode: S.mode };
  if (S.mode === 'qubit') {
    M.curve = Array.from({ length: CURVE_N + 1 }, (_, i) => { const q = qubitAt(i / CURVE_N); return { f: i / CURVE_N, prod: q.varA * q.varB, cov2: q.cov ** 2, comm2: q.comm ** 2, G: q.G }; });
  } else if (S.mode === 'spin') {
    M.ops = spinOps(S.j); M.psi0 = coherent(S.j, Math.PI / 2, 0);
    M.husAmp = Array.from({ length: HUS_T }, (_, it) => coherentAmps(S.j, Math.PI * (it + 0.5) / HUS_T));
    M.curve = Array.from({ length: CURVE_N + 1 }, (_, i) => { const q = spinAt(M, i / CURVE_N); return { f: i / CURVE_N, prod: q.varA * q.varB, cov2: q.cov ** 2, comm2: q.comm ** 2, G: q.G }; });
    M.husKey = null;
  } else {
    const d = PRIMES.includes(S.d) ? S.d : 5; M.d = d; M.bases = mubBases(d); M.labels = basisLabels(d);
    if (S.mode === 'mub') {
      M.psi = randomState(d, TRV.mulberry32(S.seed * 7919 + d * 131));
      M.curve = Array.from({ length: CURVE_N + 1 }, (_, i) => { const e = entropyLedger(M.bases, mixedRho(M.psi, i / CURVE_N)); return { f: i / CURVE_N, Hsum: e.Hsum, cSum: e.cSum, bound: e.bound }; });
    } else {
      M.hunt = runHunt(d, M.bases, S.seed * 104729 + d);
      const ex = cvec(d); ex.re[0] = Math.SQRT1_2; ex.re[1] = -Math.SQRT1_2;   // (|0⟩ − |1⟩)/√2
      M.witness = { psi: ex, probs: purePr(M.bases, ex.re, ex.im), H: pureH(M.bases, ex.re, ex.im) };
      M.pureBound = (d + 1) * log2((d + 1) / 2);
    }
  }
  MODEL = M;
}
function progress() {
  const M = MODEL, f = Math.min(1, Math.max(0, S.nowFrac));
  if (M.mode === 'qubit') return qubitAt(f);
  if (M.mode === 'spin') return spinAt(M, f);
  if (M.mode === 'mub') { const w = f, rho = mixedRho(M.psi, w); return { w, rho, ...entropyLedger(M.bases, rho) }; }
  const H = M.hunt, idx = Math.round(f * (H.snaps.length - 1)), sn = H.snaps[idx], b = H.bests[sn.bi];
  return { idx, snap: sn, best: b.f, bestRe: b.re, bestIm: b.im, bestProbs: purePr(M.bases, b.re, b.im) };
}

/* =====================================================================
   8. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const num = (v, d = 4) => (v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(d));
const sci = (v, d = 2) => (!isFinite(v) ? '—' : v === 0 ? '0' : Math.abs(v) < 1e-3 ? v.toExponential(d) : v.toFixed(d + 3));
const fmtInt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const z0 = (v) => (Math.abs(v) < 1e-12 ? 0 : v);   // print floating-point dust around 0 as 0
const jStr = (j) => (Number.isInteger(j) ? String(j) : `${2 * j}/2`);
const BASIS_COLS = [COL.cyan, COL.magenta, COL.amber, COL.green || COL.cyan, [0.62, 0.55, 1], [1, 0.5, 0.35], [0.5, 0.85, 1], [0.95, 0.95, 0.95]];
const BASIS_CSS = [CY, MG, AM, OK, '#9d8cff', '#ff8059', '#80d8ff', INK];

/* =====================================================================
   9. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 20000, PTS_MAX = HUS_T * HUS_P + 200;
const CAMS = { iso: [0.7, 1.05, 14], front: [0.0001, 1.5, 14], top: [0.0001, 0.06, 14] };
const cam = { theta: 0.7, phi: 1.05, r: 14, tTheta: 0.7, tPhi: 1.05, tR: 14 };
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
const RB = 3.4;   // sphere radius in the scene
const W3 = (v) => [v[0] * RB, v[2] * RB, -v[1] * RB];   // physics (x, y, z) → scene (x, up = z, −y)
function towerGeom(M) {   // basis b sits at angle 2πb/(d + 1); its d outcomes run along the tangent
  const d = M.d, n = d + 1, R = 3.6, gap = Math.min(0.34, 2.2 / d);
  return { base: (b) => { const t = 2 * Math.PI * b / n; return [R * Math.cos(t), R * Math.sin(t), t]; }, gap, H: 4.4, y0: -1.6, d, n };
}
function updateGL() {
  const M = MODEL, pr = progress();
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp[3 * v] = a[0]; Pp[3 * v + 1] = a[1]; Pp[3 * v + 2] = a[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; Pp[3 * v] = b[0]; Pp[3 * v + 1] = b[1]; Pp[3 * v + 2] = b[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  const circle = (u, w, R, col, k, n = 72) => { for (let i = 0; i < n; i++) { const a1 = 2 * Math.PI * i / n, a2 = 2 * Math.PI * (i + 1) / n; seg(W3([R * (u[0] * Math.cos(a1) + w[0] * Math.sin(a1)), R * (u[1] * Math.cos(a1) + w[1] * Math.sin(a1)), R * (u[2] * Math.cos(a1) + w[2] * Math.sin(a1))]), W3([R * (u[0] * Math.cos(a2) + w[0] * Math.sin(a2)), R * (u[1] * Math.cos(a2) + w[1] * Math.sin(a2)), R * (u[2] * Math.cos(a2) + w[2] * Math.sin(a2))]), col, k); } };
  const sphereFrame = (k) => {
    circle([1, 0, 0], [0, 1, 0], 1, COL.gray, k); circle([1, 0, 0], [0, 0, 1], 1, COL.gray, k * 0.7); circle([0, 1, 0], [0, 0, 1], 1, COL.gray, k * 0.7);
    for (const z of [-0.5, 0.5]) { const rr = Math.sqrt(1 - z * z); for (let i = 0; i < 48; i++) { const a1 = 2 * Math.PI * i / 48, a2 = 2 * Math.PI * (i + 1) / 48; seg(W3([rr * Math.cos(a1), rr * Math.sin(a1), z]), W3([rr * Math.cos(a2), rr * Math.sin(a2), z]), COL.gray, k * 0.5); } }
    for (const ax of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) seg(W3(ax.map((x) => -1.15 * x)), W3(ax.map((x) => 1.15 * x)), COL.gray, k * 1.4);
  };
  let dotScale = 1;
  if (M.mode === 'qubit') {
    sphereFrame(0.28);
    const ab = cross(pr.a, pr.b), O = [0, 0, 0];
    seg(W3(O), W3(pr.a), COL.cyan, 1); dot(W3(pr.a), COL.cyan, 1, 0.9);
    seg(W3(O), W3(pr.b), COL.magenta, 1); dot(W3(pr.b), COL.magenta, 1, 0.9);
    seg(W3(O), W3(ab), COL.amber, 1); dot(W3(ab), COL.amber, 1, 0.8);
    seg(W3(O), W3(pr.r), COL.white || [1, 1, 1], 0.8); dot(W3(pr.r), [1, 1, 1], 1, 1.3);
    // the shell of radius |r|: where states as mixed as this one live
    circle([1, 0, 0], [0, 1, 0], Math.max(0.001, pr.s), COL.white || [1, 1, 1], 0.12);
    // the remainder as a ring in the plane of a and b: radius √G
    if (pr.G > 1e-9) circle(pr.a, ((u) => { const c = cross(ab, pr.a), n = Math.hypot(...c) || 1; return c.map((x) => x / n); })(), Math.sqrt(pr.G), COL.amber, 0.45);
  } else if (M.mode === 'spin') {
    sphereFrame(0.22);
    if (M.husKey !== S.nowFrac) { M.hus = husimi(M, pr.psi); M.husKey = S.nowFrac; }
    const { q, qmax } = M.hus;
    for (let it = 0; it < HUS_T; it++) {
      const th = Math.PI * (it + 0.5) / HUS_T;
      for (let ip = 0; ip < HUS_P; ip++) {
        const ph = 2 * Math.PI * ip / HUS_P, x = q[it * HUS_P + ip] / qmax; if (x < 0.02) continue;
        const col = [CYr[0] + (AMr[0] - CYr[0]) * x, CYr[1] + (AMr[1] - CYr[1]) * x, CYr[2] + (AMr[2] - CYr[2]) * x];
        dot(W3([1.01 * Math.sin(th) * Math.cos(ph), 1.01 * Math.sin(th) * Math.sin(ph), 1.01 * Math.cos(th)]), col, 0.2 + 0.8 * x, 0.75 + 0.85 * x);
      }
    }
    const jm = M.ops.j, mJ = pr.meanJ.map((x) => x / jm);
    seg(W3([0, 0, 0]), W3(mJ), COL.amber, 1); dot(W3(mJ), COL.amber, 1, 1.1);
    dotScale = 1;
  } else {
    const G3 = towerGeom(M), probs = M.mode === 'mub' ? pr.probs : pr.bestProbs, d = G3.d;
    for (let b = 0; b < G3.n; b++) {
      const [bx, bz, t] = G3.base(b), tx = -Math.sin(t), tz = Math.cos(t), col = BASIS_COLS[b % BASIS_COLS.length];
      const P = (i, h) => [bx + tx * (i - (d - 1) / 2) * G3.gap, G3.y0 + h * G3.H, bz + tz * (i - (d - 1) / 2) * G3.gap];
      seg(P(-0.6, 0), P(d - 0.4, 0), COL.gray, 0.5); seg(P(-0.6, 1 / d), P(d - 0.4, 1 / d), COL.gray, 0.3);
      probs[b].forEach((p, i) => { for (const o of [-0.09, 0, 0.09]) seg(P(i + o, 0), P(i + o, p), col, o ? 0.55 : 0.95); dot(P(i, p), col, 1, 0.8); });
    }
    // the centre column: each basis adds its collision probability Σp²; the white ring marks 1 + tr ρ² (collision conservation)
    const Hc = 2.2, coll = probs.map((p) => p.reduce((s, x) => s + x * x, 0)), purity = M.mode === 'mub' ? pr.purity : 1; let acc = 0;
    coll.forEach((c, b) => { const col = BASIS_COLS[b % BASIS_COLS.length]; for (let q = 0; q < 6; q++) { const a = 2 * Math.PI * q / 6, x = 0.16 * Math.cos(a), z = 0.16 * Math.sin(a); seg([x, G3.y0 + acc * Hc, z], [x, G3.y0 + (acc + c) * Hc - 0.02, z], col, 0.9); } acc += c; });
    for (let q = 0; q < 48; q++) { const a1 = 2 * Math.PI * q / 48, a2 = 2 * Math.PI * (q + 1) / 48, y = G3.y0 + (1 + purity) * Hc; seg([0.42 * Math.cos(a1), y, 0.42 * Math.sin(a1)], [0.42 * Math.cos(a2), y, 0.42 * Math.sin(a2)], [1, 1, 1], 0.85); }
    dotScale = 1;
  }
  lines.geometry.setDrawRange(0, v); Lb.position.needsUpdate = true; Lb.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 60 * dotScale * renderer.getPixelRatio() * (stage.clientHeight / 600);
}
const CYr = COL.cyan, AMr = COL.amber;

/* =====================================================================
   10. Camera
   ===================================================================== */
let camName = 'iso';
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.5 : 1);
  camera.position.set(r * sp * Math.sin(cam.theta), r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
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
   11. Tags
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
  if (M.mode === 'qubit') {
    put('a', W3(pr.a.map((x) => 1.18 * x)), 'cy'); put('b', W3(pr.b.map((x) => 1.18 * x)), 'mg');
    const ab = cross(pr.a, pr.b); if (Math.hypot(...ab) > 0.15) put('a × b', W3(ab.map((x) => 1.12 * x + 0.04)), 'hot');
    put(T(`r（|r| = ${num(pr.s, 2)}）`, `r (|r| = ${num(pr.s, 2)})`), W3(pr.r.map((x) => x * 1.05 + 0.05)), '');
    put('z', W3([0, 0, 1.25]), '');
  } else if (M.mode === 'spin') {
    put('Jx', W3([1.25, 0, 0]), ''); put('Jy', W3([0, 1.25, 0]), 'cy'); put('Jz', W3([0, 0, 1.25]), 'mg');
    put(`⟨Jx⟩/j = ${num(z0(pr.meanJ[0] / M.ops.j), 3)}`, W3(pr.meanJ.map((x) => x / M.ops.j * 0.6 + 0.02)), 'hot');
  } else {
    const G3 = towerGeom(M);
    for (let b = 0; b < G3.n; b++) { const [bx, bz] = G3.base(b); put(M.labels[b], [bx * 1.22, G3.y0 - 0.3, bz * 1.22], b === 0 ? 'cy' : ''); }
    put(M.mode === 'mub' ? `Σp² = 1 + tr ρ² = ${num(1 + pr.purity, 4)}` : 'Σp² = 2', [0, G3.y0 + (1 + (M.mode === 'mub' ? pr.purity : 1)) * 2.2 + 0.35, 0], 'hot');
  }
  for (let i = k; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}

/* =====================================================================
   12. 2D panels
   ===================================================================== */
function frame2d(cv, pl0 = 50) {
  const dpr = fitCanvas(cv), ctx = cv.getContext('2d'), Wd = cv.width, Hh = cv.height;
  ctx.clearRect(0, 0, Wd, Hh);
  const pl = pl0 * dpr, pr = 12 * dpr, pt = 10 * dpr, pb = 20 * dpr;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  return { dpr, ctx, W: Wd, Hh, pl, pt, iw: Wd - pl - pr, ih: Hh - pt - pb };
}
const yTicks = (ctx, dpr, pl, Y, vals, fmt) => { ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of vals) ctx.fillText(fmt(g), pl - 4 * dpr, Y(g)); };
const xTicks = (ctx, dpr, pt, ih, X, vals, fmt) => { ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const g of vals) ctx.fillText(fmt(g), X(g), pt + ih + 3 * dpr); };
const vline = (ctx, x, pt, ih, col, dpr) => { ctx.strokeStyle = col; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + ih); ctx.stroke(); ctx.setLineDash([]); };
const niceTicks = (top) => { const raw = top / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), s = [1, 2, 2.5, 5, 10].map((x) => x * p).find((x) => x >= raw) || raw; return Array.from({ length: Math.floor(top / s) + 1 }, (_, i) => i * s); };
function drawStack(F, curve, f, xFmt, xVals) {   // stacked areas: commutator (bottom), covariance, remainder; ΔA²ΔB² dashed on top
  const { ctx, dpr, pl, pt, iw, ih } = F, top = Math.max(1e-9, ...curve.map((c) => c.prod)) * 1.08;
  const X = (x) => pl + x * iw, Y = (v) => pt + ih - v / top * ih;
  yTicks(ctx, dpr, pl, Y, niceTicks(top), (v) => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)));
  xTicks(ctx, dpr, pt, ih, X, xVals, xFmt);
  const layers = [['comm2', MG], ['cov2', CY], ['G', AM]]; let base = curve.map(() => 0);
  for (const [key, col] of layers) {
    const topv = curve.map((c, i) => base[i] + c[key]);
    ctx.fillStyle = col; ctx.globalAlpha = 0.32; ctx.beginPath();
    curve.forEach((c, i) => { if (i) ctx.lineTo(X(c.f), Y(topv[i])); else ctx.moveTo(X(c.f), Y(topv[i])); });
    for (let i = curve.length - 1; i >= 0; i--) ctx.lineTo(X(curve[i].f), Y(base[i]));
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = col; ctx.lineWidth = 1.3 * dpr; ctx.beginPath(); curve.forEach((c, i) => { if (i) ctx.lineTo(X(c.f), Y(topv[i])); else ctx.moveTo(X(c.f), Y(topv[i])); }); ctx.stroke();
    base = topv;
  }
  ctx.strokeStyle = INK; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); curve.forEach((c, i) => { if (i) ctx.lineTo(X(c.f), Y(c.prod)); else ctx.moveTo(X(c.f), Y(c.prod)); }); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
  vline(ctx, X(f), pt, ih, AM, dpr);
}
function drawLedger(F, L) {   // three rows: ΔA²ΔB²; the full ledger cov² + c² + G; Robertson's c² alone
  const { ctx, dpr, pl, pt, iw, ih } = F, prod = L.varA * L.varB, top = Math.max(1e-9, prod) * 1.05, X = (v) => pl + v / top * iw;
  const rows = [[T('ΔA²·ΔB²', 'ΔA²·ΔB²'), [[prod, INK]]], [T('三笔账', 'the ledger'), [[L.comm ** 2, MG], [L.cov ** 2, CY], [Math.max(0, L.G), AM]]], ['Robertson', [[L.comm ** 2, MG]]], ['Schrödinger', [[L.comm ** 2, MG], [L.cov ** 2, CY]]]];
  const rh = ih / rows.length;
  rows.forEach(([label, parts], r) => {
    const y = pt + r * rh + rh * 0.18, h = rh * 0.64; let x0 = 0;
    ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(label, pl - 6 * dpr, y + h / 2);
    for (const [v, col] of parts) { ctx.fillStyle = col; ctx.globalAlpha = col === INK ? 0.55 : 0.8; ctx.fillRect(X(x0), y, Math.max(0, X(x0 + v) - X(x0)), h); x0 += v; }
    ctx.globalAlpha = 1;
  });
  ctx.strokeStyle = INK; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(X(prod), pt); ctx.lineTo(X(prod), pt + ih); ctx.stroke(); ctx.setLineDash([]);
  xTicks(ctx, dpr, pt, ih, X, niceTicks(top), (v) => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)));
}
function drawHists(F, probs, labels) {
  const { ctx, dpr, pl, pt, iw, ih } = F, n = probs.length, d = probs[0].length, gw = iw / n, Y = (v) => pt + ih - v * ih;
  yTicks(ctx, dpr, pl, Y, [0, 0.5, 1], (v) => v.toFixed(1));
  probs.forEach((p, b) => {
    const x0 = pl + b * gw, bw = gw * 0.84 / d;
    ctx.strokeStyle = FAINT; ctx.setLineDash([2 * dpr, 2 * dpr]); ctx.beginPath(); ctx.moveTo(x0 + gw * 0.08, Y(1 / d)); ctx.lineTo(x0 + gw * 0.92, Y(1 / d)); ctx.stroke(); ctx.setLineDash([]);
    p.forEach((x, i) => { ctx.fillStyle = BASIS_CSS[b % BASIS_CSS.length]; ctx.globalAlpha = 0.85; ctx.fillRect(x0 + gw * 0.08 + i * bw, Y(x), bw * 0.8, pt + ih - Y(x)); });
    ctx.globalAlpha = 1; ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(labels[b], x0 + gw / 2, pt + ih + 3 * dpr);
  });
}
function drawMain() {
  const M = MODEL, F = frame2d(cv1, M.mode === 'hunt' || M.mode === 'mub' ? 44 : 50); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, f = Math.min(1, Math.max(0, S.nowFrac));
  if (M.mode === 'qubit') {
    drawStack(F, M.curve, f, (x) => `|r|=${(1 - x).toFixed(1)}`, [0, 0.5, 1]);
    $('c1Title').textContent = T('ΔA²·ΔB² 的三笔账，|r| 从 1 降到 0：对易子项 c²（品红）、协方差 cov²（青）、Gram 余项 G（琥珀）', 'THE THREE ENTRIES OF ΔA²·ΔB² AS |r| FALLS FROM 1 TO 0: COMMUTATOR c² (MAGENTA), COVARIANCE cov² (CYAN), GRAM REMAINDER G (AMBER)');
    $('c1Meta').textContent = T('虚线 = ΔA²·ΔB²，与三层之和重合', 'dashes = ΔA²·ΔB², on top of the three layers');
  } else if (M.mode === 'spin') {
    drawStack(F, M.curve, f, (x) => ['0', 'π/4', 'π/2', '3π/4', 'π'][Math.round(x * 4)], [0, 0.25, 0.5, 0.75, 1]);
    $('c1Title').textContent = T(`j = ${jStr(S.j)}：ΔJy²·ΔJz² 的三笔账随扭转强度 μ 变化：c²（品红）、cov²（青）、G（琥珀）`, `j = ${jStr(S.j)}: THE THREE ENTRIES OF ΔJy²·ΔJz² AGAINST THE TWISTING STRENGTH μ: c² (MAGENTA), cov² (CYAN), G (AMBER)`);
    $('c1Meta').textContent = T('虚线 = ΔJy²·ΔJz²', 'dashes = ΔJy²·ΔJz²');
  } else if (M.mode === 'mub') {
    const c = M.curve, lo = Math.min(...c.map((x) => x.bound)), hi = Math.max(...c.map((x) => x.Hsum)), pad = (hi - lo) * 0.08 + 0.05, A = lo - pad, B = hi + pad;
    const X = (x) => pl + x * iw, Y = (v) => pt + ih - (v - A) / (B - A) * ih;
    yTicks(ctx, dpr, pl, Y, [lo, (lo + hi) / 2, hi], (v) => v.toFixed(2)); xTicks(ctx, dpr, pt, ih, X, [0, 0.5, 1], (x) => `w=${x}`);
    for (const [key, col] of [['bound', AM], ['cSum', MG], ['Hsum', CY]]) { ctx.strokeStyle = col; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); c.forEach((p, i) => { if (i) ctx.lineTo(X(p.f), Y(p[key])); else ctx.moveTo(X(p.f), Y(p[key])); }); ctx.stroke(); }
    ctx.lineWidth = 1; vline(ctx, X(f), pt, ih, AM, dpr);
    $('c1Title').textContent = T(`d = ${M.d}：香农熵之和（青）≥ 碰撞熵之和（品红）≥ 冻结下界（琥珀），单位比特，随混合度 w`, `d = ${M.d}: SHANNON ENTROPY SUM (CYAN) ≥ COLLISION ENTROPY SUM (MAGENTA) ≥ FROZEN BOUND (AMBER), IN BITS, AGAINST THE MIXING w`);
    $('c1Meta').textContent = T('ρ = (1 − w)|ψ⟩⟨ψ| + w·I/d', 'ρ = (1 − w)|ψ⟩⟨ψ| + w·I/d');
  } else {
    const H = M.hunt, idx = Math.round(f * (H.snaps.length - 1)), lo = M.pureBound, hiAll = Math.max(...H.snaps.map((s) => s.cur)), hi = Math.min(hiAll, lo + Math.max(2.5, (H.snaps[H.snaps.length - 1].best - lo) * 3)), A = lo - (hi - lo) * 0.08, B = hi;
    const X = (i) => pl + i / (H.snaps.length - 1) * iw, Y = (v) => pt + ih - (Math.min(B, v) - A) / (B - A) * ih;
    yTicks(ctx, dpr, pl, Y, [lo, (lo + hi) / 2, hi], (v) => v.toFixed(2));
    xTicks(ctx, dpr, pt, ih, (r) => pl + (r - 0.5) / H.R * iw, [1, Math.ceil(H.R / 2), H.R], (r) => `#${r}`);
    ctx.strokeStyle = MG; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(pl, Y(lo)); ctx.lineTo(pl + iw, Y(lo)); ctx.stroke(); ctx.setLineDash([]);
    for (let r = 1; r < H.R; r++) { ctx.strokeStyle = FAINT; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(pl + r / H.R * iw, pt); ctx.lineTo(pl + r / H.R * iw, pt + ih); ctx.stroke(); }
    ctx.globalAlpha = 1;
    H.snaps.forEach((s, i) => { ctx.fillStyle = CY; ctx.globalAlpha = i <= idx ? 0.7 : 0.15; ctx.fillRect(X(i) - dpr, Y(s.cur) - dpr, 2 * dpr, 2 * dpr); });
    ctx.globalAlpha = 1; ctx.strokeStyle = AM; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); for (let i = 0; i <= idx; i++) { const s = H.snaps[i]; if (i) ctx.lineTo(X(i), Y(s.best)); else ctx.moveTo(X(i), Y(s.best)); } ctx.stroke(); ctx.lineWidth = 1;
    vline(ctx, X(idx), pt, ih, AM, dpr);
    $('c1Title').textContent = T(`d = ${M.d}：当前游走者的熵和（青点）、目前最小（琥珀），冻结下界（品红虚线），单位比特`, `d = ${M.d}: THE CURRENT WALKER’S ENTROPY SUM (CYAN DOTS), THE BEST SO FAR (AMBER), THE FROZEN BOUND (MAGENTA DASHES), IN BITS`);
    $('c1Meta').textContent = T(`${H.R} 个随机起点 × ${fmtInt(H.I)} 步`, `${H.R} random starts × ${fmtInt(H.I)} steps`);
  }
}
function drawSide() {
  const M = MODEL, F = frame2d(cv2, M.mode === 'qubit' || M.mode === 'spin' ? 86 : 34); if (F.iw < 60 || F.ih < 40) return;
  const pr = progress();
  if (M.mode === 'qubit' || M.mode === 'spin') {
    drawLedger(F, pr);
    $('c2Title').textContent = T('这一刻的账：Robertson 只记 c²，Schrödinger 再加 cov²，余下的是 G', 'THE LEDGER NOW: ROBERTSON BOOKS c² ONLY, SCHRÖDINGER ADDS cov², G IS THE REST');
    $('c2Meta').textContent = T('虚线 = ΔA²·ΔB²', 'dashes = ΔA²·ΔB²');
  } else if (M.mode === 'mub') {
    drawHists(F, pr.probs, M.labels);
    $('c2Title').textContent = T(`w = ${num(pr.w, 2)} 时 ${M.d + 1} 组基的结果分布`, `OUTCOME DISTRIBUTIONS IN THE ${M.d + 1} BASES AT w = ${num(pr.w, 2)}`); $('c2Meta').textContent = T('虚线 = 1/d', 'dashes = 1/d');
  } else {
    drawHists(F, pr.bestProbs, M.labels);
    $('c2Title').textContent = T('目前最小熵和的态在各组基上的分布', 'THE DISTRIBUTIONS OF THE BEST STATE SO FAR'); $('c2Meta').textContent = T('虚线 = 1/d', 'dashes = 1/d');
  }
}

/* =====================================================================
   13. Readouts and controls
   ===================================================================== */
let syncedKey = '', toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function setRo(rows) { rows.forEach(([l, v], i) => { $(`ro${i + 1}L`).textContent = l; $(`ro${i + 1}`).textContent = v; }); }
function pill(id, label, value) { $(id).innerHTML = `${label} <strong>${value}</strong>`; }
const dominant = (L) => { const e = [[L.comm ** 2, T('对易子项 c²', 'the commutator term c²')], [L.cov ** 2, T('协方差 cov²', 'the covariance cov²')], [Math.max(0, L.G), T('Gram 余项 G', 'the Gram remainder G')]]; e.sort((a, b) => b[0] - a[0]); return e[0][1]; };
function readouts() {
  const M = MODEL, pr = progress();
  if (M.mode === 'qubit') {
    const prod = pr.varA * pr.varB;
    setRo([['ΔA² · ΔB²', `${num(pr.varA, 4)} · ${num(pr.varB, 4)} → ${num(prod, 6)}`], [T('协方差项 cov²（Schrödinger）', 'Covariance cov² (Schrödinger)'), num(pr.cov ** 2, 6)],
      [T('对易子项 c² = |⟨[A, B]⟩/2i|²', 'Commutator term c² = |⟨[A, B]⟩/2i|²'), num(pr.comm ** 2, 6)],
      [T('Gram 余项 G · |a×b|²(1 − |r|²)', 'Gram remainder G · |a×b|²(1 − |r|²)'), `${num(z0(pr.G), 6)} · ${num(z0(pr.Gformula), 6)}`],
      [T('混合态 Robertson：‖u‖·‖v‖ ≥ ½|tr ρ[A, B]|', 'Mixed-state Robertson: ‖u‖·‖v‖ ≥ ½|tr ρ[A, B]|'), `${num(Math.sqrt(pr.varA * pr.varB), 6)} ≥ ${num(Math.abs(pr.comm), 6)}`]]);
    pill('pillA', '|r|', num(pr.s, 2)); pill('pillB', 'ΔA²ΔB²', num(prod, 3)); pill('pillC', 'G', num(z0(pr.G), 3)); pill('pillD', 'cov²', num(pr.cov ** 2, 3));
    $('roNote').innerHTML = pr.s > 0.9995 ? T('纯态：G = 0，账只记在 cov² 和 c² 两栏，Robertson–Schrödinger 取等。', 'A pure state: G = 0, the ledger uses only the cov² and c² columns, and Robertson–Schrödinger is an equality.') : T(`混合态（|r| = ${num(pr.s, 3)}）：页面用矩阵算出的 G 与 |a×b|²(1 − |r|²) 一致。`, `A mixed state (|r| = ${num(pr.s, 3)}): the G computed from matrices agrees with |a×b|²(1 − |r|²).`);
  } else if (M.mode === 'spin') {
    const prod = pr.varA * pr.varB;
    setRo([['ΔJy² · ΔJz²', `${num(pr.varA, 4)} · ${num(pr.varB, 4)} → ${num(prod, 5)}`], [T('协方差项 cov²', 'Covariance cov²'), num(pr.cov ** 2, 6)],
      [T('对易子项 c² = (⟨Jx⟩/2)²', 'Commutator term c² = (⟨Jx⟩/2)²'), num(pr.comm ** 2, 6)], [T('Gram 余项 G', 'Gram remainder G'), num(z0(pr.G), 6)],
      [T('j · 扭转 μ · ⟨Jx⟩', 'j · twist μ · ⟨Jx⟩'), `${jStr(S.j)} · ${num(pr.mu, 4)} · ${num(z0(pr.meanJ[0]), 5)}`]]);
    pill('pillA', 'j', jStr(S.j)); pill('pillB', 'μ', num(pr.mu, 3)); pill('pillC', 'G', num(z0(pr.G), 3)); pill('pillD', '⟨Jx⟩', num(z0(pr.meanJ[0]), 3));
    $('roNote').innerHTML = T(`这一刻 ΔJy²·ΔJz² 的大头记在${dominant(pr)}。`, `Right now most of ΔJy²·ΔJz² is booked in ${dominant(pr)}.`);
  } else if (M.mode === 'mub') {
    setRo([[T('维数 d · 混合度 w', 'Dimension d · mixing w'), `${M.d} · ${num(pr.w, 3)}`], [T('纯度 tr ρ²', 'Purity tr ρ²'), num(pr.purity, 6)],
      [T('Σ 概率² · 1 + tr ρ²（碰撞守恒）', 'Σ probability² · 1 + tr ρ² (collision conservation)'), `${num(pr.collision, 9)} · ${num(1 + pr.purity, 9)}`],
      [T('熵和 Σ H（比特）', 'Entropy sum Σ H (bits)'), num(pr.Hsum, 5)],
      [T('冻结下界 ≤ 碰撞熵之和 ≤ 熵和', 'Frozen bound ≤ collision-entropy sum ≤ entropy sum'), `${num(pr.bound, 5)} ≤ ${num(pr.cSum, 5)} ≤ ${num(pr.Hsum, 5)}`]]);
    pill('pillA', 'd', M.d); pill('pillB', 'w', num(pr.w, 2)); pill('pillC', 'ΣH', num(pr.Hsum, 3)); pill('pillD', 'BOUND', num(pr.bound, 3));
    $('roNote').innerHTML = pr.w > 0.9995 ? T('完全混合：每组都是均匀分布，三者相等，冻结下界取等号。', 'Fully mixed: every basis gives the uniform distribution, the three agree, and the frozen bound is attained.') : T('熵和与下界的差，一部分来自每组内的 Jensen（分布不均匀），一部分来自组间的 Jensen（各组碰撞概率不相等）。', 'The gap between the entropy sum and the bound comes partly from Jensen within each basis (uneven distributions) and partly from Jensen across bases (unequal collision probabilities).');
  } else {
    const sn = pr.snap, H = M.hunt;
    setRo([[T('维数 d · 第几次起点 · 总步数', 'Dimension d · start · steps so far'), `${M.d} · ${sn.rep + 1}/${H.R} · ${fmtInt(sn.it + 1)}`], [T('当前游走者的熵和（比特）', 'Current walker’s entropy sum (bits)'), num(sn.cur, 6)],
      [T('目前最小熵和', 'Least entropy sum so far'), num(pr.best, 8)], [T('冻结下界（纯态）(d + 1)log₂((d + 1)/2)', 'Frozen bound (pure states) (d + 1)log₂((d + 1)/2)'), num(M.pureBound, 8)],
      [T('最小值 − 下界 · (|0⟩ − |1⟩)/√2 的熵和', 'Least − bound · entropy sum of (|0⟩ − |1⟩)/√2'), `${sci(pr.best - M.pureBound, 3)} · ${num(M.witness.H, 8)}`]]);
    pill('pillA', 'd', M.d); pill('pillB', 'BEST', num(pr.best, 4)); pill('pillC', 'BOUND', num(M.pureBound, 4)); pill('pillD', 'GAP', sci(pr.best - M.pureBound, 2));
    $('roNote').innerHTML = M.d === 3 ? T('d = 3 时态 (|0⟩ − |1⟩)/√2 在四组基上都给出 (½, ½, 0)：每组碰撞概率都是 ½，分布在支撑上均匀，两次 Jensen 都取等，熵和恰为 4 比特。', 'In d = 3 the state (|0⟩ − |1⟩)/√2 gives (½, ½, 0) in all four bases: every collision probability is ½ and every distribution is uniform on its support, so both Jensen steps are equalities and the entropy sum is exactly 4 bits.') : T('这是数值搜索的结果，不排除存在更小的熵和；冻结下界本身是证明过的。', 'This is the result of a numerical search, and smaller entropy sums are not excluded; the frozen bound itself is proved.');
  }
}
const fieldsFor = { qubit: ['alphaField', 'thetaField', 'phiField'], spin: ['jField'], mub: ['dField'], hunt: ['dField'] };
function syncOutputs() {
  if (dirty) { build(); dirty = false; syncedKey = ''; toasted = false; }
  const M = MODEL, key = `${S.mode}|${S.nowFrac}|${S.alpha}|${S.theta}|${S.phi}|${S.j}|${S.d}|${S.seed}|${TRV.lang()}`;
  if (key === syncedKey) return; syncedKey = key;
  const pr = progress();
  readouts();
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  for (const id of ['alphaField', 'thetaField', 'phiField', 'jField', 'dField']) $(id).hidden = !fieldsFor[S.mode].includes(id);
  $('alpha').value = S.alpha; $('oAlpha').textContent = `${S.alpha}°`; $('theta').value = S.theta; $('oTheta').textContent = `${S.theta}°`; $('phi').value = S.phi; $('oPhi').textContent = `${S.phi}°`;
  $('jj').value = Math.round(2 * S.j); $('oJ').textContent = jStr(S.j);
  document.querySelectorAll('#dChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(parseInt(b.dataset.d, 10) === S.d)));
  $('presetNote').innerHTML = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = ({
    qubit: T('时间轴 = 布洛赫向量的长度 |r|，从 1（纯态）到 0（完全混合）。A = a·σ，a 沿 x；B = b·σ，b 在 xy 平面上与 a 夹 α。', 'The time axis is the Bloch vector length |r|, from 1 (pure) to 0 (fully mixed). A = a·σ with a along x; B = b·σ with b in the xy plane at angle α from a.'),
    spin: T('时间轴 = 扭转强度 μ，从 0 到 π。初态是沿 x 的自旋相干态，A = Jy，B = Jz。', 'The time axis is the twisting strength μ, from 0 to π. The initial state is the spin coherent state along x; A = Jy, B = Jz.'),
    mub: T('时间轴 = 混合度 w：ρ = (1 − w)|ψ⟩⟨ψ| + w·I/d，ψ 是随机纯态（按 R 换一个）。', 'The time axis is the mixing w: ρ = (1 − w)|ψ⟩⟨ψ| + w·I/d with ψ a random pure state (R draws another).'),
    hunt: T('时间轴 = 搜索进度。每次随机起点后做随机局部搜索，变小就接受，否则缩小步长（R 换一组随机数）。', 'The time axis is the search progress. From each random start a random local search accepts any step that lowers the sum and otherwise shrinks the step (R draws new random numbers).')
  })[S.mode];
  $('litNote').innerHTML = M.mode === 'mub' || M.mode === 'hunt' ? T(`页面构造的 ${M.d + 1} 组基两两互无偏：任意两组之间的重叠 |⟨e|f⟩|² 都是 1/${M.d}。`, `The ${M.d + 1} bases built on the page are pairwise unbiased: every overlap |⟨e|f⟩|² between two of them is 1/${M.d}.`) : T('Robertson 不等式只用到 c²；Schrödinger 不等式用到 cov² + c²；本库冻结的是带余项 G 的等式。', 'The Robertson inequality uses only c²; the Schrödinger inequality uses cov² + c²; this library has frozen the equality with the remainder G.');
  $('clock').innerHTML = M.mode === 'qubit' ? `|r| ${num(pr.s, 2)}` : M.mode === 'spin' ? `μ ${num(pr.mu, 2)}` : M.mode === 'mub' ? `w ${num(pr.w, 2)}` : `${Math.round(S.nowFrac * 100)}%`;
  $('hudBig').textContent = ({ qubit: () => T(`量子比特 · |r| = ${num(pr.s, 3)}`, `qubit · |r| = ${num(pr.s, 3)}`), spin: () => T(`自旋 j = ${jStr(S.j)} · μ = ${num(pr.mu, 3)}`, `spin j = ${jStr(S.j)} · μ = ${num(pr.mu, 3)}`),
    mub: () => T(`d = ${M.d} · ${M.d + 1} 组互无偏基 · w = ${num(pr.w, 2)}`, `d = ${M.d} · ${M.d + 1} unbiased bases · w = ${num(pr.w, 2)}`), hunt: () => T(`d = ${M.d} · 最小熵和 ${num(pr.best, 4)} 比特`, `d = ${M.d} · least entropy sum ${num(pr.best, 4)} bits`) })[M.mode]();
  $('hudSub').textContent = ({ qubit: T('布洛赫球：青 = a，品红 = b，琥珀 = a × b，白点 = 态 r；琥珀圈半径 = √G', 'Bloch ball: cyan = a, magenta = b, amber = a × b, white dot = the state r; amber ring radius = √G'),
    spin: T('球面上是 Husimi 分布 |⟨θ, φ|ψ⟩|²（越亮越大），琥珀箭头 = ⟨J⟩/j', 'the sphere shows the Husimi distribution |⟨θ, φ|ψ⟩|² (brighter = larger); amber arrow = ⟨J⟩/j'),
    mub: T('每一排柱子是一组基的结果概率，灰线 = 1/d', 'each row of bars is the outcome distribution of one basis; grey line = 1/d'),
    hunt: T('目前最小熵和的态在各组基上的结果概率', 'outcome probabilities of the best state so far in each basis') })[M.mode];
  if (!toasted && S.playing && S.nowFrac >= 1) {
    toasted = true;
    if (M.mode === 'qubit') toast(T(`<b>|r| = 0</b>：对易子项归零，ΔA²ΔB² = 1 = (a·b)² + |a×b|²，后一项全是 Gram 余项。`, `<b>|r| = 0</b>: the commutator term vanishes and ΔA²ΔB² = 1 = (a·b)² + |a×b|², the second part entirely Gram remainder.`));
    else if (M.mode === 'spin') toast(T(`<b>μ = π</b>：ΔJy²·ΔJz² = ${num(pr.varA * pr.varB, 4)}，大头记在${dominant(pr)}。`, `<b>μ = π</b>: ΔJy²·ΔJz² = ${num(pr.varA * pr.varB, 4)}, mostly booked in ${dominant(pr)}.`));
    else if (M.mode === 'mub') toast(T(`<b>w = 1</b>：完全混合，熵和 = 下界 = ${M.d + 1}·log₂${M.d} = ${num(pr.Hsum, 4)} 比特。`, `<b>w = 1</b>: fully mixed, entropy sum = bound = ${M.d + 1}·log₂${M.d} = ${num(pr.Hsum, 4)} bits.`));
    else toast(Math.abs(pr.best - M.pureBound) < 1e-6 ? T(`<b>${num(pr.best, 6)} 比特</b>：搜到的最小值等于冻结下界，下界在 d = ${M.d} 取到。`, `<b>${num(pr.best, 6)} bits</b>: the least sum found equals the frozen bound, which is attained in d = ${M.d}.`) : T(`<b>最小 ≈ ${num(pr.best, 4)} 比特</b>，冻结下界 ${num(M.pureBound, 4)}：差 ${num(pr.best - M.pureBound, 4)}（数值搜索）。`, `<b>Least ≈ ${num(pr.best, 4)} bits</b> against the frozen bound ${num(M.pureBound, 4)}: a gap of ${num(pr.best - M.pureBound, 4)} (numerical search).`));
  }
}
function syncRail() {
  const key = `${S.mode}|${S.d}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  let marks;
  if (S.mode === 'qubit') marks = [[0, '|r| = 1'], [0.5, '0.5'], [1, '0']];
  else if (S.mode === 'spin') marks = [[0, 'μ = 0'], [0.25, 'π/4'], [0.5, 'π/2'], [0.75, '3π/4'], [1, 'π']];
  else if (S.mode === 'mub') marks = [[0, T('w = 0 纯态', 'w = 0 pure')], [0.5, '0.5'], [1, T('1 完全混合', '1 fully mixed')]];
  else marks = [[0, T('开始', 'start')], [1, T('结束', 'end')]];
  $('marks').innerHTML = marks.map(([f, s], i) => `<i class="${i === 0 ? 'first' : i === marks.length - 1 ? 'last' : ''}" style="left:${(f * 100).toFixed(2)}%">${s}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => {
  const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'spin'; if (S.mode === m) return;
  S.mode = m; S.nowFrac = 0; custom();
}));
for (const [id, keyName, lo, hi] of [['alpha', 'alpha', 0, 180], ['theta', 'theta', 0, 180], ['phi', 'phi', 0, 355]]) $(id).addEventListener('input', () => { S[keyName] = Math.min(hi, Math.max(lo, 5 * Math.round(parseFloat($(id).value) / 5))); custom(); });
$('jj').addEventListener('input', () => { S.j = Math.min(20, Math.max(1, parseInt($('jj').value, 10))) / 2; custom(); });
document.querySelectorAll('#dChips .chip').forEach((b) => b.addEventListener('click', () => { const d = parseInt(b.dataset.d, 10); if (!PRIMES.includes(d) || d === S.d) return; S.d = d; custom(); }));
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.mode = p.mode; for (const k of ['alpha', 'theta', 'phi', 'j', 'd']) if (p[k] !== undefined) S[k] = p[k];
  S.seed = 1; S.preset = name; markPreset(); dirty = true; setCamPreset(p.mode === 'mub' || p.mode === 'hunt' ? 'iso' : 'iso');
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
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) { ev.preventDefault(); jumpTo(S.nowFrac + (ev.key === 'ArrowRight' ? 1 : -1) / 100); }
  else if (ev.key === 'e' || ev.key === 'E') jumpTo(1);
  else if (ev.key === 'r' || ev.key === 'R') { S.seed++; custom(); }
});

/* =====================================================================
   14. Main loop
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
const plain = (v) => ({ re: Array.from(v.re), im: Array.from(v.im) });
window.UN_DEBUG = {
  pending: () => dirty || syncedKey !== `${S.mode}|${S.nowFrac}|${S.alpha}|${S.theta}|${S.phi}|${S.j}|${S.d}|${S.seed}|${TRV.lang()}`,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, pr = progress(), o = { mode: M.mode, frac: S.nowFrac };
    if (M.mode === 'qubit') Object.assign(o, { s: pr.s, r: pr.r, a: pr.a, b: pr.b, alpha: S.alpha, theta: S.theta, phi: S.phi, meanA: pr.meanA, meanB: pr.meanB, varA: pr.varA, varB: pr.varB, cov: pr.cov, comm: pr.comm, G: pr.G, Gformula: pr.Gformula });
    if (M.mode === 'spin') { const hq = husimi(M, pr.psi); Object.assign(o, { j: S.j, mu: pr.mu, psi: plain(pr.psi), varA: pr.varA, varB: pr.varB, cov: pr.cov, comm: pr.comm, G: pr.G, meanJ: pr.meanJ, qmax: hq.qmax, qmin: hq.qmin, curveMaxG: Math.max(...M.curve.map((c) => c.G)), curveMinG: Math.min(...M.curve.map((c) => c.G)) }); }
    if (M.mode === 'mub') Object.assign(o, { d: M.d, w: pr.w, psi: plain(M.psi), probs: pr.probs, purity: pr.purity, collision: pr.collision, H: pr.H, Hsum: pr.Hsum, cSum: pr.cSum, bound: pr.bound, labels: M.labels });
    if (M.mode === 'hunt') Object.assign(o, { d: M.d, R: M.hunt.R, I: M.hunt.I, idx: pr.idx, snaps: M.hunt.snaps.length, it: pr.snap.it, rep: pr.snap.rep, cur: pr.snap.cur, best: pr.best, bestState: { re: Array.from(pr.bestRe), im: Array.from(pr.bestIm) }, bestProbs: pr.bestProbs, pureBound: M.pureBound, witness: { psi: plain(M.witness.psi), probs: M.witness.probs, H: M.witness.H }, labels: M.labels });
    return o;
  },
  bases: () => (MODEL.bases ? MODEL.bases.map((basis) => basis.map(plain)) : null),
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('twist'); S.playing = false; setPlayUI(); S.nowFrac = 0.18; $('now').value = S.nowFrac; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('twist');
setPlayUI();
requestAnimationFrame(frame);
})();
