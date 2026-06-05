import { spawn } from 'child_process';
import { FFPROBE_TIMEOUT_MS, TRANSCODE_NO_PROGRESS_TIMEOUT_MS, TRANSCODE_TOTAL_TIMEOUT_MS } from './config';
import { info as writeLog, debug, error as writeError } from './logging';
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
    const proc = spawn(getFfprobePath(), args);
    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      writeError(`ffprobe timed out after ${FFPROBE_TIMEOUT_MS}ms, killing process`);
      proc.kill('SIGKILL');
    }, FFPROBE_TIMEOUT_MS);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        writeLog(`ffprobe error: ${stderr.trim()}`);
        reject(new Error('PROBE_FAILED'));
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

    const proc = spawn(getFfmpegPath(), args);
    writeLog(`ffmpeg transcoding: ${getFfmpegPath()} ${args.join(' ')}`);
    let stderr = '';
    let lastProgressAt = Date.now();
    let killedByStallWatchdog = false;
    let killedByTotalTimeout = false;

    const stallWatchdog = setInterval(() => {
      if (Date.now() - lastProgressAt > TRANSCODE_NO_PROGRESS_TIMEOUT_MS) {
        killedByStallWatchdog = true;
        writeError(`ffmpeg no progress for ${TRANSCODE_NO_PROGRESS_TIMEOUT_MS}ms, killing process`);
        proc.kill('SIGKILL');
      }
    }, 1_000);

    const totalTimeout = setTimeout(() => {
      killedByTotalTimeout = true;
      writeError(`ffmpeg total timeout of ${TRANSCODE_TOTAL_TIMEOUT_MS}ms reached, killing process`);
      proc.kill('SIGKILL');
    }, TRANSCODE_TOTAL_TIMEOUT_MS);

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
        debug(`[Transcode] progress: ${formatTime(time)}`);
        onProgress(time);
      }
    });

    proc.on('close', (code) => {
      clearInterval(stallWatchdog);
      clearTimeout(totalTimeout);

      if (killedByTotalTimeout) {
        writeError(`ffmpeg timed out after ${TRANSCODE_TOTAL_TIMEOUT_MS}ms`);
        reject(new Error('TRANSCODE_TIMEOUT'));
        return;
      }

      if (killedByStallWatchdog) {
        writeError(`ffmpeg stalled (no progress for ${TRANSCODE_NO_PROGRESS_TIMEOUT_MS}ms)`);
        reject(new Error('TRANSCODE_STALLED'));
        return;
      }

      writeLog(`ffmpeg finished with code ${code}`);
      if (code === 0) {
        resolve();
      } else {
        writeLog(`ffmpeg error: ${stderr.trim()}`);
        reject(new Error('TRANSCODE_FAILED'));
      }
    });
  });
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toFixed(1).padStart(5, '0')}`;
}

export async function transcodeToMp4(inputPath: string, outputPath: string, onProgress: (time: number, duration: number) => void): Promise<void> {
  const info = await runFfprobe(inputPath);
  await spawnTranscode(inputPath, outputPath, info.audioBitrate, (time) => {
    onProgress(time, info.duration);
  });
}
