import * as crypto from 'crypto';
import * as path from 'path';
import express, { Request, Response } from 'express';
import * as fs from 'fs';
import { TRANSFER_BIND_HOST, TRANSFER_TOKEN_TTL_MS, TRANSFER_NO_DATA_TIMEOUT_MS, MAX_FILE_SIZE_BYTES } from './config';
import { info as writeLog } from './logging';
import { Server } from 'http';

export interface TransferInfo {
  server: Server;
  token: string;
  port: number;
  expiresAt: number;
}

function createToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

export async function createTransferServer(filePath: string, bindHost = TRANSFER_BIND_HOST): Promise<TransferInfo> {
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('FILE_TOO_LARGE');
  }

  const app = express();
  const token = createToken();
  const expiresAt = Date.now() + TRANSFER_TOKEN_TTL_MS;

  function isAuthorized(req: Request): boolean {
    const reqToken = (req.query.token as string) || req.headers['x-localtube-token'];
    if (!reqToken || reqToken !== token) {
      return false;
    }
    if (Date.now() > expiresAt) {
      return false;
    }
    return true;
  }

  app.get('/transfer', (req: Request, res: Response) => {
    if (!isAuthorized(req)) {
      res.status(403).end();
      return;
    }

    const isDownload = req.query.download === '1';

    if (!isDownload) {
      const fileName = path.basename(filePath);
      const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>LocalTube Transfer</title>
    <style>
        body { font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f0f0f2; color: #333; }
        .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 90%; }
        h1 { font-size: 1.5rem; margin-bottom: 1rem; }
        .btn { display: inline-block; background: #007aff; color: white; padding: 0.8rem 1.5rem; border-radius: 0.5rem; text-decoration: none; font-weight: bold; margin-top: 1rem; }
        .hint { margin-top: 1.5rem; font-size: 0.9rem; color: #666; line-height: 1.4; }
        video { max-width: 100%; border-radius: 0.5rem; margin-bottom: 1rem; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Baigta!</h1>
        <video controls>
            <source src="/transfer?token=${token}&download=1" type="video/mp4">
        </video>
        <a href="/transfer?token=${token}&download=1" class="btn" download="${fileName}">Išsaugoti telefone</a>
        <div class="hint">
            <strong>Kaip išsaugoti į Photos:</strong><br>
            1. Paspauskite "Išsaugoti telefone"<br>
            2. Atsidarius vaizdo įrašui, bakstelėkite "Share" piktogramą (kvadratas su rodykle)<br>
            3. Pasirinkite <strong>"Save Video"</strong>
        </div>
    </div>
</body>
</html>`;
      res.send(html);
      return;
    }

    const fileName = path.basename(filePath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stats.size);
    
    const encodedFileName = encodeURIComponent(fileName);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}"; filename*=UTF-8''${encodedFileName}`);

    const stream = fs.createReadStream(filePath);
    let lastDataAt = Date.now();

    const timeout = setInterval(() => {
      if (Date.now() - lastDataAt > TRANSFER_NO_DATA_TIMEOUT_MS) {
        stream.destroy(new Error('TRANSFER_TIMEOUT'));
      }
    }, 1_000);

    stream.on('data', () => {
      lastDataAt = Date.now();
    });

    stream.on('error', (error: Error) => {
      clearInterval(timeout);
      writeLog(`transfer error: ${error.message}`);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });

    res.on('finish', () => {
      clearInterval(timeout);
      writeLog(`http access ${req.method} ${req.url} ${req.ip} ${stats.size}`);
    });

    stream.pipe(res);
  });

  const server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(0, bindHost, () => resolve(listener));
    listener.on('error', (err: Error) => {
      writeLog(`server listen error: ${err.message}`);
      reject(err);
    });
  });

  const addr = server.address();
  const port = (typeof addr === 'string' || !addr) ? 0 : addr.port;

  return {
    server,
    token,
    port,
    expiresAt
  };
}

export function closeTransferServer(server: Server | null): void {
  if (!server) {
    return;
  }
  server.close();
}
