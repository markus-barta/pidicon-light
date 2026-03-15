# fix-stale-mqtt-wildcard-cleanup-on-scene-reload

**Priority**: A10
**Status**: In Progress
**Created**: 2026-03-15

---

## Problem

Wildcard MQTT subscriptions (`nuki/.../#`, `z2m/.../#`) used by the Pixoo
`home` scene become permanently stale after any scene destroy/reload cycle
(hot-reload, config save, settings save, stop/start). The self-heal loop
re-subscribes forever but callbacks never resolve because they mutate a
dead scene instance's state object.

## Root Cause

`unsubscribeAll(sceneName)` in `lib/mqtt-service.js` only cleaned up
exact-topic entries from `_topicEntries`. It completely ignored wildcard
entries in `_wildcardEntries`.

After scene destroy + re-create:

- old wildcard `sharedHandler` stays on MQTT client
- old `callbacks` map retains dead scene reference
- new scene adds its callback to the same stale entry
- retained replay arrives but dispatches to old dead callback
- new scene state stays `null` forever

## Solution

`unsubscribeAll()` now also iterates `_wildcardEntries` and removes the
scene's callback. If no logical owners remain, it removes the shared
handler and broker subscription.

## Implementation

- [x] Fix `unsubscribeAll()` in `lib/mqtt-service.js` to clean up `_wildcardEntries`
- [x] Document investigation history in `docs/DEBUG.md`
- [ ] Deploy fix to `hsb1` and verify stale loop stops after settings save
- [ ] Add regression tests for MQTT wildcard subscribe/unsubscribe lifecycle
- [ ] Consider consolidating exact and wildcard entry maps into one unified structure

## Acceptance Criteria

- [ ] Nuki and skylight state resolves on fresh start
- [ ] Nuki and skylight state survives a settings save (scene reload)
- [ ] Nuki and skylight state survives a config save (full reload)
- [ ] No repeated `re-subscribed nuki/...` after any lifecycle event
- [ ] `self-heal: all topics resolved, stopping` appears within 10s of every reload

## Notes

- This bug was investigated 8 times during the 2026-03-14/15 session
- Each prior fix addressed a real but insufficient sub-bug
- The mounted scene file on `hsb1` must also be synced after deploy
- See `docs/DEBUG.md` "Full investigation history" section for timeline
