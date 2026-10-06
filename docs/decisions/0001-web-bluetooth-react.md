# ADR 0001 – Web app with Web Bluetooth, React + TypeScript + Vite

Date: 2026-10-06 · Status: accepted

## Context
We need live ECG/SCG plots on both a laptop and a phone, received over BLE from the patch (BL653µ).
Hardware is not available yet, so most development happens on simulated data. The project is built
almost entirely with Claude Code by a developer who is new to TypeScript/React.

## Decision
A single web app (PWA) in React + TypeScript + Vite, using the Web Bluetooth API and deployed on GitHub Pages.

## Consequences
- One codebase for laptop and Android, nothing to install, a link to share at meetings.
- Works only in Chromium browsers (Chrome/Edge). **No iPhone/iOS support** (Safari has no Web Bluetooth).
  If iOS becomes a requirement, the core/dsp/io modules can be reused in a Capacitor or React Native app.
- The page cannot control MTU, PHY or connection interval. The firmware must request them.
- Needs HTTPS (GitHub Pages) or localhost.

## Alternatives considered
- Python desktop app (bleak + pyqtgraph): laptop only.
- Native/Flutter mobile app: iOS support, but slower to build and harder to demo.
