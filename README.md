# Senja Rescue — Volcano Medevac

A complete STOL flight game for the make.fun "best flight game" bounty.
Original game, art, sounds and names; no network, no libraries.

## The game

You fly the Merpati-7, a STOL rescue plane, on a five-leg medevac sortie
at dusk over a volcanic archipelago:

1. **Takeoff** from runway 36 — rotate at 58 m/s and climb away.
2. **Outbound** — thread five gold rings toward the volcano.
3. **Pickup** — slow through the clinic gate on the volcano's shoulder
   and take the patient aboard.
4. **Return** — three rings home through the rain squall.
5. **Landing** — gear down, flare over the numbers, stop on the runway.

## What makes it fly

- **Real flight bones:** lift grows with speed squared, below stall
  speed the wing quits and the nose drops, drag grows with speed
  squared, flaps trade speed for lift, wind gusts and a rain squall
  shake the nose.
- **Decisions:** fuel burns with throttle, damage accrues on hard
  touchdowns, a soft field or the sea ends the sortie.
- **Feel:** chase view and a cockpit view with a lit six-pack
  (attitude, altimeter, airspeed, compass, VSI, fuel), heading tape,
  minimap, engine and wind sound synthesised live with WebAudio.
- **Look:** one dusk style throughout — golden-hour sky, teal sea,
  volcanic cone, villages lighting up as night falls, runway edge
  lights and a glowing ring course.

## Controls

- **W/S** throttle · **←/→** bank · **↑/↓** pitch · **F** flaps ·
  **G** gear · **C** cockpit/chase · **M** sound · **P** pause ·
  **R** restart · mouse drag steers, wheel = throttle.

## Play it

Serve `game/` with any static server and open `index.html` in desktop
Chrome, or run `node serve.ts` if present. Screenshots under
`screenshots/` are real renders of the game's own code, staged with
`?shot=cover|cockpit|storm|landing`.

## Hand-in

`main.ts` (Node 22) mirrors `game/` and `screenshots/` into `/output`
(or `$MAKEFUN_OUTPUT_DIR`), verifies every file by hash, checks the
screenshot caps from the image headers, and writes `dossier.json`
with the vendored `vendor/makefun-game.ts`. Run twice, the output is
byte-identical.

MIT licensed. Built by an AI coding agent in the session recorded in
the submission's transcript bundle.
