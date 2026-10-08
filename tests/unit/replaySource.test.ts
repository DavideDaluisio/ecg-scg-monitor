import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SampleBlock, SourceState } from '../../src/core/types.ts'
import { parseLvm } from '../../src/io/lvm.ts'
import { ReplaySource } from '../../src/sources/ReplaySource.ts'

// 2 s of synthetic ECG at 3000 Hz (6,000 samples).
const { fs, samples } = parseLvm(
  readFileSync(new URL('../fixtures/ecg_synthetic.lvm', import.meta.url), 'utf8'),
)

// With fake timers, Date.now() advances together with the timers, so it is used as the pacing clock.
function makeReplay(loop = true): ReplaySource {
  return new ReplaySource({
    name: 'test',
    channel: 'ecg',
    fs,
    samples,
    loop,
    now: () => Date.now(),
  })
}

function collectBlocks(replay: ReplaySource): SampleBlock[] {
  const blocks: SampleBlock[] = []
  replay.onBlock((block) => blocks.push(block))
  return blocks
}

function totalSamples(blocks: SampleBlock[]): number {
  return blocks.reduce((sum, block) => sum + block.samples.length, 0)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ReplaySource', () => {
  it('declares its channel with the fs of the file', () => {
    expect(makeReplay().channels).toEqual([{ id: 'ecg', fs: 3000 }])
  })

  it('emits real-time pacing: 10 s of time = 30,000 samples (±1 tick)', async () => {
    const replay = makeReplay()
    const blocks = collectBlocks(replay)
    await replay.start()
    vi.advanceTimersByTime(10_000)
    expect(Math.abs(totalSamples(blocks) - 30_000)).toBeLessThanOrEqual(60)
    replay.stop()
  })

  it('compensates timer drift: late ticks emit more samples', async () => {
    const replay = makeReplay()
    const blocks = collectBlocks(replay)
    await replay.start()
    // The clock runs 0.5 s ahead of the timers (e.g. a busy main thread delayed them).
    vi.setSystemTime(Date.now() + 500)
    vi.advanceTimersByTime(1000)
    expect(Math.abs(totalSamples(blocks) - 4500)).toBeLessThanOrEqual(60)
    replay.stop()
  })

  it('keeps firstSampleIndex continuous and increases seq by 1, also across loops', async () => {
    const replay = makeReplay()
    const blocks = collectBlocks(replay)
    await replay.start()
    vi.advanceTimersByTime(5000) // 2.5 loops of the 2 s file

    expect(blocks[0].firstSampleIndex).toBe(0)
    expect(blocks[0].seq).toBe(0)
    for (let i = 1; i < blocks.length; i++) {
      const previous = blocks[i - 1]
      expect(blocks[i].firstSampleIndex).toBe(previous.firstSampleIndex + previous.samples.length)
      expect(blocks[i].seq).toBe(previous.seq + 1)
    }
    replay.stop()
  })

  it('loops: sample index 6000 is sample 0 of the file again', async () => {
    const replay = makeReplay()
    const blocks = collectBlocks(replay)
    await replay.start()
    vi.advanceTimersByTime(2500)

    const loopBlock = blocks.find((block) => block.firstSampleIndex === 6000)
    expect(loopBlock).toBeDefined() // a block starts exactly at the loop point
    expect(loopBlock!.samples[0]).toBe(samples[0])
    for (const block of blocks) {
      expect(block.channel).toBe('ecg')
      expect(block.fs).toBe(3000)
    }
    replay.stop()
  })

  it('without loop, emits the file once and ends', async () => {
    const replay = makeReplay(false)
    const blocks = collectBlocks(replay)
    const states: SourceState[] = []
    replay.onStatus((status) => states.push(status.state))
    await replay.start()
    vi.advanceTimersByTime(5000)

    expect(totalSamples(blocks)).toBe(6000)
    expect(replay.status.state).toBe('ended')
    expect(states).toEqual(['connecting', 'running', 'ended'])
  })

  it('emits at most 1 s per tick after a long pause (background tab) and continues from there', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const replay = makeReplay()
    const blocks = collectBlocks(replay)
    await replay.start()
    vi.advanceTimersByTime(1000)
    const beforeJump = totalSamples(blocks)

    vi.setSystemTime(Date.now() + 5000) // the tab was hidden for 5 s
    vi.advanceTimersByTime(20) // one tick
    expect(totalSamples(blocks) - beforeJump).toBeLessThanOrEqual(3000)
    expect(info).toHaveBeenCalledOnce()

    // Afterwards the pacing is normal again (no catching up the skipped 4 s).
    const afterJump = totalSamples(blocks)
    vi.advanceTimersByTime(1000)
    expect(Math.abs(totalSamples(blocks) - afterJump - 3000)).toBeLessThanOrEqual(60)
    replay.stop()
    info.mockRestore()
  })

  it('goes idle → connecting → running → idle', async () => {
    const replay = makeReplay()
    const states: SourceState[] = []
    replay.onStatus((status) => states.push(status.state))
    expect(replay.status.state).toBe('idle')
    await replay.start()
    expect(replay.status.state).toBe('running')
    replay.stop()
    expect(states).toEqual(['connecting', 'running', 'idle'])
  })

  it('ignores start() while running', async () => {
    const replay = makeReplay()
    const states: SourceState[] = []
    replay.onStatus((status) => states.push(status.state))
    await replay.start()
    await replay.start()
    expect(states).toEqual(['connecting', 'running'])
    replay.stop()
  })

  it('stop() is idempotent and no blocks arrive after it', async () => {
    const replay = makeReplay()
    const blocks = collectBlocks(replay)
    const states: SourceState[] = []
    replay.onStatus((status) => states.push(status.state))
    await replay.start()
    vi.advanceTimersByTime(500)
    replay.stop()
    replay.stop()
    const count = blocks.length
    vi.advanceTimersByTime(5000)
    expect(blocks.length).toBe(count)
    expect(states.filter((state) => state === 'idle')).toHaveLength(1)
  })

  it('a listener can call stop() during a tick: no more blocks after that', async () => {
    const replay = makeReplay()
    let received = 0
    replay.onBlock(() => {
      received++
      replay.stop()
    })
    await replay.start()
    vi.advanceTimersByTime(5000)
    expect(received).toBe(1)
  })

  it('restarts the sample index and seq at 0 on every start()', async () => {
    const replay = makeReplay()
    const blocks = collectBlocks(replay)
    await replay.start()
    vi.advanceTimersByTime(1000)
    replay.stop()
    blocks.length = 0
    await replay.start()
    vi.advanceTimersByTime(100)
    expect(blocks[0].firstSampleIndex).toBe(0)
    expect(blocks[0].seq).toBe(0)
    replay.stop()
  })

  it('unsubscribe stops the callbacks', async () => {
    const replay = makeReplay()
    const callback = vi.fn()
    const unsubscribe = replay.onBlock(callback)
    unsubscribe()
    await replay.start()
    vi.advanceTimersByTime(1000)
    expect(callback).not.toHaveBeenCalled()
    replay.stop()
  })
})
