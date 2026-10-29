/* FACTORIAL//STEPS · integer ratios of fractional factorials
   Bala's sequences A347854–A347858 and the two auxiliaries of A347855, with x! = Γ(1 + x), are integers for every n (frozen in
   trureturing; first proved by Blanco Gómez 2026). Every term is computed as an exact rational: a half-integer factorial is
   (2k)!/(4ᵏk!) times √π, and the Gamma recurrence at thirds gives 3ⁿ/∏(n + 3j). The skyline draws vₚ(a(n))·log₁₀p for each
   prime; the staircases draw the step functions whose values at n/pᵉ add up to vₚ(a(n)) by Legendre's formula. Depends on:
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
const MODES = ['skyline', 'stairs'];
const RUN = { skyline: 22, stairs: 26 };
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹', sup = (k) => String(k).split('').map((d) => SUP[+d]).join('');
const ROWS = 24;   // primes drawn one per row in the skyline; the rest share one row
const PRIMES = []; for (let p = 2; p < 600; p++) if (PRIMES.every((q) => p % q)) PRIMES.push(p);
const HALF_IDS = ['A347854', 'A347856', 'A347857', 'A347858'];

/* each sequence: integer factorials (coefficient of n, sign) and half-index factorials (coefficient of n/2, sign) */
const SEQS = {
  A347854: { int: [[6, 1], [3, -1], [2, -1]], half: [[1, 1], [3, -1]], tex: '(6n)!·(n/2)! / ((3n)!·(2n)!·(3n/2)!)' },
  A347856: { int: [[6, 1], [4, -1], [1, -1]], half: [[1, 1], [3, -1]], tex: '(6n)!·(n/2)! / ((4n)!·n!·(3n/2)!)' },
  A347857: { int: [[6, 1], [3, -1], [2, -1]], half: [[3, 1], [5, -1]], tex: '(6n)!·(3n/2)! / ((3n)!·(2n)!·(5n/2)!)' },
  A347858: { int: [[9, 1], [3, -1], [2, -1]], half: [[1, 1], [9, -1]], tex: '(9n)!·(n/2)! / ((3n)!·(2n)!·(9n/2)!)' },
  A347855: { int: [[4, 1], [2, -1], [1, -1]], third: true, tex: '(4n)!·(n/3)! / ((2n)!·n!·(4n/3)!)' },
  B: { aux: 1, tex: 'b(n) = (12n + 4)! / ((6n + 2)!·(3n + 1)!·∏ₖ₌₀³ⁿ (3n + 3k + 4))' },
  C: { aux: 2, tex: 'c(n) = (12n + 8)! / ((6n + 4)!·(3n + 1)!·∏ₖ₌₀³ⁿ⁺² (3n + 3k + 2))' }
};
const seqName = (id) => (id === 'B' ? 'b(n)' : id === 'C' ? 'c(n)' : id);

/* =====================================================================
   2. Exact arithmetic
   ===================================================================== */
const FACT = [1n]; for (let i = 1; i <= 520; i++) FACT.push(FACT[i - 1] * BigInt(i));
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const Q = (p, q = 1n) => { const g = gcd(p, q) || 1n; return q < 0n ? [-p / g, -q / g] : [p / g, q / g]; };
const qmul = (a, b) => Q(a[0] * b[0], a[1] * b[1]), qdiv = (a, b) => Q(a[0] * b[1], a[1] * b[0]);
const halfFact = (m) => (m % 2 === 0 ? Q(FACT[m / 2]) : Q(FACT[m + 1], 4n ** BigInt((m + 1) / 2) * FACT[(m + 1) / 2]));   // (m/2)! without its √π
function value(id, n) {
  const S = SEQS[id];
  if (S.aux) {
    let d = 1n;
    if (S.aux === 1) { for (let k = 0; k <= 3 * n; k++) d *= BigInt(3 * n + 3 * k + 4); return Q(FACT[12 * n + 4], FACT[6 * n + 2] * FACT[3 * n + 1] * d); }
    for (let k = 0; k <= 3 * n + 2; k++) d *= BigInt(3 * n + 3 * k + 2); return Q(FACT[12 * n + 8], FACT[6 * n + 4] * FACT[3 * n + 1] * d);
  }
  let r = Q(1n);
  for (const [c, s] of S.int) r = s > 0 ? qmul(r, Q(FACT[c * n])) : qdiv(r, Q(FACT[c * n]));
  if (S.half) for (const [c, s] of S.half) r = s > 0 ? qmul(r, halfFact(c * n)) : qdiv(r, halfFact(c * n));   // the √π cancel in pairs
  if (S.third) {
    if (n % 3 === 0) r = qmul(r, Q(FACT[n / 3], FACT[4 * n / 3]));
    else { let d = 1n; for (let j = 1; j <= n; j++) d *= BigInt(n + 3 * j); r = qmul(r, Q(3n ** BigInt(n), d)); }
  }
  return r;
}
function valuation(x, p) { if (x === 0n) return Infinity; const P = BigInt(p); let v = 0; while (x % P === 0n) { x /= P; v++; } return v; }
function factorize(x) { const out = []; for (const p of PRIMES) { const v = valuation(x, p); if (v) out.push([p, v]); } return out; }
const log10Big = (x) => { const s = x.toString(); return s.length - 1 + Math.log10(+('0.' + s.slice(0, 15)) * 10); };
function slope(id) {   // lim (1/n) log₁₀ a(n), from Stirling: Σ ± c·log₁₀ c over all factorials (c·n)!
  const S = SEQS[id], lg = (c) => (c > 0 ? c * Math.log10(c) : 0);
  if (S.aux) return 3 * (slope('A347855') - Math.log10(3));
  let s = 0; for (const [c, sg] of S.int) s += sg * lg(c);
  if (S.half) for (const [c, sg] of S.half) s += sg * lg(c / 2);
  if (S.third) s += lg(1 / 3) - lg(4 / 3);
  return s;
}

/* Legendre: the contribution of pᵉ to vₚ(a(n)) for an odd prime and a half-index sequence; for odd m the exponent of p in
   (m/2)! (without √π) counts multiples of pᵉ among the odd numbers up to m, ⌊(m + pᵉ)/(2pᵉ)⌋ */
function defect(id, n, pe) {
  const S = SEQS[id]; let d = 0;
  for (const [c, s] of S.int) d += s * Math.floor(c * n / pe);
  for (const [c, s] of S.half) { const m = c * n; d += s * (m % 2 === 0 ? Math.floor(m / 2 / pe) : Math.floor((m + pe) / (2 * pe))); }
  return d;
}
function stepL(id, x, odd) {   // the step function: vₚ(a(n)) = Σₑ L(n/pᵉ) with the staircase of the parity of n
  const S = SEQS[id], f = (y) => Math.floor(y + 1e-9);
  return S.int.reduce((t, [a, s]) => t + s * f(a * x), 0) + S.half.reduce((t, [c, s]) => t + s * f(odd ? (c * x + 1) / 2 : c * x / 2), 0);
}
function staircase(id, odd) {   // the breakpoints of L on [0, 2] and its value on each interval
  const S = SEQS[id], br = new Set([0, 2]);
  for (const [a] of S.int) for (let k = 1; k < 2 * a; k++) br.add(k / a);
  for (const [c] of S.half) for (let k = 1; k <= 2 * c; k++) { const x = odd ? (2 * k - 1) / c : 2 * k / c; if (x > 0 && x < 2) br.add(x); }
  const xs = [...br].sort((a, b) => a - b), steps = [];
  for (let i = 0; i + 1 < xs.length; i++) steps.push([xs[i], xs[i + 1], stepL(id, (xs[i] + xs[i + 1]) / 2, odd)]);
  return steps;
}

/* =====================================================================
   3. State and presets
   ===================================================================== */
const S = { mode: 'skyline', seq: 'A347854', p: 5, N: 30, nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'a854' };
const nAt = (f, N) => Math.min(N, Math.max(0, Math.round(f * N)));
const PRESETS = {
  a854: { mode: 'skyline', seq: 'A347854', N: 30, frac: 0, play: true,
    zh: 'A347854 = (6n)!(n/2)!/((3n)!(2n)!(3n/2)!)。每一列是一项 a(n)，每根柱子是一个素数的贡献 vₚ(a(n))·log₁₀p，所以一列的总高度就是 log₁₀ a(n)。所有柱子都朝上：每一项都是整数。',
    en: 'A347854 = (6n)!(n/2)!/((3n)!(2n)!(3n/2)!). Each column is one term a(n) and each bar one prime’s share vₚ(a(n))·log₁₀p, so a column’s total height is log₁₀ a(n). Every bar points up: every term is an integer.' },
  a858: { mode: 'skyline', seq: 'A347858', N: 24, frac: 0, play: true,
    zh: 'A347858 = (9n)!(n/2)!/((3n)!(2n)!(9n/2)!)。n 为奇数时 2 的柱子（琥珀）特别高：卷宗由约化推出奇数 n 时 a(n) 是 2⁸ⁿ 乘整数，页面的 v₂ 都不小于 8n。',
    en: 'A347858 = (9n)!(n/2)!/((3n)!(2n)!(9n/2)!). At odd n the bar of 2 (amber) is very tall: the dossier derives from the reductions that a(n) is 2⁸ⁿ times an integer for odd n, and the page’s v₂ is at least 8n each time.' },
  a855: { mode: 'skyline', seq: 'A347855', N: 30, frac: 0, play: true,
    zh: 'A347855 = (4n)!(n/3)!/((2n)!n!(4n/3)!)。3 ∤ n 时 Γ 递推把三分之一阶乘化成 3ⁿ/∏(n + 3j)，3 的柱子（绿）至少是 n；Lean 的中间结论说 (2n)!·n!·∏(n + 3j) 整除 (4n)!。',
    en: 'A347855 = (4n)!(n/3)!/((2n)!n!(4n/3)!). For 3 ∤ n the Gamma recurrence turns the third-index factorials into 3ⁿ/∏(n + 3j), and the bar of 3 (green) is at least n; the intermediate Lean result says (2n)!·n!·∏(n + 3j) divides (4n)!.' },
  aux: { mode: 'skyline', seq: 'B', N: 20, frac: 0, play: true,
    zh: '辅助序列 b(n)：A347855(3n + 1) = 3³ⁿ⁺¹·b(n)。去掉这个 3 的幂以后剩下的仍然是整数，Lean 也证明了，c(n) 同理。',
    en: 'The auxiliary b(n): A347855(3n + 1) = 3³ⁿ⁺¹·b(n). After removing this power of 3 what remains is still an integer, also proved in Lean, and likewise c(n).' },
  stairs: { mode: 'stairs', seq: 'A347854', p: 5, N: 30, frac: 0, play: true,
    zh: '八条阶梯：四个半整数序列，偶数 n 与奇数 n 各一条，画出一个周期 [0, 2)。每条都只取 0 和 1。对 p = 5 与当前的 n，点 n/5ᵉ（模 2）落在阶梯上，落在高处的个数就是 v₅(a(n))。',
    en: 'Eight staircases: the four half-index sequences, one for even n and one for odd n, over one period [0, 2). Each takes only the values 0 and 1. For p = 5 and the current n, the points n/5ᵉ (mod 2) land on a staircase, and the number that land high is v₅(a(n)).' },
  seven: { mode: 'stairs', seq: 'A347856', p: 7, N: 30, frac: 25 / 30, play: false,
    zh: 'A347856、p = 7、n = 25：25/7、25/49 两个点落在奇数 n 的阶梯上，各贡献 0 或 1，加起来等于精确算出的 v₇(a(25))。',
    en: 'A347856, p = 7, n = 25: the points 25/7 and 25/49 land on the odd-n staircase, each contributes 0 or 1, and the sum equals the exact v₇(a(25)).' },
  odd: { mode: 'stairs', seq: 'A347857', p: 3, N: 30, frac: 17 / 30, play: false,
    zh: 'A347857、p = 3、n = 17：n 为奇数时半整数阶乘的指数要数奇数里的倍数，于是用另一条阶梯 ⌊(cx + 1)/2⌋；它同样只取 0 和 1。',
    en: 'A347857, p = 3, n = 17: for odd n the exponent in a half-integer factorial counts multiples among the odd numbers, so the other staircase ⌊(cx + 1)/2⌋ is used; it too takes only 0 and 1.' },
  sporadic: { mode: 'skyline', seq: 'A347854', N: 30, frac: 20 / 30, play: false,
    zh: '偶数项 A347854(2m) = u(m) = (12m)!m!/((6m)!(4m)!(3m)!)，这是 Vasyunin 的 52 个零散整数阶乘比之一（Bober 2009 表 2）；页面在 n = 20 核对 a(20) = u(10)。',
    en: 'The even terms A347854(2m) = u(m) = (12m)!m!/((6m)!(4m)!(3m)!), one of Vasyunin’s 52 sporadic integral factorial ratios (Bober 2009, Table 2); the page checks a(20) = u(10).' }
};

/* =====================================================================
   4. The model
   ===================================================================== */
let MODEL = null, dirty = true;
function build() {
  const id = S.seq, N = S.N, terms = [];
  for (let n = 0; n <= N; n++) {
    const q = value(id, n), fac = q[1] === 1n ? factorize(q[0]) : [], lg = q[0] > 0n ? log10Big(q[0]) : -Infinity;
    terms.push({ n, num: q[0], den: q[1], fac, lg });
  }
  const bars = [];   // [n, row, height in log₁₀ units]
  let maxBar = 0;
  terms.forEach((t) => { const rest = t.fac.filter(([p]) => PRIMES.indexOf(p) >= ROWS).reduce((s, [p, v]) => s + v * Math.log10(p), 0); t.fac.forEach(([p, v]) => { const r = PRIMES.indexOf(p); if (r < ROWS) { bars.push([t.n, r, v * Math.log10(p)]); maxBar = Math.max(maxBar, v * Math.log10(p)); } }); if (rest > 0) { bars.push([t.n, ROWS, rest]); maxBar = Math.max(maxBar, rest); } });
  const M = { mode: S.mode, id, N, terms, bars, maxBar, slope: slope(id) };
  if (S.mode === 'stairs') M.stairs = HALF_IDS.map((h) => ({ id: h, even: staircase(h, false), odd: staircase(h, true) }));
  MODEL = M;
}
function progress() {
  const M = MODEL, n = nAt(S.nowFrac, M.N), t = M.terms[n];
  if (M.mode === 'skyline') return { n, t };
  const p = S.p, pes = []; for (let pe = p; pe <= 9 * Math.max(1, n); pe *= p) pes.push(pe);
  const d = pes.map((pe) => defect(M.id, n, pe)), vp = valuation(t.num, p);
  return { n, t, p, pes, d, vp, xs: pes.map((pe) => (n / pe) % 2) };
}

/* =====================================================================
   5. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const digits = (x) => { const s = x.toString(); return s.length <= 26 ? s : `${s.slice(0, 12)}…${s.slice(-8)}`; };
const facString = (fac, max = 9) => fac.length ? fac.slice(0, max).map(([p, v]) => (v > 1 ? `${p}${sup(v)}` : String(p))).join(' · ') + (fac.length > max ? ` · … (${fac.length})` : '') : '1';
const rowColor = (r) => (r === 0 ? COL.amber : r === 1 ? [0.49, 1, 0.6] : r === ROWS ? [0.62, 0.55, 1] : (() => { const t = (r - 2) / (ROWS - 3); return [COL.cyan[0] * (1 - t) + COL.magenta[0] * t, COL.cyan[1] * (1 - t) + COL.magenta[1] * t, COL.cyan[2] * (1 - t) + COL.magenta[2] * t]; })());

/* =====================================================================
   6. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 60000, PTS_MAX = 1200;
const CAMS = { iso: [0.55, 1.08, 19], front: [0.0001, 1.5, 18], top: [0.0001, 0.06, 18] };
const cam = { theta: 0.55, phi: 1.08, r: 19, tTheta: 0.55, tPhi: 1.08, tR: 19 };
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
const skyX = (n, N) => (n - N / 2) * (11 / Math.max(8, N)), skyZ = (r) => (r - ROWS / 2) * 0.4;
const stairX = (x) => (x - 1) * 6, stairZ = (k, odd) => (k * 2 + (odd ? 1 : 0) - 3.5) * 0.85;
function updateGL() {
  const M = MODEL, pr = progress();
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; for (const p of [a, b]) { Pp[3 * v] = p[0]; Pp[3 * v + 1] = p[1]; Pp[3 * v + 2] = p[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; } };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  if (M.mode === 'skyline') {
    const hs = 5 / Math.max(1e-9, M.maxBar), w = 0.42 * 11 / Math.max(8, M.N), dz = 0.15;
    for (let r = 0; r <= ROWS; r += 1) seg([skyX(0, M.N) - 0.4, 0, skyZ(r)], [skyX(M.N, M.N) + 0.4, 0, skyZ(r)], COL.cyan, r % 5 === 0 ? 0.12 : 0.05);
    for (const [n, r, h] of M.bars) {
      if (n > pr.n) continue;
      const x = skyX(n, M.N), z = skyZ(r), y = h * hs, col = rowColor(r), k = n === pr.n ? 1 : 0.5;
      seg([x, 0, z], [x, y, z], col, k);
      seg([x - w, y, z - dz], [x + w, y, z - dz], col, k); seg([x + w, y, z - dz], [x + w, y, z + dz], col, k); seg([x + w, y, z + dz], [x - w, y, z + dz], col, k); seg([x - w, y, z + dz], [x - w, y, z - dz], col, k);
      seg([x - w, 0, z], [x - w, y, z], col, k * 0.45); seg([x + w, 0, z], [x + w, y, z], col, k * 0.45);
      if (n === pr.n) dot([x, y, z], col, 1, 1.4);
    }
    seg([skyX(pr.n, M.N), 0, skyZ(0) - 0.5], [skyX(pr.n, M.N), 0, skyZ(ROWS) + 0.5], COL.amber, 0.6);
  } else {
    const parity = pr.n % 2 === 1;
    M.stairs.forEach((st, k) => {
      for (const odd of [false, true]) {
        const sel = st.id === M.id && odd === parity, k2 = sel ? 1 : 0.28, col = sel ? COL.amber : odd ? COL.magenta : COL.cyan, z = stairZ(k, odd), steps = odd ? st.odd : st.even;
        steps.forEach(([a, b, val], i) => {
          seg([stairX(a), val * 1.4, z], [stairX(b), val * 1.4, z], col, k2);
          if (i + 1 < steps.length && steps[i + 1][2] !== val) seg([stairX(b), val * 1.4, z], [stairX(b), steps[i + 1][2] * 1.4, z], col, k2 * 0.8);
        });
        seg([stairX(0), 0, z], [stairX(2), 0, z], COL.cyan, 0.08);
      }
    });
    const k = HALF_IDS.indexOf(M.id), z = stairZ(k, parity);
    pr.xs.forEach((x, e) => { const val = pr.d[e], col = val > 0 ? COL.amber : COL.cyan; seg([stairX(x), -0.6, z], [stairX(x), val * 1.4 + 0.02, z], col, 0.9); dot([stairX(x), val * 1.4, z], col, 1, 2.6 - 0.25 * e); });
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
  camera.up.set(0, 1, 0); camera.lookAt(0, 1.2, 0);
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
  if (M.mode === 'skyline') {
    put('p = 2', [skyX(0, M.N) - 1.2, 0.35, skyZ(0) - 0.3], 'hot'); put('p = 3', [skyX(0, M.N) - 1.2, -0.45, skyZ(1) + 0.3], 'gn');
    for (const r of [5, 10, 15, 20]) put(`p = ${PRIMES[r]}`, [skyX(M.N, M.N) + 1.1, 0, skyZ(r)], 'cy');
    put(T(`p > ${PRIMES[ROWS - 1]}`, `p > ${PRIMES[ROWS - 1]}`), [skyX(M.N, M.N) + 1.1, 0, skyZ(ROWS)], 'vi');
    put(`n = ${pr.n}`, [skyX(pr.n, M.N), -0.3, skyZ(0) - 0.8], 'hot');
  } else {
    M.stairs.forEach((st, i) => put(`${st.id} ${T('偶', 'even')} · ${T('奇', 'odd')}`, [stairX(0) - 0.4, 0.2, stairZ(i, false) + 0.4], st.id === M.id ? 'hot' : 'cy'));
    put('x = 0', [stairX(0), -0.5, stairZ(3, true) + 0.9], 'cy'); put('x = 2', [stairX(2), -0.5, stairZ(3, true) + 0.9], 'cy');
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
  const M = MODEL, F = frame2d(cv1, 40); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  ctx.fillStyle = DIM; ctx.textBaseline = 'top';
  if (M.mode === 'skyline') {
    const top = Math.max(1, ...M.terms.map((t) => t.lg), M.slope * M.N), X = (n) => pl + iw * n / M.N, Y = (y) => pt + ih - ih * Math.max(0, y) / top;
    ctx.strokeStyle = AM; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(M.N), Y(M.slope * M.N)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = CY; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); M.terms.forEach((t, i) => { const y = Y(Math.max(0, t.lg)); if (i) ctx.lineTo(X(t.n), y); else ctx.moveTo(X(t.n), y); }); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = AM; ctx.beginPath(); ctx.arc(X(pr.n), Y(Math.max(0, pr.t.lg)), 3.5 * dpr, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(Math.round(top)), pl - 4 * dpr, pt + 4 * dpr); ctx.fillText('0', pl - 4 * dpr, pt + ih);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const n of [0, Math.round(M.N / 2), M.N]) ctx.fillText(`n=${n}`, X(n), pt + ih + 4 * dpr);
    $('c1Meta').textContent = T(`青 = log₁₀ a(n) · 琥珀虚线 = 斜率 ${M.slope.toFixed(3)}（Stirling）`, `cyan = log₁₀ a(n) · amber dashes = slope ${M.slope.toFixed(3)} (Stirling)`);
  } else {
    const E = pr.pes.length, w = iw / Math.max(4, E), Y = (y) => pt + ih - ih * y / 1.25;
    ctx.strokeStyle = FAINT; ctx.beginPath(); ctx.moveTo(pl, Y(1)); ctx.lineTo(pl + iw, Y(1)); ctx.stroke();
    pr.d.forEach((d, e) => { const x = pl + e * w; ctx.fillStyle = d > 0 ? 'rgba(255, 200, 61, 0.8)' : 'rgba(25, 224, 255, 0.25)'; ctx.fillRect(x + 6 * dpr, Y(Math.max(d, 0.04)), w - 12 * dpr, pt + ih - Y(Math.max(d, 0.04))); ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.fillText(`${S.p}${sup(e + 1)}`, x + w / 2, pt + ih + 4 * dpr); ctx.fillStyle = INK; ctx.textBaseline = 'bottom'; ctx.fillText(String(d), x + w / 2, Y(Math.max(d, 0.04)) - 2 * dpr); ctx.textBaseline = 'top'; });
    $('c1Meta').textContent = T(`每个 ${S.p}ᵉ 的贡献 L(n/${S.p}ᵉ)；加起来 = vₚ(a(n)) = ${pr.vp}`, `the share L(n/${S.p}ᵉ) of each ${S.p}ᵉ; the sum is vₚ(a(n)) = ${pr.vp}`);
  }
}
function drawSide() {
  const M = MODEL, F = frame2d(cv2, 26); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  if (M.mode === 'skyline') {
    const fac = pr.t.fac, top = Math.max(1, ...fac.map(([p, v]) => v * Math.log10(p))), w = iw / Math.max(12, fac.length), Y = (y) => pt + ih - ih * y / (top * 1.15);
    fac.forEach(([p, v], i) => { const r = Math.min(ROWS, PRIMES.indexOf(p)), c = rowColor(r), x = pl + i * w, h = v * Math.log10(p); ctx.fillStyle = `rgba(${c.map((u) => Math.round(u * 255)).join(',')}, 0.75)`; ctx.fillRect(x + 1.5 * dpr, Y(h), w - 3 * dpr, pt + ih - Y(h)); if (w > 16 * dpr || i < 3 || i === fac.length - 1) { ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.fillText(String(p), x + w / 2, pt + ih + 4 * dpr); } });
    if (!fac.length) { ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.fillText('a(n) = 1', pl + iw / 2, pt + ih / 2); }
    $('c2Meta').textContent = T('柱高 = vₚ(a(n))·log₁₀p，按素数从小到大', 'bar height = vₚ(a(n))·log₁₀p, primes in increasing order');
  } else {
    const vs = M.terms.map((t) => valuation(t.num, S.p)), top = Math.max(1, ...vs), w = iw / (M.N + 1), Y = (y) => pt + ih - ih * y / (top * 1.15);
    vs.forEach((v, n) => { ctx.fillStyle = n === pr.n ? 'rgba(255, 200, 61, 0.9)' : n % 2 ? 'rgba(255, 79, 216, 0.5)' : 'rgba(25, 224, 255, 0.5)'; ctx.fillRect(pl + n * w + 1, Y(v), w - 2, pt + ih - Y(v)); });
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; for (const n of [0, Math.round(M.N / 2), M.N]) ctx.fillText(`n=${n}`, pl + n * w + w / 2, pt + ih + 4 * dpr);
    $('c2Meta').textContent = T(`v${S.p}(a(n))：青 = 偶数 n，品红 = 奇数 n`, `v${S.p}(a(n)): cyan = even n, magenta = odd n`);
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
  const M = MODEL, pr = progress(), t = pr.t, v2 = valuation(t.num, 2), v3 = valuation(t.num, 3), integral = t.den === 1n;
  if (M.mode === 'skyline') {
    setRo([[T('序列 · n', 'Sequence · n'), `${seqName(M.id)} · n = ${pr.n}`], [T(`a(n)（${t.num.toString().length} 位）`, `a(n) (${t.num.toString().length} digits)`), integral ? digits(t.num) : `${digits(t.num)}/${digits(t.den)}`],
      [T('素数分解', 'Factorization'), integral ? facString(t.fac) : '—'], [T('精确分母 · v₂ · v₃', 'Exact denominator · v₂ · v₃'), `${t.den} · ${v2 === Infinity ? '—' : v2} · ${v3 === Infinity ? '—' : v3}`],
      [T('结论', 'Verdict'), integral ? T('整数（分母为 1）；对所有 n 都是整数，冻结定理', 'an integer (denominator 1); integral for every n, the frozen theorem') : T('不是整数', 'not an integer')]]);
    pill('pillA', T('序列', 'SEQ'), seqName(M.id)); pill('pillB', 'n', String(pr.n)); pill('pillC', T('分母', 'DEN'), String(t.den)); pill('pillD', T('位数', 'DIGITS'), String(t.num.toString().length));
    const half = SEQS[M.id].half, odd = pr.n % 2 === 1, need = M.id === 'A347858' ? 8 * pr.n : 2 * pr.n;
    $('roNote').innerHTML = M.id === 'A347855' && pr.n % 3 ? T(`3 ∤ n：v₃ = ${v3} ≥ n = ${pr.n}（卷宗的推论）`, `3 ∤ n: v₃ = ${v3} ≥ n = ${pr.n} (the dossier’s consequence)`)
      : half && odd ? T(`n 为奇数：v₂ = ${v2} ≥ ${need}（卷宗：2${sup(need)} 乘整数）`, `odd n: v₂ = ${v2} ≥ ${need} (dossier: 2${sup(need)} times an integer)`)
      : M.id === 'A347854' && !odd ? T(`偶数 n = 2m：a(n) = u(${pr.n / 2}) = (12m)!m!/((6m)!(4m)!(3m)!)，${uCheck(pr.n / 2, t.num) ? '一致 ✓' : '不一致'}`, `even n = 2m: a(n) = u(${pr.n / 2}) = (12m)!m!/((6m)!(4m)!(3m)!), ${uCheck(pr.n / 2, t.num) ? 'equal ✓' : 'not equal'}`)
      : T('每一列的高度 = log₁₀ a(n)。', 'Each column’s height is log₁₀ a(n).');
  } else {
    const sum = pr.d.reduce((s, d) => s + d, 0), ok = sum === pr.vp;
    setRo([[T('序列 · p · n', 'Sequence · p · n'), `${M.id} · ${pr.p} · ${pr.n} (${pr.n % 2 ? T('奇', 'odd') : T('偶', 'even')})`], [T(`n/${pr.p}ᵉ 模 2`, `n/${pr.p}ᵉ mod 2`), pr.xs.map((x) => x.toFixed(3)).join(' · ')],
      [T('每个素数幂的贡献 L(n/pᵉ)', 'Contribution of each prime power L(n/pᵉ)'), pr.d.join(' + ') + ` = ${sum}`], [T('精确的 vₚ(a(n))', 'Exact vₚ(a(n))'), `${pr.vp} ${ok ? '✓' : '✗'}`],
      [T('结论', 'Verdict'), T('阶梯只取 0 与 1，所以 vₚ ≥ 0（页面数值）；整除性由 Lean 证明', 'the staircase takes only 0 and 1, so vₚ ≥ 0 (page numerics); integrality is proved in Lean')]]);
    pill('pillA', T('序列', 'SEQ'), M.id); pill('pillB', 'p', String(pr.p)); pill('pillC', 'vₚ', String(pr.vp)); pill('pillD', 'n', String(pr.n));
    const st = M.stairs.find((x) => x.id === M.id), vals = new Set([...st.even, ...st.odd].map((s) => s[2]));
    $('roNote').innerHTML = T(`${M.id} 的两条阶梯在 [0, 2) 上取到的值：{${[...vals].sort().join(', ')}}。`, `Values taken by the two staircases of ${M.id} on [0, 2): {${[...vals].sort().join(', ')}}.`);
  }
}
function uCheck(m, x) { return FACT[12 * m] * FACT[m] === x * FACT[6 * m] * FACT[4 * m] * FACT[3 * m]; }
function syncOutputs() {
  if (dirty) { build(); dirty = false; syncedKey = ''; toasted = false; }
  const M = MODEL, key = `${S.mode}|${S.nowFrac}|${TRV.lang()}`;
  if (key === syncedKey) return; syncedKey = key;
  const pr = progress();
  readouts();
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  document.querySelectorAll('#seqChips .chip').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.seq === S.seq)); b.hidden = S.mode === 'stairs' && !HALF_IDS.includes(b.dataset.seq); });
  document.querySelectorAll('#pChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.p === S.p)));
  $('pChips').hidden = S.mode !== 'stairs';
  $('nn').value = S.N; $('oN').textContent = String(S.N);
  $('formula').innerHTML = `${seqName(M.id)}${SEQS[M.id].aux ? '' : ' = '}${SEQS[M.id].aux ? ': ' + SEQS[M.id].tex : SEQS[M.id].tex}`;
  $('presetNote').innerHTML = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = M.mode === 'skyline' ? T('时间轴 = n；每走一步加上一列。', 'The time axis is n; each step adds a column.') : T('时间轴 = n；点 n/pᵉ 在阶梯上移动。', 'The time axis is n; the points n/pᵉ move along the staircases.');
  $('litNote').innerHTML = T('项、分解与阶梯都是页面精确算出的；冻结的是七个整除性结论。', 'The terms, factorizations and staircases are computed exactly on the page; what is frozen are the seven integrality results.');
  $('c1Title').textContent = M.mode === 'skyline' ? T('log₁₀ a(n) 对 n', 'log₁₀ a(n) against n') : T(`每个 ${S.p} 的幂的贡献`, `The share of each power of ${S.p}`);
  $('c2Title').textContent = M.mode === 'skyline' ? T(`a(${pr.n}) 的素数分解`, `Factorization of a(${pr.n})`) : T(`v${S.p}(a(n)) 对 n`, `v${S.p}(a(n)) against n`);
  $('clock').innerHTML = `n ${pr.n}`;
  $('hudBig').textContent = M.mode === 'skyline' ? `${seqName(M.id)} · n = ${pr.n}` : `${M.id} · p = ${S.p} · n = ${pr.n}`;
  $('hudSub').textContent = M.mode === 'skyline' ? T('横 = n，纵深 = 素数（琥珀 = 2，绿 = 3，紫 = 其余大素数），柱高 = vₚ(a(n))·log₁₀p', 'across = n, depth = primes (amber = 2, green = 3, violet = the remaining large primes), bar height = vₚ(a(n))·log₁₀p')
    : T('四个序列各两条阶梯（青 = 偶数 n，品红 = 奇数 n），琥珀 = 当前序列与当前 n 的那条；竖针 = n/pᵉ（模 2），落在高处的贡献 1', 'two staircases per sequence (cyan = even n, magenta = odd n), amber = the one for the current sequence and n; needles = n/pᵉ (mod 2), and those landing high contribute 1');
  if (!toasted && S.playing && S.nowFrac >= 1) {
    toasted = true;
    const allInt = M.terms.every((t) => t.den === 1n);
    toast(M.mode === 'skyline' ? T(`<b>n = 0 … ${M.N}</b>：${allInt ? '每一项的分母都是 1' : '有分母不是 1 的项'}；a(${M.N}) 有 ${pr.t.num.toString().length} 位。`, `<b>n = 0 … ${M.N}</b>: ${allInt ? 'every denominator is 1' : 'some denominator is not 1'}; a(${M.N}) has ${pr.t.num.toString().length} digits.`)
      : T(`<b>p = ${S.p}</b>：每个 n 的贡献之和都等于精确的 vₚ。`, `<b>p = ${S.p}</b>: for every n the contributions add up to the exact vₚ.`));
  }
}
function syncRail() {
  const M = MODEL, key = `${M.N}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  const marks = [0, Math.round(M.N / 4), Math.round(M.N / 2), Math.round(3 * M.N / 4), M.N];
  $('marks').innerHTML = marks.map((n, i) => `<i class="${i === 0 ? 'first' : i === marks.length - 1 ? 'last' : ''}" style="left:${(n / M.N * 100).toFixed(2)}%">n=${n}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => {
  const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'skyline'; if (S.mode === m) return; S.mode = m; if (m === 'stairs' && !HALF_IDS.includes(S.seq)) S.seq = 'A347854'; custom();
}));
document.querySelectorAll('#seqChips .chip').forEach((b) => b.addEventListener('click', () => { if (!SEQS[b.dataset.seq]) return; S.seq = b.dataset.seq; custom(); }));
document.querySelectorAll('#pChips .chip').forEach((b) => b.addEventListener('click', () => { S.p = [3, 5, 7, 11, 13].includes(+b.dataset.p) ? +b.dataset.p : 5; custom(); }));
$('nn').addEventListener('input', () => { S.N = Math.min(40, Math.max(8, Math.round(parseFloat($('nn').value)))); custom(); });
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.mode = p.mode; S.seq = p.seq; S.N = p.N; if (p.p) S.p = p.p;
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
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) { ev.preventDefault(); jumpTo((nAt(S.nowFrac, MODEL.N) + (ev.key === 'ArrowRight' ? 1 : -1)) / MODEL.N); }
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
  if (glOK) { updateCamera(dtSec); const k = `${S.mode}|${MODEL.id}|${MODEL.N}|${S.p}|${nAt(S.nowFrac, MODEL.N)}`; if (k !== glKey) { updateGL(); glKey = k; } renderer.render(scene3, camera); updateTags(); }
  drawMain(); drawSide();
  requestAnimationFrame(frame);
}

TRV.onLang(() => { syncedKey = ''; syncOutputs(); $('marks').dataset.key = ''; });

/* read-only probe for automated browser tests */
window.FS_DEBUG = {
  pending: () => dirty || syncedKey !== `${S.mode}|${S.nowFrac}|${TRV.lang()}`,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, pr = progress();
    const base = { mode: M.mode, seq: M.id, N: M.N, n: pr.n, slope: M.slope, terms: M.terms.map((t) => ({ n: t.n, num: t.num.toString(), den: t.den.toString(), fac: t.fac })) };
    if (M.mode === 'stairs') Object.assign(base, { p: pr.p, pes: pr.pes, d: pr.d, vp: pr.vp, xs: pr.xs, stairs: M.stairs.map((s) => ({ id: s.id, even: s.even, odd: s.odd })) });
    return base;
  },
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('a854'); S.playing = false; setPlayUI(); S.nowFrac = 1; $('now').value = S.nowFrac; setCamPreset('iso'); cam.theta = cam.tTheta = 0.45; cam.phi = cam.tPhi; cam.r = cam.tR = 22; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('a854');
setPlayUI();
requestAnimationFrame(frame);
})();
