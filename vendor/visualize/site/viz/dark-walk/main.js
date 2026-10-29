/* DARK//WALK · 首次探测与暗态 · 永远找不到的行走者
   A continuous-time quantum walk H = −γA on a ring or a chain, checked at one site every τ (theory §11): the no-click operator
   is Q = (I − P_d)U and the click operator L = P_d U, with U = e^{−iHτ} = e^{iAτ}. The first-click law is F_n = ‖LQ^{n−1}ψ‖²,
   the survival S_N = ‖Q^Nψ‖². The dark space (§13) is spanned, inside each group of equal eigenphases e^{iaτ}, by the vectors
   orthogonal to the group's projection of the detector site, so P_dark = 1 − Σ_g |⟨u_g, ψ⟩|²/‖u_g‖² with u_g = P_g|d⟩.
   A classical continuous-time random walk on the same graph, checked the same way, is the comparison.
   Theory: trureturing docs/develop/theory/RECURSIVE_RELATIONAL_OBSERVATION_WAVE_PARTICLE_EVENTS.md §11–§13, §49.
   Frozen Lean anchors are named in the page text. Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const N_MAX = 24, R_MAX = 4000, R_MIN = 24, TAU_MIN = 0.05, TAU_MAX = 5, PHASE_TOL = 1e-9, BRIGHT_TOL = 1e-7, SNAP = 0.012;
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { mulberry32, fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, sigma: SG, ok: OK, cyan: CY, magenta: MG } = TRV.palette;
const RUN_SECONDS = 14;

/* =====================================================================
   2. State and presets
   ===================================================================== */
const S = { graph: 'ring', N: 8, x0: 3, part: 'all', tau: 1, classical: true, run: 0, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'half' };
const BASE = { graph: 'ring', N: 8, x0: 3, part: 'all', tau: 1 };
const TAU_SPECIAL_8 = 2 * Math.PI / (2 + Math.SQRT2), TAU_SPECIAL_6 = 4 * Math.PI / 3;
const PRESETS = {
  ret: { ...BASE, x0: 0,
    zh: '从探测点出发，问它什么时候回来。有限维里回来是必然的（P_det = 1），平均返回轮数恰好是整数 5：初态覆盖的不同本征相位个数（Grünbaum 等，2013）。',
    en: 'Start at the detector and ask when the walker comes back. In finite dimensions the return is certain (P_det = 1), and the mean return round is exactly the integer 5: the number of distinct eigenphases the initial state covers (Grünbaum et al., 2013).' },
  half: { ...BASE,
    zh: '从第 3 格出发。它的一半由在探测点上恰好为零的驻波组成：不管等多久，探测器只能找到一半，另一半一直在环上走，却永远不被看见。经典随机行走者最终一定会被找到。',
    en: 'Start at site 3. Half of it is made of standing waves that vanish exactly at the detector: however long you wait, the detector finds only half, while the other half keeps walking round the ring and is never seen. A classical random walker is always found in the end.' },
  two: { ...BASE, graph: 'mid', N: 3, x0: 0,
    zh: '三格链，探测点在中间。从左端出发的态是“亮”组合 (L + R)/√2 与“暗”组合 (L − R)/√2 的等权叠加；暗组合的两条路在中点处相消，永不点击（理论卷命题 13.5）。',
    en: 'A three-site chain with the detector in the middle. Starting at the left end is an equal mix of the bright combination (L + R)/√2 and the dark one (L − R)/√2; the two paths of the dark one cancel at the middle and it never clicks (Proposition 13.5 of the theory volume).' },
  chain: { ...BASE, graph: 'end', N: 8, x0: 7,
    zh: '链的一端放探测点，从另一端出发。开链的本征能量互不相同，而且在端点处都不为零，所以没有暗态：最终一定会被探到。',
    en: 'The detector sits at one end of a chain and the walker starts at the other. The energies of an open chain are all distinct and none vanishes at the end site, so there is no dark state: the walker is always detected in the end.' },
  darkstart: { ...BASE, part: 'dark',
    zh: '只取 |3⟩ 的暗分量作为出发态：它是几个在探测点处为零的驻波的叠加。柱子一直在动，探测器却一轮也不会响。',
    en: 'Keep only the dark part of |3⟩ as the initial state: a superposition of standing waves that vanish at the detector. The bars keep moving, yet the detector never clicks, not once.' },
  special: { ...BASE, x0: 1, tau: TAU_SPECIAL_8,
    zh: '特殊间隔 τ = 2π/(2 + √2)：两个能量相差 2 + √2 的本征相位恰好重合，合并后又多出一个暗方向。从第 1 格出发只有约 1.4% 的机会被探到；τ 稍微偏一点，就回到 50%。',
    en: 'Special interval τ = 2π/(2 + √2): the eigenphases of two energies 2 + √2 apart coincide, and merging them creates one more dark direction. Starting at site 1 the chance of detection is only about 1.4%; nudge τ slightly and it is back at 50%.' },
  alldark: { ...BASE, N: 6, x0: 1, tau: TAU_SPECIAL_6,
    zh: '六格环，特殊间隔 τ = 4π/3：从第 1 格出发，探测器永远等不到它（P_det = 0）。一般的间隔下，同一个出发点有一半的机会被找到。',
    en: 'A six-site ring at the special interval τ = 4π/3: starting at site 1, the detector waits forever (P_det = 0). At a generic interval the same start is found half of the time.' },
  zeno: { ...BASE, x0: 4, tau: 0.1,
    zh: '每隔 0.1/γ 就看一次：探测概率仍然是 1，平均却要等约 400 轮（约 40/γ）；每 1/γ 看一次只要约 4.8 轮。看得太勤，反而把行走者钉在原地——这是芝诺效应。',
    en: 'Checking every 0.1/γ: the detection probability is still 1, but on average it takes about 400 rounds (about 40/γ); checking every 1/γ takes only about 4.8 rounds. Looking too often pins the walker in place: the Zeno effect.' }
};

/* =====================================================================
   3. Linear algebra and the law
   ===================================================================== */
function jacobi(A0) {                                   // real symmetric eigen-decomposition; vecs[x][k] is component x of eigenvector k
  const n = A0.length, A = A0.map((r) => r.slice()), V = A.map((_, i) => A.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return { vals: A.map((r, i) => r[i]), vecs: V };
}
function adjacency(graph, N) {
  const A = Array.from({ length: N }, () => new Array(N).fill(0)), e = (i, j) => { A[i][j] = 1; A[j][i] = 1; };
  if (graph === 'ring') { for (let i = 0; i < N; i++) e(i, (i + 1) % N); } else for (let i = 0; i + 1 < N; i++) e(i, i + 1);
  return A;
}
const detectorOf = (graph, N) => (graph === 'mid' ? Math.floor((N - 1) / 2) : 0);
/* group eigenvectors by eigenphase e^{i a τ}; within a group the detector projection u_g decides the bright direction */
function phaseGroups(spec, tau, d) {
  const groups = [];
  spec.vals.forEach((a, k) => {
    const z = [Math.cos(a * tau), Math.sin(a * tau)];
    let g = groups.find((G) => Math.hypot(G.z[0] - z[0], G.z[1] - z[1]) < PHASE_TOL);
    if (!g) { g = { z, ks: [] }; groups.push(g); }
    g.ks.push(k);
  });
  const N = spec.vals.length;
  for (const g of groups) {
    g.u = new Array(N).fill(0);
    for (const k of g.ks) { const w = spec.vecs[d][k]; for (let x = 0; x < N; x++) g.u[x] += w * spec.vecs[x][k]; }
    g.uu = g.u.reduce((s, v) => s + v * v, 0); g.bright = g.uu > BRIGHT_TOL;
  }
  return groups;
}
/* real initial vectors only (localized and their dark / bright parts are real) */
function darkPart(psi, groups) { const out = psi.slice(); for (const g of groups) if (g.bright) { const c = g.u.reduce((s, v, x) => s + v * psi[x], 0) / g.uu; for (let x = 0; x < out.length; x++) out[x] -= c * g.u[x]; } return out; }
const norm2 = (v) => v.reduce((s, x) => s + x * x, 0);
function pDetOf(psi, groups) { let p = 0; for (const g of groups) if (g.bright) { const c = g.u.reduce((s, v, x) => s + v * psi[x], 0); p += c * c / g.uu; } return p; }
/* special intervals: τ = 2πm/|a − a′| where merging two bright groups enlarges the dark space */
function specialTaus(spec, d) {
  const E = [];
  spec.vals.forEach((a) => { if (!E.some((e) => Math.abs(e - a) < 1e-9)) E.push(a); });
  const base = phaseGroups(spec, 0.37 + 1e-3 * Math.PI, d).filter((g) => g.bright).length, out = [];
  for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
    const gap = Math.abs(E[i] - E[j]);
    for (let m = 1; 2 * Math.PI * m / gap <= TAU_MAX + 1e-12; m++) {
      const t = 2 * Math.PI * m / gap; if (t < TAU_MIN) continue;
      if (out.some((o) => Math.abs(o - t) < 1e-9)) continue;
      if (phaseGroups(spec, t, d).filter((g) => g.bright).length < base) out.push(t);
    }
  }
  return out.sort((a, b) => a - b);
}

/* =====================================================================
   4. This configuration and run (fixed seeds; R draws a new run)
   ===================================================================== */
let MODEL = null, dirty = true, uRun = 0.5;
function reseed() { const r = mulberry32(0xDA7C + S.run * 7919); r(); uRun = r(); }
reseed();
/* mean round of the first click, given a click: Σ_n n F_n / P_det = Σ_{n≥0} ‖Q^n ψ_B‖² / P_det, where ψ_B is the
   bright part (the dark part never decays and the bright subspace is Q-invariant). The infinite sum is X = Σ (Q_B†)^n Q_B^n
   with Q_B = (I − P_d) U Π_B, summed by doubling: X ← X + P† X P, P ← P², so 2^k rounds after k steps. */
function exactMean(Ure, Uim, d, groups, psi0, N) {
  const NN = N * N, mul = (A, B) => { const r = new Float64Array(NN), i = new Float64Array(NN);
    for (let x = 0; x < N; x++) for (let k = 0; k < N; k++) { const ar = A.r[x * N + k], ai = A.i[x * N + k]; if (ar === 0 && ai === 0) continue;
      for (let y = 0; y < N; y++) { const br = B.r[k * N + y], bi = B.i[k * N + y]; r[x * N + y] += ar * br - ai * bi; i[x * N + y] += ar * bi + ai * br; } }
    return { r, i }; };
  const adj = (A) => { const r = new Float64Array(NN), i = new Float64Array(NN); for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) { r[y * N + x] = A.r[x * N + y]; i[y * N + x] = -A.i[x * N + y]; } return { r, i }; };
  const Pi = new Float64Array(NN); groups.forEach((g) => { if (!g.bright) return; for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) Pi[x * N + y] += g.u[x] * g.u[y] / g.uu; });
  const Q = { r: new Float64Array(NN), i: new Float64Array(NN) };
  for (let x = 0; x < N; x++) if (x !== d) for (let y = 0; y < N; y++) { Q.r[x * N + y] = Ure[x][y]; Q.i[x * N + y] = Uim[x][y]; }
  let P = mul(Q, { r: Pi, i: new Float64Array(NN) }), X = { r: new Float64Array(NN), i: new Float64Array(NN) };
  for (let x = 0; x < N; x++) X.r[x * N + x] = 1;
  for (let k = 0; k < 48; k++) {
    let fro = 0; for (let j = 0; j < NN; j++) fro += P.r[j] * P.r[j] + P.i[j] * P.i[j];
    if (fro < 1e-26) break;
    const Y = mul(adj(P), mul(X, P)); for (let j = 0; j < NN; j++) { X.r[j] += Y.r[j]; X.i[j] += Y.i[j]; }
    P = mul(P, P);
  }
  const b = new Float64Array(N); for (let x = 0; x < N; x++) { let s = 0; for (let y = 0; y < N; y++) s += Pi[x * N + y] * psi0[y]; b[x] = s; }
  let t = 0; for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) t += b[x] * X.r[x * N + y] * b[y];
  return t;
}
function fnv(bytes) { let h = 0x811c9dc5; for (const v of bytes) { h ^= v & 0xff; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
function build() {
  const N = S.N, d = detectorOf(S.graph, N), A = adjacency(S.graph, N), spec = jacobi(A), tau = S.tau;
  const groups = phaseGroups(spec, tau, d);
  // initial state
  const loc = new Array(N).fill(0); loc[S.x0] = 1;
  const dk = darkPart(loc, groups), br = loc.map((v, x) => v - dk[x]);
  let psi0 = S.part === 'dark' ? dk : S.part === 'bright' ? br : loc, partEmpty = false;
  if (norm2(psi0) < 1e-12) { psi0 = loc; partEmpty = true; }
  const nn = Math.sqrt(norm2(psi0)); psi0 = psi0.map((v) => v / nn);
  const pDet = Math.min(1, Math.max(0, pDetOf(psi0, groups))), pDark = 1 - pDet;
  const ghost0 = darkPart(psi0, groups);
  const brightGroups = groups.filter((g) => g.bright).length, darkDim = N - brightGroups;
  // U = Σ e^{i a τ} v vᵀ
  const Ure = Array.from({ length: N }, () => new Float64Array(N)), Uim = Array.from({ length: N }, () => new Float64Array(N));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { let re = 0, im = 0; for (let k = 0; k < N; k++) { const w = spec.vecs[i][k] * spec.vecs[j][k], a = spec.vals[k] * tau; re += w * Math.cos(a); im += w * Math.sin(a); } Ure[i][j] = re; Uim[i][j] = im; }
  // rounds: ψ_n after the n-th check (no click), F_n, S_n; stop once within 0.002 of P_det
  const states = [{ re: Float64Array.from(psi0), im: new Float64Array(N) }], F = [0], Sv = [1];
  let re = Float64Array.from(psi0), im = new Float64Array(N), cum = 0, n = 0;
  while (n < R_MAX) {
    const r2 = new Float64Array(N), i2 = new Float64Array(N);
    for (let i = 0; i < N; i++) { let a = 0, b = 0; const Ur = Ure[i], Ui = Uim[i]; for (let j = 0; j < N; j++) { a += Ur[j] * re[j] - Ui[j] * im[j]; b += Ur[j] * im[j] + Ui[j] * re[j]; } r2[i] = a; i2[i] = b; }
    const f = r2[d] * r2[d] + i2[d] * i2[d]; r2[d] = 0; i2[d] = 0; re = r2; im = i2; n++;
    cum += f; F.push(f); let s = 0; for (let x = 0; x < N; x++) s += re[x] * re[x] + im[x] * im[x]; Sv.push(s);
    states.push({ re, im });
    if (n >= R_MIN && cum >= pDet - 0.002) break;
  }
  const R = n;
  const meanRound = pDet > 1e-9 ? exactMean(Ure, Uim, d, groups, psi0, N) / pDet : null;
  // classical continuous-time random walk with rate γ on the same graph, checked every τ
  const Lap = A.map((row, i) => row.map((v, j) => (i === j ? -row.reduce((s, x) => s + x, 0) : v)));
  const cs = jacobi(Lap), M = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (__, j) => { let s = 0; for (let k = 0; k < N; k++) s += cs.vecs[i][k] * cs.vecs[j][k] * Math.exp(cs.vals[k] * tau); return s; }));
  let p = Float64Array.from(loc), cS = [1], cF = [0], cCum = 0;
  for (let k = 1; k <= Math.max(R, 1); k++) {
    const q = new Float64Array(N); for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) s += M[i][j] * p[j]; q[i] = s; }
    const f = q[d]; q[d] = 0; p = q; cF.push(f); cCum += f; cS.push(p.reduce((s, v) => s + v, 0));
  }
  // scan of P_det against τ for this initial vector (generic grid) and its values at the special intervals
  const scan = []; for (let i = 0; i <= 300; i++) { const t = TAU_MIN + (TAU_MAX - TAU_MIN) * i / 300; scan.push([t, pDetOf(psi0, phaseGroups(spec, t, d))]); }
  const specials = specialTaus(spec, d).map((t) => [t, pDetOf(psi0, phaseGroups(spec, t, d))]);
  // this run: the round of the first click, or the dark branch
  let nStar = null, fate = 'later', c = 0;
  for (let k = 1; k <= R; k++) { c += F[k]; if (uRun < c) { nStar = k; fate = 'click'; break; } }
  if (nStar === null && uRun >= pDet) fate = 'dark';
  const returnCase = S.part === 'all' && S.x0 === d && !partEmpty;
  MODEL = { N, d, spec, groups, psi0, pDet, pDark, ghost0, brightGroups, darkDim, R, F, S: Sv, states, cum, meanRound, classical: { F: cF, S: cS, cum: cCum },
    scan, specials, nStar, fate, returnCase, partEmpty, hash: fnv([S.run & 0xff, N, S.x0, ...(nStar ? [nStar & 0xff, nStar >> 8] : [fate === 'dark' ? 254 : 255])]) };
}
/* fractional round r: the state evolves freely for (r − n)τ after the n-th check */
function evolve(vec, re, im, s) {                      // e^{iAs} applied to (re + i im) through the eigenbasis
  const { spec } = MODEL, N = MODEL.N, outR = new Float64Array(N), outI = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    let cr = 0, ci = 0; for (let x = 0; x < N; x++) { const v = spec.vecs[x][k]; cr += v * re[x]; ci += v * (im ? im[x] : 0); }
    const a = spec.vals[k] * s, co = Math.cos(a), si = Math.sin(a), zr = cr * co - ci * si, zi = cr * si + ci * co;
    for (let x = 0; x < N; x++) { const v = spec.vecs[x][k]; outR[x] += zr * v; outI[x] += zi * v; }
  }
  return { re: outR, im: outI };
}
const rNow = () => S.nowFrac * MODEL.R;
function stateAt(r) { const n = Math.min(MODEL.R, Math.floor(r + 1e-9)), st = MODEL.states[n]; return n >= MODEL.R ? st : evolve(null, st.re, st.im, (r - n) * S.tau); }
function ghostAt(r) { return evolve(null, MODEL.ghost0, null, r * S.tau); }
const roundsDone = (r = rNow()) => Math.min(MODEL.R, Math.floor(r + 1e-9));
function cumDetected(n) { let c = 0; for (let k = 1; k <= n; k++) c += MODEL.F[k]; return c; }

/* =====================================================================
   5. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags');
const cvTL = $('timeline'), cvSC = $('scan'), cvTape = $('tape');
const f3 = (v) => (v === null || !isFinite(v) ? '—' : v.toFixed(3));
const tauText = (t) => { const sp = MODEL && MODEL.specials.find(([s]) => Math.abs(s - t) < 1e-9); return sp ? `${t.toFixed(4)} ✦` : t.toFixed(2); };
function phaseRGB(re, im) {                            // hue from the phase: 0 cyan, π/2 amber, π magenta, 3π/2 green
  const a = Math.atan2(im, re), c = Math.cos(a), s = Math.sin(a);
  const w = [Math.max(0, c), Math.max(0, s), Math.max(0, -c), Math.max(0, -s)], cols = [COL.cyan, COL.amber, COL.magenta, [0.27, 1.0, 0.70]];
  const tot = w.reduce((x, y) => x + y, 0) || 1; return [0, 1, 2].map((i) => w.reduce((acc, wk, k) => acc + wk * cols[k][i], 0) / tot);
}

/* =====================================================================
   6. Three.js scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts, bars = [];
const CAMS = { iso: [0.6, 0.98, 7.6], top: [0.0001, 0.05, 7.6], side: [0.0001, 1.45, 7.2] };
const cam = { theta: 0.6, phi: 0.98, r: 7.6, tTheta: 0.6, tPhi: 0.98, tR: 7.6 };
const HMAX = 3.4;
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
    d.textContent = T('这个浏览器没有提供 WebGL，三维视图无法显示。下方的探测曲线、记录带和右侧读数仍然可用。', 'This browser does not provide WebGL, so the 3D view cannot be shown. The detection plots, the record tape and the readouts still work.');
    stage.appendChild(d); return;
  }
  glOK = true;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x02040a, 1);
  scene3 = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
  const g = new THREE.BufferGeometry(); dyn(g, 'position', 4000, 3); dyn(g, 'color', 4000, 3);
  lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, ...additive })); lines.frustumCulled = false; scene3.add(lines);
  const gp = new THREE.BufferGeometry(); dyn(gp, 'position', N_MAX + 8, 3); dyn(gp, 'aColor', N_MAX + 8, 3); dyn(gp, 'aAlpha', N_MAX + 8, 1); dyn(gp, 'aSize', N_MAX + 8, 1);
  pts = new THREE.Points(gp, new THREE.ShaderMaterial({ vertexShader: EVT_VS, fragmentShader: RING_FS, uniforms: { uScale: { value: 60 } }, ...additive }));
  pts.frustumCulled = false; scene3.add(pts);
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  for (let i = 0; i < N_MAX; i++) { const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x19f0ff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); m.visible = false; scene3.add(m); bars.push(m); }
}
function sitePos(i) {
  const N = MODEL.N;
  if (S.graph === 'ring') { const a = Math.PI / 2 + 2 * Math.PI * i / N; return [2.3 * Math.cos(a), 0, 2.3 * Math.sin(a)]; }
  return [-2.9 + 5.8 * i / Math.max(1, N - 1), 0, 0];
}
const barWidth = () => (S.graph === 'ring' ? Math.min(0.42, 2 * Math.PI * 2.3 / MODEL.N * 0.5) : Math.min(0.42, 5.8 / Math.max(1, MODEL.N - 1) * 0.55));
function updateGL(time) {
  const N = MODEL.N, r = rNow(), st = stateAt(r), gh = ghostAt(r), w = barWidth(), d = MODEL.d;
  const L = lines.geometry.attributes, Pp = L.position.array, Cc = L.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > Pp.length / 3) return; const c = col.map((x) => x * k); Pp.set(a, 3 * v); Cc.set(c, 3 * v); v++; Pp.set(b, 3 * v); Cc.set(c, 3 * v); v++; };
  // graph edges and the base
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; if (S.graph !== 'ring' && j === 0) continue; seg(sitePos(i), sitePos(j), COL.sigma, 0.3); }
  // bars: probability not yet detected at each site, coloured by phase; dark ghost as magenta frames
  for (let i = 0; i < N_MAX; i++) {
    const m = bars[i]; if (i >= N) { m.visible = false; continue; }
    const p = sitePos(i), pr = st.re[i] * st.re[i] + st.im[i] * st.im[i], h = Math.max(0.002, HMAX * pr);
    m.visible = true; m.position.set(p[0], 0, p[2]); m.scale.set(w, h, w);
    m.material.color.setRGB(...phaseRGB(st.re[i], st.im[i])); m.material.opacity = 0.35 + 0.5 * Math.min(1, pr * 4);
    const gq = gh.re[i] * gh.re[i] + gh.im[i] * gh.im[i];
    if (gq > 1e-6) {
      const gh2 = HMAX * gq, x0 = p[0] - w * 0.65, x1 = p[0] + w * 0.65, z0 = p[2] - w * 0.65, z1 = p[2] + w * 0.65;
      for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) { seg([ax, gh2, az], [bx, gh2, bz], COL.magenta, 0.8); seg([ax, 0, az], [ax, gh2, az], COL.magenta, 0.25); }
    }
  }
  // detector beam flashes with the click probability of the check just made
  const n = roundsDone(r), since = r - n, fl = n > 0 ? Math.max(0, 1 - since / 0.35) * Math.min(1, Math.sqrt(MODEL.F[n]) * 2.2) : 0;
  const clickNow = MODEL.nStar !== null && n === MODEL.nStar && since < 0.6;
  const pd = sitePos(d);
  seg([pd[0], 0, pd[2]], [pd[0], HMAX * 1.12, pd[2]], COL.amber, 0.25 + 0.75 * Math.max(fl, clickNow ? 1 : 0));
  lines.geometry.setDrawRange(0, v); L.position.needsUpdate = true; L.color.needsUpdate = true;
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { PT.position.array.set(p, 3 * np); PT.aColor.array.set(col, 3 * np); PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  for (let i = 0; i < N; i++) dot(sitePos(i), i === S.x0 ? COL.cyan : COL.sigma, i === S.x0 ? 0.9 : 0.35, i === S.x0 ? 1.6 : 0.9);
  dot([pd[0], 0.01, pd[2]], COL.amber, 0.85 + 0.15 * Math.sin(time * 4), 2.6 + 2.2 * fl);
  if (clickNow) dot([pd[0], 0.6, pd[2]], COL.magenta, 1 - since / 0.6, 6 * (1 - since / 0.6) + 2);
  for (let i = np; i < N_MAX + 8; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 58 * renderer.getPixelRatio();
}

/* =====================================================================
   7. Camera and picking
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.35 : 1), ty = 0.9;
  camera.position.set(r * sp * Math.sin(cam.theta), ty + r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0, ty, 0);
}
function setCamPreset(name) {
  const p = CAMS[name]; if (!p) return;
  let d = (p[0] - cam.theta) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  cam.tTheta = cam.theta + d; cam.tPhi = p[1]; cam.tR = p[2];
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === name)));
}
const proj = (p) => { const q = new THREE.Vector3(p[0], p[1], p[2]).project(camera), rect = stage.getBoundingClientRect(); return { x: (q.x * 0.5 + 0.5) * rect.width, y: (-q.y * 0.5 + 0.5) * rect.height, z: q.z }; };
function pickAt(px, py) {
  if (!glOK || !MODEL) return;
  let best = -1, bd = 26 * 26;
  for (let i = 0; i < MODEL.N; i++) { const q = proj(sitePos(i)), dd = (q.x - px) ** 2 + (q.y - py) ** 2; if (q.z > -1 && q.z < 1 && dd < bd) { bd = dd; best = i; } }
  if (best >= 0 && best !== S.x0) { S.x0 = best; $('start').value = best; custom(); }
}
const drag = { x: 0, y: 0, moved: 0, pts: new Map(), pinch: 0 };
stage.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest('.chip')) return;
  stage.setPointerCapture(ev.pointerId);
  drag.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); drag.x = ev.clientX; drag.y = ev.clientY; drag.moved = 0;
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()]; drag.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
});
stage.addEventListener('pointermove', (ev) => {
  if (!drag.pts.has(ev.pointerId)) return;
  drag.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(16, Math.max(3, cam.tR * drag.pinch / d)); drag.pinch = d; drag.moved += 10; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => {
  if (!drag.pts.has(ev.pointerId)) return;
  drag.pts.delete(ev.pointerId);
  if (drag.pts.size === 0) { if (drag.moved < 5) { const r = stage.getBoundingClientRect(); pickAt(ev.clientX - r.left, ev.clientY - r.top); } drag.pinch = 0; }
};
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(16, Math.max(3, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   8. Tags
   ===================================================================== */
function mkTag(cls) { const el = document.createElement('div'); el.className = 'tag ' + cls; tagsBox.appendChild(el); return el; }
const tagDet = mkTag('hot'), tagStart = mkTag('cy raw'), tagClick = mkTag('mg');
function labelStaticTags() { tagDet.textContent = T('探测器', 'DETECTOR'); tagStart.textContent = T('出发 x₀', 'START x₀'); tagClick.textContent = T('这一次：点击！', 'THIS RUN: CLICK!'); }
labelStaticTags();
function placeTag(el, p, show = true) {
  if (!glOK || !show) { el.style.display = 'none'; return; }
  const q = proj(p); if (q.z > 1 || q.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.style.left = q.x + 'px'; el.style.top = q.y + 'px';
}
function updateTags() {
  const pd = sitePos(MODEL.d), ps = sitePos(S.x0), r = rNow(), n = roundsDone(r);
  placeTag(tagDet, [pd[0], HMAX * 1.2, pd[2]]);
  placeTag(tagStart, [ps[0] * 1.18, -0.2, ps[2] * 1.18 + (S.graph === 'ring' ? 0 : 0.35)], S.x0 !== MODEL.d);
  placeTag(tagClick, [pd[0], HMAX * 0.75, pd[2]], MODEL.nStar !== null && n >= MODEL.nStar && n < MODEL.nStar + 3);
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
function gridY(F, ticks, fmt) {
  const { ctx, dpr, pl, pt, iw, ih } = F;
  ctx.strokeStyle = FAINT; ctx.lineWidth = 1; ctx.globalAlpha = 0.6; ctx.beginPath();
  for (const y of ticks) { const yy = pt + ih - y * ih; ctx.moveTo(pl, yy); ctx.lineTo(pl + iw, yy); }
  ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const y of ticks) ctx.fillText(fmt(y), pl - 5 * dpr, pt + ih - y * ih);
}
function legend(F, items, x0, y0) {
  const { ctx, dpr } = F; ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const w = Math.max(...items.map(([t]) => ctx.measureText(t).width)) + 22 * dpr;
  ctx.fillStyle = 'rgba(2, 6, 12, 0.8)'; ctx.fillRect(x0 - 4 * dpr, y0 - 3 * dpr, w + 6 * dpr, items.length * 13 * dpr + 4 * dpr);
  items.forEach(([t, c, dash], k) => { ctx.strokeStyle = c; ctx.lineWidth = 2 * dpr; ctx.setLineDash(dash ? [4 * dpr, 3 * dpr] : []); ctx.beginPath(); ctx.moveTo(x0, y0 + k * 13 * dpr + 6 * dpr); ctx.lineTo(x0 + 14 * dpr, y0 + k * 13 * dpr + 6 * dpr); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = INK; ctx.fillText(t, x0 + 18 * dpr, y0 + k * 13 * dpr); });
}
function drawTimeline() {
  const F = frame2d(cvTL); if (F.iw < 40 || F.ih < 30) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, R = MODEL.R, r = rNow();
  const X = (n) => pl + n / R * iw, Y = (p) => pt + ih - p * ih;
  gridY(F, [0, 0.5, 1], (y) => y.toFixed(1));
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of [0, Math.round(R / 2), R]) ctx.fillText(String(v), X(v), pt + ih + 3 * dpr);
  // first-click probabilities as bars, scaled to the largest
  const fmax = Math.max(1e-12, ...MODEL.F.slice(1)), bw = Math.max(1, iw / R * 0.7);
  ctx.fillStyle = AM;
  for (let n = 1; n <= R; n++) { const h = MODEL.F[n] / fmax * ih * 0.45; if (h < 0.3) continue; ctx.globalAlpha = n <= r ? 0.8 : 0.25; ctx.fillRect(X(n) - bw / 2, pt + ih - h, bw, h); }
  ctx.globalAlpha = 1;
  const curve = (arr, col, w, dash) => { ctx.strokeStyle = col; ctx.lineWidth = w * dpr; ctx.setLineDash(dash ? [4 * dpr, 3 * dpr] : []); ctx.beginPath(); arr.forEach((p, n) => { if (n > R) return; const x = X(n), y = Y(p); if (n) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]); };
  if (S.classical) curve(MODEL.classical.S, DIM, 1.4, true);
  curve(MODEL.S, CY, 2);
  ctx.strokeStyle = MG; ctx.lineWidth = 1.2 * dpr; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(pl, Y(MODEL.pDark)); ctx.lineTo(pl + iw, Y(MODEL.pDark)); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = AM; ctx.lineWidth = 1.2 * dpr; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(X(r), pt); ctx.lineTo(X(r), pt + ih); ctx.stroke(); ctx.globalAlpha = 1;
  const items = [[T('尚未被探到 S_n', 'not yet detected S_n'), CY], [T('暗态权重（永不被探到）', 'dark weight (never detected)'), MG, true], [T('每轮首次点击 F_n', 'first click per round F_n'), AM]];
  if (S.classical) items.push([T('经典随机行走', 'classical random walk'), DIM, true]);
  legend(F, items, pl + iw * 0.5, pt + 4 * dpr);
  $('tlMeta').textContent = T(`第 ${roundsDone(r)} / ${R} 轮 · τ = ${tauText(S.tau)}`, `round ${roundsDone(r)} / ${R} · τ = ${tauText(S.tau)}`);
}
function drawScan() {
  const F = frame2d(cvSC); if (F.iw < 40 || F.ih < 30) return;
  const { ctx, dpr, pl, pt, iw, ih } = F;
  const X = (t) => pl + (t - TAU_MIN) / (TAU_MAX - TAU_MIN) * iw, Y = (p) => pt + ih - p * ih;
  gridY(F, [0, 0.5, 1], (y) => y.toFixed(1));
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of [1, 2, 3, 4, 5]) ctx.fillText(String(v), X(v), pt + ih + 3 * dpr);
  ctx.strokeStyle = CY; ctx.lineWidth = 2 * dpr; ctx.beginPath(); MODEL.scan.forEach(([t, p], i) => (i ? ctx.lineTo(X(t), Y(p)) : ctx.moveTo(X(t), Y(p)))); ctx.stroke();
  for (const [t, p] of MODEL.specials) {
    ctx.strokeStyle = MG; ctx.globalAlpha = 0.45; ctx.setLineDash([2 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(X(t), pt); ctx.lineTo(X(t), pt + ih); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = MG; ctx.beginPath(); ctx.arc(X(t), Y(p), 3.2 * dpr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(S.tau), Y(MODEL.pDet), 4.5 * dpr, 0, Math.PI * 2); ctx.fill();
  legend(F, [[T('一般间隔下的 P_det', 'P_det at generic intervals'), CY], [T('特殊间隔（相位重合）', 'special intervals (phases coincide)'), MG, true]], pl + 8 * dpr, pt + 4 * dpr);
  $('scMeta').textContent = T(`横轴：τ（1/γ）· ${MODEL.specials.length} 个特殊间隔`, `x: τ (1/γ) · ${MODEL.specials.length} special intervals`);
}
function drawTape() {
  // one cell per stretch of rounds (a, b]: checked without a click, the first click, or rounds that never happen in this run
  const dpr = fitCanvas(cvTape), ctx = cvTape.getContext('2d'), W = cvTape.width, Hh = cvTape.height;
  ctx.clearRect(0, 0, W, Hh);
  const R = MODEL.R, done = roundsDone(), cells = Math.min(R, 160), w = (W - 8 * dpr) / Math.max(1, cells), ns = MODEL.nStar;
  for (let k = 0; k < cells; k++) {
    const a = Math.floor(k * R / cells), b = Math.floor((k + 1) * R / cells);
    const click = ns !== null && ns > a && ns <= b, after = ns !== null && a >= ns;
    ctx.fillStyle = click ? MG : after ? FAINT : MODEL.fate === 'dark' ? SG : CY;
    ctx.globalAlpha = after ? 0.12 : b <= done ? (click ? 1 : 0.7) : 0.12;
    ctx.fillRect(4 * dpr + k * w, 8 * dpr, Math.max(1, w - 1 * dpr), Hh - 16 * dpr);
  }
  ctx.globalAlpha = 1;
}

/* =====================================================================
   10. Readouts and controls
   ===================================================================== */
let syncedR = NaN, toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function syncOutputs() {
  if (dirty) { build(); dirty = false; toasted = false; }
  const r = rNow(); syncedR = r;
  const M = MODEL, n = roundsDone(r), det = cumDetected(n), surv = M.S[n];
  $('oSites').textContent = String(S.N); $('oStart').textContent = String(S.x0); $('oTau').textContent = tauText(S.tau);
  $('start').max = String(S.N - 1);
  document.querySelectorAll('#graphChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.graph === S.graph)));
  document.querySelectorAll('#partChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.part === S.part)));
  $('roDet').textContent = f3(M.pDet); $('roDark').textContent = f3(M.pDark);
  $('roDim').textContent = `${M.darkDim} / ${M.N}`;
  $('roNow').textContent = `${f3(det)} / ${f3(surv)}`;
  $('roMean').textContent = M.meanRound === null ? '—' : M.meanRound.toFixed(3);
  if (M.returnCase) { $('roL6').innerHTML = T('不同本征相位个数（返回量子化）', 'Distinct eigenphases (return quantization)'); $('ro6').textContent = String(M.brightGroups); }
  else { $('roL6').innerHTML = T('经典随机行走 P<sub>det</sub>（窗口内）', 'Classical random walk P<sub>det</sub> (in window)'); $('ro6').textContent = f3(M.classical.cum); }
  $('roNote').innerHTML = M.returnCase
    ? T(`从探测点出发：回归必然发生，平均返回轮数 ${f3(M.meanRound)} 恰为整数 ${M.brightGroups}（Grünbaum 等，2013；本页把无穷级数求和到机器精度）。`, `Starting at the detector: the return is certain, and the mean return round ${f3(M.meanRound)} is exactly the integer ${M.brightGroups} (Grünbaum et al., 2013; this page sums the infinite series to machine precision).`)
    : M.pDark > 1e-6 ? T(`有 ${(M.pDark * 100).toFixed(1)}% 的概率永远不被探到；经典随机行走在同一窗口内已被探到 ${(M.classical.cum * 100).toFixed(1)}%。`, `With probability ${(M.pDark * 100).toFixed(1)}% the walker is never detected; a classical random walk is already detected ${(M.classical.cum * 100).toFixed(1)}% of the time within the same window.`)
      : T('没有暗分量：最终一定会被探到。', 'No dark part: the walker is always detected in the end.');
  $('graphNote').innerHTML = { ring: T(`${S.N} 格的环，探测器在第 0 格。`, `A ring of ${S.N} sites with the detector at site 0.`), end: T(`${S.N} 格的开链，探测器在一端（第 0 格）。`, `An open chain of ${S.N} sites with the detector at one end (site 0).`), mid: T(`${S.N} 格的开链，探测器在第 ${M.d} 格（中间）。`, `An open chain of ${S.N} sites with the detector at site ${M.d} (the middle).`) }[S.graph]
    + ' ' + T(`暗空间 ${M.darkDim} 维。`, `The dark space has dimension ${M.darkDim}.`);
  const locDark = (() => { const loc = new Array(M.N).fill(0); loc[S.x0] = 1; return norm2(darkPart(loc, M.groups)); })();
  $('startNote').innerHTML = (M.partEmpty ? T('<b>这个出发点没有这一部分</b>，仍用 |x₀⟩。', '<b>This start has no such part</b>; |x₀⟩ is used instead.') + ' ' : '')
    + T(`|x₀⟩ 的暗分量权重为 ${f3(locDark)}，亮分量 ${f3(1 - locDark)}。`, `|x₀⟩ has dark weight ${f3(locDark)} and bright weight ${f3(1 - locDark)}.`);
  const sp = M.specials.find(([t]) => Math.abs(t - S.tau) < 1e-9);
  $('tauNote').innerHTML = sp ? T(`<b>特殊间隔</b>：有两个本征相位在这里重合，暗空间比一般间隔大。`, `<b>A special interval</b>: two eigenphases coincide here, and the dark space is larger than at generic intervals.`)
    : T(`一般间隔：P<sub>det</sub> 在这附近不随 τ 变化。下面 ✦ 是这张图上 τ ≤ 5 的特殊间隔，点一下直接跳过去。`, `A generic interval: P<sub>det</sub> does not change with τ nearby. The ✦ buttons below are this graph’s special intervals with τ ≤ 5; click one to jump there.`);
  const chips = M.specials.map(([t]) => `<button class="chip${Math.abs(t - S.tau) < 1e-9 ? ' on' : ''}" data-tau="${t.toFixed(12)}" aria-pressed="${Math.abs(t - S.tau) < 1e-9}">✦ ${t.toFixed(3)}</button>`).join('');
  if ($('specialChips').dataset.key !== chips) { $('specialChips').dataset.key = chips; $('specialChips').innerHTML = chips; }
  const fate = M.fate === 'click' ? T(`第 ${M.nStar} 轮`, `round ${M.nStar}`) : M.fate === 'dark' ? T('暗分支', 'dark branch') : T('窗口外', 'beyond window');
  $('runAside').textContent = fate;
  $('tapeNote').innerHTML = M.fate === 'click' ? T(`<b style="color:var(--cyan)">青</b> = 检查后没响，<b style="color:var(--magenta)">品红</b> = 第 ${M.nStar} 轮首次点击，协议停止。`, `<b style="color:var(--cyan)">Cyan</b> = checked, no click; <b style="color:var(--magenta)">magenta</b> = first click at round ${M.nStar}, and the protocol stops.`)
    : M.fate === 'dark' ? T('这一次运行落进了暗分支（抽到的数大于 P<sub>det</sub>）：每一轮都没响，以后也不会响。', 'This run fell into the dark branch (its draw exceeds P<sub>det</sub>): no round clicked, and none ever will.')
      : T('这一次运行在窗口内还没点击，但不在暗分支里：再等下去终会点击。', 'This run has not clicked within the window but is not in the dark branch: it will click if you wait longer.');
  $('ledgerNote').innerHTML = T(`本页协议的同一笔账：前 ${n} 轮首次点击概率之和 ${det.toFixed(9)} 加上存活 ${surv.toFixed(9)} = ${(det + surv).toFixed(12)}（模型计算）。`, `The same bookkeeping for this page’s protocol: the first-click probabilities of the first ${n} rounds, ${det.toFixed(9)}, plus the survival ${surv.toFixed(9)}, = ${(det + surv).toFixed(12)} (model calculation).`);
  $('presetNote').textContent = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义参数。', 'Custom settings.');
  $('pillRound').innerHTML = `ROUND <strong>${n}/${M.R}</strong>`;
  $('pillDet').innerHTML = `P<sub>det</sub> <strong>${f3(M.pDet)}</strong>`;
  $('pillDark').innerHTML = `DARK <strong>${f3(M.pDark)}</strong>`;
  $('pillRun').innerHTML = `RUN <strong>${M.hash}</strong>`;
  $('clock').innerHTML = `${n} <small>/ ${M.R}</small>`;
  $('hudBig').textContent = T(`第 ${n} 轮 · t = ${(r * S.tau).toFixed(2)}/γ`, `round ${n} · t = ${(r * S.tau).toFixed(2)}/γ`);
  $('hudSub').textContent = T('实柱：尚未被探到的概率（颜色 = 相位）· 品红框：暗分量，永不被探到', 'bars: probability not yet detected (colour = phase) · magenta frames: the dark part, never detected');
  // tell the story once, when this run's first click is passed (or the window ends in the dark branch)
  if (!toasted && S.playing && M.fate === 'click' && n >= M.nStar) { toasted = true; toast(T(`<b>点击</b>：这一次运行在第 ${M.nStar} 轮被探到。`, `<b>Click</b>: this run is detected at round ${M.nStar}.`)); }
  if (!toasted && S.playing && M.fate === 'dark' && n >= M.R) { toasted = true; toast(T('<b>没有点击</b>：这一次运行落进了暗分支，探测器永远等不到它。', '<b>No click</b>: this run fell into the dark branch; the detector will wait forever.')); }
}
let railKey = '';
function syncRail() {
  const key = `${MODEL.R}`; if (key === railKey) return; railKey = key;
  const R = MODEL.R; $('marks').innerHTML = [[0, 'first'], [R / 2, ''], [R, 'last']].map(([v, c]) => `<i class="${c}" style="left:${(v / R * 100).toFixed(2)}%">${Math.round(v)}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
$('sites').addEventListener('input', () => { S.N = parseInt($('sites').value, 10); S.x0 = Math.min(S.x0, S.N - 1); $('start').value = S.x0; custom(); });
$('start').addEventListener('input', () => { S.x0 = Math.min(S.N - 1, parseInt($('start').value, 10)); custom(); });
$('tau').addEventListener('input', () => {
  let t = parseFloat($('tau').value);
  const sp = MODEL && MODEL.specials.find(([s]) => Math.abs(s - t) < SNAP);   // snap onto a nearby special interval
  if (sp) t = sp[0];
  S.tau = t; custom();
});
$('specialChips').addEventListener('click', (ev) => { const b = ev.target.closest('.chip'); if (!b) return; const t = parseFloat(b.dataset.tau); if (isFinite(t)) { S.tau = t; $('tau').value = t; custom(); } });
document.querySelectorAll('#graphChips .chip').forEach((b) => b.addEventListener('click', () => { const g = ['ring', 'end', 'mid'].includes(b.dataset.graph) ? b.dataset.graph : 'ring'; if (S.graph !== g) { S.graph = g; custom(); } }));
document.querySelectorAll('#partChips .chip').forEach((b) => b.addEventListener('click', () => { const p = ['all', 'dark', 'bright'].includes(b.dataset.part) ? b.dataset.part : 'all'; if (S.part !== p) { S.part = p; custom(); } }));
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  Object.assign(S, { graph: p.graph, N: p.N, x0: p.x0, part: p.part, tau: p.tau });
  $('sites').value = S.N; $('start').max = String(S.N - 1); $('start').value = S.x0; $('tau').value = S.tau;
  S.preset = name; markPreset(); dirty = true;
  if (!reduceMotion) { S.nowFrac = 0; S.dir = 1; S.playing = true; setPlayUI(); }
  TRV.glitch($('app'));
}
document.querySelectorAll('.preset').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
function newRun() { S.run++; reseed(); dirty = true; }

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
    const k = roundsDone() + (ev.key === 'ArrowRight' ? 1 : -1);
    S.nowFrac = Math.min(1, Math.max(0, k / MODEL.R)); $('now').value = S.nowFrac;
  }
  else if (ev.key === 'c' || ev.key === 'C') { S.classical = !S.classical; }
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
    if (S.hold > 0) { S.hold -= dtSec; if (S.hold <= 0) { S.nowFrac = S.dir > 0 ? 0 : 1; toasted = false; } }
    else {
      const rps = Math.max(3, MODEL.R / RUN_SECONDS);                       // rounds per second
      S.nowFrac += S.dir * dtSec * S.speed * rps / MODEL.R;
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 1.6; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.6; }
    }
    $('now').value = S.nowFrac;
  }
  if (rNow() !== syncedR) syncOutputs();
  syncRail();
  if (glOK) { updateCamera(dtSec); updateGL(tAcc); renderer.render(scene3, camera); updateTags(); }
  drawTimeline(); drawScan(); drawTape();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { labelStaticTags(); $('specialChips').dataset.key = ''; syncOutputs(); });

/* read-only probe for automated browser tests */
window.DARK_DEBUG = {
  pending: () => dirty || rNow() !== syncedR,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, n = roundsDone();
    return { N: M.N, d: M.d, R: M.R, pDet: M.pDet, pDark: M.pDark, darkDim: M.darkDim, brightGroups: M.brightGroups, groups: M.groups.length, psi0: M.psi0.slice(),
      F: M.F.slice(), S: M.S.slice(), meanRound: M.meanRound, returnCase: M.returnCase, classical: { F: M.classical.F.slice(), S: M.classical.S.slice(), cum: M.classical.cum },
      specials: M.specials.map((x) => x.slice()), scan: M.scan.map((x) => x.slice()), nStar: M.nStar, fate: M.fate, hash: M.hash, round: n, partEmpty: M.partEmpty, energies: M.spec.vals.slice() };
  },
  stateAt: (r) => { const s = stateAt(r); return { re: Array.from(s.re), im: Array.from(s.im) }; },
  ghostAt: (r) => { const s = ghostAt(r); return { re: Array.from(s.re), im: Array.from(s.im) }; },
  project: (i) => { if (!glOK) return null; const q = proj(sitePos(i)); return { x: q.x, y: q.y }; },
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('half'); S.playing = false; setPlayUI(); S.nowFrac = 0.18; $('now').value = S.nowFrac; cam.tTheta = 0.45; cam.tPhi = 0.92; cam.tR = 8.6; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('half');
S.nowFrac = 0.12; S.playing = !reduceMotion; $('now').value = S.nowFrac;
setPlayUI();
requestAnimationFrame(frame);
})();
