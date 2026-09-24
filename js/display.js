/* Pixels available down a panel. Set by the page before it draws: a page
   that never sets it draws every sample. */
let DISPLAY_H = 0;

/* Colors and fonts of the axes and color bars, set by the page. */
let AX = {rule:"#C9CDD2", tick:"#5C6670", label:"#16191C",
          font:"10px ui-monospace, monospace", labelFont:"10px system-ui, sans-serif"};

/* ============================ display ============================ */
/* One table of color maps for everything: the seismic panels and the
   attributes drew from separate tables, so a name offered in one editor
   resolved to the fallback in the other and several options silently produced
   gray. Control points run low value first. */
const CMAPS = {
  /* diverging, neutral in the middle, for anything that straddles zero */
  bwr:     [[0,0,180],[40,90,255],[255,255,255],[255,90,40],[180,0,0]],
  seis:    [[0,60,255],[0,0,0],[255,60,0]],
  coolwarm:[[59,76,192],[144,178,254],[221,221,221],[246,161,120],[180,4,38]],
  vik:     [[0,18,97],[32,100,160],[139,190,214],[245,244,241],
            [214,150,110],[177,76,50],[89,8,8]],
  /* cyclic, for phase: the two ends are the same color, so -pi and +pi do not
     read as opposite extremes */
  twilight:[[60,30,86],[47,86,150],[136,178,209],[236,235,232],
            [214,156,120],[168,66,72],[100,32,66],[60,30,86]],
  /* sequential */
  gray:    [[0,0,0],[255,255,255]],
  graygb:  [[255,255,255],[0,0,0]],
  magma:   [[0,0,4],[28,16,68],[79,18,123],[129,37,129],[181,54,122],
            [229,80,100],[251,135,97],[254,194,135],[252,253,191]],
  viridis: [[68,1,84],[71,44,122],[59,81,139],[44,113,142],[33,144,141],
            [39,173,129],[92,200,99],[170,220,50],[253,231,37]],
  cividis: [[0,32,76],[35,64,110],[70,93,113],[110,120,120],
            [149,148,113],[194,178,95],[244,211,62],[255,233,69]],
  /* perceptually uniform and readable with color vision deficiency, the
     honest substitute for a rainbow */
  batlow:  [[1,25,89],[13,61,96],[32,91,92],[68,111,70],[117,128,45],
            [172,142,42],[223,160,88],[250,191,158],[250,204,250]]
};

function buildLUT(name){
  const cp = CMAPS[name] || CMAPS.gray;
  const lut = new Uint8ClampedArray(512*3);
  const seg = cp.length - 1;
  for (let i=0;i<512;i++){
    const u = (i/511) * seg;
    const k = Math.min(seg-1, Math.floor(u)), f = u - k;
    for (let c=0;c<3;c++) lut[i*3+c] = Math.round(cp[k][c]*(1-f) + cp[k+1][c]*f);
  }
  return lut;
}

const buildALUT = buildLUT;   // one table now; kept for call sites

function drawRGB(canvas, ch, sc, nx, nz0){
  const nz = Math.min(nz0, DISPLAY_H > 0 ? DISPLAY_H : nz0);
  ch = ch.map(c => reduceTime(c, nx, nz0, nz, "mean").a);
  canvas.width = nx; canvas.height = nz;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(nx, nz), px = img.data;
  const inv = sc.map(v => 255 / (v || 1e-30));
  for (let i=0;i<nx;i++) for (let j=0;j<nz;j++){
    const k = i*nz+j, o = (j*nx+i)*4;
    for (let c=0;c<3;c++){
      let v = ch[c][k]*inv[c];
      px[o+c] = v > 255 ? 255 : (v < 0 ? 0 : v);
    }
    px[o+3] = 255;
  }
  ctx.putImageData(img,0,0);
}

function drawRange(canvas, a, nx, nz0, vmin, vmax, lut){
  const R = reduceTime(a, nx, nz0, DISPLAY_H, "mean");
  a = R.a; const nz = R.nz;
  canvas.width = nx; canvas.height = nz;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(nx, nz), px = img.data;
  const sc = 511 / ((vmax - vmin) || 1e-30);
  for (let i=0;i<nx;i++) for (let j=0;j<nz;j++){
    let t = (a[i*nz+j] - vmin) * sc;
    t = t < 0 ? 0 : (t > 511 ? 511 : t|0);
    const o = (j*nx+i)*4;
    px[o]=lut[t*3]; px[o+1]=lut[t*3+1]; px[o+2]=lut[t*3+2]; px[o+3]=255;
  }
  ctx.putImageData(img,0,0);
}

function reduceTime(a, nx, nz, H, mode){
  if (!(H > 0) || H >= nz) return {a, nz};
  const out = new Float32Array(nx*H);
  for (let i=0;i<nx;i++){
    const src = i*nz, dst = i*H;
    for (let j=0;j<H;j++){
      const j0 = (j*nz/H)|0;
      const j1 = Math.max(j0+1, ((j+1)*nz/H)|0);
      if (mode === "peak"){
        let bv = -1, bk = j0;
        for (let k=j0;k<j1;k++){ const v = a[src+k] < 0 ? -a[src+k] : a[src+k];
          if (v > bv){ bv = v; bk = k; } }
        out[dst+j] = a[src+bk];
      } else {
        let acc = 0;
        for (let k=j0;k<j1;k++) acc += a[src+k];
        out[dst+j] = acc/(j1-j0);
      }
    }
  }
  return {a: out, nz: H};
}

function percentile(d, p){
  const stride = Math.max(1, Math.floor(d.length/200000));
  const s = [];
  for (let k=0;k<d.length;k+=stride) if (isFinite(d[k])) s.push(d[k]);
  if (!s.length) return 1;
  s.sort((a,b)=>a-b);
  return s[Math.min(s.length-1, Math.floor(s.length*p/100))];
}

function percentileAbs(d, p){
  const N = d.length;
  const stride = Math.max(1, Math.floor(N/200000));
  const s = [];
  for (let k=0;k<N;k+=stride) s.push(Math.abs(d[k]));
  if (!s.length) return 1;
  s.sort((a,b)=>a-b);
  return s[Math.min(s.length-1, Math.floor(s.length*p/100))] || 1e-9;
}

/* The largest-magnitude sample of each pixel row keeps events visible when a
   long record is compressed into a short panel. When there are fewer than
   three samples per row it would instead pick one sample of each pair and
   distort the wavelet, so the samples are drawn as they are and the canvas
   interpolates between them. */
function draw(canvas, d, nx, nz0, lo, hi, lut){
  const R = nz0 > 3 * DISPLAY_H ? reduceTime(d, nx, nz0, DISPLAY_H, "peak") : {a: d, nz: nz0};
  d = R.a; const nz = R.nz;
  canvas.width = nx; canvas.height = nz;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(nx, nz);
  const px = img.data;
  const sc = 511/((hi - lo) || 1e-30);
  for (let i=0;i<nx;i++){
    for (let j=0;j<nz;j++){
      const t = (d[i*nz+j] - lo)*sc;
      const idx = t < 0 ? 0 : (t > 511 ? 511 : t|0);
      const o = (j*nx+i)*4;
      px[o]=lut[idx*3]; px[o+1]=lut[idx*3+1]; px[o+2]=lut[idx*3+2]; px[o+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
}

function niceTicks(lo, hi, target){
  if (!(isFinite(lo) && isFinite(hi))) return [];
  if (hi === lo) return [lo];
  const raw = (hi - lo) / Math.max(2, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  const first = Math.ceil(lo / step) * step;
  const out = [];
  for (let v = first; v <= hi + step * 1e-6; v += step) out.push(v);
  return out;
}

function fmtTick(v, step){
  if (Math.abs(v) < Math.abs(step || 1) * 1e-6) v = 0;
  const d = Math.max(0, -Math.floor(Math.log10(Math.abs(step || 1))));
  if (Math.abs(v) >= 1e5 || (v !== 0 && Math.abs(v) < 1e-3)) return v.toExponential(1);
  return v.toFixed(Math.min(4, d));
}

function fitCanvas(cv){
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  cv.width = w; cv.height = h;          // assigning always resets the bitmap
  const ctx = cv.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return {ctx, w: r.width, h: r.height, ok: r.width > 4 && r.height > 4};
}

function drawYAxis(id, t0, t1, unit, secPerUnit, vkms){
  const {ctx, w, h, ok} = fitCanvas($(id));
  if (!ok) return;
  const ticks = niceTicks(t0, t1, Math.max(3, Math.round(h / 55)));
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : (t1 - t0);
  ctx.strokeStyle = AX.rule; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(w - 0.5, 0); ctx.lineTo(w - 0.5, h); ctx.stroke();
  ctx.fillStyle = AX.tick;
  ctx.font = AX.font;
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (const v of ticks){
    const y = (v - t0) / (t1 - t0) * h;
    if (y < 0 || y > h) continue;
    ctx.beginPath(); ctx.moveTo(w - 5, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
    ctx.fillText(fmtTick(v, step), w - 8, Math.min(h - 6, Math.max(6, y)));
    if (vkms && w >= 90){
      ctx.fillStyle = AX.rule;
      ctx.fillText((v * secPerUnit * vkms / 2).toFixed(0),
                   w - 42, Math.min(h - 6, Math.max(6, y)));
      ctx.fillStyle = AX.tick;
    }
  }
  if (h > 110){
    ctx.save();
    ctx.translate(10, h / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = AX.labelFont; ctx.fillStyle = AX.label;
    ctx.fillText(vkms && w >= 90 ? unit + "   |   depth (km)" : unit, 0, 0);
    ctx.restore();
  }
}

function drawXAxis(id, x0, x1, label){
  const {ctx, w, h, ok} = fitCanvas($(id));
  if (!ok) return;
  const ticks = niceTicks(x0, x1, Math.max(3, Math.round(w / 90)));
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : (x1 - x0);
  ctx.strokeStyle = AX.rule; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(w, 0.5); ctx.stroke();
  ctx.fillStyle = AX.tick;
  ctx.font = AX.font;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (const v of ticks){
    const x = (v - x0) / (x1 - x0) * w;
    if (x < 0 || x > w) continue;
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, 5); ctx.stroke();
    ctx.fillText(fmtTick(v, step), Math.min(w - 14, Math.max(14, x)), 7);
  }
  ctx.font = AX.labelFont; ctx.fillStyle = AX.label;
  ctx.fillText(label, w / 2, 20);
}

function drawColorbar(id, vmin, vmax, lut, label){
  const {ctx, w, h, ok} = fitCanvas($(id));
  if (!ok) return;
  const bw = 13, x = 1, top = 4, bh = Math.max(10, h - 8);
  const img = ctx.createImageData(1, Math.round(bh));
  for (let k = 0; k < img.height; k++){
    const idx = Math.round((1 - k / (img.height - 1 || 1)) * 511);
    img.data[k*4] = lut[idx*3]; img.data[k*4+1] = lut[idx*3+1];
    img.data[k*4+2] = lut[idx*3+2]; img.data[k*4+3] = 255;
  }
  const tmp = document.createElement("canvas");
  tmp.width = 1; tmp.height = img.height;
  tmp.getContext("2d").putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, x, top, bw, bh);
  ctx.strokeStyle = AX.rule; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, top + 0.5, bw, bh);

  const ticks = niceTicks(vmin, vmax, Math.max(2, Math.round(bh / 60)));
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : (vmax - vmin);
  ctx.fillStyle = AX.tick;
  ctx.font = AX.font;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  for (const v of ticks){
    const y = top + (1 - (v - vmin) / ((vmax - vmin) || 1)) * bh;
    if (y < top - 1 || y > top + bh + 1) continue;
    ctx.beginPath(); ctx.moveTo(x + bw, y + 0.5); ctx.lineTo(x + bw + 4, y + 0.5);
    ctx.stroke();
    ctx.fillText(fmtTick(v, step), x + bw + 6, Math.min(h - 5, Math.max(5, y)));
  }
  if (label){
    ctx.save();
    ctx.translate(w - 2, h / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = AX.labelFont; ctx.fillStyle = AX.label;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

/* The height field the shading runs on, and the two smoothing widths that go
   with it. The vertical width is a fraction of the measured wavelet period, so
   it means the same thing on an 8 ms legacy line and a 2 ms modern one; the
   lateral width is a small fixed number of traces, because lateral detail is
   what the display is for. */
function reliefSurface(p, C, nx, ns, dts){
  const base = p.relSurf === "env" ? C.env : C.d;
  const cyc = (SPEC && SPEC.stats.fpk > 0)
    ? 1/(SPEC.stats.fpk*dts)               // samples per dominant cycle
    : 8;
  // The height of the surface is scaled by one number for the whole section, so
  // on a record whose amplitude falls by orders of magnitude the deep half comes
  // out flat whatever the relief is set to. Dividing by a long vertical average
  // of the envelope leaves the shape of the surface and takes out its level, and
  // the shading then means the same thing at 3 seconds and at 15.
  const g = blurAniso(C.env, nx, ns, 0, 5*cyc);
  const floor = 1e-3 * (percentile(g, 90) || 1);
  const src = new Float32Array(nx*ns);
  for (let k=0;k<src.length;k++) src[k] = base[k]/(g[k] + floor);
  // The height is then scaled by its 98th percentile. An envelope divided by its
  // own average sits near 1 everywhere, so that percentile measures the level
  // rather than the variation and the relief comes out flat at any setting.
  // Taking the median off leaves the variation, which is the surface.
  const mid = percentile(src, 50);
  if (Math.abs(mid) > 1e-12) for (let k=0;k<src.length;k++) src[k] -= mid;
  // The envelope has already had the oscillation taken out of it, so it needs
  // roughly half the vertical smoothing the raw amplitude does. The smoothing is
  // done here rather than inside the shading, so the surface can be lit several
  // times over without being rebuilt.
  const f = p.relSurf === "env" ? 0.5 : 1.0;
  const sigX = p.relSm*1.2, sigZ = p.relSm*cyc*f;
  return (sigX > 0.05 || sigZ > 0.05) ? blurAniso(src, nx, ns, sigX, sigZ) : src;
}

/* The relief that puts a given fraction of the image on the ambient floor.
   A vertical scale of 1 means nothing on its own: it is a height divided by the
   98th percentile of a surface whose units differ with the smoothing, the sample
   interval and the choice of envelope or amplitude. The fraction in full shadow
   is the thing that reads the same on every dataset, so the scale is solved for
   rather than carried over. */
function shadowFraction(a){
  let dark = 0;
  for (let k=0;k<a.length;k++) if (a[k] < 0.16) dark++;
  return 100*dark/a.length;
}

function reliefScaleFor(src, nx, ns, az, alt, targetPct){
  let lo = 0.05, hi = 8;
  for (let it=0; it<8; it++){
    const z = 0.5*(lo+hi);
    if (shadowFraction(attrRelief(src, nx, ns, az, alt, z)) > targetPct) hi = z;
    else lo = z;
  }
  return Math.max(0.05, Math.min(8, Math.round(0.5*(lo+hi)*20)/20));
}
