export { opfsService } from '@/features/media-library/services/opfs-service'
export { useEmbeddedSubtitlePickerStore } from '@/features/media-library/stores/embedded-subtitle-picker-store'

export const importMediaLibraryService = () =>
  import('@/features/media-library/services/media-library-service')
