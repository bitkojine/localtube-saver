const os = require('os');
const { writeLog } = require('./logging');

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        writeLog(`getLocalIp: found ${iface.address} on ${name}`);
        return iface.address;
      }
    }
  }
  writeLog('getLocalIp: no external IPv4 found, falling back to 127.0.0.1');
  return '127.0.0.1';
}

function throttle(fn, minIntervalMs) {
  let lastAt = 0;
  let pending = null;
  return (...args) => {
    const now = Date.now();
    const remaining = minIntervalMs - (now - lastAt);
    if (remaining <= 0) {
      lastAt = now;
      fn(...args);
      return;
    }
    if (pending) {
      clearTimeout(pending);
    }
    pending = setTimeout(() => {
      lastAt = Date.now();
      fn(...args);
    }, remaining);
  };
}

module.exports = {
  getLocalIp,
  throttle
};
