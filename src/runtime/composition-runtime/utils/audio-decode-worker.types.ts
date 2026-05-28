import type { ObjectUrlSourceMetadata } from '@/infrastructure/browser/object-url-registry'

export interface AudioDecodeRequest {
  type: 'decode'
  requestId: string
  mediaId: string
  /** Blob source, or an object-URL string resolved via the passed metadata/fallback. */
  src: string | Blob
  sourceMetadata?: ObjectUrlSourceMetadata | null
  fallbackBlob?: Blob | null
  binDurationSec: number
  storageSampleRate: number
}

export type AudioDecodeWorkerMessage = AudioDecodeRequest

export interface AudioDecodeBinResponse {
  type: 'bin'
  requestId: string
  binIndex: number
  frames: number
  sampleRate: number
  /** Int16 PCM, transferred. */
  left: ArrayBuffer
  right: ArrayBuffer
}

export interface AudioDecodeCompleteResponse {
  type: 'complete'
  requestId: string
  totalBins: number
}

export interface AudioDecodeErrorResponse {
  type: 'error'
  requestId: string
  error: string
}

export type AudioDecodeWorkerResponse =
  | AudioDecodeBinResponse
  | AudioDecodeCompleteResponse
  | AudioDecodeErrorResponse
