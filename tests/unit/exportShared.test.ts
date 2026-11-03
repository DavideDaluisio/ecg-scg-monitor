import { describe, expect, it } from 'vitest'
import type { ChannelId } from '../../src/core/types.ts'
import {
  formatSample,
  formatSeconds,
  groupByClock,
  localDateTime,
  rowRange,
  sampleAt,
  type ExportChannel,
} from '../../src/io/exportShared.ts'

function channel(id: ChannelId, fs: number, first: number, values: number[]): ExportChannel {
  return { id, fs, firstSampleIndex: first, samples: Float32Array.from(values) }
}

describe('groupByClock', () => {
  it('keeps every channel together, ECG first, when the fs are equal', () => {
    const groups = groupByClock([channel('scg', 3000, 0, []), channel('ecg', 3000, 0, [])])
    expect(groups.map((group) => group.map((c) => c.id))).toEqual([['ecg', 'scg']])
  })

  it('gives each channel its own group when the fs differ', () => {
    const groups = groupByClock([channel('scg', 3000, 0, []), channel('ecg', 500, 0, [])])
    expect(groups.map((group) => group.map((c) => c.id))).toEqual([['ecg'], ['scg']])
  })
})

describe('rowRange and sampleAt', () => {
  it('covers every recorded sample and every marker', () => {
    const channels = [channel('ecg', 10, 3, [1, 2]), channel('scg', 10, 4, [5, 6, 7])]
    expect(rowRange(channels, new Map())).toEqual({ first: 3, end: 7 })
    expect(rowRange(channels, new Map([[9, ['end']]]))).toEqual({ first: 3, end: 10 })
  })

  it('reads a sample by live index, NaN outside the recorded range', () => {
    const ecg = channel('ecg', 10, 3, [1, 2])
    expect([2, 3, 4, 5].map((index) => sampleAt(ecg, index))).toEqual([NaN, 1, 2, NaN])
  })
})

describe('formatSeconds', () => {
  it('rounds to 1 µs and never writes -0', () => {
    expect(formatSeconds(1 / 3000)).toBe('0.000333')
    expect(formatSeconds(-1e-12)).toBe('0.000000')
    expect(formatSeconds(300)).toBe('300.000000')
  })
})

describe('localDateTime', () => {
  const ISO = '2026-10-08T13:04:05.000Z'

  it('writes the local date and time with the UTC offset, for the same instant', () => {
    // The test may run in any time zone: read the text back and check that it is the same instant.
    const text = localDateTime(ISO)
    const pattern =
      /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d) local time \(UTC([+-]\d\d):(\d\d)\)$/
    const match = pattern.exec(text)
    expect(match).not.toBeNull()
    const [year, month, day, hours, minutes, seconds, offsetHours, offsetMinutes] = match!
      .slice(1)
      .map(Number)
    const offsetSign = offsetHours < 0 || match![7] === '-00' ? -1 : 1
    const offsetMs = (offsetHours * 60 + offsetSign * offsetMinutes) * 60_000
    const localAsUtcMs = Date.UTC(year, month - 1, day, hours, minutes, seconds)
    expect(new Date(localAsUtcMs - offsetMs).toISOString()).toBe(ISO)
  })

  it('keeps a text that is not a date', () => {
    expect(localDateTime('unknown')).toBe('unknown')
  })
})

describe('formatSample', () => {
  it('writes the shortest text, empty for a missing sample', () => {
    expect(formatSample(Math.fround(1.605213))).toBe('1.605213')
    expect(formatSample(Math.fround(0.02226))).toBe('0.02226')
    expect(formatSample(Math.fround(1.6))).toBe('1.6')
    expect(formatSample(Math.fround(-120))).toBe('-120')
    expect(formatSample(Math.fround(2.5e-7))).toBe('2.5e-7')
    expect(formatSample(0)).toBe('0')
    expect(formatSample(NaN)).toBe('')
  })

  it('reads back to exactly the same Float32 value (raw is sacred)', () => {
    // Deterministic pseudo-random values over many magnitudes, like ADC readings in volts.
    let seed = 12345
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let i = 0; i < 20_000; i++) {
      const value = Math.fround((random() - 0.5) * 10 ** Math.floor(random() * 12 - 9))
      const text = formatSample(value)
      expect(Math.fround(Number(text))).toBe(value)
      expect(text.replace(/^-|e.*$|\./g, '').replace(/^0+/, '').length).toBeLessThanOrEqual(9)
    }
  })
})
