import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

const managedWorkerPoolMocks = vi.hoisted(() => ({
  acquireWorker: vi.fn(),
  releaseWorker: vi.fn(),
  terminateWorker: vi.fn(),
  terminateAll: vi.fn(),
}))

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}))

const filmstripStorageMocks = vi.hoisted(() => ({
  load: vi.fn(),
  saveMetadata: vi.fn(),
  saveFrameBlob: vi.fn(),
  loadSingleFrame: vi.fn(),
  getExistingIndices: vi.fn(),
  createFrameFromBitmap: vi.fn(),
  createFrameFromBlob: vi.fn(),
  revokeUrls: vi.fn(),
  delete: vi.fn(),
  clearAll: vi.fn(),
}))

vi.mock('@/shared/utils/managed-worker-pool', () => ({
  createManagedWorkerPool: vi.fn(() => managedWorkerPoolMocks),
}))

vi.mock('@/shared/logging/logger', () => ({
  createLogger: vi.fn(() => loggerMocks),
}))

vi.mock('./filmstrip-storage', () => ({
  filmstripStorage: filmstripStorageMocks,
}))

import { filmstripCache } from './filmstrip-cache'

describe('filmstripCache completion semantics', () => {
  afterEach(async () => {
    vi.clearAllMocks()
    await filmstripCache.dispose()
  })

  it('loads only the requested target frames from persisted storage', async () => {
    filmstripStorageMocks.load.mockResolvedValueOnce({
      metadata: { width: 160, height: 90, isComplete: true, frameCount: 120 },
      frames: [
        { index: 10, timestamp: 10, url: 'blob:10' },
        { index: 11, timestamp: 11, url: 'blob:11' },
      ],
      existingIndices: [10, 11],
    })

    const result = await filmstripCache.getFilmstrip(
      'media-1',
      'blob:media',
      120,
      undefined,
      { startIndex: 10, endIndex: 12 },
      { targetFrameIndices: [10, 11] },
    )

    expect(filmstripStorageMocks.load).toHaveBeenCalledWith('media-1', {
      frameIndices: [10, 11],
    })
    expect(result.frames.map((frame) => frame.index)).toEqual([10, 11])
    expect(result.isComplete).toBe(true)
    expect(managedWorkerPoolMocks.acquireWorker).not.toHaveBeenCalled()
  })

  it('hydrates missing cached targets from storage before extracting', async () => {
    filmstripStorageMocks.load
      .mockResolvedValueOnce({
        metadata: { width: 160, height: 90, isComplete: true, frameCount: 120 },
        frames: [{ index: 10, timestamp: 10, url: 'blob:10' }],
        existingIndices: [10],
      })
      .mockResolvedValueOnce({
        metadata: { width: 160, height: 90, isComplete: true, frameCount: 120 },
        frames: [{ index: 20, timestamp: 20, url: 'blob:20' }],
        existingIndices: [20],
      })

    await filmstripCache.getFilmstrip(
      'media-1',
      'blob:media',
      120,
      undefined,
      { startIndex: 10, endIndex: 11 },
      { targetFrameIndices: [10] },
    )

    const result = await filmstripCache.getFilmstrip(
      'media-1',
      'blob:media',
      120,
      undefined,
      { startIndex: 20, endIndex: 21 },
      { targetFrameIndices: [20] },
    )

    expect(filmstripStorageMocks.load).toHaveBeenLastCalledWith('media-1', {
      frameIndices: [20],
    })
    expect(result.frames.map((frame) => frame.index)).toEqual([10, 20])
    expect(result.isComplete).toBe(true)
    expect(managedWorkerPoolMocks.acquireWorker).not.toHaveBeenCalled()
  })

  it('keeps priority-only prewarm results incomplete for long clips', () => {
    const pending = {
      priorityOnly: true,
      targetIndices: [0, 1, 2],
      totalFrames: 120,
      priorityRange: {
        startIndex: 0,
        endIndex: 3,
      },
    }
    const frames = [
      { index: 0, timestamp: 0, url: 'blob:0' },
      { index: 1, timestamp: 1, url: 'blob:1' },
      { index: 2, timestamp: 2, url: 'blob:2' },
    ]

    const result = (
      filmstripCache as unknown as {
        buildSettledFilmstrip: (
          pendingArg: unknown,
          framesArg: typeof frames,
        ) => {
          isComplete: boolean
          progress: number
        }
      }
    ).buildSettledFilmstrip(pending, frames)

    expect(result.isComplete).toBe(false)
    expect(result.progress).toBeLessThan(100)
  })

  it('marks a priority warm complete when it already covers the whole clip', () => {
    const pending = {
      priorityOnly: true,
      targetIndices: [0, 1, 2],
      totalFrames: 3,
      priorityRange: {
        startIndex: 0,
        endIndex: 3,
      },
    }
    const frames = [
      { index: 0, timestamp: 0, url: 'blob:0' },
      { index: 1, timestamp: 1, url: 'blob:1' },
      { index: 2, timestamp: 2, url: 'blob:2' },
    ]

    const result = (
      filmstripCache as unknown as {
        buildSettledFilmstrip: (
          pendingArg: unknown,
          framesArg: typeof frames,
        ) => {
          isComplete: boolean
          progress: number
        }
      }
    ).buildSettledFilmstrip(pending, frames)

    expect(result.isComplete).toBe(true)
    expect(result.progress).toBe(100)
  })

  it('keeps a viewport-limited refinement complete when cached frames already cover it', () => {
    const pending = {
      priorityOnly: true,
      targetIndices: [10, 11],
      totalFrames: 120,
      priorityRange: {
        startIndex: 10,
        endIndex: 12,
      },
      targetFrameCount: 4,
      requestedFrameIndices: [10, 11],
    }
    const frames = [
      { index: 0, timestamp: 0, url: 'blob:0' },
      { index: 10, timestamp: 10, url: 'blob:10' },
      { index: 11, timestamp: 11, url: 'blob:11' },
      { index: 119, timestamp: 119, url: 'blob:119' },
    ]

    const result = (
      filmstripCache as unknown as {
        buildSettledFilmstrip: (
          pendingArg: unknown,
          framesArg: typeof frames,
        ) => {
          isComplete: boolean
          progress: number
        }
      }
    ).buildSettledFilmstrip(pending, frames)

    expect(result.isComplete).toBe(true)
    expect(result.progress).toBe(100)
  })
})
