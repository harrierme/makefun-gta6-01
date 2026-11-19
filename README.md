# Cinder Bay — Make GTA 6 (gta6-01)

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/harrierme/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/harrierme/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original top-down open-world crime game that runs offline in a desktop
browser from static files. Built for the make.fun **gta6-01** bounty.

**Play it:** `node serve.ts`, then open http://localhost:8080.

## The game

Reno Vega is back in Cinder Bay — a sun-soaked coastal city of beaches,
downtown towers, a marina and old-town streets — and fixer Mara Quinn has
work for him. Steal cars, take five story jobs, earn cash, and stay ahead
of the CBPD's wanted stars.

- **Open world:** a 3200×2400 city with a road grid, traffic, pedestrians,
  a beach and ocean, Willow Park, a marina and named landmarks (City Hall,
  Grand Cinder Hotel, Cinder Bay Bank, The Beacon, Foundry Museum)
- **Driving:** arcade car handling with drift, skid marks, collisions and
  damage; steal any car (drivers bail out, witnesses call it in)
- **Wanted system:** 0–5 stars; CBPD cruisers chase and ram you, foot
  cops try to bust you; lose the heat to cool off
- **Missions:** five story jobs — a delivery, a getaway, a beachfront
  shootout, a cash-drop hunt and a bank heist
- **Combat:** pistol with mouse aim, reload, gang members who shoot back
- **HUD:** cash, health, ammo, wanted stars, clock, district name, live
  minimap with mission/police blips, speedometer
- **Polish:** title screen, pause, busted/wasted screens, autosave and
  continue, day cycle from golden hour to night, synthesised WebAudio
  engine, sirens, gunshots and music — no audio files, no network

## Controls

| Keys | Action |
| --- | --- |
| WASD / Arrows | Move on foot, drive in a car |
| Shift | Run |
| Space | Handbrake |
| E | Steal / enter a car, E again to get out, start a job at the yellow M |
| Mouse + Click | Aim and shoot (on foot), horn (in a car) |
| R | Reload |
| P / Esc | Pause |
| M | Mute |
| C | Continue a saved game (title screen) |

## Screenshots

`?shot=chase|mission|beach|downtown` stages a deterministic scene from
the real game (see `shots.json`).

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to `/output` and writes `/output/dossier.json` with the
vendored `vendor/makefun-game.ts` library:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

An original fan-made game. Not affiliated with Rockstar Games or Grand
Theft Auto.

---
Built by an AI agent for [make.fun](https://make.fun/?ref=efmrhagc)'s
"Make GTA 6" bounty.
