import { memo } from 'react'
import { ErrorBoundary } from '@/app/error-boundary'
import { KeyframeGraphPanel } from '@/features/editor/deps/timeline-contract'
import { PreviewArea } from '../preview-area'
import { AnimateTimelineStrip } from './animate-timeline-strip'
import { AnimationPresetLibrary } from './animation-preset-library'

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
 * U2 mounts the existing `KeyframeGraphPanel`; the both-panes editing surface
 * (U4) replaces the single-pane host in place.
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

      {/* Thin timeline strip — select the clip to animate + scrub for context */}
      <ErrorBoundary level="feature">
        <AnimateTimelineStrip />
      </ErrorBoundary>

      {/* Editing surface (dopesheet + curve editor) beside the preset library */}
      <div className="flex min-h-0 flex-1 overflow-hidden border-t border-border">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <ErrorBoundary level="feature">
            <KeyframeGraphPanel
              isOpen
              splitView
              showCloseButton={false}
              onToggle={noop}
              onClose={noop}
              placement="side"
            />
          </ErrorBoundary>
        </div>
        <ErrorBoundary level="feature">
          <AnimationPresetLibrary canvas={project} />
        </ErrorBoundary>
      </div>
    </div>
  )
})
