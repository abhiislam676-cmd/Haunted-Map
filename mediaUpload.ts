import { auth } from '../firebase';
import { prepareImageForUpload } from './imageCompression';

export type UploadFolder = 'locations' | 'posts' | 'avatars' | 'covers' | 'messages' | 'general';

const VIDEO_MIME_SET = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;

function inferContentType(file: File): string {
  const mime = (file.type || '').toLowerCase();
  if (mime) return mime;
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  return 'image/jpeg';
}

export async function uploadMediaFile(
  file: File,
  options: {
    folder?: string;
    onProgress?: (percent: number) => void;
  } = {}
): Promise<string> {
  const folder = options.folder || 'general';
  const rawType = inferContentType(file);
  const isVideo = VIDEO_MIME_SET.has(rawType);

  let payload: Blob;
  let contentType: string;

  if (isVideo) {
    if (file.size > MAX_VIDEO_BYTES) {
      throw new Error('Video exceeds 30MB limit.');
    }
    payload = file;
    contentType = rawType;
  } else {
    const prepared = await prepareImageForUpload(file);
    payload = prepared.blob;
    contentType = prepared.contentType;
  }

  let token: string | null = null;
  if (auth.currentUser) {
    try {
      token = await auth.currentUser.getIdToken();
    } catch {
      // ignore; admin session cookie may still authenticate
    }
  }

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads', true);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('X-Upload-Folder', folder);
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0) {
        const pct = Math.min(99, Math.round((evt.loaded / evt.total) * 100));
        options.onProgress?.(pct);
      }
    };

    xhr.onload = () => {
      let data: { ok?: boolean; url?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText || '{}') as { ok?: boolean; url?: string; error?: string };
      } catch {
        // non-JSON response
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.url) {
        options.onProgress?.(100);
        resolve(data.url);
      } else {
        reject(new Error(data.error || `Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading file.'));
    };

    xhr.send(payload);
  });
}

export async function deleteUploadedMedia(url: string): Promise<void> {
  if (!url.startsWith('/uploads/')) return;
  let token: string | null = null;
  if (auth.currentUser) {
    try {
      token = await auth.currentUser.getIdToken();
    } catch {
      // ignore
    }
  }
  try {
    await fetch('/api/uploads', {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ url }),
    });
  } catch {
    // non-fatal cleanup
  }
}
