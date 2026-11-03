import { useId } from 'react'
import type { ChannelId } from '../core/types.ts'
import { listLvmColumns, type LvmColumn } from '../io/lvm.ts'
import { DISK_FILE, NO_RECORDING, useAppStore } from '../state/store.ts'

// Only the header is needed to list the columns of an .lvm file: its first 64 kB, not the whole (20 MB) file.
const LVM_HEADER_BYTES = 65_536

// Chooses what one channel replays: nothing, a recording from the manifests, or a file opened from disk
// (and, for a multi-channel .lvm file, which column).
// It renders one row of the source panel's grid (label | list | buttons), so it returns the three cells, not a box.
export function RecordingPicker({ channel, disabled }: { channel: ChannelId; disabled: boolean }) {
  const recordings = useAppStore((s) => s.recordings)
  const choice = useAppStore((s) => s.replayChoices[channel])
  const diskFile = useAppStore((s) => s.diskFiles[channel])
  const setReplayChoice = useAppStore((s) => s.setReplayChoice)
  const title = channel.toUpperCase()
  const selectId = useId()

  return (
    <>
      <label htmlFor={selectId}>{title} recording</label>
      <select
        id={selectId}
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
      {/* The button comes first, so the ECG and SCG buttons stay aligned when only one shows a column list. */}
      <div className="source-actions">
        {/* One button per channel: .lvm and .xlsx files do not say which signal they contain. */}
        <OpenFileButton channel={channel} disabled={disabled} />
        {choice === DISK_FILE && <ColumnPicker channel={channel} disabled={disabled} />}
      </div>
    </>
  )
}

// Shown only for a disk file with several signals, e.g. the lab's 4-channel .lvm (ECG in B, SCG in D).
// No default column: guessing could silently play the wrong signal.
function ColumnPicker({ channel, disabled }: { channel: ChannelId; disabled: boolean }) {
  const columns = useAppStore((s) => s.diskColumns[channel])
  const columnChoice = useAppStore((s) => s.diskColumnChoices[channel])
  const setDiskColumnChoice = useAppStore((s) => s.setDiskColumnChoice)
  if (columns.length < 2) return null

  return (
    <label>
      {channel.toUpperCase()} column
      <select
        value={columnChoice ?? ''}
        onChange={(event) => setDiskColumnChoice(channel, event.target.value || null)}
        disabled={disabled}
      >
        <option value="">Choose…</option>
        {columns.map((column) => (
          <option key={column.letter} value={column.letter}>
            {column.letter} · {column.name}
          </option>
        ))}
      </select>
    </label>
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
          event.target.value = '' // allows opening the same file again
          if (file)
            void signalColumnsOf(file).then((columns) => setDiskFile(channel, file, columns))
        }}
      />
    </label>
  )
}

// The signal columns of an .lvm file (empty for other files). An unreadable header gives an empty list: the
// parser explains the problem when Start is pressed.
async function signalColumnsOf(file: File): Promise<LvmColumn[]> {
  if (!file.name.toLowerCase().endsWith('.lvm')) return []
  try {
    return listLvmColumns(await file.slice(0, LVM_HEADER_BYTES).text())
  } catch {
    return []
  }
}
