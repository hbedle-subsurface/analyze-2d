/* ============================ EBCDIC ============================ */
const [E2A, A2E] = (() => {
  const pairs = [];
  const punct = {64:32,74:91,75:46,76:60,77:40,78:43,79:33,80:38,90:93,91:36,92:42,93:41,
    94:59,95:94,96:45,97:47,106:124,107:44,108:37,109:95,110:62,111:63,121:96,122:58,
    123:35,124:64,125:39,126:61,127:34};
  for (const k in punct) pairs.push([+k, punct[k]]);
  const seg = [[129,"abcdefghi"],[145,"jklmnopqr"],[162,"stuvwxyz"],
               [193,"ABCDEFGHI"],[209,"JKLMNOPQR"],[226,"STUVWXYZ"],[240,"0123456789"]];
  for (const [s0,str] of seg) for (let i=0;i<str.length;i++) pairs.push([s0+i, str.charCodeAt(i)]);
  const dec = new Uint8Array(256).fill(46);      // unmapped EBCDIC decodes to "."
  const enc = new Uint8Array(128).fill(64);      // unmapped ASCII encodes to EBCDIC space
  for (const [e, a] of pairs){ dec[e] = a; enc[a] = e; }
  return [dec, enc];
})();

/* ============================ SEG-Y ============================ */
function ibmToFloat(u){
  if (u === 0) return 0;
  const s = (u >>> 31) ? -1 : 1;
  const e = (u >>> 24) & 0x7f;
  const m = u & 0x00ffffff;
  return s * m * Math.pow(16, e - 70);   // 16^(e-64) / 2^24
}

const BPS = {1:4, 2:4, 3:2, 5:4, 6:8, 8:1, 9:8, 10:4, 11:2, 12:8, 16:1};

const FMTNAME = {1:"IBM float", 2:"32-bit int", 3:"16-bit int", 5:"IEEE float",
  6:"IEEE double", 8:"8-bit int", 9:"64-bit int", 10:"32-bit uint", 11:"16-bit uint",
  12:"64-bit uint", 16:"8-bit uint"};

const MAXCELLS = 5.0e6;   // decimate traces above this

/* One trace's samples j0..j1-1 into out at base. Format 1 (IBM float) is
   decoded from big-endian words unless the file is little-endian overall. */
function decodeTrace(dv, o0, fmt, big, ns, j0, j1, out, base){
  const bps = BPS[fmt];
  let o = o0 + j0 * bps, k = base;
  switch (fmt){
    case 1:  for (let j=j0;j<j1;j++){ out[k++] = ibmToFloat(dv.getUint32(o,!big)); o+=4; } break;
    case 5:  for (let j=j0;j<j1;j++){ out[k++] = dv.getFloat32(o,!big); o+=4; } break;
    case 2:  for (let j=j0;j<j1;j++){ out[k++] = dv.getInt32(o,!big); o+=4; } break;
    case 3:  for (let j=j0;j<j1;j++){ out[k++] = dv.getInt16(o,!big); o+=2; } break;
    case 8:  for (let j=j0;j<j1;j++){ out[k++] = dv.getInt8(o); o+=1; } break;
    case 16: for (let j=j0;j<j1;j++){ out[k++] = dv.getUint8(o); o+=1; } break;
    case 11: for (let j=j0;j<j1;j++){ out[k++] = dv.getUint16(o,!big); o+=2; } break;
    case 10: for (let j=j0;j<j1;j++){ out[k++] = dv.getUint32(o,!big); o+=4; } break;
    case 6:  for (let j=j0;j<j1;j++){ out[k++] = dv.getFloat64(o,!big); o+=8; } break;
    default: throw new Error("Data format code " + fmt + " is not supported.");
  }
}

function parseSegy(ab){
  const dv = new DataView(ab);
  if (ab.byteLength < 3600) throw new Error("File is shorter than a SEG-Y header. It may not be a SEG-Y file.");

  // Textual header. A card-image header is mostly spaces, so the reliable
  // discriminator is which space byte dominates: 0x40 in EBCDIC, 0x20 in ASCII.
  let n40 = 0, n20 = 0;
  for (let i = 0; i < 3200; i++){
    const b = dv.getUint8(i);
    if (b === 0x40) n40++; else if (b === 0x20) n20++;
  }
  const isEbcdic = n40 >= n20;
  let raw = "";
  for (let i = 0; i < 3200; i++){
    const b = dv.getUint8(i);
    raw += String.fromCharCode(isEbcdic ? E2A[b] : (b >= 32 && b < 127 ? b : 46));
  }
  const textual = [];
  for (let i = 0; i < 40; i++) textual.push(raw.slice(i*80, i*80+80).replace(/\s+$/,""));

  // binary header, with endian sniff
  let big = true;
  let fmt = dv.getInt16(3224, false), ns = dv.getUint16(3220, false);
  const sane = (f, n) => BPS[f] !== undefined && n > 0 && n < 200000;
  if (!sane(fmt, ns)){
    const f2 = dv.getInt16(3224, true), n2 = dv.getUint16(3220, true);
    if (sane(f2, n2)){ big = false; fmt = f2; ns = n2; }
  }
  if (!sane(fmt, ns)) throw new Error("Could not read a valid format code or sample count from the binary header.");

  let dt  = dv.getUint16(3216, !big);
  const ext = dv.getInt16(3506, !big);
  const rev = dv.getUint16(3500, !big);

  const bps = BPS[fmt];
  const start = 3600 + (ext > 0 ? ext * 3200 : 0);
  const traceBytes = 240 + ns * bps;
  let ntr = Math.floor((ab.byteLength - start) / traceBytes);
  if (ntr < 1) throw new Error("No complete traces found after the headers.");

  // fall back to the first trace header if the binary header disagrees
  const hns = dv.getUint16(start + 114, !big);
  if (hns > 0 && hns !== ns && Math.abs((ab.byteLength - start) / (240 + hns*bps) % 1) < 1e-9){
    ns = hns;
  }
  if (dt < 1 || dt > 100000) dt = dv.getUint16(start + 116, !big);
  if (dt < 1 || dt > 100000) dt = 4000;

  // decimate traces if the line is very large
  const step = Math.max(1, Math.ceil((ntr * ns) / MAXCELLS));
  const nx = Math.floor((ntr - 1) / step) + 1;

  const data = new Float32Array(nx * ns);
  const cdp  = new Int32Array(nx);
  const cx = new Float64Array(nx), cy = new Float64Array(nx);

  for (let i = 0; i < nx; i++){
    const h = start + (i * step) * traceBytes;
    cdp[i] = dv.getInt32(h + 20, !big) || (i + 1);
    // CDP coordinates (bytes 181, 185) with the coordinate scalar (byte 71):
    // negative divides, positive multiplies, zero means one
    const sc = dv.getInt16(h + 70, !big);
    const f = sc < 0 ? -1/sc : (sc > 0 ? sc : 1);
    cx[i] = dv.getInt32(h + 180, !big) * f;
    cy[i] = dv.getInt32(h + 184, !big) * f;
    decodeTrace(dv, h + 240, fmt, big, ns, 0, ns, data, i * ns);
  }
  // scrub non-finite samples
  for (let k = 0; k < data.length; k++) if (!isFinite(data[k])) data[k] = 0;

  // Delay recording time (bytes 109-110), the time of the first sample. Modern
  // processed data often starts at zero, but a file cut to a window does not.
  const delayMs = dv.getInt16(start + 108, !big);

  // Distance along the line from the CDP coordinates when they are present and
  // move; otherwise null, and the page asks for a trace spacing instead. It is
  // accumulated over every trace in the file, not only the ones kept, so a crop
  // read later at full density has its distances.
  let dist = null;
  {
    const ax = new Float64Array(ntr), ay = new Float64Array(ntr);
    for (let i = 0; i < ntr; i++){
      const h = start + i * traceBytes;
      const sc = dv.getInt16(h + 70, !big);
      const f = sc < 0 ? -1/sc : (sc > 0 ? sc : 1);
      ax[i] = dv.getInt32(h + 180, !big) * f; ay[i] = dv.getInt32(h + 184, !big) * f;
    }
    let moved = 0;
    for (let i = 1; i < ntr; i++) moved += Math.hypot(ax[i]-ax[i-1], ay[i]-ay[i-1]);
    if (moved > 0 && isFinite(moved)){
      dist = new Float64Array(ntr);
      for (let i = 1; i < ntr; i++) dist[i] = dist[i-1] + Math.hypot(ax[i]-ax[i-1], ay[i]-ay[i-1]);
    }
  }

  // The binary header fields a reader checks first, and the leading trace
  // headers, kept for display on the first step.
  const binary = {
    "Sample interval, microseconds (3217)": dt,
    "Samples per trace (3221)": ns,
    "Data format code (3225)": fmt + " (" + (FMTNAME[fmt] || "unknown") + ")",
    "Ensemble fold (3229)": dv.getInt16(3228, !big),
    "Trace sorting code (3231)": dv.getInt16(3230, !big),
    "Measurement system (3255)": ({1:"meters", 2:"feet"})[dv.getInt16(3254, !big)] || dv.getInt16(3254, !big),
    "SEG-Y revision (3501)": (rev >> 8) + "." + (rev & 0xff),
    "Extended textual headers (3505)": ext,
    "Byte order": big ? "big-endian" : "little-endian"
  };
  const traceRows = [];
  for (let i = 0; i < Math.min(ntr, 12); i++){
    const h = start + i * traceBytes;
    traceRows.push({
      seq: dv.getInt32(h, !big), cdp: dv.getInt32(h + 20, !big),
      scalar: dv.getInt16(h + 70, !big),
      x: dv.getInt32(h + 180, !big), y: dv.getInt32(h + 184, !big),
      delay: dv.getInt16(h + 108, !big), ns: dv.getUint16(h + 114, !big),
      dt: dv.getUint16(h + 116, !big)
    });
  }

  return {full: data, fullNx: nx, fullNs: ns, cdpAll: cdp,
          data, nx, ns, dt, fmt, rev, big, ntrFile: ntr, step, cdp, textual,
          delayMs, x: cx, y: cy, dist, binary, traceRows,
          layout: {start, traceBytes, ns, fmt, big, ntr}};
}

/* File traces f0..f1, every stride-th, samples j0..j1, read again from the
   file. Used to store a crop at full density when the line as a whole had to
   be thinned to fit in memory. */
function readSegyCrop(ab, L, f0, f1, stride, j0, j1){
  const dv = new DataView(ab);
  const nx = Math.floor((f1 - f0) / stride) + 1, ns = j1 - j0 + 1;
  const out = new Float32Array(nx * ns);
  for (let i = 0; i < nx; i++){
    const h = L.start + (f0 + i * stride) * L.traceBytes;
    decodeTrace(dv, h + 240, L.fmt, L.big, L.ns, j0, j1 + 1, out, i * ns);
  }
  for (let k = 0; k < out.length; k++) if (!isFinite(out[k])) out[k] = 0;
  return {data: out, nx, ns};
}

/* ============================ SEG-Y writer ============================ */
function writeSegy(d, nx, ns, dt, cdp, startMs, lines){
  const traceBytes = 240 + ns*4;
  const buf = new ArrayBuffer(3600 + nx*traceBytes);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);

  for (let i = 0; i < 40; i++){
    const txt = (lines[i] || "").toUpperCase().slice(0, 80).padEnd(80, " ");
    for (let k = 0; k < 80; k++){
      const c = txt.charCodeAt(k);
      u8[i*80 + k] = c < 128 ? A2E[c] : 0x40;
    }
  }
  dv.setInt32(3200, 1, false);                    // job id
  dv.setInt16(3212, 1, false);                    // traces per ensemble
  dv.setUint16(3216, dt, false);                  // sample interval
  dv.setUint16(3218, dt, false);
  dv.setUint16(3220, ns, false);                  // samples per trace
  dv.setUint16(3222, ns, false);
  dv.setInt16(3224, 5, false);                    // IEEE float
  dv.setInt16(3228, 4, false);                    // CDP ensemble sorting
  dv.setInt16(3254, 1, false);                    // meters
  dv.setInt16(3500, 0x0100, false);               // rev 1
  dv.setInt16(3504, 1, false);                    // fixed length traces
  dv.setInt16(3506, 0, false);                    // no extended headers

  for (let i = 0; i < nx; i++){
    const h = 3600 + i*traceBytes;
    dv.setInt32(h, i+1, false);                   // trace seq within line
    dv.setInt32(h+4, i+1, false);                 // trace seq within file
    dv.setInt32(h+20, cdp[i], false);             // CDP number, byte 21
    dv.setInt16(h+28, 1, false);                  // trace id: seismic data
    dv.setInt16(h+108, Math.round(startMs), false); // delay recording time, byte 109
    dv.setUint16(h+114, ns, false);               // samples this trace, byte 115
    dv.setUint16(h+116, dt, false);               // sample interval, byte 117
    let o = h + 240;
    for (let j = 0; j < ns; j++){ dv.setFloat32(o, d[i*ns+j], false); o += 4; }
  }
  return buf;
}
