/* CHRONO//SLIT · 双缝时空体
   Static history of a double-slit / eraser run, rendered as an x–z–τ block.
   The path record is read by an N-outcome instrument (N = 2…8); every outcome defines one conditional spacetime,
   and the conditional spacetimes always add up to the same unsorted whole Σ.
   Theory: trureturing docs/develop/theory/RECURSIVE_RELATIONAL_OBSERVATION_WAVE_PARTICLE_EVENTS.md (§3, §4, §5, §8, §24).
   Model: paraxial Gaussian slits, longitudinal envelope, two-dimensional record space (schematic, see the drawer text).
   Depends on: assets/vendor/three.r128.min.js (window.THREE), assets/shell.js (window.TRV). */
(() => {
'use strict';

/* =====================================================================
   1. Model constants
   ===================================================================== */
const Z_SRC = -1.25, Z_SLIT = -0.45, Z_SCR = 1.25;
const TF = 1.0;                                 // flight time source -> screen
const VEL = (Z_SCR - Z_SRC) / TF;
const TS = (Z_SLIT - Z_SRC) / VEL;              // slit crossing time (the record is created here)
const T_RUN = 3.5, T_LAB = 10.0;
const H = 3.0;                                  // scene height of the clock axis
const RAIL_X = 1.34;                            // eraser station position
const N_RUNS = 480;
const KMAX = 8;                                 // largest number of record outcomes offered
const OPT = { k: 118, w0: 0.05, d: 0.5 };
const ZR = OPT.k * OPT.w0 * OPT.w0 / 2;
const NX = 241, NZ = 110;
const XS = new Float32Array(NX);
for (let i = 0; i < NX; i++) XS[i] = -1 + 2 * i / (NX - 1);
const DXG = 2 / (NX - 1);
const SLIT_HALF = 0.075;
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { mulberry32, gauss, smooth, fitCanvas, L } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, sigma: SG, ok: OK, warn: WARN } = TRV.palette;

/* =====================================================================
   2. State
   ===================================================================== */
const S = {
  kappa: 0, phi: 0, beta: Math.PI / 4, chi: 0, TR: 2.6, nOut: 2,
  frame: 0, warpType: 0, warpFrom: 0, warpMix: 1, warpK: 0.6,
  mode: 0, focus: 0, split: 0,
  nowFrac: 0.62, playing: !reduceMotion, dir: 1, speed: 1, hold: 0,
  sel: -1, hoverX: null, preset: 'delayed'
};
const PRESETS = {
  young:    { kappa: 1.0, phi: 0, beta: 45, chi: 0,  TR: 1.6, n: 2,
    zh: '没有路径记录（|κ|=1）。条纹直接出现在总体里；记录读数与落点无关，两个分支给出同一幅条纹。',
    en: 'No path record (|κ| = 1). Fringes appear in the unsorted whole; the record reading is independent of where the particle lands, so both branches show the same fringes.' },
  whichway: { kappa: 0.0, phi: 0, beta: 0,  chi: 0,  TR: 0.7, n: 2,
    zh: '记录完全区分两缝（|κ|=0），按路径基读取。总体没有条纹；分支 A、B 各是一个单缝包络。',
    en: 'The record fully distinguishes the slits (|κ| = 0) and is read in the path basis. The whole shows no fringes; branches A and B are single-slit envelopes.' },
  eraser:   { kappa: 0.0, phi: 0, beta: 45, chi: 0,  TR: 0.7, n: 2,
    zh: '记录可区分，但在落点之前按擦除基读取。总体仍无条纹；按读数分拣后，A 是条纹，B 是反条纹。',
    en: 'The record distinguishes the slits but is read in the eraser basis before the particles land. The whole still has no fringes; sorted by the reading, A shows fringes and B anti-fringes.' },
  delayed:  { kappa: 0.0, phi: 0, beta: 45, chi: 0,  TR: 2.6, n: 2,
    zh: '同一擦除，记录在落点之后很久才读。落点早已固定，后来的读数只决定每个落点属于哪个子系综。',
    en: 'The same eraser, but the record is read long after the particles land. Every hit is already fixed; the later reading only decides which sub-ensemble each hit belongs to.' },
  partial:  { kappa: 0.6, phi: 0, beta: 0,  chi: 0,  TR: 1.8, n: 2,
    zh: '|κ|=0.6：总体可见度 V=0.6，可分辨度 D=0.8，正好落在 D²+V²=1 的圆上。按路径基读取。',
    en: '|κ| = 0.6: overall visibility V = 0.6 and distinguishability D = 0.8, a point on the circle D² + V² = 1. Read in the path basis.' },
  quarter:  { kappa: 0.0, phi: 0, beta: 45, chi: 90, TR: 2.2, n: 2,
    zh: '擦除基带 90° 相位（χ=90°）。两个分支的条纹各平移四分之一周期，总体仍然无条纹。',
    en: 'The eraser basis carries a 90° phase (χ = 90°). Each branch’s fringes shift by a quarter period; the whole still has no fringes.' },
  trine:    { kappa: 0.0, phi: 0, beta: 45, chi: 0,  TR: 2.6, n: 3,
    zh: '同一份记录改用三结果仪器读取：三个条件时空，条纹依次错开 120°，三者相加仍是无条纹的总体。',
    en: 'The same record read by a three-outcome instrument: three conditional spacetimes with fringes offset by 120°, adding up to the fringe-free whole.' },
  octet:    { kappa: 0.0, phi: 0, beta: 45, chi: 0,  TR: 2.6, n: 8,
    zh: '八结果仪器：八个条件时空，条纹每个错开 45°。分支越多，每个分支越稀，但每个分支内部的条纹仍然完整。',
    en: 'An eight-outcome instrument: eight conditional spacetimes, fringes offset by 45° each. More branches make each one sparser, but the fringes inside every branch stay complete.' }
};

/* =====================================================================
   3. Optics: paraxial Gaussian slits, two-dimensional record space, N-outcome record instrument
   ===================================================================== */
const uLr = new Float32Array(NZ * NX), uLi = new Float32Array(NZ * NX);
const uRr = new Float32Array(NZ * NX), uRi = new Float32Array(NZ * NX);
function beam(x, xj, dz) {
  const D2 = dz * dz + ZR * ZR;
  const q = (x - xj) * (x - xj);
  const mag = Math.sqrt(ZR / Math.sqrt(D2)) * Math.exp(-OPT.k * ZR * q / (2 * D2));
  const ph = OPT.k * dz * q / (2 * D2) - 0.5 * Math.atan2(dz, ZR);
  return [mag * Math.cos(ph), mag * Math.sin(ph)];
}
for (let r = 0; r < NZ; r++) {
  const dz = (Z_SCR - Z_SLIT) * r / (NZ - 1);
  for (let i = 0; i < NX; i++) {
    const idx = r * NX + i;
    const L = beam(XS[i], -OPT.d / 2, dz), R = beam(XS[i], OPT.d / 2, dz);
    uLr[idx] = L[0]; uLi[idx] = L[1]; uRr[idx] = R[0]; uRi[idx] = R[1];
  }
}
const pS = new Float32Array(NZ * NX), cdfS = new Float32Array(NZ * NX);
const pB = [], cdfB = [];
for (let k = 0; k < KMAX; k++) { pB.push(new Float32Array(NZ * NX)); cdfB.push(new Float32Array(NZ * NX)); }
// alpha[k] = <m_k|d_L>, gamma[k] = <m_k|d_R>, theta[k] = fringe offset of outcome k (phase instrument only)
const coef = { alpha: [], gamma: [], theta: [] };
const stats = { P: new Float32Array(KMAX), V: new Float32Array(KMAX), rowMass: 1, scrMax: 1 };
let densityVersion = 0;
const K = () => S.nOut;
const sub = (n) => String(n).split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c]).join('');
function outcomeName(k) { return K() === 2 ? (k === 0 ? 'e₊' : 'e₋') : 'e' + sub(k); }
function branchName(k) { return String.fromCharCode(65 + k); }

/* Measurement vectors m_k with Σ_k |m_k><m_k| = I on the record space.
   N = 2: projective basis e± = (cosβ, e^{iχ} sinβ), (sinβ, −e^{iχ} cosβ).
   N ≥ 3: phase-covariant instrument m_k = (1, e^{i(χ+2πk/N)}) / √N. */
function measurementVectors() {
  const out = [];
  if (K() === 2) {
    const cb = Math.cos(S.beta), sb = Math.sin(S.beta), cx = Math.cos(S.chi), sx = Math.sin(S.chi);
    out.push([cb, 0, cx * sb, sx * sb]);
    out.push([sb, 0, -cx * cb, -sx * cb]);
    coef.theta = [NaN, NaN];
  } else {
    const n = K(), a = 1 / Math.sqrt(n);
    coef.theta = [];
    for (let k = 0; k < n; k++) {
      const th = S.chi + 2 * Math.PI * k / n;
      out.push([a, 0, a * Math.cos(th), a * Math.sin(th)]);
      coef.theta.push(th);
    }
  }
  return out;
}

function computeDensities() {
  const kap = S.kappa, s = Math.sqrt(Math.max(0, 1 - kap * kap));
  const ms = measurementVectors(), n = ms.length;
  // d_L = (1, 0), d_R = (κ, s);  <m|d> = conj(m0)·d0 + conj(m1)·d1
  coef.alpha = ms.map((m) => [m[0], -m[1]]);
  coef.gamma = ms.map((m) => [m[0] * kap + m[2] * s, -m[1] * kap - m[3] * s]);
  const pc = Math.cos(S.phi), ps = Math.sin(S.phi);
  // The unsorted whole ||Ψ(x)||² = ½(|u_L|² + |u_R|²) + κ·Re(ū_L e^{iφ} u_R) does not involve the instrument,
  // so it is computed on its own: changing β, χ or N then cannot move a single hit, not even by rounding.
  for (let idx = 0; idx < NZ * NX; idx++) {
    const Lr = uLr[idx], Li = uLi[idx];
    const Rr = uRr[idx] * pc - uRi[idx] * ps, Ri = uRr[idx] * ps + uRi[idx] * pc;
    pS[idx] = 0.5 * (Lr * Lr + Li * Li + Rr * Rr + Ri * Ri) + kap * (Lr * Rr + Li * Ri);
  }
  for (let k = 0; k < n; k++) {
    const [a0, a1] = coef.alpha[k], [g0, g1] = coef.gamma[k], p = pB[k];
    for (let idx = 0; idx < NZ * NX; idx++) {
      const Lr = uLr[idx], Li = uLi[idx];
      const Rr = uRr[idx] * pc - uRi[idx] * ps, Ri = uRr[idx] * ps + uRi[idx] * pc;
      const Ar = a0 * Lr - a1 * Li + g0 * Rr - g1 * Ri;
      const Ai = a0 * Li + a1 * Lr + g0 * Ri + g1 * Rr;
      p[idx] = 0.5 * (Ar * Ar + Ai * Ai);
    }
  }
  const cum = (src, dst) => {
    for (let r = 0; r < NZ; r++) { let a = 0; for (let i = 0; i < NX; i++) { a += src[r * NX + i]; dst[r * NX + i] = a; } }
  };
  cum(pS, cdfS);
  for (let k = 0; k < n; k++) cum(pB[k], cdfB[k]);
  const last = (NZ - 1) * NX;
  let sS = 0, mx = 0, sB = 0;
  for (let i = 0; i < NX; i++) { sS += pS[last + i]; mx = Math.max(mx, pS[last + i]); for (let k = 0; k < n; k++) sB += pB[k][last + i]; }
  for (let k = 0; k < KMAX; k++) {
    if (k >= n) { stats.P[k] = 0; stats.V[k] = 0; continue; }
    let sk = 0; for (let i = 0; i < NX; i++) sk += pB[k][last + i];
    stats.P[k] = sB > 0 ? sk / sB : 1 / n;
    const A = Math.hypot(...coef.alpha[k]), G = Math.hypot(...coef.gamma[k]), den = A * A + G * G;
    stats.V[k] = den > 1e-12 ? 2 * A * G / den : 0;
  }
  stats.rowMass = sS * DXG; stats.scrMax = mx;
  densityVersion++;
}

function sampleRow(cdf, r, u) {
  const base = r * NX, total = cdf[base + NX - 1];
  if (!(total > 0)) return 0;
  const target = u * total;
  let lo = 0, hi = NX - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[base + mid] < target) lo = mid + 1; else hi = mid; }
  const prev = lo > 0 ? cdf[base + lo - 1] : 0, cur = cdf[base + lo];
  const f = cur > prev ? (target - prev) / (cur - prev) : 0.5;
  return XS[lo] - DXG * 0.5 + DXG * f;
}
function interpRow(arr, r, x) {
  const f = (x + 1) / DXG, i = Math.max(0, Math.min(NX - 2, Math.floor(f))), t = Math.min(1, Math.max(0, f - i));
  return arr[r * NX + i] * (1 - t) + arr[r * NX + i + 1] * t;
}
function interpC(arrR, arrI, r, x) { return [interpRow(arrR, r, x), interpRow(arrI, r, x)]; }

/* branch colours, ordered so the first N are as far apart as possible; amber stays reserved for NOW and selection */
const BRANCH_PALETTE = [
  [0.10, 0.94, 1.0], [1.0, 0.18, 0.82], [0.62, 1.0, 0.31], [0.60, 0.42, 1.0],
  [1.0, 0.45, 0.24], [0.24, 0.61, 1.0], [1.0, 0.36, 0.54], [0.24, 1.0, 0.78]
];
function branchRGB(k) { return BRANCH_PALETTE[k % BRANCH_PALETTE.length]; }
const cssOf = (c) => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
let BR = [], BCSS = [];
function refreshBranchColors() { BR = []; BCSS = []; for (let k = 0; k < K(); k++) { BR.push(branchRGB(k)); BCSS.push(cssOf(BR[k])); } }

/* =====================================================================
   4. Random archive (fixed seeds: one archive per preparation)
   ===================================================================== */
const seedRng = mulberry32(0xC4A05);
const U1 = new Float32Array(N_RUNS), U2 = new Float32Array(N_RUNS), JIT = new Float32Array(N_RUNS), JIT2 = new Float32Array(N_RUNS), RING = new Float32Array(N_RUNS), LAB = new Float32Array(N_RUNS);
for (let i = 0; i < N_RUNS; i++) {
  U1[i] = seedRng(); U2[i] = seedRng(); JIT[i] = seedRng() - 0.5; JIT2[i] = seedRng() - 0.5; RING[i] = seedRng() * Math.PI * 2;
  LAB[i] = (i + 0.5 + (seedRng() - 0.5) * 0.8) / N_RUNS * (T_LAB - 0.2);
}
const EX = new Float32Array(N_RUNS), EK = new Uint8Array(N_RUNS), EPK = new Float32Array(N_RUNS);
const ALL_RUNS = Array.from({ length: N_RUNS }, (_, i) => i);
let centerOpacity = 1;
let byBranch = [];
let archiveHash = '--------';
function resampleEvents() {
  const r = NZ - 1, n = K();
  byBranch = Array.from({ length: n }, () => []);
  for (let i = 0; i < N_RUNS; i++) {
    const x = sampleRow(cdfS, r, U1[i]);
    let ps = 0;
    for (let j = 0; j < n; j++) ps += interpRow(pB[j], r, x);
    let acc = 0, k = n - 1, pk = 1 / n;
    for (let j = 0; j < n; j++) {
      const pj = ps > 1e-12 ? interpRow(pB[j], r, x) / ps : 1 / n;
      acc += pj;
      if (U2[i] < acc || j === n - 1) { k = j; pk = pj; break; }
    }
    EX[i] = x; EK[i] = k; EPK[i] = pk; byBranch[k].push(i);
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < N_RUNS; i++) {
    let v = Math.round(EX[i] * 1e4) | 0;
    for (let b = 0; b < 4; b++) { h ^= v & 255; h = Math.imul(h, 0x01000193) >>> 0; v >>= 8; }
    h ^= EK[i] + 1; h = Math.imul(h, 0x01000193) >>> 0;
  }
  archiveHash = (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

/* =====================================================================
   5. Clock warp (relabelling θ) shared by CPU and GPU
   ===================================================================== */
function warpKOf() { return 0.5 + 7 * S.warpK; }
function foldAOf() { return 0.25 * S.warpK; }
function warpT(s, t) {
  const k = warpKOf();
  if (t === 0) return s;
  if (t === 1) return Math.log(1 + k * s) / Math.log(1 + k);
  if (t === 2) return (Math.exp(k * s) - 1) / (Math.exp(k) - 1);
  return s + foldAOf() * Math.sin(4 * Math.PI * s);
}
function warp(s) { return warpT(s, S.warpFrom) * (1 - S.warpMix) + warpT(s, S.warpType) * S.warpMix; }
function span() { return T_RUN + S.frame * T_LAB; }
function yOf(t) { const s = Math.min(1, Math.max(0, t / span())); return H * (warp(s) - 0.5); }
function nowAbs() { return S.nowFrac * span(); }
function warpInjective() {
  let prev = warpT(0, S.warpType);
  for (let i = 1; i <= 400; i++) { const v = warpT(i / 400, S.warpType); if (v <= prev + 1e-7) return false; prev = v; }
  return true;
}

/* the unfolded 4th axis: branch blocks sit on a ring around the unsorted centre block */
function ringRadius() { return K() === 2 ? 2.85 : Math.max(2.85, 1.85 / Math.sin(Math.PI / K())); }
function ringDir(k) { const a = -Math.PI / 2 + 2 * Math.PI * k / K(); return [Math.sin(a), Math.cos(a)]; }
function branchOffset(k, sorted) { const [sx, sz] = ringDir(k), R = ringRadius() * S.split * sorted; return [sx * R, sz * R]; }

/* =====================================================================
   6. DOM refs
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags');
const cvHist = $('hist'), cvSlice = $('slice'), cvPhasor = $('phasor'), cvGauge = $('gauge'), cvWarp = $('warpPlot');

/* =====================================================================
   7. Three.js scene
   ===================================================================== */
let renderer = null, scene, camera, glOK = false;
const cam = { theta: -0.92, phi: 1.13, r: 6.6, tTheta: -0.92, tPhi: 1.13, tR: 6.6 };
const CAMS = { iso: [-0.92, 1.13, 6.6], side: [0.0, 1.5708, 6.8], top: [0.0, 0.06, 6.4], beam: [-1.5708, 1.5708, 6.8] };
const HERO_M = 14000, INST_P = 200;
let heroSigma, instSigma;
const heroB = [], instB = [];
let clickPts, readPts, lineSeg, selPts, selLine, nowPlane, wallCenter, floorLines, wallGeoGrid, wallGeoEdge;
const wallB = [];
const warpUniforms = () => ({ uWarpFrom: { value: 0 }, uWarpTo: { value: 0 }, uWarpMix: { value: 1 }, uK: { value: 4.7 }, uFold: { value: 0.15 } });

const GLSL_WARP = `
uniform float uWarpFrom, uWarpTo, uWarpMix, uK, uFold;
float warpT(float s, float t){
  if (t < 0.5) return s;
  if (t < 1.5) return log(1.0 + uK*s) / log(1.0 + uK);
  if (t < 2.5) return (exp(uK*s) - 1.0) / (exp(uK) - 1.0);
  return s + uFold*sin(12.566370614*s);
}
float warpS(float s){ return mix(warpT(s, uWarpFrom), warpT(s, uWarpTo), uWarpMix); }
`;
const TUBE_VS = `
attribute float aSeed;
#ifdef INSTANCED
attribute vec3 iOff;
attribute vec2 iW;
#endif
uniform float uNow, uSpan, uH, uMode, uTime, uScale, uZSlit, uW, uDx, uDz, uTOff, uHl;
uniform vec3 uColor, uPre;
varying vec3 vCol; varying float vA;
${GLSL_WARP}
void main(){
#ifdef INSTANCED
  float dx = iOff.x; float dz = iOff.y; float tOff = iOff.z; float w = iW.x; float hl = iW.y;
#else
  float dx = uDx; float dz = uDz; float tOff = uTOff; float w = uW; float hl = uHl;
#endif
  float w2 = max(w, hl);
  float tAbs = tOff + position.y;
  float fut = step(uNow, tAbs);
  float vis = uMode > 0.5 ? mix(1.0, 0.42, fut) : (1.0 - fut);
  float nt = (tAbs - uNow) / (0.010*uSpan + 0.006);
  float near = exp(-nt*nt);
  float a = w2 * vis * (0.55 + 2.4*near);
  if (a < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vCol = vec3(0.0); return; }
  float s = clamp(tAbs / uSpan, 0.0, 1.0);
  vec3 p = vec3(position.x + dx, uH*(warpS(s) - 0.5), position.z + dz);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.78 + 0.22*sin(uTime*2.3 + aSeed*57.0);
  gl_PointSize = uScale * (1.0 + 1.1*near + 1.4*hl) / max(0.1, -mv.z);
  vec3 base = position.z < uZSlit ? uPre : uColor;
  vCol = mix(base, vec3(1.0, 0.78, 0.24), clamp(hl, 0.0, 1.0)*0.75);
  vA = a * tw;
}`;
const TUBE_FS = `
uniform float uAlpha;
varying vec3 vCol; varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float f = exp(-dot(c, c) * 14.0);
  if (f < 0.03) discard;
  gl_FragColor = vec4(vCol, vA * f * uAlpha);
}`;
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
const EVT_FS = `
varying vec3 vCol; varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
  float core = smoothstep(0.42, 0.0, r);
  float halo = exp(-r*r*3.5) * 0.55;
  float a = (core + halo) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(vCol, vec3(1.0), core*0.22), a);
}`;
const SEL_FS = `
varying vec3 vCol; varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
  float ring = smoothstep(0.08, 0.0, abs(r - 0.78)) + smoothstep(0.3, 0.0, r)*0.8;
  float a = ring * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}`;
const PLANE_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PLANE_FS = `
uniform vec3 uCol; uniform float uTime, uOp; varying vec2 vUv;
void main(){
  vec2 g = abs(fract(vUv * vec2(30.0, 16.0)) - 0.5);
  float line = smoothstep(0.46, 0.5, max(g.x, g.y));
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float edge = smoothstep(0.012, 0.0, e);
  float sweep = smoothstep(0.02, 0.0, abs(fract(vUv.x*0.5 - uTime*0.08) - 0.5));
  float a = (0.045 + 0.13*line + 0.9*edge + 0.10*sweep) * uOp;
  gl_FragColor = vec4(uCol, a);
}`;

function tubeMaterial(color, instanced) {
  return new THREE.ShaderMaterial({
    vertexShader: TUBE_VS, fragmentShader: TUBE_FS,
    defines: instanced ? { INSTANCED: 1 } : {},
    uniforms: Object.assign({
      uNow: { value: 0 }, uSpan: { value: T_RUN }, uH: { value: H }, uMode: { value: 0 }, uTime: { value: 0 },
      uScale: { value: 30 }, uZSlit: { value: Z_SLIT }, uW: { value: 0 }, uDx: { value: 0 }, uDz: { value: 0 }, uTOff: { value: 0 }, uHl: { value: 0 },
      uColor: { value: new THREE.Color(color[0], color[1], color[2]) }, uPre: { value: new THREE.Color(COL.pre[0], COL.pre[1], COL.pre[2]) },
      uAlpha: { value: instanced ? 0.34 : 0.46 }
    }, warpUniforms()),
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
  });
}
function makeHero(color) {
  const hp = new Float32Array(HERO_M * 3), hs = new Float32Array(HERO_M);
  for (let j = 0; j < HERO_M; j++) hs[j] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(hp, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(hs, 1));
  const m = new THREE.Points(g, tubeMaterial(color, false));
  m.frustumCulled = false; scene.add(m); return m;
}
function makeInst(color) {
  const ip = new Float32Array(INST_P * 3), is = new Float32Array(INST_P);
  for (let j = 0; j < INST_P; j++) is[j] = Math.random();
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(ip, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(is, 1));
  const off = new THREE.InstancedBufferAttribute(new Float32Array(N_RUNS * 3), 3); off.setUsage(THREE.DynamicDrawUsage);
  const w = new THREE.InstancedBufferAttribute(new Float32Array(N_RUNS * 2), 2); w.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iOff', off); g.setAttribute('iW', w);
  g.instanceCount = 0;
  const m = new THREE.Points(g, tubeMaterial(color, true));
  m.frustumCulled = false; scene.add(m); return m;
}
function makeWall(color) {
  const grid = new THREE.LineSegments(wallGeoGrid, new THREE.LineBasicMaterial({ color: 0x1b6f92, transparent: true, opacity: 0.35, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  const edge = new THREE.LineSegments(wallGeoEdge, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  grid.frustumCulled = false; edge.frustumCulled = false;
  const grp = new THREE.Group(); grp.add(grid); grp.add(edge); scene.add(grp);
  return { grp, grid, edge };
}

function initGL() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) { renderer = null; }
  if (!renderer || !window.THREE) {
    const d = document.createElement('div'); d.className = 'nogl';
    d.textContent = L('这个浏览器没有提供 WebGL，三维时空体无法显示。下方的屏幕档案、切面和读数仍然可用。', 'This browser does not provide WebGL, so the 3D block cannot be shown. The screen archive, slice and readouts below still work.');
    stage.appendChild(d); return;
  }
  glOK = true;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x02040a, 1);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);

  heroSigma = makeHero(COL.sigma); instSigma = makeInst(COL.sigma);
  for (let k = 0; k < KMAX; k++) { heroB.push(makeHero([1, 1, 1])); instB.push(makeInst([1, 1, 1])); }

  const mkEvt = (n, fs) => {
    const g = new THREE.BufferGeometry();
    const at = (name, size) => { const a = new THREE.BufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); };
    at('position', 3); at('aColor', 3); at('aAlpha', 1); at('aSize', 1);
    const m = new THREE.ShaderMaterial({ vertexShader: EVT_VS, fragmentShader: fs, uniforms: { uScale: { value: 60 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); return p;
  };
  clickPts = mkEvt(N_RUNS, EVT_FS);
  readPts = mkEvt(N_RUNS, EVT_FS);
  selPts = mkEvt(2, SEL_FS);

  const lg = new THREE.BufferGeometry();
  const lp = new THREE.BufferAttribute(new Float32Array(N_RUNS * 6 * 3), 3); lp.setUsage(THREE.DynamicDrawUsage);
  const lc = new THREE.BufferAttribute(new Float32Array(N_RUNS * 6 * 3), 3); lc.setUsage(THREE.DynamicDrawUsage);
  lg.setAttribute('position', lp); lg.setAttribute('color', lc);
  lineSeg = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  lineSeg.frustumCulled = false; scene.add(lineSeg);

  const sg = new THREE.BufferGeometry();
  const sp = new THREE.BufferAttribute(new Float32Array(6 * 3), 3); sp.setUsage(THREE.DynamicDrawUsage);
  sg.setAttribute('position', sp);
  selLine = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  selLine.frustumCulled = false; scene.add(selLine);

  const pg = new THREE.PlaneGeometry(1, 1, 1, 1);
  pg.rotateX(-Math.PI / 2);
  nowPlane = new THREE.Mesh(pg, new THREE.ShaderMaterial({
    vertexShader: PLANE_VS, fragmentShader: PLANE_FS,
    uniforms: { uCol: { value: new THREE.Color(1.0, 0.78, 0.24) }, uTime: { value: 0 }, uOp: { value: 1 } },
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  }));
  scene.add(nowPlane);

  wallGeoGrid = new THREE.BufferGeometry();
  wallGeoEdge = new THREE.BufferGeometry();
  wallCenter = makeWall(0x4fd8ff);
  for (let k = 0; k < KMAX; k++) wallB.push(makeWall(0xffffff));

  const fl = [], fc = [];
  for (let i = -24; i <= 24; i++) {
    const v = i * 0.45;
    const a = Math.max(0, 1 - Math.abs(v) / 10.5) * 0.32;
    fl.push(-10.8, -H / 2 - 0.02, v, 10.8, -H / 2 - 0.02, v); fc.push(0, a * 0.55, a * 0.75, 0, a * 0.55, a * 0.75);
    fl.push(v, -H / 2 - 0.02, -10.8, v, -H / 2 - 0.02, 10.8); fc.push(0, a * 0.55, a * 0.75, 0, a * 0.55, a * 0.75);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fl), 3));
  fg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(fc), 3));
  floorLines = new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(floorLines);
}

function sampleTemplates() {
  if (!glOK) return;
  const fill = (out, M, cdf, seed) => {
    const rng = mulberry32(seed);
    for (let j = 0; j < M; j++) {
      const z = Z_SRC + (Z_SCR - Z_SRC) * rng();
      let x;
      if (z < Z_SLIT) {
        const W = 0.10 + 0.52 * (z - Z_SRC) / (Z_SLIT - Z_SRC);
        x = gauss(rng) * W * 0.5;
      } else {
        const r = Math.round((z - Z_SLIT) / (Z_SCR - Z_SLIT) * (NZ - 1));
        x = sampleRow(cdf, r, rng());
      }
      out[3 * j] = x; out[3 * j + 1] = (z - Z_SRC) / VEL + gauss(rng) * 0.010; out[3 * j + 2] = z;
    }
  };
  const load = (mesh, M, cdf, seed) => { fill(mesh.geometry.attributes.position.array, M, cdf, seed); mesh.geometry.attributes.position.needsUpdate = true; };
  load(heroSigma, HERO_M, cdfS, 1001); load(instSigma, INST_P, cdfS, 5003);
  for (let k = 0; k < K(); k++) {
    load(heroB[k], HERO_M, cdfB[k], 1018 + k * 17); load(instB[k], INST_P, cdfB[k], 5032 + k * 29);
    const c = BR[k];
    heroB[k].material.uniforms.uColor.value.setRGB(c[0], c[1], c[2]);
    instB[k].material.uniforms.uColor.value.setRGB(c[0], c[1], c[2]);
    wallB[k].edge.material.color.setRGB(c[0], c[1], c[2]);
  }
}

function buildWalls() {
  if (!glOK) return;
  const grid = [], edge = [];
  const top = H / 2, bot = -H / 2;
  const seg = (arr, a, b) => arr.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  const Sp = span(), step = Sp <= 5 ? 0.5 : 2;
  const ticks = [];
  for (let t = 0; t <= Sp + 1e-6; t += step) ticks.push(yOf(t));
  const slitGaps = [[-OPT.d / 2 - SLIT_HALF, -OPT.d / 2 + SLIT_HALF], [OPT.d / 2 - SLIT_HALF, OPT.d / 2 + SLIT_HALF]];
  const inGap = (x) => slitGaps.some(([a, b]) => x > a && x < b);
  for (let x = -1; x <= 1.0001; x += 0.1) if (!inGap(x)) seg(grid, [x, bot, Z_SLIT], [x, top, Z_SLIT]);
  for (const y of ticks) {
    seg(grid, [-1, y, Z_SLIT], [slitGaps[0][0], y, Z_SLIT]);
    seg(grid, [slitGaps[0][1], y, Z_SLIT], [slitGaps[1][0], y, Z_SLIT]);
    seg(grid, [slitGaps[1][1], y, Z_SLIT], [1, y, Z_SLIT]);
    seg(grid, [-1, y, Z_SCR], [1, y, Z_SCR]);
  }
  for (let x = -1; x <= 1.0001; x += 0.25) seg(grid, [x, bot, Z_SCR], [x, top, Z_SCR]);
  for (const [a, b] of slitGaps) { seg(edge, [a, bot, Z_SLIT], [a, top, Z_SLIT]); seg(edge, [b, bot, Z_SLIT], [b, top, Z_SLIT]); }
  seg(edge, [-1, bot, Z_SCR], [1, bot, Z_SCR]); seg(edge, [-1, top, Z_SCR], [1, top, Z_SCR]);
  seg(edge, [-1, bot, Z_SCR], [-1, top, Z_SCR]); seg(edge, [1, bot, Z_SCR], [1, top, Z_SCR]);
  seg(edge, [0, bot, Z_SRC], [0, top, Z_SRC]);
  for (const y of ticks) seg(edge, [-0.05, y, Z_SRC], [0.05, y, Z_SRC]);
  seg(edge, [RAIL_X, bot, Z_SLIT], [RAIL_X, top, Z_SLIT]);
  seg(edge, [RAIL_X - 0.06, bot, Z_SLIT], [RAIL_X + 0.06, bot, Z_SLIT]);
  seg(edge, [RAIL_X - 0.06, top, Z_SLIT], [RAIL_X + 0.06, top, Z_SLIT]);
  for (const y of [bot, top]) {
    seg(grid, [-1, y, Z_SRC], [1, y, Z_SRC]); seg(grid, [-1, y, Z_SRC], [-1, y, Z_SCR]); seg(grid, [1, y, Z_SRC], [1, y, Z_SCR]);
  }
  seg(grid, [-1, bot, Z_SRC], [-1, top, Z_SRC]); seg(grid, [1, bot, Z_SRC], [1, top, Z_SRC]);
  wallGeoGrid.setAttribute('position', new THREE.BufferAttribute(new Float32Array(grid), 3));
  wallGeoEdge.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edge), 3));
}

/* =====================================================================
   8. Per-frame dynamic state
   ===================================================================== */
const RUN = { sorted: new Float32Array(N_RUNS), hit: new Float32Array(N_RUNS), read: new Float32Array(N_RUNS), focusA: new Float32Array(N_RUNS), off: new Float32Array(N_RUNS), dx: new Float32Array(N_RUNS), dz: new Float32Array(N_RUNS), clickP: new Float32Array(N_RUNS * 3), readP: new Float32Array(N_RUNS * 3) };
const focusBranch = () => S.focus - 1;           // -1 means Σ

function runDynamics() {
  const now = nowAbs(), c = S.frame, block = S.mode === 1, fb = focusBranch();
  for (let i = 0; i < N_RUNS; i++) {
    const off = c * LAB[i];
    const tHit = off + TF, tRead = off + S.TR;
    const sorted = block ? 1 : smooth((now - tRead) / 0.05 + 0.5);
    const hit = block ? 1 : smooth((now - tHit) / 0.04 + 0.5);
    const read = block ? 1 : smooth((now - tRead) / 0.04 + 0.5);
    const k = EK[i];
    const fa = fb < 0 ? 1 : sorted * (k === fb ? 1 : 0) + (1 - sorted) * 0.28;
    const [dx, dz] = branchOffset(k, sorted);
    RUN.off[i] = off; RUN.sorted[i] = sorted; RUN.hit[i] = hit; RUN.read[i] = read; RUN.focusA[i] = fa; RUN.dx[i] = dx; RUN.dz[i] = dz;
    RUN.clickP[3 * i] = EX[i] + dx; RUN.clickP[3 * i + 1] = yOf(tHit) + (1 - c) * JIT[i] * 0.12; RUN.clickP[3 * i + 2] = Z_SCR + dz;
    RUN.readP[3 * i] = RAIL_X + dx + Math.cos(RING[i]) * 0.045 * (1 - c * 0.6);
    RUN.readP[3 * i + 1] = yOf(tRead) + (1 - c) * JIT2[i] * 0.07;
    RUN.readP[3 * i + 2] = Z_SLIT + dz + Math.sin(RING[i]) * 0.045 * (1 - c * 0.6);
  }
}

function updateGL(time) {
  const now = nowAbs(), Sp = span(), c = S.frame, block = S.mode === 1, n = K(), fb = focusBranch();
  const setCommon = (u) => {
    u.uNow.value = now; u.uSpan.value = Sp; u.uMode.value = S.mode; u.uTime.value = time;
    u.uWarpFrom.value = S.warpFrom; u.uWarpTo.value = S.warpType; u.uWarpMix.value = S.warpMix; u.uK.value = warpKOf(); u.uFold.value = foldAOf();
    u.uScale.value = 32 * renderer.getPixelRatio();
  };
  // hero tube (run-clock frame), weight (1 - c)
  const sH = block ? 1 : smooth((now - S.TR) / 0.05 + 0.5);
  const hw = 1 - c;
  {
    const u = heroSigma.material.uniforms; setCommon(u);
    u.uW.value = (1 - sH) * (fb < 0 ? 1 : 0.28) * hw; u.uDx.value = 0; u.uDz.value = 0; u.uTOff.value = 0; u.uHl.value = 0;
    heroSigma.visible = u.uW.value > 0.002;
  }
  for (let k = 0; k < KMAX; k++) {
    const m = heroB[k], u = m.material.uniforms;
    if (k >= n) { m.visible = false; continue; }
    setCommon(u);
    const wk = fb < 0 ? stats.P[k] : (fb === k ? 1 : 0);
    const [dx, dz] = branchOffset(k, sH);
    u.uW.value = sH * wk * hw; u.uDx.value = dx; u.uDz.value = dz; u.uTOff.value = 0; u.uHl.value = 0;
    m.visible = u.uW.value > 0.002;
  }
  // instanced tubes (lab-clock frame), weight c; Σ over every run, branch k over the runs that read outcome k
  const fillInst = (mesh, list, weightOf, hlOf) => {
    const off = mesh.geometry.attributes.iOff, w = mesh.geometry.attributes.iW;
    for (let j = 0; j < list.length; j++) {
      const i = list[j];
      off.array[3 * j] = RUN.dx[i]; off.array[3 * j + 1] = RUN.dz[i]; off.array[3 * j + 2] = RUN.off[i];
      w.array[2 * j] = weightOf(i); w.array[2 * j + 1] = i === S.sel ? hlOf(i) : 0;
    }
    mesh.geometry.instanceCount = list.length;
    off.needsUpdate = true; w.needsUpdate = true;
    setCommon(mesh.material.uniforms);
  };
  const showInst = c > 0.002 || S.sel >= 0;
  instSigma.visible = showInst;
  if (showInst) fillInst(instSigma, ALL_RUNS, (i) => (1 - RUN.sorted[i]) * RUN.focusA[i] * c, (i) => RUN.sorted[i] < 0.5 ? 0.9 : 0);
  for (let k = 0; k < KMAX; k++) {
    const m = instB[k];
    m.visible = showInst && k < n;
    if (m.visible) fillInst(m, byBranch[k], (i) => RUN.sorted[i] * RUN.focusA[i] * c, (i) => RUN.sorted[i] >= 0.5 ? 0.9 : 0);
  }
  // events
  const cp = clickPts.geometry.attributes, rp = readPts.geometry.attributes;
  const scale = 58 * renderer.getPixelRatio();
  clickPts.material.uniforms.uScale.value = scale; readPts.material.uniforms.uScale.value = scale; selPts.material.uniforms.uScale.value = scale * 1.6;
  const lp = lineSeg.geometry.attributes.position.array, lc = lineSeg.geometry.attributes.color.array;
  for (let i = 0; i < N_RUNS; i++) {
    const s = RUN.sorted[i], fa = RUN.focusA[i], bc = BR[EK[i]];
    const col = [COL.gray[0] * (1 - s) + bc[0] * s, COL.gray[1] * (1 - s) + bc[1] * s, COL.gray[2] * (1 - s) + bc[2] * s];
    const tHit = RUN.off[i] + TF, tRead = RUN.off[i] + S.TR;
    const futDim = block ? (tHit > now ? 0.5 : 1) : 1;
    const futDimR = block ? (tRead > now ? 0.5 : 1) : 1;
    for (let q = 0; q < 3; q++) {
      cp.position.array[3 * i + q] = RUN.clickP[3 * i + q];
      rp.position.array[3 * i + q] = RUN.readP[3 * i + q];
      cp.aColor.array[3 * i + q] = col[q];
      rp.aColor.array[3 * i + q] = col[q];
    }
    cp.aAlpha.array[i] = RUN.hit[i] * fa * futDim * 0.95;
    cp.aSize.array[i] = 0.55 + 0.15 * s;
    rp.aAlpha.array[i] = RUN.read[i] * fa * futDimR * 0.8;
    rp.aSize.array[i] = 0.45;
    // record worldline (slit -> eraser rail -> read) and correlation link (read <-> click)
    const tSlit = RUN.off[i] + TS;
    const tTop = block ? tRead : Math.min(now, tRead);
    const alive = block ? 1 : smooth((now - tSlit) / 0.04 + 0.5);
    const dx = RUN.dx[i], dz = RUN.dz[i];
    const ys = yOf(tSlit), yt = yOf(Math.max(tSlit, tTop));
    const base = 18 * i;
    const put = (o, x, y, z) => { lp[base + o] = x; lp[base + o + 1] = y; lp[base + o + 2] = z; };
    put(0, dx, ys, Z_SLIT + dz); put(3, RAIL_X + dx, ys, Z_SLIT + dz);
    put(6, RAIL_X + dx, ys, Z_SLIT + dz); put(9, RAIL_X + dx, yt, Z_SLIT + dz);
    put(12, RUN.readP[3 * i], RUN.readP[3 * i + 1], RUN.readP[3 * i + 2]);
    put(15, RUN.clickP[3 * i], RUN.clickP[3 * i + 1], RUN.clickP[3 * i + 2]);
    const aW = alive * fa * (0.06 * c + (1 - c) * 0.6 / N_RUNS);
    const aL = Math.min(RUN.hit[i], RUN.read[i]) * fa * (0.09 * c + 0.03 * (1 - c)) * (i % 3 === 0 ? 1 : 0.25);
    const setc = (o, a, cc) => { lc[base + o] = cc[0] * a; lc[base + o + 1] = cc[1] * a; lc[base + o + 2] = cc[2] * a; };
    setc(0, aW, COL.pre); setc(3, aW, COL.pre); setc(6, aW, COL.pre); setc(9, aW, col);
    setc(12, aL, col); setc(15, aL, col);
  }
  cp.position.needsUpdate = cp.aColor.needsUpdate = cp.aAlpha.needsUpdate = cp.aSize.needsUpdate = true;
  rp.position.needsUpdate = rp.aColor.needsUpdate = rp.aAlpha.needsUpdate = rp.aSize.needsUpdate = true;
  lineSeg.geometry.attributes.position.needsUpdate = true; lineSeg.geometry.attributes.color.needsUpdate = true;

  // selection
  const sa = selPts.geometry.attributes, sl = selLine.geometry.attributes.position.array;
  if (S.sel >= 0) {
    const i = S.sel, dx = RUN.dx[i], dz = RUN.dz[i];
    for (let q = 0; q < 3; q++) { sa.position.array[q] = RUN.clickP[3 * i + q]; sa.position.array[3 + q] = RUN.readP[3 * i + q]; sa.aColor.array[q] = COL.amber[q]; sa.aColor.array[3 + q] = COL.amber[q]; }
    sa.aAlpha.array[0] = Math.max(0.35, RUN.hit[i]); sa.aAlpha.array[1] = Math.max(0.35, RUN.read[i]);
    sa.aSize.array[0] = 1.0; sa.aSize.array[1] = 1.0;
    for (let q = 0; q < 3; q++) { sl[q] = RUN.clickP[3 * i + q]; sl[3 + q] = RUN.readP[3 * i + q]; }
    const ys = yOf(RUN.off[i] + TS);
    sl[6] = dx; sl[7] = ys; sl[8] = Z_SLIT + dz; sl[9] = RAIL_X + dx; sl[10] = ys; sl[11] = Z_SLIT + dz;
    sl[12] = RAIL_X + dx; sl[13] = ys; sl[14] = Z_SLIT + dz; sl[15] = RAIL_X + dx; sl[16] = RUN.readP[3 * i + 1]; sl[17] = Z_SLIT + dz;
    selLine.visible = true; selPts.visible = true;
  } else { selLine.visible = false; selPts.visible = false; }
  sa.position.needsUpdate = sa.aColor.needsUpdate = sa.aAlpha.needsUpdate = sa.aSize.needsUpdate = true;
  selLine.geometry.attributes.position.needsUpdate = true;

  // NOW plane spans every visible block
  let mx = 0, mz = 0;
  for (let k = 0; k < n; k++) { const [dx, dz] = branchOffset(k, 1); mx = Math.max(mx, Math.abs(dx)); mz = Math.max(mz, Math.abs(dz)); }
  nowPlane.position.set(0.17, yOf(now), (Z_SRC + Z_SCR) / 2);
  nowPlane.scale.set(2.9 + 2 * mx, 1, (Z_SCR - Z_SRC + 0.3) + 2 * mz);
  nowPlane.material.uniforms.uTime.value = time;
  nowPlane.material.uniforms.uOp.value = block ? 0.55 : 1.0;

  // walls per block; the centre block holds the unsorted runs, so it fades as they are sorted away
  let sortedMean = 0; for (let i = 0; i < N_RUNS; i++) sortedMean += RUN.sorted[i]; sortedMean /= N_RUNS;
  centerOpacity = 1 - 0.92 * S.split * sortedMean;
  const centerOp = centerOpacity;
  wallCenter.grid.material.opacity = 0.35 * centerOp; wallCenter.edge.material.opacity = 0.7 * centerOp;
  for (let k = 0; k < KMAX; k++) {
    const w = wallB[k];
    w.grp.visible = k < n && S.split > 0.01;
    if (!w.grp.visible) continue;
    const [dx, dz] = branchOffset(k, 1);
    w.grp.position.set(dx, 0, dz);
    const dimmed = fb >= 0 && fb !== k ? 0.35 : 1;
    w.grid.material.opacity = 0.3 * S.split * dimmed; w.edge.material.opacity = 0.75 * S.split * dimmed;
  }
}

/* =====================================================================
   9. Camera and picking
   ===================================================================== */
function updateCamera(dt) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dt);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const r = cam.r + S.split * ringRadius() * 1.55;
  const sp = Math.sin(cam.phi);
  camera.position.set(r * sp * Math.sin(cam.theta), r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0);
  camera.lookAt(0.12, 0, 0);
}
const drag = { x: 0, y: 0, moved: 0, pts: new Map(), pinch: 0 };
function setCamPreset(name) {
  const p = CAMS[name]; if (!p) return;
  let d = (p[0] - cam.theta) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  cam.tTheta = cam.theta + d; cam.tPhi = p[1]; cam.tR = p[2];
  document.querySelectorAll('#camChips .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cam === name)));
}
function projectToStage(v) {
  const rect = stage.getBoundingClientRect();
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * rect.width, y: (-p.y * 0.5 + 0.5) * rect.height, z: p.z };
}
function pickAt(px, py) {
  if (!glOK) return;
  let best = -1, bd = 16 * 16;
  const v = new THREE.Vector3();
  for (const arr of [RUN.clickP, RUN.readP]) {
    for (let i = 0; i < N_RUNS; i++) {
      const vis = arr === RUN.clickP ? RUN.hit[i] : RUN.read[i];
      if (vis * RUN.focusA[i] < 0.2) continue;
      v.set(arr[3 * i], arr[3 * i + 1], arr[3 * i + 2]);
      const p = projectToStage(v);
      const d = (p.x - px) ** 2 + (p.y - py) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) break;
  }
  selectRun(best);
}
stage.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest('.chip')) return;
  stage.setPointerCapture(ev.pointerId);
  drag.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  drag.x = ev.clientX; drag.y = ev.clientY; drag.moved = 0;
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()]; drag.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
});
stage.addEventListener('pointermove', (ev) => {
  if (!drag.pts.has(ev.pointerId)) return;
  drag.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (drag.pts.size === 2) {
    const [a, b] = [...drag.pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (drag.pinch > 0) cam.tR = Math.min(16, Math.max(3.2, cam.tR * drag.pinch / d));
    drag.pinch = d; drag.moved += 10; return;
  }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
  drag.x = ev.clientX; drag.y = ev.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach(b => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => {
  if (!drag.pts.has(ev.pointerId)) return;
  drag.pts.delete(ev.pointerId);
  if (drag.pts.size === 0) {
    if (drag.moved < 5) { const r = stage.getBoundingClientRect(); pickAt(ev.clientX - r.left, ev.clientY - r.top); }
    drag.pinch = 0;
  }
};
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(16, Math.max(3.2, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   10. Tags (projected labels)
   ===================================================================== */
function mkTag(cls, text) { const el = document.createElement('div'); el.className = 'tag ' + cls; el.textContent = text; tagsBox.appendChild(el); return el; }
const tagSource = mkTag('', ''), tagSlit = mkTag('', ''), tagScreen = mkTag('', ''), tagRail = mkTag('', '');
const tagAxis = mkTag('hot', ''), tagNow = mkTag('hot', 'NOW');
function labelStaticTags() {
  tagSource.textContent = L('SOURCE 源', 'SOURCE'); tagSlit.textContent = L('SLITS 双缝', 'SLITS');
  tagScreen.textContent = L('SCREEN 屏', 'SCREEN'); tagRail.textContent = L('ERASER 记录读取', 'ERASER · RECORD READ');
  tagAxis.textContent = L('t ↑ 钟', 't ↑ clock');
}
labelStaticTags();
const branchTags = []; for (let k = 0; k < KMAX; k++) branchTags.push(mkTag('cy', ''));
const tickTags = []; for (let i = 0; i < 12; i++) tickTags.push(mkTag('tick', ''));
function placeTag(el, x, y, z, show = true) {
  if (!glOK || !show) { el.style.display = 'none'; return; }
  const p = projectToStage(new THREE.Vector3(x, y, z));
  if (p.z > 1 || p.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
}
function updateTags() {
  const top = H / 2 + 0.16, n = K(), centre = centerOpacity > 0.35;
  placeTag(tagSource, 0, top, Z_SRC, centre); placeTag(tagSlit, 0, top, Z_SLIT, centre); placeTag(tagScreen, 0, top, Z_SCR, centre); placeTag(tagRail, RAIL_X, top, Z_SLIT, centre);
  placeTag(tagAxis, -1.12, H / 2 + 0.05, Z_SCR, centre);
  const now = nowAbs();
  tagNow.textContent = (S.mode === 1 ? L('ρ(τ) 条件化切面 · τ=', 'ρ(τ) conditioning slice · τ=') : 'NOW · τ=') + now.toFixed(2);
  let mx = 0; for (let k = 0; k < n; k++) mx = Math.max(mx, branchOffset(k, 1)[0]);
  placeTag(tagNow, 1.08 + mx, yOf(now) + 0.08, Z_SRC);
  for (let k = 0; k < KMAX; k++) {
    const el = branchTags[k];
    if (k >= n || S.split < 0.35) { el.style.display = 'none'; continue; }
    el.textContent = `${branchName(k)} · ${outcomeName(k)} ${L('时空', 'spacetime')}`;
    el.style.color = BCSS[k]; el.style.textTransform = 'none';
    const [dx, dz] = branchOffset(k, 1);
    placeTag(el, dx, -H / 2 - 0.22, Z_SCR + dz);
  }
  const Sp = span(), step = Sp <= 5 ? 0.5 : 2;
  let j = 0;
  for (let t = 0; t <= Sp + 1e-6 && j < tickTags.length; t += step, j++) {
    tickTags[j].textContent = t.toFixed(step < 1 ? 1 : 0);
    placeTag(tickTags[j], -1.04, yOf(t), Z_SCR, centre);
  }
  for (; j < tickTags.length; j++) tickTags[j].style.display = 'none';
}

/* =====================================================================
   11. 2D panels
   ===================================================================== */
const NB = 90;
const histPad = { l: 34, r: 10, t: 10, b: 20 };
let histGeom = null;
const shownBranch = (k) => focusBranch() < 0 || focusBranch() === k;

function drawHist() {
  const dpr = fitCanvas(cvHist), ctx = cvHist.getContext('2d');
  const W = cvHist.width, Hh = cvHist.height, n = K();
  ctx.clearRect(0, 0, W, Hh);
  const pl = histPad.l * dpr, pr = histPad.r * dpr, pt = histPad.t * dpr, pb = histPad.b * dpr;
  const iw = W - pl - pr, ih = Hh - pt - pb;
  histGeom = { pl, pr, pt, pb, iw, ih, dpr };
  const gray = new Float32Array(NB), cnt = Array.from({ length: n }, () => new Float32Array(NB));
  let nVis = 0, nSorted = 0, nPast = 0;
  const now = nowAbs();
  for (let i = 0; i < N_RUNS; i++) {
    if (RUN.hit[i] < 0.5) continue;
    nVis++;
    if (RUN.off[i] + TF <= now) nPast++;
    const b = Math.max(0, Math.min(NB - 1, Math.floor((EX[i] + 1) / 2 * NB)));
    if (RUN.sorted[i] >= 0.5) { nSorted++; cnt[EK[i]][b] += 1; } else gray[b] += 1;
  }
  const binW = 2 / NB, last = NZ - 1;
  const curve = (arr, m) => { const out = new Float32Array(200); for (let j = 0; j < 200; j++) out[j] = m * interpRow(arr, last, -1 + 2 * j / 199) / stats.rowMass * binW; return out; };
  const cS = curve(pS, nVis);
  const cB = []; for (let k = 0; k < n; k++) cB.push(shownBranch(k) ? curve(pB[k], nSorted) : null);
  let ymax = 1;
  for (let b = 0; b < NB; b++) { let s = gray[b]; for (let k = 0; k < n; k++) if (shownBranch(k)) s += cnt[k][b]; ymax = Math.max(ymax, s); }
  for (let j = 0; j < 200; j++) { if (focusBranch() < 0) ymax = Math.max(ymax, cS[j]); for (let k = 0; k < n; k++) if (cB[k]) ymax = Math.max(ymax, cB[k][j]); }
  ymax *= 1.15;
  const X = (x) => pl + (x + 1) / 2 * iw, Y = (v) => pt + ih - v / ymax * ih;
  ctx.strokeStyle = FAINT; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
  ctx.beginPath();
  for (const gx of [-1, -0.5, 0, 0.5, 1]) { ctx.moveTo(X(gx), pt); ctx.lineTo(X(gx), pt + ih); }
  ctx.moveTo(pl, pt + ih); ctx.lineTo(pl + iw, pt + ih);
  ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = DIM; ctx.font = `${10 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const gx of [-1, -0.5, 0, 0.5, 1]) ctx.fillText((gx > 0 ? '+' : '') + gx.toFixed(1), X(gx), pt + ih + 4 * dpr);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const yt = niceStep(ymax / 3);
  for (let v = 0; v <= ymax; v += yt) ctx.fillText(String(Math.round(v)), pl - 5 * dpr, Y(v));
  const bw = iw / NB;
  for (let b = 0; b < NB; b++) {
    let base = 0;
    const x0 = pl + b * bw + 0.5 * dpr;
    const bar = (v, col, alpha) => { if (v <= 0) return; ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.fillRect(x0, Y(base + v), Math.max(1, bw - 1 * dpr), Y(base) - Y(base + v)); base += v; };
    bar(gray[b], '#5c6f82', focusBranch() < 0 ? 0.9 : 0.45);
    for (let k = 0; k < n; k++) if (shownBranch(k)) bar(cnt[k][b], BCSS[k], 0.85);
  }
  ctx.globalAlpha = 1;
  const line = (arr, col, dash, wdt) => {
    ctx.setLineDash(dash.map(d => d * dpr)); ctx.strokeStyle = col; ctx.lineWidth = wdt * dpr; ctx.beginPath();
    for (let j = 0; j < 200; j++) { const x = X(-1 + 2 * j / 199), y = Y(arr[j]); if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
  };
  if (focusBranch() < 0 && nVis > 0) line(cS, SG, [4, 3], 1.4);
  if (nSorted > 0) for (let k = 0; k < n; k++) if (cB[k]) line(cB[k], BCSS[k], [], n > 3 && focusBranch() < 0 ? 1.1 : 1.6);
  const hx = S.sel >= 0 ? EX[S.sel] : S.hoverX;
  if (hx !== null && hx !== undefined) {
    ctx.strokeStyle = AM; ctx.lineWidth = 1 * dpr; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(X(hx), pt); ctx.lineTo(X(hx), pt + ih); ctx.stroke(); ctx.globalAlpha = 1;
  }
  $('histMeta').textContent = S.mode === 1
    ? L(`全块档案 ${nVis} 次 · τ 之前 ${nPast} · 之后 ${nVis - nPast}`, `whole-block archive ${nVis} runs · ${nPast} before τ · ${nVis - nPast} after`)
    : L(`已落点 ${nVis}/${N_RUNS} · 已分拣 ${nSorted}`, `${nVis}/${N_RUNS} landed · ${nSorted} sorted`);
}
function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, v)))); const m = v / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }

cvHist.addEventListener('pointermove', (ev) => {
  if (!histGeom) return;
  const r = cvHist.getBoundingClientRect();
  S.hoverX = Math.max(-1, Math.min(1, ((ev.clientX - r.left) * histGeom.dpr - histGeom.pl) / histGeom.iw * 2 - 1));
});
cvHist.addEventListener('pointerleave', () => { S.hoverX = null; });
cvHist.addEventListener('click', (ev) => {
  if (!histGeom) return;
  const r = cvHist.getBoundingClientRect();
  const x = ((ev.clientX - r.left) * histGeom.dpr - histGeom.pl) / histGeom.iw * 2 - 1;
  let best = -1, bd = 0.04;
  for (let i = 0; i < N_RUNS; i++) {
    if (RUN.hit[i] < 0.5 || RUN.focusA[i] < 0.5) continue;
    const d = Math.abs(EX[i] - x); if (d < bd) { bd = d; best = i; }
  }
  selectRun(best);
});

/* slice heatmap: a single clock slice ρ(τ) in x–z, over a faint ghost of the whole block */
const SW = 150, SH = 104;
const R_ = new Float32Array(SW * SH), G_ = new Float32Array(SW * SH), B_ = new Float32Array(SW * SH);
const gR = new Float32Array(SW * SH), gG = new Float32Array(SW * SH), gB = new Float32Array(SW * SH);
const sliceCanvas = document.createElement('canvas'); sliceCanvas.width = SW; sliceCanvas.height = SH;
const sliceCtx = sliceCanvas.getContext('2d');
const sliceData = sliceCtx.createImageData(SW, SH);
const zOfRow = (j) => Z_SRC + (Z_SCR - Z_SRC) * (j + 0.5) / SH;
const ghostCache = { key: '', max: 1 };
/* Accumulate one density layer. wS weights Σ; wB[k] weights branch k's joint density (all ones reproduce Σ). */
function accumulate(R, G, B, zc, sigZ, env0, wS, wB) {
  const n = K();
  let j0 = 0, j1 = SH - 1;
  if (zc !== null) {
    j0 = Math.max(0, Math.floor((zc - 3 * sigZ - Z_SRC) / (Z_SCR - Z_SRC) * SH));
    j1 = Math.min(SH - 1, Math.ceil((zc + 3 * sigZ - Z_SRC) / (Z_SCR - Z_SRC) * SH));
  }
  let preTot = wS; for (let k = 0; k < n; k++) preTot += wB[k] * stats.P[k];
  for (let j = j0; j <= j1; j++) {
    const z = zOfRow(j);
    const env = zc === null ? env0 : Math.exp(-((z - zc) * (z - zc)) / (2 * sigZ * sigZ)) * env0;
    if (env < 1e-4) continue;
    const row = (SH - 1 - j) * SW;
    if (z < Z_SLIT) {
      const Wd = 0.10 + 0.52 * (z - Z_SRC) / (Z_SLIT - Z_SRC);
      const A = stats.rowMass / (Wd * Math.sqrt(Math.PI / 2));
      for (let i = 0; i < SW; i++) {
        const x = -1 + 2 * (i + 0.5) / SW, v = A * Math.exp(-2 * x * x / (Wd * Wd)) * env * preTot;
        R[row + i] += v * COL.pre[0]; G[row + i] += v * COL.pre[1]; B[row + i] += v * COL.pre[2];
      }
    } else {
      const r = Math.round((z - Z_SLIT) / (Z_SCR - Z_SLIT) * (NZ - 1));
      for (let i = 0; i < SW; i++) {
        const idx = r * NX + Math.round(i / (SW - 1) * (NX - 1));
        const s = pS[idx] * wS * env;
        let rr = s * COL.sigma[0], gg = s * COL.sigma[1], bb = s * COL.sigma[2];
        for (let k = 0; k < n; k++) {
          if (!wB[k]) continue;
          const v = pB[k][idx] * wB[k] * env, c = BR[k];
          rr += v * c[0]; gg += v * c[1]; bb += v * c[2];
        }
        R[row + i] += rr; G[row + i] += gg; B[row + i] += bb;
      }
    }
  }
}
function branchWeights(sorted, only) {
  // only = -1: every branch with its joint weight; otherwise branch `only`, renormalised to one whole particle
  const n = K(), fb = focusBranch(), w = new Float32Array(KMAX);
  for (let k = 0; k < n; k++) {
    if (only >= 0 && k !== only) continue;
    if (fb >= 0 && fb !== k) continue;
    const norm = only >= 0 || fb >= 0 ? 1 / Math.max(1e-9, stats.P[k]) : 1;
    w[k] = sorted * norm;
  }
  return w;
}
function drawSlice() {
  const now = nowAbs(), c = S.frame, block = S.mode === 1, fb = focusBranch();
  R_.fill(0); G_.fill(0); B_.fill(0);
  const sigZ = 0.07, fS = fb < 0 ? 1 : 0.3;
  let packets = 0;
  if (c < 0.999 && now >= -0.05 && now <= TF + 0.08) {
    const sH = block ? 1 : smooth((now - S.TR) / 0.05 + 0.5);
    accumulate(R_, G_, B_, Z_SRC + VEL * now, sigZ, 1 - c, (1 - sH) * fS, branchWeights(sH, -1));
    packets++;
  }
  if (c > 0.001) {
    for (let i = 0; i < N_RUNS; i++) {
      const tl = now - RUN.off[i];
      if (tl < -0.05 || tl > TF + 0.08) continue;
      const s = RUN.sorted[i];
      accumulate(R_, G_, B_, Z_SRC + VEL * tl, sigZ, c * 0.5, (1 - s) * fS, branchWeights(s, EK[i]));
      packets++;
    }
  }
  let mx = 1e-12;
  for (let q = 0; q < SW * SH; q++) mx = Math.max(mx, R_[q], G_[q], B_[q]);
  // ghost: clock marginal of the block (all times at once) under the current conditioning.
  // It only depends on the densities, the focus and the sorted fraction, so it is recomputed when those change.
  const sG = block ? 1 : smooth((now - S.TR) / 0.05 + 0.5);
  const ghostKey = `${densityVersion}|${S.focus}|${K()}|${sG.toFixed(2)}|${c.toFixed(3)}`;
  if (ghostKey !== ghostCache.key) {
    gR.fill(0); gG.fill(0); gB.fill(0);
    const gs = (1 - sG) * fS * (1 - c) + c * fS * 0.5;
    accumulate(gR, gG, gB, null, 0, 1, gs, branchWeights(sG * (1 - c) + c * 0.5, -1));
    let m = 1e-12;
    for (let q = 0; q < SW * SH; q++) m = Math.max(m, gR[q], gG[q], gB[q]);
    ghostCache.key = ghostKey; ghostCache.max = m;
  }
  const gmx = ghostCache.max;
  const gk = packets ? 0.10 * mx / gmx : 0.30 / gmx;
  if (!packets) mx = 1;
  const d = sliceData.data;
  for (let q = 0; q < SW * SH; q++) {
    const t = (v) => Math.min(255, Math.round(255 * Math.pow(Math.max(0, v) / mx, 0.55)));
    d[4 * q] = t(R_[q] + gR[q] * gk); d[4 * q + 1] = t(G_[q] + gG[q] * gk); d[4 * q + 2] = t(B_[q] + gB[q] * gk); d[4 * q + 3] = 255;
  }
  sliceCtx.putImageData(sliceData, 0, 0);
  const dpr = fitCanvas(cvSlice), ctx = cvSlice.getContext('2d');
  const W = cvSlice.width, Hh = cvSlice.height;
  ctx.fillStyle = '#02050b'; ctx.fillRect(0, 0, W, Hh);
  const pad = 8 * dpr, iw = W - 2 * pad, ih = Hh - 2 * pad;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sliceCanvas, pad, pad, iw, ih);
  const zy = (z) => pad + ih - (z - Z_SRC) / (Z_SCR - Z_SRC) * ih;
  const xx = (x) => pad + (x + 1) / 2 * iw;
  ctx.strokeStyle = '#4fd8ff'; ctx.lineWidth = 1.5 * dpr; ctx.globalAlpha = 0.8;
  ctx.beginPath();
  const gaps = [[-OPT.d / 2 - SLIT_HALF, -OPT.d / 2 + SLIT_HALF], [OPT.d / 2 - SLIT_HALF, OPT.d / 2 + SLIT_HALF]];
  ctx.moveTo(xx(-1), zy(Z_SLIT)); ctx.lineTo(xx(gaps[0][0]), zy(Z_SLIT));
  ctx.moveTo(xx(gaps[0][1]), zy(Z_SLIT)); ctx.lineTo(xx(gaps[1][0]), zy(Z_SLIT));
  ctx.moveTo(xx(gaps[1][1]), zy(Z_SLIT)); ctx.lineTo(xx(1), zy(Z_SLIT));
  ctx.stroke();
  ctx.strokeStyle = SG; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(xx(-1), zy(Z_SCR)); ctx.lineTo(xx(1), zy(Z_SCR)); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = DIM; ctx.font = `${10 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('SCREEN', xx(-1) + 3 * dpr, zy(Z_SCR) + 3 * dpr);
  ctx.fillText('SLITS', xx(-1) + 3 * dpr, zy(Z_SLIT) + 3 * dpr);
  $('sliceMeta').textContent = packets
    ? `${block ? 'BLOCK' : 'LINEAR'} · ${L(`飞行中 ${packets} · 虚影为全时投影`, `${packets} in flight · ghost = all-time projection`)}`
    : L('此刻无波包在飞行 · 虚影为全时投影', 'no packet in flight · ghost = all-time projection');
}

function drawPhasor() {
  const dpr = fitCanvas(cvPhasor), ctx = cvPhasor.getContext('2d');
  const W = cvPhasor.width, Hh = cvPhasor.height, n = K(), fb = focusBranch();
  ctx.clearRect(0, 0, W, Hh);
  const x = S.sel >= 0 ? EX[S.sel] : (S.hoverX !== null ? S.hoverX : 0.105);
  $('phasorX').textContent = 'x = ' + (x >= 0 ? '+' : '') + x.toFixed(3);
  const r = NZ - 1;
  const aL = interpC(uLr, uLi, r, x), R0 = interpC(uRr, uRi, r, x);
  const pc = Math.cos(S.phi), ps = Math.sin(S.phi);
  const Rr = [R0[0] * pc - R0[1] * ps, R0[0] * ps + R0[1] * pc];
  const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const h = Math.SQRT1_2;
  const br = [];
  for (let k = 0; k < n; k++) {
    const a = mul(coef.alpha[k], aL), b = mul(coef.gamma[k], Rr);
    br.push({ a: [a[0] * h, a[1] * h], b: [b[0] * h, b[1] * h] });
  }
  let scaleV = 1e-9;
  for (let k = 0; k < n; k++) if (shownBranch(k)) scaleV = Math.max(scaleV, Math.hypot(...br[k].a) + Math.hypot(...br[k].b));
  scaleV *= 1.12;
  const cx = W / 2, cy = Hh / 2, rad = Math.min(W, Hh) * 0.42;
  if (rad < 12) return;
  ctx.strokeStyle = FAINT; ctx.lineWidth = 1 * dpr;
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy); ctx.moveTo(cx, cy - rad); ctx.lineTo(cx, cy + rad); ctx.stroke();
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('Re', cx + rad - 16 * dpr, cy - 3 * dpr); ctx.fillText('Im', cx + 4 * dpr, cy - rad + 12 * dpr);
  const P = (v) => [cx + v[0] / scaleV * rad, cy - v[1] / scaleV * rad];
  const arrow = (from, to, col, w, alpha) => {
    const a = P(from), b = P(to);
    ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w * dpr;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), hl = 7 * dpr;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > hl) {
      ctx.beginPath(); ctx.moveTo(b[0], b[1]);
      ctx.lineTo(b[0] - hl * Math.cos(ang - 0.4), b[1] - hl * Math.sin(ang - 0.4));
      ctx.lineTo(b[0] - hl * Math.cos(ang + 0.4), b[1] - hl * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  for (let k = 0; k < n; k++) {
    if (!shownBranch(k)) continue;
    const { a, b } = br[k], sum = [a[0] + b[0], a[1] + b[1]];
    arrow([0, 0], a, BCSS[k], 1.2, 0.5);
    arrow(a, sum, BCSS[k], 1.2, 0.5);
    arrow([0, 0], sum, BCSS[k], 2.2, 1);
  }
  const nrm = stats.scrMax || 1;
  const st = (k) => {
    const { a, b } = br[k];
    const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, sx = a[0] + b[0], sy = a[1] + b[1];
    return { sep: (a2 + b2) / nrm, tot: (sx * sx + sy * sy) / nrm, cross: 2 * (a[0] * b[0] + a[1] * b[1]) / nrm };
  };
  const f = (v) => (v >= 0 ? ' ' : '') + v.toFixed(3);
  let txt;
  if (fb >= 0) {
    const s = st(fb);
    txt = L(`分支 ${branchName(fb)}：|a|²+|b|² =${f(s.sep)} · |a+b|² =${f(s.tot)} · 干涉项 2Re(āb) =${f(s.cross)}`,
      `Branch ${branchName(fb)}: |a|²+|b|² =${f(s.sep)} · |a+b|² =${f(s.tot)} · interference 2Re(āb) =${f(s.cross)}`);
  } else {
    let tot = 0, cross = 0;
    for (let k = 0; k < n; k++) { const s = st(k); tot += s.tot; cross += s.cross; }
    txt = L(`总体 p = Σ p_k =${f(tot)} · ${n} 个分支的干涉项相加为${f(cross)}，即总体干涉项，正比于 κ`,
      `Whole p = Σ p_k =${f(tot)} · the ${n} branch interference terms add to${f(cross)}, the overall interference term, proportional to κ`);
  }
  $('phasorNote').textContent = txt + L('。数值以屏上总体峰值归一。', '. Values are normalized to the peak of the whole on the screen.');
}

function drawGauge() {
  const dpr = fitCanvas(cvGauge), ctx = cvGauge.getContext('2d');
  const W = cvGauge.width, Hh = cvGauge.height, n = K();
  ctx.clearRect(0, 0, W, Hh);
  const pl = 34 * dpr, pb = 24 * dpr, pt = 12 * dpr, pr = 14 * dpr;
  const side = Math.min(W - pl - pr, Hh - pb - pt);
  if (side < 24) return;
  const ox = pl, oy = pt + side;
  const X = (v) => ox + v * side, Y = (d) => oy - d * side;
  ctx.strokeStyle = FAINT; ctx.lineWidth = 1 * dpr;
  ctx.beginPath(); ctx.moveTo(ox, pt); ctx.lineTo(ox, oy); ctx.lineTo(ox + side, oy); ctx.stroke();
  ctx.strokeStyle = OK; ctx.lineWidth = 1.6 * dpr; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.arc(ox, oy, side, -Math.PI / 2, 0); ctx.stroke(); ctx.globalAlpha = 1;
  const V = S.kappa, D = Math.sqrt(Math.max(0, 1 - V * V));
  ctx.strokeStyle = AM; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.lineWidth = 1 * dpr;
  ctx.beginPath(); ctx.moveTo(X(V), oy); ctx.lineTo(X(V), Y(D)); ctx.lineTo(ox, Y(D)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = AM; ctx.shadowColor = AM; ctx.shadowBlur = 12 * dpr;
  ctx.beginPath(); ctx.arc(X(V), Y(D), 5 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  for (let k = 0; k < n; k++) {
    const v = stats.V[k], lift = (k % 3) * 5 * dpr;
    ctx.fillStyle = BCSS[k];
    ctx.beginPath(); ctx.moveTo(X(v), oy + 2 * dpr + lift); ctx.lineTo(X(v) - 5 * dpr, oy + 10 * dpr + lift); ctx.lineTo(X(v) + 5 * dpr, oy + 10 * dpr + lift); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = DIM; ctx.font = `${10 * dpr}px ${TRV.fonts.data}`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText('1', ox - 8 * dpr, Y(1)); ctx.fillText('0', ox - 8 * dpr, oy);
  ctx.textAlign = 'left'; ctx.fillText('D', ox + 6 * dpr, pt + 4 * dpr);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('V', ox + side, oy + 12 * dpr);
  ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = `${11 * dpr}px ${TRV.fonts.data}`;
  ctx.fillText(`D²+V² = ${(D * D + V * V).toFixed(3)}`, X(0.36), Y(0.99));
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`;
  ctx.fillText(L('▲ 各分支的条纹可见度', '▲ fringe visibility per branch'), X(0.36), Y(0.99) + 16 * dpr);
}

function drawWarp() {
  const dpr = fitCanvas(cvWarp), ctx = cvWarp.getContext('2d');
  const W = cvWarp.width, Hh = cvWarp.height;
  ctx.clearRect(0, 0, W, Hh);
  const p = 10 * dpr, iw = W - 2 * p - 20 * dpr, ih = Hh - 2 * p;
  const X = (s) => p + 20 * dpr + s * iw, Y = (v) => p + ih - v * ih;
  ctx.strokeStyle = FAINT; ctx.lineWidth = 1 * dpr;
  ctx.strokeRect(X(0), Y(1), iw, ih);
  ctx.setLineDash([2 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(1), Y(1)); ctx.stroke(); ctx.setLineDash([]);
  let prev = warp(0);
  for (let i = 1; i <= 160; i++) {
    const s = i / 160, v = warp(s);
    ctx.strokeStyle = v < prev ? WARN : TRV.palette.cyan; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(X((i - 1) / 160), Y(prev)); ctx.lineTo(X(s), Y(v)); ctx.stroke();
    prev = v;
  }
  ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(S.nowFrac), Y(warp(S.nowFrac)), 4 * dpr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText('θ', X(0) - 6 * dpr, Y(0.9)); ctx.textBaseline = 'bottom'; ctx.fillText('τ', X(1) - 3 * dpr, Y(0) - 3 * dpr);
}

/* =====================================================================
   12. UI wiring
   ===================================================================== */
const deg = (r) => Math.round(r * 180 / Math.PI);
let dirtyDensity = true, dirtyEvents = true, dirtyWalls = true, dirtyBranches = true;
function markPrep() { dirtyDensity = true; dirtyEvents = true; }

function buildBranchUI() {
  const n = K();
  const box = $('branches');
  const btn = (f, sym, lbl, color) => `<button class="branch" data-focus="${f}" aria-pressed="${S.focus === f}" style="--bc:${color}"><span class="sym">${sym}</span><span class="lbl">${lbl}</span></button>`;
  let html = btn(0, 'Σ', L('总体', 'whole'), 'var(--sigma)');
  for (let k = 0; k < n; k++) html += btn(k + 1, branchName(k), outcomeName(k), BCSS[k]);
  box.innerHTML = html;
  box.style.setProperty('--cols', String(Math.min(n + 1, 5)));
  box.querySelectorAll('.branch').forEach(b => b.addEventListener('click', () => setFocus(+b.dataset.focus)));
}
function buildBranchTable() {
  const n = K();
  const rows = [];
  for (let k = 0; k < n; k++) {
    const th = coef.theta[k];
    const shift = Number.isFinite(th) ? `${((deg(th) % 360) + 360) % 360}°` : '—';
    rows.push(`<tr><td><i style="background:${BCSS[k]}"></i>${branchName(k)} · ${outcomeName(k)}</td><td>${stats.P[k].toFixed(3)}</td><td>${stats.V[k].toFixed(3)}</td><td>${shift}</td></tr>`);
  }
  $('branchTable').innerHTML = `<table><thead><tr><th>${L('条件时空', 'Spacetime')}</th><th>P</th><th>${L('可见度', 'Visibility')}</th><th>${L('读数相位', 'Phase')}</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}
function syncOutputs() {
  const n = K();
  $('oKappa').textContent = S.kappa.toFixed(2);
  $('oPhi').textContent = deg(S.phi) + '°';
  $('oBeta').textContent = deg(S.beta) + '°';
  $('oChi').textContent = deg(S.chi) + '°';
  $('oTr').textContent = S.TR.toFixed(2);
  $('oN').textContent = String(n);
  $('beta').disabled = n > 2;
  const mk = `E<sub>k</sub> = |m<sub>k</sub>⟩⟨m<sub>k</sub>|, m<sub>k</sub> = (1, e<sup>i(χ+2πk/${n})</sup>)/√${n}`;
  $('instrumentNote').innerHTML = n === 2
    ? L('两结果投影读取：基 e<sub>±</sub> 由 β、χ 决定。β=0° 读路径，β=45° 擦除路径。', 'Two-outcome projective readout: the basis e<sub>±</sub> is set by β and χ. β = 0° reads the path; β = 45° erases it.')
    : L(`${n} 结果相位读取：${mk}。每个读数一个条件时空，条纹依次错开 ${Math.round(360 / n)}°；此时 β 不起作用。`,
        `${n}-outcome phase readout: ${mk}. Each outcome defines one conditional spacetime, with fringes offset by ${Math.round(360 / n)}°; β has no effect here.`);
  $('oFrame').textContent = S.frame < 0.02 ? 'RUN' : S.frame > 0.98 ? 'LAB' : 'MIX ' + S.frame.toFixed(2);
  $('oWarpK').textContent = S.warpK.toFixed(2);
  $('oSplit').textContent = S.split.toFixed(2);
  const pre = S.TR < TF;
  $('roOrder').textContent = pre
    ? L(`先读记录 · T_R = ${S.TR.toFixed(2)} < T_f`, `record first · T_R = ${S.TR.toFixed(2)} < T_f`)
    : L(`落点在先 · 延迟 ${(S.TR - TF).toFixed(2)} T_f`, `landing first · delay ${(S.TR - TF).toFixed(2)} T_f`);
  $('orderNote').innerHTML = pre
    ? L('记录在粒子落屏<b>之前</b>读取。拖到 T<sub>R</sub> &gt; 1 交换顺序：联合律 p(x, e) 不变，档案哈希也不变。',
        'The record is read <b>before</b> the particle lands. Drag T<sub>R</sub> above 1 to swap the order: the joint law p(x, e) and the archive hash stay the same.')
    : L('记录在粒子落屏<b>之后</b>读取（延迟选择）。拖到 T<sub>R</sub> &lt; 1 交换顺序：联合律 p(x, e) 不变，档案哈希也不变。',
        'The record is read <b>after</b> the particle lands (delayed choice). Drag T<sub>R</sub> below 1 to swap the order: the joint law p(x, e) and the archive hash stay the same.');
  const inj = warpInjective();
  const warpName = L(['线性', '前段拉伸', '后段拉伸', '折叠'], ['Linear', 'Stretch early', 'Stretch late', 'Fold'])[S.warpType];
  $('warpNote').innerHTML = inj
    ? L(`<span style="color:${OK}">单射 ✓</span> ${warpName}：严格递增的重标只搬运标签，事件信息保持（定理 24.2）。`,
        `<span style="color:${OK}">Injective ✓</span> ${warpName}: a strictly increasing relabel only moves labels, so event information is preserved (Theorem 24.2).`)
    : L(`<span style="color:${WARN}">非单射 ✗</span> 折叠：不同钟时刻被并到同一标签（红色段），能恢复什么要另行判断（定理 21.4）。`,
        `<span style="color:${WARN}">Not injective ✗</span> Fold: different clock times merge into one label (red segments); what can still be recovered needs a separate check (Theorem 21.4).`);
  $('pillMode').innerHTML = `MODE <strong>${S.mode === 1 ? 'BLOCK' : 'LINEAR'}</strong>`;
  $('pillClock').innerHTML = `CLOCK <strong>${S.frame < 0.02 ? 'RUN' : S.frame > 0.98 ? 'LAB' : 'MIX'}</strong>`;
  $('splitLabel').textContent = L(`${n} 个记录分支`, `${n} record branches`);
  $('presetNote').textContent = S.preset ? L(PRESETS[S.preset].zh, PRESETS[S.preset].en) : L('自定义参数。', 'Custom settings.');
  updateMarks();
  if (S.sel >= 0) selectRun(S.sel);
}
function bindRange(id, fn) { const el = $(id); el.addEventListener('input', () => { fn(parseFloat(el.value)); syncOutputs(); }); }
bindRange('kappa', v => { S.kappa = v; markPrep(); clearPreset(); });
bindRange('phi', v => { S.phi = v * Math.PI / 180; markPrep(); clearPreset(); });
bindRange('beta', v => { S.beta = v * Math.PI / 180; markPrep(); clearPreset(); });
bindRange('chi', v => { S.chi = v * Math.PI / 180; markPrep(); clearPreset(); });
bindRange('nout', v => { setN(v); clearPreset(); });
bindRange('tr', v => { S.TR = v; clearPreset(); });
bindRange('frame', v => { S.frame = v; dirtyWalls = true; });
bindRange('warpK', v => { S.warpK = v; dirtyWalls = true; });
bindRange('split', v => { S.split = v; });
$('now').addEventListener('input', () => { S.nowFrac = parseFloat($('now').value); S.hold = 0; });
let scrubbing = false;
$('now').addEventListener('pointerdown', () => { scrubbing = true; });
window.addEventListener('pointerup', () => { scrubbing = false; });
window.addEventListener('pointercancel', () => { scrubbing = false; });

function setN(v) {
  const n = Math.max(2, Math.min(KMAX, Math.round(v)));
  $('nout').value = n;
  if (n === S.nOut) return;
  S.nOut = n;
  if (S.focus > n) S.focus = 0;
  if (S.sel >= 0) selectRun(-1);
  markPrep(); dirtyBranches = true;
}
function clearPreset() { S.preset = null; document.querySelectorAll('.preset').forEach(b => b.setAttribute('aria-pressed', 'false')); $('presetNote').textContent = L('自定义参数。', 'Custom settings.'); }
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.kappa = p.kappa; S.phi = p.phi * Math.PI / 180; S.beta = p.beta * Math.PI / 180; S.chi = p.chi * Math.PI / 180; S.TR = p.TR;
  $('kappa').value = p.kappa; $('phi').value = p.phi; $('beta').value = p.beta; $('chi').value = p.chi; $('tr').value = p.TR;
  setN(p.n);
  S.preset = name;
  document.querySelectorAll('.preset').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === name)));
  $('presetNote').textContent = L(p.zh, p.en);
  selectRun(-1); markPrep(); syncOutputs();
  if (S.mode === 0 && !reduceMotion) { S.nowFrac = 0; S.dir = 1; S.playing = true; setPlayUI(); }
  glitch();
}
document.querySelectorAll('.preset').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
function setFocus(f) {
  if (f < 0 || f > K()) return;
  S.focus = f;
  document.querySelectorAll('.branch').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.focus === f)));
  if (S.sel >= 0 && f !== 0 && EK[S.sel] !== f - 1) selectRun(-1);
}
function setMode(m) {
  S.mode = m;
  document.querySelectorAll('.mode').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.mode === m)));
  syncOutputs();
}
document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => setMode(+b.dataset.mode)));
document.querySelectorAll('#warpChips .chip').forEach(b => b.addEventListener('click', () => {
  const t = +b.dataset.warp; if (t === S.warpType) return;
  S.warpFrom = S.warpType; S.warpType = t; S.warpMix = reduceMotion ? 1 : 0; dirtyWalls = true;
  document.querySelectorAll('#warpChips .chip').forEach(c => c.setAttribute('aria-pressed', String(+c.dataset.warp === t)));
  syncOutputs();
}));
document.querySelectorAll('#camChips .chip').forEach(b => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function setPlayUI() { $('play').textContent = S.playing ? '❚❚' : '▶'; $('play').setAttribute('aria-pressed', String(S.playing)); $('rev').setAttribute('aria-pressed', String(S.dir < 0)); }
$('play').addEventListener('click', () => { S.playing = !S.playing; S.hold = 0; setPlayUI(); });
$('rev').addEventListener('click', () => { S.dir = -S.dir; S.playing = true; S.hold = 0; setPlayUI(); });
document.querySelectorAll('#speedChips .chip').forEach(b => b.addEventListener('click', () => {
  S.speed = parseFloat(b.dataset.speed);
  document.querySelectorAll('#speedChips .chip').forEach(c => c.setAttribute('aria-pressed', String(c === b)));
}));
const drawer = TRV.drawer({ drawer: $('drawer'), open: $('infoBtn'), close: $('drawerClose') });
document.addEventListener('keydown', (ev) => {
  if (ev.target && (ev.target.tagName === 'INPUT' && ev.target.type !== 'range')) return;
  if (drawer.isOpen()) return;
  if (ev.key === 'Escape') { selectRun(-1); return; }
  if (ev.key === ' ' && !(ev.target && ev.target.tagName === 'BUTTON')) { ev.preventDefault(); S.playing = !S.playing; S.hold = 0; setPlayUI(); }
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) {
    ev.preventDefault(); S.playing = false; setPlayUI();
    S.nowFrac = Math.min(1, Math.max(0, S.nowFrac + (ev.key === 'ArrowRight' ? 1 : -1) * 0.005));
  }
  else if (/^[1-9]$/.test(ev.key)) setFocus(+ev.key - 1);
});

let selSorted = false;
function selectRun(i) {
  S.sel = i;
  const card = $('runcard');
  if (i < 0) { card.innerHTML = L('点击落点或直方图，选出一次运行：它的落点、记录读数和二者之间的关联线会跨越不同钟时刻一起高亮。', 'Click a hit or the histogram to pick one run: its hit, its record reading and the link between them light up together across different clock times.'); return; }
  const off = S.frame * LAB[i], k = EK[i];
  const xs = `${EX[i] >= 0 ? '+' : ''}${EX[i].toFixed(3)}`, gap = Math.abs(S.TR - TF).toFixed(2);
  const unread = RUN.sorted[i] < 0.5;
  selSorted = !unread;
  const record = unread
    ? `${L('记录', 'record')} <b>${L('尚未读取', 'not read yet')}</b>`
    : `${L('记录', 'record')} <b style="color:${BCSS[k]}">${outcomeName(k)} (${branchName(k)})</b>`;
  const prob = unread ? L('读数在 τ 之后才产生，LINEAR 模式不预先显示', 'the reading comes after τ; LINEAR mode does not reveal it early') : `p(${outcomeName(k)} | x) = ${EPK[i].toFixed(3)}`;
  card.innerHTML = `RUN <b>#${String(i).padStart(3, '0')}</b> · ${L('落点', 'hit')} x = <b>${xs}</b> · ${record}<br>`
    + `${prob} · ${L('落点', 'lands at')} τ = ${(off + TF).toFixed(2)} · ${L('读取', 'read at')} τ = ${(off + S.TR).toFixed(2)}<br>`
    + L(`关联切面：由这一对事件定义，跨越 ${gap} 的钟间隔。`, `Relational slice: defined by this pair of events, spanning a clock interval of ${gap}.`);
}

const toast = (html) => TRV.toast($('toast'), html);
const glitch = () => TRV.glitch($('app'));
TRV.startGlitch($('app'));

function updateMarks() {
  const Sp = span(), m = $('marks');
  const items = [];
  const add = (t, label, cls) => { if (t >= 0 && t <= Sp) items.push(`<i class="${cls || ''}" style="left:${(t / Sp * 100).toFixed(2)}%">${label}</i>`); };
  if (S.frame < 0.5) { add(TS, L('缝', 'slits'), ''); add(TF, L('落屏', 'landing'), ''); add(S.TR, L('读记录', 'read'), 'tr'); }
  else { add(0, '0', ''); add(Sp / 2, (Sp / 2).toFixed(1), ''); add(Sp, Sp.toFixed(1), ''); }
  m.innerHTML = items.join('');
}

/* =====================================================================
   13. Main loop
   ===================================================================== */
let lastT = performance.now(), prevNow = nowAbs(), tAcc = 0, panelTick = 0;
function resize() {
  if (!glOK) return;
  const r = stage.getBoundingClientRect();
  renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
  camera.aspect = Math.max(0.2, r.width / Math.max(1, r.height));
  camera.updateProjectionMatrix();
}
let frameCount = 0;
function frame(tms) {
  frameCount++;
  const dt = Math.min(0.1, (tms - lastT) / 1000); lastT = tms; tAcc += dt;
  if (dirtyBranches) refreshBranchColors();
  if (dirtyDensity) { computeDensities(); sampleTemplates(); dirtyDensity = false; }
  if (dirtyEvents) { resampleEvents(); dirtyEvents = false; $('pillHash').innerHTML = `ARCHIVE <strong>${archiveHash}</strong>`; buildBranchTable(); }
  if (dirtyBranches) { buildBranchUI(); dirtyBranches = false; syncOutputs(); }
  if (S.warpMix < 1) { S.warpMix = Math.min(1, S.warpMix + dt / 0.9); dirtyWalls = true; if (S.warpMix >= 1) S.warpFrom = S.warpType; }
  if (dirtyWalls) { buildWalls(); dirtyWalls = false; updateMarks(); }
  if (S.playing && !scrubbing) {
    if (S.hold > 0) { S.hold -= dt; if (S.hold <= 0) S.nowFrac = S.dir > 0 ? 0 : 1; }
    else {
      S.nowFrac += S.dir * dt * S.speed / 17;
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 1.4; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.4; }
    }
    $('now').value = S.nowFrac;
  }
  const now = nowAbs();
  if (S.mode === 0 && S.frame < 0.5 && prevNow < S.TR && now >= S.TR && S.kappa < 0.999) {
    toast(L(`<b>记录已读取</b>：档案按 ${K()} 个读数分拣。落点坐标一个也没动，变的是每个落点归入哪个条件时空；在右侧选一个时空，就能看到它自己的条纹。`,
      `<b>Record read</b>: the archive is sorted by ${K()} outcomes. No hit moved; what changed is which conditional spacetime each hit belongs to. Pick a spacetime on the right to see its own fringes.`));
  }
  prevNow = now;
  runDynamics();
  if (S.sel >= 0 && (RUN.sorted[S.sel] >= 0.5) !== selSorted) selectRun(S.sel);
  $('tau').innerHTML = `τ ${now.toFixed(3)} <small>/ ${span().toFixed(3)}</small>`;
  $('hudBig').textContent = `${S.mode === 1 ? 'BLOCK' : 'LINEAR'} · τ = ${now.toFixed(3)}`;
  const fb = focusBranch();
  const focusName = fb < 0 ? L('Σ 未分拣总体', 'Σ unsorted whole') : L(`${branchName(fb)} · 记录 = ${outcomeName(fb)} 的条件时空`, `${branchName(fb)} · spacetime conditioned on record = ${outcomeName(fb)}`);
  $('hudSub').textContent = `${focusName} · ${L(`${K()} 个记录分支`, `${K()} record branches`)} · ${S.mode === 1 ? L('用整个关系体条件化', 'conditioned on the whole block') : L('只用 τ 之前读到的记录', 'conditioned on records read before τ')}${S.split > 0.02 ? L(' · 第四轴展开 ', ' · 4th axis unfolded ') + S.split.toFixed(2) : ''}`;
  if (glOK) {
    updateCamera(dt);
    updateGL(tAcc);
    renderer.render(scene, camera);
    updateTags();
  }
  panelTick++;
  drawHist(); drawSlice();
  if (panelTick % 2 === 0) { drawPhasor(); drawGauge(); drawWarp(); }
  $('roV').textContent = S.kappa.toFixed(3);
  $('roD').textContent = Math.sqrt(Math.max(0, 1 - S.kappa * S.kappa)).toFixed(3);
  requestAnimationFrame(frame);
}

TRV.onLang(() => { labelStaticTags(); buildBranchUI(); buildBranchTable(); syncOutputs(); selectRun(S.sel); updateMarks(); });

/* read-only probe for automated browser tests */
window.CHRONO_DEBUG = {
  /* true while a control change is waiting for the next frame to recompute densities, archive or labels */
  pending: () => dirtyDensity || dirtyEvents || dirtyBranches || dirtyWalls,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  archive: () => ({ x: Array.from(EX), k: Array.from(EK), hash: archiveHash }),
  stats: () => ({ P: Array.from(stats.P).slice(0, K()), V: Array.from(stats.V).slice(0, K()), n: K() }),
  sums: () => { let worst = 0; for (let q = 0; q < NZ * NX; q++) { let t = 0; for (let k = 0; k < K(); k++) t += pB[k][q]; worst = Math.max(worst, Math.abs(t - pS[q])); } return worst; },
  project: (i, which) => { if (!glOK) return null; const a = which === 'read' ? RUN.readP : RUN.clickP; const p = projectToStage(new THREE.Vector3(a[3 * i], a[3 * i + 1], a[3 * i + 2])); return { x: p.x, y: p.y, visible: (which === 'read' ? RUN.read[i] : RUN.hit[i]) * RUN.focusA[i] }; },
  run: (i) => ({ sorted: RUN.sorted[i], hit: RUN.hit[i], focusA: RUN.focusA[i], dx: RUN.dx[i], dz: RUN.dz[i] })
};

/* cover state for scripts/thumbs.mjs: three conditional spacetimes unfolded, conditioned on the whole block */
window.TRV_THUMB = () => {
  applyPreset('trine'); setMode(1);
  S.split = 1; $('split').value = 1; S.playing = false; setPlayUI();
  S.nowFrac = 0.22; $('now').value = S.nowFrac; syncOutputs();
};

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
refreshBranchColors();
applyPreset('delayed');
S.nowFrac = 0.8; S.playing = !reduceMotion; $('now').value = S.nowFrac;
setPlayUI(); syncOutputs(); selectRun(-1);
prevNow = nowAbs();
requestAnimationFrame(frame);
})();
