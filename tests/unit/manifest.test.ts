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
      { ...validEntry, isLocal: true },
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

  it('defaults simultaneousWith to null', () => {
    const { simultaneousWith: _, ...withoutField } = validEntry
    expect(parseManifest({ recordings: [withoutField] }, false)[0].simultaneousWith).toBeNull()
  })
})

describe('areSimultaneous', () => {
  const entry = (id: string, simultaneousWith: string | null): RecordingEntry => ({
    id,
    file: `${id}.csv`,
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
