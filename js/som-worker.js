/* Self-organizing map and SHAP values, computed in a Web Worker so the page
   stays responsive.

   Features. The chosen attributes are computed from the section with the same
   code the attribute page uses. Attributes that describe a level (envelope,
   RMS amplitude, frequency, coherence and so on) are then averaged over a
   facies window of a few traces and a few tens of milliseconds, so a class
   describes an interval rather than one lobe of one wavelet. Attributes that
   oscillate with the wavelet (amplitude, phase, cosine of phase, relative
   acoustic impedance, AVT, TKV) are left as they are, since averaging them over
   more than a period takes them to zero. The features are sampled on a grid of
   every trace and every few samples inside the chosen window, and standardized
   to zero mean and unit variance over that window.

   SOM: Kohonen (1982). Prototypes start on the plane of the first two principal
   components and are trained online with a Gaussian neighborhood that shrinks
   during training.

   SHAP: the quantity explained is the sample's position on the SOM grid (column,
   row), taken as the average grid position of all neurons weighted by
   exp(-squared distance / tau). That position is what the 2D color key shows,
   so each attribute's SHAP value is how far it moves the sample across the map.
   Values are estimated by sampling random attribute orderings against a random
   background sample (Strumbelj and Kononenko, 2014), which converges to the
   Shapley values of Lundberg and Lee (2017).

   Null test: each feature has the phase of every trace randomized
   independently, which keeps each trace's amplitude spectrum and destroys the
   relationship between neighboring traces. The map is retrained on that, and
   lateral class agreement is compared with the real run. */
"use strict";
importScripts("dsp.js", "spectrum.js", "display.js", "attributes.js", "attributes-extra.js", "som.js");

const SMOOTHED = new Set(["envelope", "rms", "sweetness", "tke", "insfreq", "wavfreq", "avgfreq",
                          "avgband", "band", "dip", "linearity", "coherence",
                          "ers", "totenergy", "cohenergy", "nonpar",
                          "peakfreq", "peakmag", "specbw", "specslope", "specrough"]);
let S = null;      // state of the current run

function rng(seed){ // mulberry32, so the same settings give the same result
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const post = (stage, frac) => self.postMessage({type: "progress", stage, frac});

self.onmessage = e => {
  const m = e.data;
  try {
    if (m.type === "run") run(m);
    else if (m.type === "rebuild") rebuild(m);
    else if (m.type === "null") nullTest();
    else if (m.type === "explain") explain(m.index);
  } catch (err){
    self.postMessage({type: "error", message: String(err && err.message || err)});
  }
};

/* Running mean along one axis of a trace-major (nx, ns) array. */
function boxAlong(a, nx, ns, half, alongX){
  if (half < 1) return a;
  const out = new Float32Array(a.length);
  if (!alongX){
    for (let i = 0; i < nx; i++){
      const b = i * ns; let acc = 0, c = 0;
      for (let j = 0; j <= Math.min(ns - 1, half); j++){ acc += a[b + j]; c++; }
      for (let j = 0; j < ns; j++){
        out[b + j] = acc / c;
        const add = j + half + 1, sub = j - half;
        if (add < ns){ acc += a[b + add]; c++; }
        if (sub >= 0){ acc -= a[b + sub]; c--; }
      }
    }
  } else {
    for (let j = 0; j < ns; j++){
      let acc = 0, c = 0;
      for (let i = 0; i <= Math.min(nx - 1, half); i++){ acc += a[i * ns + j]; c++; }
      for (let i = 0; i < nx; i++){
        out[i * ns + j] = acc / c;
        const add = i + half + 1, sub = i - half;
        if (add < nx){ acc += a[add * ns + j]; c++; }
        if (sub >= 0){ acc -= a[sub * ns + j]; c--; }
      }
    }
  }
  return out;
}

/* The features on the classification grid, one Float32Array per attribute,
   each of length gnx * gnt, trace-major. */
function buildFeatures(m){
  const {section: sec, keys, params: p, facies, win, tstep} = m;
  const {nx, ns, dt} = sec;
  const needT = keys.some(k => ["dip", "linearity", "coherence",
                                                "ers", "totenergy", "cohenergy", "nonpar"].includes(k));
  let tensor = null;
  if (needT){ post("Structure tensor", 0); tensor = computeTensor(sec.data, nx, ns, p.tSig); }
  const C = attrCache(sec.data, nx, ns, dt, tensor);
  const hx = Math.floor((facies.tr - 1) / 2);
  const ht = Math.round(facies.ms / 2 / (dt / 1000));
  const gnx = win.i1 - win.i0 + 1, gnt = Math.floor((win.j1 - win.j0) / tstep) + 1;
  const feats = [];
  keys.forEach((k, q) => {
    post("Computing " + (k === "amp" ? "amplitude" : ATTR_META[k].n.toLowerCase()), q / keys.length);
    let a = k === "amp" ? sec.data : computeOne(k, p, C).a;
    if (SMOOTHED.has(k) && (hx > 0 || ht > 0)) a = boxAlong(boxAlong(a, nx, ns, ht, false), nx, ns, hx, true);
    const g = new Float32Array(gnx * gnt);
    for (let i = 0; i < gnx; i++) for (let j = 0; j < gnt; j++){
      const v = a[(win.i0 + i) * ns + win.j0 + j * tstep];
      g[i * gnt + j] = isFinite(v) ? v : 0;
    }
    feats.push(g);
  });
  return {feats, gnx, gnt};
}

function standardize(feats, mean, sd){
  const M = feats.length, n = feats[0].length, X = new Float32Array(n * M);
  const mu = mean || new Float64Array(M), sg = sd || new Float64Array(M);
  feats.forEach((a, j) => {
    if (!mean){
      let s = 0, s2 = 0; for (let i = 0; i < n; i++){ s += a[i]; s2 += a[i] * a[i]; }
      mu[j] = s / n; sg[j] = Math.sqrt(Math.max(s2 / n - mu[j] * mu[j], 1e-20));
    }
    for (let i = 0; i < n; i++) X[i * M + j] = (a[i] - mu[j]) / sg[j];
  });
  return {X, mean: mu, sd: sg};
}

function train(X, n, M, side, rand){
  const N = side * side;
  const nTrain = Math.min(20000, n), trainIdx = new Int32Array(nTrain);
  for (let k = 0; k < nTrain; k++) trainIdx[k] = Math.floor(rand() * n);
  // correlation between the chosen attributes
  const corr = Array.from({length: M}, () => new Float64Array(M));
  for (const i of trainIdx) for (let a = 0; a < M; a++) for (let b = a; b < M; b++) corr[a][b] += X[i*M+a] * X[i*M+b];
  for (let a = 0; a < M; a++) for (let b = a; b < M; b++){ corr[a][b] /= nTrain; corr[b][a] = corr[a][b]; }
  // first two principal components, power iteration with deflation
  const pcs = [], lams = [], Cm = corr.map(r => Float64Array.from(r));
  for (let q = 0; q < Math.min(2, M); q++){
    let v = new Float64Array(M).fill(1 / Math.sqrt(M)), lam = 0;
    for (let it = 0; it < 200; it++){
      const w = new Float64Array(M);
      for (let a = 0; a < M; a++) for (let b = 0; b < M; b++) w[a] += Cm[a][b] * v[b];
      lam = Math.hypot(...w) || 1e-9; v = w.map(x => x / lam);
    }
    let big = 0; for (let a = 0; a < M; a++) if (Math.abs(v[a]) > Math.abs(v[big])) big = a;
    if (v[big] < 0) v = v.map(x => -x);
    pcs.push(v); lams.push(lam);
    for (let a = 0; a < M; a++) for (let b = 0; b < M; b++) Cm[a][b] -= lam * v[a] * v[b];
  }
  if (pcs.length < 2){ pcs.push(new Float64Array(M)); lams.push(0); }
  const W = new Float32Array(N * M);
  for (let r = 0; r < side; r++) for (let c = 0; c < side; c++){
    const u = side > 1 ? c / (side - 1) * 2 - 1 : 0, v = side > 1 ? r / (side - 1) * 2 - 1 : 0;
    for (let j = 0; j < M; j++) W[(r*side+c)*M+j] = 2 * (u * Math.sqrt(lams[0]) * pcs[0][j] + v * Math.sqrt(lams[1]) * pcs[1][j]);
  }
  const iters = Math.max(8000, 600 * N), sig0 = Math.max(side / 2, 1), sig1 = 0.5, lr0 = 0.5, lr1 = 0.02;
  for (let it = 0; it < iters; it++){
    const f = it / iters, sigma = sig0 * Math.pow(sig1 / sig0, f), lr = lr0 * Math.pow(lr1 / lr0, f);
    const i = trainIdx[Math.floor(rand() * nTrain)];
    let best = 0, bd = Infinity;
    for (let k = 0; k < N; k++){ let d = 0; for (let j = 0; j < M; j++){ const q = X[i*M+j] - W[k*M+j]; d += q*q; } if (d < bd){ bd = d; best = k; } }
    const br = Math.floor(best / side), bc = best % side, rad = Math.ceil(3 * sigma);
    for (let r = Math.max(0, br - rad); r <= Math.min(side - 1, br + rad); r++)
      for (let c = Math.max(0, bc - rad); c <= Math.min(side - 1, bc + rad); c++){
        const h = lr * Math.exp(-((r-br)*(r-br) + (c-bc)*(c-bc)) / (2 * sigma * sigma)), k = r * side + c;
        for (let j = 0; j < M; j++) W[k*M+j] += h * (X[i*M+j] - W[k*M+j]);
      }
    if (it % 4000 === 0) post("Training the map", f);
  }
  return {W, corr, trainIdx};
}

function classify(X, n, M, W, N, label){
  const bmu = new Uint8Array(n), hits = new Float64Array(N), W2 = new Float32Array(N);
  for (let k = 0; k < N; k++){ let s = 0; for (let j = 0; j < M; j++) s += W[k*M+j] * W[k*M+j]; W2[k] = s; }
  for (let i = 0; i < n; i++){
    let best = 0, bd = Infinity;
    for (let k = 0; k < N; k++){ let dot = 0; for (let j = 0; j < M; j++) dot += X[i*M+j] * W[k*M+j]; const d = W2[k] - 2*dot; if (d < bd){ bd = d; best = k; } }
    bmu[i] = best; hits[best]++;
    if (i % 200000 === 0) post(label || "Classifying", i / n);
  }
  return {bmu, hits: Array.from(hits, h => h / n)};
}

/* How often a sample shares its class with the sample one trace over. */
function lateralAgreement(bmu, gnx, gnt){
  let same = 0, tot = 0;
  for (let i = 0; i + 1 < gnx; i++) for (let j = 0; j < gnt; j++){ tot++; if (bmu[i*gnt+j] === bmu[(i+1)*gnt+j]) same++; }
  return tot ? same / tot : 0;
}

function tauOf(X, M, W, N, trainIdx){
  const qe = [];
  for (let s = 0; s < Math.min(2000, trainIdx.length); s++){
    const i = trainIdx[s]; let bd = Infinity;
    for (let k = 0; k < N; k++){ let d = 0; for (let j = 0; j < M; j++){ const q = X[i*M+j] - W[k*M+j]; d += q*q; } if (d < bd) bd = d; }
    qe.push(bd);
  }
  qe.sort((a, b) => a - b);
  return Math.max(qe[qe.length >> 1], 1e-3);
}

function run(m){
  const {side, seed} = m;
  const {feats, gnx, gnt} = buildFeatures(m);
  const M = feats.length, N = side * side, n = gnx * gnt, rand = rng(seed || 7);
  post("Standardizing", 0);
  const {X, mean, sd} = standardize(feats);
  const {W, corr, trainIdx} = train(X, n, M, side, rand);
  const {bmu, hits} = classify(X, n, M, W, N, "Classifying the window");
  const agree = lateralAgreement(bmu, gnx, gnt);
  const tau = tauOf(X, M, W, N, trainIdx);
  S = {X, W, M, N, n, side, tau, trainIdx, rand, feats, gnx, gnt, seed: seed || 7};
  self.postMessage({type: "map", bmu, hits, corr: corr.map(r => Array.from(r)), W, mean: Array.from(mean),
                    sd: Array.from(sd), tau, agree, gnx, gnt});
  globalShap();
}

/* Rebuild the state of an earlier run from its stored prototypes, so single
   samples can be explained on the SHAP page without retraining. */
function rebuild(m){
  const {feats, gnx, gnt} = buildFeatures(m);
  const M = feats.length, N = m.side * m.side, n = gnx * gnt, rand = rng(m.seed || 7);
  const {X} = standardize(feats, Float64Array.from(m.mean), Float64Array.from(m.sd));
  const nTrain = Math.min(20000, n), trainIdx = new Int32Array(nTrain);
  for (let k = 0; k < nTrain; k++) trainIdx[k] = Math.floor(rand() * n);
  S = {X, W: Float32Array.from(m.W), M, N, n, side: m.side, tau: m.tau, trainIdx, rand, feats, gnx, gnt};
  self.postMessage({type: "ready"});
}

function globalShap(){
  const {M, n, side, rand} = S;
  const nS = 400, P = 8, imp = new Float64Array(M);
  for (let s = 0; s < nS; s++){
    const {phi} = shapFor(Math.floor(rand() * n), P);
    for (let j = 0; j < M; j++) imp[j] += Math.hypot(phi[j][0], phi[j][1]);
    if (s % 50 === 0) post("Computing SHAP values", s / nS);
  }
  const span = Math.max(side - 1, 1);   // report in fractions of the map width
  self.postMessage({type: "importance", importance: Array.from(imp, v => v / nS / span)});
}

function nullTest(){
  if (!S) return;
  const {feats, gnx, gnt, M, N, side, n} = S;
  const rnd = rng(999);
  const shuffled = feats.map((a, q) => { post("Randomizing phase", q / M); return phaseRandomize(a, gnx, gnt, rnd); });
  const {X} = standardize(shuffled);
  const {W} = train(X, n, M, side, rng(S.seed || 7));
  const {bmu} = classify(X, n, M, W, N, "Classifying the null");
  self.postMessage({type: "null", agree: lateralAgreement(bmu, gnx, gnt)});
}

function position(z){ // soft grid position of attribute vector z
  const {W, M, N, side, tau} = S; let best = Infinity; const d = new Float64Array(N);
  for (let k = 0; k < N; k++){ let s = 0; for (let j = 0; j < M; j++){ const q = z[j] - W[k*M+j]; s += q*q; } d[k] = s; if (s < best) best = s; }
  let wsum = 0, px = 0, py = 0;
  for (let k = 0; k < N; k++){ const w = Math.exp(-(d[k] - best) / tau); wsum += w; px += w * (k % side); py += w * Math.floor(k / side); }
  return [px / wsum, py / wsum];
}

function shapFor(index, P){
  const {X, M, trainIdx, rand} = S, x = X.subarray(index * M, index * M + M);
  const phi = Array.from({length: M}, () => [0, 0]); const base = [0, 0];
  const order = Array.from({length: M}, (_, j) => j);
  for (let p = 0; p < P; p++){
    const b = trainIdx[Math.floor(rand() * trainIdx.length)], z = Float64Array.from(X.subarray(b * M, b * M + M));
    for (let j = M - 1; j > 0; j--){ const k = Math.floor(rand() * (j + 1)); const t = order[j]; order[j] = order[k]; order[k] = t; }
    let prev = position(z); base[0] += prev[0]; base[1] += prev[1];
    for (const j of order){ z[j] = x[j]; const cur = position(z); phi[j][0] += cur[0] - prev[0]; phi[j][1] += cur[1] - prev[1]; prev = cur; }
  }
  for (let j = 0; j < M; j++){ phi[j][0] /= P; phi[j][1] /= P; }
  return {phi, base: [base[0] / P, base[1] / P], final: position(x)};
}

function explain(index){
  if (!S) return;
  const r = shapFor(index, 400);
  self.postMessage({type: "explain", index, ...r, values: Array.from(S.X.subarray(index * S.M, index * S.M + S.M))});
}
