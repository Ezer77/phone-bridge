/**
 * HttpServer.ts (WebSocket client mode)
 *
 * Instead of listening for connections, the phone connects OUT to the relay.
 * Commands received from relay:
 *   { command: "ping" }
 *   { command: "list", type: "photo"|"video"|"both", count: 20, offset: 0 }
 *   { command: "send", type: "photo"|"video"|"both", count: 1, offset: 0 }
 */

import { getMedia, uploadFileViaRelay } from './FileManager';

type Logger = (msg: string) => void;

export default class RelayClient {
  private relayHost: string;
  private relayPort: number;
  private log: Logger;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldRun = false;

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
  }

  private connect() {
    const url = `ws://${this.relayHost}:${this.relayPort}`;
    this.log(`🔗 Connecting to relay at ${url}...`);

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.log('✅ Connected to relay');
        // Identify as phone
        this.ws!.send(JSON.stringify({ role: 'phone' }));
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.event === 'pc_connected') {
            this.log('💻 PC connected to relay');
            return;
          }

          if (msg.event === 'pc_disconnected') {
            this.log('💻 PC disconnected');
            return;
          }

          if (msg.command === 'ping') {
            this.send({ event: 'pong' });
            return;
          }

          if (msg.command === 'list') {
            await this.handleList(msg);
            return;
          }

          if (msg.command === 'send') {
            await this.handleSend(msg);
            return;
          }

        } catch (e: any) {
          this.log(`❌ Message error: ${e.message}`);
        }
      };

      this.ws.onerror = (e: any) => {
        this.log(`⚠️ Connection error: ${e.message ?? 'unknown'}`);
      };

      this.ws.onclose = () => {
        this.log('🔌 Disconnected from relay');
        if (this.shouldRun) {
          this.log('⏳ Reconnecting in 5s...');
          this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        }
      };

    } catch (e: any) {
      this.log(`❌ Could not create WebSocket: ${e.message}`);
      if (this.shouldRun) {
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
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
    this.log(`📋 Listing ${type}s (offset=${offset}, count=${count})`);
    const files = await getMedia(type, count, offset);
    this.send({
      event: 'list_result',
      offset,
      files: files.map(f => ({ name: f.name, type: f.type, size: f.size })),
    });
  }

  private async handleSend(msg: any) {
    const { type = 'photo', count = 1, offset = 0 } = msg;
    this.log(`📂 Scanning gallery (type=${type}, offset=${offset}, count=${count})...`);

    const files = await getMedia(type, count, offset);

    if (files.length === 0) {
      this.log('⚠️  No files found');
      this.send({ event: 'error', message: 'No files found' });
      return;
    }

    this.log(`📤 Sending ${files.length} file(s) via relay...`);
    let uploaded = 0;
    let failed = 0;

    for (const file of files) {
      try {
        await uploadFileViaRelay(file, (data) => this.send(data));
        this.log(`  ✅ ${file.name}`);
        uploaded++;
      } catch (e: any) {
        this.log(`  ❌ ${file.name}: ${e.message}`);
        failed++;
      }
    }

    this.send({ event: 'transfer_done', uploaded, failed });
    this.log(`✔️  Done: ${uploaded} uploaded, ${failed} failed`);
  }
}
