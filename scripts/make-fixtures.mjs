// Generates the synthetic test fixtures in tests/fixtures/ (deterministic, no real patient data).
// Usage: npm run fixtures
import { mkdirSync, writeFileSync } from 'node:fs'

const FS = 3000 // Hz, same as the lab recordings
const DURATION_S = 2
const HEART_RATE_BPM = 72
const R_TO_AO_S = 0.08 // delay between the ECG R peak and the SCG aortic-opening burst
const N = FS * DURATION_S
const BEAT_S = 60 / HEART_RATE_BPM
const FIRST_R_S = 0.3

// Sum of Gaussian bumps: a simple PQRST shape (amplitudes in volts).
const PQRST = [
  { offsetS: -0.2, amplitude: 0.00015, widthS: 0.025 }, // P
  { offsetS: -0.03, amplitude: -0.0001, widthS: 0.008 }, // Q
  { offsetS: 0, amplitude: 0.0012, widthS: 0.01 }, // R
  { offsetS: 0.03, amplitude: -0.0003, widthS: 0.009 }, // S
  { offsetS: 0.25, amplitude: 0.0003, widthS: 0.05 }, // T
]

function gaussian(x, width) {
  return Math.exp(-0.5 * (x / width) ** 2)
}

function rPeakTimes() {
  const times = []
  for (let t = FIRST_R_S; t < DURATION_S + 1; t += BEAT_S) times.push(t)
  return times
}

function ecgAt(t) {
  let value = 1.6 // DC offset, like the lab ECG recording
  for (const r of rPeakTimes()) {
    for (const wave of PQRST) value += wave.amplitude * gaussian(t - r - wave.offsetS, wave.widthS)
  }
  return value
}

// Damped 30 Hz bursts: one at aortic opening (AO), a smaller one at aortic closing (AC).
function scgAt(t) {
  let value = 0
  for (const r of rPeakTimes()) {
    for (const burst of [
      { startS: r + R_TO_AO_S, amplitude: 0.05 },
      { startS: r + 0.35, amplitude: 0.02 },
    ]) {
      const dt = t - burst.startS
      if (dt >= 0) value += burst.amplitude * Math.exp(-dt / 0.03) * Math.sin(2 * Math.PI * 30 * dt)
    }
  }
  return value
}

const time = (i) => (i / FS).toFixed(6)

const lvmHeader = [
  'LabVIEW Measurement\t',
  'Writer_Version\t2',
  'Reader_Version\t2',
  'Separator\tTab',
  'Decimal_Separator\t.',
  'Multi_Headings\tNo',
  'X_Columns\tMulti',
  'Time_Pref\tAbsolute',
  'Operator\tsynthetic',
  'Date\t2000/01/01',
  'Time\t00:00:00',
  '***End_of_Header***\t',
  '\t',
  'Channels\t1\t',
  'Samples\t1000\t', // deliberately wrong, like the lab file: parsers must count rows
  'Date\t2000/01/01\t',
  'Time\t00:00:00\t',
  'Y_Unit_Label\tVolts\t',
  'X_Dimension\tTime\t',
  'X0\t0.0000000000000000E+0\t',
  'Delta_X\t0.000333\t',
  '***End_of_Header***\t\t',
  'X_Value\tVoltage_0\tComment',
]
const ecgRows = []
const scgRows = ['time_s,scg_V']
for (let i = 0; i < N; i++) {
  ecgRows.push(`${time(i)}\t${ecgAt(i / FS).toFixed(6)}`)
  scgRows.push(`${time(i)},${scgAt(i / FS).toFixed(6)}`)
}

const outDir = new URL('../tests/fixtures/', import.meta.url)
mkdirSync(outDir, { recursive: true })
writeFileSync(new URL('ecg_synthetic.lvm', outDir), [...lvmHeader, ...ecgRows].join('\n') + '\n')
writeFileSync(new URL('scg_synthetic.csv', outDir), scgRows.join('\n') + '\n')
console.log(`Wrote ${N} ECG and ${N} SCG samples at ${FS} Hz to tests/fixtures/`)
