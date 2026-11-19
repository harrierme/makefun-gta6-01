# Solmar City — Make GTA 6 (gta6-01)

An original top-down open-world crime game that runs offline in a desktop
browser from static files. Built for the make.fun **gta6-01** bounty.

**Play it:** `node serve.ts`, then open http://localhost:8080.

## The game

Milo Kade is back in Solmar City — a sun-soaked coastal town of beaches,
downtown towers, a marina and old-town streets — and fixer Lena Cruz has
work for him. Steal cars, take five story jobs, earn cash, and stay ahead
of the SCPD's wanted stars.

- **Open world:** a 3200×2400 city with a road grid, traffic, pedestrians,
  a beach and ocean, a park, a marina and named landmarks
- **Driving:** arcade car handling with drift, skid marks, collisions and
  damage; steal any car (drivers bail, witnesses call it in)
- **Wanted system:** 0–5 stars; SCPD cruisers chase and ram you, foot
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
| E | Steal / enter a car, E again to get out |
| Mouse + Click | Aim and shoot (on foot), horn (in a car) |
| R | Reload |
| P / Esc | Pause |
| M | Mute |

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
