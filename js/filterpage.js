/* ============================ filter pages ============================
   Steps 3 to 6 share one layout: the input, the kept result and the removed
   part, with the removed part defined as input minus kept so the two lower
   panels always sum to the one above them. A crosshair follows the pointer on
   all three panels at once, so a feature can be carried from one to the next.

   A step is either applied, in which case its output is stored and the next
   step starts from it, or skipped, in which case nothing is stored and the next
   step starts from whatever this step would have started from. Any change here
   clears the results of later steps, which described a section that no longer
   exists. */

let FP = null;   // {cfg, input, kept, removed, clip, on}

async function filterPage(cfg){
  await pageShell(cfg.stepId);
  if (!LINE){ emptyState($("stage"), "No line is open."); return; }
  const input = sectionOf(await stageInput(cfg.stage));
  if (!input){ emptyState($("stage"), "The crop has not been stored yet."); return; }
  const band = await kvGet("band");
  const stored = sectionOf(await stageLoad(cfg.stage));
  FP = {cfg, input, band, kept: null, removed: null, clip: 0, on: !!stored, params: null};

  $("where").innerHTML = "Input: <b>" + STAGE_NAMES[input.stage] + "</b>";
  if (cfg.prepare) await cfg.prepare(input, band);
  if (stored && stored.meta.params) cfg.setParams(stored.meta.params);
  else if (cfg.defaults) cfg.defaults(input, band);
  $("apply").checked = FP.on;

  displayControls($("side"), drawPanels);
  const host = $("panels");
  makePanel(host, "pIn", "Input", {height: 250});
  makePanel(host, "pKept", "Kept", {height: 250});
  makePanel(host, "pRem", "Removed", {height: 250});
  ["pIn", "pKept", "pRem"].forEach(id => { attachReadout(id); linkCrosshair(id); });
  viewBar($("stage"));
  onView(drawPanels);

  FP.clip = seisClip(input.data);
  if (stored){
    FP.kept = stored.data;
    FP.removed = diff(input.data, stored.data);
    FP.params = stored.meta.params;
  } else {
    FP.kept = input.data;
    FP.removed = new Float32Array(input.data.length);
  }
  syncLabelsFP();
  drawPanels();
  if (cfg.after) cfg.after();

  const run = async () => {
    if (!FP.on) return;
    FP.params = cfg.readParams();
    setBusy("Computing…");
    await nextFrame();
    const t0 = performance.now();
    const out = await cfg.apply(FP.input, FP.params);
    FP.kept = out;
    FP.removed = diff(FP.input.data, out);
    FP.secs = (performance.now() - t0) / 1000;
    setBusy("Storing…");
    await stageSave(cfg.stage, {data: out, nx: input.nx, ns: input.ns, dt: input.dt, j0: input.j0},
                    {i0: input.i0, params: FP.params, from: input.stage});
    await stageDropAfter(cfg.stage);
    setBusy("");
    markFlow(true);
    drawPanels();
    if (cfg.after) cfg.after();
  };
  FP.run = run;
  const auto = debounce(run, cfg.delay || 350);
  (cfg.controls || []).forEach(k => $(k).addEventListener("input", () => {
    syncLabelsFP();
    if (cfg.auto !== false) auto();
  }));
  if ($("btnRun")) $("btnRun").addEventListener("click", () => {
    if (!FP.on){ FP.on = true; $("apply").checked = true; }
    run();
  });
  $("apply").addEventListener("change", async () => {
    FP.on = $("apply").checked;
    if (FP.on){ await run(); return; }
    await stageDrop(cfg.stage);
    await stageDropAfter(cfg.stage);
    FP.kept = FP.input.data;
    FP.removed = new Float32Array(FP.input.data.length);
    markFlow(false);
    drawPanels();
    if (cfg.after) cfg.after();
  });
  $("remGain").addEventListener("input", () => { syncLabelsFP(); drawPanels(); });
  window.addEventListener("resize", debounce(() => { drawPanels(); if (cfg.after) cfg.after(); }, 200));
  $("next").innerHTML = nextLink(cfg.stepId);
  glossaryScan(document.body);
}

function diff(a, b){
  const r = new Float32Array(a.length);
  for (let k = 0; k < a.length; k++) r[k] = a[k] - b[k];
  return r;
}

function markFlow(done){
  const a = document.querySelector('.stages a[aria-current="page"]');
  if (!a) return;
  a.classList.toggle("skipped", !done);
  // everything after this step has been cleared
  let n = a.nextElementSibling;
  while (n){ if (n.getAttribute("href") && /[3-6]-/.test(n.getAttribute("href"))) n.classList.add("skipped"); n = n.nextElementSibling; }
}

function syncLabelsFP(){
  if (FP && FP.cfg.syncLabels) FP.cfg.syncLabels();
  $("v-remGain").textContent = (+$("remGain").value).toFixed(1);
}

function drawPanels(){
  if (!FP) return;
  const {input, kept, removed} = FP;
  FP.clip = seisClip(input.data);
  const g = +$("remGain").value;
  drawSeis("pIn", input, input.data, FP.clip, STAGE_NAMES[input.stage]);
  drawSeis("pKept", input, kept, FP.clip, FP.on ? "output of this step, same color scale as the input" :
           "step skipped: the input passes through unchanged");
  drawSeis("pRem", input, removed, FP.clip / g);
  const pct = energyShare(removed, input.data);
  $("pRem-note").innerHTML = "input minus kept, shown at " + g.toFixed(1) + "× the input scale. It carries <b>" +
    pct.toFixed(1) + "%</b> of the input energy.";
  FP.pct = pct;
  if (FP.cfg.note) $("note").innerHTML = FP.cfg.note(FP);
}

/* The same position marked on all three panels while the pointer is over any
   one of them. */
function linkCrosshair(id){
  const fr = $(id + "-frame");
  fr.addEventListener("mousemove", ev => {
    const r = fr.getBoundingClientRect();
    const u = (ev.clientX - r.left) / r.width, v = (ev.clientY - r.top) / r.height;
    ["pIn", "pKept", "pRem"].forEach(k => {
      const {ctx, w, h} = fitCanvas($(k + "-ovl"));
      ctx.strokeStyle = "rgba(255,209,102,0.9)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(u * w, 0); ctx.lineTo(u * w, h);
      ctx.moveTo(0, v * h); ctx.lineTo(w, v * h); ctx.stroke();
    });
  });
  fr.addEventListener("mouseleave", () => ["pIn", "pKept", "pRem"].forEach(k => fitCanvas($(k + "-ovl"))));
}
