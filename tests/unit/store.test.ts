import { beforeEach, describe, expect, it } from 'vitest'
import type { ChannelId } from '../../src/core/types.ts'
import type { RecordingEntry } from '../../src/io/manifest.ts'
import { DISK_FILE, getReplayInputs, NO_RECORDING, useAppStore } from '../../src/state/store.ts'

function entry(id: string, channel: ChannelId): RecordingEntry {
  return {
    id,
    file: `${id}.csv`,
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
    store.setDiskFile('scg', new File(['x'], 'mine.csv'))
    useAppStore.getState().setRecordings([ecgDemo, ecgLocal, scgDemo])
    expect(useAppStore.getState().replayChoices).toEqual({ ecg: 'ecg_local', scg: DISK_FILE })
  })
})

describe('getReplayInputs', () => {
  it('returns one input per channel that is not "None", ECG first', () => {
    const store = useAppStore.getState()
    store.setRecordings([ecgDemo, scgDemo])
    const file = new File(['x'], 'mine.csv')
    store.setDiskFile('scg', file)

    expect(getReplayInputs(useAppStore.getState())).toEqual([
      { kind: 'entry', channel: 'ecg', entry: ecgDemo },
      { kind: 'file', channel: 'scg', file },
    ])

    useAppStore.getState().setReplayChoice('ecg', NO_RECORDING)
    expect(getReplayInputs(useAppStore.getState())).toEqual([
      { kind: 'file', channel: 'scg', file },
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
