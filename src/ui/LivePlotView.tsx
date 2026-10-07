import { useEffect, useRef } from 'react'
import type { ChannelId } from '../core/types.ts'
import { LivePlot } from '../plot/LivePlot.ts'
import { addFrameCallback } from '../plot/renderLoop.ts'
import { getChannelBuffer } from '../state/session.ts'
import { useAppStore } from '../state/store.ts'

type Props = {
  channel: ChannelId
}

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
    })

    const removeFrameCallback = addFrameCallback(() => {
      // getState() reads the store without subscribing, so this does not re-render anything.
      const { paused, windowSeconds } = useAppStore.getState()
      const channelBuffer = getChannelBuffer(channel)
      if (paused || channelBuffer === null) return // Pause freezes the display only
      plot.draw(channelBuffer.buffer, channelBuffer.fs, windowSeconds)
    })

    return () => {
      removeFrameCallback()
      plot.destroy()
    }
  }, [channel])

  return <div className="plot-area plot-live" ref={containerRef} data-testid={`plot-${channel}`} />
}
