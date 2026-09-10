import sharp from 'sharp'

const THUMBNAIL_BOUND = 720

export async function writePhotoThumbnail(sourcePath: string, destinationPath: string): Promise<void> {
  try {
    await sharp(sourcePath, { failOn: 'error', limitInputPixels: 200_000_000 })
      .rotate()
      .resize({ width: THUMBNAIL_BOUND, height: THUMBNAIL_BOUND, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toFile(destinationPath)
  } catch { throw new Error('This image could not be decoded. Use a valid JPEG, PNG, or WebP file.') }
}
