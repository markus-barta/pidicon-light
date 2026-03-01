/**
 * Render loop — drives scene execution for a single device.
 *
 * Error handling strategy:
 *   - Each failed render attempt increments a consecutive-error counter.
 *   - Backoff doubles per failure: 1s → 2s → 4s → … → 10 min (cap).
 *   - After 10 consecutive errors the circuit opens: the loop sleeps for
 *     the full backoff before attempting the next scene frame.
 *   - A single successful render resets the counter and backoff to defaults.
 *
 * CPU protection:
 *   - All waits use async sleep (setTimeout) — never busy-loops.
 *   - Even with a completely dead device the loop sits idle at 10 min
 *     intervals, not hammering the network or CPU.
 */

export class RenderLoop {
  /**
   * @param {Object}      driver      - Device driver (UlanziDriver or compatible)
   * @param {SceneLoader} sceneLoader - Scene loader instance
   * @param {string[]}    scenes      - Ordered array of scene names
   * @param {Object}      options
   * @param {Object}      options.logger      - Logger instance
   * @param {string}      options.deviceName  - Device name for log context
   * @param {Object}      [options.mqttService] - Optional MQTT service for state updates
   */
  constructor(driver, sceneLoader, scenes, options = {}) {
    this.driver = driver;
    this.sceneLoader = sceneLoader;
    this.scenes = (scenes || []).filter(Boolean);
    this.logger = options.logger || console;
    this.deviceName = options.deviceName || "unknown";
    this.mqtt = options.mqttService || null;

    // State
    this.running = false;
    this.currentIndex = 0;

    // Error / backoff tracking
    this.consecutiveErrors = 0;
    this.maxErrors = 10;
    this.initialBackoff = 1000;
    this.maxBackoff = 600_000; // 10 minutes
    this.currentBackoff = this.initialBackoff;

    // Stats (exposed for MQTT state publishing)
    this.frameCount = 0;
    this.currentScene = null;
    this.lastSuccessTime = null;
  }

  // ---------------------------------------------------------------------------

  /**
   * Start the render loop. Runs until stop() is called.
   * Never throws — all errors are caught and handled internally.
   */
  async start() {
    if (this.scenes.length === 0) {
      this.logger.warn(
        `[RenderLoop:${this.deviceName}] No scenes configured — idle`,
      );
      return;
    }

    this.running = true;
    this.logger.info(
      `[RenderLoop:${this.deviceName}] Started with scenes: [${this.scenes.join(", ")}]`,
    );

    while (this.running) {
      const sceneName = this.scenes[this.currentIndex];
      await this._runScene(sceneName);

      // Advance to next scene only when no active errors
      // (retry same scene on failure so transient errors don't skip scenes)
      if (this.running && this.consecutiveErrors === 0) {
        this.currentIndex = (this.currentIndex + 1) % this.scenes.length;
      }
    }
  }

  /**
   * Signal the loop to stop after the current sleep/render completes.
   */
  stop() {
    this.running = false;
    this.logger.info(
      `[RenderLoop:${this.deviceName}] Stop requested (frames rendered: ${this.frameCount})`,
    );
  }

  // ---------------------------------------------------------------------------

  async _runScene(sceneName) {
    // --- Circuit breaker check -------------------------------------------
    if (this.consecutiveErrors >= this.maxErrors) {
      this.logger.warn(
        `[RenderLoop:${this.deviceName}] Circuit open after ${this.consecutiveErrors} errors. ` +
          `Sleeping ${this.currentBackoff}ms before retry...`,
      );
      await this._sleep(this.currentBackoff);
      // Reset so we attempt again; if it fails the counter climbs again
      this.consecutiveErrors = 0;
      this.currentBackoff = this.initialBackoff;
      return;
    }

    // --- Load scene --------------------------------------------------------
    let scene;
    try {
      scene = await this.sceneLoader.load(sceneName);
    } catch (loadError) {
      this._handleError(loadError, `loading scene "${sceneName}"`);
      await this._sleep(this.currentBackoff);
      return;
    }

    this.currentScene = sceneName;

    // --- Frame loop --------------------------------------------------------
    let result;
    do {
      if (!this.running) break;

      try {
        result = await scene.render(this.driver);

        // Success path
        this._handleSuccess();

        if (typeof result === "number" && result > 0) {
          await this._sleep(result);
        }
      } catch (renderError) {
        this._handleError(renderError, `rendering scene "${sceneName}"`);

        // Apply backoff and break the inner frame loop on any render error;
        // the outer while-loop will retry from the circuit-breaker check.
        await this._sleep(this.currentBackoff);
        break;
      }
    } while (this.running && result !== null);
  }

  // ---------------------------------------------------------------------------

  _handleSuccess() {
    if (this.consecutiveErrors > 0) {
      this.logger.info(
        `[RenderLoop:${this.deviceName}] Recovered after ${this.consecutiveErrors} error(s)`,
      );
    }

    this.consecutiveErrors = 0;
    this.currentBackoff = this.initialBackoff;
    this.frameCount++;
    this.lastSuccessTime = Date.now();

    // Throttle MQTT state updates: only every 100 frames to avoid flooding
    if (this.mqtt && this.frameCount % 100 === 0) {
      this.mqtt.updateDeviceState(
        this.deviceName,
        this.currentScene,
        this.frameCount,
      );
    }
  }

  _handleError(error, context) {
    this.consecutiveErrors++;
    // Double backoff each time, capped at maxBackoff
    this.currentBackoff = Math.min(this.currentBackoff * 2, this.maxBackoff);

    const level = this.consecutiveErrors >= this.maxErrors ? "error" : "warn";
    this.logger[level](
      `[RenderLoop:${this.deviceName}] Error ${context}: ${error.message}. ` +
        `Consecutive: ${this.consecutiveErrors}/${this.maxErrors}, next wait: ${this.currentBackoff}ms`,
    );

    if (this.mqtt) {
      this.mqtt.recordError(error);
      if (this.consecutiveErrors >= this.maxErrors) {
        this.mqtt.updateDeviceStatus(this.deviceName, "failed");
      } else {
        this.mqtt.updateDeviceStatus(this.deviceName, "degraded");
      }
    }
  }

  // ---------------------------------------------------------------------------

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** For external status inspection (e.g. debugging). */
  getStatus() {
    return {
      running: this.running,
      currentScene: this.currentScene,
      frameCount: this.frameCount,
      consecutiveErrors: this.consecutiveErrors,
      currentBackoff: this.currentBackoff,
      lastSuccessTime: this.lastSuccessTime,
    };
  }
}

export default RenderLoop;
