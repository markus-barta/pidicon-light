/**
 * Clock scene for AWTRIX 32x8 display
 * Shows current time as HH:MM:SS, updates every second
 */

export default {
  name: "clock",
  pretty_name: "Clock",
  deviceType: "ulanzi",
  description: "Digital clock HH:MM:SS",

  settingsSchema: {
    text_color: {
      type: "color",
      label: "Text Color",
      group: "Display",
      default: "#00FF00",
    },
    show_seconds: {
      type: "boolean",
      label: "Show Seconds",
      group: "Display",
      default: true,
    },
    center: {
      type: "boolean",
      label: "Center Text",
      group: "Layout",
      default: true,
    },
    refresh_ms: {
      type: "int",
      label: "Refresh Interval (ms)",
      group: "Timing",
      default: 1000,
      min: 100,
      max: 10000,
      step: 100,
    },
  },

  async render(device) {
    const settings = this._settings || {
      text_color: "#00FF00",
      show_seconds: true,
      center: true,
      refresh_ms: 1000,
    };
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    const text = settings.show_seconds ? `${h}:${m}:${s}` : `${h}:${m}`;

    await device.drawCustom({
      text,
      color: settings.text_color,
      center: settings.center,
    });

    return settings.refresh_ms;
  },

  async init(context) {
    this._settings = context.settings.all();
    this._unsubscribeSettings = context.settings.subscribe((values) => {
      this._settings = values;
    });
  },

  async destroy() {
    this._unsubscribeSettings?.();
  },
};
