/* TOMO//GLANCE · 互补与层析 · 一次看不全
   A qubit ρ = (I + r·σ)/2 is measured along chosen directions n (Z, X, Y and an optional tilted direction in the x–z plane);
   each sample gives ±1 with P(+1) = (1 + r·n)/2. The visible space is span{I, n·σ}; the invisible residual is its orthogonal
   complement (theory: FORMAL_OBSERVER_COMPLETION_REFLECTION §83). For complementary directions the purity splits as
   Tr ρ² − ½ = Σ_n (r·n)²/2 + |r_⊥|²/2 (frozen: purity_pythagoras_decomposition). The estimate is a least-squares linear inversion
   within the visible span. Also shown: phase blindness of diagonal observables, collision conservation over X, Y, Z,
   the entropic complementarity bound and the no-cloning overlap condition.
   Frozen Lean anchors are named in the page text. Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const COL = TRV.rgb, GREEN = [0.27, 1.0, 0.70];
const reduceMotion = TRV.reduceMotion;
const { mulberry32, fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, ok: OK, cyan: CY, magenta: MG } = TRV.palette;
const N_MAX = 600, RUN_SECONDS = 12, FLY = 7, DEG = Math.PI / 180;
const CTX = ['Z', 'X', 'Y', 'T'];
const CTX_RGB = { Z: COL.cyan, X: COL.amber, Y: GREEN, T: [0.62, 0.55, 1.0] }, CTX_CSS = { Z: CY, X: AM, Y: OK, T: '#9d8cff' };

/* =====================================================================
   2. State and presets
   ===================================================================== */
const S = { ctx: { Z: true, X: true, Y: false, T: false }, tilt: 45, twin: false, theta: 60, phase: 50, r: 1, cloneAngle: 60,
  showTrue: true, run: 0, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'two' };
const ON = (...k) => ({ Z: k.includes('Z'), X: k.includes('X'), Y: k.includes('Y'), T: k.includes('T') });
const PRESETS = {
  onlyZ: { ctx: ON('Z'), theta: 90, phase: 0, r: 1, twin: false,
    zh: '态在赤道上（|+⟩），却只沿 Z 方向测：每个样本都是五五开。与它统计完全相同的态铺满整张圆盘——相位 φ 在这里完全看不见，再多样本也没用（定理 83.1）。',
    en: 'The state lies on the equator (|+⟩), but it is measured only along Z: every sample is a fifty-fifty coin. The states with exactly the same statistics fill a whole disc; the phase φ is completely invisible here, and more samples do not help (Theorem 83.1).' },
  phase: { ctx: ON('Z'), theta: 90, phase: 0, r: 1, twin: true,
    zh: '|+⟩（白）和它的相位翻转 Z|+⟩Z = |−⟩（品红）方向相反，只测 Z 时统计却一模一样。打开 X 方向，两者立刻分开：能分开它们的可观测量一定不是对角的（diagonal_prime_observables_cannot_recover_relative_phase）。',
    en: '|+⟩ (white) and its phase flip Z|+⟩Z = |−⟩ (magenta) point in opposite directions, yet measured along Z alone their statistics are identical. Switch on X and they separate at once: any observable that tells them apart is not diagonal (diagonal_prime_observables_cannot_recover_relative_phase).' },
  two: { ctx: ON('Z', 'X'), theta: 60, phase: 50, r: 1, twin: false,
    zh: '测 Z 和 X 两个方向：还剩一条弦（沿 Y）上的态分不开。看得见的部分随样本收敛，看不见的 Y 分量留下一块下不去的误差地板。',
    en: 'Measuring along Z and X leaves a chord (along Y) of states that cannot be told apart. The visible part converges as samples accumulate, while the unseen Y component leaves an error floor that never goes down.' },
  full: { ctx: ON('Z', 'X', 'Y'), theta: 60, phase: 50, r: 1, twin: false,
    zh: '三个互补方向 X、Y、Z：不可见残差为零，一致集合缩成一个点，重建误差随 1/√N 一直下降（complete_context_tomography）。纯度恰好拆成三个方向的平方和（purity_pythagoras_decomposition）。',
    en: 'Three complementary directions X, Y and Z: the invisible residual is zero, the consistent set shrinks to a point, and the reconstruction error keeps falling like 1/√N (complete_context_tomography). The purity splits exactly into the squares of the three directions (purity_pythagoras_decomposition).' },
  tilted: { ctx: ON('Z', 'T'), tilt: 45, theta: 60, phase: 50, r: 1, twin: false,
    zh: 'Z 和与它夹 45° 的斜向：两者不互补。看得见的平面与 Z、X 两方向相同，但各方向平方和把重叠的部分算了两次，不再等于可见部分——勾股分解要求方向两两互补。',
    en: 'Z and a direction tilted 45° from it are not complementary. They see the same plane as Z and X, but the sum of squares counts the overlap twice and no longer equals the visible part; the Pythagorean split needs pairwise complementary directions.' },
  mixed: { ctx: ON('Z', 'X', 'Y'), theta: 60, phase: 50, r: 0.5, twin: false,
    zh: '混合态 |r| = 0.5：纯度 Tr ρ² = 0.625，三个方向的平方和是 0.125。碰撞守恒照样成立：三个方向的 Σp² 加起来恰是 1 + Tr ρ² = 1.625。',
    en: 'A mixed state with |r| = 0.5: purity Tr ρ² = 0.625, and the three squares add up to 0.125. Collision conservation still holds: Σp² over the three directions is exactly 1 + Tr ρ² = 1.625.' },
  single: { ctx: ON('Z', 'X', 'Y'), theta: 60, phase: 50, r: 1, twin: false, frac: 1 / N_MAX,
    zh: '只有一个样本：一次测量只给出一个 ±1。两个不正交的态不可能被一次测量无误分开（定理 100.1），所以一个未知态的单个样本读不全——完整层析必须反复制备。按 → 一个个加样本看看。',
    en: 'A single sample: one measurement gives just one ±1. Two non-orthogonal states cannot be told apart without error by one measurement (Theorem 100.1), so a single sample of an unknown state cannot be read completely; complete tomography needs the state prepared again and again. Press → to add samples one at a time.' },
  clone: { ctx: ON('Z', 'X', 'Y'), theta: 60, phase: 50, r: 1, twin: false, clone: 60,
    zh: '既然一个样本读不全，能不能先复制很多份？右边的复制机：要同时复制两个夹角 Θ 的态，酉变换保持内积要求 c = c²（c 是重叠）。Θ = 60° 时 c = 0.866、c² = 0.750，不可能；只有相同或正交的两态才行（no_cloning_inner_product_criterion）。',
    en: 'If one sample cannot be read completely, why not copy it many times first? The copying machine on the right: to copy two states at angle Θ, preserving inner products requires c = c² for their overlap c. At Θ = 60°, c = 0.866 and c² = 0.750, so it is impossible; only identical or orthogonal states can both be copied (no_cloning_inner_product_criterion).' }
};

/* =====================================================================
   3. Vectors and the model
   ===================================================================== */
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sc3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm3 = (a) => Math.sqrt(dot3(a, a));
const hNat = (p) => (p <= 0 || p >= 1 ? 0 : -p * Math.log(p) - (1 - p) * Math.log(1 - p));
function axisOf(k) { if (k === 'Z') return [0, 0, 1]; if (k === 'X') return [1, 0, 0]; if (k === 'Y') return [0, 1, 0]; return [Math.sin(S.tilt * DEG), 0, Math.cos(S.tilt * DEG)]; }
const blochOf = () => { const th = S.theta * DEG, ph = S.phase * DEG; return [S.r * Math.sin(th) * Math.cos(ph), S.r * Math.sin(th) * Math.sin(ph), S.r * Math.cos(th)]; };
/* orthonormal basis of the visible span by Gram–Schmidt (drops a direction that adds nothing new) */
function spanBasis(normals) {
  const B = [];
  for (const n of normals) { let v = n.slice(); for (const b of B) v = sub3(v, sc3(b, dot3(v, b))); const l = norm3(v); if (l > 1e-9) B.push(sc3(v, 1 / l)); }
  return B;
}
const projSpan = (B, v) => B.reduce((acc, b) => add3(acc, sc3(b, dot3(v, b))), [0, 0, 0]);
/* least-squares estimate within the span: minimize Σ_l n_l(·r̂ − m_l)² over r̂ ∈ span, for the directions that have samples */
function solveLS(B, normals, m, cov) {
  const k = B.length; if (!k) return { r: [0, 0, 0], tr: 0 };
  const A = normals.map((n) => B.map((b) => dot3(n, b)));            // rows in span coordinates
  const G = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => A.reduce((s, row) => s + row[i] * row[j], 0)));
  const Ginv = inv(G); if (!Ginv) return { r: [0, 0, 0], tr: 0 };
  const rhs = Array.from({ length: k }, (_, i) => A.reduce((s, row, l) => s + row[i] * m[l], 0));
  const x = Ginv.map((row) => row.reduce((s, g, j) => s + g * rhs[j], 0));
  // covariance of the estimate for independent m_l with variances cov[l]: (G⁻¹AᵀCAG⁻¹)
  let tr = 0;
  if (cov) for (let i = 0; i < k; i++) { let s = 0; for (let l = 0; l < A.length; l++) { const w = Ginv[i].reduce((t, g, j) => t + g * A[l][j], 0); s += w * w * cov[l]; } tr += s; }
  return { r: B.reduce((acc, b, i) => add3(acc, sc3(b, x[i])), [0, 0, 0]), tr };
}
function inv(M) {
  const n = M.length, A = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null; [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map((row) => row.slice(n));
}
let MODEL = null, dirty = true;
function build() {
  const r = blochOf(), active = CTX.filter((k) => S.ctx[k]), normals = active.map(axisOf), m = active.length;
  const B = spanBasis(normals), rVis = projSpan(B, r), rPerp = sub3(r, rVis);
  const purity = (1 + dot3(r, r)) / 2, visSum = normals.reduce((s, n) => s + dot3(r, n) ** 2 / 2, 0), visProj = dot3(rVis, rVis) / 2, residual = dot3(rPerp, rPerp) / 2;
  const orthogonal = normals.every((a, i) => normals.every((b, j) => i === j || Math.abs(dot3(a, b)) < 1e-9));
  // samples: one uniform per sample from the run seed; sample k goes to direction k mod m
  const rng = mulberry32(0x70AA + S.run * 7919); rng();
  const ctxOf = [], out = [], u = [];
  for (let k = 0; k < N_MAX; k++) { const l = k % m, n = normals[l], uk = rng(); ctxOf.push(l); u.push(uk); out.push(uk < (1 + dot3(r, n)) / 2 ? 1 : -1); }
  // the estimate and its error after each number of samples
  const plus = new Array(m).fill(0), cnt = new Array(m).fill(0), est = [[0, 0, 0]], err = [norm3(r) / 2], expct = [NaN];
  for (let N = 1; N <= N_MAX; N++) {
    const l = ctxOf[N - 1]; cnt[l]++; if (out[N - 1] > 0) plus[l]++;
    const have = [], mm = [], nn = [];
    for (let j = 0; j < m; j++) if (cnt[j] > 0) { have.push(normals[j]); mm.push((2 * plus[j] - cnt[j]) / cnt[j]); nn.push(j); }
    const Bh = spanBasis(have), s = solveLS(Bh, have, mm);
    est.push(s.r); err.push(norm3(sub3(s.r, r)) / 2);
    const cov = nn.map((j) => (1 - dot3(r, normals[j]) ** 2) / cnt[j]), e2 = solveLS(Bh, have, mm, cov).tr, floor = norm3(sub3(r, projSpan(Bh, r)));
    expct.push(Math.sqrt(floor * floor + e2) / 2);
  }
  const zr = [-r[0], -r[1], r[2]];                                    // the phase flip ZρZ
  const twinDiff = normals.reduce((mx, n) => Math.max(mx, Math.abs(dot3(sub3(r, zr), n)) / 2), 0);
  const H = { Z: hNat((1 + r[2]) / 2), X: hNat((1 + r[0]) / 2), S: hNat((1 + norm3(r)) / 2) };
  const collisionTrue = [r[0], r[1], r[2]].reduce((s, c) => s + (1 + c * c) / 2, 0);
  MODEL = { r, active, normals, B, rVis, rPerp, purity, visSum, visProj, residual, orthogonal, ctxOf, out, u, est, err, expct, zr, twinDiff, H, collisionTrue,
    hash: fnv([S.run & 0xff, m, ...active.map((k) => k.charCodeAt(0)), Math.round(S.theta), Math.round(S.phase)]) };
}
function fnv(bytes) { let h = 0x811c9dc5; for (const v of bytes) { h ^= v & 0xff; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
const nowN = () => Math.round(S.nowFrac * N_MAX);
function countsAt(N) {
  const m = MODEL.active.length, plus = new Array(m).fill(0), cnt = new Array(m).fill(0);
  for (let k = 0; k < N; k++) { const l = MODEL.ctxOf[k]; cnt[l]++; if (MODEL.out[k] > 0) plus[l]++; }
  return { plus, cnt };
}
function collisionData(N) {                                          // Σ over X, Y, Z of Σ_j p̂_j², if all three are measured
  const { plus, cnt } = countsAt(N); let s = 0, ok = true;
  for (const k of ['X', 'Y', 'Z']) { const l = MODEL.active.indexOf(k); if (l < 0 || cnt[l] === 0) { ok = false; break; } const p = plus[l] / cnt[l]; s += p * p + (1 - p) * (1 - p); }
  return ok ? s : null;
}

/* =====================================================================
   4. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cvPy = $('pyth'), cvErr = $('errplot'), cvClone = $('clonePlot');
const f3 = (v) => (v === null || !isFinite(v) ? '—' : v.toFixed(3));
const f2s = (v) => (v >= 0 ? ' ' : '') + v.toFixed(2);
const ctxName = (k) => (k === 'T' ? T('斜向 n', 'tilted n') : k);
const ctxList = (ks) => ks.map(ctxName).join(T('、', ', '));

/* =====================================================================
   5. 3D scene: the Bloch sphere
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts, disc;
const LINES_MAX = 4000, PTS_MAX = 80, RB = 2.2;
const CAMS = { iso: [0.62, 1.1, 9.4], front: [0.0001, 1.5708, 9.4], top: [0.0001, 0.08, 9.0] };
const cam = { theta: 0.62, phi: 1.1, r: 9.4, tTheta: 0.62, tPhi: 1.1, tR: 9.4 };
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
    d.textContent = T('这个浏览器没有提供 WebGL，三维视图无法显示。下方的纯度分解、误差曲线和右侧读数仍然可用。', 'This browser does not provide WebGL, so the 3D view cannot be shown. The purity split, the error curve and the readouts still work.');
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
  pts = new THREE.Points(gp, new THREE.ShaderMaterial({ vertexShader: EVT_VS, fragmentShader: RING_FS, uniforms: { uScale: { value: 60 } }, ...additive }));
  pts.frustumCulled = false; scene3.add(pts);
  disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(...COL.magenta), transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  disc.visible = false; scene3.add(disc);
}
const W = (v) => [RB * v[0], RB * v[2], -RB * v[1]];             // Bloch (x, y, z) → world, z up
function updateGL(time) {
  const M = MODEL, N = nowN();
  const L = lines.geometry.attributes, Pp = L.position.array, Cc = L.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; const c = col.map((x) => x * k); Pp.set(a, 3 * v); Cc.set(c, 3 * v); v++; Pp.set(b, 3 * v); Cc.set(c, 3 * v); v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array.set(p, 3 * np); PT.aColor.array.set(col, 3 * np); PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  const ring = (center, u1, u2, R, col, k, n = 64) => { let prev = null; for (let i = 0; i <= n; i++) { const a = 2 * Math.PI * i / n, p = add3(center, add3(sc3(u1, R * Math.cos(a)), sc3(u2, R * Math.sin(a)))); const q = W(p); if (prev) seg(prev, q, col, k); prev = q; } };
  // the sphere: equator and two meridians
  ring([0, 0, 0], [1, 0, 0], [0, 1, 0], 1, COL.sigma, 0.22); ring([0, 0, 0], [1, 0, 0], [0, 0, 1], 1, COL.sigma, 0.14); ring([0, 0, 0], [0, 1, 0], [0, 0, 1], 1, COL.sigma, 0.14);
  // the measurement axes: bright when measured; detectors flash where the latest samples land
  const lastHit = {};
  for (let k = Math.max(0, N - 3); k < N; k++) { const key = M.active[M.ctxOf[k]] + (M.out[k] > 0 ? '+' : '-'); lastHit[key] = Math.max(lastHit[key] || 0, 1 - (N - 1 - k) / 3); }
  for (const k of CTX) {
    if (k === 'T' && !S.ctx.T) continue;
    const n = axisOf(k), on = S.ctx[k], col = CTX_RGB[k];
    seg(W(sc3(n, -1.12)), W(sc3(n, 1.12)), col, on ? 0.75 : 0.12);
    if (on) for (const sgn of [1, -1]) { const f = lastHit[k + (sgn > 0 ? '+' : '-')] || 0; dot(W(sc3(n, sgn * 1.14)), col, 0.45 + 0.55 * f, 2.2 + 3.5 * f); }
  }
  // samples flying from the centre to the end of their axis
  for (let k = Math.max(0, N - FLY - 6); k < N; k++) {
    const age = N - 1 - k, t = Math.min(1, (age + 1) / FLY), n = M.normals[M.ctxOf[k]], sgn = M.out[k];
    if (age > FLY + 4) continue;
    dot(W(sc3(n, sgn * 1.12 * TRV.smooth(t))), CTX_RGB[M.active[M.ctxOf[k]]], age < FLY ? 0.9 : Math.max(0, 0.9 - 0.2 * (age - FLY)), 1.4);
  }
  // the states consistent with the true statistics: disc (one direction), chord (two), point (three)
  const B = M.B, c = M.rVis, cl = norm3(c);
  disc.visible = false;
  if (B.length === 1) {
    const u = B[0], R = Math.sqrt(Math.max(0, 1 - cl * cl)), a = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let e1 = sub3(a, sc3(u, dot3(a, u))); e1 = sc3(e1, 1 / norm3(e1)); const e2 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]];
    ring(c, e1, e2, R, COL.magenta, 0.7);
    disc.visible = true; disc.position.set(...W(c)); disc.scale.set(RB * R, RB * R, 1);
    const nw = W(u), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...nw).normalize()); disc.quaternion.copy(q);
  } else if (B.length === 2) {
    const u = [B[0][1] * B[1][2] - B[0][2] * B[1][1], B[0][2] * B[1][0] - B[0][0] * B[1][2], B[0][0] * B[1][1] - B[0][1] * B[1][0]], h = Math.sqrt(Math.max(0, 1 - cl * cl));
    seg(W(add3(c, sc3(u, -h))), W(add3(c, sc3(u, h))), COL.magenta, 0.85);
    dot(W(add3(c, sc3(u, -h))), COL.magenta, 0.6, 1.4); dot(W(add3(c, sc3(u, h))), COL.magenta, 0.6, 1.4);
  }
  // true state, estimate and the phase-flip twin
  if (S.showTrue) { seg([0, 0, 0], W(M.r), COL.sigma, 0.95); dot(W(M.r), COL.sigma, 0.95, 2.2); }
  if (S.twin) { seg([0, 0, 0], W(M.zr), COL.magenta, 0.9); dot(W(M.zr), COL.magenta, 0.9, 2.2); }
  const e = M.est[N]; if (N > 0) { seg([0, 0, 0], W(e), COL.amber, 0.95); dot(W(e), COL.amber, 0.95, 2.6); }
  dot([0, 0, 0], COL.sigma, 0.35, 1.2);
  lines.geometry.setDrawRange(0, v); L.position.needsUpdate = true; L.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 58 * renderer.getPixelRatio();
  void time;
}

/* =====================================================================
   6. Camera
   ===================================================================== */
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.4 : 1);
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
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(18, Math.max(4, cam.tR * drag.pinch / d)); drag.pinch = d; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY;
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => { if (!drag.pts.has(ev.pointerId)) return; drag.pts.delete(ev.pointerId); if (drag.pts.size === 0) drag.pinch = 0; };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(18, Math.max(4, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   7. Tags
   ===================================================================== */
function mkTag(cls) { const el = document.createElement('div'); el.className = 'tag ' + cls; tagsBox.appendChild(el); return el; }
const tagAxis = { 'Z+': mkTag('cy raw'), 'Z-': mkTag('cy raw'), 'X+': mkTag('hot raw'), 'X-': mkTag('hot raw'), 'Y+': mkTag('gn raw'), 'Y-': mkTag('gn raw'), 'T+': mkTag('vi raw') };
const tagTrue = mkTag('raw'), tagEst = mkTag('hot raw'), tagTwin = mkTag('mg raw'), tagSet = mkTag('mg raw');
function labelStaticTags() {
  Object.assign(tagAxis['Z+'], { textContent: '+Z |0⟩' }); Object.assign(tagAxis['Z-'], { textContent: '−Z |1⟩' });
  Object.assign(tagAxis['X+'], { textContent: '+X |+⟩' }); Object.assign(tagAxis['X-'], { textContent: '−X |−⟩' });
  Object.assign(tagAxis['Y+'], { textContent: '+Y |+i⟩' }); Object.assign(tagAxis['Y-'], { textContent: '−Y |−i⟩' });
  tagAxis['T+'].textContent = T('斜向 n', 'TILTED n');
  tagTrue.textContent = T('真态 ρ', 'TRUE ρ'); tagEst.textContent = T('估计 ρ̂', 'ESTIMATE ρ̂'); tagTwin.textContent = 'ZρZ';
}
labelStaticTags();
function placeTag(el, p, show = true) {
  if (!glOK || !show) { el.style.display = 'none'; return; }
  const q = proj3(p); if (q.z > 1 || q.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.style.left = q.x + 'px'; el.style.top = q.y + 'px';
}
function updateTags() {
  const M = MODEL, N = nowN();
  for (const k of ['Z', 'X', 'Y']) { const n = axisOf(k); placeTag(tagAxis[k + '+'], W(sc3(n, 1.3)), S.ctx[k]); placeTag(tagAxis[k + '-'], W(sc3(n, -1.3)), S.ctx[k]); }
  placeTag(tagAxis['T+'], W(sc3(axisOf('T'), 1.3)), S.ctx.T);
  placeTag(tagTrue, W(sc3(M.r, 1 + 0.18 / Math.max(0.2, norm3(M.r)))), S.showTrue && norm3(M.r) > 0.05);
  placeTag(tagEst, W(sc3(M.est[N], 1 + 0.2 / Math.max(0.2, norm3(M.est[N])))), N > 0 && norm3(M.est[N]) > 0.05);
  placeTag(tagTwin, W(sc3(M.zr, 1.12)), S.twin);
  const B = M.B;
  tagSet.textContent = B.length === 3 ? '' : T('与真态统计相同的全部态', 'ALL STATES WITH THE SAME STATISTICS');
  if (B.length === 1) {
    // put the label on the rim, as far as possible from the arrows that end on the disc
    const u = B[0], a = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; let e1 = sub3(a, sc3(u, dot3(a, u))); e1 = sc3(e1, 1 / norm3(e1));
    const e2 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]], R = Math.sqrt(Math.max(0, 1 - dot3(M.rVis, M.rVis)));
    const avoid = [M.r, ...(S.twin ? [M.zr] : []), ...(N > 0 ? [M.est[N]] : [])]; let best = null, bd = -1;
    for (let k = 0; k < 12; k++) { const t = 2 * Math.PI * k / 12, pnt = add3(M.rVis, add3(sc3(e1, R * 1.08 * Math.cos(t)), sc3(e2, R * 1.08 * Math.sin(t)))), d = Math.min(...avoid.map((q) => norm3(sub3(pnt, q)))); if (d > bd) { bd = d; best = pnt; } }
    placeTag(tagSet, W(best), R > 0.05);
  }
  else if (B.length === 2) { const u = [B[0][1] * B[1][2] - B[0][2] * B[1][1], B[0][2] * B[1][0] - B[0][0] * B[1][2], B[0][0] * B[1][1] - B[0][1] * B[1][0]], h = Math.sqrt(Math.max(0, 1 - dot3(M.rVis, M.rVis))); const sgn = W(add3(M.rVis, sc3(u, h)))[1] < W(add3(M.rVis, sc3(u, -h)))[1] ? 1 : -1; placeTag(tagSet, W(add3(M.rVis, sc3(u, sgn * (h + 0.22)))), h > 0.05); }
  else placeTag(tagSet, [0, 0, 0], false);
}

/* =====================================================================
   8. 2D panels
   ===================================================================== */
function frame2d(cv, pl0 = 36) {
  const dpr = fitCanvas(cv), ctx = cv.getContext('2d'), Wd = cv.width, Hh = cv.height;
  ctx.clearRect(0, 0, Wd, Hh);
  const pl = pl0 * dpr, pr = 12 * dpr, pt = 10 * dpr, pb = 20 * dpr;
  return { dpr, ctx, W: Wd, Hh, pl, pt, iw: Wd - pl - pr, ih: Hh - pt - pb };
}
function drawPyth() {
  const F = frame2d(cvPy, 70); if (F.iw < 40 || F.ih < 30) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, N = nowN(), XMAX = 0.55, X = (v) => pl + v / XMAX * iw;
  const rows = [T('真值', 'truth'), T('从样本估计', 'from samples')], rh = Math.min(26 * dpr, ih / 3.2), gap = (ih - 2 * rh) / 3;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textBaseline = 'middle';
  // gridlines
  ctx.strokeStyle = FAINT; ctx.globalAlpha = 0.5; ctx.beginPath(); for (const g of [0, 0.25, 0.5]) { ctx.moveTo(X(g), pt); ctx.lineTo(X(g), pt + ih); } ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const g of [0, 0.25, 0.5]) ctx.fillText(g.toFixed(2), X(g), pt + ih + 3 * dpr);
  const { plus, cnt } = countsAt(N);
  rows.forEach((name, i) => {
    const y = pt + gap * (i + 1) + rh * i; let x = 0;
    ctx.fillStyle = INK; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.fillText(name, pl - 6 * dpr, y + rh / 2);
    M.active.forEach((k, l) => {
      const val = i === 0 ? dot3(M.r, M.normals[l]) ** 2 / 2 : (cnt[l] ? ((2 * plus[l] - cnt[l]) / cnt[l]) ** 2 / 2 : 0);
      ctx.fillStyle = CTX_CSS[k]; ctx.globalAlpha = 0.85; ctx.fillRect(X(x), y, Math.max(0, X(x + val) - X(x) - 1), rh); ctx.globalAlpha = 1;
      if (X(x + val) - X(x) > 18 * dpr) { ctx.fillStyle = '#02040a'; ctx.textAlign = 'center'; ctx.font = `${9 * dpr}px ${TRV.fonts.data}`; ctx.fillText(ctxName(k).split(' ')[0], (X(x) + X(x + val)) / 2, y + rh / 2); }
      x += val;
    });
    if (i === 0 && M.residual > 1e-9) {
      ctx.fillStyle = MG; ctx.globalAlpha = 0.25; ctx.fillRect(X(x), y, X(x + M.residual) - X(x), rh); ctx.globalAlpha = 1;
      ctx.strokeStyle = MG; ctx.setLineDash([3 * dpr, 2 * dpr]); ctx.strokeRect(X(x), y, X(x + M.residual) - X(x), rh); ctx.setLineDash([]);
      if (X(x + M.residual) - X(x) > 22 * dpr) { ctx.fillStyle = MG; ctx.textAlign = 'center'; ctx.font = `${9 * dpr}px ${TRV.fonts.data}`; ctx.fillText(T('残差', 'blind'), (X(x) + X(x + M.residual)) / 2, y + rh / 2); }
    }
  });
  // the purity line Tr ρ² − ½
  const px = X(M.purity - 0.5); ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(px, pt); ctx.lineTo(px, pt + ih); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = INK; ctx.textAlign = px > pl + iw * 0.7 ? 'right' : 'left'; ctx.textBaseline = 'top'; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.fillText(`Tr ρ² − ½ = ${f3(M.purity - 0.5)}`, px + (px > pl + iw * 0.7 ? -4 : 4) * dpr, pt);
  $('pyMeta').textContent = M.orthogonal ? T(`可见 ${f3(M.visSum)} + 残差 ${f3(M.residual)} = ${f3(M.purity - 0.5)}`, `visible ${f3(M.visSum)} + blind ${f3(M.residual)} = ${f3(M.purity - 0.5)}`)
    : T(`方向不互补：平方和 ${f3(M.visSum)} ≠ 可见部分 ${f3(M.visProj)}`, `not complementary: squares ${f3(M.visSum)} ≠ visible ${f3(M.visProj)}`);
}
function drawErr() {
  const F = frame2d(cvErr); if (F.iw < 40 || F.ih < 30) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, N = nowN(), YMAX = 0.6;
  const X = (n) => pl + n / N_MAX * iw, Y = (e) => pt + ih - Math.min(YMAX, e) / YMAX * ih;
  ctx.strokeStyle = FAINT; ctx.globalAlpha = 0.6; ctx.beginPath(); for (const g of [0, 0.25, 0.5]) { ctx.moveTo(pl, Y(g)); ctx.lineTo(pl + iw, Y(g)); } ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = DIM; ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of [0, 0.25, 0.5]) ctx.fillText(g.toFixed(2), pl - 5 * dpr, Y(g));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const n of [0, 300, 600]) ctx.fillText(String(n), X(n), pt + ih + 3 * dpr);
  const floor = norm3(M.rPerp) / 2;
  ctx.strokeStyle = MG; ctx.lineWidth = 1.3 * dpr; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(pl, Y(floor)); ctx.lineTo(pl + iw, Y(floor)); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = CY; ctx.lineWidth = 1.4 * dpr; ctx.globalAlpha = 0.7; ctx.setLineDash([2 * dpr, 2 * dpr]); ctx.beginPath(); let started = false;
  for (let n = M.active.length; n <= N_MAX; n += 2) { const e = M.expct[n]; if (!isFinite(e)) continue; if (started) ctx.lineTo(X(n), Y(e)); else { ctx.moveTo(X(n), Y(e)); started = true; } }
  ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.strokeStyle = AM; ctx.lineWidth = 1.8 * dpr; ctx.beginPath(); for (let n = 0; n <= N; n++) { const y = Y(M.err[n]); if (n) ctx.lineTo(X(n), y); else ctx.moveTo(X(n), y); } ctx.stroke();
  ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(N), Y(M.err[N]), 3.5 * dpr, 0, 2 * Math.PI); ctx.fill();
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const items = [[T('这一批样本的误差', 'error of this batch'), AM], [T('期望的均方根误差', 'expected rms error'), CY], [T('看不见部分的地板', 'floor from the blind part'), MG]];
  const lw = Math.max(...items.map(([t]) => ctx.measureText(t).width)) + 10 * dpr, lx = pl + iw - lw - 2 * dpr, ly = pt + ih * 0.32;
  ctx.fillStyle = 'rgba(2, 6, 12, 0.85)'; ctx.fillRect(lx - 4 * dpr, ly - 3 * dpr, lw + 4 * dpr, items.length * 13 * dpr + 4 * dpr);
  items.forEach(([t, c], k) => { ctx.fillStyle = c; ctx.fillText(t, lx, ly + k * 13 * dpr); });
  $('errMeta').textContent = T(`横轴：样本数 N · 地板 ${f3(floor)}`, `x: samples N · floor ${f3(floor)}`);
}
function drawClone() {
  const dpr = fitCanvas(cvClone), ctx = cvClone.getContext('2d'), Wd = cvClone.width, Hh = cvClone.height; ctx.clearRect(0, 0, Wd, Hh);
  const pl = 30 * dpr, pr = 8 * dpr, pt = 8 * dpr, pb = 16 * dpr, iw = Wd - pl - pr, ih = Hh - pt - pb; if (iw < 40 || ih < 30) return;
  const X = (a) => pl + a / 180 * iw, Y = (v) => pt + ih - v * ih;
  ctx.strokeStyle = FAINT; ctx.globalAlpha = 0.6; ctx.beginPath(); for (const g of [0, 0.5, 1]) { ctx.moveTo(pl, Y(g)); ctx.lineTo(pl + iw, Y(g)); } ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = DIM; ctx.font = `${9 * dpr}px ${TRV.fonts.data}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of [0, 0.5, 1]) ctx.fillText(g.toFixed(1), pl - 4 * dpr, Y(g));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const a of [0, 90, 180]) ctx.fillText(`${a}°`, X(a), pt + ih + 2 * dpr);
  const cOf = (a) => Math.cos(a * DEG / 2);
  ctx.fillStyle = 'rgba(255,47,208,0.14)'; ctx.beginPath(); for (let a = 0; a <= 180; a += 2) ctx.lineTo(X(a), Y(cOf(a))); for (let a = 180; a >= 0; a -= 2) ctx.lineTo(X(a), Y(cOf(a) ** 2)); ctx.closePath(); ctx.fill();
  for (const [f, col] of [[cOf, CY], [(a) => cOf(a) ** 2, AM]]) { ctx.strokeStyle = col; ctx.lineWidth = 1.8 * dpr; ctx.beginPath(); for (let a = 0; a <= 180; a += 2) { if (a) ctx.lineTo(X(a), Y(f(a))); else ctx.moveTo(X(a), Y(f(a))); } ctx.stroke(); }
  const a = S.cloneAngle, c = cOf(a);
  ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(a), Y(c)); ctx.lineTo(X(a), Y(c * c)); ctx.stroke();
  ctx.fillStyle = CY; ctx.beginPath(); ctx.arc(X(a), Y(c), 3.5 * dpr, 0, 2 * Math.PI); ctx.fill(); ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(a), Y(c * c), 3.5 * dpr, 0, 2 * Math.PI); ctx.fill();
  ctx.font = `${9 * dpr}px ${TRV.fonts.body}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = CY; ctx.fillText(T('输入重叠 c', 'input overlap c'), pl + iw, pt + 2 * dpr); ctx.fillStyle = AM; ctx.fillText(T('复制后的重叠 c²', 'overlap after copying c²'), pl + iw, pt + 14 * dpr);
}

/* =====================================================================
   9. Readouts and controls
   ===================================================================== */
let syncedN = NaN, toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function syncOutputs() {
  if (dirty) { build(); dirty = false; toasted = false; }
  const M = MODEL, N = nowN(); syncedN = N;
  $('oTilt').textContent = `${S.tilt}°`; $('oTheta').textContent = `${S.theta}°`; $('oPhase').textContent = `${S.phase}°`; $('oR').textContent = S.r.toFixed(2); $('oClone').textContent = `${S.cloneAngle}°`;
  $('tiltField').hidden = !S.ctx.T;
  document.querySelectorAll('#ctxChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(!!S.ctx[b.dataset.ctx])));
  $('twinBtn').setAttribute('aria-pressed', String(S.twin));
  // readouts
  $('roPur').textContent = f3(M.purity); $('roVis').textContent = f3(M.visSum); $('roRes').textContent = f3(M.residual); $('roErr').textContent = f3(M.err[N]);
  const e = M.est[N], known = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((ax) => norm3(projSpan(M.B, ax)));
  $('roEst').textContent = N === 0 ? '—' : `(${e.map((v, i) => (known[i] < 0.01 ? '?' : v.toFixed(2))).join(', ')})`;
  if (S.twin) { $('roL6').innerHTML = T('与 ZρZ 的统计差 max|Δp|', 'Statistics gap to ZρZ, max|Δp|'); $('ro6').textContent = f3(M.twinDiff); }
  else { $('roL6').innerHTML = T('H(Z) + H(X) ≥ ln 2 + S(ρ)', 'H(Z) + H(X) ≥ ln 2 + S(ρ)'); $('ro6').textContent = `${(M.H.Z + M.H.X).toFixed(3)} ≥ ${(Math.LN2 + M.H.S).toFixed(3)}`; }
  const k = M.B.length, missing = ['X', 'Y', 'Z'].filter((a) => known[{ X: 0, Y: 1, Z: 2 }[a]] < 0.99);
  $('roNote').innerHTML = (!M.orthogonal
    ? T(`方向不互补：各方向平方和 ${f3(M.visSum)}，可见部分实际只有 ${f3(M.visProj)}——重叠算了两次。勾股分解要求方向两两互补。`, `The directions are not complementary: the squares add up to ${f3(M.visSum)}, while the visible part is only ${f3(M.visProj)}; the overlap is counted twice. The Pythagorean split needs pairwise complementary directions.`) + ' '
    : '')
    + (k === 3 ? T('三个方向张满了：没有看不见的残差，与真态统计相同的只剩它自己，样本越多越准。', 'The directions span everything: there is no invisible residual, the only state with the true statistics is the true state itself, and more samples keep improving the estimate.')
      : k === 2 ? T(`还差 ${missing.join('、') || '一个'} 方向：一条弦上的态统计完全相同，残差 ${f3(M.residual)} 永远估不出来。`, `${missing.join(', ') || 'One direction'} is still missing: a whole chord of states has identical statistics, and the residual ${f3(M.residual)} can never be estimated.`)
        : T(`只看一个方向：整张圆盘上的态统计完全相同，残差 ${f3(M.residual)} 永远估不出来。`, `One direction only: a whole disc of states has identical statistics, and the residual ${f3(M.residual)} can never be estimated.`));
  // notes
  $('presetNote').textContent = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义参数。', 'Custom settings.');
  $('ctxNote').innerHTML = T(`正在测：${ctxList(M.active)}。样本轮流分给这些方向。可见空间 ${k} 维，看不见的方向 ${3 - k} 维。`, `Measuring: ${ctxList(M.active)}. Samples go to these directions in turn. The visible space has dimension ${k}; ${3 - k} invisible directions remain.`)
    + (S.twin ? ' ' + T(M.twinDiff < 1e-12 ? '对照态 ZρZ 与 ρ 的统计完全相同。' : '对照态 ZρZ 已经被区分开。', M.twinDiff < 1e-12 ? 'The comparison state ZρZ has exactly the same statistics as ρ.' : 'The comparison state ZρZ is already told apart.') : '');
  $('stateNote').innerHTML = T(`布洛赫矢量 r = (${M.r.map((x) => x.toFixed(2)).join(', ')})。观察者不知道它；白箭头只是给你看的，按 <kbd>H</kbd> 可以藏起来。`, `Bloch vector r = (${M.r.map((x) => x.toFixed(2)).join(', ')}). The observer does not know it; the white arrow is only for you, press <kbd>H</kbd> to hide it.`);
  const c = Math.cos(S.cloneAngle * DEG / 2), possible = Math.abs(c - c * c) < 1e-9;
  $('cloneNote').innerHTML = possible
    ? T(`Θ = ${S.cloneAngle}°：c = ${f3(c)} = c²。两态${c > 0.5 ? '相同' : '正交'}，这一对可以同时复制。`, `Θ = ${S.cloneAngle}°: c = ${f3(c)} = c². The two states are ${c > 0.5 ? 'identical' : 'orthogonal'}, and this pair can be copied.`)
    : T(`Θ = ${S.cloneAngle}°：c = ${f3(c)}，复制后应为 c² = ${f3(c * c)}，酉变换不改变内积，二者不可能相等——没有任何机器能同时复制这两个态。`, `Θ = ${S.cloneAngle}°: c = ${f3(c)}, while copies would have overlap c² = ${f3(c * c)}; a unitary preserves inner products, so this cannot happen and no machine can copy both states.`);
  const cd = collisionData(N);
  $('ledgerNote').innerHTML = T(`X、Y、Z 三个互补方向的碰撞和 Σ<sub>b</sub>Σ<sub>j</sub>p<sub>bj</sub>² = ${f3(M.collisionTrue)}，恰等于 1 + Tr ρ² = ${f3(1 + M.purity)}（真值）。${cd === null ? '要从样本核对，需同时测 X、Y、Z。' : `样本估计 ${f3(cd)}。`}这条等式由勾股分解与完整层析两条冻结定理合起来推出，合成这一步是本页的推导。`,
    `The collision sum over the three complementary directions X, Y, Z is Σ<sub>b</sub>Σ<sub>j</sub>p<sub>bj</sub>² = ${f3(M.collisionTrue)}, exactly 1 + Tr ρ² = ${f3(1 + M.purity)} (true values). ${cd === null ? 'Checking it from samples needs X, Y and Z all measured.' : `From the samples: ${f3(cd)}.`} The identity follows from the two frozen theorems on the Pythagorean split and complete tomography taken together; combining them is a derivation on this page.`);
  // pills, clock, HUD
  $('pillShots').innerHTML = `SHOTS <strong>${N}</strong>`;
  $('pillVis').innerHTML = `VISIBLE <strong>${k}/3</strong>`;
  $('pillRes').innerHTML = `BLIND <strong>${f3(M.residual)}</strong>`;
  $('pillRun').innerHTML = `RUN <strong>${M.hash}</strong>`;
  $('clock').innerHTML = `${N} <small>/ ${N_MAX}</small>`;
  $('hudBig').textContent = T(`已测 ${N} 个样本 · 可见 ${k}/3 维`, `${N} samples · ${k}/3 dimensions visible`);
  $('hudSub').textContent = T('亮轴 = 正在测的方向 · 白 = 真态 · 琥珀 = 估计 · 品红 = 统计相同、分不开的态', 'bright axes = measured · white = true state · amber = estimate · magenta = states with identical statistics');
  if (!toasted && S.playing && N >= N_MAX) {
    toasted = true;
    toast(k === 3 ? T(`<b>看全了</b>：${N_MAX} 个样本后误差 ${f3(M.err[N])}，还在随 1/√N 下降。`, `<b>Complete</b>: after ${N_MAX} samples the error is ${f3(M.err[N])} and still falls like 1/√N.`)
      : T(`<b>再测也没用</b>：看不见的部分让误差卡在 ${f3(norm3(M.rPerp) / 2)} 附近。`, `<b>More samples do not help</b>: the blind part keeps the error near ${f3(norm3(M.rPerp) / 2)}.`));
  }
}
function syncRail() {
  if ($('marks').dataset.ready) return; $('marks').dataset.ready = '1';
  $('marks').innerHTML = [[0, 'first'], [N_MAX / 2, ''], [N_MAX, 'last']].map(([v, c]) => `<i class="${c}" style="left:${(v / N_MAX * 100).toFixed(2)}%">${v}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
function setControls() { $('tilt').value = S.tilt; $('theta').value = S.theta; $('phase').value = S.phase; $('rlen').value = S.r; $('cloneAngle').value = S.cloneAngle; }
$('tilt').addEventListener('input', () => { S.tilt = parseInt($('tilt').value, 10); custom(); });
$('theta').addEventListener('input', () => { S.theta = parseInt($('theta').value, 10); custom(); });
$('phase').addEventListener('input', () => { S.phase = parseInt($('phase').value, 10); custom(); });
$('rlen').addEventListener('input', () => { S.r = parseFloat($('rlen').value); custom(); });
$('cloneAngle').addEventListener('input', () => { S.cloneAngle = parseInt($('cloneAngle').value, 10); dirty = true; });
document.querySelectorAll('#ctxChips .chip').forEach((b) => b.addEventListener('click', () => {
  const k = CTX.includes(b.dataset.ctx) ? b.dataset.ctx : 'Z';
  if (S.ctx[k] && CTX.filter((c) => S.ctx[c]).length === 1) { toast(T('至少要测一个方向。', 'At least one direction must be measured.')); return; }
  S.ctx[k] = !S.ctx[k]; custom();
}));
$('twinBtn').addEventListener('click', () => { S.twin = !S.twin; custom(); });
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.ctx = { ...p.ctx }; S.theta = p.theta; S.phase = p.phase; S.r = p.r; S.twin = p.twin; if (p.tilt !== undefined) S.tilt = p.tilt; if (p.clone !== undefined) S.cloneAngle = p.clone;
  setControls(); S.preset = name; markPreset(); dirty = true;
  if (p.frac !== undefined) { S.nowFrac = p.frac; S.playing = false; setPlayUI(); $('now').value = S.nowFrac; }
  else if (!reduceMotion) { S.nowFrac = 0; S.dir = 1; S.playing = true; setPlayUI(); }
  TRV.glitch($('app'));
}
document.querySelectorAll('.preset').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
function newRun() { S.run++; dirty = true; }

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
    S.nowFrac = Math.min(N_MAX, Math.max(0, nowN() + (ev.key === 'ArrowRight' ? 1 : -1))) / N_MAX; $('now').value = S.nowFrac;
  }
  else if (ev.key === 'h' || ev.key === 'H') { S.showTrue = !S.showTrue; }
  else if (ev.key === 'r' || ev.key === 'R') newRun();
});

/* =====================================================================
   10. Main loop
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
      S.nowFrac += S.dir * dtSec * S.speed / RUN_SECONDS;
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 2.4; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.6; }
    }
    $('now').value = S.nowFrac;
  }
  if (nowN() !== syncedN) syncOutputs();
  syncRail();
  if (glOK) { updateCamera(dtSec); updateGL(tAcc); renderer.render(scene3, camera); updateTags(); }
  drawPyth(); drawErr(); drawClone();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { labelStaticTags(); syncOutputs(); });

/* read-only probe for automated browser tests */
window.TOMO_DEBUG = {
  pending: () => dirty || nowN() !== syncedN,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, N = nowN(), { plus, cnt } = countsAt(N);
    return { r: M.r.slice(), active: M.active.slice(), normals: M.normals.map((n) => n.slice()), basis: M.B.map((b) => b.slice()), rVis: M.rVis.slice(), rPerp: M.rPerp.slice(),
      purity: M.purity, visSum: M.visSum, visProj: M.visProj, residual: M.residual, orthogonal: M.orthogonal, N, est: M.est[N].slice(), err: M.err[N], errAll: M.err.slice(), expct: M.expct.slice(),
      ctxOf: M.ctxOf.slice(), out: M.out.slice(), u: M.u.slice(), plus, cnt, zr: M.zr.slice(), twinDiff: M.twinDiff, H: { ...M.H }, collisionTrue: M.collisionTrue, collisionData: collisionData(N), hash: M.hash };
  },
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('phase'); S.playing = false; setPlayUI(); S.nowFrac = 0.3; $('now').value = S.nowFrac; cam.tTheta = 0.62; cam.tPhi = 1.1; cam.tR = 8.2; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('two');
S.nowFrac = 0; S.playing = !reduceMotion; $('now').value = S.nowFrac;
if (reduceMotion) { S.nowFrac = 1; $('now').value = 1; }
setPlayUI();
requestAnimationFrame(frame);
})();
