/**
 * Single import seam for timeline -> media-library dependencies.
 */

export { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
export { mediaProcessorService } from '@/features/media-library/services/media-processor-service'
export { mediaTranscriptionService } from '@/features/media-library/services/media-transcription-service'
export {
  getMediaTranscriptionModelLabel,
  getMediaTranscriptionModelOptions,
} from '@/features/media-library/transcription/registry'
export {
  TranscribeDialog,
  type TranscribeDialogValues,
} from '@/features/media-library/components/transcribe-dialog'
export { subtitleSidecarService } from '@/features/media-library/services/subtitle-sidecar-service'
export {
  resolveMediaUrl,
  resolveProxyUrl,
  resolveMediaUrls,
  cleanupBlobUrls,
} from '@/features/media-library/utils/media-resolver'
export {
  getMediaDragData,
  setMediaDragData,
  clearMediaDragData,
  type CompositionDragData,
  type TimelineTemplateDragData,
} from '@/features/media-library/utils/drag-data-cache'
export {
  extractValidMediaFileEntriesFromDataTransfer,
  supportsFileSystemDragDrop,
} from '@/features/media-library/utils/file-drop'
export type { OrphanedClipInfo } from '@/features/media-library/types'
export type { ExtractedMediaFileEntry } from '@/features/media-library/utils/file-drop'
export { getMediaType, getMimeType } from '@/features/media-library/utils/validation'
