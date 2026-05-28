/**
 * Audio Decode Worker
 *
 * Runs the expensive full-audio decode off the main thread: mediabunny decode →
 * downmix to stereo → downsample → Int16. Decoded bins are streamed back as
 * transferable Int16 PCM so the main thread only has to persist them and wrap
 * the assembled result in an AudioBuffer (a cheap memcpy).
 *
 * AudioBuffer / OfflineAudioContext are unavailable in workers, so all DSP runs
 * on plain TypedArrays via the shared audio-decode-dsp module.
 */

import { createMediabunnyInputSource } from '@/infrastructure/browser/mediabunny-input-source'
import { createLogger } from '@/shared/logging/logger'
import { ensureAc3DecoderRegistered, isAc3AudioCodec } from '@/shared/utils/ac3-decoder'
import { downmixToStereo, produceDecodedBin } from './audio-decode-dsp'
import type {
  AudioDecodeBinResponse,
  AudioDecodeCompleteResponse,
  AudioDecodeErrorResponse,
  AudioDecodeWorkerMessage,
} from './audio-decode-worker.types'

const log = createLogger('AudioDecodeWorker')

interface DecodeSampleData {
  numberOfFrames?: number
  numberOfChannels?: number
  sampleRate?: number
  copyTo: (destination: Float32Array, options: { planeIndex: number; format: 'f32-planar' }) => void
  close: () => void
}

async function decode(
  message: Extract<AudioDecodeWorkerMessage, { type: 'decode' }>,
): Promise<void> {
  const {
    requestId,
    mediaId,
    src,
    sourceMetadata,
    fallbackBlob,
    binDurationSec,
    storageSampleRate,
  } = message

  const mb = await import('mediabunny')
  const input = new mb.Input({
    formats: mb.ALL_FORMATS,
    source: createMediabunnyInputSource(mb, src, {
      metadata: sourceMetadata ?? null,
      fallbackBlob: fallbackBlob ?? null,
    }),
  })

  try {
    const audioTrack = await input.getPrimaryAudioTrack()
    if (!audioTrack) {
      throw new Error(`No audio track found for media ${mediaId}`)
    }

    const audioCodec = typeof audioTrack.codec === 'string' ? audioTrack.codec : undefined
    if (isAc3AudioCodec(audioCodec)) {
      await ensureAc3DecoderRegistered()
    }

    const sink = new mb.AudioSampleSink(audioTrack)

    let sampleRate = 48000
    let binLeftChunks: Float32Array[] = []
    let binRightChunks: Float32Array[] = []
    let binAccumFrames = 0
    let binIndex = 0

    const flushBin = () => {
      const bin = produceDecodedBin(
        binIndex,
        binLeftChunks,
        binRightChunks,
        binAccumFrames,
        sampleRate,
        storageSampleRate,
      )
      const response: AudioDecodeBinResponse = {
        type: 'bin',
        requestId,
        binIndex: bin.binIndex,
        frames: bin.frames,
        sampleRate: bin.sampleRate,
        left: bin.left.buffer as ArrayBuffer,
        right: bin.right.buffer as ArrayBuffer,
      }
      self.postMessage(response, { transfer: [response.left, response.right] })
      binIndex++
      binLeftChunks = []
      binRightChunks = []
      binAccumFrames = 0
    }

    for await (const sample of sink.samples() as AsyncIterable<DecodeSampleData>) {
      try {
        const frameCount = Math.max(0, sample.numberOfFrames ?? 0)
        const channelCount = Math.max(1, sample.numberOfChannels ?? 1)
        if (frameCount === 0) {
          continue
        }
        if (sample.sampleRate && sample.sampleRate > 0) {
          sampleRate = sample.sampleRate
        }

        const channels: Float32Array[] = []
        for (let c = 0; c < channelCount; c++) {
          const channelData = new Float32Array(frameCount)
          sample.copyTo(channelData, { planeIndex: c, format: 'f32-planar' })
          channels.push(channelData)
        }
        const { left, right } = downmixToStereo(channels, frameCount)

        binLeftChunks.push(left)
        binRightChunks.push(right)
        binAccumFrames += frameCount

        const binFramesAtSource = binDurationSec * sampleRate
        if (binAccumFrames >= binFramesAtSource) {
          flushBin()
        }
      } finally {
        sample.close()
      }
    }

    if (binAccumFrames > 0) {
      flushBin()
    }

    const complete: AudioDecodeCompleteResponse = {
      type: 'complete',
      requestId,
      totalBins: binIndex,
    }
    self.postMessage(complete)
  } finally {
    input.dispose()
  }
}

self.onmessage = async (event: MessageEvent<AudioDecodeWorkerMessage>) => {
  const message = event.data
  if (message.type !== 'decode') {
    return
  }

  try {
    await decode(message)
  } catch (err) {
    log.warn('Audio decode worker failed', { mediaId: message.mediaId, err })
    const response: AudioDecodeErrorResponse = {
      type: 'error',
      requestId: message.requestId,
      error: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(response)
  }
}

export {}
