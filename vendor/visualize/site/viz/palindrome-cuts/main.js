/* PALINDROME//CUTS · 回文切分 · 前缀最少能切成几个回文
   Prefix palindromic length P(n) of the period-doubling word (a → ab, b → aa; letter b at n iff v₂(n + 1) is odd) and of the
   Fibonacci word (a → ab, b → a; letter a at i iff the Zeckendorf form of i has no 1), computed for every prefix with a
   palindromic tree. Optimal cuts are drawn as arches; the signed-binary lower bound F(n) = weight(⌊(n + 1)/2⌋), the sparse
   addresses N(a, b), the 2-kernel of d(n) = P(n + 1) − P(n), and Frid's prefixes N(k) = F(6k + 3)/2 are checked on the page.
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
const MODES = ['cut', 'pd', 'kernel', 'fib'];
const NCUT = 256, NPD = 299691, NFIB = 100000, EMAX = 9, KWIN = 64;
const RUN = { cut: 24, pd: 20, kernel: 14, fib: 20 };
const PHI = (1 + Math.sqrt(5)) / 2, SLOPE = 1 / (3 * Math.log(PHI));   // the derived limsup guide 1/(3 ln φ)
const LETTER = ['a', 'b'];

/* =====================================================================
   2. The two words (0 = a, 1 = b)
   ===================================================================== */
function pdWord(n) {   // b at position i exactly when n + 1 has an odd number of factors 2
  const w = new Uint8Array(n);
  for (let i = 0; i < n; i++) { let m = i + 1, v = 0; while ((m & 1) === 0) { m >>>= 1; v++; } w[i] = v & 1; }
  return w;
}
function fibWord(n) {   // a at position i exactly when the Zeckendorf representation of i does not use the term 1
  const F = [1, 2]; while (F[F.length - 1] <= n) F.push(F[F.length - 1] + F[F.length - 2]);
  const w = new Uint8Array(n);
  for (let i = 0; i < n; i++) { let r = i, usesOne = false; for (let k = F.length - 1; k >= 0 && r > 0; k--) if (F[k] <= r) { r -= F[k]; if (k === 0) usesOne = true; } w[i] = usesOne ? 1 : 0; }
  return w;
}

/* =====================================================================
   3. Palindromic tree: P(n) = min over palindromic suffixes S of P(n − |S|) + 1, with the best cut recorded
   ===================================================================== */
function eertree(w) {
  const n = w.length, cap = n + 3;
  const len = new Int32Array(cap), link = new Int32Array(cap), nx0 = new Int32Array(cap), nx1 = new Int32Array(cap);
  const P = new Int32Array(n + 1), cut = new Int32Array(n + 1), lastNode = new Int32Array(n + 1);
  len[0] = -1; len[1] = 0; let size = 2, last = 1; lastNode[0] = 1;
  for (let i = 0; i < n; i++) {
    const x = w[i]; let q = last;
    for (;;) { const j = i - 1 - len[q]; if (j >= 0 && w[j] === x) break; if (q === 0) break; q = link[q]; }
    let v = x ? nx1[q] : nx0[q];
    if (!v) {
      v = size++; len[v] = len[q] + 2;
      if (len[v] === 1) link[v] = 1;
      else { let t = link[q]; for (;;) { const j = i - 1 - len[t]; if (j >= 0 && w[j] === x) break; if (t === 0) break; t = link[t]; } link[v] = x ? nx1[t] : nx0[t]; }
      if (x) nx1[q] = v; else nx0[q] = v;
    }
    last = v; lastNode[i + 1] = v;
    let best = 1 << 30, bc = 0;
    for (let s = v; len[s] > 0; s = link[s]) { const c = P[i + 1 - len[s]] + 1; if (c < best) { best = c; bc = i + 1 - len[s]; } }
    P[i + 1] = best; cut[i + 1] = bc;
  }
  return { w, P, cut, lastNode, len, link, nodes: size };
}
const blocksOf = (E, n) => { const out = []; for (let e = n; e > 0; e = E.cut[e]) out.push([E.cut[e], e]); return out.reverse(); };   // [start, end) of each palindrome
const suffixesOf = (E, n) => { const out = []; for (let s = E.lastNode[n]; s > 1 && E.len[s] > 0; s = E.link[s]) out.push(E.len[s]); return n > 0 ? out : []; };

/* =====================================================================
   4. Signed binary weight, sparse addresses, Frid prefixes
   ===================================================================== */
function naf(m) {   // non-adjacent form, least significant digit first; its number of nonzero digits is the signed binary weight
  const d = []; while (m > 0) { if (m & 1) { const r = (m & 3) === 1 ? 1 : -1; d.push(r); m -= r; } else d.push(0); m /= 2; } return d;
}
const sweight = (m) => naf(m).filter((x) => x).length;
const Fbound = (n) => sweight(Math.floor((n + 1) / 2));
const sparseN = (a, b) => { let s = 0; for (let i = 0; i < a; i++) s += 2 ** (2 * b + 2 + 3 * i); for (let j = 0; j < b; j++) s += 2 ** (2 * j + 1); return s; };
const FAMILY = [[1, 1], [1, 3], [1, 5], [1, 7], [3, 5]].map(([a, b]) => ({ a, b, N: sparseN(a, b), value: b === 2 * a - 1 ? 3 * a : a + b, kind: b === 2 * a - 1 ? 'diag' : 'off' }));
const fibNum = (k) => { let a = 0, b = 1; for (let i = 0; i < k; i++) [a, b] = [b, a + b]; return a; };
const fridNumeral = (k) => '100'.repeat(2 * k - 1) + '101';
const numeralValue = (s) => { const W = [1, 2]; while (W.length < s.length) W.push(W[W.length - 1] + W[W.length - 2]); let v = 0; for (let i = 0; i < s.length; i++) if (s[s.length - 1 - i] === '1') v += W[i]; return v; };
const FRID = [1, 2, 3, 4].map((k) => ({ k, N: fibNum(6 * k + 3) / 2, numeral: fridNumeral(k) }));

/* =====================================================================
   5. Data, built once
   ===================================================================== */
const PDE = eertree(pdWord(NPD + 1)), FBE = eertree(fibWord(NFIB));
const WORDS = { pd: PDE, fib: FBE };
for (const f of FAMILY) f.P = PDE.P[f.N];
for (const f of FRID) { f.P = FBE.P[f.N]; f.numeralValue = numeralValue(f.numeral); }
const D = new Int8Array(NPD); for (let n = 0; n < NPD; n++) D[n] = PDE.P[n + 1] - PDE.P[n];
function kernelLevels(seq, W) {   // distinct subsequences n ↦ seq(2ᵉn + r) on the window n < W, cumulative over levels 0 … EMAX
  const seen = new Map(), counts = [], fresh = [], cls = [];
  for (let e = 0; e <= EMAX; e++) {
    const row = []; let nw = 0;
    for (let r = 0; r < 2 ** e; r++) { const key = Array.from({ length: W }, (_, n) => seq[2 ** e * n + r]).join(','); let id = seen.get(key); if (id === undefined) { id = seen.size; seen.set(key, id); nw++; } row.push(id); }
    counts.push(seen.size); fresh.push(nw); cls.push(row);
  }
  return { counts, fresh, cls };
}
const KD = kernelLevels(D, KWIN), KU = kernelLevels(PDE.w, KWIN);
const recordsOf = (E, n) => { const out = []; let cur = 0; for (let m = 1; m <= n; m++) if (E.P[m] > cur) { cur = E.P[m]; out.push([m, cur]); } return out; };
const REC = { pd: recordsOf(PDE, NPD), fib: recordsOf(FBE, NFIB) };
const excessCum = (() => { const c = [new Int32Array(NPD + 1), new Int32Array(NPD + 1), new Int32Array(NPD + 1)]; let mx = 0, first = -1; for (let n = 0; n <= NPD; n++) { const e = PDE.P[n] - Fbound(n); for (let k = 0; k < 3; k++) c[k][n] = (n ? c[k][n - 1] : 0) + (e === k ? 1 : 0); if (e > mx) { mx = e; first = n; } } return { c, max: mx, first }; })();

/* =====================================================================
   6. State and presets
   ===================================================================== */
const S = { mode: 'cut', word: 'pd', nowFrac: 0, playing: true, dir: 1, speed: 1, hold: 0, preset: 'pdcut' };
const fracOfN = (mode, n) => (mode === 'cut' ? (n - 1) / (NCUT - 1) : Math.log(n) / Math.log(mode === 'pd' ? NPD : NFIB));
const PRESETS = {
  pdcut: { mode: 'cut', word: 'pd', frac: 0, play: true,
    zh: '倍周期词 abaaabab…：前缀一个字母一个字母地加长，每一步重新求最少的回文切分。拱桥是最优切分的各块，平躺在后面的淡色弧是此刻以末字母结尾的全部回文后缀。',
    en: 'The period-doubling word abaaabab…: the prefix grows one letter at a time and the least palindromic cut is recomputed at each step. The arches are the blocks of an optimal cut; the faint arcs lying flat behind are all the palindromic suffixes ending at the last letter.' },
  fibcut: { mode: 'cut', word: 'fib', frac: 0, play: true,
    zh: '斐波那契词 abaababa…：同样逐个字母求最优回文切分。长为 17 的前缀需要 3 个回文——这是 Frid 前缀 k = 1。',
    en: 'The Fibonacci word abaababa…: the same letter-by-letter optimal palindromic cut. The prefix of length 17 needs 3 palindromes; it is Frid’s prefix for k = 1.' },
  lower: { mode: 'pd', n: 72, play: false,
    zh: 'n = 72：P(72) = 4，而带符号二进制下界 F(72) = 2（⌊73/2⌋ = 36 = 2⁵ + 2²）。这是 P − F 第一次等于 2；算到 3·10⁵ 也没有超过 2，但 P ≤ F + 2 是否总成立仍是开放问题。',
    en: 'n = 72: P(72) = 4 while the signed-binary lower bound is F(72) = 2 (⌊73/2⌋ = 36 = 2⁵ + 2²). This is the first time P − F equals 2; up to 3·10⁵ it never exceeds 2, but whether P ≤ F + 2 always holds is open.' },
  offdiag: { mode: 'pd', n: 4778, play: false,
    zh: '稀疏地址 N(1, 5) = 2¹² + 2 + 2³ + 2⁵ + 2⁷ + 2⁹ = 4778：冻结定理给出 P = a + b = 6。',
    en: 'The sparse address N(1, 5) = 2¹² + 2 + 2³ + 2⁵ + 2⁷ + 2⁹ = 4778: the frozen theorem gives P = a + b = 6.' },
  diag: { mode: 'pd', n: 299690, play: false,
    zh: '对角地址 N(3, 5) = 299 690：冻结定理给出 P = 3a = 9。这些精确值让 2-核的秩无界，猜想 17 由此得证。',
    en: 'The diagonal address N(3, 5) = 299 690: the frozen theorem gives P = 3a = 9. Exact values like these make the rank of the 2-kernel unbounded, which proves Conjecture 17.' },
  kernel: { mode: 'kernel', frac: 0, play: true,
    zh: '把差分 d(n) = P(n + 1) − P(n) 按二进制地址拆成子序列 d(2ᵉn + r)。每深一层，新的子序列不断出现（在 64 项的窗口里数）；倍周期词本身只有 4 种。无穷多是冻结定理证明的，有限窗口里的计数只是旁证。',
    en: 'Split the differences d(n) = P(n + 1) − P(n) by binary address into the subsequences d(2ᵉn + r). Each level down, new subsequences keep appearing (counted on a 64-term window), while the period-doubling word itself has only 4. That there are infinitely many is the frozen theorem; counts on a finite window are only circumstantial.' },
  frid: { mode: 'fib', n: 98209, play: false,
    zh: 'Frid 前缀 k = 4：长 N(4) = F₂₇/2 = 98 209，斐波那契记数是 (100)⁷101。冻结定理：恰好需要 2k + 1 = 9 个回文。',
    en: 'Frid’s prefix for k = 4: length N(4) = F₂₇/2 = 98 209, written (100)⁷101 in Fibonacci numeration. The frozen theorem: it needs exactly 2k + 1 = 9 palindromes.' },
  fridsweep: { mode: 'fib', frac: 0, play: true,
    zh: '把斐波那契词的前缀长度从 1 扫到 10⁵（对数刻度）：琥珀点是 Frid 前缀 N(k)，回文长度 2k + 1；虚线是推出的 limsup 参考斜率 1/(3 ln φ)（没有形式化）。',
    en: 'Sweep the prefix length of the Fibonacci word from 1 to 10⁵ (log scale): the amber dots are Frid’s prefixes N(k) with palindromic length 2k + 1; the dashed line is the derived limsup guide slope 1/(3 ln φ) (not formalized).' }
};

/* =====================================================================
   7. The model
   ===================================================================== */
let MODEL = null, dirty = true;
function build() { MODEL = { mode: S.mode, word: S.mode === 'pd' || S.mode === 'kernel' ? 'pd' : S.mode === 'fib' ? 'fib' : S.word }; }
function progress() {
  const M = MODEL, f = Math.min(1, Math.max(0, S.nowFrac));
  if (M.mode === 'kernel') return { e: Math.round(f * EMAX) };
  const n = M.mode === 'cut' ? 1 + Math.round(f * (NCUT - 1)) : Math.max(1, Math.min(M.mode === 'pd' ? NPD : NFIB, Math.round(Math.exp(f * Math.log(M.mode === 'pd' ? NPD : NFIB)))));
  const E = WORDS[M.word];
  return { n, P: E.P[n], F: M.word === 'pd' ? Fbound(n) : null, blocks: blocksOf(E, n), suffixes: suffixesOf(E, n) };
}

/* =====================================================================
   8. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');
const num = (v, d = 4) => (v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(d));
const fmtInt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const prefixText = (E, n, max = 48) => Array.from(E.w.subarray(0, Math.min(n, max)), (x) => LETTER[x]).join('') + (n > max ? '…' : '');
const nafText = (m) => { const t = naf(m).map((x, i) => [x, i]).filter(([x]) => x).reverse(); if (!t.length) return '0'; return t.map(([x, i], k) => `${k ? (x > 0 ? ' + ' : ' − ') : x > 0 ? '' : '−'}2${sup(i)}`).join(''); };
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'; const sup = (k) => String(k).split('').map((c) => SUP[+c]).join('');
const BLOCK_COLS = [COL.amber, COL.green || [0.3, 1, 0.6], COL.cyan, COL.magenta, [0.62, 0.55, 1], [1, 0.5, 0.35]];
const BLOCK_CSS = [AM, OK, CY, MG, '#9d8cff', '#ff8059'];

/* =====================================================================
   9. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts;
const LINES_MAX = 40000, PTS_MAX = 4000;
const CAMS = { iso: [0.55, 1.12, 15], front: [0.0001, 1.5, 15], top: [0.0001, 0.06, 15] };
const cam = { theta: 0.55, phi: 1.12, r: 15, tTheta: 0.55, tPhi: 1.12, tR: 15 };
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
/* layouts: the cut mode lays letters on a line; the long modes on a spiral with one turn per doubling of the position */
const lineX = (i, n) => { const s = 10.4 / Math.max(n, 24); return -s * n / 2 + s * (i + 0.5); };
const spiral = (t) => { const u = Math.log2(1 + t), r = 0.5 + 0.27 * u, a = Math.PI * u; return [r * Math.cos(a), -1.2, r * Math.sin(a)]; };
function updateGL() {
  const M = MODEL, pr = progress();
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; Pp[3 * v] = a[0]; Pp[3 * v + 1] = a[1]; Pp[3 * v + 2] = a[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; Pp[3 * v] = b[0]; Pp[3 * v + 1] = b[1]; Pp[3 * v + 2] = b[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  if (M.mode === 'cut') {
    const E = WORDS[M.word], n = pr.n, s = 10.4 / Math.max(n, 24);
    seg([lineX(0, n) - s / 2, 0, 0], [lineX(n - 1, n) + s / 2, 0, 0], COL.gray, 0.4);
    for (let i = 0; i < n; i++) dot([lineX(i, n), 0, 0], E.w[i] ? COL.magenta : COL.cyan, 1, 0.75);
    pr.blocks.forEach(([a, b], k) => {   // an arch over each block, in the upright plane
      const x0 = lineX(a, n) - s / 2, x1 = lineX(b - 1, n) + s / 2, R = (x1 - x0) / 2, c = (x0 + x1) / 2, col = BLOCK_COLS[k % BLOCK_COLS.length];
      for (let q = 0; q < 48; q++) { const t1 = Math.PI * q / 48, t2 = Math.PI * (q + 1) / 48; seg([c - R * Math.cos(t1), R * Math.sin(t1) * 0.9, 0], [c - R * Math.cos(t2), R * Math.sin(t2) * 0.9, 0], col, 1); }
    });
    pr.suffixes.forEach((L) => {   // every palindromic suffix ending at n, lying flat behind the line
      const x0 = lineX(n - L, n) - s / 2, x1 = lineX(n - 1, n) + s / 2, R = (x1 - x0) / 2, c = (x0 + x1) / 2;
      for (let q = 0; q < 32; q++) { const t1 = Math.PI * q / 32, t2 = Math.PI * (q + 1) / 32; seg([c - R * Math.cos(t1), 0, -R * Math.sin(t1) * 0.6], [c - R * Math.cos(t2), 0, -R * Math.sin(t2) * 0.6], COL.white || [1, 1, 1], 0.22); }
    });
  } else if (M.mode === 'pd' || M.mode === 'fib') {
    const E = WORDS[M.word], n = pr.n, steps = 600;
    for (let q = 0; q < steps; q++) seg(spiral(n * q / steps), spiral(n * (q + 1) / steps), COL.gray, 0.32);
    for (let i = 0; i < Math.min(n, 1500); i++) dot(spiral(i + 0.5), E.w[i] ? COL.magenta : COL.cyan, 0.85, 0.42);
    for (let k = 1; 2 ** k <= n; k++) { const p = spiral(2 ** k - 1); seg([p[0], p[1] - 0.08, p[2]], [p[0], p[1] + 0.08, p[2]], COL.gray, 0.6); }
    pr.blocks.forEach(([a, b], k) => {   // an arch from the start to the end of each block, higher for longer palindromes
      const col = BLOCK_COLS[k % BLOCK_COLS.length], h = 0.3 + 0.2 * Math.log2(1 + b - a), m = 40, p0 = spiral(a), p1 = spiral(b);
      for (let q = 0; q < m; q++) { const u1 = q / m, u2 = (q + 1) / m, L = (u) => [p0[0] + (p1[0] - p0[0]) * u, p0[1] + h * Math.sin(Math.PI * u), p0[2] + (p1[2] - p0[2]) * u]; seg(L(u1), L(u2), col, 1); }
      dot(p0, col, 1, 0.8); dot(p1, col, 1, 0.9);
    });
    const marks = M.mode === 'pd' ? FAMILY.map((f) => f.N) : FRID.map((f) => f.N);
    for (const N of marks) if (N <= n) dot(spiral(N), COL.amber, 1, 1.4);
  } else {
    const e = pr.e, Y = (k) => 3.4 - 0.78 * k, X = (k, r) => -5.4 + 10.8 * (r + 0.5) / 2 ** k, seen = new Set();
    for (let k = 0; k <= e; k++) for (let r = 0; r < 2 ** k; r++) {
      const id = KD.cls[k][r], isNew = !seen.has(id); seen.add(id);
      if (k > 0) seg([X(k - 1, r % 2 ** (k - 1)), Y(k - 1), 0], [X(k, r), Y(k), 0], COL.gray, k === e ? 0.35 : 0.18);
      dot([X(k, r), Y(k), 0], isNew ? COL.amber : COL.cyan, isNew ? 1 : 0.45, k >= 8 ? 0.45 : 0.8);
    }
  }
  lines.geometry.setDrawRange(0, v); Lb.position.needsUpdate = true; Lb.color.needsUpdate = true;
  for (let i = np; i < PTS_MAX; i++) PT.aAlpha.array[i] = 0;
  for (const a of [PT.position, PT.aColor, PT.aAlpha, PT.aSize]) a.needsUpdate = true;
  pts.material.uniforms.uScale.value = 60 * renderer.getPixelRatio() * (stage.clientHeight / 600);
}

/* =====================================================================
   10. Camera
   ===================================================================== */
let camName = 'iso';
function updateCamera(dtSec) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.001, dtSec);
  cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.r += (cam.tR - cam.r) * k;
  const sp = Math.sin(cam.phi), r = cam.r * (camera.aspect < 1.2 ? 1.5 : 1);
  camera.position.set(r * sp * Math.sin(cam.theta), 0.8 + r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0, 0.8, 0);
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
   11. Tags
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
  if (M.mode === 'cut') {
    const n = pr.n, s = 10.4 / Math.max(n, 24);
    pr.blocks.forEach(([a, b], i) => { if (pr.blocks.length <= 12) { const x0 = lineX(a, n) - s / 2, x1 = lineX(b - 1, n) + s / 2; put(String(b - a), [(x0 + x1) / 2, (x1 - x0) / 2 * 0.9 + 0.25, 0], i === 0 ? 'hot' : ''); } });
    put(`n = ${n}`, [lineX(n - 1, n) + 0.4, -0.45, 0], 'cy');
  } else if (M.mode === 'pd' || M.mode === 'fib') {
    const list = M.mode === 'pd' ? FAMILY.map((f) => [f.N, `N(${f.a}, ${f.b})`]) : FRID.map((f) => [f.N, `N(${f.k})`]);
    for (const [N, label] of list) if (N <= pr.n) { const p = spiral(N); put(label, [p[0], p[1] + 0.4, p[2]], 'hot'); }
    const pe = spiral(pr.n); put(`n = ${fmtInt(pr.n)}`, [pe[0], pe[1] - 0.45, pe[2]], 'cy');
  } else {
    for (let e = 0; e <= pr.e; e++) put(`e = ${e}`, [-6.1, 3.4 - 0.78 * e, 0], e === pr.e ? 'hot' : '');
  }
  for (let i = k; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}

/* =====================================================================
   12. 2D panels
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
const vline = (ctx, x, pt, ih, col, dpr) => { ctx.strokeStyle = col; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + ih); ctx.stroke(); ctx.setLineDash([]); };
function envelope(F, E, nMax, n, withBound, marks) {   // P (cyan band) and F (amber) per pixel column on a log axis
  const { ctx, dpr, pl, pt, iw, ih } = F, top = 11, LN = Math.log(nMax), X = (m) => pl + Math.log(m) / LN * iw, Y = (v) => pt + ih - v / top * ih;
  yTicks(ctx, dpr, pl, Y, [0, 3, 6, 9], String); xTicks(ctx, dpr, pt, ih, X, [1, 10, 100, 1000, 1e4, 1e5].filter((m) => m <= nMax), (m) => (m >= 1000 ? `10${sup(Math.round(Math.log10(m)))}` : String(m)));
  const cols = Math.max(2, Math.floor(iw / dpr));
  for (let c = 0; c < cols; c++) {
    const m0 = Math.max(1, Math.floor(Math.exp(LN * c / cols))), m1 = Math.min(nMax, Math.max(m0, Math.floor(Math.exp(LN * (c + 1) / cols)))); if (m0 > n) break;
    let lo = 99, hi = 0, flo = 99, fhi = 0; for (let m = m0; m <= Math.min(m1, n); m++) { lo = Math.min(lo, E.P[m]); hi = Math.max(hi, E.P[m]); if (withBound) { const f = Fbound(m); flo = Math.min(flo, f); fhi = Math.max(fhi, f); } }
    const x = pl + c / cols * iw;
    ctx.fillStyle = CY; ctx.globalAlpha = 0.75; ctx.fillRect(x, Y(hi) - dpr, Math.max(dpr, iw / cols), Y(lo) - Y(hi) + 2 * dpr);
    if (withBound) { ctx.fillStyle = AM; ctx.globalAlpha = 0.6; ctx.fillRect(x, Y(fhi) - dpr * 0.5, Math.max(dpr, iw / cols), Y(flo) - Y(fhi) + dpr); }
  }
  ctx.globalAlpha = 1;
  for (const [m, v] of marks) if (m <= n) { ctx.fillStyle = MG; ctx.beginPath(); ctx.moveTo(X(m), Y(v) - 5 * dpr); ctx.lineTo(X(m) + 4 * dpr, Y(v)); ctx.lineTo(X(m), Y(v) + 5 * dpr); ctx.lineTo(X(m) - 4 * dpr, Y(v)); ctx.closePath(); ctx.fill(); }
  vline(ctx, X(n), pt, ih, AM, dpr);
  return { X, Y };
}
function drawMain() {
  const M = MODEL, F = frame2d(cv1); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  if (M.mode === 'cut') {
    const E = WORDS[M.word], top = Math.max(...E.P.subarray(1, NCUT + 1)) + 1, X = (m) => pl + (m - 0.5) / NCUT * iw, Y = (v) => pt + ih - v / top * ih;
    yTicks(ctx, dpr, pl, Y, Array.from({ length: top + 1 }, (_, i) => i).filter((v) => v % 2 === 0 || top < 8), String); xTicks(ctx, dpr, pt, ih, X, [1, 64, 128, 192, 256], String);
    for (let m = 1; m <= NCUT; m++) { ctx.fillStyle = m <= pr.n ? CY : FAINT; ctx.globalAlpha = m <= pr.n ? 0.85 : 0.35; ctx.fillRect(X(m) - iw / NCUT * 0.4, Y(E.P[m]), iw / NCUT * 0.8, pt + ih - Y(E.P[m])); }
    ctx.globalAlpha = 1;
    if (M.word === 'pd') { ctx.strokeStyle = AM; ctx.lineWidth = 1.4 * dpr; ctx.beginPath(); for (let m = 1; m <= NCUT; m++) { const y = Y(Fbound(m)); if (m === 1) ctx.moveTo(X(m), y); else { ctx.lineTo(X(m) - iw / NCUT / 2, y); } ctx.lineTo(X(m) + iw / NCUT / 2, y); } ctx.stroke(); ctx.lineWidth = 1; }
    vline(ctx, X(pr.n), pt, ih, AM, dpr);
    $('c1Title').textContent = M.word === 'pd' ? T('倍周期词：P(n)（青柱）与带符号二进制下界 F(n)（琥珀线），n ≤ 256', 'PERIOD DOUBLING: P(n) (CYAN BARS) AND THE SIGNED-BINARY LOWER BOUND F(n) (AMBER LINE), n ≤ 256') : T('斐波那契词：P(n)（青柱），n ≤ 256', 'FIBONACCI: P(n) (CYAN BARS), n ≤ 256');
    $('c1Meta').textContent = T(`n = ${pr.n} 时 P = ${pr.P}`, `P = ${pr.P} at n = ${pr.n}`);
  } else if (M.mode === 'pd') {
    envelope(F, PDE, NPD, pr.n, true, FAMILY.map((f) => [f.N, f.P]));
    $('c1Title').textContent = T('倍周期词，n 到 3·10⁵（对数刻度）：P(n)（青）≥ F(n)（琥珀）；品红菱形 = 稀疏地址 N(a, b) 上的冻结精确值', 'PERIOD DOUBLING, n UP TO 3·10⁵ (LOG SCALE): P(n) (CYAN) ≥ F(n) (AMBER); MAGENTA DIAMONDS = FROZEN EXACT VALUES AT THE SPARSE ADDRESSES N(a, b)');
    $('c1Meta').textContent = T('每一像素列画该段的最小到最大值', 'each pixel column spans its min to max');
  } else if (M.mode === 'kernel') {
    const X = (e) => pl + e / EMAX * iw, top = Math.max(...KD.counts) * 1.08, Y = (v) => pt + ih - v / top * ih;
    yTicks(ctx, dpr, pl, Y, [0, 100, 200, 300, 400, 500].filter((v) => v <= top), String); xTicks(ctx, dpr, pt, ih, X, Array.from({ length: EMAX + 1 }, (_, e) => e), (e) => `e=${e}`);
    for (const [K, col] of [[KD, CY], [KU, MG]]) { ctx.strokeStyle = col; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); K.counts.forEach((c, e) => { if (e) ctx.lineTo(X(e), Y(c)); else ctx.moveTo(X(e), Y(c)); }); ctx.stroke(); ctx.fillStyle = col; K.counts.forEach((c, e) => { if (e <= pr.e) { ctx.beginPath(); ctx.arc(X(e), Y(c), 2.6 * dpr, 0, 2 * Math.PI); ctx.fill(); } }); }
    ctx.lineWidth = 1; vline(ctx, X(pr.e), pt, ih, AM, dpr);
    $('c1Title').textContent = T(`不同子序列的个数（层 0 到 e 累计，${KWIN} 项窗口）：差分 d（青）不停增长，倍周期词本身（品红）停在 4`, `DISTINCT SUBSEQUENCES (LEVELS 0 TO e, ${KWIN}-TERM WINDOW): THE DIFFERENCES d (CYAN) KEEP GROWING, THE PERIOD-DOUBLING WORD ITSELF (MAGENTA) STAYS AT 4`);
    $('c1Meta').textContent = T('有限窗口，旁证', 'finite window, circumstantial');
  } else {
    const { X, Y } = envelope(F, FBE, NFIB, pr.n, false, FRID.map((f) => [f.N, f.P]));
    ctx.strokeStyle = INK; ctx.globalAlpha = 0.55; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); for (let i = 0; i <= 100; i++) { const m = Math.exp(Math.log(NFIB) * i / 100); if (i) ctx.lineTo(X(m), Y(SLOPE * Math.log(m))); else ctx.moveTo(X(m), Y(SLOPE * Math.log(m))); } ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    $('c1Title').textContent = T('斐波那契词，n 到 10⁵（对数刻度）：P(n)（青）；品红菱形 = Frid 前缀 N(k)，冻结值 2k + 1；虚线 = 推出的参考斜率 1/(3 ln φ)', 'FIBONACCI, n UP TO 10⁵ (LOG SCALE): P(n) (CYAN); MAGENTA DIAMONDS = FRID’S PREFIXES N(k) WITH FROZEN VALUE 2k + 1; DASHES = THE DERIVED GUIDE SLOPE 1/(3 ln φ)');
    $('c1Meta').textContent = T('参考线没有形式化', 'the guide is not formalized');
  }
}
function drawSide() {
  const M = MODEL, F = frame2d(cv2, M.mode === 'pd' ? 46 : 12); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, pr = progress();
  if (M.mode === 'cut') {
    const E = WORDS[M.word], n = pr.n, cw = iw / Math.max(n, 32), rowY = pt + ih * 0.12, rh = Math.min(ih * 0.3, 18 * dpr);
    for (let i = 0; i < n; i++) { ctx.fillStyle = E.w[i] ? MG : CY; ctx.globalAlpha = 0.8; ctx.fillRect(pl + i * cw + cw * 0.08, rowY, cw * 0.84, rh); if (cw > 9 * dpr) { ctx.globalAlpha = 1; ctx.fillStyle = '#02040a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(LETTER[E.w[i]], pl + (i + 0.5) * cw, rowY + rh / 2); } }
    ctx.globalAlpha = 1;
    pr.blocks.forEach(([a, b], k) => { const y = rowY + rh + 8 * dpr; ctx.fillStyle = BLOCK_CSS[k % BLOCK_CSS.length]; ctx.fillRect(pl + a * cw + dpr, y, (b - a) * cw - 2 * dpr, 6 * dpr); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; if ((b - a) * cw > 14 * dpr) ctx.fillText(String(b - a), pl + (a + b) / 2 * cw, y + 9 * dpr); });
    const sy = rowY + rh + 34 * dpr; ctx.fillStyle = DIM; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    pr.suffixes.slice(0, 6).forEach((L, k) => { const y = sy + k * 7 * dpr; if (y > pt + ih) return; ctx.fillStyle = INK; ctx.globalAlpha = 0.35; ctx.fillRect(pl + (n - L) * cw + dpr, y, L * cw - 2 * dpr, 3 * dpr); });
    ctx.globalAlpha = 1;
    $('c2Title').textContent = T(`前缀（a 青，b 品红）、最优切分（彩条，数字 = 块长）、以第 ${n} 个字母结尾的回文后缀（灰条）`, `THE PREFIX (a CYAN, b MAGENTA), AN OPTIMAL CUT (COLOURED BARS, NUMBERS = BLOCK LENGTHS), PALINDROMIC SUFFIXES ENDING AT LETTER ${n} (GREY)`);
    $('c2Meta').textContent = '';
  } else if (M.mode === 'pd') {
    const c = [0, 1, 2].map((k) => excessCum.c[k][pr.n]), tot = c.reduce((a, b) => a + b, 0), bw = iw / 3, Y = (v) => pt + ih - v / tot * ih * 0.92;
    c.forEach((v, k) => { ctx.fillStyle = [CY, OK, AM][k]; ctx.globalAlpha = 0.85; ctx.fillRect(pl + k * bw + bw * 0.2, Y(v), bw * 0.6, pt + ih - Y(v)); ctx.globalAlpha = 1; ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(fmtInt(v), pl + (k + 0.5) * bw, Y(v) - 2 * dpr); });
    xTicks(ctx, dpr, pt, ih, (k) => pl + (k + 0.5) * bw, [0, 1, 2], (k) => `P − F = ${k}`);
    $('c2Title').textContent = T(`0 ≤ m ≤ ${fmtInt(pr.n)} 中 P(m) − F(m) 各取值出现的次数`, `HOW OFTEN P(m) − F(m) TAKES EACH VALUE FOR 0 ≤ m ≤ ${fmtInt(pr.n)}`); $('c2Meta').textContent = T('从没超过 2（有限范围）', 'never above 2 (finite range)');
  } else if (M.mode === 'kernel') {
    const rows = 2 ** pr.e, rh = ih / rows, cw = iw / KWIN, img = ctx.createImageData(Math.max(1, Math.round(iw)), Math.max(1, Math.round(ih)));
    const colOf = (v) => (v > 0 ? [0, 229, 255] : v < 0 ? [255, 61, 154] : [26, 40, 54]);
    for (let y = 0; y < img.height; y++) { const r = Math.min(rows - 1, Math.floor(y / img.height * rows)); for (let x = 0; x < img.width; x++) { const nIdx = Math.min(KWIN - 1, Math.floor(x / img.width * KWIN)), v = D[2 ** pr.e * nIdx + r], c = colOf(v), o = 4 * (y * img.width + x); img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255; } }
    ctx.putImageData(img, Math.round(pl), Math.round(pt));
    $('c2Title').textContent = T(`第 e = ${pr.e} 层的 ${rows} 条子序列 d(2ᵉn + r)，n < ${KWIN}（青 +1，品红 −1，暗 0）`, `THE ${rows} SUBSEQUENCES d(2ᵉn + r) AT LEVEL e = ${pr.e}, n < ${KWIN} (CYAN +1, MAGENTA −1, DARK 0)`); $('c2Meta').textContent = '';
  } else {
    const rows = FRID.length + 1, rh = ih / rows;
    const head = ['k', 'N(k)', T('斐波那契记数', 'Fibonacci numeral'), 'P', '2k+1'], xs = [0.02, 0.08, 0.27, 0.74, 0.86];
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    head.forEach((h, i) => { ctx.fillStyle = DIM; ctx.fillText(h, pl + xs[i] * iw, pt + rh / 2); });
    FRID.forEach((f, r) => { const y = pt + (r + 1.5) * rh, on = f.N <= pr.n; ctx.globalAlpha = on ? 1 : 0.4; [String(f.k), fmtInt(f.N), f.numeral.length > 15 ? f.numeral.slice(0, 13) + '…' : f.numeral, String(f.P), String(2 * f.k + 1)].forEach((s, i) => { ctx.fillStyle = i === 3 ? (f.P === 2 * f.k + 1 ? OK : MG) : i === 1 ? AM : INK; ctx.fillText(s, pl + xs[i] * iw, y); }); });
    ctx.globalAlpha = 1;
    $('c2Title').textContent = T('Frid 前缀：长度 N(k) = F₆ₖ₊₃/2、斐波那契记数、页面算出的回文长度 P 与冻结值', 'FRID’S PREFIXES: LENGTH N(k) = F₆ₖ₊₃/2, FIBONACCI NUMERAL, PALINDROMIC LENGTH P COMPUTED ON THE PAGE AND THE FROZEN VALUE'); $('c2Meta').textContent = '';
  }
}

/* =====================================================================
   13. Readouts and controls
   ===================================================================== */
let syncedKey = '', toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function setRo(rows) { rows.forEach(([l, v], i) => { $(`ro${i + 1}L`).textContent = l; $(`ro${i + 1}`).textContent = v; }); }
function pill(id, label, value) { $(id).innerHTML = `${label} <strong>${value}</strong>`; }
const wordName = (w) => (w === 'pd' ? T('倍周期词', 'period doubling') : T('斐波那契词', 'Fibonacci'));
const blockText = (blocks) => (blocks.length > 12 ? blocks.slice(0, 12).map(([a, b]) => b - a).join(' + ') + ' + …' : blocks.map(([a, b]) => b - a).join(' + '));
function readouts() {
  const M = MODEL, pr = progress();
  if (M.mode === 'cut') {
    const E = WORDS[M.word];
    setRo([[T('词 · 前缀长度 n', 'Word · prefix length n'), `${wordName(M.word)} · ${pr.n}`], [M.word === 'pd' ? T('P(n) · 下界 F(n)', 'P(n) · lower bound F(n)') : 'P(n)', M.word === 'pd' ? `${pr.P} · ${pr.F}` : String(pr.P)],
      [T('最优切分的块长', 'Block lengths of an optimal cut'), blockText(pr.blocks)], [T('以第 n 个字母结尾的回文后缀长度', 'Lengths of the palindromic suffixes ending at letter n'), pr.suffixes.join(', ')],
      [T('前缀', 'Prefix'), prefixText(E, pr.n)]]);
    pill('pillA', T('词', 'WORD'), M.word === 'pd' ? 'PD' : 'FIB'); pill('pillB', 'n', pr.n); pill('pillC', 'P(n)', pr.P); pill('pillD', T('后缀', 'SUFFIXES'), pr.suffixes.length);
    $('roNote').innerHTML = T('每加一个字母，只要看以它结尾的回文后缀：P(n) = min P(n − |回文|) + 1。回文树把这些后缀串成一条链。', 'Each new letter only needs the palindromic suffixes ending at it: P(n) = min P(n − |palindrome|) + 1. The palindromic tree chains these suffixes together.');
  } else if (M.mode === 'pd') {
    const m = Math.floor((pr.n + 1) / 2), fam = FAMILY.filter((f) => f.N <= pr.n).pop();
    setRo([[T('前缀长度 n', 'Prefix length n'), fmtInt(pr.n)], ['P(n)', String(pr.P)], [T('F(n)：⌊(n + 1)/2⌋ 的带符号二进制', 'F(n): ⌊(n + 1)/2⌋ in signed binary'), `${pr.F} · ${fmtInt(m)} = ${nafText(m)}`],
      [T('P − F · 范围内最大值（第一次出现）', 'P − F · largest on the range (first at)'), `${pr.P - pr.F} · ${excessCum.max} (n = ${excessCum.first})`],
      [T('最近的稀疏地址 · 冻结值 · 页面算出', 'Nearest sparse address · frozen value · computed'), fam ? `N(${fam.a}, ${fam.b}) = ${fmtInt(fam.N)} · ${fam.kind === 'diag' ? '3a' : 'a + b'} = ${fam.value} · ${fam.P}` : '—']]);
    pill('pillA', 'n', fmtInt(pr.n)); pill('pillB', 'P', pr.P); pill('pillC', 'F', pr.F); pill('pillD', 'P − F', pr.P - pr.F);
    $('roNote').innerHTML = FAMILY.some((f) => f.N === pr.n) ? T(`n 正是稀疏地址：冻结定理给出 P(n) = ${FAMILY.find((f) => f.N === pr.n).value}，页面的计算与之一致。`, `n is a sparse address: the frozen theorem gives P(n) = ${FAMILY.find((f) => f.N === pr.n).value}, and the page’s computation agrees.`) : T('下界 F(n) 是冻结定理；P − F ≤ 2 只是这个有限范围里的读数，对所有 n 是否成立仍是开放问题。', 'The lower bound F(n) is a frozen theorem; P − F ≤ 2 is only a reading on this finite range, and whether it holds for every n is open.');
  } else if (M.mode === 'kernel') {
    setRo([[T('层 e · 本层子序列数 2ᵉ', 'Level e · subsequences at this level 2ᵉ'), `${pr.e} · ${2 ** pr.e}`], [T('d 的不同子序列（层 0 到 e）', 'Distinct subsequences of d (levels 0 to e)'), String(KD.counts[pr.e])],
      [T('倍周期词本身的不同子序列', 'Distinct subsequences of the word itself'), String(KU.counts[pr.e])], [T('本层新出现的', 'New at this level'), String(KD.fresh[pr.e])],
      [T('d(n) 的取值 · 窗口', 'Values of d(n) · window'), `−1, 0, 1 · n < ${KWIN}`]]);
    pill('pillA', 'e', pr.e); pill('pillB', 'd', KD.counts[pr.e]); pill('pillC', 'u', KU.counts[pr.e]); pill('pillD', T('新', 'NEW'), KD.fresh[pr.e]);
    $('roNote').innerHTML = T('有限窗口里的计数只能显示“越来越多”，证明不了无穷多；无穷多来自冻结定理：稀疏地址上的精确值让 P 的 2-核张成的空间维数无界。', 'Counts on a finite window can only show “more and more”, not infinitely many; infinitude is the frozen theorem: the exact values at the sparse addresses make the span of the 2-kernel of P unbounded in dimension.');
  } else {
    const fr = FRID.filter((f) => f.N <= pr.n).pop(), rec = REC.fib.find(([m, v]) => v === pr.P);
    setRo([[T('前缀长度 n', 'Prefix length n'), fmtInt(pr.n)], ['P(n)', String(pr.P)],
      [T('最近的 Frid 前缀 N(k) · 冻结值 2k + 1 · 页面算出', 'Nearest Frid prefix N(k) · frozen 2k + 1 · computed'), fr ? `N(${fr.k}) = ${fmtInt(fr.N)} · ${2 * fr.k + 1} · ${fr.P}` : '—'],
      [T(`P 第一次等于 ${pr.P} 的位置`, `First n with P = ${pr.P}`), rec ? fmtInt(rec[0]) : '—'], [T('P(n)/ln n · 参考 1/(3 ln φ)', 'P(n)/ln n · guide 1/(3 ln φ)'), `${num(pr.n > 1 ? pr.P / Math.log(pr.n) : NaN, 4)} · ${num(SLOPE, 4)}`]]);
    pill('pillA', 'n', fmtInt(pr.n)); pill('pillB', 'P', pr.P); pill('pillC', 'k', fr ? fr.k : '—'); pill('pillD', '2k+1', fr ? 2 * fr.k + 1 : '—');
    $('roNote').innerHTML = FRID.some((f) => f.N === pr.n) ? T(`n = N(${FRID.find((f) => f.N === pr.n).k})：冻结定理说这个前缀恰好需要 ${pr.P} 个回文，页面的计算与之一致。`, `n = N(${FRID.find((f) => f.N === pr.n).k}): the frozen theorem says this prefix needs exactly ${pr.P} palindromes, and the page’s computation agrees.`) : T('在这个范围里，回文长度 7 与 9 第一次出现恰好在 Frid 前缀 N(3) 与 N(4)；这是有限范围的读数，任意前缀的精确公式仍未知。', 'On this range, palindromic lengths 7 and 9 first appear exactly at Frid’s prefixes N(3) and N(4); this is a reading on a finite range, and an exact formula for every prefix is unknown.');
  }
}
function syncOutputs() {
  if (dirty) { build(); dirty = false; syncedKey = ''; toasted = false; }
  const M = MODEL, key = `${S.mode}|${S.word}|${S.nowFrac}|${TRV.lang()}`;
  if (key === syncedKey) return; syncedKey = key;
  const pr = progress();
  readouts();
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  $('wordField').hidden = S.mode !== 'cut';
  document.querySelectorAll('#wordChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.word === S.word)));
  $('presetNote').innerHTML = S.preset ? T(PRESETS[S.preset].zh, PRESETS[S.preset].en) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = ({
    cut: T('时间轴 = 前缀长度 n，从 1 到 256。', 'The time axis is the prefix length n, from 1 to 256.'),
    pd: T('时间轴 = 前缀长度 n，从 1 到 299 691（对数刻度）。三维视图把位置排成螺线，每转一圈位置翻倍。', 'The time axis is the prefix length n, from 1 to 299 691 (log scale). The 3D view lays positions on a spiral that turns once per doubling.'),
    kernel: T('时间轴 = 二叉地址的层数 e，从 0 到 9。节点 (e, r) 是子序列 d(2ᵉn + r)；琥珀 = 第一次出现，青 = 与更早的某条相同。', 'The time axis is the level e of the binary address, from 0 to 9. Node (e, r) is the subsequence d(2ᵉn + r); amber = first appearance, cyan = equal to an earlier one.'),
    fib: T('时间轴 = 前缀长度 n，从 1 到 10⁵（对数刻度）。', 'The time axis is the prefix length n, from 1 to 10⁵ (log scale).')
  })[S.mode];
  $('litNote').innerHTML = T(`页面算出：倍周期词前 ${fmtInt(NPD)} 个前缀的 P(n)，斐波那契词前 ${fmtInt(NFIB)} 个；倍周期词在这个范围里有 ${fmtInt(PDE.nodes - 2)} 个不同的回文。`, `Computed on the page: P(n) for the first ${fmtInt(NPD)} prefixes of the period-doubling word and the first ${fmtInt(NFIB)} of the Fibonacci word; the period-doubling word has ${fmtInt(PDE.nodes - 2)} distinct palindromes on this range.`);
  $('clock').innerHTML = M.mode === 'kernel' ? `e ${pr.e}` : `n ${fmtInt(pr.n)}`;
  $('hudBig').textContent = ({ cut: () => T(`${wordName(M.word)} · n = ${pr.n} · P = ${pr.P}`, `${wordName(M.word)} · n = ${pr.n} · P = ${pr.P}`), pd: () => T(`倍周期词 · n = ${fmtInt(pr.n)} · P = ${pr.P}`, `period doubling · n = ${fmtInt(pr.n)} · P = ${pr.P}`),
    kernel: () => T(`差分的 2-核 · e = ${pr.e}`, `2-kernel of the differences · e = ${pr.e}`), fib: () => T(`斐波那契词 · n = ${fmtInt(pr.n)} · P = ${pr.P}`, `Fibonacci · n = ${fmtInt(pr.n)} · P = ${pr.P}`) })[M.mode]();
  $('hudSub').textContent = ({ cut: T('点 = 字母（a 青，b 品红）；拱桥 = 最优切分的各块；平躺的淡弧 = 回文后缀', 'dots = letters (a cyan, b magenta); arches = blocks of an optimal cut; faint flat arcs = palindromic suffixes'),
    pd: T('螺线上的位置每转一圈翻倍；拱桥 = 最优切分的各块；琥珀点 = 稀疏地址 N(a, b)', 'positions on the spiral double each turn; arches = blocks of an optimal cut; amber dots = sparse addresses N(a, b)'),
    kernel: T('二叉树：每个节点是一条子序列 d(2ᵉn + r)，琥珀 = 新的', 'binary tree: each node is a subsequence d(2ᵉn + r), amber = new'),
    fib: T('螺线上的位置每转一圈翻倍；拱桥 = 最优切分的各块；琥珀点 = Frid 前缀 N(k)', 'positions on the spiral double each turn; arches = blocks of an optimal cut; amber dots = Frid’s prefixes N(k)') })[M.mode];
  if (!toasted && S.playing && S.nowFrac >= 1) {
    toasted = true;
    if (M.mode === 'cut') toast(T(`<b>n = 256</b>：P = ${pr.P}，最优切分 ${blockText(pr.blocks)}。`, `<b>n = 256</b>: P = ${pr.P}, an optimal cut ${blockText(pr.blocks)}.`));
    else if (M.mode === 'pd') toast(T(`<b>n = ${fmtInt(NPD)}</b>：整个范围里 P − F 最大是 ${excessCum.max}；N(3, 5) = 299 690 处 P = 9 = 3a（冻结）。`, `<b>n = ${fmtInt(NPD)}</b>: on the whole range P − F is at most ${excessCum.max}; at N(3, 5) = 299 690, P = 9 = 3a (frozen).`));
    else if (M.mode === 'kernel') toast(T(`<b>e = ${EMAX}</b>：差分有 ${KD.counts[EMAX]} 条不同的子序列，倍周期词本身只有 ${KU.counts[EMAX]} 条。`, `<b>e = ${EMAX}</b>: the differences have ${KD.counts[EMAX]} distinct subsequences, the word itself only ${KU.counts[EMAX]}.`));
    else toast(T(`<b>n = 10⁵</b>：最大回文长度 ${FRID[3].P}，第一次出现在 Frid 前缀 N(4) = 98 209。`, `<b>n = 10⁵</b>: the largest palindromic length is ${FRID[3].P}, first reached at Frid’s prefix N(4) = 98 209.`));
  }
}
function syncRail() {
  const key = `${S.mode}|${TRV.lang()}`; if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  let marks;
  if (S.mode === 'cut') marks = [1, 64, 128, 192, 256].map((n) => [fracOfN('cut', n), String(n)]);
  else if (S.mode === 'kernel') marks = Array.from({ length: EMAX + 1 }, (_, e) => [e / EMAX, `e=${e}`]);
  else marks = [1, 10, 100, 1000, 1e4, 1e5].map((n) => [fracOfN(S.mode, n), n >= 1000 ? `10${sup(Math.log10(n))}` : String(n)]);
  $('marks').innerHTML = marks.map(([f, s], i) => `<i class="${i === 0 ? 'first' : i === marks.length - 1 ? 'last' : ''}" style="left:${(f * 100).toFixed(2)}%">${s}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => {
  const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'cut'; if (S.mode === m) return;
  S.mode = m; S.nowFrac = 0; custom(); setCamPreset(m === 'kernel' || m === 'cut' ? 'front' : 'iso');
}));
document.querySelectorAll('#wordChips .chip').forEach((b) => b.addEventListener('click', () => { const w = b.dataset.word === 'fib' ? 'fib' : 'pd'; if (w === S.word) return; S.word = w; custom(); }));
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.mode = p.mode; if (p.word) S.word = p.word;
  S.preset = name; markPreset(); dirty = true; setCamPreset(p.mode === 'kernel' || p.mode === 'cut' ? 'front' : 'iso');
  S.nowFrac = p.n !== undefined ? fracOfN(p.mode, p.n) : p.frac; S.playing = !reduceMotion && p.play; S.dir = 1; setPlayUI(); $('now').value = S.nowFrac;
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
    ev.preventDefault(); const sgn = ev.key === 'ArrowRight' ? 1 : -1;
    if (MODEL.mode === 'cut') jumpTo(fracOfN('cut', Math.min(NCUT, Math.max(1, progress().n + sgn))));
    else if (MODEL.mode === 'kernel') jumpTo((Math.min(EMAX, Math.max(0, progress().e + sgn))) / EMAX);
    else jumpTo(S.nowFrac + sgn / 400);
  }
  else if (ev.key === 'e' || ev.key === 'E') jumpTo(1);
});

/* =====================================================================
   14. Main loop
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
window.PC_DEBUG = {
  pending: () => dirty || syncedKey !== `${S.mode}|${S.word}|${S.nowFrac}|${TRV.lang()}`,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const M = MODEL, pr = progress(), o = { mode: M.mode, word: M.word, frac: S.nowFrac, ...pr };
    if (M.mode === 'kernel') Object.assign(o, { dCounts: KD.counts, uCounts: KU.counts, fresh: KD.fresh, window: KWIN });
    if (M.mode === 'pd') Object.assign(o, { family: FAMILY.map((f) => ({ ...f })), excessMax: excessCum.max, excessFirst: excessCum.first, excessCounts: [0, 1, 2].map((k) => excessCum.c[k][pr.n]), naf: naf(Math.floor((pr.n + 1) / 2)) });
    if (M.mode === 'fib') Object.assign(o, { frid: FRID.map((f) => ({ ...f })), records: REC.fib });
    return o;
  },
  P: (word, n) => WORDS[word].P[n],
  F: (n) => Fbound(n),
  letters: (word, from, count) => Array.from(WORDS[word].w.subarray(from, from + count)),
  cuts: (word, n) => blocksOf(WORDS[word], n),
  limits: () => ({ NCUT, NPD, NFIB, EMAX, KWIN }),
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('frid'); S.playing = false; setPlayUI(); };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('front'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('pdcut');
setPlayUI();
requestAnimationFrame(frame);
})();
