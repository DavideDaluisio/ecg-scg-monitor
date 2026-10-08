// The running session: one data source and one ring buffer per channel.
// Plain module (no React): the UI calls these functions, the plot reads the buffers every frame.
import { RingBuffer } from '../core/ringBuffer.ts'
import type { ChannelId, DataSource } from '../core/types.ts'
import type { RecordingEntry } from '../io/manifest.ts'
import { parseRecording } from '../io/parseRecording.ts'
import { ReplaySource } from '../sources/ReplaySource.ts'
import { useAppStore } from './store.ts'

const BUFFER_SECONDS = 30

export interface ChannelBuffer {
  buffer: RingBuffer
  fs: number
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

/** Replays a recording listed in a manifest (file under public/samples/). */
export function startReplayFromEntry(entry: RecordingEntry): Promise<void> {
  return startReplay(entry.id, entry.file, entry.channel, async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}samples/${entry.file}`)
    if (!response.ok) throw new Error(`Could not load ${entry.file} (HTTP ${response.status})`)
    return response.arrayBuffer()
  })
}

/**
 * Replays a file opened from the user's disk. The file is read in the browser, never uploaded.
 * LVM and XLSX files do not say which signal they contain, so the user chooses the channel.
 */
export function startReplayFromFile(file: File, channel: ChannelId): Promise<void> {
  return startReplay(file.name, file.name, channel, () => file.arrayBuffer())
}

export function stopSession(): void {
  sessionToken++
  for (const unsub of unsubscribe) unsub()
  unsubscribe = []
  source?.stop()
  source = null
  useAppStore.getState().setStatus({ state: 'idle' })
}

async function startReplay(
  name: string,
  fileName: string,
  channel: ChannelId,
  readData: () => Promise<ArrayBuffer>,
): Promise<void> {
  stopSession()
  const token = sessionToken
  const store = useAppStore.getState()
  store.setStatus({ state: 'connecting' })
  store.setSourceInfo('')

  try {
    const { fs, samples } = await parseRecording(fileName, await readData())
    if (token !== sessionToken) return // stopped or restarted while loading

    const replay = new ReplaySource({ name, channel, fs, samples })
    buffers.clear()
    buffers.set(channel, { buffer: new RingBuffer(BUFFER_SECONDS * fs), fs })
    store.setSessionChannels([channel])
    unsubscribe = [
      replay.onBlock((block) =>
        buffers.get(block.channel)?.buffer.push(block.firstSampleIndex, block.samples),
      ),
      replay.onStatus((status) => useAppStore.getState().setStatus(status)),
    ]
    source = replay
    store.setSourceInfo(
      `${name} · ${fs} Hz · ${samples.length.toLocaleString('en-US')} samples ` +
        `(${(samples.length / fs).toFixed(1)} s) · loop`,
    )
    await replay.start()
  } catch (error) {
    if (token !== sessionToken) return
    const message = error instanceof Error ? error.message : String(error)
    store.setStatus({ state: 'error', error: message })
  }
}
