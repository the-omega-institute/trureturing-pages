/* HARD//SQUARES · 硬方块格气 · 互不相邻的粒子
   The hard-core model, P(S) ∝ λ^|S| over independent sets S. Heat-bath Monte Carlo on a 48 × 48 torus; the exact distribution of the
   particle number on the 8 × 8 torus from a row transfer with polynomial entries (OEIS A027683 total 213 256 442 503), used to check
   the frozen identity λ·d⟨N⟩/dλ = Var(N); Adamaszek's necklace map T (jump, turn, fix) with the frozen period theorem
   T^(n−3k) N = g·N; and the star K₁,₂ where the multivariate occupancy bound fails at activities (15, 2, 2).
   Frozen Lean anchors and literature results are named in the page text. Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants
   ===================================================================== */
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, ok: OK, cyan: CY, magenta: MG } = TRV.palette;
const MODES = ['gas', 'exact', 'necklace', 'star'];
const RUN_SECONDS = 18, LMC = 48, LEX = 8, SWEEPS_PER_FRAME = 4, HIST = 300;
const LAM_LO = Math.log(0.1), LAM_HI = Math.log(30), STAR_LO = Math.log(0.1), STAR_HI = Math.log(100);
const LAMBDA_C = 3.7962;
const lamOf = (f) => Math.exp(LAM_LO + (LAM_HI - LAM_LO) * Math.min(1, Math.max(0, f)));
const fracOfLam = (l) => (Math.log(l) - LAM_LO) / (LAM_HI - LAM_LO);

/* =====================================================================
   2. Exact 8 × 8 torus: c_m = number of independent sets with m particles
   ===================================================================== */
const popcount = (m) => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
function torusCounts(w, h) {
  const rows = []; for (let m = 0; m < 1 << w; m++) { const rot = ((m << 1) | (m >> (w - 1))) & ((1 << w) - 1); if ((m & rot) === 0) rows.push(m); }
  const deg = Math.floor(w * h / 2), R = rows.length, total = new Float64Array(deg + 1);
  for (let s = 0; s < R; s++) {
    let vec = Array.from({ length: R }, () => new Float64Array(deg + 1)); vec[s][popcount(rows[s])] = 1;
    for (let step = 1; step < h; step++) {
      const nv = Array.from({ length: R }, () => new Float64Array(deg + 1));
      for (let a = 0; a < R; a++) { const va = vec[a]; for (let b = 0; b < R; b++) if ((rows[a] & rows[b]) === 0) { const sh = popcount(rows[b]), nb = nv[b]; for (let d = 0; d + sh <= deg; d++) if (va[d]) nb[d + sh] += va[d]; } }
      vec = nv;
    }
    for (let a = 0; a < R; a++) if ((rows[a] & rows[s]) === 0) for (let d = 0; d <= deg; d++) total[d] += vec[a][d];
  }
  return total;
}
const COUNTS = torusCounts(LEX, LEX), V_EX = LEX * LEX, TOTAL_EX = COUNTS.reduce((a, b) => a + b, 0);
function exactStats(lam) {   // ⟨N⟩, Var(N) and P(N = m) at activity λ, scaled to avoid overflow
  const lmax = COUNTS.reduce((best, c, m) => (c > 0 ? Math.max(best, Math.log(c) + m * Math.log(lam)) : best), -Infinity);
  const w = Array.from(COUNTS, (c, m) => (c > 0 ? Math.exp(Math.log(c) + m * Math.log(lam) - lmax) : 0));
  const Z = w.reduce((a, b) => a + b, 0); let m1 = 0, m2 = 0; w.forEach((x, m) => { m1 += m * x; m2 += m * m * x; });
  const mean = m1 / Z; return { mean, varN: m2 / Z - mean * mean, pmf: w.map((x) => x / Z) };
}
const responseAt = (lam) => { const e = 1e-5, up = exactStats(lam * (1 + e)).mean, dn = exactStats(lam * (1 - e)).mean; return (up - dn) / (2 * e); };   // λ·d⟨N⟩/dλ by a central difference in λ

/* =====================================================================
   3. Necklaces (Adamaszek): positions mod n, vectors −2, −1, 1, 2
   ===================================================================== */
const mod = (a, n) => ((a % n) + n) % n;
const TURN = { '-2': 1, '-1': 2, '1': -2, '2': -1 };
function necklaceLegal(N, n, k) {
  if (N.size !== 2 * k) return false;
  const ps = [...N.keys()].sort((a, b) => a - b);
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i], q = ps[(i + 1) % ps.length], d = i + 1 < ps.length ? q - p : q - p + n, v = N.get(p), w = N.get(q);
    if (d <= 0 || (v > 0) === (w > 0)) return false;
    if (v < 0 && w > 0 && d % 2 === 0) return false;
    if (v > 0 && w < 0 && ((d + Math.abs(v) + Math.abs(w)) % 2 === 0 || d < 3 || (d === 3 && (Math.abs(v) !== 1 || Math.abs(w) !== 1)))) return false;
  }
  return true;
}
/* one step: JUMP by the vector, TURN, then FIX facing pairs at distance 3 by shortening length-2 vectors */
function necklaceStep(N, n) {
  const J = new Map(); for (const [p, v] of N) J.set(mod(p + v, n), TURN[v]);
  const F = new Map();
  for (const [p, v] of J) { let nv = v; if (v > 0) { const w = J.get(mod(p + 3, n)); if (w !== undefined && w < 0 && v === 2) nv = 1; } else { const w = J.get(mod(p - 3, n)); if (w !== undefined && w > 0 && v === -2) nv = -1; } F.set(p, nv); }
  return F;
}
const necklaceKey = (N, n) => Array.from({ length: n }, (_, p) => (N.has(p) ? N.get(p) : 0)).join(',');
function isometry(A, B, n) {   // the circle isometry g with B = g·A, if any: rotation r_c or reflection s_c (which negates vectors)
  const kb = necklaceKey(B, n);
  for (let c = 0; c < n; c++) {
    const R = new Map(); for (const [p, v] of A) R.set(mod(p + c, n), v); if (necklaceKey(R, n) === kb) return { kind: 'r', c };
    const S = new Map(); for (const [p, v] of A) S.set(mod(-p + c, n), -v); if (necklaceKey(S, n) === kb) return { kind: 's', c };
  }
  return null;
}
function randomNecklace(n, k, rng) {
  for (let tries = 0; tries < 20000; tries++) {
    const start = rng() < 0.5 ? 1 : -1, len = Array.from({ length: 2 * k }, () => (rng() < 0.5 ? 1 : 2)), sign = (i) => (i % 2 === 0 ? start : -start);
    const mins = len.map((li, i) => { const lj = len[(i + 1) % (2 * k)]; if (sign(i) < 0) return 1; let d = 3; if ((d + li + lj) % 2 === 0) d++; if (d === 3 && (li !== 1 || lj !== 1)) d += 2; return d; });
    let rest = n - mins.reduce((a, b) => a + b, 0); if (rest < 0 || rest % 2) continue;
    const gaps = mins.slice(); while (rest > 0) { gaps[Math.floor(rng() * gaps.length)] += 2; rest -= 2; }
    const N = new Map(); let p = Math.floor(rng() * n); for (let i = 0; i < 2 * k; i++) { N.set(p % n, sign(i) * len[i]); p += gaps[i]; }
    if (necklaceLegal(N, n, k)) return N;
  }
  return null;
}

/* =====================================================================
   4. The star K₁,₂ (centre 0, leaves 1 and 2)
   ===================================================================== */
const starE = (l0, l1, l2) => (l0 + l1 + l2 + 2 * l1 * l2) / (1 + l0 + l1 + l2 + l1 * l2);
const starBound = (l0, l1, l2) => l0 / (1 + 3 * l0) + l1 / (1 + 2 * l1) + l2 / (1 + 2 * l2);
function bgcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }
const frac = (p, q) => { const g = bgcd(p, q) || 1n; p /= g; q /= g; if (q < 0n) { p = -p; q = -q; } return q === 1n ? `${p}` : `${p}/${q}`; };
function starExact(l0, l1) {   // exact fractions for integer activities
  if (![l0, l1].every((x) => Number.isInteger(x))) return null;
  const a = BigInt(l0), b = BigInt(l1);
  const eN = a + 2n * b + 2n * b * b, eD = 1n + a + 2n * b + b * b;
  const bN = a * (1n + 2n * b) + 2n * b * (1n + 3n * a), bD = (1n + 3n * a) * (1n + 2n * b);
  return { E: frac(eN, eD), B: frac(bN, bD), D: frac(eN * bD - bN * eD, eD * bD) };
}

/* =====================================================================
   5. State and presets
   ===================================================================== */
const S = { mode: 'gas', n: 12, k: 2, leaf: 2, seed: 1, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'sweep' };
const PRESETS = {
  dilute: { mode: 'gas', frac: fracOfLam(0.5), play: false,
    zh: 'λ = 0.5：粒子稀疏，两种颜色（两个子格）混在一起，没有长程秩序。密度接近 8 × 8 精确值。',
    en: 'λ = 0.5: the particles are sparse and both colours (both sublattices) mix; there is no long-range order. The density is close to the exact 8 × 8 value.' },
  critical: { mode: 'gas', frac: fracOfLam(LAMBDA_C), play: false,
    zh: 'λ ≈ 3.796：无限网格的相变点附近（数值估计）。两种颜色的团块大小不一，子格占据差剧烈涨落。',
    en: 'λ ≈ 3.796: near the transition point of the infinite grid (a numerical estimate). Clusters of both colours come in all sizes, and the sublattice imbalance fluctuates strongly.' },
  ordered: { mode: 'gas', frac: fracOfLam(20), play: false,
    zh: 'λ = 20：从随机初态出发，粒子挤成棋盘格的畴，两种颜色的畴互相吞并，慢慢粗化。',
    en: 'λ = 20: starting from a random state the particles crowd into checkerboard domains, and domains of the two colours absorb each other and slowly coarsen.' },
  sweep: { mode: 'gas', frac: 0, play: true,
    zh: '把 λ 从 0.1 扫到 30：密度（青）一路升高，过了约 3.8 之后子格占据差（品红）跳起来。灰线是 8 × 8 环面的精确密度。',
    en: 'Sweep λ from 0.1 to 30: the density (cyan) rises steadily, and past about 3.8 the sublattice imbalance (magenta) jumps up. The grey line is the exact density of the 8 × 8 torus.' },
  exact: { mode: 'exact', frac: fracOfLam(1), play: true,
    zh: '8 × 8 环面的全部 213 256 442 503 个配置按粒子数精确计数。冻结恒等式 λ·d⟨N⟩/dλ = Var(N)：数值微分与方差对得上。',
    en: 'All 213 256 442 503 configurations of the 8 × 8 torus, counted exactly by particle number. The frozen identity λ·d⟨N⟩/dλ = Var(N): numerical differentiation agrees with the variance.' },
  neck12: { mode: 'necklace', n: 12, k: 2, frac: 0, play: true,
    zh: 'n = 12，4 颗石子：L = n − 3k = 6 步后，配置变成初始配置的一个旋转（或反射）像——冻结定理保证总是如此。',
    en: 'n = 12 with 4 stones: after L = n − 3k = 6 steps the configuration is a rotated (or reflected) copy of the start; the frozen theorem guarantees it always is.' },
  neck36: { mode: 'necklace', n: 36, k: 5, frac: 0, play: true,
    zh: 'n = 36，10 颗石子：L = 21。石子不停跳动、转向、在相距 3 时缩短，21 步后整体只是转了一个角度。',
    en: 'n = 36 with 10 stones: L = 21. The stones keep jumping, turning and shortening at distance 3, and after 21 steps the whole necklace has merely rotated.' },
  star: { mode: 'star', leaf: 2, frac: (Math.log(15) - STAR_LO) / (STAR_HI - STAR_LO), play: false,
    zh: '星形图 K₁,₂，中心活度 15，叶子活度 2：𝔼|I| = 9/8，被推翻的下界是 259/230，多出 1/920。下方热图里品红区域都是下界失败的地方。',
    en: 'The star K₁,₂ with activity 15 at the centre and 2 at the leaves: 𝔼|I| = 9/8 while the refuted bound is 259/230, larger by 1/920. In the heat map below, the magenta region is everywhere the bound fails.' }
};

/* =====================================================================
   6. The model
   ===================================================================== */
let MODEL = null, dirty = true, rng = TRV.mulberry32(1);
function buildGas(M) {
  M.L = M.mode === 'exact' ? LEX : LMC; const L = M.L;
  M.grid = new Uint8Array(L * L); rng = TRV.mulberry32(S.seed * 7919 + (M.mode === 'exact' ? 1 : 0));
  for (let i = 0; i < L * L; i++) M.grid[i] = 0;
  M.nb = Array.from({ length: L * L }, (_, i) => { const x = i % L, y = (i / L) | 0; return [((x + 1) % L) + y * L, ((x + L - 1) % L) + y * L, x + ((y + 1) % L) * L, x + ((y + L - 1) % L) * L]; });
  M.sweeps = 0; M.hist = []; M.trace = []; M.lamRun = null; M.acc = { n: 0, rho: 0, ms: 0, rho2: 0 };
  M.exactRho = Array.from({ length: 121 }, (_, i) => { const lam = Math.exp(LAM_LO + (LAM_HI - LAM_LO) * i / 120); return [lam, exactStats(lam).mean / V_EX]; });
}
function mcSweep(M, lam) {
  const L = M.L, n = L * L, g = M.grid, p = lam / (1 + lam);
  for (let s = 0; s < n; s++) { const i = Math.floor(rng() * n), nb = M.nb[i]; if (g[nb[0]] | g[nb[1]] | g[nb[2]] | g[nb[3]]) { g[i] = 0; continue; } g[i] = rng() < p ? 1 : 0; }
  let a = 0, b = 0; for (let i = 0; i < n; i++) if (g[i]) { const x = i % L, y = (i / L) | 0; if ((x + y) % 2) b++; else a++; }
  M.sweeps++; const rho = (a + b) / n, ms = Math.abs(a - b) / (n / 2);
  M.hist.push([a / (n / 2), b / (n / 2)]); if (M.hist.length > HIST) M.hist.shift();
  if (M.lamRun === null || Math.abs(Math.log(lam / M.lamRun)) > 0.02) { M.lamRun = lam; M.acc = { n: 0, rho: 0, ms: 0, rho2: 0 }; }
  const A = M.acc; A.n++; A.rho += rho; A.ms += ms; A.rho2 += rho * rho;
  return { rho, ms };
}
function buildNecklace(M) {
  const n = S.n, k = Math.min(S.k, Math.floor(n / 4)); M.n = n; M.k = k; M.Lp = n - 3 * k;
  const r = TRV.mulberry32(S.seed * 104729 + n * 31 + k); M.N0 = randomNecklace(n, k, r);
  M.frames = [M.N0]; for (let t = 1; t <= 2 * M.Lp; t++) M.frames.push(necklaceStep(M.frames[t - 1], n));
  M.legal = M.frames.map((F) => necklaceLegal(F, n, k));
  M.iso = M.frames.map((F) => isometry(M.N0, F, n));
  M.exactPeriod = (() => { const k0 = necklaceKey(M.N0, n); let F = M.N0; for (let t = 1; t <= 4 * n; t++) { F = necklaceStep(F, n); if (necklaceKey(F, n) === k0) return t; } return null; })();
}
function build() {
  const M = { mode: S.mode };
  if (S.mode === 'gas' || S.mode === 'exact') buildGas(M); else if (S.mode === 'necklace') buildNecklace(M);
  MODEL = M;
}
function progress() {
  const M = MODEL, f = Math.min(1, Math.max(0, S.nowFrac));
  if (M.mode === 'gas' || M.mode === 'exact') return { lam: lamOf(f) };
  if (M.mode === 'necklace') return { t: Math.round(2 * M.Lp * f) };
  return { l0: Math.exp(STAR_LO + (STAR_HI - STAR_LO) * f) };
}

/* =====================================================================
   7. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const num = (v, d = 4) => (v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(d));
const sci = (v, d = 2) => (!isFinite(v) ? '—' : v === 0 ? '0' : Math.abs(v) < 1e-3 ? v.toExponential(d) : v.toFixed(d + 3));
const fmtInt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/* =====================================================================
   8. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 30000, PTS_MAX = 2400;
const CAMS = { iso: [0.6, 0.95, 15], front: [0.0001, 1.45, 15], top: [0.0001, 0.06, 15] };
const cam = { theta: 0.6, phi: 0.95, r: 15, tTheta: 0.6, tPhi: 0.95, tR: 15 };
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
const TILE_FS = `
varying vec3 vCol; varying float vA;
void main(){
  vec2 c = abs(gl_PointCoord - 0.5) * 2.0; float m = max(c.x, c.y);
  float a = (smoothstep(1.0, 0.82, m) * 0.55 + smoothstep(1.0, 0.9, m) * smoothstep(0.7, 0.9, m) * 0.6) * vA;
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
  pts = new THREE.Points(gp, new THREE.ShaderMaterial({ vertexShader: EVT_VS, fragmentShader: TILE_FS, uniforms: { uScale: { value: 60 } }, ...additive }));
  pts.frustumCulled = false; scene3.add(pts);
}
function updateGL() {
  const M = MODEL, pr = progress();
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp[3 * v] = a[0]; Pp[3 * v + 1] = a[1]; Pp[3 * v + 2] = a[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; Pp[3 * v] = b[0]; Pp[3 * v + 1] = b[1]; Pp[3 * v + 2] = b[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  let tileScale = 1;
  if (M.mode === 'gas' || M.mode === 'exact') {
    // the torus as a flat square: particles are tiles, cyan on sublattice A, magenta on B
    const L = M.L, W = 9.6, c = W / L, X = (x) => -W / 2 + (x + 0.5) * c;
    for (let i = 0; i <= L; i += M.mode === 'exact' ? 1 : 8) { const u = -W / 2 + i * c; seg([u, 0, -W / 2], [u, 0, W / 2], COL.gray, 0.18); seg([-W / 2, 0, u], [W / 2, 0, u], COL.gray, 0.18); }
    for (let i = 0; i < L * L; i++) if (M.grid[i]) { const x = i % L, y = (i / L) | 0; dot([X(x), 0.02, X(y)], (x + y) % 2 ? COL.magenta : COL.cyan, 0.95, 1); }
    tileScale = c;
  } else if (M.mode === 'necklace') {
    // one ring per step, stacked upward; stones as tiles, an arrow for each vector, worldlines from each jump
    const n = M.n, R = 3.2, H = 6.4 / Math.max(1, 2 * M.Lp), P = (p, t) => { const a = 2 * Math.PI * p / n; return [R * Math.cos(a), -2.6 + t * H, R * Math.sin(a)]; };
    for (let t = 0; t <= pr.t; t++) {
      const F = M.frames[t], cur = t === pr.t, atL = t === M.Lp, k = cur ? 0.9 : atL ? 0.6 : 0.18;
      for (let p = 0; p < n; p++) seg(P(p, t), P(p + 1, t), atL ? COL.amber : COL.gray, cur ? 0.35 : atL ? 0.5 : 0.08);
      for (const [p, w] of F) {
        const col = w > 0 ? COL.cyan : COL.magenta, A = P(p, t), B = P(p + w * 0.42, t); seg(A, B, col, k);
        if (cur || atL || t === 0) dot(A, col, cur ? 1 : 0.55, Math.abs(w) === 2 ? 1.5 : 1);
        if (t < pr.t) seg(A, P(p + w, t + 1), col, 0.22);
      }
    }
    if (pr.t >= M.Lp && M.iso[M.Lp]) { const g = M.iso[M.Lp]; for (const [p, w] of M.N0) { const q = g.kind === 'r' ? mod(p + g.c, n) : mod(-p + g.c, n); dot(P(q, M.Lp), COL.amber, 0.9, 2.2); } }
    tileScale = 0.22;
  } else {
    // the star K₁,₂: node tiles sized by activity, occupation probabilities as bars, the bound's terms as amber rings
    const l0 = pr.l0, l1 = S.leaf, Z = 1 + l0 + 2 * l1 + l1 * l1, occ = [l0 / Z, (l1 + l1 * l1) / Z, (l1 + l1 * l1) / Z], bnd = [l0 / (1 + 3 * l0), l1 / (1 + 2 * l1), l1 / (1 + 2 * l1)];
    const pos = [[0, 0, 0], [-3.2, 0, 1.6], [3.2, 0, 1.6]];
    seg(pos[0], pos[1], COL.gray, 0.6); seg(pos[0], pos[2], COL.gray, 0.6);
    pos.forEach((P, i) => {
      const h = 4 * occ[i], hb = 4 * bnd[i];
      dot(P, i === 0 ? COL.amber : COL.cyan, 1, 1.2 + 0.25 * Math.log1p(i === 0 ? l0 : l1));
      for (const dx of [-0.18, 0.18]) seg([P[0] + dx, 0, P[2]], [P[0] + dx, h, P[2]], COL.cyan, 0.85);
      seg([P[0] - 0.18, h, P[2]], [P[0] + 0.18, h, P[2]], COL.cyan, 0.9);
      for (let q = 0; q < 24; q++) { const a1 = 2 * Math.PI * q / 24, a2 = 2 * Math.PI * (q + 1) / 24; seg([P[0] + 0.45 * Math.cos(a1), hb, P[2] + 0.45 * Math.sin(a1)], [P[0] + 0.45 * Math.cos(a2), hb, P[2] + 0.45 * Math.sin(a2)], COL.amber, 0.7); }
    });
    tileScale = 1;
  }
  lines.geometry.setDrawRange(0, v); Lb.position.needsUpdate = true; Lb.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 300 * tileScale * renderer.getPixelRatio() * (stage.clientHeight / 600);
}

/* =====================================================================
   9. Camera
   ===================================================================== */
let camName = 'iso';
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.5 : 1);
  camera.position.set(r * sp * Math.sin(cam.theta), 0.6 + r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0, 0.6, 0);
}
function setCamPreset(name) {
  const p = CAMS[name]; if (!p) return; camName = name;
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
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(30, Math.max(7, cam.tR * drag.pinch / d)); drag.pinch = d; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY;
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => { if (!drag.pts.has(ev.pointerId)) return; drag.pts.delete(ev.pointerId); if (drag.pts.size === 0) drag.pinch = 0; };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(30, Math.max(7, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

/* =====================================================================
   10. Tags
   ===================================================================== */
const tagPool = [];
function tagAt(k, cls) { while (tagPool.length <= k) { const el = document.createElement('div'); el.className = 'tag raw'; tagsBox.appendChild(el); tagPool.push(el); } const el = tagPool[k]; el.className = 'tag raw ' + cls; return el; }
function placeTag(el, p, show = true) {
  if (!glOK || !show) { el.style.display = 'none'; return; }
  const q = proj3(p); if (q.z > 1 || q.z < -1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const w = el.offsetWidth, W = stage.clientWidth, x = Math.min(W - w / 2 - 6, Math.max(w / 2 + 6, q.x));
  el.style.left = x + 'px'; el.style.top = q.y + 'px';
}
function updateTags() {
  const M = MODEL, pr = progress(); let k = 0;
  const put = (text, p, cls) => { const el = tagAt(k++, cls); el.textContent = text; placeTag(el, p); };
  if (M.mode === 'gas' || M.mode === 'exact') { put(T(`子格 A`, `SUBLATTICE A`), [-4.8, 0.4, -5.2], 'cy'); put(T(`子格 B`, `SUBLATTICE B`), [4.8, 0.4, -5.2], 'mg'); put(`${M.L} × ${M.L}`, [0, 0.4, 5.4], ''); }
  else if (M.mode === 'necklace') { put('t = 0', [3.6, -2.6, 0], ''); put(`t = L = ${M.Lp}`, [3.6, -2.6 + 3.2, 0], 'hot'); put(`t = ${pr.t}`, [-3.8, -2.6 + pr.t * 6.4 / Math.max(1, 2 * M.Lp), 0], 'cy'); }
  else { put(T(`中心 λ₀ = ${num(pr.l0, 2)}`, `CENTRE λ₀ = ${num(pr.l0, 2)}`), [0, -0.5, 0], 'hot'); put(T(`叶 λ = ${S.leaf}`, `LEAF λ = ${S.leaf}`), [-3.2, -0.5, 1.6], 'cy'); put(T(`叶 λ = ${S.leaf}`, `LEAF λ = ${S.leaf}`), [3.2, -0.5, 1.6], 'cy'); }
  for (let i = k; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}

/* =====================================================================
   11. 2D panels
   ===================================================================== */
function frame2d(cv, pl0 = 50) {
  const dpr = fitCanvas(cv), ctx = cv.getContext('2d'), Wd = cv.width, Hh = cv.height;
  ctx.clearRect(0, 0, Wd, Hh);
  const pl = pl0 * dpr, pr = 12 * dpr, pt = 10 * dpr, pb = 20 * dpr;
  ctx.font = `${9.5 * dpr}px ${TRV.fonts.data}`;
  return { dpr, ctx, W: Wd, Hh, pl, pt, iw: Wd - pl - pr, ih: Hh - pt - pb };
}
const yTicks = (ctx, dpr, pl, Y, vals, fmt) => { ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const g of vals) ctx.fillText(fmt(g), pl - 4 * dpr, Y(g)); };
const xTicks = (ctx, dpr, pt, ih, X, vals, fmt) => { ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const g of vals) ctx.fillText(fmt(g), X(g), pt + ih + 3 * dpr); };
const vline = (ctx, x, pt, ih, col, dpr) => { ctx.strokeStyle = col; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + ih); ctx.stroke(); ctx.setLineDash([]); };
function drawMain() {
  const F = frame2d(cv1); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, pr = progress();
  if (M.mode === 'gas' || M.mode === 'exact') {
    const X = (l) => pl + (Math.log(l) - LAM_LO) / (LAM_HI - LAM_LO) * iw;
    xTicks(ctx, dpr, pt, ih, X, [0.1, 0.3, 1, 3, 10, 30], String);
    vline(ctx, X(LAMBDA_C), pt, ih, FAINT, dpr); vline(ctx, X(pr.lam), pt, ih, AM, dpr);
    if (M.mode === 'gas') {
      const Y = (v) => pt + ih - v * ih;
      yTicks(ctx, dpr, pl, Y, [0, 0.25, 0.5, 0.75, 1], (v) => v.toFixed(2));
      ctx.strokeStyle = INK; ctx.globalAlpha = 0.5; ctx.beginPath(); M.exactRho.forEach(([l, r], i) => { if (i) ctx.lineTo(X(l), Y(r)); else ctx.moveTo(X(l), Y(r)); }); ctx.stroke(); ctx.globalAlpha = 1;
      for (const [l, r, m] of M.trace) { ctx.fillStyle = CY; ctx.fillRect(X(l) - dpr, Y(r) - dpr, 2 * dpr, 2 * dpr); ctx.fillStyle = MG; ctx.fillRect(X(l) - dpr, Y(m) - dpr, 2 * dpr, 2 * dpr); }
      $('c1Title').textContent = T('48 × 48 蒙特卡罗：密度 ρ（青）与子格占据差 |ρA − ρB|/ρmax（品红），灰 = 8 × 8 精确密度', '48 × 48 MONTE CARLO: DENSITY ρ (CYAN) AND SUBLATTICE IMBALANCE (MAGENTA), GREY = EXACT 8 × 8 DENSITY');
      $('c1Meta').textContent = T('虚线：λ ≈ 3.796', 'dashes: λ ≈ 3.796');
    } else {
      let top = 0; const curve = []; for (let i = 0; i <= 160; i++) { const l = Math.exp(LAM_LO + (LAM_HI - LAM_LO) * i / 160), s = exactStats(l); curve.push([l, s.mean, s.varN]); top = Math.max(top, s.mean, s.varN); }
      const Y = (v) => pt + ih - v / (top * 1.05) * ih;
      yTicks(ctx, dpr, pl, Y, [0, 8, 16, 24, 32].filter((v) => v <= top * 1.05), String);
      ctx.strokeStyle = CY; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); curve.forEach(([l, m], i) => { if (i) ctx.lineTo(X(l), Y(m)); else ctx.moveTo(X(l), Y(m)); }); ctx.stroke();
      ctx.strokeStyle = MG; ctx.beginPath(); curve.forEach(([l, , v], i) => { if (i) ctx.lineTo(X(l), Y(v)); else ctx.moveTo(X(l), Y(v)); }); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = AM; for (let i = 0; i <= 160; i += 8) { const l = curve[i][0]; ctx.beginPath(); ctx.arc(X(l), Y(responseAt(l)), 2.4 * dpr, 0, 2 * Math.PI); ctx.fill(); }
      $('c1Title').textContent = T('8 × 8 精确：⟨N⟩（青）、Var(N)（品红）、λ·d⟨N⟩/dλ（琥珀点）', 'EXACT 8 × 8: ⟨N⟩ (CYAN), Var(N) (MAGENTA), λ·d⟨N⟩/dλ (AMBER DOTS)');
      $('c1Meta').textContent = T('琥珀点落在品红线上 = 冻结恒等式', 'amber on magenta = the frozen identity');
    }
  } else if (M.mode === 'necklace') {
    // space-time diagram: position across, step t downward
    const n = M.n, T2 = 2 * M.Lp, X = (p) => pl + (p + 0.5) / n * iw, Y = (t) => pt + t / T2 * ih;
    yTicks(ctx, dpr, pl, Y, [0, M.Lp, T2], (t) => `t=${t}`);
    ctx.strokeStyle = AM; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(pl, Y(M.Lp)); ctx.lineTo(pl + iw, Y(M.Lp)); ctx.stroke(); ctx.globalAlpha = 1;
    for (let t = 0; t <= T2; t++) for (const [p, w] of M.frames[t]) { ctx.fillStyle = w > 0 ? CY : MG; ctx.globalAlpha = t <= pr.t ? 1 : 0.18; const s = (Math.abs(w) === 2 ? 3.2 : 2.2) * dpr; ctx.fillRect(X(p) - s / 2, Y(t) - s / 2, s, s); }
    ctx.globalAlpha = 1;
    $('c1Title').textContent = T(`时空图：横 = 位置（n = ${n}），纵 = 步数；青 = 正向，品红 = 反向，大点 = 长度 2`, `SPACE–TIME: ACROSS = POSITION (n = ${n}), DOWN = STEP; CYAN = POSITIVE, MAGENTA = NEGATIVE, LARGE = LENGTH 2`);
    $('c1Meta').textContent = T(`琥珀线：t = L = ${M.Lp}`, `amber line: t = L = ${M.Lp}`);
  } else {
    const l1 = S.leaf, X = (l) => pl + (Math.log(l) - STAR_LO) / (STAR_HI - STAR_LO) * iw, diffs = []; let lo = 0, hi = 0;
    for (let i = 0; i <= 300; i++) { const l = Math.exp(STAR_LO + (STAR_HI - STAR_LO) * i / 300), d = starE(l, l1, l1) - starBound(l, l1, l1); diffs.push([l, d]); lo = Math.min(lo, d); hi = Math.max(hi, d); }
    const s0 = 1e-4, Yv = (v) => Math.asinh(v / s0), A = Yv(lo) * 1.1 - 0.2, B = Yv(hi) * 1.1 + 0.2, Y = (v) => pt + ih - (Yv(v) - A) / (B - A) * ih;
    xTicks(ctx, dpr, pt, ih, X, [0.1, 1, 10, 100], String);
    yTicks(ctx, dpr, pl, Y, [lo, 0, hi].filter((v, i, a) => a.indexOf(v) === i), (v) => (v === 0 ? '0' : v.toExponential(0)));
    ctx.strokeStyle = FAINT; ctx.beginPath(); ctx.moveTo(pl, Y(0)); ctx.lineTo(pl + iw, Y(0)); ctx.stroke();
    for (let i = 1; i < diffs.length; i++) { const [la, da] = diffs[i - 1], [lb, db] = diffs[i]; ctx.strokeStyle = da < 0 || db < 0 ? MG : CY; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); ctx.moveTo(X(la), Y(da)); ctx.lineTo(X(lb), Y(db)); ctx.stroke(); }
    ctx.lineWidth = 1; vline(ctx, X(pr.l0), pt, ih, AM, dpr);
    $('c1Title').textContent = T(`𝔼|I| − 下界，随中心活度 λ₀ 变化（叶 λ = ${l1}）；品红 = 下界失败`, `𝔼|I| − BOUND AGAINST THE CENTRE ACTIVITY λ₀ (LEAF λ = ${l1}); MAGENTA = THE BOUND FAILS`);
    $('c1Meta').textContent = T('纵轴 asinh 刻度', 'asinh scale');
  }
}
function drawSide() {
  const F = frame2d(cv2); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, pr = progress();
  if (M.mode === 'gas') {
    const X = (i) => pl + i / (HIST - 1) * iw, Y = (v) => pt + ih - v * ih;
    yTicks(ctx, dpr, pl, Y, [0, 0.5, 1], (v) => v.toFixed(1));
    for (const [j, col] of [[0, CY], [1, MG]]) { ctx.strokeStyle = col; ctx.beginPath(); M.hist.forEach((h, i) => { if (i) ctx.lineTo(X(i), Y(h[j])); else ctx.moveTo(X(i), Y(h[j])); }); ctx.stroke(); }
    $('c2Title').textContent = T('最近 300 次扫描：子格 A（青）与 B（品红）的占据', 'LAST 300 SWEEPS: OCCUPATION OF SUBLATTICE A (CYAN) AND B (MAGENTA)');
    $('c2Meta').textContent = T(`共 ${fmtInt(M.sweeps)} 次扫描`, `${fmtInt(M.sweeps)} sweeps in all`);
  } else if (M.mode === 'exact') {
    const s = exactStats(pr.lam), bw = iw / 33, top = Math.max(...s.pmf), Y = (v) => pt + ih - v / top * ih;
    s.pmf.forEach((p, m) => { ctx.fillStyle = Math.abs(m - s.mean) <= Math.sqrt(s.varN) ? CY : FAINT; ctx.fillRect(pl + m * bw + bw * 0.12, Y(p), bw * 0.76, pt + ih - Y(p)); });
    xTicks(ctx, dpr, pt, ih, (m) => pl + (m + 0.5) * bw, [0, 8, 16, 24, 32], String); yTicks(ctx, dpr, pl, Y, [0, top], (v) => v.toFixed(2));
    $('c2Title').textContent = T(`λ = ${num(pr.lam, 3)} 时粒子数 N 的精确分布`, `EXACT DISTRIBUTION OF THE PARTICLE NUMBER N AT λ = ${num(pr.lam, 3)}`); $('c2Meta').textContent = T('青 = 均值 ± 标准差', 'cyan = mean ± one standard deviation');
  } else if (M.mode === 'necklace') {
    const T2 = 2 * M.Lp, bw = iw / (T2 + 1);
    M.iso.forEach((g, t) => { ctx.fillStyle = g ? (t === M.Lp ? AM : CY) : FAINT; ctx.globalAlpha = t <= pr.t ? 0.9 : 0.25; const h = g ? ih : ih * 0.15; ctx.fillRect(pl + t * bw + bw * 0.15, pt + ih - h, bw * 0.7, h); });
    ctx.globalAlpha = 1; xTicks(ctx, dpr, pt, ih, (t) => pl + (t + 0.5) * bw, [0, M.Lp, T2], String);
    $('c2Title').textContent = T('Tᵗ N 是否是 N 的旋转或反射像（高柱 = 是）', 'IS Tᵗ N A ROTATION OR REFLECTION OF N? (TALL BAR = YES)'); $('c2Meta').textContent = T(`t = 0, L, 2L 必然是`, `t = 0, L, 2L always are`);
  } else {
    // the sign of 𝔼|I| − bound over the (λ₀, λ_leaf) plane, log–log
    const cols = 90, rows = 40, cw = iw / cols, rh = ih / rows, L1LO = Math.log(0.1), L1HI = Math.log(10);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const l0 = Math.exp(STAR_LO + (STAR_HI - STAR_LO) * (i + 0.5) / cols), l1 = Math.exp(L1LO + (L1HI - L1LO) * (j + 0.5) / rows), d = starE(l0, l1, l1) - starBound(l0, l1, l1); ctx.fillStyle = d < 0 ? MG : CY; ctx.globalAlpha = d < 0 ? 0.85 : 0.15 + 0.5 * Math.min(1, d); ctx.fillRect(pl + i * cw, pt + ih - (j + 1) * rh, cw + 0.5, rh + 0.5); }
    ctx.globalAlpha = 1;
    const px = pl + (Math.log(pr.l0) - STAR_LO) / (STAR_HI - STAR_LO) * iw, py = pt + ih - (Math.log(S.leaf) - L1LO) / (L1HI - L1LO) * ih;
    ctx.strokeStyle = AM; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.arc(px, py, 4 * dpr, 0, 2 * Math.PI); ctx.stroke(); ctx.lineWidth = 1;
    xTicks(ctx, dpr, pt, ih, (l) => pl + (Math.log(l) - STAR_LO) / (STAR_HI - STAR_LO) * iw, [0.1, 1, 10, 100], (l) => `λ₀=${l}`);
    yTicks(ctx, dpr, pl, (l) => pt + ih - (Math.log(l) - L1LO) / (L1HI - L1LO) * ih, [0.1, 1, 10], (l) => `λ=${l}`);
    $('c2Title').textContent = T('整个平面：下界失败的地方（品红）', 'THE WHOLE PLANE: WHERE THE BOUND FAILS (MAGENTA)'); $('c2Meta').textContent = T('横 = 中心，纵 = 叶，对数刻度', 'across = centre, up = leaf, log scales');
  }
}

/* =====================================================================
   12. Readouts and controls
   ===================================================================== */
let syncedKey = '', toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function setRo(rows) { rows.forEach(([l, v], i) => { $(`ro${i + 1}L`).textContent = l; $(`ro${i + 1}`).textContent = v; }); }
function pill(id, label, value) { $(id).innerHTML = `${label} <strong>${value}</strong>`; }
function readouts() {
  const M = MODEL, pr = progress();
  if (M.mode === 'gas') {
    const A = M.acc, n = Math.max(1, A.n), rho = A.rho / n, ms = A.ms / n, ex = exactStats(pr.lam).mean / V_EX;
    setRo([[T('活度 λ', 'Activity λ'), num(pr.lam, 3)], [T(`密度 ρ（最近 ${A.n} 次扫描的平均）`, `Density ρ (mean over the last ${A.n} sweeps)`), num(rho, 4)],
      [T('子格占据差 |ρA − ρB|/(1/2)', 'Sublattice imbalance |ρA − ρB|/(1/2)'), num(ms, 4)], [T('8 × 8 环面的精确密度', 'Exact density of the 8 × 8 torus'), num(ex, 4)],
      [T('扫描次数 · 格点数', 'Sweeps · sites'), `${fmtInt(M.sweeps)} · ${LMC * LMC}`]]);
    pill('pillA', 'λ', num(pr.lam, 2)); pill('pillB', 'ρ', num(rho, 3)); pill('pillC', 'ORDER', num(ms, 3)); pill('pillD', 'SWEEPS', fmtInt(M.sweeps));
    $('roNote').innerHTML = pr.lam > LAMBDA_C ? T('λ 高于约 3.796：有序相一侧。有限环面上两个子格会轮流占优，畴的边界慢慢移动。', 'λ above about 3.796: the ordered side. On a finite torus the two sublattices take turns in the lead, and domain walls move slowly.') : T('λ 低于约 3.796：无序相一侧，两个子格的占据差在 0 附近涨落。', 'λ below about 3.796: the disordered side; the sublattice imbalance fluctuates around 0.');
  } else if (M.mode === 'exact') {
    const s = exactStats(pr.lam), r = responseAt(pr.lam);
    setRo([[T('活度 λ', 'Activity λ'), num(pr.lam, 4)], ['⟨N⟩ · ρ = ⟨N⟩/64', `${num(s.mean, 6)} · ${num(s.mean / V_EX, 6)}`], ['Var(N)', num(s.varN, 8)],
      [T('λ·d⟨N⟩/dλ（数值微分）', 'λ·d⟨N⟩/dλ (numerical derivative)'), num(r, 8)], [T('两者之差 · 配置总数（A027683）', 'Difference · total configurations (A027683)'), `${sci(r - s.varN, 1)} · ${fmtInt(TOTAL_EX)}`]]);
    pill('pillA', 'λ', num(pr.lam, 2)); pill('pillB', '⟨N⟩', num(s.mean, 3)); pill('pillC', 'Var', num(s.varN, 3)); pill('pillD', 'λ·dN/dλ', num(r, 3));
    $('roNote').innerHTML = T('精确分布来自逐行转移矩阵（每行是长 8 的圆上的独立集，共 47 种），系数就是各粒子数的配置个数；最大粒子数 32 只有两个配置（两个棋盘）。', 'The exact distribution comes from a row transfer (each row is an independent set of the 8-cycle, 47 kinds); its coefficients are the configuration counts for each particle number. The maximum, 32 particles, has just two configurations (the two checkerboards).');
  } else if (M.mode === 'necklace') {
    const g = M.iso[pr.t], gL = M.iso[M.Lp];
    const iso = (x) => (x ? (x.kind === 'r' ? T(`旋转 ${x.c} 格`, `rotation by ${x.c}`) : T(`反射（c = ${x.c}）`, `reflection (c = ${x.c})`)) : T('否', 'no'));
    setRo([[T('n · 石子数 2k · L = n − 3k', 'n · stones 2k · L = n − 3k'), `${M.n} · ${2 * M.k} · ${M.Lp}`], [T('步数 t', 'Step t'), String(pr.t)],
      [T('Tᵗ N 是 N 的保距像吗？', 'Is Tᵗ N an isometric copy of N?'), iso(g)], [T('T^L N 与 N 的关系（冻结定理）', 'T^L N against N (frozen theorem)'), iso(gL)],
      [T('每一步都满足项链条件？ · 精确回到 N 的最小步数', 'Legal at every step? · least step with exact return to N'), `${M.legal.every(Boolean) ? T('是', 'yes') : T('否', 'no')} · ${M.exactPeriod ?? '—'}`]]);
    pill('pillA', 'n', M.n); pill('pillB', '2k', 2 * M.k); pill('pillC', 'L', M.Lp); pill('pillD', 't', pr.t);
    $('roNote').innerHTML = T(`冻结定理只保证 t = L 时回到 N 的某个旋转或反射；精确回到 N 本身要等到 L 的某个倍数（这里是 ${M.exactPeriod ?? '—'} 步）。`, `The frozen theorem only promises a rotation or reflection of N at t = L; returning to N itself takes some multiple of L (here ${M.exactPeriod ?? '—'} steps).`);
  } else {
    const l0 = pr.l0, l1 = S.leaf, E = starE(l0, l1, l1), B = starBound(l0, l1, l1), ex = starExact(Math.round(l0 * 1e6) / 1e6, l1);
    setRo([[T('中心 λ₀ · 叶 λ₁ = λ₂', 'Centre λ₀ · leaves λ₁ = λ₂'), `${num(l0, 3)} · ${l1}`], [T('𝔼|I|（精确）', '𝔼|I| (exact)'), ex ? `${ex.E} = ${num(E, 6)}` : num(E, 6)],
      [T('被推翻的下界 Σ λ/(1 + (d + 1)λ)', 'The refuted bound Σ λ/(1 + (d + 1)λ)'), ex ? `${ex.B} = ${num(B, 6)}` : num(B, 6)],
      [T('𝔼|I| − 下界', '𝔼|I| − bound'), ex ? `${ex.D} = ${sci(E - B, 3)}` : sci(E - B, 3)], [T('五个独立集的权重 ∅, {0}, {1}, {2}, {1, 2}', 'Weights of the five independent sets ∅, {0}, {1}, {2}, {1, 2}'), `1, ${num(l0, 2)}, ${l1}, ${l1}, ${num(l1 * l1, 2)}`]]);
    pill('pillA', 'λ₀', num(l0, 2)); pill('pillB', '𝔼|I|', num(E, 4)); pill('pillC', E < B ? 'FAILS' : 'HOLDS', sci(E - B, 2)); pill('pillD', T('叶', 'LEAF'), l1);
    $('roNote').innerHTML = E < B ? T('这里 𝔼|I| 小于提出的下界：下界失败。冻结定理用的就是 (15, 2, 2) 这一点。', 'Here 𝔼|I| is below the proposed bound, so the bound fails. The frozen theorem uses exactly the point (15, 2, 2).') : T('这里下界成立；把中心活度调大、叶子活度调到 2 左右，就会进入品红区域。', 'Here the bound holds; raise the centre activity with leaf activity near 2 to enter the magenta region.');
  }
}
function syncOutputs() {
  if (dirty) { build(); dirty = false; syncedKey = ''; toasted = false; }
  const M = MODEL, pr = progress(), key = `${S.mode}|${S.nowFrac}|${S.leaf}|${TRV.lang()}|${M.sweeps ?? 0}`;
  if (key === syncedKey) return; syncedKey = key;
  readouts();
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  $('nField').hidden = S.mode !== 'necklace'; $('kField').hidden = S.mode !== 'necklace'; $('leafField').hidden = S.mode !== 'star';
  $('nn').value = S.n; $('oN').textContent = String(S.n); $('kk').max = Math.floor(S.n / 4); $('kk').value = Math.min(S.k, Math.floor(S.n / 4)); $('oK').textContent = String(Math.min(S.k, Math.floor(S.n / 4)));
  $('leaf').value = S.leaf; $('oLeaf').textContent = String(S.leaf);
  $('presetNote').innerHTML = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = ({
    gas: T('时间轴 = 活度 λ（0.1 到 30，对数刻度）；模拟在当前 λ 下一直运行。', 'The time axis is the activity λ (0.1 to 30, log scale); the simulation keeps running at the current λ.'),
    exact: T('时间轴 = 活度 λ（0.1 到 30，对数刻度）；三维视图是同一 8 × 8 环面上的蒙特卡罗样本。', 'The time axis is the activity λ (0.1 to 30, log scale); the 3D view is a Monte Carlo sample on the same 8 × 8 torus.'),
    necklace: T('时间轴 = 步数 t（0 到 2L）。', 'The time axis is the step t (0 to 2L).'),
    star: T('时间轴 = 中心活度 λ₀（0.1 到 100，对数刻度）。', 'The time axis is the centre activity λ₀ (0.1 to 100, log scale).')
  })[S.mode];
  $('litNote').innerHTML = T(`8 × 8 环面的独立集一共 ${fmtInt(TOTAL_EX)} 个，与 OEIS A027683 一致。`, `The 8 × 8 torus has ${fmtInt(TOTAL_EX)} independent sets in all, matching OEIS A027683.`);
  $('clock').innerHTML = M.mode === 'necklace' ? `t ${pr.t}` : M.mode === 'star' ? `λ₀ ${num(pr.l0, 2)}` : `λ ${num(pr.lam, 2)}`;
  $('hudBig').textContent = ({ gas: () => T(`硬方块 48 × 48 · λ = ${num(pr.lam, 3)}`, `hard squares 48 × 48 · λ = ${num(pr.lam, 3)}`), exact: () => T(`精确 8 × 8 · λ = ${num(pr.lam, 3)}`, `exact 8 × 8 · λ = ${num(pr.lam, 3)}`),
    necklace: () => T(`项链 n = ${M.n}，2k = ${2 * M.k} · t = ${pr.t}`, `necklace n = ${M.n}, 2k = ${2 * M.k} · t = ${pr.t}`), star: () => T(`星形图 K₁,₂ · λ₀ = ${num(pr.l0, 2)}`, `star K₁,₂ · λ₀ = ${num(pr.l0, 2)}`) })[M.mode]();
  $('hudSub').textContent = ({ gas: T('方块 = 粒子；青 = 子格 A，品红 = 子格 B（棋盘的两种颜色）', 'tiles = particles; cyan = sublattice A, magenta = sublattice B (the two checkerboard colours)'),
    exact: T('方块 = 粒子（8 × 8 环面上的蒙特卡罗样本）', 'tiles = particles (a Monte Carlo sample on the 8 × 8 torus)'),
    necklace: T('每一圈是一个时刻，往上走；青 = 正向石子，品红 = 反向；琥珀 = t = L 时初始配置的旋转像', 'each ring is one step, going up; cyan = positive stones, magenta = negative; amber = the rotated start at t = L'),
    star: T('青柱 = 各顶点被占据的概率，琥珀圈 = 下界中该顶点的那一项', 'cyan bars = probability each vertex is occupied, amber rings = that vertex’s term in the bound') })[M.mode];
  if (!toasted && S.playing && S.nowFrac >= 1 && M.mode !== 'gas') {
    toasted = true;
    if (M.mode === 'necklace') toast(T(`<b>t = L = ${M.Lp}</b>：T<sup>L</sup>N 是 N 的${M.iso[M.Lp]?.kind === 's' ? '反射' : '旋转'}像——Adamaszek 猜想（已冻结的定理）。`, `<b>t = L = ${M.Lp}</b>: T<sup>L</sup>N is a ${M.iso[M.Lp]?.kind === 's' ? 'reflection' : 'rotation'} of N, Adamaszek’s conjecture (a frozen theorem).`));
    else if (M.mode === 'exact') toast(T('<b>整条曲线上</b>：λ·d⟨N⟩/dλ 与 Var(N) 处处重合。', '<b>Along the whole curve</b>: λ·d⟨N⟩/dλ and Var(N) coincide everywhere.'));
  }
  if (!toasted && M.mode === 'necklace' && S.playing && pr.t === M.Lp) { toasted = true; toast(T(`<b>t = L = ${M.Lp}</b>：T<sup>L</sup>N 是 N 的${M.iso[M.Lp]?.kind === 's' ? '反射' : '旋转'}像——Adamaszek 猜想（已冻结的定理）。`, `<b>t = L = ${M.Lp}</b>: T<sup>L</sup>N is a ${M.iso[M.Lp]?.kind === 's' ? 'reflection' : 'rotation'} of N, Adamaszek’s conjecture (a frozen theorem).`)); }
  if (!toasted && M.mode === 'star' && pr.l0 > 5 && starE(pr.l0, S.leaf, S.leaf) < starBound(pr.l0, S.leaf, S.leaf) && S.playing) { toasted = true; toast(T(`<b>λ₀ = ${num(pr.l0, 2)}</b>：𝔼|I| 落到下界之下——下界失败。`, `<b>λ₀ = ${num(pr.l0, 2)}</b>: 𝔼|I| drops below the bound, which fails.`)); }
}
function syncRail() {
  const key = `${S.mode}|${S.n}|${S.k}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  let marks;
  if (S.mode === 'gas' || S.mode === 'exact') marks = [0.1, 0.3, 1, 3.8, 10, 30].map((l) => [fracOfLam(l), String(l)]);
  else if (S.mode === 'necklace') { const L = MODEL.Lp; marks = [[0, '0'], [0.5, `L = ${L}`], [1, `2L = ${2 * L}`]]; }
  else marks = [0.1, 1, 10, 100].map((l) => [(Math.log(l) - STAR_LO) / (STAR_HI - STAR_LO), String(l)]);
  $('marks').innerHTML = marks.map(([f, s], i) => `<i class="${i === 0 ? 'first' : i === marks.length - 1 ? 'last' : ''}" style="left:${(f * 100).toFixed(2)}%">${s}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => {
  const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'gas'; if (S.mode === m) return;
  S.mode = m; S.nowFrac = 0; custom();
}));
$('nn').addEventListener('input', () => { S.n = Math.min(40, Math.max(8, 2 * Math.round(parseInt($('nn').value, 10) / 2))); S.k = Math.min(S.k, Math.floor(S.n / 4)); S.nowFrac = 0; custom(); });
$('kk').addEventListener('input', () => { S.k = Math.min(Math.floor(S.n / 4), Math.max(1, parseInt($('kk').value, 10))); S.nowFrac = 0; custom(); });
$('leaf').addEventListener('input', () => { S.leaf = Math.min(10, Math.max(0.1, Math.round(parseFloat($('leaf').value) * 10) / 10)); custom(); });
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.mode = p.mode; for (const k of ['n', 'k', 'leaf']) if (p[k] !== undefined) S[k] = p[k];
  S.preset = name; markPreset(); dirty = true; setCamPreset(p.mode === 'necklace' ? 'front' : 'iso');
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
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) { ev.preventDefault(); const step = MODEL.mode === 'necklace' ? 1 / (2 * MODEL.Lp) : 1 / 400; jumpTo(S.nowFrac + (ev.key === 'ArrowRight' ? 1 : -1) * step); }
  else if (ev.key === 'e' || ev.key === 'E') jumpTo(1);
  else if (ev.key === 'r' || ev.key === 'R') { S.seed++; custom(); }
});

/* =====================================================================
   13. Main loop
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
    if (S.hold > 0) { S.hold -= dtSec; if (S.hold <= 0) { S.nowFrac = S.dir > 0 ? 0 : 1; toasted = false; if (MODEL.mode === 'gas') MODEL.trace = []; } }
    else {
      S.nowFrac += S.dir * dtSec * S.speed / RUN_SECONDS;
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 2.2; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.2; }
    }
    $('now').value = S.nowFrac;
  }
  if (MODEL.mode === 'gas' || MODEL.mode === 'exact') {
    const lam = progress().lam; let last = null; for (let s = 0; s < (MODEL.mode === 'exact' ? 20 : SWEEPS_PER_FRAME); s++) last = mcSweep(MODEL, lam);
    if (MODEL.mode === 'gas' && S.playing && S.preset === 'sweep' && last) MODEL.trace.push([lam, MODEL.acc.rho / MODEL.acc.n, MODEL.acc.ms / MODEL.acc.n]);
    if (MODEL.trace.length > 2000) MODEL.trace.shift();
  }
  syncOutputs(); syncRail();
  if (glOK) { updateCamera(dtSec); updateGL(); renderer.render(scene3, camera); updateTags(); }
  drawMain(); drawSide();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { syncedKey = ''; syncOutputs(); $('marks').dataset.key = ''; });

/* read-only probe for automated browser tests */
window.HS_DEBUG = {
  pending: () => dirty || !String(syncedKey).startsWith(`${S.mode}|${S.nowFrac}|${S.leaf}|${TRV.lang()}|`),
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, pr = progress(), o = { mode: M.mode, frac: S.nowFrac, ...pr };
    if (M.mode === 'gas' || M.mode === 'exact') Object.assign(o, { L: M.L, sweeps: M.sweeps, occupied: M.grid.reduce((a, b) => a + b, 0), rhoAvg: M.acc.n ? M.acc.rho / M.acc.n : null, msAvg: M.acc.n ? M.acc.ms / M.acc.n : null, accN: M.acc.n, legalGrid: M.grid.every((g, i) => !g || M.nb[i].every((j) => !M.grid[j])), counts: Array.from(COUNTS), total: TOTAL_EX });
    if (M.mode === 'exact') { const s = exactStats(pr.lam); Object.assign(o, { mean: s.mean, varN: s.varN, response: responseAt(pr.lam), pmf: s.pmf }); }
    if (M.mode === 'necklace') Object.assign(o, { n: M.n, k: M.k, Lp: M.Lp, start: [...M.N0.entries()].sort((a, b) => a[0] - b[0]), frames: M.frames.map((F) => [...F.entries()].sort((a, b) => a[0] - b[0])), iso: M.iso.map((g) => (g ? `${g.kind}${g.c}` : null)), legal: M.legal.slice(), exactPeriod: M.exactPeriod });
    if (M.mode === 'star') Object.assign(o, { leaf: S.leaf, E: starE(pr.l0, S.leaf, S.leaf), B: starBound(pr.l0, S.leaf, S.leaf), exact: starExact(Math.round(pr.l0 * 1e6) / 1e6, S.leaf) });
    return o;
  },
  starAt: (l0, l1) => ({ E: starE(l0, l1, l1), B: starBound(l0, l1, l1), exact: starExact(l0, l1) }),
  exactAt: (lam) => { const s = exactStats(lam); return { mean: s.mean, varN: s.varN, response: responseAt(lam) }; },
  step: (cfg, n) => [...necklaceStep(new Map(cfg), n).entries()].sort((a, b) => a[0] - b[0]),
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('ordered'); S.playing = false; setPlayUI(); for (let s = 0; s < 400; s++) mcSweep(MODEL, 20); };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('sweep');
setPlayUI();
requestAnimationFrame(frame);
})();
