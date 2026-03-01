# pidicon-light

Minimalist pixel display controller for AWTRIX/Ulanzi 32x8 LED matrices. Config-file driven, no Web UI.

## Features

- **Config-driven**: JSON configuration, version-controlled and testable
- **MQTT monitoring**: Health, state, and config topics
- **Error handling**: Exponential backoff (1s→10min), circuit breaker (10 errors max)
- **Hot reload**: Config file watcher for seamless updates
- **Multi-device**: Support for multiple Ulanzi displays
- **Docker ready**: Containerized deployment with health checks

## Quick Start

### Local Development

```bash
npm install
cp config.example.json config.json
npm start
```

### Docker

```bash
docker build -t pidicon-light:latest .
docker run -d --name pidicon-light --network host \
  -e MQTT_PASS=<password> \
  -v ./config.json:/data/config.json:ro \
  pidicon-light:latest
```

## Configuration

### config.json

```json
{
  "devices": [
    {
      "name": "ulanzi-56",
      "type": "ulanzi",
      "ip": "192.168.1.56",
      "scenes": ["clock", "test-pattern"]
    }
  ],
  "scenes": {
    "clock": { "path": "./scenes/clock.js" },
    "test-pattern": { "path": "./scenes/test-pattern.js" }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MQTT_HOST` | localhost | MQTT broker |
| `MQTT_PORT` | 1883 | MQTT port |
| `MQTT_USER` | smarthome | MQTT user |
| `MQTT_PASS` | - | MQTT password (required) |
| `LOG_LEVEL` | info | error/warn/info/debug |
| `TZ` | Europe/Vienna | Timezone |

## MQTT Topics

- `home/hsb1/pidicon-light/health` - Health status (retained)
- `home/hsb1/pidicon-light/state` - Running state (retained)
- `home/hsb1/pidicon-light/config` - Config info (retained)

## Creating Scenes

```javascript
export default {
  name: 'my-scene',
  async render(device) {
    await device.drawCustom({
      text: 'Hello',
      color: '#00FF00',
      center: true,
    });
    return 1000; // Update every second
  }
};
```

### Device API

- `drawCustom(appData)` - Draw with AWTRIX API
- `clear()` - Clear display
- `setPower(on/off)` - Power control
- `setBrightness(0-255)` - Brightness
- `getStats()` - Device stats
- `switchToApp(name)` - Switch to built-in app

See `docs/AWTRIX-API.md` for full API.

## Deployment on hsb1

### 1. Secrets (agenix)

```bash
# /home/mba/secrets/pidicon-light.env
MQTT_PASS=<password>
```

### 2. docker-compose.yml

```yaml
pidicon-light:
  image: ghcr.io/markus-barta/pidicon-light:latest
  container_name: pidicon-light
  network_mode: host
  restart: unless-stopped
  environment:
    - TZ=Europe/Vienna
    - MQTT_HOST=localhost
    - MQTT_USER=smarthome
  env_file:
    - /home/mba/secrets/pidicon-light.env
  volumes:
    - ./mounts/pidicon-light/data:/data
  labels:
    - "com.centurylinklabs.watchtower.enable=true"
    - "com.centurylinklabs.watchtower.scope=weekly"
```

### 3. Deploy

```bash
ssh mba@hsb1.lan
mkdir -p ~/docker/mounts/pidicon-light
# Copy config.json and scenes/
cd ~/docker && docker compose up -d pidicon-light
docker logs -f pidicon-light
```

## Error Handling

- Backoff: 1s → 2s → 4s → ... → 10min
- Circuit breaker: 10 errors max
- Status: ok → degraded → failed

## License

AGPL-3.0 | Markus Barta
