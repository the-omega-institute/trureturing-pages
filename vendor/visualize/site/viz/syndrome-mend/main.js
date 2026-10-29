/* SYNDROME//MEND · 量子纠错 · 离开编码空间不等于丢了信息
   One logical qubit in the three-qubit repetition code Enc|0⟩ = |000⟩, Enc|1⟩ = |111⟩. The 8-dimensional space splits into four
   orthogonal layers S_j = X_j·Enc (j = 0 no flip, 1–3 flip qubit j) with S_i†S_j = δ_ij I (theory ST27.1). Noise is a mixture,
   a coherent superposition, or independent flips; branch j may also carry a known logical twist V_j = diag(z_j, 1) (ST29).
   The pipeline: encode → noise → read a possibly incomplete classical record r with T(r|j) → fold back with the old decoder
   Σ_j S_j†(·)S_j (ST27.2) → undo the phase of c_r = Σ_j p_j T(r|j) z_j. For phase-type branches the best error over all
   recoveries is e* = (1 − Σ_r|c_r|)/2 (Theorem ST30.2, a paper proof; not formalized).
   Theory: trureturing docs/develop/theory/QUANTUM-REALITY.md ST27–ST31. Frozen Lean anchors are named in the page text.
   Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const COL = TRV.rgb, GREEN = [0.27, 1.0, 0.70];
const reduceMotion = TRV.reduceMotion;
const { mulberry32, fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, ok: OK, cyan: CY, magenta: MG } = TRV.palette;
const STAGE_MAX = 5, STAGE_SECONDS = 11;
const LAYER_RGB = [COL.cyan, COL.amber, COL.magenta, GREEN], LAYER_CSS = [CY, AM, MG, OK];
const MASK = [0, 4, 2, 1];                              // bit mask of X_j on the index 4·q1 + 2·q2 + q3
const SYN = ['00', '10', '11', '01'];                    // (Z1Z2, Z2Z3) outcome of each layer
const BIT_A = [0, 1, 1, 0], BIT_B = [0, 0, 1, 1];
const CELL_CSS = ['#19f0ff', '#ffc83d', '#ff2fd0', '#46ffb2', '#9d8cff', '#ff8a3d', '#6fd3ff', '#e6ff5c'];
const CELL_RGB = CELL_CSS.map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255));
const RECS = ['full', 'bitA', 'bitB', 'none', 'bins', 'noisy'], MODES = ['mix', 'coh', 'iid'];
const TWISTS = { none: [0, 0, 0, 0], spread: [0, 90, 180, 270], pair: [0, 180, 0, 180] };
const DEG = Math.PI / 180;

/* =====================================================================
   2. State and presets
   ===================================================================== */
const S = { mode: 'mix', w: [0.25, 0.25, 0.25, 0.25], chi: 90, p: 0.1, phi: [0, 90, 180, 270], twist: 'spread', rec: 'bitA', K: 3, eps: 0.1,
  theta: 70, phase: 20, run: 0, stage: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'coarse' };
const Q4 = [0.25, 0.25, 0.25, 0.25];
const PRESETS = {
  flip: { mode: 'mix', w: [0, 1, 0, 0], twist: 'none', rec: 'full',
    zh: '噪声确定地翻转了第 1 个比特：整个态都离开了编码空间（漏出 λ = 1），但它落进了一个正交的错误副本里。把副本折回来，误差是 0（定理 ST27.2；例 ST27.3 是同一结构）。离开编码空间不等于丢了信息。',
    en: 'The noise certainly flips qubit 1: the whole state leaves the code space (leakage λ = 1), but it lands in an orthogonal error copy. Folding the copy back gives error 0 (Theorem ST27.2; Example ST27.3 has the same structure). Leaving the code space is not losing the information.' },
  mixed: { mode: 'mix', w: [0.4, 0.2, 0.2, 0.2], twist: 'none', rec: 'none',
    zh: '四个分支（不翻，或翻第 1、2、3 个比特）按概率混合，而且这里一个记录都不留。折回解码器不读任何东西也精确恢复：Σ S_j† 𝒩(ρ) S_j = tr(σ)ρ = ρ。',
    en: 'Four branches (no flip, or a flip of qubit 1, 2 or 3) are mixed with probabilities, and no record is kept at all. The fold-back decoder reads nothing and still recovers exactly: Σ S_j† 𝒩(ρ) S_j = tr(σ)ρ = ρ.' },
  coh: { mode: 'coh', w: Q4, chi: 90, twist: 'none', rec: 'none',
    zh: '错误不是随机挑一个，而是“没翻、翻 1、翻 2、翻 3”的相干叠加（综合征矩阵 σ 有非对角元）。同一个折回解码器照样精确恢复：它不需要知道 σ，也不需要 σ 是对角的（定理 ST27.2）。',
    en: 'The error is not one picked at random but a coherent superposition of “no flip, flip 1, flip 2, flip 3” (the syndrome matrix σ has off-diagonal entries). The same fold-back decoder still recovers exactly: it does not need to know σ, nor does σ have to be diagonal (Theorem ST27.2).' },
  iid: { mode: 'iid', p: 0.1, twist: 'none', rec: 'full',
    zh: '每个比特独立以 p = 0.1 翻转。两个比特同时翻转会落进与单比特翻转相同的层，却带着一个逻辑翻转 X：折回时分不清，于是失败。Knill–Laflamme 条件不成立；逻辑失败概率 3p² − 2p³ = 0.028，比不编码时的 0.1 小。',
    en: 'Each qubit flips independently with p = 0.1. Two simultaneous flips land in the same layer as a single flip but carry a logical flip X: folding back cannot tell them apart, so it fails. The Knill–Laflamme condition fails; the logical failure probability 3p² − 2p³ = 0.028 is smaller than the unencoded 0.1.' },
  twist: { mode: 'mix', w: Q4, twist: 'spread', rec: 'full',
    zh: '每个分支沿路径带回一个已知的逻辑相位 z_j = 1, i, −1, −i（定理 ST29.1）。完整记录说出是哪个分支，按记录逐格补偿相位，误差为 0。',
    en: 'Each branch brings back a known logical phase z_j = 1, i, −1, −i along its path (Theorem ST29.1). The full record says which branch happened; undoing the phase cell by cell gives error 0.' },
  onebit: { mode: 'mix', w: [0.5, 0.5, 0, 0], twist: 'pair', rec: 'none',
    zh: '两个分支各占一半，相位相反（z = ±1）。不留记录时最优误差是 1/2；改选“完整综合征”，同样的演化就能完全恢复。每个分支本身都是可逆的，损失全在于恢复前删掉了那一个记录比特（例 ST30.5）。',
    en: 'Two branches at one half each with opposite phases (z = ±1). With no record the best error is 1/2; choose “Full syndrome” and the same evolution is recovered completely. Each branch is reversible on its own; the loss comes entirely from deleting that one record bit before the recovery (Example ST30.5).' },
  coarse: { mode: 'mix', w: Q4, twist: 'spread', rec: 'bitA',
    zh: '四个扭转相位 0°、90°、180°、270°，记录只留第一位综合征。同一记录值里的分支只能共用一个补偿，最优误差 (1 − s_T)/2 = 0.146；完整记录时为 0，不留记录时为 0.5：记录越粗，误差只会越大（推论 ST30.4）。',
    en: 'Four twist phases 0°, 90°, 180° and 270°, and the record keeps only the first syndrome bit. Branches with the same record value must share one compensation, so the best error is (1 − s_T)/2 = 0.146; with the full record it is 0, with no record 0.5. A coarser record can only raise the error (Corollary ST30.4).' },
  bins: { mode: 'mix', w: Q4, phi: [10, 100, 200, 290], rec: 'bins', K: 3,
    zh: '记录不存分支号，只存相位落在 K 个等宽相位箱中的哪一个。这里 K = 3，相位 10°、100°、200°、290°：最优误差 0.073，不超过分箱上界 (1 − cos(π/K))/2 = 0.25（定理 ST31.1）。',
    en: 'The record does not keep the branch, only which of K equal-width phase bins its phase falls into. Here K = 3 and the phases are 10°, 100°, 200° and 290°: the best error is 0.073, within the binning bound (1 − cos(π/K))/2 = 0.25 (Theorem ST31.1).' }
};

/* =====================================================================
   3. Complex 2×2 algebra
   ===================================================================== */
const C = (re, im = 0) => ({ re, im });
const cadd = (a, b) => C(a.re + b.re, a.im + b.im);
const cmul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cconj = (a) => C(a.re, -a.im);
const cabs = (a) => Math.hypot(a.re, a.im);
const cexp = (t) => C(Math.cos(t), Math.sin(t));
const cscale = (a, s) => C(a.re * s, a.im * s);
const ZERO = C(0);
const mmul = (A, B) => [cadd(cmul(A[0], B[0]), cmul(A[1], B[2])), cadd(cmul(A[0], B[1]), cmul(A[1], B[3])), cadd(cmul(A[2], B[0]), cmul(A[3], B[2])), cadd(cmul(A[2], B[1]), cmul(A[3], B[3]))];
const mdag = (A) => [cconj(A[0]), cconj(A[2]), cconj(A[1]), cconj(A[3])];
const madd = (A, B) => A.map((x, i) => cadd(x, B[i]));
const msc = (A, s) => A.map((x) => cscale(x, s));
const I2 = [C(1), ZERO, ZERO, C(1)], X2 = [ZERO, C(1), C(1), ZERO], Z0 = [ZERO, ZERO, ZERO, ZERO];
const diagZ = (z) => [z, ZERO, ZERO, C(1)];
const sandwich = (K, rho) => mmul(mmul(K, rho), mdag(K));
const mtr = (A) => cadd(A[0], A[3]);
const bloch = (r) => [2 * r[1].re, -2 * r[1].im, r[0].re - r[3].re];
const mdist = (A, B) => Math.sqrt(A.reduce((s, x, i) => s + (x.re - B[i].re) ** 2 + (x.im - B[i].im) ** 2, 0));
const parity = (m) => [((m >> 2) ^ (m >> 1)) & 1, ((m >> 1) ^ m) & 1];
const layerOfMask = (m) => { const [a, b] = parity(m); return a ? (b ? 2 : 1) : (b ? 3 : 0); };

/* =====================================================================
   4. The model: branches, physical state, record, recovery
   ===================================================================== */
let MODEL = null, dirty = true;
function normWeights(raw) { const s = raw.reduce((a, b) => a + Math.max(0, b), 0); return s > 1e-12 ? raw.map((v) => Math.max(0, v) / s) : [1, 0, 0, 0]; }
function inputState() { const th = S.theta * DEG, ph = S.phase * DEG; return [C(Math.cos(th / 2)), cscale(cexp(ph), Math.sin(th / 2))]; }
const proj = (psi) => [cmul(psi[0], cconj(psi[0])), cmul(psi[0], cconj(psi[1])), cmul(psi[1], cconj(psi[0])), cmul(psi[1], cconj(psi[1]))];
/* the logical action after folding with the old decoder: S_l† X^mask Enc V_l = V_l, or X·V_l when the flips cross the code */
function foldAction(mask, z) { const l = layerOfMask(mask), V = diagZ(z); return (mask ^ MASK[l]) === 0 ? V : mmul(X2, V); }
function branchesOf(mode, w, p, chi, z) {
  if (mode === 'iid') {
    const out = [];
    for (let m = 0; m < 8; m++) { const k = (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1), l = layerOfMask(m); out.push({ mask: m, layer: l, w: p ** k * (1 - p) ** (3 - k), amp: null, z: z[l], M: foldAction(m, z[l]) }); }
    return out;
  }
  return [0, 1, 2, 3].map((j) => ({ mask: MASK[j], layer: j, w: w[j], amp: mode === 'coh' ? cscale(cexp(j * chi * DEG), Math.sqrt(w[j])) : null, z: z[j], M: diagZ(z[j]) }));
}
/* the Kraus operators of the noise as 8×2 maps (two columns of 8 complex entries): X^mask · Enc · V */
function encodedColumns(mask, z, scale) {
  const c0 = new Array(8).fill(ZERO), c1 = new Array(8).fill(ZERO);
  c0[0 ^ mask] = cscale(z, scale); c1[7 ^ mask] = C(scale);
  return [c0, c1];
}
function noiseKraus(branches, mode) {
  if (mode === 'coh') {                                 // one Kraus operator Σ_j a_j S_j V_j
    const K = [new Array(8).fill(ZERO), new Array(8).fill(ZERO)];
    for (const b of branches) { const [c0, c1] = encodedColumns(b.mask, b.z, 1); for (let x = 0; x < 8; x++) { K[0][x] = cadd(K[0][x], cmul(b.amp, c0[x])); K[1][x] = cadd(K[1][x], cmul(b.amp, c1[x])); } }
    return [K];
  }
  return branches.filter((b) => b.w > 0).map((b) => encodedColumns(b.mask, b.z, Math.sqrt(b.w)));
}
/* ρ_phys = Σ K ρ K† as an 8×8 matrix (rows of complex) */
function physicalState(kraus, rho) {
  const R = Array.from({ length: 8 }, () => new Array(8).fill(ZERO));
  for (const K of kraus) {
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
      let s = ZERO;
      for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) s = cadd(s, cmul(cmul(K[i][x], rho[2 * i + k]), cconj(K[k][y])));
      R[x][y] = cadd(R[x][y], s);
    }
  }
  return R;
}
/* the fold-back decoder Σ_j S_j† X S_j with the old (untwisted) copies */
function foldBack(R) {
  const out = [ZERO, ZERO, ZERO, ZERO];
  for (let j = 0; j < 4; j++) { const e = [0 ^ MASK[j], 7 ^ MASK[j]]; for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) out[2 * i + k] = cadd(out[2 * i + k], R[e[i]][e[k]]); }
  return out;
}
/* Knill–Laflamme: E_a†E_c ∝ I for every pair of error operators with nonzero weight */
function klHolds(kraus) {
  for (const A of kraus) for (const B of kraus) {
    const g = [0, 1].map((i) => [0, 1].map((k) => { let s = ZERO; for (let x = 0; x < 8; x++) s = cadd(s, cmul(cconj(A[i][x]), B[k][x])); return s; }));
    if (cabs(g[0][1]) > 1e-9 || cabs(g[1][0]) > 1e-9 || cabs(cadd(g[0][0], cscale(g[1][1], -1))) > 1e-9) return false;
  }
  return true;
}
/* the record: T(r|layer) and labels */
function recordModel(rec, K, eps, z) {
  if (rec === 'full') return { labels: SYN.slice(), T: [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((l) => (l === r ? 1 : 0))) };
  if (rec === 'bitA' || rec === 'bitB') { const B = rec === 'bitA' ? BIT_A : BIT_B; return { labels: ['0', '1'], T: [0, 1].map((r) => [0, 1, 2, 3].map((l) => (B[l] === r ? 1 : 0))) }; }
  if (rec === 'none') return { labels: ['—'], T: [[1, 1, 1, 1]] };
  if (rec === 'bins') {
    const bin = (l) => { let a = Math.atan2(z[l].im, z[l].re); if (a < 0) a += 2 * Math.PI; return Math.min(K - 1, Math.floor(a / (2 * Math.PI / K) + 1e-9)); };
    return { labels: Array.from({ length: K }, (_, r) => `${r}`), T: Array.from({ length: K }, (_, r) => [0, 1, 2, 3].map((l) => (bin(l) === r ? 1 : 0))) };
  }
  const bits = [[0, 0], [1, 0], [1, 1], [0, 1]];       // noisy: each syndrome bit misread with probability ε
  return { labels: SYN.slice(), T: [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((l) => bits[r].reduce((s, v, k) => s * (v === bits[l][k] ? 1 - eps : eps), 1))) };
}
function cellsOf(branches, recM) {
  return recM.T.map((Tr, r) => {
    let q = 0, c = ZERO;
    for (const b of branches) { const t = b.w * Tr[b.layer]; q += t; c = cadd(c, cscale(b.z, t)); }
    return { r, label: recM.labels[r], q, c, abs: cabs(c) };
  });
}
const eStarOf = (cells) => (1 - cells.reduce((s, x) => s + x.abs, 0)) / 2;
function build() {
  const w = normWeights(S.w), z = S.phi.map((d) => cexp(d * DEG));
  const branches = branchesOf(S.mode, w, S.p, S.chi, z), psi = inputState(), rho = proj(psi);
  const kraus = noiseKraus(branches, S.mode), R = physicalState(kraus, rho);
  const layerW = [0, 1, 2, 3].map((l) => branches.reduce((s, b) => s + (b.layer === l ? b.w : 0), 0));
  const leak = 1 - layerW[0];
  const KL = klHolds(kraus);
  const phaseType = branches.every((b) => b.w <= 1e-12 || (b.mask ^ MASK[b.layer]) === 0);
  // fold back: the 8-dimensional state against the branch decomposition Σ_b w_b M_b ρ M_b†
  const fold8 = foldBack(R);
  let fold = Z0; for (const b of branches) if (b.w > 0) fold = madd(fold, msc(sandwich(b.M, rho), b.w));
  const ledgerRes = mdist(fold8, fold), plainRes = mdist(fold8, rho);
  // the record and the recovery W_r = diag(c̄_r/|c_r|, 1)
  const recM = recordModel(S.rec, S.K, S.eps, z), cells = cellsOf(branches, recM);
  const Wr = cells.map((x) => (x.abs > 1e-12 ? diagZ(cscale(cconj(x.c), 1 / x.abs)) : I2));
  let out = Z0, Fe = 0;
  cells.forEach((x, r) => {
    for (const b of branches) {
      const t = b.w * recM.T[r][b.layer]; if (t <= 0) continue;
      const Kop = mmul(Wr[r], b.M); out = madd(out, msc(sandwich(Kop, rho), t));
      const tr = mtr(Kop); Fe += t * (tr.re * tr.re + tr.im * tr.im) / 4;
    }
  });
  const sT = cells.reduce((s, x) => s + x.abs, 0), eStar = phaseType ? (1 - sT) / 2 : null;
  const Fpsi = [cmul(cconj(psi[0]), cadd(cmul(out[0], psi[0]), cmul(out[1], psi[1]))), cmul(cconj(psi[1]), cadd(cmul(out[2], psi[0]), cmul(out[3], psi[1])))].reduce((s, v) => s + v.re, 0);
  const recOptions = {};
  for (const o of RECS) recOptions[o] = phaseType ? eStarOf(cellsOf(branches, recordModel(o, S.K, S.eps, z))) : null;
  const pFail = branches.reduce((s, b) => s + ((b.mask ^ MASK[b.layer]) ? b.w : 0), 0);
  // this run: the record drawn with probability q_r; for a mixture also the branch that happened, given r
  const rng = mulberry32(0x5E11 + S.run * 7919); rng();
  const u1 = rng(), u2 = rng();
  let rRun = cells.length - 1, acc = 0; for (const x of cells) { acc += x.q; if (u1 < acc) { rRun = x.r; break; } }
  let bRun = null;
  if (S.mode !== 'coh') {
    const cand = branches.filter((b) => b.w * recM.T[rRun][b.layer] > 0), tot = cand.reduce((s, b) => s + b.w * recM.T[rRun][b.layer], 0);
    let a2 = 0; for (const b of cand) { a2 += b.w * recM.T[rRun][b.layer] / tot; if (u2 < a2) { bRun = b; break; } }
    if (!bRun && cand.length) bRun = cand[cand.length - 1];
  }
  let runFid;
  if (bRun) { const v = mmul(Wr[rRun], bRun.M), a = cadd(cmul(v[0], psi[0]), cmul(v[1], psi[1])), b = cadd(cmul(v[2], psi[0]), cmul(v[3], psi[1])); const ov = cadd(cmul(cconj(psi[0]), a), cmul(cconj(psi[1]), b)); runFid = ov.re * ov.re + ov.im * ov.im; }
  else {
    let cond = Z0; for (const b of branches) { const t = b.w * recM.T[rRun][b.layer]; if (t > 0) cond = madd(cond, msc(sandwich(mmul(Wr[rRun], b.M), rho), t)); }
    const q = cells[rRun].q || 1; runFid = [cmul(cconj(psi[0]), cadd(cmul(cond[0], psi[0]), cmul(cond[1], psi[1]))), cmul(cconj(psi[1]), cadd(cmul(cond[2], psi[0]), cmul(cond[3], psi[1])))].reduce((s, v) => s + v.re, 0) / q;
  }
  const compDeg = cells[rRun].abs > 1e-12 ? -Math.atan2(cells[rRun].c.im, cells[rRun].c.re) / DEG : 0;
  MODEL = { w, z, branches, psi, rho, R, layerW, leak, KL, phaseType, fold, fold8, ledgerRes, plainRes, recM, cells, Wr, out, sT, eStar, F: Fpsi, Fbar: (2 * Fe + 1) / 3, Fe,
    recOptions, pFail, run: { r: rRun, b: bRun, fid: runFid, comp: compDeg }, hash: fnv([S.run & 0xff, rRun, bRun ? bRun.mask : 9, S.mode.length, S.rec.length]) };
}
function fnv(bytes) { let h = 0x811c9dc5; for (const v of bytes) { h ^= v & 0xff; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }

/* =====================================================================
   5. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cvPh = $('phasor'), cvCmp = $('compare');
const f3 = (v) => (v === null || !isFinite(v) ? '—' : v.toFixed(3));
const f4 = (v) => (v === null || !isFinite(v) ? '—' : v.toFixed(4));
const pct = (v) => `${Math.round(v * 100)}%`;
const degText = (d) => `${Math.round(((d % 360) + 360) % 360)}°`;
const layerName = (l) => [T('不翻', 'no flip'), T('翻 X₁', 'flip X₁'), T('翻 X₂', 'flip X₂'), T('翻 X₃', 'flip X₃')][l];
const maskName = (m) => (m === 0 ? T('不翻', 'no flip') : (T('翻 ', 'flip ') + [4, 2, 1].filter((b) => m & b).map((b) => ({ 4: 'X₁', 2: 'X₂', 1: 'X₃' })[b]).join('')));
const smooth = TRV.smooth, clamp01 = (x) => Math.max(0, Math.min(1, x));
const stageK = (k) => smooth(clamp01(S.stage - k));
const STAGE_NAMES = () => [T('编码', 'ENCODE'), T('噪声', 'NOISE'), T('记录', 'RECORD'), T('折回', 'FOLD BACK'), T('补偿', 'COMPENSATE')];

/* =====================================================================
   6. 3D scene: four layers, Bloch spheres, beams
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts, plates = [];
const LINES_MAX = 6000, PTS_MAX = 72;
const LAYER_Y = [2.55, 1.35, 0.15, -1.05], PLATE_W = 2.5, PLATE_D = 1.7, R_LAYER = 0.48, R_IO = 0.62;
const IN_POS = [-3.2, 1.55, 0], OUT_POS = [3.2, 0.55, 0], TARGET_Y = 0.7;
const CAMS = { iso: [0.55, 1.22, 10.2], front: [0.0001, 1.5, 10.2], top: [0.0001, 0.16, 9.6] };
const cam = { theta: 0.55, phi: 1.22, r: 10.2, tTheta: 0.55, tPhi: 1.22, tR: 10.2 };
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
    d.textContent = T('这个浏览器没有提供 WebGL，三维视图无法显示。下方的相位图、对比图和右侧读数仍然可用。', 'This browser does not provide WebGL, so the 3D view cannot be shown. The phase plot, the comparison chart and the readouts still work.');
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
  const plane = new THREE.PlaneGeometry(PLATE_W, PLATE_D); plane.rotateX(-Math.PI / 2);
  for (let l = 0; l < 4; l++) {
    const m = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: new THREE.Color(...LAYER_RGB[l]), transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.position.set(0, LAYER_Y[l], 0); scene3.add(m); plates.push(m);
  }
}
const toWorld = (c, v, R) => [c[0] + R * v[0], c[1] + R * v[2], c[2] - R * v[1]];
const rotX = (v, a) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
const rotZ = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
const lerp3 = (a, b, t) => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t);
/* where each branch's logical copy points during the noise stage: the twist V (a rotation by −φ about z), then X if the flips crossed the code */
function branchVector(b, s) {
  const vin = bloch(MODEL.rho), ang = Math.atan2(b.z.im, b.z.re);
  const v = rotZ(vin, -ang * s);
  return (b.mask ^ MASK[b.layer]) ? rotX(v, Math.PI * s) : v;
}
function updateGL(time) {
  const M = MODEL, s1 = stageK(0), s2 = stageK(1), s3 = stageK(2), s4 = stageK(3), s5 = stageK(4);
  const L = lines.geometry.attributes, Pp = L.position.array, Cc = L.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; const c = col.map((x) => x * k); Pp.set(a, 3 * v); Cc.set(c, 3 * v); v++; Pp.set(b, 3 * v); Cc.set(c, 3 * v); v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array.set(p, 3 * np); PT.aColor.array.set(col, 3 * np); PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  const circle = (c, R, plane, col, k) => {
    const n = 40; let prev = null;
    for (let i = 0; i <= n; i++) { const a = 2 * Math.PI * i / n, p = plane === 'h' ? [c[0] + R * Math.cos(a), c[1], c[2] + R * Math.sin(a)] : [c[0] + R * Math.cos(a), c[1] + R * Math.sin(a), c[2]]; if (prev) seg(prev, p, col, k); prev = p; }
  };
  const sphere = (c, R, col, k) => { circle(c, R, 'h', col, k * 0.8); circle(c, R, 'v', col, k * 0.5); seg([c[0], c[1] - R, c[2]], [c[0], c[1] + R, c[2]], col, k * 0.35); };
  const arrow = (c, vec, R, col, k, tip) => { const e = toWorld(c, vec, R); seg(c, e, col, k); if (tip) dot(e, col, Math.min(1, k * 1.2), 1.7); };
  const beamDots = (a, b, col, k, n, speed) => { for (let i = 0; i < n; i++) { const t = (time * speed + i / n) % 1; dot(lerp3(a, b, t), col, k, 1.1); } };
  // displayed weight of each layer: the code layer fills while encoding, then the noise spreads it out; folding drains the layers
  const shown = [0, 1, 2, 3].map((l) => ((1 - s2) * (l === 0 ? s1 : 0) + s2 * M.layerW[l]) * (1 - 0.7 * s4));
  for (let l = 0; l < 4; l++) {
    const y = LAYER_Y[l], b = shown[l], col = LAYER_RGB[l], c = [0, y, 0];
    plates[l].material.opacity = 0.03 + 0.34 * Math.sqrt(b);
    const hw = PLATE_W / 2, hd = PLATE_D / 2;
    for (const [ax, az, bx, bz] of [[-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [hw, hd, -hw, hd], [-hw, hd, -hw, -hd]]) seg([ax, y, az], [bx, y, bz], col, 0.3 + 0.6 * Math.sqrt(b));
    sphere(c, R_LAYER, col, 0.18 + 0.5 * Math.sqrt(b));
    dot(c, col, 0.25 + 0.7 * Math.sqrt(b), 1.2 + 3.2 * Math.sqrt(b));
    // arrows of the branches in this layer (before the noise only the code layer holds the encoded state)
    if (l === 0 && s2 < 1) arrow(c, bloch(M.rho), R_LAYER, COL.sigma, 0.9 * s1 * (1 - s2), true);
    if (s2 > 0) for (const br of M.branches) {
      if (br.layer !== l || br.w <= 1e-9 || M.layerW[l] <= 0) continue;
      const share = br.w / M.layerW[l], wrong = (br.mask ^ MASK[l]) !== 0;
      arrow(c, branchVector(br, s2), R_LAYER, wrong ? [1.0, 0.31, 0.39] : col, (0.25 + 0.75 * share) * s2 * (1 - 0.6 * s4), true);
    }
  }
  // input sphere and the encoding beam
  sphere(IN_POS, R_IO, COL.sigma, 0.45); arrow(IN_POS, bloch(M.rho), R_IO, COL.sigma, 0.95, true); dot(IN_POS, COL.sigma, 0.5, 1.5);
  if (s1 > 0 && s2 < 1) { const a = [IN_POS[0] + R_IO * 0.7, IN_POS[1] + R_IO * 0.7, 0], b = [-PLATE_W / 2, LAYER_Y[0], 0], k = Math.sin(Math.PI * clamp01(S.stage)) * 0.9 + 0.15 * (1 - s2); seg(a, b, COL.cyan, k); beamDots(a, b, COL.cyan, k, 3, 0.7); }
  // noise: amplitude flows from the code layer into the error copies along the right edge
  if (s2 > 0 && s4 < 1) for (let l = 1; l < 4; l++) {
    const k = Math.sqrt(M.layerW[l]) * s2 * (1 - s4) * (S.stage < 2 ? 1 : 0.45); if (k < 0.01) continue;
    const x = PLATE_W / 2 + 0.12 + 0.1 * l, a = [x, LAYER_Y[0], 0], b = [x, LAYER_Y[l], 0];
    seg(a, b, LAYER_RGB[l], k); seg(b, [PLATE_W / 2, LAYER_Y[l], 0], LAYER_RGB[l], k);
    if (S.stage < 2.2) beamDots(a, b, LAYER_RGB[l], k, 3, 0.9);
  }
  // the record: one bracket per record cell on the left, joining the layers that share a record value
  if (s3 > 0) M.recM.T.forEach((Tr, r) => {
    const members = [0, 1, 2, 3].filter((l) => Tr[l] > 0 && M.layerW[l] > 1e-9); if (!members.length) return;
    const x = -PLATE_W / 2 - 0.16 - 0.15 * (r % 8), col = CELL_RGB[r % 8], k = s3 * (1 - 0.5 * s5) * (S.rec === 'noisy' ? 0.55 : 1);
    const ys = members.map((l) => LAYER_Y[l]), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (S.rec === 'noisy') { for (const l of [0, 1, 2, 3]) if (M.layerW[l] > 1e-9) seg([x, LAYER_Y[l], 0], [-PLATE_W / 2, LAYER_Y[l], 0], col, k * Tr[l]); }
    else { seg([x, y0 - 0.08, 0], [x, y1 + 0.08, 0], col, k); for (const y of ys) seg([x, y, 0], [-PLATE_W / 2, y, 0], col, k); }
  });
  // fold back: every layer streams its copy into the output sphere
  if (s4 > 0) for (let l = 0; l < 4; l++) {
    const k = Math.sqrt(M.layerW[l]) * s4 * (1 - 0.6 * s5); if (k < 0.01) continue;
    const a = [PLATE_W / 2, LAYER_Y[l], 0], b = [OUT_POS[0] - R_IO, OUT_POS[1], 0];
    seg(a, b, LAYER_RGB[l], 0.6 * k); beamDots(a, b, LAYER_RGB[l], k, 2, 0.6);
  }
  // output sphere: the folded mixture, then the compensated state; the input direction as a dim ghost
  const so = s4;
  sphere(OUT_POS, R_IO, COL.sigma, 0.2 + 0.35 * so);
  if (so > 0) {
    arrow(OUT_POS, bloch(M.rho), R_IO, COL.gray, 0.45 * so, false);
    const vf = bloch(M.fold), vo = bloch(M.out), vv = lerp3(vf, vo, s5);
    const good = M.Fbar > 1 - 1e-9;
    arrow(OUT_POS, vv, R_IO, s5 > 0.5 ? (good ? GREEN : COL.amber) : COL.amber, 0.95 * so, true);
    dot(OUT_POS, s5 > 0.5 && good ? GREEN : COL.amber, 0.4 + 0.5 * so, 1.6 + 2 * so);
  }
  lines.geometry.setDrawRange(0, v); L.position.needsUpdate = true; L.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 58 * renderer.getPixelRatio();
}

/* =====================================================================
   7. Camera
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.55 : 1);
  camera.position.set(r * sp * Math.sin(cam.theta), TARGET_Y + r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0, TARGET_Y, 0);
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
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(20, Math.max(4, cam.tR * drag.pinch / d)); drag.pinch = d; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY;
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => { if (!drag.pts.has(ev.pointerId)) return; drag.pts.delete(ev.pointerId); if (drag.pts.size === 0) drag.pinch = 0; };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(20, Math.max(4, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   8. Tags
   ===================================================================== */
function mkTag(cls) { const el = document.createElement('div'); el.className = 'tag ' + cls; tagsBox.appendChild(el); return el; }
const tagLayers = [mkTag('cy layer raw'), mkTag('hot layer raw'), mkTag('mg layer raw'), mkTag('gn layer raw')];
const tagIn = mkTag('raw'), tagOut = mkTag('hot raw'), tagCells = Array.from({ length: 8 }, () => mkTag('tick'));
function labelStaticTags() {
  const names = [T('编码空间 · 00', 'CODE SPACE · 00'), T('X₁ 副本 · 10', 'X₁ COPY · 10'), T('X₂ 副本 · 11', 'X₂ COPY · 11'), T('X₃ 副本 · 01', 'X₃ COPY · 01')];
  tagLayers.forEach((t, l) => { t.textContent = names[l]; });
  tagIn.textContent = T('输入 |ψ⟩', 'INPUT |ψ⟩'); tagOut.textContent = T('输出', 'OUTPUT');
}
labelStaticTags();
function placeTag(el, p, show = true) {
  if (!glOK || !show) { el.style.display = 'none'; return; }
  const q = proj3(p); if (q.z > 1 || q.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.style.left = q.x + 'px'; el.style.top = q.y + 'px';
}
function updateTags() {
  for (let l = 0; l < 4; l++) placeTag(tagLayers[l], [0, LAYER_Y[l] + 0.12, PLATE_D / 2 + 0.28]);
  placeTag(tagIn, [IN_POS[0], IN_POS[1] + R_IO + 0.3, 0]);
  placeTag(tagOut, [OUT_POS[0], OUT_POS[1] + R_IO + 0.3, 0], S.stage > 3.05);
  const s3 = stageK(2);
  tagCells.forEach((el, r) => {
    const Tr = MODEL.recM.T[r];
    if (!Tr || S.rec === 'noisy' || s3 < 0.4) { placeTag(el, [0, 0, 0], false); return; }
    const members = [0, 1, 2, 3].filter((l) => Tr[l] > 0 && MODEL.layerW[l] > 1e-9);
    if (!members.length) { placeTag(el, [0, 0, 0], false); return; }
    el.textContent = `r=${MODEL.recM.labels[r]}`; el.style.color = CELL_CSS[r % 8];
    placeTag(el, [-PLATE_W / 2 - 0.16 - 0.15 * (r % 8), Math.max(...members.map((l) => LAYER_Y[l])) + 0.3, 0]);
  });
}

/* =====================================================================
   9. 2D panels
   ===================================================================== */
function frame2d(cv) {
  const dpr = fitCanvas(cv), ctx = cv.getContext('2d'), W = cv.width, Hh = cv.height;
  ctx.clearRect(0, 0, W, Hh);
  const pl = 36 * dpr, pr = 12 * dpr, pt = 10 * dpr, pb = 20 * dpr;
  return { dpr, ctx, W, Hh, pl, pt, iw: W - pl - pr, ih: Hh - pt - pb };
}
function phasorGeom(cv) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.width, Hh = cv.height;
  const R = Math.max(8, Math.min(Hh * 0.38, W * 0.2)), cx = 14 * dpr + R + 8 * dpr, cy = Hh / 2;
  return { dpr, R, cx, cy, W, Hh };
}
function drawPhasor() {
  const dpr = fitCanvas(cvPh), ctx = cvPh.getContext('2d'); ctx.clearRect(0, 0, cvPh.width, cvPh.height);
  const G = phasorGeom(cvPh), { R, cx, cy } = G, M = MODEL;
  if (R < 12) return;
  ctx.strokeStyle = FAINT; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - R - 4 * dpr, cy); ctx.lineTo(cx + R + 4 * dpr, cy); ctx.moveTo(cx, cy - R - 4 * dpr); ctx.lineTo(cx, cy + R + 4 * dpr); ctx.stroke();
  if (S.rec === 'bins') { ctx.strokeStyle = DIM; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); for (let k = 0; k < S.K; k++) { const a = 2 * Math.PI * k / S.K; ctx.moveTo(cx, cy); ctx.lineTo(cx + R * 1.08 * Math.cos(a), cy - R * 1.08 * Math.sin(a)); } ctx.stroke(); ctx.setLineDash([]); }
  // the arrows c_r of the record cells
  M.cells.forEach((x, k) => {
    if (x.abs < 1e-9) return;
    const ex = cx + R * x.c.re, ey = cy - R * x.c.im, col = CELL_CSS[k % 8];
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.2 * dpr; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
    const a = Math.atan2(ey - cy, ex - cx), h = 6 * dpr; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - h * Math.cos(a - 0.4), ey - h * Math.sin(a - 0.4)); ctx.lineTo(ex - h * Math.cos(a + 0.4), ey - h * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
  });
  // the branch phases z_j on the circle (dot area ∝ weight; drag to change the twist)
  for (let l = 3; l >= 0; l--) {
    const z = M.z[l], x = cx + R * z.re, y = cy - R * z.im, wl = M.layerW[l], rad = (3 + 9 * Math.sqrt(wl)) * dpr;
    ctx.fillStyle = LAYER_CSS[l]; ctx.strokeStyle = LAYER_CSS[l]; ctx.lineWidth = 1.4 * dpr;
    ctx.globalAlpha = wl > 1e-9 ? 0.85 : 0.5; ctx.beginPath(); ctx.arc(x, y, rad, 0, 2 * Math.PI); if (wl > 1e-9) ctx.fill(); else ctx.stroke(); ctx.globalAlpha = 1;
  }
  // right side: |c_r| per cell and the total s_T against 1
  const x0 = cx + R + 22 * dpr, x1 = G.W - 10 * dpr, bw = x1 - x0; if (bw < 40 * dpr) return;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const rows = M.cells.filter((x) => x.q > 1e-12), lh = Math.min(15 * dpr, (G.Hh - 46 * dpr) / Math.max(1, rows.length));
  rows.forEach((x, i) => {
    const y = 12 * dpr + i * lh; ctx.fillStyle = CELL_CSS[x.r % 8];
    ctx.fillText(`r=${x.label}`, x0, y); ctx.fillStyle = INK; ctx.fillText(bw > 190 * dpr ? T(`占 ${f3(x.q)} · |c| = ${f3(x.abs)}`, `weight ${f3(x.q)} · |c| = ${f3(x.abs)}`) : `|c| = ${f3(x.abs)}`, x0 + 40 * dpr, y);
  });
  const yb = G.Hh - 24 * dpr; let xs = x0;
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x0, yb, bw, 10 * dpr);
  M.cells.forEach((x, k) => { const wv = x.abs * bw; ctx.fillStyle = CELL_CSS[k % 8]; ctx.fillRect(xs, yb, Math.max(0, wv - 1), 10 * dpr); xs += wv; });
  ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(x0, yb, bw, 10 * dpr);
  ctx.fillStyle = INK; ctx.textBaseline = 'bottom';
  ctx.fillText(bw > 150 * dpr ? T(`s_T = ${f3(M.sT)}（满格 = 1）`, `s_T = ${f3(M.sT)} (full bar = 1)`) : `s_T = ${f3(M.sT)}`, x0, yb - 3 * dpr);
  $('phMeta').textContent = M.phaseType ? T(`e* = (1 − s_T)/2 = ${f3(M.eStar)}`, `e* = (1 − s_T)/2 = ${f3(M.eStar)}`) : T('含两比特翻转：e* 公式不适用', 'two-flip branches: the e* formula does not apply');
}
function drawCompare() {
  const F = frame2d(cvCmp); if (F.iw < 40 || F.ih < 30) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL;
  const grid = (ticks, fmt, top) => {
    ctx.strokeStyle = FAINT; ctx.lineWidth = 1; ctx.globalAlpha = 0.6; ctx.beginPath();
    for (const y of ticks) { const yy = pt + ih - y / top * ih; ctx.moveTo(pl, yy); ctx.lineTo(pl + iw, yy); } ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const y of ticks) ctx.fillText(fmt(y), pl - 5 * dpr, pt + ih - y / top * ih);
  };
  if (S.mode === 'iid') {
    $('cmpTitle').innerHTML = T('<span>逻辑错误率与物理错误率</span>', '<span>LOGICAL VS PHYSICAL ERROR RATE</span>');
    const X = (p) => pl + p / 0.5 * iw, Y = (e) => pt + ih - e / 0.5 * ih;
    grid([0, 0.25, 0.5], (y) => y.toFixed(2), 0.5);
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const p of [0, 0.25, 0.5]) ctx.fillText(p.toFixed(2), X(p), pt + ih + 3 * dpr);
    ctx.strokeStyle = DIM; ctx.lineWidth = 1.4 * dpr; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(0.5), Y(0.5)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = CY; ctx.lineWidth = 2 * dpr; ctx.beginPath(); for (let i = 0; i <= 100; i++) { const p = 0.5 * i / 100, e = 3 * p * p - 2 * p ** 3; if (i) ctx.lineTo(X(p), Y(e)); else ctx.moveTo(X(p), Y(e)); } ctx.stroke();
    ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(S.p), Y(M.pFail), 4.5 * dpr, 0, 2 * Math.PI); ctx.fill();
    ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = CY; ctx.fillText(T('编码后 3p² − 2p³', 'encoded 3p² − 2p³'), pl + 8 * dpr, pt + 4 * dpr); ctx.fillStyle = DIM; ctx.fillText(T('不编码 p', 'unencoded p'), pl + 8 * dpr, pt + 17 * dpr);
    $('cmpMeta').textContent = T(`横轴：p · 此刻 ${f3(M.pFail)}`, `x: p · now ${f3(M.pFail)}`);
    return;
  }
  $('cmpTitle').innerHTML = T('<span>不同记录下的最优误差 e*</span>', '<span>BEST ERROR e* UNDER EACH RECORD</span>');
  const TOP = 0.58;
  grid([0, 0.25, 0.5], (y) => y.toFixed(2), TOP);
  const names = { full: T('完整', 'full'), bitA: T('第一位', 'bit 1'), bitB: T('第二位', 'bit 2'), none: T('不留', 'none'), bins: T('分箱', 'bins'), noisy: T('带噪', 'noisy') };
  const bw = iw / RECS.length;
  RECS.forEach((o, i) => {
    const e = Math.max(0, M.recOptions[o] || 0), h = e / TOP * ih, x = pl + i * bw + bw * 0.18, wv = bw * 0.64, on = o === S.rec;
    ctx.fillStyle = on ? AM : CY; ctx.globalAlpha = on ? 0.95 : 0.45; ctx.fillRect(x, pt + ih - h, wv, Math.max(1, h)); ctx.globalAlpha = 1;
    ctx.fillStyle = on ? AM : INK; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(e.toFixed(3), x + wv / 2, pt + ih - h - 2 * dpr);
    ctx.fillStyle = on ? AM : DIM; ctx.font = `${9 * dpr}px ${TRV.fonts.body}`; ctx.textBaseline = 'top'; ctx.fillText(names[o], x + wv / 2, pt + ih + 3 * dpr);
    if (o === 'bins') { const bd = (1 - Math.cos(Math.PI / S.K)) / 2, yb = pt + ih - Math.min(TOP, bd) / TOP * ih; ctx.strokeStyle = MG; ctx.setLineDash([3 * dpr, 2 * dpr]); ctx.lineWidth = 1.2 * dpr; ctx.beginPath(); ctx.moveTo(x - 3 * dpr, yb); ctx.lineTo(x + wv + 3 * dpr, yb); ctx.stroke(); ctx.setLineDash([]); }
  });
  $('cmpMeta').textContent = T(`K = ${S.K} · ε = ${S.eps.toFixed(2)} · 品红虚线 = 分箱上界`, `K = ${S.K} · ε = ${S.eps.toFixed(2)} · magenta dash = bin bound`);
}

/* =====================================================================
   10. Readouts and controls
   ===================================================================== */
let syncedStage = NaN, toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function syncOutputs() {
  if (dirty) { build(); dirty = false; toasted = false; }
  syncedStage = S.stage;
  const M = MODEL, k = Math.min(4, Math.floor(S.stage + 1e-9)), names = STAGE_NAMES(), done = S.stage >= STAGE_MAX - 1e-9;
  // controls
  [0, 1, 2, 3].forEach((j) => { $('oW' + j).textContent = pct(M.w[j]); });
  $('oChi').textContent = degText(S.chi); $('oP').textContent = S.p.toFixed(3); $('oK').textContent = String(S.K); $('oEps').textContent = S.eps.toFixed(3);
  $('oTheta').textContent = `${S.theta}°`; $('oPhase').textContent = degText(S.phase);
  $('weightFields').hidden = S.mode === 'iid'; $('chiField').hidden = S.mode !== 'coh'; $('pField').hidden = S.mode !== 'iid';
  $('kField').hidden = S.rec !== 'bins'; $('epsField').hidden = S.rec !== 'noisy';
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  document.querySelectorAll('#recChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rec === S.rec)));
  document.querySelectorAll('#twistChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.twist === S.twist)));
  // readouts
  $('roF').textContent = f4(M.F); $('roFbar').textContent = f4(M.Fbar); $('roErr').textContent = f3(M.eStar); $('roS').textContent = f3(M.sT); $('roLeak').textContent = f3(M.leak);
  $('roKL').textContent = M.KL ? T('✓ 存在', '✓ yes') : T('✗ 不存在', '✗ no');
  if (S.mode === 'iid') { $('roL7').innerHTML = T('逻辑失败概率 3p² − 2p³', 'Logical failure probability 3p² − 2p³'); $('ro7').textContent = f4(M.pFail); }
  else if (S.rec === 'bins') { $('roL7').innerHTML = T('分箱上界 (1 − cos(π/K))/2', 'Binning bound (1 − cos(π/K))/2'); $('ro7').textContent = f3((1 - Math.cos(Math.PI / S.K)) / 2); }
  else { $('roL7').innerHTML = T('不留记录时的 e<sub>*</sub>', 'e<sub>*</sub> with no record'); $('ro7').textContent = f3(M.recOptions.none); }
  const twisted = M.z.some((z, l) => M.layerW[l] > 1e-9 && Math.abs(z.re - 1) + Math.abs(z.im) > 1e-9);
  $('roNote').innerHTML = !M.KL
    ? T(`两个比特同时翻转的分支和单比特翻转落在同一层，却带着逻辑翻转 X：Knill–Laflamme 条件不成立，任何恢复都做不到完美。逻辑失败概率 ${f4(M.pFail)}，${M.pFail < S.p ? '比不编码时的 p = ' + S.p.toFixed(3) + ' 小' : '不比不编码时的 p = ' + S.p.toFixed(3) + ' 小'}。`,
      `Branches with two simultaneous flips land in the same layer as a single flip but carry a logical flip X: the Knill–Laflamme condition fails and no recovery can be perfect. The logical failure probability is ${f4(M.pFail)}, ${M.pFail < S.p ? 'smaller than' : 'not smaller than'} the unencoded p = ${S.p.toFixed(3)}.`)
    : M.eStar < 1e-9
      ? (twisted ? T('记录把带不同相位的分支分开了：逐格补偿后误差为 0。', 'The record separates the branches with different phases: undoing the phase cell by cell gives error 0.')
        : T('折回就够了：每一层都是同一个逻辑态的正交副本，误差为 0（定理 ST27.2）。', 'Folding back is enough: every layer holds an orthogonal copy of the same logical state, so the error is 0 (Theorem ST27.2).'))
      : T(`同一记录格里有相位不同的分支，只能共用一个补偿：最优误差 (1 − s_T)/2 = ${f3(M.eStar)}（定理 ST30.2，论文证明与模型计算）。Knill–Laflamme 条件仍成立：知道扭转、留着综合征的解码器本可以完美恢复；损失来自恢复前删掉的记录。`,
        `Branches with different phases share a record cell and must share one compensation: the best error is (1 − s_T)/2 = ${f3(M.eStar)} (Theorem ST30.2, a paper proof and a model calculation). The Knill–Laflamme condition still holds: a decoder that knew the twists and kept the syndrome could recover perfectly; the loss comes from the record deleted before the recovery.`);
  // notes
  $('presetNote').textContent = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义参数。', 'Custom settings.');
  $('noiseNote').innerHTML = S.mode === 'iid'
    ? T(`8 个分支：不翻 ${pct((1 - S.p) ** 3)}，单比特翻转共 ${pct(3 * S.p * (1 - S.p) ** 2)}，两个或三个比特同时翻转共 ${pct(3 * S.p ** 2 - 2 * S.p ** 3)}。`, `8 branches: no flip ${pct((1 - S.p) ** 3)}, single flips ${pct(3 * S.p * (1 - S.p) ** 2)} in total, two or three simultaneous flips ${pct(3 * S.p ** 2 - 2 * S.p ** 3)} in total.`)
    : (S.mode === 'coh' ? T('一个相干的错误：Σ<sub>j</sub> a<sub>j</sub>X<sub>j</sub>，振幅模方就是上面的权重。', 'One coherent error Σ<sub>j</sub> a<sub>j</sub>X<sub>j</sub>; the squared amplitudes are the weights above.') : T('每次只发生一个分支，概率为上面的权重（自动归一化）。', 'Exactly one branch happens each time, with the weights above as probabilities (normalized automatically).'))
    + ' ' + T(`漏出 λ = ${f3(M.leak)}。`, `Leakage λ = ${f3(M.leak)}.`);
  $('twistNote').innerHTML = T(`各层带回的逻辑相位：${M.z.map((z, l) => `${layerName(l)} ${degText(Math.atan2(z.im, z.re) / DEG)}`).join('，')}。在下方相位图里拖动圆点可以改。`, `Logical phase brought back by each layer: ${M.z.map((z, l) => `${layerName(l)} ${degText(Math.atan2(z.im, z.re) / DEG)}`).join(', ')}. Drag the dots in the phase plot below to change them.`);
  $('recNote').innerHTML = {
    full: T('记录 = 两位综合征：四个分支各占一格。', 'Record = both syndrome bits: each of the four branches has its own cell.'),
    bitA: T('只留 Z<sub>1</sub>Z<sub>2</sub>：{不翻, X<sub>3</sub>} 与 {X<sub>1</sub>, X<sub>2</sub>} 各并成一格。', 'Only Z<sub>1</sub>Z<sub>2</sub> is kept: {no flip, X<sub>3</sub>} and {X<sub>1</sub>, X<sub>2</sub>} each merge into one cell.'),
    bitB: T('只留 Z<sub>2</sub>Z<sub>3</sub>：{不翻, X<sub>1</sub>} 与 {X<sub>2</sub>, X<sub>3</sub>} 各并成一格。', 'Only Z<sub>2</sub>Z<sub>3</sub> is kept: {no flip, X<sub>1</sub>} and {X<sub>2</sub>, X<sub>3</sub>} each merge into one cell.'),
    none: T('什么都不留：所有分支并成一格，只能用一个共同的补偿。', 'Nothing is kept: all branches merge into one cell and share a single compensation.'),
    bins: T(`记录 = 相位落在哪一个箱（${S.K} 个等宽箱，从 0° 起）。`, `Record = which bin the phase falls into (${S.K} equal-width bins starting at 0°).`),
    noisy: T(`记录两位综合征，但每一位以概率 ε = ${S.eps.toFixed(3)} 读错。`, `Both syndrome bits are recorded, but each is misread with probability ε = ${S.eps.toFixed(3)}.`)
  }[S.rec];
  const bi = bloch(M.rho);
  $('inputNote').innerHTML = T(`布洛赫矢量 (${bi.map((x) => x.toFixed(2)).join(', ')})。相位扭转只转动 x、y 分量，所以 θ 越接近 90° 越受影响；θ = 0° 或 180° 时任何相位都伤不到它。`, `Bloch vector (${bi.map((x) => x.toFixed(2)).join(', ')}). A phase twist only turns the x and y components, so inputs near θ = 90° suffer most; at θ = 0° or 180° no phase can hurt them.`);
  // this run
  const R = M.run, cell = M.cells[R.r];
  $('runBranch').textContent = R.b ? `${maskName(R.b.mask)} · ${degText(Math.atan2(R.b.z.im, R.b.z.re) / DEG)}` : T('相干叠加（没有单独发生的分支）', 'coherent superposition (no single branch happened)');
  $('runRec').textContent = S.rec === 'none' ? T('没有记录', 'no record') : `r = ${cell.label}`;
  $('runComp').textContent = cell.abs > 1e-12 ? T(`转回 ${degText(R.comp)}`, `turn back by ${degText(R.comp)}`) : T('无从补偿（c_r = 0）', 'nothing to undo (c_r = 0)');
  $('runFid').textContent = f4(R.fid);
  $('runAside').textContent = R.fid > 1 - 1e-9 ? T('完全找回', 'fully recovered') : T('有损', 'lossy');
  $('runNote').innerHTML = T('按 <kbd>R</kbd> 换一次运行：用固定种子抽出留下的记录，以及（混合噪声时）实际发生的分支。', 'Press <kbd>R</kbd> for another run: fixed seeds draw the record left and, for mixed noise, the branch that actually happened.');
  $('ledgerNote').innerHTML = T(`在 8 维物理态上直接算：Σ<sub>j</sub>S<sub>j</sub><sup>†</sup>𝒩(ρ)S<sub>j</sub> 与 Σ<sub>b</sub>p<sub>b</sub>M<sub>b</sub>ρM<sub>b</sub><sup>†</sup> 之差 ${M.ledgerRes.toExponential(1)}；与输入 ρ 之差 ${M.plainRes.toExponential(1)}${M.plainRes < 1e-9 ? '：折回后恰好就是 ρ' : '：差出来的部分来自路径扭转或两比特翻转，正是记录要补的'}（模型计算）。`,
    `Computed directly on the 8-dimensional physical state: Σ<sub>j</sub>S<sub>j</sub><sup>†</sup>𝒩(ρ)S<sub>j</sub> differs from Σ<sub>b</sub>p<sub>b</sub>M<sub>b</sub>ρM<sub>b</sub><sup>†</sup> by ${M.ledgerRes.toExponential(1)} and from the input ρ by ${M.plainRes.toExponential(1)}${M.plainRes < 1e-9 ? ': after folding back it is exactly ρ' : ': the difference comes from path twists or two-flip branches, which is what the record has to make up for'} (model calculation).`);
  // pills, clock, HUD
  $('pillStage').innerHTML = `STAGE <strong>${done ? 'DONE' : `${k + 1}/5`}</strong>`;
  $('pillFid').innerHTML = `F̄ <strong>${f3(M.Fbar)}</strong>`;
  $('pillErr').innerHTML = `e<sub>*</sub> <strong>${f3(M.eStar)}</strong>`;
  $('pillRun').innerHTML = `RUN <strong>${M.hash}</strong>`;
  $('clock').innerHTML = `${done ? T('完成', 'done') : names[k]} <small>${S.stage.toFixed(1)} / 5</small>`;
  $('hudBig').textContent = done ? T('⑤ 补偿完成', '⑤ COMPENSATED') : `${'①②③④⑤'[k]} ${names[k]}`;
  $('hudSub').textContent = T('层亮度 = 概率 · 箭头 = 层里的逻辑比特 · 红箭头 = 带着逻辑翻转 X', 'brightness = probability · arrow = the logical qubit in the layer · red = carries a logical X');
  // tell the outcome once, when the pipeline completes
  if (!toasted && S.playing && done) {
    toasted = true;
    toast(M.Fbar > 1 - 1e-9 ? T(`<b>完全找回</b>：漏出 ${f3(M.leak)}，恢复误差 0。`, `<b>Fully recovered</b>: leakage ${f3(M.leak)}, recovery error 0.`)
      : !M.KL ? T(`<b>没能完全找回</b>：两个比特同时翻转骗过了折回，逻辑失败概率 ${f4(M.pFail)}。`, `<b>Not fully recovered</b>: two simultaneous flips fooled the fold-back; logical failure probability ${f4(M.pFail)}.`)
        : T(`<b>记录不够</b>：最优误差 e* = ${f3(M.eStar)}，平均保真度 ${f3(M.Fbar)}。`, `<b>The record falls short</b>: best error e* = ${f3(M.eStar)}, average fidelity ${f3(M.Fbar)}.`));
  }
}
function syncRail() {
  if ($('marks').dataset.lang === TRV.lang()) return; $('marks').dataset.lang = TRV.lang();
  $('marks').innerHTML = STAGE_NAMES().map((n, i) => `<i style="left:${((i + 0.5) / 5 * 100).toFixed(2)}%">${n}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
function setControls() {
  ['w0', 'w1', 'w2', 'w3'].forEach((id, j) => { $(id).value = S.w[j]; });
  $('chi').value = S.chi; $('pflip').value = S.p; $('kbins').value = S.K; $('eps').value = S.eps; $('theta').value = S.theta; $('phase').value = S.phase;
}
['w0', 'w1', 'w2', 'w3'].forEach((id, j) => $(id).addEventListener('input', () => { S.w[j] = parseFloat($(id).value); custom(); }));
$('chi').addEventListener('input', () => { S.chi = parseFloat($('chi').value); custom(); });
$('pflip').addEventListener('input', () => { S.p = parseFloat($('pflip').value); custom(); });
$('kbins').addEventListener('input', () => { S.K = parseInt($('kbins').value, 10); custom(); });
$('eps').addEventListener('input', () => { S.eps = parseFloat($('eps').value); custom(); });
$('theta').addEventListener('input', () => { S.theta = parseFloat($('theta').value); custom(); });
$('phase').addEventListener('input', () => { S.phase = parseFloat($('phase').value); custom(); });
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => { const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'mix'; if (S.mode !== m) { S.mode = m; custom(); } }));
document.querySelectorAll('#recChips .chip').forEach((b) => b.addEventListener('click', () => { const r = RECS.includes(b.dataset.rec) ? b.dataset.rec : 'full'; if (S.rec !== r) { S.rec = r; custom(); } }));
document.querySelectorAll('#twistChips .chip').forEach((b) => b.addEventListener('click', () => { const t = Object.prototype.hasOwnProperty.call(TWISTS, b.dataset.twist) ? b.dataset.twist : 'none'; S.twist = t; S.phi = TWISTS[t].slice(); custom(); }));
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.mode = p.mode; if (p.w) S.w = p.w.slice(); if (p.chi !== undefined) S.chi = p.chi; if (p.p !== undefined) S.p = p.p;
  if (p.phi) { S.phi = p.phi.slice(); S.twist = null; } else { S.twist = p.twist; S.phi = TWISTS[p.twist].slice(); }
  S.rec = p.rec; if (p.K) S.K = p.K;
  setControls(); S.preset = name; markPreset(); dirty = true;
  if (!reduceMotion) { S.stage = 0; S.dir = 1; S.playing = true; setPlayUI(); }
  TRV.glitch($('app'));
}
document.querySelectorAll('.preset').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
function newRun() { S.run++; dirty = true; }

// drag the branch phases on the phasor plot
const phDrag = { layer: -1 };
function phasorHit(px, py) {
  const G = phasorGeom(cvPh); let best = -1, bd = (16 * G.dpr) ** 2;
  for (let l = 0; l < 4; l++) { const z = MODEL.z[l], x = G.cx + G.R * z.re, y = G.cy - G.R * z.im, d = (x - px) ** 2 + (y - py) ** 2; if (d < bd) { bd = d; best = l; } }
  return best;
}
const canvasXY = (ev) => { const r = cvPh.getBoundingClientRect(), dpr = cvPh.width / Math.max(1, r.width); return [(ev.clientX - r.left) * dpr, (ev.clientY - r.top) * dpr]; };
cvPh.addEventListener('pointerdown', (ev) => { const [x, y] = canvasXY(ev), l = phasorHit(x, y); if (l < 0) return; phDrag.layer = l; cvPh.setPointerCapture(ev.pointerId); cvPh.classList.add('dragging'); ev.preventDefault(); });
cvPh.addEventListener('pointermove', (ev) => {
  if (phDrag.layer < 0) return;
  const [x, y] = canvasXY(ev), G = phasorGeom(cvPh), a = Math.atan2(-(y - G.cy), x - G.cx) / DEG;
  S.phi[phDrag.layer] = Math.round(((a % 360) + 360) % 360); S.twist = null; custom();
});
const endPh = () => { phDrag.layer = -1; cvPh.classList.remove('dragging'); };
cvPh.addEventListener('pointerup', endPh); cvPh.addEventListener('pointercancel', endPh);

$('now').addEventListener('input', () => { S.stage = parseFloat($('now').value); S.hold = 0; });
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
    const k = ev.key === 'ArrowRight' ? Math.floor(S.stage + 1e-6) + 1 : Math.ceil(S.stage - 1e-6) - 1;
    S.stage = Math.min(STAGE_MAX, Math.max(0, k)); $('now').value = S.stage;
  }
  else if (ev.key === 'r' || ev.key === 'R') newRun();
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
    if (S.hold > 0) { S.hold -= dtSec; if (S.hold <= 0) { S.stage = S.dir > 0 ? 0 : STAGE_MAX; toasted = false; } }
    else {
      S.stage += S.dir * dtSec * S.speed * STAGE_MAX / STAGE_SECONDS;
      if (S.stage >= STAGE_MAX) { S.stage = STAGE_MAX; S.hold = 2.4; }
      if (S.stage <= 0) { S.stage = 0; S.hold = 1.6; }
    }
    $('now').value = S.stage;
  }
  if (S.stage !== syncedStage) syncOutputs();
  syncRail();
  if (glOK) { updateCamera(dtSec); updateGL(tAcc); renderer.render(scene3, camera); updateTags(); }
  drawPhasor(); drawCompare();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { labelStaticTags(); syncOutputs(); });

/* read-only probe for automated browser tests */
const cplx = (z) => [z.re, z.im], mat = (A) => A.map(cplx);
window.QEC_DEBUG = {
  pending: () => dirty || S.stage !== syncedStage,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL;
    return { w: M.w.slice(), layerW: M.layerW.slice(), leak: M.leak, KL: M.KL, phaseType: M.phaseType, sT: M.sT, eStar: M.eStar, F: M.F, Fbar: M.Fbar, Fe: M.Fe, pFail: M.pFail,
      z: M.z.map(cplx), rho: mat(M.rho), fold: mat(M.fold), fold8: mat(M.fold8), out: mat(M.out), ledgerRes: M.ledgerRes, plainRes: M.plainRes,
      branches: M.branches.map((b) => ({ mask: b.mask, layer: b.layer, w: b.w, amp: b.amp ? cplx(b.amp) : null, M: mat(b.M) })),
      cells: M.cells.map((x) => ({ label: x.label, q: x.q, c: cplx(x.c), abs: x.abs })), T: M.recM.T.map((r) => r.slice()), recOptions: { ...M.recOptions },
      run: { r: M.run.r, mask: M.run.b ? M.run.b.mask : null, fid: M.run.fid, comp: M.run.comp }, hash: M.hash };
  },
  phasorPoint: (l) => { const G = phasorGeom(cvPh), z = MODEL.z[l], r = cvPh.getBoundingClientRect(), k = r.width / cvPh.width; return { x: r.left + (G.cx + G.R * z.re) * k, y: r.top + (G.cy - G.R * z.im) * k, cx: r.left + G.cx * k, cy: r.top + G.cy * k, R: G.R * k }; },
  setStage: (t) => { S.stage = Math.min(STAGE_MAX, Math.max(0, t)); $('now').value = S.stage; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('coarse'); S.playing = false; setPlayUI(); S.stage = 3.55; $('now').value = S.stage; cam.tTheta = 0.5; cam.tPhi = 1.2; cam.tR = 9.4; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('coarse');
S.stage = 0; S.playing = !reduceMotion; $('now').value = S.stage;
if (reduceMotion) { S.stage = STAGE_MAX; $('now').value = S.stage; }
setPlayUI();
requestAnimationFrame(frame);
})();
