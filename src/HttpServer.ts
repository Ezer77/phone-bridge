/**
 * HttpServer.ts (WebSocket client mode)
 * Phone connects OUT to relay. Hardcoded relay IP.
 * Uploads run on the SAME WebSocket connection — no new connections opened.
 */

import { NativeModules } from 'react-native';
import { getMedia, uploadFileViaRelay } from './FileManager';

const RELAY_HOST = '82.70.228.76';
const RELAY_PORT = 8765;

type Logger = (msg: string) => void;

export default class RelayClient {
  private relayHost: string;
  private relayPort: number;
  private log: Logger;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldRun = false;
  private uploading = false;

  public onStatusChange: ((connected: boolean) => void) | null = null;

  constructor(relayHost: string, relayPort: number, log: Logger) {
    this.relayHost = relayHost;
    this.relayPort = relayPort;
    this.log = log;
  }

  start() {
    this.shouldRun = true;
    this.connect();
  }

  stop() {
    this.shouldRun = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.onStatusChange?.(false);
  }

  private connect() {
    const url = `ws://${this.relayHost}:${this.relayPort}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.ws!.send(JSON.stringify({ role: 'phone' }));
        this.onStatusChange?.(true);
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.event === 'pc_connected' || msg.event === 'pc_disconnected') return;

          if (msg.command === 'ping') {
            this.send({ event: 'pong' });
            return;
          }

          if (msg.command === 'list') {
            await this.handleList(msg);
            return;
          }

          if (msg.command === 'send') {
            // Run upload on the existing connection in the background
            this.handleSend(msg);
            return;
          }
        } catch (e: any) {
          this.log(`Error: ${e.message}`);
        }
      };

      this.ws.onerror = () => {};

      this.ws.onclose = () => {
        this.onStatusChange?.(false);
        if (this.shouldRun) {
          // Reconnect after a short delay
          this.reconnectTimer = setTimeout(() => this.connect(), 3000);
        }
      };

    } catch {
      this.onStatusChange?.(false);
      if (this.shouldRun) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    }
  }

  private send(obj: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private async handleList(msg: any) {
    const { type = 'photo', count = 20, offset = 0 } = msg;
    const files = await getMedia(type, count, offset);
    this.send({
      event: 'list_result',
      offset,
      files: files.map(f => ({ name: f.name, type: f.type, size: f.size })),
    });
  }

  private async handleSend(msg: any) {
    if (this.uploading) {
      this.send({ event: 'error', message: 'Upload already in progress' });
      return;
    }

    this.uploading = true;
    const { type = 'photo', count = 1, offset = 0 } = msg;

    // Acquire wake lock so Android doesn't throttle JS while in background
    NativeModules.BridgeService?.acquireWakeLock();

    try {
      const files = await getMedia(type, count, offset);

      if (files.length === 0) {
        this.send({ event: 'error', message: 'No files found' });
        return;
      }

      let uploaded = 0;
      let failed = 0;

      for (const file of files) {
        try {
          await uploadFileViaRelay(file, (data) => this.send(data));
          uploaded++;
        } catch {
          failed++;
        }
      }

      this.send({ event: 'transfer_done', uploaded, failed });
    } catch (e: any) {
      this.send({ event: 'error', message: e.message });
    } finally {
      this.uploading = false;
      // Release wake lock when done
      NativeModules.BridgeService?.releaseWakeLock();
    }
  }
}
