/* IMITATE//CYCLE · 模仿与最佳回应 · 一个永不停下的循环
   The four-agent counterexample of MixedImitationBestResponseCycle: K₄ without the edge 0–2, agent 1 a best responder and the
   others imitators, coordination payoffs (AA, AB, BA, BB) per agent, and the persistent schedule 2, 0, 3, 1 repeated, under
   which the state cycles with period 8 and never reaches an equilibrium. The update rules are written exactly as in the Lean
   definitions (utility, hasMaximizer, update, step). Two views: the network, and the 16 states as a projected four-dimensional
   cube with every single-agent move. Rules and schedules can be changed; a random schedule is compared over 2000 runs.
   Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants and the game
   ===================================================================== */
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, cyan: CY, magenta: MG } = TRV.palette;
const MODES = ['net', 'space'];
const N = 4;
const ADJ = (i, j) => i !== j && !((i === 0 && j === 2) || (i === 2 && j === 0));
const PAY = [[1, 0, 0, 4], [3, 2, 2, 3], [4, 1, 0, 4], [4, 3, 3, 4]];   // (AA, AB, BA, BB): own strategy first; B = true
const WITNESS = [2, 0, 3, 1];
const START = [true, false, true, true];   // BABB
const WIT_STEPS = 34, RAND_MAX = 60, RUNS = 2000;
const name = (x) => x.map((b) => (b ? 'B' : 'A')).join('');
const pay = (i, s, r) => PAY[i][(s ? 2 : 0) + (r ? 1 : 0)];
const utility = (x, i) => { let u = 0; for (let j = 0; j < N; j++) if (ADJ(i, j)) u += pay(i, x[i], x[j]); return u; };
function hasMaximizer(x, i, s) {   // some neighbour using s earns at least as much as every neighbour
  for (let j = 0; j < N; j++) if (ADJ(i, j) && x[j] === s) { let best = true; for (let k = 0; k < N; k++) if (ADJ(i, k) && utility(x, k) > utility(x, j)) best = false; if (best) return true; }
  return false;
}
function update(x, i, imitator) {
  if (imitator[i]) { const a = hasMaximizer(x, i, false), b = hasMaximizer(x, i, true); return a ? (b ? x[i] : false) : (b ? true : x[i]); }
  const xa = x.slice(), xb = x.slice(); xa[i] = false; xb[i] = true; const ua = utility(xa, i), ub = utility(xb, i);
  return ua < ub ? true : ub < ua ? false : x[i];
}
const step = (x, i, imitator) => { const y = x.slice(); y[i] = update(x, i, imitator); return y; };
const isEquilibrium = (x, imitator) => [0, 1, 2, 3].every((i) => update(x, i, imitator) === x[i]);
const STATES = Array.from({ length: 16 }, (_, s) => [0, 1, 2, 3].map((i) => !!((s >> (3 - i)) & 1)));
const indexOf = (x) => x.reduce((t, b, i) => t + (b ? 1 << (3 - i) : 0), 0);
const coordinates = (i) => Math.max(PAY[i][1], PAY[i][2]) < Math.min(PAY[i][0], PAY[i][3]);

/* =====================================================================
   2. State and presets
   ===================================================================== */
const S = { mode: 'net', imitator: [true, false, true, true], sched: 'witness', seed: 7, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'cycle' };
const PRESETS = {
  cycle: { mode: 'net', roles: 'IRII', sched: 'witness', frac: 0, play: true,
    zh: '反例：K₄ 去掉 0–2 边，智能体 1（琥珀环）做最佳回应，0、2、3 模仿。从 BABB 出发按 2, 0, 3, 1 循环激活：前两步不变，此后每一步都有人改策略，8 步回到 BABB，永远到不了 AAAA 或 BBBB。已冻结。',
    en: 'The counterexample: K₄ without the edge 0–2, agent 1 (amber ring) best-responds, agents 0, 2, 3 imitate. From BABB, activating 2, 0, 3, 1 in turn: the first two steps change nothing, then every step changes someone, and after 8 steps it is BABB again, never reaching AAAA or BBBB. Frozen.' },
  space: { mode: 'space', roles: 'IRII', sched: 'witness', frac: 0, play: true,
    zh: '16 个状态是四维立方体的顶点（外层立方体：智能体 3 选 A；内层：选 B）。每条边是一个人改策略；彩色箭头是被激活时真的会走的方向。轨迹（品红）在 8 个状态上绕圈，均衡 AAAA、BBBB（琥珀）始终不被经过。',
    en: 'The 16 states are the vertices of a four-dimensional cube (outer cube: agent 3 plays A; inner: B). Each edge changes one agent’s strategy; coloured arrows show the moves an activation actually makes. The trajectory (magenta) circles over 8 states and never passes the equilibria AAAA and BBBB (amber).' },
  moves: { mode: 'space', roles: 'IRII', sched: 'witness', frac: 0, play: false,
    zh: '所有单人移动：从每个状态出发，激活某个人会把状态推向哪里。只有 AAAA 和 BBBB 没有任何出边——它们是仅有的两个均衡（页面穷举）。8 步环上的每个状态都至少有一条出边。',
    en: 'Every single-agent move: where activating someone pushes each state. Only AAAA and BBBB have no outgoing move; they are the only two equilibria (page enumeration). Every state on the 8-cycle has at least one.' },
  random: { mode: 'space', roles: 'IRII', sched: 'random', seed: 7, frac: 0, play: true,
    zh: '同一个网络、同一个起点，但每一步随机激活一个人：轨迹很快掉进 AAAA 或 BBBB。反例靠的是精心挑选的排程。',
    en: 'The same network and start, but a random agent is activated at each step: the trajectory soon drops into AAAA or BBBB. The counterexample depends on a carefully chosen schedule.' },
  imit: { mode: 'net', roles: 'IIII', sched: 'witness', frac: 0, play: true,
    zh: '把智能体 1 也改成模仿者：同一个排程下第 6 步就停在 AAAA。全员模仿的协调群体有势函数，总会停下（原文）。',
    en: 'Make agent 1 an imitator too: under the same schedule it stops at AAAA by step 6. Coordinating populations of pure imitators have a potential function and always settle (source).' },
  best: { mode: 'net', roles: 'RRRR', sched: 'witness', frac: 0, play: true,
    zh: '全员做最佳回应：同一个排程下第 6 步停在 AAAA。纯最佳回应群体也有势函数（原文）。',
    en: 'Everyone best-responds: under the same schedule it stops at AAAA by step 6. Pure best-response populations have a potential function as well (source).' },
  swap: { mode: 'net', roles: 'RIII', sched: 'witness', frac: 0, play: true,
    zh: '让智能体 0 而不是 1 做最佳回应：同一个排程下也停在 AAAA。页面试遍 16 种规则分配，只有反例那一种（I R I I）循环。',
    en: 'Let agent 0 best-respond instead of agent 1: under the same schedule it also stops at AAAA. The page tries all 16 assignments of rules; only the counterexample’s (I R I I) cycles.' },
  hist: { mode: 'space', roles: 'IRII', sched: 'random', seed: 23, frac: 1, play: false,
    zh: '随机激活的 2000 次模拟：每一次都停在均衡，右下的直方图是停下所需的步数。',
    en: '2000 simulated runs with random activation: every one settles in an equilibrium, and the histogram at the lower right shows how many steps it took.' }
};

/* =====================================================================
   3. The model
   ===================================================================== */
let MODEL = null, dirty = true;
function schedule() {
  if (S.sched === 'witness') return Array.from({ length: WIT_STEPS }, (_, t) => WITNESS[t % 4]);
  const rnd = TRV.mulberry32(S.seed); return Array.from({ length: RAND_MAX }, () => Math.floor(rnd() * N));
}
function runFrom(x0, acts, imitator, stopAtEq) {
  const xs = [x0.slice()]; let x = x0.slice(), settled = -1;
  for (let t = 0; t < acts.length; t++) { if (isEquilibrium(x, imitator)) { if (settled < 0) settled = t; if (stopAtEq) break; } x = step(x, acts[t], imitator); xs.push(x); }
  if (settled < 0 && isEquilibrium(x, imitator)) settled = xs.length - 1;
  return { xs, settled };
}
function cycleOf(xs, period) {   // first repeat of (state, schedule phase): [start, length]
  const seen = new Map(); for (let t = 0; t < xs.length; t++) { const key = `${name(xs[t])}|${t % period}`; if (seen.has(key)) return [seen.get(key), t - seen.get(key)]; seen.set(key, t); }
  return null;
}
let HIST = null;
function histogram(imitator) {   // steps to an equilibrium over RUNS random schedules from the start
  const key = imitator.join(''); if (HIST && HIST.key === key) return HIST;
  const counts = [], rnd = TRV.mulberry32(20231); let all = true, maxT = 0, sum = 0;
  for (let r = 0; r < RUNS; r++) { let x = START.slice(), t = 0; while (!isEquilibrium(x, imitator) && t < 1000) { x = step(x, Math.floor(rnd() * N), imitator); t++; } if (!isEquilibrium(x, imitator)) all = false; counts[t] = (counts[t] || 0) + 1; maxT = Math.max(maxT, t); sum += t; }
  HIST = { key, counts: Array.from({ length: maxT + 1 }, (_, t) => counts[t] || 0), all, maxT, mean: sum / RUNS }; return HIST;
}
function sweepRoles() {   // every assignment of rules under the witness schedule
  const out = []; const acts = Array.from({ length: 200 }, (_, t) => WITNESS[t % 4]);
  for (let mask = 0; mask < 16; mask++) { const im = [0, 1, 2, 3].map((i) => !!((mask >> (3 - i)) & 1)), r = runFrom(START, acts, im, true); out.push({ roles: im.map((b) => (b ? 'I' : 'R')).join(''), settled: r.settled, end: name(r.xs[r.xs.length - 1]) }); }
  return out;
}
const ROLES_SWEEP = sweepRoles();
function build() {
  const imitator = S.imitator.slice(), acts = schedule(), run = runFrom(START, acts, imitator, S.sched === 'random');
  const moves = []; STATES.forEach((x, s) => { for (let i = 0; i < N; i++) { const y = step(x, i, imitator); if (y[i] !== x[i]) moves.push([s, indexOf(y), i]); } });
  const equilibria = STATES.filter((x) => isEquilibrium(x, imitator)).map(name);
  MODEL = { mode: S.mode, imitator, acts, xs: run.xs, settled: run.settled, T: run.xs.length - 1, moves, equilibria, cycle: S.sched === 'witness' ? cycleOf(run.xs, 4) : null, hist: S.sched === 'random' ? histogram(imitator) : null };
}
function progress() {
  const M = MODEL, f = Math.min(1, Math.max(0, S.nowFrac)), t = Math.round(f * M.T), x = M.xs[t], a = t < M.T ? M.acts[t] : null;
  return { f, t, x, a, u: [0, 1, 2, 3].map((i) => utility(x, i)), eq: isEquilibrium(x, M.imitator) };
}
function explain(x, i, imitator) {   // what agent i does when activated at x
  const u = [0, 1, 2, 3].map((k) => utility(x, k)), y = update(x, i, imitator);
  if (imitator[i]) {
    const nb = [0, 1, 2, 3].filter((k) => ADJ(i, k)), top = Math.max(...nb.map((k) => u[k])), best = nb.filter((k) => u[k] === top);
    return { kind: 'I', best, top, from: x[i], to: y };
  }
  const xa = x.slice(), xb = x.slice(); xa[i] = false; xb[i] = true;
  return { kind: 'R', ua: utility(xa, i), ub: utility(xb, i), from: x[i], to: y };
}

/* =====================================================================
   4. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const sc = (b) => (b ? 'B' : 'A');
const roleName = (imit) => (imit ? T('模仿', 'imitate') : T('最佳回应', 'best response'));

/* =====================================================================
   5. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 12000, PTS_MAX = 3000;
const CAMS = { iso: [0.55, 1.05, 14], front: [0.0001, 1.5, 14], top: [0.0001, 0.08, 13] };
const cam = { theta: 0.55, phi: 1.05, r: 14, tTheta: 0.55, tPhi: 1.05, tR: 14 };
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
const NODE = [[-2.6, 0, 0.6], [0, 0, -2.4], [2.6, 0, 0.6], [0, 0, 2.6]];   // agents 0 and 2 are not neighbours
const AGENT_COL = [[0.55, 0.85, 1], COL.amber, [0.6, 1, 0.75], [0.8, 0.65, 1]];
function cubePos(s) {   // the 4-cube: outer cube for agent 3 = A, inner cube for B
  const b = [0, 1, 2, 3].map((i) => (s >> (3 - i)) & 1), r = b[3] ? 1.3 : 3.1;
  return [(b[0] - 0.5) * 2 * r, (b[1] - 0.5) * 2 * r, (b[2] - 0.5) * 2 * r];
}
function updateGL() {
  const M = MODEL, pr = progress();
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp[3 * v] = a[0]; Pp[3 * v + 1] = a[1]; Pp[3 * v + 2] = a[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; Pp[3 * v] = b[0]; Pp[3 * v + 1] = b[1]; Pp[3 * v + 2] = b[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  const ring = (c, r, col, k, y = 0) => { for (let s = 0; s < 40; s++) { const a = 2 * Math.PI * s / 40, b = 2 * Math.PI * (s + 1) / 40; seg([c[0] + r * Math.cos(a), c[1] + y, c[2] + r * Math.sin(a)], [c[0] + r * Math.cos(b), c[1] + y, c[2] + r * Math.sin(b)], col, k); } };
  const arrow = (a, b, col, k, inset = 0.45) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d), u = d.map((x) => x / l), p = a.map((x, i) => x + u[i] * inset), q = b.map((x, i) => x - u[i] * inset); seg(p, q, col, k); const w = [u[2], 0, -u[0]], wl = Math.hypot(...w) || 1, h = 0.22; for (const sgn of [1, -1]) seg(q, [q[0] - u[0] * h + sgn * w[0] / wl * h * 0.6, q[1] - u[1] * h + sgn * 0.12, q[2] - u[2] * h + sgn * w[2] / wl * h * 0.6], col, k); };
  if (M.mode === 'net') {
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (ADJ(i, j)) seg(NODE[i], NODE[j], COL.gray, 0.5);
    seg(NODE[0], NODE[2], COL.gray, 0.08);
    for (let i = 0; i < N; i++) {
      const c = NODE[i], col = pr.x[i] ? COL.magenta : COL.cyan, h = pr.u[i] * 0.3;
      ring(c, 0.42, col, 1); dot(c, col, 1, 2.4);
      if (!M.imitator[i]) ring(c, 0.62, COL.amber, 0.9);
      seg([c[0] + 0.7, 0, c[2]], [c[0] + 0.7, h, c[2]], col, 0.9); for (let k = 1; k <= pr.u[i]; k++) seg([c[0] + 0.6, k * 0.3, c[2]], [c[0] + 0.8, k * 0.3, c[2]], col, 0.45);
      if (pr.a === i) ring(c, 0.85, [1, 1, 1], 0.9);
    }
    if (pr.a !== null) {
      const e = explain(pr.x, pr.a, M.imitator);
      if (e.kind === 'I') for (const k of e.best) arrow(NODE[k], NODE[pr.a], COL.amber, 1, 0.6);
    }
  } else {
    for (let s = 0; s < 16; s++) for (let i = 0; i < N; i++) { const t = s ^ (1 << (3 - i)); if (t > s) seg(cubePos(s), cubePos(t), COL.gray, 0.22); }
    for (const [s, t, i] of M.moves) arrow(cubePos(s), cubePos(t), AGENT_COL[i], 0.55, 0.32);
    for (let s = 0; s < 16; s++) { const eq = M.equilibria.includes(name(STATES[s])); dot(cubePos(s), eq ? COL.amber : COL.gray, eq ? 1 : 0.7, eq ? 2.6 : 1.2); }
    for (let t = 1; t <= pr.t; t++) { const a = indexOf(M.xs[t - 1]), b = indexOf(M.xs[t]); if (a !== b) seg(cubePos(a), cubePos(b), COL.magenta, 1); }
    dot(cubePos(indexOf(pr.x)), [1, 1, 1], 1, 3);
  }
  lines.geometry.setDrawRange(0, v); Lb.position.needsUpdate = true; Lb.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 60 * renderer.getPixelRatio() * (stage.clientHeight / 600);
}

/* =====================================================================
   6. Camera
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.5 : 1);
  camera.position.set(r * sp * Math.sin(cam.theta), r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0, MODEL && MODEL.mode === 'net' ? 1 : 0, 0);
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
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(30, Math.max(6, cam.tR * drag.pinch / d)); drag.pinch = d; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY;
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => { if (!drag.pts.has(ev.pointerId)) return; drag.pts.delete(ev.pointerId); if (drag.pts.size === 0) drag.pinch = 0; };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(30, Math.max(6, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   7. Tags
   ===================================================================== */
const tagPool = [];
function tagAt(k, cls) { while (tagPool.length <= k) { const el = document.createElement('div'); el.className = 'tag raw'; tagsBox.appendChild(el); tagPool.push(el); } const el = tagPool[k]; el.className = 'tag raw ' + cls; return el; }
function placeTag(el, p) {
  if (!glOK) { el.style.display = 'none'; return; }
  const q = proj3(p); if (q.z > 1 || q.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const w = el.offsetWidth, W = stage.clientWidth, x = Math.min(W - w / 2 - 6, Math.max(w / 2 + 6, q.x));
  el.style.left = x + 'px'; el.style.top = q.y + 'px';
}
function updateTags() {
  const M = MODEL, pr = progress(); let k = 0;
  const put = (text, p, cls) => { const el = tagAt(k++, cls); el.textContent = text; placeTag(el, p); };
  if (M.mode === 'net') {
    for (let i = 0; i < N; i++) put(`${i} · ${sc(pr.x[i])} · u = ${pr.u[i]}`, [NODE[i][0], -0.75, NODE[i][2]], pr.x[i] ? 'mg' : 'cy');
    put(T('最佳回应', 'best response'), [NODE[1][0], 0.35 + pr.u[1] * 0.3 + 0.3, NODE[1][2]], 'hot');
  } else {
    for (const e of M.equilibria) put(e, cubePos(indexOf(STATES.find((x) => name(x) === e))).map((c, i) => (i === 1 ? c + 0.45 : c)), 'hot');
    put(name(pr.x), cubePos(indexOf(pr.x)).map((c, i) => (i === 1 ? c - 0.5 : c)), '');
  }
  for (let i = k; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}

/* =====================================================================
   8. 2D panels
   ===================================================================== */
function frame2d(cv, pl0 = 46) {
  const dpr = fitCanvas(cv), ctx = cv.getContext('2d'), Wd = cv.width, Hh = cv.height;
  ctx.clearRect(0, 0, Wd, Hh);
  const pl = pl0 * dpr, pr = 12 * dpr, pt = 10 * dpr, pb = 20 * dpr;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  return { dpr, ctx, W: Wd, Hh, pl, pt, iw: Wd - pl - pr, ih: Hh - pt - pb };
}
function drawMain() {   // space-time: rows are agents, columns are times
  const M = MODEL, F = frame2d(cv1, 30); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress(), cols = M.T + 1, cw = iw / cols, rh = (ih - 14 * dpr) / N;
  for (let t = 0; t < cols; t++) for (let i = 0; i < N; i++) {
    const x = pl + t * cw, y = pt + 12 * dpr + i * rh;
    ctx.fillStyle = M.xs[t][i] ? MG : CY; ctx.globalAlpha = t <= pr.t ? 0.75 : 0.18; ctx.fillRect(x + 0.5, y + 1, Math.max(1, cw - 1), rh - 2); ctx.globalAlpha = 1;
    if (t < M.T && M.acts[t] === i) { ctx.strokeStyle = INK; ctx.lineWidth = 1.2 * dpr; ctx.strokeRect(x + 1, y + 1.5, Math.max(1, cw - 2), rh - 3); ctx.lineWidth = 1; }
  }
  if (M.cycle && M.settled < 0) { const [s, len] = M.cycle; ctx.strokeStyle = AM; ctx.setLineDash([3 * dpr, 2 * dpr]); for (let t = s; t < cols; t += len) { const x = pl + t * cw; ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + ih - 2 * dpr); ctx.stroke(); } ctx.setLineDash([]); }
  if (M.settled >= 0) { const x = pl + M.settled * cw; ctx.fillStyle = AM; ctx.fillRect(x, pt + 2 * dpr, Math.max(2 * dpr, cw), 6 * dpr); }
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * dpr; ctx.strokeRect(pl + pr.t * cw, pt + 11 * dpr, cw, ih - 12 * dpr); ctx.lineWidth = 1;
  ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (let i = 0; i < N; i++) ctx.fillText(`${i}${M.imitator[i] ? 'I' : 'R'}`, pl - 4 * dpr, pt + 12 * dpr + (i + 0.5) * rh);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; const stepT = Math.max(1, Math.ceil(cols / 12)); for (let t = 0; t < cols; t += stepT) ctx.fillText(String(t), pl + (t + 0.5) * cw, pt + ih + 3 * dpr);
}
function drawSide() {
  const M = MODEL, F = frame2d(cv2, 30); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  if (M.hist) {
    const H = M.hist, mx = Math.max(...H.counts), bw = iw / H.counts.length;
    H.counts.forEach((c, t) => { const h = ih * c / mx; ctx.fillStyle = M.settled === t ? AM : CY; ctx.globalAlpha = M.settled === t ? 1 : 0.7; ctx.fillRect(pl + t * bw + 1, pt + ih - h, Math.max(1, bw - 2), h); ctx.globalAlpha = 1; });
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; const st = Math.max(1, Math.ceil(H.counts.length / 8)); for (let t = 0; t < H.counts.length; t += st) ctx.fillText(String(t), pl + (t + 0.5) * bw, pt + ih + 3 * dpr);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(mx), pl - 3 * dpr, pt + 4 * dpr); ctx.fillText('0', pl - 3 * dpr, pt + ih);
    $('c2Meta').textContent = T(`${RUNS} 次 · 平均 ${H.mean.toFixed(2)} 步 · 最多 ${H.maxT} 步`, `${RUNS} runs · mean ${H.mean.toFixed(2)} steps · at most ${H.maxT}`);
    return;
  }
  const cw = iw / N, cell = Math.min(cw / 2.6, (ih - 26 * dpr) / 2);
  for (let i = 0; i < N; i++) {
    const x0 = pl + i * cw + (cw - 2 * cell) / 2, y0 = pt + 14 * dpr, act = pr.a === i;
    ctx.fillStyle = act ? INK : DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(`${i} ${M.imitator[i] ? 'I' : 'R'}${coordinates(i) ? ' ✓' : ''}`, x0 + cell, y0 - 2 * dpr);
    for (let s = 0; s < 2; s++) for (let r = 0; r < 2; r++) {
      const x = x0 + r * cell, y = y0 + s * cell, here = pr.x[i] === !!s;
      ctx.fillStyle = s === r ? AM : FAINT; ctx.globalAlpha = s === r ? 0.22 : 0.5; ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2); ctx.globalAlpha = 1;
      ctx.strokeStyle = act && here ? INK : FAINT; ctx.lineWidth = (act && here ? 1.6 : 1) * dpr; ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2); ctx.lineWidth = 1;
      ctx.fillStyle = INK; ctx.textBaseline = 'middle'; ctx.fillText(String(PAY[i][2 * s + r]), x + cell / 2, y + cell / 2);
    }
    ctx.fillStyle = DIM; ctx.textBaseline = 'top'; ctx.fillText('A   B', x0 + cell, y0 + 2 * cell + 2 * dpr);
  }
  $('c2Meta').textContent = T('行 = 自己的策略，列 = 对手；对角线是协调收益', 'row = own strategy, column = opponent’s; the diagonal holds the coordination payoffs');
}

/* =====================================================================
   9. Readouts and controls
   ===================================================================== */
let syncedKey = '', toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function setRo(rows) { rows.forEach(([l, v], i) => { $(`ro${i + 1}L`).textContent = l; $(`ro${i + 1}`).textContent = v; }); }
function pill(id, label, value) { $(id).innerHTML = `${label} <strong>${value}</strong>`; }
const rolesString = () => S.imitator.map((b) => (b ? 'I' : 'R')).join(' ');
const isWitness = () => S.sched === 'witness' && S.imitator.join() === 'true,false,true,true';
function readouts() {
  const M = MODEL, pr = progress();
  let move = T('—（轨迹已到末尾）', '— (end of the trajectory)');
  if (pr.a !== null) {
    const e = explain(pr.x, pr.a, M.imitator);
    move = e.kind === 'I' ? T(`${pr.a} 模仿：邻居里效用最高（${e.top}）的是 ${e.best.join('、')}，策略 ${[...new Set(e.best.map((k) => sc(pr.x[k])))].join('/')} → ${sc(e.to)}${e.to === e.from ? '（不变）' : ''}`, `${pr.a} imitates: the best neighbours (utility ${e.top}) are ${e.best.join(', ')}, playing ${[...new Set(e.best.map((k) => sc(pr.x[k])))].join('/')} → ${sc(e.to)}${e.to === e.from ? ' (unchanged)' : ''}`)
      : T(`${pr.a} 最佳回应：选 A 得 ${e.ua}，选 B 得 ${e.ub} → ${sc(e.to)}${e.to === e.from ? '（不变）' : ''}`, `${pr.a} best-responds: A earns ${e.ua}, B earns ${e.ub} → ${sc(e.to)}${e.to === e.from ? ' (unchanged)' : ''}`);
  }
  const verdict = M.cycle && M.settled < 0 ? T(`从第 ${M.cycle[0]} 步起每 ${M.cycle[1]} 步重复，永远不到均衡${isWitness() ? '：冻结的反例' : '（页面数值）'}`, `from step ${M.cycle[0]} it repeats every ${M.cycle[1]} steps and never reaches an equilibrium${isWitness() ? ': the frozen counterexample' : ' (page computation)'}`)
    : M.settled >= 0 ? T(`第 ${M.settled} 步停在均衡 ${name(M.xs[M.settled])}（页面数值）`, `settles at step ${M.settled} in the equilibrium ${name(M.xs[M.settled])} (page computation)`) : T('在页面算到的步数内没有停下', 'no equilibrium within the steps computed');
  setRo([[T('第 t 步 · 激活 · 规则', 'Step t · activated · rule'), pr.a === null ? `${pr.t} · —` : `${pr.t} · ${pr.a} · ${roleName(M.imitator[pr.a])}`],
    [T('状态 · 四人的效用', 'State · the four utilities'), `${name(pr.x)} · ${pr.u.join(', ')}`],
    [T('这一步', 'This step'), move],
    [T('是均衡吗', 'Equilibrium?'), pr.eq ? T('是', 'yes') : T(`否（均衡只有 ${M.equilibria.join('、')}）`, `no (the equilibria are ${M.equilibria.join(', ')})`)],
    [T('结论', 'Verdict'), verdict]]);
  pill('pillA', 't', String(pr.t)); pill('pillB', T('状态', 'STATE'), name(pr.x)); pill('pillC', T('均衡', 'EQ'), pr.eq ? T('是', 'YES') : T('否', 'NO')); pill('pillD', T('规则', 'RULES'), rolesString().replace(/ /g, ''));
  const sweep = ROLES_SWEEP.filter((r) => r.settled < 0).map((r) => r.roles);
  $('roNote').innerHTML = M.hist ? T(`随机激活：${RUNS} 次模拟${M.hist.all ? '全部' : '并非全部'}停在均衡，平均 ${M.hist.mean.toFixed(2)} 步，最多 ${M.hist.maxT} 步（页面数值）。`, `Random activation: ${M.hist.all ? 'all' : 'not all'} ${RUNS} simulated runs settle, after ${M.hist.mean.toFixed(2)} steps on average and at most ${M.hist.maxT} (page computation).`)
    : T(`页面在 2, 0, 3, 1 排程下试遍 16 种规则分配，只有 ${sweep.join('、')} 循环，其余都停在均衡。`, `Under the schedule 2, 0, 3, 1 the page tries all 16 assignments of rules; only ${sweep.join(', ')} cycles, the rest settle.`);
}
function syncChips() {
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  document.querySelectorAll('#roleChips .chip').forEach((b) => { const i = +b.dataset.agent; b.textContent = `${i} · ${S.imitator[i] ? 'I' : 'R'}`; b.setAttribute('aria-pressed', String(!S.imitator[i])); });
  document.querySelectorAll('#schedChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sched === S.sched)));
}
function syncOutputs() {
  if (dirty) { build(); dirty = false; syncedKey = ''; toasted = false; }
  const M = MODEL, key = `${S.mode}|${S.nowFrac}|${TRV.lang()}`;
  if (key === syncedKey) return; syncedKey = key;
  const pr = progress();
  readouts(); syncChips();
  $('presetNote').innerHTML = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = S.sched === 'witness' ? T('时间轴 = 激活的步数（排程 2, 0, 3, 1 循环，共 34 步）。', 'The time axis is the activation step (the schedule 2, 0, 3, 1 repeated, 34 steps).') : T('时间轴 = 激活的步数（随机排程，停在均衡为止）。', 'The time axis is the activation step (a random schedule, until an equilibrium).');
  $('litNote').innerHTML = T('轨迹、均衡的穷举、规则分配的比较与随机模拟都是页面现算的数值；冻结的是“一般图上不一定到达均衡”。', 'The trajectories, the enumeration of equilibria, the comparison of rule assignments and the random simulations are numbers computed on the page; what is frozen is that general graphs need not equilibrate.');
  $('c1Title').textContent = T('时空图（青 = A，品红 = B；方框 = 被激活的人；琥珀虚线 = 循环的周期）', 'Space-time chart (cyan = A, magenta = B; boxes = the agent activated; amber dashes = the cycle’s period)');
  $('c1Meta').textContent = `t = ${pr.t}`;
  $('c2Title').textContent = M.hist ? T('随机激活：停下所需步数的分布', 'Random activation: steps until settling') : T('收益表 pay(自己, 对手)', 'Payoff tables pay(own, opponent)');
  $('clock').innerHTML = `t ${pr.t}`;
  $('hudBig').textContent = M.mode === 'net' ? T(`网络 · ${name(pr.x)}`, `network · ${name(pr.x)}`) : T(`状态空间 · ${name(pr.x)}`, `state space · ${name(pr.x)}`);
  $('hudSub').textContent = M.mode === 'net' ? T('节点颜色 = 策略（青 A、品红 B）；柱高 = 效用；琥珀外环 = 最佳回应者；白环 = 被激活；琥珀箭头 = 模仿的来源', 'node colour = strategy (cyan A, magenta B); column height = utility; amber outer ring = the best responder; white ring = activated; amber arrows = who is imitated')
    : T('四维立方体：外层立方体智能体 3 选 A，内层选 B；彩色箭头 = 激活会走的方向；琥珀 = 均衡；品红 = 轨迹', 'the 4-cube: outer cube with agent 3 on A, inner on B; coloured arrows = moves an activation makes; amber = equilibria; magenta = the trajectory');
  if (!toasted && S.playing && S.nowFrac >= 1) {
    toasted = true;
    toast(M.cycle && M.settled < 0 ? T(`<b>${M.T} 步</b>：每 ${M.cycle[1]} 步回到同一个状态，始终没有到达均衡。`, `<b>${M.T} steps</b>: back to the same state every ${M.cycle[1]} steps, never at an equilibrium.`)
      : M.settled >= 0 ? T(`<b>停下了</b>：第 ${M.settled} 步到达 ${name(M.xs[M.settled])}。`, `<b>Settled</b>: ${name(M.xs[M.settled])} at step ${M.settled}.`) : T('<b>没有停下</b>。', '<b>Not settled</b>.'));
  }
}
function syncRail() {
  const M = MODEL, key = `${M.T}|${S.sched}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  const marks = S.sched === 'witness' ? [[0, 't=0'], [2 / M.T, '2'], [10 / M.T, '10'], [18 / M.T, '18'], [26 / M.T, '26'], [1, String(M.T)]] : [[0, 't=0'], [1, String(M.T)]];
  $('marks').innerHTML = marks.map(([f, s], i) => `<i class="${i === 0 ? 'first' : i === marks.length - 1 ? 'last' : ''}" style="left:${(f * 100).toFixed(2)}%">${s}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => {
  const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'net'; if (S.mode === m) return; S.mode = m; custom();
}));
document.querySelectorAll('#roleChips .chip').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.agent; S.imitator[i] = !S.imitator[i]; S.nowFrac = 0; custom(); }));
document.querySelectorAll('#schedChips .chip').forEach((b) => b.addEventListener('click', () => {
  const s = b.dataset.sched; if (s === 'random' && S.sched === 'random') S.seed = (S.seed * 48271 + 3) % 2147483647; S.sched = s === 'random' ? 'random' : 'witness'; S.nowFrac = 0; custom();
}));
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.mode = p.mode; S.imitator = p.roles.split('').map((c) => c === 'I'); S.sched = p.sched; if (p.seed !== undefined) S.seed = p.seed;
  S.preset = name; markPreset(); dirty = true;
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
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) { ev.preventDefault(); jumpTo(S.nowFrac + (ev.key === 'ArrowRight' ? 1 : -1) / Math.max(1, MODEL.T)); }
  else if (ev.key === 'e' || ev.key === 'E') jumpTo(1);
});

/* =====================================================================
   10. Main loop
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
      S.nowFrac += S.dir * dtSec * S.speed / Math.max(6, MODEL.T * 0.55);
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
window.IM_DEBUG = {
  pending: () => dirty || syncedKey !== `${S.mode}|${S.nowFrac}|${TRV.lang()}`,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, pr = progress();
    return { mode: M.mode, frac: S.nowFrac, t: pr.t, T: M.T, x: name(pr.x), u: pr.u, eq: pr.eq, active: pr.a, imitator: M.imitator, sched: S.sched, acts: M.acts, states: M.xs.map(name), settled: M.settled, cycle: M.cycle,
      equilibria: M.equilibria, moves: M.moves, hist: M.hist ? { counts: M.hist.counts, all: M.hist.all, mean: M.hist.mean, maxT: M.hist.maxT } : null, sweep: ROLES_SWEEP };
  },
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('space'); S.playing = false; setPlayUI(); S.nowFrac = 26 / 34; $('now').value = S.nowFrac; setCamPreset('iso'); };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('cycle');
setPlayUI();
requestAnimationFrame(frame);
})();
