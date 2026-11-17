import { useEffect, useRef } from 'react'
import type { PqrstBeat, WavePoint } from '../analysis/pqrstPoints.ts'
import type { ChannelId } from '../core/types.ts'
import { LivePlot } from '../plot/LivePlot.ts'
import { visibleWindowStart } from '../plot/plotPoints.ts'
import { addFrameCallback } from '../plot/renderLoop.ts'
import {
  getChannelBuffer,
  getEcgBeats,
  getPlotMarkers,
  getPlotMarkersVersion,
  getScgAoPoints,
  getSessionEndSeconds,
} from '../state/session.ts'
import { useAppStore } from '../state/store.ts'

type Props = {
  channel: ChannelId
}

// The P, Q, R, S, T symbols are drawn on the ECG panel only, the AO symbols on the SCG panel only.
const NO_BEATS: readonly PqrstBeat[] = []
const NO_AO_POINTS: readonly WavePoint[] = []

// Mounts the uPlot chart once. From then on the render loop draws it directly, without React re-renders.
export function LivePlotView({ channel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    // Canvas cannot read CSS variables, so the theme colors are read once here.
    const css = getComputedStyle(document.documentElement)
    const plot = new LivePlot(container, {
      color: css.getPropertyValue(`--${channel}`).trim(),
      axisColor: css.getPropertyValue('--muted').trim(),
      gridColor: css.getPropertyValue('--border').trim(),
      markerColor: css.getPropertyValue('--marker').trim(),
      symbolColor: css.getPropertyValue('--symbol').trim(),
    })

    const removeFrameCallback = addFrameCallback(() => {
      // getState() reads the store without subscribing, so this does not re-render anything.
      const { paused, windowSeconds, showPqrst, showAo } = useAppStore.getState()
      // Before the pause check: the "Show PQRST" / "Show AO" checkbox also works on a frozen plot.
      plot.setSymbolsVisible(channel === 'ecg' ? showPqrst : showAo)
      const channelBuffer = getChannelBuffer(channel)
      // Pause freezes the display only. Every panel reads the same flag in the same frame, so they freeze together.
      if (paused || channelBuffer === null) return
      // Every panel shows the same time window, so ECG and SCG line up in seconds (shared X axis).
      const windowStartS = visibleWindowStart(getSessionEndSeconds(), windowSeconds)
      plot.draw(
        channelBuffer.buffer,
        channelBuffer.fs,
        windowStartS,
        windowSeconds,
        getPlotMarkers(),
        getPlotMarkersVersion(),
        channel === 'ecg' ? getEcgBeats() : NO_BEATS,
        channel === 'scg' ? getScgAoPoints() : NO_AO_POINTS,
      )
    })

    return () => {
      removeFrameCallback()
      plot.destroy()
    }
  }, [channel])

  return <div className="plot-area plot-live" ref={containerRef} data-testid={`plot-${channel}`} />
}
