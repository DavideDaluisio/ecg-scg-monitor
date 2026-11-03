import { useId } from 'react'
import { useAppStore, type SourceKind } from '../state/store.ts'
import { RecordingPicker } from './RecordingPicker.tsx'
import { SyntheticSettingsForm } from './SyntheticSettingsForm.tsx'

// The source panel, opened from the top bar: one recording per channel, or the synthetic ECG + SCG (its settings
// are only for tests, so they stay folded under "Advanced"). It also says what is playing (sourceInfo).
export function SourcePicker({ disabled }: { disabled: boolean }) {
  const sourceKind = useAppStore((s) => s.sourceKind)
  const sourceInfo = useAppStore((s) => s.sourceInfo)
  const setSourceKind = useAppStore((s) => s.setSourceKind)
  const selectId = useId()

  return (
    <section className="source-panel" aria-label="Source">
      {/* A grid, one row per choice, so that the ECG and SCG rows line up (label | list | buttons). The labels
          and lists are direct children of the grid, hence htmlFor/id instead of a <label> around the list. */}
      <div className="source-grid">
        <label htmlFor={selectId}>Source</label>
        <select
          id={selectId}
          value={sourceKind}
          onChange={(event) => setSourceKind(event.target.value as SourceKind)}
          disabled={disabled}
        >
          <option value="replay">Recordings</option>
          <option value="synthetic">Synthetic ECG + SCG</option>
        </select>
        {sourceKind === 'replay' && (
          <>
            <RecordingPicker channel="ecg" disabled={disabled} />
            <RecordingPicker channel="scg" disabled={disabled} />
          </>
        )}
      </div>
      {sourceKind === 'synthetic' && (
        <details className="advanced">
          <summary>Advanced</summary>
          <div className="panel-row">
            <SyntheticSettingsForm disabled={disabled} />
          </div>
        </details>
      )}
      {sourceInfo !== '' && <p className="source-info">{sourceInfo}</p>}
    </section>
  )
}
