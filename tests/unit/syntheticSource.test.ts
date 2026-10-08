import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SampleBlock, SourceState } from '../../src/core/types.ts'
import { SyntheticSource, type SyntheticOptions } from '../../src/sources/SyntheticSource.ts'
import { ecgAt, scgAt } from '../../src/sources/syntheticSignals.ts'

// With fake timers, Date.now() advances together with the timers, so it is used as the pacing clock.
function makeSource(options: Partial<SyntheticOptions> = {}): SyntheticSource {
  return new SyntheticSource({
    heartRateBpm: 72,
    rToAoS: 0.08,
    ecgFs: 3000,
    scgFs: 3000,
    now: () => Date.now(),
    ...options,
  })
}

function collectBlocks(source: SyntheticSource): SampleBlock[] {
  const blocks: SampleBlock[] = []
  source.onBlock((block) => blocks.push(block))
  return blocks
}

function blocksOf(blocks: SampleBlock[], channel: string): SampleBlock[] {
  return blocks.filter((block) => block.channel === channel)
}

function totalSamples(blocks: SampleBlock[]): number {
  return blocks.reduce((sum, block) => sum + block.samples.length, 0)
}

// All the samples of one channel, in order.
function joinSamples(blocks: SampleBlock[]): number[] {
  return blocks.flatMap((block) => Array.from(block.samples))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SyntheticSource', () => {
  it('declares ECG and SCG with their own fs', () => {
    expect(makeSource({ ecgFs: 500, scgFs: 3000 }).channels).toEqual([
      { id: 'ecg', fs: 500 },
      { id: 'scg', fs: 3000 },
    ])
  })

  it('emits real-time pacing: 10 s = 30,000 samples per channel (±1 tick)', async () => {
    const source = makeSource()
    const blocks = collectBlocks(source)
    await source.start()
    vi.advanceTimersByTime(10_000)
    expect(Math.abs(totalSamples(blocksOf(blocks, 'ecg')) - 30_000)).toBeLessThanOrEqual(60)
    expect(Math.abs(totalSamples(blocksOf(blocks, 'scg')) - 30_000)).toBeLessThanOrEqual(60)
    source.stop()
  })

  it('paces each channel at its own fs', async () => {
    const source = makeSource({ ecgFs: 500, scgFs: 3000 })
    const blocks = collectBlocks(source)
    await source.start()
    vi.advanceTimersByTime(4000)
    expect(Math.abs(totalSamples(blocksOf(blocks, 'ecg')) - 2000)).toBeLessThanOrEqual(10)
    expect(Math.abs(totalSamples(blocksOf(blocks, 'scg')) - 12_000)).toBeLessThanOrEqual(60)
    for (const block of blocks) expect(block.fs).toBe(block.channel === 'ecg' ? 500 : 3000)
    source.stop()
  })

  it('keeps firstSampleIndex continuous and increases seq by 1, per channel', async () => {
    const source = makeSource({ ecgFs: 1000 })
    const blocks = collectBlocks(source)
    await source.start()
    vi.advanceTimersByTime(2000)

    for (const channel of ['ecg', 'scg']) {
      const channelBlocks = blocksOf(blocks, channel)
      expect(channelBlocks[0].firstSampleIndex).toBe(0)
      expect(channelBlocks[0].seq).toBe(0)
      for (let i = 1; i < channelBlocks.length; i++) {
        const previous = channelBlocks[i - 1]
        expect(channelBlocks[i].firstSampleIndex).toBe(
          previous.firstSampleIndex + previous.samples.length,
        )
        expect(channelBlocks[i].seq).toBe(previous.seq + 1)
      }
    }
    source.stop()
  })

  it('without noise, sample i is the model at t = i / fs', async () => {
    const source = makeSource({ ecgFs: 1000, rToAoS: 0.1 })
    const blocks = collectBlocks(source)
    await source.start()
    vi.advanceTimersByTime(1500)

    const ecg = joinSamples(blocksOf(blocks, 'ecg'))
    const scg = joinSamples(blocksOf(blocks, 'scg'))
    for (const i of [0, 300, 301, 999]) expect(ecg[i]).toBe(Math.fround(ecgAt(i / 1000, 72)))
    for (const i of [0, 1200, 1201, 2999])
      expect(scg[i]).toBe(Math.fround(scgAt(i / 3000, 72, 0.1)))
    source.stop()
  })

  it('with noise, the same seed gives the same samples, also after a restart', async () => {
    const first = makeSource({ noise: true, seed: 7 })
    const firstBlocks = collectBlocks(first)
    await first.start()
    vi.advanceTimersByTime(500)
    first.stop()
    const firstEcg = joinSamples(blocksOf(firstBlocks, 'ecg')).slice(0, 1000)
    expect(firstEcg[0]).not.toBe(Math.fround(ecgAt(0, 72))) // the noise is really there

    // Same source restarted, and a new source with the same seed.
    firstBlocks.length = 0
    await first.start()
    vi.advanceTimersByTime(500)
    first.stop()
    expect(joinSamples(blocksOf(firstBlocks, 'ecg')).slice(0, 1000)).toEqual(firstEcg)

    const second = makeSource({ noise: true, seed: 7 })
    const secondBlocks = collectBlocks(second)
    await second.start()
    vi.advanceTimersByTime(500)
    second.stop()
    expect(joinSamples(blocksOf(secondBlocks, 'ecg')).slice(0, 1000)).toEqual(firstEcg)
  })

  it('goes idle → connecting → running → idle and ignores start() while running', async () => {
    const source = makeSource()
    const states: SourceState[] = []
    source.onStatus((status) => states.push(status.state))
    expect(source.status.state).toBe('idle')
    await source.start()
    await source.start()
    expect(source.status.state).toBe('running')
    source.stop()
    expect(states).toEqual(['connecting', 'running', 'idle'])
  })

  it('stop() is idempotent and no blocks arrive after it', async () => {
    const source = makeSource()
    const blocks = collectBlocks(source)
    const states: SourceState[] = []
    source.onStatus((status) => states.push(status.state))
    await source.start()
    vi.advanceTimersByTime(500)
    source.stop()
    source.stop()
    const count = blocks.length
    vi.advanceTimersByTime(5000)
    expect(blocks.length).toBe(count)
    expect(states.filter((state) => state === 'idle')).toHaveLength(1)
  })

  it('a listener can call stop() during a tick: no more blocks after that', async () => {
    const source = makeSource()
    let received = 0
    source.onBlock(() => {
      received++
      source.stop()
    })
    await source.start()
    vi.advanceTimersByTime(5000)
    expect(received).toBe(1)
  })

  it('restarts the sample index and seq at 0 on every start()', async () => {
    const source = makeSource()
    const blocks = collectBlocks(source)
    await source.start()
    vi.advanceTimersByTime(1000)
    source.stop()
    blocks.length = 0
    await source.start()
    vi.advanceTimersByTime(100)
    for (const channel of ['ecg', 'scg']) {
      expect(blocksOf(blocks, channel)[0].firstSampleIndex).toBe(0)
      expect(blocksOf(blocks, channel)[0].seq).toBe(0)
    }
    source.stop()
  })

  it('rejects settings out of range with a readable message', () => {
    expect(() => makeSource({ heartRateBpm: 0 })).toThrow('Heart rate must be between 30 and 200')
    expect(() => makeSource({ heartRateBpm: NaN })).toThrow('Heart rate')
    expect(() => makeSource({ rToAoS: 0.5 })).toThrow('R→AO delay must be between 0 and 300 ms')
    expect(() => makeSource({ scgFs: 2.5 })).toThrow('Sampling rate')
    expect(() => makeSource({ ecgFs: 0 })).toThrow('Sampling rate')
  })
})
