import type { ChannelId } from '../core/types.ts'
import { DISK_FILE, NO_RECORDING, useAppStore } from '../state/store.ts'

// Chooses what one channel replays: nothing, a recording from the manifests, or a file opened from disk.
export function RecordingPicker({ channel, disabled }: { channel: ChannelId; disabled: boolean }) {
  const recordings = useAppStore((s) => s.recordings)
  const choice = useAppStore((s) => s.replayChoices[channel])
  const diskFile = useAppStore((s) => s.diskFiles[channel])
  const setReplayChoice = useAppStore((s) => s.setReplayChoice)
  const title = channel.toUpperCase()

  return (
    <div className="recording-picker">
      <label>
        {title} recording
        <select
          value={choice}
          onChange={(event) => setReplayChoice(channel, event.target.value)}
          disabled={disabled}
        >
          <option value={NO_RECORDING}>None</option>
          {recordings
            .filter((r) => r.channel === channel)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.id}
                {r.isLocal ? ' (local)' : ''} · {r.durationS} s
              </option>
            ))}
          {diskFile !== null && <option value={DISK_FILE}>{diskFile.name} (from disk)</option>}
        </select>
      </label>
      {/* One button per channel: .lvm and .xlsx files do not say which signal they contain. */}
      <OpenFileButton channel={channel} disabled={disabled} />
    </div>
  )
}

function OpenFileButton({ channel, disabled }: { channel: ChannelId; disabled: boolean }) {
  const setDiskFile = useAppStore((s) => s.setDiskFile)

  return (
    <label className={`file-button${disabled ? ' disabled' : ''}`}>
      Open {channel.toUpperCase()} file…
      <input
        type="file"
        accept=".lvm,.csv,.xlsx"
        disabled={disabled}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) setDiskFile(channel, file)
          event.target.value = '' // allows opening the same file again
        }}
      />
    </label>
  )
}
