// One signal panel (ECG or SCG). In M1 the uPlot chart from src/plot/ is mounted inside it.
type Props = {
  title: string
  unit: string
}

export function ChannelPanel({ title, unit }: Props) {
  return (
    <section className="channel-panel" aria-label={`${title} panel`}>
      <h2>
        {title} <span className="unit">({unit})</span>
      </h2>
      <div className="plot-area">
        <p className="placeholder">No signal yet</p>
      </div>
    </section>
  )
}
