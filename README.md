# Analyze 2D

**[Open the tool](https://hbedle-subsurface.github.io/analyze-2d/)**

A lot of good 2D seismic never gets looked at past the stack. There are legacy
lines, open government data, and survey lines that a student downloads for a
thesis and then isn't sure what to do with. Running attributes and a
classification on a line like that has usually meant commercial software, a
license, and a fair amount of setup before anything shows up on the screen.

So this is the short version. Drop a 2D SEG-Y file into a browser and work
through it: look at the headers, crop it, check the bandwidth, clean it up if it
needs it, compute attributes, and see what a self-organizing map does with them.
Then use SHAP values to see which attributes the map actually leaned on, change
the attribute set, and run it again.

Nothing gets uploaded. The file is read in your browser and every number on the
screen is computed there.

## Why it's built this way

Most of the time in unsupervised classification goes into choices nobody sees
afterward: which filter, how hard, which attributes, how many classes. So every
step here shows its work. The filter pages show what was kept and what was
removed, side by side, with checks that flag when a setting starts taking out
reflections. The attribute page shows which attributes repeat each other. The
SOM page tests the classes against a version of the data with the lateral
information scrambled out, so a map that is only sorting noise gets caught.

The SHAP step is there because "the SOM found five facies" is only half an
answer. The other half is which attributes did the work, and whether dropping
two of them changes anything.

## What's in it

1. **Open the line**: headers, trace spacing, crop
2. **Bandwidth**: the spectrum, and how the band changes down the record
3. **Structure-oriented smoothing**: smoothing along reflectors, with faults protected
4. **Spectral balancing**: time-variant balancing and whitening
5. **Attributes**: twenty-two of them, with a correlation matrix and a striping check
6. **Self-organizing map**: pick the attributes and map size, train, run the null test
7. **SHAP**: which attributes decide where each sample lands on the map
8. **Refine and compare**: a second map with a revised set, next to the first

Steps 3 and 4 are optional. Skip them and the line goes straight through.

## The sample line

The tool opens with SCAN029, a line from the Dutch SCAN geothermal program run
by EBN and TNO and published on NLOG. It crosses the southeastern Netherlands
from the Someren area to the Californië geothermal wells near Venlo. The copy in
`data/` is a temporary one; `data/README.md` says why and how to swap in the
full-precision file.

## Running it locally

It's a static site, so on GitHub Pages it just works. On your own machine the
browser won't fetch the sample or start the background worker from a
`file://` page, so serve the folder:

    python -m http.server

and open `http://localhost:8000/`.

## Credits and sources

Heather Bedle, University of Oklahoma, with the AASPI consortium. The filtering
and attribute code is shared with the companion
[Deep Reflection](https://hbedle-subsurface.github.io/deep-reflection/) tool.

Each attribute is credited to its original authors in the Reference window
inside the tool. The self-organizing map follows Kohonen (1982), SHAP follows
Lundberg and Lee (2017) with the sampling estimate of Strumbelj and Kononenko
(2014), and the amplitude volume transform follows Bulhões (1999).

The site keeps an anonymous page count with no cookies; `assets/count.js`
explains what it sends.

## License

[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Use it, teach
with it, adapt it, including at a company, as long as you credit it and share
your changes under the same license. The SCAN029 data carry their own terms; see
`NOTICE.md`.

> Bedle, H. (2026). *Analyze 2D: Attributes, Self-Organizing Maps and SHAP on a
> 2D Seismic Line in the Browser. https://hbedle-subsurface.github.io/analyze-2d/
