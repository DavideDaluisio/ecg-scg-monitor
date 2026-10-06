# BLE protocol (DRAFT v0, not yet agreed with firmware)

Status: **proposal** written from the app side. To be reviewed with Arsh (BL653µ firmware).
Open points are tracked in `docs/questions-for-team.md`.

## GATT layout
Custom 128-bit service. UUIDs are placeholders until the firmware defines them.

| Characteristic | UUID (placeholder) | Properties | Content |
|---|---|---|---|
| Service | `a7c50000-1e5c-4d6b-9a00-000000000000` | – | ECG/SCG streaming service |
| `DATA` | `…0001` | notify | sample packets (below) |
| `CONTROL` | `…0002` | write | `0x01` start, `0x00` stop, `0x10 <u8 channel> <u16 fs>` set sample rate of one channel |
| `INFO` | `…0003` | read | format version, firmware version, and **per channel**: id, fs, gain/offset, bits |

## `DATA` packet (little-endian)
Each packet carries samples of **one channel only**. ECG and SCG may have different sample rates
(e.g. MAX30003 ≤ 512 Hz, ADXL355 up to 4 kHz), so they are not interleaved.
See `docs/decisions/0003-per-channel-sample-rate.md`.

| Offset | Field | Type | Notes |
|---|---|---|---|
| 0 | `version` | u8 | format version (`0x01`) |
| 1 | `channel` | u8 | `0` = ECG, `1` = SCG |
| 2 | `flags` | u8 | bit0 24-bit samples, bit1 lead-off (ECG only) |
| 3 | reserved | u8 | `0` |
| 4 | `seq` | u16 | packet counter **of this channel**, wraps at 65536 |
| 6 | `firstSampleIndex` | u32 | sample counter **of this channel** for the first sample (wraps after about 16.5 days at 3 kHz) |
| 10 | samples | i16 or i24 | raw ADC counts of this channel, in time order |

- The number of samples is `(packetLength − 10) / bytesPerSample`.
- Each channel counts its own samples. Index 0 of every channel must be the **same instant** (start of streaming),
  so the app can align channels with `t = index / fs`. How the firmware guarantees this (common start, common clock,
  drift between the two chips) is open question Q9.

Conversion to volts: `V = (raw − offset) × gain`, with `gain`/`offset` read from `INFO`.

## Throughput estimate
MTU 247 → 244 B notification, minus a 10 B header = 234 B of samples (117 × i16 or 78 × i24).

| Channel | fs | Bytes per sample | Sample B/s | Samples per packet | Packets/s |
|---|---|---|---|---|---|
| ECG (MAX30003-like) | 512 | 3 | 1,536 | 78 | ≈ 6.6 |
| SCG (ADXL355-like) | 3000 | 3 | 9,000 | 78 | ≈ 38.5 |
| SCG | 3000 | 2 | 6,000 | 117 | ≈ 25.6 |
| ECG or SCG | 3000 | 2 | 6,000 | 117 | ≈ 25.6 |

- ECG 512 Hz + SCG 3 kHz, both 24-bit: ≈ 10.5 kB/s (≈ 84 kbit/s), ≈ 45 packets/s.
- ECG 3 kHz + SCG 3 kHz, both 16-bit: 12 kB/s (≈ 96 kbit/s), ≈ 51 packets/s.

About 100 kbit/s of payload. That is feasible with 2M PHY + DLE + MTU 247 but
depends on the connection interval the phone accepts. The firmware should request a short interval
(7.5–15 ms) and the 2M PHY. The app cannot set these from Web Bluetooth.

## App behavior
- Lost packets are detected from `seq` and filled with NaN using `firstSampleIndex`.
- Link quality (% lost packets over the last 10 s) is shown in the UI.
- `INFO` is read once after connecting. Unknown `version` → disconnect with an error message (status `'error'`).
- Disconnect → status `'reconnecting'`, same session. After reconnecting, missed samples of **each channel**
  become `NaN`, using that channel's `seq` and `firstSampleIndex` (assumes the device counters keep running,
  see question #7). Link quality counts lost packets of all channels together. Lifecycle: `src/core/CLAUDE.md`, ADR 0002.

## Changelog
- 2026-10-06 – v0 draft created from the app side.
- 2026-10-06 – one channel per `DATA` packet (`channel` byte, per-channel `seq` and `firstSampleIndex`),
  per-channel fs in `INFO` and `CONTROL`. Header is now 10 bytes. Reason: ECG and SCG may have different fs.
