import * as fs from 'fs';
import * as path from 'path';
import { LOG_DIR } from './config';

enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
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
  } catch (error) {
    
    console.error('Logging failed:', error);
  }
}

export function info(message: string): void {
  write(LogLevel.INFO, message);
}

export function warn(message: string): void {
  write(LogLevel.WARN, message);
}

export function error(message: string, err: unknown = null): void {
  let msg = message;
  if (err) {
    const errorTyped = err as { message?: string; type?: string; stack?: string };
    const errMsg = err instanceof Error ? err.message : (errorTyped.message || errorTyped.type || (typeof err === 'object' ? JSON.stringify(err) : String(err)));
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
    
  }
}


export const writeLog = info;
