# src/recording – saved sessions (IndexedDB) and markers

A **saved session** is the part of a live session between _Record_ and _Stop recording_ (also stopped by Stop,
or when the source ends or fails). Layout of the database and of the export: `docs/data-formats.md`.

## Rules

- **Raw is sacred.** The recorder stores the samples exactly as the source emitted them (Float32, volts).
  No filtering, no resampling. A missing sample is stored as `NaN`, never skipped (`ChannelChunker` fills gaps
  like `RingBuffer.push` does), so the sample index stays continuous.
- **Indices are never re-based.** Each channel records from its own `endIndex` at the moment Record is pressed,
  and stores the live session's sample index (`firstSampleIndex`). `t = index / fs` is the same instant on every
  channel, also with different fs.
- **Hot path:** `Recorder.push()` is called for every block. It only copies samples into the current chunk
  (`chunker.ts`); IndexedDB is written once per full chunk (1 s per channel), on one promise chain, in order.
- **No samples lost at the start:** the `Recorder` is created synchronously when Record is pressed and gets the
  database as a promise; blocks that arrive before the session is stored wait in the chain.
- Each chunk is stored **with** the updated session description in one transaction: if the tab is closed while
  recording, the session stays `status: 'recording'` (shown as "interrupted") and is still exportable.
- **Markers** exist only while recording (UI rule). A marker is `{ channel, sampleIndex, label }` on the reference
  channel (`referenceChannel()`: highest fs, ECG if equal), placed on the newest sample received when clicked,
  never before the recording start. Labels are cleaned (`cleanMarkerLabel()`): no line breaks.
- **Renaming a marker** changes only its `label` (index in `session.markers` = its number in the lists). While
  recording it must go through `Recorder.renameMarker()`: every chunk rewrites the stored session from the
  recorder's copy, so a label changed directly in IndexedDB would be overwritten. After the recording,
  `renameSavedMarker()` (`db.ts`) reads and writes the session in one transaction. Markers are never removed.
- **Privacy:** saved sessions stay in this browser's IndexedDB. Names are date and time only
  (`savedSessionName()`), never a person's name.
- `db.ts` functions take the database as an argument: tests open their own with `fake-indexeddb`
  (`import 'fake-indexeddb/auto'`, one database name per test). The app uses `getAppDb()`.
- Changing `SavedSession` or the stores needs a new `DB_VERSION` with an upgrade step, and an update of
  `docs/data-formats.md`.

## Files

| File             | What it does                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`       | `Marker`, `SavedChannel`, `SavedSession`, `SampleChunk`                                                                                                                                                                         |
| `chunker.ts`     | `ChannelChunker`: cuts one channel into fixed-length chunks (pure, tested)                                                                                                                                                      |
| `recorder.ts`    | `Recorder`: one chunker per channel, writes chunks and markers (add, rename) to IndexedDB                                                                                                                                       |
| `db.ts`          | `idb` schema and functions: create, save chunk, list, load channel, rename a marker, delete                                                                                                                                     |
| `markers.ts`     | `MARKER_PRESETS` (placeholder, Q8), `referenceChannel()`, `cleanMarkerLabel()`, time since Record (`recordingZeroSeconds()`, `markerRecordingTimeS()`), user marker types (`addCustomMarkerType()`, `removeCustomMarkerType()`) |
| `sessionName.ts` | `savedSessionName()`: `session_YYYY-MM-DD_HH-MM-SS` (local time), also the export name                                                                                                                                          |
