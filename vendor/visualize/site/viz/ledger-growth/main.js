/* LEDGER//GROWTH · how the truth ledger grows
   One snapshot per UTC day of trureturing's dev branch (data.js): Lean modules, frozen state files (accepted freeze events before
   the state format existed), problem dossiers, theory files, atoms and the four digestion states. The page draws them as
   ribbons over time, an area skyline, the stacked digestion ledger and a calendar of problem dossiers. Every number is a file
   count; nothing here reruns Lean. Depends on: assets/vendor/three.r128.min.js, assets/shell.js, data.js. */
(() => {
'use strict';

/* =====================================================================
   1. Constants and derived series
   ===================================================================== */
const COL = TRV.rgb;
const reduceMotion = TRV.reduceMotion;
const { fitCanvas, L: T } = TRV;
const { ink: INK, dim: DIM, faint: FAINT, amber: AM, cyan: CY, magenta: MG, ok: OK } = TRV.palette;
const GREEN = [0.27, 1.0, 0.70], VIOLET = [0.62, 0.55, 1.0], VIOLET_CSS = '#9d8cff', SIGMA_CSS = '#cfe3ff';
const D = window.LEDGER, N = D.days.length;
const MODES = ['growth', 'areas', 'digest', 'problems'];
const RUN = 22;   // seconds for the whole history at speed 1
const HMAX = 3.6, XW = 6;
/* the frozen count: state files where they exist, accepted freeze events before the state format */
const FROZEN = D.frozenState.map((s, i) => (s > 0 ? s : D.frozenAccepted[i]));
const CLOSED = D.absorbed.map((a, i) => a + D.nonprop[i]);
const ENTRIES = D.open.map((o, i) => o + D.partial[i] + D.absorbed[i] + D.nonprop[i]);
const SHARE = CLOSED.map((c, i) => (ENTRIES[i] ? c / ENTRIES[i] : 0));
const PERDAY = D.prs.map((x, i) => (i ? x - D.prs[i - 1] : x));
const SERIES = [
  { key: 'd5', zh: 'Lean 模块', en: 'Lean modules', v: D.d5, col: COL.cyan, css: CY },
  { key: 'frozen', zh: '冻结模块', en: 'frozen modules', v: FROZEN, col: COL.amber, css: AM },
  { key: 'reg', zh: 'Reg 登记模块', en: 'Reg modules', v: D.reg, col: COL.sigma, css: SIGMA_CSS },
  { key: 'problems', zh: '问题卷宗', en: 'problem dossiers', v: D.problems, col: COL.magenta, css: MG },
  { key: 'theory', zh: '理论卷文件', en: 'theory files', v: D.theory, col: VIOLET, css: VIOLET_CSS },
  { key: 'closed', zh: '已闭合 atom', en: 'closed atoms', v: CLOSED, col: GREEN, css: OK },
  { key: 'merges', zh: '合并', en: 'merges', v: D.prs, col: COL.gray, css: DIM }
];
const BANDS = [   // the digestion ledger from the bottom up
  { key: 'absorbed', zh: 'absorbed-closed', en: 'absorbed-closed', v: D.absorbed, col: GREEN, css: OK },
  { key: 'nonprop', zh: 'nonpropositional', en: 'nonpropositional', v: D.nonprop, col: COL.amber, css: AM },
  { key: 'partial', zh: 'partial-closed', en: 'partial-closed', v: D.partial, col: COL.magenta, css: MG },
  { key: 'open', zh: 'residual-open', en: 'residual-open', v: D.open, col: COL.cyan, css: CY }
];
const KINDS = [
  { key: 'proved', zh: '证明', en: 'proved', col: COL.cyan, css: CY },
  { key: 'refuted', zh: '反驳', en: 'refuted', col: COL.magenta, css: MG },
  { key: 'none', zh: '无结算记录', en: 'no record', col: COL.gray, css: DIM }
];
const STRATA = ['S0', 'S1', 'S3', 'other'], STRATUM_COL = { S0: COL.amber, S1: COL.cyan, S3: COL.magenta, other: COL.gray }, STRATUM_CSS = { S0: AM, S1: CY, S3: MG, other: DIM };
const LOGTOP = Math.log10(2e5);
const fmt = (x) => x.toLocaleString('en-US').replace(/,/g, ' ');
const pct = (x) => `${(100 * x).toFixed(1)}%`;
/* calendar coordinates: weeks start on Monday, computed from the ISO date in UTC */
const dayNum = (d) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000);
const weekday = (d) => (new Date(dayNum(d) * 86400000).getUTCDay() + 6) % 7;
const MON0 = dayNum(D.days[0]) - weekday(D.days[0]);
const CAL = D.days.map((d) => ({ week: Math.floor((dayNum(d) - MON0) / 7), wd: weekday(d) }));
const WEEKS = CAL[N - 1].week + 1;
const NEWMAX = Math.max(...D.days.map((_, i) => D.problemsNew.proved[i] + D.problemsNew.refuted[i] + D.problemsNew.none[i]));
const areaShort = (a) => a.name === 'other' ? 'other' : a.name;

/* =====================================================================
   2. State and presets
   ===================================================================== */
const S = { mode: 'growth', scale: 'norm', area: 'd5', nowFrac: 1, playing: false, dir: 1, speed: 1, hold: 0, preset: 'now' };
const at = (d) => D.days.indexOf(d);
const fracOf = (d) => at(d) / (N - 1);
const PRESETS = {
  now: { mode: 'growth', scale: 'norm', area: 'd5', day: D.days[N - 1], play: false,
    zh: (i) => `${D.days[i]}：${fmt(D.d5[i])} 个 Lean 模块，${fmt(FROZEN[i])} 个已冻结；${fmt(D.problems[i])} 份开放问题卷宗；${fmt(D.theory[i])} 份理论卷文件；dev 上累计 ${fmt(D.prs[i])} 次 first-parent 合并。每条丝带按自己的最大值缩放，比较的是形状：从哪天开始、哪段加速。`,
    en: (i) => `${D.days[i]}: ${fmt(D.d5[i])} Lean modules, ${fmt(FROZEN[i])} of them frozen; ${fmt(D.problems[i])} open-problem dossiers; ${fmt(D.theory[i])} theory files; ${fmt(D.prs[i])} first-parent merges on dev so far. Each ribbon is scaled to its own maximum, so what you compare is shape: when each one starts and where it speeds up.` },
  dayOne: { mode: 'growth', scale: 'log', area: 'd5', day: D.days[0], play: true,
    zh: (i) => `${D.days[i]}，第一天：dev 上有 ${fmt(D.prs[i])} 个提交、${fmt(D.theory[i])} 份理论卷文件、${fmt(D.d5[i])} 个 Lean 模块；没有冻结，也没有卷宗。第二天已有 ${fmt(D.d5[i + 1])} 个 Lean 模块。播放可以看完全部 ${N} 天（共同对数轴，每格 10 倍）。`,
    en: (i) => `${D.days[i]}, day one: dev has ${fmt(D.prs[i])} commit${D.prs[i] === 1 ? '' : 's'}, ${fmt(D.theory[i])} theory files and ${fmt(D.d5[i])} Lean modules; nothing frozen and no dossiers yet. The next day already has ${fmt(D.d5[i + 1])} Lean modules. Play to watch all ${N} days (common log scale, one step per factor of 10).` },
  firstFreeze: { mode: 'growth', scale: 'log', area: 'd5', day: '2026-08-13', play: false,
    zh: (i) => `${D.days[i]}：冻结账本开张，这一天出现 ${fmt(D.frozenAccepted[i])} 个 accepted 冻结事件，当天 D5 有 ${fmt(D.d5[i])} 个 Lean 模块。此后冻结丝带紧跟 Lean 模块丝带。`,
    en: (i) => `${D.days[i]}: the freezing ledger opens with ${fmt(D.frozenAccepted[i])} accepted freeze events on one day, when D5 had ${fmt(D.d5[i])} Lean modules. From then on the frozen ribbon follows the Lean ribbon closely.` },
  migration: { mode: 'growth', scale: 'log', area: 'd5', day: '2026-09-04', play: false,
    zh: (i) => `${D.days[i]}：冻结成员改用状态片 Golden/Frozen/state/…lean.json。这一天两种格式并存：${fmt(D.frozenAccepted[i])} 个事件、${fmt(D.frozenState[i])} 个状态片。旧事件文件在 10 月 11 日之后删除，此后只数状态片。`,
    en: (i) => `${D.days[i]}: frozen membership moves to state files Golden/Frozen/state/…lean.json. Both formats exist on this day: ${fmt(D.frozenAccepted[i])} events and ${fmt(D.frozenState[i])} state files. The old event files are gone after October 11; from then on only state files count.` },
  areas: { mode: 'areas', scale: 'norm', area: 'd5', day: D.days[N - 1], play: false,
    zh: (i) => `按领域（D5 的第三级目录）数 Lean 模块：${D.areas.slice(0, 3).map((a) => `${a.name} ${fmt(a.d5[i])}`).join('、')}……前 12 个领域单列，其余合并成 other。切到“冻结模块”看每个领域冻结了多少。`,
    en: (i) => `Lean modules by area (the third directory level of D5): ${D.areas.slice(0, 3).map((a) => `${a.name} ${fmt(a.d5[i])}`).join(', ')}, … The 12 largest areas get their own ribbon and the rest are pooled as other. Switch to “frozen modules” to see how much of each area is frozen.` },
  ingest: { mode: 'digest', scale: 'norm', area: 'd5', day: '2026-09-27', play: false,
    zh: (i) => `${D.days[i]}：residual-open 的账目条目一天增加 ${fmt(D.open[i] - D.open[i - 1])}，是 ${N} 天里单日增加最多的一天；atom 库同日增加 ${fmt(D.atoms[i] - D.atoms[i - 1])}，当天合并 ${fmt(PERDAY[i])} 次。摄入理论卷只增加待消化的条目，不增加真值。`,
    en: (i) => `${D.days[i]}: residual-open entries grow by ${fmt(D.open[i] - D.open[i - 1])}, the largest one-day increase of the ${N} days; the atom store grows by ${fmt(D.atoms[i] - D.atoms[i - 1])} on the same day, with ${fmt(PERDAY[i])} merges. Ingesting theory adds entries to digest; it adds no truth.` },
  settle: { mode: 'digest', scale: 'norm', area: 'd5', day: '2026-10-14', play: false,
    zh: (i) => `${D.days[i]}：nonpropositional-inapplicable 一天增加 ${fmt(D.nonprop[i] - D.nonprop[i - 1])}，residual-open 减少 ${fmt(D.open[i - 1] - D.open[i])}。这个目录只由 settle 收据写入：把不是命题、或只由上游库闭合的 atom 结算掉。这是记账，不是新证明。`,
    en: (i) => `${D.days[i]}: nonpropositional-inapplicable grows by ${fmt(D.nonprop[i] - D.nonprop[i - 1])} in one day and residual-open shrinks by ${fmt(D.open[i - 1] - D.open[i])}. Only settlement receipts write this directory: they settle atoms that are not propositions or are closed by an upstream library alone. This is bookkeeping, not new proofs.` },
  problems: { mode: 'problems', scale: 'norm', area: 'd5', day: D.days[N - 1], play: false,
    zh: () => `开放问题卷宗按第一次出现在 dev 上的日期排进日历：每列一周，每行一个星期几，塔高是那天的新卷宗数。按今天的记录，${fmt(D.resolutions.proved)} 份被证明，${fmt(D.resolutions.refuted)} 份被反驳，${fmt(D.resolutions.none)} 份没有结算记录。`,
    en: () => `Open-problem dossiers on a calendar by the day each first appeared on dev: one column per week, one row per weekday, tower height = new dossiers that day. By today’s records, ${fmt(D.resolutions.proved)} are proved, ${fmt(D.resolutions.refuted)} refuted and ${fmt(D.resolutions.none)} have no resolution record.` }
};

/* =====================================================================
   3. The model at the cursor
   ===================================================================== */
let dirty = true;
const dayIndex = () => Math.min(N - 1, Math.max(0, Math.round(Math.min(1, Math.max(0, S.nowFrac)) * (N - 1))));
const cumNew = (key, i) => { let s = 0; for (let j = 0; j <= i; j++) s += D.problemsNew[key][j]; return s; };
function ribbonsFor(mode) {   // the ribbons drawn in growth and areas modes: values over time and heights
  if (mode === 'growth') return SERIES.map((s) => {
    const mx = Math.max(...s.v);
    const h = s.v.map((x) => (S.scale === 'log' ? (x > 0 ? HMAX * Math.log10(Math.max(1, x)) / LOGTOP : 0) : HMAX * x / mx));
    return { key: s.key, label: T(s.zh, s.en), v: s.v, h, col: s.col, css: s.css };
  });
  const key = S.area === 'frozen' ? 'frozen' : 'd5', mx = Math.max(...D.areas.flatMap((a) => a[key]));
  return D.areas.map((a) => {
    const st = a.name === 'other' ? 'other' : a.name.split('/')[0];
    return { key: a.name, label: areaShort(a), v: a[key], h: a[key].map((x) => HMAX * x / mx), col: STRATUM_COL[st], css: STRATUM_CSS[st] };
  });
}

/* =====================================================================
   4. DOM helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), tagsBox = $('tags'), cv1 = $('c1'), cv2 = $('c2');

/* =====================================================================
   5. 3D scene
   ===================================================================== */
let renderer = null, scene3, camera, glOK = false, lines, pts, tris;
const LINES_MAX = 20000, PTS_MAX = 400, TRI_MAX = 16000;
const CAMS = { iso: [0.62, 0.98, 18], front: [0.0001, 1.5, 16], top: [0.0001, 0.06, 15] };
const cam = { theta: 0.62, phi: 0.98, r: 18, tTheta: 0.62, tPhi: 0.98, tR: 18 };
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
  const gt = new THREE.BufferGeometry(); dyn(gt, 'position', TRI_MAX, 3); dyn(gt, 'color', TRI_MAX, 3);
  tris = new THREE.Mesh(gt, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, ...additive })); tris.frustumCulled = false; scene3.add(tris);
  const g = new THREE.BufferGeometry(); dyn(g, 'position', LINES_MAX, 3); dyn(g, 'color', LINES_MAX, 3);
  lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, ...additive })); lines.frustumCulled = false; scene3.add(lines);
  const gp = new THREE.BufferGeometry(); dyn(gp, 'position', PTS_MAX, 3); dyn(gp, 'aColor', PTS_MAX, 3); dyn(gp, 'aAlpha', PTS_MAX, 1); dyn(gp, 'aSize', PTS_MAX, 1);
  pts = new THREE.Points(gp, new THREE.ShaderMaterial({ vertexShader: EVT_VS, fragmentShader: DOT_FS, uniforms: { uScale: { value: 60 } }, ...additive }));
  pts.frustumCulled = false; scene3.add(pts);
}
const xDay = (i) => -XW + 2 * XW * i / (N - 1);
const zRibbon = (j, n) => (n === 1 ? 0 : -3.4 + 6.8 * j / (n - 1));
const xWeek = (w) => -XW + 2 * XW * (w + 0.5) / WEEKS;
const zDay = (wd) => -2.4 + 4.8 * wd / 6;
const TOWER_UNIT = HMAX / NEWMAX;
function updateGL() {
  const c = dayIndex();
  const Lb = lines.geometry.attributes, Pp = Lb.position.array, Cc = Lb.color.array; let v = 0;
  const seg = (a, b, col, k) => { if (v + 2 > LINES_MAX) return; for (const p of [a, b]) { Pp[3 * v] = p[0]; Pp[3 * v + 1] = p[1]; Pp[3 * v + 2] = p[2]; Cc[3 * v] = col[0] * k; Cc[3 * v + 1] = col[1] * k; Cc[3 * v + 2] = col[2] * k; v++; } };
  const Tb = tris.geometry.attributes, Tp = Tb.position.array, Tc = Tb.color.array; let t = 0;
  const tri = (a, b, d, col, k) => { if (t + 3 > TRI_MAX) return; for (const p of [a, b, d]) { Tp[3 * t] = p[0]; Tp[3 * t + 1] = p[1]; Tp[3 * t + 2] = p[2]; Tc[3 * t] = col[0] * k; Tc[3 * t + 1] = col[1] * k; Tc[3 * t + 2] = col[2] * k; t++; } };
  const quad = (a, b, d, e, col, k) => { tri(a, b, d, col, k); tri(a, d, e, col, k); };
  const PT = pts.geometry.attributes; let np = 0;
  const dot = (p, col, a, size) => { if (np >= PTS_MAX) return; PT.position.array[3 * np] = p[0]; PT.position.array[3 * np + 1] = p[1]; PT.position.array[3 * np + 2] = p[2]; PT.aColor.array[3 * np] = col[0]; PT.aColor.array[3 * np + 1] = col[1]; PT.aColor.array[3 * np + 2] = col[2]; PT.aAlpha.array[np] = a; PT.aSize.array[np] = size; np++; };
  const grid = COL.gray;
  if (S.mode === 'growth' || S.mode === 'areas') {
    const R = ribbonsFor(S.mode), n = R.length;
    seg([-XW, 0, -3.8], [XW, 0, -3.8], grid, 0.25); seg([-XW, 0, 3.8], [XW, 0, 3.8], grid, 0.25);
    R.forEach((r, j) => {
      const z = zRibbon(j, n);
      seg([-XW, 0, z], [XW, 0, z], grid, 0.12);
      for (let i = 0; i < N - 1; i++) {
        const past = i < c, a = [xDay(i), 0, z], b = [xDay(i), r.h[i], z], d = [xDay(i + 1), r.h[i + 1], z], e = [xDay(i + 1), 0, z];
        quad(a, b, d, e, r.col, past ? 0.16 : 0.035);
        seg(b, d, r.col, past ? 1 : 0.18);
      }
      dot([xDay(c), r.h[c], z], r.col, 1, 2.2);
      seg([xDay(c), 0, z], [xDay(c), r.h[c], z], [1, 1, 1], 0.5);
    });
    seg([xDay(c), 0, -3.8], [xDay(c), 0, 3.8], [1, 1, 1], 0.6);
  } else if (S.mode === 'digest') {
    const tot = Math.max(...ENTRIES), sc = HMAX / tot, Z = [-1.1, 1.1];
    for (let i = 0; i < N - 1; i++) {
      let y0 = 0, y1 = 0;
      for (const bd of BANDS) {
        const a0 = y0, a1 = y0 + bd.v[i] * sc, b0 = y1, b1 = y1 + bd.v[i + 1] * sc, past = i < c;
        if (bd.v[i] > 0 || bd.v[i + 1] > 0) {
          quad([xDay(i), a0, Z[1]], [xDay(i), a1, Z[1]], [xDay(i + 1), b1, Z[1]], [xDay(i + 1), b0, Z[1]], bd.col, past ? 0.2 : 0.035);
          quad([xDay(i), a1, Z[0]], [xDay(i), a1, Z[1]], [xDay(i + 1), b1, Z[1]], [xDay(i + 1), b1, Z[0]], bd.col, past ? 0.12 : 0.02);
          for (const z of Z) seg([xDay(i), a1, z], [xDay(i + 1), b1, z], bd.col, past ? 0.9 : 0.15);
        }
        y0 = a1; y1 = b1;
      }
    }
    let y = 0;
    for (const bd of BANDS) { const top = y + bd.v[c] * sc; seg([xDay(c), y, Z[0]], [xDay(c), top, Z[0]], bd.col, 1); seg([xDay(c), y, Z[1]], [xDay(c), top, Z[1]], bd.col, 1); dot([xDay(c), top, Z[1]], bd.col, 1, 1.8); y = top; }
    seg([xDay(c), y, Z[0]], [xDay(c), y, Z[1]], [1, 1, 1], 0.8);
    seg([-XW, 0, Z[1]], [XW, 0, Z[1]], grid, 0.3); seg([-XW, 0, Z[0]], [XW, 0, Z[0]], grid, 0.2);
  } else {
    for (let w = 0; w <= WEEKS; w++) { const x = -XW + 2 * XW * w / WEEKS; seg([x, 0, -2.8], [x, 0, 2.8], grid, 0.12); }
    for (let wd = 0; wd < 7; wd++) seg([-XW, 0, zDay(wd)], [XW, 0, zDay(wd)], grid, 0.08);
    for (let i = 0; i < N; i++) {
      const x = xWeek(CAL[i].week), z = zDay(CAL[i].wd), hw = 0.26, future = i > c;
      let y = 0;
      for (const kd of KINDS) {
        const n = D.problemsNew[kd.key][i]; if (!n) continue;
        const top = y + n * TOWER_UNIT, k = future ? 0.06 : 0.3, kl = future ? 0.12 : 0.9;
        const P = (dx, yy, dz) => [x + dx * hw, yy, z + dz * hw];
        quad(P(-1, y, -1), P(-1, top, -1), P(1, top, -1), P(1, y, -1), kd.col, k); quad(P(-1, y, 1), P(-1, top, 1), P(1, top, 1), P(1, y, 1), kd.col, k);
        quad(P(-1, y, -1), P(-1, top, -1), P(-1, top, 1), P(-1, y, 1), kd.col, k); quad(P(1, y, -1), P(1, top, -1), P(1, top, 1), P(1, y, 1), kd.col, k);
        quad(P(-1, top, -1), P(1, top, -1), P(1, top, 1), P(-1, top, 1), kd.col, k);
        for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) seg(P(dx, y, dz), P(dx, top, dz), kd.col, kl);
        seg(P(-1, top, -1), P(1, top, -1), kd.col, kl); seg(P(1, top, -1), P(1, top, 1), kd.col, kl); seg(P(1, top, 1), P(-1, top, 1), kd.col, kl); seg(P(-1, top, 1), P(-1, top, -1), kd.col, kl);
        y = top;
      }
      if (i === c) { dot([x, y + 0.15, z], [1, 1, 1], 1, 2.4); seg([x - 0.34, 0.01, z - 0.34], [x + 0.34, 0.01, z - 0.34], [1, 1, 1], 0.9); seg([x + 0.34, 0.01, z - 0.34], [x + 0.34, 0.01, z + 0.34], [1, 1, 1], 0.9); seg([x + 0.34, 0.01, z + 0.34], [x - 0.34, 0.01, z + 0.34], [1, 1, 1], 0.9); seg([x - 0.34, 0.01, z + 0.34], [x - 0.34, 0.01, z - 0.34], [1, 1, 1], 0.9); }
    }
  }
  lines.geometry.setDrawRange(0, v); Lb.position.needsUpdate = true; Lb.color.needsUpdate = true;
  tris.geometry.setDrawRange(0, t); Tb.position.needsUpdate = true; Tb.color.needsUpdate = true;
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
  camera.position.set(r * sp * Math.sin(cam.theta), 1.4 + r * Math.cos(cam.phi), r * sp * Math.cos(cam.theta));
  camera.up.set(0, 1, 0); camera.lookAt(0, 1.4, 0);
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
  if (drag.pts.size === 2) { const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.pinch > 0) cam.tR = Math.min(34, Math.max(8, cam.tR * drag.pinch / d)); drag.pinch = d; return; }
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY;
  cam.tTheta -= dx * 0.006; cam.tPhi = Math.min(Math.PI - 0.06, Math.max(0.06, cam.tPhi - dy * 0.006));
  cam.theta = cam.tTheta; cam.phi = cam.tPhi;
  document.querySelectorAll('#camChips .chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
});
const endDrag = (ev) => { if (!drag.pts.has(ev.pointerId)) return; drag.pts.delete(ev.pointerId); if (drag.pts.size === 0) drag.pinch = 0; };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tR = Math.min(34, Math.max(8, cam.tR * Math.exp(ev.deltaY * 0.0012))); }, { passive: false });

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
const MONTHS = { zh: ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
const WDAYS = { zh: ['一', '二', '三', '四', '五', '六', '日'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] };
function updateTags() {
  const c = dayIndex(); let k = 0;
  const put = (text, p, cls) => { const el = tagAt(k++, cls); el.textContent = text; placeTag(el, p); };
  const lang = TRV.lang() === 'en' ? 'en' : 'zh';
  if (S.mode === 'growth' || S.mode === 'areas') {
    const R = ribbonsFor(S.mode);
    R.forEach((r, j) => put(`${r.label} ${fmt(r.v[c])}`, [XW + 0.3, 0.05, zRibbon(j, R.length)], 'cy'));
  } else if (S.mode === 'digest') {
    const sc = HMAX / Math.max(...ENTRIES); let y = 0;
    for (const bd of BANDS) { const h = bd.v[c] * sc; if (h > 0.12) put(`${bd.en} ${fmt(bd.v[c])}`, [xDay(c) + 0.2, y + h / 2, 1.1], 'cy'); y += h; }
  } else {
    for (let i = 0; i < N; i++) if (i === 0 || D.days[i].slice(8) === '01') put(MONTHS[lang][+D.days[i].slice(5, 7) - 1], [xWeek(CAL[i].week), 0, -3.1], 'cy');
    for (let wd = 0; wd < 7; wd += 2) put(WDAYS[lang][wd], [-XW - 0.45, 0, zDay(wd)], 'cy');
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
function timeAxis(F, c) {   // month ticks along the bottom and the cursor line
  const { ctx, dpr, pl, pt, iw, ih } = F, lang = TRV.lang() === 'en' ? 'en' : 'zh';
  ctx.fillStyle = DIM; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  D.days.forEach((d, i) => { if (d.slice(8) === '01') { const x = pl + iw * i / (N - 1); ctx.fillText(MONTHS[lang][+d.slice(5, 7) - 1], x, pt + ih + 5 * dpr); ctx.fillStyle = FAINT; ctx.fillRect(x, pt, 1, ih); ctx.fillStyle = DIM; } });
  const x = pl + iw * c / (N - 1);
  ctx.fillStyle = INK; ctx.globalAlpha = 0.7; ctx.fillRect(x - 0.5 * dpr, pt, 1 * dpr, ih); ctx.globalAlpha = 1;
}
const xs = (F, i) => F.pl + F.iw * i / (N - 1);
function drawMain() {
  const F = frame2d(cv1, 44); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, c = dayIndex();
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = DIM;
  if (S.mode === 'growth') {
    const y = (v) => pt + ih - ih * Math.log10(Math.max(1, v)) / LOGTOP;
    for (let e = 0; e <= 5; e++) { const yy = pt + ih - ih * e / LOGTOP; ctx.fillStyle = FAINT; ctx.fillRect(pl, yy, iw, 1); ctx.fillStyle = DIM; ctx.fillText(e === 0 ? '1' : `1e${e}`, pl - 5 * dpr, yy); }
    timeAxis(F, c);
    for (const s of SERIES) {
      ctx.strokeStyle = s.css; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); let on = false;
      s.v.forEach((v, i) => { if (v <= 0) { on = false; return; } if (on) ctx.lineTo(xs(F, i), y(v)); else { ctx.moveTo(xs(F, i), y(v)); on = true; } });
      ctx.stroke();
      if (s.v[c] > 0) { ctx.fillStyle = s.css; ctx.beginPath(); ctx.arc(xs(F, c), y(s.v[c]), 2.6 * dpr, 0, 7); ctx.fill(); }
    }
  } else if (S.mode === 'areas') {
    const key = S.area === 'frozen' ? 'frozen' : 'd5', rows = D.areas.map((a) => ({ a, v: a.d5[c], f: a.frozen[c] })).sort((p, q) => (p.a.name === 'other') - (q.a.name === 'other') || q.v - p.v || (p.a.name < q.a.name ? -1 : 1));
    const mx = 1.22 * Math.max(1, ...D.areas.map((a) => a.d5[N - 1])), bh = ih / rows.length, lab = 118 * dpr;
    ctx.textAlign = 'right';
    rows.forEach((r, j) => {
      const yy = pt + j * bh, st = r.a.name === 'other' ? 'other' : r.a.name.split('/')[0], css = STRATUM_CSS[st];
      ctx.fillStyle = key === 'd5' ? INK : DIM; ctx.fillText(areaShort(r.a), pl + lab - 6 * dpr, yy + bh / 2);
      ctx.strokeStyle = css; ctx.lineWidth = 1 * dpr; ctx.strokeRect(pl + lab, yy + bh * 0.18, (iw - lab) * r.v / mx, bh * 0.64);
      ctx.globalAlpha = 0.55; ctx.fillStyle = css; ctx.fillRect(pl + lab, yy + bh * 0.18, (iw - lab) * r.f / mx, bh * 0.64); ctx.globalAlpha = 1;
      ctx.textAlign = 'left'; ctx.fillStyle = DIM; ctx.fillText(key === 'd5' ? fmt(r.v) : `${fmt(r.f)}/${fmt(r.v)}`, pl + lab + (iw - lab) * r.v / mx + 4 * dpr, yy + bh / 2); ctx.textAlign = 'right';
    });
  } else if (S.mode === 'digest') {
    const mx = Math.max(...ENTRIES), y = (v) => pt + ih - ih * v / mx;
    for (let e = 0; e <= 4; e++) { const v = mx * e / 4, yy = y(v); ctx.fillStyle = FAINT; ctx.fillRect(pl, yy, iw, 1); ctx.fillStyle = DIM; ctx.fillText(fmt(Math.round(v / 1000)) + 'k', pl - 5 * dpr, yy); }
    timeAxis(F, c);
    const base = new Array(N).fill(0);
    for (const bd of BANDS) {
      ctx.fillStyle = bd.css; ctx.globalAlpha = 0.5; ctx.beginPath();
      for (let i = 0; i < N; i++) ctx.lineTo(xs(F, i), y(base[i] + bd.v[i]));
      for (let i = N - 1; i >= 0; i--) ctx.lineTo(xs(F, i), y(base[i]));
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      for (let i = 0; i < N; i++) base[i] += bd.v[i];
    }
  } else {
    const keys = KINDS.map((k) => k.key), cum = keys.map(() => new Array(N).fill(0));
    keys.forEach((k, j) => { let s = 0; for (let i = 0; i < N; i++) { s += D.problemsNew[k][i]; cum[j][i] = s; } });
    const mx = D.problems[N - 1], y = (v) => pt + ih - ih * v / mx;
    for (let e = 0; e <= 3; e++) { const v = Math.round(mx * e / 3), yy = y(v); ctx.fillStyle = FAINT; ctx.fillRect(pl, yy, iw, 1); ctx.fillStyle = DIM; ctx.fillText(fmt(v), pl - 5 * dpr, yy); }
    timeAxis(F, c);
    const base = new Array(N).fill(0);
    KINDS.forEach((kd, j) => {
      ctx.fillStyle = kd.css; ctx.globalAlpha = 0.5; ctx.beginPath();
      for (let i = 0; i < N; i++) ctx.lineTo(xs(F, i), y(base[i] + cum[j][i]));
      for (let i = N - 1; i >= 0; i--) ctx.lineTo(xs(F, i), y(base[i]));
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      for (let i = 0; i < N; i++) base[i] += cum[j][i];
    });
  }
}
function drawSide() {
  const F = frame2d(cv2, 40); if (F.iw < 60 || F.ih < 40) return;
  const { ctx, dpr, pl, pt, iw, ih } = F, c = dayIndex();
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const bars = (vals, mx, cssOf) => { const bw = Math.max(1, iw / N - 1 * dpr); vals.forEach((v, i) => { ctx.fillStyle = cssOf(i); ctx.globalAlpha = i === c ? 1 : 0.55; ctx.fillRect(xs(F, i) - bw / 2, pt + ih - ih * v / mx, bw, ih * v / mx); }); ctx.globalAlpha = 1; };
  if (S.mode === 'growth') {
    const mx = Math.max(...PERDAY);
    for (let e = 0; e <= 2; e++) { const v = Math.round(mx * e / 2), yy = pt + ih - ih * v / mx; ctx.fillStyle = FAINT; ctx.fillRect(pl, yy, iw, 1); ctx.fillStyle = DIM; ctx.fillText(String(v), pl - 5 * dpr, yy); }
    timeAxis(F, c); bars(PERDAY, mx, (i) => (i === c ? INK : CY));
  } else if (S.mode === 'areas') {
    const mx = Math.max(...D.d5), y = (v) => pt + ih - ih * v / mx;
    for (let e = 0; e <= 2; e++) { const v = Math.round(mx * e / 2), yy = y(v); ctx.fillStyle = FAINT; ctx.fillRect(pl, yy, iw, 1); ctx.fillStyle = DIM; ctx.fillText(fmt(v), pl - 5 * dpr, yy); }
    timeAxis(F, c);
    const base = new Array(N).fill(0);
    for (const st of STRATA) {
      ctx.fillStyle = STRATUM_CSS[st]; ctx.globalAlpha = 0.5; ctx.beginPath();
      for (let i = 0; i < N; i++) ctx.lineTo(xs(F, i), y(base[i] + D[st][i]));
      for (let i = N - 1; i >= 0; i--) ctx.lineTo(xs(F, i), y(base[i]));
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      for (let i = 0; i < N; i++) base[i] += D[st][i];
    }
  } else if (S.mode === 'digest') {
    const mx = 0.4, y = (v) => pt + ih - ih * v / mx;
    for (let e = 0; e <= 4; e++) { const v = mx * e / 4, yy = y(v); ctx.fillStyle = FAINT; ctx.fillRect(pl, yy, iw, 1); ctx.fillStyle = DIM; ctx.fillText(`${Math.round(100 * v)}%`, pl - 5 * dpr, yy); }
    timeAxis(F, c);
    ctx.strokeStyle = OK; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); let on = false;
    SHARE.forEach((s, i) => { if (!ENTRIES[i]) { on = false; return; } if (on) ctx.lineTo(xs(F, i), y(s)); else { ctx.moveTo(xs(F, i), y(s)); on = true; } });
    ctx.stroke();
    if (ENTRIES[c]) { ctx.fillStyle = OK; ctx.beginPath(); ctx.arc(xs(F, c), y(SHARE[c]), 2.6 * dpr, 0, 7); ctx.fill(); }
  } else {
    const tot = D.days.map((_, i) => D.problemsNew.proved[i] + D.problemsNew.refuted[i] + D.problemsNew.none[i]), mx = Math.max(...tot);
    for (let e = 0; e <= 2; e++) { const v = Math.round(mx * e / 2), yy = pt + ih - ih * v / mx; ctx.fillStyle = FAINT; ctx.fillRect(pl, yy, iw, 1); ctx.fillStyle = DIM; ctx.fillText(String(v), pl - 5 * dpr, yy); }
    timeAxis(F, c);
    const bw = Math.max(1, iw / N - 1 * dpr);
    for (let i = 0; i < N; i++) { let y0 = 0; for (const kd of KINDS) { const v = D.problemsNew[kd.key][i]; ctx.fillStyle = kd.css; ctx.globalAlpha = i === c ? 1 : 0.6; ctx.fillRect(xs(F, i) - bw / 2, pt + ih - ih * (y0 + v) / mx, bw, ih * v / mx); y0 += v; } }
    ctx.globalAlpha = 1;
  }
}

/* =====================================================================
   9. Outputs
   ===================================================================== */
let syncedKey = '', toasted = false;
const toast = (html) => TRV.toast($('toast'), html);
function setRo(rows) { rows.forEach(([l, v], i) => { $(`ro${i + 1}L`).textContent = l; $(`ro${i + 1}`).textContent = v; }); }
function pill(id, label, value) { $(id).innerHTML = `${label} <strong>${value}</strong>`; }
const legend = (items, sq) => items.map((s) => `<span class="it"><span class="${sq ? 'sq' : 'sw'}" style="--c:${s.css}"></span>${T(s.zh, s.en)}</span>`).join('');
function readouts() {
  const c = dayIndex(), day = D.days[c], prev = Math.max(0, c - 1);
  if (S.mode === 'growth') {
    setRo([[T('日期 · 提交', 'Date · commit'), `${day} · ${D.sha[c]}`], [T('Lean 模块 · Reg 登记模块', 'Lean modules · Reg modules'), `${fmt(D.d5[c])} · ${fmt(D.reg[c])}`],
      [T('冻结模块（状态片；之前为 accepted 事件）', 'Frozen modules (state files; accepted events before)'), D.frozenState[c] > 0 ? T(`${fmt(D.frozenState[c])} 个状态片`, `${fmt(D.frozenState[c])} state files`) : T(`${fmt(D.frozenAccepted[c])} 个事件`, `${fmt(D.frozenAccepted[c])} events`)],
      [T('问题卷宗 · 理论卷文件', 'Problem dossiers · theory files'), `${fmt(D.problems[c])} · ${fmt(D.theory[c])}`],
      [T('合并：累计 · 当天', 'Merges: so far · this day'), `${fmt(D.prs[c])} · ${fmt(PERDAY[c])}`]]);
    $('roNote').innerHTML = T(`与前一天相比：Lean 模块 ${sgn(D.d5[c] - D.d5[prev])}，冻结 ${sgn(FROZEN[c] - FROZEN[prev])}，卷宗 ${sgn(D.problems[c] - D.problems[prev])}。`, `Against the day before: Lean modules ${sgn(D.d5[c] - D.d5[prev])}, frozen ${sgn(FROZEN[c] - FROZEN[prev])}, dossiers ${sgn(D.problems[c] - D.problems[prev])}.`);
  } else if (S.mode === 'areas') {
    const top = D.areas.filter((a) => a.name !== 'other').slice().sort((p, q) => q.d5[c] - p.d5[c] || (p.name < q.name ? -1 : 1))[0];
    const fz = D.areas.reduce((s, a) => s + a.frozen[c], 0), all = D.areas.reduce((s, a) => s + a.d5[c], 0);
    setRo([[T('日期 · 提交', 'Date · commit'), `${day} · ${D.sha[c]}`], [T('最大的领域', 'Largest area'), `${top.name} · ${fmt(top.d5[c])}`],
      [T('冻结 / Lean 模块（各领域合计）', 'Frozen / Lean modules (all areas)'), `${fmt(fz)} / ${fmt(all)}${all ? ` · ${pct(fz / all)}` : ''}`],
      [T('层级 S0 · S1 · S3', 'Strata S0 · S1 · S3'), `${fmt(D.S0[c])} · ${fmt(D.S1[c])} · ${fmt(D.S3[c])}`],
      [T('领域的冻结数据', 'Frozen data by area'), D.frozenState[c] > 0 ? T('取自状态片的路径', 'from the paths of state files') : T('这一天还没有状态片：旧的事件文件按内容哈希命名，不带领域', 'no state files on this day: the old event files are named by content hash and carry no area')]]);
    $('roNote').innerHTML = T('条形图：外框是 Lean 模块数，实心部分是冻结模块数。', 'Bars: the outline is the number of Lean modules, the filled part the number of frozen modules.');
  } else if (S.mode === 'digest') {
    setRo([[T('日期 · 提交', 'Date · commit'), `${day} · ${D.sha[c]}`], [T('atom 库（内容寻址）', 'Atom store (content-addressed)'), fmt(D.atoms[c])],
      [T('open · absorbed · nonprop · partial', 'open · absorbed · nonprop · partial'), `${fmt(D.open[c])} · ${fmt(D.absorbed[c])} · ${fmt(D.nonprop[c])} · ${fmt(D.partial[c])}`],
      [T('已闭合的比例', 'Closed share'), ENTRIES[c] ? `${fmt(CLOSED[c])} / ${fmt(ENTRIES[c])} = ${pct(SHARE[c])}` : '—'],
      [T('当天变化：open · 已闭合', 'Change this day: open · closed'), `${sgn(D.open[c] - D.open[prev])} · ${sgn(CLOSED[c] - CLOSED[prev])}`]]);
    $('roNote').innerHTML = T('已闭合 = absorbed-closed + nonpropositional-inapplicable；比例的分母是四个目录里的全部账目条目。', 'Closed = absorbed-closed + nonpropositional-inapplicable; the share is over all account entries in the four directories.');
  } else {
    const pv = cumNew('proved', c), rf = cumNew('refuted', c), no = cumNew('none', c), nw = D.problemsNew.proved[c] + D.problemsNew.refuted[c] + D.problemsNew.none[c];
    setRo([[T('日期 · 星期', 'Date · weekday'), `${day} · ${WDAYS[TRV.lang() === 'en' ? 'en' : 'zh'][CAL[c].wd]}`], [T('到这天为止的卷宗', 'Dossiers so far'), fmt(pv + rf + no)],
      [T('证明 · 反驳 · 无记录（今天的记录）', 'Proved · refuted · no record (today’s records)'), `${fmt(pv)} · ${fmt(rf)} · ${fmt(no)}`],
      [T('这一天的新卷宗', 'New dossiers this day'), `${fmt(nw)} (${fmt(D.problemsNew.proved[c])} · ${fmt(D.problemsNew.refuted[c])} · ${fmt(D.problemsNew.none[c])})`],
      [T('有记录的卷宗里反驳的比例', 'Refuted among the dossiers with a record'), pv + rf ? pct(rf / (pv + rf)) : '—']]);
    $('roNote').innerHTML = T('卷宗按它第一次出现在 dev 上的日期计入；证明或反驳取今天 Scribe 源码里的 ResolutionKind。', 'A dossier counts from the day it first appeared on dev; proved or refuted is today’s ResolutionKind in the Scribe sources.');
  }
  pill('pillA', T('日', 'DAY'), day.slice(5)); pill('pillB', 'LEAN', fmt(D.d5[c])); pill('pillC', T('冻结', 'FROZEN'), fmt(FROZEN[c])); pill('pillD', T('卷宗', 'PROB'), fmt(D.problems[c]));
}
const sgn = (x) => (x > 0 ? `+${fmt(x)}` : x < 0 ? `−${fmt(-x)}` : '0');
function syncOutputs() {
  if (dirty) { dirty = false; syncedKey = ''; toasted = false; }
  if (!toasted && S.playing && S.nowFrac >= 1) {   // checked every frame: the last day is reached before nowFrac reaches 1
    toasted = true;
    toast(T(`<b>到了 ${D.asOf}</b>：${fmt(D.d5[N - 1])} 个 Lean 模块，${fmt(FROZEN[N - 1])} 个冻结。`, `<b>Reached ${D.asOf}</b>: ${fmt(D.d5[N - 1])} Lean modules, ${fmt(FROZEN[N - 1])} frozen.`));
  }
  const c = dayIndex(), key = `${S.mode}|${S.scale}|${S.area}|${c}|${TRV.lang()}|${S.preset}`;
  if (key === syncedKey) return; syncedKey = key;
  readouts();
  document.querySelectorAll('#modeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  document.querySelectorAll('#scaleChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scale === S.scale)));
  document.querySelectorAll('#areaChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.area === S.area)));
  $('scaleChips').hidden = S.mode !== 'growth'; $('areaChips').hidden = S.mode !== 'areas';
  const p = S.preset && PRESETS[S.preset];
  $('presetNote').innerHTML = p ? T(p.zh(at(p.day)), p.en(at(p.day))) : T('自定义设置：上面的卡带没有一个与当前设置完全一致。', 'Custom settings: none of the presets above matches the current settings exactly.');
  $('modeNote').innerHTML = {
    growth: S.scale === 'log' ? T('七条丝带共用一条对数轴：每升高一段是 10 倍。', 'The seven ribbons share one log scale: each step up is a factor of 10.') : T(`每条丝带按自己在 ${N} 天里的最大值缩放到同一高度。`, `Each ribbon is scaled so that its own maximum over the ${N} days has the same height.`),
    areas: T('丝带按层级着色：S0 琥珀、S1 青、S3 品红，其余灰。', 'Ribbons are coloured by stratum: S0 amber, S1 cyan, S3 magenta, the rest gray.'),
    digest: T('从下往上：absorbed-closed、nonpropositional-inapplicable、partial-closed、residual-open。', 'From the bottom: absorbed-closed, nonpropositional-inapplicable, partial-closed, residual-open.'),
    problems: T('每列一周（从星期一开始），每行一个星期几；青 = 证明，品红 = 反驳，灰 = 无结算记录。', 'One column per week (starting on Monday), one row per weekday; cyan = proved, magenta = refuted, gray = no resolution record.')
  }[S.mode];
  $('litNote').innerHTML = T(`仓库 <a href="https://github.com/${D.repo}/tree/${D.branch}" target="_blank" rel="noopener">${D.repo}</a> 的 ${D.branch} 分支，${D.days[0]} 到 ${D.asOf}（UTC），${N} 个每日快照；最后一个快照是提交 <code>${D.tip}</code>。数据随页面一起发布，不会自动更新。`, `Branch ${D.branch} of <a href="https://github.com/${D.repo}/tree/${D.branch}" target="_blank" rel="noopener">${D.repo}</a>, ${D.days[0]} to ${D.asOf} (UTC), ${N} daily snapshots; the last snapshot is commit <code>${D.tip}</code>. The data is published with the page and does not update itself.`);
  $('c1Title').textContent = { growth: T('七个计数（对数轴）', 'Seven counts (log scale)'), areas: T('当天各领域的模块', 'Modules by area on this day'), digest: T('消化账目的四个目录', 'The four directories of the digestion ledger'), problems: T('累计的问题卷宗', 'Problem dossiers, cumulative') }[S.mode];
  $('c1Meta').innerHTML = { growth: legend(SERIES), areas: legend([{ zh: 'S0', en: 'S0', css: AM }, { zh: 'S1', en: 'S1', css: CY }, { zh: 'S3', en: 'S3', css: MG }, { zh: '其余', en: 'other', css: DIM }], true), digest: legend(BANDS, true), problems: legend(KINDS, true) }[S.mode];
  $('c2Title').textContent = { growth: T('每天的合并数', 'Merges per day'), areas: T('按层级的 Lean 模块', 'Lean modules by stratum'), digest: T('已闭合的比例', 'Closed share'), problems: T('每天的新卷宗', 'New dossiers per day') }[S.mode];
  $('c2Meta').textContent = S.mode === 'growth' ? T(`当天 ${PERDAY[c]}`, `this day ${PERDAY[c]}`) : '';
  $('clock').innerHTML = D.days[c];
  $('hudBig').textContent = `${D.days[c]} · ${{ growth: T('生长丝带', 'growth ribbons'), areas: T('领域城市', 'area skyline'), digest: T('消化账目', 'digestion ledger'), problems: T('问题日历', 'problem calendar') }[S.mode]}`;
  $('hudSub').textContent = { growth: T('横轴：日期；每条丝带一个计数；亮 = 已经过去，暗 = 还没到', 'across: date; one ribbon per count; bright = past, dim = still to come'),
    areas: T('横轴：日期；每条丝带一个领域，高度 = ' + (S.area === 'frozen' ? '冻结模块数' : 'Lean 模块数'), 'across: date; one ribbon per area, height = ' + (S.area === 'frozen' ? 'frozen modules' : 'Lean modules')),
    digest: T('横轴：日期；四层的高度 = 各目录的账目条目数', 'across: date; the four layers = account entries in each directory'),
    problems: T('列 = 周，行 = 星期几，塔高 = 当天的新卷宗', 'columns = weeks, rows = weekdays, tower height = new dossiers that day') }[S.mode];
}
function syncRail() {
  const key = TRV.lang(); if ($('marks').dataset.key === key) return; $('marks').dataset.key = key;
  const lang = key === 'en' ? 'en' : 'zh', marks = [[0, D.days[0].slice(5)]];
  D.days.forEach((d, i) => { if (d.slice(8) === '01') marks.push([i / (N - 1), MONTHS[lang][+d.slice(5, 7) - 1]]); });
  marks.push([1, D.days[N - 1].slice(5)]);
  $('marks').innerHTML = marks.map(([f, s], i) => `<i class="${i === 0 ? 'first' : i === marks.length - 1 ? 'last' : ''}" style="left:${(f * 100).toFixed(2)}%">${s}</i>`).join('');
}
function markPreset() { document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === S.preset))); }
function custom() { S.preset = null; markPreset(); dirty = true; }
document.querySelectorAll('#modeChips .chip').forEach((b) => b.addEventListener('click', () => { const m = MODES.includes(b.dataset.mode) ? b.dataset.mode : 'growth'; if (S.mode === m) return; S.mode = m; custom(); }));
document.querySelectorAll('#scaleChips .chip').forEach((b) => b.addEventListener('click', () => { S.scale = b.dataset.scale === 'log' ? 'log' : 'norm'; custom(); }));
document.querySelectorAll('#areaChips .chip').forEach((b) => b.addEventListener('click', () => { S.area = b.dataset.area === 'frozen' ? 'frozen' : 'd5'; custom(); }));
document.querySelectorAll('#camChips .chip').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); setCamPreset(b.dataset.cam); }));
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  S.mode = p.mode; S.scale = p.scale; S.area = p.area;
  S.preset = name; markPreset(); dirty = true;
  S.nowFrac = fracOf(p.day); S.playing = !reduceMotion && p.play; S.dir = 1; S.hold = 0; setPlayUI(); $('now').value = S.nowFrac;
  TRV.glitch($('app'));
}
document.querySelectorAll('.preset').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));

$('now').addEventListener('input', () => { S.nowFrac = parseFloat($('now').value); S.hold = 0; });
let scrubbing = false;
$('now').addEventListener('pointerdown', () => { scrubbing = true; });
window.addEventListener('pointerup', () => { scrubbing = false; });
window.addEventListener('pointercancel', () => { scrubbing = false; });

function setPlayUI() { $('play').textContent = S.playing ? '❚❚' : '▶'; $('play').setAttribute('aria-pressed', String(S.playing)); $('rev').setAttribute('aria-pressed', String(S.dir < 0)); }
$('play').addEventListener('click', () => { S.playing = !S.playing; S.hold = 0; if (S.playing && S.nowFrac >= 1 && S.dir > 0) S.nowFrac = 0; setPlayUI(); });
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
    ev.preventDefault(); const d = ev.key === 'ArrowRight' ? 1 : -1; jumpTo(Math.min(N - 1, Math.max(0, dayIndex() + d)) / (N - 1));
  }
  else if (ev.key === 'e' || ev.key === 'E') jumpTo(1);
});
TRV.onLang(() => { syncedKey = ''; syncOutputs(); $('marks').dataset.key = ''; });

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
let glKey = '';
function frame(tms) {
  frameCount++;
  const dtSec = Math.min(0.1, (tms - lastT) / 1000); lastT = tms;
  if (S.playing && !scrubbing) {
    if (S.hold > 0) { S.hold -= dtSec; if (S.hold <= 0) { S.nowFrac = S.dir > 0 ? 0 : 1; toasted = false; } }
    else {
      S.nowFrac += S.dir * dtSec * S.speed / RUN;
      if (S.nowFrac >= 1) { S.nowFrac = 1; S.hold = 2.4; }
      if (S.nowFrac <= 0) { S.nowFrac = 0; S.hold = 1.2; }
    }
    $('now').value = S.nowFrac;
  }
  syncOutputs(); syncRail();
  if (glOK) { updateCamera(dtSec); const k = `${S.mode}|${S.scale}|${S.area}|${dayIndex()}`; if (k !== glKey) { updateGL(); glKey = k; } renderer.render(scene3, camera); updateTags(); }
  drawMain(); drawSide();
  requestAnimationFrame(frame);
}

/* read-only probe for automated browser tests */
window.LG_DEBUG = {
  pending: () => dirty || syncedKey !== `${S.mode}|${S.scale}|${S.area}|${dayIndex()}|${TRV.lang()}|${S.preset}`,
  frames: () => frameCount,
  state: () => JSON.parse(JSON.stringify(S)),
  info: () => {
    const c = dayIndex(), R = S.mode === 'growth' || S.mode === 'areas' ? ribbonsFor(S.mode) : null;
    return { mode: S.mode, scale: S.scale, area: S.area, i: c, day: D.days[c], sha: D.sha[c], frozen: FROZEN[c], closed: CLOSED[c], entries: ENTRIES[c], share: SHARE[c], perDay: PERDAY[c],
      ribbons: R ? R.map((r) => ({ key: r.key, value: r.v[c], height: r.h[c], top: r.h[N - 1] })) : null,
      cal: { week: CAL[c].week, wd: CAL[c].wd, weeks: WEEKS }, cum: { proved: cumNew('proved', c), refuted: cumNew('refuted', c), none: cumNew('none', c) } };
  },
  setFrac: (f) => { S.nowFrac = Math.min(1, Math.max(0, f)); $('now').value = S.nowFrac; }
};

/* cover state for scripts/thumbs.mjs */
window.TRV_THUMB = () => { applyPreset('now'); S.playing = false; setPlayUI(); setCamPreset('iso'); };

initGL();
if (glOK) { new ResizeObserver(resize).observe(stage); resize(); setCamPreset('iso'); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.r = cam.tR; }
applyPreset('now');
setPlayUI();
requestAnimationFrame(frame);
})();
