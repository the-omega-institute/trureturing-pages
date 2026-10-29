/* WHOLE//PARTS · 整体大于局部 · 纠缠、局部盲区与隐形传态
   Two qubits as exact 4 × 4 density matrices ρ = ¼(I⊗I + a·σ⊗I + I⊗b·σ + Σ T_ij σ_i⊗σ_j). Compare mode puts two wholes side by
   side: their halves (a, b), their correlations T, the trace distances of the halves and of the wholes, the steering ellipsoid
   r(e) = (b + Tᵀe)/(1 + a·e) of Bob's qubit, and shared-random-number samples of a chosen joint measurement. Teleport mode runs the
   standard protocol on an 8 × 8 matrix: Bell measurement on the input and Alice's half, two bits, the Pauli correction I, X, Z or
   ZX at Bob; the sphere-averaged fidelity is (2F + 1)/3 with F = ⟨Φ⁺|ρ|Φ⁺⟩.
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
const N_CMP = 400, RUN_CMP = 12, N_TP = 48, RUN_TP = 36;
const FAMS = ['phiP', 'phiM', 'psiM', 'mix', 'werner', 'phase', 'partial', 'product'];
const FAM_LABEL = { phiP: ['Φ⁺', 'Φ⁺'], phiM: ['Φ⁻', 'Φ⁻'], psiM: ['Ψ⁻', 'Ψ⁻'], mix: ['经典混合', 'Classical mix'], werner: ['Werner', 'Werner'], phase: ['相位 φ', 'Phase φ'], partial: ['部分纠缠', 'Partial'], product: ['|00⟩', '|00⟩'] };
const AX = ['X', 'Y', 'Z'];
const BELL_NAMES = ['Φ⁺', 'Ψ⁺', 'Ψ⁻', 'Φ⁻'], CORR_NAMES = ['I', 'X', 'ZX', 'Z'];

/* =====================================================================
   2. State and presets
   ===================================================================== */
const S = { mode: 'compare', famA: 'phiP', famB: 'phiM', parA: 0.6, parB: 0, axA: 0, axB: 0, famR: 'phiP', parR: 0.6, theta: 60, phi: 40, bits: 1,
  seed: 1, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'bellpair' };
const PRESETS = {
  bellpair: { mode: 'compare', famA: 'phiP', famB: 'phiM', axA: 0, axB: 0,
    zh: 'Φ⁺ 与 Φ⁻ 是正交的两个纯态，整体一次就能分开。可甲、乙各自看到的都是 I/2：箭头都缩在球心，单边统计全是 50/50。把两边结果放在一起对照，X⊗X 关联一个 +1、一个 −1。',
    en: 'Φ⁺ and Φ⁻ are orthogonal pure states, distinguishable in one shot as wholes. Yet Alice and Bob each see I/2: both arrows sit at the centre and every one-sided statistic is 50/50. Put the two sides’ results together and the X⊗X correlation is +1 for one and −1 for the other.' },
  classical: { mode: 'compare', famA: 'phiP', famB: 'mix', axA: 0, axB: 0,
    zh: '贝尔态对经典关联混合 ½(|00⟩⟨00| + |11⟩⟨11|)：两边一样是 I/2，Z⊗Z 关联一样是 +1。差别藏在 X⊗X 与 Y⊗Y：纠缠态 ±1，经典混合 0。乙的引导椭球一个是整个球，一个只剩一根轴。',
    en: 'The Bell state against the classically correlated mixture ½(|00⟩⟨00| + |11⟩⟨11|): both sides are I/2 for both, and the Z⊗Z correlation is +1 for both. The difference hides in X⊗X and Y⊗Y: ±1 for the entangled state, 0 for the mixture. Bob’s steering ellipsoid is the whole ball for one and a single axis for the other.' },
  werner: { mode: 'compare', famA: 'werner', famB: 'werner', parA: 0.6, parB: 0, axA: 2, axB: 2,
    zh: 'Werner 态 pΦ⁺ + (1 − p)I/4：p = 0.6 对 p = 0。两边永远都是 I/2，只有关联缩成 p 倍，引导椭球缩成半径 p 的小球。拖动 p，单边统计一点不变。',
    en: 'The Werner state pΦ⁺ + (1 − p)I/4: p = 0.6 against p = 0. Both sides stay I/2 for every p; only the correlations shrink by the factor p, and the steering ellipsoid shrinks to a ball of radius p. Drag p: the one-sided statistics do not move.' },
  phase: { mode: 'compare', famA: 'phase', famB: 'phiP', parA: 0.25, axA: 0, axB: 0,
    zh: '(|00⟩ + e^{iφ}|11⟩)/√2，φ = 90°，对 Φ⁺：相对相位只活在关联里。X⊗X 关联 cos φ = 0 对 1，单边统计完全相同。拖动 φ 看引导椭球绕 Z 轴转动。',
    en: '(|00⟩ + e^{iφ}|11⟩)/√2 with φ = 90° against Φ⁺: the relative phase lives only in the correlations. The X⊗X correlation is cos φ = 0 against 1, while the one-sided statistics are identical. Drag φ and watch the steering ellipsoid turn about the Z axis.' },
  product: { mode: 'compare', famA: 'product', famB: 'phiP', axA: 2, axB: 2,
    zh: '对照：乘积态 |00⟩ 对 Φ⁺。两边的箭头一个在北极、一个在球心，单边统计就能分开（局部差别 0.5）。反倒是 Z⊗Z 关联两个都是 +1。',
    en: 'A control: the product state |00⟩ against Φ⁺. One arrow sits at the north pole and the other at the centre, so one side’s statistics already tell them apart (local difference 0.5). Here it is the Z⊗Z correlation that agrees: +1 for both.' },
  teleport: { mode: 'teleport', famR: 'phiP', bits: 1, theta: 60, phi: 40,
    zh: '隐形传态：甲把输入 |ψ⟩ 与自己那一半做贝尔测量，四种结果各 1/4，用两个比特告诉乙；乙做 I、X、Z 或 ZX 纠正，拿到的正是 |ψ⟩，每次保真度 1。',
    en: 'Teleportation: Alice makes a Bell measurement on the input |ψ⟩ together with her half; each of the four results has probability 1/4 and goes to Bob as two bits; Bob applies I, X, Z or ZX and holds exactly |ψ⟩, with fidelity 1 every time.' },
  nobits: { mode: 'teleport', famR: 'phiP', bits: 0, theta: 60, phi: 40,
    zh: '不发那两个比特：乙每次拿到 |ψ⟩ 的四种泡利变形之一，平均起来正好是 I/2——和甲测量之前他的约化态一模一样。所以纠缠不能超光速传信，保真度只有 ½。',
    en: 'Withhold the two bits: each time Bob holds one of four Pauli-twisted copies of |ψ⟩, and on average they make exactly I/2, the same reduced state he had before Alice measured. So entanglement cannot send signals faster than light, and the fidelity is only ½.' },
  weak: { mode: 'teleport', famR: 'mix', bits: 1, theta: 60, phi: 40,
    zh: '换成经典关联混合态做资源：两边约化态与贝尔态完全相同，传态平均保真度却只有 2/3——正好是不用纠缠、测一下再重新制备能达到的上限。',
    en: 'Use the classically correlated mixture as the resource: its halves are exactly those of the Bell state, yet the average teleportation fidelity is only 2/3, exactly the best that measuring and re-preparing can do without entanglement.' }
};

/* =====================================================================
   3. Complex matrices (flat, row-major) and two-qubit families
   ===================================================================== */
const M_ = (n) => ({ n, re: new Float64Array(n * n), im: new Float64Array(n * n) });
function outer(vr, vi) { const n = vr.length, R = M_(n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { R.re[i * n + j] = vr[i] * vr[j] + vi[i] * vi[j]; R.im[i * n + j] = vi[i] * vr[j] - vr[i] * vi[j]; } return R; }
function mul(A, B) { const n = A.n, R = M_(n); for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) { const ar = A.re[i * n + k], ai = A.im[i * n + k]; if (!ar && !ai) continue; for (let j = 0; j < n; j++) { const br = B.re[k * n + j], bi = B.im[k * n + j]; R.re[i * n + j] += ar * br - ai * bi; R.im[i * n + j] += ar * bi + ai * br; } } return R; }
function kron(A, B) { const n = A.n, m = B.n, R = M_(n * m); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < m; k++) for (let l = 0; l < m; l++) { const ar = A.re[i * n + j], ai = A.im[i * n + j], br = B.re[k * m + l], bi = B.im[k * m + l], q = (i * m + k) * n * m + j * m + l; R.re[q] = ar * br - ai * bi; R.im[q] = ar * bi + ai * br; } return R; }
const trRe = (A) => { let s = 0; for (let i = 0; i < A.n; i++) s += A.re[i * A.n + i]; return s; };
const mk2 = (a, b, c, d) => { const R = M_(2); [a, b, c, d].forEach((z, k) => { R.re[k] = z[0]; R.im[k] = z[1]; }); return R; };
const I2 = mk2([1, 0], [0, 0], [0, 0], [1, 0]), SX = mk2([0, 0], [1, 0], [1, 0], [0, 0]), SY = mk2([0, 0], [0, -1], [0, 1], [0, 0]), SZ = mk2([1, 0], [0, 0], [0, 0], [-1, 0]);
const PAULI = [SX, SY, SZ];
const PP = [I2, SX, SY, SZ].map((P) => [I2, SX, SY, SZ].map((Q) => kron(P, Q)));      // σ_i ⊗ σ_j, i, j ∈ {I, X, Y, Z}
const exp4 = (R, P) => { let s = 0; for (let k = 0; k < 16; k++) s += R.re[k] * P.re[(k % 4) * 4 + Math.floor(k / 4)] - R.im[k] * P.im[(k % 4) * 4 + Math.floor(k / 4)]; return s; };   // Tr(RP)
const S2 = Math.SQRT1_2;
function parOf(fam, s) { return fam === 'werner' ? s : fam === 'phase' ? 2 * Math.PI * s : fam === 'partial' ? Math.PI / 4 * s : null; }
function family(fam, s) {
  const p = parOf(fam, s), v = (re, im = [0, 0, 0, 0]) => outer(Float64Array.from(re), Float64Array.from(im));
  switch (fam) {
    case 'phiP': return v([S2, 0, 0, S2]);
    case 'phiM': return v([S2, 0, 0, -S2]);
    case 'psiM': return v([0, S2, -S2, 0]);
    case 'mix': { const R = M_(4); R.re[0] = 0.5; R.re[15] = 0.5; return R; }
    case 'werner': { const R = v([S2, 0, 0, S2]); for (let k = 0; k < 16; k++) { R.re[k] *= p; R.im[k] *= p; } for (let i = 0; i < 4; i++) R.re[i * 5] += (1 - p) / 4; return R; }
    case 'phase': return v([S2, 0, 0, S2 * Math.cos(p)], [0, 0, 0, S2 * Math.sin(p)]);
    case 'partial': return v([Math.cos(p), 0, 0, Math.sin(p)]);
    default: return v([1, 0, 0, 0]);
  }
}
/* Pauli coordinates: a_i = Tr ρ(σ_i⊗I), b_j = Tr ρ(I⊗σ_j), T_ij = Tr ρ(σ_i⊗σ_j); the full 4 × 4 table includes the identity row and column */
function pauliTable(R) { return PP.map((row) => row.map((P) => exp4(R, P))); }
/* eigenvalues of a Hermitian n × n matrix through the real symmetric 2n × 2n embedding [[Re, −Im], [Im, Re]] (cyclic Jacobi) */
function hermEig(H) {
  const n = H.n, m = 2 * n, A = Array.from({ length: m }, () => new Float64Array(m));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const r = H.re[i * n + j], q = H.im[i * n + j]; A[i][j] = r; A[i + n][j + n] = r; A[i][j + n] = -q; A[i + n][j] = q; }
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) off += A[i][j] ** 2; if (off < 1e-30) break;
    for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < m; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < m; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
    }
  }
  const ev = Array.from({ length: m }, (_, i) => A[i][i]).sort((x, y) => x - y);
  return ev.filter((_, i) => i % 2 === 0);                     // each eigenvalue appears twice in the embedding
}
function traceDist(A, B) { const D = M_(A.n); for (let k = 0; k < A.re.length; k++) { D.re[k] = A.re[k] - B.re[k]; D.im[k] = A.im[k] - B.im[k]; } return hermEig(D).reduce((s, x) => s + Math.abs(x), 0) / 2; }
const purity = (R) => { let s = 0; for (let k = 0; k < R.re.length; k++) s += R.re[k] ** 2 + R.im[k] ** 2; return s; };
const blochDist = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]) / 2;      // trace distance of two qubit states
function steer(st, e) { const den = 1 + st.a[0] * e[0] + st.a[1] * e[1] + st.a[2] * e[2]; if (den < 1e-9) return null; return [0, 1, 2].map((j) => (st.b[j] + st.T[0][j] * e[0] + st.T[1][j] * e[1] + st.T[2][j] * e[2]) / den); }
function stateOf(fam, s) {
  const R = family(fam, s), P = pauliTable(R);
  return { fam, s, R, P, a: [P[1][0], P[2][0], P[3][0]], b: [P[0][1], P[0][2], P[0][3]], T: [1, 2, 3].map((i) => [1, 2, 3].map((j) => P[i][j])), purity: purity(R) };
}
const halfPurity = (v) => (1 + v[0] ** 2 + v[1] ** 2 + v[2] ** 2) / 2;

/* =====================================================================
   4. Teleportation on C ⊗ A ⊗ B (index 4c + 2a + b)
   ===================================================================== */
const BELL = [[S2, 0, 0, S2], [0, S2, S2, 0], [0, S2, -S2, 0], [S2, 0, 0, -S2]];                    // Φ⁺, Ψ⁺, Ψ⁻, Φ⁻ on (C, A)
const CORR = [I2, SX, mul(SZ, SX), SZ];
function inputVec(thDeg, phDeg) { const th = thDeg * Math.PI / 180, ph = phDeg * Math.PI / 180; return { re: [Math.cos(th / 2), Math.sin(th / 2) * Math.cos(ph)], im: [0, Math.sin(th / 2) * Math.sin(ph)], bloch: [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)] }; }
const blochOf = (r) => { const tr = r.re[0] + r.re[3]; return [2 * r.re[1] / tr, -2 * r.im[1] / tr, (r.re[0] - r.re[3]) / tr]; };
function teleport(R, psi) {
  const rho = kron(outer(Float64Array.from(psi.re), Float64Array.from(psi.im)), R), out = [];
  for (let k = 0; k < 4; k++) {
    const B = M_(2);                                       // Bob's unnormalized state ⟨β_k|ρ|β_k⟩ on (C, A)
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const w = BELL[k][i] * BELL[k][j]; if (!w) continue; const q = (2 * i + x) * 8 + 2 * j + y; B.re[x * 2 + y] += w * rho.re[q]; B.im[x * 2 + y] += w * rho.im[q];
    }
    const pk = B.re[0] + B.re[3], U = CORR[k], Ud = M_(2); for (let q = 0; q < 4; q++) { Ud.re[q] = U.re[(q % 2) * 2 + Math.floor(q / 2)]; Ud.im[q] = -U.im[(q % 2) * 2 + Math.floor(q / 2)]; }
    const C = mul(mul(U, B), Ud), pre = blochOf(B), post = blochOf(C);
    const fid = (r) => (1 + r[0] * psi.bloch[0] + r[1] * psi.bloch[1] + r[2] * psi.bloch[2]) / 2;
    out.push({ pk, pre, post, Fpre: fid(pre), Fpost: fid(post) });
  }
  return out;
}

/* =====================================================================
   5. The model
   ===================================================================== */
let MODEL = null, dirty = true;
function build() {
  const M = { mode: S.mode };
  if (S.mode === 'compare') {
    const A = stateOf(S.famA, S.parA), B = stateOf(S.famB, S.parB), rng = TRV.mulberry32(S.seed * 7919 + 17), u = Float64Array.from({ length: N_CMP }, () => rng());
    const sample = (st) => { const ia = S.axA, ib = S.axB, out = new Int8Array(N_CMP), p = [];
      for (const [s, t] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) p.push(Math.max(0, (1 + s * st.a[ia] + t * st.b[ib] + s * t * st.T[ia][ib]) / 4));
      for (let n = 0; n < N_CMP; n++) { let k = 0, acc = p[0]; while (k < 3 && u[n] >= acc) { k++; acc += p[k]; } out[n] = k; }
      return { p, out }; };
    Object.assign(M, { A, B, sA: sample(A), sB: sample(B), u,
      locA: blochDist(A.a, B.a), locB: blochDist(A.b, B.b), glob: traceDist(A.R, B.R) });
    M.loc = Math.max(M.locA, M.locB);
    M.ellA = ellipsoid(A); M.ellB = ellipsoid(B);
  } else {
    const R = family(S.famR, S.parR), P = pauliTable(R), psi = inputVec(S.theta, S.phi), tp = teleport(R, psi), rng = TRV.mulberry32(S.seed * 104729 + 3);
    const res = { a: [P[1][0], P[2][0], P[3][0]], b: [P[0][1], P[0][2], P[0][3]], T: [1, 2, 3].map((i) => [1, 2, 3].map((j) => P[i][j])) };
    const outc = new Int8Array(N_TP); for (let n = 0; n < N_TP; n++) { const v = rng(); let k = 0, acc = tp[0].pk; while (k < 3 && v >= acc) { k++; acc += tp[k].pk; } outc[n] = k; }
    const F = (R.re[0] + R.re[15] + R.re[3] + R.re[12]) / 2;                      // ⟨Φ⁺|ρ|Φ⁺⟩
    const Fexp = tp.reduce((s, q) => s + q.pk * (S.bits ? q.Fpost : q.Fpre), 0);
    Object.assign(M, { R, res, psi, tp, outc, F, avg: (2 * F + 1) / 3, Fexp, bobNoBits: res.b, ell: ellipsoid(res) });
  }
  MODEL = M;
}
function ellipsoid(st) {                                   // latitude and longitude lines of r(e) over the unit sphere of e
  const lines = [];
  for (let i = 1; i < 6; i++) { const th = Math.PI * i / 6, L = []; for (let k = 0; k <= 36; k++) { const ph = 2 * Math.PI * k / 36; L.push(steer(st, [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)])); } lines.push(L); }
  for (let k = 0; k < 6; k++) { const ph = Math.PI * k / 6, L = []; for (let i = 0; i <= 36; i++) { const th = 2 * Math.PI * i / 36; L.push(steer(st, [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)])); } lines.push(L); }
  return lines;
}
const N_OF = () => (S.mode === 'compare' ? N_CMP : N_TP);
const shotsNow = () => Math.min(N_OF(), Math.floor(S.nowFrac * N_OF() + 1e-9));
function compareStats(M, N) {                              // counts of the first N shots
  const st = (smp) => { let ap = 0, bp = 0, cor = 0; for (let n = 0; n < N; n++) { const k = smp.out[n], s = k < 2 ? 1 : -1, t = k % 2 === 0 ? 1 : -1; if (s > 0) ap++; if (t > 0) bp++; cor += s * t; } return { pa: N ? ap / N : null, pb: N ? bp / N : null, E: N ? cor / N : null }; };
  return { A: st(M.sA), B: st(M.sB) };
}
function teleportStats(M, N) {
  const counts = [0, 0, 0, 0]; let fs = 0;
  for (let n = 0; n < N; n++) { const k = M.outc[n]; counts[k]++; fs += S.bits ? M.tp[k].Fpost : M.tp[k].Fpre; }
  return { counts, freq: counts.map((c) => (N ? c / N : null)), meanF: N ? fs / N : null };
}

/* =====================================================================
   6. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const f3 = (v) => (v === null || !isFinite(v) ? '—' : v.toFixed(3));
const sgn3 = (v) => (v === null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(3));
const famName = (f) => T(FAM_LABEL[f][0], FAM_LABEL[f][1]);
const famFull = (f, s) => (f === 'werner' ? `Werner p = ${s.toFixed(2)}` : f === 'phase' ? `${famName(f)} = ${Math.round(360 * s)}°` : f === 'partial' ? `${famName(f)} θ = ${(45 * s).toFixed(1)}°` : famName(f));
function parLabel(fam, s) {
  if (fam === 'werner') return [T('混合比例 p', 'Mixing weight p'), s.toFixed(2)];
  if (fam === 'phase') return [T('相对相位 φ', 'Relative phase φ'), `${Math.round(360 * s)}°`];
  if (fam === 'partial') return [T('纠缠角 θ（|00⟩ 与 |11⟩ 的权重）', 'Entangling angle θ (weights of |00⟩ and |11⟩)'), `${(45 * s).toFixed(1)}°`];
  return null;
}
function fillFamChips(box, key) {
  box.innerHTML = FAMS.map((f) => `<button class="chip" data-fam="${f}" aria-pressed="false"><span class="zh">${FAM_LABEL[f][0]}</span><span class="en">${FAM_LABEL[f][1]}</span></button>`).join('');
  box.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { const f = FAMS.includes(b.dataset.fam) ? b.dataset.fam : 'phiP'; if (S[key] !== f) { S[key] = f; custom(); } }));
}
fillFamChips($('famA'), 'famA'); fillFamChips($('famB'), 'famB'); fillFamChips($('famR'), 'famR');

/* =====================================================================
   7. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 16000, PTS_MAX = 160, RAD = 1.15;
const CAMS = { iso: [0.42, 1.2, 12.5], front: [0.0001, 1.5708, 12.5], top: [0.0001, 0.12, 13] };
const cam = { theta: 0.42, phi: 1.2, r: 12.5, tTheta: 0.42, tPhi: 1.2, tR: 12.5 };
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
    d.textContent = T('这个浏览器没有提供 WebGL，三维视图无法显示。下方的统计图、方向网格和右侧读数仍然可用。', 'This browser does not provide WebGL, so the 3D view cannot be shown. The statistics chart, the direction grid and the readouts still work.');
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
/* Bloch (x, y, z) → scene (x, z, −y): Z points up */
const toScene = (c, r, k = RAD) => [c[0] + k * r[0], c[1] + k * r[2], c[2] - k * r[1]];
const BALLS_CMP = { aA: [-2.5, 1.45, 0], bA: [2.5, 1.45, 0], aB: [-2.5, -1.45, 0], bB: [2.5, -1.45, 0] };
const BALLS_TP = { c: [-4.2, 0, 0], a: [-1.5, 0, 0], b: [3.4, 0, 0] };
function updateGL(time) {
  const M = MODEL;
  const L = lines.geometry.attributes, Pp = L.position.array, Cc = L.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp.set(a, 3 * v); Cc.set([col[0] * k, col[1] * k, col[2] * k], 3 * v); v++; Pp.set(b, 3 * v); Cc.set([col[0] * k, col[1] * k, col[2] * k], 3 * v); v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array.set(p, 3 * np); PT.aColor.array.set(col, 3 * np); PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  const ball = (c, k = 0.22) => {
    for (const [u, w] of [[[1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 0, 1]], [[0, 1, 0], [0, 0, 1]]]) { let prev = null; for (let q = 0; q <= 48; q++) { const a = 2 * Math.PI * q / 48, r = [0, 1, 2].map((i) => Math.cos(a) * u[i] + Math.sin(a) * w[i]), p = toScene(c, r); if (prev) seg(prev, p, COL.gray, k); prev = p; } }
    for (let i = 0; i < 3; i++) { const e = [0, 0, 0]; e[i] = 1; seg(toScene(c, e.map((x) => -x)), toScene(c, e), COL.gray, k * 0.7); }
  };
  const arrow = (c, r, col, k = 1) => { const tip = toScene(c, r); seg(c, tip, col, k); dot(tip, col, 0.95 * k, 2.2); if (Math.hypot(...r) < 0.02) dot(c, col, 0.9 * k, 2.6); };
  const ell = (c, Ls, col, k) => { for (const Lq of Ls) { let prev = null; for (const r of Lq) { const p = r ? toScene(c, r) : null; if (prev && p) seg(prev, p, col, k); prev = p; } } };
  if (M.mode === 'compare') {
    const N = shotsNow();
    for (const [tag, st, ellL, ca, cb] of [['A', M.A, M.ellA, BALLS_CMP.aA, BALLS_CMP.bA], ['B', M.B, M.ellB, BALLS_CMP.aB, BALLS_CMP.bB]]) {
      ball(ca); ball(cb);
      ell(cb, ellL, tag === 'A' ? COL.cyan : COL.magenta, 0.42);
      arrow(ca, st.a, COL.sigma); arrow(cb, st.b, COL.sigma);
      // Alice's measured axis and the two states Bob is steered into
      const e = [0, 0, 0]; e[S.axA] = 1; seg(toScene(ca, e.map((x) => -x)), toScene(ca, e), COL.amber, 0.85);
      const rp = steer(st, e), rm = steer(st, e.map((x) => -x));
      if (rp) dot(toScene(cb, rp), GREEN, 0.9, 1.7); if (rm) dot(toScene(cb, rm), COL.magenta, 0.9, 1.7);
      // the correlation bridge: brightness grows with the correlation length ‖T‖/√3
      const tn = Math.sqrt(st.T.flat().reduce((s, x) => s + x * x, 0) / 3);
      for (let q = 0; q < 5; q++) { const y = ca[1] + (q - 2) * 0.06; seg([ca[0] + RAD + 0.15, y, 0], [cb[0] - RAD - 0.15, y, 0], tag === 'A' ? COL.cyan : COL.magenta, 0.08 + 0.5 * tn * (q === 2 ? 1 : 0.4)); }
      // the latest shot flashes on both balls
      if (N > 0) { const k = (tag === 'A' ? M.sA : M.sB).out[N - 1], s = k < 2 ? 1 : -1, t = k % 2 === 0 ? 1 : -1, eb = [0, 0, 0]; eb[S.axB] = 1;
        dot(toScene(ca, e.map((x) => s * x)), s > 0 ? GREEN : COL.magenta, 0.8, 1.5); dot(toScene(cb, eb.map((x) => t * x)), t > 0 ? GREEN : COL.magenta, 0.8, 1.5); }
    }
  } else {
    const n = Math.min(N_TP - 1, Math.floor(S.nowFrac * N_TP)), sub = S.nowFrac >= 1 ? 1 : S.nowFrac * N_TP - n, k = M.outc[n], q = M.tp[k];
    ball(BALLS_TP.c); ball(BALLS_TP.a); ball(BALLS_TP.b);
    arrow(BALLS_TP.c, M.psi.bloch, COL.amber);
    arrow(BALLS_TP.a, M.res.a, COL.sigma, 0.8);
    // the shared resource between Alice's half and Bob
    const tn = Math.sqrt(M.res.T.flat().reduce((s, x) => s + x * x, 0) / 3);
    for (let w = 0; w < 5; w++) { const y = (w - 2) * 0.06; seg([BALLS_TP.a[0] + RAD + 0.15, y, 0], [BALLS_TP.b[0] - RAD - 0.15, y, 0], COL.cyan, 0.08 + 0.5 * tn * (w === 2 ? 1 : 0.4)); }
    ell(BALLS_TP.b, M.ell, COL.cyan, 0.22);
    // Bell measurement on (C, A)
    if (sub < 0.3) { const f = 1 - sub / 0.3; for (let w = -1; w <= 1; w++) seg([BALLS_TP.c[0] + RAD, w * 0.1, 0], [BALLS_TP.a[0] - RAD, w * 0.1, 0], COL.amber, 0.25 + 0.75 * f); }
    // two bits fly to Bob along an arc
    const arcAt = (g) => [BALLS_TP.a[0] + (BALLS_TP.b[0] - BALLS_TP.a[0]) * g, 1.9 * Math.sin(Math.PI * g) + 0.2, 0];
    if (S.bits) { let prev = null; for (let q = 0; q <= 40; q++) { const p = arcAt(q / 40); if (prev && q % 2) seg(prev, p, COL.amber, 0.22); prev = p; } }
    if (S.bits && sub >= 0.3 && sub < 0.7) { const f = (sub - 0.3) / 0.4; for (const off of [0, 0.12]) dot(arcAt(Math.max(0, Math.min(1, f - off))), COL.amber, 0.95, 2.8); }
    // Bob: earlier uncorrected states as a faint cloud, then this run's state before and after the correction
    for (let m = 0; m < n && np < PTS_MAX - 6; m++) dot(toScene(BALLS_TP.b, M.tp[M.outc[m]].pre), COL.gray, 0.35, 0.9);
    const ghost = toScene(BALLS_TP.b, M.psi.bloch); seg(BALLS_TP.b, ghost, COL.amber, 0.28);
    if (sub >= 0.3) arrow(BALLS_TP.b, q.pre, COL.magenta, S.bits && sub >= 0.7 ? 0.4 : 1);
    if (S.bits && sub >= 0.7) arrow(BALLS_TP.b, q.post, GREEN);
    if (!S.bits) arrow(BALLS_TP.b, M.bobNoBits, COL.sigma, 0.7);
  }
  lines.geometry.setDrawRange(0, v); L.position.needsUpdate = true; L.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 58 * renderer.getPixelRatio();
  void time;
}

/* =====================================================================
   8. Camera
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.6 : 1);
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
function mkTag(cls) { const el = document.createElement('div'); el.className = 'tag ' + cls; tagsBox.appendChild(el); return el; }
const tg = { aA: mkTag('cy raw'), bA: mkTag('cy raw'), aB: mkTag('mg raw'), bB: mkTag('mg raw'), wA: mkTag('cy raw'), wB: mkTag('mg raw'), c: mkTag('hot raw'), a: mkTag('raw'), b: mkTag('raw'), bits: mkTag('hot raw'), out: mkTag('gn raw') };
function placeTag(el, p, show = true) {
  if (!glOK || !show) { el.style.display = 'none'; return; }
  const q = proj3(p); if (q.z > 1 || q.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const w = el.offsetWidth, W = stage.clientWidth, x = Math.min(W - w / 2 - 6, Math.max(w / 2 + 6, q.x));
  el.style.left = x + 'px'; el.style.top = q.y + 'px';
}
function updateTags() {
  const M = MODEL, cmp = M.mode === 'compare';
  if (cmp) {
    tg.aA.textContent = T('甲 · A', 'ALICE · A'); tg.bA.textContent = T('乙 · A', 'BOB · A'); tg.aB.textContent = T('甲 · B', 'ALICE · B'); tg.bB.textContent = T('乙 · B', 'BOB · B');
    tg.wA.textContent = `A = ${famFull(S.famA, S.parA)}`; tg.wB.textContent = `B = ${famFull(S.famB, S.parB)}`;
  }
  placeTag(tg.aA, [BALLS_CMP.aA[0], BALLS_CMP.aA[1] + RAD + 0.32, 0], cmp); placeTag(tg.bA, [BALLS_CMP.bA[0], BALLS_CMP.bA[1] + RAD + 0.32, 0], cmp);
  placeTag(tg.aB, [BALLS_CMP.aB[0], BALLS_CMP.aB[1] - RAD - 0.32, 0], cmp); placeTag(tg.bB, [BALLS_CMP.bB[0], BALLS_CMP.bB[1] - RAD - 0.32, 0], cmp);
  placeTag(tg.wA, [0, BALLS_CMP.aA[1] + 0.32, 0], cmp); placeTag(tg.wB, [0, BALLS_CMP.aB[1] - 0.32, 0], cmp);
  if (!cmp) {
    const n = Math.min(N_TP - 1, Math.floor(S.nowFrac * N_TP)), sub = S.nowFrac >= 1 ? 1 : S.nowFrac * N_TP - n, k = M.outc[n];
    tg.c.textContent = T('输入 |ψ⟩', 'INPUT |ψ⟩'); tg.a.textContent = T('甲的一半', 'ALICE’S HALF'); tg.b.textContent = T('乙', 'BOB');
    tg.bits.textContent = S.bits ? T(`两个比特 → ${CORR_NAMES[k]}`, `TWO BITS → ${CORR_NAMES[k]}`) : T('比特没有发出', 'BITS WITHHELD');
    tg.out.textContent = T(`结果 ${BELL_NAMES[k]}`, `RESULT ${BELL_NAMES[k]}`);
    placeTag(tg.c, [BALLS_TP.c[0], RAD + 0.4, 0]); placeTag(tg.a, [BALLS_TP.a[0], RAD + 0.4, 0]); placeTag(tg.b, [BALLS_TP.b[0], RAD + 0.4, 0]);
    placeTag(tg.out, [(BALLS_TP.c[0] + BALLS_TP.a[0]) / 2, -RAD - 0.4, 0], sub < 0.7);
    placeTag(tg.bits, [(BALLS_TP.a[0] + BALLS_TP.b[0]) / 2, 2.45, 0], sub >= 0.3);
  } else for (const key of ['c', 'a', 'b', 'bits', 'out']) placeTag(tg[key], [0, 0, 0], false);
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
function drawCompareStats() {
  const F = frame2d(cv1, 12); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, N = shotsNow(), st = compareStats(M, N);
  const groups = [['A', M.A, st.A, CY], ['B', M.B, st.B, MG]], gw = iw / 2;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textBaseline = 'top';
  groups.forEach(([name, ex, obs, col], g) => {
    const x0 = pl + g * gw + 6 * dpr, bw = (gw - 30 * dpr) / 3, base = pt + ih * 0.5;
    ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.fillText(`${name} = ${g ? famFull(S.famB, S.parB) : famFull(S.famA, S.parA)}`, x0, pt);
    const items = [[T(`甲 ${AX[S.axA]}=+`, `Alice ${AX[S.axA]}=+`), obs.pa, (1 + ex.a[S.axA]) / 2, false], [T(`乙 ${AX[S.axB]}=+`, `Bob ${AX[S.axB]}=+`), obs.pb, (1 + ex.b[S.axB]) / 2, false], [`⟨${AX[S.axA]}⊗${AX[S.axB]}⟩`, obs.E, ex.T[S.axA][S.axB], true]];
    items.forEach(([lab, val, exact, signed], i) => {
      const x = x0 + i * (bw + 8 * dpr), top = pt + 16 * dpr, hh = ih - 30 * dpr, zero = signed ? top + hh / 2 : top + hh, scale = signed ? hh / 2 : hh;
      ctx.strokeStyle = FAINT; ctx.strokeRect(x, top, bw, hh);
      if (signed) { ctx.beginPath(); ctx.moveTo(x, zero); ctx.lineTo(x + bw, zero); ctx.stroke(); }
      if (val !== null) { ctx.fillStyle = col; ctx.globalAlpha = 0.75; const h = val * scale; ctx.fillRect(x + bw * 0.2, h >= 0 ? zero - h : zero, bw * 0.6, Math.abs(h)); ctx.globalAlpha = 1; }
      const ye = zero - exact * scale; ctx.strokeStyle = AM; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.moveTo(x, ye); ctx.lineTo(x + bw, ye); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.fillText(lab, x + bw / 2, top + hh + 3 * dpr);
      ctx.fillStyle = INK; ctx.fillText(val === null ? '—' : signed ? sgn3(val) : val.toFixed(3), x + bw / 2, top + 2 * dpr);
      void base;
    });
  });
  $('c1Meta').textContent = T(`前 ${N} 次 · 琥珀线 = 精确值`, `first ${N} shots · amber line = exact value`);
}
function drawGrid() {
  const F = frame2d(cv2, 12); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, names = ['I', 'X', 'Y', 'Z'];
  const cell = Math.min((iw * 0.55 - 24 * dpr) / 4, (ih - 14 * dpr) / 4), x0 = pl + 22 * dpr, y0 = pt + 12 * dpr;
  const short = (d) => { const a = Math.abs(d); if (a < 5e-4) return '0'; const t = Math.abs(a - Math.round(a)) < 5e-4 ? String(Math.round(a)) : a.toFixed(a < 1 ? 2 : 1).replace(/^0\./, '.'); return (d > 0 ? '+' : '−') + t; };
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) { ctx.fillStyle = DIM; ctx.fillText(names[i], x0 - 10 * dpr, y0 + (i + 0.5) * cell); ctx.fillText(names[i], x0 + (i + 0.5) * cell, y0 - 7 * dpr); }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const d = M.A.P[i][j] - M.B.P[i][j], x = x0 + j * cell, y = y0 + i * cell, local = (i === 0) !== (j === 0);
    if (i === 0 && j === 0) { ctx.fillStyle = 'rgba(120,140,160,0.12)'; ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2); continue; }
    ctx.fillStyle = Math.abs(d) < 1e-9 ? 'rgba(20,32,44,0.6)' : d > 0 ? `rgba(0,240,255,${(0.15 + 0.4 * Math.min(1, Math.abs(d) / 2)).toFixed(3)})` : `rgba(255,43,214,${(0.15 + 0.4 * Math.min(1, Math.abs(d) / 2)).toFixed(3)})`;
    ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    ctx.strokeStyle = local ? AM : FAINT; ctx.lineWidth = (local ? 1.4 : 1) * dpr; ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
    ctx.fillStyle = Math.abs(d) < 1e-9 ? FAINT : INK; ctx.font = `${Math.min(9.5, cell / dpr / 3.2) * dpr}px ${TRV.fonts.data}`; ctx.fillText(short(d), x + cell / 2, y + cell / 2);
  }
  ctx.strokeStyle = OK; ctx.lineWidth = 2 * dpr; ctx.strokeRect(x0 + (S.axB + 1) * cell + 1, y0 + (S.axA + 1) * cell + 1, cell - 2, cell - 2); ctx.lineWidth = 1;
  // summary to the right: the size of the difference in the 6 local cells and in the 9 correlation cells
  let nl = 0, nc = 0; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const d2 = (M.A.P[i][j] - M.B.P[i][j]) ** 2; if ((i === 0) !== (j === 0)) nl += d2; else if (i && j) nc += d2; }
  const tx = x0 + 4 * cell + 16 * dpr, lines = [[T('甲 ↓ ⊗ 乙 →', 'Alice ↓ ⊗ Bob →'), DIM], [T(`局部 6 格：‖Δ‖ = ${Math.sqrt(nl).toFixed(3)}`, `6 local cells: ‖Δ‖ = ${Math.sqrt(nl).toFixed(3)}`), AM], [T(`关联 9 格：‖Δ‖ = ${Math.sqrt(nc).toFixed(3)}`, `9 correlation cells: ‖Δ‖ = ${Math.sqrt(nc).toFixed(3)}`), CY], [nl < 1e-18 ? T('只看一边：完全分不开', 'one side alone: no difference at all') : T('只看一边：已经分得开', 'one side alone: already differs'), nl < 1e-18 ? MG : OK]];
  ctx.textAlign = 'left'; ctx.font = `${10 * dpr}px ${TRV.fonts.body}`;
  lines.forEach(([t, col], k) => { ctx.fillStyle = col; ctx.fillText(t, tx, y0 + (k + 0.5) * Math.max(16 * dpr, cell)); });
  const key = `${TRV.lang()}`;
  if ($('c2Meta').dataset.key !== key) {
    $('c2Meta').dataset.key = key;
    const sw = (c, t) => `<span class="it"><span class="sw" style="--c:${c}"></span>${t}</span>`;
    $('c2Meta').innerHTML = `${sw(AM, T('局部：一行一列', 'local: a row and a column'))} ${sw(OK, T('正在测的方向', 'direction being measured'))}`;
  }
}
function drawOutcomes() {
  const F = frame2d(cv1, 36); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, N = shotsNow(), st = teleportStats(M, N), bw = iw / 4;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  ctx.strokeStyle = FAINT; ctx.globalAlpha = 0.6; ctx.beginPath(); for (const g of [0, 0.25, 0.5]) { const y = pt + ih - g / 0.5 * ih; ctx.moveTo(pl, y); ctx.lineTo(pl + iw, y); } ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of [0, 0.25, 0.5]) ctx.fillText(g.toFixed(2), pl - 5 * dpr, pt + ih - g / 0.5 * ih);
  for (let k = 0; k < 4; k++) {
    const x = pl + k * bw, fr = st.freq[k], ex = M.tp[k].pk;
    if (fr !== null) { ctx.fillStyle = CY; ctx.globalAlpha = 0.8; const h = Math.min(1, fr / 0.5) * ih; ctx.fillRect(x + bw * 0.22, pt + ih - h, bw * 0.56, h); ctx.globalAlpha = 1; }
    const ye = pt + ih - Math.min(1, ex / 0.5) * ih; ctx.strokeStyle = AM; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.moveTo(x + bw * 0.12, ye); ctx.lineTo(x + bw * 0.88, ye); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(`${BELL_NAMES[k]} → ${CORR_NAMES[k]}`, x + bw / 2, pt + ih + 3 * dpr);
  }
  $('c1Meta').textContent = T(`前 ${N} 次 · 琥珀线 = 精确概率`, `first ${N} runs · amber line = exact probability`);
}
function drawFidelity() {
  const F = frame2d(cv2, 36); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, N = shotsNow(), X = (n) => pl + n / N_TP * iw, Y = (v) => pt + ih - v * ih;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  ctx.strokeStyle = FAINT; ctx.globalAlpha = 0.6; ctx.beginPath(); for (const g of [0, 0.5, 1]) { ctx.moveTo(pl, Y(g)); ctx.lineTo(pl + iw, Y(g)); } ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of [0, 0.5, 1]) ctx.fillText(g.toFixed(1), pl - 5 * dpr, Y(g));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const n of [0, N_TP / 2, N_TP]) ctx.fillText(String(n), X(n), pt + ih + 3 * dpr);
  const hline = (v, col, dash) => { ctx.strokeStyle = col; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash(dash ? [5 * dpr, 4 * dpr] : []); ctx.beginPath(); ctx.moveTo(pl, Y(v)); ctx.lineTo(pl + iw, Y(v)); ctx.stroke(); ctx.setLineDash([]); };
  hline(2 / 3, AM, true); hline(M.Fexp, OK, false); if (S.bits) hline(M.avg, MG, true);
  let fs = 0; ctx.strokeStyle = CY; ctx.lineWidth = 2 * dpr; ctx.beginPath();
  for (let n = 0; n < N; n++) { const q = M.tp[M.outc[n]]; fs += S.bits ? q.Fpost : q.Fpre; const y = Y(fs / (n + 1)); if (n) ctx.lineTo(X(n + 1), y); else ctx.moveTo(X(n + 1), y); }
  ctx.stroke(); ctx.lineWidth = 1;
  const key = `${TRV.lang()}|${S.bits}`;
  if ($('c2Meta').dataset.key !== key) {
    $('c2Meta').dataset.key = key;
    const sw = (c, t) => `<span class="it"><span class="sw" style="--c:${c}"></span>${t}</span>`;
    $('c2Meta').innerHTML = `${sw(CY, T('累计平均', 'running mean'))} ${sw(OK, T('这个输入的期望', 'expected for this input'))}${S.bits ? ' ' + sw(MG, T('全部输入平均', 'all-input average')) : ''} ${sw(AM, T('经典极限 2/3', 'classical limit 2/3'))}`;
  }
}

/* =====================================================================
   11. Readouts and controls
   ===================================================================== */
let syncedFrac = NaN, toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function syncParField(fam, s, field, label, out, input) {
  const pl = parLabel(fam, s); $(field).hidden = !pl; if (!pl) return;
  $(label).textContent = pl[0]; $(out).textContent = pl[1]; input.value = s;
}
function syncOutputs() {
  if (dirty) { build(); dirty = false; toasted = false; }
  const M = MODEL, N = shotsNow(), cmp = M.mode === 'compare'; syncedFrac = S.nowFrac;
  $('cmpPanel').hidden = !cmp; $('tpPanel').hidden = cmp; $('roCmp').hidden = !cmp; $('roTp').hidden = cmp;
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  for (const [box, key] of [['famA', 'famA'], ['famB', 'famB'], ['famR', 'famR']]) $(box).querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fam === S[key])));
  document.querySelectorAll('#axA .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.ax === S.axA)));
  document.querySelectorAll('#axB .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.ax === S.axB)));
  document.querySelectorAll('#bitChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.bits === S.bits)));
  syncParField(S.famA, S.parA, 'parAField', 'parALabel', 'oParA', $('parA')); syncParField(S.famB, S.parB, 'parBField', 'parBLabel', 'oParB', $('parB')); syncParField(S.famR, S.parR, 'parRField', 'parRLabel', 'oParR', $('parR'));
  $('oTheta').textContent = `${S.theta}°`; $('oPhi').textContent = `${S.phi}°`;
  $('modeNote').textContent = cmp ? T('同一串随机数抽样两个整体，比较才公平。', 'Both wholes are sampled with the same random numbers, so the comparison is fair.') : T('甲手里有输入比特和纠缠对的一半，乙手里有另一半。', 'Alice holds the input qubit and one half of the shared pair; Bob holds the other half.');
  $('presetNote').textContent = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义参数。', 'Custom settings.');
  if (cmp) {
    const st = compareStats(M, N), a = S.axA, b = S.axB;
    $('roLoc').textContent = `${f3(M.locA)} / ${f3(M.locB)}`;
    $('roGlob').textContent = f3(M.glob);
    $('roPur').textContent = `${f3(M.A.purity)} / ${f3(halfPurity(M.A.a))}`;
    $('roGuess').textContent = `${f3((1 + M.loc) / 2)} / ${f3((1 + M.glob) / 2)}`;
    $('roCorrL').textContent = T(`${AX[a]}⊗${AX[b]} 关联：A / B（精确）`, `${AX[a]}⊗${AX[b]} correlation: A / B (exact)`);
    $('roCorr').textContent = `${sgn3(M.A.T[a][b])} / ${sgn3(M.B.T[a][b])}`;
    $('roShare').textContent = '9/15 = 60%';
    $('roAside').textContent = T('只看一边 vs 看整体', 'one side vs the whole');
    $('roNote').innerHTML = M.loc < 1e-9
      ? T(`两边的约化态完全相同：只看任何一边，所有统计都一样，猜对的概率只有 ½。整体的迹距离却是 ${f3(M.glob)}——差别全在关联扇区里。`, `The reduced states agree exactly: from either side alone every statistic is the same and the chance of guessing right is only ½. Yet the wholes are at trace distance ${f3(M.glob)}: the whole difference sits in the correlation sector.`)
      : T(`两边的约化态不同（迹距离 ${f3(M.locA)} / ${f3(M.locB)}），只看一边就有机会分开它们。`, `The reduced states differ (trace distances ${f3(M.locA)} / ${f3(M.locB)}), so one side alone already has a chance of telling them apart.`);
    $('cmpNote').innerHTML = T(`甲沿 ${AX[a]}、乙沿 ${AX[b]} 测。前 ${N} 次里 A 的 ⟨${AX[a]}⊗${AX[b]}⟩ ≈ ${sgn3(st.A.E)}，B ≈ ${sgn3(st.B.E)}。网格亮绿框就是这个方向。`, `Alice measures along ${AX[a]} and Bob along ${AX[b]}. Over the first ${N} shots, ⟨${AX[a]}⊗${AX[b]}⟩ ≈ ${sgn3(st.A.E)} for A and ${sgn3(st.B.E)} for B. The bright green cell in the grid is this direction.`);
    $('c1Title').textContent = T('只看一边 · 把两边放在一起', 'ONE SIDE · BOTH SIDES TOGETHER');
    $('c2Title').textContent = T('15 个方向上 A − B 的差', 'A − B ALONG THE 15 DIRECTIONS');
    $('pillLoc').innerHTML = `LOCAL Δ <strong>${f3(M.loc)}</strong>`; $('pillGlob').innerHTML = `GLOBAL Δ <strong>${f3(M.glob)}</strong>`;
    $('hudBig').textContent = T(`A = ${famFull(S.famA, S.parA)} · B = ${famFull(S.famB, S.parB)}`, `A = ${famFull(S.famA, S.parA)} · B = ${famFull(S.famB, S.parB)}`);
    $('hudSub').textContent = T('箭头 = 一边的状态 · 网格椭球 = 甲能把乙引导到的状态 · 绿/品红点 = 甲测得 +/− 时乙的态', 'arrow = one side’s state · wire ellipsoid = states Alice can steer Bob into · green/magenta dot = Bob’s state when Alice gets +/−');
    $('litNote').textContent = T('切换到“隐形传态”，用同一组资源态看看它们的传态能力。', 'Switch to “Teleportation” to see how well the same resource states teleport.');
  } else {
    const st = teleportStats(M, N);
    $('roF').textContent = f3(M.Fexp); $('roAvg').textContent = f3(M.avg); $('roEnt').textContent = f3(M.F);
    $('roPk').textContent = M.tp.map((q) => q.pk.toFixed(3)).join(' · ');
    $('roBob').textContent = f3(Math.hypot(...M.bobNoBits));
    $('roRun').textContent = f3(st.meanF);
    $('roAside').textContent = 'F = ⟨Φ⁺|ρ|Φ⁺⟩';
    const eq = M.tp.every((q) => Math.abs(q.pk - 0.25) < 1e-12);
    $('roNote').innerHTML = (eq ? T('四种结果各 1/4，与输入无关：结果本身不带 |ψ⟩ 的任何信息。', 'Each result has probability 1/4 whatever the input: the results carry no information about |ψ⟩.') : T('这份资源的甲那一半不是 I/2，四种结果的概率随输入变化。', 'Alice’s half of this resource is not I/2, so the four probabilities depend on the input.'))
      + ' ' + (S.bits ? T(`收到比特、做完纠正，这个输入的期望保真度是 ${f3(M.Fexp)}，对所有输入平均是 (2F + 1)/3 = ${f3(M.avg)}。`, `With the bits and the correction, the expected fidelity for this input is ${f3(M.Fexp)}, and the average over all inputs is (2F + 1)/3 = ${f3(M.avg)}.`)
        : T(`没有比特，乙的态始终是他自己的约化态（布洛赫长度 ${f3(Math.hypot(...M.bobNoBits))}），保真度 ${f3(M.Fexp)}。`, `Without the bits Bob’s state stays his own reduced state (Bloch length ${f3(Math.hypot(...M.bobNoBits))}), with fidelity ${f3(M.Fexp)}.`));
    $('tpNote').innerHTML = T(`资源 ${famFull(S.famR, S.parR)}，与 Φ⁺ 的重叠 F = ${f3(M.F)}。两边约化态：甲 ${f3(Math.hypot(...M.res.a))}，乙 ${f3(Math.hypot(...M.res.b))}（布洛赫长度）。`, `Resource ${famFull(S.famR, S.parR)}, overlap with Φ⁺ F = ${f3(M.F)}. Reduced states: Alice ${f3(Math.hypot(...M.res.a))}, Bob ${f3(Math.hypot(...M.res.b))} (Bloch lengths).`);
    $('c1Title').textContent = T('四种贝尔测量结果', 'THE FOUR BELL RESULTS');
    $('c2Title').textContent = T('传过去的保真度', 'FIDELITY OF WHAT ARRIVES');
    $('pillLoc').innerHTML = `LOCAL Δ <strong>${f3(blochDist(M.res.b, [0, 0, 0]))}</strong>`; $('pillGlob').innerHTML = `F <strong>${f3(M.F)}</strong>`;
    const n = Math.min(N_TP - 1, Math.floor(S.nowFrac * N_TP));
    $('hudBig').textContent = T(`第 ${n + 1} 次 · 资源 ${famFull(S.famR, S.parR)}`, `run ${n + 1} · resource ${famFull(S.famR, S.parR)}`);
    $('hudSub').textContent = T('琥珀 = 输入 |ψ⟩（乙球里的淡线是目标）· 品红 = 纠正前乙的态 · 绿 = 纠正后 · 灰点 = 历次纠正前的态', 'amber = input |ψ⟩ (faint line in Bob’s ball = target) · magenta = Bob before the correction · green = after · grey dots = earlier uncorrected states');
    $('litNote').innerHTML = T(`经典极限 2/3：不用纠缠、测一下再重新制备的最好成绩。这份资源 ${M.avg > 2 / 3 + 1e-9 ? '超过' : M.avg < 2 / 3 - 1e-9 ? '低于' : '恰好等于'} 它。`, `The classical limit 2/3 is the best that measuring and re-preparing can do without entanglement. This resource ${M.avg > 2 / 3 + 1e-9 ? 'beats' : M.avg < 2 / 3 - 1e-9 ? 'falls below' : 'exactly matches'} it.`);
  }
  $('pillN').innerHTML = `N <strong>${N}</strong>`;
  $('pillMode').innerHTML = `MODE <strong>${cmp ? 'COMPARE' : 'TELEPORT'}</strong>`;
  $('clock').innerHTML = `${N} <small>${cmp ? T('次', 'shots') : T('次', 'runs')}</small>`;
  if (!toasted && S.playing && N >= N_OF()) {
    toasted = true;
    if (cmp) { const st = compareStats(M, N); toast(T(`<b>${N} 次</b>：单边 + 的比例 A ${f3(st.A.pa)}、B ${f3(st.B.pa)}；关联 A ${sgn3(st.A.E)}、B ${sgn3(st.B.E)}。`, `<b>${N} shots</b>: one-sided + rates A ${f3(st.A.pa)}, B ${f3(st.B.pa)}; correlations A ${sgn3(st.A.E)}, B ${sgn3(st.B.E)}.`)); }
    else { const st = teleportStats(M, N); toast(T(`<b>${N} 次传态</b>：平均保真度 ${f3(st.meanF)}（期望 ${f3(M.Fexp)}，经典极限 0.667）。`, `<b>${N} teleportations</b>: mean fidelity ${f3(st.meanF)} (expected ${f3(M.Fexp)}, classical limit 0.667).`)); }
  }
}
function syncRail() {
  const key = `${S.mode}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  const n = N_OF(), ticks = S.mode === 'compare' ? [0, 100, 200, 300, 400] : [0, 12, 24, 36, 48];
  $('marks').innerHTML = ticks.map((t, i) => `<i class="${i === 0 ? 'first' : i === ticks.length - 1 ? 'last' : ''}" style="left:${(t / n * 100).toFixed(2)}%">${t}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
function setControls() { $('parA').value = S.parA; $('parB').value = S.parB; $('parR').value = S.parR; $('theta').value = S.theta; $('phi').value = S.phi; }
for (const [id, key] of [['parA', 'parA'], ['parB', 'parB'], ['parR', 'parR']]) $(id).addEventListener('input', () => { S[key] = Math.min(1, Math.max(0, parseFloat($(id).value) || 0)); custom(); });
$('theta').addEventListener('input', () => { S.theta = parseInt($('theta').value, 10); custom(); });
$('phi').addEventListener('input', () => { S.phi = parseInt($('phi').value, 10); custom(); });
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => { const m = b.dataset.mode === 'teleport' ? 'teleport' : 'compare'; if (S.mode !== m) { S.mode = m; S.nowFrac = 0; custom(); } }));
document.querySelectorAll('#axA .chip').forEach((b) => b.addEventListener('click', () => { const a = Math.min(2, Math.max(0, +b.dataset.ax)); if (S.axA !== a) { S.axA = a; custom(); } }));
document.querySelectorAll('#axB .chip').forEach((b) => b.addEventListener('click', () => { const a = Math.min(2, Math.max(0, +b.dataset.ax)); if (S.axB !== a) { S.axB = a; custom(); } }));
document.querySelectorAll('#bitChips .chip').forEach((b) => b.addEventListener('click', () => { const v = b.dataset.bits === '0' ? 0 : 1; if (S.bits !== v) { S.bits = v; custom(); } }));
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  for (const k of ['mode', 'famA', 'famB', 'parA', 'parB', 'axA', 'axB', 'famR', 'parR', 'theta', 'phi', 'bits']) if (p[k] !== undefined) S[k] = p[k];
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
    const n = N_OF(), k = Math.floor(S.nowFrac * n + 1e-9) + (ev.key === 'ArrowRight' ? 1 : -1);
    S.nowFrac = Math.min(1, Math.max(0, k / n)); $('now').value = S.nowFrac;
  }
  else if (ev.key === 'r' || ev.key === 'R') { S.seed++; dirty = true; }
});

/* =====================================================================
   12. Main loop
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
      S.nowFrac += S.dir * dtSec * S.speed / (S.mode === 'compare' ? RUN_CMP : RUN_TP);
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 2.2; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.2; }
    }
    $('now').value = S.nowFrac;
  }
  if (S.nowFrac !== syncedFrac) syncOutputs();
  syncRail();
  if (glOK) { updateCamera(dtSec); updateGL(tAcc); renderer.render(scene3, camera); updateTags(); }
  if (MODEL.mode === 'compare') { drawCompareStats(); drawGrid(); } else { drawOutcomes(); drawFidelity(); }
  requestAnimationFrame(frame);
}

TRV.onLang(() => { syncOutputs(); $('marks').dataset.key = ''; });

/* read-only probe for automated browser tests */
const flat = (R) => ({ re: Array.from(R.re), im: Array.from(R.im) });
window.WP_DEBUG = {
  pending: () => dirty || S.nowFrac !== syncedFrac,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, N = shotsNow();
    if (M.mode === 'compare') {
      const part = (st, smp) => ({ R: flat(st.R), P: st.P.map((r) => r.slice()), a: st.a.slice(), b: st.b.slice(), T: st.T.map((r) => r.slice()), purity: st.purity, p: smp.p.slice(), out: Array.from(smp.out) });
      return { mode: M.mode, N, A: part(M.A, M.sA), B: part(M.B, M.sB), u: Array.from(M.u), locA: M.locA, locB: M.locB, loc: M.loc, glob: M.glob, stats: compareStats(M, N),
        steerA: [1, -1].map((s) => { const e = [0, 0, 0]; e[S.axA] = s; return steer(M.A, e); }), steerB: [1, -1].map((s) => { const e = [0, 0, 0]; e[S.axA] = s; return steer(M.B, e); }) };
    }
    return { mode: M.mode, N, R: flat(M.R), psi: { re: M.psi.re.slice(), im: M.psi.im.slice(), bloch: M.psi.bloch.slice() }, tp: M.tp.map((q) => ({ ...q, pre: q.pre.slice(), post: q.post.slice() })), outc: Array.from(M.outc),
      F: M.F, avg: M.avg, Fexp: M.Fexp, bobNoBits: M.bobNoBits.slice(), stats: teleportStats(M, N) };
  },
  steerOf: (side, e) => steer(side === 'B' ? MODEL.B : MODEL.A, e),
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('classical'); S.playing = false; setPlayUI(); S.nowFrac = 0.4; $('now').value = S.nowFrac; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('bellpair');
S.nowFrac = 0; S.playing = !reduceMotion; $('now').value = S.nowFrac;
setPlayUI();
requestAnimationFrame(frame);
})();
