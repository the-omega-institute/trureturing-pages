/* POWER//CYCLES · a 64-cycle in every orientation
   Garcia (2026) proposed cubic graphs without power-of-two cycles: replace each vertex of a Cayley graph of AGL(1, p) by the
   15-vertex gadget H₁₅, choosing at each vertex which edge meets port u. For p = 29 and p = 31 (four multipliers each) every
   choice has a 64-cycle (frozen in trureturing): two 14-cycle words give 2S₄ + S₆ = 28N over all translates, so some translate
   meets port u at least ten times, and the gadget's 3-edge and 5-edge paths expand it to 14 + 10·3 + 4·5 = 64 edges. The page
   draws the Cayley graph on a torus and builds the 64-cycle for the chosen orientation, checking it edge by edge. Depends on:
   assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, cyan: CY, magenta: MG } = TRV.palette;
const MODES = ['base', 'cycle'];
const RUN = { base: 30, cycle: 20 };
const TYPES = ['t', 'g', 'r'], INV = { t: 't', g: 'r', r: 'g' };
const TYPE_RGB = { t: COL.amber, g: COL.cyan, r: COL.magenta }, TYPE_CSS = { t: AM, g: CY, r: MG };
/* the 14-cycle certificates of the Lean modules: a four-t word and a six-t word for each multiplier */
const WORDS = {
  29: { 3: ['tgtggggtrrrtrr', 'tgtgtgtgtrrrtr'], 8: ['tggtrrrtgggtrr', 'tgtgtrrtgtgtrr'], 10: ['tgtrrtrrrtgggg', 'tgtgtgtgtrtrrr'], 11: ['tggtrrtgggtrrr', 'tgtgtrrtgtgtrr'] },
  31: { 11: ['tgtrrtrrrtgggg', 'tgtgtgtgtrtrrr'], 17: ['tgtggggtrrrtrr', 'tgtgtgtgtrrrtr'], 22: ['tgtgtrrrrrtggg', 'tgtgtrtggtrrtr'], 24: ['tgtgtgggtrrrrr', 'tgtgtrtrrtggtr'] }
};
/* the gadget H₁₅: two copies of H₇ (edges va, ab, bw, cv, wd, ac, cu, ud, db with u, v, w, a, b, c, d = 0 … 6) and z = 14 */
const H7 = [[1, 3], [3, 4], [4, 2], [5, 1], [2, 6], [3, 5], [5, 0], [0, 6], [6, 4]];
const H15 = H7.concat(H7.map(([a, b]) => [a + 7, b + 7]), [[1, 8], [2, 14], [14, 9]]);
const PORT = { u: 14, v: 7, w: 0 };
const PATHS = { 'u-v': [[14, 9, 13, 7], [14, 9, 11, 10, 12, 7]], 'u-w': [[14, 2, 6, 0], [14, 2, 4, 3, 5, 0]], 'v-w': [null, [7, 12, 8, 1, 5, 0]] };
const H15_EDGE = new Set(H15.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));

/* =====================================================================
   2. The affine group and the counts
   ===================================================================== */
const mod = (a, p) => ((a % p) + p) % p;
function group(p, a) {
  const inv = (z) => { for (let b = 1; b < p; b++) if (mod(z * b, p) === 1) return b; return 0; };
  const id = (e) => (e[0] - 1) * p + e[1], el = (k) => [Math.floor(k / p) + 1, k % p], mul = (A, B) => [mod(A[0] * B[0], p), mod(A[0] * B[1] + A[1], p)];
  const ai = inv(a), gen = { t: [p - 1, 0], g: [a, 1], r: [ai, mod(-ai, p)] };
  let root = 2; for (; root < p; root++) { let x = 1, ord = 0; do { x = mod(x * root, p); ord++; } while (x !== 1); if (ord === p - 1) break; }
  const dlog = new Array(p).fill(0); for (let k = 0, x = 1; k < p - 1; k++, x = mod(x * root, p)) dlog[x] = k;
  return { p, a, N: p * (p - 1), id, el, mul, gen, root, dlog };
}
function wordData(G, word) {   // prefix products from the identity, the unused edge type at each vertex, closure, distinctness and no backtracking
  const pref = [[1, 0]]; for (const c of word) pref.push(G.mul(pref[pref.length - 1], G.gen[c]));
  const unused = word.split('').map((c, i) => { const came = INV[word[(i + 13) % 14]]; return TYPES.find((s) => s !== came && s !== c); });
  const turns = word.split('').every((c, i) => INV[word[(i + 13) % 14]] !== c);   // the incoming and outgoing types differ at every vertex
  return { word, pref: pref.slice(0, 14), closes: pref[14][0] === 1 && pref[14][1] === 0, distinct: new Set(pref.slice(0, 14).map((e) => e.join(','))).size === 14, turns, unused, tcount: word.split('').filter((c) => c === 't').length };
}
function orientation(G, mode, seed) {   // σ(x) and the port map τₓ (σ(x) ↦ u, the other two types ↦ v, w)
  const rnd = TRV.mulberry32(seed), sigma = [], tau = [];
  for (let k = 0; k < G.N; k++) {
    const s = mode === 'allT' ? 't' : mode === 'noT' ? (rnd() < 0.5 ? 'g' : 'r') : TYPES[Math.floor(rnd() * 3)];
    const rest = TYPES.filter((x) => x !== s); if (rnd() < 0.5) rest.reverse();
    sigma.push(s); tau.push({ [s]: 'u', [rest[0]]: 'v', [rest[1]]: 'w' });
  }
  return { sigma, tau };
}
function translateCounts(G, W, sigma) {   // visits through port u on every left translate x·W
  const c = new Array(G.N).fill(0);
  for (let k = 0; k < G.N; k++) { const x = G.el(k); let n = 0; for (let i = 0; i < 14; i++) if (sigma[G.id(G.mul(x, W.pref[i]))] !== W.unused[i]) n++; c[k] = n; }
  return c;
}
function expand(G, W, tau, k) {   // the 64-cycle through the translate x·W: 3-edge paths at ten u-visits, 5-edge paths elsewhere
  const x = G.el(k), verts = W.pref.map((e) => G.id(G.mul(x, e))), cyc = [], visits = [];
  const ports = verts.map((v, i) => [tau[v][INV[W.word[(i + 13) % 14]]], tau[v][W.word[i]]]);
  let short = 0;
  ports.forEach(([pa, pb], i) => {
    const key = [pa, pb].sort().join('-'), [p3, p5] = PATHS[key], useShort = (pa === 'u' || pb === 'u') && short < 10;
    if (useShort) short++;
    const path = useShort ? p3 : p5, fwd = PORT[pa] === path[0] ? path : path.slice().reverse();
    visits.push({ copy: verts[i], from: pa, to: pb, len: path.length - 1, path: fwd });
    for (const j of fwd) cyc.push([verts[i], j]);
  });
  return { verts, visits, cyc, short };
}
function checkCycle(G, cyc, tau) {   // 64 distinct vertices, and every consecutive pair is an internal or an external edge
  const key = (q) => q[0] * 15 + q[1], distinct = new Set(cyc.map(key)).size === cyc.length;
  const ext = (a, b) => { if (a[0] === b[0]) return false; for (const s of TYPES) { const y = G.id(G.mul(G.el(a[0]), G.gen[s])); if (y === b[0] && PORT[tau[a[0]][s]] === a[1] && PORT[tau[y][INV[s]]] === b[1]) return true; } return false; };
  let edges = true;
  for (let i = 0; i < cyc.length; i++) { const a = cyc[i], b = cyc[(i + 1) % cyc.length]; const internal = a[0] === b[0] && H15_EDGE.has(`${Math.min(a[1], b[1])}-${Math.max(a[1], b[1])}`); if (!internal && !ext(a, b)) edges = false; }
  return { distinct, edges, length: cyc.length };
}

/* =====================================================================
   3. State and presets
   ===================================================================== */
const S = { mode: 'base', p: 29, a: 3, sigma: 'random', seed: 1, fam: 4, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'avg' };
const PRESETS = {
  avg: { mode: 'base', p: 29, a: 3, sigma: 'random', seed: 1, fam: 4, frac: 0, play: true,
    zh: 'AGL(1, 29)、a = 3：812 个顶点，随机取向。时间轴扫过四个 t 的 14 圈的全部 812 个平移，下方直方图数每个平移经过端口 u 的次数。S₄ = 10N − 2T 与 S₆ = 8N + 4T 由 T（σ = t 的顶点数）决定，2S₄ + S₆ 总是 28N。',
    en: 'AGL(1, 29), a = 3: 812 vertices with a random orientation. The time axis sweeps all 812 translates of the four-t 14-cycle, and the histogram below counts how often each translate passes through port u. S₄ = 10N − 2T and S₆ = 8N + 4T depend only on T (the number of vertices with σ = t), and 2S₄ + S₆ is always 28N.' },
  six: { mode: 'base', p: 31, a: 24, sigma: 'random', seed: 3, fam: 6, frac: 0, play: true,
    zh: 'AGL(1, 31)、a = 24：930 个顶点，扫过六个 t 的 14 圈。它在每个顶点留下的空闲类型是 t 2 次、g 6 次、r 6 次，四个 t 的那族是 6、4、4。',
    en: 'AGL(1, 31), a = 24: 930 vertices, sweeping the six-t 14-cycle. The types it leaves unused are t twice, g six times and r six times; for the four-t family they are 6, 4, 4.' },
  noT: { mode: 'base', p: 29, a: 10, sigma: 'noT', seed: 5, fam: 4, frac: 0, play: true,
    zh: '取向从不选 t（T = 0）：S₄ = 10N，四个 t 那族的平移平均恰好经过 u 10 次，所以总有一个至少 10 次。',
    en: 'An orientation that never picks t (T = 0): S₄ = 10N, so the translates of the four-t family average exactly 10 visits through u, and some translate has at least 10.' },
  allT: { mode: 'base', p: 29, a: 8, sigma: 'allT', seed: 5, fam: 6, frac: 0, play: true,
    zh: '取向总选 t（T = N）：S₆ = 12N，六个 t 那族的每个平移都经过 u 12 次。两族之间此消彼长，但加权和 2S₄ + S₆ 不变。',
    en: 'An orientation that always picks t (T = N): S₆ = 12N, and every translate of the six-t family passes through u 12 times. The two families trade off, but the weighted sum 2S₄ + S₆ does not change.' },
  cyc29: { mode: 'cycle', p: 29, a: 3, sigma: 'random', seed: 1, fam: 4, frac: 0, play: true,
    zh: '找到一个至少 10 次经过 u 的平移，把它展开：14 个小部件排成一圈，10 次走 3 边路、4 次走 5 边路，加上 14 条外部边，正好 64 条边，页面逐边核对。',
    en: 'Take a translate with at least 10 visits through u and expand it: 14 gadgets in a ring, 3-edge paths for 10 visits and 5-edge paths for 4, plus 14 external edges, exactly 64 edges, checked edge by edge.' },
  cyc31: { mode: 'cycle', p: 31, a: 17, sigma: 'random', seed: 2, fam: 4, frac: 0, play: true,
    zh: 'AGL(1, 31)、a = 17：同样的展开给出 64 圈。p = 31 的冻结定理覆盖四个乘子 11、17、22、24。',
    en: 'AGL(1, 31), a = 17: the same expansion gives a 64-cycle. The frozen p = 31 theorem covers the four multipliers 11, 17, 22, 24.' },
  gadget: { mode: 'cycle', p: 29, a: 11, sigma: 'random', seed: 4, fam: 4, frac: 0, play: false,
    zh: '小部件 H₁₅：u–v、u–w 各有 3 边与 5 边两条路，v–w 只有 5 边路。经过 u 的访问可以选短路，所以 u 用得越多，圈越短；10 次正好凑出 64。',
    en: 'The gadget H₁₅: u–v and u–w each have a 3-edge and a 5-edge path, v–w only a 5-edge one. A visit through u may take the short path, so the more visits use u, the shorter the cycle can be; 10 of them make exactly 64.' },
  reroll: { mode: 'base', p: 31, a: 22, sigma: 'random', seed: 11, fam: 4, frac: 0, play: true,
    zh: '换一个种子：取向变了，直方图跟着变，但 2S₄ + S₆ = 28N 不变。按“重抽”可以继续换。',
    en: 'Another seed: the orientation changes and so does the histogram, but 2S₄ + S₆ = 28N stays. Press “Re-roll” to keep changing it.' }
};

/* =====================================================================
   4. The model
   ===================================================================== */
let MODEL = null, dirty = true;
function build() {
  const G = group(S.p, S.a), [w4, w6] = WORDS[S.p][S.a], W4 = wordData(G, w4), W6 = wordData(G, w6), O = orientation(G, S.sigma, S.seed);
  const c4 = translateCounts(G, W4, O.sigma), c6 = translateCounts(G, W6, O.sigma), S4 = c4.reduce((s, x) => s + x, 0), S6 = c6.reduce((s, x) => s + x, 0);
  const Tn = O.sigma.filter((s) => s === 't').length;
  let pick = null;
  for (const [W, c] of [[W4, c4], [W6, c6]]) { if (!W.closes || !W.distinct || !W.turns) continue; const k = c.findIndex((x) => x >= 10); if (k >= 0) { pick = { W, k, count: c[k] }; break; } }
  const ex = pick ? expand(G, pick.W, O.tau, pick.k) : null, check = ex ? checkCycle(G, ex.cyc, O.tau) : null;
  MODEL = { mode: S.mode, G, W4, W6, O, c4, c6, S4, S6, T: Tn, pick, ex, check, fam: S.fam };
}
function progress() {
  const M = MODEL, f = Math.min(1, Math.max(0, S.nowFrac));
  if (M.mode === 'base') { const k = Math.min(M.G.N - 1, Math.floor(f * M.G.N)); const W = M.fam === 4 ? M.W4 : M.W6, c = M.fam === 4 ? M.c4 : M.c6; return { f, k, W, count: c[k] }; }
  const step = Math.min(64, Math.floor(f * 64 + 1e-9)); return { f, step };
}

/* =====================================================================
   5. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const elStr = (G, k) => { const e = G.el(k); return `(${e[0]}, ${e[1]})`; };

/* =====================================================================
   6. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 16000, PTS_MAX = 2400;
const CAMS = { iso: [0.5, 1.0, 15], front: [0.0001, 1.5, 15], top: [0.0001, 0.06, 14] };
const cam = { theta: 0.5, phi: 1.0, r: 15, tTheta: 0.5, tPhi: 1.0, tR: 15 };
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
function torusPos(G, k) {   // around the big circle: the discrete logarithm of x; around the tube: y
  const e = G.el(k), ph = 2 * Math.PI * G.dlog[e[0]] / (G.p - 1), th = 2 * Math.PI * e[1] / G.p, R = 4.6, rho = 1.8;
  return [(R + rho * Math.cos(th)) * Math.cos(ph), rho * Math.sin(th), (R + rho * Math.cos(th)) * Math.sin(ph)];
}
/* a fixed planar layout of H₁₅ (copy A on the left, B on the right, z on top), in gadget units */
const GLAY = [[-1.1, -0.9], [-0.25, 0.1], [-0.55, 0.85], [-1.25, 0.15], [-1.0, 0.65], [-0.65, -0.35], [-1.55, -0.2], [1.1, -0.9], [0.25, 0.1], [0.55, 0.85], [1.25, 0.15], [1.0, 0.65], [0.65, -0.35], [1.55, -0.2], [0, 1.35]];
function gadgetPos(i, j) {   // copy i of the ring of 14 gadgets, vertex j
  const ang = 2 * Math.PI * i / 14, R = 5.2, s = 0.62, [gx, gy] = GLAY[j], tx = -Math.sin(ang), tz = Math.cos(ang);
  return [R * Math.cos(ang) + gx * s * tx, gy * s, R * Math.sin(ang) + gx * s * tz];
}
function updateGL() {
  const M = MODEL, pr = progress(), G = M.G;
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; for (const p of [a, b]) { Pp[3 * v] = p[0]; Pp[3 * v + 1] = p[1]; Pp[3 * v + 2] = p[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; } };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  if (M.mode === 'base') {
    for (let k = 0; k < G.N; k++) {
      const x = G.el(k), P = torusPos(G, k);
      for (const s of ['t', 'g']) { const y = G.id(G.mul(x, G.gen[s])); if (s === 'g' || k < y) seg(P, torusPos(G, y), TYPE_RGB[s], s === 't' ? 0.05 : 0.08); }
      dot(P, TYPE_RGB[M.O.sigma[k]], 0.35, 0.55);
    }
    const x0 = G.el(pr.k), cyc = pr.W.pref.map((e) => G.id(G.mul(x0, e)));
    cyc.forEach((u, i) => { const w = cyc[(i + 1) % 14], c = TYPE_RGB[pr.W.word[i]]; seg(torusPos(G, u), torusPos(G, w), c, 1); const isU = M.O.sigma[u] !== pr.W.unused[i]; dot(torusPos(G, u), isU ? [1, 1, 1] : c, 1, isU ? 2.6 : 1.4); });
  } else if (M.ex) {
    const ex = M.ex, cyc = ex.cyc, step = pr.step;
    ex.verts.forEach((copy, i) => { for (const [a, b] of H15) seg(gadgetPos(i, a), gadgetPos(i, b), COL.cyan, 0.16); for (const [nm, j] of Object.entries(PORT)) dot(gadgetPos(i, j), nm === 'u' ? COL.magenta : COL.cyan, 0.8, 1.2); });
    const posOf = (q) => gadgetPos(ex.verts.indexOf(q[0]), q[1]);
    for (let e = 0; e < 64; e++) { const a = posOf(cyc[e]), b = posOf(cyc[(e + 1) % 64]), done = e < step; seg(a, b, cyc[e][0] === cyc[(e + 1) % 64][0] ? COL.amber : [1, 1, 1], done ? 1 : 0.22); }
    if (step < 64) dot(posOf(cyc[step]), [1, 1, 1], 1, 3.2);
  }
  lines.geometry.setDrawRange(0, v); Lb.position.needsUpdate = true; Lb.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 60 * renderer.getPixelRatio() * (stage.clientHeight / 600);
}

/* =====================================================================
   7. Camera
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.5 : 1);
  camera.position.set(r * sp * Math.sin(cam.theta), r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
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
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(32, Math.max(7, cam.tR * drag.pinch / d)); drag.pinch = d; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY;
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => { if (!drag.pts.has(ev.pointerId)) return; drag.pts.delete(ev.pointerId); if (drag.pts.size === 0) drag.pinch = 0; };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(32, Math.max(7, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   8. Tags
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
  if (M.mode === 'base') {
    const x0 = M.G.el(pr.k); put(T(`平移 x = ${elStr(M.G, pr.k)} · 经过 u ${pr.count} 次`, `translate x = ${elStr(M.G, pr.k)} · ${pr.count} visits through u`), torusPos(M.G, M.G.id(x0)).map((c, i) => (i === 1 ? c + 0.6 : c)), pr.count >= 10 ? 'hot' : 'cy');
  } else if (M.ex) {
    M.ex.visits.forEach((q, i) => { if (i % 2 === 0) put(`${q.len}`, gadgetPos(i, 14).map((c, j) => (j === 1 ? c + 0.45 : c)), q.len === 3 ? 'hot' : 'cy'); });
  }
  for (let i = k; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}

/* =====================================================================
   9. 2D panels
   ===================================================================== */
function frame2d(cv, pl0 = 46) {
  const dpr = fitCanvas(cv), ctx = cv.getContext('2d'), Wd = cv.width, Hh = cv.height;
  ctx.clearRect(0, 0, Wd, Hh);
  const pl = pl0 * dpr, pr = 12 * dpr, pt = 10 * dpr, pb = 20 * dpr;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  return { dpr, ctx, W: Wd, Hh, pl, pt, iw: Wd - pl - pr, ih: Hh - pt - pb };
}
function drawMain() {
  const M = MODEL, F = frame2d(cv1, 36); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  ctx.fillStyle = DIM; ctx.textBaseline = 'top';
  if (M.mode === 'base') {
    const h4 = new Array(15).fill(0), h6 = new Array(15).fill(0); M.c4.forEach((c) => h4[c]++); M.c6.forEach((c) => h6[c]++);
    const top = Math.max(...h4, ...h6, 1), w = iw / 15, Y = (y) => pt + ih - ih * y / (top * 1.1);
    ctx.fillStyle = 'rgba(255, 79, 216, 0.08)'; ctx.fillRect(pl + 10 * w, pt, 5 * w, ih);
    for (let c = 0; c <= 14; c++) {
      const x = pl + c * w; ctx.fillStyle = 'rgba(25, 224, 255, 0.65)'; ctx.fillRect(x + 2 * dpr, Y(h4[c]), w / 2 - 3 * dpr, pt + ih - Y(h4[c]));
      ctx.fillStyle = 'rgba(255, 79, 216, 0.65)'; ctx.fillRect(x + w / 2 + 1 * dpr, Y(h6[c]), w / 2 - 3 * dpr, pt + ih - Y(h6[c]));
      ctx.fillStyle = c === pr.count ? AM : DIM; ctx.textAlign = 'center'; ctx.fillText(String(c), x + w / 2, pt + ih + 4 * dpr);
    }
    ctx.strokeStyle = AM; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(pl + 10 * w, pt); ctx.lineTo(pl + 10 * w, pt + ih); ctx.stroke(); ctx.setLineDash([]);
    $('c1Meta').textContent = T('青 = 四个 t 的词 · 品红 = 六个 t 的词 · 粉区 = 至少 10 次', 'cyan = four-t word · magenta = six-t word · shaded = at least 10');
  } else if (M.ex) {
    const w = iw / 14, Y = (y) => pt + ih - ih * y / 6;
    M.ex.visits.forEach((q, i) => {
      const x = pl + i * w, upto = Math.max(0, Math.min(q.len + 1, pr.step - M.ex.visits.slice(0, i).reduce((s, z) => s + z.len + 1, 0)));
      ctx.strokeStyle = FAINT; ctx.strokeRect(x + 3 * dpr, Y(q.len + 1), w - 6 * dpr, pt + ih - Y(q.len + 1));
      ctx.fillStyle = q.len === 3 ? 'rgba(255, 200, 61, 0.8)' : 'rgba(25, 224, 255, 0.6)'; ctx.fillRect(x + 3 * dpr, Y(upto), w - 6 * dpr, pt + ih - Y(upto));
      ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.fillText(`${q.from}${q.to}`, x + w / 2, pt + ih + 4 * dpr);
    });
    $('c1Meta').textContent = T('每次经过：内部路长 + 1 条外部边；琥珀 = 3 边路，青 = 5 边路', 'each visit: internal path length + 1 external edge; amber = 3-edge path, cyan = 5-edge path');
  }
}
function drawSide() {
  const M = MODEL, F = frame2d(cv2, 14); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  if (M.mode === 'base') {
    const N = M.G.N, rows = [['S₄/N', M.S4 / N, CY, 2], ['S₆/N', M.S6 / N, MG, 1], ['(2S₄ + S₆)/N', (2 * M.S4 + M.S6) / N, AM, 0]], X = (v) => pl + 96 * dpr + (iw - 110 * dpr) * v / 30, h = ih / 3;
    rows.forEach(([lab, val, col], i) => { const y = pt + i * h + h * 0.2; ctx.fillStyle = col; ctx.globalAlpha = 0.7; ctx.fillRect(X(0), y, X(val) - X(0), h * 0.55); ctx.globalAlpha = 1; ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(val.toFixed(3), X(val) + 4 * dpr, y + h * 0.28); ctx.fillStyle = DIM; ctx.fillText(lab, pl, y + h * 0.28); });
    for (const [v, lab] of [[9, '9'], [27, '27'], [28, '28']]) { ctx.strokeStyle = v === 28 ? AM : MG; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(X(v), pt); ctx.lineTo(X(v), pt + ih); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(lab, X(v), pt + ih + 3 * dpr); }
    $('c2Meta').textContent = T('若每个平移都 ≤ 9 次，则 S₄、S₆ ≤ 9N，(2S₄ + S₆)/N ≤ 27；它却恒等于 28', 'if every translate had ≤ 9 visits, then S₄, S₆ ≤ 9N and (2S₄ + S₆)/N ≤ 27; yet it always equals 28');
  } else {
    const cx = pl + iw / 2, cy = pt + ih / 2 + 4 * dpr, s = Math.min(iw / 3.6, ih / 2.6), P = (j) => [cx + GLAY[j][0] * s, cy - GLAY[j][1] * s];
    const cur = M.ex ? (() => { let e = pr.step; for (const q of M.ex.visits) { if (e < q.len + 1) return q; e -= q.len + 1; } return null; })() : null;
    ctx.strokeStyle = 'rgba(25, 224, 255, 0.35)'; ctx.lineWidth = 1.2 * dpr; for (const [a, b] of H15) { ctx.beginPath(); ctx.moveTo(...P(a)); ctx.lineTo(...P(b)); ctx.stroke(); }
    if (cur) { ctx.strokeStyle = cur.len === 3 ? AM : MG; ctx.lineWidth = 3 * dpr; ctx.beginPath(); cur.path.forEach((j, i) => (i ? ctx.lineTo(...P(j)) : ctx.moveTo(...P(j)))); ctx.stroke(); }
    ctx.lineWidth = 1;
    for (let j = 0; j < 15; j++) { const [x, y] = P(j), port = Object.entries(PORT).find(([, q]) => q === j); ctx.fillStyle = port ? (port[0] === 'u' ? MG : CY) : INK; ctx.beginPath(); ctx.arc(x, y, (port ? 4.5 : 2.6) * dpr, 0, 2 * Math.PI); ctx.fill(); if (port) { ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(port[0], x, y - 6 * dpr); } }
    $('c2Meta').textContent = cur ? T(`当前这次经过：${cur.from} → ${cur.to}，${cur.len} 条内部边`, `current visit: ${cur.from} → ${cur.to}, ${cur.len} internal edges`) : T('小部件 H₁₅ 与三个端口', 'the gadget H₁₅ and its three ports');
  }
}

/* =====================================================================
   10. Readouts and controls
   ===================================================================== */
let syncedKey = '', toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function setRo(rows) { rows.forEach(([l, v], i) => { $(`ro${i + 1}L`).textContent = l; $(`ro${i + 1}`).textContent = v; }); }
function pill(id, label, value) { $(id).innerHTML = `${label} <strong>${value}</strong>`; }
function readouts() {
  const M = MODEL, pr = progress(), G = M.G, N = G.N, max4 = Math.max(...M.c4), max6 = Math.max(...M.c6);
  if (M.mode === 'base') {
    setRo([[T('实例 · 顶点数 N', 'Instance · vertices N'), `AGL(1, ${G.p}), a = ${G.a} · ${N}`], [T('T = σ 取 t 的顶点数', 'T = vertices with σ = t'), String(M.T)],
      [T('S₄ = 10N − 2T · S₆ = 8N + 4T', 'S₄ = 10N − 2T · S₆ = 8N + 4T'), `${M.S4} = ${10 * N - 2 * M.T} · ${M.S6} = ${8 * N + 4 * M.T}`],
      [T('2S₄ + S₆ = 28N · 当前平移经过 u', '2S₄ + S₆ = 28N · this translate through u'), `${2 * M.S4 + M.S6} = ${28 * N} · ${pr.count}`],
      [T('结论', 'Verdict'), T(`最多的平移经过 u ${Math.max(max4, max6)} 次 ≥ 10，可以展开成 64 圈；Lean 对一切取向证明了这一点（冻结定理）`, `the busiest translate passes through u ${Math.max(max4, max6)} times ≥ 10 and expands to a 64-cycle; Lean proves this for every orientation (the frozen theorem)`)]]);
    pill('pillA', 'N', String(N)); pill('pillB', 'T', String(M.T)); pill('pillC', 'max', String(Math.max(max4, max6))); pill('pillD', '28N', String(28 * N));
    $('roNote').innerHTML = T(`第 ${pr.k + 1} 个平移从 x = ${elStr(G, pr.k)} 出发，白点是经过端口 u 的顶点。`, `Translate ${pr.k + 1} starts at x = ${elStr(G, pr.k)}; white dots are the vertices passed through port u.`);
  } else {
    const ex = M.ex, ck = M.check;
    setRo([[T('平移 · 词', 'Translate · word'), ex ? `${elStr(G, M.pick.k)} · ${M.pick.W.word}` : '—'], [T('经过 u 的次数', 'Visits through u'), ex ? `${M.pick.count} ≥ 10` : '—'],
      [T('长度', 'Length'), ex ? `14 + ${ex.visits.filter((q) => q.len === 3).length}·3 + ${ex.visits.filter((q) => q.len === 5).length}·5 = ${ex.cyc.length}` : '—'],
      [T('逐边核对', 'Edge-by-edge check'), ck ? `${ck.distinct ? T('64 个不同顶点 ✓', '64 distinct vertices ✓') : T('有重复顶点 ✗', 'repeated vertex ✗')} · ${ck.edges ? T('每一步都是边 ✓', 'every step is an edge ✓') : T('有断开 ✗', 'a gap ✗')}` : '—'],
      [T('结论', 'Verdict'), T('替换图里有长度恰为 64 = 2⁶ 的简单圈：这个取向失败，Lean 证明每个取向都失败（冻结定理）', 'the replacement graph has a simple cycle of length exactly 64 = 2⁶: this orientation fails, and Lean proves every orientation fails (the frozen theorem)')]]);
    pill('pillA', T('步', 'STEP'), `${pr.step}/64`); pill('pillB', 'u', ex ? String(M.pick.count) : '—'); pill('pillC', T('长度', 'LEN'), ex ? String(ex.cyc.length) : '—'); pill('pillD', T('顶点', 'VERTS'), String(15 * N));
    $('roNote').innerHTML = T(`替换图有 15N = ${15 * N} 个顶点。`, `The replacement graph has 15N = ${15 * N} vertices.`);
  }
}
function syncOutputs() {
  if (dirty) { build(); dirty = false; syncedKey = ''; toasted = false; }
  const M = MODEL, key = `${S.mode}|${S.nowFrac}|${TRV.lang()}`;
  if (key === syncedKey) return; syncedKey = key;
  const pr = progress();
  readouts();
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  document.querySelectorAll('#instChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.inst === `${S.p}-${S.a}`)));
  document.querySelectorAll('#sigmaChips .chip[data-sigma]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sigma === S.sigma)));
  document.querySelectorAll('#famChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.fam === S.fam)));
  $('famChips').hidden = S.mode !== 'base';
  $('wordNote').innerHTML = T(`四个 t：<code>${M.W4.word}</code>（空闲类型 t、g、r：${['t', 'g', 'r'].map((s) => M.W4.unused.filter((e) => e === s).length).join('、')}）<br>六个 t：<code>${M.W6.word}</code>（${['t', 'g', 'r'].map((s) => M.W6.unused.filter((e) => e === s).length).join('、')}）`, `four t: <code>${M.W4.word}</code> (unused types t, g, r: ${['t', 'g', 'r'].map((s) => M.W4.unused.filter((e) => e === s).length).join(', ')})<br>six t: <code>${M.W6.word}</code> (${['t', 'g', 'r'].map((s) => M.W6.unused.filter((e) => e === s).length).join(', ')})`);
  $('presetNote').innerHTML = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = M.mode === 'base' ? T('时间轴 = 平移的编号。', 'The time axis is the translate index.') : T('时间轴 = 沿 64 圈走过的边数。', 'The time axis is the number of edges walked along the 64-cycle.');
  $('litNote').innerHTML = T('取向、计数与 64 圈都是页面现算的；冻结的是“每种取向都有 64 圈”。', 'The orientation, the counts and the 64-cycle are computed on the page; what is frozen is that every orientation has a 64-cycle.');
  $('c1Title').textContent = M.mode === 'base' ? T('每个平移经过端口 u 的次数', 'Visits through port u per translate') : T('14 次经过，各走多长', 'The 14 visits and their lengths');
  $('c2Title').textContent = M.mode === 'base' ? T('平均恒等式', 'The averaging identity') : T('小部件 H₁₅', 'The gadget H₁₅');
  $('clock').innerHTML = M.mode === 'base' ? `#${pr.k + 1}` : `${pr.step}/64`;
  $('hudBig').textContent = M.mode === 'base' ? `AGL(1, ${M.G.p}) · a = ${M.G.a} · ${M.G.N}` : T(`64 圈 · ${pr.step}/64`, `64-cycle · ${pr.step}/64`);
  $('hudSub').textContent = M.mode === 'base' ? T('环面：绕大圈是 x 的离散对数，绕管是 y；琥珀 = t 边，青 = g 边；点色 = σ；亮线 = 当前的 14 圈，白点 = 经过 u', 'torus: around the ring is the discrete log of x, around the tube is y; amber = t edges, cyan = g edges; dot colour = σ; bright line = the current 14-cycle, white dots = through u')
    : T('14 个小部件排成一圈；琥珀 = 小部件内部的边，白 = 外部边；亮点 = 走到的位置', '14 gadgets in a ring; amber = edges inside a gadget, white = external edges; the bright dot = the current position');
  if (!toasted && S.playing && S.nowFrac >= 1) {
    toasted = true;
    toast(M.mode === 'base' ? T(`<b>扫完</b> ${M.G.N} 个平移：最多 ${Math.max(...(M.fam === 4 ? M.c4 : M.c6))} 次经过 u。`, `<b>Swept</b> ${M.G.N} translates: at most ${Math.max(...(M.fam === 4 ? M.c4 : M.c6))} visits through u.`)
      : T('<b>回到起点</b>：64 条边，64 个不同顶点。', '<b>Back at the start</b>: 64 edges, 64 distinct vertices.'));
  }
}
function syncRail() {
  const M = MODEL, key = `${S.mode}|${M.G.N}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  const marks = M.mode === 'base' ? [[0, '#1'], [0.5, `#${Math.round(M.G.N / 2)}`], [1, `#${M.G.N}`]] : [[0, '0'], [14 / 64, '14'], [32 / 64, '32'], [1, '64']];
  $('marks').innerHTML = marks.map(([f, s], i) => `<i class="${i === 0 ? 'first' : i === marks.length - 1 ? 'last' : ''}" style="left:${(f * 100).toFixed(2)}%">${s}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => { const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'base'; if (S.mode === m) return; S.mode = m; S.nowFrac = 0; custom(); }));
document.querySelectorAll('#instChips .chip').forEach((b) => b.addEventListener('click', () => { const [p, a] = b.dataset.inst.split('-').map(Number); if (!WORDS[p] || !WORDS[p][a]) return; S.p = p; S.a = a; custom(); }));
document.querySelectorAll('#sigmaChips .chip[data-sigma]').forEach((b) => b.addEventListener('click', () => { S.sigma = ['random', 'noT', 'allT'].includes(b.dataset.sigma) ? b.dataset.sigma : 'random'; custom(); }));
$('reroll').addEventListener('click', () => { S.seed = (S.seed % 9973) + 1; if (S.sigma === 'allT') S.sigma = 'random'; custom(); });
document.querySelectorAll('#famChips .chip').forEach((b) => b.addEventListener('click', () => { S.fam = +b.dataset.fam === 6 ? 6 : 4; custom(); }));
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  for (const k of ['mode', 'p', 'a', 'sigma', 'seed', 'fam']) S[k] = p[k];
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
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) {
    ev.preventDefault(); const d = ev.key === 'ArrowRight' ? 1 : -1, pr = progress();
    if (MODEL.mode === 'base') jumpTo((Math.min(MODEL.G.N - 1, Math.max(0, pr.k + d)) + 0.5) / MODEL.G.N); else jumpTo((Math.min(64, Math.max(0, pr.step + d)) + 0.5) / 64);
  }
  else if (ev.key === 'e' || ev.key === 'E') jumpTo(1);
});

/* =====================================================================
   11. Main loop
   ===================================================================== */
let lastT = performance.now(), frameCount = 0;
function resize() {
  if (!glOK) return;
  const r = stage.getBoundingClientRect();
  renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
  camera.aspect = Math.max(0.2, r.width / Math.max(1, r.height)); camera.updateProjectionMatrix();
}
let glKey = '';
function frame(tms) {
  frameCount++;
  const dtSec = Math.min(0.1, (tms - lastT) / 1000); lastT = tms;
  if (dirty) syncOutputs();
  if (S.playing && !scrubbing) {
    if (S.hold > 0) { S.hold -= dtSec; if (S.hold <= 0) { S.nowFrac = S.dir > 0 ? 0 : 1; toasted = false; } }
    else {
      S.nowFrac += S.dir * dtSec * S.speed / RUN[MODEL.mode];
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 2.4; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.2; }
    }
    $('now').value = S.nowFrac;
  }
  syncOutputs(); syncRail();
  if (glOK) { updateCamera(dtSec); const pr = progress(), k = `${S.mode}|${S.p}|${S.a}|${S.sigma}|${S.seed}|${S.fam}|${MODEL.mode === 'base' ? pr.k : pr.step}`; if (k !== glKey) { updateGL(); glKey = k; } renderer.render(scene3, camera); updateTags(); }
  drawMain(); drawSide();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { syncedKey = ''; syncOutputs(); $('marks').dataset.key = ''; });

/* read-only probe for automated browser tests */
window.PC_DEBUG = {
  pending: () => dirty || syncedKey !== `${S.mode}|${S.nowFrac}|${TRV.lang()}`,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, pr = progress();
    return { mode: M.mode, p: M.G.p, a: M.G.a, N: M.G.N, sigmaMode: S.sigma, seed: S.seed, fam: M.fam, sigma: M.O.sigma, tau: M.O.tau, T: M.T, S4: M.S4, S6: M.S6, c4: M.c4, c6: M.c6,
      words: [M.W4, M.W6].map((W) => ({ word: W.word, closes: W.closes, distinct: W.distinct, unused: W.unused })), k: pr.k, count: pr.count, step: pr.step,
      pick: M.pick ? { k: M.pick.k, word: M.pick.W.word, count: M.pick.count } : null, cycle: M.ex ? M.ex.cyc : null, visits: M.ex ? M.ex.visits.map((q) => ({ len: q.len, from: q.from, to: q.to })) : null, check: M.check };
  },
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('cyc29'); S.playing = false; setPlayUI(); S.nowFrac = 0.8; $('now').value = S.nowFrac; setCamPreset('iso'); };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('avg');
setPlayUI();
requestAnimationFrame(frame);
})();
