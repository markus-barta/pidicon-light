# Deploy Guide

## Server

| What       | Value                                       |
| ---------- | ------------------------------------------- |
| Host       | `hsb1` (SSH as `mba@hsb1`)                  |
| Mount root | `~/docker/mounts/pidicon-light/`            |
| Compose    | `~/docker/docker-compose.yml`               |
| Image      | `ghcr.io/markus-barta/pidicon-light:latest` |

## Volume mounts (in container)

| Host path                                | Container path                |
| ---------------------------------------- | ----------------------------- |
| `mounts/pidicon-light/config.json`       | `/data/config.json` (rw)      |
| `mounts/pidicon-light/scenes/`           | `/app/scenes/` (ro)           |
| `mounts/pidicon-light/generated-scenes/` | `/data/generated-scenes` (rw) |

Scene paths in `config.json` use `/app/scenes/` — the mount overlay takes effect, so files in the host `scenes/` folder shadow the built-in image scenes.
Generated or detached scene copies should use `./generated-scenes/<name>.js` so they persist across container recreates.

---

## Deploy paths

### 1. Scene file changed (`scenes/*.js`)

```bash
scp scenes/<name>.js mba@hsb1:~/docker/mounts/pidicon-light/scenes/
# ScenesWatcher detects the change and hot-reloads within seconds.
# No container restart needed.
```

### 1b. PNG asset changed (`assets/pixoo/*.png`)

Scenes reference PNG assets via paths that resolve relative to the **mounted scene file**, so
assets must be synced to the host mount AND the image must be updated (since `assets/` is baked
into the image as a fallback):

```bash
scp assets/pixoo/nuki-*.png mba@hsb1:~/docker/mounts/pidicon-light/assets/pixoo/
# Also push + pull image so the new assets are baked in:
git add assets/ && git commit -m "update assets" && git push
ssh mba@hsb1 "cd ~/docker && docker compose pull pidicon-light && docker compose up -d pidicon-light"
```

### 2. Config changed (`config.json`)

```bash
scp config.json mba@hsb1:~/docker/mounts/pidicon-light/config.json
```

ConfigWatcher picks it up automatically. No restart needed.

Important: `config.json` must be mounted writable, because the web UI persists edits from inside the container.

### 3. Core code changed (`src/`, `lib/`, `package.json`, `Dockerfile`)

Push to `main` — GitHub Actions builds and pushes to GHCR automatically:

```bash
git push origin main
# Watch: gh run watch
```

Watchtower (weekly scope) will pull and restart the container automatically.
To deploy immediately without waiting for Watchtower:

```bash
ssh mba@hsb1 "cd ~/docker && docker compose pull pidicon-light && docker compose up -d pidicon-light"
```

Workflow: `.github/workflows/build-and-push.yml`
Image: `ghcr.io/markus-barta/pidicon-light:latest`
Platforms: `linux/amd64`, `linux/arm64`

---

## Useful ops

```bash
# Logs (live)
ssh mba@hsb1 "docker logs -f pidicon-light"

# Restart
ssh mba@hsb1 "cd ~/docker && docker compose restart pidicon-light"

# Container status
ssh mba@hsb1 "docker ps | grep pidicon"
```
