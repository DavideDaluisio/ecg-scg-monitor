// One shared requestAnimationFrame loop for all plots. It runs only while at least one callback is registered.

type FrameCallback = () => void

const callbacks = new Set<FrameCallback>()
let frameId: number | null = null

function onFrame(): void {
  for (const callback of callbacks) callback()
  frameId = callbacks.size > 0 ? requestAnimationFrame(onFrame) : null
}

/** Registers a function called once per frame. Returns a function that removes it. */
export function addFrameCallback(callback: FrameCallback): () => void {
  callbacks.add(callback)
  if (frameId === null) frameId = requestAnimationFrame(onFrame)
  return () => {
    callbacks.delete(callback)
    if (callbacks.size === 0 && frameId !== null) {
      cancelAnimationFrame(frameId)
      frameId = null
    }
  }
}
