# Data

    SCAN029_full_stack.sgy   SCAN line L2EBN2020ASCAN029, PSTM full stack

See `../NOTICE.md` for the source and terms.

## The current file is an interim copy

It was rebuilt from the 8-bit display array of the `scan-lecture` repository,
because the NLOG SEG-Y was not at hand when the tool was built. That array was
clipped at the 99th percentile of absolute amplitude and had a time-only gain
applied, so:

- about one percent of samples, on the strongest reflections, are flattened at
  the clip level, which lowers the envelope and RMS amplitude there and adds
  high-frequency energy at the flattened peaks;
- amplitudes are quantized to 255 levels;
- the trace headers carry CDP numbers but no coordinates, so distance comes from
  the 20 m spacing entered on step 1.

The line opens and every step runs, but the amplitude attributes on the
brightest reflectors are not those of the processed data.

## Replacing it

From the NLOG full-stack SEG-Y (IBM float, 5001 samples at 2 ms):

    python python/make_sample.py --segy L2EBN2020ASCAN029_PreSTM_final_full.sgy

This keeps every 8th CDP (20 m) and 0 to 3.0 s, writes IEEE float with the CDP
number and CDP coordinates carried over, and applies no gain. The output
replaces `data/SCAN029_full_stack.sgy` under the same name, so nothing else
changes. The interim copy can be rebuilt with

    python python/make_sample.py --scan-lecture ../scan-lecture/data

Both need only NumPy. After replacing the file, the sample description on
`index.html` and the status line in `NOTICE.md` should be updated to match.
