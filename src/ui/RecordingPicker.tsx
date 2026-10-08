import type { ChannelId } from '../core/types.ts'
import { DISK_FILE, useAppStore } from '../state/store.ts'

// Chooses what to replay: a recording from the manifests, or a file opened from disk.
export function RecordingPicker({ disabled }: { disabled: boolean }) {
  const recordings = useAppStore((s) => s.recordings)
  const selectedId = useAppStore((s) => s.selectedId)
  const diskFile = useAppStore((s) => s.diskFile)
  const selectRecording = useAppStore((s) => s.selectRecording)

  return (
    <>
      <label>
        Recording
        <select
          value={selectedId}
          onChange={(event) => selectRecording(event.target.value)}
          disabled={disabled}
        >
          {recordings.length === 0 && diskFile === null && <option value="">No recordings</option>}
          {recordings.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id}
              {r.isLocal ? ' (local)' : ''} · {r.channel.toUpperCase()} · {r.durationS} s
            </option>
          ))}
          {diskFile !== null && (
            <option value={DISK_FILE}>
              {diskFile.file.name} ({diskFile.channel.toUpperCase()}, from disk)
            </option>
          )}
        </select>
      </label>
      {/* One button per channel: .lvm and .xlsx files do not say which signal they contain. */}
      <OpenFileButton channel="ecg" disabled={disabled} />
      <OpenFileButton channel="scg" disabled={disabled} />
    </>
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
          if (file) setDiskFile(file, channel)
          event.target.value = '' // allows opening the same file again
        }}
      />
    </label>
  )
}
