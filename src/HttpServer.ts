/**
 * HttpServer.ts
 *
 * Endpoints:
 *   GET  /ping
 *   GET  /list?type=photo|video|both&count=20&offset=0
 *   POST /send
 *     Body: {
 *       pc_host: string,
 *       pc_port?: number,       (default 8766)
 *       type?: "photo"|"video"|"both",  (default "photo")
 *       count?: number,         (default 1)
 *       offset?: number,        (default 0)
 *     }
 */

import TcpSocket from 'react-native-tcp-socket';
import { getMedia, uploadFile } from './FileManager';

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
      const [method, pathWithQuery] = firstLine.split(' ');

      // Split path and query string
      const [path, queryString] = pathWithQuery.split('?');
      const query = this.parseQuery(queryString ?? '');

      this.log(`→ ${method} ${pathWithQuery}`);

      // GET /ping
      if (method === 'GET' && path === '/ping') {
        this.sendJson(socket, 200, { status: 'ok' });
        return;
      }

      // GET /list?type=photo&count=20&offset=0
      if (method === 'GET' && path === '/list') {
        const type = (query.type as any) || 'photo';
        const count = parseInt(query.count ?? '20');
        const offset = parseInt(query.offset ?? '0');
        const files = await getMedia(type, count, offset);
        this.sendJson(socket, 200, {
          total_returned: files.length,
          offset,
          files: files.map(f => ({ name: f.name, type: f.type, size: f.size })),
        });
        return;
      }

      // POST /send
      if (method === 'POST' && path === '/send') {
        let params: any = {};
        try { params = JSON.parse(body); } catch { }

        const {
          pc_host,
          pc_port = 8766,
          type = 'photo',
          count = 1,
          offset = 0,
        } = params;

        if (!pc_host) {
          this.sendJson(socket, 400, { error: 'pc_host is required' });
          return;
        }

        this.sendJson(socket, 202, { status: 'accepted', type, count, offset });
        this.uploadMedia(type, count, offset, pc_host, pc_port);
        return;
      }

      this.sendJson(socket, 404, { error: 'Not found' });
    } catch (e: any) {
      this.log(`❌ Request error: ${e.message}`);
      this.sendJson(socket, 500, { error: 'Internal error' });
    }
  }

  private parseQuery(qs: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (!qs) return result;
    for (const part of qs.split('&')) {
      const [k, v] = part.split('=');
      if (k) result[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
    }
    return result;
  }

  private async uploadMedia(
    type: 'photo' | 'video' | 'both',
    count: number,
    offset: number,
    pcHost: string,
    pcPort: number,
  ) {
    try {
      this.log(`📂 Scanning gallery (type=${type}, offset=${offset}, count=${count})...`);
      const files = await getMedia(type, count, offset);

      if (files.length === 0) {
        this.log('⚠️  No files found with those parameters.');
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
    const statusTexts: Record<number, string> = {
      200: 'OK', 202: 'Accepted', 400: 'Bad Request',
      404: 'Not Found', 500: 'Internal Server Error',
    };
    const response =
      `HTTP/1.1 ${status} ${statusTexts[status] ?? 'OK'}\r\n` +
      `Content-Type: application/json\r\n` +
      `Content-Length: ${json.length}\r\n` +
      `Connection: close\r\n` +
      `\r\n` +
      json;
    socket.write(response);
    socket.destroy();
  }
}
