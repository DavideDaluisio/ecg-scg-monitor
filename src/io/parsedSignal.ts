// What every recording parser (LVM, CSV, XLSX) returns: one channel, ready for the replay source.
export interface ParsedSignal {
  fs: number // Hz, computed from the time column
  samples: Float32Array // volts
}
