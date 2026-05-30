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
  type ExtractedMediaFileEntry,
} from '@/features/media-library/utils/file-drop'
export type { OrphanedClipInfo } from '@/features/media-library/types'
export {
  getMediaType,
  getMimeType,
} from '@/features/media-library/utils/validation'
export { mediaProcessorService } from '@/features/media-library/services/media-processor-service'
