/* ============================ glossary ============================
   Terms marked in the text open a small card giving what the term means and
   what the quantity is used for. The two are kept apart on purpose: what a
   thing measures is arithmetic, what it is used for is a separate claim.

   Marking is automatic. glossaryScan walks the text of a page and marks the
   first occurrence of each term it finds, once per page, so the prose is not
   littered with the same word marked eight times. A page can also mark a term
   by hand with <button class="gterm" data-g="slug">…</button>.

   Entries: what  — the definition
            use   — what the quantity is used for, where that differs
            see   — related slugs, shown as links inside the card
            alt   — other spellings that should also be marked */

const GLOSSARY = {

/* ---- the record itself ---- */
"trace": {term:"trace",
  what:"One time series recorded or processed at one position along the line.",
  use:"A 2D section is a set of traces side by side, each one a column of the image.",
  see:["cdp","sample-interval"], alt:["traces"]},

"cdp": {term:"CDP",
  what:"Common depth point, also called common midpoint or CMP. The numbering that runs along a processed 2D line, one number per output trace.",
  use:"Position along the line is given in CDP number unless coordinates were written into the trace headers.",
  see:["trace","trace-header"], alt:["CMP","common midpoint","common depth point"]},

"two-way-time": {term:"two-way time",
  what:"The time for energy to travel from the surface to a reflector and back, in seconds. The vertical axis of a seismic section is normally two-way time, written TWT.",
  use:"Depth is obtained from two-way time only through a velocity model, and the two axes are not proportional.",
  see:["vertical-exaggeration","velocity"], alt:["TWT","two way time"]},

"sample-interval": {term:"sample interval",
  what:"The time between successive samples down a trace, in milliseconds. Legacy crustal lines are often 4 or 8 ms; modern reflection data is often 1 or 2 ms.",
  use:"The sample interval fixes the highest frequency the file can hold, at one over twice the interval.",
  see:["nyquist","binary-header"], alt:["sample rate"]},

"nyquist": {term:"Nyquist frequency",
  what:"Half the sampling rate: 62.5 Hz for an 8 ms sample interval, 250 Hz for 2 ms. No frequency above it can be represented in the file.",
  use:"Sets the ceiling on any filter or balancing corner, and on what a spectrum plot can show.",
  see:["sample-interval","aliasing"], alt:["Nyquist"]},

"poststack": {term:"poststack",
  what:"Data that has already been summed over source-receiver offset, leaving one trace per surface position.",
  use:"Most legacy crustal lines are distributed poststack and often migrated. Offset information is gone, so amplitude against angle cannot be recovered.",
  see:["migration","trace"], alt:["post-stack","stacked"]},

"migration": {term:"migration",
  what:"The processing step that moves dipping reflections to their correct position and collapses diffractions.",
  use:"On an unmigrated section, dipping events sit downdip of their true position and steep structure is smeared.",
  see:["diffraction","apparent-dip"], alt:["migrated","unmigrated"]},

"mute": {term:"mute",
  what:"A region of a trace set to zero during processing, usually the shallow part where refracted arrivals would otherwise dominate.",
  use:"A muted zone carries no amplitude, so any measurement made over it returns the properties of zeros rather than of the earth.",
  see:["trace"], alt:["muted","muting"]},

/* ---- the file ---- */
"seg-y": {term:"SEG-Y",
  what:"The standard file format for seismic data: a text header, a binary header, then one header and one data block per trace.",
  use:"Almost all distributed seismic arrives as SEG-Y, including the open COCORP lines.",
  see:["text-header","binary-header","trace-header"], alt:["SEGY","SEG Y"]},

"text-header": {term:"text header",
  what:"3200 characters at the front of a SEG-Y file, historically written in EBCDIC rather than ASCII. Free-form text, filled in by whoever processed the line.",
  use:"Usually the only record of the processing sequence, the datum, and the units.",
  see:["seg-y","ebcdic"], alt:["textual header","EBCDIC header"]},

"ebcdic": {term:"EBCDIC",
  what:"A character encoding from IBM mainframes, still used for the SEG-Y text header.",
  use:"A text header read as ASCII comes out as unreadable characters, which is a decoding problem and not a damaged file.",
  see:["text-header"], alt:[]},

"binary-header": {term:"binary header",
  what:"400 bytes after the text header holding the sample interval, samples per trace, the number format, and the measurement system.",
  use:"The sample interval and format code here are what a reader needs to open the file at all.",
  see:["seg-y","sample-interval"], alt:[]},

"trace-header": {term:"trace header",
  what:"240 bytes in front of every trace, with fields for CDP number, coordinates, elevation, and the scalars that apply to them.",
  use:"Whether a line can be posted on a map depends entirely on whether these fields were filled in.",
  see:["cdp","seg-y"], alt:["trace headers"]},

/* ---- the wavefield ---- */
"wavelet": {term:"wavelet",
  what:"The short pulse that a single reflecting interface produces on the section. Its length and shape are set by the source and by everything the processing did afterward.",
  use:"A seismic section is the reflectivity of the earth convolved with the wavelet, so the wavelet sets what can be separated in time.",
  see:["bandwidth","vertical-resolution","polarity"], alt:["wavelets"]},

"polarity": {term:"polarity",
  what:"Which direction a positive reflection coefficient is plotted. Under SEG normal polarity an increase in impedance appears as a peak.",
  use:"Polarity is not always recorded in the headers, and reading a trough as a peak reverses the sense of every interface on the section.",
  see:["reflection-coefficient","wavelet"], alt:[]},

"reflection-coefficient": {term:"reflection coefficient",
  what:"The fraction of an incident wave returned at an interface, set by the impedance contrast across it.",
  use:"The quantity a seismic section is a band-limited picture of.",
  see:["acoustic-impedance","polarity"], alt:["reflection coefficients","reflectivity"]},

"acoustic-impedance": {term:"acoustic impedance",
  what:"Velocity multiplied by density. Contrasts in impedance, rather than in velocity or density alone, produce reflections.",
  use:"Two rocks with different lithologies can have the same impedance and produce no reflection between them.",
  see:["reflection-coefficient","rai"], alt:["impedance"]},

"bandwidth": {term:"bandwidth",
  what:"The range of frequencies a line actually carries, usually quoted where the amplitude spectrum falls 6 or 20 dB below its peak.",
  use:"Bandwidth, not the sample interval, is what limits how finely events can be separated in time.",
  see:["amplitude-spectrum","vertical-resolution","decibel"], alt:["band"]},

"amplitude-spectrum": {term:"amplitude spectrum",
  what:"How much of each frequency a trace or a section contains, obtained from a Fourier transform.",
  use:"Read before filtering, it shows what band is present to work with. Deep crustal lines are often narrow and low.",
  see:["bandwidth","decibel","spectral-balancing"], alt:["spectrum","frequency spectrum"]},

"decibel": {term:"decibel",
  what:"A logarithmic amplitude ratio: 20 times the base-10 logarithm of the ratio. Minus 6 dB is half the amplitude, minus 20 dB is a tenth.",
  use:"Spectra are plotted in decibels because the interesting part of the band covers several orders of amplitude.",
  see:["amplitude-spectrum"], alt:["dB"]},

"vertical-resolution": {term:"vertical resolution",
  what:"The smallest separation at which two interfaces produce distinguishable reflections, conventionally a quarter of the dominant wavelength.",
  use:"At 15 Hz and 6000 m/s a quarter wavelength is about 100 m, which is the scale on which a deep crustal reflection can be said to be a single feature.",
  see:["wavelet","bandwidth","velocity"], alt:["resolution"]},

"velocity": {term:"velocity",
  what:"The speed of the seismic wave through the rock. Crustal velocities are commonly 5.5 to 7 km/s, against 1.5 to 4 km/s for sediments.",
  use:"Converts two-way time to depth, and sets the wavelength at a given frequency.",
  see:["two-way-time","vertical-resolution"], alt:["velocities"]},

/* ---- geometry and noise ---- */
"apparent-dip": {term:"apparent dip",
  what:"The slope of an event as it appears on the section, in samples per trace or in milliseconds per trace.",
  use:"Apparent dip is the dip in the plane of the line. A structure striking obliquely to the line shows a shallower dip than it has.",
  see:["out-of-plane","fk","structure-tensor"], alt:["dip"]},

"fk": {term:"f-k transform",
  what:"A two-dimensional Fourier transform of the section, giving a plane whose axes are temporal frequency and spatial wavenumber. An event of constant dip maps to a line through the origin.",
  use:"Separating on dip and frequency at the same time, which is how coherent linear noise is taken out without removing the whole frequency band it occupies.",
  see:["apparent-dip","aliasing","ground-roll"], alt:["f-k","FK","frequency-wavenumber"]},

"aliasing": {term:"aliasing",
  what:"Energy above the sampling limit appearing at a lower frequency or a reversed dip. Spatial aliasing happens when an event dips more steeply than the trace spacing can follow.",
  use:"Aliased steep dips wrap to the opposite side of the f-k plane, where a dip filter will treat them as gentle dips.",
  see:["fk","nyquist","apparent-dip"], alt:["aliased"]},

"ground-roll": {term:"ground roll",
  what:"Surface waves recorded along with the reflections: low frequency, high amplitude, and steeply dipping across the traces.",
  use:"The steep low-frequency corner of the f-k plane is usually ground roll, which is why dip and frequency rejection are applied together.",
  see:["fk","apparent-dip"], alt:["groundroll","surface waves"]},

"multiple": {term:"multiple",
  what:"Energy that has reflected more than once before being recorded, arriving later than the primary reflection it came from.",
  use:"On deep lines, water-bottom and intrabasement multiples can appear at crustal times and be read as structure.",
  see:["poststack"], alt:["multiples"]},

"diffraction": {term:"diffraction",
  what:"The hyperbolic pattern produced by a point scatterer or a truncated reflector.",
  use:"Migration collapses diffractions. Steep residual diffraction limbs on an unmigrated or poorly migrated line occupy the same part of the f-k plane as steep reflections.",
  see:["migration","fk"], alt:["diffractions"]},

"out-of-plane": {term:"out-of-plane reflection",
  what:"Energy reflected from a structure that lies off the line, appearing on the section as though it came from beneath it.",
  use:"A 2D line has no way to tell where across the line the energy came from, so a strongly dipping event may be sideswipe rather than structure under the profile.",
  see:["apparent-dip","migration"], alt:["sideswipe","out of plane"]},

/* ---- amplitude and gain ---- */
"agc": {term:"AGC",
  what:"Automatic gain control: each sample is divided by a measure of amplitude taken in a window around it, so the output has roughly constant amplitude everywhere.",
  use:"Makes weak deep events visible. It also destroys the amplitude relationship between shallow and deep, so reflection strength can no longer be compared across the section.",
  see:["tpow","amplitude-spectrum"], alt:["automatic gain control"]},

"tpow": {term:"t^n gain",
  what:"Multiplying each sample by time raised to a power n, with n usually between 1 and 2.5, to counter the fall in amplitude with travel time.",
  use:"A single exponent applied to the whole record, so the relative amplitude of events at the same time is preserved.",
  see:["agc","geometric-spreading"], alt:["t-power","tpow","t^n"]},

"geometric-spreading": {term:"geometric spreading",
  what:"The fall in amplitude with distance as the wavefront expands over a larger area.",
  use:"One of the reasons deep reflections are weaker than shallow ones. Absorption and scattering are the others, and they act more strongly on high frequencies.",
  see:["tpow","spectral-balancing"], alt:["spherical divergence"]},

/* ---- balancing ---- */
"spectral-balancing": {term:"spectral balancing",
  what:"Measuring how much of each frequency is present and raising the weak parts toward the strong ones. A filter bank splits the trace into bands, each band is divided by its own smoothed envelope, and the bands are summed.",
  use:"Two separate effects go under the name: holding each band at a constant level down the record, and bringing the bands to a common level across frequency.",
  see:["whitening","filter-bank","amplitude-spectrum"], alt:["spectral balance","balancing"]},

"whitening": {term:"whitening",
  what:"Flattening the amplitude spectrum so that every frequency in the output band carries a similar level.",
  use:"Shortens the wavelet. It raises whatever occupies the weak part of the band, including noise, so the difference panel is where the result is checked.",
  see:["spectral-balancing","wavelet"], alt:["whitened"]},

"filter-bank": {term:"filter bank",
  what:"A set of overlapping bandpass filters covering the band of interest, applied so that summing the outputs returns the input.",
  use:"Lets a gain be computed separately for each frequency band and each time, which is what makes balancing time variant.",
  see:["spectral-balancing","ormsby"], alt:["filterbank"]},

"ormsby": {term:"Ormsby taper",
  what:"A bandpass shape defined by four corner frequencies: zero below the first, full between the second and third, zero above the fourth, with linear ramps between.",
  use:"The usual way to state an output band. Abrupt corners produce ringing in time, which is what the ramps avoid.",
  see:["filter-bank","wavelet"], alt:["Ormsby"]},

/* ---- structure-oriented smoothing ---- */
"structure-tensor": {term:"structure tensor",
  what:"A small matrix built at every sample from the local gradients of the image. Its eigenvectors give the orientation of the local fabric and its eigenvalues give how strongly oriented it is.",
  use:"Supplies the dip along which smoothing is applied and the linearity that decides where smoothing is applied at all.",
  see:["linearity","apparent-dip","sos"], alt:["gradient structure tensor"]},

"linearity": {term:"linearity",
  what:"How strongly oriented the image is at a sample, from 0 where there is no preferred direction to 1 where the fabric is locally parallel.",
  use:"Low linearity marks faults, terminations and incoherent zones. Holding smoothing back where linearity is low is what keeps those features.",
  see:["structure-tensor","semblance","sos"], alt:[]},

"semblance": {term:"semblance",
  what:"A normalized measure of how alike neighboring traces are over a short time window, from 0 to 1.",
  use:"Low semblance marks discontinuities. On a 2D line it can only compare along the line, so it responds to faults striking across the profile and not to those striking along it.",
  see:["linearity","coherence"], alt:[]},

"coherence": {term:"coherence",
  what:"A family of attributes measuring similarity between neighboring traces. The version here is semblance computed along the local dip.",
  use:"Computed along dip rather than horizontally, so that a steeply dipping but continuous reflector does not register as a discontinuity.",
  see:["semblance","apparent-dip"], alt:[]},

"sos": {term:"structure-oriented smoothing",
  what:"Smoothing applied along the local dip rather than across the image, with the amount held back where linearity is low.",
  use:"Raises the visibility of continuous reflections without blurring across them. It can also manufacture continuity that the data did not contain, which the difference panel shows.",
  see:["structure-tensor","linearity"], alt:["structure oriented smoothing","SOF"]},

/* ---- attributes ---- */
"attribute": {term:"seismic attribute",
  what:"A quantity computed from the section at every sample, producing a second image the same size as the first.",
  use:"Attributes reorganize what is in the data. None of them adds information that was not already there.",
  see:["envelope","analytic-signal"], alt:["attributes","seismic attributes"]},

"analytic-signal": {term:"analytic signal",
  what:"The complex trace formed from the real trace and its Hilbert transform. Its magnitude is the envelope and its argument is the instantaneous phase.",
  use:"The single construction that most single-trace attributes are computed from.",
  see:["hilbert","envelope","instantaneous-phase"], alt:["complex trace"]},

"hilbert": {term:"Hilbert transform",
  what:"A filter that shifts every frequency component by 90 degrees without changing its amplitude.",
  use:"Supplies the imaginary part of the analytic signal.",
  see:["analytic-signal"], alt:["Hilbert"]},

"envelope": {term:"envelope",
  what:"The magnitude of the analytic signal: the amplitude of the trace with the oscillation of the wavelet removed.",
  use:"Independent of polarity and of phase, so a strong reflection registers whether it is a peak or a trough.",
  see:["analytic-signal","avt","sweetness"], alt:["reflection strength","instantaneous amplitude"]},

"instantaneous-phase": {term:"instantaneous phase",
  what:"The argument of the analytic signal, in radians, wrapping every cycle.",
  use:"Amplitude is divided out entirely, so weak and strong reflections are displayed alike and the continuity of an event can be followed into a low-amplitude zone.",
  see:["analytic-signal","instantaneous-frequency"], alt:[]},

"instantaneous-frequency": {term:"instantaneous frequency",
  what:"The rate of change of instantaneous phase with time, in hertz.",
  use:"Where two events interfere within one wavelet length the estimate becomes unstable and can leave the physical band, which is a property of the estimator rather than of the rock.",
  see:["instantaneous-phase","analytic-signal"], alt:[]},

"sweetness": {term:"sweetness",
  what:"Envelope divided by the square root of instantaneous frequency.",
  use:"Introduced for clastic sections, where it responds to intervals that are both strong and low frequency. Its behavior on crystalline crust is not established.",
  see:["envelope","instantaneous-frequency"], alt:[]},

"avt": {term:"amplitude volume transform",
  what:"The RMS of the envelope over a running window, returned to the polarity of the original trace.",
  use:"Shows where energy is concentrated at a scale set by the window rather than by the wavelet, which suits the banded reflectivity of the lower crust.",
  see:["envelope","rms"], alt:["AVT"]},

"rms": {term:"RMS amplitude",
  what:"The root mean square of the samples in a running window.",
  use:"A measure of energy over an interval, insensitive to polarity and to the position of individual peaks within the window.",
  see:["avt","envelope"], alt:["RMS"]},

"rai": {term:"relative acoustic impedance",
  what:"The running integral of the trace, band-limited. A trace integrated in time approximates impedance change up to a low-frequency trend that seismic data does not carry.",
  use:"Turns reflections, which mark interfaces, into intervals, which is closer to how a layer is described.",
  see:["acoustic-impedance"], alt:["RAI"]},

"teager-kaiser": {term:"Teager-Kaiser energy",
  what:"A nonlinear energy measure combining the trace with its first and second derivatives, sensitive to both amplitude and frequency.",
  use:"Responds sharply at abrupt changes in the character of the trace. Being built from derivatives, it also responds sharply to noise.",
  see:["attribute"], alt:["Teager-Kaiser","TKE"]},

"rgb-blend": {term:"RGB blend",
  what:"Three attributes, usually three frequency bands, displayed as the red, green and blue channels of one image.",
  use:"Shows where the three inputs differ from each other. Color in the result means a difference between bands, not a rock property.",
  see:["spectral-band"], alt:["RGB blending","colour blend"]},

"spectral-band": {term:"spectral band",
  what:"The envelope of the trace after a narrow bandpass filter centered on one frequency.",
  use:"Comparing bands shows where the section carries energy at one frequency and not at another.",
  see:["rgb-blend","amplitude-spectrum"], alt:["spectral decomposition"]},

"relief-shading": {term:"relief shading",
  what:"The section treated as a height field and lit from a chosen direction, as a terrain map is shaded.",
  use:"A display treatment rather than a measurement. It makes low-relief lateral changes visible, and it can also make the corrugation of the wavelet look like structure.",
  see:["attribute"], alt:["hillshade","relief"]},

/* ---- classification ---- */
"som": {term:"self-organizing map",
  what:"An unsupervised method that arranges a set of prototype vectors on a small grid so that similar samples fall on neighboring nodes, then labels every sample by its nearest prototype.",
  use:"Reduces several attributes to one class image. The classes are groupings in attribute space and carry no geological meaning by themselves.",
  see:["attribute","null-model","normalization"], alt:["SOM","self organizing map"]},

"normalization": {term:"normalization",
  what:"Rescaling each attribute, usually to zero mean and unit standard deviation, before classification.",
  use:"Without it, an attribute with large numerical values dominates the distance calculation regardless of what it measures.",
  see:["som"], alt:["normalisation","normalized"]},

"null-model": {term:"null model",
  what:"A version of the data with the structure of interest destroyed but the other properties kept. Here each trace has its phase randomized, which preserves the amplitude spectrum and histogram of every attribute while removing the relationship between neighboring traces.",
  use:"Classifying the null model shows how organized a class image looks when there is nothing to find, which is the comparison for the real result.",
  see:["som","phase-randomization"], alt:["null test"]},

"phase-randomization": {term:"phase randomization",
  what:"Replacing the phase of every frequency component of a trace with a random value while keeping its amplitude.",
  use:"Produces a trace with the same spectrum and the same amplitude distribution as the original and no lateral continuity.",
  see:["null-model"], alt:["phase randomised","randomized phase"]},

/* ---- display ---- */
"vertical-exaggeration": {term:"vertical exaggeration",
  what:"The ratio between the vertical and horizontal scales of a display, computed from the trace spacing, the sample interval and an assumed velocity.",
  use:"At an exaggeration of 3 a 20 degree dip is drawn at about 47 degrees, so angles read off the screen are not the angles in the ground.",
  see:["two-way-time","velocity"], alt:["vertical exaggeration"]},

"clipping": {term:"clipping",
  what:"Setting the ends of the color scale at a percentile of the data rather than at its extremes, so that a few large samples do not compress everything else into the middle of the scale.",
  use:"A section displayed at 98 percent clip and the same section at 100 percent can look like different data.",
  see:["colormap"], alt:["clip"]},

"colormap": {term:"color map",
  what:"The table mapping data values to colors.",
  use:"A map with a light center shows polarity; one that runs dark to light shows magnitude. Perceptually uniform maps keep equal data steps looking like equal color steps.",
  see:["clipping"], alt:["colour map","color bar","colorbar"]},

/* ---- deep reflection context ---- */
"cocorp": {term:"COCORP",
  what:"The Consortium for Continental Reflection Profiling, which recorded deep crustal reflection lines across the United States from 1975 onward. The data are in the public domain.",
  use:"Wyoming Line 1, across the Wind River thrust, is the sample line of the companion Deep Reflection tool.",
  see:["moho","crustal-reflectivity"], alt:[]},

"moho": {term:"Moho",
  what:"The Mohorovicic discontinuity, the boundary between crust and mantle. On a reflection section it often appears as the base of a band of reflectivity rather than as a single reflector.",
  use:"Commonly at 10 to 14 seconds two-way time under continental crust, which is why deep lines are recorded to 20 seconds.",
  see:["crustal-reflectivity","cocorp"], alt:["Mohorovicic"]},

"crustal-reflectivity": {term:"crustal reflectivity",
  what:"The banded, laterally discontinuous reflections typical of the lower continental crust.",
  use:"Explanations proposed for it include layered mafic intrusions, shear zones with grain-scale fabric, and fluid-filled layers. The reflection data alone does not distinguish between them.",
  see:["moho","cocorp"], alt:["lower crustal reflectivity"]},

"iodp": {term:"IODP",
  what:"The International Ocean Discovery Program and its predecessors, which collected seismic reflection data alongside scientific ocean drilling.",
  use:"A source of open marine reflection lines with drilling control at the site.",
  see:["seg-y"], alt:[]},

/* ---- classification and explanation ---- */
"seismic-facies": {term:"seismic facies",
  what:"A package of reflections set apart from its surroundings by its reflection character: amplitude, continuity, frequency and the geometry of the reflections.",
  use:"Seismic facies are often associated with depositional environments or lithology, which is established by tying them to wells.",
  see:["attribute","som"], alt:["facies"]},

"neuron": {term:"neuron",
  what:"One node of a self-organizing map. Each neuron holds a prototype, a combination of attribute values that stands for the samples assigned to it.",
  use:"Neurons next to each other on the map hold similar prototypes, so their colors are blended from the map position.",
  see:["som","prototype"], alt:["neurons"]},

"prototype": {term:"prototype",
  what:"The vector of attribute values held by one neuron of a self-organizing map. Training moves prototypes toward the samples.",
  use:"A sample is assigned to the neuron whose prototype is nearest to its attribute values.",
  see:["neuron","som"], alt:["prototypes"]},

"principal-component": {term:"principal component",
  what:"A direction in attribute space along which the samples vary most, found from the correlation between the attributes. The first component carries the most variance, the second the most of what is left.",
  use:"The map starts with its prototypes spread over the plane of the first two components, which puts them where the samples are before training begins.",
  see:["som","normalization"], alt:["principal components"]},

"shap": {term:"SHAP",
  what:"Shapley additive explanations. Each input of a model is credited with the change it makes to the output, averaged over the orders in which the inputs can be added.",
  use:"Here the output is the position a sample takes on the self-organizing map, so SHAP values say which attributes decide the class of a sample.",
  see:["som","attribute"], alt:["SHAP value","SHAP values","Shapley"]},

"pstm": {term:"pre-stack time migration",
  what:"Migration applied to the data before stacking, with the result kept in two-way time. It moves dipping reflections to their correct position and collapses diffractions.",
  use:"The SCAN029 sample line is a pre-stack time migrated full stack.",
  see:["migration","poststack"], alt:["PSTM","PreSTM"]}

};

/* ------------------------------------------------------------------ */

/* Terms longest first, so that "instantaneous frequency" is matched before
   "frequency" and the longer phrase wins. */
function glossaryIndex(){
  const list = [];
  for (const slug in GLOSSARY){
    const e = GLOSSARY[slug];
    list.push([e.term, slug]);
    (e.alt || []).forEach(a => list.push([a, slug]));
  }
  list.sort((a, b) => b[0].length - a[0].length);
  return list;
}

const GLOSS_SKIP = {SCRIPT:1, STYLE:1, CANVAS:1, TEXTAREA:1, INPUT:1, SELECT:1,
                    OPTION:1, BUTTON:1, CODE:1, SVG:1,
                    H1:1, H2:1, H3:1, H4:1};

/* Whole-word, case-insensitive. The leading group keeps the character before
   the term so that it can be put back; a lookahead is used after the term so
   that the match does not consume the character following it. */
function glossaryPattern(word){
  // a space inside a term has to match a line break too, since prose wraps
  // wherever the column ends and "structure tensor" is routinely split
  const body = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s\\u00a0-]+");
  return new RegExp("(^|[^\\w-])(" + body + ")(?![\\w-])", "i");
}

/* Mark the first occurrence of each term inside root, once per page. Called
   after the text of the page is in place. */
function glossaryScan(root){
  const index = glossaryIndex().map(([w, slug]) => [glossaryPattern(w), w, slug]);
  const done = {};
  const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n){
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      for (let p = n.parentNode; p && p !== document.body; p = p.parentNode){
        if (GLOSS_SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT;
        if (p.classList && (p.classList.contains("gterm") ||
                            p.classList.contains("no-gloss"))) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const texts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n);

  for (const node of texts){
    let cur = node;
    // a paragraph can carry several terms, so the tail of each split is
    // scanned again rather than moving on to the next node
    while (cur && cur.nodeValue){
      let best = null;
      for (const [re, word, slug] of index){
        if (done[slug]) continue;
        const m = cur.nodeValue.match(re);
        if (!m) continue;
        const at = m.index + m[1].length;
        if (!best || at < best.at || (at === best.at && word.length > best.len))
          best = {at, len: m[2].length, slug};
      }
      if (!best) break;
      const hit = cur.splitText(best.at);
      const tail = hit.splitText(best.len);
      const btn = document.createElement("button");
      btn.className = "gterm";
      btn.type = "button";
      btn.dataset.g = best.slug;
      btn.textContent = hit.nodeValue;
      hit.parentNode.replaceChild(btn, hit);
      done[best.slug] = true;
      cur = tail;
    }
  }
}

let glossCard = null;

function glossaryCard(){
  if (glossCard) return glossCard;
  glossCard = document.createElement("div");
  glossCard.className = "gcard";
  glossCard.hidden = true;
  glossCard.setAttribute("role", "dialog");
  document.body.appendChild(glossCard);
  return glossCard;
}

function glossaryOpen(slug, anchor){
  const e = GLOSSARY[slug];
  if (!e) return;
  const c = glossaryCard();
  const rel = (e.see || []).filter(s => GLOSSARY[s]);
  c.innerHTML =
    '<button class="gclose" type="button" aria-label="Close">\u00d7</button>' +
    '<h4>' + e.term + '</h4>' +
    '<p>' + e.what + '</p>' +
    (e.use ? '<p class="guse"><span>Used for</span> ' + e.use + '</p>' : '') +
    (rel.length ? '<p class="gsee">' + rel.map(s =>
        '<button type="button" class="gterm" data-g="' + s + '">' +
        GLOSSARY[s].term + '</button>').join(" ") + '</p>' : '');
  c.hidden = false;

  // placed under the word, pulled back inside the window if it would overflow
  const r = anchor.getBoundingClientRect();
  const w = c.offsetWidth, h = c.offsetHeight;
  let x = r.left + window.scrollX, y = r.bottom + window.scrollY + 6;
  const maxX = window.scrollX + document.documentElement.clientWidth - w - 12;
  if (x > maxX) x = Math.max(window.scrollX + 12, maxX);
  if (r.bottom + h + 12 > window.innerHeight && r.top > h + 12)
    y = r.top + window.scrollY - h - 6;
  c.style.left = x + "px";
  c.style.top = y + "px";
  c.dataset.open = slug;
}

function glossaryClose(){
  if (glossCard) { glossCard.hidden = true; glossCard.dataset.open = ""; }
}

document.addEventListener("click", e => {
  const t = e.target.closest ? e.target.closest(".gterm") : null;
  if (t){ glossaryOpen(t.dataset.g, t); e.stopPropagation(); return; }
  if (e.target.closest && e.target.closest(".gclose")){ glossaryClose(); return; }
  if (glossCard && !glossCard.hidden && !e.target.closest(".gcard")) glossaryClose();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") glossaryClose(); });
window.addEventListener("resize", glossaryClose);
