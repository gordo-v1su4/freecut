import type { CompositionInputProps, ExtendedExportSettings } from '@/types/export'
import type { TimelineTrack } from '@/types/timeline'
import { framesToSeconds } from '@/shared/utils/time-utils'
import { isGifUrl, isWebpUrl } from '@/shared/utils/media-utils'
import type { ClientCodec, ClientExportSettings, ClientVideoContainer } from './client-renderer'
import {
  getPreferredContainerForCodec,
  getSupportedCodecs,
  mapToClientSettings,
  selectFallbackVideoCodec,
  validateSettings,
  getDefaultAudioCodec,
  getAudioBitrateForQuality,
} from './client-renderer'

export type ExportPreflightSeverity = 'ok' | 'info' | 'warning' | 'error'

export interface ExportPreflightCheck {
  id: string
  severity: ExportPreflightSeverity
  title: string
  detail: string
  fix?: string
}

export interface AssessExportPreflightOptions {
  settings: ExtendedExportSettings
  fps: number
  composition: CompositionInputProps
  durationFrames: number
  supportedVideoCodecs?: ClientCodec[]
  workerAvailable?: boolean
  offlineAudioContextAvailable?: boolean
}

export interface ExportPreflightResult {
  canExport: boolean
  checks: ExportPreflightCheck[]
  resolvedSettings?: ClientExportSettings
  predictedRenderPath: 'worker' | 'main-thread'
  estimatedDurationSeconds: number
}

function hasAnimatedImage(tracks: TimelineTrack[]): boolean {
  for (const track of tracks) {
    for (const item of track.items ?? []) {
      if (item.type !== 'image') continue
      const label = item.label.toLowerCase()
      if (
        isGifUrl(item.src) ||
        isWebpUrl(item.src) ||
        label.endsWith('.gif') ||
        label.endsWith('.webp')
      ) {
        return true
      }
    }
  }
  return false
}

function hasAudibleItem(tracks: TimelineTrack[]): boolean {
  for (const track of tracks) {
    if (track.muted) continue
    for (const item of track.items ?? []) {
      if (
        (item.type === 'audio' || item.type === 'video') &&
        (!('muted' in item) || item.muted !== true)
      ) {
        return true
      }
    }
  }
  return false
}

function describeCodec(codec: ClientCodec): string {
  switch (codec) {
    case 'avc':
      return 'H.264'
    case 'hevc':
      return 'H.265/HEVC'
    case 'vp8':
      return 'VP8'
    case 'vp9':
      return 'VP9'
    case 'av1':
      return 'AV1'
  }
}

function resolveAudioSettings(
  clientSettings: ClientExportSettings,
  settings: ExtendedExportSettings,
): void {
  if (!settings.audioContainer) return
  clientSettings.container = settings.audioContainer
  clientSettings.mode = 'audio'
  clientSettings.audioCodec = getDefaultAudioCodec(settings.audioContainer)
  clientSettings.audioBitrate = getAudioBitrateForQuality(settings.quality)
}

async function resolveSettingsForPreflight(
  settings: ExtendedExportSettings,
  fps: number,
  supportedVideoCodecs?: ClientCodec[],
): Promise<{
  clientSettings?: ClientExportSettings
  codecFallback?: ClientCodec
  error?: string
  supportedVideoCodecs?: ClientCodec[]
}> {
  const exportMode = settings.mode
  const clientSettings = mapToClientSettings(settings, fps)
  clientSettings.mode = exportMode
  clientSettings.embedSubtitles =
    exportMode === 'video' ? (settings.embedSubtitles ?? false) : false

  if (exportMode === 'audio') {
    resolveAudioSettings(clientSettings, settings)
    const validation = validateSettings(clientSettings)
    return validation.valid ? { clientSettings } : { error: validation.error }
  }

  if (settings.videoContainer) {
    clientSettings.container = settings.videoContainer
  }

  const validation = validateSettings(clientSettings)
  if (!validation.valid) return { error: validation.error }

  const codecs =
    supportedVideoCodecs ??
    (await getSupportedCodecs({
      width: clientSettings.resolution.width,
      height: clientSettings.resolution.height,
      bitrate: clientSettings.videoBitrate,
    }))

  if (codecs.includes(clientSettings.codec)) {
    return { clientSettings, supportedVideoCodecs: codecs }
  }

  const containerFallback = selectFallbackVideoCodec(
    codecs,
    clientSettings.container as ClientVideoContainer,
  )

  if (containerFallback) {
    clientSettings.codec = containerFallback
    const postFallbackValidation = validateSettings(clientSettings)
    return postFallbackValidation.valid
      ? { clientSettings, codecFallback: containerFallback, supportedVideoCodecs: codecs }
      : { error: postFallbackValidation.error, supportedVideoCodecs: codecs }
  }

  if (settings.videoContainer) {
    return {
      error: `The selected ${settings.videoContainer.toUpperCase()} format is not supported in this browser. Try a different format or codec.`,
      supportedVideoCodecs: codecs,
    }
  }

  const browserFallback = selectFallbackVideoCodec(codecs)
  if (!browserFallback) {
    return {
      error: 'No supported video codecs available in this browser',
      supportedVideoCodecs: codecs,
    }
  }

  clientSettings.codec = browserFallback
  clientSettings.container = getPreferredContainerForCodec(browserFallback)
  const postFallbackValidation = validateSettings(clientSettings)
  return postFallbackValidation.valid
    ? { clientSettings, codecFallback: browserFallback, supportedVideoCodecs: codecs }
    : { error: postFallbackValidation.error, supportedVideoCodecs: codecs }
}

export async function assessExportPreflight({
  settings,
  fps,
  composition,
  durationFrames,
  supportedVideoCodecs,
  workerAvailable = typeof Worker !== 'undefined',
  offlineAudioContextAvailable = typeof OfflineAudioContext !== 'undefined',
}: AssessExportPreflightOptions): Promise<ExportPreflightResult> {
  const checks: ExportPreflightCheck[] = []
  const estimatedDurationSeconds = framesToSeconds(durationFrames, fps)
  const resolved = await resolveSettingsForPreflight(settings, fps, supportedVideoCodecs)

  if (durationFrames <= 0) {
    checks.push({
      id: 'empty-range',
      severity: 'error',
      title: 'Nothing to export',
      detail: 'The selected export range has no frames.',
      fix: 'Add timeline content or choose a non-empty in/out range.',
    })
  } else {
    checks.push({
      id: 'export-range-ready',
      severity: 'ok',
      title: 'Export range ready',
      detail: `${durationFrames.toLocaleString()} frames (${estimatedDurationSeconds.toFixed(1)}s) will be exported.`,
    })
  }

  if (!resolved.clientSettings) {
    checks.push({
      id: 'video-codec-unavailable',
      severity: 'error',
      title: 'Selected format cannot be encoded',
      detail: resolved.error ?? 'This browser cannot encode the selected export settings.',
      fix: 'Choose a different format/codec or try a recent Chromium browser.',
    })

    return {
      canExport: false,
      checks,
      predictedRenderPath: 'main-thread',
      estimatedDurationSeconds,
    }
  }

  if (resolved.clientSettings.mode === 'audio') {
    checks.push({
      id: 'audio-export-ready',
      severity: 'ok',
      title: 'Audio export ready',
      detail: `${resolved.clientSettings.container.toUpperCase()} audio will use ${resolved.clientSettings.audioCodec ?? 'the default audio codec'}.`,
    })
  } else if (resolved.codecFallback) {
    checks.push({
      id: 'video-codec-fallback',
      severity: 'warning',
      title: 'Codec fallback will be used',
      detail: `The selected codec is unavailable here. FreeCut will export ${describeCodec(resolved.codecFallback)} in ${resolved.clientSettings.container.toUpperCase()} instead.`,
      fix: 'Keep this fallback or choose another supported codec manually.',
    })
  } else {
    checks.push({
      id: 'video-codec-supported',
      severity: 'ok',
      title: 'Video codec supported',
      detail: `${describeCodec(resolved.clientSettings.codec)} can be encoded as ${resolved.clientSettings.container.toUpperCase()} in this browser.`,
    })
  }

  const tracks = composition.tracks ?? []
  let predictedRenderPath: ExportPreflightResult['predictedRenderPath'] = 'worker'

  if (!workerAvailable) {
    predictedRenderPath = 'main-thread'
    checks.push({
      id: 'worker-unavailable-fallback',
      severity: 'info',
      title: 'Worker export unavailable',
      detail:
        'This browser/session cannot start export workers, so rendering will run on the main thread.',
      fix: 'Keep the tab focused and avoid heavy interaction during export.',
    })
  } else if (resolved.clientSettings.mode === 'video' && hasAnimatedImage(tracks)) {
    predictedRenderPath = 'main-thread'
    checks.push({
      id: 'worker-animated-image-fallback',
      severity: 'warning',
      title: 'Animated images require main-thread export',
      detail:
        'GIF/WebP image items cannot render in the export worker yet. FreeCut will fall back automatically.',
      fix: 'For faster worker export, replace animated images with video clips before exporting.',
    })
  } else if (hasAudibleItem(tracks) && !offlineAudioContextAvailable) {
    predictedRenderPath = 'main-thread'
    checks.push({
      id: 'worker-audio-context-fallback',
      severity: 'info',
      title: 'Audio mix requires main-thread fallback',
      detail:
        'OfflineAudioContext is not available in the export worker, so audio rendering will run on the main thread.',
    })
  } else {
    checks.push({
      id: 'worker-export-ready',
      severity: 'ok',
      title: 'Worker export path ready',
      detail: 'The export worker can render this composition without a known main-thread fallback.',
    })
  }

  return {
    canExport: !checks.some((check) => check.severity === 'error'),
    checks,
    resolvedSettings: resolved.clientSettings,
    predictedRenderPath,
    estimatedDurationSeconds,
  }
}

export function summarizePreflightSeverity(
  checks: ExportPreflightCheck[],
): ExportPreflightSeverity {
  if (checks.some((check) => check.severity === 'error')) return 'error'
  if (checks.some((check) => check.severity === 'warning')) return 'warning'
  if (checks.some((check) => check.severity === 'info')) return 'info'
  return 'ok'
}
