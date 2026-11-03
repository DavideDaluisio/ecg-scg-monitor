import { beforeEach, describe, expect, it } from 'vitest'
import type { ChannelId } from '../../src/core/types.ts'
import type { RecordingEntry } from '../../src/io/manifest.ts'
import type { LvmColumn } from '../../src/io/lvm.ts'
import {
  areReplayInputsSimultaneous,
  DISK_FILE,
  getReplayInputs,
  NO_RECORDING,
  useAppStore,
  type ReplayInput,
} from '../../src/state/store.ts'

function entry(id: string, channel: ChannelId): RecordingEntry {
  return {
    id,
    file: `${id}.csv`,
    column: null,
    channel,
    fs: 3000,
    samples: 30000,
    durationS: 10,
    simultaneousWith: null,
    isLocal: false,
  }
}

const ecgDemo = entry('ecg_demo', 'ecg')
const scgDemo = entry('scg_demo', 'scg')
const ecgLocal = entry('ecg_local', 'ecg')
const initialState = useAppStore.getState()

beforeEach(() => {
  useAppStore.setState(initialState, true)
})

describe('store: replay choices', () => {
  it('by default picks the first recording of each channel, so ECG and SCG play together', () => {
    useAppStore.getState().setRecordings([ecgDemo, ecgLocal, scgDemo])
    expect(useAppStore.getState().replayChoices).toEqual({ ecg: 'ecg_demo', scg: 'scg_demo' })
  })

  it('leaves a channel on "None" when it has no recording', () => {
    useAppStore.getState().setRecordings([ecgDemo])
    expect(useAppStore.getState().replayChoices).toEqual({ ecg: 'ecg_demo', scg: NO_RECORDING })
  })

  it('keeps a valid choice and a disk file when the recordings are loaded again', () => {
    const store = useAppStore.getState()
    store.setRecordings([ecgDemo, ecgLocal, scgDemo])
    store.setReplayChoice('ecg', 'ecg_local')
    store.setDiskFile('scg', new File(['x'], 'mine.csv'), [])
    useAppStore.getState().setRecordings([ecgDemo, ecgLocal, scgDemo])
    expect(useAppStore.getState().replayChoices).toEqual({ ecg: 'ecg_local', scg: DISK_FILE })
  })
})

describe('getReplayInputs', () => {
  it('returns one input per channel that is not "None", ECG first', () => {
    const store = useAppStore.getState()
    store.setRecordings([ecgDemo, scgDemo])
    const file = new File(['x'], 'mine.csv')
    store.setDiskFile('scg', file, [])

    expect(getReplayInputs(useAppStore.getState())).toEqual([
      { kind: 'entry', channel: 'ecg', entry: ecgDemo },
      { kind: 'file', channel: 'scg', file, column: null },
    ])

    useAppStore.getState().setReplayChoice('ecg', NO_RECORDING)
    expect(getReplayInputs(useAppStore.getState())).toEqual([
      { kind: 'file', channel: 'scg', file, column: null },
    ])
  })

  it('ignores a choice that does not match a recording of that channel', () => {
    const store = useAppStore.getState()
    store.setRecordings([ecgDemo, scgDemo])
    store.setReplayChoice('scg', 'ecg_demo') // an ECG id on the SCG channel
    store.setReplayChoice('ecg', DISK_FILE) // no disk file opened for ECG
    expect(getReplayInputs(useAppStore.getState())).toEqual([])
  })
})

describe('store: column of a multi-channel disk file', () => {
  const columns: LvmColumn[] = [
    { letter: 'B', name: 'Voltage_0', index: 1 },
    { letter: 'D', name: 'Voltage_1 (Filtered)', index: 3 },
  ]

  it('has no column chosen after opening a file (no guessed default), then uses the chosen one', () => {
    const file = new File(['x'], 'lab.lvm')
    useAppStore.getState().setDiskFile('scg', file, columns)
    expect(useAppStore.getState().diskColumns.scg).toEqual(columns)
    expect(getReplayInputs(useAppStore.getState())[0]).toMatchObject({ column: null })

    useAppStore.getState().setDiskColumnChoice('scg', 'D')
    expect(getReplayInputs(useAppStore.getState())[0]).toEqual({
      kind: 'file',
      channel: 'scg',
      file,
      column: 'D',
    })
  })

  it('forgets the chosen column when another file is opened', () => {
    const store = useAppStore.getState()
    store.setDiskFile('ecg', new File(['x'], 'lab.lvm'), columns)
    store.setDiskColumnChoice('ecg', 'B')
    useAppStore.getState().setDiskFile('ecg', new File(['y'], 'other.lvm'), [])
    expect(useAppStore.getState().diskColumnChoices.ecg).toBeNull()
    expect(useAppStore.getState().diskColumns.ecg).toEqual([])
  })
})

describe('areReplayInputsSimultaneous', () => {
  const lab = new File(['same content'], 'lab.lvm', { lastModified: 1000 })
  const labAgain = new File(['same content'], 'lab.lvm', { lastModified: 1000 }) // second "Open file"
  const other = new File(['other content'], 'other.lvm', { lastModified: 1000 })
  const file = (channel: ChannelId, f: File, column: string | null): ReplayInput => ({
    kind: 'file',
    channel,
    file: f,
    column,
  })

  it('is true for two columns of the same disk file', () => {
    expect(areReplayInputsSimultaneous([file('ecg', lab, 'B'), file('scg', labAgain, 'D')])).toBe(
      true,
    )
  })

  it('is false for two different disk files, or the same column twice', () => {
    expect(areReplayInputsSimultaneous([file('ecg', lab, 'B'), file('scg', other, 'D')])).toBe(
      false,
    )
    expect(areReplayInputsSimultaneous([file('ecg', lab, null), file('scg', labAgain, null)])).toBe(
      false,
    )
  })

  it('follows the manifest for two recordings, and is false for a recording + a disk file', () => {
    const ecg = { ...ecgDemo, simultaneousWith: 'scg_demo' }
    const entryInput = (entry: RecordingEntry): ReplayInput => ({
      kind: 'entry',
      channel: entry.channel,
      entry,
    })
    expect(areReplayInputsSimultaneous([entryInput(ecg), entryInput(scgDemo)])).toBe(true)
    expect(areReplayInputsSimultaneous([entryInput(ecgDemo), entryInput(scgDemo)])).toBe(false)
    expect(areReplayInputsSimultaneous([entryInput(ecg), file('scg', lab, 'D')])).toBe(false)
  })
})

describe('store: custom marker types', () => {
  it('adds a new name once, after the presets, and removes it', () => {
    const store = () => useAppStore.getState()
    store().addCustomMarkerType('  walking ')
    store().addCustomMarkerType('Walking') // already there (case-insensitive)
    store().addCustomMarkerType('Stand up') // a preset
    store().addCustomMarkerType('') // nothing typed
    store().addCustomMarkerType('cough')
    expect(store().customMarkerTypes).toEqual(['walking', 'cough'])

    store().removeCustomMarkerType('walking')
    expect(store().customMarkerTypes).toEqual(['cough'])
  })
})
