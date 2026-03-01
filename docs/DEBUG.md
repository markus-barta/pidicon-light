# pidicon-light — Settings & Debug Reference

All topics are **retained** — they survive container restarts and stay active until cleared.

**Broker:** `192.168.1.101:1883`  
**Auth:** `MOSQUITTO_USER` / `MOSQUITTO_PASS` from agenix

---

## Settings Topics

Device+scene scoped: `pidicon-light/<device>/<scene>/settings/<key>`

For the kids bedroom display:

| Topic                                                                    | Default | Range | Description              |
| ------------------------------------------------------------------------ | ------- | ----- | ------------------------ |
| `pidicon-light/ulanzi-56/clock_with_homestats/settings/day_start_hour`   | `7`     | 0–23  | Hour day mode begins     |
| `pidicon-light/ulanzi-56/clock_with_homestats/settings/night_start_hour` | `19`    | 0–23  | Hour night mode begins   |
| `pidicon-light/ulanzi-56/clock_with_homestats/settings/bri_day`          | `20`    | 1–255 | Brightness in day mode   |
| `pidicon-light/ulanzi-56/clock_with_homestats/settings/bri_night`        | `8`     | 1–255 | Brightness in night mode |

### Settings curl commands

```bash
# Set day start to 08:00
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/ulanzi-56/clock_with_homestats/settings/day_start_hour' -m '8' -r

# Set night start to 20:00
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/ulanzi-56/clock_with_homestats/settings/night_start_hour' -m '20' -r

# Set day brightness to 30
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/ulanzi-56/clock_with_homestats/settings/bri_day' -m '30' -r

# Set night brightness to 5
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/ulanzi-56/clock_with_homestats/settings/bri_night' -m '5' -r

# Reset to defaults (clear retained)
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/ulanzi-56/clock_with_homestats/settings/day_start_hour' -m '' -r
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/ulanzi-56/clock_with_homestats/settings/night_start_hour' -m '' -r
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/ulanzi-56/clock_with_homestats/settings/bri_day' -m '' -r
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/ulanzi-56/clock_with_homestats/settings/bri_night' -m '' -r
```

---

## Debug Override Topics

Global (not device/scene scoped — temporary testing only).  
Clear any override with empty payload `""` to revert to real/settings values.

| Topic                               | Values                                        | Description                          |
| ----------------------------------- | --------------------------------------------- | ------------------------------------ |
| `pidicon-light/debug/mode_override` | `day` / `night` / `""`                        | Force day or night mode              |
| `pidicon-light/debug/bri_override`  | `1–255` / `""`                                | Override brightness (beats settings) |
| `pidicon-light/debug/battery_pct`   | `0–100` / `""`                                | Override battery SOC                 |
| `pidicon-light/debug/battery_state` | `charging` / `discharging` / `standby` / `""` | Override charge state                |

### Debug curl commands

```bash
# Force night mode
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/debug/mode_override' -m 'night' -r

# Force day mode
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/debug/mode_override' -m 'day' -r

# Clear mode override (back to time-based)
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/debug/mode_override' -m '' -r

# Force brightness to 15
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/debug/bri_override' -m '15' -r

# Clear brightness override
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/debug/bri_override' -m '' -r

# Set battery to 10% discharging (test red low battery)
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/debug/battery_pct' -m '10' -r
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/debug/battery_state' -m 'discharging' -r

# Set battery to 80% charging (test green nub-top)
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/debug/battery_pct' -m '80' -r
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/debug/battery_state' -m 'charging' -r

# Clear all battery overrides
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/debug/battery_pct' -m '' -r
mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
  -t 'pidicon-light/debug/battery_state' -m '' -r

# Clear ALL debug overrides at once
for topic in mode_override bri_override battery_pct battery_state; do
  mosquitto_pub -h 192.168.1.101 -u smarthome -P PASS \
    -t "pidicon-light/debug/$topic" -m '' -r
done
```

---

## Night Mode Spec

| Feature          | Day                    | Night                   |
| ---------------- | ---------------------- | ----------------------- |
| Time format      | `HH:MM:SS`             | `HH:MM`                 |
| Time x-position  | x1                     | x7 (+6px right)         |
| Brightness       | `bri_day` (default 20) | `bri_night` (default 8) |
| Max sensor color | 255/channel            | ~40/channel             |
| Time color       | Warm white             | Dim warm red            |
| Battery fill     | Bright green/red       | Extremely dim           |

---

## Priority Order

When multiple values are set, this is the priority (highest first):

```
debug override  >  settings (MQTT retained)  >  hardcoded default
```

So `bri_override=15` beats `bri_night=8` beats the default `8`.
