/**
 * Self-positioning playhead line for the dopesheet timeline.
 *
 * During scrubbing/seeking the editor re-renders (cheap, RAF-coalesced) and the
 * `relativeFrame` prop drives the position. During *playback* the editor is
 * deliberately kept out of the hot path (it does not re-render per frame), so
 * this component subscribes to the playback store directly and moves the line by
 * writing `style.left` on a ref — no React re-render of the editor — keeping
 * playback smooth while the playhead still tracks it.
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { usePlaybackStore } from '@/shared/state/playback'

interface DopesheetPlayheadLineProps {
  /** Clip-relative playhead frame for the paused/seek/zoom (React-driven) case. */
  relativeFrame: number
  /** Absolute timeline frame where the edited item starts (for abs→relative). */
  itemFrom: number
  /** Item duration in frames (clip-relative clamp bound). */
  totalFrames: number
  /** Clip-relative frame → x within the timeline viewport. */
  frameToX: (frame: number) => number
  /** Upper clamp for `left` (keeps the line inside the viewport). */
  maxLeft: number
  className?: string
  /**
   * `line` (default) renders the full-height red playhead line through a body
   * pane. `flag` renders just the flag handle, sat at the bottom of the ruler.
   */
  variant?: 'line' | 'flag'
}

export function DopesheetPlayheadLine({
  relativeFrame,
  itemFrom,
  totalFrames,
  frameToX,
  maxLeft,
  className,
  variant = 'line',
}: DopesheetPlayheadLineProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Latest positioning inputs, refreshed every render. The playback
  // subscription below reads these through the ref so it can subscribe ONCE and
  // never go stale: if it re-subscribed whenever `frameToX` changed (post-paint
  // useEffect), a playback tick landing between a scroll re-render and that
  // re-subscribe would position the line with the OLD viewport and snap it back
  // for a frame — the residual "jump" while scrolling during playback.
  const posRef = useRef({ frameToX, maxLeft, itemFrom, totalFrames, relativeFrame })
  posRef.current = { frameToX, maxLeft, itemFrom, totalFrames, relativeFrame }

  const clampLeft = (frame: number): number => {
    const pos = posRef.current
    return Math.max(0, Math.min(pos.maxLeft, pos.frameToX(frame)))
  }

  // Live clip-relative playback frame, or null when paused (neither playing nor
  // previewing). Shared by both positioning paths below so they never disagree.
  const livePlaybackRelFrame = (): number | null => {
    const state = usePlaybackStore.getState()
    const isPreviewing = state.previewFrame !== null
    if (!state.isPlaying && !isPreviewing) return null
    const pos = posRef.current
    const lastFrame = Math.max(0, (pos.totalFrames || 1) - 1)
    const frame = state.previewFrame ?? state.currentFrame
    return Math.max(0, Math.min(lastFrame, frame - pos.itemFrom))
  }

  // Runs on every editor render — paused seek/zoom AND scroll/zoom *during*
  // playback. While playing/previewing, position from the LIVE frame: a
  // scroll-induced re-render must not snap the line back to the stale
  // `relativeFrame` prop. Paused, use the prop.
  useLayoutEffect(() => {
    if (!ref.current) return
    const liveRel = livePlaybackRelFrame()
    ref.current.style.left = `${clampLeft(liveRel ?? posRef.current.relativeFrame)}px`
  })

  // Playback and active editor scrubs: move via direct DOM on each store frame
  // change (no editor render). Subscribe once; inputs come from `posRef`.
  useEffect(() => {
    const update = () => {
      const liveRel = livePlaybackRelFrame()
      if (liveRel === null) return
      if (ref.current) ref.current.style.left = `${clampLeft(liveRel)}px`
    }
    return usePlaybackStore.subscribe(update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (variant === 'flag') {
    // Flag handle that sits in the ruler — matches the animate timeline strip.
    // The head sits at the top of the ruler; a line runs the full ruler height
    // so it joins the body playhead line that starts just below the ruler.
    return (
      <div ref={ref} data-testid="dopesheet-playhead-flag" className={className}>
        <span className="absolute top-0 bottom-0 w-px -translate-x-1/2 bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.65)]" />
        <span className="absolute top-0 left-0 h-3 w-2 -translate-x-1/2 rounded-b-[2px] border border-red-300/60 bg-red-500" />
      </div>
    )
  }

  return (
    <div ref={ref} data-testid="dopesheet-playhead-line" className={className}>
      {/* Red playhead line through the body — matches the animate timeline strip. */}
      <span className="absolute bottom-0 top-0 w-px -translate-x-1/2 bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.65)]" />
    </div>
  )
}
