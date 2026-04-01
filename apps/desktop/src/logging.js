const fs = require('fs');
const path = require('path');
const { LOG_DIR } = require('./config');

const LogLevels = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function logFilePath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `${date}.log`);
}

function formatLog(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}\n`;
}

function write(level, message) {
  try {
    ensureLogDir();
    const entry = formatLog(level, message);
    fs.appendFileSync(logFilePath(), entry);
  } catch (error) {
    // Fail silently to not crash the app due to logging issues
    console.error('Logging failed:', error);
  }
}

function info(message) {
  write(LogLevels.INFO, message);
}

function warn(message) {
  write(LogLevels.WARN, message);
}

function error(message, err = null) {
  let msg = message;
  if (err) {
    msg += ` | Error: ${err.message}`;
    if (err.stack) {
      msg += `\nStack trace:\n${err.stack}`;
    }
  }
  write(LogLevels.ERROR, msg);
}

function debug(message) {
  write(LogLevels.DEBUG, message);
}

function cleanupOldLogs() {
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
  } catch (error) {
    // Ignore log cleanup errors.
  }
}

module.exports = {
  info,
  warn,
  error,
  debug,
  cleanupOldLogs,
  // Maintain backward compatibility for now
  writeLog: info
};
