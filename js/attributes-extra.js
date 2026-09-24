/* ===================== covariance, dip variation and the spectral bank =====

   Three groups of attributes that share little with the single-trace ones.

   The covariance group follows the energy-ratio formulation of coherence
   (Chopra and Marfurt, 2007). A window of analytic traces, shifted onto the
   local dip, is treated as a set of vectors. Their covariance matrix is
   Hermitian, its trace is the total energy in the window, and its largest
   eigenvalue is the energy of the single waveform that best represents every
   trace in the window, which is the coherent energy. The ratio of the two is
   between 1/W and 1 for a window of W traces: 1 where the traces differ only
   in scale, lower where they differ in shape.

   Nonparallelism in 3D compares dip vectors across a neighborhood. A 2D line
   carries one dip component, so what can be measured here is how much the
   apparent dip in the plane of the line varies over the window. Reflectors
   that converge, diverge or truncate against one another give a large value;
   parallel bedding of any dip gives zero.

   The spectral group comes from one bank of constant-Q Gaussian filters. Each
   sample then has a local amplitude spectrum sampled at the band centers, and
   the peak, the width and the shape of that spectrum are read off it. */

/* The largest eigenvalue of a small Hermitian matrix by power iteration.
   re and im hold it row by row; the vector starts on the diagonal, which is
   never orthogonal to the leading eigenvector for a positive definite matrix. */
function hermTopEig(re, im, W, iters){
  const vr = new Float64Array(W), vi = new Float64Array(W);
  for (let a = 0; a < W; a++) vr[a] = re[a*W + a] || 1;
  let lam = 0;
  const wr = new Float64Array(W), wi = new Float64Array(W);
  for (let t = 0; t < iters; t++){
    let n2 = 0;
    for (let a = 0; a < W; a++){
      let sr = 0, si = 0;
      for (let b = 0; b < W; b++){
        const rr = re[a*W + b], ii = im[a*W + b];
        sr += rr*vr[b] - ii*vi[b];
        si += rr*vi[b] + ii*vr[b];
      }
      wr[a] = sr; wi[a] = si; n2 += sr*sr + si*si;
    }
    const n = Math.sqrt(n2);
    if (!(n > 0)) return 0;
    for (let a = 0; a < W; a++){ vr[a] = wr[a]/n; vi[a] = wi[a]/n; }
    lam = n;
  }
  return lam;
}

/* Total energy, coherent energy and their ratio, over winX traces and a
   vertical window of winT samples, along the local dip. The energies are
   returned per sample of the window, so they are comparable with mean square
   amplitude rather than growing with the window. */
function attrEnergyRatio(A, dip, nx, nz, winX, winT){
  const half = (winX - 1) >> 1, K = Math.max(1, (winT - 1) >> 1);
  const W = winX, n = W*W;
  const CR = new Float64Array(n), CI = new Float64Array(n);
  const ur = new Float64Array(W), ui = new Float64Array(W);
  const tot = new Float32Array(nx*nz), coh = new Float32Array(nx*nz), ers = new Float32Array(nx*nz);
  const at = (arr, i, z) => {
    const ii = Math.min(nx-1, Math.max(0, i));
    const z0 = Math.floor(z), f = z - z0;
    const j0 = Math.min(nz-1, Math.max(0, z0)), j1 = Math.min(nz-1, Math.max(0, z0+1));
    return arr[ii*nz + j0]*(1-f) + arr[ii*nz + j1]*f;
  };
  for (let i = 0; i < nx; i++){
    for (let j = 0; j < nz; j++){
      const k = i*nz + j, p = dip[k];
      CR.fill(0); CI.fill(0);
      for (let s = -K; s <= K; s++){
        for (let a = 0; a < W; a++){
          const m = a - half, z = j + s + m*p;
          ur[a] = at(A.re, i+m, z); ui[a] = at(A.im, i+m, z);
        }
        for (let a = 0; a < W; a++){
          for (let b = a; b < W; b++){
            const rr = ur[a]*ur[b] + ui[a]*ui[b];      // Re(u_a conj(u_b))
            const ii2 = ui[a]*ur[b] - ur[a]*ui[b];     // Im(u_a conj(u_b))
            CR[a*W + b] += rr; CI[a*W + b] += ii2;
            if (b !== a){ CR[b*W + a] += rr; CI[b*W + a] -= ii2; }
          }
        }
      }
      let tr = 0;
      for (let a = 0; a < W; a++) tr += CR[a*W + a];
      const lam = tr > 0 ? hermTopEig(CR, CI, W, 8) : 0;
      const cells = W*(2*K + 1);
      tot[k] = tr/cells; coh[k] = lam/cells;
      ers[k] = tr > 0 ? Math.max(1/W, Math.min(1, lam/tr)) : 0;
    }
  }
  return {total: tot, coherent: coh, ratio: ers};
}

/* How much the apparent dip varies over the window, in samples per trace.
   The mean is taken over the same window, so a uniformly dipping package
   reads zero however steep it is. Weighted by linearity, so samples where the
   tensor has no supported orientation count for little. */
function attrNonparallel(dip, lin, nx, nz, winX, winT){
  const half = (winX - 1) >> 1, K = Math.max(1, (winT - 1) >> 1);
  const o = new Float32Array(nx*nz);
  for (let i = 0; i < nx; i++){
    for (let j = 0; j < nz; j++){
      let sw = 0, sp = 0, sp2 = 0;
      for (let m = -half; m <= half; m++){
        const ii = Math.min(nx-1, Math.max(0, i+m));
        for (let s = -K; s <= K; s++){
          const jj = Math.min(nz-1, Math.max(0, j+s));
          const q = ii*nz + jj;
          // dips at the tensor's clipping limit are not measurements of a dip
          if (Math.abs(dip[q]) >= 19.9) continue;
          const w = lin[q]*lin[q];
          sw += w; sp += w*dip[q]; sp2 += w*dip[q]*dip[q];
        }
      }
      const mean = sp/(sw + 1e-30);
      o[i*nz + j] = Math.sqrt(Math.max(0, sp2/(sw + 1e-30) - mean*mean));
    }
  }
  return o;
}

/* A bank of constant-Q Gaussian bands, one forward transform per trace and one
   inverse per band. Returns the magnitudes, band by band, and the band center
   frequencies. This is the local amplitude spectrum that the peak, width,
   slope and roughness attributes are read from. */
function spectralBank(d, nx, nz, dt_s, fLo, fHi, nBands, q){
  const N = pow2(nz), nyq = 0.5/dt_s;
  const f = new Float64Array(nBands);
  for (let b = 0; b < nBands; b++) f[b] = fLo + (fHi - fLo)*b/(nBands - 1);
  const wgt = [];
  for (let b = 0; b < nBands; b++){
    const bw = Math.max(f[b]/q, 1), w = new Float64Array(N);
    for (let k = 0; k < N; k++){
      const fk = (k <= N/2 ? k : k - N)/(N*dt_s);
      w[k] = Math.exp(-0.5*Math.pow((Math.abs(fk) - f[b])/bw, 2));
    }
    wgt.push(w);
  }
  const mag = [];
  for (let b = 0; b < nBands; b++) mag.push(new Float32Array(nx*nz));
  const re = new Float64Array(N), im = new Float64Array(N);
  const br = new Float64Array(N), bi = new Float64Array(N);
  for (let i = 0; i < nx; i++){
    re.fill(0); im.fill(0);
    for (let j = 0; j < nz; j++) re[j] = d[i*nz + j];
    fftRadix2(re, im, false);
    for (let b = 0; b < nBands; b++){
      const w = wgt[b];
      for (let k = 0; k < N; k++){
        const g = k > N/2 ? 0 : (k > 0 && k < N/2 ? 2*w[k] : w[k]);
        br[k] = re[k]*g; bi[k] = im[k]*g;
      }
      fftRadix2(br, bi, true);
      const out = mag[b];
      for (let j = 0; j < nz; j++) out[i*nz + j] = Math.hypot(br[j], bi[j]);
    }
  }
  return {mag, f, nBands, nyq};
}

/* The attributes read off the bank at every sample.
   peak frequency and peak magnitude: the largest band, refined by a parabola
     through it and its neighbors;
   bandwidth: twice the standard deviation of the band magnitudes about their
     own center of mass, which is the width of the local spectrum;
   slope: the least-squares gradient of magnitude in decibels against frequency,
     over the bands above the peak, so it measures how fast the spectrum falls
     away on its high side;
   roughness: the root mean square departure of those decibel values from that
     straight line, which is large where the spectrum is notched. */
function attrFromBank(bank, which, nx, nz){
  const {mag, f, nBands} = bank;
  const o = new Float32Array(nx*nz);
  const m = new Float64Array(nBands);
  for (let i = 0; i < nx; i++){
    for (let j = 0; j < nz; j++){
      const k = i*nz + j;
      let top = 0, mx = 0, sum = 0;
      for (let b = 0; b < nBands; b++){
        const v = mag[b][k]; m[b] = v; sum += v;
        if (v > mx){ mx = v; top = b; }
      }
      if (!(sum > 0)) continue;
      if (which === "peakfreq" || which === "peakmag"){
        let fp = f[top], mp = mx;
        if (top > 0 && top < nBands - 1){
          const a = m[top-1], b2 = m[top], c = m[top+1], den = a - 2*b2 + c;
          if (den < 0){
            const sh = 0.5*(a - c)/den;
            fp = f[top] + sh*(f[1] - f[0]);
            mp = b2 - 0.25*(a - c)*sh;
          }
        }
        o[k] = which === "peakfreq" ? fp : mp;
        continue;
      }
      if (which === "specbw"){
        let fc = 0;
        for (let b = 0; b < nBands; b++) fc += f[b]*m[b];
        fc /= sum;
        let v2 = 0;
        for (let b = 0; b < nBands; b++) v2 += m[b]*(f[b] - fc)*(f[b] - fc);
        o[k] = 2*Math.sqrt(v2/sum);
        continue;
      }
      // slope and roughness, on the high side of the peak
      const b0 = Math.min(nBands - 3, top), n = nBands - b0;
      if (n < 3) continue;
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      const floor = 1e-6*mx;
      for (let b = b0; b < nBands; b++){
        const x = f[b], y = 20*Math.log10(Math.max(m[b], floor)/mx);
        sx += x; sy += y; sxx += x*x; sxy += x*y;
      }
      const den = n*sxx - sx*sx;
      if (!(Math.abs(den) > 0)) continue;
      const slope = (n*sxy - sx*sy)/den, icept = (sy - slope*sx)/n;
      if (which === "specslope"){ o[k] = slope; continue; }
      let r2 = 0;
      for (let b = b0; b < nBands; b++){
        const y = 20*Math.log10(Math.max(m[b], floor)/mx);
        const e = y - (slope*f[b] + icept);
        r2 += e*e;
      }
      o[k] = Math.sqrt(r2/n);
    }
  }
  return o;
}
