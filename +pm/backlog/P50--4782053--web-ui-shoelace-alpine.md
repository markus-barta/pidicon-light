# web-ui-shoelace-alpine

**Priority**: P50
**Status**: In Progress
**Created**: 2026-03-10

---

## Problem

No way to edit config without SSH + file editing. Need a basic local-network admin UI.

## Solution

Lightweight web server (Node built-in `http`) served from the container on port 8080.
Stack: **Shoelace** (web components, beautiful) + **Alpine.js** (reactivity) — both CDN, no build step.

## Scope

- Per-device scene list: reorder, remove, add from known scenes or new path
- Per-device mode control: play / pause / stop (via MQTT or render loop direct)
- Write strategy: **both** — write `config.json` directly (triggers hot-reload) AND MQTT overlay for runtime-only changes
- All devices shown (Ulanzi + Pixoo)
- Mobile-friendly automatically via Shoelace

## Implementation

- [ ] `lib/web-server.js` — HTTP server, GET `/api/config`, POST `/api/config`, GET `/`
- [ ] Inline single-page HTML (Shoelace + Alpine CDN, no static files)
- [ ] `sl-card` per device, `sl-tag` (removable) per scene, `sl-button-group` play/pause/stop
- [ ] `sl-select` + `sl-option` for known scenes, `sl-input` for new scene path
- [ ] `sl-tab-group` — "File config" vs "MQTT overlay" tabs
- [ ] Hook into `src/index.js` — start web server after config load
- [ ] Expose port 8080 in Dockerfile + docker-compose
- [ ] Major version bump: 0.1.0 → 1.0.0

## Acceptance Criteria

- [ ] Page loads on mobile without horizontal scroll
- [ ] Changing scene list and saving triggers hot-reload (no container restart)
- [ ] Play/pause/stop buttons work per device
- [ ] No auth needed (local network only)

## Notes

- Shoelace event names prefixed `sl-` (e.g. `sl-change`) — Alpine.js gotcha
- Shadow DOM: use Shoelace CSS custom properties for theming, not global CSS
- Port: `8080` default, override via `WEB_PORT` env var
