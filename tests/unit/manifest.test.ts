import { describe, expect, it, vi } from 'vitest'
import { areSimultaneous, parseManifest, type RecordingEntry } from '../../src/io/manifest.ts'

const validEntry = {
  id: 'ecg_synthetic_demo',
  file: 'ecg_synthetic_demo.lvm',
  channel: 'ecg',
  fs: 3000,
  samples: 30000,
  durationS: 10,
  simultaneousWith: null,
}

describe('parseManifest', () => {
  it('reads valid entries and marks local ones', () => {
    expect(parseManifest({ recordings: [validEntry] }, true)).toEqual([
      { ...validEntry, column: null, isLocal: true },
    ])
  })

  it('returns an empty list for a missing or malformed manifest', () => {
    expect(parseManifest(null, false)).toEqual([])
    expect(parseManifest({}, false)).toEqual([])
    expect(parseManifest({ recordings: 'nope' }, false)).toEqual([])
  })

  it('skips malformed entries and keeps the others', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const entries = parseManifest(
      { recordings: [{ ...validEntry, channel: 'emg' }, { id: 'no_file' }, validEntry] },
      false,
    )
    expect(entries.map((e) => e.id)).toEqual(['ecg_synthetic_demo'])
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('reads the column letter of a multi-channel .lvm file', () => {
    const entry = { ...validEntry, file: 'local/ecg_scg.lvm', column: 'D' }
    expect(parseManifest({ recordings: [entry] }, true)[0].column).toBe('D')
  })

  it('skips an entry whose column is not uppercase letters', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const column of ['d', '4', 'B2', '', 3]) {
      expect(parseManifest({ recordings: [{ ...validEntry, column }] }, false)).toEqual([])
    }
    warn.mockRestore()
  })

  it('defaults simultaneousWith to null', () => {
    const { simultaneousWith: _, ...withoutField } = validEntry
    expect(parseManifest({ recordings: [withoutField] }, false)[0].simultaneousWith).toBeNull()
  })
})

describe('areSimultaneous', () => {
  const entry = (id: string, simultaneousWith: string | null): RecordingEntry => ({
    id,
    file: `${id}.csv`,
    column: null,
    channel: 'ecg',
    fs: 3000,
    samples: 3000,
    durationS: 1,
    simultaneousWith,
    isLocal: false,
  })

  it('is true when either recording names the other', () => {
    expect(areSimultaneous(entry('a', 'b'), entry('b', null))).toBe(true)
    expect(areSimultaneous(entry('a', null), entry('b', 'a'))).toBe(true)
  })

  it('is false otherwise', () => {
    expect(areSimultaneous(entry('a', null), entry('b', null))).toBe(false)
    expect(areSimultaneous(entry('a', 'c'), entry('b', 'd'))).toBe(false)
  })
})
