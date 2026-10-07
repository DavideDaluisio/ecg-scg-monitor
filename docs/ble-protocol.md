# BLE protocol (DRAFT v0, not agreed with firmware)

Status: **proposal from the app side**, to be reviewed with Arsh (BL653µ firmware). Needed only in M5.
Open points: `docs/questions-for-team.md`.

## GATT layout

Custom 128-bit service. UUIDs are placeholders until the firmware defines them.

| Characteristic | UUID (placeholder)                     | Properties | Content                                                                   |
| -------------- | -------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| Service        | `a7c50000-1e5c-4d6b-9a00-000000000000` | –          | ECG/SCG streaming service                                                 |
| `DATA`         | `…0001`                                | notify     | sample packets (below)                                                    |
| `CONTROL`      | `…0002`                                | write      | `0x01` start, `0x00` stop                                                 |
| `INFO`         | `…0003`                                | read       | format version, firmware version, per channel: id, fs, gain, offset, bits |

## `DATA` packet (little-endian), one channel per packet

| Offset | Field              | Type       | Notes                                               |
| ------ | ------------------ | ---------- | --------------------------------------------------- |
| 0      | `version`          | u8         | `0x01`                                              |
| 1      | `channel`          | u8         | `0` = ECG, `1` = SCG                                |
| 2      | `flags`            | u8         | bit0 = 24-bit samples, bit1 = lead-off (ECG)        |
| 3      | reserved           | u8         | `0`                                                 |
| 4      | `seq`              | u16        | packet counter of this channel, wraps at 65536      |
| 6      | `firstSampleIndex` | u32        | sample counter of this channel for the first sample |
| 10     | samples            | i16 or i24 | raw ADC counts, in time order                       |

Number of samples = `(length − 10) / bytesPerSample`. Volts = `(raw − offset) × gain` (from `INFO`).
Index 0 of every channel must be the same instant (start of streaming).

## Throughput

MTU 247 → 244 B per notification − 10 B header = 234 B (117 × i16 or 78 × i24).
ECG + SCG at 3 kHz, 16-bit: 12 kB/s (≈ 96 kbit/s), ≈ 51 packets/s. Feasible with 2M PHY, data length extension,
MTU 247 and a short connection interval (7.5–15 ms), which the **firmware** must request (Web Bluetooth cannot).

## App behavior

- Lost packets are detected from `seq` and filled with `NaN` using `firstSampleIndex`.
- Link quality (% lost packets, last 10 s) is shown in the UI.
- Unknown `version` → disconnect with an error message.

## Changelog

- 2026-10-06 – v0 draft from the app side.
