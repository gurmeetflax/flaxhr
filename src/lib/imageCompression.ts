/**
 * Client-side image downsample + JPEG re-encode.
 *
 * Phone selfie cameras produce 2–4 MB JPEGs. At 60 employees × 2 punches/day
 * that's ~10 GB/month of cold object storage on Supabase, plus network
 * cost on every upload. We don't need that resolution — the selfie just
 * proves identity at the punch moment.
 *
 * Default 720 px on the longer side at JPEG quality 0.7 lands each
 * selfie at ~50–150 KB while staying perfectly recognisable. ~30×
 * smaller than the raw camera output.
 *
 * If anything goes wrong (decode failure, very small image, very old
 * browser without canvas.toBlob), we silently fall back to the
 * original blob so the punch flow never breaks.
 */
export interface CompressOptions {
  /** Longest side of the output image in CSS pixels. */
  maxDim?: number
  /** JPEG quality, 0..1. */
  quality?: number
  /** Don't compress if the source is already at or below this size (bytes). */
  skipIfUnder?: number
}

const DEFAULTS: Required<CompressOptions> = {
  maxDim: 720,
  quality: 0.7,
  skipIfUnder: 200 * 1024, // 200 KB
}

export async function compressImage(
  source: Blob,
  options: CompressOptions = {},
): Promise<Blob> {
  const opts = { ...DEFAULTS, ...options }
  if (source.size <= opts.skipIfUnder) return source
  if (typeof document === 'undefined') return source

  try {
    const bitmap = await loadBitmap(source)
    const { width, height } = bitmap
    const longest = Math.max(width, height)
    const scale = longest > opts.maxDim ? opts.maxDim / longest : 1
    const targetW = Math.round(width * scale)
    const targetH = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) return source
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close()

    const jpeg = await canvasToBlob(canvas, 'image/jpeg', opts.quality)
    if (!jpeg) return source
    // If somehow the re-encode produced a larger blob (tiny source, etc.),
    // keep the original.
    return jpeg.size < source.size ? jpeg : source
  } catch {
    return source
  }
}

async function loadBitmap(source: Blob): Promise<HTMLImageElement | ImageBitmap> {
  // Prefer createImageBitmap — handles EXIF orientation in modern browsers
  // and runs off the main thread.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(source, { imageOrientation: 'from-image' })
    } catch {
      // fall through to <img> path
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}
