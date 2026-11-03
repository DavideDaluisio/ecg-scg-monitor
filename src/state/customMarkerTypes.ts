// The marker types the user created (each one becomes a button next to the presets), remembered in this browser.
// localStorage can be missing or blocked (private window, site data cleared, tests in Node): then the list is
// simply not remembered after a reload. Only names of events are stored here, never samples.
const STORAGE_KEY = 'ecg-scg-monitor.customMarkerTypes'

export function loadCustomMarkerTypes(): string[] {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function saveCustomMarkerTypes(types: readonly string[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(types))
  } catch {
    // Not remembered: the buttons still work until the page is reloaded.
  }
}
