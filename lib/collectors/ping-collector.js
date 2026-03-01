/**
 * Ping collector — checks ping-type wifi devices via ICMP.
 * ESM port of health-pixoo/src/collectors/ping-collector.js.
 *
 * @param {Object} config  - Scene config (config.wifi, config.pingIntervalMs)
 * @param {Object} state   - Shared state object (state.wifi)
 * @param {Object} logger  - Logger instance
 * @returns {{ stop: Function }}
 */

import { exec } from "child_process";

function pingHost(ip) {
  return new Promise((resolve) => {
    const isMac = process.platform === "darwin";
    const cmd   = isMac
      ? `ping -c 1 -W 2000 ${ip}`
      : `ping -c 1 -W 2 ${ip}`;

    exec(cmd, { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve({ alive: false, ms: null });
        return;
      }
      const match = stdout.match(/time[<=]([\d.]+)/);
      resolve({ alive: true, ms: match ? parseFloat(match[1]) : null });
    });
  });
}

async function pollOnce(config, state, logger) {
  const pingDevices = config.wifi.filter((d) => d.type === "ping");
  for (const dev of pingDevices) {
    try {
      const result = await pingHost(dev.ip);
      state.wifi[dev.label].online  = result.alive;
      state.wifi[dev.label].rssi    = null; // ping-only: no RSSI
      state.wifi[dev.label].pingMs  = result.ms;
      if (result.alive) state.wifi[dev.label].lastSeen = new Date();
      logger.debug(`[ping] ${dev.label}: alive=${result.alive} ms=${result.ms}`);
    } catch (err) {
      logger.warn(`[ping] ${dev.label} error: ${err.message}`);
    }
  }
}

export function start(config, state, logger) {
  pollOnce(config, state, logger);
  const id = setInterval(() => pollOnce(config, state, logger), config.pingIntervalMs);
  logger.info(`[ping-collector] Started (interval: ${config.pingIntervalMs}ms)`);
  return { stop: () => clearInterval(id) };
}
