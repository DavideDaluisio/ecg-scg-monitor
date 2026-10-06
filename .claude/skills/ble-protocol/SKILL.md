---
name: ble-protocol
description: Change the BLE GATT layout or DATA packet format of the ECG/SCG patch, keeping docs/ble-protocol.md, the decoder, the test encoder and tests in lockstep. Use whenever packet fields, UUIDs, sample encoding or rates change, or when firmware details arrive from Arsh.
---

# Change the BLE protocol

Read `src/ble/CLAUDE.md` and `docs/ble-protocol.md` first.

1. Edit `docs/ble-protocol.md` first:
   - update the field table and UUIDs
   - bump the `version` byte if the layout changed
   - add an entry to its changelog with the date and the reason (e.g. "confirmed with Arsh: 24-bit ECG samples")
2. Update `src/ble/decoder.ts` to match. Support the previous version too if a device with old firmware may still exist.
3. Update `src/ble/encoder.ts` (test-only helper used by `SyntheticSource` packetized mode).
4. Tests in `tests/unit/bleDecoder.test.ts`:
   - encode → decode round trip is equal (within quantization)
   - `seq` wrap-around at 65535 → 0
   - lost packets produce NaN gaps of the right length and the loss counter increases
   - wrong `version` gives a clear error, not garbage data
5. Recompute the throughput estimate in the doc (per channel: fs × bytes per sample, packets per second at the chosen payload; then the total).
6. If anything is still unknown, add it to `docs/questions-for-team.md`.
7. Run `npm test`. Ask the `ble-integration-reviewer` agent to check the result.
