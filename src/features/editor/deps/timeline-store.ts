/**
 * Adapter exports for timeline store dependencies.
 * Editor modules should import timeline store types/selectors from here.
 */

export type {
  TimelineState,
  TimelineActions,
  ApplyAnimationPresetResult,
  CapturedAnimation,
  PresetCompatibility,
  PresetIncompatibilityReason,
} from './timeline-contract'
export {
  importWaveformCache,
  rateStretchItemWithoutHistory,
  useTimelineStore,
  useTimelineSettingsStore,
  useItemsStore,
  useKeyframesStore,
  useKeyframeSelectionStore,
  useCompositionsStore,
  useTimelineCommandStore,
  executeTimelineCommand,
  captureSnapshot,
  applyAnimationPreset,
  updateKeyframes,
  captureAnimationFromItem,
  getPresetCompatibility,
} from './timeline-contract'
