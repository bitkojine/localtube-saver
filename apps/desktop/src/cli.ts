import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as QRCode from 'qrcode';
import { extractVideoId } from './validation';
import { ensureOutputDir, hasEnoughDiskSpace, buildOutputPath, ensureUniquePath, getCachedPath, setCachedPath } from './storage';
import { cleanupTempFiles } from './download';
import { setToolDir, ensureTools } from './tools';
import { getVideoInfo, downloadVideo } from './download';
import { transcodeToMp4 } from './transcode';
import { runPipelineTask, PipelineDeps } from './pipeline';
import { createTransferServer, closeTransferServer } from './transfer';
import { getLocalIp, throttle } from './util';
import * as logging from './logging';
import { OUTPUT_DIR, PROGRESS_UPDATE_MIN_MS } from './config';
import strings from './strings';
import { Server } from 'http';

function printUsage(): void {
  console.log('Usage: localtube <youtube-url>');
  console.log('');
  console.log('Downloads a YouTube video, transcodes to iPhone-compatible MP4,');
  console.log('and starts a local HTTP server for transfer to iPhone.');
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const url = args[0];

  if (!url) {
    printUsage();
    return;
  }

  if (!extractVideoId(url)) {
    console.error('Error: Invalid YouTube URL');
    process.exit(1);
  }

  const toolDir = path.join(os.homedir(), '.localtube', 'bin');
  setToolDir(toolDir);
  await ensureTools();
  cleanupTempFiles();

  const id = `dl-${Date.now()}`;
  let outputPath: string | null = null;
  let lastError: string | null = null;

  const pipelineDeps: PipelineDeps = {
    extractVideoId,
    getCachedPath,
    setCachedPath,
    ensureTools: () => ensureTools(),
    getVideoInfo,
    downloadVideo,
    transcodeToMp4,
    ensureOutputDir: () => ensureOutputDir(),
    hasEnoughDiskSpace,
    buildOutputPath,
    ensureUniquePath,
    throttle,
    logging,
    strings,
    fs: { existsSync: fs.existsSync, unlinkSync: fs.unlinkSync },
    OUTPUT_DIR,
    PROGRESS_UPDATE_MIN_MS
  };

  await runPipelineTask(url, id, (update) => {
    if (update.outputPath !== undefined) outputPath = update.outputPath;
    if (update.error !== null && update.error !== undefined) lastError = update.error;
    if (update.status !== undefined || update.progress !== undefined) {
      const status = update.status || '';
      const progress = update.progress !== undefined ? update.progress : 0;
      process.stdout.write(`\r\x1b[K${status} ${progress}%`);
    }
  }, pipelineDeps);

  console.log('');

  if (!outputPath) {
    console.error(`Failed: ${lastError || 'Unknown error'}`);
    process.exit(1);
  }

  console.log(`File saved: ${outputPath}`);

  const ip = getLocalIp();
  let server: Server | null = null;

  try {
    const transfer = await createTransferServer(outputPath);
    server = transfer.server;
    const transferUrl = `http://${ip}:${transfer.port}/transfer?token=${transfer.token}`;

    if (ip === '127.0.0.1') {
      console.warn('Warning: Using localhost IP. iPhone may not be able to connect.');
      console.warn('Make sure your iPhone is on the same network and try specifying a bind address.');
    }

    const qr = await QRCode.toString(transferUrl, { type: 'terminal', small: true });

    console.log('');
    console.log('Scan this QR code on your iPhone:');
    console.log(qr);
    console.log(`Or open this URL in Safari:\n${transferUrl}`);
    console.log('');
    console.log(`Server running on port ${transfer.port} (expires in 10 minutes)`);
    console.log('Press Ctrl+C to stop');

    await new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        console.log('\nShutting down...');
        closeTransferServer(server);
        process.exit(0);
      });
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`Failed to start transfer server: ${err.message}`);
    if (server) closeTransferServer(server);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});