/**
 * UploadTask.ts
 * Headless JS task — runs in the background even when the app UI is paused.
 * Started by BridgeService.kt when a "send" command is received via WebSocket.
 */

import { getMedia, uploadFileViaRelay } from './FileManager';

interface UploadTaskData {
  type: 'photo' | 'video' | 'both';
  count: number;
  offset: number;
  relayHost: string;
  relayPort: number;
}

export default async (taskData: UploadTaskData): Promise<void> => {
  const { type, count, offset, relayHost, relayPort } = taskData;

  return new Promise<void>((resolve) => {
    const ws = new WebSocket(`ws://${relayHost}:${relayPort}`);
    let settled = false;

    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    // Safety timeout — resolve after 10 minutes max
    const timeout = setTimeout(done, 10 * 60 * 1000);

    ws.onopen = () => {
      // Identify as phone
      ws.send(JSON.stringify({ role: 'phone' }));
      // Start uploading immediately after identifying
      runUpload();
    };

    const runUpload = async () => {
      try {
        const files = await getMedia(type, count, offset);

        if (files.length === 0) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event: 'error', message: 'No files found' }));
          }
          ws.close();
          clearTimeout(timeout);
          done();
          return;
        }

        let uploaded = 0;
        let failed = 0;

        for (const file of files) {
          try {
            await uploadFileViaRelay(file, (data) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(data));
              }
            });
            uploaded++;
          } catch {
            failed++;
          }
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'transfer_done', uploaded, failed }));
        }
      } catch (e: any) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'error', message: e.message }));
        }
      } finally {
        ws.close();
        clearTimeout(timeout);
        done();
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      done();
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      done();
    };
  });
};
