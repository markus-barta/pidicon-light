/**
 * MQTT Service for pidicon-light
 * Handles health, state, and config publishing
 */

import mqtt from "mqtt";

export class MqttService {
  constructor(options = {}) {
    this.host = options.host || "localhost";
    this.port = options.port || 1883;
    this.user = options.user || "smarthome";
    this.pass = options.pass;
    this.baseTopic = options.baseTopic || "home/hsb1/pidicon-light";
    this.logger = options.logger || console;

    this.client = null;
    this.connected = false;
    this.publishInterval = null;

    // State tracking
    this.state = {
      running: false,
      currentScene: null,
      startTime: null,
      devices: [],
    };

    this.health = {
      status: "unknown",
      errorCount: 0,
      lastError: null,
      devices: [],
    };
  }

  async connect() {
    const url = `mqtt://${this.host}:${this.port}`;
    this.logger.info(`[MQTT] Connecting to ${url}...`);

    this.client = mqtt.connect(url, {
      clientId: `pidicon-light-${Date.now()}`,
      username: this.user,
      password: this.pass,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    });

    // Persistent lifecycle handlers (survive reconnects)
    this.client.on("connect", () => {
      this.connected = true;
      this.logger.info("[MQTT] Connected");
      this.publishHealth();
    });

    this.client.on("error", (error) => {
      this.connected = false;
      this.logger.error(`[MQTT] Error: ${error.message}`);
    });

    this.client.on("offline", () => {
      this.connected = false;
      this.logger.warn("[MQTT] Offline — will reconnect automatically");
    });

    this.client.on("reconnect", () => {
      this.logger.info("[MQTT] Reconnecting...");
    });

    // Wait only for the *initial* connection attempt
    return new Promise((resolve, reject) => {
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        this.client.removeListener("connect", onConnect);
        this.client.removeListener("error", onError);
      };

      this.client.once("connect", onConnect);
      this.client.once("error", onError);
    });
  }

  async disconnect() {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
    }

    if (this.client) {
      return new Promise((resolve) => {
        this.client.end(() => {
          this.connected = false;
          this.logger.info("[MQTT] Disconnected");
          resolve();
        });
      });
    }
  }

  publish(topic, message, retain = false) {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const fullTopic = `${this.baseTopic}/${topic}`;
      const payload =
        typeof message === "object" ? JSON.stringify(message) : message;

      this.client.publish(fullTopic, payload, { retain }, (err) => {
        if (err) {
          this.logger.error(`[MQTT] Publish failed: ${err.message}`);
        }
      });

      return true;
    } catch (error) {
      this.logger.error(`[MQTT] Publish error: ${error.message}`);
      return false;
    }
  }

  publishHealth() {
    const health = {
      status: this.health.status,
      timestamp: new Date().toISOString(),
      devices: this.health.devices,
      errorCount: this.health.errorCount,
      lastError: this.health.lastError,
    };

    return this.publish("health", health, true);
  }

  publishState() {
    const state = {
      running: this.state.running,
      currentScene: this.state.currentScene,
      uptime: this.state.startTime
        ? Math.floor((Date.now() - this.state.startTime) / 1000)
        : 0,
      devices: this.state.devices,
    };

    return this.publish("state", state, true);
  }

  publishConfig(config) {
    const configInfo = {
      configPath: config.configPath || "unknown",
      deviceCount: config.devices?.length || 0,
      sceneCount: Object.keys(config.scenes || {}).length,
      timestamp: new Date().toISOString(),
    };

    return this.publish("config", configInfo, true);
  }

  setRunning(running) {
    this.state.running = running;
    if (running && !this.state.startTime) {
      this.state.startTime = Date.now();
    }
    this.publishState();
  }

  setCurrentScene(sceneName) {
    this.state.currentScene = sceneName;
    this.publishState();
  }

  updateDeviceStatus(deviceName, status, lastSeen = null) {
    const existing = this.health.devices.findIndex(
      (d) => d.name === deviceName,
    );
    const deviceInfo = {
      name: deviceName,
      status,
      lastSeen: lastSeen || new Date().toISOString(),
    };

    if (existing >= 0) {
      this.health.devices[existing] = deviceInfo;
    } else {
      this.health.devices.push(deviceInfo);
    }

    this.publishHealth();
  }

  updateDeviceState(deviceName, scene, frameCount) {
    const existing = this.state.devices.findIndex((d) => d.name === deviceName);
    const deviceInfo = {
      name: deviceName,
      scene,
      frameCount,
    };

    if (existing >= 0) {
      this.state.devices[existing] = deviceInfo;
    } else {
      this.state.devices.push(deviceInfo);
    }

    this.publishState();
  }

  recordError(error) {
    this.health.errorCount++;
    this.health.lastError = {
      message: error.message,
      timestamp: new Date().toISOString(),
    };

    // Update status based on error count
    if (this.health.errorCount >= 10) {
      this.health.status = "failed";
    } else if (this.health.errorCount > 0) {
      this.health.status = "degraded";
    } else {
      this.health.status = "ok";
    }

    this.publishHealth();
  }

  /**
   * Explicitly set the overall health status string.
   * @param {'ok'|'degraded'|'failed'|'unknown'} status
   */
  updateStatus(status) {
    this.health.status = status;
    this.publishHealth();
  }

  resetHealth() {
    this.health.errorCount = 0;
    this.health.lastError = null;
    this.health.status = "ok";
    this.publishHealth();
  }

  startPeriodicPublish(intervalMs = 30000) {
    // Clear any existing interval first
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = null;
    }

    this.publishInterval = setInterval(() => {
      this.publishHealth();
      this.publishState();
    }, intervalMs);

    this.logger.info(`[MQTT] Starting periodic publish every ${intervalMs}ms`);
  }
}

export default MqttService;
