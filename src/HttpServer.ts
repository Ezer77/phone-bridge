/**
 * HttpServer.ts
 * Runs a lightweight HTTP server inside the React Native app using
 * the `react-native-tcp-socket` library (raw TCP) to parse HTTP requests.
 *
 * Supported endpoints:
 *   POST /send-screenshots
 *     Body (JSON): { count?: number, pc_host: string, pc_port?: number }
 *     - count    : how many recent screenshots to send (default: 1)
 *     - pc_host  : IP of the PC running the receiver script
 *     - pc_port  : port of the PC receiver (default: 8766)
 *
 *   GET /ping
 *     Returns 200 OK with { status: "ok" }
 *
 *   GET /list-screenshots
 *     Returns the last 20 screenshot filenames
 */

import TcpSocket from 'react-native-tcp-socket';
import { getScreenshots, uploadFile } from './FileManager';

type Logger = (msg: string) => void;

export default class HttpServer {
  private port: number;
  private log: Logger;
  private server: any = null;

  constructor(port: number, log: Logger) {
    this.port = port;
    this.log = log;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = TcpSocket.createServer((socket) => {
        let rawData = '';

        socket.on('data', (data) => {
          rawData += data.toString();
          // Simple HTTP: wait until we have headers + body
          if (rawData.includes('\r\n\r\n')) {
            this.handleRequest(rawData, socket);
            rawData = '';
          }
        });

        socket.on('error', (err) => {
          this.log(`Socket error: ${err.message}`);
        });
      });

      this.server.listen({ port: this.port, host: '0.0.0.0' }, () => {
        resolve();
      });

      this.server.on('error', (err: any) => {
        reject(err);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(raw: string, socket: any) {
    try {
      const [headerSection, ...bodyParts] = raw.split('\r\n\r\n');
      const body = bodyParts.join('\r\n\r\n');
      const firstLine = headerSection.split('\r\n')[0];
      const [method, path] = firstLine.split(' ');

      this.log(`→ ${method} ${path}`);

      if (method === 'GET' && path === '/ping') {
        this.sendJson(socket, 200, { status: 'ok' });
        return;
      }

      if (method === 'GET' && path === '/list-screenshots') {
        const files = await getScreenshots(20);
        this.sendJson(socket, 200, { files: files.map(f => f.name) });
        return;
      }

      if (method === 'POST' && path === '/send-screenshots') {
        let params: any = {};
        try { params = JSON.parse(body); } catch { /* ignore */ }

        const { count = 1, pc_host, pc_port = 8766 } = params;

        if (!pc_host) {
          this.sendJson(socket, 400, { error: 'pc_host is required' });
          return;
        }

        this.sendJson(socket, 202, { status: 'accepted', count });

        // Do the upload asynchronously
        this.uploadScreenshots(count, pc_host, pc_port);
        return;
      }

      this.sendJson(socket, 404, { error: 'Not found' });
    } catch (e: any) {
      this.log(`❌ Request error: ${e.message}`);
      this.sendJson(socket, 500, { error: 'Internal error' });
    }
  }

  private async uploadScreenshots(count: number, pcHost: string, pcPort: number) {
    try {
      this.log(`📂 Reading screenshots folder...`);
      const files = await getScreenshots(count);

      if (files.length === 0) {
        this.log('⚠️  No screenshots found.');
        return;
      }

      this.log(`📤 Uploading ${files.length} file(s) to ${pcHost}:${pcPort}...`);
      let uploaded = 0;
      let failed = 0;

      for (const file of files) {
        try {
          await uploadFile(file, pcHost, pcPort);
          this.log(`  ✅ ${file.name}`);
          uploaded++;
        } catch (e: any) {
          this.log(`  ❌ ${file.name}: ${e.message}`);
          failed++;
        }
      }

      this.log(`✔️  Done: ${uploaded} uploaded, ${failed} failed.`);
    } catch (e: any) {
      this.log(`❌ Upload error: ${e.message}`);
    }
  }

  private sendJson(socket: any, status: number, body: object) {
    const json = JSON.stringify(body);
    const statusText = status === 200 ? 'OK' : status === 202 ? 'Accepted' : status === 400 ? 'Bad Request' : status === 404 ? 'Not Found' : 'Internal Server Error';
    const response =
      `HTTP/1.1 ${status} ${statusText}\r\n` +
      `Content-Type: application/json\r\n` +
      `Content-Length: ${Buffer.byteLength(json)}\r\n` +
      `Connection: close\r\n` +
      `\r\n` +
      json;
    socket.write(response);
    socket.destroy();
  }
}
