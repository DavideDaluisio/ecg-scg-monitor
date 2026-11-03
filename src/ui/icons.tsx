import type { ReactNode } from 'react'

// Small icons for the top bar, drawn as SVG: the ▶ ⏸ characters are shown as colored emoji on Windows and Android.
// They take the text color (currentColor) and are hidden from screen readers: every button has its own label.

const SIZE = 16

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  )
}

export function PlayIcon() {
  return (
    <Svg>
      <path d="M4 2.5v11l9-5.5z" />
    </Svg>
  )
}

export function PauseIcon() {
  return (
    <Svg>
      <rect x="3.5" y="2.5" width="3" height="11" rx="0.5" />
      <rect x="9.5" y="2.5" width="3" height="11" rx="0.5" />
    </Svg>
  )
}

export function StopIcon() {
  return (
    <Svg>
      <rect x="3" y="3" width="10" height="10" rx="1" />
    </Svg>
  )
}

export function RecordIcon() {
  return (
    <Svg>
      <circle cx="8" cy="8" r="5" />
    </Svg>
  )
}

// Three sliders: "settings of the source".
export function SettingsIcon() {
  return (
    <Svg>
      <rect x="2" y="3" width="12" height="1.5" rx="0.75" />
      <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" />
      <rect x="2" y="11.5" width="12" height="1.5" rx="0.75" />
      <circle cx="5" cy="3.75" r="1.75" />
      <circle cx="11" cy="8" r="1.75" />
      <circle cx="7" cy="12.25" r="1.75" />
    </Svg>
  )
}
