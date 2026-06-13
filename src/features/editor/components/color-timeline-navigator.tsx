import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import { useItemsStore, useTimelineStore } from '@/features/editor/deps/timeline-store'
import {
  createScrubThrottleState,
  shouldCommitScrubFrame,
} from '@/features/editor/deps/timeline-utils'
import { usePlaybackStore } from '@/shared/state/playback'
import { useSelectionStore } from '@/shared/state/selection'
import type { TimelineItem, TimelineTrack } from '@/types/timeline'

interface TimelineClip {
  id: string
  label: string
  trackId: string
  trackName: string
  from: number
  durationInFrames: number
  thumbnailUrl?: string
}

const STRIP_HEIGHT = 164
const FILM_TILE_WIDTH = 118
const FILM_TILE_HEIGHT = 80
const FILM_TILE_STRIP_HEIGHT = 88
const MINI_TIMELINE_TRACK_AREA_HEIGHT = 52
const MINI_TIMELINE_LABEL_WIDTH = 32
const MIN_TIMELINE_FRAMES = 300
const VIDEO_TRACK_NAME_REGEX = /^V\d+$/i

function isVisualNavigatorItem(item: TimelineItem): boolean {
  return item.type !== 'audio' && item.type !== 'subtitle'
}

function isNavigatorVideoTrack(track: TimelineTrack): boolean {
  if (track.isGroup) return false
  if (track.kind === 'audio') return false
  if (track.kind === 'video') return true
  return VIDEO_TRACK_NAME_REGEX.test(track.name)
}

function getNavigatorLabel(item: TimelineItem): string {
  const label = item.label.trim()
  if (label) return label
  return item.type === 'adjustment' ? 'Grade' : item.type
}

function getThumbnailUrl(item: TimelineItem): string | undefined {
  return 'thumbnailUrl' in item ? item.thumbnailUrl : undefined
}

function resolveTimelineMaxFrame(items: readonly TimelineItem[]): number {
  const itemMax = items.reduce(
    (maxFrame, item) => Math.max(maxFrame, item.from + item.durationInFrames),
    0,
  )
  return Math.max(MIN_TIMELINE_FRAMES, itemMax)
}

function formatNavigatorTime(frame: number, fps: number): string {
  const safeFps = fps > 0 ? fps : 30
  const totalSeconds = Math.max(0, Math.floor(frame / safeFps))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

function formatNavigatorTimecode(frame: number, fps: number): string {
  const safeFps = Math.max(1, Math.round(fps > 0 ? fps : 30))
  const clampedFrame = Math.max(0, Math.round(frame))
  const totalSeconds = Math.floor(clampedFrame / safeFps)
  const frames = clampedFrame % safeFps
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds, frames]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

function getDisplayFrame() {
  const playbackState = usePlaybackStore.getState()
  return playbackState.previewFrame ?? playbackState.currentFrame
}

const ColorTimelinePlayhead = memo(function ColorTimelinePlayhead({
  timelineInsetPx,
  timelineMaxFrame,
}: {
  timelineInsetPx: number
  timelineMaxFrame: number
}) {
  const playheadRef = useRef<HTMLDivElement>(null)
  const maxFrameRef = useRef(timelineMaxFrame)
  maxFrameRef.current = timelineMaxFrame
  // Container width is cached so per-frame position updates stay layout-free
  // (getBoundingClientRect forces layout on every playback store change).
  const containerWidthRef = useRef(0)

  const updatePosition = useCallback((frame: number) => {
    const playhead = playheadRef.current
    if (!playhead) return

    if (containerWidthRef.current <= 0) {
      containerWidthRef.current = playhead.parentElement?.getBoundingClientRect().width ?? 0
    }
    const contentWidth = Math.max(0, containerWidthRef.current - timelineInsetPx)
    const maxFrame = Math.max(MIN_TIMELINE_FRAMES, maxFrameRef.current, frame + 1)
    const ratio = maxFrame > 0 ? Math.max(0, Math.min(1, frame / maxFrame)) : 0
    playhead.style.transform = `translate3d(${Math.round(timelineInsetPx + contentWidth * ratio)}px, 0, 0)`
  }, [timelineInsetPx])

  useEffect(() => {
    updatePosition(getDisplayFrame())

    const unsubscribe = usePlaybackStore.subscribe((state) => {
      updatePosition(state.previewFrame ?? state.currentFrame)
    })

    const container = playheadRef.current?.parentElement
    if (typeof ResizeObserver === 'undefined' || !container) return unsubscribe

    const resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width !== undefined) containerWidthRef.current = width
      updatePosition(getDisplayFrame())
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      unsubscribe()
    }
  }, [updatePosition])

  useLayoutEffect(() => {
    updatePosition(getDisplayFrame())
  }, [timelineInsetPx, timelineMaxFrame, updatePosition])

  return (
    <div
      ref={playheadRef}
      className="pointer-events-none absolute bottom-0 top-0 z-20 w-0"
      data-testid="color-timeline-playhead"
      aria-hidden="true"
    >
      <span className="absolute bottom-0 top-0 w-px -translate-x-1/2 bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.65)]" />
      <span className="absolute left-0 top-0 h-3.5 w-2.5 -translate-x-1/2 rounded-b-[2px] border border-red-300/60 bg-red-500 shadow-[0_0_7px_rgba(239,68,68,0.55)]" />
      <span className="absolute left-0 top-3 h-0 w-0 -translate-x-1/2 border-x-[4px] border-t-[5px] border-x-transparent border-t-red-500" />
    </div>
  )
})

export const ColorTimelineNavigator = memo(function ColorTimelineNavigator() {
  const { t } = useTranslation()
  const { items, tracks } = useItemsStore(
    useShallow((s) => ({
      items: s.items,
      tracks: s.tracks,
    })),
  )
  const setCurrentFrame = usePlaybackStore((s) => s.setCurrentFrame)
  const setScrubFrame = usePlaybackStore((s) => s.setScrubFrame)
  const setPreviewFrame = usePlaybackStore((s) => s.setPreviewFrame)
  const pausePlayback = usePlaybackStore((s) => s.pause)
  const fps = useTimelineStore((s) => s.fps)
  const selectedItemIds = useSelectionStore((s) => s.selectedItemIds)
  const selectItems = useSelectionStore((s) => s.selectItems)
  const isScrubbingRef = useRef(false)
  // Scrub gesture state: rect is captured once on pointer down (no layout reads
  // per move), commits are rAF-batched and gated by the same adaptive throttle
  // the Edit-workspace playhead uses.
  const scrubRectRef = useRef<DOMRect | null>(null)
  const scrubThrottleRef = useRef(createScrubThrottleState())
  const pendingClientXRef = useRef<number | null>(null)
  const scrubRafRef = useRef<number | null>(null)

  const selectedItemIdSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds])
  const videoTrackRows = useMemo(
    () => tracks.filter(isNavigatorVideoTrack).sort((a, b) => a.order - b.order),
    [tracks],
  )
  const trackLaneIndexById = useMemo(
    () => new Map(videoTrackRows.map((track, index) => [track.id, index])),
    [videoTrackRows],
  )
  const trackNameById = useMemo(
    () => new Map(tracks.map((track) => [track.id, track.name || track.id])),
    [tracks],
  )
  const visualClips = useMemo<TimelineClip[]>(
    () =>
      items
        .filter(isVisualNavigatorItem)
        .map((item) => ({
          id: item.id,
          label: getNavigatorLabel(item),
          trackId: item.trackId,
          trackName: trackNameById.get(item.trackId) ?? 'V1',
          from: item.from,
          durationInFrames: item.durationInFrames,
          thumbnailUrl: getThumbnailUrl(item),
        }))
        .sort((a, b) => a.from - b.from || a.trackId.localeCompare(b.trackId)),
    [items, trackNameById],
  )
  const timelineMaxFrame = resolveTimelineMaxFrame(items)

  const clientXToFrame = useCallback(
    (clientX: number): number | null => {
      const rect = scrubRectRef.current
      if (!rect || rect.width <= 0) return null
      const timelineWidth = Math.max(1, rect.width - MINI_TIMELINE_LABEL_WIDTH)
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left - MINI_TIMELINE_LABEL_WIDTH) / timelineWidth),
      )
      return Math.round(ratio * timelineMaxFrame)
    },
    [timelineMaxFrame],
  )

  const cancelScrubRaf = useCallback(() => {
    if (scrubRafRef.current !== null) {
      cancelAnimationFrame(scrubRafRef.current)
      scrubRafRef.current = null
    }
    pendingClientXRef.current = null
  }, [])

  useEffect(() => cancelScrubRaf, [cancelScrubRaf])

  const runScrubLoop = useCallback(() => {
    const clientX = pendingClientXRef.current
    const rect = scrubRectRef.current

    if (!isScrubbingRef.current || clientX === null || !rect) {
      scrubRafRef.current = null
      return
    }

    const frame = clientXToFrame(clientX)
    if (frame !== null) {
      const timelineWidth = Math.max(1, rect.width - MINI_TIMELINE_LABEL_WIDTH)
      const navigatorPixelsPerSecond = (timelineWidth * (fps > 0 ? fps : 30)) / timelineMaxFrame
      if (
        shouldCommitScrubFrame({
          state: scrubThrottleRef.current,
          pointerX: clientX - rect.left - MINI_TIMELINE_LABEL_WIDTH,
          targetFrame: frame,
          pixelsPerSecond: navigatorPixelsPerSecond,
          nowMs: performance.now(),
        })
      ) {
        setScrubFrame(frame, null)
      }
    }

    scrubRafRef.current = requestAnimationFrame(runScrubLoop)
  }, [clientXToFrame, fps, setScrubFrame, timelineMaxFrame])

  const handleScrubStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      isScrubbingRef.current = true
      event.currentTarget.setPointerCapture?.(event.pointerId)
      scrubRectRef.current = event.currentTarget.getBoundingClientRect()
      const frame = clientXToFrame(event.clientX)
      if (frame === null) return
      pausePlayback()
      pendingClientXRef.current = event.clientX
      scrubThrottleRef.current = createScrubThrottleState({
        pointerX: event.clientX - scrubRectRef.current.left - MINI_TIMELINE_LABEL_WIDTH,
        frame,
        nowMs: performance.now(),
      })
      setScrubFrame(frame, null)
      if (scrubRafRef.current === null) {
        scrubRafRef.current = requestAnimationFrame(runScrubLoop)
      }
    },
    [clientXToFrame, pausePlayback, runScrubLoop, setScrubFrame],
  )

  const handleScrubMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isScrubbingRef.current) return
      pendingClientXRef.current = event.clientX
    },
    [],
  )

  const finishScrub = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isScrubbingRef.current) return
      cancelScrubRaf()
      const frame = clientXToFrame(event.clientX)
      if (frame !== null) setScrubFrame(frame, null)
      isScrubbingRef.current = false
      scrubRectRef.current = null
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      setPreviewFrame(null)
    },
    [cancelScrubRaf, clientXToFrame, setScrubFrame, setPreviewFrame],
  )

  const cancelScrub = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isScrubbingRef.current) return
      cancelScrubRaf()
      isScrubbingRef.current = false
      scrubRectRef.current = null
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      setPreviewFrame(null)
    },
    [cancelScrubRaf, setPreviewFrame],
  )

  const seekToClip = useCallback(
    (clip: TimelineClip) => {
      pausePlayback()
      setPreviewFrame(null)
      setCurrentFrame(clip.from)
      selectItems([clip.id])
    },
    [pausePlayback, selectItems, setCurrentFrame, setPreviewFrame],
  )

  const renderTimelineClip = (clip: TimelineClip) => {
    const selected = selectedItemIdSet.has(clip.id)
    const rowCount = Math.max(1, videoTrackRows.length)
    const rowHeight = MINI_TIMELINE_TRACK_AREA_HEIGHT / rowCount
    const laneIndex = trackLaneIndexById.get(clip.trackId) ?? 0
    const clipHeight =
      rowHeight >= 10 ? Math.max(8, Math.min(16, rowHeight - 4)) : Math.max(4, rowHeight - 2)
    const clipTop = laneIndex * rowHeight + Math.max(1, (rowHeight - clipHeight) / 2)
    return (
      <button
        key={`${clip.id}-timeline`}
        type="button"
        data-testid="color-timeline-mini-clip"
        data-track-id={clip.trackId}
        className={`absolute overflow-hidden rounded-[2px] border text-left transition-colors ${
          selected
            ? 'border-orange-500 bg-orange-500/20 shadow-[0_0_0_1px_rgba(249,115,22,0.45)]'
            : 'border-sky-500/70 bg-sky-500/45 hover:border-sky-300'
        }`}
        style={{
          left: `${(clip.from / timelineMaxFrame) * 100}%`,
          width: `${Math.max(0.6, (clip.durationInFrames / timelineMaxFrame) * 100)}%`,
          minWidth: 16,
          top: clipTop,
          height: clipHeight,
        }}
        onClick={(event) => {
          event.stopPropagation()
          seekToClip(clip)
        }}
        onPointerDown={(event) => event.stopPropagation()}
        title={clip.label}
        aria-label={clip.label}
      />
    )
  }

  const renderFilmTile = (clip: TimelineClip, index: number) => {
    const selected = selectedItemIdSet.has(clip.id)
    const clipNumber = String(index + 1).padStart(2, '0')
    return (
      <button
        key={`${clip.id}-film-tile`}
        type="button"
        data-testid="color-timeline-film-tile"
        data-clip-id={clip.id}
        className={`group grid shrink-0 grid-rows-[20px_1fr_16px] overflow-hidden rounded-[3px] border bg-[#17181d] text-left shadow-sm transition-colors ${
          selected
            ? 'border-orange-500 shadow-[0_0_0_1px_rgba(249,115,22,0.65)]'
            : 'border-zinc-700 hover:border-zinc-500'
        }`}
        style={{ width: FILM_TILE_WIDTH, height: FILM_TILE_HEIGHT }}
        onClick={() => {
          seekToClip(clip)
        }}
        onPointerDown={(event) => {
          event.stopPropagation()
          if (event.button !== 0) return
          seekToClip(clip)
        }}
        title={clip.label}
      >
        <span className="flex min-w-0 items-center gap-1 border-b border-black/40 bg-[#24252b] px-1.5 text-[10px] font-semibold text-zinc-200">
          <span
            className={`rounded-[2px] border px-1 leading-3 ${
              selected
                ? 'border-lime-300/80 bg-indigo-700 text-lime-200'
                : 'border-indigo-400/70 bg-zinc-800 text-zinc-200'
            }`}
          >
            {clipNumber}
          </span>
          <span className="font-mono">{formatNavigatorTimecode(clip.from, fps)}</span>
          <span className="ml-auto text-[9px] text-zinc-400">{clip.trackName}</span>
        </span>

        <span className="relative block min-h-0 bg-black">
          {clip.thumbnailUrl ? (
            <img src={clip.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="block h-full w-full bg-black" />
          )}
        </span>

        <span className="truncate border-t border-black/40 bg-[#202127] px-1.5 text-[10px] font-medium text-zinc-300">
          {clip.label}
        </span>
      </button>
    )
  }

  return (
    <section
      className="panel-bg shrink-0 overflow-hidden border-y border-border bg-[#24252b]"
      aria-label={t('editor.colorTimeline.label')}
      data-testid="color-timeline-navigator"
      style={{ height: STRIP_HEIGHT }}
    >
      <div className="flex h-full flex-col">
        <div
          className="flex shrink-0 gap-1 overflow-x-auto overflow-y-hidden border-b border-black/40 px-1 py-1"
          style={{ height: FILM_TILE_STRIP_HEIGHT }}
        >
          {visualClips.length > 0 ? (
            visualClips.map(renderFilmTile)
          ) : (
            <div className="flex h-full items-center px-2 text-[10px] font-medium text-zinc-500">
              {t('editor.colorTimeline.noClip')}
            </div>
          )}
        </div>

        <div
          className="relative min-h-0 flex-1 cursor-ew-resize bg-[#1d1e23]"
          data-testid="color-timeline-scrub-surface"
          onPointerDown={handleScrubStart}
          onPointerMove={handleScrubMove}
          onPointerUp={finishScrub}
          onPointerCancel={cancelScrub}
        >
          <div className="relative h-5 border-b border-black/40">
            <div
              className="absolute inset-y-0 right-0"
              style={{ left: MINI_TIMELINE_LABEL_WIDTH }}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                <div
                  key={ratio}
                  className="absolute top-0 h-full border-l border-zinc-500/45 pl-1 pt-0.5 text-[10px] text-zinc-500"
                  style={{ left: `${ratio * 100}%` }}
                >
                  {formatNavigatorTime(Math.round(ratio * timelineMaxFrame), fps)}
                </div>
              ))}
            </div>
          </div>
          <div className="relative" style={{ height: MINI_TIMELINE_TRACK_AREA_HEIGHT }}>
            <div
              className="absolute left-0 top-0 h-full border-r border-black/35 text-[9px] font-semibold text-zinc-400"
              style={{ width: MINI_TIMELINE_LABEL_WIDTH }}
            >
              {videoTrackRows.length > 0 ? (
                videoTrackRows.map((track, index) => {
                  const rowCount = Math.max(1, videoTrackRows.length)
                  const rowHeight = MINI_TIMELINE_TRACK_AREA_HEIGHT / rowCount
                  return (
                    <span
                      key={track.id}
                      className="absolute left-0 flex w-full items-center justify-center overflow-hidden leading-none"
                      style={{ top: index * rowHeight, height: rowHeight }}
                    >
                      {track.name || `V${index + 1}`}
                    </span>
                  )
                })
              ) : (
                <span className="flex h-full items-center justify-center">V1</span>
              )}
            </div>
            <div
              className="absolute inset-y-0 right-0"
              style={{ left: MINI_TIMELINE_LABEL_WIDTH }}
            >
              {videoTrackRows.map((track, index) => {
                const rowCount = Math.max(1, videoTrackRows.length)
                const rowHeight = MINI_TIMELINE_TRACK_AREA_HEIGHT / rowCount
                return (
                  <div
                    key={track.id}
                    className="absolute left-0 right-0 border-t border-zinc-700/70"
                    style={{ top: index * rowHeight }}
                  />
                )
              })}
              {visualClips.map(renderTimelineClip)}
            </div>
          </div>
          <ColorTimelinePlayhead
            timelineInsetPx={MINI_TIMELINE_LABEL_WIDTH}
            timelineMaxFrame={timelineMaxFrame}
          />
        </div>
      </div>
    </section>
  )
})
