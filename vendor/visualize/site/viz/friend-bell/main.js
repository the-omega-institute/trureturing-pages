/* FRIEND//BELL · Wigner 之友 · 贝尔竞技场
   A source sends one half of a Bell pair to a lab on the left and the other to Bob on the right. Inside the left lab a
   friend measures Z and writes the result down; Wigner then either asks the friend (setting 0) or coherently undoes the
   friend's measurement and measures X_S⊗X_F (setting 1). Both results travel to a referee in the middle.
   The page draws 400 runs as one 1+1-dimensional spacetime block, lets the viewer boost to other frames, and compares
   the quantum ledgers with absolute answer tables (|S| ≤ 2).
   Theory: trureturing docs/develop/theory/OBSERVER-QUANTUM.md §8, GICT.md Observation 6.30. Frozen Lean anchors are named
   in the page text. Model: ideal two-qubit Bell pair, undo visibility f^M (schematic, see the drawer).
   Depends on: assets/vendor/three.r128.min.js (window.THREE), assets/shell.js (window.TRV). */
(() => {
'use strict';

/* =====================================================================
   1. Geometry (lab frame, c = 1) and constants
   ===================================================================== */
const L = 1.5;                        // distance from the source to each lab
const T_ARR = L;                      // the qubits arrive
const T_F = 1.75;                     // the friend measures Z and writes it down
const T_B = 2.1;                      // Bob measures
const T_U = 2.33;                     // Wigner's undo (setting 1)
const T_W = 2.45;                     // Wigner reads the friend (setting 0) or measures after the undo (setting 1)
const T_BR = T_B + L;                 // Bob's result reaches the middle
const T_C = Math.max(T_W, T_B) + L;   // the referee holds both results
const T_TOP = 4.25;
const X_F = -L - 0.2, X_U = -L - 0.1;
const xW = (x) => -L + (x === 0 ? -0.05 : 0.05);
const xB = (y) => L + (y === 0 ? -0.06 : 0.06);
const T_MID = 2.1, SX = 0.95, SY = 0.74, DEPTH = 2.2;
const N_RUNS = 400;
const M_STOPS = [1, 2, 3, 5, 8, 13, 21, 50, 100, 1e3, 1e4, 1e6, 1e9, 1e12, 1e18, 1e23];
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { mulberry32, smooth, fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, sigma: SG, ok: OK, warn: WARN, cyan: CY, magenta: MG } = TRV.palette;
const DEG = Math.PI / 180;

/* =====================================================================
   2. State and presets
   ===================================================================== */
const S = {
  model: 0, undo: 1, mIdx: 0, fidV: 1, phi: 90, th0: 45, th1: -45,
  table: [1, 1, 1, 1], mixed: false,
  beta: 0, betaV: 0, coord: 0, coordMix: 0,
  mode: 0, focus: 0, split: 0, sel: -1,
  nowFrac: 0.5, playing: true, dir: 1, speed: 1, hold: 0,
  preset: 'qubit'
};
const PRESETS = {
  qubit: { model: 0, undo: 1, m: 0, f: 1, phi: 90, th0: 45, th1: -45, beta: 0,
    zh: '朋友只是一个量子比特，Wigner 能把他完全撤销（v = 1）。默认角度下 S = 2√2 ≈ 2.828，超过任何答案表都达不到的 2。',
    en: 'The friend is just a qubit and Wigner can undo him completely (v = 1). At the default angles S = 2√2 ≈ 2.828, beyond the 2 that no answer table can exceed.' },
  partial: { model: 0, undo: 1, m: 2, f: 0.95, best: true, beta: 0,
    zh: '朋友的结果写进 3 份副本，每份以保真度 0.95 反演：v = 0.95³ ≈ 0.857。最优角度下 S = 2√(1+v²) ≈ 2.63，仍然超过 2。',
    en: 'The friend’s result sits in 3 copies, each reversed with fidelity 0.95: v = 0.95³ ≈ 0.857. At the best angles S = 2√(1+v²) ≈ 2.63, still above 2.' },
  human: { model: 0, undo: 1, m: 15, f: 0.999999, best: true, beta: 0,
    zh: '真人朋友：10²³ 份副本，每份保真度 0.999999，v 实际为 0。无论怎样选角度，S 最多是 2——违背消失，朋友的结果在实际上表现得像绝对事实。',
    en: 'A human friend: 10²³ copies at fidelity 0.999999 each, so v is effectively 0. Whatever the angles, S is at most 2; the violation disappears and in practice the friend’s result behaves like an absolute fact.' },
  noundo: { model: 0, undo: 0, m: 0, f: 1, phi: 90, th0: 45, th1: -45, beta: 0,
    zh: 'Wigner 不撤销，直接测系统的 X：朋友的记录把相干带走，X 部分的关联为 0，默认角度下 S = √2。',
    en: 'Wigner measures the system’s X without undoing the friend: the friend’s record carries the coherence away, the X part of the correlations is 0, and at the default angles S = √2.' },
  table: { model: 1, tableBits: [1, 1, 1, 1], beta: 0,
    zh: '假设朋友的结果在每次运行里都是绝对事实：每次运行带一张写满 A₀, A₁, B₀, B₁ 的答案表。这张表给出 S = 1 + 1 + 1 − 1 = 2，任何表都超不过 2。',
    en: 'Assume the friend’s result is an absolute fact in every run: each run carries one answer table filled with A₀, A₁, B₀, B₁. This table gives S = 1 + 1 + 1 − 1 = 2, and no table can exceed 2.' },
  mix: { model: 1, mix: true, beta: 0,
    zh: '每次运行按随机权重从 16 张答案表里抽一张。混合只会把 S 拉向中间：|S| ≤ 2 对任何混合都成立。',
    en: 'Each run draws one of the 16 answer tables with random weights. Mixing only pulls S towards the middle: |S| ≤ 2 holds for every mixture.' },
  wfirst: { model: 0, undo: 1, m: 0, f: 1, phi: 90, th0: 45, th1: -45, beta: -0.45, tau: 2.5,
    zh: '换到以 β = −0.45 运动的参考系：Wigner 的测量排到了 Bob 之前。四组关联和 S 一点没变——两次测量是类空间隔的，先后只是参考系的选择。',
    en: 'Boost to a frame moving at β = −0.45: Wigner’s measurement now comes before Bob’s. The four correlations and S do not change at all; the measurements are spacelike separated, and their order is a choice of frame.' },
  bfirst: { model: 0, undo: 1, m: 0, f: 1, phi: 90, th0: 45, th1: -45, beta: 0.45, tau: 2.5,
    zh: '换到以 β = +0.45 运动的参考系：Bob 比 Wigner 早得更多。汇合事件依然在两次测量之后——它在两者的未来光锥里。',
    en: 'Boost to a frame moving at β = +0.45: Bob now measures even earlier than Wigner. The meeting event still comes after both measurements, because it lies in both future light cones.' }
};

/* =====================================================================
   3. The law: E(0, y) = cos θ_y, E(1, y) = cos φ cos θ_y + v sin φ sin θ_y (quantum); answer tables otherwise
   ===================================================================== */
const copies = () => M_STOPS[S.mIdx];
const fidOf = (u) => (u >= 1 ? 1 : 1 - Math.pow(10, -1 - 6 * u));
const fidV = (f) => (f >= 1 ? 1 : (-Math.log10(1 - f) - 1) / 6);
const fid = () => fidOf(S.fidV);
function vLog10() { if (!S.undo) return -Infinity; const f = fid(); return f >= 1 ? 0 : copies() * Math.log10(f); }
const pow10 = (l) => (l < -320 ? 0 : Math.pow(10, l));
const vis = () => pow10(vLog10());
const bitsOf = (s) => [0, 1, 2, 3].map((k) => ((s >> k) & 1 ? 1 : -1));
const tableIndex = (t) => t.reduce((acc, b, k) => acc | (b > 0 ? 1 << k : 0), 0);
const chshOfTable = (b) => b[0] * b[2] + b[0] * b[3] + b[1] * b[2] - b[1] * b[3];
let W = new Float64Array(16);
function setPureTable() { W = new Float64Array(16); W[tableIndex(S.table)] = 1; S.mixed = false; }
function setRandomMix() {
  const rng = mulberry32((Date.now() & 0xffff) ^ 0x5eed);
  let sum = 0; W = new Float64Array(16);
  for (let s = 0; s < 16; s++) { W[s] = -Math.log(1 - rng()); sum += W[s]; }
  for (let s = 0; s < 16; s++) W[s] /= sum;
  S.mixed = true;
}
function lawE() {                                   // E[x][y]
  if (S.model === 1) {
    const E = [[0, 0], [0, 0]];
    for (let s = 0; s < 16; s++) { if (!W[s]) continue; const b = bitsOf(s); for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) E[x][y] += W[s] * b[x] * b[2 + y]; }
    return E;
  }
  const v = vis(), ph = S.phi * DEG, th = [S.th0 * DEG, S.th1 * DEG];
  return [0, 1].map((x) => th.map((t) => (x === 0 ? Math.cos(t) : Math.cos(ph) * Math.cos(t) + v * Math.sin(ph) * Math.sin(t))));
}
const chsh = (E) => E[0][0] + E[0][1] + E[1][0] - E[1][1];
function sMax() {                                   // best Bob angles for the current φ and v (quantum)
  const v = vis(), c = Math.cos(S.phi * DEG), s = Math.sin(S.phi * DEG);
  return Math.hypot(1 + c, v * s) + Math.hypot(1 - c, v * s);
}
function bestAngles() {
  const v = vis(), c = Math.cos(S.phi * DEG), s = Math.sin(S.phi * DEG);
  return [Math.atan2(v * s, 1 + c) / DEG, Math.atan2(-v * s, 1 - c) / DEG];
}

/* =====================================================================
   4. Fixed seeds and the archive
   ===================================================================== */
const seedRng = mulberry32(0xB311F2);
const SX_ = new Uint8Array(N_RUNS), SY_ = new Uint8Array(N_RUNS);
const U1 = new Float64Array(N_RUNS), U2 = new Float64Array(N_RUNS), US = new Float64Array(N_RUNS);
for (let r = 0; r < N_RUNS; r++) {
  SX_[r] = seedRng() < 0.5 ? 0 : 1; SY_[r] = seedRng() < 0.5 ? 0 : 1;
  U1[r] = seedRng(); U2[r] = seedRng(); US[r] = seedRng();
}
const A = new Int8Array(N_RUNS), B = new Int8Array(N_RUNS), ZF = new Int8Array(N_RUNS);
let archiveHash = '--------';
function fnv(values) {
  let h = 0x811c9dc5;
  for (const v of values) { h ^= (v + 2) & 0xff; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
function resampleArchive() {
  const E = lawE(), vals = [];
  let cdf = null;
  if (S.model === 1) { cdf = new Float64Array(16); let acc = 0; for (let s = 0; s < 16; s++) { acc += W[s]; cdf[s] = acc; } }
  for (let r = 0; r < N_RUNS; r++) {
    const x = SX_[r], y = SY_[r];
    if (S.model === 1) {
      let s = 15; for (let k = 0; k < 16; k++) if (US[r] < cdf[k]) { s = k; break; }
      const b = bitsOf(s);
      A[r] = b[x]; B[r] = b[2 + y]; ZF[r] = b[0];
    } else {
      const e = E[x][y];
      A[r] = U1[r] < 0.5 ? 1 : -1;
      B[r] = U2[r] < (1 + e) / 2 ? A[r] : -A[r];
      ZF[r] = x === 0 ? A[r] : 0;                   // after the undo no ledger keeps the friend's value
    }
    vals.push(x, y, A[r], B[r], ZF[r]);
  }
  archiveHash = fnv(vals);
}
function archiveE() {
  const sum = [[0, 0], [0, 0]], n = [[0, 0], [0, 0]];
  for (let r = 0; r < N_RUNS; r++) { sum[SX_[r]][SY_[r]] += A[r] * B[r]; n[SX_[r]][SY_[r]]++; }
  const E = [[0, 0], [0, 0]];
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) E[x][y] = n[x][y] ? sum[x][y] / n[x][y] : 0;
  let v = 0; for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) v += n[x][y] ? (1 - E[x][y] ** 2) / n[x][y] : 0;
  return { E, n, S: chsh(E), sigma: Math.sqrt(v) };
}

/* =====================================================================
   5. Frames, slices and ledgers
   ===================================================================== */
const gam = (b) => 1 / Math.sqrt(1 - b * b);
const tp = (x, t, b = S.betaV) => gam(b) * (t - b * x);       // frame time of a lab event
const xp = (x, t, b = S.betaV) => gam(b) * (x - b * t);
function drawXT(x, t) { const m = S.coordMix; return [x + (xp(x, t) - x) * m, t + (tp(x, t) - t) * m]; }
function scene(x, t, z) { const [dx, dt] = drawXT(x, t); return [SX * dx, SY * (dt - T_MID), z]; }
function tauRange(b = S.betaV) {
  const pts = [[0, 0], [X_F, T_F], [-L, T_W], [L, T_B], [0, T_C], [-L, T_ARR], [L, T_ARR]];
  const ts = pts.map(([x, t]) => tp(x, t, b));
  return [Math.min(...ts) - 0.15, Math.max(...ts) + 0.2];
}
const tauNow = () => { const [a, b] = tauRange(); return a + S.nowFrac * (b - a); };
const blockView = () => S.mode === 1;
function seen(x, t) { return blockView() || tp(x, t) <= tauNow() + 1e-9; }
function orderInfo(b = S.betaV) {
  const dW = tp(-L, T_W, b), dB = tp(L, T_B, b), dC = tp(0, T_C, b);
  return { dW, dB, dC, first: Math.abs(dW - dB) < 1e-3 ? 'same' : dW < dB ? 'W' : 'B', gapC: dC - Math.max(dW, dB) };
}
function ledgers() {
  const friendWritten = seen(X_F, T_F) ? N_RUNS : 0;
  let erased = 0;
  if (S.model === 0 && S.undo && seen(X_U, T_U) && vis() > 0.5) for (let r = 0; r < N_RUNS; r++) if (SX_[r] === 1) erased++;
  const wig = seen(-L, T_W) ? N_RUNS : 0, bob = seen(L, T_B) ? N_RUNS : 0, ref = seen(0, T_C) ? N_RUNS : 0;
  return { friendWritten, erased, wigner: wig, bob, referee: ref };
}

/* =====================================================================
   6. DOM helpers and formatting
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags');
const cvMeter = $('meter'), cvGrid = $('grid');
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const supInt = (n) => String(n).split('').map((ch) => (ch === '-' ? '⁻' : SUP[+ch])).join('');
const copiesLabel = (m) => (m < 1000 ? String(m) : '10' + supInt(Math.round(Math.log10(m))));
const fmtFid = (f) => (f >= 1 ? '1' : 1 - f >= 1e-3 ? f.toFixed(4) : `1 − ${(1 - f).toExponential(1)}`);
function fmtV(l) {
  if (l === -Infinity) return '0';
  if (l > -3) return pow10(l).toFixed(3);
  if (l > -1e5) return `10<sup>${l.toFixed(1).replace('-', '−')}</sup>`;
  const [m, e] = l.toExponential(1).split('e');
  return `10<sup>${m.replace('-', '−')}×10${supInt(+e)}</sup>`;
}
const sgn = (v) => (v > 0 ? '+1' : '−1');
const deg = (v) => `${Math.round(v)}°`;

/* =====================================================================
   7. Three.js scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false;
let sheetMesh, frameLines, runLines, evtPts, ringPts, selPts, selLines, nowPlane;
const cam = { theta: -0.68, phi: 1.3, r: 6.9, tTheta: -0.68, tPhi: 1.3, tR: 6.9 };
const CAMS = { iso: [-0.68, 1.3, 6.9], front: [0, 1.5708, 6.6], runs: [-1.5708, 1.5708, 5.6], top: [0, 0.07, 6.4] };
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
  float ring = smoothstep(0.1, 0.0, abs(r - 0.72)) + smoothstep(0.3, 0.0, r) * 0.35;
  float a = ring * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}`;
const PLANE_FS = `
uniform vec3 uCol; uniform float uTime, uOp; varying vec2 vUv;
void main(){
  vec2 g = abs(fract(vUv * vec2(26.0, 22.0)) - 0.5);
  float line = smoothstep(0.46, 0.5, max(g.x, g.y));
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float edge = smoothstep(0.012, 0.0, e);
  float sweep = smoothstep(0.02, 0.0, abs(fract(vUv.x*0.5 - uTime*0.08) - 0.5));
  gl_FragColor = vec4(uCol, (0.05 + 0.12*line + 0.9*edge + 0.1*sweep) * uOp);
}`;
const PLANE_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const additive = { transparent: true, depthWrite: false, depthTest: false, blending: window.THREE ? THREE.AdditiveBlending : 2 };
function dyn(g, name, n, size) { const a = new THREE.BufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; }
function initGL() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) { renderer = null; }
  if (!renderer || !window.THREE) {
    const d = document.createElement('div'); d.className = 'nogl';
    d.textContent = T('这个浏览器没有提供 WebGL，三维时空图无法显示。下方的 CHSH 读数、关联和右侧读数仍然可用。', 'This browser does not provide WebGL, so the 3D diagram cannot be shown. The CHSH meter, the correlations and the readouts still work.');
    stage.appendChild(d); return;
  }
  glOK = true;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x02040a, 1);
  scene3 = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const sg = new THREE.BufferGeometry(); dyn(sg, 'position', 64 * 3, 3); dyn(sg, 'color', 64 * 3, 3);
  sheetMesh = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, ...additive, side: THREE.DoubleSide }));
  sheetMesh.frustumCulled = false; scene3.add(sheetMesh);
  const lines = (n) => { const g = new THREE.BufferGeometry(); dyn(g, 'position', n, 3); dyn(g, 'color', n, 3); const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, ...additive })); m.frustumCulled = false; scene3.add(m); return m; };
  frameLines = lines(240);
  runLines = lines(N_RUNS * 4);
  selLines = lines(16);
  const pts = (n, fs) => {
    const g = new THREE.BufferGeometry(); dyn(g, 'position', n, 3); dyn(g, 'aColor', n, 3); dyn(g, 'aAlpha', n, 1); dyn(g, 'aSize', n, 1);
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: EVT_VS, fragmentShader: fs, uniforms: { uScale: { value: 60 } }, ...additive }));
    m.frustumCulled = false; scene3.add(m); return m;
  };
  evtPts = pts(N_RUNS * 4 + 8, EVT_FS);
  ringPts = pts(N_RUNS, RING_FS);
  selPts = pts(4, RING_FS);
  const pg = new THREE.BufferGeometry(); dyn(pg, 'position', 4, 3);
  pg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  pg.setIndex([0, 1, 2, 0, 2, 3]);
  nowPlane = new THREE.Mesh(pg, new THREE.ShaderMaterial({ vertexShader: PLANE_VS, fragmentShader: PLANE_FS, uniforms: { uCol: { value: new THREE.Color(1.0, 0.78, 0.24) }, uTime: { value: 0 }, uOp: { value: 1 } }, ...additive, side: THREE.DoubleSide }));
  nowPlane.frustumCulled = false; scene3.add(nowPlane);
}

/* depth placement: runs in index order, or grouped by setting pair when the 4th axis is unfolded */
const RUN = { z: new Float32Array(N_RUNS), focusA: new Float32Array(N_RUNS), pick: new Float32Array(N_RUNS * 3 * 3), pickV: new Float32Array(N_RUNS * 3) };
const pairOf = (r) => SX_[r] * 2 + SY_[r];
const zPlain = (r) => -DEPTH / 2 + DEPTH * (r + 0.5) / N_RUNS;
const GROUP_Z = new Float32Array(N_RUNS);
(() => {
  const counts = [0, 0, 0, 0], rank = new Int32Array(N_RUNS);
  for (let r = 0; r < N_RUNS; r++) rank[r] = counts[pairOf(r)]++;
  const gap = 0.3, step = (DEPTH - 3 * gap) / N_RUNS;
  const start = [0, 0, 0, 0]; let acc = -DEPTH / 2;
  for (let k = 0; k < 4; k++) { start[k] = acc; acc += counts[k] * step + gap; }
  for (let r = 0; r < N_RUNS; r++) GROUP_Z[r] = start[pairOf(r)] + (rank[r] + 0.5) * step;
})();
for (let r = 0; r < N_RUNS; r++) { RUN.z[r] = zPlain(r); RUN.focusA[r] = 1; }
const inFocus = (r) => S.focus === 0 || pairOf(r) === S.focus - 1;
function runLayout(dtSec) {
  const s = smooth(S.split), k = reduceMotion ? 1 : 1 - Math.pow(0.002, dtSec);
  for (let r = 0; r < N_RUNS; r++) {
    const tz = zPlain(r) + (GROUP_Z[r] - zPlain(r)) * s;
    RUN.z[r] += (tz - RUN.z[r]) * k;
    RUN.focusA[r] += ((inFocus(r) ? 1 : 0.1) - RUN.focusA[r]) * k;
  }
}
const outcomeCol = (v) => (v > 0 ? COL.cyan : COL.magenta);
function updateGL(time) {
  const tau = tauNow(), block = blockView(), zf = -DEPTH / 2 - 0.12, zb = DEPTH / 2 + 0.12;
  const fade = (x, t) => (block ? 1 : smooth((tau - tp(x, t)) / 0.06 + 0.5));
  // sheets: the two photons, and the two results travelling to the referee
  { const P = sheetMesh.geometry.attributes.position.array, C = sheetMesh.geometry.attributes.color.array; let n = 0;
    const sheet = (a, b, col, k) => {
      const [ax, ay] = scene(a[0], a[1], 0), [bx, by] = scene(b[0], b[1], 0);
      const quad = [[ax, ay, zf], [bx, by, zf], [bx, by, zb], [ax, ay, zf], [bx, by, zb], [ax, ay, zb]];
      for (const q of quad) { P.set(q, 3 * n); C[3 * n] = col[0] * k; C[3 * n + 1] = col[1] * k; C[3 * n + 2] = col[2] * k; n++; }
    };
    sheet([0, 0], [-L, T_ARR], COL.sigma, 0.07 * fade(-L, T_ARR));
    sheet([0, 0], [L, T_ARR], COL.sigma, 0.07 * fade(L, T_ARR));
    sheet([-L, T_W], [0, T_C], COL.sigma, 0.06 * fade(0, T_C));
    sheet([L, T_B], [0, T_BR], COL.sigma, 0.06 * fade(0, T_BR));
    sheetMesh.geometry.setDrawRange(0, n);
    sheetMesh.geometry.attributes.position.needsUpdate = true; sheetMesh.geometry.attributes.color.needsUpdate = true; }
  // frame lines: source, labs, light cones
  { const P = frameLines.geometry.attributes.position.array, C = frameLines.geometry.attributes.color.array; let n = 0;
    const seg = (a, b, col, k, za = zf, zb2 = za) => {
      if (n + 2 > P.length / 3) return;
      P.set(scene(a[0], a[1], za), 3 * n); P.set(scene(b[0], b[1], zb2), 3 * n + 3);
      for (let v = 0; v < 2; v++) { C[3 * (n + v)] = col[0] * k; C[3 * (n + v) + 1] = col[1] * k; C[3 * (n + v) + 2] = col[2] * k; }
      n += 2;
    };
    const edge = [0.12, 0.45, 0.62];
    seg([0, 0], [0, 0], COL.pre, 0.9, zf, zb);                                   // the source line across all runs
    for (const z of [zf, zb]) {
      const box = [[-L - 0.34, T_ARR - 0.08], [-L + 0.12, T_ARR - 0.08], [-L + 0.12, T_W + 0.08], [-L - 0.34, T_W + 0.08]];
      for (let i = 0; i < 4; i++) seg(box[i], box[(i + 1) % 4], edge, 0.8, z);
      seg([L, T_ARR - 0.08], [L, T_B + 0.08], edge, 0.6, z);
      seg([0, T_BR], [0, T_C], COL.sigma, 0.4, z);
    }
    for (const [x0, t0] of [[-L, T_W], [L, T_B]]) {
      for (const s of [-1, 1]) { seg([x0, t0], [x0 + s * 1.0, t0 + 1.0], COL.sigma, 0.28); seg([x0, t0], [x0 + s * 0.9, t0 - 0.9], COL.sigma, 0.16); }
    }
    frameLines.geometry.setDrawRange(0, n);
    frameLines.geometry.attributes.position.needsUpdate = true; frameLines.geometry.attributes.color.needsUpdate = true; }
  // per-run events and the friend's record
  const P = runLines.geometry.attributes.position.array, C = runLines.geometry.attributes.color.array; let nl = 0;
  const E = evtPts.geometry.attributes, R = ringPts.geometry.attributes;
  const v = S.model === 0 ? vis() : 0;
  let ne = 0;
  const pt = (x, t, z, col, a, size) => {
    const p = scene(x, t, z); E.position.array.set(p, 3 * ne);
    E.aColor.array[3 * ne] = col[0]; E.aColor.array[3 * ne + 1] = col[1]; E.aColor.array[3 * ne + 2] = col[2];
    E.aAlpha.array[ne] = a; E.aSize.array[ne] = size; ne++;
  };
  const clipT = (x, t) => (block ? t : Math.min(t, tau / gam(S.betaV) + S.betaV * x));   // lab time where the slice crosses this worldline
  for (let r = 0; r < N_RUNS; r++) {
    const x = SX_[r], y = SY_[r], z = RUN.z[r], fa = RUN.focusA[r];
    // friend's record line
    const fCol = S.model === 1 || x === 0 ? outcomeCol(ZF[r]) : COL.sigma;
    const endLive = S.model === 0 && x === 1 && S.undo ? T_U : T_TOP;
    const put = (t0, t1, col, k) => {
      const t1c = clipT(X_F, t1); if (t1c <= t0) return;
      P.set(scene(X_F, t0, z), 3 * nl); P.set(scene(X_F, t1c, z), 3 * nl + 3);
      for (let q = 0; q < 2; q++) { C[3 * (nl + q)] = col[0] * k; C[3 * (nl + q) + 1] = col[1] * k; C[3 * (nl + q) + 2] = col[2] * k; }
      nl += 2;
    };
    put(T_F, endLive, fCol, 0.16 * fa);
    if (endLive < T_TOP) put(T_U, T_TOP, fCol, 0.16 * fa * (1 - v));
    pt(X_F, T_F, z, fCol, 0.3 * fa * fade(X_F, T_F), 0.6);
    const wx = xW(x), bx = xB(y);
    pt(wx, T_W, z, outcomeCol(A[r]), 0.5 * fa * fade(wx, T_W), 0.95);
    pt(bx, T_B, z, outcomeCol(B[r]), 0.5 * fa * fade(bx, T_B), 0.95);
    const agree = A[r] * B[r] > 0;
    pt(0, T_C, z, agree ? COL.sigma : COL.gray, fa * fade(0, T_C) * (agree ? 0.4 : 0.22), 0.7);
    const rp = r;
    const ringOn = S.model === 0 && x === 1 && S.undo;
    R.position.array.set(scene(X_U, T_U, z), 3 * rp);
    R.aColor.array.set(COL.pre, 3 * rp);
    R.aAlpha.array[rp] = ringOn ? 0.5 * fa * fade(X_U, T_U) : 0; R.aSize.array[rp] = 0.9;
    RUN.pick.set(scene(wx, T_W, z), 9 * r); RUN.pick.set(scene(bx, T_B, z), 9 * r + 3); RUN.pick.set(scene(0, T_C, z), 9 * r + 6);
    RUN.pickV[3 * r] = fa * fade(wx, T_W); RUN.pickV[3 * r + 1] = fa * fade(bx, T_B); RUN.pickV[3 * r + 2] = fa * fade(0, T_C);
  }
  runLines.geometry.setDrawRange(0, nl);
  runLines.geometry.attributes.position.needsUpdate = true; runLines.geometry.attributes.color.needsUpdate = true;
  evtPts.geometry.setDrawRange(0, ne);
  const scale = 58 * renderer.getPixelRatio();
  for (const m of [evtPts, ringPts, selPts]) m.material.uniforms.uScale.value = scale;
  for (const a of [E.position, E.aColor, E.aAlpha, E.aSize, R.position, R.aColor, R.aAlpha, R.aSize]) a.needsUpdate = true;
  // selection
  { const sa = selPts.geometry.attributes, SP = selLines.geometry.attributes.position.array, SC = selLines.geometry.attributes.color.array;
    if (S.sel >= 0) {
      const r = S.sel, z = RUN.z[r], wx = xW(SX_[r]), bx = xB(SY_[r]);
      sa.position.array.set([...scene(wx, T_W, z), ...scene(bx, T_B, z), ...scene(0, T_C, z), ...scene(X_F, T_F, z)]);
      for (let q = 0; q < 4; q++) { sa.aColor.array.set(COL.amber, 3 * q); sa.aSize.array[q] = 1.5; }
      sa.aAlpha.array.set([1, 1, 1, 0.7]);
      const segs = [[[0, 0], [-L, T_ARR]], [[-L, T_ARR], [wx, T_W]], [[0, 0], [L, T_ARR]], [[L, T_ARR], [bx, T_B]], [[wx, T_W], [0, T_C]], [[bx, T_B], [0, T_BR]], [[0, T_BR], [0, T_C]]];
      let n = 0;
      for (const [a, b] of segs) { SP.set(scene(a[0], a[1], z), 3 * n); SP.set(scene(b[0], b[1], z), 3 * n + 3); for (let q = 0; q < 2; q++) SC.set(COL.amber.map((c) => c * 0.8), 3 * (n + q)); n += 2; }
      selLines.geometry.setDrawRange(0, n);
    } else { sa.aAlpha.array.set([0, 0, 0, 0]); selLines.geometry.setDrawRange(0, 0); }
    for (const a of [sa.position, sa.aColor, sa.aAlpha, sa.aSize]) a.needsUpdate = true;
    selLines.geometry.attributes.position.needsUpdate = true; selLines.geometry.attributes.color.needsUpdate = true; }
  // now slice: t' = τ, drawn in the current coordinates
  { const g = gam(S.betaV), xl = -2.25, xr = 2.25;
    const ends = [xl, xr].map((xlab) => { const xq = xlab / g - S.betaV * tau; const tl = g * (tau + S.betaV * xq); const m = S.coordMix; return [xlab + (xq - xlab) * m, tl + (tau - tl) * m]; });
    const PA = nowPlane.geometry.attributes.position.array;
    const pp = (e, z) => [SX * e[0], SY * (e[1] - T_MID), z];
    PA.set([...pp(ends[0], zf), ...pp(ends[1], zf), ...pp(ends[1], zb), ...pp(ends[0], zb)]);
    nowPlane.geometry.attributes.position.needsUpdate = true;
    nowPlane.material.uniforms.uTime.value = time;
    nowPlane.material.uniforms.uOp.value = block ? 0.45 : 1; }
}

/* =====================================================================
   8. Camera and picking
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const r = cam.r + S.coordMix * Math.abs(S.betaV) * 2.2;
  const sp = Math.sin(cam.phi);
  camera.position.set(r * sp * Math.sin(cam.theta), r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
}
const drag = { x: 0, y: 0, moved: 0, pts: new Map(), pinch: 0 };
function setCamPreset(name) {
  const p = CAMS[name]; if (!p) return;
  let d = (p[0] - cam.theta) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  cam.tTheta = cam.theta + d; cam.tPhi = p[1]; cam.tR = p[2];
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === name)));
}
function projectToStage(v) {
  const rect = stage.getBoundingClientRect(), p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * rect.width, y: (-p.y * 0.5 + 0.5) * rect.height, z: p.z };
}
function pickAt(px, py) {
  if (!glOK) return;
  let best = -1, bd = 14 * 14;
  const v = new THREE.Vector3();
  for (let r = 0; r < N_RUNS; r++) for (let q = 0; q < 3; q++) {
    if (RUN.pickV[3 * r + q] < 0.3) continue;
    v.set(RUN.pick[9 * r + 3 * q], RUN.pick[9 * r + 3 * q + 1], RUN.pick[9 * r + 3 * q + 2]);
    const p = projectToStage(v), d = (p.x - px) ** 2 + (p.y - py) ** 2;
    if (d < bd) { bd = d; best = r; }
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
    const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (drag.pinch > 0) cam.tR = Math.min(16, Math.max(3.0, cam.tR * drag.pinch / d));
    drag.pinch = d; drag.moved += 10; return;
  }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
  drag.x = ev.clientX; drag.y = ev.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
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
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(16, Math.max(3.0, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   9. Tags
   ===================================================================== */
function mkTag(cls, text) { const el = document.createElement('div'); el.className = 'tag ' + cls; el.textContent = text; tagsBox.appendChild(el); return el; }
const tagSrc = mkTag('', ''), tagFriend = mkTag('', ''), tagWigner = mkTag('cy', 'WIGNER'), tagBob = mkTag('cy', 'BOB'), tagRef = mkTag('', ''), tagNow = mkTag('hot', 'NOW'), tagUndo = mkTag('', ''), tagAxis = mkTag('', '');
function labelStaticTags() {
  tagSrc.textContent = T('源 SOURCE', 'SOURCE'); tagFriend.textContent = T('朋友 FRIEND', 'FRIEND');
  tagRef.textContent = T('汇合 REFEREE', 'REFEREE'); tagUndo.textContent = T('撤销 UNDO', 'UNDO'); tagAxis.textContent = T('t ↑ 时间', 't ↑ time');
}
labelStaticTags();
function placeTag(el, p, show = true) {
  if (!glOK || !show) { el.style.display = 'none'; return; }
  const q = projectToStage(new THREE.Vector3(p[0], p[1], p[2]));
  if (q.z > 1 || q.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.style.left = q.x + 'px'; el.style.top = q.y + 'px';
}
function updateTags() {
  const zf = -DEPTH / 2 - 0.25;
  placeTag(tagSrc, scene(0, -0.22, zf));
  placeTag(tagFriend, scene(X_F - 0.35, T_F, zf));
  placeTag(tagWigner, scene(-L - 0.2, T_W + 0.22, zf));
  placeTag(tagBob, scene(L + 0.25, T_B + 0.2, zf));
  placeTag(tagRef, scene(0, T_C + 0.22, zf));
  placeTag(tagUndo, scene(X_U - 0.4, T_U, zf), S.model === 0 && S.undo === 1);
  placeTag(tagAxis, scene(-2.2, T_TOP, zf));
  const tau = tauNow(), g = gam(S.betaV), xq = 2.25 / g - S.betaV * tau, tl = g * (tau + S.betaV * xq), m = S.coordMix;
  placeTag(tagNow, [SX * (2.25 + (xq - 2.25) * m) + 0.25, SY * (tl + (tau - tl) * m - T_MID), zf]);
}

/* =====================================================================
   10. 2D panels
   ===================================================================== */
let meterGeom = null, gridGeom = null;
function drawMeter() {
  const dpr = fitCanvas(cvMeter), ctx = cvMeter.getContext('2d'), W2 = cvMeter.width, Hh = cvMeter.height;
  ctx.clearRect(0, 0, W2, Hh);
  const pl = 16 * dpr, pr = 16 * dpr, iw = W2 - pl - pr, cy = Hh * 0.52, bh = Math.min(26 * dpr, Hh * 0.2);
  if (iw < 60) return;
  const X = (s) => pl + (s + 3) / 6 * iw, TS = 2 * Math.SQRT2;
  meterGeom = { dpr };
  ctx.fillStyle = 'rgba(111, 142, 165, 0.16)'; ctx.fillRect(X(-2), cy - bh / 2, X(2) - X(-2), bh);
  ctx.fillStyle = 'rgba(25, 240, 255, 0.18)'; ctx.fillRect(X(2), cy - bh / 2, X(TS) - X(2), bh); ctx.fillRect(X(-TS), cy - bh / 2, X(-2) - X(-TS), bh);
  ctx.save(); ctx.beginPath(); ctx.rect(X(TS), cy - bh / 2, X(3) - X(TS), bh); ctx.rect(X(-3), cy - bh / 2, X(-TS) - X(-3), bh); ctx.clip();
  ctx.strokeStyle = 'rgba(255, 80, 100, 0.45)'; ctx.lineWidth = 1 * dpr;
  for (let x = X(-3) - bh; x < X(3) + bh; x += 7 * dpr) { ctx.beginPath(); ctx.moveTo(x, cy + bh / 2); ctx.lineTo(x + bh, cy - bh / 2); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const s of [-3, -2, -1, 0, 1, 2, 3]) ctx.fillText(String(s), X(s), cy + bh / 2 + 4 * dpr);
  ctx.fillText('2√2', X(TS), cy + bh / 2 + 16 * dpr);
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.textBaseline = 'bottom';
  ctx.fillStyle = DIM; ctx.fillText(T('局域 · 答案表 |S| ≤ 2', 'local · answer tables |S| ≤ 2'), X(0), cy - bh / 2 - 4 * dpr);
  ctx.textAlign = 'right'; ctx.fillStyle = CY; ctx.fillText(T('量子 ≤ 2√2', 'quantum ≤ 2√2'), X(TS) - 2 * dpr, cy - bh / 2 - 16 * dpr);
  ctx.fillStyle = WARN; ctx.textBaseline = 'top'; ctx.fillText(T('禁区', 'forbidden'), X(3), cy + bh / 2 + 28 * dpr); ctx.textAlign = 'center';
  const Sl = chsh(lawE());
  if (S.model === 0) { const sm = sMax(); ctx.strokeStyle = SG; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(X(sm), cy - bh / 2 - 2 * dpr); ctx.lineTo(X(sm), cy + bh / 2 + 2 * dpr); ctx.stroke(); ctx.setLineDash([]); }
  const emp = empiricalShown();
  if (emp) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2 * dpr; ctx.beginPath(); ctx.moveTo(X(emp.S - 2 * emp.sigma), cy); ctx.lineTo(X(emp.S + 2 * emp.sigma), cy); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(X(emp.S), cy, 3.5 * dpr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = AM; ctx.shadowColor = AM; ctx.shadowBlur = 10 * dpr;
  ctx.beginPath(); ctx.moveTo(X(Sl), cy - bh / 2 - 1 * dpr); ctx.lineTo(X(Sl) - 6 * dpr, cy - bh / 2 - 11 * dpr); ctx.lineTo(X(Sl) + 6 * dpr, cy - bh / 2 - 11 * dpr); ctx.closePath(); ctx.fill();
  ctx.fillRect(X(Sl) - 1 * dpr, cy - bh / 2, 2 * dpr, bh); ctx.shadowBlur = 0;
  $('meterMeta').innerHTML = T(`S = ${Sl.toFixed(3)}`, `S = ${Sl.toFixed(3)}`) + (emp ? T(` · 档案 ${emp.S.toFixed(2)} ± ${(2 * emp.sigma).toFixed(2)}`, ` · archive ${emp.S.toFixed(2)} ± ${(2 * emp.sigma).toFixed(2)}`) : T(' · 档案：尚无汇合记录', ' · archive: no meeting yet')) + (S.model === 0 ? T(` · S<sub>max</sub> ${sMax().toFixed(3)}`, ` · S<sub>max</sub> ${sMax().toFixed(3)}`) : '');
}
function empiricalShown() { return blockView() || tauNow() >= tp(0, T_C) - 1e-9 ? archiveE() : null; }
function drawGrid() {
  const dpr = fitCanvas(cvGrid), ctx = cvGrid.getContext('2d'), W2 = cvGrid.width, Hh = cvGrid.height;
  ctx.clearRect(0, 0, W2, Hh);
  const pl = 78 * dpr, pt = 16 * dpr, pr = 8 * dpr, pb = 6 * dpr, cw = (W2 - pl - pr) / 2, ch = (Hh - pt - pb) / 2;
  if (cw < 30 || ch < 20) return;
  gridGeom = { pl, pt, cw, ch, dpr };
  const E = lawE(), emp = empiricalShown();
  const rowName = [T('问朋友', 'ask friend'), T('撤销后测', 'undo, measure')], colName = [`θ₀ ${deg(S.th0)}`, `θ₁ ${deg(S.th1)}`];
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.fillStyle = DIM; ctx.textBaseline = 'middle';
  for (let x = 0; x < 2; x++) { ctx.textAlign = 'right'; ctx.fillText(`x=${x}`, pl - 6 * dpr, pt + ch * (x + 0.36)); ctx.fillText(rowName[x], pl - 6 * dpr, pt + ch * (x + 0.66)); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (let y = 0; y < 2; y++) ctx.fillText(`y=${y} · ${colName[y]}`, pl + cw * (y + 0.5), pt - 3 * dpr);
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
    const x0 = pl + cw * y + 3 * dpr, y0 = pt + ch * x + 3 * dpr, w = cw - 6 * dpr, h = ch - 6 * dpr;
    const focused = S.focus === x * 2 + y + 1;
    ctx.strokeStyle = focused ? AM : FAINT; ctx.lineWidth = (focused ? 1.6 : 1) * dpr; ctx.strokeRect(x0, y0, w, h);
    const mid = x0 + w / 2, by = y0 + h * 0.62, bw = w * 0.42;
    ctx.strokeStyle = FAINT; ctx.beginPath(); ctx.moveTo(mid, y0 + 6 * dpr); ctx.lineTo(mid, y0 + h - 4 * dpr); ctx.stroke();
    const e = E[x][y];
    ctx.fillStyle = e >= 0 ? CY : MG; ctx.globalAlpha = 0.75; ctx.fillRect(Math.min(mid, mid + e * bw), by - 5 * dpr, Math.abs(e * bw), 10 * dpr); ctx.globalAlpha = 1;
    if (emp) { const ee = emp.E[x][y]; ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(mid + ee * bw, by, 3 * dpr, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = INK; ctx.font = `${11 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${x === 1 && y === 1 ? '−' : '+'}E = ${e >= 0 ? '+' : ''}${e.toFixed(3)}`, x0 + 5 * dpr, y0 + 4 * dpr);
    if (emp) { ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(`n ${emp.n[x][y]}`, x0 + w - 4 * dpr, y0 + h - 2 * dpr); }
  }
  $('gridMeta').textContent = `#${archiveHash}`;
}
cvGrid.addEventListener('click', (ev) => {
  if (!gridGeom) return;
  const rect = cvGrid.getBoundingClientRect(), d = gridGeom.dpr;
  const cx = (ev.clientX - rect.left) * d, cy = (ev.clientY - rect.top) * d;
  const y = Math.floor((cx - gridGeom.pl) / gridGeom.cw), x = Math.floor((cy - gridGeom.pt) / gridGeom.ch);
  if (x < 0 || x > 1 || y < 0 || y > 1) return;
  const f = x * 2 + y + 1;
  setFocus(S.focus === f ? 0 : f);
});

/* =====================================================================
   11. Readouts, notes and controls
   ===================================================================== */
const PAIR_NAMES = () => [T('Σ 全部', 'Σ all'), '(0, 0)', '(0, 1)', '(1, 0)', '(1, 1)'];
function buildBranchUI() {
  const names = ['Σ', '(0,0)', '(0,1)', '(1,0)', '(1,1)'], lbl = [T('全部运行', 'all runs'), T('问 · θ₀', 'ask · θ₀'), T('问 · θ₁', 'ask · θ₁'), T('撤 · θ₀', 'undo · θ₀'), T('撤 · θ₁', 'undo · θ₁')];
  $('branches').innerHTML = names.map((n, i) => `<button class="branch" data-focus="${i}" aria-pressed="${S.focus === i}" style="--bc:${i === 0 ? SG : CY}"><span class="sym">${n}</span><span class="lbl">${lbl[i]}</span></button>`).join('');
  document.querySelectorAll('#branches .branch').forEach((b) => b.addEventListener('click', () => setFocus(+b.dataset.focus)));
}
function setFocus(f) {
  if (f < 0 || f > 4) return;
  S.focus = f;
  document.querySelectorAll('#branches .branch').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.focus === f)));
}
let syncedTau = NaN;
function syncOutputs() {
  syncedTau = tauNow();
  const E = lawE(), Sl = chsh(E), v = S.model === 0 ? vis() : null;
  $('oCopies').textContent = copiesLabel(copies());
  $('oFid').textContent = fmtFid(fid());
  $('oPhi').textContent = deg(S.phi); $('oTh0').textContent = deg(S.th0); $('oTh1').textContent = deg(S.th1);
  $('oSplit').textContent = S.split.toFixed(2);
  $('oBeta').textContent = S.beta.toFixed(2);
  document.querySelectorAll('#undoChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.undo === S.undo)));
  document.querySelectorAll('#modelChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.model === S.model)));
  document.querySelectorAll('#coordChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.coord === S.coord)));
  document.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.mode === S.mode)));
  document.querySelectorAll('#table4 .bit').forEach((b) => { const k = +b.dataset.bit; b.setAttribute('aria-pressed', String(S.table[k] > 0)); b.querySelector('b').textContent = S.table[k] > 0 ? '+1' : '−1'; });
  $('table4').classList.toggle('off', S.model !== 1 || S.mixed);
  const quantumOnly = S.model !== 0;
  for (const id of ['copies', 'fid', 'phi', 'th0', 'th1']) $(id).disabled = quantumOnly || ((id === 'copies' || id === 'fid') && !S.undo);
  $('undoNote').innerHTML = S.undo
    ? T(`撤销后剩下的相干可见度 v = f<sup>M</sup> = ${fmtV(vLog10())}（示意假设）。它把 X 部分的关联乘上 v；最优角度下 S<sub>max</sub> = 2√(1+v²) = ${sMax().toFixed(3)}。`,
        `Coherence left after the undo: v = f<sup>M</sup> = ${fmtV(vLog10())} (a schematic assumption). It multiplies the X part of the correlations; at the best angles S<sub>max</sub> = 2√(1+v²) = ${sMax().toFixed(3)}.`)
    : T('不撤销：朋友的记录已经把相干带走，Wigner 测到的 X 与 Bob 毫无关联，等同于 v = 0，S<sub>max</sub> = 2。', 'No undo: the friend’s record has already carried the coherence away; the X that Wigner measures is uncorrelated with Bob, the same as v = 0, so S<sub>max</sub> = 2.');
  $('angleNote').innerHTML = T(`E(0, y) = cos θ<sub>y</sub>；E(1, y) = cos φ cos θ<sub>y</sub> + v sin φ sin θ<sub>y</sub>。默认角度 φ = 90°、θ = ±45° 就是 Lean 里冻结的那组观测量。`,
    `E(0, y) = cos θ<sub>y</sub>; E(1, y) = cos φ cos θ<sub>y</sub> + v sin φ sin θ<sub>y</sub>. The default angles φ = 90°, θ = ±45° are exactly the observables frozen in Lean.`);
  $('tableNote').innerHTML = S.model === 1
    ? (S.mixed
      ? T(`16 张表按随机权重混合：S = ${Sl.toFixed(3)}。混合是加权平均，每张表的 S 都是 ±2，所以 |S| ≤ 2。`, `The 16 tables are mixed with random weights: S = ${Sl.toFixed(3)}. A mixture is a weighted average and every table has S = ±2, so |S| ≤ 2.`)
      : T(`这张表给出 S = ${S.table[0]}·${S.table[2]} + ${S.table[0]}·${S.table[3]} + ${S.table[1]}·${S.table[2]} − ${S.table[1]}·${S.table[3]} = ${Sl.toFixed(0)}。点四个格子翻转符号：S 只能是 +2 或 −2。`, `This table gives S = ${S.table[0]}·${S.table[2]} + ${S.table[0]}·${S.table[3]} + ${S.table[1]}·${S.table[2]} − ${S.table[1]}·${S.table[3]} = ${Sl.toFixed(0)}. Click the four cells to flip signs: S can only be +2 or −2.`))
    : T('现在由量子账本产生结果。切到“绝对事实答案表”，每次运行都带一张写满四个答案的表。', 'The quantum ledgers produce the outcomes now. Switch to “Absolute answer table” and every run carries a table with all four answers.');
  const o = orderInfo();
  const firstTxt = o.first === 'W' ? T('Wigner 先测', 'Wigner measures first') : o.first === 'B' ? T('Bob 先测', 'Bob measures first') : T('两边同时', 'both at once');
  $('frameNote').innerHTML = T(`${firstTxt}（Δτ = ${Math.abs(o.dW - o.dB).toFixed(2)}）。两次测量是类空间隔的：β 越过 −0.117 顺序就翻转，四组关联不变。汇合事件总在两次测量之后，这里晚 ${o.gapC.toFixed(2)}。`,
    `${firstTxt} (Δτ = ${Math.abs(o.dW - o.dB).toFixed(2)}). The two measurements are spacelike separated: the order flips as β crosses −0.117, and the four correlations stay the same. The meeting event always comes after both, here by ${o.gapC.toFixed(2)}.`);
  $('roS').textContent = Sl.toFixed(3);
  $('roV').innerHTML = S.model === 0 ? fmtV(vLog10()) : '—';
  $('roSmax').textContent = S.model === 0 ? sMax().toFixed(3) : '2.000';
  const emp = empiricalShown();
  $('roSemp').innerHTML = emp ? `${emp.S.toFixed(3)} <small>± ${(2 * emp.sigma).toFixed(2)}</small>` : T('尚无汇合记录', 'no meeting yet');
  const lg = ledgers();
  $('roLedger').innerHTML = T(`朋友 ${lg.friendWritten}${lg.erased ? `（划掉 ${lg.erased}）` : ''} · Wigner ${lg.wigner} · Bob ${lg.bob} · 汇合 ${lg.referee}`, `friend ${lg.friendWritten}${lg.erased ? ` (${lg.erased} struck)` : ''} · Wigner ${lg.wigner} · Bob ${lg.bob} · referee ${lg.referee}`);
  const violated = Sl > 2 + 1e-9;
  const prem = [
    [T('绝对事实：朋友的结果在每次运行里都是事实，也包括被撤销的那些', 'Absolute facts: the friend’s result is a fact in every run, the undone ones included'), violated ? 'drop' : 'keep'],
    [T('设置自由：Wigner 和 Bob 的选择与答案无关', 'Free settings: Wigner’s and Bob’s choices are independent of the answers'), 'keep'],
    [T('无超距：一边的设置不影响另一边的结果', 'No superluminal influence: one side’s setting does not affect the other side’s result'), 'keep']
  ];
  const verdict = S.model === 1
    ? T(`答案表模式：三条都成立，|S| ≤ 2（当前 ${Sl.toFixed(3)}）。`, `Answer-table mode: all three hold, and |S| ≤ 2 (now ${Sl.toFixed(3)}).`)
    : violated
      ? T(`S = ${Sl.toFixed(3)} &gt; 2：三条不可兼得。理论卷放弃第一条——事实只相对于记录它的账本（其他解释可以放弃别的前提）。`, `S = ${Sl.toFixed(3)} &gt; 2: the three cannot all hold. The theory volume gives up the first: a fact is relative to the ledger that records it (other interpretations may give up another premise).`)
      : T(`S = ${Sl.toFixed(3)} ≤ 2：这组数据与三条都兼容，朋友的结果在这里可以当作绝对事实。`, `S = ${Sl.toFixed(3)} ≤ 2: these data are compatible with all three, so here the friend’s result can be treated as an absolute fact.`);
  $('premises').innerHTML = prem.map(([t, c]) => `<div class="p ${c}"><i></i><span>${t}</span></div>`).join('') + `<div class="verdict">${verdict}</div>`;
  $('pillMode').innerHTML = `MODE <strong>${S.mode === 1 ? 'BLOCK' : 'LINEAR'}</strong>`;
  $('pillFrame').innerHTML = `β <strong>${S.beta.toFixed(2)}</strong>`;
  $('pillS').innerHTML = `CHSH <strong>${Sl.toFixed(3)}</strong>`;
  $('presetNote').textContent = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义参数。', 'Custom settings.');
  updateMarks();
}
function updateMarks() {
  const [a, b] = tauRange(), items = [];
  const add = (t, label, cls) => { const f = (t - a) / (b - a); items.push(`<i class="${cls}" style="left:${(f * 100).toFixed(2)}%">${label}</i>`); };
  const o = orderInfo();
  add(o.dW, 'W', ''); add(o.dB, 'B', ''); add(o.dC, T('汇合', 'meet'), 'last');
  $('marks').innerHTML = items.join('');
}

let dirtyArchive = true;
function clearPreset() { S.preset = null; document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', 'false')); }
function bindRange(id, fn) { const el = $(id); el.addEventListener('input', () => { fn(parseFloat(el.value)); syncOutputs(); }); }
bindRange('copies', (v) => { S.mIdx = Math.round(v); dirtyArchive = true; clearPreset(); });
bindRange('fid', (v) => { S.fidV = v; dirtyArchive = true; clearPreset(); });
bindRange('phi', (v) => { S.phi = v; dirtyArchive = true; clearPreset(); });
bindRange('th0', (v) => { S.th0 = v; dirtyArchive = true; clearPreset(); });
bindRange('th1', (v) => { S.th1 = v; dirtyArchive = true; clearPreset(); });
bindRange('split', (v) => { S.split = v; });
bindRange('beta', (v) => { setBeta(v, false); clearPreset(); });
let lastOrder = null;
function setBeta(v, animate = true) {
  S.beta = Math.max(-0.6, Math.min(0.6, v)); $('beta').value = S.beta;
  if (!animate || reduceMotion) S.betaV = S.beta;
}
document.querySelectorAll('#undoChips .chip').forEach((b) => b.addEventListener('click', () => { S.undo = +b.dataset.undo; dirtyArchive = true; clearPreset(); syncOutputs(); }));
document.querySelectorAll('#modelChips .chip').forEach((b) => b.addEventListener('click', () => { S.model = +b.dataset.model; if (S.model === 1 && !S.mixed) setPureTable(); dirtyArchive = true; clearPreset(); syncOutputs(); }));
document.querySelectorAll('#coordChips .chip').forEach((b) => b.addEventListener('click', () => { S.coord = +b.dataset.coord; if (reduceMotion) S.coordMix = S.coord; syncOutputs(); }));
document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => { S.mode = +b.dataset.mode; syncOutputs(); if (S.sel >= 0) selectRun(S.sel); }));
document.querySelectorAll('#table4 .bit').forEach((b) => b.addEventListener('click', () => {
  const k = +b.dataset.bit; S.table[k] = -S.table[k];
  if (S.model !== 1) S.model = 1;
  setPureTable(); dirtyArchive = true; clearPreset(); syncOutputs();
}));
$('mixBtn').addEventListener('click', () => { S.model = 1; setRandomMix(); dirtyArchive = true; clearPreset(); syncOutputs(); });
$('pureBtn').addEventListener('click', () => { S.model = 1; setPureTable(); dirtyArchive = true; clearPreset(); syncOutputs(); });
$('bestBtn').addEventListener('click', () => {
  const [a, b] = bestAngles(); S.th0 = Math.round(a); S.th1 = Math.round(b); $('th0').value = S.th0; $('th1').value = S.th1;
  dirtyArchive = true; clearPreset(); syncOutputs();
});
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));

const toast = (html) => TRV.toast($('toast'), html);
const glitch = () => TRV.glitch($('app'));
TRV.startGlitch($('app'));

function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.model = p.model;
  if (p.model === 0) {
    S.undo = p.undo; S.mIdx = p.m; S.fidV = fidV(p.f);
    if (p.best) { S.phi = 90; const [a, b] = bestAngles(); S.th0 = Math.round(a); S.th1 = Math.round(b); }
    else { S.phi = p.phi; S.th0 = p.th0; S.th1 = p.th1; }
  } else if (p.mix) setRandomMix();
  else { S.table = p.tableBits.slice(); setPureTable(); }
  $('copies').value = S.mIdx; $('fid').value = S.fidV; $('phi').value = S.phi; $('th0').value = S.th0; $('th1').value = S.th1;
  setBeta(p.beta, true);
  S.preset = name;
  document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === name)));
  dirtyArchive = true; selectRun(-1);
  if (p.tau !== undefined) {
    S.playing = false; setPlayUI();
    const [a, b] = tauRange(S.beta); S.nowFrac = (p.tau - a) / (b - a); $('now').value = S.nowFrac;
  } else if (!reduceMotion) { S.nowFrac = 0; S.dir = 1; S.playing = true; setPlayUI(); }
  syncOutputs(); glitch();
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
  if (ev.key === 'Escape') { selectRun(-1); return; }
  if (ev.key === ' ' && !(ev.target && ev.target.tagName === 'BUTTON')) { ev.preventDefault(); S.playing = !S.playing; S.hold = 0; setPlayUI(); }
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) {
    ev.preventDefault(); S.playing = false; setPlayUI();
    S.nowFrac = Math.min(1, Math.max(0, S.nowFrac + (ev.key === 'ArrowRight' ? 1 : -1) * 0.01)); $('now').value = S.nowFrac;
  }
  else if (/^[1-5]$/.test(ev.key)) setFocus(+ev.key - 1);
});

let cardKey = '';
function cardState(i) { return i < 0 ? 'none' : `${i}|${S.mode}|${seen(-L, T_W)}|${seen(L, T_B)}|${seen(0, T_C)}|${seen(X_U, T_U)}|${archiveHash}`; }
function selectRun(i) {
  S.sel = i; cardKey = cardState(i);
  const card = $('runcard');
  if (i < 0) { card.innerHTML = T('点击一个测量事件，选出一次运行：它从源到两边、再到汇合的整条路径会一起高亮。', 'Click a measurement event to pick one run: its whole path from the source to both sides and on to the meeting lights up.'); return; }
  const x = SX_[i], y = SY_[i];
  const friend = S.model === 1
    ? T(`朋友：写下 Z = <b>${sgn(ZF[i])}</b>（答案表里的绝对事实）`, `friend: wrote Z = <b>${sgn(ZF[i])}</b> (an absolute fact in the answer table)`)
    : x === 0 ? T(`朋友：写下 Z = <b>${sgn(ZF[i])}</b>，Wigner 随后读到它`, `friend: wrote Z = <b>${sgn(ZF[i])}</b>, which Wigner then reads`)
      : T(`朋友：写下了一个 Z，${seen(X_U, T_U) && S.undo ? '已被相干撤销，任何账本里都没有它' : '随后会被 Wigner 撤销'}`, `friend: wrote some Z, ${seen(X_U, T_U) && S.undo ? 'now coherently undone; no ledger holds it' : 'which Wigner will undo'}`);
  const wig = seen(-L, T_W) ? T(`Wigner（${x === 0 ? '问朋友' : '撤销后测'}）：<b>${sgn(A[i])}</b>`, `Wigner (${x === 0 ? 'ask friend' : 'undo, measure'}): <b>${sgn(A[i])}</b>`) : T('Wigner：在这个切片里尚未测量', 'Wigner: not measured yet in this slice');
  const bob = seen(L, T_B) ? T(`Bob（θ${y ? '₁' : '₀'}）：<b>${sgn(B[i])}</b>`, `Bob (θ${y ? '₁' : '₀'}): <b>${sgn(B[i])}</b>`) : T('Bob：在这个切片里尚未测量', 'Bob: not measured yet in this slice');
  const ref = seen(0, T_C) ? T(`汇合：两边${A[i] * B[i] > 0 ? '一致' : '相反'}`, `referee: the two sides ${A[i] * B[i] > 0 ? 'agree' : 'disagree'}`) : T('汇合：两份结果还没到同一处', 'referee: the two results have not met yet');
  card.innerHTML = `RUN <b>#${String(i).padStart(3, '0')}</b> · (x, y) = (${x}, ${y})<br>${friend}<br>${wig} · ${bob}<br>${ref}`;
}

/* =====================================================================
   12. Main loop
   ===================================================================== */
let lastT = performance.now(), prevTau = tauNow(), tAcc = 0, panelTick = 0, frameCount = 0;
function resize() {
  if (!glOK) return;
  const r = stage.getBoundingClientRect();
  renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
  camera.aspect = Math.max(0.2, r.width / Math.max(1, r.height));
  camera.updateProjectionMatrix();
}
function frame(tms) {
  frameCount++;
  const dtSec = Math.min(0.1, (tms - lastT) / 1000); lastT = tms; tAcc += dtSec;
  if (dirtyArchive) { resampleArchive(); dirtyArchive = false; $('pillHash').innerHTML = `ARCHIVE <strong>${archiveHash}</strong>`; syncOutputs(); if (S.sel >= 0) selectRun(S.sel); }
  const k = reduceMotion ? 1 : 1 - Math.pow(0.004, dtSec);
  if (Math.abs(S.betaV - S.beta) > 1e-5) { S.betaV += (S.beta - S.betaV) * k; if (Math.abs(S.betaV - S.beta) < 1e-4) S.betaV = S.beta; }
  if (Math.abs(S.coordMix - S.coord) > 1e-5) { S.coordMix += (S.coord - S.coordMix) * k; if (Math.abs(S.coordMix - S.coord) < 1e-4) S.coordMix = S.coord; }
  if (S.playing && !scrubbing) {
    if (S.hold > 0) { S.hold -= dtSec; if (S.hold <= 0) S.nowFrac = S.dir > 0 ? 0 : 1; }
    else {
      S.nowFrac += S.dir * dtSec * S.speed / 16;
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 1.4; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.4; }
    }
    $('now').value = S.nowFrac;
  }
  const tau = tauNow(), o = orderInfo();
  if (S.mode === 0 && tau > prevTau) {
    if (prevTau < o.dC && tau >= o.dC) toast(T('<b>汇合</b>：两边的结果第一次出现在同一本账上，每组设置的关联这时才成为事实。', '<b>Meeting</b>: both results appear in one ledger for the first time, and only now does the correlation for each setting pair become a fact.'));
    else if (S.model === 0 && S.undo && vis() > 0.5 && prevTau < tp(X_U, T_U) && tau >= tp(X_U, T_U)) toast(T('<b>撤销</b>：在 x = 1 的那些运行里，Wigner 把朋友的测量相干地反演回去，朋友写下的结果从所有账本里消失。', '<b>Undo</b>: in the runs with x = 1, Wigner coherently reverses the friend’s measurement, and the result the friend wrote down disappears from every ledger.'));
  }
  const firstNow = orderInfo(S.beta).first;
  if (lastOrder !== null && firstNow !== lastOrder && firstNow !== 'same') toast(firstNow === 'W'
    ? T('<b>换系之后，Wigner 先测了</b>。四组关联和 S 一点没变。', '<b>After the boost, Wigner measures first.</b> The four correlations and S have not changed at all.')
    : T('<b>换系之后，Bob 先测了</b>。四组关联和 S 一点没变。', '<b>After the boost, Bob measures first.</b> The four correlations and S have not changed at all.'));
  if (firstNow !== 'same') lastOrder = firstNow;
  prevTau = tau;
  if (!(Math.abs(tau - syncedTau) <= 1e-9) && (panelTick % 3 === 0 || !S.playing)) syncOutputs();
  runLayout(dtSec);
  if (S.sel >= 0 && cardState(S.sel) !== cardKey) selectRun(S.sel);
  $('tau').innerHTML = `τ ${tau.toFixed(2)}`;
  $('hudBig').textContent = `${S.mode === 1 ? 'BLOCK' : 'LINEAR'} · β = ${S.betaV.toFixed(2)} · τ = ${tau.toFixed(2)}`;
  const firstTxt = o.first === 'W' ? T('Wigner 先测', 'Wigner first') : o.first === 'B' ? T('Bob 先测', 'Bob first') : T('同时', 'simultaneous');
  $('hudSub').textContent = `${PAIR_NAMES()[S.focus]} · ${firstTxt} · ${S.model === 1 ? T('答案表', 'answer tables') : T('量子账本', 'quantum ledgers')}${S.coord === 1 ? T(' · 该系坐标', ' · frame coordinates') : T(' · 实验室坐标', ' · lab coordinates')}`;
  if (glOK) { updateCamera(dtSec); updateGL(tAcc); renderer.render(scene3, camera); updateTags(); }
  panelTick++;
  drawMeter(); drawGrid();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { labelStaticTags(); buildBranchUI(); syncOutputs(); selectRun(S.sel); });

/* read-only probe for automated browser tests */
window.FRIEND_DEBUG = {
  /* true while a control change is waiting for the next frame: archive, boost, coordinates or notes */
  pending: () => dirtyArchive || Math.abs(S.betaV - S.beta) > 1e-6 || Math.abs(S.coordMix - S.coord) > 1e-6 || !(Math.abs(tauNow() - syncedTau) <= 1e-9),
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  archive: () => ({ x: Array.from(SX_), y: Array.from(SY_), a: Array.from(A), b: Array.from(B), zf: Array.from(ZF), hash: archiveHash }),
  law: () => { const E = lawE(); return { E, S: chsh(E), Smax: sMax(), v: vis(), vLog10: vLog10(), weights: Array.from(W) }; },
  empirical: () => { const e = archiveE(); return { ...e, shown: !!empiricalShown() }; },
  order: (b) => orderInfo(b === undefined ? S.betaV : b),
  tau: () => ({ tau: tauNow(), range: tauRange() }),
  ledgers: () => ledgers(),
  lawFor: (phi, th0, th1, v) => { const ph = phi * DEG, t = [th0 * DEG, th1 * DEG]; const E = [t.map((q) => Math.cos(q)), t.map((q) => Math.cos(ph) * Math.cos(q) + v * Math.sin(ph) * Math.sin(q))]; return chsh(E); },
  project: (i) => { if (!glOK) return null; const p = projectToStage(new THREE.Vector3(RUN.pick[9 * i], RUN.pick[9 * i + 1], RUN.pick[9 * i + 2])); return { x: p.x, y: p.y, visible: RUN.pickV[3 * i] }; },
  run: (i) => ({ z: RUN.z[i], focusA: RUN.focusA[i] })
};

/* cover state for scripts/thumbs.mjs: the whole block, grouped by setting pair, in the lab frame */
window.TRV_THUMB = () => {
  applyPreset('qubit'); S.mode = 1; S.split = 0.9; $('split').value = S.split;
  cam.tTheta = -0.95; cam.tPhi = 1.22; cam.tR = 6.4;
  S.playing = false; setPlayUI(); S.nowFrac = 0.62; $('now').value = S.nowFrac; syncOutputs();
};

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
buildBranchUI();
setPureTable();
applyPreset('qubit');
S.nowFrac = 0.35; S.playing = !reduceMotion; $('now').value = S.nowFrac;
setPlayUI(); syncOutputs(); selectRun(-1);
prevTau = tauNow(); lastOrder = orderInfo(S.beta).first;
requestAnimationFrame(frame);
})();
