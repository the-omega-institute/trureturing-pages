/* PRIME//GAPS · 素数间隙 · 素数能挤多近、能隔多远
   Every prime below 2·10⁷ from one sieve. Admissible tuples (each prime p must leave a residue class mod p free), their
   occurrences and occupancy counts against the Hardy–Littlewood prediction 𝔖(H)∫₂ˣ dt/∏ log(t + h); record gaps and the gap
   histogram; and three refuted OEIS conjectures: A079063 (least k with √p_{n+k} − √p_n > 1, computed by a two-pointer scan),
   A089610 (primes in (n², n² + n]) and Cloitre's divisor-count characterization of A049591 (counterexample 529).
   Frozen Lean anchors and literature results are named in the page text. Depends on: assets/vendor/three.r128.min.js, assets/shell.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants and the sieve
   ===================================================================== */
const COL = TRV.rgb, GREEN = [0.27, 1.0, 0.70];
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, ok: OK, cyan: CY, magenta: MG } = TRV.palette;
const MODES = ['tuple', 'records', 'sqrt', 'square', 'divisor'];
const RUN_SECONDS = 16, N = 20000000, OCC_N = 1000000, EDIT_MAX = 60;
const SQRT_N = 1000000, SQUARE_N = 3000, DIV_N = 200000, DIV_SHOW = 2000;
const TUPLE_186 = [0, 2, 6, 12, 20, 26, 30, 32, 36, 42, 48, 50, 56, 60, 68, 72, 78, 86, 90, 92, 98, 102, 110, 116, 120, 126, 132, 138, 140, 146, 152, 156, 158, 162, 168, 170, 176, 180, 182, 186];
const S_K = [0, 2, 6, 8, 12, 16, 20, 26, 30, 32, 36, 42, 48, 50, 56, 60, 66, 70, 76, 80, 84, 90, 94, 100, 110, 114, 120, 126, 130, 136, 140, 146, 152, 156, 158, 162, 168, 176, 182, 186, 188, 196, 200, 210, 212, 216, 226, 236, 240, 246];   // OEIS A008407, k = 1 … 50
const COMP = new Uint8Array(N + 1); COMP[0] = COMP[1] = 1;
for (let p = 2; p * p <= N; p++) if (!COMP[p]) for (let q = p * p; q <= N; q += p) COMP[q] = 1;
const PRIMES = (() => { let c = 0; for (let n = 2; n <= N; n++) if (!COMP[n]) c++; const a = new Int32Array(c); let i = 0; for (let n = 2; n <= N; n++) if (!COMP[n]) a[i++] = n; return a; })();
const NP = PRIMES.length;
const isPrime = (n) => n >= 2 && n <= N && !COMP[n];
const piLE = (x) => { let lo = 0, hi = NP; while (lo < hi) { const m = (lo + hi) >> 1; if (PRIMES[m] <= x) lo = m + 1; else hi = m; } return lo; };
const SMALL_PRIMES = Array.from(PRIMES.slice(0, 9592));   // the primes below 10⁵, for the singular series
const tau = (n) => { let c = 0; for (let d = 1; d * d <= n; d++) if (n % d === 0) c += d * d === n ? 1 : 2; return c; };
const fmtInt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/* =====================================================================
   2. State and presets
   ===================================================================== */
const S = { mode: 'tuple', H: [0, 2, 6, 8, 12, 18, 20, 26], nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'eight' };
const PRESETS = {
  twin: { mode: 'tuple', H: [0, 2],
    zh: '孪生素数 {0, 2}：模 2 只占一个余数，模 p ≥ 3 最多占两个，处处留了空位，所以可容许。2·10⁷ 以内有 107 407 对，Hardy–Littlewood 的预测几乎一样；但“无穷多对”至今没有证明。',
    en: 'Twin primes {0, 2}: one class mod 2 and at most two mod any p ≥ 3, so a slot is free everywhere and the pair is admissible. Below 2·10⁷ there are 107 407 pairs, almost exactly the Hardy–Littlewood prediction; that there are infinitely many is still unproved.' },
  blocked: { mode: 'tuple', H: [0, 2, 4],
    zh: '{0, 2, 4} 占满了模 3 的三个余数：n、n + 2、n + 4 里总有一个被 3 整除。所以除了 3, 5, 7，它们永远不会同时是素数。',
    en: '{0, 2, 4} fills all three classes mod 3: one of n, n + 2, n + 4 is always divisible by 3. So apart from 3, 5, 7 they are never prime together.' },
  eight: { mode: 'tuple', H: [0, 2, 6, 8, 12, 18, 20, 26],
    zh: '可容许的 8 元组最窄宽 26（已冻结）。2·10⁷ 以内它全为素数只有两次：11, 13, 17, 19, 23, 29, 31, 37，以及从 15 760 091 开始的一组。',
    en: 'The narrowest admissible 8-tuple has width 26 (frozen). Below 2·10⁷ it is all prime only twice: 11, 13, 17, 19, 23, 29, 31, 37, and the group starting at 15 760 091.' },
  forty: { mode: 'tuple', H: TUPLE_186,
    zh: '宽 186 的可容许 40 元组（已冻结的证书）。DHL[40, 2] 若成立，就推出宽 ≤ 186 的间隙无穷多次。页面数一数 n ≤ 10⁶ 时 n + H 里有几个素数：至少两个的 n 很常见，但 DHL 说的是“无穷多”，数值不能代替证明。',
    en: 'An admissible 40-tuple of width 186 (a frozen certificate). If DHL[40, 2] holds, gaps of width ≤ 186 occur infinitely often. The page counts the primes in n + H for n ≤ 10⁶: n with at least two are common, but DHL is about infinitely many, and numbers cannot replace the proof.' },
  records: { mode: 'records',
    zh: '纪录间隙：比之前所有间隙都大的相邻间隙。2·10⁷ 以内的最大间隙是 180（17 051 707 之后）。平均间隙约 log p，纪录大约跟着 log² p 走（Cramér 猜想，开放）。',
    en: 'Record gaps: consecutive gaps larger than every earlier one. The largest gap below 2·10⁷ is 180 (after 17 051 707). The average gap is about log p, and the records roughly follow log² p (Cramér’s conjecture, open).' },
  sqrt: { mode: 'sqrt',
    zh: 'A079063：a(n) 是使 √p<sub>n+k</sub> − √p<sub>n</sub> &gt; 1 的最小 k。Cloitre 猜想 a(n) &gt; 0.4√n 最终总成立；本库证明任何 c &gt; 0 都不行。n ≤ 10⁶ 时比值最低 0.4002（n = 8548），仍在 0.4 以上：反驳来自证明，不来自这些数值。',
    en: 'A079063: a(n) is the least k with √p<sub>n+k</sub> − √p<sub>n</sub> &gt; 1. Cloitre conjectured a(n) &gt; 0.4√n eventually; this library proves no c &gt; 0 works. For n ≤ 10⁶ the ratio bottoms out at 0.4002 (n = 8548), still above 0.4: the refutation comes from the proof, not from these numbers.' },
  square: { mode: 'square',
    zh: 'A089610：(n², n² + n] 里的素数个数。OEIS 的猜想说它从某处起每一步都严格增加。曲线上下跳个不停；本库证明这种“最终单调递增”不可能。',
    en: 'A089610: the number of primes in (n², n² + n]. The OEIS conjecture says it eventually increases at every step. The curve keeps jumping up and down; this library proves that such an eventual increase is impossible.' },
  divisor: { mode: 'divisor',
    zh: 'A049591 的一条刻画：n &gt; 1 在数列里 ⟺ n 与 n + τ(n)² 之间没有素数。前 528 个 n 都对得上；529 = 23² 时窗口 (529, 538) 里没有素数，但 529 不是素数。',
    en: 'A characterization of A049591: n &gt; 1 is in the sequence ⟺ there is no prime between n and n + τ(n)². The first 528 values of n agree; at 529 = 23² the window (529, 538) holds no prime, yet 529 is not prime.' }
};

/* =====================================================================
   3. The model
   ===================================================================== */
let MODEL = null, dirty = true;
const LOG_X0 = Math.log(100), LOG_X1 = Math.log(N);
const xOf = (f) => Math.exp(LOG_X0 + (LOG_X1 - LOG_X0) * Math.min(1, Math.max(0, f)));
function buildTuple(M) {
  const H = S.H.slice().sort((a, b) => a - b), k = H.length, D = H[k - 1];
  M.H = H; M.k = k; M.D = D;
  // residues occupied mod p, for the rings and for admissibility (a prime p > k can never be filled)
  const ringTop = Math.max(13, ...SMALL_PRIMES.filter((p) => p <= k));
  M.rings = SMALL_PRIMES.filter((p) => p <= ringTop).map((p) => { const occ = new Array(p).fill(false); for (const h of H) occ[h % p] = true; return { p, occ, full: occ.every(Boolean) }; });
  M.blockers = M.rings.filter((r) => r.full).map((r) => r.p);
  M.admissible = M.blockers.length === 0;
  // every n ≤ N − D with n + H all prime (n must itself be prime because 0 ∈ H)
  const occ = []; for (let i = 0; i < NP; i++) { const n = PRIMES[i]; if (n + D > N) break; let all = true; for (let j = 1; j < k; j++) if (COMP[n + H[j]]) { all = false; break; } if (all) occ.push(n); }
  M.occ = Int32Array.from(occ);
  // occupancy: how many of n + H are prime, for 1 ≤ n ≤ 10⁶
  M.hist = new Array(k + 1).fill(0); M.best = new Int32Array(OCC_N + 1); let bn = 1, bc = -1;
  for (let n = 1; n <= OCC_N; n++) { let c = 0; for (const h of H) if (!COMP[n + h]) c++; M.hist[c]++; if (c > bc) { bc = c; bn = n; } M.best[n] = bn; }   // best[n]: the first m ≤ n with the most primes in m + H
  // Hardy–Littlewood: 𝔖(H) over the primes below 10⁵, and ∫₂ˣ dt / ∏ log(t + h) on a logarithmic grid
  let sing = 1; for (const p of SMALL_PRIMES) { const nu = new Set(H.map((h) => h % p)).size; if (nu === p) { sing = 0; break; } sing *= (1 - nu / p) / Math.pow(1 - 1 / p, k); }
  M.sing = sing;
  const G = 1200, la = Math.log(2), lb = LOG_X1, hh = (lb - la) / G, f = (u) => { const t = Math.exp(u); let pr = 1; for (const h of H) pr *= Math.log(t + h); return t / pr; };
  M.hlX = new Float64Array(G + 1); M.hlY = new Float64Array(G + 1); let acc = 0, prev = f(la);
  for (let i = 0; i <= G; i++) { const u = la + i * hh; if (i) { const mid = f(u - hh / 2), cur = f(u); acc += hh * (prev + 4 * mid + cur) / 6; prev = cur; } M.hlX[i] = Math.exp(u); M.hlY[i] = sing * acc; }
  M.hlAt = (x) => { const u = (Math.log(Math.max(2, x)) - la) / hh, i = Math.min(G - 1, Math.max(0, Math.floor(u))), w = Math.min(1, Math.max(0, u - i)); return M.hlY[i] * (1 - w) + M.hlY[i + 1] * w; };
  M.countAt = (x) => { let lo = 0, hi = M.occ.length; while (lo < hi) { const m = (lo + hi) >> 1; if (M.occ[m] <= x) lo = m + 1; else hi = m; } return lo; };
  M.sk = k <= S_K.length ? S_K[k - 1] : null;
}
function buildRecords(M) {
  const rec = []; let best = 0; for (let i = 1; i < NP; i++) { const g = PRIMES[i] - PRIMES[i - 1]; if (g > best) { best = g; rec.push([PRIMES[i - 1], g]); } }
  M.records = rec;
  M.recordsAt = (x) => rec.filter(([p, g]) => p + g <= x);
  M.histAt = (x) => { const h = new Map(); const m = piLE(x); for (let i = 1; i < m; i++) { const g = PRIMES[i] - PRIMES[i - 1]; h.set(g, (h.get(g) || 0) + 1); } return h; };
  M.histCache = new Map();
}
function buildSqrt(M) {
  // a(n) = least k ≥ 1 with √p_{n+k} − √p_n > 1; the index n + a(n) never decreases, so one pass suffices
  const a = new Int32Array(SQRT_N + 1); let m = 1;
  for (let n = 1; n <= SQRT_N; n++) { const b = Math.sqrt(PRIMES[n - 1]); if (m < n + 1) m = n + 1; while (Math.sqrt(PRIMES[m - 1]) - b <= 1) m++; a[n] = m - n; }
  M.a = a; let lo = Infinity, at = 0; for (let n = 1; n <= SQRT_N; n++) { const r = a[n] / Math.sqrt(n); if (r < lo) { lo = r; at = n; } }
  M.minRatio = lo; M.minAt = at;
}
function buildSquare(M) {
  const a = new Int32Array(SQUARE_N + 2); for (let n = 1; n <= SQUARE_N + 1; n++) { let c = 0; for (let m = n * n + 1; m <= n * n + n; m++) if (!COMP[m]) c++; a[n] = c; }
  M.a = a; M.drops = []; for (let n = 1; n <= SQUARE_N; n++) if (a[n + 1] <= a[n]) M.drops.push(n);
}
function buildDivisor(M) {
  M.mism = []; M.term = (n) => n % 2 === 1 && isPrime(n) && !isPrime(n + 2);
  M.empty = (n) => { const t = tau(n); for (let m = n + 1; m < n + t * t; m++) if (!COMP[m]) return false; return true; };
  for (let n = 2; n <= DIV_N; n++) if (M.term(n) !== M.empty(n)) M.mism.push(n);
}
function build() {
  const M = { mode: S.mode };
  if (S.mode === 'tuple') buildTuple(M); else if (S.mode === 'records') buildRecords(M); else if (S.mode === 'sqrt') buildSqrt(M);
  else if (S.mode === 'square') buildSquare(M); else buildDivisor(M);
  MODEL = M;
}
/* where the rail stands */
function progress() {
  const M = MODEL, f = Math.min(1, Math.max(0, S.nowFrac));
  if (M.mode === 'tuple' || M.mode === 'records') return { x: Math.round(xOf(f)) };
  if (M.mode === 'sqrt') return { n: Math.max(1, Math.round(Math.exp(Math.log(SQRT_N) * f))) };
  if (M.mode === 'square') return { n: Math.max(1, Math.round(1 + (SQUARE_N - 1) * f)) };
  return { n: Math.max(2, Math.round(2 + (DIV_SHOW - 2) * f)) };
}

/* =====================================================================
   4. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const num = (v, d = 4) => (v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(d));

/* =====================================================================
   5. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 40000, PTS_MAX = 6000;
const CAMS = { iso: [0.6, 1.08, 15], front: [0.0001, 1.5, 15], top: [0.0001, 0.06, 15] };
const cam = { theta: 0.6, phi: 1.08, r: 15, tTheta: 0.6, tPhi: 1.08, tR: 15 };
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
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
  float a = (smoothstep(1.0, 0.2, r) * 0.8 + smoothstep(0.35, 0.0, r)) * vA;
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
/* the featured translate n + H in the tuple mode: the last occurrence ≤ x, else the n ≤ min(x, 10⁶) with the most primes */
function featured() {
  const M = MODEL, x = progress().x, c = M.countAt(x);
  if (c > 0) return { n: M.occ[c - 1], full: true };
  return { n: M.best[Math.min(x, OCC_N)], full: false };
}
const FEAT = { key: '', val: null };
function featuredCached() { const key = `${S.mode}|${S.H.join(',')}|${progress().x}`; if (FEAT.key !== key) { FEAT.key = key; FEAT.val = featured(); } return FEAT.val; }
function updateGL() {
  const M = MODEL, pr = progress();
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp[3 * v] = a[0]; Pp[3 * v + 1] = a[1]; Pp[3 * v + 2] = a[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; Pp[3 * v] = b[0]; Pp[3 * v + 1] = b[1]; Pp[3 * v + 2] = b[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  const box = (x0, x1, y0, y1, z, col, k) => { seg([x0, y0, z], [x1, y0, z], col, k); seg([x1, y0, z], [x1, y1, z], col, k); seg([x1, y1, z], [x0, y1, z], col, k); seg([x0, y1, z], [x0, y0, z], col, k); };
  if (M.mode === 'tuple') {
    // one ring per prime: p slots on a circle, stacked upward; occupied slots cyan, free slots green, a full ring magenta
    const nr = M.rings.length, ring = (i) => ({ y: 0.2 + 3.6 * i / Math.max(1, nr - 1), r: 0.9 + 1.4 * Math.sqrt(M.rings[i].p / M.rings[nr - 1].p) });
    M.rings.forEach((R, i) => {
      const { y, r } = ring(i), cx = -3.2;
      for (let s = 0; s < R.p; s++) { const a0 = 2 * Math.PI * s / R.p, a1 = 2 * Math.PI * (s + 1) / R.p; seg([cx + r * Math.cos(a0), y, r * Math.sin(a0)], [cx + r * Math.cos(a1), y, r * Math.sin(a1)], R.full ? COL.magenta : COL.gray, R.full ? 0.8 : 0.25); }
      for (let s = 0; s < R.p; s++) {
        const a = 2 * Math.PI * s / R.p, P = [cx + r * Math.cos(a), y, r * Math.sin(a)];
        if (R.occ[s]) dot(P, R.full ? COL.magenta : COL.cyan, 0.9, 1.3);
        else { dot(P, GREEN, 1, 2.8); seg(P, [cx + (r + 0.35) * Math.cos(a), y, (r + 0.35) * Math.sin(a)], GREEN, 0.9); }   // a free class: the tuple can dodge p here
      }
    });
    // the translate n + H on a number line: primes amber, composites dim
    const F = featuredCached(), W = Math.max(30, M.D), X = (h) => -0.6 + 5.6 * h / W, z = 1.6;
    seg([X(0), 0, z], [X(W), 0, z], COL.gray, 0.35);
    for (let h = 0; h <= W; h += W > 60 ? 10 : 2) seg([X(h), 0, z], [X(h), -0.12, z], COL.gray, 0.3);
    for (const h of M.H) { const p = isPrime(F.n + h), top = p ? 1.6 : 0.5; seg([X(h), 0, z], [X(h), top, z], p ? COL.amber : COL.gray, p ? 0.9 : 0.3); dot([X(h), top, z], p ? COL.amber : COL.gray, p ? 1 : 0.5, p ? 1.6 : 1); }
  } else if (M.mode === 'records') {
    // a skyline over log x: the largest gap in each of 160 bins up to x, records as magenta beacons
    const x = pr.x, B = 160, lx0 = Math.log(3), lx1 = Math.log(N), X = (t) => -4 + 9 * (Math.log(t) - lx0) / (lx1 - lx0), maxG = 180;
    const m = piLE(x); const bins = new Array(B).fill(0);
    for (let i = 1; i < m; i++) { const g = PRIMES[i] - PRIMES[i - 1], b = Math.min(B - 1, Math.max(0, Math.floor((Math.log(PRIMES[i - 1]) - lx0) / (lx1 - lx0) * B))); if (g > bins[b]) bins[b] = g; }
    for (let b = 0; b < B; b++) if (bins[b]) { const x0 = -4 + 9 * b / B, h = 3.5 * bins[b] / maxG; seg([x0, 0, 0], [x0, h, 0], COL.cyan, 0.55); }
    for (const [p, g] of M.recordsAt(x)) { const h = 3.5 * g / maxG; dot([X(p), h, 0], COL.magenta, 1, 1.6); }
    seg([-4, 0, 0], [5, 0, 0], COL.gray, 0.35);
    for (let i = 0; i <= 80; i++) { const t = Math.exp(lx0 + (lx1 - lx0) * i / 80), t2 = Math.exp(lx0 + (lx1 - lx0) * (i + 1) / 80); if (t2 > x) break; seg([X(t), 3.5 * Math.log(t) ** 2 / maxG, 0], [X(t2), 3.5 * Math.log(t2) ** 2 / maxG, 0], COL.amber, 0.5); seg([X(t), 3.5 * Math.log(t) / maxG, 0.01], [X(t2), 3.5 * Math.log(t2) / maxG, 0.01], COL.gray, 0.6); }
  } else if (M.mode === 'sqrt') {
    // the primes after p_n on the √ scale; the unit window from √p_n, the counted ones cyan, the first one outside amber
    const n = pr.n, b = Math.sqrt(PRIMES[n - 1]), a = M.a[n], X = (s) => -3.8 + 7.6 * (s - b + 0.1) / 1.4;
    seg([X(b - 0.1), 0, 0], [X(b + 1.3), 0, 0], COL.gray, 0.4); box(X(b), X(b + 1), 0, 1.4, 0, COL.amber, 0.5);
    for (let k = 0; ; k++) { const p = PRIMES[n - 1 + k], s = Math.sqrt(p); if (s > b + 1.3) break; const col = k === 0 ? COL.sigma : k < a ? COL.cyan : k === a ? COL.amber : COL.gray; seg([X(s), 0, 0], [X(s), k === a ? 1.6 : 1.0, 0], col, k <= a ? 0.85 : 0.3); dot([X(s), k === a ? 1.6 : 1.0, 0], col, k <= a ? 1 : 0.4, 1.2); }
  } else if (M.mode === 'square') {
    // rows n − 23 … n: the cells n² + 1 … n² + n, primes lit
    const n = pr.n, rows = Math.min(24, n);
    for (let r = 0; r < rows; r++) { const m = n - r, z = -r * 0.42, w = 8.4; for (let j = 1; j <= m; j++) { const v0 = m * m + j, x0 = -4.2 + w * (j - 1) / m; if (!COMP[v0]) { seg([x0, 0, z], [x0, r === 0 ? 1.2 : 0.5, z], r === 0 ? COL.amber : COL.cyan, r === 0 ? 0.95 : 0.6 - 0.02 * r); } } seg([-4.2, 0, z], [4.2, 0, z], COL.gray, r === 0 ? 0.5 : 0.15); }
  } else {
    // n and the window (n, n + τ(n)²), primes amber
    const n = pr.n, t = tau(n), w = t * t, lo = n - 4, hi = Math.max(n + w + 4, n + 24), X = (m) => -4 + 8.4 * (m - lo) / (hi - lo);
    seg([X(lo), 0, 0], [X(hi), 0, 0], COL.gray, 0.4); box(X(n), X(n + w), 0, 1.3, 0, M.empty(n) ? COL.magenta : COL.cyan, 0.6);
    for (let m = lo; m <= hi; m++) { const p = isPrime(m); seg([X(m), 0, 0], [X(m), p ? 1 : 0.25, 0], m === n ? COL.sigma : p ? COL.amber : COL.gray, p || m === n ? 0.9 : 0.3); if (p) dot([X(m), 1, 0], COL.amber, 1, 1.2); }
  }
  lines.geometry.setDrawRange(0, v); Lb.position.needsUpdate = true; Lb.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 58 * renderer.getPixelRatio();
}

/* =====================================================================
   6. Camera
   ===================================================================== */
let camName = 'iso';
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.55 : 1);
  camera.position.set(0.4 + r * sp * Math.sin(cam.theta), 1.4 + r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0.4, 1.2, 0);
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
   7. Tags
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
  if (M.mode === 'tuple') {
    const nr = M.rings.length;
    M.rings.forEach((R, i) => { if (i < 6 || i === nr - 1 || R.full) put(`mod ${R.p}${R.full ? T(' 占满', ' FULL') : ''}`, [-3.2 - 2.5, 0.2 + 3.6 * i / Math.max(1, nr - 1), 0], R.full ? 'mg' : ''); });
    const F = featuredCached(); put(F.full ? T(`n = ${fmtInt(F.n)}：全为素数`, `n = ${fmtInt(F.n)}: ALL PRIME`) : T(`n = ${fmtInt(F.n)}：素数最多的平移`, `n = ${fmtInt(F.n)}: MOST PRIMES`), [2.2, 2.2, 1.6], F.full ? 'hot' : 'cy');
  } else if (M.mode === 'records') { const r = M.recordsAt(pr.x); if (r.length) put(T(`纪录 ${r[r.length - 1][1]}`, `RECORD ${r[r.length - 1][1]}`), [4.2, 3.9, 0], 'mg'); put('log² p', [4.8, 3.2, 0], 'hot'); put(T('平均 log p', 'MEAN log p'), [4.8, 0.55, 0], ''); }
  else if (M.mode === 'sqrt') { put(`√p${'ₙ'} = ${Math.sqrt(PRIMES[pr.n - 1]).toFixed(3)}`, [-3.3, -0.4, 0], ''); put(T(`a(${pr.n}) = ${M.a[pr.n]}`, `a(${pr.n}) = ${M.a[pr.n]}`), [1.6, 1.9, 0], 'hot'); }
  else if (M.mode === 'square') put(`(${pr.n}², ${pr.n}² + ${pr.n}]`, [0, 1.6, 0], 'hot');
  else put(`τ(${pr.n})² = ${tau(pr.n) ** 2}`, [0, 1.7, 0], M.empty(pr.n) ? 'mg' : 'cy');
  for (let i = k; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}

/* =====================================================================
   8. 2D panels
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
const sup = (e) => String(e).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join('');
function drawMain() {
  const F = frame2d(cv1); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, pr = progress();
  if (M.mode === 'tuple' || M.mode === 'records') {
    const lx0 = LOG_X0, lx1 = LOG_X1, X = (x) => pl + (Math.log(x) - lx0) / (lx1 - lx0) * iw;
    xTicks(ctx, dpr, pt, ih, X, [1e2, 1e3, 1e4, 1e5, 1e6, 1e7], (x) => `10${sup(Math.round(Math.log10(x)))}`);
    ctx.strokeStyle = AM; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(X(pr.x), pt); ctx.lineTo(X(pr.x), pt + ih); ctx.stroke(); ctx.setLineDash([]);
    if (M.mode === 'tuple') {
      const top = Math.max(2, M.countAt(N), M.hlAt(N)) * 1.08, Y = (v) => pt + ih - Math.log10(1 + v) / Math.log10(1 + top) * ih;
      yTicks(ctx, dpr, pl, Y, [0, 10, 1e3, 1e5].filter((v) => v < top), (v) => (v >= 1000 ? `10${sup(Math.round(Math.log10(v)))}` : String(v)));
      ctx.strokeStyle = AM; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); for (let i = 0; i <= 200; i++) { const x = Math.exp(lx0 + (lx1 - lx0) * i / 200); if (i) ctx.lineTo(X(x), Y(M.hlAt(x))); else ctx.moveTo(X(x), Y(M.hlAt(x))); } ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = CY; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); for (let i = 0; i <= 300; i++) { const x = Math.exp(lx0 + (lx1 - lx0) * i / 300); if (x > pr.x) break; const y = Y(M.countAt(x)); if (i) ctx.lineTo(X(x), y); else ctx.moveTo(X(x), y); } ctx.stroke(); ctx.lineWidth = 1;
      $('c1Title').textContent = T('n ≤ x 中 n + H 全为素数的次数（青）与 Hardy–Littlewood 预测（琥珀虚线）', 'n ≤ x WITH n + H ALL PRIME (CYAN) AND THE HARDY–LITTLEWOOD PREDICTION (AMBER DASHES)');
      $('c1Meta').textContent = T('双对数刻度 · 预测是猜想', 'log–log scale · the prediction is a conjecture');
    } else {
      const top = 200, Y = (g) => pt + ih - g / top * ih;
      yTicks(ctx, dpr, pl, Y, [0, 50, 100, 150, 200], String);
      ctx.strokeStyle = AM; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); for (let i = 0; i <= 200; i++) { const x = Math.exp(lx0 + (lx1 - lx0) * i / 200); if (i) ctx.lineTo(X(x), Y(Math.log(x) ** 2)); else ctx.moveTo(X(x), Y(Math.log(x) ** 2)); } ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = DIM; ctx.beginPath(); for (let i = 0; i <= 200; i++) { const x = Math.exp(lx0 + (lx1 - lx0) * i / 200); if (i) ctx.lineTo(X(x), Y(Math.log(x))); else ctx.moveTo(X(x), Y(Math.log(x))); } ctx.stroke();
      ctx.strokeStyle = MG; ctx.fillStyle = MG; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); let prevG = null;
      for (const [p, g] of M.records) { if (p < 100 || p + g > pr.x) continue; if (prevG === null) ctx.moveTo(X(p), Y(g)); else { ctx.lineTo(X(p), Y(prevG)); ctx.lineTo(X(p), Y(g)); } prevG = g; }
      if (prevG !== null) ctx.lineTo(X(pr.x), Y(prevG)); ctx.stroke(); ctx.lineWidth = 1;
      for (const [p, g] of M.records) if (p >= 100 && p + g <= pr.x) { ctx.beginPath(); ctx.arc(X(p), Y(g), 2.5 * dpr, 0, 2 * Math.PI); ctx.fill(); }
      $('c1Title').textContent = T('纪录间隙（品红）、log² p（琥珀虚线）与平均间隙 log p（灰）', 'RECORD GAPS (MAGENTA), log² p (AMBER DASHES) AND THE MEAN GAP log p (GREY)');
      $('c1Meta').textContent = T('横轴 p 取对数刻度', 'p on a log scale');
    }
  } else if (M.mode === 'sqrt') {
    const X = (n) => pl + Math.log(n) / Math.log(SQRT_N) * iw, Y = (r) => pt + ih - Math.min(1.6, r) / 1.6 * ih;
    yTicks(ctx, dpr, pl, Y, [0, 0.4, 0.8, 1.2, 1.6], (r) => r.toFixed(1));
    xTicks(ctx, dpr, pt, ih, X, [1, 10, 100, 1e3, 1e4, 1e5, 1e6], (n) => (n < 1000 ? String(n) : `10${sup(Math.round(Math.log10(n)))}`));
    for (const [c, col] of [[0.4, MG], [0.46, AM], [0.75, AM]]) { ctx.strokeStyle = col; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(pl, Y(c)); ctx.lineTo(pl + iw, Y(c)); ctx.stroke(); ctx.setLineDash([]); }
    // per pixel column: the min and max of a(n)/√n over the n in that column, up to the current n
    ctx.strokeStyle = CY; const cols = Math.floor(iw / dpr); let n0 = 1;
    for (let c = 0; c < cols; c++) { const n1 = Math.min(pr.n, Math.floor(Math.exp(Math.log(SQRT_N) * (c + 1) / cols))); if (n1 < n0) continue; let lo = 9, hi = 0; for (let n = n0; n <= n1; n++) { const r = M.a[n] / Math.sqrt(n); if (r < lo) lo = r; if (r > hi) hi = r; } ctx.beginPath(); ctx.moveTo(pl + c * dpr + 0.5, Y(lo)); ctx.lineTo(pl + c * dpr + 0.5, Y(hi) - 0.5); ctx.stroke(); n0 = n1 + 1; if (n1 >= pr.n) break; }
    ctx.strokeStyle = INK; ctx.globalAlpha = 0.6; ctx.beginPath(); for (let i = 0; i <= 200; i++) { const n = Math.max(2, Math.round(Math.exp(Math.log(SQRT_N) * i / 200))), p = PRIMES[n - 1], r = 2 * Math.sqrt(p) / Math.log(p) / Math.sqrt(n); if (i) ctx.lineTo(X(n), Y(r)); else ctx.moveTo(X(n), Y(r)); } ctx.stroke(); ctx.globalAlpha = 1;
    $('c1Title').textContent = T('a(n)/√n（青），猜想的 0.4（品红）与 0.46、0.75（琥珀），粗估 2√pₙ/(√n log pₙ)（白）', 'a(n)/√n (CYAN), THE CONJECTURED 0.4 (MAGENTA) AND 0.46, 0.75 (AMBER), THE ESTIMATE 2√pₙ/(√n log pₙ) (WHITE)');
    $('c1Meta').textContent = T('n 取对数刻度', 'n on a log scale');
  } else if (M.mode === 'square') {
    const top = Math.max(...M.a.slice(1, SQUARE_N + 1)) + 2, X = (n) => pl + (n - 1) / (SQUARE_N - 1) * iw, Y = (v) => pt + ih - v / top * ih;
    yTicks(ctx, dpr, pl, Y, [0, Math.round(top / 2), top], String); xTicks(ctx, dpr, pt, ih, X, [1, 1000, 2000, 3000], String);
    const step = Math.max(1, Math.floor(SQUARE_N / (iw / dpr)));
    for (let n = 1; n <= pr.n; n++) { if (n % step) continue; const d = M.a[n + 1] - M.a[n]; ctx.fillStyle = d > 0 ? CY : MG; ctx.fillRect(X(n), Y(M.a[n]), Math.max(1, dpr), Math.max(1, dpr)); }
    ctx.strokeStyle = AM; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(X(pr.n), pt); ctx.lineTo(X(pr.n), pt + ih); ctx.stroke(); ctx.setLineDash([]);
    $('c1Title').textContent = T('a(n) = (n², n² + n] 里的素数个数：下一步增加（青）或不增（品红）', 'a(n) = PRIMES IN (n², n² + n]: THE NEXT STEP RISES (CYAN) OR NOT (MAGENTA)');
    $('c1Meta').textContent = `n ≤ ${pr.n}`;
  } else {
    const X = (n) => pl + (n - 2) / (DIV_SHOW - 2) * iw;
    xTicks(ctx, dpr, pt, ih, X, [2, 500, 1000, 1500, 2000], String);
    ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(T('不符', 'differ'), pl - 4 * dpr, pt + ih * 0.3); ctx.fillText(T('相符', 'agree'), pl - 4 * dpr, pt + ih * 0.8);
    ctx.fillStyle = CY; ctx.globalAlpha = 0.35; ctx.fillRect(pl, pt + ih * 0.72, X(pr.n) - pl, ih * 0.16); ctx.globalAlpha = 1;
    for (const n of M.mism) { if (n > Math.min(pr.n, DIV_SHOW)) break; ctx.fillStyle = n === 529 ? AM : MG; ctx.fillRect(X(n), pt + ih * 0.15, Math.max(1, dpr), ih * 0.3); }
    ctx.strokeStyle = AM; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(X(pr.n), pt); ctx.lineTo(X(pr.n), pt + ih); ctx.stroke(); ctx.setLineDash([]);
    $('c1Title').textContent = T('n 在数列里 ⟺ (n, n + τ(n)²) 里没有素数？品红 = 不符，琥珀 = 529', 'IN THE SEQUENCE ⟺ NO PRIME IN (n, n + τ(n)²)? MAGENTA = DISAGREE, AMBER = 529');
    $('c1Meta').textContent = `2 ≤ n ≤ ${pr.n}`;
  }
}
function drawSide() {
  const F = frame2d(cv2); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, M = MODEL, pr = progress();
  if (M.mode === 'tuple') {
    const k = M.k, bw = iw / (k + 1), top = Math.log10(1 + Math.max(...M.hist)), Y = (v) => pt + ih - Math.log10(1 + v) / top * ih;
    yTicks(ctx, dpr, pl, Y, [0, 10, 1000, 1e5].filter((v) => Math.log10(1 + v) <= top), (v) => (v >= 1000 ? `10${sup(Math.round(Math.log10(v)))}` : String(v)));
    for (let j = 0; j <= k; j++) { const v = M.hist[j]; if (!v) continue; ctx.fillStyle = j === k ? AM : j >= 2 ? CY : FAINT; ctx.globalAlpha = 0.85; ctx.fillRect(pl + j * bw + bw * 0.12, Y(v), bw * 0.76, pt + ih - Y(v)); ctx.globalAlpha = 1; }
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; const step = k > 12 ? 5 : 1; for (let j = 0; j <= k; j += step) ctx.fillText(String(j), pl + (j + 0.5) * bw, pt + ih + 3 * dpr);
    $('c2Title').textContent = T('n ≤ 10⁶：n + H 里有几个素数', 'n ≤ 10⁶: HOW MANY OF n + H ARE PRIME');
    $('c2Meta').textContent = T('青 = 至少两个（DHL 关心的事）', 'cyan = at least two (what DHL is about)');
  } else if (M.mode === 'records') {
    if (!M.histCache.has(pr.x)) { if (M.histCache.size > 40) M.histCache.clear(); M.histCache.set(pr.x, M.histAt(pr.x)); }
    const h = M.histCache.get(pr.x), G = 60, bw = iw / (G / 2); let mx = 1, champ = 0; for (const [g, c] of h) if (g <= G && c > mx) { mx = c; champ = g; }
    for (let g = 2; g <= G; g += 2) { const c = h.get(g) || 0, y = pt + ih - c / mx * ih; ctx.fillStyle = g === champ ? AM : CY; ctx.globalAlpha = 0.8; ctx.fillRect(pl + (g / 2 - 1) * bw + bw * 0.1, y, bw * 0.8, pt + ih - y); ctx.globalAlpha = 1; }
    xTicks(ctx, dpr, pt, ih, (g) => pl + (g / 2 - 0.5) * bw, [2, 6, 10, 20, 30, 40, 50, 60], String);
    yTicks(ctx, dpr, pl, (v) => pt + ih - v / mx * ih, [0, mx], (v) => fmtInt(v));
    $('c2Title').textContent = T('p ≤ x 的相邻间隙分布（2 到 60）', 'DISTRIBUTION OF CONSECUTIVE GAPS FOR p ≤ x (2 TO 60)');
    $('c2Meta').textContent = T(`最常见：${champ}`, `most common: ${champ}`);
  } else if (M.mode === 'sqrt') {
    const n = pr.n, b = Math.sqrt(PRIMES[n - 1]), a = M.a[n], X = (s) => pl + (s - b + 0.05) / 1.25 * iw;
    ctx.strokeStyle = FAINT; ctx.beginPath(); ctx.moveTo(pl, pt + ih * 0.7); ctx.lineTo(pl + iw, pt + ih * 0.7); ctx.stroke();
    ctx.fillStyle = AM; ctx.globalAlpha = 0.12; ctx.fillRect(X(b), pt, X(b + 1) - X(b), ih * 0.7); ctx.globalAlpha = 1;
    for (let k = 0; ; k++) { const s = Math.sqrt(PRIMES[n - 1 + k]); if (s > b + 1.2) break; ctx.fillStyle = k === 0 ? INK : k < a ? CY : k === a ? AM : FAINT; ctx.fillRect(X(s), pt + ih * (k === a ? 0.1 : 0.3), Math.max(1.5, dpr * 1.5), ih * (k === a ? 0.6 : 0.4)); }
    ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(`√p = ${b.toFixed(2)}`, X(b), pt + ih + 3 * dpr); ctx.fillText(`+1`, X(b + 1), pt + ih + 3 * dpr);
    $('c2Title').textContent = T(`√ 刻度上 pₙ 之后的素数（n = ${n}）`, `PRIMES AFTER pₙ ON THE √ SCALE (n = ${n})`);
    $('c2Meta').textContent = T(`a(n) = ${a}：窗口内 ${a - 1} 个，第 ${a} 个落在外面`, `a(n) = ${a}: ${a - 1} inside the window, the ${a}th falls outside`);
  } else if (M.mode === 'square') {
    // the running count of steps that do not rise
    const X = (n) => pl + (n - 1) / (SQUARE_N - 1) * iw, tot = M.drops.length, Y = (c) => pt + ih - c / tot * ih;
    yTicks(ctx, dpr, pl, Y, [0, Math.round(tot / 2), tot], String); xTicks(ctx, dpr, pt, ih, X, [1, 1000, 2000, 3000], String);
    ctx.strokeStyle = MG; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.moveTo(X(1), Y(0)); let c = 0; for (const n of M.drops) { if (n > pr.n) break; c++; ctx.lineTo(X(n), Y(c)); } ctx.lineTo(X(pr.n), Y(c)); ctx.stroke(); ctx.lineWidth = 1;
    $('c2Title').textContent = T('累计：a(n + 1) ≤ a(n) 的次数', 'RUNNING COUNT OF STEPS WITH a(n + 1) ≤ a(n)'); $('c2Meta').textContent = T(`到 n = ${pr.n} 为止 ${c} 次`, `${c} up to n = ${pr.n}`);
  } else {
    // the window around 529, always shown for reference
    const n0 = 529, lo = 519, hi = 545, X = (m) => pl + (m - lo) / (hi - lo) * iw;
    ctx.fillStyle = MG; ctx.globalAlpha = 0.15; ctx.fillRect(X(n0), pt, X(538) - X(n0), ih); ctx.globalAlpha = 1;
    for (let m = lo; m <= hi; m++) { const p = isPrime(m); ctx.fillStyle = m === n0 ? INK : p ? AM : FAINT; ctx.fillRect(X(m) - dpr, pt + ih * (p ? 0.2 : 0.55), 2 * dpr, ih * (p ? 0.8 : 0.45)); }
    xTicks(ctx, dpr, pt, ih, X, [521, 529, 538, 541], String);
    $('c2Title').textContent = T('529 = 23²：τ = 3，窗口 (529, 538) 里没有素数', '529 = 23²: τ = 3, NO PRIME IN THE WINDOW (529, 538)'); $('c2Meta').textContent = T('琥珀 = 素数 523、541', 'amber = the primes 523 and 541');
  }
}

/* =====================================================================
   9. Readouts and controls
   ===================================================================== */
let syncedKey = '', toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function setRo(rows) { rows.forEach(([l, v], i) => { $(`ro${i + 1}L`).textContent = l; $(`ro${i + 1}`).textContent = v; }); }
function pill(id, label, value) { $(id).innerHTML = `${label} <strong>${value}</strong>`; }
function readouts() {
  const M = MODEL, pr = progress();
  if (M.mode === 'tuple') {
    const c = M.countAt(pr.x), hl = M.hlAt(pr.x), two = M.hist.slice(2).reduce((a, b) => a + b, 0);
    setRo([[T('元组大小 k · 宽度', 'Tuple size k · width'), `${M.k} · ${M.D}`],
      [T('可容许？', 'Admissible?'), M.admissible ? T('是：每个素数都留了空位', 'yes: every prime leaves a slot free') : T(`否：模 ${M.blockers.join('、')} 占满`, `no: full mod ${M.blockers.join(', ')}`)],
      [T(`n ≤ ${fmtInt(pr.x)} 中全为素数的次数`, `n ≤ ${fmtInt(pr.x)} with all prime`), `${fmtInt(c)}${c ? T(`（最近一次 n = ${fmtInt(M.occ[c - 1])}）`, ` (latest n = ${fmtInt(M.occ[c - 1])})`) : ''}`],
      [T('Hardy–Littlewood 预测（猜想）', 'Hardy–Littlewood prediction (conjecture)'), M.sing === 0 ? '0' : hl < 10 ? hl.toFixed(2) : fmtInt(Math.round(hl))],
      [T(`最小宽度 s(${M.k})（A008407）· n ≤ 10⁶ 中至少两个素数的 n`, `Minimal width s(${M.k}) (A008407) · n ≤ 10⁶ with at least two primes`), `${M.sk ?? '—'}${M.k === 8 ? ' (LEAN)' : ''} · ${fmtInt(two)}`]]);
    pill('pillA', 'k', M.k); pill('pillB', 'WIDTH', M.D); pill('pillC', M.admissible ? 'ADMISSIBLE' : 'BLOCKED', M.admissible ? '✓' : `mod ${M.blockers[0]}`); pill('pillD', 'COUNT', fmtInt(c));
    $('roNote').innerHTML = M.admissible
      ? T(`𝔖(H) = ${M.sing.toPrecision(5)}（对 10⁵ 以下的素数求积）。宽 ${M.D}${M.sk !== null && M.D === M.sk ? `，正好是 k = ${M.k} 的最小宽度` : M.sk !== null ? `，k = ${M.k} 的最小宽度是 ${M.sk}` : ''}。`, `𝔖(H) = ${M.sing.toPrecision(5)} (product over the primes below 10⁵). Width ${M.D}${M.sk !== null && M.D === M.sk ? `, exactly the minimal width for k = ${M.k}` : M.sk !== null ? `; the minimal width for k = ${M.k} is ${M.sk}` : ''}.`)
      : T(`模 ${M.blockers[0]} 的每个余数类都被占用：对每个 n，n + H 里总有一个数被 ${M.blockers[0]} 整除。`, `Every class mod ${M.blockers[0]} is occupied: for every n, some member of n + H is divisible by ${M.blockers[0]}.`);
  } else if (M.mode === 'records') {
    const r = M.recordsAt(pr.x), last = r[r.length - 1] || [2, 1], m = piLE(pr.x);
    setRo([[T('扫描到 x', 'Scanned up to x'), fmtInt(pr.x)], [T('x 以内的素数个数 π(x)', 'Primes up to x, π(x)'), fmtInt(m)],
      [T('目前的纪录间隙（在 p 之后）', 'Current record gap (after p)'), `${last[1]} (p = ${fmtInt(last[0])})`],
      [T('纪录 / log² p', 'Record / log² p'), num(last[1] / Math.log(last[0]) ** 2, 3)],
      [T('纪录个数 · 平均间隙 x/π(x)', 'Number of records · mean gap x/π(x)'), `${r.length} · ${num(pr.x / Math.max(1, m), 2)}`]]);
    pill('pillA', 'x', pr.x.toExponential(1)); pill('pillB', 'π(x)', fmtInt(m)); pill('pillC', 'RECORD', last[1]); pill('pillD', 'RECORDS', r.length);
    $('roNote').innerHTML = T('长间隙定理（已冻结）保证纪录增长得至少像 log X·loglog X·loglogloglog X/(logloglog X)² 那么快，但这个量在这里还不到 1，只是渐近意义上的结论。', 'The long-gap theorem (frozen) guarantees that records grow at least like log X·loglog X·loglogloglog X/(logloglog X)², but that quantity is below 1 here; the statement is asymptotic.');
  } else if (M.mode === 'sqrt') {
    const n = pr.n, a = M.a[n];
    setRo([[T('n · pₙ', 'n · pₙ'), `${fmtInt(n)} · ${fmtInt(PRIMES[n - 1])}`], ['a(n)', String(a)], ['a(n)/√n', num(a / Math.sqrt(n), 4)],
      [T('粗估 2√pₙ/(√n log pₙ)', 'Estimate 2√pₙ/(√n log pₙ)'), num(2 * Math.sqrt(PRIMES[n - 1]) / Math.log(PRIMES[n - 1]) / Math.sqrt(n), 4)],
      [T('n ≤ 10⁶ 中 a(n)/√n 的最小值', 'Smallest a(n)/√n for n ≤ 10⁶'), `${num(M.minRatio, 4)} (n = ${fmtInt(M.minAt)})`]]);
    pill('pillA', 'n', fmtInt(n)); pill('pillB', 'a(n)', a); pill('pillC', 'a/√n', num(a / Math.sqrt(n), 3)); pill('pillD', 'MIN', num(M.minRatio, 4));
    $('roNote').innerHTML = T('冻结定理：对任何 c &gt; 0，都有无穷多个 n 使 a(n) ≤ c√n，所以猜想的下极限 0.46 也不成立。页面的数值只到 n = 10⁶，比值还在 0.4 以上。', 'Frozen theorem: for every c &gt; 0, infinitely many n have a(n) ≤ c√n, so the conjectured lower limit 0.46 fails as well. The page’s numbers stop at n = 10⁶, where the ratio is still above 0.4.');
  } else if (M.mode === 'square') {
    const n = pr.n, drops = M.drops.filter((m) => m <= n).length;
    setRo([['n', String(n)], [`a(n) · a(n + 1)`, `${M.a[n]} · ${M.a[n + 1]}`], [T('至今不增加的步数', 'Steps without a rise so far'), String(drops)],
      [T('最近一次不增加', 'Latest step without a rise'), drops ? `n = ${M.drops[drops - 1]}` : '—'],
      [T('a(2k) ≤ k（证明中的一步）：2k ≤ 3000 时都成立？', 'a(2k) ≤ k (a step of the proof): holds for 2k ≤ 3000?'), Array.from({ length: SQUARE_N / 2 }, (_, k) => M.a[2 * (k + 1)] <= k + 1).every(Boolean) ? T('是', 'yes') : T('否', 'no')]]);
    pill('pillA', 'n', n); pill('pillB', 'a(n)', M.a[n]); pill('pillC', 'NO RISE', drops); pill('pillD', 'a(n+1)', M.a[n + 1]);
    $('roNote').innerHTML = T('冻结定理：不存在 N 使 n ≥ N 时总有 a(n) &lt; a(n + 1)。Oppermann 猜想（a(n) ≥ 1 对所有 n）仍是开放问题。', 'Frozen theorem: no N makes a(n) &lt; a(n + 1) for all n ≥ N. Oppermann’s conjecture (a(n) ≥ 1 for every n) is still open.');
  } else {
    const n = pr.n, t = tau(n), inSeq = M.term(n), empty = M.empty(n), first = M.mism[0];
    setRo([['n · τ(n)', `${n} · ${t}`], [T(`(${n}, ${n + t * t}) 里没有素数？`, `No prime in (${n}, ${n + t * t})?`), empty ? T('没有素数', 'no prime') : T('有素数', 'has a prime')],
      [T('n 在 A049591 里？（奇素数且 n + 2 是合数）', 'n in A049591? (odd prime with n + 2 composite)'), inSeq ? T('是', 'yes') : T('否', 'no')],
      [T('两边一致？', 'Do the two sides agree?'), inSeq === empty ? T('一致', 'agree') : T('不一致', 'disagree')],
      [T('2·10⁵ 以内第一个不一致的 n · 不一致的个数', 'First disagreeing n up to 2·10⁵ · number that disagree'), `${first} · ${fmtInt(M.mism.length)}`]]);
    pill('pillA', 'n', n); pill('pillB', 'τ(n)', t); pill('pillC', inSeq === empty ? 'AGREE' : 'DIFFER', inSeq === empty ? '✓' : '✗'); pill('pillD', 'FIRST', first);
    $('roNote').innerHTML = T('冻结定理只用 529 一个数推翻这条刻画；页面另外算出 2·10⁵ 以内一共 9439 个不一致的 n。', 'The frozen theorem refutes the characterization with the single number 529; the page also finds 9439 disagreeing n up to 2·10⁵.');
  }
}
function syncOutputs() {
  if (dirty) { build(); dirty = false; syncedKey = ''; toasted = false; FEAT.key = ''; renderOffsets(); }
  const M = MODEL, pr = progress(), key = `${S.mode}|${S.nowFrac}|${TRV.lang()}`;
  if (key === syncedKey) return; syncedKey = key;
  readouts();
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  $('tupleBox').hidden = S.mode !== 'tuple';
  if (S.mode === 'tuple') $('tupleLabel').innerHTML = T(`H = {${M.H.join(', ')}}。点下面的数切换偏移（0 总在 H 里）${M.D > EDIT_MAX ? '；这个元组超出 60，编辑会只保留 60 以内的偏移' : ''}。`, `H = {${M.H.join(', ')}}. Click a number below to toggle an offset (0 is always in H)${M.D > EDIT_MAX ? '; this tuple reaches beyond 60, so editing keeps only the offsets up to 60' : ''}.`);
  $('presetNote').innerHTML = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = ({
    tuple: T('时间轴 = 扫描上限 x（10² 到 2·10⁷，对数刻度）。', 'The time axis is the scan limit x (10² to 2·10⁷, log scale).'),
    records: T('时间轴 = 扫描上限 x（10² 到 2·10⁷，对数刻度）。', 'The time axis is the scan limit x (10² to 2·10⁷, log scale).'),
    sqrt: T('时间轴 = n（1 到 10⁶，对数刻度）。', 'The time axis is n (1 to 10⁶, log scale).'),
    square: T('时间轴 = n（1 到 3000）。', 'The time axis is n (1 to 3000).'),
    divisor: T('时间轴 = n（2 到 2000）。', 'The time axis is n (2 to 2000).')
  })[S.mode];
  $('litNote').innerHTML = T(`筛到 2·10⁷：π(2·10⁷) = ${fmtInt(NP)}。`, `Sieved to 2·10⁷: π(2·10⁷) = ${fmtInt(NP)}.`);
  $('clock').innerHTML = pr.x !== undefined ? `x ${pr.x.toExponential(1)}` : `n ${pr.n}`;
  $('hudBig').textContent = ({ tuple: () => T(`H = {${M.H.length > 10 ? M.H.slice(0, 8).join(', ') + ', …' : M.H.join(', ')}} · ${M.admissible ? '可容许' : '被堵死'}`, `H = {${M.H.length > 10 ? M.H.slice(0, 8).join(', ') + ', …' : M.H.join(', ')}} · ${M.admissible ? 'admissible' : 'blocked'}`),
    records: () => T(`最大间隙 · x = ${pr.x.toExponential(1)}`, `largest gaps · x = ${pr.x.toExponential(1)}`), sqrt: () => `A079063 · n = ${pr.n}`, square: () => `A089610 · n = ${pr.n}`, divisor: () => `A049591 · n = ${pr.n}` })[M.mode]();
  $('hudSub').textContent = ({ tuple: T('每个素数 p 一圈 p 个余数槽：青 = H 占用，绿 = 空着，品红 = 整圈占满 · 前：平移 n + H，琥珀 = 素数', 'each prime p is a ring of p residue slots: cyan = occupied by H, green = free, magenta = a full ring · front: the translate n + H, amber = prime'),
    records: T('每根柱 = 一段 log 区间里的最大间隙 · 品红点 = 纪录 · 琥珀 = log² p · 灰 = log p', 'each bar = the largest gap in a log bin · magenta dots = records · amber = log² p · grey = log p'),
    sqrt: T('√ 刻度：白 = pₙ，青 = 单位窗口里的素数，琥珀 = 第一个落在窗口外的', 'on the √ scale: white = pₙ, cyan = primes inside the unit window, amber = the first one outside'),
    square: T('每行是 (m², m² + m]，竖线 = 素数；最前一行是当前的 n', 'each row is (m², m² + m], lines = primes; the front row is the current n'),
    divisor: T('白 = n，框 = (n, n + τ(n)²)，琥珀 = 素数；品红框 = 窗口里没有素数', 'white = n, box = (n, n + τ(n)²), amber = primes; magenta box = no prime in the window') })[M.mode];
  if (!toasted && S.playing) {
    if (M.mode === 'divisor' && pr.n >= 529) { toasted = true; toast(T('<b>n = 529</b>：(529, 538) 里没有素数，但 529 = 23² 不在数列里——刻画被推翻。', '<b>n = 529</b>: no prime in (529, 538), yet 529 = 23² is not in the sequence; the characterization fails.')); }
    else if (M.mode === 'tuple' && S.nowFrac >= 1) { toasted = true; toast(M.admissible ? T(`<b>2·10⁷ 以内</b>：n + H 全为素数 ${fmtInt(M.occ.length)} 次，预测 ${M.hlAt(N) < 10 ? M.hlAt(N).toFixed(1) : fmtInt(Math.round(M.hlAt(N)))} 次。`, `<b>Below 2·10⁷</b>: n + H is all prime ${fmtInt(M.occ.length)} times; the prediction is ${M.hlAt(N) < 10 ? M.hlAt(N).toFixed(1) : fmtInt(Math.round(M.hlAt(N)))}.`) : T(`<b>被模 ${M.blockers[0]} 堵死</b>：全为素数只有 ${M.occ.length} 次。`, `<b>Blocked mod ${M.blockers[0]}</b>: all prime only ${M.occ.length} time(s).`)); }
    else if (M.mode === 'records' && S.nowFrac >= 1) { toasted = true; toast(T('<b>2·10⁷ 以内的最大间隙是 180</b>：17 051 707 与 17 051 887 之间。', '<b>The largest gap below 2·10⁷ is 180</b>: between 17 051 707 and 17 051 887.')); }
  }
}
function syncRail() {
  const key = `${S.mode}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  let marks;
  if (S.mode === 'tuple' || S.mode === 'records') marks = [2, 3, 4, 5, 6, 7].map((e) => [(Math.log(10 ** e) - LOG_X0) / (LOG_X1 - LOG_X0), `10${sup(e)}`]).concat([[1, '2·10⁷']]);
  else if (S.mode === 'sqrt') marks = [0, 1, 2, 3, 4, 5, 6].map((e) => [e / 6, e ? `10${sup(e)}` : '1']);
  else if (S.mode === 'square') marks = [1, 1000, 2000, 3000].map((n) => [(n - 1) / (SQUARE_N - 1), String(n)]);
  else marks = [2, 529, 1000, 2000].map((n) => [(n - 2) / (DIV_SHOW - 2), String(n)]);
  $('marks').innerHTML = marks.map(([f, s], i) => `<i class="${i === 0 ? 'first' : i === marks.length - 1 ? 'last' : ''}" style="left:${(f * 100).toFixed(2)}%">${s}</i>`).join('');
}
function renderOffsets() {
  const box = $('offsets'); if (!box.dataset.built) { box.innerHTML = Array.from({ length: EDIT_MAX }, (_, i) => `<button data-off="${i + 1}" aria-pressed="false">${i + 1}</button>`).join(''); box.dataset.built = '1';
    box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const h = +b.dataset.off; let H = S.H.filter((x) => x <= EDIT_MAX); H = H.includes(h) ? H.filter((x) => x !== h) : H.concat([h]).sort((a, c) => a - c); if (H.length < 2) return; S.H = H; S.nowFrac = 1; custom(); })); }
  const set = new Set(S.H); box.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-pressed', String(set.has(+b.dataset.off))); });
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => {
  const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'tuple'; if (S.mode === m) return;
  S.mode = m; S.nowFrac = 0; custom();
}));
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.mode = p.mode; if (p.H) S.H = p.H.slice();
  S.preset = name; markPreset(); dirty = true; setCamPreset('iso');
  S.nowFrac = 0; if (!reduceMotion) { S.dir = 1; S.playing = true; setPlayUI(); }
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
  else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target && ev.target.tagName === 'INPUT')) { ev.preventDefault(); jumpTo(S.nowFrac + (ev.key === 'ArrowRight' ? 1 : -1) / 400); }
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
      S.nowFrac += S.dir * dtSec * S.speed / RUN_SECONDS;
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 2.2; }
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
window.PG_DEBUG = {
  pending: () => dirty || syncedKey !== `${S.mode}|${S.nowFrac}|${TRV.lang()}`,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, pr = progress(), o = { mode: M.mode, frac: S.nowFrac, nPrimes: NP, primesTail: Array.from(PRIMES.slice(NP - 5)), ...pr };
    if (M.mode === 'tuple') Object.assign(o, { H: M.H.slice(), k: M.k, D: M.D, admissible: M.admissible, blockers: M.blockers.slice(), rings: M.rings.map((r) => ({ p: r.p, occ: r.occ.slice(), full: r.full })), occTotal: M.occ.length, occHead: Array.from(M.occ.slice(0, 10)), occTail: Array.from(M.occ.slice(-3)), countAtX: M.countAt(pr.x), hist: M.hist.slice(), sing: M.sing, hlAtN: M.hlAt(N), hlAtX: M.hlAt(pr.x), sk: M.sk, featured: featuredCached() });
    if (M.mode === 'records') Object.assign(o, { records: M.records.map((r) => r.slice()), recordsAtX: M.recordsAt(pr.x).length });
    if (M.mode === 'sqrt') Object.assign(o, { aHead: Array.from(M.a.slice(1, 81)), aAt: M.a[pr.n], minRatio: M.minRatio, minAt: M.minAt, aSample: [10, 100, 1000, 10000, 100000, 1000000].map((n) => M.a[n]) });
    if (M.mode === 'square') Object.assign(o, { aHead: Array.from(M.a.slice(1, 78)), drops: M.drops.length, dropsHead: M.drops.slice(0, 20), aAt: M.a[pr.n] });
    if (M.mode === 'divisor') Object.assign(o, { mismCount: M.mism.length, mismHead: M.mism.slice(0, 20), term: M.term(pr.n), empty: M.empty(pr.n) });
    return o;
  },
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('forty'); S.playing = false; setPlayUI(); S.nowFrac = 0.8; $('now').value = S.nowFrac; };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('eight');
S.nowFrac = 0; S.playing = !reduceMotion; $('now').value = S.nowFrac;
setPlayUI();
requestAnimationFrame(frame);
})();
