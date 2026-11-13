export interface PreparedImage {
  blob: Blob;
  contentType: string;
}

const DIRECT_PASSTHROUGH_TYPES = new Set(['image/gif']);
const FALLBACK_ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

export async function prepareImageForUpload(
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<PreparedImage> {
  const mime = (file.type || '').toLowerCase();

  // Preserve animated GIFs directly if under 8MB
  if (DIRECT_PASSTHROUGH_TYPES.has(mime) && file.size <= 8 * 1024 * 1024) {
    return { blob: file, contentType: mime };
  }

  try {
    const compressed = await compressImageFile(file, maxDimension, quality);
    return { blob: compressed, contentType: 'image/jpeg' };
  } catch (err) {
    // Graceful fallback: if canvas decode fails on a valid small image, upload raw file
    if (FALLBACK_ALLOWED_TYPES.has(mime) && file.size > 0 && file.size <= 6 * 1024 * 1024) {
      return { blob: file, contentType: mime === 'image/jpg' ? 'image/jpeg' : mime };
    }
    throw err;
  }
}

export async function compressImageFile(
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (!width || !height) {
        reject(new Error(`Invalid image dimensions for ${file.name}`));
        return;
      }
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable for image compression.'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to encode compressed JPEG image.'));
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Unable to decode image file: ${file.name}`));
    };

    img.src = objectUrl;
  });
}
