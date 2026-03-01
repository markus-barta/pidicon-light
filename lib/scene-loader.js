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
   * @param {string} baseDir    - Absolute path to config file's directory
   * @param {Object} scenesMap  - scenes section from config.json (name → {path, ...})
   * @param {Object} options
   * @param {Object} options.logger
   */
  constructor(baseDir, scenesMap, options = {}) {
    this.baseDir = baseDir;
    this.scenesMap = scenesMap || {};
    this.logger = options.logger || console;
    this.cache = new Map();
  }

  /**
   * Load a scene by name.
   * The name must be a key in the scenes map from config.json.
   *
   * @param {string} sceneName - Scene name (e.g. "clock")
   * @returns {Promise<Object>} Scene module with a render() function
   */
  async load(sceneName) {
    if (this.cache.has(sceneName)) {
      return this.cache.get(sceneName);
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

      this.cache.set(sceneName, scene);
      this.logger.info(`[SceneLoader] Loaded scene "${sceneName}"`);
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
   */
  clearCache() {
    this.cache.clear();
    this.logger.debug("[SceneLoader] Cache cleared");
  }
}

export default SceneLoader;
