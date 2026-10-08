"""Checks a CSV export of the ECG/SCG monitor (format: docs/data-formats.md, "CSV export").

Usage:
    python scripts/check_export.py session_2026-10-08_15-04-05.csv
    python scripts/check_export.py session_..._ecg.csv session_..._scg.csv    (channels with different fs)

For every file it checks the format line, the header, that sample_index has no gap or repeat, that
time_s = sample_index / fs, and that every value is a number or empty (= missing sample). It lists the markers.
With two files, the markers must be the same in both, at round(t * fs) of each file.
For a synthetic session without noise, over the whole file (peaks are measured to a fraction of a sample):
  - every SCG AO peak must be at R + delay, R = 0.3 + k * 60 / HR seconds, within a quarter of a sample;
  - every ECG R peak must be within 1.5 samples of R, and at the same offset on every beat. (The R peak is pulled a
    little by the neighboring waves, up to ~1 sample at 200 bpm, but by the same amount on every beat.)
One dropped or repeated sample moves the following peaks by a whole sample and fails these checks.

Standard library only (no numpy needed). Exit code 0 = OK, 1 = FAIL.
To load an export in your own code: pandas.read_csv(path, comment='#').
"""

import argparse
import csv
import math
import sys
from array import array

FORMAT_LINE = "# ecg-scg-monitor export v1"
MARKER_SEPARATOR = " | "  # several markers on the same sample share one cell
TIME_TOLERANCE_S = 5.01e-7  # time_s is written with 6 decimals
MAX_PROBLEMS_SHOWN = 10

# The synthetic model of the app (src/sources/syntheticSignals.ts).
FIRST_R_S = 0.3
SEARCH_S = 0.02  # a peak is searched +-20 ms around where it should be
AO_TOLERANCE_SAMPLES = 0.25  # the AO burst is symmetric: its peak is exactly at R + delay
R_TOLERANCE_SAMPLES = 1.5  # the neighboring waves pull the R peak by up to ~1 sample (200 bpm, 3000 Hz)
R_SPREAD_SAMPLES = 0.25  # largest difference between the R offsets of two beats


def js_round(x):
    """Math.round of JavaScript (halves go up). Python's round() would send 10.5 to 10."""
    return math.floor(x + 0.5)


class Export:
    """One CSV file of an export."""

    def __init__(self, path):
        self.path = path
        self.header = {}  # "# key=value" lines
        self.fs = 0.0
        self.first_index = 0
        self.rows = 0
        self.values = {}  # column name (e.g. "ecg_V") -> array of floats, NaN = missing
        self.markers = []  # (sample_index, label)

    def end_index(self):
        return self.first_index + self.rows


def read_export(path, problems):
    export = Export(path)

    def problem(message):
        problems.append(f"{path}: {message}")

    with open(path, newline="", encoding="utf-8-sig") as file:
        if file.readline().rstrip("\r\n") != FORMAT_LINE:
            problem(f'the first line is not "{FORMAT_LINE}"')
        line = file.readline()
        while line.startswith("#"):
            key, _, value = line[1:].strip().partition("=")
            export.header[key] = value
            line = file.readline()

        columns = next(csv.reader([line]))
        value_columns = columns[2:-1]
        if columns[:2] != ["sample_index", "time_s"] or columns[-1] != "marker" or not value_columns:
            problem(f"unexpected columns {columns}")
            return export
        export.fs = float(export.header.get("fs", "nan"))
        if not export.fs > 0:
            problem("no valid fs in the header")
            return export
        for name in value_columns:
            export.values[name] = array("d")

        shown = 0
        expected_index = None
        for row in csv.reader(file):
            if not row:
                continue
            if len(row) != len(columns):
                problem(f"row {row[:2]} has {len(row)} cells instead of {len(columns)}")
                return export
            index = int(row[0])
            if expected_index is None:
                export.first_index = expected_index = index
            if index != expected_index and shown < MAX_PROBLEMS_SHOWN:
                problem(f"sample_index {index} where {expected_index} was expected (gap or repeat)")
                shown += 1
            expected_index = index + 1
            if abs(float(row[1]) - index / export.fs) > TIME_TOLERANCE_S and shown < MAX_PROBLEMS_SHOWN:
                problem(f"time_s {row[1]} is not sample_index / fs = {index / export.fs:.6f}")
                shown += 1
            for name, cell in zip(value_columns, row[2:-1]):
                export.values[name].append(float(cell) if cell != "" else math.nan)
            if row[-1] != "":
                for label in row[-1].split(MARKER_SEPARATOR):
                    export.markers.append((index, label))
            export.rows += 1
    return export


def print_summary(export):
    print(export.path)
    duration = export.rows / export.fs if export.fs else 0
    print(
        f"  fs {export.fs:g} Hz, {export.rows:,} rows, sample_index {export.first_index:,} .. "
        f"{export.end_index() - 1:,} ({duration:.3f} s, t = {export.first_index / export.fs:.3f} .. "
        f"{export.end_index() / export.fs:.3f} s)"
    )
    print(f"  source: {export.header.get('source', '?')} - {export.header.get('description', '')}")
    for name, values in export.values.items():
        missing = sum(1 for v in values if math.isnan(v))
        print(f"  {name}: {missing:,} missing samples")
    print(f"  markers: {len(export.markers)}")
    for index, label in export.markers:
        print(f"    sample {index:,}  t = {index / export.fs:.4f} s  {label}")


def check_markers_agree(exports, problems):
    """The app places a marker on the channel with the highest fs; the other file has it at round(t * fs)."""
    reference = max(exports, key=lambda e: e.fs)
    for other in exports:
        if other is reference:
            continue
        expected = sorted(
            (js_round(index / reference.fs * other.fs), label) for index, label in reference.markers
        )
        if expected != sorted(other.markers):
            problems.append(
                f"markers differ: {reference.path} gives {expected} in {other.path}, "
                f"which has {sorted(other.markers)}"
            )


def find_column(exports, name):
    for export in exports:
        if name in export.values:
            return export, export.values[name]
    return None, None


def peak_index(export, values, center_s):
    """Position (in samples, with decimals) of the largest value within +-SEARCH_S of center_s.

    The largest sample is refined with a parabola through it and its two neighbors, which finds the top of the
    peak between two samples. None if the window is outside the file or all missing.
    """
    start = js_round((center_s - SEARCH_S) * export.fs) - export.first_index
    stop = js_round((center_s + SEARCH_S) * export.fs) - export.first_index
    if start < 0 or stop >= export.rows:
        return None
    best = None
    for row in range(start, stop + 1):
        if not math.isnan(values[row]) and (best is None or values[row] > values[best]):
            best = row
    if best is None:
        return None
    before, top, after = values[best - 1], values[best], values[best + 1]
    curvature = before - 2 * top + after
    shift = 0.0
    if not (math.isnan(before) or math.isnan(after)) and curvature < 0:
        shift = 0.5 * (before - after) / curvature
    return best + shift + export.first_index


def check_synthetic_peaks(exports, problems):
    header = exports[0].header
    if header.get("source") != "synthetic":
        print("Peak check skipped: not a synthetic session (no known signal shape).")
        return
    if header.get("synthetic_noise") == "true":
        print("Peak check skipped: synthetic session with noise (peaks move by a few samples).")
        return
    heart_rate = float(header["synthetic_heart_rate_bpm"])
    r_to_ao_s = float(header["synthetic_r_to_ao_ms"]) / 1000
    ecg, ecg_values = find_column(exports, "ecg_V")
    scg, scg_values = find_column(exports, "scg_V")

    # Offset (in samples, measured - expected) of every peak found, per beat.
    r_offsets = {}
    ao_offsets = {}
    last_s = max(e.end_index() / e.fs for e in exports)
    beat = 0
    while FIRST_R_S + beat * 60 / heart_rate <= last_s:
        r_s = FIRST_R_S + beat * 60 / heart_rate
        if ecg is not None:
            index = peak_index(ecg, ecg_values, r_s)
            if index is not None:
                r_offsets[beat] = index - r_s * ecg.fs
        if scg is not None:
            index = peak_index(scg, scg_values, r_s + r_to_ao_s)
            if index is not None:
                ao_offsets[beat] = index - (r_s + r_to_ao_s) * scg.fs
        beat += 1

    def report(name, beat, offset):
        if sum(1 for p in problems if p.startswith(name)) < MAX_PROBLEMS_SHOWN:
            problems.append(f"{name} peak of beat {beat} is {offset:+.2f} samples from where it should be")

    if ao_offsets:
        for beat, offset in ao_offsets.items():
            if abs(offset) > AO_TOLERANCE_SAMPLES:
                report("AO", beat, offset)
        largest = max(abs(o) for o in ao_offsets.values())
        print(f"AO peaks: {len(ao_offsets):,} checked, largest offset {largest:.3f} sample")
    if r_offsets:
        for beat, offset in r_offsets.items():
            if abs(offset) > R_TOLERANCE_SAMPLES:
                report("R", beat, offset)
        # Beat 0 has no beat before it, so its shape (and offset) differs slightly: not in the spread.
        steady = [o for beat, o in r_offsets.items() if beat > 0] or list(r_offsets.values())
        spread = max(steady) - min(steady)
        if spread > R_SPREAD_SAMPLES:
            problems.append(
                f"R peaks move by {spread:.2f} samples from beat to beat: a dropped or repeated sample?"
            )
        print(
            f"R peaks: {len(r_offsets):,} checked, offset {min(steady):+.3f} .. {max(steady):+.3f} sample"
        )
    if ecg is not None and scg is not None:
        # Measured delay = configured delay + (AO offset) - (R offset), offsets converted to seconds.
        delays = [
            r_to_ao_s + ao_offsets[beat] / scg.fs - r_offsets[beat] / ecg.fs
            for beat in r_offsets
            if beat in ao_offsets
        ]
        if delays:
            mean_ms = 1000 * sum(delays) / len(delays)
            print(f"R->AO delay: {mean_ms:.3f} ms measured, {r_to_ao_s * 1000:g} ms configured")
    if not r_offsets and not ao_offsets:
        problems.append("no peak could be checked (file too short?)")


def main():
    parser = argparse.ArgumentParser(description="Check a CSV export of the ECG/SCG monitor.")
    parser.add_argument("files", nargs="+", help="one CSV, or one per channel when their fs differ")
    args = parser.parse_args()
    # A Windows console cannot show every character of the description (e.g. "→"): print "?" instead of crashing.
    sys.stdout.reconfigure(errors="replace")

    problems = []
    exports = [read_export(path, problems) for path in args.files]
    for export in exports:
        print_summary(export)
    if len(exports) > 1:
        check_markers_agree(exports, problems)
    if all(e.rows > 0 for e in exports):
        check_synthetic_peaks(exports, problems)
    else:
        problems.append("a file has no data rows")

    if problems:
        print("FAIL")
        for message in problems:
            print(f"  - {message}")
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
