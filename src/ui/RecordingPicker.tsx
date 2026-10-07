import { DISK_FILE, useAppStore } from '../state/store.ts'

// Chooses what to replay: an ECG recording from the manifests, or a .lvm file opened from disk.
export function RecordingPicker({ disabled }: { disabled: boolean }) {
  const recordings = useAppStore((s) => s.recordings)
  const selectedId = useAppStore((s) => s.selectedId)
  const diskFile = useAppStore((s) => s.diskFile)
  const selectRecording = useAppStore((s) => s.selectRecording)
  const setDiskFile = useAppStore((s) => s.setDiskFile)

  // M1 shows ECG only; SCG recordings appear with the SCG panel (M2).
  const ecgRecordings = recordings.filter((r) => r.channel === 'ecg')

  return (
    <>
      <label>
        Recording
        <select
          value={selectedId}
          onChange={(event) => selectRecording(event.target.value)}
          disabled={disabled}
        >
          {ecgRecordings.length === 0 && diskFile === null && <option value="">No recordings</option>}
          {ecgRecordings.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id}
              {r.isLocal ? ' (local)' : ''} · {r.durationS} s
            </option>
          ))}
          {diskFile !== null && <option value={DISK_FILE}>{diskFile.name} (from disk)</option>}
        </select>
      </label>
      <label className={`file-button${disabled ? ' disabled' : ''}`}>
        Open file…
        <input
          type="file"
          accept=".lvm"
          disabled={disabled}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) setDiskFile(file)
            event.target.value = '' // allows opening the same file again
          }}
        />
      </label>
    </>
  )
}
