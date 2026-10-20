/** Upload helpers for receipt proofs captured on a phone. */

export const PROOF_ACCEPT = 'image/*,.pdf,application/pdf'
export const PROOF_MAX_BYTES = 2 * 1024 * 1024
const IMAGE_MAX_EDGE = 1600
const IMAGE_QUALITY = 0.82

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('The file could not be read.'))
    reader.readAsDataURL(file)
  })

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The image could not be decoded.'))
    img.src = src
  })

/**
 * Turns a chosen file into the `{ fileName, contentType, sizeBytes, dataUrl }` shape the API
 * expects. Phone photos are downscaled to a sensible size so a receipt never weighs megabytes;
 * PDFs are passed through as they are. Throws a plain Error with a user-facing message.
 */
export async function readProofFile(file) {
  if (!file) throw new Error('Choose a file first.')
  const isImage = file.type.startsWith('image/')
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isImage && !isPdf) throw new Error('Attach a photo (JPG, PNG, HEIC) or a PDF of the receipt.')
  const original = await readAsDataUrl(file)
  if (isImage && file.type !== 'image/svg+xml' && typeof document !== 'undefined') {
    try {
      const img = await loadImage(original)
      const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_QUALITY)
        if (dataUrl.startsWith('data:image/jpeg')) {
          const sizeBytes = Math.round(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4)
          if (sizeBytes <= PROOF_MAX_BYTES)
            return { fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg', contentType: 'image/jpeg', sizeBytes, dataUrl }
        }
      }
    } catch {
      /* fall through to the original file */
    }
  }
  if (file.size > PROOF_MAX_BYTES) throw new Error('The receipt file must be under 2 MB. Take a smaller photo or export a lighter PDF.')
  return {
    fileName: file.name,
    contentType: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
    sizeBytes: file.size,
    dataUrl: original,
  }
}
