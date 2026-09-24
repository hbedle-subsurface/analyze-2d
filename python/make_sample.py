"""Build the SCAN029 sample line that analyze-2d opens with.

Two sources are supported.

  python make_sample.py --segy L2EBN2020ASCAN029_PreSTM_final_full.sgy
      Reads the full-stack PreSTM SEG-Y from NLOG (IBM float, 5001 samples at 2 ms),
      keeps every 4th CDP (10 m) and 0-3.0 s, and writes IEEE float SEG-Y with the
      CDP number and CDP coordinates carried over. No gain is applied.

  python make_sample.py --scan-lecture ../scan-lecture/data
      Rebuilds the interim sample from section.bin in the scan-lecture repository,
      keeping every trace of it. That array is 8-bit, clipped at the 99th percentile
      of absolute amplitude and time-gained, so it stands in only until the NLOG
      file is used.

  --step N sets the trace decimation for either source. The earlier interim copy
  used --step 2 on the scan-lecture array, which halved the trace density of the
  section scan-lecture draws.

Needs only NumPy.
"""
import argparse, json, struct
from pathlib import Path
import numpy as np

OUT = Path(__file__).resolve().parent.parent / "data" / "SCAN029_full_stack.sgy"


def ibm_to_float(b):
    a = b.view(">u4").astype(np.uint64)
    sign = np.where(a >> 31, -1.0, 1.0)
    expo = ((a >> 24) & 0x7F).astype(np.int64) - 64
    frac = (a & 0xFFFFFF) / 16777216.0
    return (sign * frac * 16.0 ** expo).astype(np.float32)


def text_header(lines):
    card = "".join(f"C{i + 1:2d} {s}"[:80].ljust(80) for i, s in enumerate((lines + [""] * 40)[:40]))
    return card.encode("cp500")


def write_segy(path, data, dt_us, delay_ms, cdp, x, y, scalar, lines):
    nx, ns = data.shape
    binh = bytearray(400)
    struct.pack_into(">h", binh, 16, dt_us)          # 3217 sample interval, microseconds
    struct.pack_into(">H", binh, 20, ns)             # 3221 samples per trace
    struct.pack_into(">h", binh, 24, 5)              # 3225 format code: IEEE float
    struct.pack_into(">h", binh, 28, 1)              # 3229 ensemble fold
    struct.pack_into(">h", binh, 30, 4)              # 3231 trace sorting: CDP ensemble
    struct.pack_into(">h", binh, 54, 1)              # 3255 measurement system: meters
    struct.pack_into(">H", binh, 300, 0x0100)        # 3501 revision 1.0
    struct.pack_into(">h", binh, 302, 1)             # 3503 fixed length traces
    with open(path, "wb") as f:
        f.write(text_header(lines))
        f.write(binh)
        for i in range(nx):
            h = bytearray(240)
            struct.pack_into(">i", h, 0, i + 1)               # 1   trace sequence number in line
            struct.pack_into(">i", h, 20, int(cdp[i]))        # 21  CDP number
            struct.pack_into(">h", h, 70, int(scalar))        # 71  coordinate scalar
            struct.pack_into(">h", h, 108, int(delay_ms))     # 109 delay recording time, ms
            struct.pack_into(">H", h, 114, ns)                # 115 samples in this trace
            struct.pack_into(">H", h, 116, dt_us)             # 117 sample interval
            struct.pack_into(">i", h, 180, int(x[i]))         # 181 CDP X
            struct.pack_into(">i", h, 184, int(y[i]))         # 185 CDP Y
            f.write(h)
            f.write(data[i].astype(">f4").tobytes())


def from_segy(path, step=4, t_max=3.0):
    raw = np.fromfile(path, dtype=np.uint8)
    ns = struct.unpack(">H", raw[3220:3222].tobytes())[0]
    dt = struct.unpack(">h", raw[3216:3218].tobytes())[0]
    tb = 240 + 4 * ns
    tr = raw[3600:3600 + (raw.size - 3600) // tb * tb].reshape(-1, tb)[::step]
    h = tr[:, :240]
    i4 = lambda b: h[:, b - 1:b + 3].copy().view(">i4").ravel()
    scal = h[:, 70:72].copy().view(">i2").ravel()
    n_keep = int(round(t_max / (dt * 1e-6))) + 1
    data = np.stack([ibm_to_float(t[240:240 + 4 * n_keep].copy()) for t in tr])
    lines = ["SCAN029 L2EBN2020ASCAN029 PRESTM FULL STACK",
             "SOURCE NLOG / EBN SCAN PROGRAMME, NETHERLANDS",
             f"EVERY {step}TH CDP, 0-{t_max:.1f} S, IEEE FLOAT, NO GAIN APPLIED",
             f"TRACE SPACING {2.5 * step:g} M",
             "PREPARED FOR ANALYZE-2D, UNIVERSITY OF OKLAHOMA"]
    write_segy(OUT, data, dt, 0, i4(21), i4(181), i4(185), scal[0], lines)
    return data.shape


def from_scan_lecture(folder, step=1):
    folder = Path(folder)
    meta = json.load(open(folder / "meta.json"))
    nx, nt, dt = meta["section"]["nx"], meta["nt"], meta["dt"]
    sec = np.fromfile(folder / "section.bin", dtype=np.int8).reshape(nx, nt)[::step].astype(np.float32) / 127
    cdp = np.arange(1, sec.shape[0] + 1)
    zero = np.zeros(sec.shape[0])
    lines = ["SCAN029 L2EBN2020ASCAN029 PRESTM FULL STACK - INTERIM COPY",
             "SOURCE NLOG / EBN SCAN PROGRAMME, NETHERLANDS",
             "REBUILT FROM AN 8-BIT DISPLAY ARRAY: CLIPPED AT THE 99TH PERCENTILE",
             "OF ABSOLUTE AMPLITUDE AND TIME-GAINED. REPLACE USING --SEGY.",
             f"TRACE SPACING {meta['section']['dx_m'] * step} M, NO COORDINATES IN HEADERS",
             "PREPARED FOR ANALYZE-2D, UNIVERSITY OF OKLAHOMA"]
    write_segy(OUT, sec, int(round(dt * 1e6)), int(round(meta["t_min"] * 1000)), cdp, zero, zero, 1, lines)
    return sec.shape


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--segy")
    g.add_argument("--scan-lecture")
    ap.add_argument("--step", type=int, default=None, help="keep every Nth trace")
    a = ap.parse_args()
    kw = {} if a.step is None else {"step": a.step}
    shape = from_segy(a.segy, **kw) if a.segy else from_scan_lecture(a.scan_lecture, **kw)
    print("wrote", OUT, "traces x samples:", shape)
