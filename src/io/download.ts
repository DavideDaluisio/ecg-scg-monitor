// Saves data as a file on the user's disk (the browser's normal download). Nothing is uploaded.

/** `parts` (texts or Blobs) are joined in the file, so a large export never has to be one string. */
export function downloadFile(fileName: string, parts: BlobPart[], type = 'text/csv'): void {
  const url = URL.createObjectURL(new Blob(parts, { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // The download has started from the URL; give the browser a moment before releasing the data.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
