# src/ble – Web Bluetooth

## Source of truth
The packet format and GATT layout are defined in `docs/ble-protocol.md`. That document, `decoder.ts`,
`encoder.ts` (test helper) and their tests must always change **together**. Use the skill `ble-protocol`.
The protocol is still a **draft** until confirmed with Arsh (firmware). Open points: `docs/questions-for-team.md`.

## Web Bluetooth rules
- Works only in Chrome/Edge (desktop, Android), on **HTTPS or localhost**. Not on iOS.
- `navigator.bluetooth.requestDevice()` must be called from a **user gesture** (button click).
- Filter by the custom service UUID. Request the service in `optionalServices` if filtering by name.
- Subscribe to `DATA` with `startNotifications()` and listen to `characteristicvaluechanged`.
  Copy the `DataView` contents immediately because the browser may reuse the buffer.
- The browser chooses MTU/connection interval. The app cannot set them, so the firmware must request DLE / 2M PHY.
- Handle `gattserverdisconnected`: set the source status to `'reconnecting'` and try to reconnect with backoff
  (max 5 attempts), then `'running'` or `'error'`. Lifecycle: `src/core/CLAUDE.md`.

## Decoder rules
- Each `DATA` packet carries **one channel** with its own `seq` and `firstSampleIndex` (channels may have different fs).
- Track `seq` **per channel** (u16, wraps at 65536). Count lost packets and expose a link-quality metric (% lost).
- Use `firstSampleIndex` from the packet to place samples. Fill gaps with `NaN` so the timeline stays continuous.
- Per-channel fs comes from `INFO`.
- Convert raw ADC counts to volts using gain/offset from the `INFO` characteristic, never hard-coded.
- Feature-detect: if `navigator.bluetooth` is missing, the BLE option is disabled with an explanation.
