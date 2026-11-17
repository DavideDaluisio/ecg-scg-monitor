import type { ChannelId } from '../core/types.ts'
import { useAppStore } from '../state/store.ts'
import { LivePlotView } from './LivePlotView.tsx'

const CHANNEL_TITLES: Record<ChannelId, string> = { ecg: 'ECG', scg: 'SCG' }

// One signal panel, the same for every channel. It shows the live plot only when the session has this channel:
// otherwise a placeholder, so an old trace never stays frozen next to the signal that is playing.
export function ChannelPanel({ channel }: { channel: ChannelId }) {
  const sessionChannels = useAppStore((s) => s.sessionChannels)
  const title = CHANNEL_TITLES[channel]
  const hasSignal = sessionChannels.includes(channel)

  let placeholder = 'No signal yet'
  if (sessionChannels.length > 0) placeholder = `No ${title} signal in this recording`

  return (
    <section className="channel-panel" aria-label={`${title} panel`}>
      <div className="panel-header">
        <h2>
          {title} <span className="unit">(mV)</span>
        </h2>
        {/* The P, Q, R, S, T symbols exist only on the ECG and the AO only on the SCG: each checkbox is shown
            only when its signal plays. */}
        {channel === 'ecg' && hasSignal && <PqrstCheckbox />}
        {channel === 'scg' && hasSignal && <AoCheckbox />}
      </div>
      {hasSignal ? (
        <LivePlotView channel={channel} />
      ) : (
        <div className="plot-area" data-testid={`placeholder-${channel}`}>
          <p className="placeholder">{placeholder}</p>
        </div>
      )}
    </section>
  )
}

// Shows or hides the P, Q, R, S, T symbols on the ECG plot (display only: nothing changes in recordings or
// exports). It also works on a paused plot, because the render loop reads the flag before its pause check.
function PqrstCheckbox() {
  const showPqrst = useAppStore((s) => s.showPqrst)
  const setShowPqrst = useAppStore((s) => s.setShowPqrst)

  return (
    <label className="panel-option" title="Show the P, Q, R, S, T points detected on the ECG">
      <input
        type="checkbox"
        checked={showPqrst}
        onChange={(event) => setShowPqrst(event.target.checked)}
      />
      Show PQRST
    </label>
  )
}

// Shows or hides the AO (aortic opening) symbols on the SCG plot (display only, like PQRST). The AO is searched after
// each R peak of the ECG, so it needs an ECG recorded at the same time: otherwise the checkbox is disabled and says why.
function AoCheckbox() {
  const showAo = useAppStore((s) => s.showAo)
  const setShowAo = useAppStore((s) => s.setShowAo)
  const sessionChannels = useAppStore((s) => s.sessionChannels)
  const notSimultaneous = useAppStore((s) => s.notSimultaneous)
  // The same condition as in session.ts, where the AO tracker is created.
  const available = sessionChannels.includes('ecg') && !notSimultaneous

  return (
    <label
      className={available ? 'panel-option' : 'panel-option disabled'}
      title={
        available
          ? 'Show the AO (aortic opening) peaks detected on the SCG after each ECG R peak'
          : 'AO needs an ECG recorded at the same time as the SCG'
      }
    >
      <input
        type="checkbox"
        checked={available && showAo}
        disabled={!available}
        onChange={(event) => setShowAo(event.target.checked)}
      />
      Show AO
    </label>
  )
}
