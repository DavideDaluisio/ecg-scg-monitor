import type { ChannelId } from '../core/types.ts'
import { useAppStore } from '../state/store.ts'
import { LivePlotView } from './LivePlotView.tsx'

const CHANNEL_TITLES: Record<ChannelId, string> = { ecg: 'ECG', scg: 'SCG' }

// One signal panel, the same for every channel. It shows the live plot only when the session has this channel:
// otherwise a placeholder, so an old trace never stays frozen next to the signal that is playing.
export function ChannelPanel({ channel }: { channel: ChannelId }) {
  const sessionChannels = useAppStore((s) => s.sessionChannels)
  const title = CHANNEL_TITLES[channel]

  let placeholder = 'No signal yet'
  if (sessionChannels.length > 0) placeholder = `No ${title} signal in this recording`

  return (
    <section className="channel-panel" aria-label={`${title} panel`}>
      <h2>
        {title} <span className="unit">(mV)</span>
      </h2>
      {sessionChannels.includes(channel) ? (
        <LivePlotView channel={channel} />
      ) : (
        <div className="plot-area" data-testid={`placeholder-${channel}`}>
          <p className="placeholder">{placeholder}</p>
        </div>
      )}
    </section>
  )
}
