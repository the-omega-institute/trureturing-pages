/* DARWIN//ECHO · 量子达尔文主义 · 事实的回声
   A one-qubit system is recorded, one environment qubit at a time, along a pointer axis chosen by the record rule.
   After n records the whole is √p|0⟩|A⟩ + √(1−p)|1⟩|B⟩ with ⟨A|B⟩ = c^n, so every entropy is that of a mixture of two
   non-orthogonal pure states and the mutual information I(S:F) of any fragment is computed exactly. Observers read
   disjoint fragments; with redundant records they agree on the pointer value and cannot agree on the phase.
   Theory: trureturing docs/develop/theory/OBSERVER-QUANTUM.md §5, GICT.md Theorem 6.26. Frozen Lean anchors are named in the
   page text. Model: independent environment qubits with a common overlap c, symmetric observer readout (see the drawer).
   Depends on: assets/vendor/three.r128.min.js (window.THREE), assets/shell.js (window.TRV). */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const N_MAX = 64, K_MAX = 8, M_MAX = 12, TAIL = 6, DELTA = 0.1;
const R_ORB = 0.42, R0 = 0.55, V_OUT = 0.3, R_SHELL = 2.15, R_OBS = 2.75;
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { mulberry32, smooth, fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, sigma: SG, ok: OK, warn: WARN, cyan: CY, magenta: MG } = TRV.palette;
const DEG = Math.PI / 180;

/* =====================================================================
   2. State and presets
   ===================================================================== */
const S = {
  theta: 60, phase: 0, eta: 0, c: 0, N: 48, K: 5, m: 3, ask: 0,
  nowFrac: 0.5, playing: true, dir: 1, speed: 1, hold: 0, sel: -1, preset: 'ideal'
};
const PRESETS = {
  ideal: { theta: 60, phase: 0, eta: 0, c: 0, N: 48, K: 5, m: 3, ask: 0,
    zh: '每份记录都是完美副本（c = 0）。ϑ = 60° 时指针概率 p = 0.75，经典信息 H = 0.811 比特。第一份记录写下之后，任何一小片碎片都恰好带着这 0.811 比特，五位观察者读各自的碎片，全都一致。',
    en: 'Every record is a perfect copy (c = 0). At ϑ = 60° the pointer probability is p = 0.75 and the classical information is H = 0.811 bits. From the first record on, any small fragment carries exactly those 0.811 bits, and the five observers reading their own fragments all agree.' },
  partial: { theta: 60, phase: 0, eta: 0, c: 0.8, N: 48, K: 5, m: 6, ask: 0,
    zh: '每份记录只是部分副本（c = 0.8）。一小片碎片只带一点信息，要攒够好几份才爬上平台；平台一旦形成，读 6 份的观察者就几乎总是一致。',
    en: 'Each record is only a partial copy (c = 0.8). A small fragment carries little, and several records are needed to climb onto the plateau; once it forms, observers reading 6 records almost always agree.' },
  weak: { theta: 60, phase: 0, eta: 0, c: 0.97, N: 48, K: 5, m: 4, ask: 0,
    zh: '记录很弱（c = 0.97）。每人读 4 份，读对的概率只有 73%，五个人全体一致的概率只有约 21%。要攒 22 份记录才抵得上九成经典信息，48 份里只够分给两个人——这个值还算不上公共事实。',
    en: 'Very weak records (c = 0.97). Reading 4 records, each observer is right only 73% of the time, and all five agree with probability of only about 21%. It takes 22 records to hold 90% of the classical information, so 48 records suffice for only two people; the value is hardly a public fact.' },
  equal: { theta: 90, phase: 0, eta: 0, c: 0, N: 48, K: 5, m: 3, ask: 0,
    zh: '等权叠加（ϑ = 90°，p = ½）：经典信息正好 1 比特，平台在 1 比特，整个环境拿到 2 比特。',
    en: 'Equal superposition (ϑ = 90°, p = ½): exactly 1 bit of classical information, a plateau at 1 bit, and 2 bits for the whole environment.' },
  fourier: { theta: 60, phase: 0, eta: 90, c: 0, N: 48, K: 5, m: 3, ask: 0,
    zh: '换一种记录规则：环境记 X 而不是 Z。指针轴转到水平方向，布洛赫矢量改向 X 轴塌缩，成为公共事实的是 X 的值——指针基由记账纪律选定。',
    en: 'A different record rule: the environment records X instead of Z. The pointer axis turns horizontal, the Bloch vector collapses onto the X axis, and the value of X becomes the public fact: the pointer basis is chosen by the record-keeping rule.' },
  askx: { theta: 90, phase: 0, eta: 0, c: 0, N: 48, K: 5, m: 3, ask: 1,
    zh: '同样的完美记录，但观察者问的是相位（与指针互补的量）。一小片碎片对相位一无所知，每人都在猜，彼此不再一致：只有几乎整个环境才知道相位——每份账本只有一种经典。',
    en: 'The same perfect records, but the observers ask about the phase (the quantity complementary to the pointer). A small fragment knows nothing about the phase, each observer is guessing and they no longer agree; only almost the whole environment knows the phase. One classical world per ledger.' },
  few: { theta: 60, phase: 0, eta: 0, c: 0.6, N: 6, K: 2, m: 3, ask: 0,
    zh: '环境只有 6 份记录，而且不完美（c = 0.6）：能各自带走九成经典信息的互不重叠碎片只有 3 片，冗余度很低，这个事实的客观性很脆弱。',
    en: 'An environment of only 6 imperfect records (c = 0.6): only 3 disjoint fragments can each carry 90% of the classical information; the redundancy is low and the fact’s objectivity is fragile.' },
  eigen: { theta: 0, phase: 0, eta: 0, c: 0, N: 48, K: 5, m: 3, ask: 0,
    zh: '系统已经处在指针态（ϑ = 0°，p = 1）：没有悬念，H = 0。环境照样复制，但复制的是一个本来就确定的值，互信息处处为 0。',
    en: 'The system is already in a pointer state (ϑ = 0°, p = 1): there is no uncertainty, H = 0. The environment still copies, but what it copies was certain anyway, so the mutual information is 0 everywhere.' }
};

/* =====================================================================
   3. The law
   ===================================================================== */
const blochVec = () => { const t = S.theta * DEG, f = S.phase * DEG; return [Math.sin(t) * Math.cos(f), Math.sin(t) * Math.sin(f), Math.cos(t)]; };
const axisVec = () => [Math.sin(S.eta * DEG), 0, Math.cos(S.eta * DEG)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const pointerP = () => Math.min(1, Math.max(0, 0.5 * (1 + dot(blochVec(), axisVec()))));
function h2(r) {                                         // entropy in bits of the eigenvalues (1 ± r)/2
  const a = Math.min(1, Math.max(0, (1 + r) / 2)), b = 1 - a;
  let s = 0; if (a > 1e-15) s -= a * Math.log2(a); if (b > 1e-15) s -= b * Math.log2(b); return s;
}
const q = (p) => 4 * p * (1 - p);
const rMix = (p, s) => Math.sqrt(Math.max(0, 1 - q(p) * (1 - s * s)));       // mixture of two pure states with overlap s
const rSys = (p, c, n) => Math.sqrt(Math.max(0, (2 * p - 1) ** 2 + q(p) * c ** (2 * n)));
const H = (p) => h2(Math.abs(2 * p - 1));
function mutualInfo(p, c, n, m) {                        // I(S:F) for a fragment of m of the n records
  return h2(rSys(p, c, n)) + h2(rMix(p, c ** m)) - h2(rMix(p, c ** (n - m)));
}
const pZ = (p, c, m) => 0.5 * (1 + Math.sqrt(Math.max(0, 1 - q(p) * c ** (2 * m))));    // best guess of the pointer value
const pX = (p, c, n, m) => 0.5 * (1 + Math.sqrt(q(p)) * c ** (n - m));                   // best guess of the phase
const pObs = (c, m) => 0.5 * (1 + Math.sqrt(Math.max(0, 1 - c ** (2 * m))));              // symmetric readout of m records
function redundancy(p, c, n) {
  const h = H(p);
  if (h < 1e-9 || n < 1) return { R: null, m: null };
  for (let m = 1; m <= n; m++) if (mutualInfo(p, c, n, m) >= (1 - DELTA) * h - 1e-12) return { R: n / m, m };
  return { R: 0, m: null };
}

/* =====================================================================
   4. Time, fragments and this run's outcomes (fixed seeds)
   ===================================================================== */
const tMax = () => S.N + TAIL;
const tNow = () => S.nowFrac * tMax();
const nNow = () => Math.min(S.N, Math.floor(tNow() + 1e-9));
const groupOf = (k) => (k - 1) % S.K;                   // record k (1-based) drifts towards observer group g
const rankOf = (k) => Math.floor((k - 1) / S.K);
function fragmentSize(j, n = nNow()) { let c = 0; for (let k = 1; k <= n; k++) if (groupOf(k) === j && rankOf(k) < S.m) c++; return c; }
const seed = mulberry32(0xDA3317);
const U_FACT = seed(), U_FACTX = seed();
const U_REC = new Float64Array(N_MAX + 1), U_OBS = new Float64Array(K_MAX), U_OBSX = new Float64Array(K_MAX);
const JIT = new Float64Array(N_MAX + 1), JIT2 = new Float64Array(N_MAX + 1);
for (let k = 1; k <= N_MAX; k++) { U_REC[k] = seed(); JIT[k] = seed() - 0.5; JIT2[k] = seed() - 0.5; }
for (let j = 0; j < K_MAX; j++) { U_OBS[j] = seed(); U_OBSX[j] = seed(); }
let RUN = { fact: 0, factX: 1, rec: new Int8Array(N_MAX + 1), obs: [], obsX: [], hash: '--------' };
function fnv(values) { let h = 0x811c9dc5; for (const v of values) { h ^= (v + 3) & 0xff; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
function resampleRun() {
  const p = pointerP(), c = S.c;
  const fact = U_FACT < p ? 0 : 1;
  const perp = Math.sqrt(q(p)) * c ** S.N;                // |⟨X'⟩| after all N records
  const factX = U_FACTX < 0.5 * (1 + perp) ? 1 : -1;
  const rec = new Int8Array(N_MAX + 1);
  const p1 = pObs(c, 1);
  for (let k = 1; k <= S.N; k++) rec[k] = U_REC[k] < p1 ? fact : 1 - fact;
  const obs = [], obsX = [];
  for (let j = 0; j < S.K; j++) {
    const m = fragmentSize(j, S.N);
    obs.push(m ? (U_OBS[j] < pObs(c, m) ? fact : 1 - fact) : -1);
    obsX.push(m ? (U_OBSX[j] < pX(p, c, S.N, m) ? factX : -factX) : 0);
  }
  const vals = [fact, factX]; for (let k = 1; k <= S.N; k++) vals.push(rec[k]); vals.push(...obs, ...obsX);
  RUN = { fact, factX, rec, obs, obsX, hash: fnv(vals) };
}
/* what an observer holds at the current moment: the reading only once their fragment is complete */
function observerNow(j) {
  const n = nNow(), m = fragmentSize(j, n), full = fragmentSize(j, S.N);
  const p = pointerP(), c = S.c;
  if (S.ask === 0) return { m, full, ready: m > 0 && m === full, value: RUN.obs[j], P: m ? pObs(c, m) : 0.5, truth: RUN.fact };
  return { m, full, ready: m > 0 && m === full, value: RUN.obsX[j], P: m ? pX(p, c, n, m) : 0.5, truth: RUN.factX };
}
/* chance that every observer with a complete fragment gives the same answer (independent readouts given the branch) */
function allAgreeProbability() {
  const ps = []; for (let j = 0; j < S.K; j++) { const o = observerNow(j); if (o.full > 0) ps.push(o.P > 0.5 ? (S.ask === 0 ? pObs(S.c, o.full) : o.P) : 0.5); }
  if (!ps.length) return 0;
  return ps.reduce((a, x) => a * x, 1) + ps.reduce((a, x) => a * (1 - x), 1);
}
function consensus() {
  const ready = []; for (let j = 0; j < S.K; j++) { const o = observerNow(j); if (o.ready) ready.push(o.value); }
  if (!ready.length) return null;
  const counts = new Map(); for (const v of ready) counts.set(v, (counts.get(v) || 0) + 1);
  const top = Math.max(...counts.values());
  return { agree: top, of: ready.length, all: top === ready.length };
}

/* =====================================================================
   5. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags');
const cvPlateau = $('plateau'), cvLock = $('lock'), cvBloch = $('bloch');
const deg = (v) => `${Math.round(v)}°`;
const valName = (v) => (S.ask === 0 ? (v === 0 ? '0' : '1') : (v > 0 ? '+' : '−'));
const valCol = (v) => (S.ask === 0 ? (v === 0 ? CY : MG) : (v > 0 ? CY : MG));
const valRGB = (v) => (v === 0 || v > 0 ? COL.cyan : COL.magenta);

/* =====================================================================
   6. Three.js scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false;
let recPts, obsPts, selPts, linkLines, orbLines, orbMesh;
const cam = { theta: -0.6, phi: 1.05, r: 7.2, tTheta: -0.6, tPhi: 1.05, tR: 7.2 };
const CAMS = { iso: [-0.6, 1.05, 7.2], top: [0, 0.05, 7.0], side: [0, 1.5708, 7.0] };
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
    d.textContent = T('这个浏览器没有提供 WebGL，三维视图无法显示。下方的平台曲线、单配锁和右侧读数仍然可用。', 'This browser does not provide WebGL, so the 3D view cannot be shown. The plateau, the monogamy lock and the readouts still work.');
    stage.appendChild(d); return;
  }
  glOK = true;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x02040a, 1);
  scene3 = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  orbMesh = new THREE.Mesh(new THREE.SphereGeometry(R_ORB, 32, 16), new THREE.MeshBasicMaterial({ color: 0x5a7da8, ...additive, opacity: 0.22 }));
  scene3.add(orbMesh);
  const lines = (n) => { const g = new THREE.BufferGeometry(); dyn(g, 'position', n, 3); dyn(g, 'color', n, 3); const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, ...additive })); m.frustumCulled = false; scene3.add(m); return m; };
  orbLines = lines(600);
  linkLines = lines(N_MAX * 2);
  const pts = (n, fs) => {
    const g = new THREE.BufferGeometry(); dyn(g, 'position', n, 3); dyn(g, 'aColor', n, 3); dyn(g, 'aAlpha', n, 1); dyn(g, 'aSize', n, 1);
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: EVT_VS, fragmentShader: fs, uniforms: { uScale: { value: 60 } }, ...additive }));
    m.frustumCulled = false; scene3.add(m); return m;
  };
  recPts = pts(N_MAX + 2, EVT_FS);
  obsPts = pts(K_MAX, RING_FS);
  selPts = pts(1, RING_FS);
}
const obsPos = (j) => { const a = 2 * Math.PI * (j + 0.5) / S.K; return [R_OBS * Math.cos(a), 0, R_OBS * Math.sin(a)]; };
const REC_POS = new Float32Array((N_MAX + 1) * 3);
function recDir(k) {
  const a = 2 * Math.PI * (groupOf(k) + 0.5) / S.K + JIT[k] * (2 * Math.PI / S.K) * 0.62;
  const el = JIT2[k] * 1.1;
  return [Math.cos(el) * Math.cos(a), Math.sin(el), Math.cos(el) * Math.sin(a)];
}
function updateGL(time) {
  const t = tNow(), n = nNow(), p = pointerP(), c = S.c, strength = Math.sqrt(Math.max(0, 1 - c * c));
  // the system orb, its pointer axis and its reduced Bloch vector
  { const P = orbLines.geometry.attributes.position.array, C = orbLines.geometry.attributes.color.array; let v = 0;
    const seg = (a, b, ca, cb) => { if (v + 2 > P.length / 3) return; P.set(a, 3 * v); C.set(ca, 3 * v); v++; P.set(b, 3 * v); C.set(cb, 3 * v); v++; };
    const sc = (col, k) => col.map((x) => x * k);
    const toScene = (v, k) => [v[0] * k, v[2] * k, v[1] * k];   // Bloch (x, y, z) drawn with z up
    const ax = axisVec(), R = R_ORB * 1.9;
    seg([0, 0, 0], toScene(ax, R), sc(COL.cyan, 0.9), sc(COL.cyan, 0.9));
    seg([0, 0, 0], toScene(ax, -R), sc(COL.magenta, 0.9), sc(COL.magenta, 0.9));
    for (let i = 0; i < 48; i++) {                        // the Bloch great circle through X and Z, and the equator
      const a0 = 2 * Math.PI * i / 48, a1 = 2 * Math.PI * (i + 1) / 48;
      seg(toScene([Math.sin(a0), 0, Math.cos(a0)], R_ORB), toScene([Math.sin(a1), 0, Math.cos(a1)], R_ORB), sc(COL.sigma, 0.25), sc(COL.sigma, 0.25));
      seg(toScene([Math.cos(a0), Math.sin(a0), 0], R_ORB), toScene([Math.cos(a1), Math.sin(a1), 0], R_ORB), sc(COL.sigma, 0.12), sc(COL.sigma, 0.12));
    }
    const tip = toScene(reducedBloch(n), R_ORB);
    seg([0, 0, 0], tip, sc(COL.amber, 1), sc(COL.amber, 1));
    for (let i = 0; i < 64; i++) {                        // the ledger shell
      const a0 = 2 * Math.PI * i / 64, a1 = 2 * Math.PI * (i + 1) / 64;
      seg([R_SHELL * Math.cos(a0), 0, R_SHELL * Math.sin(a0)], [R_SHELL * Math.cos(a1), 0, R_SHELL * Math.sin(a1)], sc(COL.sigma, 0.14), sc(COL.sigma, 0.14));
    }
    orbLines.geometry.setDrawRange(0, v);
    orbLines.geometry.attributes.position.needsUpdate = true; orbLines.geometry.attributes.color.needsUpdate = true; }
  // records flying out, links to their observers
  const R = recPts.geometry.attributes, Lp = linkLines.geometry.attributes.position.array, Lc = linkLines.geometry.attributes.color.array;
  let nl = 0, np = 0;
  for (let k = 1; k <= S.N; k++) {
    const age = t - k;
    if (age < 0) continue;
    const r = Math.min(R_SHELL - 0.08, R0 + V_OUT * age), d = recDir(k);
    const pos = [d[0] * r, d[1] * r * 0.7, d[2] * r];
    REC_POS.set(pos, 3 * k);
    const col = valRGB(RUN.rec[k]);
    const fresh = Math.max(0, 1 - age / 1.2);
    R.position.array.set(pos, 3 * np); R.aColor.array.set(col.map((x) => x * (0.5 + 0.5 * strength)), 3 * np);
    R.aAlpha.array[np] = (0.35 + 0.65 * strength) * (0.8 + 0.2 * Math.sin(time * 3 + k)) + fresh; R.aSize.array[np] = 1.5 + fresh * 1.2;
    np++;
    const g = groupOf(k);
    if (g < S.K && rankOf(k) < S.m) {
      const o = obsPos(g), sel = S.sel === g;
      Lp.set(o, 3 * nl); Lp.set(pos, 3 * nl + 3);
      const lc = (sel ? COL.amber : COL.sigma).map((x) => x * (sel ? 0.55 : 0.2));
      Lc.set(lc, 3 * nl); Lc.set(lc, 3 * nl + 3); nl += 2;
    }
  }
  recPts.geometry.setDrawRange(0, np);
  linkLines.geometry.setDrawRange(0, nl);
  for (const a of [R.position, R.aColor, R.aAlpha, R.aSize]) a.needsUpdate = true;
  linkLines.geometry.attributes.position.needsUpdate = true; linkLines.geometry.attributes.color.needsUpdate = true;
  // observers
  const O = obsPts.geometry.attributes;
  for (let j = 0; j < K_MAX; j++) {
    if (j >= S.K) { O.aAlpha.array[j] = 0; continue; }
    const o = observerNow(j);
    O.position.array.set(obsPos(j), 3 * j);
    O.aColor.array.set(o.ready ? valRGB(o.value) : COL.gray, 3 * j);
    O.aAlpha.array[j] = o.ready ? 1 : 0.5; O.aSize.array[j] = 2.2;
  }
  for (const a of [O.position, O.aColor, O.aAlpha, O.aSize]) a.needsUpdate = true;
  const SP = selPts.geometry.attributes;
  if (S.sel >= 0 && S.sel < S.K) { SP.position.array.set(obsPos(S.sel), 0); SP.aColor.array.set(COL.amber, 0); SP.aAlpha.array[0] = 1; SP.aSize.array[0] = 3.4; }
  else SP.aAlpha.array[0] = 0;
  for (const a of [SP.position, SP.aColor, SP.aAlpha, SP.aSize]) a.needsUpdate = true;
  const scale = 58 * renderer.getPixelRatio();
  for (const m of [recPts, obsPts, selPts]) m.material.uniforms.uScale.value = scale;
  orbMesh.material.opacity = 0.14 + 0.18 * (1 - S.c ** n);
}
function coherenceLeft(n) { const p = pointerP(); return Math.sqrt(p * (1 - p)) * S.c ** n; }
function reducedBloch(n) {                                  // pointer component kept, perpendicular part × c^n
  const b = blochVec(), a = axisVec(), along = dot(b, a), f = S.c ** n;
  return [0, 1, 2].map((i) => along * a[i] + f * (b[i] - along * a[i]));
}

/* =====================================================================
   7. Camera and picking
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi);
  camera.position.set(cam.r * sp * Math.sin(cam.theta), cam.r * Math.cos(cam.phi), cam.r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
}
const drag = { x: 0, y: 0, moved: 0, pts: new Map(), pinch: 0 };
function setCamPreset(name) {
  const p = CAMS[name]; if (!p) return;
  let d = (p[0] - cam.theta) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  cam.tTheta = cam.theta + d; cam.tPhi = p[1]; cam.tR = p[2];
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === name)));
}
function projectToStage(v) { const rect = stage.getBoundingClientRect(), p = v.clone().project(camera); return { x: (p.x * 0.5 + 0.5) * rect.width, y: (-p.y * 0.5 + 0.5) * rect.height, z: p.z }; }
function pickAt(px, py) {
  if (!glOK) return;
  let best = -1, bd = 22 * 22;
  for (let j = 0; j < S.K; j++) { const o = obsPos(j), p = projectToStage(new THREE.Vector3(o[0], o[1], o[2])), d = (p.x - px) ** 2 + (p.y - py) ** 2; if (d < bd) { bd = d; best = j; } }
  selectObserver(best);
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
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(16, Math.max(3.0, cam.tR * drag.pinch / d)); drag.pinch = d; drag.moved += 10; return; }
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
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(16, Math.max(3.0, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   8. Tags
   ===================================================================== */
function mkTag(cls, text) { const el = document.createElement('div'); el.className = 'tag ' + cls; el.textContent = text; tagsBox.appendChild(el); return el; }
const tagSys = mkTag('', ''), tagAxis = mkTag('cy', ''), tagShell = mkTag('', '');
const obsTags = []; for (let j = 0; j < K_MAX; j++) obsTags.push(mkTag('', `O${j + 1}`));
function labelStaticTags() { tagSys.textContent = T('系统 S', 'SYSTEM S'); tagAxis.textContent = T('指针轴', 'POINTER AXIS'); tagShell.textContent = T('环境 · 账本', 'ENVIRONMENT · LEDGER'); }
labelStaticTags();
function placeTag(el, p, show = true) {
  if (!glOK || !show) { el.style.display = 'none'; return; }
  const q2 = projectToStage(new THREE.Vector3(p[0], p[1], p[2]));
  if (q2.z > 1 || q2.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.style.left = q2.x + 'px'; el.style.top = q2.y + 'px';
}
function updateTags() {
  placeTag(tagSys, [0, -R_ORB - 0.28, 0]);
  const ax = axisVec(); placeTag(tagAxis, [ax[0] * R_ORB * 2.3, ax[2] * R_ORB * 2.3 + 0.08, 0]);
  placeTag(tagShell, [0, 0.12, -R_SHELL - 0.12]);
  for (let j = 0; j < K_MAX; j++) { const o = j < S.K ? obsPos(j) : [0, 0, 0]; placeTag(obsTags[j], [o[0] * 1.1, 0.28, o[2] * 1.1], j < S.K); }
}

/* =====================================================================
   9. 2D panels
   ===================================================================== */
function axes(ctx, dpr, pl, pt, iw, ih, yTicks, yFmt, X, Y) {
  ctx.strokeStyle = FAINT; ctx.lineWidth = 1; ctx.globalAlpha = 0.6; ctx.beginPath();
  for (const y of yTicks) { ctx.moveTo(pl, Y(y)); ctx.lineTo(pl + iw, Y(y)); }
  for (const f of [0, 0.25, 0.5, 0.75, 1]) { ctx.moveTo(X(f), pt); ctx.lineTo(X(f), pt + ih); }
  ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const y of yTicks) ctx.fillText(yFmt(y), pl - 5 * dpr, Y(y));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const f of [0, 0.5, 1]) ctx.fillText(f.toFixed(1), X(f), pt + ih + 3 * dpr);
}
function drawPlateau() {
  const dpr = fitCanvas(cvPlateau), ctx = cvPlateau.getContext('2d'), W = cvPlateau.width, Hh = cvPlateau.height;
  ctx.clearRect(0, 0, W, Hh);
  const pl = 38 * dpr, pr = 12 * dpr, pt = 12 * dpr, pb = 18 * dpr, iw = W - pl - pr, ih = Hh - pt - pb;
  if (iw < 40 || ih < 30) return;
  const n = nNow(), p = pointerP(), c = S.c, h = H(p), top = Math.max(2 * h, 0.2) * 1.08;
  const X = (f) => pl + f * iw, Y = (b) => pt + ih - b / top * ih;
  axes(ctx, dpr, pl, pt, iw, ih, h > 0 ? [0, h, 2 * h] : [0], (y) => y.toFixed(2), X, Y);
  if (h > 0) {
    ctx.strokeStyle = SG; ctx.globalAlpha = 0.5; ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath(); ctx.moveTo(pl, Y((1 - DELTA) * h)); ctx.lineTo(pl + iw, Y((1 - DELTA) * h)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(T('H(p)：经典信息', 'H(p): classical information'), pl + 4 * dpr, Y(h) - 2 * dpr);
    ctx.fillText(T('2H：整个环境（含量子关联）', '2H: whole environment (incl. quantum correlation)'), pl + 4 * dpr, Y(2 * h) + 12 * dpr);
  }
  if (n >= 1) {
    ctx.strokeStyle = CY; ctx.lineWidth = 2 * dpr; ctx.shadowColor = CY; ctx.shadowBlur = 6 * dpr; ctx.beginPath();
    for (let m = 0; m <= n; m++) { const x = X(m / n), y = Y(mutualInfo(p, c, n, m)); if (m) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = CY; for (let m = 0; m <= n; m++) { ctx.beginPath(); ctx.arc(X(m / n), Y(mutualInfo(p, c, n, m)), (n > 24 ? 1.6 : 2.4) * dpr, 0, Math.PI * 2); ctx.fill(); }
    const mf = Math.min(S.m, n);
    ctx.strokeStyle = AM; ctx.lineWidth = 1.2 * dpr; ctx.beginPath(); ctx.moveTo(X(mf / n), pt); ctx.lineTo(X(mf / n), pt + ih); ctx.stroke();
    ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(mf / n), Y(mutualInfo(p, c, n, mf)), 4 * dpr, 0, Math.PI * 2); ctx.fill();
  } else { ctx.fillStyle = DIM; ctx.font = `${11 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(T('还没有任何记录', 'no record yet'), pl + iw / 2, pt + ih / 2); }
  const red = redundancy(p, c, n);
  $('plateauMeta').innerHTML = T(`横轴：碎片占已写入记录的比例 f = m/n · n = ${n}`, `x: fragment fraction f = m/n of the records written · n = ${n}`) + (red.R === null ? '' : red.m ? ` · R<sub>δ</sub> = ${red.R.toFixed(1)}` : ' · R<sub>δ</sub> &lt; 1');
}
function drawLock() {
  const dpr = fitCanvas(cvLock), ctx = cvLock.getContext('2d'), W = cvLock.width, Hh = cvLock.height;
  ctx.clearRect(0, 0, W, Hh);
  const pl = 38 * dpr, pr = 10 * dpr, pt = 12 * dpr, pb = 18 * dpr, iw = W - pl - pr, ih = Hh - pt - pb;
  if (iw < 40 || ih < 30) return;
  const n = nNow(), p = pointerP(), c = S.c;
  const X = (f) => pl + f * iw, Y = (v) => pt + ih - (v - 0.5) / 0.5 * ih;
  axes(ctx, dpr, pl, pt, iw, ih, [0.5, 0.75, 1], (y) => y.toFixed(2), X, Y);
  if (n >= 1) {
    const curve = (fn, col) => { ctx.strokeStyle = col; ctx.lineWidth = 2 * dpr; ctx.beginPath(); for (let m = 0; m <= n; m++) { const y = Y(fn(m)); if (m) ctx.lineTo(X(m / n), y); else ctx.moveTo(X(0), y); } ctx.stroke(); };
    curve((m) => pZ(p, c, m), CY); curve((m) => pX(p, c, n, m), MG);
    const mf = Math.min(S.m, n);
    ctx.strokeStyle = AM; ctx.lineWidth = 1.2 * dpr; ctx.beginPath(); ctx.moveTo(X(mf / n), pt); ctx.lineTo(X(mf / n), pt + ih); ctx.stroke();
  }
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const lx = pl + iw * 0.3, ly = pt + ih * 0.42;
  ctx.fillStyle = 'rgba(2, 6, 12, 0.72)'; ctx.fillRect(lx - 4 * dpr, ly - 3 * dpr, Math.min(iw * 0.66, 180 * dpr), 30 * dpr);
  ctx.fillStyle = CY; ctx.fillText(T('猜中指针值', 'guess the pointer value'), lx, ly);
  ctx.fillStyle = MG; ctx.fillText(T('猜中相位（互补量）', 'guess the phase (complementary)'), lx, ly + 13 * dpr);
  const mf = Math.max(1, Math.min(S.m, n));
  $('lockMeta').textContent = n >= 1 ? T(`m = ${mf}：指针 ${pZ(p, c, mf).toFixed(3)} · 相位 ${pX(p, c, n, mf).toFixed(3)}`, `m = ${mf}: pointer ${pZ(p, c, mf).toFixed(3)} · phase ${pX(p, c, n, mf).toFixed(3)}`) : '';
}
function drawBloch() {
  const dpr = fitCanvas(cvBloch), ctx = cvBloch.getContext('2d'), W = cvBloch.width, Hh = cvBloch.height;
  ctx.clearRect(0, 0, W, Hh);
  const r = Math.min(W, Hh) * 0.38, cx = W / 2, cy = Hh / 2;
  const P = (x, z) => [cx + x * r, cy - z * r];
  ctx.strokeStyle = FAINT; ctx.lineWidth = 1 * dpr; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
  const ax = axisVec();
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = CY; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...P(ax[0] * 1.15, ax[2] * 1.15)); ctx.stroke();
  ctx.strokeStyle = MG; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...P(-ax[0] * 1.15, -ax[2] * 1.15)); ctx.stroke();
  const b = blochVec(), bn = reducedBloch(nNow());
  ctx.strokeStyle = DIM; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.lineWidth = 1.2 * dpr; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...P(b[0], b[2])); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = DIM; ctx.beginPath(); ctx.arc(...P(b[0], b[2]), 3 * dpr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = AM; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...P(bn[0], bn[2])); ctx.stroke();
  ctx.fillStyle = AM; ctx.shadowColor = AM; ctx.shadowBlur = 10 * dpr; ctx.beginPath(); ctx.arc(...P(bn[0], bn[2]), 4.5 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('Z', cx, cy - r - 3 * dpr); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText('X', cx + r + 4 * dpr, cy);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`;
  ctx.fillText(T('虚线：初态 · 实线：此刻的约化态', 'dashed: initial state · solid: reduced state now'), 6 * dpr, 4 * dpr);
}

/* =====================================================================
   10. Readouts and controls
   ===================================================================== */
let syncedN = NaN;
function syncOutputs() {
  const n = nNow(); syncedN = n;
  const p = pointerP(), c = S.c, h = H(p), red = redundancy(p, c, n), rs = rSys(p, c, n);
  $('oTheta').textContent = deg(S.theta); $('oPhase').textContent = deg(S.phase); $('oEta').textContent = deg(S.eta);
  $('oOverlap').textContent = S.c.toFixed(2); $('oEnv').textContent = String(S.N); $('oObsK').textContent = String(S.K); $('oFrag').textContent = String(S.m);
  document.querySelectorAll('#ruleChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.rule === S.eta)));
  document.querySelectorAll('#askChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.ask === S.ask)));
  $('stateNote').innerHTML = T(`沿指针轴的概率 p = ${p.toFixed(3)}，经典信息 H(p) = ${h.toFixed(3)} 比特。初始相干 √(p(1−p)) = ${Math.sqrt(p * (1 - p)).toFixed(3)}。`,
    `Probability along the pointer axis p = ${p.toFixed(3)}, classical information H(p) = ${h.toFixed(3)} bits. Initial coherence √(p(1−p)) = ${Math.sqrt(p * (1 - p)).toFixed(3)}.`);
  $('ruleNote').innerHTML = T(`环境复制的是系统在 η = ${S.eta}° 方向上的值。布洛赫矢量向这条轴塌缩，垂直分量按 c<sup>n</sup> 衰减；换一种记录规则，成为公共事实的就是另一个量。`,
    `The environment copies the system’s value along η = ${S.eta}°. The Bloch vector collapses onto this axis and its perpendicular part decays as c<sup>n</sup>; with a different record rule, a different quantity becomes the public fact.`);
  const maxM = Math.max(1, Math.floor(S.N / S.K));
  $('frag').max = String(Math.min(M_MAX, maxM));
  $('obsNote').innerHTML = S.ask === 0
    ? T(`每人读自己碎片里的 ${S.m} 份记录，读对指针值的概率 ½(1 + √(1 − c<sup>2m</sup>)) = ${pObs(c, S.m).toFixed(3)}。`, `Each observer reads ${S.m} records in their fragment and gets the pointer value right with probability ½(1 + √(1 − c<sup>2m</sup>)) = ${pObs(c, S.m).toFixed(3)}.`)
    : T(`问的是相位：碎片与相位的关联至多 2√(p(1−p))·c<sup>n−m</sup>，只有几乎整个环境才知道答案，每人基本是在猜。`, `The question is the phase: a fragment’s correlation with the phase is at most 2√(p(1−p))·c<sup>n−m</sup>, so only almost the whole environment knows it and each observer is essentially guessing.`);
  $('roP').textContent = p.toFixed(3); $('roH').textContent = h.toFixed(3);
  const coh = coherenceLeft(n), cohTxt = coh >= 1e-3 || coh === 0 ? coh.toFixed(3) : coh.toExponential(1);
  $('roCoh').textContent = cohTxt;
  $('roSS').textContent = h2(rs).toFixed(3);
  $('roR').innerHTML = red.R === null ? T('— 无信息可记', '— nothing to record') : red.m ? `${red.R.toFixed(1)} <small>(m<sub>δ</sub> = ${red.m})</small>` : '&lt; 1';
  const cs = consensus(), pAll = allAgreeProbability();
  $('roAgree').innerHTML = (cs ? `${cs.agree} / ${cs.of}` : T('尚未读完', 'not read yet')) + ` <small>P<sub>all</sub> ${pAll.toFixed(2)}</small>`;
  $('pillRecords').innerHTML = `RECORDS <strong>${n}</strong>`;
  $('pillRed').innerHTML = `R<sub>δ</sub> <strong>${red.R === null ? '—' : red.m ? red.R.toFixed(1) : '<1'}</strong>`;
  $('pillAgree').innerHTML = `CONSENSUS <strong>${cs ? `${cs.agree}/${cs.of}` : '—'}</strong>`;
  $('factTag').textContent = S.ask === 0 ? T(`本次运行：指针 = ${RUN.fact}`, `this run: pointer = ${RUN.fact}`) : T(`本次运行：相位 = ${RUN.factX > 0 ? '+' : '−'}`, `this run: phase = ${RUN.factX > 0 ? '+' : '−'}`);
  const rows = [];
  for (let j = 0; j < S.K; j++) {
    const o = observerNow(j), col = o.ready ? valCol(o.value) : DIM;
    const val = o.ready ? valName(o.value) : (o.m ? T(`读到 ${o.m}/${o.full}`, `${o.m}/${o.full} read`) : T('等待', 'waiting'));
    rows.push(`<div class="o${S.sel === j ? ' sel' : ''}" data-obs="${j}" style="--bc:${col}"><span class="id">O${j + 1}</span><div class="bar" title="P"><i style="width:${(o.P * 100).toFixed(1)}%"></i></div><b>${val}</b></div>`);
  }
  $('obsList').innerHTML = rows.join('') || `<div class="none">—</div>`;
  $('obsList').querySelectorAll('.o').forEach((el) => el.addEventListener('click', () => selectObserver(+el.dataset.obs === S.sel ? -1 : +el.dataset.obs)));
  const redTxt = red.R === null ? T('没有可记的信息', 'nothing to record') : red.m ? T(`R<sub>δ</sub> = ${red.R.toFixed(1)} 片互不重叠的碎片各自带着九成经典信息`, `R<sub>δ</sub> = ${red.R.toFixed(1)} disjoint fragments each carry 90% of the classical information`) : T('还没有碎片能带走九成经典信息', 'no fragment carries 90% of the classical information yet');
  $('layers').innerHTML = [
    T('<b>中心层</b>：强制、无选择的公共经典核（本页不演示）。', '<b>Central layer</b>: a forced public classical core with no choice (not shown here).'),
    T(`<b>指针基层</b>：记录规则选定指针轴 η = ${S.eta}°；剩余相干 ${cohTxt}。`, `<b>Pointer layer</b>: the record rule selects the pointer axis η = ${S.eta}°; coherence left ${cohTxt}.`),
    T(`<b>冗余层</b>：${redTxt}。`, `<b>Redundancy layer</b>: ${redTxt}.`)
  ].map((x) => `<li>${x}</li>`).join('');
  $('presetNote').textContent = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义参数。', 'Custom settings.');
  $('marks').innerHTML = [0, 0.5, 1].map((f, i) => `<i class="${i === 0 ? 'first' : i === 2 ? 'last' : ''}" style="left:${(f * S.N / tMax() * 100).toFixed(2)}%">${Math.round(f * S.N)}</i>`).join('');
}
function selectObserver(j) { S.sel = j >= 0 && j < S.K ? j : -1; syncOutputs(); }

let dirtyRun = true;
function clearPreset() { S.preset = null; document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', 'false')); }
function bindRange(id, fn) { const el = $(id); el.addEventListener('input', () => { fn(parseFloat(el.value)); syncOutputs(); }); }
bindRange('theta', (v) => { S.theta = v; dirtyRun = true; clearPreset(); });
bindRange('phase', (v) => { S.phase = v; dirtyRun = true; clearPreset(); });
bindRange('eta', (v) => { S.eta = v; dirtyRun = true; clearPreset(); });
bindRange('overlap', (v) => { S.c = v; dirtyRun = true; clearPreset(); });
bindRange('envn', (v) => { S.N = Math.round(v); S.m = Math.min(S.m, Math.max(1, Math.floor(S.N / S.K))); $('frag').value = S.m; dirtyRun = true; clearPreset(); });
bindRange('obsk', (v) => { S.K = Math.round(v); S.m = Math.min(S.m, Math.max(1, Math.floor(S.N / S.K))); $('frag').value = S.m; if (S.sel >= S.K) S.sel = -1; dirtyRun = true; clearPreset(); });
bindRange('frag', (v) => { S.m = Math.max(1, Math.min(Math.round(v), Math.floor(S.N / S.K) || 1)); dirtyRun = true; clearPreset(); });
document.querySelectorAll('#ruleChips .chip').forEach((b) => b.addEventListener('click', () => { S.eta = +b.dataset.rule; $('eta').value = S.eta; dirtyRun = true; clearPreset(); syncOutputs(); }));
function setAsk(a) { S.ask = a; syncOutputs(); }
document.querySelectorAll('#askChips .chip').forEach((b) => b.addEventListener('click', () => { setAsk(+b.dataset.ask); clearPreset(); }));
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));

const toast = (html) => TRV.toast($('toast'), html);
const glitch = () => TRV.glitch($('app'));
TRV.startGlitch($('app'));

function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  Object.assign(S, { theta: p.theta, phase: p.phase, eta: p.eta, c: p.c, N: p.N, K: p.K, m: p.m, ask: p.ask, sel: -1 });
  $('theta').value = S.theta; $('phase').value = S.phase; $('eta').value = S.eta; $('overlap').value = S.c; $('envn').value = S.N; $('obsk').value = S.K; $('frag').max = String(Math.min(M_MAX, Math.max(1, Math.floor(S.N / S.K)))); $('frag').value = S.m;
  S.preset = name;
  document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === name)));
  dirtyRun = true; plateauToasted = false;
  if (!reduceMotion) { S.nowFrac = 0; S.dir = 1; S.playing = true; setPlayUI(); }
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
  if (ev.key === 'Escape') { selectObserver(-1); return; }
  if (ev.key === ' ' && !(ev.target && ev.target.tagName === 'BUTTON')) { ev.preventDefault(); S.playing = !S.playing; S.hold = 0; setPlayUI(); }
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) {
    ev.preventDefault(); S.playing = false; setPlayUI();
    const n = nNow() + (ev.key === 'ArrowRight' ? 1 : -1);
    S.nowFrac = Math.min(1, Math.max(0, (Math.max(0, n) + 0.5) / tMax())); $('now').value = S.nowFrac;
  }
  else if (ev.key === 'q' || ev.key === 'Q') setAsk(1 - S.ask);
});

/* =====================================================================
   11. Main loop
   ===================================================================== */
let lastT = performance.now(), tAcc = 0, panelTick = 0, frameCount = 0, plateauToasted = false, prevN = -1;
function resize() {
  if (!glOK) return;
  const r = stage.getBoundingClientRect();
  renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
  camera.aspect = Math.max(0.2, r.width / Math.max(1, r.height)); camera.updateProjectionMatrix();
}
function frame(tms) {
  frameCount++;
  const dtSec = Math.min(0.1, (tms - lastT) / 1000); lastT = tms; tAcc += dtSec;
  if (dirtyRun) { resampleRun(); dirtyRun = false; $('pillHash').innerHTML = `RUN <strong>${RUN.hash}</strong>`; syncOutputs(); }
  if (S.playing && !scrubbing) {
    if (S.hold > 0) { S.hold -= dtSec; if (S.hold <= 0) S.nowFrac = S.dir > 0 ? 0 : 1; }
    else {
      S.nowFrac += S.dir * dtSec * S.speed / 16;
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 1.6; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.6; }
    }
    $('now').value = S.nowFrac;
  }
  const n = nNow();
  if (n !== syncedN) syncOutputs();
  // announce the plateau only at the record where it first forms, not while it is already standing
  if (n > prevN && prevN >= 0 && !plateauToasted && S.ask === 0) {
    const p = pointerP(), red = redundancy(p, S.c, n), before = redundancy(p, S.c, prevN);
    if (red.m && red.R >= 2 && !(before.m && before.R >= 2)) { plateauToasted = true; toast(T(`<b>平台形成</b>：${n} 份记录里已有 ${Math.floor(red.R)} 片互不重叠的碎片各自带着九成经典信息——这个值成了公共事实。`, `<b>Plateau formed</b>: among ${n} records, ${Math.floor(red.R)} disjoint fragments each already carry 90% of the classical information; the value has become a public fact.`)); }
  }
  prevN = n;
  $('tau').innerHTML = `n ${n} <small>/ ${S.N}</small>`;
  const cs = consensus();
  $('hudBig').textContent = `n = ${n} · ${S.ask === 0 ? T('问指针值', 'asking the pointer value') : T('问相位', 'asking the phase')}`;
  $('hudSub').textContent = `η = ${S.eta}° · c = ${S.c.toFixed(2)} · ${cs ? T(`${cs.agree}/${cs.of} 位观察者一致`, `${cs.agree}/${cs.of} observers agree`) : T('观察者还没读完', 'observers have not finished reading')}`;
  if (glOK) { updateCamera(dtSec); updateGL(tAcc); renderer.render(scene3, camera); updateTags(); }
  panelTick++;
  drawPlateau(); drawLock(); if (panelTick % 2 === 0) drawBloch();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { labelStaticTags(); syncOutputs(); });

/* read-only probe for automated browser tests */
window.DARWIN_DEBUG = {
  pending: () => dirtyRun || nNow() !== syncedN,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  run: () => ({ fact: RUN.fact, factX: RUN.factX, rec: Array.from(RUN.rec).slice(1, S.N + 1), obs: RUN.obs.slice(), obsX: RUN.obsX.slice(), hash: RUN.hash }),
  info: () => {
    const n = nNow(), p = pointerP(), c = S.c;
    return { n, p, H: H(p), SS: h2(rSys(p, c, n)), coherence: coherenceLeft(n), bloch: reducedBloch(n), red: redundancy(p, c, n),
      I: Array.from({ length: n + 1 }, (_, m) => mutualInfo(p, c, n, m)),
      PZ: Array.from({ length: n + 1 }, (_, m) => pZ(p, c, m)), PX: Array.from({ length: n + 1 }, (_, m) => pX(p, c, n, m)) };
  },
  observers: () => Array.from({ length: S.K }, (_, j) => observerNow(j)),
  consensus: () => consensus(),
  allAgree: () => allAgreeProbability(),
  project: (j) => { if (!glOK) return null; const o = obsPos(j); const p2 = projectToStage(new THREE.Vector3(o[0], o[1], o[2])); return { x: p2.x, y: p2.y }; },
  setNowRecords: (n) => { S.nowFrac = Math.min(1, (n + 0.5) / tMax()); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('partial'); S.playing = false; setPlayUI(); plateauToasted = true; S.nowFrac = 0.8; $('now').value = S.nowFrac; syncOutputs(); cam.tTheta = 0.13; cam.tPhi = 0.85; cam.tR = 7.6; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('ideal');
S.nowFrac = 0.35; S.playing = !reduceMotion; $('now').value = S.nowFrac;
setPlayUI(); syncOutputs();
requestAnimationFrame(frame);
})();
