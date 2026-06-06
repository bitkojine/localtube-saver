import * as fs from 'fs';
import * as path from 'path';
import { LOG_DIR } from './config';

enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function logFilePath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `${date}.log`);
}

function formatLog(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}\n`;
}

function write(level: LogLevel, message: string): void {
  try {
    ensureLogDir();
    const entry = formatLog(level, message);
    fs.appendFileSync(logFilePath(), entry);
  } catch (logError) {
    process.stderr.write(`[Logging] Failed to write log: ${String(logError)}\n`);
  }
}

export function info(message: string): void {
  write(LogLevel.INFO, message);
}

export function warn(message: string): void {
  write(LogLevel.WARN, message);
}

export function error(message: string, err: Error | string | null = null): void {
  let msg = message;
  if (err) {
    const errMsg = typeof err === 'string' ? err : err.message;
    msg += ` | Error: ${errMsg}`;
    if (err instanceof Error && err.stack) {
      msg += `\nStack trace:\n${err.stack}`;
    }
  }
  write(LogLevel.ERROR, msg);
}

export function debug(message: string): void {
  write(LogLevel.DEBUG, message);
}

export function cleanupOldLogs(): void {
  try {
    ensureLogDir();
    const files = fs.readdirSync(LOG_DIR);
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      const fullPath = path.join(LOG_DIR, file);
      const stats = fs.statSync(fullPath);
      if (stats.mtimeMs < cutoff) {
        fs.unlinkSync(fullPath);
      }
    }
  } catch (_error) {
    process.stderr.write('[Logging] Failed to clean up old logs\n');
  }
}


export const writeLog = info;
