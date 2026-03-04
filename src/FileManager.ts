/**
 * FileManager.ts
 * Handles:
 *  - Storage permission requests
 *  - Reading files from the Screenshots folder
 *  - Uploading files to the PC via multipart/form-data HTTP POST
 */

import { PermissionsAndroid, Platform } from 'react-native';
import RNFS from 'react-native-fs';

export interface ScreenshotFile {
  name: string;
  path: string;
  mtime: Date;
  size: number;
}

// ─── Permissions ────────────────────────────────────────────────────────────

export async function requestStoragePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    // Android 13+ uses READ_MEDIA_IMAGES instead of READ_EXTERNAL_STORAGE
    const sdkVersion = parseInt(Platform.Version as string, 10);

    if (sdkVersion >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
        {
          title: 'Photo Access',
          message: 'Phone Bridge needs access to your photos to send screenshots.',
          buttonPositive: 'Allow',
        },
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } else {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        {
          title: 'Storage Access',
          message: 'Phone Bridge needs read access to your storage to send screenshots.',
          buttonPositive: 'Allow',
        },
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
  } catch {
    return false;
  }
}

// ─── File Reading ────────────────────────────────────────────────────────────

const SCREENSHOT_DIRS = [
  `${RNFS.ExternalStorageDirectoryPath}/DCIM/Screenshots`,
  `${RNFS.ExternalStorageDirectoryPath}/Pictures/Screenshots`,
  `${RNFS.ExternalStorageDirectoryPath}/Screenshots`,
];

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

export async function getScreenshots(maxCount: number = 10): Promise<ScreenshotFile[]> {
  let allFiles: ScreenshotFile[] = [];

  for (const dir of SCREENSHOT_DIRS) {
    try {
      const exists = await RNFS.exists(dir);
      if (!exists) continue;

      const items = await RNFS.readDir(dir);
      const images = items.filter(item =>
        item.isFile() &&
        IMAGE_EXTENSIONS.some(ext => item.name.toLowerCase().endsWith(ext))
      );

      const mapped: ScreenshotFile[] = images.map(item => ({
        name: item.name,
        path: item.path,
        mtime: item.mtime ?? new Date(0),
        size: item.size,
      }));

      allFiles = allFiles.concat(mapped);
    } catch {
      // Dir might not be accessible, skip
    }
  }

  // Sort newest first
  allFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  // Return only the N most recent
  return allFiles.slice(0, maxCount);
}

// ─── File Upload ─────────────────────────────────────────────────────────────

export async function uploadFile(
  file: ScreenshotFile,
  pcHost: string,
  pcPort: number,
): Promise<void> {
  const url = `http://${pcHost}:${pcPort}/upload`;

  // react-native-fs uploadFiles uses multipart form upload
  const result = await RNFS.uploadFiles({
    toUrl: url,
    files: [
      {
        name: 'file',
        filename: file.name,
        filepath: file.path,
        filetype: file.name.endsWith('.png') ? 'image/png' : 'image/jpeg',
      },
    ],
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    fields: {
      filename: file.name,
    },
    begin: () => {},
    progress: () => {},
  }).promise;

  if (result.statusCode !== 200) {
    throw new Error(`Server returned ${result.statusCode}`);
  }
}
