/* ============================ measurement ============================
   What is read off a section before anything is done to it: the band it
   carries, and how its amplitude falls down the record. Both take a section
   object and return a result, so a page can measure the raw line, measure any
   stage of the filter chain, and put the two side by side. Neither touches the
   document; the drawing belongs to whichever page shows it.

   A section object is {data, nx, ns, dt, j0}: a Float32Array in trace-major
   order, its dimensions, the sample interval in microseconds, and the index of
   its first sample in the full record, which is what puts a crop back on the
   right time axis. */

/* Mean amplitude spectrum of the whole section, and the same measurement
   repeated in windows down it. winMs is the window length in milliseconds;
   it is rounded to whole samples and clamped to the record. */
function spectrumOf(seg, winMs){
  if (!seg || !seg.data) return null;
  const {nx, ns, dt} = seg, dts = dt*1e-6;
  let n = Math.round(winMs/(dt*1e-3));
  n = Math.max(16, Math.min(ns, n));
  const N = pow2(Math.max(256, n*2));
  const df = 1/(N*dts);
  const rows = Math.max(1, Math.min(48, ns - n + 1));
  const step = rows > 1 ? (ns - n)/(rows - 1) : 0;
  const stepX = Math.max(1, Math.ceil(nx/300));
  const w = hannWindow(n);
  const tf = [], tc = [];
  for (let r=0;r<rows;r++){
    const j0 = Math.round(r*step);
    tf.push(meanSpectrum(seg.data, nx, ns, j0, n, N, stepX, w));
    tc.push(((seg.j0||0) + j0 + n/2)*dt*1e-3);
  }
  const whole = new Float32Array(N/2+1);
  for (const a of tf) for (let k=0;k<whole.length;k++) whole[k] += a[k]/rows;
  return {tf, tc, whole, df, N, n, rows, nyq: 0.5/dts, winMs: n*dt*1e-3,
          stats: specStats(whole, df), rowStats: tf.map(a => specStats(a, df))};
}

/* RMS amplitude in forty windows down the record, fitted with a straight line
   in log time against log amplitude. The slope is the exponent n in t^-n, which
   is what a t^n gain has to undo. Returns null where the fit has too few live
   windows to mean anything. */
function decayOf(seg){
  if (!seg || !seg.data) return null;
  const {nx, ns, dt} = seg, j00 = seg.j0 || 0;
  const rows = 40, n = Math.max(8, Math.floor(ns/rows));
  const stepX = Math.max(1, Math.ceil(nx/200));
  const T = [], Y = [];
  let ymax = 0;
  for (let r=0;r<rows;r++){
    const j0 = Math.round(r*(ns-n)/Math.max(1, rows-1));
    let acc = 0, c = 0;
    for (let i=0;i<nx;i+=stepX) for (let j=j0;j<j0+n;j++){
      const v = seg.data[i*ns+j]; acc += v*v; c++; }
    const rms = Math.sqrt(acc/Math.max(1,c));
    const t = (j00 + j0 + n/2) * dt * 1e-6;
    if (t > 0.1 && rms > 0){ T.push(t); Y.push(rms); if (rms > ymax) ymax = rms; }
  }
  // Muted windows carry no amplitude and would otherwise set the slope.
  const xs = [], ys = [];
  for (let k=0;k<T.length;k++) if (Y[k] > 0.01*ymax){
    xs.push(Math.log(T[k])); ys.push(Math.log(Y[k])); }
  const m = xs.length;
  if (m < 6) return null;
  let sx=0, sy=0, sxx=0, sxy=0;
  for (let k=0;k<m;k++){ sx+=xs[k]; sy+=ys[k]; sxx+=xs[k]*xs[k]; sxy+=xs[k]*ys[k]; }
  const den = m*sxx - sx*sx;
  if (!(Math.abs(den) > 1e-12)) return null;
  return {n: -(m*sxy - sx*sy)/den,
          db: 20/Math.LN10*(ys[m-1] - ys[0]),
          t0: Math.exp(xs[0]), t1: Math.exp(xs[m-1])};
}

/* The t^n exponent that matches a measured decay, rounded to a tenth and held
   inside the range the gain control offers. */
function tpowOf(decay){
  if (!decay || !isFinite(decay.n)) return null;
  return Math.max(0, Math.min(4, Math.round(decay.n*10)/10));
}
