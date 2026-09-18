function hannWindow(n){
  const w = new Float32Array(n);
  if (n < 2){ w.fill(1); return w; }
  for (let k=0;k<n;k++) w[k] = 0.5 - 0.5*Math.cos(2*Math.PI*k/(n-1));
  return w;
}

/* Mean magnitude spectrum over the traces of d, across n samples starting at
   j0, zero padded to N. Dead traces contribute nothing to the average. */
function meanSpectrum(d, nx, ns, j0, n, N, stepX, w){
  const re = new Float32Array(N), im = new Float32Array(N);
  const acc = new Float64Array(N/2 + 1);
  let live = 0;
  for (let i=0;i<nx;i+=stepX){
    re.fill(0); im.fill(0);
    let e = 0;
    for (let k=0;k<n;k++){ const v = d[i*ns + j0 + k]; re[k] = v*w[k]; e += v*v; }
    if (!(e > 0)) continue;
    live++;
    fftRadix2(re, im, false);
    for (let k=0;k<=N/2;k++) acc[k] += Math.hypot(re[k], im[k]);
  }
  const out = new Float32Array(N/2 + 1);
  if (live) for (let k=0;k<out.length;k++) out[k] = acc[k]/live;
  return out;
}

/* Peak, and the frequencies at which the curve falls a given number of
   decibels below it, interpolated linearly in decibels between bins. */
function specStats(a, df){
  let pk = 1, mx = 0;
  for (let k=1;k<a.length;k++) if (a[k] > mx){ mx = a[k]; pk = k; }
  const db = k => 20*Math.log10((a[k] || 1e-20)/(mx || 1e-20));
  const cross = (dir, level) => {
    let k = pk;
    while (k+dir >= 1 && k+dir <= a.length-1 && db(k+dir) > level) k += dir;
    const k2 = k + dir;
    if (k2 < 1 || k2 > a.length-1) return k*df;
    const d1 = db(k), d2 = db(k2);
    const t = (d1 === d2) ? 0 : Math.max(0, Math.min(1, (level - d1)/(d2 - d1)));
    return (k + dir*t)*df;
  };
  return {fpk: pk*df, peak: mx,
          lo6: cross(-1,-6),  hi6: cross(1,-6),
          lo20: cross(-1,-20), hi20: cross(1,-20)};
}

function lateralContinuity(a, nx, ns){
  if (!a || nx < 3 || ns < 3) return null;
  const stride = Math.max(1, Math.ceil(nx*ns/300000));
  let sa=0, sb=0, saa=0, sbb=0, sab=0, c=0;
  for (let i=0;i<nx-1;i++) for (let j=0;j<ns;j+=stride){
    const x = a[i*ns+j], y = a[(i+1)*ns+j];
    if (!isFinite(x) || !isFinite(y)) continue;
    sa+=x; sb+=y; saa+=x*x; sbb+=y*y; sab+=x*y; c++;
  }
  if (c < 500) return null;
  const cov = sab/c - (sa/c)*(sb/c);
  const va = saa/c - (sa/c)*(sa/c), vb = sbb/c - (sb/c)*(sb/c);
  if (!(va > 0) || !(vb > 0)) return null;
  return Math.max(-1, Math.min(1, cov/Math.sqrt(va*vb)));
}
