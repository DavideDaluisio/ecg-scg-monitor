# ECG/SCG Real-Time Monitor

Web app that shows ECG and SCG signals from the NJIT wireless cardiac patch **live**, in the browser,
on a laptop or an Android phone. The model is Figure 1F of *Wireless ECG and SCG patch*
(Advanced Electronic Materials, 2023), with a single SCG channel.

**Live demo:** _GitHub Pages link, available after milestone M0_

## What it does (planned)
1. Live ECG trace (replay of a lab recording)
2. Live SCG trace
3. ECG and SCG together on the same timeline
4. Filters and heart rate
5. Recording, event markers, export to CSV/LVM for MATLAB/Python
6. Connection to the patch over Bluetooth Low Energy (BL653µ)

Progress: [docs/roadmap.md](docs/roadmap.md) · Open questions: [docs/questions-for-team.md](docs/questions-for-team.md)

## Requirements
- Chrome or Edge (desktop or Android). Bluetooth needs HTTPS or `localhost`. iPhone is not supported.

## Development
```bash
npm install
npm run dev      # http://localhost:5173
npm test
```

## Docs
- [Architecture](docs/architecture.md)
- [Data formats](docs/data-formats.md)
- [BLE protocol (draft)](docs/ble-protocol.md)
