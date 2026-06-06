import type { AppErrorType, AppErrorOptions } from './types';

export class AppError extends Error {
  type: AppErrorType;
  stderr?: string;
  stdout?: string;
  code?: number;
  tempPath?: string;

  constructor(type: AppErrorType, opts?: AppErrorOptions) {
    super(type);
    this.name = 'AppError';
    this.type = type;
    if (opts?.stderr) this.stderr = opts.stderr;
    if (opts?.stdout) this.stdout = opts.stdout;
    if (opts?.code) this.code = opts.code;
    if (opts?.tempPath) this.tempPath = opts.tempPath;
  }
}
