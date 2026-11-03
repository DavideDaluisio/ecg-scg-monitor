import { useAppStore } from '../state/store.ts'

// The state of the data source as a colored dot (grey idle, amber connecting/ended, green running, red error).
// The word is in the tooltip and, hidden, in the text, for screen readers and the e2e tests.
export function StatusBadge() {
  const state = useAppStore((s) => s.status.state)

  return (
    <span className={`status-dot status-${state}`} title={state}>
      <span className="visually-hidden" data-testid="status-badge">
        {state}
      </span>
    </span>
  )
}
