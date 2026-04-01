const { spawn } = require('child_process');
const path = require('path');
const { TRANSCODE_NO_PROGRESS_TIMEOUT_MS } = require('./config');
const { writeLog } = require('./logging');
const { getFfmpegPath, getFfprobePath } = require('./tools');

function runFfprobe(filePath) {
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

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        writeLog(`ffprobe error: ${stderr.trim()}`);
        reject(new Error('PROBE_FAILED'));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        const duration = Number(parsed.format?.duration || 0);
        const audioStream = (parsed.streams || []).find((s) => s.codec_type === 'audio');
        const audioBitrate = Number(audioStream?.bit_rate || 0);
        resolve({ duration, audioBitrate });
      } catch (error) {
        reject(new Error('PROBE_PARSE_FAILED'));
      }
    });
  });
}

function spawnTranscode(inputPath, outputPath, audioBitrate, onProgress) {
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

    proc.on('close', (code) => {
      clearInterval(timeout);
      if (code === 0) {
        resolve();
      } else {
        writeLog(`ffmpeg error: ${stderr.trim()}`);
        reject(new Error('TRANSCODE_FAILED'));
      }
    });
  });
}

async function transcodeToMp4(inputPath, outputPath, onProgress) {
  const info = await runFfprobe(inputPath);
  await spawnTranscode(inputPath, outputPath, info.audioBitrate, (time) => {
    onProgress(time, info.duration);
  });
}

module.exports = {
  transcodeToMp4,
  runFfprobe
};
