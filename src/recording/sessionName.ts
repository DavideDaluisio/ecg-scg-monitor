// Saved sessions are named after the local date and time of Record, never after a person (data privacy rule).

/** e.g. "session_2026-10-08_15-04-05": also the export file name, so no characters a file system rejects. */
export function savedSessionName(recordedAt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${recordedAt.getFullYear()}-${pad(recordedAt.getMonth() + 1)}-${pad(recordedAt.getDate())}`
  const time = `${pad(recordedAt.getHours())}-${pad(recordedAt.getMinutes())}-${pad(recordedAt.getSeconds())}`
  return `session_${date}_${time}`
}
