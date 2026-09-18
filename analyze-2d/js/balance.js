/* ========================= spectral balancing =========================
   The amplitude spectrum of a deep line is not flat and does not stay the same
   down the record. The high frequencies are weaker than the low ones at the
   top and weaker still at the bottom, because absorption and scattering take
   more out of them on the longer path. Balancing measures how much of each
   frequency is present at each time and raises the weak parts toward the
   strong ones.

   Two things go under that name and the controls keep them apart. Balancing in
   time holds each band at a constant level down the record, which undoes the
   loss of high frequencies with depth and leaves the shape of the spectrum as
   measured. Flattening across frequency brings the bands to a common level,
   which is whitening. A line can be given one without the other.

   The operator here is a filter bank. Each trace is split into overlapping
   Gaussian bands, the envelope of each band is measured with a running window,
   each band is divided by its own smoothed envelope, and the bands are added
   back together. Dividing by a smoothed envelope rather than a single number
   per trace is what makes it time variant: a band that dies out at 6 seconds
   is raised at 6 seconds and left alone at 2.

   The band weights are normalized so that they sum to the output taper at
   every frequency. At strength 0 the operator returns the input with the taper
   applied and nothing else changed, which makes the difference panel on the
   balancing page an honest zero.

   Whitening raises weak frequencies whether the energy there is reflection or
   noise. Where a band holds no signal at a given time, the division amplifies
   whatever is in it, which is why the floor exists and why the removed panel
   is worth reading on this step. */

/* p = {f1, f2, f3, f4  output taper corners in Hz, as an Ormsby
        nb              number of bands in the filter bank
        smoothMs        length of the envelope window, milliseconds
        strength        how far each band is flattened in time. 0 leaves the
                        band alone, 1 holds its envelope constant down the whole
                        record
        flatten         how far the bands are brought to a common level. 0 keeps
                        the relative size of the bands as measured, 1 gives every
                        band the same level, which is whitening
        floorPct        stability floor, as a percentage of each band's own
                        median envelope} */
function spectralBalance(d, nx, nz, dt_s, p){
  const N = pow2(Math.max(256, nz));
  const nb = Math.max(2, Math.min(24, Math.round(p.nb)));
  const str = Math.max(0, Math.min(1, p.strength));
  const half = Math.max(1, Math.round((p.smoothMs * 1e-3) / dt_s / 2));
  const floorFrac = Math.max(1e-4, p.floorPct / 100);

  // band centers, spaced geometrically so that each band covers a constant
  // fraction of its own center frequency, which is how bandwidth behaves
  const lo = Math.max(0.5, p.f1), hi = Math.max(lo * 1.5, p.f4);
  const ratio = Math.pow(hi / lo, 1 / (nb - 1));
  const fc = [], sig = [];
  for (let b = 0; b < nb; b++){
    fc.push(lo * Math.pow(ratio, b));
    sig.push(fc[b] * Math.log(ratio) * 0.6);
  }

  // weights, then normalized so the bank sums to the output taper at every
  // frequency rather than to an arbitrary bumpy envelope
  const W = [];
  for (let b = 0; b < nb; b++) W.push(new Float64Array(N));
  const sum = new Float64Array(N);
  for (let k = 0; k < N; k++){
    const f = Math.abs((k <= N/2 ? k : k - N) / (N * dt_s));
    for (let b = 0; b < nb; b++){
      const w = Math.exp(-0.5 * Math.pow((f - fc[b]) / sig[b], 2));
      W[b][k] = w; sum[k] += w;
    }
  }
  for (let k = 0; k < N; k++){
    const f = Math.abs((k <= N/2 ? k : k - N) / (N * dt_s));
    const taper = ormsby(f, p.f1, p.f2, p.f3, p.f4);
    const s = sum[k] > 1e-12 ? sum[k] : 1;
    for (let b = 0; b < nb; b++) W[b][k] = W[b][k] / s * taper;
  }

  const out = new Float32Array(nx * nz);
  const re = new Float64Array(N), im = new Float64Array(N);
  const sre = new Float64Array(N), sim = new Float64Array(N);
  const work = new Float64Array(nz);
  // the bands of one trace and their smoothed envelopes, held while the levels
  // are compared against each other
  const bandRe = [], bandEnv = [], ref = new Float64Array(nb);
  for (let b = 0; b < nb; b++){
    bandRe.push(new Float64Array(nz)); bandEnv.push(new Float64Array(nz));
  }
  const env = new Float64Array(nz);
  const flat = Math.max(0, Math.min(1, p.flatten === undefined ? 0 : p.flatten));

  for (let i = 0; i < nx; i++){
    sre.fill(0); sim.fill(0);
    for (let j = 0; j < nz; j++) sre[j] = d[i*nz + j];
    fftRadix2(sre, sim, false);

    for (let b = 0; b < nb; b++){
      const w = W[b];
      // the analytic signal of the band: keep the positive frequencies and
      // double them, so one inverse transform gives the band on the real part
      // and its Hilbert transform on the imaginary part
      re.fill(0); im.fill(0);
      re[0] = sre[0]*w[0]; im[0] = sim[0]*w[0];
      for (let k = 1; k < N/2; k++){
        re[k] = 2*sre[k]*w[k]; im[k] = 2*sim[k]*w[k];
      }
      re[N/2] = sre[N/2]*w[N/2]; im[N/2] = sim[N/2]*w[N/2];
      fftRadix2(re, im, true);

      const bR = bandRe[b], bE = bandEnv[b];
      for (let j = 0; j < nz; j++){
        bR[j] = re[j];
        env[j] = Math.hypot(re[j], im[j]);
      }
      boxSmooth(env, bE, nz, half, work);
      let acc = 0;
      for (let j = 0; j < nz; j++) acc += bE[j];
      ref[b] = acc / nz;
    }

    // the level every band is brought toward when flattening: the geometric
    // mean of the band levels, which keeps the amplitude of the trace roughly
    // where it was instead of tying it to whichever band happens to be loudest
    let logSum = 0, live = 0;
    for (let b = 0; b < nb; b++) if (ref[b] > 0){ logSum += Math.log(ref[b]); live++; }
    if (!live) continue;
    const common = Math.exp(logSum / live);

    for (let b = 0; b < nb; b++){
      if (!(ref[b] > 0)) continue;
      const target = Math.pow(ref[b], 1 - flat) * Math.pow(common, flat);
      const floor = ref[b] * floorFrac;
      const bR = bandRe[b], bE = bandEnv[b];
      for (let j = 0; j < nz; j++){
        const lvl = str === 0 ? ref[b] : Math.pow(ref[b], 1 - str) * Math.pow(bE[j] + floor, str);
        out[i*nz + j] += bR[j] * (target / lvl);
      }
    }
  }
  return out;
}

/* Running mean of length 2*half+1 along a trace, with the ends held rather
   than tapered to zero, so the gain does not run away at the top and bottom of
   the record. */
function boxSmooth(src, dst, n, half, work){
  const w = 2*half + 1;
  let acc = 0;
  for (let j = 0; j < Math.min(n, half+1); j++) acc += src[j];
  let cnt = Math.min(n, half+1);
  for (let j = 0; j < n; j++){
    if (j > half){ acc -= src[j-half-1]; cnt--; }
    const add = j + half;
    if (add < n && j > 0){ acc += src[add]; cnt++; }
    dst[j] = acc / Math.max(1, cnt);
  }
  void w; void work;
}

/* The amplitude response of the bank at a set of frequencies, for drawing the
   output taper on the spectrum plot next to the measured curve. */
function balanceResponse(freqs, p){
  const out = new Float32Array(freqs.length);
  for (let k = 0; k < freqs.length; k++)
    out[k] = ormsby(freqs[k], p.f1, p.f2, p.f3, p.f4);
  return out;
}
