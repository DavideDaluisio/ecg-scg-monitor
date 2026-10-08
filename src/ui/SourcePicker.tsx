import { useAppStore, type SourceKind } from '../state/store.ts'
import { RecordingPicker } from './RecordingPicker.tsx'
import { SyntheticSettingsForm } from './SyntheticSettingsForm.tsx'

// Chooses where the samples come from: one recording per channel, or the synthetic ECG + SCG.
export function SourcePicker({ disabled }: { disabled: boolean }) {
  const sourceKind = useAppStore((s) => s.sourceKind)
  const setSourceKind = useAppStore((s) => s.setSourceKind)

  return (
    <section className="controls" aria-label="Source">
      <label>
        Source
        <select
          value={sourceKind}
          onChange={(event) => setSourceKind(event.target.value as SourceKind)}
          disabled={disabled}
        >
          <option value="replay">Recordings</option>
          <option value="synthetic">Synthetic ECG + SCG</option>
        </select>
      </label>
      {sourceKind === 'replay' ? (
        <>
          <RecordingPicker channel="ecg" disabled={disabled} />
          <RecordingPicker channel="scg" disabled={disabled} />
        </>
      ) : (
        <SyntheticSettingsForm disabled={disabled} />
      )}
    </section>
  )
}
