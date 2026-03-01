/**
 * RPC collector — polls Shelly Gen2 devices + checks HTTP service liveness.
 * ESM port of health-pixoo/src/collectors/rpc-collector.js.
 *
 * @param {Object} config  - Scene config (config.wifi, config.services, config.rpcIntervalMs)
 * @param {Object} state   - Shared state object (state.wifi, state.services, state.heatChain)
 * @param {Object} logger  - Logger instance
 * @returns {{ stop: Function }}
 */

async function fetchWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function pollRpc(config, state, logger) {
  const rpcDevices = config.wifi.filter((d) => d.type === "shelly-gen2-rpc");
  for (const dev of rpcDevices) {
    try {
      const res = await fetchWithTimeout(dev.rpcUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Navigate nested rssiField (e.g. 'wifi.rssi')
      const rssi = dev.rssiField
        .split(".")
        .reduce((cur, key) => (cur != null && cur[key] !== undefined ? cur[key] : null), data);

      // Grab switch:0 output for heat chain tracking
      const sw0 = data["switch:0"];
      if (sw0 !== undefined) {
        state.heatChain.output1 = sw0.output ?? null;
      }

      state.wifi[dev.label].rssi     = rssi;
      state.wifi[dev.label].online   = true;
      state.wifi[dev.label].lastSeen = new Date();
      logger.debug(`[rpc] ${dev.label}: rssi=${rssi} output1=${state.heatChain.output1}`);
    } catch (err) {
      state.wifi[dev.label].online = false;
      logger.warn(`[rpc] ${dev.label} failed: ${err.message}`);
    }
  }
}

async function pollServices(config, state, logger) {
  for (const svc of config.services) {
    if (svc.type !== "http") continue;
    try {
      const res = await fetchWithTimeout(svc.url);
      state.services[svc.label].alive       = res.ok || res.status < 500;
      state.services[svc.label].lastChecked = new Date();
      logger.debug(`[rpc] service ${svc.label}: alive=${state.services[svc.label].alive}`);
    } catch {
      state.services[svc.label].alive       = false;
      state.services[svc.label].lastChecked = new Date();
    }
  }
}

function checkStaleDevices(state, logger) {
  const STALE_MS = 5 * 60 * 1000;
  const now = Date.now();
  for (const [label, s] of Object.entries(state.wifi)) {
    if (s.lastSeen && s.online && now - s.lastSeen.getTime() > STALE_MS) {
      logger.warn(`[rpc] ${label} went stale`);
      state.wifi[label].online = false;
    }
  }
}

export function start(config, state, logger) {
  pollRpc(config, state, logger);
  pollServices(config, state, logger);
  const id1 = setInterval(() => pollRpc(config, state, logger),      config.rpcIntervalMs);
  const id2 = setInterval(() => pollServices(config, state, logger), config.rpcIntervalMs);
  const id3 = setInterval(() => checkStaleDevices(state, logger),    60_000);
  logger.info(`[rpc-collector] Started (interval: ${config.rpcIntervalMs}ms)`);
  return {
    stop() {
      clearInterval(id1);
      clearInterval(id2);
      clearInterval(id3);
    },
  };
}
