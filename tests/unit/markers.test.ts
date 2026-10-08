import { describe, expect, it } from 'vitest'
import { cleanMarkerLabel, referenceChannel } from '../../src/recording/markers.ts'
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
