import { imageTypes, mediaRules } from '../rules'

/**
 * Getting a picture ready to send, in the browser (docs/specs/circles.md rule 12): Vercel takes
 * 4.5 MB a request, and the server keeps 2048 px at most anyway, so photos are shrunk here first.
 * A GIF goes as it is: drawing it would keep only its first frame.
 */

export type PrepareError = 'type' | 'too-big' | 'gif-too-big'

/** What to do with a picked file, from its type, size and shape. */
export function uploadPlan(file: { type: string; size: number }, size: { width: number; height: number } | null): 'send' | 'shrink' | PrepareError {
  if (file.size > mediaRules.maxPickedBytes) return 'too-big'
  if (file.type === 'image/gif') return file.size <= mediaRules.maxUploadBytes ? 'send' : 'gif-too-big'
  // Anything else the browser can open (HEIC on Safari, say) is redrawn as one of the four types.
  if (!size) return 'type'
  const fits = file.size <= mediaRules.maxUploadBytes && Math.max(size.width, size.height) <= mediaRules.maxSide
  return fits && (imageTypes as readonly string[]).includes(file.type) ? 'send' : 'shrink'
}

/** The size that fits within `max` on its long side, never larger than it was. */
export function fitWithin(width: number, height: number, max: number = mediaRules.maxSide): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Opens the file as an image; browsers turn it upright by its EXIF on the way. */
async function open(file: File): Promise<HTMLImageElement | null> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

/**
 * The file to send: the picked one when it is already small enough, else redrawn at most 2048 px
 * on the long side as WebP (JPEG where the browser cannot write WebP, and for photos that were
 * JPEG), lowering the quality until it is under 4 MB.
 */
export async function prepareImage(file: File): Promise<{ ok: true; blob: Blob } | { ok: false; error: PrepareError }> {
  const isGif = file.type === 'image/gif'
  const image = isGif ? null : await open(file)
  const plan = uploadPlan(file, image && { width: image.naturalWidth, height: image.naturalHeight })
  if (plan === 'send') return { ok: true, blob: file }
  if (plan !== 'shrink' || !image) return { ok: false, error: plan === 'shrink' ? 'type' : plan }

  const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return { ok: false, error: 'type' }
  context.drawImage(image, 0, 0, width, height)
  const types = file.type === 'image/jpeg' ? ['image/jpeg'] : ['image/webp', 'image/jpeg']
  for (const quality of [0.9, 0.8, 0.7]) {
    for (const type of types) {
      const blob = await encode(canvas, type, quality)
      // A browser that cannot write the type hands back PNG instead: try the next one.
      if (blob && blob.type === type && blob.size <= mediaRules.maxUploadBytes) return { ok: true, blob }
    }
  }
  return { ok: false, error: 'too-big' }
}
