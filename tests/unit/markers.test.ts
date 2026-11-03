import { describe, expect, it } from 'vitest'
import {
  addCustomMarkerType,
  cleanMarkerLabel,
  markerRecordingTimeS,
  recordingZeroSeconds,
  referenceChannel,
  removeCustomMarkerType,
} from '../../src/recording/markers.ts'
import { savedSessionName } from '../../src/recording/sessionName.ts'
import { formatDuration } from '../../src/ui/formatDuration.ts'

describe('referenceChannel', () => {
  it('is the channel with the highest fs', () => {
    expect(
      referenceChannel([
        { id: 'ecg', fs: 500 },
        { id: 'scg', fs: 3000 },
      ]),
    ).toBe('scg')
  })

  it('is ECG when the fs are equal, whatever the order', () => {
    expect(
      referenceChannel([
        { id: 'scg', fs: 3000 },
        { id: 'ecg', fs: 3000 },
      ]),
    ).toBe('ecg')
  })

  it('is the only channel of a one-channel session, null without channels', () => {
    expect(referenceChannel([{ id: 'scg', fs: 3000 }])).toBe('scg')
    expect(referenceChannel([])).toBeNull()
  })
})

describe('cleanMarkerLabel', () => {
  it('removes line breaks and surrounding spaces', () => {
    expect(cleanMarkerLabel('  stand\nup \r\n')).toBe('stand up')
    expect(cleanMarkerLabel('   ')).toBe('')
  })
})

describe('recording time of a marker', () => {
  // Record pressed while SCG was at sample 60 (20 ms at 3000 Hz) and ECG at sample 11 (22 ms at 500 Hz).
  const channels = [
    { id: 'ecg' as const, fs: 500, firstSampleIndex: 11 },
    { id: 'scg' as const, fs: 3000, firstSampleIndex: 60 },
  ]

  it('starts at the first recorded sample of any channel', () => {
    expect(recordingZeroSeconds(channels)).toBe(0.02)
    expect(recordingZeroSeconds([])).toBe(0)
  })

  it('is the seconds from that instant to the marker (the time_s of the export)', () => {
    expect(
      markerRecordingTimeS(channels, { channel: 'scg', sampleIndex: 3060, label: 'a' }),
    ).toBeCloseTo(1, 12)
    expect(
      markerRecordingTimeS(channels, { channel: 'ecg', sampleIndex: 11, label: 'b' }),
    ).toBeCloseTo(0.002, 12)
  })

  it('is NaN for a channel that was not recorded', () => {
    const ecgOnly = [channels[0]]
    expect(markerRecordingTimeS(ecgOnly, { channel: 'scg', sampleIndex: 0, label: 'c' })).toBeNaN()
  })
})

describe('custom marker types', () => {
  it('adds a cleaned name at the end, never a duplicate, a preset or an empty name', () => {
    expect(addCustomMarkerType([], ' walking\n fast ')).toEqual(['walking fast'])
    expect(addCustomMarkerType(['walking'], 'WALKING')).toEqual(['walking'])
    expect(addCustomMarkerType(['walking'], 'Deep breath')).toEqual(['walking'])
    expect(addCustomMarkerType(['walking'], '   ')).toEqual(['walking'])
    expect(addCustomMarkerType(['walking'], 'cough')).toEqual(['walking', 'cough'])
  })

  it('removes a name', () => {
    expect(removeCustomMarkerType(['walking', 'cough'], 'walking')).toEqual(['cough'])
  })
})

describe('savedSessionName', () => {
  it('uses the local date and time, with characters every file system accepts', () => {
    expect(savedSessionName(new Date(2026, 9, 8, 15, 4, 5))).toBe('session_2026-10-08_15-04-05')
  })
})

describe('formatDuration', () => {
  it('shows minutes:seconds', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(75.9)).toBe('01:15')
    expect(formatDuration(3725)).toBe('62:05')
  })
})
