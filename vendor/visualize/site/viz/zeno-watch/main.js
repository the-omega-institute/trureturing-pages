/* ZENO//WATCH · 量子芝诺效应 · 被盯住的跃迁
   Three faces of one fact: a refresh is a physical interaction.
   FREEZE  H = (ħΩ/2)X with N refreshes in time T; each refresh leaves records of overlap η, so the Bloch (y, z) map per step is
           [[η cos Ωδ, −η sin Ωδ], [sin Ωδ, cos Ωδ]] (theory §222, §225). Ideal projections give z_N = cos^N(Ωδ); with
           η = e^{−γδ} the N → ∞ limit is z̈ + γż + Ω²z = 0.
   DRAG    no Hamiltonian; projections onto cos(jΘ/N)|0⟩ + sin(jΘ/N)|1⟩, all followed with probability cos^{2N}(Θ/N) (§227).
   ANTI    an unstable level against a Lorentzian bath, Γ(τ) = 2π∫J F_τ in closed form (weak-coupling leading order, §228).
   Theory: trureturing docs/develop/theory/QUANTUM-REALITY.md §221–§230, CONE_PROGRAM_FORMAL.md §5.4. The theory volume states that
   these Zeno results were not compiled in Lean; frozen anchors are named in the page text.
   Depends on: assets/vendor/three.r128.min.js (window.THREE), assets/shell.js (window.TRV). */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const N_MAX = 256, G_ANTI = 0.02, LAMBDA = 1, R_SPH = 1.25, TRAIL_LEN = 2.6;
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { mulberry32, fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, sigma: SG, ok: OK, cyan: CY, magenta: MG } = TRV.palette;
const DEG = Math.PI / 180;
const RUN_SECONDS = 14;

/* =====================================================================
   2. State and presets
   ===================================================================== */
const S = {
  mode: 'freeze', N: 64, span: 1, scale: 'eta', eta: 0, gamma: 8, target: 90, a: 6, logTau: -0.4, run: 0,
  nowFrac: 0.3, playing: true, dir: 1, speed: 1, hold: 0, preset: 'itano'
};
const BASE = { mode: 'freeze', N: 64, span: 1, scale: 'eta', eta: 0, gamma: 8, target: 90, a: 6, logTau: -0.4 };
const PRESETS = {
  free: { ...BASE, N: 0,
    zh: '不去看它。Rabi 驱动在 T = π/Ω 内把 |0⟩ 完整翻到 |1⟩：布洛赫矢量沿大圆从北极走到南极，跃迁概率 sin²(ΩT/2) = 1。',
    en: 'Nobody looks. The Rabi drive turns |0⟩ fully into |1⟩ within T = π/Ω: the Bloch vector runs along a great circle from the north pole to the south pole, and the transition probability is sin²(ΩT/2) = 1.' },
  few: { ...BASE, N: 4,
    zh: '在这段时间里看 4 次。每次只有 sin²(π/8) ≈ 15% 的机会被发现已经离开；系综最终处于 |1⟩ 的概率从 1 降到 0.375。',
    en: 'Look 4 times during the same interval. Each look finds a departure only sin²(π/8) ≈ 15% of the time; the ensemble’s final probability of |1⟩ drops from 1 to 0.375.' },
  itano: { ...BASE, N: 64,
    zh: 'Itano 等人 1990 年的协议：π 脉冲期间测 64 次。理论预言跃迁概率 (1 − cos⁶⁴(π/64))/2 ≈ 0.037；每次都还在 |0⟩ 的概率约 0.96。翻转几乎被冻结。',
    en: 'The protocol of Itano et al. (1990): 64 measurements during a π pulse. The predicted transition probability is (1 − cos⁶⁴(π/64))/2 ≈ 0.037, and the chance of finding |0⟩ every time is about 0.96. The flip is almost frozen.' },
  weak: { ...BASE, N: 32, eta: 0.6,
    zh: '每次刷新只留下不完全的记录（重叠 η = 0.6）：相干每次只乘以 0.6，而不是清零。冻结变弱，系综最终有约 0.23 的概率处于 |1⟩（理想投影时只有 0.072）。单次运行画成随机相位踢——同一个通道，却不留下可读结果。',
    en: 'Each refresh leaves only an incomplete record (overlap η = 0.6): the coherence is multiplied by 0.6 each time instead of being wiped out. The freeze weakens, and the ensemble ends in |1⟩ with probability about 0.23 (only 0.072 with ideal projections). The single run is drawn as random phase kicks: the same channel, with no readable outcome.' },
  rate: { ...BASE, N: 128, scale: 'gamma', gamma: 8, span: 3,
    zh: '每次刷新的强度随间隔一起变小（η = e^{−γδ}，γ = 8Ω）。刷新再密，过程也收敛到连续弱测量 z̈ + γż + Ω²z = 0：跃迁以约 Ω²/γ 的速率慢慢发生，并没有冻结。',
    en: 'Each refresh weakens together with the interval (η = e^{−γδ}, γ = 8Ω). However dense the refreshes, the process converges to continuous weak measurement z̈ + γż + Ω²z = 0: the transition creeps along at a rate of about Ω²/γ and is not frozen.' },
  drag: { ...BASE, mode: 'drag', N: 16, target: 90,
    zh: '没有任何哈密顿量。测量方向分 16 步从 |0⟩ 转到 |1⟩，每步检查态是否跟上。全部跟上的概率 cos³²(π/32) ≈ 0.86：测量路径本身就能把态拖到正交的位置。',
    en: 'No Hamiltonian at all. The measurement direction turns from |0⟩ to |1⟩ in 16 steps, checking each time whether the state followed. It follows every time with probability cos³²(π/32) ≈ 0.86: the measurement path alone can drag the state to an orthogonal position.' },
  anti: { ...BASE, mode: 'anti', a: 6, logTau: -0.4,
    zh: '不稳定能级向环境衰变，环境谱峰偏离能级 6 个谱宽。每隔 τ ≈ 0.4/Λ 测一次，测量把滤波展宽到谱峰上，衰变率是不看时的约 4.2 倍——越看越快，这是反芝诺效应。',
    en: 'An unstable level decays into an environment whose spectral peak sits 6 widths away from the level. Measuring every τ ≈ 0.4/Λ widens the filter onto the peak, and the decay rate is about 4.2 times the unwatched one: watching speeds it up. This is the anti-Zeno effect.' },
  decay: { ...BASE, mode: 'anti', a: 0, logTau: -1.3,
    zh: '同样的不稳定能级，但谱峰正对能级。每隔 τ = 0.05/Λ 测一次，滤波太宽、大部分落在谱外，衰变率降到不看时的约 2.5%：衰变被拖慢，这是芝诺效应。',
    en: 'The same unstable level, but with the spectral peak right on it. Measuring every τ = 0.05/Λ makes the filter so wide that most of it misses the spectrum, and the decay rate falls to about 2.5% of the unwatched one: the decay is slowed down. This is the Zeno effect.' }
};

/* =====================================================================
   3. The laws
   ===================================================================== */
const h2nat = (q) => (q <= 0 || q >= 1 ? 0 : -q * Math.log(q) - (1 - q) * Math.log(1 - q));
/* FREEZE */
const spanT = () => S.span * Math.PI;                           // total time, Ω = 1
const nLooks = () => S.N;
const delta = () => (S.N > 0 ? spanT() / S.N : spanT());
const etaStep = () => (S.scale === 'eta' ? S.eta : Math.exp(-S.gamma * delta()));
const flipProb = () => Math.sin(delta() / 2) ** 2;              // q = sin²(Ωδ/2)
const projective = () => S.N > 0 && etaStep() === 0;
function zContinuum(t, g = S.gamma) {                          // z̈ + γż + z = 0, z(0) = 1, ż(0) = 0
  const D = g * g - 4;
  if (Math.abs(D) < 1e-12) return Math.exp(-t) * (1 + t);
  if (D > 0) { const sq = Math.sqrt(D), r1 = (-g + sq) / 2, r2 = (-g - sq) / 2; return (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1); }
  const w = Math.sqrt(-D) / 2; return Math.exp(-g * t / 2) * (Math.cos(w * t) + g / (2 * w) * Math.sin(w * t));
}
const slowRate = (g = S.gamma) => (g > 2 ? (g - Math.sqrt(g * g - 4)) / 2 : null);   // −λ_slow, ≈ Ω²/γ for γ ≫ Ω
/* the ensemble Bloch vector after each refresh, and P₁(T) for any N (used by the scaling plot) */
function ensembleTrack(N = S.N, eta = etaStep(), span = spanT()) {
  const d = N > 0 ? span / N : span, c = Math.cos(d), s = Math.sin(d), out = [[0, 0, 1]];
  let x = 0, y = 0, z = 1;
  for (let k = 1; k <= N; k++) { const y1 = c * y - s * z, z1 = s * y + c * z; x *= eta; y = eta * y1; z = z1; out.push([x, y, z]); }
  return out;
}
function p1End(N, scale = S.scale) {
  if (N === 0) return Math.sin(spanT() / 2) ** 2;
  const eta = scale === 'eta' ? S.eta : Math.exp(-S.gamma * spanT() / N);
  const tr = ensembleTrack(N, eta); return (1 - tr[N][2]) / 2;
}
/* DRAG */
const dragSteps = () => Math.max(1, S.N);
const thetaH = () => S.target * DEG;                             // Hilbert-space target angle
const pFollow = (N = dragSteps(), th = thetaH()) => Math.cos(th / N) ** (2 * N);
const pOnTarget = (N = dragSteps(), th = thetaH()) => (1 + Math.cos(2 * th / N) ** N) / 2;
/* ANTI: Lorentzian bath, k = Λ + ia, Γ(τ) = 2G Re[(1/k)(1 − (1 − e^{−kτ})/(kτ))] */
const tau = () => 10 ** S.logTau;
const gammaGR = (a = S.a) => 2 * G_ANTI * LAMBDA / (LAMBDA * LAMBDA + a * a);
function gammaTau(tt = tau(), a = S.a) {
  const kr = LAMBDA, ki = a, kk = kr * kr + ki * ki;
  const er = Math.exp(-kr * tt) * Math.cos(-ki * tt), ei = Math.exp(-kr * tt) * Math.sin(-ki * tt);   // e^{−kτ}
  const nr = 1 - er, ni = -ei;                                                                         // 1 − e^{−kτ}
  // (1 − e^{−kτ})/(kτ) = (nr + i ni)(kr − i ki)/(kk τ)
  const fr = (nr * kr + ni * ki) / (kk * tt), fi = (ni * kr - nr * ki) / (kk * tt);
  const br = 1 - fr, bi = -fi;                                                                         // 1 − f
  const re = (br * kr + bi * ki) / kk;                                                                 // Re[(1/k)(1 − f)]
  return 2 * G_ANTI * re;
}
const ratio = (tt = tau(), a = S.a) => gammaTau(tt, a) / gammaGR(a);
const antiWindow = () => 3 / gammaGR();
const lorentz = (w, a = S.a) => G_ANTI / Math.PI * LAMBDA / ((w - a) ** 2 + LAMBDA * LAMBDA);    // J(ω), ω measured from ω₀
const filter = (w, tt = tau()) => { const u = w * tt / 2; return tt / (2 * Math.PI) * (Math.abs(u) < 1e-9 ? 1 : (Math.sin(u) / u) ** 2); };
function regime(r) { if (r > 1.02) return 'anti'; if (r < 0.98) return 'zeno'; return 'neutral'; }

/* =====================================================================
   4. This run (fixed seeds; R draws a new run)
   ===================================================================== */
let U = new Float64Array(N_MAX + 1), U_DECAY = 0.5;
function reseed() { const r = mulberry32(0x2E40C0 + S.run * 7919); for (let k = 0; k <= N_MAX; k++) U[k] = r(); U_DECAY = r(); }
reseed();
const RUN = { ens: [], single: [], kicks: [], outcomes: [], hash: '--------' };
function fnv(bytes) { let h = 0x811c9dc5; for (const v of bytes) { h ^= v & 0xff; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
let dirtyRun = true;
function resampleRun() {
  if (S.mode === 'freeze') {
    const N = S.N, eta = etaStep(), d = delta(), c = Math.cos(d), s = Math.sin(d), q = flipProb();
    RUN.ens = ensembleTrack(N, eta);
    const single = [[0, 0, 1]], kicks = [], outcomes = [];
    let b = [0, 0, 1];
    for (let k = 1; k <= N; k++) {
      if (eta === 0) {                                              // projective: jump to the pole that was found
        const stay = U[k] >= q, pole = stay ? b[2] : -b[2];
        b = [0, 0, pole]; outcomes.push(pole > 0 ? 0 : 1);
      } else {                                                      // random phase kick with probability (1 − η)/2
        const y1 = c * b[1] - s * b[2], z1 = s * b[1] + c * b[2], kick = U[k] < (1 - eta) / 2;
        b = kick ? [-b[0], -y1, z1] : [b[0], y1, z1]; kicks.push(kick ? 1 : 0); outcomes.push(kick ? 2 : 3);
      }
      single.push(b);
    }
    Object.assign(RUN, { single, kicks, outcomes });
  } else if (S.mode === 'drag') {
    const N = dragSteps(), th = thetaH() / N, pc = Math.cos(th) ** 2, out = [1];
    let sgn = 1;
    for (let j = 1; j <= N; j++) { const pPlus = sgn > 0 ? pc : 1 - pc; sgn = U[j] < pPlus ? 1 : -1; out.push(sgn); }
    RUN.outcomes = out.slice(1).map((v) => (v > 0 ? 0 : 1)); RUN.signs = out;
  } else {
    const gw = gammaTau(), gu = gammaGR(), tt = tau();
    const tw = -Math.log(Math.max(1e-300, U_DECAY)) / gw;
    RUN.decayWatched = Math.ceil(tw / tt - 1e-12) * tt;            // found at the first measurement after the decay
    RUN.decayUnwatched = -Math.log(Math.max(1e-300, U_DECAY)) / gu;
    RUN.outcomes = [];
  }
  RUN.hash = fnv([S.run & 0xff, ...RUN.outcomes.slice(0, N_MAX), Math.round((RUN.decayWatched || 0) * 10) & 0xff]);
}
/* time handling: FREEZE in units of 1/Ω, DRAG in steps, ANTI in units of 1/Λ */
const tEnd = () => (S.mode === 'freeze' ? spanT() : S.mode === 'drag' ? dragSteps() : antiWindow());
const tNow = () => S.nowFrac * tEnd();
const rotX = (b, ang) => [b[0], Math.cos(ang) * b[1] - Math.sin(ang) * b[2], Math.sin(ang) * b[1] + Math.cos(ang) * b[2]];
function freezeAt(track, t) {                                     // Bloch vector of a stepwise track at time t
  const N = S.N, d = delta();
  if (N === 0) return rotX([0, 0, 1], t);
  const k = Math.min(N, Math.max(0, Math.floor(t / d + 1e-9)));
  return rotX(track[k], t - k * d);
}
const refreshesDone = (t = tNow()) => (S.mode === 'freeze' ? (S.N ? Math.min(S.N, Math.floor(t / delta() + 1e-9)) : 0) : S.mode === 'drag' ? Math.min(dragSteps(), Math.floor(t + 1e-9)) : Math.floor(t / tau() + 1e-9));
const dragAxis = (u) => { const ang = 2 * thetaH() * u / dragSteps(); return [Math.sin(ang), 0, Math.cos(ang)]; };   // Bloch axis after u steps
function dragStateAt(t) {                                          // single run: the state sits where the last measurement put it
  const j = Math.min(dragSteps(), Math.floor(t + 1e-9)), n = dragAxis(j), sgn = RUN.signs ? RUN.signs[j] : 1;
  return n.map((v) => v * sgn);
}
function dragEnsembleAt(t) { const j = Math.min(dragSteps(), Math.floor(t + 1e-9)), f = Math.cos(2 * thetaH() / dragSteps()) ** j; return dragAxis(j).map((v) => v * f); }

/* =====================================================================
   5. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags');
const cvTL = $('timeline'), cvSC = $('scaling'), cvTape = $('tape');
const f3 = (v) => (v === null || !isFinite(v) ? '—' : v.toFixed(3));
const sci = (v) => (v === 0 ? '0' : Math.abs(v) >= 0.01 ? v.toFixed(3) : v.toExponential(2));

/* =====================================================================
   6. Three.js scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const CAMS = { iso: [0.5, 1.12, 6.0], front: [Math.PI / 2, Math.PI / 2, 5.0], top: [0.0001, 0.06, 6.0] };
const cam = { theta: 0.5, phi: 1.12, r: 6.0, tTheta: 0.5, tPhi: 1.12, tR: 6.0 };
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
    d.textContent = T('这个浏览器没有提供 WebGL，三维视图无法显示。下方的曲线、记录带和右侧读数仍然可用。', 'This browser does not provide WebGL, so the 3D view cannot be shown. The plots, the record tape and the readouts still work.');
    stage.appendChild(d); return;
  }
  glOK = true;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x02040a, 1);
  scene3 = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
  const g = new THREE.BufferGeometry(); dyn(g, 'position', 16000, 3); dyn(g, 'color', 16000, 3);
  lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, ...additive })); lines.frustumCulled = false; scene3.add(lines);
  const gp = new THREE.BufferGeometry(); dyn(gp, 'position', 12, 3); dyn(gp, 'aColor', 12, 3); dyn(gp, 'aAlpha', 12, 1); dyn(gp, 'aSize', 12, 1);
  pts = new THREE.Points(gp, new THREE.ShaderMaterial({ vertexShader: EVT_VS, fragmentShader: RING_FS, uniforms: { uScale: { value: 60 } }, ...additive }));
  pts.frustumCulled = false; scene3.add(pts);
}
const toScene = (b, r = R_SPH) => [b[0] * r, b[2] * r, -b[1] * r];   // Bloch (x, y, z) with z up and y towards the viewer
/* the ANTI waterfall: frequency across, measurement interval in depth, J·F_τ as height */
const W_SPAN = 16, X_HALF = 2.4, Z_HALF = 1.9, SLICES = 30, LT_MIN = -2, LT_MAX = 2;
const xw = (w) => X_HALF * w / W_SPAN;
const zLT = (lt) => -Z_HALF + 2 * Z_HALF * (lt - LT_MIN) / (LT_MAX - LT_MIN);
let antiCache = { key: '', peak: 1, rmax: 1 };
function antiScales() {
  const key = `${S.a}`;
  if (antiCache.key === key) return antiCache;
  let peak = 1e-12, rmax = 1;
  for (let i = 0; i < SLICES; i++) { const tt = 10 ** (LT_MIN + (LT_MAX - LT_MIN) * i / (SLICES - 1)); for (let k = 0; k <= 160; k++) { const w = -W_SPAN + 2 * W_SPAN * k / 160; peak = Math.max(peak, lorentz(w) * filter(w, tt)); } }
  for (let i = 0; i <= 200; i++) rmax = Math.max(rmax, ratio(10 ** (LT_MIN + (LT_MAX - LT_MIN) * i / 200)));
  antiCache = { key, peak, rmax }; return antiCache;
}
function updateGL(time) {
  const L = lines.geometry.attributes, Pp = L.position.array, Cc = L.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > Pp.length / 3) return; const c = col.map((x) => x * k); Pp.set(a, 3 * v); Cc.set(c, 3 * v); v++; Pp.set(b, 3 * v); Cc.set(c, 3 * v); v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= 12) return; PT.position.array.set(p, 3 * np); PT.aColor.array.set(col, 3 * np); PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  const t = tNow();
  if (S.mode !== 'anti') {
    const circle = (fn, col, k, n = 96) => { for (let i = 0; i < n; i++) seg(toScene(fn(2 * Math.PI * i / n)), toScene(fn(2 * Math.PI * (i + 1) / n)), col, k); };
    circle((a) => [Math.cos(a), Math.sin(a), 0], COL.sigma, 0.14);                                       // equator
    circle((a) => [0, Math.sin(a), Math.cos(a)], COL.sigma, S.mode === 'freeze' ? 0.42 : 0.12);          // y–z: the Rabi orbit
    circle((a) => [Math.sin(a), 0, Math.cos(a)], COL.sigma, S.mode === 'drag' ? 0.42 : 0.12);            // x–z: the drag plane
    seg(toScene([0, 0, 0]), toScene([0, 0, 1.25]), COL.cyan, 0.5); seg(toScene([0, 0, 0]), toScene([0, 0, -1.25]), COL.magenta, 0.5);
    seg(toScene([-1.15, 0, 0]), toScene([1.15, 0, 0]), COL.sigma, 0.1); seg(toScene([0, -1.15, 0]), toScene([0, 1.15, 0]), COL.sigma, 0.1);
    const arrow = (b, col, k) => seg(toScene([0, 0, 0]), toScene(b), col, k);
    if (S.mode === 'freeze') {
      // measurement axis (z) glows when a refresh has just happened
      const d = delta(), done = refreshesDone(t), since = S.N ? t - done * d : Infinity, flash = S.N && done > 0 ? Math.max(0, 1 - since / (0.5 * d)) : 0;
      seg(toScene([0, 0, -1.45]), toScene([0, 0, 1.45]), COL.amber, 0.25 + 0.7 * flash);
      const single = freezeAt(RUN.single, t), ens = freezeAt(RUN.ens, t), ghost = rotX([0, 0, 1], t);
      // history trails: the Bloch x component stays 0 here, so the past is drawn streaming off along −x (time axis).
      // Unwatched, the history is a helix; watched, it collapses into a comb of short arcs near the pole.
      const kx = TRAIL_LEN / spanT(), n = 420;
      const trail = (fn, col, k0, k1) => { let prev = null; for (let i = 0; i <= n; i++) { const tt = t * i / n, b = fn(tt), p = toScene(b); p[0] -= kx * (t - tt); if (prev) seg(prev, p, col, k0 + (k1 - k0) * i / n); prev = p; } };
      if (t > 0) { trail((tt) => rotX([0, 0, 1], tt), COL.sigma, 0.1, 0.45); trail((tt) => freezeAt(RUN.single, tt), COL.amber, 0.25, 0.95); }
      if (t > 0.02) seg(toScene([0, 0, 0]).map((v, i) => (i === 0 ? v - kx * t : v)), toScene([0, 0, 0]), COL.sigma, 0.12);
      arrow(single, COL.amber, 1); arrow(ens, COL.sigma, 0.85);
      dot(toScene(single), COL.amber, 1, 2.6); dot(toScene(ens), COL.sigma, 0.9, 2.0); dot(toScene(ghost), COL.gray, 0.55, 1.8);
      if (flash > 0) { const pole = toScene([0, 0, Math.sign(single[2]) || 1]); dot(pole, COL.amber, flash, 3 + 4 * (1 - flash)); }
    } else {
      // drag: the measurement path, the current axis and the target
      const N = dragSteps(), axis = dragAxis(Math.min(N, t)), tgt = dragAxis(N), jNow = Math.min(N, Math.floor(t + 1e-9));
      for (let i = 0; i < 64; i++) seg(toScene(dragAxis(N * i / 64), 1.02), toScene(dragAxis(N * (i + 1) / 64), 1.02), COL.cyan, 0.45);
      seg(toScene(axis.map((x) => -x * 1.4)), toScene(axis.map((x) => x * 1.4)), COL.cyan, 0.85);
      seg(toScene([0, 0, 0]), toScene(tgt.map((x) => x * 1.45)), COL.amber, 0.45);
      for (let j = 1; j <= N && N <= 64; j++) { const n2 = dragAxis(j); seg(toScene(n2.map((x) => x * 0.97)), toScene(n2.map((x) => x * 1.07)), COL.cyan, j <= Math.floor(t + 1e-9) ? 0.7 : 0.25); }
      const single = dragStateAt(t), ens = dragEnsembleAt(t);
      arrow(single, COL.amber, 1); arrow(ens, COL.sigma, 0.85);
      dot(toScene(single), RUN.signs[jNow] > 0 ? COL.amber : COL.magenta, 1, 2.6); dot(toScene(ens), COL.sigma, 0.9, 2.0);
      dot(toScene(tgt), COL.amber, 0.6, 2.2);
      const j = Math.floor(t + 1e-9), since = t - j, flash = j > 0 ? Math.max(0, 1 - since / 0.5) : 0;
      if (flash > 0) dot(toScene(single), COL.cyan, flash, 3 + 4 * (1 - flash));
    }
  } else {
    // anti-Zeno waterfall: each slice is J(ω)·F_τ(ω) for one measurement interval; its area is Γ(τ)/2π
    const sc = antiScales(), H = 1.25, cur = S.logTau;
    for (let i = 0; i < SLICES; i++) {
      const lt = LT_MIN + (LT_MAX - LT_MIN) * i / (SLICES - 1), tt = 10 ** lt, z = zLT(lt);
      let prev = null;
      for (let k = 0; k <= 120; k++) { const w = -W_SPAN + 2 * W_SPAN * k / 120, p = [xw(w), H * lorentz(w) * filter(w, tt) / sc.peak, z]; if (prev) seg(prev, p, COL.magenta, 0.28); prev = p; }
    }
    const zc = zLT(cur), tt = tau();
    let prevJ = null, prevF = null, prevP = null;
    const fmax = filter(0, tt), jmax = lorentz(S.a);
    for (let k = 0; k <= 200; k++) {
      const w = -W_SPAN + 2 * W_SPAN * k / 200, x = xw(w);
      const pj = [x, 0.9 * lorentz(w) / jmax, zc], pf = [x, 0.9 * filter(w, tt) / fmax, zc], pp = [x, H * lorentz(w) * filter(w, tt) / sc.peak, zc];
      if (prevJ) { seg(prevJ, pj, COL.amber, 0.9); seg(prevF, pf, COL.cyan, 0.75); seg(prevP, pp, COL.magenta, 1); }
      if (k % 2 === 0) seg([x, 0, zc], pp, COL.magenta, 0.35);
      prevJ = pj; prevF = pf; prevP = pp;
    }
    // frame: frequency axis, the level ω₀, the peak ω_c, and the Γ(τ)/Γ_GR wall
    seg([-X_HALF, 0, Z_HALF + 0.15], [X_HALF, 0, Z_HALF + 0.15], COL.sigma, 0.3); seg([-X_HALF, 0, -Z_HALF - 0.15], [-X_HALF, 0, Z_HALF + 0.15], COL.sigma, 0.2);
    seg([0, 0, -Z_HALF - 0.15], [0, 0, Z_HALF + 0.15], COL.cyan, 0.4); seg([xw(S.a), 0, -Z_HALF - 0.15], [xw(S.a), 0, Z_HALF + 0.15], COL.amber, 0.4);
    const XW = X_HALF + 0.35, rs = 1.5 / Math.max(1.5, sc.rmax);
    seg([XW, rs, -Z_HALF], [XW, rs, Z_HALF], COL.sigma, 0.4);                                             // Γ = Γ_GR reference
    let prevR = null;
    for (let i = 0; i <= 120; i++) { const lt = LT_MIN + (LT_MAX - LT_MIN) * i / 120, r = ratio(10 ** lt), p = [XW, rs * r, zLT(lt)]; if (prevR) seg(prevR, p, r > 1 ? COL.magenta : COL.cyan, 0.9); prevR = p; }
    seg([XW, 0, zc], [XW, rs * ratio(tt), zc], COL.amber, 0.8);
    seg([-X_HALF, 0, zc], [X_HALF, 0, zc], COL.amber, 0.35);
    dot([XW, rs * ratio(tt), zc], ratio(tt) > 1 ? COL.magenta : COL.cyan, 1, 2.4);
  }
  lines.geometry.setDrawRange(0, v);
  L.position.needsUpdate = true; L.color.needsUpdate = true;
  for (let i = np; i < 12; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 58 * renderer.getPixelRatio();
}

/* =====================================================================
   7. Camera
   ===================================================================== */
const camTarget = () => (S.mode === 'anti' ? [0.45, 0.35, 0] : S.mode === 'freeze' ? [-0.6, 0.1, 0] : [0, 0, 0]);
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), [tx, ty, tz] = camTarget(), r = cam.r * (camera.aspect < 1.2 ? (S.mode === 'anti' ? 1.75 : 1.35) : 1);   // step back on portrait stages
  camera.position.set(tx + r * sp * Math.sin(cam.theta), ty + r * Math.cos(cam.phi), tz + r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(tx, ty, tz);
}
function camPreset(name) {
  if (name === 'front') return S.mode === 'freeze' ? [Math.PI / 2, Math.PI / 2, 4.6] : S.mode === 'drag' ? [0.0001, Math.PI / 2, 4.6] : [0.0001, 1.25, 6.6];
  if (S.mode === 'anti') return name === 'top' ? [0.0001, 0.08, 7.6] : [0.62, 1.02, 8.3];
  return CAMS[name];
}
let camName = 'iso';
function setCamPreset(name) {
  const p = camPreset(name); if (!p) return; camName = name;
  let d = (p[0] - cam.theta) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  cam.tTheta = cam.theta + d; cam.tPhi = p[1]; cam.tR = p[2];
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === name)));
}
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
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(14, Math.max(2.2, cam.tR * drag.pinch / d)); drag.pinch = d; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY;
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => { drag.pts.delete(ev.pointerId); if (!drag.pts.size) drag.pinch = 0; };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(14, Math.max(2.2, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   8. Tags
   ===================================================================== */
function mkTag(cls) { const el = document.createElement('div'); el.className = 'tag ' + cls; tagsBox.appendChild(el); return el; }
const tag0 = mkTag('cy'), tag1 = mkTag('mg'), tagAxis = mkTag('hot'), tagTarget = mkTag('hot'), tagOrbit = mkTag(''), tagPast = mkTag('');
const tagW0 = mkTag('cy raw'), tagWc = mkTag('hot raw'), tagWall = mkTag('raw'), tagSlice = mkTag('hot raw');
function labelStaticTags() {
  tag0.textContent = '|0⟩'; tag1.textContent = '|1⟩';
  tagAxis.textContent = T('测量轴', 'MEASUREMENT AXIS'); tagTarget.textContent = T('目标', 'TARGET'); tagOrbit.textContent = T('不看时的轨道', 'UNWATCHED ORBIT'); tagPast.textContent = T('← 过去（尾迹沿时间铺开）', '← PAST (TRAIL LAID OUT IN TIME)');
  tagW0.textContent = T('能级 ω₀', 'LEVEL ω₀'); tagWc.textContent = T('谱峰 ω_c', 'SPECTRAL PEAK ω_c'); tagWall.textContent = 'Γ(τ)/Γ_GR'; tagSlice.textContent = T('此刻的 τ', 'CURRENT τ');
}
labelStaticTags();
function placeTag(el, p, show = true) {
  if (!glOK || !show) { el.style.display = 'none'; return; }
  const q = new THREE.Vector3(p[0], p[1], p[2]).project(camera), rect = stage.getBoundingClientRect();
  if (q.z > 1 || q.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.style.left = (q.x * 0.5 + 0.5) * rect.width + 'px'; el.style.top = (-q.y * 0.5 + 0.5) * rect.height + 'px';
}
function updateTags() {
  const bl = S.mode !== 'anti';
  placeTag(tag0, toScene([0, 0, 1.38]), bl); placeTag(tag1, toScene([0, 0, -1.5]), bl && !(S.mode === 'drag' && S.target >= 80));
  placeTag(tagOrbit, toScene([0, 0.97, -0.25], 1.25), S.mode === 'freeze');
  placeTag(tagPast, [-TRAIL_LEN / spanT() * tNow() + 0.2, R_SPH - 0.3, 0], S.mode === 'freeze' && tNow() > spanT() * 0.25);
  const N = dragSteps(), u = Math.min(N, Math.floor(tNow() + 1e-9) + 1);
  placeTag(tagAxis, S.mode === 'freeze' ? toScene([0, 0, 1.62]) : toScene(dragAxis(Math.min(N, u)).map((x) => x * 1.55)), bl && S.mode === 'drag');
  placeTag(tagTarget, toScene(dragAxis(N).map((x) => x * 1.6)), S.mode === 'drag');
  const an = S.mode === 'anti';
  placeTag(tagW0, [0, -0.12, Z_HALF + 0.35], an); placeTag(tagWc, [xw(S.a), 1.0, -Z_HALF - 0.2], an);
  placeTag(tagWall, [X_HALF + 0.35, 1.75, -Z_HALF], an); placeTag(tagSlice, [-X_HALF - 0.1, 0.25, zLT(S.logTau)], an);
}

/* =====================================================================
   9. 2D panels
   ===================================================================== */
function frame2d(cv) {
  const dpr = fitCanvas(cv), ctx = cv.getContext('2d'), W = cv.width, Hh = cv.height;
  ctx.clearRect(0, 0, W, Hh);
  const pl = 40 * dpr, pr = 12 * dpr, pt = 10 * dpr, pb = 22 * dpr;
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
function curve(F, n, fx, fy, col, w = 2, dash = null) {
  const { ctx, dpr } = F; ctx.strokeStyle = col; ctx.lineWidth = w * dpr; ctx.setLineDash(dash ? dash.map((d) => d * dpr) : []);
  ctx.beginPath(); for (let i = 0; i <= n; i++) { const x = fx(i), y = fy(i); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); ctx.setLineDash([]);
}
function legend(F, items, x0, y0) {
  const { ctx, dpr } = F; ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const w = Math.max(...items.map(([t]) => ctx.measureText(t).width)) + 22 * dpr;
  ctx.fillStyle = 'rgba(2, 6, 12, 0.78)'; ctx.fillRect(x0 - 4 * dpr, y0 - 3 * dpr, w + 6 * dpr, items.length * 13 * dpr + 4 * dpr);
  items.forEach(([t, c, dash], k) => { ctx.strokeStyle = c; ctx.lineWidth = 2 * dpr; ctx.setLineDash(dash ? [4 * dpr, 3 * dpr] : []); ctx.beginPath(); ctx.moveTo(x0, y0 + k * 13 * dpr + 6 * dpr); ctx.lineTo(x0 + 14 * dpr, y0 + k * 13 * dpr + 6 * dpr); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = INK; ctx.fillText(t, x0 + 18 * dpr, y0 + k * 13 * dpr); });
}
function xTicks(F, ticks, X, fmt) {
  const { ctx, dpr, pt, ih } = F; ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of ticks) ctx.fillText(fmt(v), X(v), pt + ih + 3 * dpr);
}
function nowLine(F, x) { const { ctx, dpr, pt, ih } = F; ctx.strokeStyle = AM; ctx.lineWidth = 1.2 * dpr; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + ih); ctx.stroke(); ctx.globalAlpha = 1; }
function drawTimeline() {
  const F = frame2d(cvTL); if (F.iw < 40 || F.ih < 30) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, t = tNow(), Tt = tEnd();
  const X = (v) => pl + v / Tt * iw, Y = (p) => pt + ih - p * ih;
  if (S.mode === 'freeze') {
    $('tlTitle').innerHTML = T('处于 |1⟩ 的概率 P<sub>1</sub>(t)', 'PROBABILITY OF |1⟩ · P<sub>1</sub>(t)');
    gridY(F, [0, 0.5, 1], (y) => y.toFixed(1));
    xTicks(F, [0, Tt / 2, Tt], X, (v) => `${(v / Math.PI).toFixed(2)}π`);
    const n = 400;
    curve(F, n, (i) => X(Tt * i / n), (i) => Y(Math.sin(Tt * i / n / 2) ** 2), DIM, 1.4, [4, 3]);
    if (S.scale === 'gamma') curve(F, n, (i) => X(Tt * i / n), (i) => Y((1 - zContinuum(Tt * i / n)) / 2), AM, 1.4, [2, 3]);
    curve(F, n, (i) => X(Tt * i / n), (i) => Y((1 - freezeAt(RUN.ens, Tt * i / n)[2]) / 2), CY, 2);
    const m = Math.max(1, Math.round(t / Tt * n));
    curve(F, m, (i) => X(t * i / m), (i) => Y((1 - freezeAt(RUN.single, t * i / m)[2]) / 2), MG, 1.2);
    if (S.N && S.N <= 128) { ctx.fillStyle = AM; for (let k = 1; k <= S.N; k++) { const x = X(k * delta()); ctx.globalAlpha = k * delta() <= t ? 0.8 : 0.25; ctx.fillRect(x - 0.5 * dpr, pt + ih - 4 * dpr, 1 * dpr, 4 * dpr); } ctx.globalAlpha = 1; }
    nowLine(F, X(t));
    const items = [[T('不看', 'unwatched'), DIM, true], [T('被盯住的系综', 'watched ensemble'), CY], [T('这一次运行', 'this run'), MG]];
    if (S.scale === 'gamma') items.push([T('连续弱测量极限', 'continuous limit'), AM, true]);
    legend(F, items, pl + 8 * dpr, pt + 4 * dpr);
    $('tlMeta').textContent = T(`t = ${(t / Math.PI).toFixed(3)} π/Ω · 已刷新 ${refreshesDone(t)} / ${S.N}`, `t = ${(t / Math.PI).toFixed(3)} π/Ω · refreshed ${refreshesDone(t)} / ${S.N}`);
  } else if (S.mode === 'drag') {
    $('tlTitle').textContent = T('到这一步为止全都跟上的概率', 'CHANCE OF HAVING FOLLOWED SO FAR');
    gridY(F, [0, 0.5, 1], (y) => y.toFixed(1));
    const N = dragSteps(); xTicks(F, [0, N / 2, N], X, (v) => String(Math.round(v)));
    const c2 = Math.cos(thetaH() / N) ** 2;
    curve(F, N, (i) => X(i), (i) => Y(c2 ** i), CY, 2);
    curve(F, N, (i) => X(i), (i) => Y((1 + Math.cos(2 * thetaH() / N) ** i) / 2), SG, 1.4, [4, 3]);
    const j = Math.min(N, Math.floor(t + 1e-9));
    for (let k = 1; k <= j; k++) { ctx.fillStyle = RUN.signs[k] > 0 ? CY : MG; ctx.fillRect(X(k) - 1.5 * dpr, pt + ih - 6 * dpr, 3 * dpr, 6 * dpr); }
    nowLine(F, X(t));
    legend(F, [[T('全部跟上 cos²ʲ(Θ/N)', 'followed every time cos²ʲ(Θ/N)'), CY], [T('此刻落在测量轴上', 'on the current axis now'), SG, true]], pl + iw * 0.42, pt + 4 * dpr);
    $('tlMeta').textContent = T(`第 ${j} / ${N} 步`, `step ${j} / ${N}`);
  } else {
    $('tlTitle').textContent = T('仍未衰变的概率', 'SURVIVAL PROBABILITY');
    gridY(F, [0, 0.5, 1], (y) => y.toFixed(1));
    const gu = gammaGR(), gw = gammaTau();
    xTicks(F, [0, Tt / 3, 2 * Tt / 3, Tt], X, (v) => (v === 0 ? '0' : `${(v * gu).toFixed(0)}/Γ`));
    const n = 300;
    curve(F, n, (i) => X(Tt * i / n), (i) => Y(Math.exp(-gu * Tt * i / n)), DIM, 1.4, [4, 3]);
    curve(F, n, (i) => X(Tt * i / n), (i) => Y(Math.exp(-gw * Tt * i / n)), regime(gw / gu) === 'anti' ? MG : CY, 2);
    const td = RUN.decayWatched;
    if (td <= Tt) { ctx.fillStyle = td <= t ? MG : FAINT; ctx.beginPath(); ctx.arc(X(td), Y(Math.exp(-gw * td)), 4 * dpr, 0, Math.PI * 2); ctx.fill(); }
    nowLine(F, X(t));
    legend(F, [[T('不看：exp(−Γ_GR·t)', 'unwatched: exp(−Γ_GR·t)'), DIM, true], [T('每隔 τ 测一次：exp(−Γ(τ)·t)', 'measured every τ: exp(−Γ(τ)·t)'), regime(gw / gu) === 'anti' ? MG : CY]], pl + iw * 0.45, pt + 4 * dpr);
    $('tlMeta').textContent = T(`Γ_GR·t = ${(t * gu).toFixed(2)} · 已测 ${refreshesDone(t)} 次`, `Γ_GR·t = ${(t * gu).toFixed(2)} · measured ${refreshesDone(t)} times`);
  }
}
const LOGN_MAX = Math.log2(256);
function drawScaling() {
  const F = frame2d(cvSC); if (F.iw < 40 || F.ih < 30) return;
  const { ctx, dpr, pl, pt, iw, ih } = F;
  if (S.mode === 'freeze' || S.mode === 'drag') {
    const X = (N) => pl + Math.log2(Math.max(1, N)) / LOGN_MAX * iw, Y = (p) => pt + ih - p * ih;
    gridY(F, [0, 0.5, 1], (y) => y.toFixed(1)); xTicks(F, [1, 4, 16, 64, 256], X, (v) => String(v));
    const Ns = []; for (let k = 0; k <= 160; k++) Ns.push(Math.round(2 ** (LOGN_MAX * k / 160)));
    if (S.mode === 'freeze') {
      $('scTitle').innerHTML = T('刷新越多，翻转越少', 'MORE REFRESHES, FEWER FLIPS');
      curve(F, Ns.length - 1, (i) => X(Ns[i]), (i) => Y(p1End(Ns[i])), CY, 2);
      const Tt = spanT();
      if (S.scale === 'eta' && S.eta === 0) {
        curve(F, Ns.length - 1, (i) => X(Ns[i]), (i) => Y(1 - Math.cos(Tt / Ns[i] / 2) ** (2 * Ns[i])), MG, 1.6);
        curve(F, Ns.length - 1, (i) => X(Ns[i]), (i) => Y(Math.min(1, Tt * Tt / (4 * Ns[i]))), MG, 1.2, [4, 3]);
      }
      if (S.scale === 'gamma') { const zc = (1 - zContinuum(Tt)) / 2; curve(F, 1, (i) => pl + i * iw, () => Y(zc), AM, 1.2, [3, 3]); }
      if (S.N > 0) { ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(S.N), Y(p1End(S.N)), 4 * dpr, 0, Math.PI * 2); ctx.fill(); }
      const items = [[T('系综 P₁(T)', 'ensemble P₁(T)'), CY]];
      if (S.scale === 'eta' && S.eta === 0) items.push([T('至少一次测到离开', 'caught leaving at least once'), MG], [T('上界 κ²T²/N', 'bound κ²T²/N'), MG, true]);
      if (S.scale === 'gamma') items.push([T('N → ∞ 的极限', 'limit N → ∞'), AM, true]);
      legend(F, items, pl + iw * 0.38, pt + 4 * dpr);
      $('scMeta').textContent = T('横轴：刷新次数 N（对数）', 'x: refreshes N (log)');
    } else {
      $('scTitle').textContent = T('步子越碎，拖得越稳', 'SMALLER STEPS, STEADIER DRAG');
      curve(F, Ns.length - 1, (i) => X(Ns[i]), (i) => Y(pFollow(Ns[i])), CY, 2);
      curve(F, Ns.length - 1, (i) => X(Ns[i]), (i) => Y(Math.max(0, 1 - thetaH() ** 2 / Ns[i])), CY, 1.2, [4, 3]);
      curve(F, Ns.length - 1, (i) => X(Ns[i]), (i) => Y(pOnTarget(Ns[i])), SG, 1.4, [2, 3]);
      ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(dragSteps()), Y(pFollow()), 4 * dpr, 0, Math.PI * 2); ctx.fill();
      legend(F, [[T('全程跟上 cos²ᴺ(Θ/N)', 'followed throughout cos²ᴺ(Θ/N)'), CY], [T('下界 1 − Θ²/N', 'lower bound 1 − Θ²/N'), CY, true], [T('最终落在目标上', 'ends on the target'), SG, true]], pl + iw * 0.36, pt + ih * 0.42);
      $('scMeta').textContent = T('横轴：步数 N（对数）', 'x: steps N (log)');
    }
  } else {
    $('scTitle').textContent = T('测量频率与衰变率', 'MEASUREMENT RATE AND DECAY RATE');
    const sc = antiScales(), top = Math.max(1.5, sc.rmax * 1.1);
    const X = (lr) => pl + (lr + 2) / 4 * iw, Y = (r) => pt + ih - r / top * ih;          // lr = log10(1/τ)
    ctx.fillStyle = MG; ctx.globalAlpha = 0.07; ctx.fillRect(pl, pt, iw, Y(1) - pt); ctx.fillStyle = CY; ctx.fillRect(pl, Y(1), iw, pt + ih - Y(1)); ctx.globalAlpha = 1;
    const rt = [0, 1, ...(Math.floor(top) >= 3 ? [Math.floor(top)] : [])];
    gridY(F, rt.map((r) => r / top), (y) => String(Math.round(y * top)));
    xTicks(F, [-2, -1, 0, 1, 2], X, (v) => ({ '-2': '10⁻²', '-1': '10⁻¹', 0: '1', 1: '10', 2: '100' })[v]);
    curve(F, 200, (i) => X(-2 + 4 * i / 200), (i) => Y(ratio(10 ** -(-2 + 4 * i / 200))), INK, 2);
    const lr = -S.logTau; ctx.fillStyle = regime(ratio()) === 'anti' ? MG : CY; ctx.beginPath(); ctx.arc(X(lr), Y(ratio()), 4.5 * dpr, 0, Math.PI * 2); ctx.fill();
    ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = MG; ctx.fillText(T('反芝诺：Γ > Γ_GR', 'anti-Zeno: Γ > Γ_GR'), pl + iw - 4 * dpr, pt + 3 * dpr);
    ctx.fillStyle = CY; ctx.textBaseline = 'bottom'; ctx.fillText(T('芝诺：Γ < Γ_GR', 'Zeno: Γ < Γ_GR'), pl + iw - 4 * dpr, pt + ih - 3 * dpr);
    $('scMeta').textContent = T('横轴：测量频率 1/τ（以 Λ 计，对数）', 'x: measurement rate 1/τ (in Λ, log)');
  }
}
function drawTape() {
  const dpr = fitCanvas(cvTape), ctx = cvTape.getContext('2d'), W = cvTape.width, Hh = cvTape.height;
  ctx.clearRect(0, 0, W, Hh);
  const t = tNow(), done = refreshesDone(t);
  if (S.mode === 'anti') {
    const tt = tau(), td = RUN.decayWatched, n = Math.round(td / tt);
    ctx.fillStyle = DIM; ctx.font = `${10.5 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const shown = Math.min(done, n), cells = Math.min(n, 120), w = (W - 8 * dpr) / Math.max(1, cells);
    for (let k = 0; k < cells; k++) {
      const idx = Math.round((k + 1) / cells * n), past = idx <= shown, last = idx === n;
      ctx.fillStyle = last ? MG : CY; ctx.globalAlpha = past ? (last ? 1 : 0.7) : 0.12;
      ctx.fillRect(4 * dpr + k * w, 10 * dpr, Math.max(1, w - 1 * dpr), Hh - 20 * dpr);
    }
    ctx.globalAlpha = 1; return;
  }
  const N = S.mode === 'freeze' ? S.N : dragSteps(), out = RUN.outcomes;
  if (!N) { ctx.fillStyle = DIM; ctx.font = `${11 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(T('没有刷新，没有记录', 'no refreshes, no records'), W / 2, Hh / 2); return; }
  const cols = Math.min(N, 64), rows = Math.ceil(N / cols), cw = (W - 8 * dpr) / cols, ch = (Hh - 8 * dpr) / rows;
  for (let k = 0; k < N; k++) {
    const r = Math.floor(k / cols), c = k % cols, o = out[k];
    ctx.fillStyle = o === 0 ? CY : o === 1 ? MG : o === 2 ? AM : FAINT;
    ctx.globalAlpha = k < done ? 0.9 : 0.12;
    ctx.fillRect(4 * dpr + c * cw, 4 * dpr + r * ch, Math.max(1, cw - 1.5 * dpr), Math.max(1, ch - 1.5 * dpr));
  }
  ctx.globalAlpha = 1;
}

/* =====================================================================
   10. Readouts and controls
   ===================================================================== */
let syncedT = NaN;
function setRO(k, label, value) { $(`roL${k}`).innerHTML = label; $(`ro${k}`).innerHTML = value; }
function syncOutputs() {
  if (dirtyRun) { resampleRun(); dirtyRun = false; }
  const t = tNow(); syncedT = t;
  $('oLooks').textContent = String(S.N); $('oSpan').textContent = S.span.toFixed(2); $('oEta').textContent = S.eta.toFixed(2); $('oGamma').textContent = S.gamma.toFixed(1);
  $('oTarget').textContent = `${S.target}°`; $('oDetune').textContent = S.a.toFixed(1); $('oTau').textContent = tau() >= 1 ? tau().toFixed(2) : tau().toPrecision(2);
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  document.querySelectorAll('#scaleChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scale === S.scale)));
  document.querySelectorAll('[data-modes]').forEach((el) => { el.hidden = !el.dataset.modes.split(' ').includes(S.mode); });
  $('fieldEta').hidden = S.scale !== 'eta'; $('fieldGamma').hidden = S.scale !== 'gamma';
  $('looks').min = S.mode === 'drag' ? '1' : '0';
  $('modeNote').textContent = {
    freeze: T('Rabi 驱动把 |0⟩ 推向 |1⟩，每隔 δ = T/N 刷新一次，看它是否还在 |0⟩。', 'A Rabi drive pushes |0⟩ towards |1⟩; every δ = T/N a refresh checks whether it is still in |0⟩.'),
    drag: T('没有哈密顿量，只有一串缓慢转动的测量：每一步问“你在新方向上吗”。', 'No Hamiltonian, only a chain of slowly turning measurements: each step asks “are you along the new direction?”'),
    anti: T('不稳定能级向环境衰变；周期测量改变它“看到”的环境频谱。', 'An unstable level decays into an environment; periodic measurement changes which part of the environment spectrum it “sees”.')
  }[S.mode];
  const pill = (id, k, v) => { $(id).innerHTML = `${k} <strong>${v}</strong>`; };
  pill('pillMode', 'MODE', { freeze: 'FREEZE', drag: 'DRAG', anti: 'ANTI-ZENO' }[S.mode]);
  pill('pillRun', 'RUN', RUN.hash);
  $('roAside').textContent = { freeze: 'FREEZE', drag: 'DRAG', anti: 'ANTI-ZENO' }[S.mode];
  if (S.mode === 'freeze') {
    const N = S.N, q = flipProb(), proj = projective(), Tt = spanT(), d = delta(), eta = etaStep();
    const p1w = p1End(N), p1u = Math.sin(Tt / 2) ** 2;
    pill('pillN', 'N', String(N)); pill('pillKey', 'P<sub>1</sub>(T)', f3(p1w));
    setRO(1, T('被盯住时 P<sub>1</sub>(T)', 'P<sub>1</sub>(T) when watched'), f3(p1w));
    setRO(2, T('不看时 P<sub>1</sub>(T) = sin²(ΩT/2)', 'P<sub>1</sub>(T) unwatched = sin²(ΩT/2)'), f3(p1u));
    setRO(3, T('每次都在 |0⟩ 的概率 (1 − q)<sup>N</sup>', 'Found in |0⟩ every time (1 − q)<sup>N</sup>'), proj ? f3((1 - q) ** N) : '—');
    setRO(4, T('离开概率上界 κ²T²/N', 'Bound on leaving κ²T²/N'), N ? f3(Math.min(1, Tt * Tt / (4 * N))) : '—');
    if (S.scale === 'gamma') {
      const sr = slowRate();
      setRO(5, T('慢衰减率 −λ<sub>slow</sub>（以 Ω 计）', 'Slow decay rate −λ<sub>slow</sub> (in Ω)'), sr === null ? T('欠阻尼', 'underdamped') : f3(sr));
      setRO(6, T('近似 Ω²/γ', 'Approximation Ω²/γ'), S.gamma > 0 ? f3(1 / S.gamma) : '—');
    } else {
      setRO(5, T('记录熵率 h<sub>2</sub>(q)/δ（nat·Ω）', 'Record entropy rate h<sub>2</sub>(q)/δ (nat·Ω)'), proj ? f3(h2nat(q) / d) : '—');
      setRO(6, T('关于 Ω 的 Fisher 信息 T²/N', 'Fisher information on Ω, T²/N'), proj && q > 0 && q < 1 ? f3(Tt * Tt / N) : '—');
    }
    $('roNote').innerHTML = !N ? T('没有刷新：跃迁完整发生。', 'No refreshes: the transition runs its full course.')
      : proj ? T(`每段翻转概率 q = sin²(Ωδ/2) = ${sci(q)}，κ = Ω/2。熵率在 Ωδ ≈ 0.9518 处最大（≈ 0.5398 Ω），此刻 Ωδ = ${d.toFixed(3)}。`, `Flip probability per interval q = sin²(Ωδ/2) = ${sci(q)}, κ = Ω/2. The entropy rate peaks near Ωδ ≈ 0.9518 (≈ 0.5398 Ω); now Ωδ = ${d.toFixed(3)}.`)
      : T(`每次刷新把相干乘以 η = ${eta.toFixed(3)}；记录不完全，没有可读的逐次结果，(1 − q)<sup>N</sup>、熵率和 Fisher 信息在这里不定义。`, `Each refresh multiplies the coherence by η = ${eta.toFixed(3)}; the records are incomplete and give no readable outcome per look, so (1 − q)<sup>N</sup>, the entropy rate and the Fisher information are not defined here.`);
    $('looksNote').innerHTML = N ? T(`间隔 δ = T/N = ${(d / Math.PI).toFixed(4)} π/Ω。`, `Interval δ = T/N = ${(d / Math.PI).toFixed(4)} π/Ω.`) : T('N = 0：完全不看。', 'N = 0: never looking.');
    $('strengthNote').innerHTML = S.scale === 'eta'
      ? T(`每次刷新的记录重叠固定为 η = ${S.eta.toFixed(2)}：N 越大，总监视越强。`, `The record overlap is fixed at η = ${S.eta.toFixed(2)} per refresh: the larger N, the stronger the total monitoring.`)
      : T(`η = e<sup>−γδ</sup> = ${eta.toFixed(4)}：刷新越密，每次越弱，总强度固定为 γ = ${S.gamma.toFixed(1)}Ω。`, `η = e<sup>−γδ</sup> = ${eta.toFixed(4)}: denser refreshes are each weaker, keeping the total strength at γ = ${S.gamma.toFixed(1)}Ω.`);
    $('tapeNote').innerHTML = !N ? '' : proj ? T('<b style="color:var(--cyan)">青</b> = 测到 |0⟩，<b style="color:var(--magenta)">品红</b> = 测到 |1⟩（随后从 |1⟩ 继续）。', '<b style="color:var(--cyan)">Cyan</b> = found |0⟩, <b style="color:var(--magenta)">magenta</b> = found |1⟩ (and carried on from |1⟩).')
      : T('<b style="color:var(--amber)">琥珀</b> = 这一次受到随机相位踢，暗格 = 没有。相位踢不留下可读结果。', '<b style="color:var(--amber)">Amber</b> = a random phase kick this time, dark = none. Kicks leave no readable outcome.');
    const sum = proj ? (() => { let s = 0; for (let k = 1; k <= N; k++) s += (1 - q) ** (k - 1) * q; return s + (1 - q) ** N; })() : null;
    $('ledgerNote').innerHTML = proj ? T(`本页协议（从 |0⟩ 出发，每次检查是否到了 |1⟩）的同一笔账：首次在第 k 次被测到离开的概率 (1 − q)<sup>k−1</sup>q 对 k 求和，再加上始终未离开的 (1 − q)<sup>N</sup>，= ${sum.toFixed(12)}（模型计算）。`, `The same bookkeeping for this page’s protocol (start in |0⟩, check each time for |1⟩): the chance (1 − q)<sup>k−1</sup>q of first being caught leaving at look k, summed over k, plus (1 − q)<sup>N</sup> for never leaving, = ${sum.toFixed(12)} (model calculation).`)
      : T('理想投影时这里给出逐步守恒的读数；不完全记录或不看时没有逐次的是/否结果。', 'With ideal projections this shows the step-by-step balance; incomplete records or no refreshes give no yes/no outcome per look.');
  } else if (S.mode === 'drag') {
    const N = dragSteps(), th = thetaH(), pf = pFollow(), j = Math.min(N, Math.floor(t + 1e-9));
    const firstLost = RUN.signs.findIndex((s, k) => k > 0 && s < 0), finalSign = RUN.signs[N];
    pill('pillN', 'N', String(N)); pill('pillKey', 'p<sub>follow</sub>', f3(pf));
    setRO(1, T('全程跟上 cos<sup>2N</sup>(Θ/N)', 'Followed throughout cos<sup>2N</sup>(Θ/N)'), f3(pf));
    setRO(2, T('下界 1 − Θ²/N', 'Lower bound 1 − Θ²/N'), f3(Math.max(0, 1 - th * th / N)));
    setRO(3, T('最终落在目标上', 'Ends on the target'), f3(pOnTarget()));
    setRO(4, T('每步转角 Θ/N', 'Turn per step Θ/N'), `${(S.target / N).toFixed(2)}°`);
    setRO(5, T('这一次运行', 'This run'), j < N ? T(`进行中（${j}/${N}）`, `running (${j}/${N})`) : firstLost < 0 ? T('全程跟上', 'followed throughout') : T(`第 ${firstLost} 步掉队${finalSign > 0 ? '，后来又回到轴上' : ''}`, `lost at step ${firstLost}${finalSign > 0 ? ', later back on the axis' : ''}`));
    setRO(6, T('系综布洛赫长度 cos<sup>N</sup>(2Θ/N)', 'Ensemble Bloch length cos<sup>N</sup>(2Θ/N)'), f3(Math.cos(2 * th / N) ** N));
    $('roNote').innerHTML = T(`相邻测量方向的重叠 cos(Θ/N) = ${Math.cos(th / N).toFixed(4)}；没有哈密顿量，变化完全来自测量路径。`, `Neighbouring measurement directions overlap by cos(Θ/N) = ${Math.cos(th / N).toFixed(4)}; there is no Hamiltonian, and all change comes from the measurement path.`);
    $('looksNote').innerHTML = T(`共 ${N} 步，从 |0⟩ 转到 cos Θ|0⟩ + sin Θ|1⟩。`, `${N} steps from |0⟩ to cos Θ|0⟩ + sin Θ|1⟩.`);
    $('dragNote').innerHTML = T(`Θ = ${S.target}°${S.target === 90 ? '：目标与初态正交' : ''}。布洛赫球上转过 2Θ = ${2 * S.target}°。`, `Θ = ${S.target}°${S.target === 90 ? ': the target is orthogonal to the initial state' : ''}. On the Bloch sphere this is 2Θ = ${2 * S.target}°.`);
    $('tapeNote').innerHTML = T('<b style="color:var(--cyan)">青</b> = 这一步跟上了，<b style="color:var(--magenta)">品红</b> = 落在反方向。失败的分支也在账上。', '<b style="color:var(--cyan)">Cyan</b> = followed at this step, <b style="color:var(--magenta)">magenta</b> = found opposite. Failed branches stay on the ledger too.');
    let sum = 0; const c2 = Math.cos(th / N) ** 2; for (let k = 1; k <= N; k++) sum += c2 ** (k - 1) * (1 - c2); sum += c2 ** N;
    $('ledgerNote').innerHTML = T(`本页拖动协议的同一笔账：第 k 步首次掉队的概率 cos<sup>2(k−1)</sup>(Θ/N)·sin²(Θ/N) 对 k 求和，再加上全程跟上的概率，= ${sum.toFixed(12)}（模型计算）。`, `The same bookkeeping for the drag protocol: the chance cos<sup>2(k−1)</sup>(Θ/N)·sin²(Θ/N) of first falling behind at step k, summed over k, plus the chance of following throughout, = ${sum.toFixed(12)} (model calculation).`);
  } else {
    const r = ratio(), reg = regime(r), gu = gammaGR(), gw = gammaTau(), tt = tau();
    pill('pillN', 'τ', tt >= 1 ? tt.toFixed(2) : tt.toPrecision(2)); pill('pillKey', 'Γ/Γ<sub>GR</sub>', f3(r));
    setRO(1, T('衰变率之比 Γ(τ)/Γ<sub>GR</sub>', 'Decay-rate ratio Γ(τ)/Γ<sub>GR</sub>'), f3(r));
    setRO(2, T('区域', 'Regime'), { anti: T('反芝诺：加速', 'anti-Zeno: faster'), zeno: T('芝诺：减慢', 'Zeno: slower'), neutral: T('几乎不变', 'nearly unchanged') }[reg]);
    setRO(3, T('不看时 Γ<sub>GR</sub> = 2πJ(ω<sub>0</sub>)', 'Unwatched Γ<sub>GR</sub> = 2πJ(ω<sub>0</sub>)'), `${sci(gu)} <small>Λ</small>`);
    setRO(4, T('滤波半宽 ≈ 2π/τ 对比失谐 a', 'Filter half-width ≈ 2π/τ vs detuning a'), `${(2 * Math.PI / tt).toPrecision(3)} <small>vs</small> ${S.a.toFixed(1)}`);
    setRO(5, T('此刻存活：被测 / 不看', 'Survival now: measured / unwatched'), `${f3(Math.exp(-gw * t))} / ${f3(Math.exp(-gu * t))}`);
    const td = RUN.decayWatched, tu = RUN.decayUnwatched;
    setRO(6, T('这次运行衰变于（Γ<sub>GR</sub>·t）', 'This run decays at (Γ<sub>GR</sub>·t)'), `${(td * gu).toFixed(2)} <small>${T('不看时', 'unwatched')} ${(tu * gu).toFixed(2)}</small>`);
    $('roNote').innerHTML = T(`Γ(τ) = 2π∫J(ω)F<sub>τ</sub>(ω)dω：J 是峰在 ω<sub>c</sub> = ω<sub>0</sub> + ${S.a.toFixed(1)}Λ 的洛伦兹谱，F<sub>τ</sub> 是宽约 2π/τ 的 sinc² 滤波（弱耦合领先阶）。`, `Γ(τ) = 2π∫J(ω)F<sub>τ</sub>(ω)dω: J is a Lorentzian peaked at ω<sub>c</sub> = ω<sub>0</sub> + ${S.a.toFixed(1)}Λ, F<sub>τ</sub> a sinc² filter about 2π/τ wide (weak-coupling leading order).`);
    $('antiNote').innerHTML = T(`耦合 G = ${G_ANTI}Λ。测量越密，滤波越宽：先扫到偏离的谱峰（加速），再摊得太薄（减慢）。`, `Coupling G = ${G_ANTI}Λ. The denser the measurements, the wider the filter: first it reaches the detuned peak (faster), then it spreads too thin (slower).`);
    $('tapeNote').innerHTML = T('每格是一次测量：<b style="color:var(--cyan)">青</b> = 仍在激发态，<b style="color:var(--magenta)">品红</b> = 发现已经衰变（格子太多时按比例合并）。', 'Each cell is one measurement: <b style="color:var(--cyan)">cyan</b> = still excited, <b style="color:var(--magenta)">magenta</b> = found decayed (cells merged in proportion when there are too many).');
    $('ledgerNote').innerHTML = T(`已衰变 + 仍存活 = ${(1 - Math.exp(-gw * t) + Math.exp(-gw * t)).toFixed(12)}（模型计算）。`, `Decayed + still surviving = ${(1 - Math.exp(-gw * t) + Math.exp(-gw * t)).toFixed(12)} (model calculation).`);
  }
  $('presetNote').textContent = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义参数。', 'Custom settings.');
  // clock, HUD, rail
  if (S.mode === 'freeze') { $('clock').innerHTML = `${(t / Math.PI).toFixed(3)} <small>π/Ω</small>`; $('hudBig').textContent = `Ωt = ${(t / Math.PI).toFixed(3)}π`; }
  else if (S.mode === 'drag') { $('clock').innerHTML = `${Math.min(dragSteps(), Math.floor(t + 1e-9))} <small>/ ${dragSteps()}</small>`; $('hudBig').textContent = T(`第 ${Math.min(dragSteps(), Math.floor(t + 1e-9))} 步`, `step ${Math.min(dragSteps(), Math.floor(t + 1e-9))}`); }
  else { $('clock').innerHTML = `${(t * gammaGR()).toFixed(2)} <small>/Γ<sub>GR</sub></small>`; $('hudBig').textContent = `Γ_GR·t = ${(t * gammaGR()).toFixed(2)}`; }
  $('hudSub').textContent = S.mode === 'freeze' ? T(`N = ${S.N} · 已刷新 ${refreshesDone(t)} 次 · 这次运行在 ${freezeAt(RUN.single, t)[2] >= 0 ? '北半球' : '南半球'}`, `N = ${S.N} · ${refreshesDone(t)} refreshes so far · this run in the ${freezeAt(RUN.single, t)[2] >= 0 ? 'northern' : 'southern'} hemisphere`)
    : S.mode === 'drag' ? T(`Θ = ${S.target}° · 全程跟上的概率 ${f3(pFollow())}`, `Θ = ${S.target}° · chance of following throughout ${f3(pFollow())}`)
      : T(`τ = ${tau().toPrecision(3)}/Λ · Γ/Γ_GR = ${f3(ratio())}`, `τ = ${tau().toPrecision(3)}/Λ · Γ/Γ_GR = ${f3(ratio())}`);
}
let railKey = '';
function syncRail() {
  const key = `${S.mode}|${tEnd()}`; if (key === railKey) return; railKey = key;
  const Te = tEnd(), marks = S.mode === 'freeze' ? [[0, '0'], [Te / 2, `${(Te / 2 / Math.PI).toFixed(2)}π/Ω`], [Te, `${(Te / Math.PI).toFixed(2)}π/Ω`]]
    : S.mode === 'drag' ? [[0, '0'], [Te / 2, String(Math.round(Te / 2))], [Te, String(Te)]] : [[0, '0'], [Te / 3, '1/Γ'], [2 * Te / 3, '2/Γ'], [Te, '3/Γ']];
  $('marks').innerHTML = marks.map(([v, s], k) => `<i class="${k === 0 ? 'first' : k === marks.length - 1 ? 'last' : ''}" style="left:${(v / Te * 100).toFixed(2)}%">${s}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirtyRun = true; }
const slider = (id, key, parse = parseFloat) => $(id).addEventListener('input', () => { S[key] = parse($(id).value); custom(); });
slider('looks', 'N', (v) => parseInt(v, 10)); slider('span', 'span'); slider('eta', 'eta'); slider('gamma', 'gamma');
slider('target', 'target', (v) => parseInt(v, 10)); slider('detune', 'a'); slider('tau', 'logTau');
function setMode(m) {
  const mode = m === 'drag' ? 'drag' : m === 'anti' ? 'anti' : 'freeze';
  if (S.mode === mode) return;
  S.mode = mode; if (mode === 'drag' && S.N < 1) { S.N = 1; $('looks').value = 1; }
  custom(); setCamPreset(camName);
}
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
document.querySelectorAll('#scaleChips .chip').forEach((b) => b.addEventListener('click', () => { const sc = b.dataset.scale === 'gamma' ? 'gamma' : 'eta'; if (S.scale !== sc) { S.scale = sc; custom(); } }));
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  const modeChanged = S.mode !== p.mode;
  Object.assign(S, { mode: p.mode, N: p.N, span: p.span, scale: p.scale, eta: p.eta, gamma: p.gamma, target: p.target, a: p.a, logTau: p.logTau });
  $('looks').value = S.N; $('span').value = S.span; $('eta').value = S.eta; $('gamma').value = S.gamma; $('target').value = S.target; $('detune').value = S.a; $('tau').value = S.logTau;
  S.preset = name; markPreset(); dirtyRun = true;
  if (modeChanged) setCamPreset(camName);
  if (!reduceMotion) { S.nowFrac = 0; S.dir = 1; S.playing = true; setPlayUI(); }
  TRV.glitch($('app'));
}
document.querySelectorAll('.preset').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
function newRun() { S.run++; reseed(); dirtyRun = true; }

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
const stepSize = () => (S.mode === 'freeze' ? (S.N ? delta() : spanT() / 32) : S.mode === 'drag' ? 1 : Math.max(tau(), antiWindow() / 40));
document.addEventListener('keydown', (ev) => {
  if (ev.target && (ev.target.tagName === 'INPUT' && ev.target.type !== 'range')) return;
  if (drawer.isOpen()) return;
  if (ev.key === ' ' && !(ev.target && ev.target.tagName === 'BUTTON')) { ev.preventDefault(); S.playing = !S.playing; S.hold = 0; setPlayUI(); }
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) {
    ev.preventDefault(); S.playing = false; setPlayUI();
    const st = stepSize(), k = Math.round(tNow() / st + 1e-9) + (ev.key === 'ArrowRight' ? 1 : -1);
    S.nowFrac = Math.min(1, Math.max(0, (k * st + (S.mode === 'anti' ? 0 : st * 1e-6)) / tEnd())); $('now').value = S.nowFrac;
  }
  else if (ev.key === '1') setMode('freeze');
  else if (ev.key === '2') setMode('drag');
  else if (ev.key === '3') setMode('anti');
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
  if (dirtyRun) { resampleRun(); dirtyRun = false; syncOutputs(); }
  if (S.playing && !scrubbing) {
    if (S.hold > 0) { S.hold -= dtSec; if (S.hold <= 0) S.nowFrac = S.dir > 0 ? 0 : 1; }
    else {
      S.nowFrac += S.dir * dtSec * S.speed / RUN_SECONDS;
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 1.6; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.6; }
    }
    $('now').value = S.nowFrac;
  }
  if (tNow() !== syncedT) syncOutputs();
  syncRail();
  if (glOK) { updateCamera(dtSec); updateGL(tAcc); renderer.render(scene3, camera); updateTags(); }
  drawTimeline(); drawScaling(); drawTape();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { labelStaticTags(); syncOutputs(); });

/* read-only probe for automated browser tests */
window.ZENO_DEBUG = {
  pending: () => dirtyRun || tNow() !== syncedT,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  t: () => tNow(), tEnd: () => tEnd(),
  freeze: () => ({ q: flipProb(), delta: delta(), eta: etaStep(), projective: projective(), p1: p1End(S.N), ens: RUN.ens.map((b) => b.slice()), single: RUN.single.map((b) => b.slice()),
    outcomes: RUN.outcomes.slice(), kicks: RUN.kicks.slice(), slow: slowRate() }),
  p1Of: (N, scale) => p1End(N, scale),
  zContinuum: (t, g) => zContinuum(t, g ?? S.gamma),
  ensembleAt: (t) => freezeAt(RUN.ens, t), singleAt: (t) => freezeAt(RUN.single, t),
  drag: () => ({ N: dragSteps(), pFollow: pFollow(), pOnTarget: pOnTarget(), signs: RUN.signs.slice() }),
  dragAt: (t) => ({ single: dragStateAt(t), ens: dragEnsembleAt(t), axis: dragAxis(Math.min(dragSteps(), Math.floor(t + 1e-9))) }),
  anti: () => ({ tau: tau(), gamma: gammaTau(), gammaGR: gammaGR(), ratio: ratio(), regime: regime(ratio()), decayWatched: RUN.decayWatched, decayUnwatched: RUN.decayUnwatched, window: antiWindow() }),
  gammaTau: (tt, a) => gammaTau(tt, a), lorentz: (w, a) => lorentz(w, a), filter: (w, tt) => filter(w, tt),
  hash: () => RUN.hash, refreshes: () => refreshesDone(),
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('few'); S.N = 10; $('looks').value = 10; dirtyRun = true; S.playing = false; setPlayUI(); S.nowFrac = 0.97; $('now').value = S.nowFrac; cam.tTheta = 0.42; cam.tPhi = 1.22; cam.tR = 5.9; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('itano');
S.nowFrac = 0.3; S.playing = !reduceMotion; $('now').value = S.nowFrac;
setPlayUI();
requestAnimationFrame(frame);
})();
