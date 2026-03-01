/**
 * Scene loader
 *
 * Resolves scene names → file paths using the scenes map from config.json,
 * then dynamically imports the module.
 *
 * Path resolution:
 *   - Scene paths in config are relative to the config file's directory.
 *   - Example: config at /data/config.json + path ./scenes/clock.js
 *             → /data/scenes/clock.js
 *
 * This means the same config works locally (./config.json) and in Docker
 * (/data/config.json) without any code changes.
 */

import { resolve } from "path";

export class SceneLoader {
  /**
   * @param {string} baseDir           - Absolute path to config file's directory
   * @param {Object} scenesMap         - scenes section from config.json (name → {path, ...})
   * @param {Object} options
   * @param {Object} options.logger
   * @param {Object} options.mqttService  - MqttService instance for scene context
   * @param {string} options.deviceName   - Device name (e.g. "ulanzi-56"), used in MQTT topic paths
   */
  constructor(baseDir, scenesMap, options = {}) {
    this.baseDir = baseDir;
    this.scenesMap = scenesMap || {};
    this.logger = options.logger || console;
    this.mqtt = options.mqttService || null;
    this.cache = new Map(); // sceneName → { scene, deviceName }
  }

  /**
   * Load a scene by name.
   * The name must be a key in the scenes map from config.json.
   *
   * @param {string} sceneName  - Scene name (e.g. "clock_with_homestats")
   * @param {string} deviceName - Device loading the scene (e.g. "ulanzi-56")
   * @returns {Promise<Object>} Scene module with a render() function
   */
  async load(sceneName, deviceName = "unknown") {
    if (this.cache.has(sceneName)) {
      return this.cache.get(sceneName).scene;
    }

    const sceneConfig = this.scenesMap[sceneName];
    if (!sceneConfig) {
      throw new Error(
        `Scene "${sceneName}" not found in config. Available: ${Object.keys(this.scenesMap).join(", ")}`,
      );
    }

    if (!sceneConfig.path) {
      throw new Error(
        `Scene "${sceneName}" config is missing required "path" field`,
      );
    }

    // Resolve relative to config dir so /data/scenes/clock.js works in Docker
    const absolutePath = resolve(this.baseDir, sceneConfig.path);

    this.logger.debug(
      `[SceneLoader] Loading "${sceneName}" from ${absolutePath}`,
    );

    try {
      // Dynamic import requires a file:// URL on some platforms
      const mod = await import(absolutePath);
      const scene = mod.default || mod;

      if (!scene.render || typeof scene.render !== "function") {
        throw new Error(
          `Scene "${sceneName}" (${absolutePath}) is missing a render() function`,
        );
      }

      this.cache.set(sceneName, { scene, deviceName });
      this.logger.info(
        `[SceneLoader] Loaded scene "${sceneName}" for device "${deviceName}"`,
      );

      // Call optional lifecycle hook so scene can subscribe to MQTT etc.
      if (typeof scene.init === "function") {
        const ctx = this._buildContext(sceneName, deviceName);
        await scene.init(ctx);
        this.logger.debug(`[SceneLoader] init() called for "${sceneName}"`);
      }

      return scene;
    } catch (error) {
      this.logger.error(
        `[SceneLoader] Failed to load scene "${sceneName}"`,
        error,
      );
      throw error;
    }
  }

  /**
   * Clear the module cache (call on config reload so scenes re-import from disk).
   * Calls destroy() on any cached scene that implements it so subscriptions are cleaned up.
   */
  async clearCache() {
    for (const [sceneName, { scene, deviceName }] of this.cache) {
      if (typeof scene.destroy === "function") {
        try {
          const ctx = this._buildContext(sceneName, deviceName);
          await scene.destroy(ctx);
          this.logger.debug(
            `[SceneLoader] destroy() called for "${sceneName}"`,
          );
        } catch (err) {
          this.logger.error(
            `[SceneLoader] destroy() failed for "${sceneName}"`,
            err,
          );
        }
      }
    }
    this.cache.clear();
    this.logger.debug("[SceneLoader] Cache cleared");
  }

  /**
   * Build a context object passed to scene lifecycle hooks.
   *
   * Context shape:
   *   context.logger         - logger instance
   *   context.deviceName     - e.g. "ulanzi-56"
   *   context.sceneName      - e.g. "clock_with_homestats"
   *   context.settingsTopic  - "pidicon-light/ulanzi-56/clock_with_homestats/settings"
   *   context.mqtt.subscribe(topic, cb)   - subscribe to raw MQTT topic
   *   context.mqtt.unsubscribeAll()       - unsubscribe all topics for this scene
   *
   * @param {string} sceneName
   * @returns {Object} context
   */
  _buildContext(sceneName, deviceName) {
    const settingsTopic = `pidicon-light/${deviceName}/${sceneName}/settings`;

    return {
      logger: this.logger,
      deviceName,
      sceneName,
      settingsTopic,
      mqtt: this.mqtt
        ? this.mqtt.getSceneContext(sceneName)
        : {
            subscribe: () =>
              this.logger.warn(
                `[SceneLoader] MQTT not available for scene "${sceneName}"`,
              ),
            unsubscribeAll: () => {},
          },
    };
  }
}

export default SceneLoader;
