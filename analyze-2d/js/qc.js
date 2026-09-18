/* ============================ checks ============================
   Measurements made on the input, the kept result and the removed part of the
   smoothing and balancing steps, shown under the panels as the sliders move.
   Each one measures a single thing that goes wrong when the step is set too
   hard, so a change in the numbers can be followed back to the slider that
   caused it. Nothing here draws or reads the page except renderChecks. */

/* Structure-oriented smoothing.
   refl   share of the removed energy that is organized and runs parallel to
          the reflectors of the input: reflections taken out along with noise
   edge   share of the input energy removed where the input is not layered
          (faults, terminations, chaotic zones)
   layer  the same where the input is layered
   contIn, contOut  correlation between neighboring traces, input and kept */
function qcSOS(input, kept, removed, Tin, sig){
  const {nx, ns} = input;
  const Trem = computeTensor(removed, nx, ns, sig);
  const stride = Math.max(1, Math.ceil(nx * ns / 400000));
  let eAll = 0, ePar = 0, inEdge = 0, remEdge = 0, inLay = 0, remLay = 0;
  for (let k = 0; k < nx * ns; k += stride){
    const r2 = removed[k] * removed[k], d2 = input.data[k] * input.data[k];
    eAll += r2;
    const li = Tin.lin[k];
    if (Trem.lin[k] > 0.6 && li > 0.6){
      const di = Tin.dip[k], dr = Trem.dip[k];
      if (Math.abs(dr - di) < Math.max(0.25, 0.25 * Math.abs(di))) ePar += r2;
    }
    if (li < 0.4){ inEdge += d2; remEdge += r2; }
    else if (li > 0.8){ inLay += d2; remLay += r2; }
  }
  return {refl: eAll > 0 ? ePar / eAll : 0,
          edge: inEdge > 0 ? remEdge / inEdge : 0,
          layer: inLay > 0 ? remLay / inLay : 0,
          contIn: lateralContinuity(input.data, nx, ns),
          contOut: lateralContinuity(kept, nx, ns)};
}

/* Spectral balancing.
   noiseDb   how much more the frequencies above the upper 20 dB edge of the
             input are raised than the frequencies inside its 6 dB band
   spreadIn, spreadOut  the fall of the upper 6 dB edge from the top window to
             the bottom window, before and after
   contIn, contOut  correlation between neighboring traces, input and kept */
function qcBalance(input, kept, winMs){
  const a = spectrumOf(input, winMs);
  const b = spectrumOf({data: kept, nx: input.nx, ns: input.ns, dt: input.dt, j0: input.j0}, winMs);
  const s = a.stats, df = a.df;
  let inBand = 0, nIn = 0, above = 0, nAb = 0;
  for (let k = 1; k < a.whole.length; k++){
    const f = k * df;
    const g = 20 * Math.log10((b.whole[k] || 1e-20) / (a.whole[k] || 1e-20));
    if (f >= s.lo6 && f <= s.hi6){ inBand += g; nIn++; }
    else if (f > s.hi20 && f < a.nyq * 0.95){ above += g; nAb++; }
  }
  const last = a.rows - 1;
  return {noiseDb: nAb && nIn ? above / nAb - inBand / nIn : 0,
          hasAbove: nAb > 0,
          spreadIn: a.rowStats[0].hi6 - a.rowStats[last].hi6,
          spreadOut: b.rowStats[0].hi6 - b.rowStats[last].hi6,
          contIn: lateralContinuity(input.data, input.nx, input.ns),
          contOut: lateralContinuity(kept, input.nx, input.ns),
          specIn: a, specOut: b};
}

/* rows: [{name, before, now, prev, flag, meaning}] */
function renderChecks(rows){
  const arrow = (now, prev) => prev === undefined || prev === null || Math.abs(now - prev) < 1e-3 ? "" :
    (now > prev ? ' <span class="up">▲</span>' : ' <span class="down">▼</span>');
  return '<table class="data checks-table"><tr><th>Check</th><th>Input</th><th>Now</th><th>What it measures</th></tr>' +
    rows.map(r => "<tr" + (r.flag ? ' class="flag"' : "") + "><th>" + r.name + "</th><td>" + r.before + "</td><td>" +
      r.now + arrow(r.nowVal, r.prev) + "</td><td>" + r.meaning + (r.flag ? " <b>" + r.flag + "</b>" : "") + "</td></tr>").join("") +
    "</table>";
}
