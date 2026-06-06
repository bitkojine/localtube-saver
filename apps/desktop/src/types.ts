export type AppErrorType =
  | 'INFO_ERROR'
  | 'INFO_PARSE_ERROR'
  | 'FORMAT_ERROR'
  | 'NETWORK_ERROR'
  | 'EXTRACTION_ERROR'
  | 'TIMEOUT'
  | 'STALLED'
  | 'FILE_TOO_LARGE'
  | 'DOWNLOAD_FAILED'
  | 'TRANSCODE_TIMEOUT'
  | 'TRANSCODE_STALLED';

export interface AppErrorOptions {
  stderr?: string;
  stdout?: string;
  code?: number;
  tempPath?: string;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  createdAt: number;
}

export interface TransferInfo {
  url: string;
  qr: string;
  expiresAt: number;
}

export interface CrashInfo {
  message: string;
  stack?: string;
}

export interface DownloadUpdate {
  id: string;
  url: string;
  title: string;
  status: string;
  progress: number;
  error: string | null;
  outputPath: string | null;
  transfer: TransferInfo | null;
  refreshStorage: boolean;
}

export interface DownloadStartResult {
  id: string;
  error?: string;
}

export interface TransferStartResult {
  id?: string;
  error?: string;
  transfer?: TransferInfo;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface AppLogPayload {
  level: LogLevel;
  message: string;
  err?: string;
}

export interface YtDlpInfo {
  title?: string;
  filesize?: number;
  filesize_approx?: number;
  abr?: number;
  tbr?: number;
}

export interface FfprobeStream {
  codec_type?: string;
  bit_rate?: string;
}

export interface FfprobeFormat {
  duration?: string;
}

export interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

export interface LocaltubeAPI {
  startDownload: (url: string) => Promise<DownloadStartResult>;
  retryDownload: (id: string) => Promise<Pick<DownloadStartResult, 'id'>>;
  startTransfer: (id: string) => Promise<TransferStartResult>;
  stopTransfer: (id: string) => Promise<void>;
  restartForUpdate: () => Promise<void>;
  getVersion: () => Promise<string>;
  getFiles: () => Promise<FileInfo[]>;
  deleteFile: (filePath: string) => Promise<boolean>;
  startTransferByPath: (filePath: string) => Promise<TransferStartResult>;
  log: (level: LogLevel, message: string, err?: Error | string) => void;
  onUpdate: (callback: (data: DownloadUpdate) => void) => void;
  onUpdateAvailable: (callback: () => void) => void;
  onUpdateProgress: (callback: (percent: number) => void) => void;
  onUpdateDownloaded: (callback: () => void) => void;
  onCrash: (callback: (err: CrashInfo) => void) => void;
}
