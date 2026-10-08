// The running session: one data source and one ring buffer per channel.
// Plain module (no React): the UI calls these functions, the plot reads the buffers every frame.
import { RingBuffer } from '../core/ringBuffer.ts'
import type { ChannelId, DataSource } from '../core/types.ts'
import { areSimultaneous } from '../io/manifest.ts'
import { parseRecording } from '../io/parseRecording.ts'
import { ReplaySource, type ReplayTrack } from '../sources/ReplaySource.ts'
import { SyntheticSource } from '../sources/SyntheticSource.ts'
import { useAppStore, type ReplayInput, type SyntheticSettings } from './store.ts'

const BUFFER_SECONDS = 30

export interface ChannelBuffer {
  buffer: RingBuffer
  fs: number
}

// What a start function prepares before the session can run.
interface PreparedSource {
  source: DataSource
  info: string // shown under the controls
  notSimultaneous: boolean
}

let source: DataSource | null = null
let unsubscribe: (() => void)[] = []
// Kept after stop() so the last frame stays on screen; replaced by the next start.
const buffers = new Map<ChannelId, ChannelBuffer>()
// Increases on every start/stop, so a file that finishes loading after the user pressed Stop is ignored.
let sessionToken = 0

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
      info: `${info} · loop`,
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
      info:
        `Synthetic ECG + SCG · ${heartRateBpm} bpm · R→AO ${rToAoMs} ms · ` +
        `ECG ${ecgFs} Hz · SCG ${scgFs} Hz${noise ? ' · noise' : ''}`,
      notSimultaneous: false,
    }
  })
}

export function stopSession(): void {
  sessionToken++
  for (const unsub of unsubscribe) unsub()
  unsubscribe = []
  source?.stop()
  source = null
  useAppStore.getState().setStatus({ state: 'idle' })
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
    const prepared = await prepare()
    if (token !== sessionToken) return // stopped or restarted while loading

    const newSource = prepared.source
    buffers.clear()
    for (const channel of newSource.channels) {
      buffers.set(channel.id, {
        buffer: new RingBuffer(BUFFER_SECONDS * channel.fs),
        fs: channel.fs,
      })
    }
    store.setSessionChannels(newSource.channels.map((channel) => channel.id))
    store.setNotSimultaneous(prepared.notSimultaneous)
    unsubscribe = [
      newSource.onBlock((block) =>
        buffers.get(block.channel)?.buffer.push(block.firstSampleIndex, block.samples),
      ),
      newSource.onStatus((status) => useAppStore.getState().setStatus(status)),
    ]
    source = newSource
    store.setSourceInfo(prepared.info)
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
