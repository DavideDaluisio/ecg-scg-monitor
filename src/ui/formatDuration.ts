/** 75.4 s → "01:15", 3725 s → "62:05" (minutes:seconds, for the REC timer and the saved-session list). */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  return `${String(minutes).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}
