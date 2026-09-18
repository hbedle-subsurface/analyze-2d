/* ============================ page shell ============================
   What every step page shares: the masthead, the workflow strip, the section
   panels with their axes, color bars and readout, the display controls, the
   reference window, and the glossary.

   Geometry. Every section carries the index of its first trace (i0) and first
   sample (j0) in the line as read, so a panel drawn from a crop is placed on
   the right distance and time axes. Distance comes from the CDP coordinates
   when the file has them, otherwise from the trace spacing entered on step 1. */

const $ = id => document.getElementById(id);

const STEPS = [
  {id:"line",       n:1, file:"1-line.html",       title:"Open the line",    stage:"crop",
   blurb:"SEG-Y headers, trace spacing, and the part of the line to work on."},
  {id:"bandwidth",  n:2, file:"2-bandwidth.html",  title:"Bandwidth",        stage:null,
   blurb:"The frequencies the line carries, and how the band changes with time."},
  {id:"fk",         n:3, file:"3-fk.html",         title:"f-k filter",       stage:"fk",
   blurb:"Rejection of steep dips and of frequencies outside the band."},
  {id:"sos",        n:4, file:"4-sos.html",        title:"Structure-oriented smoothing", stage:"sos",
   blurb:"Smoothing along reflectors, with the edges of faults protected."},
  {id:"balance",    n:5, file:"5-balance.html",    title:"Spectral balancing", stage:"balance",
   blurb:"Time-variant balancing and whitening over a filter bank."},
  {id:"detail",     n:6, file:"6-detail.html",     title:"Detail boost",     stage:"detail",
   blurb:"Separation of the section into a base and a detail part."},
  {id:"attributes", n:7, file:"7-attributes.html", title:"Attributes",       stage:null,
   blurb:"Twenty-two attributes, their correlation, and the striping check."},
  {id:"som",        n:8, file:"8-som.html",        title:"Self-organizing map", stage:null,
   blurb:"Unsupervised classes from a chosen set of attributes, with a null test."},
  {id:"shap",       n:9, file:"9-shap.html",       title:"SHAP",             stage:null,
   blurb:"Which attributes decide where each sample lands on the map."},
  {id:"refine",     n:10, file:"10-refine.html",   title:"Refine and compare", stage:null,
   blurb:"A second map with a revised attribute set, compared with the first."}
];

let LINE = null;       // {name, file, nx, ns, dt, delayMs, dx, dist}
let DISP = {cmap:"gray", clip:99, gain:1, polarity:1};
const PREFIX = location.pathname.includes("/pages/") ? "../" : "";

/* ---------- geometry ---------- */
function kmAt(iRaw){
  if (!LINE) return iRaw;
  const i = Math.max(0, Math.min(LINE.nx - 1, iRaw));
  return LINE.dist ? LINE.dist[i] / 1000 : i * (LINE.dx || 1) / 1000;
}
function secAt(jRaw){
  if (!LINE) return jRaw;
  return (LINE.delayMs || 0) / 1000 + jRaw * LINE.dt * 1e-6;
}
function sectionOf(rec){
  if (!rec) return null;
  return {data: rec.data, nx: rec.nx, ns: rec.ns, dt: rec.dt, j0: rec.j0 || 0,
          i0: (rec.meta && rec.meta.i0) || 0, stage: rec.stage, meta: rec.meta || {}, ts: rec.ts};
}
function extentOf(sec){
  return {x0: kmAt(sec.i0), x1: kmAt(sec.i0 + sec.nx - 1),
          t0: secAt(sec.j0), t1: secAt(sec.j0 + sec.ns - 1)};
}

/* ---------- small helpers ---------- */
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
function debounce(fn, ms){
  let t = 0;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
function setBusy(msg){
  const b = $("busy");
  if (!b) return;
  b.textContent = msg || "";
  b.hidden = !msg;
}
function energyShare(rem, inp){
  let a = 0, b = 0;
  for (let k = 0; k < inp.length; k++){ a += rem[k]*rem[k]; b += inp[k]*inp[k]; }
  return b > 0 ? 100 * a / b : 0;
}
function fmt(v, d){ return isFinite(v) ? v.toFixed(d === undefined ? 2 : d) : "–"; }

/* ---------- header, step tags, cards, footer ---------- */
/* Axes and color bars sit on the dark board, so they are drawn in chalk. */
AX = {rule:"#3b4549", tick:"#9fb0b6", label:"#dfe6e9",
      font:"11px Barlow, Arial, sans-serif", labelFont:"12px Barlow, Arial, sans-serif"};

async function pageShell(stepId){
  LINE = await kvGet("line");
  const d = await kvGet("display");
  if (d) DISP = Object.assign(DISP, d);
  const have = await stageList().catch(() => []);
  const top = document.createElement("header");
  top.className = "bar no-gloss";
  const tags = STEPS.map(s => {
    let cls = "tag";
    if (s.stage && s.id !== "line" && !have.includes(s.stage)) cls += " skipped";
    return '<a class="' + cls + '" href="' + PREFIX + 'pages/' + s.file + '"' +
      (s.id === stepId ? ' aria-current="page"' : "") + ' title="' + s.blurb + '"><span>' + s.n + "</span>" + s.title + "</a>";
  }).join("");
  top.innerHTML =
    '<div class="case"><h1><a href="' + PREFIX + 'index.html">Analyze 2D</a></h1>' +
    "<p>Attributes, self-organizing maps and SHAP on a 2D seismic line</p></div>" +
    '<nav class="stages" aria-label="Steps"><button class="tag methods" data-help="start">Reference</button>' + tags + "</nav>";
  document.body.prepend(top);

  // the controls on the right are grouped into pinned cards, one per heading
  const side = document.querySelector("aside.side");
  if (side) cardify(side);

  const foot = document.createElement("footer");
  foot.className = "foot";
  foot.innerHTML =
    "<p>The file is read in this browser and never uploaded. Analyze 2D, Heather Bedle, University of Oklahoma, with the AASPI consortium. " +
    'Content <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. ' +
    "Sample seismic: SCAN line L2EBN2020ASCAN029, EBN and TNO, via NLOG; see NOTICE.md.</p>";
  document.body.append(foot);
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-help]");
    if (b){ e.preventDefault(); openHelp(b.dataset.help); }
  });
  return LINE;
}

/* Wrap the loose children of a column into cards, starting a new card at
   every h2. Children that are already cards are left as they are. */
function cardify(col){
  const kids = [...col.children];
  let card = null;
  for (const el of kids){
    if (el.classList.contains("card")){ card = null; continue; }
    if (el.tagName === "H2" || !card){
      card = document.createElement("div");
      card.className = "card";
      col.insertBefore(card, el);
    }
    card.append(el);
  }
}

/* The next step link under the panels. */
function nextLink(stepId){
  const i = STEPS.findIndex(s => s.id === stepId);
  const nx = STEPS[i + 1];
  if (!nx) return "";
  return '<div class="nextstep no-gloss"><a href="' + nx.file + '">Next: ' + nx.n + ". " + nx.title + "</a></div>";
}

function emptyState(host, msg){
  host.innerHTML = '<div class="empty"><p>' + msg + "</p>" +
    '<p><a href="' + PREFIX + 'index.html">Open a line</a> to start.</p></div>';
}

/* ---------- reference window ---------- */
let helpWin = null;
function openHelp(key){
  if (typeof HELP === "undefined") return;
  if (!HELP[key]) key = "start";
  if (!helpWin || helpWin.closed){
    helpWin = window.open("", "a2d-reference", "width=720,height=820,scrollbars=yes");
    if (!helpWin) return;
    helpWin.document.open();
    helpWin.document.write(helpDocument());
    helpWin.document.close();
  }
  setTimeout(() => {
    try {
      const el = helpWin.document.getElementById(key);
      if (el) el.scrollIntoView();
      helpWin.focus();
    } catch (e){}
  }, 60);
}

/* ---------- panels ---------- */
/* Zoom. VIEW is the part of the section on screen, in sample indices of the
   section the page works on, or null for all of it. Every panel on a page
   shares it, so a feature stays lined up from one panel to the next. The color
   scale is always taken from the whole section, so zooming in does not change
   what a color means. */
let VIEW = null, REDRAW = () => {}, DRAGMODE = "zoom";
const PANEL_ACT = {};                 // per panel: {select, click}
function onView(fn){ REDRAW = fn; }
function viewOf(sec){
  if (!VIEW) return {i0: 0, i1: sec.nx - 1, j0: 0, j1: sec.ns - 1};
  const i0 = Math.max(0, Math.min(sec.nx - 2, VIEW.i0)), j0 = Math.max(0, Math.min(sec.ns - 2, VIEW.j0));
  return {i0, i1: Math.max(i0 + 1, Math.min(sec.nx - 1, VIEW.i1)), j0, j1: Math.max(j0 + 1, Math.min(sec.ns - 1, VIEW.j1))};
}
function sliceArr(arr, sec, v){
  const nx = v.i1 - v.i0 + 1, ns = v.j1 - v.j0 + 1;
  if (nx === sec.nx && ns === sec.ns) return arr;
  const o = new Float32Array(nx * ns);
  for (let i = 0; i < nx; i++) o.set(arr.subarray((v.i0 + i) * sec.ns + v.j0, (v.i0 + i) * sec.ns + v.j0 + ns), i * ns);
  return o;
}
function sliceSec(sec, v){
  return Object.assign({}, sec, {nx: v.i1 - v.i0 + 1, ns: v.j1 - v.j0 + 1, i0: sec.i0 + v.i0, j0: sec.j0 + v.j0});
}
/* Position of section sample (i, j) as a fraction of the panel frame. */
function fracOf(id, i, j){
  const P = PANEL_DATA[id];
  const v = P ? P.v : {i0: 0, i1: 1, j0: 0, j1: 1};
  return {x: (i - v.i0) / Math.max(1, v.i1 - v.i0), y: (j - v.j0) / Math.max(1, v.j1 - v.j0)};
}

/* The bar above the panels: whole section, zoom out, and on pages where a drag
   also selects something, which of the two a drag does. */
function viewBar(host, selectLabel){
  const bar = document.createElement("div");
  bar.className = "viewbar";
  bar.innerHTML =
    '<div class="seg" role="group" aria-label="Zoom">' +
      '<button id="vbWhole" aria-pressed="true">Whole section</button>' +
      '<button id="vbOut">Zoom out</button></div>' +
    (selectLabel ? '<div class="seg" role="group" aria-label="Drag on the section">' +
      '<button id="vbSel" aria-pressed="true">Drag to ' + selectLabel + '</button>' +
      '<button id="vbZoom" aria-pressed="false">Drag to zoom</button></div>' : "") +
    '<span class="readout" id="vbText">' + (selectLabel ? "" : "Drag a box on any panel to zoom in.") + "</span>";
  host.prepend(bar);
  DRAGMODE = selectLabel ? "select" : "zoom";
  const sync = () => {
    $("vbWhole").setAttribute("aria-pressed", String(!VIEW));
    if (selectLabel){
      $("vbSel").setAttribute("aria-pressed", String(DRAGMODE === "select"));
      $("vbZoom").setAttribute("aria-pressed", String(DRAGMODE === "zoom"));
    }
  };
  $("vbWhole").addEventListener("click", () => { VIEW = null; sync(); REDRAW(); });
  $("vbOut").addEventListener("click", () => {
    if (!VIEW) return;
    const w = VIEW.i1 - VIEW.i0, h = VIEW.j1 - VIEW.j0, ci = (VIEW.i0 + VIEW.i1) / 2, cj = (VIEW.j0 + VIEW.j1) / 2;
    VIEW = {i0: Math.round(ci - w), i1: Math.round(ci + w), j0: Math.round(cj - h), j1: Math.round(cj + h)};
    const any = Object.values(PANEL_DATA)[0];
    if (any && VIEW.i0 <= 0 && VIEW.j0 <= 0 && VIEW.i1 >= any.sec.nx - 1 && VIEW.j1 >= any.sec.ns - 1) VIEW = null;
    sync(); REDRAW();
  });
  if (selectLabel){
    $("vbSel").addEventListener("click", () => { DRAGMODE = "select"; sync(); });
    $("vbZoom").addEventListener("click", () => { DRAGMODE = "zoom"; sync(); });
  }
  VIEWSYNC = sync;
}
let VIEWSYNC = () => {};

function makePanel(host, id, title, opts){
  opts = opts || {};
  const el = document.createElement("div");
  el.className = "panel";
  el.id = id;
  el.innerHTML =
    '<div class="cap"><h3 id="' + id + '-title">' + title + '</h3><span class="pnote" id="' + id + '-note"></span>' +
      (opts.tools ? '<span class="ptools" id="' + id + '-tools"></span>' : "") + "</div>" +
    '<div class="plot" style="--ph:' + (opts.height || 300) + 'px">' +
      '<canvas class="yax" id="' + id + '-y"></canvas>' +
      '<div class="frame crosshair" id="' + id + '-frame">' +
        '<canvas class="img" id="' + id + '-img"></canvas>' +
        '<canvas class="cls" id="' + id + '-cls"></canvas>' +
        '<canvas class="ovl" id="' + id + '-ovl"></canvas>' +
        '<div class="ro" id="' + id + '-ro" hidden></div>' +
      "</div>" +
      '<canvas class="cb" id="' + id + '-cb"></canvas>' +
      '<canvas class="xax" id="' + id + '-x"></canvas>' +
    "</div>";
  host.append(el);
  PANEL_ACT[id] = PANEL_ACT[id] || {};
  wireDrag(id);
  return el;
}

function frameRows(id, ns){
  const fr = $(id + "-frame");
  const h = Math.round(fr.getBoundingClientRect().height * (window.devicePixelRatio || 1));
  return Math.max(50, Math.min(ns, h || ns));
}

function drawAxes(id, sub){
  const e = extentOf(sub);
  drawYAxis(id + "-y", e.t0, e.t1, "two-way time (s)", 1, 0);
  drawXAxis(id + "-x", e.x0, e.x1, LINE && (LINE.dist || LINE.dx) ? "distance along the line (km)" : "trace");
}

function seisClip(arr){
  return (percentileAbs(arr, DISP.clip) || 1e-30) / (DISP.gain || 1);
}

/* The seismic, sliced to the view, drawn into a canvas. */
function paintSeis(canvas, id, sec, arr, c){
  const v = viewOf(sec), a = sliceArr(arr, sec, v), sub = sliceSec(sec, v);
  DISPLAY_H = frameRows(id, sub.ns);
  const lo = DISP.polarity > 0 ? -c : c, hi = DISP.polarity > 0 ? c : -c;
  draw(canvas, a, sub.nx, sub.ns, lo, hi, buildLUT(DISP.cmap));
  return {v, sub};
}

/* A seismic amplitude panel. clip: the amplitude at the ends of the color bar,
   shared between panels that are compared. */
function drawSeis(id, sec, arr, clip, noteText){
  const c = clip || seisClip(arr);
  const lut = buildLUT(DISP.cmap);
  const {v, sub} = paintSeis($(id + "-img"), id, sec, arr, c);
  clearCanvas($(id + "-cls"));
  drawAxes(id, sub);
  drawColorbar(id + "-cb", -c, c, DISP.polarity > 0 ? lut : flipLut(lut), "amplitude");
  if (noteText !== undefined) $(id + "-note").textContent = noteText;
  PANEL_DATA[id] = Object.assign(PANEL_DATA[id] || {}, {sec, arr, v, unit: ""});
  return c;
}
function clearCanvas(cv){ cv.width = 1; cv.height = 1; cv.getContext("2d").clearRect(0, 0, 1, 1); cv.style.opacity = 1; }
function flipLut(lut){
  // the color bar is drawn low value at the bottom; with polarity reversed the
  // colors run the other way along the same numeric axis
  const out = new Uint8ClampedArray(lut.length);
  for (let i = 0; i < 512; i++) for (let c = 0; c < 3; c++) out[i*3+c] = lut[(511-i)*3+c];
  return out;
}

/* An attribute panel. With alpha below 1 the attribute is drawn over the
   seismic at that opacity, which is co-rendering; at 1 the attribute alone. */
function drawAttrPanel(id, sec, arr, vmin, vmax, cmap, label, noteText, alpha, seis){
  const lut = buildLUT(cmap);
  const v = viewOf(sec), sub = sliceSec(sec, v), a = sliceArr(arr, sec, v);
  DISPLAY_H = frameRows(id, sub.ns);
  const co = alpha !== undefined && alpha < 1 && seis;
  if (co){
    paintSeis($(id + "-img"), id, sec, seis, seisClip(seis));
    DISPLAY_H = frameRows(id, sub.ns);
    drawRange($(id + "-cls"), a, sub.nx, sub.ns, vmin, vmax, lut);
    $(id + "-cls").style.opacity = alpha;
  } else {
    drawRange($(id + "-img"), a, sub.nx, sub.ns, vmin, vmax, lut);
    clearCanvas($(id + "-cls"));
  }
  drawAxes(id, sub);
  drawColorbar(id + "-cb", vmin, vmax, lut, label || "");
  if (noteText !== undefined) $(id + "-note").textContent = noteText;
  PANEL_DATA[id] = Object.assign(PANEL_DATA[id] || {}, {sec, arr, v, unit: label || ""});
}

function drawRGBPanel(id, sec, ch, scales, noteText, alpha, seis){
  const v = viewOf(sec), sub = sliceSec(sec, v);
  const chs = ch.map(c => sliceArr(c, sec, v));
  DISPLAY_H = frameRows(id, sub.ns);
  const co = alpha !== undefined && alpha < 1 && seis;
  if (co){
    paintSeis($(id + "-img"), id, sec, seis, seisClip(seis));
    DISPLAY_H = frameRows(id, sub.ns);
    drawRGB($(id + "-cls"), chs, scales, sub.nx, sub.ns);
    $(id + "-cls").style.opacity = alpha;
  } else {
    drawRGB($(id + "-img"), chs, scales, sub.nx, sub.ns);
    clearCanvas($(id + "-cls"));
  }
  drawAxes(id, sub);
  const cb = $(id + "-cb"); const g = cb.getContext("2d"); g.clearRect(0, 0, cb.width, cb.height);
  if (noteText !== undefined) $(id + "-note").textContent = noteText;
  PANEL_DATA[id] = Object.assign(PANEL_DATA[id] || {}, {sec, arr: null, v});
}

/* ---------- readout ---------- */
const PANEL_DATA = {};
/* The section sample under the pointer, in indices of the whole section. */
function frameToSample(id, ev, loose){
  const P = PANEL_DATA[id];
  if (!P) return null;
  const r = $(id + "-frame").getBoundingClientRect();
  let u = (ev.clientX - r.left) / r.width, w = (ev.clientY - r.top) / r.height;
  if (!loose && (u < 0 || u > 1 || w < 0 || w > 1)) return null;
  u = Math.max(0, Math.min(1, u)); w = Math.max(0, Math.min(1, w));
  const v = P.v;
  const i = Math.round(v.i0 + u * (v.i1 - v.i0)), j = Math.round(v.j0 + w * (v.j1 - v.j0));
  return {i, j, u, v: w};
}
function attachReadout(id){
  const fr = $(id + "-frame"), ro = $(id + "-ro");
  fr.addEventListener("mousemove", ev => {
    const P = PANEL_DATA[id], s = frameToSample(id, ev);
    if (!P || !s){ ro.hidden = true; return; }
    const km = kmAt(P.sec.i0 + s.i), t = secAt(P.sec.j0 + s.j);
    let txt = fmt(km, 2) + " km, " + fmt(t, 3) + " s";
    if (P.arr) txt += ", " + P.arr[s.i * P.sec.ns + s.j].toPrecision(3);
    if (P.extra) txt += P.extra(s);
    ro.textContent = txt; ro.hidden = false;
  });
  fr.addEventListener("mouseleave", () => { ro.hidden = true; });
}

/* ---------- boxes drawn and dragged on a panel ---------- */
function drawBoxOverlay(id, box, sec, dim){
  const cv = $(id + "-ovl");
  const {ctx, w, h} = fitCanvas(cv);
  if (!box) return;
  const a = fracOf(id, box.i0, box.j0), b = fracOf(id, box.i1, box.j1);
  const x0 = a.x * w, x1 = b.x * w, y0 = a.y * h, y1 = b.y * h;
  if (dim){
    ctx.fillStyle = "rgba(17,17,17,0.6)";
    ctx.fillRect(0, 0, w, Math.max(0, y0)); ctx.fillRect(0, y1, w, h - y1);
    ctx.fillRect(0, y0, Math.max(0, x0), y1 - y0); ctx.fillRect(x1, y0, w - x1, y1 - y0);
  }
  ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
}

/* A drag on any panel either zooms every panel on the page or, on pages that
   select something with a box and with that mode chosen, hands the box to the
   page. A drag too small to be a box is a click. */
function wireDrag(id){
  const fr = $(id + "-frame");
  let a = null;
  fr.addEventListener("mousedown", ev => { a = frameToSample(id, ev); ev.preventDefault(); });
  window.addEventListener("mousemove", ev => {
    if (!a) return;
    const b = frameToSample(id, ev, true);
    if (!b) return;
    const P = PANEL_DATA[id];
    const box = {i0: Math.min(a.i, b.i), i1: Math.max(a.i, b.i), j0: Math.min(a.j, b.j), j1: Math.max(a.j, b.j)};
    if (Math.abs(a.u - b.u) + Math.abs(a.v - b.v) > 0.01) drawBoxOverlay(id, box, P.sec, false);
  });
  window.addEventListener("mouseup", ev => {
    if (!a) return;
    const b = frameToSample(id, ev, true) || a;
    const start = a; a = null;
    const act = PANEL_ACT[id] || {};
    const small = Math.abs(start.u - b.u) < 0.01 && Math.abs(start.v - b.v) < 0.01;
    if (small){ if (act.click) act.click(start); else REDRAW(); return; }
    const box = {i0: Math.min(start.i, b.i), i1: Math.max(start.i, b.i), j0: Math.min(start.j, b.j), j1: Math.max(start.j, b.j)};
    if (act.select && DRAGMODE === "select"){
      if (box.i1 - box.i0 < 8 || box.j1 - box.j0 < 16){ REDRAW(); return; }
      act.select(box); return;
    }
    if (box.i1 - box.i0 < 4 || box.j1 - box.j0 < 8){ REDRAW(); return; }
    VIEW = box; VIEWSYNC(); REDRAW();
  });
}
function enableBox(id, onBox){ PANEL_ACT[id] = Object.assign(PANEL_ACT[id] || {}, {select: box => onBox(box)}); }
function onPanelClick(id, fn){ PANEL_ACT[id] = Object.assign(PANEL_ACT[id] || {}, {click: fn}); }

/* ---------- display controls ---------- */
function displayControls(host, onChange){
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML =
    '<h2>Display<button class="help" data-help="display">Learn more</button></h2>' +
    '<label for="dCmap">Color map</label>' +
    '<select id="dCmap">' +
      '<option value="gray">Gray, black to white</option>' +
      '<option value="graygb">Gray, white to black</option>' +
      '<option value="seis">Blue, black, red</option>' +
      '<option value="bwr">Blue, white, red</option>' +
      '<option value="vik">Vik, diverging</option></select>' +
    '<label for="dClip">Clip at percentile <b><span id="v-dClip"></span></b></label>' +
    '<input type="range" id="dClip" min="90" max="99.9" step="0.1">' +
    '<label for="dGain">Display gain <b><span id="v-dGain"></span>×</b></label>' +
    '<input type="range" id="dGain" min="0.25" max="4" step="0.05">' +
    '<label class="toggle"><input type="checkbox" id="dPol"> Reverse polarity</label>';
  host.append(div);
  const sync = () => {
    $("dCmap").value = DISP.cmap; $("dClip").value = DISP.clip; $("dGain").value = DISP.gain;
    $("dPol").checked = DISP.polarity < 0;
    $("v-dClip").textContent = (+DISP.clip).toFixed(1);
    $("v-dGain").textContent = (+DISP.gain).toFixed(2);
  };
  sync();
  const upd = () => {
    DISP = {cmap: $("dCmap").value, clip: +$("dClip").value, gain: +$("dGain").value,
            polarity: $("dPol").checked ? -1 : 1};
    sync(); kvSet("display", DISP).catch(() => {});
    onChange();
  };
  ["dCmap", "dClip", "dGain", "dPol"].forEach(k => $(k).addEventListener("input", upd));
}

/* ---------- small line plots on fixed axes ---------- */
function plotFrame(cv, xr, yr, xl, yl){
  const {ctx, w, h, ok} = fitCanvas(cv);
  if (!ok) return null;
  const L = 48, R = 10, T = 10, B = 34;
  const X = v => L + (v - xr[0]) / (xr[1] - xr[0]) * (w - L - R);
  const Y = v => T + (1 - (v - yr[0]) / (yr[1] - yr[0])) * (h - T - B);
  ctx.strokeStyle = "#C9CDD2"; ctx.fillStyle = "#5C6670"; ctx.lineWidth = 1;
  ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (const v of niceTicks(xr[0], xr[1], Math.max(3, Math.round(w / 80)))){
    ctx.beginPath(); ctx.moveTo(X(v) + .5, T); ctx.lineTo(X(v) + .5, h - B); ctx.stroke();
    ctx.fillText(fmtTick(v, 1), X(v), h - B + 4);
  }
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (const v of niceTicks(Math.min(yr[0], yr[1]), Math.max(yr[0], yr[1]), Math.max(3, Math.round(h / 45)))){
    ctx.beginPath(); ctx.moveTo(L, Y(v) + .5); ctx.lineTo(w - R, Y(v) + .5); ctx.stroke();
    ctx.fillText(fmtTick(v, 1), L - 5, Y(v));
  }
  ctx.fillStyle = "#16191C"; ctx.font = "10px 'IBM Plex Sans', system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillText(xl, (L + w - R) / 2, h - 2);
  ctx.save(); ctx.translate(10, (T + h - B) / 2); ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = "middle"; ctx.fillText(yl, 0, 0); ctx.restore();
  ctx.strokeStyle = "#5C6670"; ctx.strokeRect(L + .5, T + .5, w - L - R, h - T - B);
  return {ctx, X, Y, w, h, L, R, T, B};
}
function plotLine(P, xs, ys, color, width, dash){
  const {ctx, X, Y} = P;
  ctx.save();
  ctx.beginPath();
  ctx.rect(P.L, P.T, P.w - P.L - P.R, P.h - P.T - P.B); ctx.clip();
  ctx.strokeStyle = color; ctx.lineWidth = width || 1.5; ctx.setLineDash(dash || []);
  ctx.beginPath();
  for (let k = 0; k < xs.length; k++){
    const x = X(xs[k]), y = Y(ys[k]);
    if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.stroke(); ctx.restore();
}

/* Amplitude spectrum in decibels relative to its own peak. */
function specDb(a){
  let mx = 0; for (let k = 1; k < a.length; k++) if (a[k] > mx) mx = a[k];
  const out = new Float32Array(a.length);
  for (let k = 0; k < a.length; k++) out[k] = Math.max(-80, 20 * Math.log10((a[k] || 1e-20) / (mx || 1e-20)));
  return out;
}
/* The frequency axis is held at one range for the whole line so a curve can be
   compared from page to page: the Nyquist frequency, capped at 150 Hz. */
function fAxisMax(dt_us){ return Math.min(150, 0.5 / (dt_us * 1e-6)); }

/* ---------- measured band and modern-data presets ---------- */
async function measuredBand(){
  return kvGet("band");
}
