/* ============================ signal processing ============================
   The transforms and filters the steps are built from: a radix-2 FFT, Gaussian
   kernels, the gradient structure tensor and the filters that use it. */

/* ============================ FFT ============================ */
function fftRadix2(re, im, inv){
  const n = re.length;
  for (let i=1, j=0; i<n; i++){
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j){ let t=re[i];re[i]=re[j];re[j]=t; t=im[i];im[i]=im[j];im[j]=t; }
  }
  for (let len=2; len<=n; len<<=1){
    const ang = (inv ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i=0; i<n; i+=len){
      let cr = 1, ci = 0;
      for (let k=0; k<len/2; k++){
        const ur = re[i+k], ui = im[i+k];
        const vr = re[i+k+len/2]*cr - im[i+k+len/2]*ci;
        const vi = re[i+k+len/2]*ci + im[i+k+len/2]*cr;
        re[i+k] = ur+vr; im[i+k] = ui+vi;
        re[i+k+len/2] = ur-vr; im[i+k+len/2] = ui-vi;
        const ncr = cr*wr - ci*wi; ci = cr*wi + ci*wr; cr = ncr;
      }
    }
  }
  if (inv) for (let i=0;i<n;i++){ re[i]/=n; im[i]/=n; }
}


const pow2 = n => { let p = 1; while (p < n) p <<= 1; return p; };

/* ============================ filters ============================ */

function gaussKernel(sigma){
  const r = Math.max(1, Math.ceil(sigma*3));
  const k = new Float32Array(2*r+1);
  let s = 0;
  for (let i=-r;i<=r;i++){ const v = Math.exp(-i*i/(2*sigma*sigma)); k[i+r]=v; s+=v; }
  for (let i=0;i<k.length;i++) k[i]/=s;
  return {k, r};
}

/* Separable Gaussian with its own width down the trace and across it. One
   sigma for both is wrong for relief shading: the wavelet corrugation that has
   to go is a length in samples, while the lateral detail that has to stay is a
   length in traces, and on legacy data those are nothing like the same number. */
function blurAniso(src, nx, nz, sigX, sigZ){
  let tmp = src;
  if (sigZ > 0.05){
    const {k, r} = gaussKernel(sigZ);
    const t = new Float32Array(nx*nz);
    for (let i=0;i<nx;i++) for (let j=0;j<nz;j++){
      let acc=0;
      for (let m=-r;m<=r;m++){
        let jj=j+m; if(jj<0) jj=-jj; if(jj>=nz) jj=2*nz-2-jj;
        acc += src[i*nz+jj]*k[m+r];
      }
      t[i*nz+j]=acc;
    }
    tmp = t;
  }
  if (sigX <= 0.05) return tmp === src ? src.slice() : tmp;
  const {k, r} = gaussKernel(sigX);
  const out = new Float32Array(nx*nz);
  for (let j=0;j<nz;j++) for (let i=0;i<nx;i++){
    let acc=0;
    for (let m=-r;m<=r;m++){
      let ii=i+m; if(ii<0) ii=-ii; if(ii>=nx) ii=2*nx-2-ii;
      acc += tmp[ii*nz+j]*k[m+r];
    }
    out[i*nz+j]=acc;
  }
  return out;
}

function blurSep(src, nx, nz, sigma){
  const {k, r} = gaussKernel(sigma);
  const tmp = new Float32Array(nx*nz), out = new Float32Array(nx*nz);
  for (let i=0;i<nx;i++){
    for (let j=0;j<nz;j++){
      let s=0;
      for (let m=-r;m<=r;m++){
        let jj=j+m; if(jj<0) jj=-jj; if(jj>=nz) jj=2*nz-2-jj;
        s += src[i*nz+jj]*k[m+r];
      }
      tmp[i*nz+j]=s;
    }
  }
  for (let j=0;j<nz;j++){
    for (let i=0;i<nx;i++){
      let s=0;
      for (let m=-r;m<=r;m++){
        let ii=i+m; if(ii<0) ii=-ii; if(ii>=nx) ii=2*nx-2-ii;
        s += tmp[ii*nz+j]*k[m+r];
      }
      out[i*nz+j]=s;
    }
  }
  return out;
}

function computeTensor(d, nx, nz, sigma){
  const n = nx*nz;
  const gx = new Float32Array(n), gz = new Float32Array(n);
  const at = (i,j) => d[Math.min(nx-1,Math.max(0,i))*nz + Math.min(nz-1,Math.max(0,j))];
  for (let i=0;i<nx;i++) for (let j=0;j<nz;j++){
    gx[i*nz+j] = (at(i+1,j-1)+2*at(i+1,j)+at(i+1,j+1) - at(i-1,j-1)-2*at(i-1,j)-at(i-1,j+1))/8;
    gz[i*nz+j] = (at(i-1,j+1)+2*at(i,j+1)+at(i+1,j+1) - at(i-1,j-1)-2*at(i,j-1)-at(i+1,j-1))/8;
  }
  const Jxx = new Float32Array(n), Jxz = new Float32Array(n), Jzz = new Float32Array(n);
  for (let k=0;k<n;k++){ Jxx[k]=gx[k]*gx[k]; Jxz[k]=gx[k]*gz[k]; Jzz[k]=gz[k]*gz[k]; }
  const Sxx = blurSep(Jxx,nx,nz,sigma), Sxz = blurSep(Jxz,nx,nz,sigma), Szz = blurSep(Jzz,nx,nz,sigma);

  const dip = new Float32Array(n), lin = new Float32Array(n);
  for (let k=0;k<n;k++){
    const a = Sxx[k], b = Sxz[k], c = Szz[k];
    const tr = a+c, det = Math.sqrt(Math.max((a-c)*(a-c) + 4*b*b, 0));
    const l1 = 0.5*(tr+det), l2 = 0.5*(tr-det);
    lin[k] = tr > 1e-20 ? (l1-l2)/(l1+l2+1e-20) : 0;
    let vx = b, vz = l2 - a;
    const nrm = Math.hypot(vx, vz);
    if (nrm < 1e-12){ vx = 1; vz = 0; } else { vx/=nrm; vz/=nrm; }
    dip[k] = Math.abs(vx) > 1e-12 ? Math.max(-20, Math.min(20, vz/vx)) : 0;
  }
  return {dip, lin};
}

function structureOriented(d, nx, nz, len, sigma, gate, strength, tensor){
  const n = nx*nz;
  const T = tensor || computeTensor(d, nx, nz, sigma);
  const at = (i,j) => d[Math.min(nx-1,Math.max(0,i))*nz + Math.min(nz-1,Math.max(0,j))];
  const out = new Float32Array(n);
  const L = Math.max(1, Math.round(len));
  const sg = L/2;
  const w = new Float32Array(2*L+1);
  let ws = 0;
  for (let m=-L;m<=L;m++){ w[m+L] = Math.exp(-m*m/(2*sg*sg)); ws += w[m+L]; }
  for (let m=0;m<w.length;m++) w[m]/=ws;

  for (let i=0;i<nx;i++) for (let j=0;j<nz;j++){
    const k = i*nz+j;
    const p = T.dip[k], nrm = Math.hypot(1, p);
    const vx = 1/nrm, vz = p/nrm;
    let sacc = 0;
    for (let m=-L;m<=L;m++){
      const x = i + m*vx, z = j + m*vz;
      const x0 = Math.floor(x), z0 = Math.floor(z);
      const fx = x-x0, fz = z-z0;
      const c00 = at(x0,z0), c10 = at(x0+1,z0), c01 = at(x0,z0+1), c11 = at(x0+1,z0+1);
      sacc += w[m+L] * ((c00*(1-fx)+c10*fx)*(1-fz) + (c01*(1-fx)+c11*fx)*fz);
    }
    const g = gate <= 0 ? 1 : Math.pow(Math.max(0,Math.min(1,T.lin[k])), gate);
    out[k] = d[k] + strength * g * (sacc - d[k]);
  }
  return out;
}

function detailBoost(d, nx, nz, radius, gainD){
  const base = blurSep(d, nx, nz, radius);
  const out = new Float32Array(d.length);
  for (let k=0;k<d.length;k++) out[k] = base[k] + gainD*(d[k]-base[k]);
  return out;
}

function agcField(d, nx, nz, halfWin){
  const g = new Float32Array(d.length);
  const h = Math.max(1, Math.round(halfWin));
  for (let i=0;i<nx;i++){
    const base = i*nz;
    const cum = new Float64Array(nz+1);
    for (let j=0;j<nz;j++) cum[j+1] = cum[j] + d[base+j]*d[base+j];
    for (let j=0;j<nz;j++){
      const a = Math.max(0, j-h), b = Math.min(nz, j+h+1);
      g[base+j] = 1 / (Math.sqrt((cum[b]-cum[a])/(b-a)) + 1e-12);
    }
  }
  return g;
}

function agc(d, nx, nz, halfWin){
  const out = new Float32Array(d.length);
  const h = Math.max(1, Math.round(halfWin));
  for (let i=0;i<nx;i++){
    const base = i*nz;
    const cum = new Float64Array(nz+1);
    for (let j=0;j<nz;j++) cum[j+1] = cum[j] + d[base+j]*d[base+j];
    let gsum = 0;
    for (let j=0;j<nz;j++){
      const a = Math.max(0, j-h), b = Math.min(nz, j+h+1);
      const rms = Math.sqrt((cum[b]-cum[a])/(b-a)) + 1e-12;
      out[base+j] = d[base+j]/rms;
      gsum += rms;
    }
  }
  return out;
}


/* Streaks in the removed panel are the question the panel exists to raise, and
   looking at them does not answer it: coherent steep energy and the ringing of a
   sharp mask edge both appear as streaks. The two are separable by measurement.
   Ringing follows the edge of the reject cone, so it lies at the limit; rejected
   events lie beyond it. Random noise is not oriented at all. */
function residualStats(rem, nx, ns, p){
  const T = computeTensor(rem, nx, ns, p.sosSig);
  const stride = Math.max(1, Math.ceil(T.lin.length/200000));
  let seen = 0, lin = 0, steep = 0;
  for (let k=0;k<T.lin.length;k+=stride){
    seen++;
    if (T.lin[k] > 0.6){ lin++; if (Math.abs(T.dip[k]) > p.dipMax) steep++; }
  }
  if (seen < 200) return null;
  return {lin: lin/seen, steep: lin ? steep/lin : 0};
}

/* ---- Ormsby amplitude response on a frequency axis in Hz ---- */
function ormsby(f, f1, f2, f3, f4){
  const a = Math.abs(f);
  if (a <= f1 || a >= f4) return 0;
  if (a < f2) return (a - f1) / Math.max(f2 - f1, 1e-12);
  if (a > f3) return (f4 - a) / Math.max(f4 - f3, 1e-12);
  return 1;
}
