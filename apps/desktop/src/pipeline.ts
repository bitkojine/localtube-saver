import { AppError } from './AppError';
import type { VideoInfo, DownloadResult } from './download';

export function classifyPipelineError(error: Error, errors: Record<string, string>): string {
  let errorType: string | undefined;
  let errorStderr: string | undefined;

  if (error instanceof AppError) {
    errorType = error.type;
    errorStderr = error.stderr;
  } else if (error instanceof Error) {
    errorType = error.message;
  }

  let errorMsg = errors.downloadFailed;

  if (errorType === 'INFO_ERROR' || errorType === 'INFO_PARSE_ERROR') {
    errorMsg = errors.infoError;
  } else if (errorType === 'FILE_TOO_LARGE') {
    errorMsg = errors.fileTooLarge;
  } else if (errorType === 'NETWORK_ERROR') {
    errorMsg = errors.networkError;
  } else if (errorType === 'FORMAT_ERROR') {
    errorMsg = errors.formatError;
  } else if (errorType === 'EXTRACTION_ERROR') {
    errorMsg = errors.extractionError;
  } else if (errorType === 'TIMEOUT') {
    errorMsg = errors.timeoutError;
  } else if (errorType === 'STALLED') {
    errorMsg = errors.stalledError;
  } else if (errorType === 'TRANSCODE_TIMEOUT') {
    errorMsg = errors.timeoutError;
  } else if (errorType === 'TRANSCODE_STALLED') {
    errorMsg = errors.stalledError;
  }

  if (errorStderr) {
    if (errorStderr.includes('Sign in to confirm you\u2019re not a bot')) {
      errorMsg = 'YouTube prašo patvirtinti, kad nesate robotas.';
    } else if (errorStderr.includes('This video is age-restricted')) {
      errorMsg = 'Vaizdo įrašas turi amžiaus ribojimą.';
    } else if (errorStderr.includes('Video unavailable')) {
      errorMsg = 'Vaizdo įrašas nepasiekiamas.';
    } else if (errorStderr.includes('GVS PO Token')) {
      errorMsg = 'YouTube reikalauja papildomo patvirtinimo (PO Token). Bandykite vėliau arba atnaujinkite nustatymus.';
    }
  }

  return errorMsg;
}

export interface PipelineState {
  id: string;
  url: string;
  title: string;
  status: string;
  progress: number;
  error: string | null;
  outputPath: string | null;
  tempPath?: string;
}

export type OnPipelineUpdate = (update: Partial<PipelineState> & { id: string }) => void;

export interface PipelineDeps {
  extractVideoId: (url: string) => string | null;
  getCachedPath: (videoId: string) => string | null;
  setCachedPath: (videoId: string, filePath: string) => void;
  ensureTools: () => Promise<void>;
  getVideoInfo: (url: string) => Promise<VideoInfo>;
  downloadVideo: (url: string, onProgress: (pct: number) => void, existingInfo?: VideoInfo) => Promise<DownloadResult>;
  transcodeToMp4: (inputPath: string, outputPath: string, onProgress: (time: number, duration: number) => void) => Promise<void>;
  ensureOutputDir: () => void;
  hasEnoughDiskSpace: (dir: string, required: number) => boolean;
  buildOutputPath: (title: string) => string;
  ensureUniquePath: (filePath: string) => string;
  throttle: <T extends (...args: never[]) => void>(fn: T, minIntervalMs: number) => (...args: Parameters<T>) => void;
  logging: {
    info: (msg: string) => void;
    error: (msg: string, err?: Error | null) => void;
    warn: (msg: string) => void;
  };
  strings: {
    status: Record<string, string>;
    errors: Record<string, string>;
  };
  fs: { existsSync: (path: string) => boolean; unlinkSync: (path: string) => void };
  OUTPUT_DIR: string;
  PROGRESS_UPDATE_MIN_MS: number;
}

function send(onUpdate: OnPipelineUpdate, id: string, state: Partial<PipelineState>): void {
  onUpdate({ id, ...state });
}

export async function runPipelineTask(
  url: string,
  id: string,
  onUpdate: OnPipelineUpdate,
  deps: PipelineDeps
): Promise<void> {
  const videoId = deps.extractVideoId(url);
  if (videoId) {
    const cachedPath = deps.getCachedPath(videoId);
    if (cachedPath) {
      deps.logging.info(`using cached video for ${videoId}: ${cachedPath}`);
      send(onUpdate, id, {
        outputPath: cachedPath,
        status: deps.strings.status.readyToSend,
        progress: 100,
        error: null
      });
      return;
    }
  }

  const updateProgress = deps.throttle((progress: number) => {
    send(onUpdate, id, { progress });
  }, deps.PROGRESS_UPDATE_MIN_MS);

  let tempPath: string | undefined;

  try {
    await deps.ensureTools();
    const info = await deps.getVideoInfo(url);
    send(onUpdate, id, { title: info.title });

    deps.logging.info(`[Pipeline] Checking disk space for ${info.sizeBytes} bytes`);
    deps.ensureOutputDir();
    const required = info.sizeBytes > 0 ? info.sizeBytes * 2 : 0;
    if (!deps.hasEnoughDiskSpace(deps.OUTPUT_DIR, required)) {
      deps.logging.error(`[Pipeline] Not enough disk space: ${required} required`);
      send(onUpdate, id, {
        error: deps.strings.errors.notEnoughDisk,
        status: deps.strings.status.ready
      });
      return;
    }

    deps.logging.info('[Pipeline] Starting download');
    const downloadResult = await deps.downloadVideo(url, (percent) => {
      send(onUpdate, id, { status: deps.strings.status.downloading });
      updateProgress(Math.round(percent));
    }, info);

    tempPath = downloadResult.tempPath;
    deps.logging.info(`[Pipeline] Downloaded to ${tempPath}. Starting transcoding.`);
    send(onUpdate, id, { status: deps.strings.status.transcoding, progress: 0, tempPath });

    const outputPath = deps.ensureUniquePath(deps.buildOutputPath(info.title));
    await deps.transcodeToMp4(tempPath, outputPath, (time, duration) => {
      const percent = duration > 0 ? Math.min(100, Math.round((time / duration) * 100)) : 0;
      updateProgress(percent);
    });

    deps.logging.info(`[Pipeline] Transcoding finished: ${outputPath}`);
    if (videoId) {
      deps.setCachedPath(videoId, outputPath);
    }
    send(onUpdate, id, {
      outputPath,
      status: deps.strings.status.readyToSend,
      progress: 100,
      error: null
    });
  } catch (error) {
    deps.logging.error('[Pipeline] Global failure', error instanceof Error ? error : new Error(String(error)));

    const pipelineError = error instanceof Error ? error : new Error(String(error));
    const errorStderr = pipelineError instanceof AppError ? pipelineError.stderr : undefined;
    if (errorStderr) {
      deps.logging.error(`[Pipeline] Captured stderr: ${errorStderr}`);
    }

    const errorMsg = classifyPipelineError(pipelineError, deps.strings.errors);

    send(onUpdate, id, { error: errorMsg, status: deps.strings.status.ready });
  } finally {
    if (tempPath) {
      try {
        if (deps.fs.existsSync(tempPath)) {
          deps.fs.unlinkSync(tempPath);
          deps.logging.info(`[Pipeline] Cleanup: Deleted temp file ${tempPath}`);
        }
      } catch (cleanupError) {
        deps.logging.warn(`[Pipeline] Cleanup: Failed to delete temp file ${tempPath}`);
      }
    }
  }
}