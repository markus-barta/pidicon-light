/**
 * pidicon-light - Main entry point
 * Config-file driven pixel display controller with MQTT monitoring
 */

import { ConfigLoader } from "../lib/config-loader.js";
import { SceneLoader } from "../lib/scene-loader.js";
import { RenderLoop } from "./render-loop.js";
import { UlanziDriver } from "../lib/ulanzi-driver.js";
import { PixooDriver } from "../lib/pixoo-driver.js";
import { MqttService } from "../lib/mqtt-service.js";
import { ConfigWatcher } from "../lib/config-watcher.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Logger ---------------------------------------------------------------

function createLogger() {
  const levelNames = { error: 0, warn: 1, info: 2, debug: 3 };
  const levelNum =
    levelNames[(process.env.LOG_LEVEL || "info").toLowerCase()] ?? 2;
  const ts = () => new Date().toISOString();

  return {
    error: (msg, err) => {
      const detail =
        err instanceof Error
          ? ` — ${err.stack || err.message}`
          : err
            ? ` — ${err}`
            : "";
      console.error(`${ts()} ERROR ${msg}${detail}`);
    },
    warn: (msg) => levelNum >= 1 && console.warn(`${ts()}  WARN ${msg}`),
    info: (msg) => levelNum >= 2 && console.info(`${ts()}  INFO ${msg}`),
    debug: (msg) => levelNum >= 3 && console.log(`${ts()} DEBUG ${msg}`),
  };
}

const logger = createLogger();

// --- Global state ----------------------------------------------------------
// Kept at module level so signal handlers and reloadConfig() share state.

let mqttService = null;
let configWatcher = null;
let renderLoops = []; // Array of { device, loop }
let sceneLoader = null;
let configPath = null; // Set once in main(), used in reloadConfig()

// ---------------------------------------------------------------------------

async function initializeMqtt() {
  const mqttConfig = {
    host: process.env.MOSQUITTO_HOST || "localhost",
    port: parseInt(process.env.MQTT_PORT || "1883", 10),
    user: process.env.MOSQUITTO_USER || "smarthome",
    pass: process.env.MOSQUITTO_PASS,
    baseTopic: "home/hsb1/pidicon-light",
    logger,
  };

  if (!mqttConfig.pass) {
    logger.warn(
      "[MQTT] MOSQUITTO_PASS not set — MQTT disabled (display still works).",
    );
    return null;
  }

  const svc = new MqttService(mqttConfig);

  try {
    await svc.connect();
    svc.startPeriodicPublish(30000);
    return svc;
  } catch (error) {
    // MQTT failure is non-fatal — display still works without it
    logger.error(`[MQTT] Connection failed, continuing without MQTT`, error);
    return null;
  }
}

/**
 * Create driver + render loop for a single device, start the loop.
 * Returns the loop instance, or null if the device cannot be started.
 */
async function startDevice(device) {
  logger.info(
    `[pidicon-light] Starting device: ${device.name} (${device.type} @ ${device.ip})`,
  );

  let driver;
  if (device.type === "ulanzi") {
    driver = new UlanziDriver(device.ip, {
      appName: `pidicon_${device.name}`,
      logger,
    });
  } else if (device.type === "pixoo") {
    driver = new PixooDriver(device.ip, { logger });
  } else {
    logger.warn(
      `[pidicon-light] Unknown device type "${device.type}" — skipping ${device.name}`,
    );
    return null;
  }

  const initialized = await driver.initialize();
  if (!initialized) {
    logger.warn(
      `[pidicon-light] Device ${device.name} not reachable — will retry via render loop backoff`,
    );
    if (mqttService) mqttService.updateDeviceStatus(device.name, "unreachable");
    // Don't bail out — the render loop will keep retrying with backoff
  } else {
    if (mqttService) mqttService.updateDeviceStatus(device.name, "ok");
  }

  const loop = new RenderLoop(driver, sceneLoader, device.scenes, {
    logger,
    deviceName: device.name,
    mqttService,
  });

  renderLoops.push({ device, loop });

  // start() runs forever; errors are caught inside the loop with backoff.
  // The only way it ever rejects is a truly unexpected throw — log and update MQTT.
  loop.start().catch((err) => {
    logger.error(
      `[pidicon-light] Render loop for ${device.name} exited unexpectedly`,
      err,
    );
    if (mqttService) {
      mqttService.recordError(err);
      mqttService.updateDeviceStatus(device.name, "failed");
    }
  });

  return loop;
}

async function stopAllDevices() {
  logger.info(`[pidicon-light] Stopping ${renderLoops.length} device(s)...`);
  for (const { loop, device } of renderLoops) {
    loop.stop();
    if (mqttService) mqttService.updateDeviceStatus(device.name, "offline");
  }
  renderLoops = [];
}

/**
 * Hot-reload handler — called by ConfigWatcher with the raw file content.
 * Re-parses and validates before applying; errors leave the old config running.
 */
async function reloadConfig(newConfigContent) {
  logger.info("[pidicon-light] Config change detected, reloading...");
  try {
    // Validate before touching anything running
    const loader = new ConfigLoader(configPath);
    const newConfig = loader.parse(newConfigContent);

    await stopAllDevices();
    await sceneLoader.clearCache(); // destroy() hooks + re-import from disk

    // Re-create SceneLoader with new config's scenes map
    const configDir = dirname(configPath);
    sceneLoader = new SceneLoader(configDir, newConfig.scenes, {
      logger,
      mqttService,
    });

    for (const device of newConfig.devices) {
      await startDevice(device);
    }

    if (mqttService) mqttService.publishConfig(newConfig);

    logger.info("[pidicon-light] Config reloaded successfully");
  } catch (error) {
    logger.error(
      "[pidicon-light] Config reload failed — keeping previous state",
      error,
    );
  }
}

async function shutdown(signal) {
  logger.info(
    `[pidicon-light] Received ${signal}, shutting down gracefully...`,
  );

  if (configWatcher) await configWatcher.stop();

  await stopAllDevices();

  if (mqttService) {
    mqttService.setRunning(false);
    await mqttService.disconnect();
  }

  process.exit(0);
}

async function main() {
  logger.info("[pidicon-light] Starting...");

  // Resolve config path once; shared with reloadConfig() via module scope
  configPath =
    process.env.PIDICON_CONFIG_PATH || join(__dirname, "../config.json");

  const configLoader = new ConfigLoader(configPath);
  const config = await configLoader.load();
  logger.info(
    `[pidicon-light] Loaded config: ${config.devices.length} device(s), ${Object.keys(config.scenes).length} scene(s)`,
  );

  // MQTT — optional; failures are non-fatal
  mqttService = await initializeMqtt();
  if (mqttService) {
    mqttService.publishConfig(config);
    mqttService.setRunning(true);
    mqttService.updateStatus("ok");
  }

  // SceneLoader resolves paths relative to config file's directory
  // so ./scenes/clock.js works both locally and in /data volume
  const configDir = dirname(configPath);
  sceneLoader = new SceneLoader(configDir, config.scenes, {
    logger,
    mqttService,
  });

  for (const device of config.devices) {
    await startDevice(device);
  }

  // Watch config for hot reload
  configWatcher = new ConfigWatcher(configPath, reloadConfig, { logger });
  await configWatcher.start();

  // Handle both SIGINT (Ctrl+C) and SIGTERM (Docker stop)
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  logger.info("[pidicon-light] Running. Send SIGINT or SIGTERM to stop.");
}

main().catch((err) => {
  logger.error("[pidicon-light] Fatal startup error", err);
  process.exit(1);
});
