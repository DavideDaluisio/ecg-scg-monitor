// Shows the state of the data source (idle, running, error...).
// The type will come from src/core/types.ts (SourceState) in M1.
type Props = {
  state: 'idle' | 'connecting' | 'running' | 'reconnecting' | 'ended' | 'error'
}

export function StatusBadge({ state }: Props) {
  return (
    <span className={`status-badge status-${state}`} data-testid="status-badge">
      {state}
    </span>
  )
}
