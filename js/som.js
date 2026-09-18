function somRng(seed){
  let s = seed >>> 0;
  return () => { s = (s*1664525 + 1013904223) >>> 0; return s/4294967296; };
}

function somTrain(X, N, D, gx, gy, epochs, rnd, maxTrain){
  const K = gx*gy;
  const step = Math.max(1, Math.ceil(N/maxTrain));
  const W = new Float32Array(K*D);
  for (let i=0;i<K*D;i++) W[i] = (rnd()-0.5)*0.5;
  const num = new Float64Array(K*D), den = new Float64Array(K);
  for (let ep=0; ep<epochs; ep++){
    const sig = Math.max(0.55, (Math.max(gx,gy)/2) * Math.pow(0.22, ep/Math.max(1,epochs-1)));
    num.fill(0); den.fill(0);
    for (let n=0; n<N; n+=step){
      let best = 0, bd = Infinity;
      for (let k=0;k<K;k++){
        let acc = 0;
        for (let d=0;d<D;d++){ const e = X[n*D+d]-W[k*D+d]; acc += e*e; if (acc >= bd) break; }
        if (acc < bd){ bd = acc; best = k; }
      }
      const bx = best % gx, by = (best/gx)|0;
      for (let k=0;k<K;k++){
        const ddx = (k%gx)-bx, ddy = ((k/gx)|0)-by;
        const hh = Math.exp(-(ddx*ddx+ddy*ddy)/(2*sig*sig));
        if (hh < 1e-3) continue;
        den[k] += hh;
        for (let d=0;d<D;d++) num[k*D+d] += hh*X[n*D+d];
      }
    }
    for (let k=0;k<K;k++) if (den[k] > 0)
      for (let d=0;d<D;d++) W[k*D+d] = num[k*D+d]/den[k];
  }
  return W;
}

function somClassify(X, N, D, W, K){
  const lab = new Int16Array(N);
  let qe = 0;
  for (let n=0;n<N;n++){
    let best = 0, bd = Infinity;
    for (let k=0;k<K;k++){
      let acc = 0;
      for (let d=0;d<D;d++){ const e = X[n*D+d]-W[k*D+d]; acc += e*e; if (acc >= bd) break; }
      if (acc < bd){ bd = acc; best = k; }
    }
    lab[n] = best; qe += Math.sqrt(bd);
  }
  return {lab, qe: qe/N};
}

/* Node color from position on the map, so neighboring nodes take
   neighboring colors and the image can be read as a continuum rather than
   as arbitrary categories. Hue follows the angle from the map center and
   saturation the distance, leaving the middle of the map gray. */
function somColor(k, gx, gy){
  const x = (k % gx)/(gx-1)*2 - 1, y = ((k/gx)|0)/(gy-1)*2 - 1;
  const r = Math.min(1, Math.hypot(x, y)/Math.SQRT2);
  const hue = (Math.atan2(y, x)/(2*Math.PI) + 1) % 1;
  const sat = 0.15 + 0.85*r, lig = 0.58 - 0.10*r;
  const c = (1 - Math.abs(2*lig-1))*sat, hp = hue*6;
  const xx = c*(1 - Math.abs(hp % 2 - 1)), m = lig - c/2;
  let rgb;
  if (hp<1) rgb=[c,xx,0]; else if (hp<2) rgb=[xx,c,0]; else if (hp<3) rgb=[0,c,xx];
  else if (hp<4) rgb=[0,xx,c]; else if (hp<5) rgb=[xx,0,c]; else rgb=[c,0,xx];
  return rgb.map(v => Math.round(255*(v+m)));
}

/* How often a sample shares its class with the sample in the next trace at the
   same time. Lateral only, deliberately: the null below randomises the phase of
   each trace independently, which destroys the relationship between traces
   while leaving each trace's own spectrum intact. Counting vertical agreement
   as well would measure smoothness down the trace, which the null preserves,
   and the comparison would say nothing. */
function neighborAgreement(lab, nx, nz){
  let same = 0, tot = 0;
  for (let i=0;i+1<nx;i++) for (let j=0;j<nz;j++){
    const k = i*nz+j;
    tot++; if (lab[k] === lab[k+nz]) same++;
  }
  return tot ? same/tot : 0;
}

/* Null model: randomise the phase of each trace independently. Every
   attribute keeps its own amplitude spectrum and histogram shape, so the
   vertical character survives, but the lateral relationship between traces
   is destroyed. Classes that still look organized afterwards were organized
   by the method, not by the earth. */
function phaseRandomize(a, nx, nz, rnd){
  const N = pow2(nz*2);
  const re = new Float64Array(N), im = new Float64Array(N);
  const out = new Float32Array(nx*nz);
  for (let i=0;i<nx;i++){
    re.fill(0); im.fill(0);
    for (let j=0;j<nz;j++) re[j] = a[i*nz+j];
    fftRadix2(re, im, false);
    for (let k=1;k<N/2;k++){
      const mag = Math.hypot(re[k], im[k]);
      const ph = rnd()*2*Math.PI;
      re[k] = mag*Math.cos(ph); im[k] = mag*Math.sin(ph);
      re[N-k] = re[k]; im[N-k] = -im[k];
    }
    im[0] = 0; if (N/2 < N) im[N/2] = 0;
    fftRadix2(re, im, true);
    for (let j=0;j<nz;j++) out[i*nz+j] = re[j];
  }
  return out;
}
