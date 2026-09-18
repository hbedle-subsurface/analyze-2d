/* ======================= SOM and SHAP display =======================
   Drawing shared by steps 8 and 9: the colors of the neurons, the trained map
   as a key beside the section, the classes over the section, and bar charts on
   fixed axes. */

/* Neuron color by position on the map, blended between four corner colors, so
   neighboring neurons take neighboring colors and the section reads as a
   continuum. Corners: top-left, top-right, bottom-left, bottom-right. */
const CORNERS = [[44, 123, 182], [215, 25, 28], [255, 217, 47], [26, 152, 80]];
function neuronColors(side){
  const out = [];
  for (let r = 0; r < side; r++) for (let c = 0; c < side; c++){
    const u = side > 1 ? c / (side - 1) : 0.5, v = side > 1 ? r / (side - 1) : 0.5;
    out.push([0, 1, 2].map(i => Math.round((1-u)*(1-v)*CORNERS[0][i] + u*(1-v)*CORNERS[1][i] +
                                            (1-u)*v*CORNERS[2][i] + u*v*CORNERS[3][i])));
  }
  return out;
}

const SOM_KEYS = ["amp", "envelope", "rms", "sweetness", "tke", "tkv", "avt", "rai",
                  "insphase", "cosphase", "insfreq", "wavfreq", "wavphase", "avgfreq", "avgband", "band",
                  "dip", "linearity", "coherence"];
function attrName(k){ return k === "amp" ? "Seismic amplitude" : ATTR_META[k].n; }
function attrShort(k){ return k === "amp" ? "amp" : ATTR_META[k].s; }

function runLabel(r){ return "Run " + r.n + ": " + r.keys.length + " attributes, " + (r.side * r.side) + " neurons"; }

/* The classes drawn over the section in the panel's class layer. hidden: a Set
   of neurons not drawn, so the seismic shows through where they are. */
function drawClasses(id, sec, run, alpha, hidden, opt){
  opt = opt || {};
  const cv = $(id + "-cls");
  const {ctx, w, h} = opt.keep ? {ctx: cv.getContext("2d"), w: cv.getBoundingClientRect().width, h: cv.getBoundingClientRect().height} : fitCanvas(cv);
  cv.style.opacity = 1;
  if (!run) return;
  const cols = neuronColors(run.side);
  const tmp = document.createElement("canvas");
  tmp.width = run.gnx; tmp.height = run.gnt;
  const g = tmp.getContext("2d"), img = g.createImageData(run.gnx, run.gnt);
  for (let i = 0; i < run.gnx; i++) for (let j = 0; j < run.gnt; j++){
    const k = run.bmu[i * run.gnt + j], o = (j * run.gnx + i) * 4;
    if (hidden && hidden.has(k)) continue;
    img.data[o] = cols[k][0]; img.data[o+1] = cols[k][1]; img.data[o+2] = cols[k][2]; img.data[o+3] = 255;
  }
  g.putImageData(img, 0, 0);
  const W = run.win;
  const p0 = fracOf(id, W.i0 - 0.5, W.j0 - 0.5 * run.tstep), p1 = fracOf(id, W.i0 + run.gnx - 0.5, W.j0 + (run.gnt - 0.5) * run.tstep);
  const x0 = p0.x * w, x1 = p1.x * w, y0 = p0.y * h, y1 = p1.y * h;
  ctx.save();
  if (opt.clip){ ctx.beginPath(); ctx.rect(opt.clip[0] * w, 0, (opt.clip[1] - opt.clip[0]) * w, h); ctx.clip(); }
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  ctx.drawImage(tmp, x0, y0, x1 - x0, y1 - y0);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 1; ctx.setLineDash([5, 3]);
  ctx.strokeRect(x0 + .5, y0 + .5, x1 - x0 - 1, y1 - y0 - 1);
  ctx.restore();
}

/* Class share of the visible neurons, for the key captions. */
function shownShare(run, hidden){
  return run.hits.reduce((a, h, k) => a + (hidden && hidden.has(k) ? 0 : h), 0);
}

/* Click hides or shows one neuron; shift-click shows that neuron alone, and a
   second shift-click brings the rest back. */
function toggleNeuron(run, hidden, k, solo){
  const N = run.side * run.side;
  if (solo){
    const isSolo = hidden.size === N - 1 && !hidden.has(k);
    hidden.clear(); if (!isSolo) for (let q = 0; q < N; q++) if (q !== k) hidden.add(q);
  } else if (hidden.has(k)) hidden.delete(k); else hidden.add(k);
}

/* The trained map. With path, the SHAP path of one sample is drawn on it. */
function drawGrid(c, run, hidden, path){
  const r0 = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  c.width = Math.round(r0.width * dpr); c.height = Math.round(r0.width * dpr);
  const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = r0.width, pad = 8;
  g.fillStyle = "#fffaf0"; g.fillRect(0, 0, w, w);
  if (!run){ g.fillStyle = "#5C6670"; g.font = "12px 'IBM Plex Sans', system-ui"; g.textAlign = "center"; g.fillText("No map trained yet", w / 2, w / 2); return; }
  const cols = neuronColors(run.side), cell = (w - 2 * pad) / run.side, maxHit = Math.max(...run.hits);
  for (let k = 0; k < run.side * run.side; k++){
    const x = pad + (k % run.side) * cell, y = pad + Math.floor(k / run.side) * cell;
    const off = !path && hidden && hidden.has(k);
    g.globalAlpha = off ? 0.18 : 1; g.fillStyle = "rgb(" + cols[k] + ")"; g.fillRect(x + 1, y + 1, cell - 2, cell - 2); g.globalAlpha = 1;
    if (off){ g.strokeStyle = "rgba(92,102,112,.7)"; g.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3); }
    if (!path){
      const rad = Math.sqrt(run.hits[k] / (maxHit || 1)) * cell * 0.35;
      g.fillStyle = "rgba(22,25,28,.55)"; g.beginPath(); g.arc(x + cell / 2, y + cell / 2, Math.max(rad, run.hits[k] > 0 ? 1.5 : 0), 0, Math.PI * 2); g.fill();
    }
  }
  if (path){
    const P = p => [pad + (p[0] + 0.5) * cell, pad + (p[1] + 0.5) * cell];
    let cur = path.base.slice();
    g.lineWidth = 2.5; g.font = "600 11px 'IBM Plex Sans', system-ui"; g.textBaseline = "middle";
    const order = path.phi.map((v, j) => [j, Math.hypot(v[0], v[1])]).sort((a, b) => b[1] - a[1]);
    const [bx, by] = P(cur);
    g.fillStyle = "#fff"; g.strokeStyle = "#000"; g.beginPath(); g.arc(bx, by, 6, 0, Math.PI * 2); g.fill(); g.stroke();
    for (const [j, mag] of order){
      const nxt = [cur[0] + path.phi[j][0], cur[1] + path.phi[j][1]], [x0, y0] = P(cur), [x1, y1] = P(nxt);
      g.strokeStyle = "#000"; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const ang = Math.atan2(y1 - y0, x1 - x0);
      if (mag * cell > 6){ g.fillStyle = "#000"; g.beginPath(); g.moveTo(x1, y1);
        g.lineTo(x1 - 8 * Math.cos(ang - 0.4), y1 - 8 * Math.sin(ang - 0.4)); g.lineTo(x1 - 8 * Math.cos(ang + 0.4), y1 - 8 * Math.sin(ang + 0.4)); g.fill(); }
      if (mag * cell > 14){ const lab = attrShort(run.keys[j]), tw = g.measureText(lab).width + 6, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        g.fillStyle = "rgba(255,255,255,.92)"; g.fillRect(mx - tw / 2, my - 7, tw, 14); g.fillStyle = "#16191C"; g.textAlign = "center"; g.fillText(lab, mx, my); }
      cur = nxt;
    }
    const [fx, fy] = P(path.final);
    g.fillStyle = "#ffd166"; g.strokeStyle = "#000"; g.beginPath(); g.arc(fx, fy, 7, 0, Math.PI * 2); g.fill(); g.stroke();
  }
}

function gridHit(c, run, ev){
  const r = c.getBoundingClientRect(), pad = 8, cell = (r.width - 2 * pad) / run.side;
  const col = Math.floor((ev.clientX - r.left - pad) / cell), row = Math.floor((ev.clientY - r.top - pad) / cell);
  if (col < 0 || row < 0 || col >= run.side || row >= run.side) return -1;
  return row * run.side + col;
}

/* Horizontal bars on a fixed axis, so a bar that changes length between runs
   is a change in the number and not in the scale. */
function hbars(canvas, labels, values, opt){
  const rows = labels.length;
  canvas.style.height = Math.max(90, 30 + 20 * rows) + "px";
  const {ctx: g, w, h, ok} = fitCanvas(canvas);
  if (!ok) return;
  const left = 190, right = 44, top = 8, bottom = 24;
  const X = v => left + (v - opt.min) / (opt.max - opt.min) * (w - left - right);
  const rowH = (h - top - bottom) / Math.max(1, rows);
  g.strokeStyle = "#C9CDD2"; g.fillStyle = "#5C6670"; g.font = "10px 'IBM Plex Mono', monospace"; g.textAlign = "center"; g.textBaseline = "top";
  for (const t of niceTicks(opt.min, opt.max, 4)){ const x = X(t); g.beginPath(); g.moveTo(x + .5, top); g.lineTo(x + .5, h - bottom); g.stroke(); g.fillText(fmtTick(t, 0.05), x, h - bottom + 4); }
  g.font = "10px 'IBM Plex Sans', system-ui"; g.fillStyle = "#16191C"; g.textBaseline = "bottom";
  if (opt.axis) g.fillText(opt.axis, (left + w - right) / 2, h);
  labels.forEach((lab, i) => {
    const y = top + i * rowH + rowH / 2, v = values[i], vc = Math.max(opt.min, Math.min(opt.max, v));
    g.textBaseline = "middle"; g.textAlign = "right"; g.fillStyle = "#16191C"; g.font = "12px 'IBM Plex Sans', system-ui";
    g.fillText(lab, left - 6, y);
    g.fillStyle = opt.color || "#5C6670"; g.fillRect(X(opt.min), y - rowH * 0.32, X(vc) - X(opt.min), rowH * 0.64);
    g.fillStyle = "#16191C"; g.font = "11px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText(v.toFixed(3) + (v > opt.max ? " ›" : ""), Math.min(X(vc) + 4, w - right + 2), y);
  });
}

function redundancyText(run){
  const pairs = [];
  run.keys.forEach((a, i) => run.keys.forEach((b, j) => {
    if (j > i && Math.abs(run.corr[i][j]) >= 0.8)
      pairs.push(attrName(a).toLowerCase() + " and " + attrName(b).toLowerCase() + " (r = " + run.corr[i][j].toFixed(2) + ")");
  }));
  return pairs.length ? "Pairs correlated at 0.8 or more in this run: " + pairs.join("; ") +
    ". Attributes that repeat each other split the credit between them, so each can show a shorter SHAP bar than the information they share."
    : "No pair of attributes in this run correlates at 0.8 or more.";
}
