/**
 * FileManager.ts
 * - Searches the whole gallery (photos + videos)
 * - Supports offset/count for pagination
 */

import { PermissionsAndroid, Platform } from 'react-native';
import RNFS from 'react-native-fs';

export interface MediaFile {
  name: string;
  path: string;
  mtime: Date;
  size: number;
  type: 'photo' | 'video';
}

// ─── Permissions ─────────────────────────────────────────────────────────────

export async function requestStoragePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    const sdkVersion = parseInt(Platform.Version as string, 10);

    if (sdkVersion >= 33) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
      ]);
      return (
        results[PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES] === PermissionsAndroid.RESULTS.GRANTED &&
        results[PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO] === PermissionsAndroid.RESULTS.GRANTED
      );
    } else {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
  } catch {
    return false;
  }
}

// ─── Extensions ──────────────────────────────────────────────────────────────

const PHOTO_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.gif'];
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.3gp', '.webm', '.ts'];

function isPhoto(name: string): boolean {
  const lower = name.toLowerCase();
  return PHOTO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function isVideo(name: string): boolean {
  const lower = name.toLowerCase();
  return VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

// ─── Gallery Search ───────────────────────────────────────────────────────────

// All common media directories on Android
const MEDIA_DIRS = [
  RNFS.ExternalStorageDirectoryPath + '/DCIM',
  RNFS.ExternalStorageDirectoryPath + '/Pictures',
  RNFS.ExternalStorageDirectoryPath + '/Movies',
  RNFS.ExternalStorageDirectoryPath + '/Videos',
  RNFS.ExternalStorageDirectoryPath + '/Download',
  RNFS.ExternalStorageDirectoryPath + '/WhatsApp/Media/WhatsApp Images',
  RNFS.ExternalStorageDirectoryPath + '/WhatsApp/Media/WhatsApp Video',
  RNFS.ExternalStorageDirectoryPath + '/Telegram',
  RNFS.ExternalStorageDirectoryPath + '/Instagram',
  RNFS.ExternalStorageDirectoryPath + '/Snapchat',
];

async function scanDir(dir: string, mediaType: 'photo' | 'video' | 'both'): Promise<MediaFile[]> {
  const results: MediaFile[] = [];
  try {
    const exists = await RNFS.exists(dir);
    if (!exists) return results;

    const items = await RNFS.readDir(dir);

    for (const item of items) {
      if (item.isFile()) {
        const isP = isPhoto(item.name);
        const isV = isVideo(item.name);
        const include =
          (mediaType === 'photo' && isP) ||
          (mediaType === 'video' && isV) ||
          (mediaType === 'both' && (isP || isV));

        if (include) {
          results.push({
            name: item.name,
            path: item.path,
            mtime: item.mtime ?? new Date(0),
            size: item.size,
            type: isV ? 'video' : 'photo',
          });
        }
      } else if (item.isDirectory()) {
        // Recurse one level deep
        const sub = await scanDir(item.path, mediaType);
        results.push(...sub);
      }
    }
  } catch {
    // Directory not accessible, skip
  }
  return results;
}

/**
 * Get media files from the whole gallery.
 * @param mediaType  'photo' | 'video' | 'both'
 * @param count      how many files to return
 * @param offset     skip this many files (0-based) before returning
 */
export async function getMedia(
  mediaType: 'photo' | 'video' | 'both',
  count: number,
  offset: number = 0,
): Promise<MediaFile[]> {
  let allFiles: MediaFile[] = [];

  for (const dir of MEDIA_DIRS) {
    const found = await scanDir(dir, mediaType);
    allFiles = allFiles.concat(found);
  }

  // Deduplicate by path
  const seen = new Set<string>();
  allFiles = allFiles.filter(f => {
    if (seen.has(f.path)) return false;
    seen.add(f.path);
    return true;
  });

  // Sort newest first
  allFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  // Apply offset and count
  return allFiles.slice(offset, offset + count);
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function uploadFile(
  file: MediaFile,
  pcHost: string,
  pcPort: number,
): Promise<void> {
  const url = `http://${pcHost}:${pcPort}/upload`;

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    heic: 'image/heic',
    gif: 'image/gif',
    mp4: 'video/mp4',
    mkv: 'video/x-matroska',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    '3gp': 'video/3gpp',
    webm: 'video/webm',
    ts: 'video/mp2t',
  };
  const mimeType = mimeMap[ext] ?? 'application/octet-stream';

  const formData = new FormData();
  formData.append('file', {
    uri: `file://${file.path}`,
    name: file.name,
    type: mimeType,
  } as any);

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}`);
  }
}
