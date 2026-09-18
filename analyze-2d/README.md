# Analyze 2D

### Attributes, self-organizing maps and SHAP on a 2D seismic line

Open a post-stack 2D SEG-Y line in the browser, check and condition it, compute
seismic attributes, classify them with a self-organizing map, and read which
attributes the classes rest on with SHAP values. Nothing is precomputed and
nothing is uploaded: every number on every page comes from the file, in the
browser.

**[Open the tool](https://hbedle-subsurface.github.io/analyze-2d/)**

Dr. Heather Bedle, University of Oklahoma, with the
[AASPI](https://www.ou.edu/mcee/labs/aaspi) consortium.

---

## Who it is for

Students and interpreters working modern processed 2D data who want to go from
a SEG-Y file to an unsupervised classification and see each decision on the way:
what a filter removed, which attributes repeat each other, whether the classes
are more organized than chance, and which attributes the classes depend on.

## The workflow

| Step | Page | What happens |
|---|---|---|
| 1 | Open the line | Textual, binary and trace headers; trace spacing; crop by dragging a box |
| 2 | Bandwidth | Mean amplitude spectrum and its change down the record, on fixed axes |
| 3 | f-k filter | Dip and frequency rejection, with input, kept and removed panels |
| 4 | Structure-oriented smoothing | Smoothing along reflector dip with edge protection |
| 5 | Spectral balancing | Time-variant balancing and whitening over a filter bank |
| 6 | Attributes | Twenty-two attributes, their correlation matrix, and a striping check |
| 7 | Self-organizing map | Chosen attributes and map size, a facies window, a phase-randomized null test, runs compared side by side |
| 8 | SHAP | Global and single-sample SHAP values for any run |
| 9 | Refine and compare | A second map on the same window with a revised attribute set, drawn under the first, with both sets of SHAP values on one axis |

Steps 3 to 5 are off by default and can be skipped; a skipped step passes the
line through unchanged. Each step stores its result in the browser (IndexedDB)
and the next step starts from the latest stored result, so a change on one page
clears the results of the pages after it.

### Settings for modern data

The defaults are set for processed modern lines rather than legacy deep data.
No t-power gain or AGC is applied anywhere. The f-k pass band and the balancing
taper start from the 20 dB band measured on step 2; the attribute windows start
at 1.5 and 3 periods of the center of the 6 dB band, and the structure-tensor
window at half a period, so the same settings describe the same wavelet at any
sample interval.

## Sample data

The tool opens with SCAN029, a pre-stack time migrated line from the Dutch SCAN
geothermal programme (EBN and TNO), published on NLOG. The copy in `data/` is an
interim one; `data/README.md` explains its limits and how to replace it with the
NLOG SEG-Y using `python/make_sample.py`.

## Running it

The site is static. On GitHub Pages it runs as published. Locally, the browser
blocks the sample download and the Web Worker from a `file://` page, so the
folder has to be served:

    python -m http.server

and opened at `http://localhost:8000/`.

## Repository layout

    index.html          landing page: open a line, and the step list
    pages/              one HTML page per step, 1-line.html to 9-refine.html
    js/segy.js          SEG-Y reader: EBCDIC and binary headers, IBM and IEEE float
    js/dsp.js           FFT, f-k, structure tensor, structure-oriented smoothing
    js/spectrum.js      spectra and lateral continuity
    js/measure.js       spectrum of a section in windows down the record
    js/balance.js       time-variant spectral balancing
    js/attributes.js    analytic signal and the attributes
    js/som.js           SOM helpers and phase randomization
    js/som-worker.js    features, SOM training, null test and SHAP, in a Web Worker
    js/somview.js       drawing of the map, the classes and the SHAP bars
    js/store.js         IndexedDB store carrying results between pages
    js/common.js        page shell: workflow strip, panels, axes, display controls
    js/filterpage.js    the shared input, kept and removed layout of steps 3 to 5
    js/help.js          the reference window text
    js/glossary.js      the clickable glossary terms
    python/make_sample.py   builds the sample SEG-Y
    data/               the sample line and its README
    NOTICE.md           the SCAN029 data and their terms

The filtering and attribute engine is shared with the companion Deep Reflection
tool (`hbedle-subsurface.github.io/deep-reflection`); the SOM and SHAP worker
follows the one written for the SCAN029 colloquium tool.

## Methods and sources

Attributes are credited to their original authors in the reference window
(the Reference button on every page). The self-organizing map follows Kohonen
(1982). SHAP values follow Lundberg and Lee (2017), estimated by sampling
attribute orderings (Strumbelj and Kononenko, 2014). The amplitude volume
transform follows Bulhões (1999).

## Privacy

The seismic file is read in the browser and is never uploaded. No setting,
section, attribute or map leaves the machine, and the tool makes no network
request of its own apart from fetching the sample line from this site.

The site records an anonymous page count, with no cookie and no identifier. See
`assets/count.js`, which explains exactly what is sent and how to switch it off.
It is the same file used unchanged by the other teaching repositories under
`hbedle-subsurface.github.io`, so one counting account covers all of them.

## License and citation

Licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Free
to use, adapt and share, including in teaching and including commercially,
provided the source is credited and any adaptation is released under the same
license. The full legal text is in `LICENSE`.

The SCAN029 data are third-party material under their own terms and are **not**
covered by that license. See `NOTICE.md`.

> Bedle, H. (2026). *Analyze 2D: Attributes, Self-Organizing Maps and SHAP on a
> 2D Seismic Line in the Browser.* SSRN working paper, University of Oklahoma.
> https://hbedle-subsurface.github.io/analyze-2d/
