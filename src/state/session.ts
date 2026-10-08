// The running session: one data source and one ring buffer per channel, plus the recorder while recording.
// Plain module (no React): the UI calls these functions, the plot reads the buffers every frame.
import { RingBuffer } from '../core/ringBuffer.ts'
import type { ChannelId, DataSource } from '../core/types.ts'
import { areSimultaneous } from '../io/manifest.ts'
import { parseRecording } from '../io/parseRecording.ts'
import type { PlotMarker } from '../plot/LivePlot.ts'
import { getAppDb } from '../recording/db.ts'
import { cleanMarkerLabel, referenceChannel } from '../recording/markers.ts'
import { Recorder } from '../recording/recorder.ts'
import { savedSessionName } from '../recording/sessionName.ts'
import type { SavedChannel, SavedSession, SavedSessionSource } from '../recording/types.ts'
import { ReplaySource, type ReplayTrack } from '../sources/ReplaySource.ts'
import { SyntheticSource } from '../sources/SyntheticSource.ts'
import { refreshSavedSessions } from './savedSessions.ts'
import { useAppStore, type ReplayInput, type SyntheticSettings } from './store.ts'

const BUFFER_SECONDS = 30
const DEFAULT_MARKER_LABEL = 'marker' // when the label field is empty

export interface ChannelBuffer {
  buffer: RingBuffer
  fs: number
}

// What a start function prepares before the session can run.
interface PreparedSource {
  source: DataSource
  kind: SavedSessionSource
  info: string // shown under the controls, and saved with a recording
  settings: SavedSession['settings'] // saved with a recording (e.g. the synthetic HR and delay)
  notSimultaneous: boolean
}

let source: DataSource | null = null
let prepared: PreparedSource | null = null
let startIso = '' // wall-clock time of sample index 0
let unsubscribe: (() => void)[] = []
// Kept after stop() so the last frame stays on screen; replaced by the next start.
const buffers = new Map<ChannelId, ChannelBuffer>()
// Increases on every start/stop, so a file that finishes loading after the user pressed Stop is ignored.
let sessionToken = 0

let recorder: Recorder | null = null
let recordingChannels: SavedChannel[] = [] // where each channel's recording started
let recordingStartS = 0
// Markers of the live session, drawn on every panel. The same array for the whole app (the plot keeps a
// reference to it), emptied by the next start; kept after Stop like the last frame.
const plotMarkers: PlotMarker[] = []

export function getChannelBuffer(channel: ChannelId): ChannelBuffer | null {
  return buffers.get(channel) ?? null
}

/**
 * Newest instant (s) reached by any channel of the session: the right edge of the X axis shared by all panels.
 * The newest and not the oldest, so a channel that stops sending (e.g. BLE, M5) does not freeze the others.
 */
export function getSessionEndSeconds(): number {
  let endS = 0
  for (const { buffer, fs } of buffers.values()) endS = Math.max(endS, buffer.endIndex / fs)
  return endS
}

export function getPlotMarkers(): readonly PlotMarker[] {
  return plotMarkers
}

/** Seconds of signal recorded so far (0 when not recording). */
export function getRecordingElapsedSeconds(): number {
  return recorder === null ? 0 : getSessionEndSeconds() - recordingStartS
}

/**
 * Replays one recording per channel, all started at the same instant (sample index 0 of every channel).
 * Files opened from disk are read in the browser, never uploaded.
 */
export function startReplay(inputs: ReplayInput[]): Promise<void> {
  return startSession(async () => {
    const tracks = await Promise.all(inputs.map(loadTrack))
    const name = tracks.map((track) => track.name).join(' + ')
    const info = tracks
      .map(
        ({ name, fs, samples }) =>
          `${name} · ${fs} Hz · ${samples.length.toLocaleString('en-US')} samples ` +
          `(${(samples.length / fs).toFixed(1)} s)`,
      )
      .join(' + ')
    return {
      source: new ReplaySource({ name, tracks }),
      kind: 'replay',
      info: `${info} · loop`,
      settings: {},
      notSimultaneous: inputs.length > 1 && !areInputsSimultaneous(inputs),
    }
  })
}

/** Generates ECG + SCG with a known heart rate and R→AO delay. */
export function startSynthetic(settings: SyntheticSettings): Promise<void> {
  return startSession(async () => {
    const { heartRateBpm, rToAoMs, ecgFs, scgFs, noise } = settings
    const source = new SyntheticSource({
      heartRateBpm,
      rToAoS: rToAoMs / 1000,
      ecgFs,
      scgFs,
      noise,
    })
    return {
      source,
      kind: 'synthetic',
      info:
        `Synthetic ECG + SCG · ${heartRateBpm} bpm · R→AO ${rToAoMs} ms · ` +
        `ECG ${ecgFs} Hz · SCG ${scgFs} Hz${noise ? ' · noise' : ''}`,
      // Written in the export header: scripts/check_export.py uses them to check the peak positions.
      settings: {
        synthetic_heart_rate_bpm: heartRateBpm,
        synthetic_r_to_ao_ms: rToAoMs,
        synthetic_noise: noise,
      },
      notSimultaneous: false,
    }
  })
}

export function stopSession(): void {
  sessionToken++
  void stopRecording()
  for (const unsub of unsubscribe) unsub()
  unsubscribe = []
  source?.stop()
  source = null
  useAppStore.getState().setStatus({ state: 'idle' })
}

/**
 * Starts saving the running session (Record button). Each channel is recorded from its next sample on;
 * the sample indices stay those of the live session.
 */
export function startRecording(): void {
  if (recorder !== null || source === null || prepared === null) return
  if (source.status.state !== 'running') return

  const now = new Date()
  const name = savedSessionName(now)
  recordingChannels = source.channels.map(({ id, fs }) => ({
    id,
    fs,
    firstSampleIndex: buffers.get(id)?.buffer.endIndex ?? 0,
    sampleCount: 0,
  }))
  recordingStartS = getSessionEndSeconds()
  // Created now, not after the database opens: the blocks of the next few milliseconds must not be lost.
  recorder = new Recorder({
    db: getAppDb(),
    draft: {
      name,
      startIso,
      recordedAtIso: now.toISOString(),
      source: prepared.kind,
      description: prepared.info,
      settings: prepared.settings,
      channels: recordingChannels,
      markers: [],
      status: 'recording',
    },
    onError: (message) => {
      useAppStore.getState().setStorageError(message)
      void stopRecording()
    },
  })

  const store = useAppStore.getState()
  store.setStorageError('')
  store.setLastMarker(null)
  store.setRecordingName(name)
  // Asks the browser not to delete saved sessions when the disk is almost full (it may say no).
  if ('storage' in navigator) navigator.storage.persist().catch(() => {})
}

/** Stores what is left and closes the saved session (Stop recording, Stop, or the source ended or failed). */
export async function stopRecording(): Promise<void> {
  const finishing = recorder
  if (finishing === null) return
  recorder = null
  useAppStore.getState().setRecordingName(null)
  await finishing.finish()
  await refreshSavedSessions()
}

/**
 * Places a marker on the newest sample received on the reference channel (highest fs, ECG if equal), never
 * before the start of the recording. Only while recording.
 */
export function addMarker(label: string): void {
  if (recorder === null || source === null) return
  const channel = referenceChannel(source.channels)
  const channelBuffer = channel === null ? undefined : buffers.get(channel)
  const recorded = recordingChannels.find((c) => c.id === channel)
  if (channel === null || channelBuffer === undefined || recorded === undefined) return

  const sampleIndex = Math.max(recorded.firstSampleIndex, channelBuffer.buffer.endIndex - 1)
  const text = cleanMarkerLabel(label) || DEFAULT_MARKER_LABEL
  recorder.addMarker({ channel, sampleIndex, label: text })
  const timeS = sampleIndex / channelBuffer.fs
  plotMarkers.push({ timeS, label: text })
  useAppStore.getState().setLastMarker({ label: text, sampleIndex, timeS })
}

// Common part of every start: stop the old session, prepare the source, create one ring buffer per channel,
// subscribe, start. Errors (unreadable file, invalid settings) are shown in the UI.
async function startSession(prepare: () => Promise<PreparedSource>): Promise<void> {
  stopSession()
  const token = sessionToken
  const store = useAppStore.getState()
  store.setStatus({ state: 'connecting' })
  store.setSourceInfo('')
  // Like sessionChannels, the note stays after Stop (it describes the last frame) until the next start.
  store.setNotSimultaneous(false)

  try {
    const next = await prepare()
    if (token !== sessionToken) return // stopped or restarted while loading

    const newSource = next.source
    buffers.clear()
    for (const channel of newSource.channels) {
      buffers.set(channel.id, {
        buffer: new RingBuffer(BUFFER_SECONDS * channel.fs),
        fs: channel.fs,
      })
    }
    plotMarkers.length = 0
    store.setLastMarker(null)
    store.setSessionChannels(newSource.channels.map((channel) => channel.id))
    store.setNotSimultaneous(next.notSimultaneous)
    unsubscribe = [
      newSource.onBlock((block) => {
        buffers.get(block.channel)?.buffer.push(block.firstSampleIndex, block.samples)
        recorder?.push(block)
      }),
      newSource.onStatus((status) => {
        useAppStore.getState().setStatus(status)
        if (status.state === 'ended' || status.state === 'error') void stopRecording()
      }),
    ]
    source = newSource
    prepared = next
    store.setSourceInfo(next.info)
    startIso = new Date().toISOString() // sample index 0 is (about) now
    await newSource.start()
  } catch (error) {
    if (token !== sessionToken) return
    const message = error instanceof Error ? error.message : String(error)
    store.setStatus({ state: 'error', error: message })
  }
}

// Reads and parses the file of one channel. Errors name the file, since two files may be loading.
async function loadTrack(input: ReplayInput): Promise<ReplayTrack & { name: string }> {
  const name = input.kind === 'entry' ? input.entry.id : input.file.name
  const fileName = input.kind === 'entry' ? input.entry.file : input.file.name
  try {
    const data =
      input.kind === 'entry' ? await fetchSample(fileName) : await input.file.arrayBuffer()
    const { fs, samples } = await parseRecording(fileName, data)
    return { name, channel: input.channel, fs, samples }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${name}: ${message}`)
  }
}

async function fetchSample(file: string): Promise<ArrayBuffer> {
  const response = await fetch(`${import.meta.env.BASE_URL}samples/${file}`)
  if (!response.ok) throw new Error(`Could not load ${file} (HTTP ${response.status})`)
  return response.arrayBuffer()
}

// Two manifest recordings are simultaneous only if the manifest says so. A file from disk never is: nothing
// tells us when it was recorded.
function areInputsSimultaneous(inputs: ReplayInput[]): boolean {
  const [a, b] = inputs
  return a.kind === 'entry' && b.kind === 'entry' && areSimultaneous(a.entry, b.entry)
}
