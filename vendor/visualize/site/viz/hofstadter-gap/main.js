/* HOFSTADTER//GAP · π/2 磁通 Hofstadter 模型的质量间隙
   The four Bloch bands of the source's 4 × 4 Hamiltonian H(k; m) over the Brillouin torus [0, π]², with the Fermi energy μ = 2;
   the determinant certificate det(H − 2) = −4q and the inertia count used by the frozen proof; the proved gap m²/500 against the
   gap measured on a grid; and the Hofstadter butterfly computed from transfer matrices, with the bands of the model at the
   α = 1/4 slice. Bands come from the characteristic polynomial (traces of powers, Newton identities) and Newton iteration from
   above. Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, ok: OK, cyan: CY, magenta: MG } = TRV.palette;
const MODES = ['bands', 'cert', 'bound', 'butterfly'];
const RUN = { bands: 18, cert: 16, bound: 16, butterfly: 14 };
const MU = 2, KF = Math.PI / 4;
const G = 41;                                   // momentum grid per axis on [0, π]; includes π/4
const GC = 33, MASSES = Array.from({ length: 81 }, (_, i) => -2 + i * 0.05);   // the gap-against-mass curve
const QMAX = 20;                                // butterfly slices p/q with q ≤ QMAX
const BAND_RGB = [[0.42, 0.52, 0.66], [0.2, 0.55, 0.7], COL.cyan, COL.magenta];
const BAND_CSS = ['#6b85a8', '#3390b3', CY, MG];

/* =====================================================================
   2. The Bloch matrix and its bands
   ===================================================================== */
function bloch(k1, k2, m) {   // the source's matrix with its overall minus sign, d = 2 + m; row-major real and imaginary parts
  const d = 2 + m, c1 = Math.cos(2 * k1), s1 = Math.sin(2 * k1), c2 = Math.cos(2 * k2), s2 = Math.sin(2 * k2);
  const re = new Float64Array(16), im = new Float64Array(16);
  const set = (i, j, a, b) => { re[4 * i + j] = -a; im[4 * i + j] = -b; };
  set(0, 0, d, 0); set(0, 1, 1 + s1, -c1); set(0, 2, 1 + s2, -c2);          // 1 − i e^{2ik}
  set(1, 0, 1 + s1, c1); set(1, 3, c2, s2 - 1);                               // 1 + i e^{−2ik₁}, −i + e^{2ik₂}
  set(2, 0, 1 + s2, c2); set(2, 3, 1 - s1, c1);                               // 1 + i e^{−2ik₂}, 1 + i e^{2ik₁}
  set(3, 1, c2, 1 - s2); set(3, 2, 1 - s1, -c1); set(3, 3, -d, 0);           // i + e^{−2ik₂}, 1 − i e^{−2ik₁}
  return { re, im };
}
function charCoeffs(H) {   // x⁴ − e₁x³ + e₂x² − e₃x + e₄ from the power sums pₖ = tr Hᵏ (Newton identities)
  const { re, im } = H, r2 = new Float64Array(16), i2 = new Float64Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let a = 0, b = 0; for (let k = 0; k < 4; k++) { const p = 4 * i + k, q = 4 * k + j; a += re[p] * re[q] - im[p] * im[q]; b += re[p] * im[q] + im[p] * re[q]; } r2[4 * i + j] = a; i2[4 * i + j] = b; }
  let p1 = 0, p2 = 0, p3 = 0, p4 = 0;
  for (let i = 0; i < 4; i++) { p1 += re[5 * i]; p2 += r2[5 * i]; }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const a = 4 * i + j, b = 4 * j + i; p3 += r2[a] * re[b] - i2[a] * im[b]; p4 += r2[a] * r2[a] + i2[a] * i2[a]; }
  const e1 = p1, e2 = (e1 * p1 - p2) / 2, e3 = (e2 * p1 - e1 * p2 + p3) / 3, e4 = (e3 * p1 - e2 * p2 + e1 * p3 - p4) / 4;
  return [1, -e1, e2, -e3, e4];
}
function realRoots(c) {   // all roots of a monic real-rooted polynomial, ascending: Newton from above, then deflation
  let p = c.slice(), x = 1 + Math.max(...c.slice(1).map(Math.abs));
  const out = [];
  while (p.length > 1) {
    const n = p.length - 1;
    for (let it = 0; it < 400; it++) {
      let f = p[0], fp = 0; for (let i = 1; i <= n; i++) { fp = fp * x + f; f = f * x + p[i]; }
      if (f === 0 || fp === 0) break;
      const dx = f / fp; x -= dx; if (Math.abs(dx) <= 1e-15 * (1 + Math.abs(x))) break;
    }
    out.push(x);
    const q = [p[0]]; for (let i = 1; i < n; i++) q.push(p[i] + x * q[i - 1]); p = q;
    x += 1e-6 * (1 + Math.abs(x));
  }
  return out.reverse();
}
const bandsAt = (k1, k2, m) => realRoots(charCoeffs(bloch(k1, k2, m)));
const qOf = (k1, k2, m) => { const d = 2 + m, y1 = Math.sin(2 * k1), y2 = Math.sin(2 * k2); return (y1 - d) ** 2 + (y2 - d) ** 2 + 2 - d * d; };   // det(H − 2) = −4q
const kAt = (i, n) => Math.PI * i / (n - 1);
function bandGrid(m, n) {   // n × n grid on [0, π]²: four bands per point, and the extremes that matter for the gap
  const B = new Float64Array(n * n * 4); let max3 = -Infinity, min4 = Infinity, at3 = null, at4 = null, minDist = Infinity, minAbsDet = Infinity, maxShift = 0, minQ = Infinity, atQ = null;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k1 = kAt(i, n), k2 = kAt(j, n), e = bandsAt(k1, k2, m), o = 4 * (i * n + j);
    for (let b = 0; b < 4; b++) B[o + b] = e[b];
    if (e[2] > max3) { max3 = e[2]; at3 = [k1, k2]; }
    if (e[3] < min4) { min4 = e[3]; at4 = [k1, k2]; }
    const det = e.reduce((s, x) => s * (x - MU), 1); minAbsDet = Math.min(minAbsDet, Math.abs(det));
    for (const x of e) { minDist = Math.min(minDist, Math.abs(x - MU)); maxShift = Math.max(maxShift, Math.abs(x - MU)); }
    const q = qOf(k1, k2, m); if (q < minQ) { minQ = q; atQ = [k1, k2]; }
  }
  return { n, m, B, max3, min4, at3, at4, minDist, minAbsDet, maxShift, minQ, atQ };
}
let CURVE = null;
function gapCurve() {   // measured gap against mass on the GC × GC grid
  if (CURVE) return CURVE;
  CURVE = MASSES.map((m) => { const g = bandGrid(m, GC); return { m, below: MU - g.max3, above: g.min4 - MU, minAbsDet: g.minAbsDet, maxShift: g.maxShift }; });
  return CURVE;
}

/* the loop Γ → k_F → M → X → Γ through the Fermi point */
const LOOP = [[0, 0], [KF, KF], [2 * KF, 2 * KF], [2 * KF, 0], [0, 0]];
const LOOP_NAMES = ['Γ', 'k_F', 'M', 'X', 'Γ'];
const LOOP_LEN = []; { let s = 0; LOOP_LEN.push(0); for (let i = 1; i < LOOP.length; i++) { s += Math.hypot(LOOP[i][0] - LOOP[i - 1][0], LOOP[i][1] - LOOP[i - 1][1]); LOOP_LEN.push(s); } }
const LOOP_TOTAL = LOOP_LEN[LOOP_LEN.length - 1], KF_FRAC = LOOP_LEN[1] / LOOP_TOTAL;
function loopPoint(f) {
  const s = Math.min(1, Math.max(0, f)) * LOOP_TOTAL; let i = 1; while (i < LOOP.length - 1 && LOOP_LEN[i] < s) i++;
  const t = (s - LOOP_LEN[i - 1]) / (LOOP_LEN[i] - LOOP_LEN[i - 1]); return [LOOP[i - 1][0] + t * (LOOP[i][0] - LOOP[i - 1][0]), LOOP[i - 1][1] + t * (LOOP[i][1] - LOOP[i - 1][1])];
}

/* =====================================================================
   3. The Hofstadter butterfly
   ===================================================================== */
function chambersP(E, p, q, withDerivative = false) {   // trace of the transfer-matrix product at phase ν = π/(2q), which equals Chambers' polynomial P_q(E)
  const nu = Math.PI / (2 * q); let a = 1, b = 0, c = 0, d = 1, da = 0, db = 0, dc = 0, dd = 0;
  for (let j = 0; j < q; j++) {
    const v = E - 2 * Math.cos(2 * Math.PI * p * j / q + nu);
    const na = v * a - c, nb = v * b - d, nda = a + v * da - dc, ndb = b + v * db - dd;   // [[v, −1], [1, 0]] times the product, and its E-derivative
    c = a; d = b; dc = da; dd = db; a = na; b = nb; da = nda; db = ndb;
  }
  return withDerivative ? [a + d, da + dd] : a + d;
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
function sliceBands(p, q) {   // the q bands where |P_q(E)| ≤ 4: one root of P_q per band, edges by bisection, touching bands split at the extremum of P_q
  const lo = -4.2, hi = 4.2, P = (E) => chambersP(E, p, q), roots = [];
  let x = hi;
  for (let r = 0; r < q; r++) {   // Newton from above with implicit deflation (P_q is real-rooted, all roots in (−4, 4))
    for (let it = 0; it < 300; it++) {
      const [f, fp] = chambersP(x, p, q, true); if (f === 0) break;
      let s = fp / f; for (const y of roots) s -= 1 / (x - y);
      const dx = 1 / s; x -= dx; if (Math.abs(dx) <= 1e-15 * (1 + Math.abs(x))) break;
    }
    roots.push(x); x -= 1e-9;
  }
  roots.sort((u, w) => u - w);
  const crit = [];
  for (let i = 0; i + 1 < roots.length; i++) { let u = roots[i], w = roots[i + 1]; for (let it = 0; it < 80; it++) { const m1 = u + (w - u) / 3, m2 = w - (w - u) / 3; if (Math.abs(P(m1)) < Math.abs(P(m2))) u = m1; else w = m2; } crit.push((u + w) / 2); }
  const edge = (outside, inside) => { if (Math.abs(P(outside)) <= 4) return outside; let a = outside, b = inside; for (let it = 0; it < 60; it++) { const c = (a + b) / 2; if (Math.abs(P(c)) > 4) a = c; else b = c; } return (a + b) / 2; };
  const intervals = roots.map((r, i) => [edge(i === 0 ? lo : crit[i - 1], r), edge(i === roots.length - 1 ? hi : crit[i], r)]);
  return { p, q, alpha: p / q, intervals, roots };
}
let BUTTERFLY = null;
function butterfly() {
  if (BUTTERFLY) return BUTTERFLY;
  const out = [sliceBands(0, 1)];
  for (let q = 2; q <= QMAX; q++) for (let p = 1; p < q; p++) if (gcd(p, q) === 1) out.push(sliceBands(p, q));
  out.push({ ...sliceBands(1, 1), p: 1, q: 1, alpha: 1 });
  BUTTERFLY = out;
  return out;
}

/* =====================================================================
   4. State and presets
   ===================================================================== */
const S = { mode: 'bands', m: 1, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'sweep' };
const PRESETS = {
  sweep: { mode: 'bands', frac: 0, play: true,
    zh: '质量 m 从 −2 扫到 2：第三（青）、第四（品红）两条能带之间始终有一层空隙把费米能 μ = 2（琥珀平面）夹在中间，只在 m = 0 时在 k<sub>F</sub> = (π/4, π/4) 合拢。m ≠ 0 时一致的间隙是本库证明的。',
    en: 'Sweep the mass m from −2 to 2: a gap between the third (cyan) and fourth (magenta) bands always holds the Fermi energy μ = 2 (amber plane) in between, closing only at m = 0 at k<sub>F</sub> = (π/4, π/4). The uniform gap for m ≠ 0 is proved in this library.' },
  cone: { mode: 'bands', frac: 0.5, play: false,
    zh: 'm = 0：特征多项式在 k<sub>F</sub> 处是 X(X + 4)(X − 2)²，第三、四条能带在 μ = 2 处相碰，附近是一个锥。这正是被定理排除在外的那个质量。',
    en: 'm = 0: at k<sub>F</sub> the characteristic polynomial is X(X + 4)(X − 2)², so the third and fourth bands touch at μ = 2, forming a cone nearby. This is exactly the mass the theorem excludes.' },
  top: { mode: 'bands', frac: 1, play: false,
    zh: 'm = 2：第四条能带的最低点在 k<sub>F</sub>，值是 2 + m = 4（卷宗论证、未形式化），所以间隙不会超过 m；实际间隙由第三条能带的最高点决定，约 0.54。',
    en: 'm = 2: the fourth band is lowest at k<sub>F</sub> with value 2 + m = 4 (argued in the dossier, not formalized), so the gap cannot exceed m; the actual gap is set by the top of the third band, about 0.54.' },
  harper: { mode: 'butterfly', frac: 0, play: false,
    zh: 'm = −2（d = 0）：模型四条能带的带边与 Hofstadter 蝴蝶 α = 1/4 切片的带边一致——±2√2、±√(4 + 2√2)、±√(4 − 2√2)、0。这是页面上的数值对比。',
    en: 'm = −2 (d = 0): the band edges of the four bands of the model match those of the α = 1/4 slice of the Hofstadter butterfly, namely ±2√2, ±√(4 + 2√2), ±√(4 − 2√2) and 0. This is a numerical comparison on the page.' },
  cert: { mode: 'cert', m: 1, frac: 0, play: true,
    zh: '动量沿 Γ → k<sub>F</sub> → M → X → Γ 走一圈，m = 1：H − 2 的四个特征值始终一正三负，行列式恒等于 −4q。负行列式本身只说明负特征值有奇数个；“恰好三个”来自证明里的合同关系。',
    en: 'The momentum goes once around Γ → k<sub>F</sub> → M → X → Γ at m = 1: the four eigenvalues of H − 2 stay one positive and three negative, and the determinant always equals −4q. A negative determinant alone only says the number of negative eigenvalues is odd; “exactly three” comes from the congruence in the proof.' },
  floor: { mode: 'cert', m: 0.25, frac: KF_FRAC, play: false,
    zh: 'm = 0.25，动量停在 k<sub>F</sub>：q 在这里取到整个环面上的最小值 m² = 0.0625，仍在证明用的地板 m²/2 之上。',
    en: 'm = 0.25 with the momentum at k<sub>F</sub>: here q reaches its minimum over the whole torus, m² = 0.0625, still above the floor m²/2 used by the proof.' },
  bound: { mode: 'bound', frac: 0, play: true,
    zh: '证明给出的 δ = m²/500 与网格上量到的实际间隙对比（对数纵轴）：界总是成立，但小了两个数量级。证明的目标是“对每个 m 存在间隙”，不是最优常数。',
    en: 'The proved δ = m²/500 against the gap measured on a grid (log scale): the bound always holds but is two orders of magnitude small. The proof aims at “a gap exists for every m”, not at the optimal constant.' },
  tiny: { mode: 'bound', frac: 0.525, play: false,
    zh: 'm = 0.1：实际间隙约 0.033，证明的 δ 只有 0.00002。界之所以小：|det(H − 2)| 至少 2m²，其他三个因子按 Gershgorin 每个至多 10，相除得 m²/500。',
    en: 'm = 0.1: the actual gap is about 0.033 while the proved δ is only 0.00002. The bound is small because |det(H − 2)| is at least 2m² and Gershgorin allows each of the other three factors up to 10; dividing gives m²/500.' }
};

/* =====================================================================
   5. The model
   ===================================================================== */
let MODEL = null, dirty = true;
const massOf = (f) => -2 + 4 * Math.min(1, Math.max(0, f));
function build() { MODEL = { mode: S.mode, grid: null, gridKey: null }; }
function gridFor(m) {   // the band grid for the mass currently shown, recomputed only when the mass changes
  const key = `${m}`; if (MODEL.gridKey !== key) { MODEL.grid = bandGrid(m, G); MODEL.gridKey = key; }
  return MODEL.grid;
}
function progress() {
  const M = MODEL, f = Math.min(1, Math.max(0, S.nowFrac));
  if (M.mode === 'cert') {
    const m = S.m, [k1, k2] = loopPoint(f), e = bandsAt(k1, k2, m), K = e.map((x) => x - MU), q = qOf(k1, k2, m);
    return { f, m, k1, k2, e, K, q, det: K.reduce((s, x) => s * x, 1), nPos: K.filter((x) => x > 1e-12).length, nNeg: K.filter((x) => x < -1e-12).length, grid: gridFor(m) };
  }
  const m = massOf(f), g = gridFor(m), kF = bandsAt(KF, KF, m);
  return { f, m, g, kF, delta: m * m / 500, gap: Math.min(MU - g.max3, g.min4 - MU) };
}

/* =====================================================================
   6. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const num = (v, d = 4) => (v === null || v === undefined || !isFinite(v) ? '—' : (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d));
const sci = (v) => (v === 0 ? '0' : Math.abs(v) >= 0.01 ? v.toFixed(4) : v.toExponential(2));

/* =====================================================================
   7. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 36000, PTS_MAX = 6000;
const CAMS = { iso: [0.85, 1.05, 15], front: [0.0001, 1.5708, 13], top: [0.0001, 0.06, 15] };
const cam = { theta: 0.85, phi: 1.05, r: 15, tTheta: 0.85, tPhi: 1.05, tR: 15 };
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
const KX = (k) => (k / Math.PI - 0.5) * 6;           // momentum → scene
const EY = (E) => E * 0.55;                          // energy → scene height
const QY = (q, m) => -2.6 + 0.75 * Math.sqrt(Math.max(0, q));
const DY = (D) => -2.4 + 1.9 * D;
const BX = (alpha) => (alpha - 0.5) * 7.5, BY = (E) => E * 0.68;
function updateGL() {
  const M = MODEL, pr = progress();
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp[3 * v] = a[0]; Pp[3 * v + 1] = a[1]; Pp[3 * v + 2] = a[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; Pp[3 * v] = b[0]; Pp[3 * v + 1] = b[1]; Pp[3 * v + 2] = b[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  const box = (y0) => { const c = [[0, 0], [Math.PI, 0], [Math.PI, Math.PI], [0, Math.PI]]; for (let i = 0; i < 4; i++) seg([KX(c[i][0]), y0, KX(c[i][1])], [KX(c[(i + 1) % 4][0]), y0, KX(c[(i + 1) % 4][1])], COL.gray, 0.5); };
  const plane = (y, col, k) => { for (let i = 0; i <= 8; i++) { const t = Math.PI * i / 8; seg([KX(t), y, KX(0)], [KX(t), y, KX(Math.PI)], col, k); seg([KX(0), y, KX(t)], [KX(Math.PI), y, KX(t)], col, k); } };
  const surface = (val, col, k, step = 1) => {   // val(i, j) on the G × G grid as a wireframe
    for (let i = 0; i < G; i += step) for (let j = 0; j + step < G; j += step) { seg([KX(kAt(i, G)), val(i, j), KX(kAt(j, G))], [KX(kAt(i, G)), val(i, j + step), KX(kAt(j + step, G))], col, k); seg([KX(kAt(j, G)), val(j, i), KX(kAt(i, G))], [KX(kAt(j + step, G)), val(j + step, i), KX(kAt(i, G))], col, k); }
  };
  if (M.mode === 'bands') {
    const g = pr.g; box(EY(-5.6));
    for (let b = 0; b < 4; b++) surface((i, j) => EY(g.B[4 * (i * G + j) + b]), BAND_RGB[b], b >= 2 ? 0.55 : 0.28, 2);
    plane(EY(MU), COL.amber, 0.35);
    seg([KX(KF), EY(-5.6), KX(KF)], [KX(KF), EY(5.6), KX(KF)], COL.gray, 0.45);
    dot([KX(g.at3[0]), EY(g.max3), KX(g.at3[1])], COL.cyan, 1, 1.6); dot([KX(g.at4[0]), EY(g.min4), KX(g.at4[1])], COL.magenta, 1, 1.6);
    pr.kF.forEach((x, b) => dot([KX(KF), EY(x), KX(KF)], BAND_RGB[b], 0.9, 1.1));
  } else if (M.mode === 'cert') {
    const m = pr.m, floor = m * m / 2; box(QY(0));
    surface((i, j) => QY(qOf(kAt(i, G), kAt(j, G), m)), COL.cyan, 0.45, 2);
    plane(QY(floor), COL.amber, 0.4);
    for (let s = 0; s < 120; s++) { const a = loopPoint(s / 120), b = loopPoint((s + 1) / 120); seg([KX(a[0]), QY(qOf(a[0], a[1], m)) + 0.02, KX(a[1])], [KX(b[0]), QY(qOf(b[0], b[1], m)) + 0.02, KX(b[1])], COL.magenta, 0.9); }
    const P = [KX(pr.k1), QY(pr.q), KX(pr.k2)]; dot(P, [1, 1, 1], 1, 1.6); seg([P[0], QY(0), P[2]], P, [1, 1, 1], 0.5);
    const g = pr.grid; dot([KX(g.atQ[0]), QY(g.minQ), KX(g.atQ[1])], COL.amber, 1, 1.4);
  } else if (M.mode === 'bound') {
    const g = pr.g; box(DY(0));
    surface((i, j) => { const o = 4 * (i * G + j); let d = Infinity; for (let b = 0; b < 4; b++) d = Math.min(d, Math.abs(g.B[o + b] - MU)); return DY(d); }, COL.cyan, 0.5, 2);
    plane(DY(pr.delta), COL.amber, 0.45);
    plane(DY(g.minDist), COL.magenta, 0.18);
  } else {
    const B = butterfly(); seg([BX(0), BY(-4.3), 0], [BX(1), BY(-4.3), 0], COL.gray, 0.5); seg([BX(0), BY(-4.3), 0], [BX(0), BY(4.3), 0], COL.gray, 0.5);
    for (const s of B) {
      const hot = s.p === 1 && s.q === 4, col = hot ? COL.amber : COL.cyan, k = hot ? 1 : 0.85;
      for (const [a, b] of s.intervals) seg([BX(s.alpha), BY(a), 0], [BX(s.alpha), BY(b), 0], col, k);
      for (const r of s.roots) dot([BX(s.alpha), BY(r), 0], col, hot ? 1 : 0.7, hot ? 1 : 0.6);
    }
    const g = pr.g;
    for (let b = 0; b < 4; b++) { let lo = Infinity, hi = -Infinity; for (let i = 0; i < G * G; i++) { lo = Math.min(lo, g.B[4 * i + b]); hi = Math.max(hi, g.B[4 * i + b]); } for (const o of [-0.06, 0, 0.06]) seg([BX(0.25) + 0.22 + o, BY(lo), 0.3], [BX(0.25) + 0.22 + o, BY(hi), 0.3], BAND_RGB[b], 0.9); }
  }
  lines.geometry.setDrawRange(0, v); Lb.position.needsUpdate = true; Lb.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 60 * renderer.getPixelRatio() * (stage.clientHeight / 600);
}

/* =====================================================================
   8. Camera
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
   9. Tags
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
  if (M.mode === 'bands') {
    put('μ = 2', [KX(Math.PI) + 0.5, EY(MU), KX(0)], 'hot'); put('k_F', [KX(KF), EY(5.6) + 0.3, KX(KF)], '');
    put('k₁', [KX(Math.PI) + 0.4, EY(-5.6), KX(Math.PI / 2)], 'tick'); put('k₂', [KX(Math.PI / 2), EY(-5.6), KX(Math.PI) + 0.4], 'tick');
    put('λ₄', [KX(0) - 0.4, EY(pr.g.B[3]), KX(0)], 'mg'); put('λ₃', [KX(0) - 0.4, EY(pr.g.B[2]), KX(0)], 'cy');
  } else if (M.mode === 'cert') {
    put(`q ≥ m²/2 = ${num(pr.m * pr.m / 2, 4)}`, [KX(Math.PI) + 0.6, QY(pr.m * pr.m / 2), KX(0)], 'hot');
    put(`q = ${num(pr.q, 3)}`, [KX(pr.k1), QY(pr.q) + 0.35, KX(pr.k2)], 'cy');
    LOOP.slice(0, 4).forEach((p, i) => put(LOOP_NAMES[i], [KX(p[0]), QY(0) - 0.3, KX(p[1])], ''));
  } else if (M.mode === 'bound') {
    put(`δ = m²/500 = ${sci(pr.delta)}`, [KX(Math.PI) + 0.6, DY(pr.delta), KX(0)], 'hot');
    put(T(`实际间隙 ${num(pr.g.minDist, 3)}`, `actual gap ${num(pr.g.minDist, 3)}`), [KX(0) - 0.6, DY(pr.g.minDist), KX(Math.PI)], 'mg');
  } else {
    put('α = 1/4', [BX(0.25), BY(4.3) + 0.3, 0], 'hot'); put('α = 1/2', [BX(0.5), BY(4.3) + 0.3, 0], ''); put('α', [BX(1) + 0.3, BY(-4.3), 0], 'tick'); put('E', [BX(0), BY(4.3) + 0.3, 0], 'tick');
    put(T(`模型 m = ${num(pr.m, 2)}`, `model m = ${num(pr.m, 2)}`), [BX(0.25) + 0.9, BY(-3.4), 0.3], 'mg');
  }
  for (let i = k; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}

/* =====================================================================
   10. 2D panels
   ===================================================================== */
function frame2d(cv, pl0 = 46) {
  const dpr = fitCanvas(cv), ctx = cv.getContext('2d'), Wd = cv.width, Hh = cv.height;
  ctx.clearRect(0, 0, Wd, Hh);
  const pl = pl0 * dpr, pr = 12 * dpr, pt = 10 * dpr, pb = 20 * dpr;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  return { dpr, ctx, W: Wd, Hh, pl, pt, iw: Wd - pl - pr, ih: Hh - pt - pb };
}
const yTicks = (ctx, dpr, pl, Y, vals, fmt) => { ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of vals) ctx.fillText(fmt(g), pl - 4 * dpr, Y(g)); };
const xTicks = (ctx, dpr, pt, ih, X, vals, fmt) => { ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const g of vals) ctx.fillText(fmt(g), X(g), pt + ih + 3 * dpr); };
const hline = (ctx, y, pl, iw, col, dpr, dash = true) => { ctx.strokeStyle = col; if (dash) ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(pl + iw, y); ctx.stroke(); ctx.setLineDash([]); };
const vline = (ctx, x, pt, ih, col, dpr) => { ctx.strokeStyle = col; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + ih); ctx.stroke(); ctx.setLineDash([]); };
const curve = (ctx, xs, ys, X, Y, col, w, dpr) => { ctx.strokeStyle = col; ctx.lineWidth = w * dpr; ctx.beginPath(); let started = false; xs.forEach((x, i) => { const y = ys[i]; if (!isFinite(y)) { started = false; return; } if (started) ctx.lineTo(X(x), Y(y)); else { ctx.moveTo(X(x), Y(y)); started = true; } }); ctx.stroke(); ctx.lineWidth = 1; };
function drawMain() {
  const M = MODEL, F = frame2d(cv1); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  if (M.mode === 'bands' || M.mode === 'cert') {
    const m = M.mode === 'cert' ? pr.m : pr.m, N = 240, xs = Array.from({ length: N + 1 }, (_, i) => i / N);
    if (M.mode === 'bands') {
      const E = xs.map((f) => { const [a, b] = loopPoint(f); return bandsAt(a, b, m); }), lo = -5.6, hi = 5.6, X = (f) => pl + f * iw, Y = (e) => pt + ih - (e - lo) / (hi - lo) * ih;
      yTicks(ctx, dpr, pl, Y, [-4, -2, 0, 2, 4], String); hline(ctx, Y(MU), pl, iw, AM, dpr);
      LOOP_LEN.forEach((s, i) => { const x = X(s / LOOP_TOTAL); vline(ctx, x, pt, ih, FAINT, dpr); ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(LOOP_NAMES[i], x, pt + ih + 3 * dpr); });
      for (let b = 0; b < 4; b++) curve(ctx, xs, E.map((e) => e[b]), X, Y, BAND_CSS[b], b >= 2 ? 1.8 : 1.2, dpr);
      $('c1Title').textContent = T(`m = ${num(m, 2)} 时沿 Γ → k_F → M → X → Γ 的四条能带；琥珀虚线 = μ = 2`, `THE FOUR BANDS ALONG Γ → k_F → M → X → Γ AT m = ${num(m, 2)}; AMBER DASHES = μ = 2`);
      $('c1Meta').textContent = T('青 = λ₃，品红 = λ₄', 'cyan = λ₃, magenta = λ₄');
    } else {
      const qs = xs.map((f) => { const [a, b] = loopPoint(f); return qOf(a, b, m); }), hi = Math.max(...qs) * 1.08, X = (f) => pl + f * iw, Y = (q) => pt + ih - q / hi * ih;
      yTicks(ctx, dpr, pl, Y, [0, hi / 2, hi].map((v) => +v.toFixed(2)), (v) => v.toFixed(2));
      LOOP_LEN.forEach((s, i) => { const x = X(s / LOOP_TOTAL); vline(ctx, x, pt, ih, FAINT, dpr); ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(LOOP_NAMES[i], x, pt + ih + 3 * dpr); });
      ctx.fillStyle = AM; ctx.globalAlpha = 0.12; ctx.fillRect(pl, Y(m * m / 2), iw, pt + ih - Y(m * m / 2)); ctx.globalAlpha = 1; hline(ctx, Y(m * m / 2), pl, iw, AM, dpr);
      curve(ctx, xs, qs, X, Y, CY, 1.8, dpr);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(X(pr.f), Y(pr.q), 4 * dpr, 0, 2 * Math.PI); ctx.fill();
      $('c1Title').textContent = T(`沿闭路的 q = (y₁ − d)² + (y₂ − d)² + 2 − d²；琥珀 = 地板 m²/2 = ${num(m * m / 2, 4)}`, `q = (y₁ − d)² + (y₂ − d)² + 2 − d² ALONG THE LOOP; AMBER = THE FLOOR m²/2 = ${num(m * m / 2, 4)}`);
      $('c1Meta').textContent = T('白点 = 当前动量', 'white dot = current momentum');
    }
  } else if (M.mode === 'bound') {
    const C = gapCurve(), X = (m) => pl + (m + 2) / 4 * iw, lo = -6, hi = 0.5, Y = (v) => pt + ih - (Math.log10(Math.max(v, 1e-6)) - lo) / (hi - lo) * ih;
    yTicks(ctx, dpr, pl, Y, [1e-6, 1e-4, 1e-2, 1], (v) => (v >= 1 ? '1' : `1e${Math.round(Math.log10(v))}`)); xTicks(ctx, dpr, pt, ih, X, [-2, -1, 0, 1, 2], (v) => `m=${v}`);
    const xs = C.map((c) => c.m);
    curve(ctx, xs, C.map((c) => (Math.abs(c.m) < 1e-9 ? NaN : Math.min(c.below, c.above))), X, Y, MG, 1.8, dpr);
    curve(ctx, xs, C.map((c) => (Math.abs(c.m) < 1e-9 ? NaN : c.m * c.m / 500)), X, Y, AM, 1.8, dpr);
    vline(ctx, X(pr.m), pt, ih, INK, dpr);
    $('c1Title').textContent = T('实际间隙（品红，33 × 33 网格）与证明的 δ = m²/500（琥珀），对数纵轴', 'ACTUAL GAP (MAGENTA, 33 × 33 GRID) AND THE PROVED δ = m²/500 (AMBER), LOG SCALE');
    $('c1Meta').textContent = T(`当前 m = ${num(pr.m, 2)}`, `current m = ${num(pr.m, 2)}`);
  } else {
    const B = butterfly(), X = (a) => pl + a * iw, lo = -4.3, hi = 4.3, Y = (e) => pt + ih - (e - lo) / (hi - lo) * ih;
    yTicks(ctx, dpr, pl, Y, [-4, -2, 0, 2, 4], String); xTicks(ctx, dpr, pt, ih, X, [0, 0.25, 0.5, 0.75, 1], (v) => `α=${v}`);
    for (const s of B) { const hot = s.p === 1 && s.q === 4; ctx.strokeStyle = hot ? AM : CY; ctx.globalAlpha = hot ? 1 : 0.7; ctx.lineWidth = (hot ? 2.2 : 1.1) * dpr; for (const [a, b] of s.intervals) { ctx.beginPath(); ctx.moveTo(X(s.alpha), Y(a)); ctx.lineTo(X(s.alpha), Y(b) - 0.5 * dpr); ctx.stroke(); } ctx.fillStyle = hot ? AM : CY; for (const r of s.roots) ctx.fillRect(X(s.alpha) - 0.8 * dpr, Y(r) - 0.8 * dpr, 1.6 * dpr, 1.6 * dpr); }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
    $('c1Title').textContent = T(`Hofstadter 蝴蝶：α = p/q（q ≤ ${QMAX}）时 |P_q(E)| ≤ 4 的能量；琥珀 = α = 1/4`, `HOFSTADTER’S BUTTERFLY: THE ENERGIES WITH |P_q(E)| ≤ 4 AT α = p/q (q ≤ ${QMAX}); AMBER = α = 1/4`);
    $('c1Meta').textContent = T(`${B.length} 个切片`, `${B.length} slices`);
  }
}
function drawSide() {
  const M = MODEL, F = frame2d(cv2, 40); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  if (M.mode === 'bands') {
    const C = gapCurve(), X = (m) => pl + (m + 2) / 4 * iw, hi = 0.7, Y = (v) => pt + ih - v / hi * ih, xs = C.map((c) => c.m);
    yTicks(ctx, dpr, pl, Y, [0, 0.2, 0.4, 0.6], (v) => v.toFixed(1)); xTicks(ctx, dpr, pt, ih, X, [-2, -1, 0, 1, 2], (v) => `m=${v}`);
    curve(ctx, xs, C.map((c) => c.below), X, Y, CY, 1.6, dpr); curve(ctx, xs, C.map((c) => c.above), X, Y, MG, 1.6, dpr);
    curve(ctx, xs, C.map((c) => c.m * c.m / 500), X, Y, AM, 1.6, dpr);
    ctx.setLineDash([4 * dpr, 3 * dpr]); curve(ctx, xs.filter((m) => m >= 0), C.filter((c) => c.m >= 0).map((c) => c.m), X, Y, '#9d8cff', 1.2, dpr); ctx.setLineDash([]);
    vline(ctx, X(pr.m), pt, ih, INK, dpr);
    $('c2Title').textContent = T('间隙对质量：μ − max λ₃（青）、min λ₄ − μ（品红）、证明的 δ（琥珀）、论证的上界 m（紫虚线）', 'GAP AGAINST MASS: μ − max λ₃ (CYAN), min λ₄ − μ (MAGENTA), PROVED δ (AMBER), ARGUED UPPER BOUND m (VIOLET DASHES)'); $('c2Meta').textContent = '';
  } else if (M.mode === 'cert') {
    const K = pr.K, lo = -9, hi = 4, bw = iw / 6, Y = (v) => pt + ih - (v - lo) / (hi - lo) * ih;
    yTicks(ctx, dpr, pl, Y, [-8, -4, 0, 4], String); hline(ctx, Y(0), pl, iw * 4 / 6, FAINT, dpr, false);
    K.forEach((x, i) => { ctx.fillStyle = x > 0 ? OK : MG; ctx.globalAlpha = 0.85; ctx.fillRect(pl + i * bw + bw * 0.18, Math.min(Y(0), Y(x)), bw * 0.64, Math.abs(Y(x) - Y(0))); ctx.globalAlpha = 1; ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(`λ${'₁₂₃₄'[i]}−2`, pl + (i + 0.5) * bw, pt + ih + 3 * dpr); });
    ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = `${10 * dpr}px ${TRV.fonts.data}`;
    const tx = pl + 4.2 * bw; ctx.fillText(`det = ${num(pr.det, 4)}`, tx, pt + 4 * dpr); ctx.fillText(`−4q  = ${num(-4 * pr.q, 4)}`, tx, pt + 18 * dpr); ctx.fillStyle = pr.nPos === 1 && pr.nNeg === 3 ? OK : MG; ctx.fillText(`(+, −) = (${pr.nPos}, ${pr.nNeg})`, tx, pt + 32 * dpr);
    $('c2Title').textContent = T('H − 2 的四个特征值：一正（绿）三负（品红），乘积 = −4q', 'THE FOUR EIGENVALUES OF H − 2: ONE POSITIVE (GREEN), THREE NEGATIVE (MAGENTA); PRODUCT = −4q'); $('c2Meta').textContent = '';
  } else if (M.mode === 'bound') {
    const C = gapCurve(), c = C.reduce((b, x) => (Math.abs(x.m - pr.m) < Math.abs(b.m - pr.m) ? x : b), C[0]);
    const rows = [[T('min |det(H − 2)|', 'min |det(H − 2)|'), pr.g.minAbsDet, 2 * pr.m * pr.m, T('证明：≥ 2m²', 'proof: ≥ 2m²')], [T('max |λ − 2|', 'max |λ − 2|'), pr.g.maxShift, 10, T('证明：≤ 10', 'proof: ≤ 10')]];
    const rowH = ih / 2, lo = -4, hi = 2.7, X = (v) => pl + 90 * dpr + (Math.log10(Math.max(v, 1e-4)) - lo) / (hi - lo) * (iw - 90 * dpr);
    rows.forEach(([label, actual, bound, note], r) => {
      const y0 = pt + r * rowH; ctx.fillStyle = DIM; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, pl - 30 * dpr, y0 + rowH * 0.3); ctx.fillText(note, pl - 30 * dpr, y0 + rowH * 0.62);
      ctx.fillStyle = MG; ctx.fillRect(X(1e-4), y0 + rowH * 0.18, X(actual) - X(1e-4), rowH * 0.24); ctx.fillStyle = AM; ctx.fillRect(X(1e-4), y0 + rowH * 0.5, X(bound) - X(1e-4), rowH * 0.24);
      ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.fillText(sci(actual), X(actual) + 4 * dpr, y0 + rowH * 0.3); ctx.fillText(sci(bound), X(bound) + 4 * dpr, y0 + rowH * 0.62);
    });
    $('c2Title').textContent = T('证明的预算（琥珀）与网格上的实际值（品红），对数横轴', 'THE PROOF’S BUDGET (AMBER) AND THE ACTUAL VALUES ON THE GRID (MAGENTA), LOG SCALE'); $('c2Meta').textContent = Math.abs(c.m) < 1e-9 ? '' : T(`间隙 / δ ≈ ${num(Math.min(c.below, c.above) / (c.m * c.m / 500), 0)}`, `gap / δ ≈ ${num(Math.min(c.below, c.above) / (c.m * c.m / 500), 0)}`);
  } else {
    const B = butterfly(), quarter = B.find((s) => s.p === 1 && s.q === 4), g = pr.g, lo = -6, hi = 6, X = (e) => pl + (e - lo) / (hi - lo) * iw, rowH = ih / 2;
    xTicks(ctx, dpr, pt, ih, X, [-4, -2, 0, 2, 4], (v) => `E=${v}`);
    ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('α=1/4', pl - 4 * dpr, pt + rowH * 0.5); ctx.fillText(T('模型', 'model'), pl - 4 * dpr, pt + rowH * 1.5);
    quarter.intervals.forEach(([a, b]) => { ctx.fillStyle = AM; ctx.fillRect(X(a), pt + rowH * 0.25, Math.max(1, X(b) - X(a)), rowH * 0.5); });
    for (let b = 0; b < 4; b++) { let lo2 = Infinity, hi2 = -Infinity; for (let i = 0; i < G * G; i++) { lo2 = Math.min(lo2, g.B[4 * i + b]); hi2 = Math.max(hi2, g.B[4 * i + b]); } ctx.fillStyle = BAND_CSS[b]; ctx.fillRect(X(lo2), pt + rowH * 1.25, Math.max(1, X(hi2) - X(lo2)), rowH * 0.5); }
    vline(ctx, X(MU), pt, ih, AM, dpr);
    $('c2Title').textContent = T(`α = 1/4 切片的四条带（琥珀）与模型在 m = ${num(pr.m, 2)} 的四条带`, `THE FOUR BANDS OF THE α = 1/4 SLICE (AMBER) AND THE MODEL’S FOUR BANDS AT m = ${num(pr.m, 2)}`); $('c2Meta').textContent = T('虚线 = μ = 2', 'dashes = μ = 2');
  }
}

/* =====================================================================
   11. Readouts and controls
   ===================================================================== */
let syncedKey = '', toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function setRo(rows) { rows.forEach(([l, v], i) => { $(`ro${i + 1}L`).textContent = l; $(`ro${i + 1}`).textContent = v; }); }
function pill(id, label, value) { $(id).innerHTML = `${label} <strong>${value}</strong>`; }
function quarterModel(g) { const r = []; for (let b = 0; b < 4; b++) { let lo = Infinity, hi = -Infinity; for (let i = 0; i < G * G; i++) { lo = Math.min(lo, g.B[4 * i + b]); hi = Math.max(hi, g.B[4 * i + b]); } r.push(lo, hi); } return r; }
function readouts() {
  const M = MODEL, pr = progress();
  if (M.mode === 'bands') {
    const g = pr.g, m0 = Math.abs(pr.m) < 1e-9;
    setRo([[T('质量 m · d = 2 + m', 'Mass m · d = 2 + m'), `${num(pr.m, 2)} · ${num(2 + pr.m, 2)}`],
      [T('max λ₃ · min λ₄（41 × 41 网格）', 'max λ₃ · min λ₄ (41 × 41 grid)'), `${num(g.max3, 4)} · ${num(g.min4, 4)}`],
      [T('实际间隙 · 证明的 δ = m²/500', 'Actual gap · proved δ = m²/500'), `${num(pr.gap, 4)} · ${sci(pr.delta)}`],
      [T('k_F 处的四条能带', 'The four bands at k_F'), pr.kF.map((x) => num(x, 3)).join(', ')],
      [T('结论', 'Verdict'), m0 ? T('m = 0：两带在 μ 相碰（定理排除这一点）', 'm = 0: the two bands touch at μ (the theorem excludes this point)') : T(`λ₃ < 2 < λ₄ 处处成立，间隙 ≥ ${sci(pr.delta)}`, `λ₃ < 2 < λ₄ everywhere, gap ≥ ${sci(pr.delta)}`)]]);
    pill('pillA', 'm', num(pr.m, 2)); pill('pillB', 'GAP', num(pr.gap, 3)); pill('pillC', 'δ', sci(pr.delta)); pill('pillD', 'μ', '2');
    $('roNote').innerHTML = m0 ? T('无质量时，第三、四条能带在 k<sub>F</sub> 处相碰成锥。', 'Without mass the third and fourth bands meet in a cone at k<sub>F</sub>.') : T('网格上量到的间隙只是数值；“所有动量都有间隙”是冻结定理。', 'The gap measured on the grid is a number; “a gap at every momentum” is the frozen theorem.');
  } else if (M.mode === 'cert') {
    setRo([[T('质量 m · 动量 (k₁, k₂)', 'Mass m · momentum (k₁, k₂)'), `${num(pr.m, 2)} · (${num(pr.k1, 3)}, ${num(pr.k2, 3)})`],
      [T('H − 2 的特征值', 'Eigenvalues of H − 2'), pr.K.map((x) => num(x, 3)).join(', ')],
      [T('惯性（正, 负）', 'Inertia (positive, negative)'), `(${pr.nPos}, ${pr.nNeg})`],
      [T('特征值之积 · −4q', 'Product of eigenvalues · −4q'), `${num(pr.det, 5)} · ${num(-4 * pr.q, 5)}`],
      [T('q · 地板 m²/2 · 环面上 min q（网格）', 'q · floor m²/2 · min q on the torus (grid)'), `${num(pr.q, 4)} · ${num(pr.m * pr.m / 2, 4)} · ${num(pr.grid.minQ, 4)}`]]);
    pill('pillA', 'm', num(pr.m, 2)); pill('pillB', 'q', num(pr.q, 3)); pill('pillC', 'det', num(pr.det, 3)); pill('pillD', '(+,−)', `${pr.nPos},${pr.nNeg}`);
    $('roNote').innerHTML = Math.abs(pr.m) < 1e-9 ? T('m = 0 时 q 在 k<sub>F</sub> 处等于 0，行列式消失，证书失效。', 'At m = 0, q vanishes at k<sub>F</sub>, the determinant vanishes and the certificate fails.') : T('行列式为负只说明负特征值有奇数个；证明另用合同关系得到“恰好一正三负”。', 'A negative determinant only says the number of negative eigenvalues is odd; the proof uses a congruence to get exactly one positive and three negative.');
  } else if (M.mode === 'bound') {
    const g = pr.g;
    setRo([[T('质量 m', 'Mass m'), num(pr.m, 2)],
      [T('实际间隙（41 × 41 网格）', 'Actual gap (41 × 41 grid)'), num(g.minDist, 5)],
      [T('证明的 δ = m²/500 · 倍数', 'Proved δ = m²/500 · ratio'), `${sci(pr.delta)} · ${pr.delta > 0 ? num(g.minDist / pr.delta, 0) : '—'}`],
      [T('min |det(H − 2)| · 2m²', 'min |det(H − 2)| · 2m²'), `${sci(g.minAbsDet)} · ${sci(2 * pr.m * pr.m)}`],
      [T('max |λ − 2| · Gershgorin 界', 'max |λ − 2| · Gershgorin bound'), `${num(g.maxShift, 3)} · 10`]]);
    pill('pillA', 'm', num(pr.m, 2)); pill('pillB', 'GAP', num(g.minDist, 3)); pill('pillC', 'δ', sci(pr.delta)); pill('pillD', '×', pr.delta > 0 ? num(g.minDist / pr.delta, 0) : '—');
    $('roNote').innerHTML = T('δ 的来源：|det(H − 2)| ≥ 2m²，其他三个因子各 ≤ 10，所以最近那个因子 ≥ 2m²/1000。', 'Where δ comes from: |det(H − 2)| ≥ 2m² and each of the other three factors is ≤ 10, so the nearest factor is ≥ 2m²/1000.');
  } else {
    const B = butterfly(), quarter = B.find((s) => s.p === 1 && s.q === 4), qe = quarter.intervals.flat(), mq = quarterModel(pr.g);
    const diff = qe.length === 8 ? Math.max(...mq.map((x, i) => Math.abs(x - qe[i]))) : NaN;
    setRo([[T('模型质量 m', 'Model mass m'), num(pr.m, 2)],
      [T('α = 1/4 切片的带边', 'Band edges of the α = 1/4 slice'), qe.map((x) => num(x, 3)).join(', ')],
      [T('模型四条带的范围', 'Ranges of the model’s four bands'), mq.map((x) => num(x, 3)).join(', ')],
      [T('两者最大差', 'Largest difference'), isFinite(diff) ? sci(diff) : '—'],
      [T('页面算的切片数（q ≤ 20）', 'Slices computed on the page (q ≤ 20)'), String(B.length)]]);
    pill('pillA', 'm', num(pr.m, 2)); pill('pillB', 'α', '1/4'); pill('pillC', 'Δ', isFinite(diff) ? sci(diff) : '—'); pill('pillD', T('切片', 'SLICES'), String(B.length));
    $('roNote').innerHTML = Math.abs(pr.m + 2) < 1e-9 ? T('m = −2 时两边一致到数值精度——页面上的数值对比，不是本库的定理。', 'At m = −2 the two agree to numerical precision; this is a numerical comparison on the page, not a theorem of this library.') : T('m 离开 −2 后，模型的带不再与 1/4 切片重合，但 μ = 2 始终落在第三、四条带之间（m ≠ 0）。', 'Once m leaves −2 the model’s bands no longer coincide with the 1/4 slice, but μ = 2 stays between the third and fourth bands (m ≠ 0).');
  }
}
const fieldsFor = { bands: [], cert: ['massField'], bound: [], butterfly: [] };
function syncOutputs() {
  if (dirty) { build(); dirty = false; syncedKey = ''; toasted = false; }
  const M = MODEL, key = `${S.mode}|${S.nowFrac}|${S.m}|${TRV.lang()}`;
  if (key === syncedKey) return; syncedKey = key;
  const pr = progress();
  readouts();
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  $('massField').hidden = !fieldsFor[S.mode].includes('massField');
  $('mm').value = S.m; $('oM').textContent = S.m.toFixed(2);
  $('presetNote').innerHTML = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = ({
    bands: T('时间轴 = 质量 m，从 −2 到 2。', 'The time axis is the mass m, from −2 to 2.'),
    cert: T('时间轴 = 动量沿 Γ → k<sub>F</sub> → M → X → Γ 走一圈；质量由滑块设定。', 'The time axis takes the momentum once around Γ → k<sub>F</sub> → M → X → Γ; the slider sets the mass.'),
    bound: T('时间轴 = 质量 m，从 −2 到 2。', 'The time axis is the mass m, from −2 to 2.'),
    butterfly: T('时间轴 = 模型的质量 m，从 −2 到 2；蝴蝶本身不随它变。', 'The time axis is the model’s mass m, from −2 to 2; the butterfly itself does not change.')
  })[S.mode];
  $('litNote').innerHTML = T('能带、网格上的间隙与蝴蝶都是页面现算的数值；冻结的是“m ≠ 0 时处处有间隙”这一条定理。', 'The bands, the gap on the grid and the butterfly are numbers computed on the page; what is frozen is the theorem that there is a gap everywhere when m ≠ 0.');
  $('clock').innerHTML = M.mode === 'cert' ? `s ${num(pr.f, 2)}` : `m ${num(pr.m, 2)}`;
  $('hudBig').textContent = ({ bands: () => T(`四条能带 · m = ${num(pr.m, 2)}`, `four bands · m = ${num(pr.m, 2)}`), cert: () => T(`证书 · det(H − 2) = −4q`, `certificate · det(H − 2) = −4q`),
    bound: () => T(`界 · δ = m²/500`, `bound · δ = m²/500`), butterfly: () => T('Hofstadter 蝴蝶', 'Hofstadter’s butterfly') })[M.mode]();
  $('hudSub').textContent = ({ bands: T('四层曲面 = 四条能带（青 λ₃、品红 λ₄）；琥珀平面 = μ = 2；竖线 = k_F', 'four sheets = four bands (cyan λ₃, magenta λ₄); amber plane = μ = 2; vertical line = k_F'),
    cert: T('曲面 = q（高度取平方根）；琥珀平面 = 地板 m²/2；品红 = 闭路；琥珀点 = 网格上的最小值', 'surface = q (height on a square-root scale); amber plane = the floor m²/2; magenta = the loop; amber dot = minimum on the grid'),
    bound: T('曲面 = 离 μ 最近的能带的距离；琥珀平面 = δ；品红平面 = 实际最小距离', 'surface = distance from μ to the nearest band; amber plane = δ; magenta plane = actual minimum distance'),
    butterfly: T('竖线 = 每个 α = p/q 的能带；琥珀 = α = 1/4；右侧彩条 = 模型的四条带', 'vertical strokes = the bands at each α = p/q; amber = α = 1/4; coloured bars on the right = the four bands of the model') })[M.mode];
  if (!toasted && S.playing && S.nowFrac >= 1) {
    toasted = true;
    if (M.mode === 'cert') toast(T(`<b>走完一圈</b>：H − 2 始终一正三负，行列式始终等于 −4q。`, `<b>Once around the loop</b>: H − 2 stayed one positive and three negative, and its determinant always equalled −4q.`));
    else if (M.mode === 'butterfly') toast(T('<b>m = 2</b>：模型的带早已离开 1/4 切片，μ = 2 仍在第三、四条带之间。', '<b>m = 2</b>: the model’s bands have left the 1/4 slice, and μ = 2 is still between the third and fourth bands.'));
    else toast(T(`<b>m = 2</b>：实际间隙 ${num(pr.gap, 3)}，证明的 δ = ${sci(pr.delta)}。`, `<b>m = 2</b>: actual gap ${num(pr.gap, 3)}, proved δ = ${sci(pr.delta)}.`));
  }
}
function syncRail() {
  const key = `${S.mode}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  const marks = S.mode === 'cert' ? LOOP_LEN.map((s, i) => [s / LOOP_TOTAL, LOOP_NAMES[i]]) : [[0, 'm=−2'], [0.25, '−1'], [0.5, '0'], [0.75, '1'], [1, 'm=2']];
  $('marks').innerHTML = marks.map(([f, s], i) => `<i class="${i === 0 ? 'first' : i === marks.length - 1 ? 'last' : ''}" style="left:${(f * 100).toFixed(2)}%">${s}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => {
  const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'bands'; if (S.mode === m) return;
  S.mode = m; S.nowFrac = 0; custom(); setCamPreset(m === 'butterfly' ? 'front' : 'iso');
}));
$('mm').addEventListener('input', () => { S.m = Math.min(2, Math.max(-2, Math.round(parseFloat($('mm').value) * 20) / 20)); custom(); });
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.mode = p.mode; if (p.m !== undefined) S.m = p.m;
  S.preset = name; markPreset(); dirty = true; setCamPreset(p.mode === 'butterfly' ? 'front' : 'iso');
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
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) { ev.preventDefault(); jumpTo(S.nowFrac + (ev.key === 'ArrowRight' ? 1 : -1) * (S.mode === 'cert' ? 0.01 : 0.0125)); }
  else if (ev.key === 'e' || ev.key === 'E') jumpTo(1);
});

/* =====================================================================
   12. Main loop
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
      S.nowFrac += S.dir * dtSec * S.speed / RUN[MODEL.mode];
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
window.HG_DEBUG = {
  pending: () => dirty || syncedKey !== `${S.mode}|${S.nowFrac}|${S.m}|${TRV.lang()}`,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, pr = progress(), o = { mode: M.mode, frac: S.nowFrac, m: pr.m };
    if (M.mode === 'cert') Object.assign(o, { k1: pr.k1, k2: pr.k2, e: pr.e, K: pr.K, q: pr.q, det: pr.det, nPos: pr.nPos, nNeg: pr.nNeg, minQ: pr.grid.minQ, atQ: pr.grid.atQ });
    else Object.assign(o, { max3: pr.g.max3, min4: pr.g.min4, at3: pr.g.at3, at4: pr.g.at4, gap: pr.gap, delta: pr.delta, kF: pr.kF, minDist: pr.g.minDist, minAbsDet: pr.g.minAbsDet, maxShift: pr.g.maxShift, quarterModel: quarterModel(pr.g) });
    if (M.mode === 'bound' || M.mode === 'bands') o.curve = gapCurve().map((c) => ({ m: c.m, below: c.below, above: c.above }));
    if (M.mode === 'butterfly') { const B = butterfly(); o.slices = B.map((s) => ({ p: s.p, q: s.q, intervals: s.intervals, roots: s.roots })); }
    return o;
  },
  bands: (k1, k2, m) => bandsAt(k1, k2, m),
  matrix: (k1, k2, m) => { const H = bloch(k1, k2, m); return { re: Array.from(H.re), im: Array.from(H.im) }; },
  chambers: (E, p, q) => chambersP(E, p, q),
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('cone'); S.playing = false; setPlayUI(); S.nowFrac = 0.55; $('now').value = S.nowFrac; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('sweep');
setPlayUI();
requestAnimationFrame(frame);
})();
