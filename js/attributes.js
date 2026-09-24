function attrRelief(src, nx, nz, azDeg, altDeg, relief){
  const scale = percentileAbs(src, 98) || 1e-30;
  const az = azDeg * Math.PI/180, alt = altDeg * Math.PI/180;
  const lx = Math.cos(alt)*Math.sin(az);
  const ly = -Math.cos(alt)*Math.cos(az);
  const lz = Math.sin(alt);
  const out = new Float32Array(nx*nz);
  const at = (i,j) => src[Math.min(nx-1,Math.max(0,i))*nz + Math.min(nz-1,Math.max(0,j))]
                      / scale * relief;
  for (let i=0;i<nx;i++) for (let j=0;j<nz;j++){
    // central differences give the surface gradient in trace and sample steps
    const p = (at(i+1,j) - at(i-1,j)) * 0.5;
    const q = (at(i,j+1) - at(i,j-1)) * 0.5;
    const inv = 1/Math.sqrt(p*p + q*q + 1);
    const dot = (-p*lx - q*ly + lz) * inv;
    out[i*nz+j] = 0.15 + 0.85*Math.max(0, dot);      // ambient + diffuse
  }
  return out;
}

/* The same shading multiplied into the amplitude color, which keeps polarity
   readable while the relief carries the structure. */
function attrReliefRGB(d, shade, nx, nz, lutName){
  const lut = buildLUT(lutName || "bwr");
  const clip = percentileAbs(d, 98) || 1e-30;
  const R = new Float32Array(nx*nz), G = new Float32Array(nx*nz), B = new Float32Array(nx*nz);
  for (let k=0;k<R.length;k++){
    let t = d[k]/clip;
    t = t > 1 ? 1 : (t < -1 ? -1 : t);
    const idx = ((t+1)*255.5)|0;
    // Multiplying by the raw 0.15-1 shading crushes the color to black. Map it
    // to a narrower range about 1 so the shading modulates the color instead
    // of replacing it.
    const sh = 0.55 + 0.75*shade[k];
    R[k] = Math.min(255, lut[idx*3]*sh);
    G[k] = Math.min(255, lut[idx*3+1]*sh);
    B[k] = Math.min(255, lut[idx*3+2]*sh);
  }
  return [R, G, B];
}

/* Analytic signal per trace: FFT along time, keep positive frequencies,
   inverse. The real part is the input, the imaginary part its Hilbert
   transform. */
function analyticSignal(d, nx, nz){
  // Mirror-padded. A plain FFT treats the trace as periodic, so the jump from
  // the last sample back to the first acts like a step, and the Hilbert
  // transform of a step has long tails. Mild on zero-mean seismic, severe on
  // a strictly positive signal such as an RMS envelope or a Teager-Kaiser
  // energy, which is exactly what the AVT and TKV steps feed it.
  const N = pow2(nz*2);
  const re = new Float64Array(N), im = new Float64Array(N);
  const oR = new Float32Array(nx*nz), oI = new Float32Array(nx*nz);
  const cl = v => v < 0 ? 0 : (v >= nz ? nz-1 : v);
  for (let i=0;i<nx;i++){
    re.fill(0); im.fill(0);
    for (let j=0;j<nz;j++) re[j] = d[i*nz+j];
    for (let j=nz;j<N;j++){
      const u = (j-nz)/(N-nz);
      re[j] = (1-u)*re[cl(2*nz-2-j)] + u*re[cl(N-j)];
    }
    fftRadix2(re, im, false);
    for (let k=1;k<N/2;k++){ re[k]*=2; im[k]*=2; }
    for (let k=N/2+1;k<N;k++){ re[k]=0; im[k]=0; }
    fftRadix2(re, im, true);
    for (let j=0;j<nz;j++){ oR[i*nz+j]=re[j]; oI[i*nz+j]=im[j]; }
  }
  return {re:oR, im:oI};
}

function attrEnvelope(A){
  const n = A.re.length, o = new Float32Array(n);
  for (let k=0;k<n;k++) o[k] = Math.hypot(A.re[k], A.im[k]);
  return o;
}

function attrCosPhase(A){
  const n = A.re.length, o = new Float32Array(n);
  for (let k=0;k<n;k++) o[k] = A.re[k] / (Math.hypot(A.re[k], A.im[k]) + 1e-30);
  return o;
}

function attrPhaseRate(A, env, nx, nz, dts){
  const N = pow2(nz*2);
  const re = new Float64Array(N), im = new Float64Array(N);
  const o = new Float32Array(nx*nz);
  for (let i=0;i<nx;i++){
    const b = i*nz;
    re.fill(0); im.fill(0);
    for (let j=0;j<nz;j++){ re[j] = A.re[b+j]; im[j] = A.im[b+j]; }
    fftRadix2(re, im, false);
    for (let k=0;k<N;k++){
      const kk = (k <= N/2 ? k : k-N);
      const w = 2*Math.PI*kk/(N*dts);
      const nr = -im[k]*w, ni = re[k]*w;      // multiply by i*w
      re[k] = nr; im[k] = ni;
    }
    fftRadix2(re, im, true);
    for (let j=0;j<nz;j++){
      const e2 = env[b+j]*env[b+j] + 1e-30;
      o[b+j] = (A.re[b+j]*im[j] - A.im[b+j]*re[j]) / e2;
    }
  }
  return o;
}

function attrInstFreq(A, env, nx, nz, dts){
  const r = attrPhaseRate(A, env, nx, nz, dts);
  const o = new Float32Array(r.length);
  for (let k=0;k<o.length;k++) o[k] = r[k] / (2*Math.PI);
  return o;
}

/* Semblance along the local dip, over a small trace aperture. On a 2D line
   this is continuity in the line direction only. */
function attrCoherence(d, dip, nx, nz, winX, winT){
  const half = (winX-1)>>1;
  const at = (i,j) => d[Math.min(nx-1,Math.max(0,i))*nz + Math.min(nz-1,Math.max(0,j))];
  const sum = new Float32Array(nx*nz), sq = new Float32Array(nx*nz);
  for (let i=0;i<nx;i++) for (let j=0;j<nz;j++){
    const k = i*nz+j, p = dip[k];
    let s = 0, q = 0;
    for (let m=-half;m<=half;m++){
      const z = j + m*p, z0 = Math.floor(z), f = z-z0;
      const v = at(i+m,z0)*(1-f) + at(i+m,z0+1)*f;
      s += v; q += v*v;
    }
    sum[k] = s; sq[k] = q;
  }
  const kk = Math.max(1, winT|0);
  const box = (src) => {
    const o = new Float32Array(src.length);
    for (let i=0;i<nx;i++){
      const b = i*nz; let acc = 0;
      for (let j=0;j<nz;j++){
        acc += src[b+j];
        if (j >= kk) acc -= src[b+j-kk];
        o[b + Math.max(0, j-(kk>>1))] = acc / Math.min(j+1, kk);
      }
    }
    return o;
  };
  const nsum = new Float32Array(nx*nz);
  for (let m=0;m<nsum.length;m++) nsum[m] = sum[m]*sum[m];
  const NU = box(nsum), DE = box(sq);
  const o = new Float32Array(nx*nz);
  for (let m=0;m<o.length;m++)
    o[m] = Math.max(0, Math.min(1, NU[m] / (winX*DE[m] + 1e-30)));
  return o;
}

/* Constant-Q band: Gaussian bandpass, then envelope. */
function attrSpectralBand(d, nx, nz, dt_s, fc, q){
  const N = pow2(nz);
  const re = new Float64Array(N), im = new Float64Array(N);
  const out = new Float32Array(nx*nz);
  const bw = Math.max(fc/q, 1);
  const wgt = new Float64Array(N);
  for (let k=0;k<N;k++){
    const f = (k <= N/2 ? k : k-N) / (N*dt_s);
    wgt[k] = Math.exp(-0.5*Math.pow((Math.abs(f)-fc)/bw, 2));
  }
  for (let i=0;i<nx;i++){
    re.fill(0); im.fill(0);
    for (let j=0;j<nz;j++) re[j] = d[i*nz+j];
    fftRadix2(re, im, false);
    for (let k=0;k<N;k++){ re[k]*=wgt[k]; im[k]*=wgt[k]; }
    for (let k=1;k<N/2;k++){ re[k]*=2; im[k]*=2; }
    for (let k=N/2+1;k<N;k++){ re[k]=0; im[k]=0; }
    fftRadix2(re, im, true);
    for (let j=0;j<nz;j++) out[i*nz+j] = Math.hypot(re[j], im[j]);
  }
  return out;
}

/* ---- RMS amplitude in a running window (half-height K samples) ---- */
function attrRMS(d, nx, nz, K){
  const o = new Float32Array(nx*nz);
  for (let i=0;i<nx;i++){
    const b = i*nz;
    const c = new Float64Array(nz+1);
    for (let j=0;j<nz;j++) c[j+1] = c[j] + d[b+j]*d[b+j];
    for (let j=0;j<nz;j++){
      const lo = Math.max(0, j-K), hi = Math.min(nz, j+K+1);
      o[b+j] = Math.sqrt((c[hi]-c[lo]) / (hi-lo));
    }
  }
  return o;
}

/* ---- Relative acoustic impedance: divide the spectrum by i*w, then Ormsby.
   Integration rotates the data by -90 degrees, lifts the low frequencies and
   cuts the high ones; the filter stops noise below the measured spectrum from
   running away. DC is dropped, since the integration constant is not
   recoverable and "relative" impedance carries no absolute datum. ---- */
function attrRAI(d, nx, nz, dts, c1, c2, c3, c4){
  const N = pow2(nz*2);
  const re = new Float64Array(N), im = new Float64Array(N);
  const out = new Float32Array(nx*nz);
  for (let i=0;i<nx;i++){
    re.fill(0); im.fill(0);
    for (let j=0;j<nz;j++) re[j] = d[i*nz+j];
    fftRadix2(re, im, false);
    for (let k=0;k<N;k++){
      const kk = (k <= N/2 ? k : k-N);
      const f = kk/(N*dts), w = 2*Math.PI*f;
      if (w === 0){ re[k]=0; im[k]=0; continue; }
      // divide by i*w  ->  multiply by -i/w
      const g = ormsby(f, c1, c2, c3, c4) / w;
      const nr = im[k]*g, ni = -re[k]*g;
      re[k] = nr; im[k] = ni;
    }
    fftRadix2(re, im, true);
    for (let j=0;j<nz;j++) out[i*nz+j] = re[j];
  }
  return out;
}

/* ---- Amplitude volume transform (Bulhoes, 1999): envelope, RMS of the
   envelope in a short window, then the inverse Hilbert transform to
   accentuate vertical change. The result is zero mean. ---- */
function attrAVT(env, nx, nz, K){
  const r = attrRMS(env, nx, nz, K);
  const A = analyticSignal(r, nx, nz);
  const o = new Float32Array(nx*nz);
  for (let k=0;k<o.length;k++) o[k] = -A.im[k];
  return o;
}

/* ---- Holoborodko smooth noise-robust differentiators ---- */
const HOLO = {
  5:[-1,-2,0,2,1].map(v=>v/8),
  7:[-1,-4,-5,0,5,4,1].map(v=>v/32),
  9:[-1,-6,-14,-14,0,14,14,6,1].map(v=>v/128)
};

function derivHolo(d, nx, nz, dts, len, order){
  const k = HOLO[len] || HOLO[7], h = (k.length-1)>>1;
  let cur = d;
  for (let p=0;p<order;p++){
    const o = new Float32Array(nx*nz);
    for (let i=0;i<nx;i++){
      const b = i*nz;
      for (let j=0;j<nz;j++){
        let s = 0;
        for (let m=-h;m<=h;m++){
          const jj = Math.min(nz-1, Math.max(0, j+m));
          s += k[m+h]*cur[b+jj];
        }
        o[b+j] = s/dts;
      }
    }
    cur = o;
  }
  return cur;
}

/* ---- Teager-Kaiser energy, continuous form (Kaiser, 1993):
       TK[x] = (dx/dt)^2 - x * d2x/dt2
   On the analytic trace the real and imaginary parts each contribute, so the
   result is twice the real-trace value (Hamila et al., 1999). For A*cos(wt)
   the real-trace operator returns A^2*w^2 exactly.
   The Holoborodko filters are low-pass, so the energy reads increasingly low
   with frequency: on 2 ms data the 7-point filter gives 0.99 of the true
   derivative at 10 Hz but 0.81 at 45 Hz, so the energy there is ~35% low.
   That is the price of their noise robustness. ---- */
function attrTKE(d, nx, nz, dts, len, useComplex){
  const parts = [];
  if (useComplex){
    const A = analyticSignal(d, nx, nz);
    parts.push(A.re, A.im);
  } else parts.push(d);
  const o = new Float32Array(nx*nz);
  for (const x of parts){
    const d1 = derivHolo(x, nx, nz, dts, len, 1);
    const d2 = derivHolo(x, nx, nz, dts, len, 2);
    for (let k=0;k<o.length;k++) o[k] += d1[k]*d1[k] - x[k]*d2[k];
  }
  for (let k=0;k<o.length;k++) if (o[k] < 0) o[k] = 0;
  return o;
}

/* ---- Teager-Kaiser variation (Matos, 2018): bandpass the energy, then
   Hilbert transform it. The energy is non-negative and so cannot feed a
   coherence computation; the variation is zero mean and can. ---- */
function attrTKV(tke, nx, nz, dts, c1, c2, c3, c4){
  const N = pow2(nz*2);
  const re = new Float64Array(N), im = new Float64Array(N);
  const filt = new Float32Array(nx*nz);
  for (let i=0;i<nx;i++){
    re.fill(0); im.fill(0);
    for (let j=0;j<nz;j++) re[j] = tke[i*nz+j];
    fftRadix2(re, im, false);
    for (let k=0;k<N;k++){
      const kk = (k <= N/2 ? k : k-N);
      const g = ormsby(kk/(N*dts), c1, c2, c3, c4);
      re[k]*=g; im[k]*=g;
    }
    fftRadix2(re, im, true);
    for (let j=0;j<nz;j++) filt[i*nz+j] = re[j];
  }
  const A = analyticSignal(filt, nx, nz);
  const o = new Float32Array(nx*nz);
  for (let k=0;k<o.length;k++) o[k] = -A.im[k];
  return o;
}

/* ---- Wavelet (response) attributes, Bodine (1984): find the local envelope
   maxima and minima, and assign the value at each maximum to every sample
   between the adjacent minima. Extrema are only counted where the envelope is
   a real fraction of the trace peak, or float noise in a dead part of a trace
   produces hundreds of spurious ones. ---- */
function attrWavelet(env, src, nx, nz, floorFrac){
  const o = new Float32Array(nx*nz);
  for (let i=0;i<nx;i++){
    const b = i*nz;
    let peak = 0;
    for (let j=0;j<nz;j++) if (env[b+j] > peak) peak = env[b+j];
    const fl = floorFrac*peak;
    const mins = [0];
    for (let j=1;j<nz-1;j++)
      if (env[b+j] < env[b+j-1] && env[b+j] <= env[b+j+1] && env[b+j] > fl) mins.push(j);
    mins.push(nz);
    for (let s=0;s<mins.length-1;s++){
      const a = mins[s], c = mins[s+1];
      if (c <= a) continue;
      let best = a, bv = -1;
      for (let j=a;j<c;j++) if (env[b+j] > bv){ bv = env[b+j]; best = j; }
      for (let j=a;j<c;j++) o[b+j] = src[b+best];
    }
  }
  return o;
}

/* ---- Weighted average frequency and bandwidth (Barnes, 2016). Weighted by
   instantaneous power within a Hann window:
       f_avg = sum(w e^2 f)/sum(w e^2),  f_rms = sqrt(sum(w e^2 f^2)/sum(w e^2))
   The full bandwidth is 2*sigma, twice Barnes's sigma, to match the
   signal-processing convention. ---- */
function attrAvgFreq(env, freq, nx, nz, K, wantBandwidth, nyq){
  const n = 2*K+1, w = new Float64Array(n);
  let ws = 0;
  for (let m=0;m<n;m++){ w[m] = 0.5 - 0.5*Math.cos(2*Math.PI*(m+1)/(n+1)); ws += w[m]; }
  for (let m=0;m<n;m++) w[m] /= ws;
  const o = new Float32Array(nx*nz);
  for (let i=0;i<nx;i++){
    const b = i*nz;
    for (let j=0;j<nz;j++){
      let sp = 0, spf = 0, spf2 = 0;
      for (let m=-K;m<=K;m++){
        const jj = Math.min(nz-1, Math.max(0, j+m));
        const f = freq[b+jj];
        // instantaneous frequency outside 0 to Nyquist is not a frequency: the
        // estimate is a ratio whose denominator is the squared envelope, and it
        // runs away wherever the envelope passes through zero. Those samples
        // carry no frequency information and are left out of the statistics.
        if (!(f >= 0 && f <= nyq)) continue;
        const p = env[b+jj]*env[b+jj]*w[m+K];
        sp += p; spf += p*f; spf2 += p*f*f;
      }
      const fa = spf/(sp+1e-30);
      if (!wantBandwidth){ o[b+j] = fa; continue; }
      const fr2 = spf2/(sp+1e-30);
      o[b+j] = 2*Math.sqrt(Math.max(fr2 - fa*fa, 0));
    }
  }
  return o;
}

/* ---- Unwrapped phase (Vesnaver, 2017). Normalizing the complex trace by its
   envelope gives V = exp(i*phi), so conj(A)*dA/dt = e^2 * i*dphi/dt and the
   phase derivative can be read off and integrated without ever wrapping. The
   derivative is spectral: a central difference under-reads by sin(w*dt)/(w*dt),
   nine percent at 60 Hz on 2 ms data, which integrates into a visible drift. */
function attrUnwrap(dphi, env, phase, nx, nz, dts){
  const o = new Float32Array(nx*nz);
  const up = new Float64Array(nz);
  for (let i=0;i<nx;i++){
    const b = i*nz;
    up[0] = 0;
    for (let j=1;j<nz;j++) up[j] = up[j-1] + 0.5*(dphi[b+j] + dphi[b+j-1])*dts;
    // Anchor by the envelope-weighted circular mean of (wrapped - integrated).
    // Anchoring on one sample is fragile: sample zero is where the Hilbert
    // transform is least reliable, and on a flat-envelope trace the strongest
    // sample is arbitrary.
    let sr = 0, si = 0;
    for (let j=0;j<nz;j++){
      const wgt = env[b+j]*env[b+j], dd = phase[b+j] - up[j];
      sr += wgt*Math.cos(dd); si += wgt*Math.sin(dd);
    }
    const off = Math.atan2(si, sr);
    for (let j=0;j<nz;j++) o[b+j] = up[j] + off;
  }
  return o;
}

/* One place that knows how to compute any attribute, given a cache of the
   intermediates several of them share. Computing six attributes without this
   would build the analytic signal six times. */
const ATTR_META = {
  envelope:{n:"Envelope",s:"env"},        insphase:{n:"Instantaneous phase",s:"phase"},
  cosphase:{n:"Cosine of phase",s:"cos\u03c6"}, insfreq:{n:"Instantaneous frequency",s:"f inst"},
  unwrap:{n:"Unwrapped phase",s:"unwrap"}, sweetness:{n:"Sweetness",s:"sweet"},
  wavfreq:{n:"Wavelet frequency",s:"f wav"}, wavphase:{n:"Wavelet phase",s:"\u03c6 wav"},
  avgfreq:{n:"Average frequency",s:"f avg"}, avgband:{n:"Average bandwidth",s:"bandw"},
  rms:{n:"RMS amplitude",s:"rms"},        tke:{n:"Teager-Kaiser energy",s:"TKE"},
  tkv:{n:"Teager-Kaiser variation",s:"TKV"}, avt:{n:"Amplitude volume transform",s:"AVT"},
  rai:{n:"Relative acoustic impedance",s:"RAI"}, dip:{n:"Apparent dip",s:"dip"},
  linearity:{n:"Linearity",s:"linear"},   coherence:{n:"In-line coherence",s:"coher"},
  band:{n:"Spectral band",s:"band"},      rgb:{n:"Three-band RGB blend",s:"RGB"},
  relief:{n:"Relief shading",s:"relief"}, reliefrgb:{n:"Relief over amplitude",s:"rel+amp"}
};

const CBLAB = {envelope:"amplitude", cosphase:"cos phase", insfreq:"Hz",
               dip:"samples/trace", linearity:"linearity", coherence:"semblance",
               sweetness:"sweetness", band:"amplitude", rms:"amplitude",
               rai:"impedance", tke:"energy", tkv:"variation", avt:"AVT",
               insphase:"radians", unwrap:"radians", wavfreq:"Hz",
               wavphase:"radians", avgfreq:"Hz", avgband:"Hz"};

/* The intermediates the attributes share, built once over whichever section is
   being worked on. The section and its structure tensor are carried on the
   cache rather than read from a global, so a page can compute attributes over
   the raw line, over any stage of the filter chain, or over two of them side by
   side. */
function attrCache(d, nx, ns, dt, tensor){
  const dts = dt * 1e-6;
  const c = {nx, ns, dts};
  return {
    d, tensor,
    get A(){ return c._A || (c._A = analyticSignal(d, nx, ns)); },
    get env(){ return c._e || (c._e = attrEnvelope(this.A)); },
    get phase(){
      if (!c._p){ const A = this.A, o = new Float32Array(nx*ns);
        for (let k=0;k<o.length;k++) o[k] = Math.atan2(A.im[k], A.re[k]);
        c._p = o; }
      return c._p;
    },
    get freq(){ return c._f || (c._f = attrInstFreq(this.A, this.env, nx, ns, dts)); },
    /* Which samples carry signal. A crop that includes a water column, a mute
       zone or a quiet interval below the reflective section holds samples whose
       envelope is orders of magnitude below the rest. Attributes are still
       computed there, and on those samples the instantaneous quantities are
       determined by whatever noise is present, so their values are large and
       arbitrary. The mask is used for the color ranges, so the range comes
       from the part of the section that carries reflections. */
    get live(){
      if (!c._live){
        const env = this.env, thr = 0.02 * percentile(env, 99);
        const m = new Uint8Array(env.length);
        let n = 0;
        for (let k = 0; k < env.length; k++) if (env[k] > thr){ m[k] = 1; n++; }
        c._live = m; c._liveN = n;
      }
      return c._live;
    },
    get liveFrac(){ this.live; return c._liveN / (nx*ns); },
    get rate(){ return c._r || (c._r = attrPhaseRate(this.A, this.env, nx, ns, dts)); },
    nx, ns, dts
  };
}

function computeOne(key, p, C){
  const {nx, ns, dts} = C;
  const nyq = 0.5 / dts;
  const K = Math.max(1, Math.round(p.attrWin*1e-3/dts/2));       // event scale
  const KI = Math.max(1, Math.round(p.attrWinI*1e-3/dts/2));     // interval scale
  // The semblance window was a fixed number of samples, which is a different
  // length in time on every sample interval. It follows the event window, which
  // is where semblance is conventionally set: about one wavelet period. Taken
  // from the interval window instead it smooths toward RMS amplitude, and the
  // correlation between the two rises from 0.57 to 0.62 on Wyoming Line 1.
  const cohT = Math.max(5, Math.min(81, 2*K + 1));
  const band = [5, 10, Math.min(60, nyq*0.5), Math.min(70, nyq*0.6)];
  /* Percentiles for the color range, taken over the samples that carry signal
     when they are at least a twentieth of the crop, and over everything when
     they are not. */
  const live = C.live, liveOK = C.liveFrac > 0.05;
  const pct = (a, q) => {
    if (!liveOK) return percentile(a, q);
    const v = [];
    for (let k = 0; k < a.length; k++) if (live[k] && isFinite(a[k])) v.push(a[k]);
    if (v.length < 100) return percentile(a, q);
    v.sort((x, y) => x - y);
    return v[Math.min(v.length - 1, Math.max(0, Math.round(q / 100 * (v.length - 1))))];
  };
  const sym = a => { const m = Math.max(Math.abs(pct(a,1)), Math.abs(pct(a,99))) || 1e-9;
                     return [-m, m]; };
  let a, vmin, vmax, cmap = "magma", unit = "";
  let shadowPct = null;      // relief only: fraction of the image in full shadow

  switch (key){
    case "dip": {
      a = C.tensor.dip;
      const m = Math.max(Math.abs(pct(a,2)), Math.abs(pct(a,98)), 0.05);
      vmin=-m; vmax=m; cmap="coolwarm";
      unit="samples per trace, in the line direction only"; break; }
    case "linearity":
      a = C.tensor.lin; vmin=0; vmax=1; cmap="viridis";
      unit="0 where the image has no preferred orientation, 1 where it is layered"; break;
    case "coherence":
      a = attrCoherence(C.d, C.tensor.dip, nx, ns, 5, cohT);
      // on data where neighboring traces are alike the values crowd against 1,
      // so the bottom of the bar follows the data rather than sitting at 0
      vmin = Math.max(0, Math.min(0.95, pct(a, 1))); vmax = 1; cmap="viridis";
      unit="semblance over 5 traces and " + (cohT*dts*1e3).toFixed(0) +
           " ms, drawn from " + vmin.toFixed(2) + " to 1" +
           "; along the line only, so a fault striking with the line will not show";
      break;
    case "rms":
      a = attrRMS(C.d, nx, ns, KI); vmin=0; vmax=pct(a,99);
      unit="running window of +/-" + (p.attrWinI/2).toFixed(0) + " ms"; break;
    case "rai":
      a = attrRAI(C.d, nx, ns, dts, band[0], band[1], band[2], band[3]);
      [vmin, vmax] = sym(a); cmap="batlow";
      unit="trace integration then Ormsby; band-limited, no absolute datum"; break;
    case "tke":
      a = attrTKE(C.d, nx, ns, dts, p.attrDl, true); vmin=0; vmax=pct(a,99);
      unit="complex trace, " + p.attrDl + "-point derivative; reads low at high frequency";
      break;
    case "tkv":
      a = attrTKV(attrTKE(C.d, nx, ns, dts, p.attrDl, true), nx, ns, dts,
                  band[0], band[1], band[2], band[3]);
      [vmin, vmax] = sym(a); cmap="coolwarm";
      unit="bandpassed energy, then Hilbert; zero mean, so it can feed coherence"; break;
    case "band":
      a = attrSpectralBand(C.d, nx, ns, dts, p.attrFc, 3.0);
      vmin=0; vmax=pct(a,99);
      unit="constant-Q Gaussian band at " + p.attrFc + " Hz, then envelope"; break;
    case "avt":
      a = attrAVT(C.env, nx, ns, K); [vmin, vmax] = sym(a); cmap="gray";
      unit="RMS envelope over +/-" + (p.attrWin/2).toFixed(0) +
           " ms, then inverse Hilbert; zero mean"; break;
    case "envelope":
      a = C.env; vmin=0; vmax=pct(a,99);
      unit="instantaneous amplitude, insensitive to polarity"; break;
    case "insphase":
      a = C.phase; vmin=-Math.PI; vmax=Math.PI; cmap="coolwarm";
      unit="radians; wraps at +/-pi"; break;
    case "cosphase": {
      const A = C.A; a = new Float32Array(nx*ns);
      for (let k=0;k<a.length;k++) a[k] = A.re[k]/(Math.hypot(A.re[k],A.im[k])+1e-30);
      vmin=-1; vmax=1; cmap="gray";
      unit="every event at equal strength, so weak ones show alongside bright ones";
      break; }
    case "insfreq":
      a = C.freq; vmin=percentile(a,2); vmax=pct(a,98); cmap="viridis";
      unit="Hz; unstable wherever the envelope is small"; break;
    case "unwrap":
      a = attrUnwrap(C.rate, C.env, C.phase, nx, ns, dts);
      vmin=percentile(a,1); vmax=pct(a,99); cmap="viridis";
      unit="radians, integrated without wrapping (Vesnaver, 2017)"; break;
    case "sweetness": {
      const e = C.env, f = C.freq; a = new Float32Array(e.length);
      for (let k=0;k<a.length;k++) a[k] = e[k]/Math.sqrt(Math.max(Math.abs(f[k]),1));
      vmin=0; vmax=pct(a,99);
      unit="envelope divided by the square root of frequency"; break; }
    case "wavfreq":
      a = attrWavelet(C.env, C.freq, nx, ns, 1e-3);
      vmin=0; vmax=Math.min(nyq, pct(a,98)); cmap="viridis";
      unit="Hz, held constant between envelope minima (Bodine, 1984)"; break;
    case "wavphase":
      a = attrWavelet(C.env, C.phase, nx, ns, 1e-3);
      vmin=-Math.PI; vmax=Math.PI; cmap="coolwarm";
      unit="radians, taken at the envelope peak of each lobe"; break;
    case "avgfreq":
      a = attrAvgFreq(C.env, C.freq, nx, ns, KI, false, nyq);
      vmin=0; vmax=Math.min(nyq, pct(a,98)); cmap="viridis";
      unit="Hz, power-weighted over +/-" + (p.attrWinI/2).toFixed(0) + " ms"; break;
    case "avgband":
      a = attrAvgFreq(C.env, C.freq, nx, ns, KI, true, nyq);
      vmin=0; vmax=pct(a,98); cmap="viridis";
      unit="Hz, 2*sigma of the power-weighted frequency distribution over +/-" +
           (p.attrWinI/2).toFixed(0) + " ms"; break;
    case "relief": {
      const rs = reliefSurface(p, C, nx, ns, dts);
      const rz = reliefScale(rs, p, nx, ns);
      a = attrRelief(rs, nx, ns, p.relAz, p.relAlt, rz);
      vmin = 0; vmax = 1; cmap = "gray";
      // Fraction sitting on the ambient floor. Once this is more than a few
      // percent the surface is too steep and every wavelet cycle is a cliff.
      const pct = shadowFraction(a);
      shadowPct = pct;
      unit = (p.relSurf === "env" ? "envelope" : "amplitude") + " lit from " + p.relAz +
             "\u00b0 at " + p.relAlt + "\u00b0, relief \u00d7" + rz.toFixed(2) + ", " +
             pct.toFixed(1) + "% in full shadow";
      break; }
    case "reliefrgb": {
      const rs2 = reliefSurface(p, C, nx, ns, dts);
      const sh = attrRelief(rs2, nx, ns, p.relAz, p.relAlt, reliefScale(rs2, p, nx, ns));
      const ch = attrReliefRGB(C.d, sh, nx, ns, p.cmap);
      return {key, rgb:ch, scales:[255,255,255], title:ATTR_META.reliefrgb.n,
              cbLabel:"amplitude", legend:"ampbar",
              ampLut:p.cmap, ampClip:(percentileAbs(C.d, 98) || 1e-30),
              unit:"amplitude color shaded from " + p.relAz +
              "\u00b0, relief \u00d7" + p.relZ.toFixed(2)}; }
    case "rgb": {
      const fLo = Math.max(2, p.attrFc/1.8), fHi = Math.min(0.48/dts, p.attrFc*1.8);
      const R = attrSpectralBand(C.d, nx, ns, dts, fLo, 3.0);
      const G = attrSpectralBand(C.d, nx, ns, dts, p.attrFc, 3.0);
      const B = attrSpectralBand(C.d, nx, ns, dts, fHi, 3.0);
      return {key, rgb:[R,G,B], legend:"bands",
              bands:[fLo, p.attrFc, fHi],
              scales:[percentile(R,99), percentile(G,99), percentile(B,99)],
              title:ATTR_META.rgb.n, cbLabel:"",
              unit:"red " + fLo.toFixed(0) + " Hz, green " + p.attrFc.toFixed(0) +
                   " Hz, blue " + fHi.toFixed(0) + " Hz"}; }
    default: return null;
  }
  // say so when part of the crop carries no signal and the range came from
  // the rest of it, since that is a fact about the display, not the data
  if (liveOK && C.liveFrac < 0.9)
    unit += (unit ? "; " : "") + "color range from the " + Math.round(100*C.liveFrac) +
            " percent of the crop carrying signal";
  return {key, a, vmin, vmax, cmapDefault:cmap, unit, shadowPct,
          title:ATTR_META[key].n, cbLabel:CBLAB[key] || ""};
}
