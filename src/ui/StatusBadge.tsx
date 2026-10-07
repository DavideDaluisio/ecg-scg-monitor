import { useAppStore } from '../state/store.ts'

// Shows the state of the data source (idle, running, error...) and whether the display is paused.
export function StatusBadge() {
  const state = useAppStore((s) => s.status.state)
  const paused = useAppStore((s) => s.paused)

  return (
    <div className="status">
      {paused && state === 'running' && <span className="paused-note">display paused</span>}
      <span className={`status-badge status-${state}`} data-testid="status-badge">
        {state}
      </span>
    </div>
  )
}
