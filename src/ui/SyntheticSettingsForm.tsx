import { HEART_RATE_RANGE_BPM, R_TO_AO_RANGE_S } from '../sources/SyntheticSource.ts'
import { useAppStore } from '../state/store.ts'

const SAMPLE_RATES_HZ = [250, 500, 1000, 2000, 3000]

// Settings of the synthetic ECG + SCG. Out-of-range values are rejected with a message when Start is pressed.
export function SyntheticSettingsForm({ disabled }: { disabled: boolean }) {
  const settings = useAppStore((s) => s.syntheticSettings)
  const setSyntheticSettings = useAppStore((s) => s.setSyntheticSettings)

  return (
    <>
      <label>
        HR (bpm)
        <input
          type="number"
          className="number-input"
          min={HEART_RATE_RANGE_BPM.min}
          max={HEART_RATE_RANGE_BPM.max}
          value={settings.heartRateBpm}
          disabled={disabled}
          onChange={(event) => setSyntheticSettings({ heartRateBpm: Number(event.target.value) })}
        />
      </label>
      <label>
        R→AO (ms)
        <input
          type="number"
          className="number-input"
          min={R_TO_AO_RANGE_S.min * 1000}
          max={R_TO_AO_RANGE_S.max * 1000}
          value={settings.rToAoMs}
          disabled={disabled}
          onChange={(event) => setSyntheticSettings({ rToAoMs: Number(event.target.value) })}
        />
      </label>
      <SampleRateSelect
        label="ECG fs"
        value={settings.ecgFs}
        disabled={disabled}
        onChange={(ecgFs) => setSyntheticSettings({ ecgFs })}
      />
      <SampleRateSelect
        label="SCG fs"
        value={settings.scgFs}
        disabled={disabled}
        onChange={(scgFs) => setSyntheticSettings({ scgFs })}
      />
      <label>
        <input
          type="checkbox"
          checked={settings.noise}
          disabled={disabled}
          onChange={(event) => setSyntheticSettings({ noise: event.target.checked })}
        />
        Noise
      </label>
    </>
  )
}

function SampleRateSelect(props: {
  label: string
  value: number
  disabled: boolean
  onChange: (fs: number) => void
}) {
  return (
    <label>
      {props.label}
      <select
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(Number(event.target.value))}
      >
        {SAMPLE_RATES_HZ.map((fs) => (
          <option key={fs} value={fs}>
            {fs} Hz
          </option>
        ))}
      </select>
    </label>
  )
}
