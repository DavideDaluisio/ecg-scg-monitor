// Generates small SYNTHETIC test fixtures in tests/fixtures/.
// They copy the structure of the real lab files (LVM header, CSV header, fs, units, offsets),
// but the values are fake, so they can be committed and published.
// Real recordings stay in public/samples/local/ (git-ignored).
//
// Run: node scripts/make-fixtures.mjs
// The output is deterministic: running it twice gives identical files.

import { writeFileSync } from "node:fs";

const FS = 3000; // Hz, same as the real recordings
const DURATION_S = 2;
const N = FS * DURATION_S;
const HEART_RATE_BPM = 72;
const BEAT_PERIOD_S = 60 / HEART_RATE_BPM;

// One Gaussian bump: amplitude a, center c (s), width w (s)
function gaussian(t, a, c, w) {
  return a * Math.exp(-((t - c) ** 2) / (2 * w * w));
}

// Fake PQRST, in volts, around a 1.6 V DC offset (like the real ECG file)
function ecgValue(t) {
  const tb = t % BEAT_PERIOD_S; // time since the start of the beat
  return (
    1.6 +
    gaussian(tb, 0.01, 0.2, 0.025) + // P
    gaussian(tb, -0.015, 0.28, 0.008) + // Q
    gaussian(tb, 0.12, 0.3, 0.01) + // R (at 0.3 s into each beat)
    gaussian(tb, -0.025, 0.32, 0.008) + // S
    gaussian(tb, 0.03, 0.55, 0.04) // T
  );
}

// Fake SCG: a 30 Hz damped oscillation starting 50 ms after each R peak, about +/-0.02 V
function scgValue(t) {
  const tb = t % BEAT_PERIOD_S;
  const start = 0.3 + 0.05;
  if (tb < start) return 0;
  const dt = tb - start;
  return 0.02 * Math.exp(-dt / 0.04) * Math.sin(2 * Math.PI * 30 * dt);
}

function makeLvm() {
  // Same layout as the lab files. Note: "Samples 1000" on purpose, while the file has
  // 6000 rows. This reproduces the known quirk, so the parser must count rows.
  const header = [
    "LabVIEW Measurement\t",
    "Writer_Version\t2",
    "Reader_Version\t2",
    "Separator\tTab",
    "Decimal_Separator\t.",
    "Multi_Headings\tNo",
    "X_Columns\tMulti",
    "Time_Pref\tAbsolute",
    "Operator\tFixture",
    "Date\t2000/01/01",
    "Time\t00:00:00.000",
    "***End_of_Header***\t",
    "\t",
    "Channels\t1\t",
    "Samples\t1000\t",
    "Date\t2000/01/01\t",
    "Time\t00:00:00.000\t",
    "Y_Unit_Label\tVolts\t",
    "X_Dimension\tTime\t",
    "X0\t0.0000000000000000E+0\t",
    "Delta_X\t0.000333\t",
    "***End_of_Header***\t\t",
    "X_Value\tVoltage_0\tComment",
  ];
  const rows = [];
  for (let i = 0; i < N; i++) {
    const t = i / FS;
    rows.push(`${t.toFixed(6)}\t${ecgValue(t).toFixed(6)}`);
  }
  return header.concat(rows).join("\n") + "\n";
}

function makeCsv() {
  const rows = ["time_s,scg_V"];
  for (let i = 0; i < N; i++) {
    const t = i / FS;
    rows.push(`${t.toFixed(6)},${scgValue(t).toFixed(5)}`);
  }
  return rows.join("\n") + "\n";
}

writeFileSync("tests/fixtures/ecg_synthetic.lvm", makeLvm());
writeFileSync("tests/fixtures/scg_synthetic.csv", makeCsv());
console.log(`Wrote ${N} samples per file (fs = ${FS} Hz, ${DURATION_S} s) to tests/fixtures/`);
