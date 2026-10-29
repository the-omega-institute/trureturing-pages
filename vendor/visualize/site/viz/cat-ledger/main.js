/* CAT//LEDGER · 薛定谔的猫 · 账本时空块
   400 boxes, each holding an atom that a Geiger counter checks every Δt (the first-detection protocol).
   The first click releases the poison, so a cat's death time is a record label; the whole archive is drawn as one
   static block of worldlines. Two ledgers read the same archive: the inside one (counter and cat) writes each death
   when it happens, the outside one reads every box at the opening time. Record copies set the overlap κ = c^M between
   the two branches, and an outside observer may try to reverse every copy (Wigner's undo).
   Theory: trureturing docs/develop/theory/RECURSIVE_RELATIONAL_OBSERVATION_WAVE_PARTICLE_EVENTS.md (§5, §8, §11–§13),
   OBSERVER-QUANTUM.md (§8, §18.2). Frozen Lean anchors are named in the page text.
   Model: two schematic decay couplings, ideal detection for the death-time law, f^M for the undo (see the drawer).
   Depends on: assets/vendor/three.r128.min.js (window.THREE), assets/shell.js (window.TRV). */
(() => {
'use strict';

/* =====================================================================
   1. Model constants
   ===================================================================== */
const T_BOX = 60;                                            // minutes the boxes can stay closed
const HALF_LIFE = 20;                                        // minutes
const GAMMA = Math.LN2 / HALF_LIFE;                          // Markov decay rate per minute
const OMEGA = Math.asin(Math.sqrt(1 - Math.exp(-GAMMA)));    // coherent coupling; both models agree at Δt = 1 min
const N_RUNS = 400, GRID = 20, CELL = 0.1;
const H = 3.0;                                               // scene height of the time axis
const BOX_HALF = 1.05;
const M_STOPS = [1, 2, 3, 5, 8, 13, 21, 50, 100, 1e3, 1e4, 1e6, 1e9, 1e12, 1e18, 1e23];
const HIST_BINS = 30;
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { mulberry32, smooth, fitCanvas, L } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, sigma: SG, ok: OK, warn: WARN, cyan: CY, magenta: MG } = TRV.palette;

/* =====================================================================
   2. State and presets
   ===================================================================== */
const S = {
  coupling: 0, dtV: 0.5, dark: 0, open: 60, ledger: 1,
  mIdx: 15, overlap: 0.5, fidV: 1 / 3,
  undo: false, undoAt: 0,
  mode: 0, clock: 0, clockFrom: 0, clockMix: 1,
  focus: 0, split: 0, sel: -1,
  nowFrac: 0.5, playing: true, dir: 1, speed: 1, hold: 0,
  preset: 'classic'
};
const PRESETS = {
  classic: { coupling: 0, dt: 1, dark: 0, open: 60, m: 15, c: 0.5, f: 0.999, ledger: 0,
    zh: '半衰期 20 分钟的原子，每分钟检查一次，60 分钟后开箱。盒内账本随时写下死亡，盒外账本要到开箱才读到。页面取 10²³ 份记录副本，两支之间没有可测的相干。',
    en: 'An atom with a 20-minute half-life, checked every minute; the boxes are opened after 60 minutes. The inside ledger writes each death as it happens, the outside ledger reads it only at opening. With 10²³ record copies, no coherence between the branches can be measured.' },
  early: { coupling: 0, dt: 1, dark: 0, open: 15, m: 15, c: 0.5, f: 0.999, ledger: 1,
    zh: '同一批猫，15 分钟就开箱。死亡时刻档案和指纹与 60 分钟开箱完全一样：开箱只读账，不改账。',
    en: 'The same cats, opened after only 15 minutes. The death-time archive and its fingerprint are exactly as with opening at 60 minutes: opening reads the ledger and never rewrites it.' },
  zeno: { coupling: 1, dt: 0.1, dark: 0, open: 60, m: 15, c: 0.5, f: 0.999,
    zh: '相干耦合，每 0.1 分钟检查一次。检查越频繁，每次捕到衰变的概率越小，60 分钟后仍有约八成的猫活着（量子芝诺效应）。',
    en: 'Coherent coupling, checked every 0.1 minutes. The more often it is checked, the smaller the chance of catching a decay each time; about four in five cats are still alive after 60 minutes (the quantum Zeno effect).' },
  sparse: { coupling: 1, dt: 5, dark: 0, open: 60, m: 15, c: 0.5, f: 0.999,
    zh: '相干耦合，每 5 分钟才检查一次。两次检查之间振幅积累得多，每次检查有六成以上的概率捕到衰变，猫反而死得更快。',
    en: 'Coherent coupling, checked only every 5 minutes. More amplitude builds up between checks, each check catches a decay with probability above 60%, and the cats die faster.' },
  dark: { coupling: 0, dt: 1, dark: 0.35, open: 60, m: 15, c: 0.5, f: 0.999,
    zh: '35% 的原子处在任何检查都探测不到的暗态。存活曲线不再趋于 0，而是趋于 w = 0.35；一只猫活得越久，就越可能是暗态。',
    en: '35% of the atom sits in a dark state that no check can detect. The survival curve no longer tends to 0 but to w = 0.35; the longer a cat lives, the more likely it is dark.' },
  qubit: { coupling: 1, dt: 1, dark: 0, open: 60, m: 0, c: 0.95, f: 0.999, ledger: 0,
    zh: '只有 1 份记录，它的“活”版与“死”版重叠 0.95。死活在盒内账本里还不是清晰的事实（事实强度 D ≈ 0.31），开箱前盒外可以测到两支之间的条纹。',
    en: 'A single record whose alive and dead versions overlap by 0.95. Alive or dead is not yet a sharp fact in the inside ledger (fact strength D ≈ 0.31), and before opening an outside observer can measure fringes between the branches.' },
  wigner: { coupling: 0, dt: 1, dark: 0, open: 60, m: 2, c: 0.3, f: 0.98, undoAt: 30, ledger: 0,
    zh: '3 份副本，单份重叠 0.3。t = 30 分钟时盒外观察者以保真度 0.98 相干反演全部副本：残余重叠 0.98³ ≈ 0.94，死活从账本里被抹去，条纹重新出现。',
    en: 'Three copies overlapping by 0.3 each. At t = 30 minutes the outside observer coherently reverses every copy with fidelity 0.98: the remaining overlap is 0.98³ ≈ 0.94, the fate is erased from the ledgers, and fringes come back.' },
  macro: { coupling: 0, dt: 1, dark: 0, open: 60, m: 15, c: 0.5, f: 0.999999, undoAt: 30, ledger: 0,
    zh: '同样的撤销用在真实大小的猫上：10²³ 份副本，每份保真度 0.999999，残余重叠只有 10^(−4.3×10¹⁶)。记录还在，事实还在。',
    en: 'The same undo on a cat of real size: 10²³ copies at fidelity 0.999999 each leave an overlap of only 10^(−4.3×10¹⁶). The records remain, and so do the facts.' }
};

/* =====================================================================
   3. First-detection law (theory §11): Q†Q + L†L = I, p(n) = (1−w) a^(n−1) (1−a), s_N = (1−w) a^N + w
   ===================================================================== */
const dtOf = (v) => 0.1 * Math.pow(100, v);
const dtV = (d) => Math.log10(d / 0.1) / 2;
const dt = () => dtOf(S.dtV);
function checkFactor() {                                      // survival factor per check for the coupled part
  const d = dt();
  return S.coupling === 1 ? Math.cos(OMEGA * d) ** 2 : Math.exp(-GAMMA * d);
}
const nMax = () => Math.floor(T_BOX / dt() + 1e-9);
const roundsBy = (t) => Math.max(0, Math.floor(t / dt() + 1e-9));
const survivalRound = (n) => (1 - S.dark) * Math.pow(checkFactor(), n) + S.dark;
const survivalAt = (t) => survivalRound(roundsBy(t));
const pFirst = (n) => { const a = checkFactor(); return (1 - S.dark) * Math.pow(a, n - 1) * (1 - a); };
function unmonitored(t) {                                     // population of the no-decay levels if nothing ever checks
  return S.coupling === 1 ? (1 - S.dark) * Math.cos(OMEGA * t) ** 2 + S.dark : (1 - S.dark) * Math.exp(-GAMMA * t) + S.dark;
}

/* =====================================================================
   4. Fixed seeds and the archive of death rounds
   ===================================================================== */
const seedRng = mulberry32(0xCA7DE1);
const U = new Float64Array(N_RUNS), GX = new Float32Array(N_RUNS), GZ = new Float32Array(N_RUNS);
for (let r = 0; r < N_RUNS; r++) U[r] = seedRng();
for (let r = 0; r < N_RUNS; r++) {
  const i = r % GRID, j = Math.floor(r / GRID);
  GX[r] = -0.95 + CELL * i + (seedRng() - 0.5) * 0.024;
  GZ[r] = -0.95 + CELL * j + (seedRng() - 0.5) * 0.024;
}
const DR = new Int32Array(N_RUNS);        // death round (0 = alive through the box)
const DT = new Float64Array(N_RUNS);      // death time in minutes (−1 = alive)
let deadOrder = [], archiveHash = '--------';
function fnv(values) {
  let h = 0x811c9dc5;
  for (const v of values) { const x = v | 0; for (let b = 0; b < 4; b++) { h ^= (x >>> (8 * b)) & 0xff; h = Math.imul(h, 0x01000193); } }
  return (h >>> 0).toString(16).padStart(8, '0');
}
function resampleArchive() {
  const a = checkFactor(), w = S.dark, N = nMax(), d = dt();
  const F = (k) => (1 - w) * (1 - Math.pow(a, k));
  const Fmax = F(N);
  const vals = [];
  for (let r = 0; r < N_RUNS; r++) {
    const u = U[r];
    if (u >= Fmax) { DR[r] = 0; DT[r] = -1; }
    else {
      let n = a <= 0 ? 1 : Math.ceil(Math.log(1 - u / (1 - w)) / Math.log(a));
      n = Math.max(1, Math.min(N, Number.isFinite(n) ? n : 1));
      while (n < N && F(n) < u) n++;
      while (n > 1 && F(n - 1) >= u) n--;
      DR[r] = n; DT[r] = n * d;
    }
    vals.push(DR[r], Math.round(DT[r] * 1e4));
  }
  deadOrder = [];
  for (let r = 0; r < N_RUNS; r++) if (DR[r] > 0) deadOrder.push(r);
  deadOrder.sort((p, q) => DT[p] - DT[q] || p - q);
  archiveHash = fnv(vals);
}

/* =====================================================================
   5. Record copies, fact strength and Wigner's undo
   ===================================================================== */
const copies = () => M_STOPS[S.mIdx];
const fidOf = (v) => (v >= 1 ? 1 : 1 - Math.pow(10, -1 - 6 * v));
const fidV = (f) => (f >= 1 ? 1 : (-Math.log10(1 - f) - 1) / 6);
const fid = () => fidOf(S.fidV);
const recordLog10 = () => (S.overlap <= 0 ? -Infinity : copies() * Math.log10(S.overlap));   // log10 |κ|, κ = c^M
const undoCopies = () => copies() + (S.undoAt >= S.open ? 1 : 0);                               // after opening, the observer's memory is one more copy
const undoLog10 = () => { const f = fid(); return f >= 1 ? 0 : undoCopies() * Math.log10(f); };    // schematic: residual overlap f^M
const kappaLog10 = () => (S.undo ? undoLog10() : recordLog10());
function outsideLog10(t) {                                    // overlap an outside interference measurement still has at lab time t
  if (S.undo) return undoLog10();
  if (t >= S.open) return -Infinity;                          // opening wrote an ideal copy into the observer's memory
  return recordLog10();
}
const pow10 = (l) => (l < -320 ? 0 : Math.pow(10, l));
const dOfLog = (l) => (l === -Infinity ? 1 : Math.sqrt(Math.max(0, -Math.expm1(2 * l * Math.LN10))));
function factStrength(ledger, t) {                            // D of the records a ledger holds
  if (S.undo) return dOfLog(undoLog10());
  if (ledger === 1 && t >= S.open) return 1;                  // the observer looked at the cat directly
  return dOfLog(recordLog10());
}

/* =====================================================================
   6. Ledgers, conditioning and clocks
   ===================================================================== */
const nowT = () => S.nowFrac * T_BOX;
const viewT = () => (S.undo ? S.undoAt : nowT());
const blockView = () => S.mode === 1 && !S.undo;
function statusOf(r) {                                        // 'alive' | 'dead' | 'unknown' in the current ledger and conditioning
  if (blockView()) return DR[r] > 0 ? 'dead' : 'alive';
  const t = viewT();
  if (S.ledger === 1 && t < S.open) return 'unknown';
  return DR[r] > 0 && DT[r] <= t + 1e-9 ? 'dead' : 'alive';
}
function deathsBy(t) { let k = 0; for (const r of deadOrder) { if (DT[r] <= t + 1e-9) k++; else break; } return k; }
function ledgerEntries(ledger) {                              // [lab time, weight] of every entry the ledger holds
  const out = [], cut = S.undo ? S.undoAt : Infinity, du = S.undo ? factStrength(ledger, S.undoAt) : 1;
  const wOf = (t) => (S.undo && t <= S.undoAt + 1e-9 ? du : 1);
  if (ledger === 0) { for (const r of deadOrder) if (DT[r] <= cut + 1e-9) out.push([DT[r], wOf(DT[r])]); }
  else {
    if (S.open <= cut + 1e-9) out.push([S.open, N_RUNS * wOf(S.open)]);     // opening reads every box at once
    for (const r of deadOrder) if (DT[r] > S.open + 1e-9 && DT[r] <= cut + 1e-9) out.push([DT[r], wOf(DT[r])]);
  }
  out.sort((p, q) => p[0] - q[0]);
  return out;
}
/* the height of the block is the ledger's length without any undo, so erased records visibly shorten the history */
let CLK = { t: [], c: [], tot: 0, full: 0 };
function buildClock() {
  let acc = 0; const t = [], c = [];
  for (const [ti, wi] of ledgerEntries(S.ledger)) { acc += wi; t.push(ti); c.push(acc); }
  let full = acc;
  if (S.undo) { const keep = S.undo; S.undo = false; full = ledgerEntries(S.ledger).reduce((sum, [, wi]) => sum + wi, 0); S.undo = keep; }
  CLK = { t, c, tot: acc, full: Math.max(full, acc) };
}
function ledgerFrac(tm) {
  if (CLK.tot < 1e-9) return 0;
  let lo = 0, hi = CLK.t.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (CLK.t[m] <= tm + 1e-9) lo = m + 1; else hi = m; }
  return lo === 0 ? 0 : CLK.c[lo - 1] / CLK.full;
}
const gOf = (kind, tm) => (kind === 0 ? tm / T_BOX : ledgerFrac(tm));
function yOf(tm) { const g = gOf(S.clockFrom, tm) * (1 - S.clockMix) + gOf(S.clock, tm) * S.clockMix; return H * (g - 0.5); }
const ledgerEmpty = () => CLK.tot < 1e-9;

/* =====================================================================
   7. DOM handles and small formatting helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags');
const cvSurv = $('surv'), cvHist = $('hist'), cvGauge = $('gauge'), cvProbe = $('probe');
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const supInt = (n) => String(n).split('').map((ch) => (ch === '-' ? '⁻' : SUP[+ch])).join('');
function copiesLabel(m) { return m < 1000 ? String(m) : '10' + supInt(Math.round(Math.log10(m))); }
function fmtLogHTML(l) {                                      // |κ| written from its log10
  if (l === -Infinity) return '0';
  if (l > -3) return pow10(l).toFixed(4);
  if (l > -1e5) return `10<sup>${l.toFixed(1).replace('-', '−')}</sup>`;
  const [m, e] = l.toExponential(1).split('e');
  return `10<sup>${m.replace('-', '−')}×10${supInt(+e)}</sup>`;
}
function fmtLogText(l) {
  if (l === -Infinity) return '0';
  if (l > -3) return pow10(l).toFixed(4);
  if (l > -1e5) return `10^${l.toFixed(1)}`;
  const [m, e] = l.toExponential(1).split('e');
  return `10^(${m}×10${supInt(+e)})`;
}
const fmtFid = (f) => (f >= 1 ? '1' : 1 - f >= 1e-3 ? f.toFixed(4) : `1 − ${(1 - f).toExponential(1)}`);
const mins = (t) => `${t.toFixed(1)} min`;

/* =====================================================================
   8. Three.js scene
   ===================================================================== */
let renderer = null, scene, camera, glOK = false;
let fiberLines, deathPts, readPts, selPts, selLine, nowPlane, lidPlane, frameLines;
const cam = { theta: -0.92, phi: 1.13, r: 6.4, tTheta: -0.92, tPhi: 1.13, tR: 6.4 };
const CAMS = { iso: [-0.92, 1.13, 6.4], side: [0.0, 1.5708, 6.6], top: [0.0, 0.06, 6.2], low: [-0.7, 2.45, 6.0] };
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
/* the NOW plane also carries the fringe an outside interference measurement would show (contrast uVis) */
const PLANE_FS = `
uniform vec3 uCol; uniform float uTime, uOp, uVis; varying vec2 vUv;
void main(){
  vec2 g = abs(fract(vUv * vec2(24.0, 24.0)) - 0.5);
  float line = smoothstep(0.46, 0.5, max(g.x, g.y));
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float edge = smoothstep(0.012, 0.0, e);
  float sweep = smoothstep(0.02, 0.0, abs(fract(vUv.x*0.5 - uTime*0.08) - 0.5));
  float fringe = uVis * (0.5 + 0.5 * cos(vUv.x * 56.0 - uTime * 1.3));
  float a = (0.04 + 0.11*line + 0.9*edge + 0.08*sweep) * uOp + 0.30 * fringe * uOp;
  vec3 col = mix(uCol, vec3(0.86, 0.93, 1.0), clamp(fringe, 0.0, 1.0) * 0.7);
  gl_FragColor = vec4(col, a);
}`;
function initGL() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) { renderer = null; }
  if (!renderer || !window.THREE) {
    const d = document.createElement('div'); d.className = 'nogl';
    d.textContent = L('这个浏览器没有提供 WebGL，三维账本块无法显示。下方的存活曲线、档案和右侧读数仍然可用。', 'This browser does not provide WebGL, so the 3D ledger block cannot be shown. The survival curve, the archive and the readouts still work.');
    stage.appendChild(d); return;
  }
  glOK = true;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x02040a, 1);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);

  const dyn = (g, name, n, size) => { const a = new THREE.BufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); };
  const additive = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending };
  const lines = (n, mat) => { const g = new THREE.BufferGeometry(); dyn(g, 'position', n, 3); dyn(g, 'color', n, 3); const m = new THREE.LineSegments(g, mat); m.frustumCulled = false; scene.add(m); return m; };
  frameLines = lines(400, new THREE.LineBasicMaterial({ vertexColors: true, ...additive }));
  fiberLines = lines(N_RUNS * 4, new THREE.LineBasicMaterial({ vertexColors: true, ...additive }));
  const pts = (n, fs) => {
    const g = new THREE.BufferGeometry();
    dyn(g, 'position', n, 3); dyn(g, 'aColor', n, 3); dyn(g, 'aAlpha', n, 1); dyn(g, 'aSize', n, 1);
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: EVT_VS, fragmentShader: fs, uniforms: { uScale: { value: 60 } }, ...additive }));
    m.frustumCulled = false; scene.add(m); return m;
  };
  deathPts = pts(N_RUNS, EVT_FS);
  readPts = pts(N_RUNS, EVT_FS);
  selPts = pts(2, SEL_FS);
  const sg = new THREE.BufferGeometry(); dyn(sg, 'position', 2, 3);
  selLine = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xffc83d, ...additive, opacity: 0.9 }));
  selLine.frustumCulled = false; scene.add(selLine);
  const plane = (col, op) => {
    const pg = new THREE.PlaneGeometry(1, 1, 1, 1); pg.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(pg, new THREE.ShaderMaterial({
      vertexShader: PLANE_VS, fragmentShader: PLANE_FS,
      uniforms: { uCol: { value: new THREE.Color(col[0], col[1], col[2]) }, uTime: { value: 0 }, uOp: { value: op }, uVis: { value: 0 } },
      ...additive, side: THREE.DoubleSide
    }));
    scene.add(m); return m;
  };
  nowPlane = plane(COL.amber, 1);
  lidPlane = plane(COL.sigma, 0.5);
}

/* box frame and tick marks: rebuilt whenever the clock mapping changes */
const TICKS = [0, 10, 20, 30, 40, 50, 60];
function buildFrame(op) {
  if (!glOK) return;
  const P = frameLines.geometry.attributes.position.array, C = frameLines.geometry.attributes.color.array;
  let n = 0;
  const seg = (a, b, col, k) => {
    if (n + 2 > P.length / 3) return;
    P.set(a, 3 * n); P.set(b, 3 * n + 3);
    for (let v = 0; v < 2; v++) { C[3 * (n + v)] = col[0] * k; C[3 * (n + v) + 1] = col[1] * k; C[3 * (n + v) + 2] = col[2] * k; }
    n += 2;
  };
  const y0 = yOf(0), y1 = yOf(T_BOX), b = BOX_HALF, edge = [0.12, 0.45, 0.62];
  const corners = [[-b, -b], [b, -b], [b, b], [-b, b]];
  for (let i = 0; i < 4; i++) {
    const [x, z] = corners[i], [x2, z2] = corners[(i + 1) % 4];
    seg([x, y0, z], [x, y1, z], edge, op * 0.9);
    seg([x, y0, z], [x2, y0, z2], edge, op * 0.9);
    seg([x, y1, z], [x2, y1, z2], edge, op * 0.6);
  }
  for (const t of TICKS) { const y = yOf(t); seg([-b, y, b], [-b - 0.09, y, b], edge, op); seg([-b, y, b], [-b, y, b - 0.09], edge, op * 0.6); }
  for (let tm = 5; tm < T_BOX; tm += 10) { const y = yOf(tm); seg([-b, y, b], [-b - 0.045, y, b], edge, op * 0.5); }
  frameLines.geometry.setDrawRange(0, n);
  frameLines.geometry.attributes.position.needsUpdate = true; frameLines.geometry.attributes.color.needsUpdate = true;
}

/* per-run placement: the grid when folded, two record-labelled blocks when the 4th axis is unfolded */
const RUN = { px: new Float32Array(N_RUNS), pz: new Float32Array(N_RUNS), focusA: new Float32Array(N_RUNS), status: new Array(N_RUNS).fill('alive'), pickP: new Float32Array(N_RUNS * 3), pickV: new Float32Array(N_RUNS) };
for (let r = 0; r < N_RUNS; r++) { RUN.px[r] = GX[r]; RUN.pz[r] = GZ[r]; RUN.focusA[r] = 1; }
let centerOpacity = 1;
function inFocus(st) { return S.focus === 0 || (S.focus === 1 && st === 'alive') || (S.focus === 2 && st === 'dead'); }
function runLayout(dtSec) {
  const s = smooth(S.split);
  let nA = 0, nD = 0, anyUnknown = false;
  const rankA = new Int32Array(N_RUNS), rankD = new Int32Array(N_RUNS);
  for (let r = 0; r < N_RUNS; r++) { const st = statusOf(r); RUN.status[r] = st; if (st === 'alive') rankA[r] = nA++; else if (st === 'unknown') anyUnknown = true; }
  for (const r of deadOrder) if (RUN.status[r] === 'dead') rankD[r] = nD++;
  const k = reduceMotion ? 1 : 1 - Math.pow(0.002, dtSec);
  const R = 1.2 * s;
  for (let r = 0; r < N_RUNS; r++) {
    const st = RUN.status[r];
    let tx = GX[r], tz = GZ[r];
    if (s > 1e-3 && st !== 'unknown') {
      const idx = st === 'alive' ? rankA[r] : rankD[r], cx = st === 'alive' ? R : -R;
      const rowsN = Math.ceil((st === 'alive' ? nA : nD) / GRID), z0 = -CELL * (rowsN - 1) / 2;
      const bx = cx - 0.95 + CELL * (idx % GRID), bz = z0 + CELL * Math.floor(idx / GRID);
      tx = GX[r] + (bx - GX[r]) * s; tz = GZ[r] + (bz - GZ[r]) * s;
    }
    RUN.px[r] += (tx - RUN.px[r]) * k; RUN.pz[r] += (tz - RUN.pz[r]) * k;
    const fa = inFocus(st) ? 1 : 0.1;
    RUN.focusA[r] += (fa - RUN.focusA[r]) * k;
  }
  centerOpacity = anyUnknown ? 1 : 1 - s;
  return { nA, nD };
}

function updateGL(time) {
  const t = viewT(), block = blockView(), end = block ? T_BOX : t;
  const y0 = yOf(0), yEnd = yOf(end), yOpen = yOf(S.open);
  const factIn = factStrength(S.ledger, t);
  const P = fiberLines.geometry.attributes.position.array, C = fiberLines.geometry.attributes.color.array;
  const dP = deathPts.geometry.attributes, rP = readPts.geometry.attributes;
  const scale = 58 * renderer.getPixelRatio();
  deathPts.material.uniforms.uScale.value = scale; readPts.material.uniforms.uScale.value = scale; selPts.material.uniforms.uScale.value = scale;
  const mix3 = (a, b, f, k) => [(a[0] + (b[0] - a[0]) * f) * k, (a[1] + (b[1] - a[1]) * f) * k, (a[2] + (b[2] - a[2]) * f) * k];
  let v = 0;
  const put = (x, ya, yb, z, col) => {
    P[3 * v] = x; P[3 * v + 1] = ya; P[3 * v + 2] = z; C[3 * v] = col[0]; C[3 * v + 1] = col[1]; C[3 * v + 2] = col[2]; v++;
    P[3 * v] = x; P[3 * v + 1] = yb; P[3 * v + 2] = z; C[3 * v] = col[0]; C[3 * v + 1] = col[1]; C[3 * v + 2] = col[2]; v++;
  };
  const showRead = S.ledger === 1 && (block || t >= S.open) && S.open <= end + 1e-9;
  for (let r = 0; r < N_RUNS; r++) {
    const x = RUN.px[r], z = RUN.pz[r], fa = RUN.focusA[r], st = RUN.status[r];
    const dead = DR[r] > 0 && DT[r] <= end + 1e-9;
    let dAlpha = 0;
    if (st === 'unknown') put(x, y0, yEnd, z, mix3(COL.gray, COL.gray, 0, 0.26 * fa));
    else if (dead) {
      const yd = yOf(DT[r]);
      put(x, y0, yd, z, mix3(COL.gray, COL.cyan, factIn, 0.42 * fa));
      put(x, yd, yEnd, z, mix3(COL.gray, COL.magenta, factIn, 0.3 * fa));
      dAlpha = (0.25 + 0.75 * factIn) * fa;
    } else put(x, y0, yEnd, z, mix3(COL.gray, COL.cyan, factIn, 0.42 * fa));
    const yd = dead ? yOf(DT[r]) : yEnd;
    dP.position.array[3 * r] = x; dP.position.array[3 * r + 1] = yd; dP.position.array[3 * r + 2] = z;
    dP.aColor.array[3 * r] = COL.magenta[0]; dP.aColor.array[3 * r + 1] = COL.magenta[1]; dP.aColor.array[3 * r + 2] = COL.magenta[2];
    dP.aAlpha.array[r] = st === 'unknown' ? 0 : dAlpha; dP.aSize.array[r] = 1.0;
    rP.position.array[3 * r] = x; rP.position.array[3 * r + 1] = yOpen; rP.position.array[3 * r + 2] = z;
    const rc = DR[r] > 0 && DT[r] <= S.open + 1e-9 ? COL.magenta : COL.cyan;
    rP.aColor.array[3 * r] = rc[0] * 0.8; rP.aColor.array[3 * r + 1] = rc[1] * 0.8; rP.aColor.array[3 * r + 2] = rc[2] * 0.8;
    rP.aAlpha.array[r] = showRead ? 0.32 * fa : 0; rP.aSize.array[r] = 0.5;
    RUN.pickP[3 * r] = x; RUN.pickP[3 * r + 1] = yd; RUN.pickP[3 * r + 2] = z;
    RUN.pickV[r] = st === 'unknown' ? 0 : fa;
  }
  fiberLines.geometry.setDrawRange(0, v);
  fiberLines.geometry.attributes.position.needsUpdate = true; fiberLines.geometry.attributes.color.needsUpdate = true;
  for (const a of [dP.position, dP.aColor, dP.aAlpha, dP.aSize, rP.position, rP.aColor, rP.aAlpha, rP.aSize]) a.needsUpdate = true;

  const sa = selPts.geometry.attributes, sl = selLine.geometry.attributes.position.array;
  if (S.sel >= 0) {
    const r = S.sel, x = RUN.px[r], z = RUN.pz[r];
    sa.position.array.set([RUN.pickP[3 * r], RUN.pickP[3 * r + 1], z, x, yOpen, z]);
    sa.aColor.array.set([...COL.amber, ...COL.amber]);
    sa.aAlpha.array.set([1, showRead ? 0.7 : 0]); sa.aSize.array.set([1.6, 1.1]);
    sl.set([x, y0, z, x, yEnd, z]);
    selLine.visible = true;
  } else { sa.aAlpha.array.set([0, 0]); selLine.visible = false; }
  for (const a of [sa.position, sa.aColor, sa.aAlpha, sa.aSize]) a.needsUpdate = true;
  selLine.geometry.attributes.position.needsUpdate = true;

  const s = smooth(S.split), wide = 2 * BOX_HALF + 0.3 + 2.4 * s * (centerOpacity < 1 ? 1 : 0);
  nowPlane.position.set(0, yOf(t), 0); nowPlane.scale.set(wide, 1, 2 * BOX_HALF + 0.3);
  nowPlane.material.uniforms.uTime.value = time;
  nowPlane.material.uniforms.uVis.value = Math.min(1, probeVisibility(t));
  lidPlane.position.set(0, yOpen, 0); lidPlane.scale.set(2 * BOX_HALF + 0.12, 1, 2 * BOX_HALF + 0.12);
  lidPlane.material.uniforms.uTime.value = time * 0.5;
  lidPlane.material.uniforms.uOp.value = 0.45 * Math.max(0.25, centerOpacity);
}
function probeVisibility(t) { const s = survivalAt(t); return 2 * Math.sqrt(Math.max(0, s * (1 - s))) * pow10(outsideLog10(t)); }

/* =====================================================================
   9. Camera and picking
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const r = cam.r + smooth(S.split) * (centerOpacity < 1 ? 1.9 : 0);
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
  const rect = stage.getBoundingClientRect();
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * rect.width, y: (-p.y * 0.5 + 0.5) * rect.height, z: p.z };
}
function pickAt(px, py) {
  if (!glOK) return;
  let best = -1, bd = 16 * 16;
  const v = new THREE.Vector3();
  for (let r = 0; r < N_RUNS; r++) {
    if (RUN.pickV[r] < 0.3) continue;
    v.set(RUN.pickP[3 * r], RUN.pickP[3 * r + 1], RUN.pickP[3 * r + 2]);
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
   10. Tags (projected labels)
   ===================================================================== */
function mkTag(cls, text) { const el = document.createElement('div'); el.className = 'tag ' + cls; el.textContent = text; tagsBox.appendChild(el); return el; }
const tagNow = mkTag('hot', 'NOW'), tagLid = mkTag('', ''), tagPast = mkTag('', ''), tagAxis = mkTag('', '');
const tagAlive = mkTag('cy', ''), tagDead = mkTag('mg', '');
const tickTags = TICKS.map(() => mkTag('tick', ''));
function labelStaticTags() {
  tagLid.textContent = L('开箱 OPEN', 'OPEN'); tagPast.textContent = L('过去 PAST', 'PAST');
  tagAxis.textContent = L('t ↑ 钟', 't ↑ clock');
  tagAlive.textContent = L('活 ALIVE', 'ALIVE'); tagDead.textContent = L('死 DEAD', 'DEAD');
}
labelStaticTags();
function placeTag(el, x, y, z, show = true) {
  if (!glOK || !show) { el.style.display = 'none'; return; }
  const p = projectToStage(new THREE.Vector3(x, y, z));
  if (p.z > 1 || p.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
}
function updateTags() {
  const b = BOX_HALF, centre = centerOpacity > 0.35, t = viewT();
  placeTag(tagNow, b + 0.32, yOf(t), -b);
  placeTag(tagLid, b + 0.3, yOf(S.open), b, centre && Math.abs(yOf(S.open) - yOf(t)) > 0.12);
  placeTag(tagPast, 0, yOf(0) - 0.22, b + 0.1, centre);
  placeTag(tagAxis, -b - 0.1, yOf(T_BOX) + 0.2, b, centre);
  let lastY = -1e9;
  TICKS.forEach((tm, i) => {
    const y = yOf(tm), show = centre && Math.abs(y - lastY) > 0.07;
    tickTags[i].textContent = String(tm);
    placeTag(tickTags[i], -b - 0.12, y, b, show);
    if (show) lastY = y;
  });
  const s = smooth(S.split), split = s > 0.3 && centerOpacity < 1;
  placeTag(tagAlive, 1.2 * s, yOf(T_BOX) + 0.25, -1.0, split);
  placeTag(tagDead, -1.2 * s, yOf(T_BOX) + 0.25, -1.0, split);
}

/* =====================================================================
   11. 2D panels
   ===================================================================== */
const pad = { l: 34, r: 10, t: 10, b: 18 };
function drawSurv() {
  const dpr = fitCanvas(cvSurv), ctx = cvSurv.getContext('2d');
  const W = cvSurv.width, Hh = cvSurv.height;
  ctx.clearRect(0, 0, W, Hh);
  const pl = pad.l * dpr, pr = pad.r * dpr, pt = pad.t * dpr, pb = pad.b * dpr, iw = W - pl - pr, ih = Hh - pt - pb;
  if (iw < 20 || ih < 20) return;
  const X = (t) => pl + t / T_BOX * iw, Y = (s) => pt + ih - s * ih;
  ctx.strokeStyle = FAINT; ctx.lineWidth = 1; ctx.globalAlpha = 0.6; ctx.beginPath();
  for (const s of [0, 0.25, 0.5, 0.75, 1]) { ctx.moveTo(pl, Y(s)); ctx.lineTo(pl + iw, Y(s)); }
  for (const t of TICKS) { ctx.moveTo(X(t), pt); ctx.lineTo(X(t), pt + ih); }
  ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const s of [0, 0.5, 1]) ctx.fillText(s.toFixed(1), pl - 5 * dpr, Y(s));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const t of TICKS) ctx.fillText(String(t), X(t), pt + ih + 3 * dpr);
  if (S.dark > 0) {
    ctx.strokeStyle = SG; ctx.globalAlpha = 0.55; ctx.setLineDash([2 * dpr, 4 * dpr]);
    ctx.beginPath(); ctx.moveTo(pl, Y(S.dark)); ctx.lineTo(pl + iw, Y(S.dark)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = SG; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`w = ${S.dark.toFixed(2)}`, pl + iw - 4 * dpr, Y(S.dark) - 2 * dpr);
  }
  // unmonitored reference
  ctx.strokeStyle = SG; ctx.globalAlpha = 0.5; ctx.setLineDash([5 * dpr, 4 * dpr]); ctx.lineWidth = 1.2 * dpr;
  ctx.beginPath();
  for (let j = 0; j <= 240; j++) { const t = T_BOX * j / 240; const y = Y(unmonitored(t)); if (j) ctx.lineTo(X(t), y); else ctx.moveTo(X(t), y); }
  ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  // theory step curve
  const N = nMax(), d = dt();
  ctx.strokeStyle = CY; ctx.lineWidth = 1.8 * dpr; ctx.shadowColor = CY; ctx.shadowBlur = 6 * dpr;
  ctx.beginPath(); ctx.moveTo(X(0), Y(1));
  for (let n = 1; n <= N; n++) { ctx.lineTo(X(n * d), Y(survivalRound(n - 1))); ctx.lineTo(X(n * d), Y(survivalRound(n))); }
  ctx.lineTo(X(T_BOX), Y(survivalRound(N)));
  ctx.stroke(); ctx.shadowBlur = 0;
  // archive fraction
  ctx.strokeStyle = INK; ctx.globalAlpha = 0.75; ctx.lineWidth = 1 * dpr;
  ctx.beginPath(); ctx.moveTo(X(0), Y(1));
  let alive = N_RUNS;
  for (const r of deadOrder) { ctx.lineTo(X(DT[r]), Y(alive / N_RUNS)); alive--; ctx.lineTo(X(DT[r]), Y(alive / N_RUNS)); }
  ctx.lineTo(X(T_BOX), Y(alive / N_RUNS)); ctx.stroke(); ctx.globalAlpha = 1;
  // markers
  const vline = (t, col, dash, label) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.2 * dpr; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(X(t), pt); ctx.lineTo(X(t), pt + ih); ctx.stroke(); ctx.setLineDash([]);
    if (label) { ctx.fillStyle = col; ctx.textAlign = t > T_BOX * 0.85 ? 'right' : 'left'; ctx.textBaseline = 'top'; ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.fillText(label, X(t) + (t > T_BOX * 0.85 ? -3 : 3) * dpr, pt + 1 * dpr); }
  };
  vline(S.open, SG, [3 * dpr, 3 * dpr], L('开箱', 'open'));
  if (S.undo) vline(S.undoAt, MG, [], L('撤销', 'undo'));
  vline(viewT(), AM, [], '');
  ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(viewT()), Y(survivalAt(viewT())), 3.5 * dpr, 0, Math.PI * 2); ctx.fill();
  // legend
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const lx = pl + 8 * dpr, ly = pt + ih - 9 * dpr;
  ctx.fillStyle = 'rgba(2, 6, 12, 0.72)'; ctx.fillRect(lx - 4 * dpr, ly - 8 * dpr, Math.min(iw - 8 * dpr, 250 * dpr), 16 * dpr);
  const item = (i, col, dash, text) => {
    const x = lx + i * 82 * dpr;
    ctx.strokeStyle = col; ctx.lineWidth = 1.4 * dpr; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + 14 * dpr, ly); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = DIM; ctx.fillText(text, x + 18 * dpr, ly);
  };
  item(0, CY, [], L('理论 s(t)', 'law s(t)'));
  item(1, INK, [], L('档案', 'archive'));
  item(2, SG, [5 * dpr, 4 * dpr], L('不检查', 'unchecked'));
  $('survMeta').textContent = L(`s(60) = ${survivalRound(N).toFixed(3)} · ${N} 次检查 · Δt = ${d.toFixed(2)} min`, `s(60) = ${survivalRound(N).toFixed(3)} · ${N} checks · Δt = ${d.toFixed(2)} min`);
}

let histGeom = null;
function histCounts() {
  const dead = new Float32Array(HIST_BINS), known = new Float32Array(HIST_BINS), exp = new Float32Array(HIST_BINS);
  const bw = T_BOX / HIST_BINS;
  for (let r = 0; r < N_RUNS; r++) if (DR[r] > 0) { const b = Math.min(HIST_BINS - 1, Math.floor((DT[r] - 1e-9) / bw)); dead[b]++; if (RUN.status[r] === 'dead') known[b]++; }
  const N = nMax(), d = dt();
  for (let n = 1; n <= N; n++) { const b = Math.min(HIST_BINS - 1, Math.floor((n * d - 1e-9) / bw)); exp[b] += N_RUNS * pFirst(n); }
  return { dead, known, exp, bw };
}
function drawHist() {
  const dpr = fitCanvas(cvHist), ctx = cvHist.getContext('2d');
  const W = cvHist.width, Hh = cvHist.height;
  ctx.clearRect(0, 0, W, Hh);
  const pl = pad.l * dpr, pr = pad.r * dpr, pt = pad.t * dpr, pb = pad.b * dpr, iw = W - pl - pr, ih = Hh - pt - pb;
  if (iw < 40 || ih < 20) return;
  const { dead, known, exp } = histCounts();
  const aliveN = N_RUNS - deadOrder.length, aliveExp = N_RUNS * survivalRound(nMax());
  const gap = 10 * dpr, colW = Math.max(10 * dpr, iw * 0.09), dw = iw - gap - colW;
  histGeom = { pl, pt, iw, ih, dw, gap, colW, dpr };
  let ymax = 1; for (let b = 0; b < HIST_BINS; b++) ymax = Math.max(ymax, dead[b], exp[b]);
  ymax *= 1.18;
  const aliveScale = Math.max(aliveN, aliveExp, 1) * 1.18;
  const X = (b) => pl + b / HIST_BINS * dw, Y = (v) => pt + ih - v / ymax * ih;
  ctx.strokeStyle = FAINT; ctx.globalAlpha = 0.6; ctx.lineWidth = 1; ctx.beginPath();
  for (const t of TICKS) { const x = pl + t / T_BOX * dw; ctx.moveTo(x, pt); ctx.lineTo(x, pt + ih); }
  ctx.moveTo(pl, pt + ih); ctx.lineTo(pl + iw, pt + ih); ctx.stroke(); ctx.globalAlpha = 1;
  const focusDead = S.focus !== 1, focusAlive = S.focus !== 2;
  const bwp = dw / HIST_BINS;
  for (let b = 0; b < HIST_BINS; b++) {
    const x = X(b) + 0.8 * dpr, w = bwp - 1.6 * dpr;
    ctx.fillStyle = MG; ctx.globalAlpha = focusDead ? 0.22 : 0.08; ctx.fillRect(x, Y(dead[b]), w, pt + ih - Y(dead[b]));
    ctx.globalAlpha = focusDead ? 0.9 : 0.18; ctx.fillRect(x, Y(known[b]), w, pt + ih - Y(known[b]));
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = INK; ctx.lineWidth = 1 * dpr; ctx.globalAlpha = 0.7; ctx.beginPath();
  for (let b = 0; b < HIST_BINS; b++) { const y = Y(exp[b]); if (b) ctx.lineTo(X(b), y); else ctx.moveTo(X(b), y); ctx.lineTo(X(b + 1), y); }
  ctx.stroke(); ctx.globalAlpha = 1;
  // survivors column
  const cx = pl + dw + gap, knownAlive = RUN.status.some((s) => s !== 'unknown') && (blockView() || viewT() >= T_BOX - 1e-9);
  const ya = pt + ih - aliveN / aliveScale * ih;
  ctx.fillStyle = CY; ctx.globalAlpha = focusAlive ? (knownAlive ? 0.85 : 0.25) : 0.1;
  ctx.fillRect(cx, ya, colW, pt + ih - ya); ctx.globalAlpha = 1;
  ctx.strokeStyle = INK; ctx.globalAlpha = 0.7; ctx.beginPath(); const ye = pt + ih - aliveExp / aliveScale * ih; ctx.moveTo(cx - 2 * dpr, ye); ctx.lineTo(cx + colW + 2 * dpr, ye); ctx.stroke(); ctx.globalAlpha = 1;
  // selection
  if (S.sel >= 0) {
    ctx.strokeStyle = AM; ctx.lineWidth = 1.6 * dpr;
    if (DR[S.sel] > 0) { const b = Math.min(HIST_BINS - 1, Math.floor((DT[S.sel] - 1e-9) / (T_BOX / HIST_BINS))); ctx.strokeRect(X(b), pt, bwp, ih); }
    else ctx.strokeRect(cx - 1 * dpr, pt, colW + 2 * dpr, ih);
  }
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const t of [0, 20, 40, 60]) ctx.fillText(String(t), pl + t / T_BOX * dw, pt + ih + 3 * dpr);
  ctx.fillStyle = CY; ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`;
  ctx.fillText(L('活', 'alive'), cx + colW / 2, pt + ih + 3 * dpr);
  ctx.fillStyle = CY; ctx.textBaseline = 'bottom'; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  ctx.fillText(String(aliveN), cx + colW / 2, ya - 2 * dpr);
  $('histMeta').textContent = L(`#${archiveHash} · 死 ${deadOrder.length} · 活 ${aliveN}`, `#${archiveHash} · dead ${deadOrder.length} · alive ${aliveN}`);
}
cvHist.addEventListener('click', (ev) => {
  if (!histGeom) return;
  const rect = cvHist.getBoundingClientRect(), dpr = histGeom.dpr;
  const x = (ev.clientX - rect.left) * dpr;
  const { pl, dw, gap } = histGeom;
  if (x > pl + dw + gap * 0.5) {                           // survivors column
    for (let r = 0; r < N_RUNS; r++) if (DR[r] === 0) { selectRun(r); return; }
    return;
  }
  const t = Math.max(0, Math.min(T_BOX, (x - pl) / dw * T_BOX));
  let best = -1, bd = Infinity;
  for (const r of deadOrder) { const d = Math.abs(DT[r] - t); if (d < bd) { bd = d; best = r; } }
  if (best >= 0 && bd < T_BOX / HIST_BINS * 1.5) selectRun(best);
});

function drawGauge() {
  const dpr = fitCanvas(cvGauge), ctx = cvGauge.getContext('2d');
  const W = cvGauge.width, Hh = cvGauge.height;
  ctx.clearRect(0, 0, W, Hh);
  const pl = 34 * dpr, pb = 24 * dpr, pt = 12 * dpr, pr = 14 * dpr;
  const side = Math.min(W - pl - pr, Hh - pb - pt);
  if (side < 24) return;
  const ox = pl, oy = pt + side, X = (v) => ox + v * side, Y = (d) => oy - d * side;
  ctx.strokeStyle = FAINT; ctx.lineWidth = 1 * dpr;
  ctx.beginPath(); ctx.moveTo(ox, pt); ctx.lineTo(ox, oy); ctx.lineTo(ox + side, oy); ctx.stroke();
  ctx.strokeStyle = OK; ctx.lineWidth = 1.6 * dpr; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.arc(ox, oy, side, -Math.PI / 2, 0); ctx.stroke(); ctx.globalAlpha = 1;
  const l = kappaLog10(), V = pow10(l), D = dOfLog(l);
  ctx.strokeStyle = AM; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.lineWidth = 1 * dpr;
  ctx.beginPath(); ctx.moveTo(X(V), oy); ctx.lineTo(X(V), Y(D)); ctx.lineTo(ox, Y(D)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = AM; ctx.shadowColor = AM; ctx.shadowBlur = 12 * dpr;
  ctx.beginPath(); ctx.arc(X(V), Y(D), 5 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = DIM; ctx.font = `${10 * dpr}px ${TRV.fonts.data}`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText('1', ox - 8 * dpr, Y(1)); ctx.fillText('0', ox - 8 * dpr, oy);
  ctx.textAlign = 'left'; ctx.fillText('D', ox + 6 * dpr, pt + 4 * dpr);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('V', ox + side, oy + 8 * dpr);
  ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = `${11 * dpr}px ${TRV.fonts.data}`;
  ctx.fillText(`D²+V² = ${(D * D + V * V).toFixed(3)}`, X(0.36), Y(0.99));
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`;
  ctx.fillText(S.undo ? L('撤销后的残余重叠 f^M', 'residual overlap f^M after the undo') : L('全部副本的重叠 κ = c^M', 'overlap of all copies κ = c^M'), X(0.36), Y(0.99) + 16 * dpr);
}

function drawProbe() {
  const dpr = fitCanvas(cvProbe), ctx = cvProbe.getContext('2d');
  const W = cvProbe.width, Hh = cvProbe.height;
  ctx.clearRect(0, 0, W, Hh);
  const pl = 30 * dpr, pr = 10 * dpr, pt = 10 * dpr, pb = 18 * dpr, iw = W - pl - pr, ih = Hh - pt - pb;
  if (iw < 20 || ih < 20) return;
  const t = viewT(), Vt = probeVisibility(t);
  const X = (ph) => pl + ph / (2 * Math.PI) * iw, Y = (p) => pt + ih - p * ih;
  ctx.strokeStyle = FAINT; ctx.globalAlpha = 0.6; ctx.lineWidth = 1; ctx.beginPath();
  for (const p of [0, 0.5, 1]) { ctx.moveTo(pl, Y(p)); ctx.lineTo(pl + iw, Y(p)); }
  ctx.stroke(); ctx.globalAlpha = 1;
  const grad = ctx.createLinearGradient(0, pt, 0, pt + ih);
  grad.addColorStop(0, 'rgba(207, 227, 255, 0.35)'); grad.addColorStop(1, 'rgba(207, 227, 255, 0.02)');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(X(0), Y(0));
  for (let j = 0; j <= 160; j++) { const ph = 2 * Math.PI * j / 160; ctx.lineTo(X(ph), Y(0.5 * (1 + Vt * Math.cos(ph)))); }
  ctx.lineTo(X(2 * Math.PI), Y(0)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = SG; ctx.lineWidth = 1.6 * dpr; ctx.beginPath();
  for (let j = 0; j <= 160; j++) { const ph = 2 * Math.PI * j / 160, y = Y(0.5 * (1 + Vt * Math.cos(ph))); if (j) ctx.lineTo(X(ph), y); else ctx.moveTo(X(ph), y); }
  ctx.stroke();
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText('1', pl - 5 * dpr, Y(1)); ctx.fillText('½', pl - 5 * dpr, Y(0.5)); ctx.fillText('0', pl - 5 * dpr, Y(0));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('0', X(0), pt + ih + 3 * dpr); ctx.fillText('π', X(Math.PI), pt + ih + 3 * dpr); ctx.fillText('2π', X(2 * Math.PI), pt + ih + 3 * dpr);
  ctx.textAlign = 'left'; ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.textBaseline = 'top';
  ctx.fillText(L('P(+ | φ)，基 (|活⟩ + e^{iφ}|死⟩)/√2', 'P(+ | φ), basis (|alive⟩ + e^{iφ}|dead⟩)/√2'), pl + 4 * dpr, pt + 2 * dpr);
}

/* =====================================================================
   12. Readouts, notes and the UI
   ===================================================================== */
function buildBranchUI() {
  const defs = [
    { sym: 'Σ', col: SG, lbl: L('全部', 'all') },
    { sym: L('活', 'A'), col: CY, lbl: L('活着的时空', 'alive spacetime') },
    { sym: L('死', 'D'), col: MG, lbl: L('死亡的时空', 'dead spacetime') }
  ];
  $('branches').innerHTML = defs.map((d, i) => `<button class="branch" data-focus="${i}" aria-pressed="${S.focus === i}" style="--bc:${d.col}"><span class="sym">${d.sym}</span><span class="lbl">${d.lbl}</span></button>`).join('');
  document.querySelectorAll('#branches .branch').forEach((b) => b.addEventListener('click', () => setFocus(+b.dataset.focus)));
}
function buildBranchTable() { $('branchTable').innerHTML = branchTableHTML(); }
function branchTableHTML() {
  let a = 0, d = 0, u = 0;
  for (let r = 0; r < N_RUNS; r++) { const st = RUN.status[r]; if (st === 'alive') a++; else if (st === 'dead') d++; else u++; }
  const tRef = blockView() ? T_BOX : viewT(), sP = survivalAt(tRef);
  const known = a + d;
  const row = (col, name, n, p) => `<tr><td><i style="background:${col}"></i>${name}</td><td>${u === N_RUNS ? '—' : n}</td><td>${known ? (n / known).toFixed(3) : '—'}</td><td>${p.toFixed(3)}</td></tr>`;
  const aliveName = blockView() ? L('活到 60 min', 'alive at 60 min') : L('此刻活着', 'alive now');
  const deadName = blockView() ? L('箱内死亡', 'died in the box') : L('此刻已死', 'dead by now');
  return `<table><thead><tr><th>${L('条件时空', 'Spacetime')}</th><th>${L('只数', 'cats')}</th><th>${L('占比', 'share')}</th><th>${L('理论 P', 'law P')}</th></tr></thead><tbody>`
    + row(SG, L('Σ 全部', 'Σ all'), known, 1)
    + row(CY, aliveName, a, sP)
    + row(MG, deadName, d, 1 - sP)
    + (u ? `<tr><td colspan="4" class="note">${L(`盒外尚未开箱：${u} 只猫的死活不在这本账上`, `Outside, box still closed: ${u} cats are not in this ledger yet`)}</td></tr>` : '')
    + '</tbody></table>';
}
function updateBars() {
  const t = viewT(), s = survivalAt(t), n = roundsBy(t);
  const pDark = s > 0 ? S.dark / s : 0, pUnd = 1 - pDark;
  $('condBars').innerHTML = [
    [L('未衰变（下一次检查仍可能衰变）', 'Not yet decayed (may still decay at the next check)'), pUnd, CY],
    [L('暗态（任何检查都探测不到）', 'Dark (no check can ever detect it)'), pDark, SG]
  ].map(([name, p, col]) => `<div class="row" style="--bc:${col}"><span>${name}</span><b>${p.toFixed(3)}</b><div class="track"><i style="width:${(p * 100).toFixed(1)}%"></i></div></div>`).join('');
  $('condNote').innerHTML = S.dark > 0
    ? L(`活到 t = ${t.toFixed(1)} min（${n} 次检查都没响）的条件下，原子处在暗态的概率是 w/s(t) = ${pDark.toFixed(3)}。活得越久，这个比例越接近 1；长期存活概率趋于 w = ${S.dark.toFixed(2)}。账本上两种活猫看起来一模一样。`,
        `Given survival to t = ${t.toFixed(1)} min (${n} checks without a click), the atom is dark with probability w/s(t) = ${pDark.toFixed(3)}. The longer the cat lives, the closer this gets to 1; long-run survival tends to w = ${S.dark.toFixed(2)}. In the ledger both kinds of living cat look exactly alike.`)
    : L('没有暗态时，每只活猫都只是“还没衰变”，长期存活概率趋于 0。把暗态权重 w 调大，看条件态怎样随存活时间偏向暗态。',
        'Without a dark state every living cat is simply “not yet decayed”, and long-run survival tends to 0. Raise the dark weight w to see the conditional state lean towards the dark part the longer a cat survives.');
}
let syncedT = NaN;                                           // the moment the notes and bars were last written for
function syncOutputs() {
  const d = dt(), N = nMax(), t = viewT();
  syncedT = t;
  $('oDt').textContent = `${d.toFixed(2)} min`;
  $('oDark').textContent = S.dark.toFixed(2);
  $('oOpen').textContent = mins(S.open);
  $('oCopies').textContent = copiesLabel(copies());
  $('oOverlap').textContent = S.overlap.toFixed(3);
  $('oFid').textContent = fmtFid(fid());
  $('oSplit').textContent = S.split.toFixed(2);
  const pCheck = 1 - checkFactor();
  $('writeNote').innerHTML = (S.coupling === 1
    ? L(`相干耦合：两次检查之间振幅相干增长，每次检查捕到衰变的概率是 sin²(ΩΔt) = ${pCheck.toFixed(4)}。检查越频繁，猫活得越久；虚线是没人检查时的布居。`,
        `Coherent coupling: amplitude grows coherently between checks, and each check catches a decay with probability sin²(ΩΔt) = ${pCheck.toFixed(4)}. The more often it checks, the longer the cat lives; the dashed line is the population with no checks at all.`)
    : L(`马尔可夫衰变：每次检查只是读计数器，捕到衰变的概率 1 − e<sup>−ΓΔt</sup> = ${pCheck.toFixed(4)}。在检查时刻上 s(t) = e<sup>−Γt</sup>，与 Δt 无关。`,
        `Markov decay: each check just reads the counter and catches a decay with probability 1 − e<sup>−ΓΔt</sup> = ${pCheck.toFixed(4)}. At check times s(t) = e<sup>−Γt</sup>, whatever Δt is.`))
    + L(` <b>这些控件改档案指纹。</b>`, ` <b>These controls change the archive fingerprint.</b>`);
  $('readNote').innerHTML = L(`开箱在 t = ${S.open.toFixed(1)} min。盒外账本在此之前没有任何一只猫的死活；开箱那一刻一次读入全部 ${N_RUNS} 只盒子，其中 ${deathsBy(S.open)} 条死亡早已写在盒内。<b>拖动开箱时刻，档案指纹不变。</b>`,
    `The boxes open at t = ${S.open.toFixed(1)} min. Before that the outside ledger holds no cat’s fate; at the opening it reads all ${N_RUNS} boxes at once, and ${deathsBy(S.open)} of the deaths were written inside long before. <b>Dragging the opening time leaves the archive fingerprint unchanged.</b>`);
  const lr = recordLog10(), Dr = dOfLog(lr);
  $('copyNote').innerHTML = (S.undo
    ? L(`<b>已撤销</b>（t = ${S.undoAt.toFixed(1)} min）：${copiesLabel(undoCopies())} 份副本各以保真度 f 反演，残余重叠 f<sup>M</sup> = ${fmtLogHTML(undoLog10())}。${pow10(undoLog10()) > 0.5 ? '死活从账本里被抹去，条纹重新可测。' : '记录几乎原样留着，事实仍在。'}`,
        `<b>Undone</b> (t = ${S.undoAt.toFixed(1)} min): ${copiesLabel(undoCopies())} copies each reversed with fidelity f leave an overlap f<sup>M</sup> = ${fmtLogHTML(undoLog10())}. ${pow10(undoLog10()) > 0.5 ? 'The fate is erased from the ledgers and fringes are measurable again.' : 'The records are left almost intact, and so is the fact.'}`)
    : L(`全部副本的重叠 |κ| = c<sup>M</sup> = ${fmtLogHTML(lr)}，事实强度 D = ${Dr.toFixed(3)}。${Dr > 0.999 ? '死活是清晰的事实。' : '记录很弱：死活在盒内账本里还不是清晰的事实。'}`,
        `The overlap of all copies is |κ| = c<sup>M</sup> = ${fmtLogHTML(lr)}, fact strength D = ${Dr.toFixed(3)}. ${Dr > 0.999 ? 'Alive or dead is a sharp fact.' : 'The record is weak: alive or dead is not yet a sharp fact in the inside ledger.'}`));
  $('undoBtn').setAttribute('aria-pressed', String(S.undo));
  const outside = S.ledger === 1;
  $('clockNote').innerHTML = S.clock === 0
    ? L('实验室钟：均匀的分钟刻度。换成账本钟，时间只在写入记录时前进。', 'Lab clock: even minute ticks. Switch to the ledger clock and time moves only when a record is written.')
    : (ledgerEmpty()
      ? L(`<span style="color:${WARN}">账本为空</span>：这本账上没有任何记录，账本钟没有刻度，整段历史压成一点。`, `<span style="color:${WARN}">Empty ledger</span>: there is no record in this ledger, so the ledger clock has no ticks and the whole history collapses to a point.`)
      : L(`<span style="color:${WARN}">非单射</span>：账本钟只在写入记录时前进，没有记录的时段被压成同一个读数。${outside ? `盒外账本里，开箱前的 ${S.open.toFixed(1)} 分钟全部压在开箱那一刻。` : '盒内账本里，每条死亡记录占相同的高度。'}${S.undo ? '被撤销的记录按残余事实强度计数。' : ''}`,
          `<span style="color:${WARN}">Not injective</span>: the ledger clock moves only when a record is written, so stretches without records share one reading. ${outside ? `In the outside ledger the ${S.open.toFixed(1)} minutes before opening all collapse onto the opening.` : 'In the inside ledger every death record takes the same height.'}${S.undo ? ' Undone records count with their remaining fact strength.' : ''}`));
  const opened = t >= S.open, lo = outsideLog10(t), Vt = probeVisibility(t);
  $('probeV').innerHTML = `V<sub>t</sub> = ${Vt > 1e-3 || Vt === 0 ? Vt.toFixed(3) : fmtLogHTML(Math.log10(Vt))}`;
  $('probeNote').innerHTML = S.undo
    ? L(`撤销之后，外部观察者在活/死叠加基上测量：条纹可见度 = 2√(s(1−s))·f<sup>M</sup> = ${Vt.toFixed(3)}。${pow10(lo) > 0.5 ? '两支重新相干，“猫死没死”此刻不是任何账本里的事实。' : '副本太多，残余重叠几乎为零，撤销等于没做。'}`,
        `After the undo the outside observer measures in an alive/dead superposition basis: fringe visibility = 2√(s(1−s))·f<sup>M</sup> = ${Vt.toFixed(3)}. ${pow10(lo) > 0.5 ? 'The branches are coherent again; whether the cat died is at this moment not a fact in any ledger.' : 'There are too many copies; the residual overlap is nearly zero and the undo achieves nothing.'}`)
    : opened
      ? L('已开箱：观察者自己的记忆也成了一份理想记录（重叠 0），可见度为 0。要重新看到条纹，得连自己的记忆一起撤销。', 'The box is open: the observer’s own memory is one more ideal record (overlap 0), so the visibility is 0. To see fringes again one would have to undo one’s own memory too.')
      : (pow10(lo) > 1e-3
        ? L(`还没开箱，而且记录很弱：两支仍有 |κ| = ${fmtLogHTML(lo)} 的重叠，条纹可见度 2√(s(1−s))·|κ| = ${Vt.toFixed(3)}。此时“猫死没死”还不是任何账本里的清晰事实。`,
            `The box is still closed and the record is weak: the branches still overlap by |κ| = ${fmtLogHTML(lo)}, giving fringe visibility 2√(s(1−s))·|κ| = ${Vt.toFixed(3)}. Whether the cat died is not yet a sharp fact in any ledger.`)
        : L(`还没开箱，盒外账本上也没有这只猫的死活。但记录早已写在盒内：${copiesLabel(copies())} 份副本使两支的重叠只剩 ${fmtLogHTML(lo)}，所以不开箱也看不到条纹。`,
            `The box is still closed and the outside ledger holds no fate yet. But the record is already written inside: ${copiesLabel(copies())} copies leave the branches an overlap of only ${fmtLogHTML(lo)}, so no fringes appear even without opening.`));
  const l = kappaLog10();
  $('roKappa').innerHTML = fmtLogHTML(l);
  $('roD').textContent = dOfLog(l).toFixed(3);
  $('roV').innerHTML = pow10(l) > 1e-3 || l === -Infinity ? pow10(l).toFixed(3) : fmtLogHTML(l);
  $('pillMode').innerHTML = `MODE <strong>${S.mode === 1 ? 'BLOCK' : 'LINEAR'}</strong>`;
  $('pillLedger').innerHTML = `LEDGER <strong>${S.ledger === 1 ? 'OUT' : 'IN'}</strong>`;
  $('pillClock').innerHTML = `CLOCK <strong>${S.clock === 1 ? 'LEDGER' : 'LAB'}</strong>`;
  $('presetNote').textContent = S.preset ? L(PRESETS[S.preset].zh, PRESETS[S.preset].en) : L('自定义参数。', 'Custom settings.');
  document.querySelectorAll('#couplingChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.coupling === S.coupling)));
  document.querySelectorAll('#ledgerChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.ledger === S.ledger)));
  document.querySelectorAll('#clockChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.clock === S.clock)));
  document.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.mode === S.mode)));
  updateMarks(); updateBars();
  void N;
}
function updateMarks() {
  const items = [];
  const add = (t, label, cls) => items.push(`<i class="${cls || ''}" style="left:${(t / T_BOX * 100).toFixed(2)}%">${label}</i>`);
  const busy = [S.open].concat(S.undo ? [S.undoAt] : []);
  const free = (t) => busy.every((b) => Math.abs(b - t) > 5);
  if (free(0)) add(0, '0', 'first');
  if (free(30)) add(30, '30', '');
  if (free(60)) add(60, '60 min', 'last');
  const edge = (t) => (t < 4 ? ' first' : t > 56 ? ' last' : '');
  add(S.open, L('开箱', 'open'), 'op' + edge(S.open));
  if (S.undo && Math.abs(S.undoAt - S.open) > 5) add(S.undoAt, L('撤销', 'undo'), 'un' + edge(S.undoAt));
  $('marks').innerHTML = items.join('');
}

/* archive-changing controls */
let dirtyArchive = true, dirtyClock = true, dirtyFrame = true;
function markArchive() { dirtyArchive = true; }
function clearPreset() { S.preset = null; document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', 'false')); }
function bindRange(id, fn) { const el = $(id); el.addEventListener('input', () => { fn(parseFloat(el.value)); syncOutputs(); }); }
bindRange('dt', (v) => { S.dtV = v; markArchive(); clearPreset(); });
bindRange('dark', (v) => { S.dark = v; markArchive(); clearPreset(); });
bindRange('open', (v) => { S.open = v; dirtyClock = true; clearPreset(); });
bindRange('copies', (v) => { S.mIdx = Math.round(v); dirtyClock = true; clearPreset(); });
bindRange('overlap', (v) => { S.overlap = v; dirtyClock = true; clearPreset(); });
bindRange('fid', (v) => { S.fidV = v; dirtyClock = true; clearPreset(); });
bindRange('split', (v) => { S.split = v; });
document.querySelectorAll('#couplingChips .chip').forEach((b) => b.addEventListener('click', () => { S.coupling = +b.dataset.coupling; markArchive(); clearPreset(); syncOutputs(); }));
function setLedger(l) { if (l === S.ledger) return; S.ledger = l; dirtyClock = true; syncOutputs(); if (S.sel >= 0) selectRun(S.sel); }
document.querySelectorAll('#ledgerChips .chip').forEach((b) => b.addEventListener('click', () => setLedger(+b.dataset.ledger)));
function setMode(m) { S.mode = m; syncOutputs(); if (S.sel >= 0) selectRun(S.sel); }
document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => setMode(+b.dataset.mode)));
function setClock(c) { if (c === S.clock) return; S.clockFrom = S.clock; S.clock = c; S.clockMix = reduceMotion ? 1 : 0; if (reduceMotion) S.clockFrom = c; dirtyFrame = true; syncOutputs(); }
document.querySelectorAll('#clockChips .chip').forEach((b) => b.addEventListener('click', () => setClock(+b.dataset.clock)));
function setFocus(f) {
  if (f < 0 || f > 2) return;
  S.focus = f;
  document.querySelectorAll('#branches .branch').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.focus === f)));
}
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));

const toast = (html) => TRV.toast($('toast'), html);
const glitch = () => TRV.glitch($('app'));
TRV.startGlitch($('app'));

function setUndo(on, quiet) {
  if (on === S.undo) return;
  S.undo = on;
  if (on) {
    S.undoAt = nowT(); S.playing = false; setPlayUI();
    if (!quiet) {
      const l = undoLog10();
      toast(pow10(l) > 0.5
        ? L(`<b>撤销成功</b>：${copiesLabel(undoCopies())} 份副本全部反演，残余重叠 f<sup>M</sup> = ${fmtLogHTML(l)}。死活不再是任何账本里的事实，条纹重新出现。`,
            `<b>Undo succeeded</b>: all ${copiesLabel(undoCopies())} copies reversed, residual overlap f<sup>M</sup> = ${fmtLogHTML(l)}. The fate is no longer a fact in any ledger, and fringes reappear.`)
        : L(`<b>撤销失败</b>：${copiesLabel(undoCopies())} 份副本，每份保真度 ${fmtFid(fid())}，残余重叠只有 ${fmtLogHTML(l)}。记录还在，事实还在。`,
            `<b>Undo failed</b>: ${copiesLabel(undoCopies())} copies at fidelity ${fmtFid(fid())} each leave an overlap of only ${fmtLogHTML(l)}. The records remain, and so does the fact.`));
    }
  } else if (!quiet) toast(L('时间继续：撤销快照结束，回到未撤销的历史。', 'Time moves on: the undo snapshot ends and the history without it returns.'));
  dirtyClock = true; syncOutputs();
  if (S.sel >= 0) selectRun(S.sel);
}
$('undoBtn').addEventListener('click', () => { setUndo(!S.undo); clearPreset(); syncOutputs(); });

function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  setUndo(false, true);
  S.coupling = p.coupling; S.dtV = dtV(p.dt); S.dark = p.dark; S.open = p.open; S.mIdx = p.m; S.overlap = p.c; S.fidV = fidV(p.f);
  $('dt').value = S.dtV; $('dark').value = S.dark; $('open').value = S.open; $('copies').value = S.mIdx; $('overlap').value = S.overlap; $('fid').value = S.fidV;
  if (p.ledger !== undefined) S.ledger = p.ledger;
  S.preset = name;
  document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === name)));
  markArchive(); dirtyClock = true;
  selectRun(-1);
  if (p.undoAt !== undefined) {
    resampleArchive(); dirtyArchive = false; $('pillHash').innerHTML = `ARCHIVE <strong>${archiveHash}</strong>`;
    S.nowFrac = p.undoAt / T_BOX; $('now').value = S.nowFrac;
    setUndo(true);
  } else if (!reduceMotion) { S.nowFrac = 0; S.dir = 1; S.playing = true; setPlayUI(); }
  syncOutputs(); glitch();
}
document.querySelectorAll('.preset').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));

function releaseUndo() { if (S.undo) setUndo(false); }
$('now').addEventListener('input', () => { releaseUndo(); S.nowFrac = parseFloat($('now').value); S.hold = 0; });
let scrubbing = false;
$('now').addEventListener('pointerdown', () => { scrubbing = true; });
window.addEventListener('pointerup', () => { scrubbing = false; });
window.addEventListener('pointercancel', () => { scrubbing = false; });
function setPlayUI() { $('play').textContent = S.playing ? '❚❚' : '▶'; $('play').setAttribute('aria-pressed', String(S.playing)); $('rev').setAttribute('aria-pressed', String(S.dir < 0)); }
$('play').addEventListener('click', () => { S.playing = !S.playing; S.hold = 0; if (S.playing) releaseUndo(); setPlayUI(); });
$('rev').addEventListener('click', () => { S.dir = -S.dir; S.playing = true; S.hold = 0; releaseUndo(); setPlayUI(); });
document.querySelectorAll('#speedChips .chip').forEach((b) => b.addEventListener('click', () => {
  S.speed = parseFloat(b.dataset.speed);
  document.querySelectorAll('#speedChips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
}));
const drawer = TRV.drawer({ drawer: $('drawer'), open: $('infoBtn'), close: $('drawerClose') });
document.addEventListener('keydown', (ev) => {
  if (ev.target && (ev.target.tagName === 'INPUT' && ev.target.type !== 'range')) return;
  if (drawer.isOpen()) return;
  if (ev.key === 'Escape') { selectRun(-1); return; }
  if (ev.key === ' ' && !(ev.target && ev.target.tagName === 'BUTTON')) { ev.preventDefault(); S.playing = !S.playing; S.hold = 0; if (S.playing) releaseUndo(); setPlayUI(); }
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) {
    ev.preventDefault(); releaseUndo(); S.playing = false; setPlayUI();
    S.nowFrac = Math.min(1, Math.max(0, S.nowFrac + (ev.key === 'ArrowRight' ? 1 : -1) * 0.5 / T_BOX));
    $('now').value = S.nowFrac;
  }
  else if (/^[1-3]$/.test(ev.key)) setFocus(+ev.key - 1);
  else if (ev.key === 'l' || ev.key === 'L') setLedger(1 - S.ledger);
});

let cardKey = '';
function cardState(i) { return i < 0 ? 'none' : `${i}|${RUN.status[i]}|${S.ledger}|${S.mode}|${S.undo}|${viewT() >= S.open}`; }
function selectRun(i) {
  S.sel = i;
  cardKey = cardState(i);
  const card = $('runcard');
  if (i < 0) { card.innerHTML = L('点击一条世界线或档案直方图，选出一只猫：它的整段历史会跨越不同时刻一起高亮。', 'Click a worldline or the archive histogram to pick one cat: its whole history lights up across different moments.'); return; }
  const st = RUN.status[i], dead = DR[i] > 0, t = viewT(), block = blockView(), seen = (tm) => block || tm <= t + 1e-9;
  const inside = dead && seen(DT[i])
    ? L(`盒内：第 ${DR[i]} 次检查时计数器响，<b>死于 ${DT[i].toFixed(1)} min</b>`, `inside: the counter clicked at check ${DR[i]}, <b>died at ${DT[i].toFixed(1)} min</b>`)
    : (!dead && seen(T_BOX) ? L('盒内：到 60 min 仍活着', 'inside: still alive at 60 min') : L('盒内：到此刻仍活着（之后的记录还没写下）', 'inside: alive so far (later records are not written yet)'));
  const outside = st === 'unknown'
    ? L('盒外：<b>还没开箱</b>，这本账上没有这只猫的死活', 'outside: <b>box not opened yet</b>, this ledger holds no fate for this cat')
    : (dead && DT[i] <= S.open + 1e-9
      ? L(`盒外：开箱时（${S.open.toFixed(1)} min）读到死亡`, `outside: death read at the opening (${S.open.toFixed(1)} min)`)
      : (dead && seen(DT[i])
        ? L(`盒外：开箱后亲眼看到它死于 ${DT[i].toFixed(1)} min`, `outside: seen dying after the opening, at ${DT[i].toFixed(1)} min`)
        : L('盒外：开箱时读到“活着”', 'outside: read “alive” at the opening')));
  const undoLine = S.undo && dead && DT[i] <= S.undoAt
    ? '<br>' + L(`已撤销：这条记录被相干反演，残余事实强度 D = ${dOfLog(undoLog10()).toFixed(3)}`, `undone: this record was coherently reversed; remaining fact strength D = ${dOfLog(undoLog10()).toFixed(3)}`)
    : '';
  const shown = S.ledger === 1 ? outside : inside;
  card.innerHTML = `CAT <b>#${String(i).padStart(3, '0')}</b> · ${shown}<br>${S.ledger === 1 ? inside : outside}${undoLine}`;
}

/* =====================================================================
   13. Main loop
   ===================================================================== */
let lastT = performance.now(), prevT = nowT(), tAcc = 0, panelTick = 0, frameCount = 0;
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
  if (dirtyArchive) { resampleArchive(); dirtyArchive = false; dirtyClock = true; $('pillHash').innerHTML = `ARCHIVE <strong>${archiveHash}</strong>`; syncOutputs(); if (S.sel >= 0) selectRun(S.sel); }
  if (dirtyClock) { buildClock(); dirtyClock = false; dirtyFrame = true; syncOutputs(); }
  if (S.clockMix < 1) { S.clockMix = Math.min(1, S.clockMix + dtSec / 0.9); dirtyFrame = true; if (S.clockMix >= 1) S.clockFrom = S.clock; }
  if (S.playing && !scrubbing) {
    if (S.hold > 0) { S.hold -= dtSec; if (S.hold <= 0) S.nowFrac = S.dir > 0 ? 0 : 1; }
    else {
      S.nowFrac += S.dir * dtSec * S.speed / 24;
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 1.4; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.4; }
    }
    $('now').value = S.nowFrac;
  }
  const t = viewT();
  if (!S.undo && S.ledger === 1 && S.mode === 0 && prevT < S.open && t >= S.open && t > prevT) {
    toast(L(`<b>开箱</b>：盒外账本一次读入 ${N_RUNS} 只盒子，其中 ${deathsBy(S.open)} 条死亡早已写在盒内。档案一个字节也没变，变的只是这本账上有了什么。`,
      `<b>Opened</b>: the outside ledger reads all ${N_RUNS} boxes at once; ${deathsBy(S.open)} of the deaths were written inside long before. Not a byte of the archive changed, only what this ledger holds.`));
  }
  if (!(Math.abs(t - syncedT) <= 1e-9) && (panelTick % 3 === 0 || !S.playing)) syncOutputs();
  prevT = t;
  runLayout(dtSec);
  if (dirtyFrame || S.split > 0) { buildFrame(Math.max(0.15, centerOpacity)); dirtyFrame = false; }
  if (S.sel >= 0 && cardState(S.sel) !== cardKey) selectRun(S.sel);
  $('tau').innerHTML = `t ${t.toFixed(1)} <small>/ 60 min</small>`;
  const ledgerName = S.ledger === 1 ? L('盒外账本', 'outside ledger') : L('盒内账本', 'inside ledger');
  $('hudBig').textContent = `${blockView() ? 'BLOCK' : 'LINEAR'} · ${S.ledger === 1 ? 'OUT' : 'IN'} · t = ${t.toFixed(1)} min${S.undo ? ' · UNDO' : ''}`;
  const focusName = [L('Σ 全部', 'Σ all'), L('活着的时空', 'the alive spacetime'), L('死亡的时空', 'the dead spacetime')][S.focus];
  $('hudSub').textContent = `${ledgerName} · ${focusName} · ${blockView() ? L('用整块历史条件化', 'conditioned on the whole block') : L('只用账上已有的记录', 'only records already in the ledger')}`
    + `${S.clock === 1 ? L(' · 账本钟', ' · ledger clock') : ''}${S.undo ? L(' · 撤销快照：之后的新历史未模拟', ' · undo snapshot: the new history after it is not simulated') : ''}`;
  if (glOK) {
    updateCamera(dtSec);
    updateGL(tAcc);
    renderer.render(scene, camera);
    updateTags();
  }
  panelTick++;
  drawSurv(); drawHist();
  if (panelTick % 2 === 0) { drawGauge(); drawProbe(); }
  refreshReadouts(t);
  requestAnimationFrame(frame);
}

/* per-frame readouts: rewritten only when their content changes */
const shown = {};
function setIfChanged(id, html) { if (shown[id] !== html) { shown[id] = html; $(id).innerHTML = html; } }
function refreshReadouts(t) {
  setIfChanged('roS', survivalAt(t).toFixed(3));
  setIfChanged('roChecks', String(Math.min(nMax(), roundsBy(t))));
  setIfChanged('roIn', String(deathsBy(t)));
  setIfChanged('roOut', String(t >= S.open ? deathsBy(t) : 0));
  setIfChanged('branchTable', branchTableHTML());
}

TRV.onLang(() => { labelStaticTags(); buildBranchUI(); buildBranchTable(); syncOutputs(); selectRun(S.sel); });

/* read-only probe for automated browser tests */
window.CAT_DEBUG = {
  /* true while a control change is waiting for the next frame to recompute the archive, the clock, the frame or the notes */
  pending: () => dirtyArchive || dirtyClock || dirtyFrame || S.clockMix < 1 || !(Math.abs(viewT() - syncedT) <= 1e-9),
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  archive: () => ({ t: Array.from(DT), n: Array.from(DR), hash: archiveHash }),
  law: (N) => { let sum = 0; for (let n = 1; n <= N; n++) sum += pFirst(n); return { sum, survival: survivalRound(N), total: sum + survivalRound(N), a: checkFactor(), dt: dt(), nMax: nMax() }; },
  survival: (t) => survivalAt(t),
  unmonitored: (t) => unmonitored(t),
  coherence: () => { const l = kappaLog10(), t = viewT(); return { log10: l, V: pow10(l), D: dOfLog(l), outsideLog10: outsideLog10(t), Vt: probeVisibility(t), fact: factStrength(S.ledger, t) }; },
  ledger: () => { const t = viewT(); let a = 0, d = 0, u = 0; for (let r = 0; r < N_RUNS; r++) { const st = statusOf(r); if (st === 'alive') a++; else if (st === 'dead') d++; else u++; } return { alive: a, dead: d, unknown: u, inside: deathsBy(t), outside: t >= S.open ? deathsBy(t) : 0, clockTotal: CLK.tot, empty: ledgerEmpty() }; },
  y: (t) => yOf(t),
  project: (i) => { if (!glOK) return null; const p = projectToStage(new THREE.Vector3(RUN.pickP[3 * i], RUN.pickP[3 * i + 1], RUN.pickP[3 * i + 2])); return { x: p.x, y: p.y, visible: RUN.pickV[i] }; },
  run: (i) => ({ status: RUN.status[i], px: RUN.px[i], pz: RUN.pz[i], focusA: RUN.focusA[i] })
};

/* cover state for scripts/thumbs.mjs: the outside ledger after an early opening, unfolded into alive and dead blocks */
window.TRV_THUMB = () => {
  applyPreset('early'); setMode(1);
  S.split = 0.85; $('split').value = S.split; S.playing = false; setPlayUI();
  S.nowFrac = 0.42; $('now').value = S.nowFrac; syncOutputs();
};

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
buildBranchUI();
applyPreset('classic');
S.nowFrac = 0.35; S.playing = !reduceMotion; $('now').value = S.nowFrac;
setPlayUI(); syncOutputs(); selectRun(-1);
prevT = nowT();
requestAnimationFrame(frame);
})();
