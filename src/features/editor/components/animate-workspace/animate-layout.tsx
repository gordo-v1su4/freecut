import { memo } from 'react'
import { ErrorBoundary } from '@/app/error-boundary'
import { KeyframeGraphPanel } from '@/features/editor/deps/timeline-contract'
import { PreviewArea } from '../preview-area'

interface AnimateLayoutProps {
  project: {
    width: number
    height: number
    fps: number
  }
}

const noop = () => {}

/**
 * Animate workspace layout: a fixed column of a small preview, a thin timeline
 * strip for clip selection + scrubbing context, and the keyframe editing
 * surface filling the rest. Mirrors the Color workspace's imperative-branch
 * approach in `editor.tsx` rather than the resizable preview/timeline split.
 *
 * U2 mounts the existing `KeyframeGraphPanel` and a strip placeholder; the
 * purpose-built strip (U3) and the both-panes editing surface (U4) replace
 * those in place.
 */
export const AnimateLayout = memo(function AnimateLayout({ project }: AnimateLayoutProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Small preview — the animation result stays visible while editing curves */}
      <div className="flex min-h-0 basis-[38%] flex-col overflow-hidden">
        <ErrorBoundary level="feature">
          <PreviewArea project={project} />
        </ErrorBoundary>
      </div>

      {/* Thin timeline strip — placeholder until AnimateTimelineStrip (U3) lands */}
      <div
        className="flex h-14 shrink-0 items-center border-t border-border bg-muted/30 px-3 text-xs text-muted-foreground"
        data-animate-timeline-strip-placeholder
      />

      {/* Keyframe editing surface (dopesheet + curve editor) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border">
        <ErrorBoundary level="feature">
          <KeyframeGraphPanel isOpen onToggle={noop} onClose={noop} placement="bottom" />
        </ErrorBoundary>
      </div>
    </div>
  )
})
