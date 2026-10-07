import type { ChannelId } from '../core/types.ts'
import { LivePlotView } from './LivePlotView.tsx'

// One signal panel (ECG or SCG). `live` panels show the uPlot chart; the others a placeholder.
type Props = {
  title: string
  unit: string
  channel: ChannelId
  live: boolean
  placeholder?: string
}

export function ChannelPanel({ title, unit, channel, live, placeholder }: Props) {
  return (
    <section className="channel-panel" aria-label={`${title} panel`}>
      <h2>
        {title} <span className="unit">({unit})</span>
      </h2>
      {live ? (
        <LivePlotView channel={channel} />
      ) : (
        <div className="plot-area">
          <p className="placeholder">{placeholder ?? 'No signal yet'}</p>
        </div>
      )}
    </section>
  )
}
