import * as os from 'os';
import { info as writeLog } from './logging';

export function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const ifaceList = interfaces[name];
    if (!ifaceList) continue;
    
    for (const iface of ifaceList) {
      if (iface.family === 'IPv4' && !iface.internal) {
        writeLog(`getLocalIp: found ${iface.address} on ${name}`);
        return iface.address;
      }
    }
  }
  writeLog('getLocalIp: no external IPv4 found, falling back to 127.0.0.1');
  return '127.0.0.1';
}

export function throttle<T extends (...args: any[]) => any>(fn: T, minIntervalMs: number): (...args: Parameters<T>) => void {
  let lastAt = 0;
  let pending: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
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
