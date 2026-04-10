import { spawn } from 'child_process';
import { TRANSCODE_NO_PROGRESS_TIMEOUT_MS } from './config';
import * as logging from './logging';
import { getFfmpegPath, getFfprobePath } from './tools';

interface ProbeResult {
  duration: number;
  audioBitrate: number;
}

export function runFfprobe(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-show_entries', 'stream=bit_rate,codec_type',
      '-of', 'json',
      filePath
    ];
    const proc = spawn(getFfprobePath(), args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      logging.error(`[Transcode] ffprobe spawn error: ${err.message}`, err);
      reject({ type: 'PROBE_ERROR', message: err.message, stderr: `Spawn error: ${err.message}` });
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        logging.error(`[Transcode] ffprobe failed (code ${code})`, { stderr });
        reject({ type: 'PROBE_ERROR', code, stderr });
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type?: string; bit_rate?: string }[] };
        const duration = Number(parsed.format?.duration || 0);
        const audioStream = (parsed.streams || []).find((s) => s.codec_type === 'audio');
        const audioBitrate = Number(audioStream?.bit_rate || 0);
        resolve({ duration, audioBitrate });
      } catch (_error) {
        reject(new Error('PROBE_PARSE_FAILED'));
      }
    });
  });
}

function spawnTranscode(inputPath: string, outputPath: string, audioBitrate: number, onProgress: (time: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const audioArgs = audioBitrate >= 160000
      ? ['-c:a', 'copy']
      : ['-c:a', 'aac', '-b:a', '256k'];

    const args = [
      '-y',
      '-i', inputPath,
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-preset', 'fast',
      '-crf', '30',
      '-vf', "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease",
      ...audioArgs,
      '-movflags', '+faststart',
      outputPath
    ];

    const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
    let stderr = '';
    let lastProgressAt = Date.now();
    const timeout = setInterval(() => {
      if (Date.now() - lastProgressAt > TRANSCODE_NO_PROGRESS_TIMEOUT_MS) {
        proc.kill('SIGKILL');
      }
    }, 1_000);

    proc.stderr.on('data', (data) => {
      const line = data.toString();
      stderr += line;
      const match = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (match) {
        lastProgressAt = Date.now();
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        const seconds = Number(match[3]);
        const time = hours * 3600 + minutes * 60 + seconds;
        onProgress(time);
      }
    });

    proc.on('error', (err) => {
      logging.error(`[Transcode] ffmpeg spawn error: ${err.message}`, err);
      reject({ type: 'TRANSCODE_ERROR', message: err.message, stderr: `Spawn error: ${err.message}` });
    });

    proc.on('close', (code) => {
      clearInterval(timeout);
      if (code === 0) {
        resolve();
      } else {
        logging.error(`[Transcode] ffmpeg failed (code ${code})`, { stderr });
        reject({ type: 'TRANSCODE_ERROR', code, stderr });
      }
    });
  });
}

export async function transcodeToMp4(inputPath: string, outputPath: string, onProgress: (time: number, duration: number) => void): Promise<void> {
  const info = await runFfprobe(inputPath);
  await spawnTranscode(inputPath, outputPath, info.audioBitrate, (time) => {
    onProgress(time, info.duration);
  });
}
