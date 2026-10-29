/* DELAY//ERASER · 延迟选择量子擦除 · 先落点，后贴标签
   A schematic of the Kim–Yu–Kulik–Shih–Scully delayed-choice quantum eraser (PRL 84, 1 (2000)). Each pair is born at slit A or B;
   the idler carries an orthogonal path record. Detector amplitudes (a_k, b_k) on the two records give the joint law
   p(x, k) = f(x)·[½(|a_k|² + |b_k|²) + Re(a_k b̄_k e^{2πix/Λ})], whose sum over k is the fringe-free envelope f(x) for every choice.
   Hits are drawn from f with fixed seeds, so no choice ever moves a hit; the idler's detector is drawn from p(k | x) and reaches
   the coincidence counter only after a light-speed pulse. Theory: trureturing docs/develop/theory/
   RECURSIVE_RELATIONAL_OBSERVATION_WAVE_PARTICLE_EVENTS.md §5, §8. Frozen Lean anchors are named in the page text.
   Depends on: assets/vendor/three.r128.min.js (window.THREE), assets/shell.js (window.TRV). */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const N_MAX = 4000, E_WIN = 600, GRID = 2048, BINS = 36;
const C_M = 0.3;                                        // metres per nanosecond (schematic speed of light)
const SIG_FLIGHT = 4, IDL_FLIGHT = 5, DET_LAG = 1;      // ns: source → D0, source → choice splitter, splitter → idler detector
const X_D0 = -1.2, X_SCOIL = -0.6, X_ICOIL = 0.6, X_CHOICE = 1.5, X_IDET = 1.8, X_CC = 0;   // metres along the table axis
const lightNs = (m) => Math.round(Math.abs(m) / C_M * 1e6) / 1e6;   // light time over a distance, rounded off float noise
const CABLE_D0 = lightNs(X_D0 - X_CC), CABLE_ID = lightNs(X_IDET - X_CC);
const SEP_NS = lightNs(X_CHOICE - X_D0);                // light time between the D0 click and the choice: 9 ns
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { mulberry32, fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, sigma: SG, ok: OK, cyan: CY, magenta: MG } = TRV.palette;
const DEG = Math.PI / 180;
const DET_NAME = ['D1', 'D2', 'D3', 'D4'];
const DET_CSS = [CY, MG, AM, OK];
const DET_RGB = [COL.cyan, COL.magenta, COL.amber, [0.27, 1.0, 0.70]];

/* =====================================================================
   2. State and presets
   ===================================================================== */
const S = {
  mode: 'bs', w: 0.5, sched: [{ t: 0, set: 'E' }], r: 0.5, phi: 0, delta: 8, W: 0.8, db: 3, N: 1600,
  nowFrac: 0.3, playing: true, dir: 1, speed: 1, hold: 0, selDet: -1, selPair: -1, preset: 'kim'
};
const BASE = { mode: 'bs', w: 0.5, sched: [{ t: 0, set: 'E' }], r: 0.5, phi: 0, delta: 8, W: 0.8, db: 3, N: 1600 };
const PRESETS = {
  kim: { ...BASE,
    zh: 'Kim 等人 2000 年的安排：每个闲置光子在被动分束器上随机地一半送去测路径（D3、D4），一半送进擦除分束器（D1、D2），选择比 D0 点击晚 8 ns。D0 屏上始终没有条纹；只有按 D1 或 D2 分拣，条纹和反条纹才出现。',
    en: 'The arrangement of Kim et al. (2000): at passive beam splitters each idler is sent at random, half to the path detectors (D3, D4) and half into the eraser (D1, D2), 8 ns after the D0 click. The D0 screen never shows fringes; fringes and anti-fringes appear only when the hits are sorted by D1 or D2.' },
  erase: { ...BASE, w: 0,
    zh: '每个闲置光子都进擦除分束器。D0 屏上照样没有条纹；按 D1、D2 分拣，落点分成条纹与反条纹两组，相加回到同一个没有条纹的总体。',
    en: 'Every idler enters the eraser. The D0 screen still shows no fringes; sorted by D1 and D2, the hits split into fringes and anti-fringes that add back to the same fringe-free whole.' },
  path: { ...BASE, w: 1,
    zh: '每个闲置光子都去测路径。按 D3、D4 分拣，每一半都只有单缝包络，没有条纹。屏上的落点与“全部擦除”里的是同一批点，一个也没动——D0 哈希相同。',
    en: 'Every idler has its path measured. Sorted by D3 and D4, each half shows only the single-slit envelope with no fringes. The hits on the screen are the very same points as in ERASE-ALL, not one has moved: the D0 hash is the same.' },
  late: { ...BASE, delta: 300,
    zh: '选择比 D0 点击晚 300 ns，深在 D0 点击的未来光锥之内。注意屏上的灰色落点：它们的标签还在路上。标签到齐之后，分拣出的统计与 8 ns 延迟时完全相同。',
    en: 'The choice comes 300 ns after the D0 click, deep inside its future light cone. Watch the grey hits on the screen: their labels are still on the way. Once the labels arrive, the sorted statistics are exactly those of the 8 ns delay.' },
  early: { ...BASE, delta: -30,
    zh: '选择比 D0 点击早 30 ns，D0 点击落在选择的未来光锥里——选择原则上可以影响 D0。即便如此，D0 分布仍然一点不变：擦除本来就不传递任何信号。',
    en: 'The choice comes 30 ns before the D0 click, so the D0 click lies in the choice’s future light cone and could in principle be influenced by it. Even so the D0 distribution does not change at all: the eraser never carries a signal.' },
  flip: { ...BASE, mode: 'switch', delta: 250, sched: [{ t: 0, set: 'E' }, { t: 300, set: 'P' }],
    zh: '实验者开关，闲置光子延迟 250 ns。开关起初在“擦除”，t = 300 ns 时扳到“测路径”。t = 50–300 ns 之间印在屏上的落点，孪生光子还在延迟线里，于是按扳动之后的“测路径”分拣——它们落下时，开关还没扳。',
    en: 'The experimenter’s switch, with the idlers delayed by 250 ns. The switch starts on ERASE and is flipped to PATH at t = 300 ns. Hits printed between t = 50 and 300 ns still have their twins in the delay line, so they are sorted by the PATH setting chosen after the flip, although they landed before it.' },
  phase: { ...BASE, w: 0, phi: 90,
    zh: '擦除分束器两臂的光程差四分之一波长（φ = 90°）。D1 的条纹与 D2 的反条纹一起平移四分之一个周期；D0 屏上依然没有条纹。',
    en: 'The two eraser arms differ by a quarter wavelength (φ = 90°). The D1 fringes and the D2 anti-fringes both shift by a quarter period; the D0 screen still shows no fringes.' },
  partial: { ...BASE, w: 0, r: 0.85,
    zh: '擦除分束器反射 85%。D1、D2 只部分擦除路径：每个子系综保留路径知识 K = 0.70，条纹可见度降为 V = 0.71，仍有 K² + V² = 1。',
    en: 'The eraser beam splitter reflects 85%. D1 and D2 erase the path only partly: each sub-ensemble keeps path knowledge K = 0.70 and its fringe visibility drops to V = 0.71, still with K² + V² = 1.' }
};

/* =====================================================================
   3. The law
   ===================================================================== */
const sinc = (u) => (Math.abs(u) < 1e-9 ? 1 : Math.sin(u) / u);
const env2 = (x) => sinc(Math.PI * x / S.W) ** 2;               // single-slit envelope, unnormalized
const period = () => S.W / S.db;                                // fringe period Λ
const phaseAt = (x) => 2 * Math.PI * x / period();
/* detector amplitudes on the records |A⟩, |B⟩: D1, D2 behind the eraser, D3, D4 on the paths */
function amplitudes(w, r, phi) {
  const g = Math.sqrt(1 - w), c = Math.cos(phi * DEG), s = Math.sin(phi * DEG), sr = Math.sqrt(r), st = Math.sqrt(1 - r);
  return [
    { a: [g * sr, 0], b: [g * st * c, g * st * s] },
    { a: [g * st, 0], b: [-g * sr * c, -g * sr * s] },
    { a: [Math.sqrt(w), 0], b: [0, 0] },
    { a: [0, 0], b: [Math.sqrt(w), 0] }
  ];
}
/* p(k | x): the joint law divided by the envelope; it sums to 1 for every choice */
function condProb(x, w = S.w, r = S.r, phi = S.phi) {
  const e = Math.sqrt(Math.max(0, r * (1 - r))), c = Math.cos(phaseAt(x) - phi * DEG);
  return [(1 - w) * (0.5 + e * c), (1 - w) * (0.5 - e * c), w / 2, w / 2];
}
const VIS_E = () => 2 * Math.sqrt(Math.max(0, S.r * (1 - S.r)));   // fringe visibility behind the eraser
const KNOW_E = () => Math.abs(2 * S.r - 1);                         // path knowledge behind the eraser
/* overlap of the two path records seen by the whole detector set: Σ_k a_k b̄_k */
function recordOverlap(w, r, phi) {
  let re = 0, im = 0;
  for (const { a, b } of amplitudes(w, r, phi)) { re += a[0] * b[0] + a[1] * b[1]; im += a[1] * b[0] - a[0] * b[1]; }
  return Math.hypot(re, im);
}
/* the normalized envelope on a grid, its inverse CDF, and integrals against the fringe */
let ENV = null;
function buildEnvelope() {
  const xs = new Float64Array(GRID + 1), f = new Float64Array(GRID + 1), cdf = new Float64Array(GRID + 1);
  for (let i = 0; i <= GRID; i++) { xs[i] = -1 + 2 * i / GRID; f[i] = env2(xs[i]); }
  for (let i = 1; i <= GRID; i++) cdf[i] = cdf[i - 1] + (f[i] + f[i - 1]) / 2 * (2 / GRID);
  const Z = cdf[GRID];
  for (let i = 0; i <= GRID; i++) { f[i] /= Z; cdf[i] /= Z; }
  ENV = { xs, f, cdf, Z, W: S.W };
}
function invCDF(u) {
  const { xs, cdf } = ENV;
  let lo = 0, hi = GRID;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid; else hi = mid; }
  const span = cdf[hi] - cdf[lo];
  return xs[lo] + (span > 0 ? (u - cdf[lo]) / span : 0) * (xs[hi] - xs[lo]);
}
/* ∫ f(x)·g(x) dx on [a, b] for the normalized envelope (trapezoid on the fine grid) */
function integrate(g, a = -1, b = 1) {
  const { xs, f } = ENV; let s = 0;
  for (let i = 1; i <= GRID; i++) {
    const x0 = xs[i - 1], x1 = xs[i]; if (x1 <= a || x0 >= b) continue;
    const lo = Math.max(a, x0), hi = Math.min(b, x1), xm = (lo + hi) / 2, fm = f[i - 1] + (f[i] - f[i - 1]) * (xm - x0) / (x1 - x0);
    s += fm * g(xm) * (hi - lo);
  }
  return s;
}
/* lowest delay elements: a coil on the idler side for Δ ≥ 1 ns, on the signal side otherwise */
const sigDelay = () => Math.max(0, 1 - S.delta);
const idlDelay = () => Math.max(0, S.delta - 1);
function relation(dt = S.delta) {
  if (Math.abs(dt - SEP_NS) < 1e-9) return 'light-after';
  if (Math.abs(dt + SEP_NS) < 1e-9) return 'light-before';
  if (dt > SEP_NS) return 'future';
  if (dt < -SEP_NS) return 'past';
  return 'spacelike';
}
const tailNs = () => Math.max(SIG_FLIGHT + sigDelay() + CABLE_D0, IDL_FLIGHT + idlDelay() + DET_LAG + CABLE_ID) + 10;
const tEnd = () => E_WIN + tailNs();
const tNow = () => S.nowFrac * tEnd();
const schedAt = (t) => { let s = S.sched[0].set; for (const e of S.sched) if (e.t <= t) s = e.set; return s; };

/* =====================================================================
   4. This run's pairs (fixed seeds)
   ===================================================================== */
const seed = mulberry32(0xE2A5E7);
const U_X = new Float64Array(N_MAX), U_J = new Float64Array(N_MAX), U_ROUTE = new Float64Array(N_MAX), U_DET = new Float64Array(N_MAX), U_H = new Float64Array(N_MAX);
for (let i = 0; i < N_MAX; i++) { U_X[i] = seed(); U_J[i] = seed(); U_ROUTE[i] = seed(); U_DET[i] = seed(); U_H[i] = seed(); }
const RUN = {
  x: new Float64Array(N_MAX), te: new Float64Array(N_MAX), t0: new Float64Array(N_MAX), tc: new Float64Array(N_MAX),
  ti: new Float64Array(N_MAX), tcc: new Float64Array(N_MAX), route: new Uint8Array(N_MAX), det: new Int8Array(N_MAX),
  hD0: '--------', hLab: '--------', nP: 0
};
function fnv(bytes) { let h = 0x811c9dc5; for (const v of bytes) { h ^= v & 0xff; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
let dirtyRun = true;
function resampleRun() {
  if (!ENV || ENV.W !== S.W) buildEnvelope();
  const s = sigDelay(), id = idlDelay(), e = Math.sqrt(Math.max(0, S.r * (1 - S.r)));
  const posBytes = [S.N & 0xff, S.N >> 8], labBytes = [];
  let nP = 0;
  for (let i = 0; i < S.N; i++) {
    const x = invCDF(U_X[i]);
    RUN.x[i] = x;
    const te = E_WIN * (i + U_J[i]) / S.N;
    RUN.te[i] = te; RUN.t0[i] = te + SIG_FLIGHT + s; RUN.tc[i] = te + IDL_FLIGHT + id; RUN.ti[i] = RUN.tc[i] + DET_LAG;
    RUN.tcc[i] = Math.max(RUN.t0[i] + CABLE_D0, RUN.ti[i] + CABLE_ID);
    const path = S.mode === 'bs' ? U_ROUTE[i] < S.w : schedAt(RUN.tc[i]) === 'P';
    RUN.route[i] = path ? 1 : 0; if (path) nP++;
    RUN.det[i] = path ? (U_DET[i] < 0.5 ? 2 : 3) : (U_DET[i] < 0.5 + e * Math.cos(phaseAt(x) - S.phi * DEG) ? 0 : 1);
    const q = Math.round((x + 1) * 16383);
    posBytes.push(q & 0xff, q >> 8); labBytes.push(RUN.det[i]);
  }
  RUN.nP = nP; RUN.hD0 = fnv(posBytes); RUN.hLab = fnv(labBytes);
}
/* what the lab holds at time t */
function tally(t) {
  const counts = [0, 0, 0, 0]; let shown = 0, labeled = 0, nE = 0, nP = 0, waiting = 0;
  for (let i = 0; i < S.N; i++) {
    if (RUN.t0[i] > t) continue;
    shown++;
    if (RUN.tcc[i] <= t) { labeled++; counts[RUN.det[i]]++; if (RUN.route[i]) nP++; else nE++; }
    else if (RUN.tc[i] > t) waiting++;                    // hit printed, twin not yet at the splitter
  }
  return { shown, labeled, counts, nE, nP, waiting, inFlight: shown - labeled };
}
const latestPair = (t) => { let lo = -1, hi = S.N - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (RUN.t0[mid] <= t) lo = mid; else hi = mid - 1; } return lo; };
const shownPair = () => (S.selPair >= 0 && S.selPair < S.N ? S.selPair : Math.max(0, latestPair(tNow())));
/* the five events of pair i relative to its emission, as (metres, ns) */
function pairEvents(i) {
  const te = RUN.te[i];
  return { emit: [0, 0], d0: [X_D0, RUN.t0[i] - te], choice: [X_CHOICE, RUN.tc[i] - te], idet: [X_IDET, RUN.ti[i] - te], cc: [X_CC, RUN.tcc[i] - te] };
}
/* the D0 law under the current choice and under the two extreme choices: the largest difference and the choice–hit information */
function choiceBlindness() {
  let diff = 0;
  const wNow = S.mode === 'bs' ? S.w : RUN.nP / Math.max(1, S.N);
  for (let i = 0; i <= 400; i++) {
    const x = -1 + i / 200, sum = (p) => p[0] + p[1] + p[2] + p[3];
    const a = sum(condProb(x, wNow)), b = sum(condProb(x, 0, 0.5, 0)), c = sum(condProb(x, 1, S.r, S.phi));
    diff = Math.max(diff, Math.abs(a - b), Math.abs(a - c));
  }
  // I(choice : x) for a fair choice between "erase all" and "measure all paths": both conditionals are f(x)·Σ_k p(k|x)
  const mi = integrate((x) => { const pe = condProb(x, 0).reduce((u, v) => u + v), pp = condProb(x, 1).reduce((u, v) => u + v), m = (pe + pp) / 2; return 0.5 * pe * Math.log2(pe / m) + 0.5 * pp * Math.log2(pp / m); });
  return { diff, mi: Math.abs(mi) < 1e-15 ? 0 : mi };
}
function detectorShares(nE, nP) {
  const e = Math.sqrt(Math.max(0, S.r * (1 - S.r))), tot = nE + nP;
  const fr = integrate((x) => Math.cos(phaseAt(x) - S.phi * DEG));
  const wE = tot ? nE / tot : 1 - (S.mode === 'bs' ? S.w : RUN.nP / Math.max(1, S.N)), wP = 1 - wE;
  return [wE * (0.5 + e * fr), wE * (0.5 - e * fr), wP / 2, wP / 2];
}

/* =====================================================================
   5. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags');
const cvHist = $('hist'), cvST = $('spacetime'), cvComp = $('comp');
const fmtNs = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v)} ns`;
const relText = (rel) => ({
  future: T('选择在 D0 点击的未来光锥里', 'choice inside the D0 click’s future light cone'),
  'light-after': T('选择恰在 D0 点击的光锥上', 'choice exactly on the D0 click’s light cone'),
  spacelike: T('类空：先后取决于参考系', 'spacelike: the order depends on the frame'),
  'light-before': T('D0 点击恰在选择的光锥上', 'D0 click exactly on the choice’s light cone'),
  past: T('D0 点击在选择的未来光锥里', 'D0 click inside the choice’s future light cone')
}[rel]);
const relShort = (rel) => ({ future: T('之后·类时', 'after·timelike'), 'light-after': T('类光', 'lightlike'), spacelike: T('类空', 'spacelike'), 'light-before': T('类光', 'lightlike'), past: T('之前·类时', 'before·timelike') }[rel]);

/* =====================================================================
   6. Three.js scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false;
let hitPts, flyPts, glyphPts, selPts, optLines;
const TARGETS = { iso: [1.0, 0.25, 0.35], top: [0.7, 0, 0.3], screen: [-3.2, 0.7, 0] };
const CAMS = { iso: [0.66, 1.0, 9.9], top: [0, 0.05, 9.4], screen: [Math.PI / 2, 1.42, 4.6] };
const cam = { theta: 0.66, phi: 1.0, r: 9.9, tTheta: 0.66, tPhi: 1.0, tR: 9.9, tgt: [1.0, 0.25, 0.35], tTgt: [1.0, 0.25, 0.35] };
const P = {                                             // scene positions (x, y, z): table in x–z, y up
  src: [0, 0, 0], sCoil0: [-0.9, 0, 0], sCoil1: [-1.7, 0, 0], lens: [-2.3, 0, 0],
  iCoil0: [0.5, 0, 0], iCoil1: [1.3, 0, 0], prism: [1.8, 0, 0],
  bsA: [2.6, 0, -0.9], bsB: [2.6, 0, 0.9], mA: [3.4, 0, -0.9], mB: [3.4, 0, 0.9], bs: [4.1, 0, 0],
  det: [[4.8, 0, -0.6], [4.8, 0, 0.6], [2.6, 0, -1.7], [2.6, 0, 1.7]], cc: [0.6, 0, 2.5], screenX: -3.2
};
const SCREEN_HALF = 1.5, SCREEN_H = 1.4;
const hitPos = (i) => [P.screenX, 0.06 + (SCREEN_H - 0.12) * U_H[i], SCREEN_HALF * RUN.x[i]];
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
    d.textContent = T('这个浏览器没有提供 WebGL，三维视图无法显示。下方的符合分拣、时空图和右侧读数仍然可用。', 'This browser does not provide WebGL, so the 3D view cannot be shown. The coincidence sorting, the spacetime diagram and the readouts still work.');
    stage.appendChild(d); return;
  }
  glOK = true;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x02040a, 1);
  scene3 = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const g = new THREE.BufferGeometry(); dyn(g, 'position', 6000, 3); dyn(g, 'color', 6000, 3);
  optLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, ...additive }));
  optLines.frustumCulled = false; scene3.add(optLines);
  const pts = (n, fs) => {
    const gg = new THREE.BufferGeometry(); dyn(gg, 'position', n, 3); dyn(gg, 'aColor', n, 3); dyn(gg, 'aAlpha', n, 1); dyn(gg, 'aSize', n, 1);
    const m = new THREE.Points(gg, new THREE.ShaderMaterial({ vertexShader: EVT_VS, fragmentShader: fs, uniforms: { uScale: { value: 60 } }, ...additive }));
    m.frustumCulled = false; scene3.add(m); return m;
  };
  hitPts = pts(N_MAX, EVT_FS);
  flyPts = pts(N_MAX * 3, EVT_FS);
  glyphPts = pts(7, RING_FS);
  selPts = pts(1, RING_FS);
}
/* a helix around the table axis between two points, for a delay line of d ns */
const coilTurns = (d) => (d > 0 ? Math.max(2, Math.round(2 + 4 * Math.log10(1 + d))) : 0);
function coilPoint(p0, p1, d, s) {
  const turns = coilTurns(d), R = 0.2, a = 2 * Math.PI * turns * s;
  return [p0[0] + (p1[0] - p0[0]) * s, R * Math.sin(a), R * (1 - Math.cos(a)) * 0.6];
}
const lerp3 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
/* position along a polyline with knot times */
function along(knots, t) {
  for (let k = 1; k < knots.length; k++) {
    const [ta, pa] = knots[k - 1], [tb, pb] = knots[k];
    if (t <= tb) return typeof pb === 'function' ? pb((t - ta) / Math.max(1e-9, tb - ta)) : lerp3(pa, pb, (t - ta) / Math.max(1e-9, tb - ta));
  }
  const last = knots[knots.length - 1][1]; return typeof last === 'function' ? last(1) : last;
}
function buildOptics() {
  const Pp = optLines.geometry.attributes.position.array, Cc = optLines.geometry.attributes.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > Pp.length / 3) return; const c = col.map((x) => x * k); Pp.set(a, 3 * v); Cc.set(c, 3 * v); v++; Pp.set(b, 3 * v); Cc.set(c, 3 * v); v++; };
  const poly = (pts, col, k) => { for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i], col, k); };
  const box = (c, hx, hz, col, k) => { const y = 0.001; poly([[c[0] - hx, y, c[2] - hz], [c[0] + hx, y, c[2] - hz], [c[0] + hx, y, c[2] + hz], [c[0] - hx, y, c[2] + hz], [c[0] - hx, y, c[2] - hz]], col, k); };
  const splitter = (c, dir, col, k) => { const d = 0.16; seg([c[0] - d, 0, c[2] - d * dir], [c[0] + d, 0, c[2] + d * dir], col, k); box(c, 0.12, 0.12, col, k * 0.4); };
  // table grid
  for (let x = -3.5; x <= 5.01; x += 0.5) seg([x, -0.02, -2.0], [x, -0.02, 2.8], COL.sigma, 0.035);
  for (let z = -2.0; z <= 2.81; z += 0.4) seg([-3.5, -0.02, z], [5.0, -0.02, z], COL.sigma, 0.035);
  // signal arm with its optional delay line
  const sd = sigDelay(), id = idlDelay();
  seg(P.src, P.sCoil0, COL.sigma, 0.35);
  if (sd > 0) { const n = 160; for (let i = 0; i < n; i++) seg(coilPoint(P.sCoil0, P.sCoil1, sd, i / n), coilPoint(P.sCoil0, P.sCoil1, sd, (i + 1) / n), COL.sigma, 0.17); }
  else seg(P.sCoil0, P.sCoil1, COL.sigma, 0.35);
  seg(P.sCoil1, P.lens, COL.sigma, 0.35);
  for (const zz of [-SCREEN_HALF, SCREEN_HALF]) seg(P.lens, [P.screenX, 0, zz], COL.sigma, 0.12);
  poly([[-2.3, -0.25, 0], [-2.3, 0.25, 0]], COL.sigma, 0.6);       // lens
  const sx = P.screenX;                                              // the D0 screen
  poly([[sx, 0, -SCREEN_HALF], [sx, SCREEN_H, -SCREEN_HALF], [sx, SCREEN_H, SCREEN_HALF], [sx, 0, SCREEN_HALF], [sx, 0, -SCREEN_HALF]], COL.sigma, 0.45);
  for (let k = 1; k < 8; k++) { const z = -SCREEN_HALF + 2 * SCREEN_HALF * k / 8; seg([sx, 0, z], [sx, SCREEN_H, z], COL.sigma, 0.05); }
  // idler arm: delay line, prism, routing splitters, path detectors, eraser
  seg(P.src, P.iCoil0, COL.sigma, 0.35);
  if (id > 0) { const n = 260; for (let i = 0; i < n; i++) seg(coilPoint(P.iCoil0, P.iCoil1, id, i / n), coilPoint(P.iCoil0, P.iCoil1, id, (i + 1) / n), COL.sigma, 0.17); }
  else seg(P.iCoil0, P.iCoil1, COL.sigma, 0.35);
  seg(P.iCoil1, P.prism, COL.sigma, 0.35);
  box(P.prism, 0.1, 0.16, COL.sigma, 0.6);
  const wP = S.mode === 'bs' ? S.w : (schedAt(tNow()) === 'P' ? 1 : 0), wE = 1 - wP;
  seg(P.prism, P.bsA, COL.sigma, 0.3); seg(P.prism, P.bsB, COL.sigma, 0.3);
  splitter(P.bsA, 1, COL.amber, 0.25 + 0.6 * wP); splitter(P.bsB, -1, COL.amber, 0.25 + 0.6 * wP);
  seg(P.bsA, P.det[2], COL.amber, 0.12 + 0.4 * wP); seg(P.bsB, P.det[3], [0.27, 1.0, 0.7], 0.12 + 0.4 * wP);
  seg(P.bsA, P.mA, COL.cyan, 0.08 + 0.35 * wE); seg(P.bsB, P.mB, COL.cyan, 0.08 + 0.35 * wE);
  seg(P.mA, P.bs, COL.cyan, 0.08 + 0.35 * wE); seg(P.mB, P.bs, COL.cyan, 0.08 + 0.35 * wE);
  box(P.mA, 0.04, 0.14, COL.sigma, 0.6); box(P.mB, 0.04, 0.14, COL.sigma, 0.6);
  splitter(P.bs, 1, COL.cyan, 0.85);
  seg(P.bs, P.det[0], COL.cyan, 0.4); seg(P.bs, P.det[1], COL.magenta, 0.4);
  // coincidence counter and its cables
  box(P.cc, 0.32, 0.18, COL.amber, 0.8);
  const cab = (a) => seg([a[0], -0.01, a[2]], [P.cc[0], -0.01, P.cc[2]], COL.sigma, 0.07);
  cab([sx, 0, 0]); for (const d of P.det) cab(d);
  optLines.geometry.setDrawRange(0, v);
  optLines.geometry.attributes.position.needsUpdate = true; optLines.geometry.attributes.color.needsUpdate = true;
}
let opticsKey = '';
function updateGL(time) {
  const t = tNow(), N = S.N;
  const key = `${S.delta}|${S.mode}|${S.w}|${S.mode === 'switch' ? schedAt(t) : ''}`;
  if (key !== opticsKey) { opticsKey = key; buildOptics(); }
  // hits on the D0 screen: grey until the coincidence counter has the idler's pulse
  const H = hitPts.geometry.attributes; let nh = 0;
  for (let i = 0; i < N; i++) {
    if (RUN.t0[i] > t) continue;
    const lab = RUN.tcc[i] <= t, d = RUN.det[i], fresh = Math.max(0, 1 - (t - RUN.t0[i]) / 3);
    let a = lab ? 0.85 : 0.5;
    if (S.selDet >= 0 && (!lab || d !== S.selDet)) a = 0.06;
    H.position.array.set(hitPos(i), 3 * nh);
    H.aColor.array.set(lab ? DET_RGB[d] : COL.gray, 3 * nh);
    H.aAlpha.array[nh] = Math.min(1, a + fresh); H.aSize.array[nh] = (lab ? 0.95 : 0.8) + fresh * 1.6;
    nh++;
  }
  hitPts.geometry.setDrawRange(0, nh);
  for (const a of [H.position, H.aColor, H.aAlpha, H.aSize]) a.needsUpdate = true;
  // photons and electrical pulses in flight
  const F = flyPts.geometry.attributes; let nf = 0;
  const put = (pos, col, a, sz) => { if (nf >= N_MAX * 3) return; F.position.array.set(pos, 3 * nf); F.aColor.array.set(col, 3 * nf); F.aAlpha.array[nf] = a; F.aSize.array[nf] = sz; nf++; };
  const sd = sigDelay(), id = idlDelay();
  const sigKnots = (i) => { const te = RUN.te[i]; return [[te, P.src], [te + 1, P.sCoil0], [te + 1 + sd, (s) => coilPoint(P.sCoil0, P.sCoil1, sd, s)], [te + 2 + sd, P.lens], [RUN.t0[i], hitPos(i)]]; };
  for (let i = 0; i < N; i++) {
    const te = RUN.te[i]; if (te > t || RUN.tcc[i] + 0.2 < t) continue;
    const d = RUN.det[i];
    if (t < RUN.t0[i]) put(along(sigKnots(i), t), COL.pre, 0.75, 1.0);
    else if (t < RUN.t0[i] + CABLE_D0) put(lerp3([P.screenX, 0, 0], P.cc, (t - RUN.t0[i]) / CABLE_D0), COL.gray, 0.55, 0.7);
    const tc = RUN.tc[i];
    if (t < tc) {
      const k0 = [[te, P.src], [te + 1, P.iCoil0], [te + 1 + id, (s) => coilPoint(P.iCoil0, P.iCoil1, id, s)], [te + 3 + id, P.prism]];
      if (t < te + 3 + id) put(along(k0, t), COL.pre, 0.6, 0.9);
      else { const f = (t - (te + 3 + id)) / 2; put(lerp3(P.prism, P.bsA, f), COL.pre, 0.45, 0.8); put(lerp3(P.prism, P.bsB, f), COL.pre, 0.45, 0.8); }
    } else if (t < RUN.ti[i]) {
      const f = (t - tc) / DET_LAG;
      if (RUN.route[i]) put(lerp3(d === 2 ? P.bsA : P.bsB, P.det[d], f), DET_RGB[d], 0.8, 0.9);
      else if (f < 0.6) { const g2 = f / 0.6; put(g2 < 0.45 ? lerp3(P.bsA, P.mA, g2 / 0.45) : lerp3(P.mA, P.bs, (g2 - 0.45) / 0.55), COL.pre, 0.45, 0.8); put(g2 < 0.45 ? lerp3(P.bsB, P.mB, g2 / 0.45) : lerp3(P.mB, P.bs, (g2 - 0.45) / 0.55), COL.pre, 0.45, 0.8); }
      else put(lerp3(P.bs, P.det[d], (f - 0.6) / 0.4), DET_RGB[d], 0.8, 0.9);
    } else if (t < RUN.ti[i] + CABLE_ID) put(lerp3(P.det[d], P.cc, (t - RUN.ti[i]) / CABLE_ID), DET_RGB[d], 0.6, 0.7);
  }
  flyPts.geometry.setDrawRange(0, nf);
  for (const a of [F.position, F.aColor, F.aAlpha, F.aSize]) a.needsUpdate = true;
  // detectors flash on a click, the counter on a coincidence
  const flash = [0, 0, 0, 0]; let ccFlash = 0;
  for (let i = 0; i < N; i++) {
    const dt = t - RUN.ti[i]; if (dt >= 0 && dt < 1.5) flash[RUN.det[i]] = Math.max(flash[RUN.det[i]], 1 - dt / 1.5);
    const dc = t - RUN.tcc[i]; if (dc >= 0 && dc < 1.5) ccFlash = Math.max(ccFlash, 1 - dc / 1.5);
  }
  const G = glyphPts.geometry.attributes;
  for (let k = 0; k < 4; k++) {
    G.position.array.set(P.det[k], 3 * k); G.aColor.array.set(DET_RGB[k], 3 * k);
    G.aAlpha.array[k] = S.selDet >= 0 && S.selDet !== k ? 0.35 : 0.75 + 0.25 * flash[k]; G.aSize.array[k] = 2.2 + 1.6 * flash[k] + (S.selDet === k ? 0.8 : 0);
  }
  G.position.array.set(P.cc, 12); G.aColor.array.set(COL.amber, 12); G.aAlpha.array[4] = 0.6 + 0.4 * ccFlash; G.aSize.array[4] = 2.4 + 1.4 * ccFlash;
  G.position.array.set(P.src, 15); G.aColor.array.set(COL.magenta, 15); G.aAlpha.array[5] = 0.7 + 0.2 * Math.sin(time * 4); G.aSize.array[5] = 1.8;
  G.position.array.set([P.bs[0], 0, P.bs[2]], 18); G.aColor.array.set(COL.cyan, 18); G.aAlpha.array[6] = 0; G.aSize.array[6] = 0;
  for (const a of [G.position, G.aColor, G.aAlpha, G.aSize]) a.needsUpdate = true;
  const SP = selPts.geometry.attributes;
  if (S.selPair >= 0 && S.selPair < N && RUN.t0[S.selPair] <= t) { SP.position.array.set(hitPos(S.selPair), 0); SP.aColor.array.set(COL.amber, 0); SP.aAlpha.array[0] = 1; SP.aSize.array[0] = 2.6; }
  else SP.aAlpha.array[0] = 0;
  for (const a of [SP.position, SP.aColor, SP.aAlpha, SP.aSize]) a.needsUpdate = true;
  const scale = 58 * renderer.getPixelRatio();
  for (const m of [hitPts, flyPts, glyphPts, selPts]) m.material.uniforms.uScale.value = scale;
}

/* =====================================================================
   7. Camera and picking
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  for (let i = 0; i < 3; i++) cam.tgt[i] += (cam.tTgt[i] - cam.tgt[i]) * k;
  const sp = Math.sin(cam.phi), [tx, ty, tz] = cam.tgt;
  camera.position.set(tx + cam.r * sp * Math.sin(cam.theta), ty + cam.r * Math.cos(cam.phi), tz + cam.r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(tx, ty, tz);
}
const drag = { x: 0, y: 0, moved: 0, pts: new Map(), pinch: 0 };
function setCamPreset(name) {
  const p = CAMS[name]; if (!p) return;
  let d = (p[0] - cam.theta) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  cam.tTheta = cam.theta + d; cam.tPhi = p[1]; cam.tR = p[2]; cam.tTgt = TARGETS[name].slice();
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === name)));
}
function projectToStage(v) { const rect = stage.getBoundingClientRect(), p = v.clone().project(camera); return { x: (p.x * 0.5 + 0.5) * rect.width, y: (-p.y * 0.5 + 0.5) * rect.height, z: p.z }; }
const proj = (p) => projectToStage(new THREE.Vector3(p[0], p[1], p[2]));
function pickAt(px, py) {
  if (!glOK) return;
  let best = -1, bd = 24 * 24;
  const visible = (q) => q.z > -1 && q.z < 1;            // ignore anything behind the camera
  for (let k = 0; k < 4; k++) { const q = proj(P.det[k]), d = (q.x - px) ** 2 + (q.y - py) ** 2; if (visible(q) && d < bd) { bd = d; best = k; } }
  if (best >= 0) { selectDetector(S.selDet === best ? -1 : best); return; }
  const t = tNow(); let bi = -1, bh = 10 * 10;
  for (let i = 0; i < S.N; i++) { if (RUN.t0[i] > t) continue; const q = proj(hitPos(i)), d = (q.x - px) ** 2 + (q.y - py) ** 2; if (visible(q) && d < bh) { bh = d; bi = i; } }
  if (bi >= 0) selectPair(bi);
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
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(20, Math.max(2.5, cam.tR * drag.pinch / d)); drag.pinch = d; drag.moved += 10; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
  drag.x = ev.clientX; drag.y = ev.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
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
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(20, Math.max(2.5, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   8. Tags
   ===================================================================== */
function mkTag(cls, text) { const el = document.createElement('div'); el.className = 'tag ' + cls; el.textContent = text; tagsBox.appendChild(el); return el; }
const tagSrc = mkTag('', ''), tagD0 = mkTag('', ''), tagCoil = mkTag('', ''), tagChoice = mkTag('hot', ''), tagBS = mkTag('cy', ''), tagCC = mkTag('hot', '');
const detTags = DET_NAME.map((n) => mkTag('', n));
function labelStaticTags() {
  tagSrc.textContent = T('双缝光源 A · B', 'TWO-SLIT SOURCE A · B'); tagD0.textContent = T('D0 屏', 'D0 SCREEN');
  tagCoil.textContent = T('延迟线', 'DELAY LINE'); tagChoice.textContent = T('选择 BS_A · BS_B', 'CHOICE BS_A · BS_B');
  tagBS.textContent = T('擦除分束器', 'ERASER BS'); tagCC.textContent = T('符合计数器', 'COINCIDENCE COUNTER');
}
labelStaticTags();
function placeTag(el, p, show = true) {
  if (!glOK || !show) { el.style.display = 'none'; return; }
  const q2 = proj(p);
  if (q2.z > 1 || q2.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.style.left = q2.x + 'px'; el.style.top = q2.y + 'px';
}
function updateTags() {
  placeTag(tagSrc, [-0.55, -0.05, 0.55]);
  placeTag(tagD0, [P.screenX, SCREEN_H + 0.18, 0]);
  const sd = sigDelay(), id = idlDelay();
  placeTag(tagCoil, sd > 0 ? [-1.3, 0.62, 0] : [0.9, 0.62, 0], sd > 0 || id > 0);
  placeTag(tagChoice, [2.6, 0.3, 0]);
  placeTag(tagBS, [P.bs[0], 0.3, P.bs[2]]);
  placeTag(tagCC, [P.cc[0], 0.3, P.cc[2] + 0.1]);
  for (let k = 0; k < 4; k++) placeTag(detTags[k], [P.det[k][0], 0.28, P.det[k][2]]);
}

/* =====================================================================
   9. 2D panels
   ===================================================================== */
let tallyNow = { shown: 0, labeled: 0, counts: [0, 0, 0, 0], nE: 0, nP: 0, waiting: 0, inFlight: 0 };
const HIST_PANELS = 5;
function histLayout(W, Hh, dpr) {
  const pl = 8 * dpr, pr = 8 * dpr, pt = 18 * dpr, pb = 14 * dpr, gap = 8 * dpr;
  const pw = (W - pl - pr - gap * (HIST_PANELS - 1)) / HIST_PANELS;
  return { pl, pt, pb, gap, pw, ih: Hh - pt - pb };
}
let massCache = { key: '', m0: null, mc: null };
function binMasses() {                                   // ∫_bin f and ∫_bin f·cos(2πx/Λ − φ), recomputed only when they change
  const key = `${S.W}|${S.db}|${S.phi}`;
  if (massCache.key === key && ENV && ENV.W === S.W) return massCache;
  const m0 = new Float64Array(BINS), mc = new Float64Array(BINS);
  for (let b = 0; b < BINS; b++) {
    const a = -1 + 2 * b / BINS, c = a + 2 / BINS;
    m0[b] = integrate(() => 1, a, c); mc[b] = integrate((x) => Math.cos(phaseAt(x) - S.phi * DEG), a, c);
  }
  massCache = { key, m0, mc }; return massCache;
}
function drawHist() {
  const dpr = fitCanvas(cvHist), ctx = cvHist.getContext('2d'), W = cvHist.width, Hh = cvHist.height;
  ctx.clearRect(0, 0, W, Hh);
  const L = histLayout(W, Hh, dpr);
  if (L.pw < 24 || L.ih < 30) return;
  const t = tNow(), N = S.N;
  const bins = Array.from({ length: HIST_PANELS }, () => new Float64Array(BINS));
  for (let i = 0; i < N; i++) {
    if (RUN.t0[i] > t) continue;
    const b = Math.min(BINS - 1, Math.max(0, Math.floor((RUN.x[i] + 1) / 2 * BINS)));
    bins[0][b]++;
    if (RUN.tcc[i] <= t) bins[1 + RUN.det[i]][b]++;
  }
  // expected counts per bin: the routes are independent of x, so each panel is (pairs on that route) × ∫_bin f · p(k | x, route)
  const e = Math.sqrt(Math.max(0, S.r * (1 - S.r))), masses = binMasses();
  const tn = tallyNow, expect = Array.from({ length: HIST_PANELS }, () => new Float64Array(BINS));
  for (let b = 0; b < BINS; b++) {
    const m0 = masses.m0[b], mc = masses.mc[b];
    expect[0][b] = tn.shown * m0;
    expect[1][b] = tn.nE * (0.5 * m0 + e * mc); expect[2][b] = tn.nE * (0.5 * m0 - e * mc);
    expect[3][b] = tn.nP * 0.5 * m0; expect[4][b] = tn.nP * 0.5 * m0;
  }
  const titles = [T('D0 全部落点', 'D0 · all hits'), 'R01 · D1', 'R02 · D2', 'R03 · D3', 'R04 · D4'];
  const cols = [SG, CY, MG, AM, OK];
  for (let p = 0; p < HIST_PANELS; p++) {
    const x0 = L.pl + p * (L.pw + L.gap), y0 = L.pt, sel = S.selDet >= 0 && p === S.selDet + 1, dimmed = S.selDet >= 0 && p > 0 && !sel;
    const top = Math.max(1, ...bins[p], ...expect[p]) * 1.12;
    ctx.globalAlpha = dimmed ? 0.35 : 1;
    ctx.strokeStyle = sel ? AM : FAINT; ctx.lineWidth = (sel ? 1.6 : 1) * dpr; ctx.strokeRect(x0, y0, L.pw, L.ih);
    const bw = L.pw / BINS;
    ctx.fillStyle = cols[p]; ctx.globalAlpha = (dimmed ? 0.35 : 1) * (p === 0 ? 0.45 : 0.6);
    for (let b = 0; b < BINS; b++) { const h = bins[p][b] / top * L.ih; ctx.fillRect(x0 + b * bw + 0.5 * dpr, y0 + L.ih - h, Math.max(1, bw - 1 * dpr), h); }
    ctx.globalAlpha = dimmed ? 0.35 : 1;
    ctx.strokeStyle = p === 0 ? INK : cols[p]; ctx.lineWidth = 1.4 * dpr; ctx.setLineDash(p === 0 ? [4 * dpr, 3 * dpr] : []);
    ctx.beginPath();
    for (let b = 0; b < BINS; b++) { const xx = x0 + (b + 0.5) * bw, yy = y0 + L.ih - expect[p][b] / top * L.ih; if (b) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = sel ? AM : (p === 0 ? INK : cols[p]); ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(titles[p], x0 + 2 * dpr, y0 - 3 * dpr);
    ctx.fillStyle = DIM; ctx.font = `${9 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    const n = p === 0 ? tn.shown : tn.counts[p - 1];
    ctx.fillText(String(n), x0 + L.pw - 3 * dpr, y0 + 3 * dpr);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = DIM; ctx.font = `${9 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(T('柱：计数 · 线：理论期望', 'bars: counts · line: expected'), L.pl, L.pt + L.ih + 2 * dpr);
  $('histMeta').textContent = T(`落点 ${tn.shown} · 已分拣 ${tn.labeled} · 标签在途 ${tn.inFlight}`, `hits ${tn.shown} · sorted ${tn.labeled} · labels in flight ${tn.inFlight}`);
}
cvHist.addEventListener('click', (ev) => {
  const r = cvHist.getBoundingClientRect(), dpr = cvHist.width / Math.max(1, r.width), L = histLayout(cvHist.width, cvHist.height, dpr);
  const x = (ev.clientX - r.left) * dpr, p = Math.floor((x - L.pl + L.gap / 2) / (L.pw + L.gap));
  if (p <= 0) selectDetector(-1); else if (p < HIST_PANELS) selectDetector(S.selDet === p - 1 ? -1 : p - 1);
});
function drawSpacetime() {
  // time runs to the right and position up, so the wide strip holds long delays; light cones open to the right
  const dpr = fitCanvas(cvST), ctx = cvST.getContext('2d'), W = cvST.width, Hh = cvST.height;
  ctx.clearRect(0, 0, W, Hh);
  const pl = 52 * dpr, pr = 14 * dpr, pt = 10 * dpr, pb = 28 * dpr, iw = W - pl - pr, ih = Hh - pt - pb;
  if (iw < 60 || ih < 40 || S.N < 1) return;
  const i = shownPair(), ev = pairEvents(i), now = tNow() - RUN.te[i];
  const tMin = Math.min(-1, ev.choice[1] - 2, ev.d0[1] - 2), tMax = Math.max(ev.cc[1], ev.d0[1]) + Math.max(3, 0.06 * (ev.cc[1] + 4));
  const mMin = -1.45, mMax = 2.05;
  const X = (ns) => pl + (ns - tMin) / (tMax - tMin) * iw, Y = (m) => pt + ih - (m - mMin) / (mMax - mMin) * ih;
  ctx.save(); ctx.beginPath(); ctx.rect(pl, pt, iw, ih); ctx.clip();
  const cone = (e, col) => {
    const [m0, t0] = e, reach = (tMax - t0) * C_M;
    ctx.fillStyle = col; ctx.globalAlpha = 0.1;
    ctx.beginPath(); ctx.moveTo(X(t0), Y(m0)); ctx.lineTo(X(tMax), Y(m0 + reach)); ctx.lineTo(X(tMax), Y(m0 - reach)); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.6; ctx.strokeStyle = col; ctx.lineWidth = 1 * dpr; ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.beginPath(); ctx.moveTo(X(tMax), Y(m0 + reach)); ctx.lineTo(X(t0), Y(m0)); ctx.lineTo(X(tMax), Y(m0 - reach)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  };
  const route = RUN.route[i], lab = RUN.tcc[i] <= tNow(), dcol = DET_CSS[RUN.det[i]];
  cone(ev.d0, SG); cone(ev.choice, route ? AM : CY);
  ctx.strokeStyle = FAINT; ctx.lineWidth = 1 * dpr; ctx.globalAlpha = 0.7; ctx.beginPath();
  for (const m of [X_D0, X_CC, X_CHOICE, X_IDET]) { ctx.moveTo(pl, Y(m)); ctx.lineTo(pl + iw, Y(m)); }
  ctx.stroke(); ctx.globalAlpha = 1;
  // world lines (a delay coil holds the photon in place), then the cables to the counter
  const sd = sigDelay(), id = idlDelay();
  const line = (pts, col, w, dash) => { ctx.strokeStyle = col; ctx.lineWidth = w * dpr; ctx.setLineDash(dash ? [4 * dpr, 3 * dpr] : []); ctx.beginPath(); pts.forEach(([m, ns], k) => (k ? ctx.lineTo(X(ns), Y(m)) : ctx.moveTo(X(ns), Y(m)))); ctx.stroke(); ctx.setLineDash([]); };
  line([[0, 0], [X_SCOIL, 2], [X_SCOIL, 2 + sd], [X_D0, 4 + sd]], INK, 1.6);
  line([[0, 0], [X_ICOIL, 2], [X_ICOIL, 2 + id], [X_CHOICE, 5 + id], [X_IDET, 6 + id]], INK, 1.6);
  line([ev.d0, [X_CC, ev.d0[1] + CABLE_D0]], DIM, 1.2, true);
  line([ev.idet, [X_CC, ev.idet[1] + CABLE_ID]], dcol, 1.2, true);
  if (now > tMin && now < tMax) {
    ctx.strokeStyle = AM; ctx.globalAlpha = 0.6; ctx.lineWidth = 1 * dpr; ctx.beginPath(); ctx.moveTo(X(now), pt); ctx.lineTo(X(now), pt + ih); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = AM; ctx.font = `${9 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(T('现在', 'now'), X(now) + 3 * dpr, pt + 2 * dpr);
  }
  ctx.restore();
  const dot = (e, col, r, label, dy) => {
    const x = X(e[1]), y = Y(e[0]);
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8 * dpr; ctx.beginPath(); ctx.arc(x, y, r * dpr, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width, right = x + (r + 4) * dpr + w < pl + iw;
    ctx.textAlign = right ? 'left' : 'right'; ctx.fillStyle = INK;
    ctx.fillText(label, x + (right ? 1 : -1) * (r + 4) * dpr, y + dy * dpr);
  };
  dot(ev.emit, MG, 3.5, T('发射', 'emission'), 0);
  dot(ev.d0, lab ? dcol : SG, 4, T('D0 点击', 'D0 click'), 0);
  dot(ev.choice, route ? AM : CY, 4, route ? T('选择：测路径', 'choice: path') : T('选择：擦除', 'choice: erase'), 9);
  dot(ev.idet, dcol, 3.5, DET_NAME[RUN.det[i]], -8);
  dot(ev.cc, AM, 4.5, T('符合 · 贴标签', 'coincidence · label'), 0);
  ctx.fillStyle = DIM; ctx.font = `${9 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  [[X_D0, 'D0', 0], [X_CC, T('源·计数', 'src·cnt'), 0], [X_CHOICE, 'BS', 4], [X_IDET, 'D1–4', -4]].forEach(([m, n, dy]) => ctx.fillText(n, pl - 5 * dpr, Y(m) + dy * dpr));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const span = tMax - tMin, step = span > 240 ? 100 : span > 100 ? 50 : span > 40 ? 10 : 5;
  for (let ns = Math.ceil(tMin / step) * step; ns <= tMax; ns += step) ctx.fillText(String(ns), X(ns), pt + ih + 3 * dpr);
  ctx.fillText(T('时间 (ns，相对这一对的发射) →', 'time (ns after this pair’s emission) →'), pl + iw / 2, pt + ih + 14 * dpr);
  $('stMeta').textContent = `#${i + 1}${S.selPair === i ? T(' · 已选', ' · selected') : ''} · Δ = ${fmtNs(S.delta)} · ${relText(relation())}`;
}
function drawComp() {
  const dpr = fitCanvas(cvComp), ctx = cvComp.getContext('2d'), W = cvComp.width, Hh = cvComp.height;
  ctx.clearRect(0, 0, W, Hh);
  const pl = 30 * dpr, pb = 22 * dpr, pt = 16 * dpr, s = Math.min(W - pl - 14 * dpr, Hh - pt - pb);
  const X = (k) => pl + k * s, Y = (v) => pt + s - v * s;
  ctx.strokeStyle = FAINT; ctx.lineWidth = 1 * dpr; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(1.05), Y(0)); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(0), Y(1.05)); ctx.stroke();
  ctx.strokeStyle = SG; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.4 * dpr; ctx.beginPath(); ctx.arc(X(0), Y(0), s, -Math.PI / 2, 0); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('0', X(0), Y(0) + 3 * dpr); ctx.fillText('1', X(1), Y(0) + 3 * dpr);
  ctx.fillText(T('路径知识 K', 'path knowledge K'), X(0.5), Y(0) + 3 * dpr);
  ctx.save(); ctx.translate(X(0) - 18 * dpr, Y(0.5)); ctx.rotate(-Math.PI / 2); ctx.fillText(T('条纹可见度 V', 'fringe visibility V'), 0, 0); ctx.restore();
  const half = (k, v, colA, colB, r) => {
    for (const [col, a0, a1] of [[colA, Math.PI / 2, Math.PI * 1.5], [colB, -Math.PI / 2, Math.PI / 2]]) {
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8 * dpr; ctx.beginPath(); ctx.moveTo(X(k), Y(v)); ctx.arc(X(k), Y(v), r * dpr, a0, a1); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    }
  };
  const K = KNOW_E(), V = VIS_E();
  half(1, 0, AM, OK, 6);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4 * dpr; ctx.beginPath(); ctx.arc(X(1), Y(0), 10 * dpr, 0, Math.PI * 2); ctx.stroke();
  half(K, V, CY, MG, 6);
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.textBaseline = 'middle'; ctx.textAlign = K > 0.6 ? 'right' : 'left';
  ctx.fillStyle = INK; ctx.fillText(`D1 · D2  (${K.toFixed(2)}, ${V.toFixed(2)})`, X(K) + (K > 0.6 ? -10 : 10) * dpr, Y(V) - 8 * dpr);
  ctx.textAlign = 'right'; ctx.fillText(T('D3 · D4 · D0 总体', 'D3 · D4 · D0 whole'), X(1) - 14 * dpr, Y(0) - 12 * dpr);
  ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText('K² + V² = 1', X(1), pt - 12 * dpr);
}

/* =====================================================================
   10. Readouts and controls
   ===================================================================== */
let syncedT = NaN, tableKey = '';
const toast = (html) => TRV.toast($('toast'), html);
function syncOutputs() {
  const t = tNow(); syncedT = t;
  const tn = tally(t); tallyNow = tn;
  $('oRoute').textContent = S.w.toFixed(2); $('oRefl').textContent = S.r.toFixed(2); $('oPhase').textContent = `${S.phi}°`;
  $('oDelay').textContent = fmtNs(S.delta); $('oSlitW').textContent = S.W.toFixed(2); $('oSep').textContent = S.db.toFixed(1); $('oPairs').textContent = String(S.N);
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  $('fieldW').hidden = S.mode !== 'bs'; $('switchBox').hidden = S.mode !== 'switch'; $('sched').hidden = S.mode !== 'switch';
  const setNow = schedAt(t);
  document.querySelectorAll('#switchChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.set === setNow)));
  const flips = S.sched.length - 1;
  $('routeNote').innerHTML = S.mode === 'bs'
    ? T(`每个闲置光子在 BS<sub>A</sub>、BS<sub>B</sub> 上以概率 w = ${S.w.toFixed(2)} 被反射去 D3、D4（测路径），否则透射进擦除分束器。谁去哪里是随机的，与 D0 落点无关。`,
      `At BS<sub>A</sub> and BS<sub>B</sub> each idler is reflected to D3 or D4 (path) with probability w = ${S.w.toFixed(2)} and otherwise passes into the eraser. Who goes where is random and independent of the D0 hit.`)
    : T(`开关此刻在“${setNow === 'E' ? '擦除' : '测路径'}”。扳动开关只影响此后才到达分束器的闲置光子；已扳动 ${flips} 次。此刻有 ${tn.waiting} 个落点已在屏上、孪生光子还没到分束器。`,
      `The switch is now on ${setNow === 'E' ? 'ERASE' : 'PATH'}. Flipping it affects only idlers that reach the splitter afterwards; flipped ${flips} time${flips === 1 ? '' : 's'}. Right now ${tn.waiting} hits are on the screen while their twins have not yet reached the splitter.`);
  $('eraserNote').innerHTML = T(`D1、D2 子系综：条纹可见度 V = 2√(r(1−r)) = ${VIS_E().toFixed(3)}，路径知识 K = |2r − 1| = ${KNOW_E().toFixed(3)}，条纹平移 φ/2π = ${(S.phi / 360).toFixed(3)} 个周期（周期 Λ = ${period().toFixed(3)}）。`,
    `D1 and D2 sub-ensembles: fringe visibility V = 2√(r(1−r)) = ${VIS_E().toFixed(3)}, path knowledge K = |2r − 1| = ${KNOW_E().toFixed(3)}, fringes shifted by φ/2π = ${(S.phi / 360).toFixed(3)} of a period (period Λ = ${period().toFixed(3)}).`);
  const rel = relation();
  const v = Math.abs(S.delta) / SEP_NS;
  $('delayNote').innerHTML = (S.delta >= 0
    ? T(`选择发生在 D0 点击之后 ${S.delta} ns，两处相距 ${SEP_NS} 光纳秒（2.7 m）。`, `The choice comes ${S.delta} ns after the D0 click; the two places are ${SEP_NS} light-nanoseconds (2.7 m) apart.`)
    : T(`选择发生在 D0 点击之前 ${-S.delta} ns，两处相距 ${SEP_NS} 光纳秒（2.7 m）。`, `The choice comes ${-S.delta} ns before the D0 click; the two places are ${SEP_NS} light-nanoseconds (2.7 m) apart.`))
    + ' ' + relText(rel) + (rel === 'spacelike' && S.delta !== 0 ? T(`：以大于 ${v.toFixed(2)}c 的速度运动的观察者会看到相反的先后。`, `: an observer moving faster than ${v.toFixed(2)}c sees the opposite order.`) : T('。', '.'))
    + ' ' + (S.delta >= 1 ? T(`延迟线在闲置光子一侧（${idlDelay()} ns）。`, `The delay line is on the idler side (${idlDelay()} ns).`) : T(`延迟线在信号光子一侧（${sigDelay()} ns）。`, `The delay line is on the signal side (${sigDelay()} ns).`));
  // readouts
  const blind = choiceBlindness();
  const kap = recordOverlap(S.mode === 'bs' ? S.w : 0, S.r, S.phi);
  $('roV0').textContent = kap.toFixed(3); $('roD').textContent = Math.sqrt(Math.max(0, 1 - kap * kap)).toFixed(3);
  $('roDiff').textContent = blind.diff < 1e-12 ? T('0（精确为零）', '0 (exactly zero)') : blind.diff.toExponential(1);
  $('roMI').textContent = `${blind.mi.toFixed(3)} ${T('比特', 'bit')}`;
  // coincidence table
  const shares = detectorShares(tn.nE, tn.nP), Vd = [VIS_E(), VIS_E(), 0, 0], Kd = [KNOW_E(), KNOW_E(), 1, 1];
  const live = [tn.nE > 0 || (S.mode === 'bs' ? S.w < 1 : RUN.nP < S.N), tn.nE > 0 || (S.mode === 'bs' ? S.w < 1 : RUN.nP < S.N), tn.nP > 0 || (S.mode === 'bs' ? S.w > 0 : RUN.nP > 0), tn.nP > 0 || (S.mode === 'bs' ? S.w > 0 : RUN.nP > 0)];
  const key = [S.selDet, tn.counts.join(','), tn.inFlight, tn.shown, shares.map((x) => x.toFixed(3)).join(','), Vd[0].toFixed(3), Kd[0].toFixed(3), live.join(''), T('z', 'e')].join('|');
  if (key !== tableKey) {
    tableKey = key;
    const head = `<tr><th>${T('探测器', 'Detector')}</th><th>${T('符合数', 'Count')}</th><th>${T('理论占比', 'Expected')}</th><th>V</th><th>K</th></tr>`;
    const rows = DET_NAME.map((n, k) => `<tr class="det${S.selDet === k ? ' sel' : ''}" data-det="${k}" style="--bc:${DET_CSS[k]}"><td><i></i>${n} · R0${k + 1}</td><td>${tn.counts[k]}</td><td>${(shares[k] * 100).toFixed(1)}%</td><td>${live[k] ? Vd[k].toFixed(2) : '—'}</td><td>${live[k] ? Kd[k].toFixed(2) : '—'}</td></tr>`).join('');
    const tail = `<tr class="pending"><td>${T('标签在途', 'Labels in flight')}</td><td>${tn.inFlight}</td><td colspan="3">${T(`D0 落点共 ${tn.shown}`, `${tn.shown} hits on D0`)}</td></tr>`;
    $('detTable').innerHTML = `<table>${head}${rows}${tail}</table>`;
  }
  $('detNote').textContent = T('点击一行（或按 1–4）只看该探测器的符合计数：屏上其余落点变暗，下方对应的直方图亮起。', 'Click a row (or press 1–4) to see only that detector’s coincidences: the other hits on the screen dim and its histogram lights up.');
  $('presetNote').textContent = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义参数。', 'Custom settings.');
  // header, HUD, rail
  $('pillPairs').innerHTML = `PAIRS <strong>${tn.shown}/${S.N}</strong>`;
  $('pillD0').innerHTML = `D0 <strong>${RUN.hD0}</strong>`;
  $('pillLabels').innerHTML = `LABELS <strong>${RUN.hLab}</strong>`;
  $('pillCausal').innerHTML = `Δ <strong>${fmtNs(S.delta)} · ${relShort(rel)}</strong>`;
  $('tau').innerHTML = `${t.toFixed(1)} <small>/ ${tEnd().toFixed(0)} ns</small>`;
  $('hudBig').textContent = `t = ${t.toFixed(1)} ns`;
  $('hudSub').textContent = T(`D0 落点 ${tn.shown} · 已分拣 ${tn.labeled} · 标签在途 ${tn.inFlight}`, `D0 hits ${tn.shown} · sorted ${tn.labeled} · labels in flight ${tn.inFlight}`);
}
let railKey = '';
function syncRail() {
  const T0 = tEnd(), key = `${T0}|${S.mode}|${JSON.stringify(S.sched)}`;
  if (key === railKey) return; railKey = key;
  $('marks').innerHTML = [[0, 'first'], ...((T0 - E_WIN) / T0 > 0.14 ? [[E_WIN, '']] : []), [T0, 'last']].map(([v, c]) => `<i class="${c}" style="left:${(v / T0 * 100).toFixed(2)}%">${Math.round(v)} ns</i>`).join('');
  const segs = []; for (let k = 0; k < S.sched.length; k++) { const a = S.sched[k].t, b = k + 1 < S.sched.length ? S.sched[k + 1].t : T0; segs.push(`<i class="${S.sched[k].set}" style="left:${(a / T0 * 100).toFixed(2)}%;width:${(Math.max(0, b - a) / T0 * 100).toFixed(2)}%"></i>`); }
  $('sched').innerHTML = segs.join('');
}
function selectDetector(k) { S.selDet = k >= 0 && k < 4 ? k : -1; tableKey = ''; syncOutputs(); }
function selectPair(i) { S.selPair = i; syncOutputs(); }
function flipSwitch(set) {
  if (S.mode !== 'switch') return;
  const t = tNow(); if (schedAt(t) === set) return;
  S.sched = S.sched.filter((e) => e.t < t);
  S.sched.push({ t: S.sched.length ? t : 0, set });
  S.preset = null; markPreset(); dirtyRun = true;
  let waiting = 0; for (let i = 0; i < S.N; i++) if (RUN.t0[i] <= t && RUN.tc[i] >= t) waiting++;
  const name = set === 'E' ? T('擦除', 'ERASE') : T('测路径', 'PATH');
  toast(waiting
    ? T(`<b>开关扳到“${name}”</b>：${waiting} 个落点已经印在屏上，它们的孪生光子还在延迟线里，将按这个新设置分拣。屏上的点一个也不会动。`, `<b>Switch set to ${name}</b>: ${waiting} hits are already printed on the screen while their twins are still in the delay line; they will be sorted by this new setting. Not one point on the screen moves.`)
    : T(`<b>开关扳到“${name}”</b>：之后到达分束器的闲置光子按新设置测量。`, `<b>Switch set to ${name}</b>: idlers reaching the splitter from now on are measured with the new setting.`));
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirtyRun = true; }
const slider = (id, key, parse = parseFloat) => $(id).addEventListener('input', () => { S[key] = parse($(id).value); custom(); });
slider('route', 'w'); slider('refl', 'r'); slider('ephase', 'phi', (v) => parseInt(v, 10)); slider('delay', 'delta', (v) => parseInt(v, 10));
slider('slitw', 'W'); slider('sep', 'db'); slider('pairs', 'N', (v) => parseInt(v, 10));
$('pairs').addEventListener('input', () => { S.selPair = -1; });
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => {
  if (S.mode === b.dataset.mode) return;
  S.mode = b.dataset.mode === 'switch' ? 'switch' : 'bs';
  if (S.mode === 'switch') S.sched = [{ t: 0, set: S.w > 0.5 ? 'P' : 'E' }];
  custom();
}));
document.querySelectorAll('#switchChips .chip').forEach((b) => b.addEventListener('click', () => flipSwitch(b.dataset.set === 'P' ? 'P' : 'E')));
$('detTable').addEventListener('click', (ev) => { const tr = ev.target.closest('tr.det'); if (tr) selectDetector(S.selDet === +tr.dataset.det ? -1 : +tr.dataset.det); });
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  Object.assign(S, { mode: p.mode, w: p.w, sched: p.sched.map((e) => ({ ...e })), r: p.r, phi: p.phi, delta: p.delta, W: p.W, db: p.db, N: p.N, selDet: -1, selPair: -1 });
  $('route').value = S.w; $('refl').value = S.r; $('ephase').value = S.phi; $('delay').value = S.delta; $('slitw').value = S.W; $('sep').value = S.db; $('pairs').value = S.N;
  S.preset = name; markPreset();
  dirtyRun = true;
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
  if (ev.key === 'Escape') { S.selPair = -1; selectDetector(-1); return; }
  if (ev.key === ' ' && !(ev.target && ev.target.tagName === 'BUTTON')) { ev.preventDefault(); S.playing = !S.playing; S.hold = 0; setPlayUI(); }
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) {
    ev.preventDefault(); S.playing = false; setPlayUI();
    const t = tNow() + (ev.key === 'ArrowRight' ? 10 : -10);
    S.nowFrac = Math.min(1, Math.max(0, t / tEnd())); $('now').value = S.nowFrac;
  }
  else if (/^[1-4]$/.test(ev.key)) { const k = +ev.key - 1; selectDetector(S.selDet === k ? -1 : k); }
  else if (ev.key === 's' || ev.key === 'S') flipSwitch(schedAt(tNow()) === 'E' ? 'P' : 'E');
});

/* =====================================================================
   11. Main loop
   ===================================================================== */
let lastT = performance.now(), tAcc = 0, panelTick = 0, frameCount = 0;
function resize() {
  if (!glOK) return;
  const r = stage.getBoundingClientRect();
  renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
  camera.aspect = Math.max(0.2, r.width / Math.max(1, r.height)); camera.updateProjectionMatrix();
}
function frame(tms) {
  frameCount++;
  const dtSec = Math.min(0.1, (tms - lastT) / 1000); lastT = tms; tAcc += dtSec;
  if (dirtyRun) { resampleRun(); dirtyRun = false; tableKey = ''; syncOutputs(); }
  if (S.playing && !scrubbing) {
    if (S.hold > 0) { S.hold -= dtSec; if (S.hold <= 0) S.nowFrac = S.dir > 0 ? 0 : 1; }
    else {
      S.nowFrac += S.dir * dtSec * S.speed / 20;
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 1.6; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.6; }
    }
    $('now').value = S.nowFrac;
  }
  if (tNow() !== syncedT) syncOutputs();
  syncRail();
  if (glOK) { updateCamera(dtSec); updateGL(tAcc); renderer.render(scene3, camera); updateTags(); }
  panelTick++;
  drawHist(); drawSpacetime(); if (panelTick % 4 === 0) drawComp();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { labelStaticTags(); tableKey = ''; syncOutputs(); drawComp(); });

/* read-only probe for automated browser tests */
window.ERASER_DEBUG = {
  pending: () => dirtyRun || tNow() !== syncedT,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  model: (x, w, r, phi) => ({ cond: condProb(x, w ?? S.w, r ?? S.r, phi ?? S.phi), env: env2(x), Lambda: period() }),
  amplitudes: (w, r, phi) => amplitudes(w, r, phi),
  info: () => {
    const t = tNow(), tn = tally(t), blind = choiceBlindness();
    return { t, T: tEnd(), delta: S.delta, rel: relation(), sepNs: SEP_NS, shown: tn.shown, labeled: tn.labeled, inFlight: tn.inFlight, waiting: tn.waiting,
      counts: tn.counts, nE: tn.nE, nP: tn.nP, V: VIS_E(), K: KNOW_E(), kappa: recordOverlap(S.mode === 'bs' ? S.w : 0, S.r, S.phi),
      shares: detectorShares(tn.nE, tn.nP), diff: blind.diff, mi: blind.mi, pair: shownPair(), events: pairEvents(shownPair()), sigDelay: sigDelay(), idlDelay: idlDelay() };
  },
  archive: () => ({ x: Array.from(RUN.x.subarray(0, S.N)), te: Array.from(RUN.te.subarray(0, S.N)), t0: Array.from(RUN.t0.subarray(0, S.N)), tc: Array.from(RUN.tc.subarray(0, S.N)),
    ti: Array.from(RUN.ti.subarray(0, S.N)), tcc: Array.from(RUN.tcc.subarray(0, S.N)), route: Array.from(RUN.route.subarray(0, S.N)), det: Array.from(RUN.det.subarray(0, S.N)), hD0: RUN.hD0, hLab: RUN.hLab }),
  envelope: () => ({ Z: ENV.Z, W: ENV.W }),
  projectDet: (k) => { if (!glOK) return null; const q = proj(P.det[k]); return { x: q.x, y: q.y }; },
  projectHit: (i) => { if (!glOK) return null; const q = proj(hitPos(i)); return { x: q.x, y: q.y }; },
  setTime: (ns) => { S.nowFrac = Math.min(1, Math.max(0, ns / tEnd())); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('erase'); S.playing = false; setPlayUI(); S.nowFrac = 0.97; $('now').value = S.nowFrac; selectDetector(0); cam.tTheta = 1.2; cam.tPhi = 1.18; cam.tR = 7.4; cam.tTgt = [-0.9, 0.35, 0.1]; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; cam.tgt = cam.tTgt.slice(); }
applyPreset('kim');
S.nowFrac = 0.3; S.playing = !reduceMotion; $('now').value = S.nowFrac;
setPlayUI();
requestAnimationFrame(frame);
})();
