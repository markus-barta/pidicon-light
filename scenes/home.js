/**
 * home — Pixoo64 home stats display
 *
 * Device: Pixoo64 (64×64) via PixooDriver
 * Render interval: 10s
 */

export const name = "home";

export async function render(device) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const timeStr = `${hh}:${mm}`;

  device.clear();

  // Time — top right, warm white
  await device.drawTextRgbaAligned(timeStr, [63, 1], [255, 220, 180, 255], "right");

  await device.push();
  return 10_000;
}
