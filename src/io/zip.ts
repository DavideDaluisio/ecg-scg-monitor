// Zips files into one Blob (an .xlsx is a zip of XML files). The files arrive as text parts, and each part is
// compressed as soon as it is read: a long recording never sits in memory as one huge text.
// fflate is downloaded only when something is exported, not when the app loads.

/** One file of the zip: its path inside the zip and its text, in parts. */
export interface ZipEntry {
  path: string
  parts: Iterable<string>
}

/**
 * The zip of `entries`, as a Blob of type `type`. `pause` is awaited after every part: the caller uses it to let
 * the browser draw the plots and run the source while a long export is built (principle 7).
 */
export async function zipToBlob(
  entries: readonly ZipEntry[],
  type: string,
  pause: () => Promise<void> = () => Promise.resolve(),
): Promise<Blob> {
  const { Zip, ZipDeflate } = await import('fflate')
  const output: Blob[] = []
  const errors: Error[] = []
  // fflate calls this with each piece of the zip as soon as it is ready. In its own Blob, a piece leaves JavaScript
  // memory (the browser may even keep it on disk).
  const zip = new Zip((error, data) => {
    if (error !== null) errors.push(error)
    else output.push(new Blob([data as Uint8Array<ArrayBuffer>]))
  })
  const encoder = new TextEncoder()

  for (const entry of entries) {
    // Level 3: measured on 5 min of ECG + SCG at 3 kHz (148 MB of XML), about half the time of the default level 6
    // for a file only ~3 % larger.
    const file = new ZipDeflate(entry.path, { level: 3 })
    zip.add(file)
    for (const part of entry.parts) {
      file.push(encoder.encode(part))
      if (errors.length > 0) throw errors[0]
      await pause()
    }
    file.push(new Uint8Array(0), true) // end of this file
  }
  zip.end()
  if (errors.length > 0) throw errors[0]
  return new Blob(output, { type })
}
