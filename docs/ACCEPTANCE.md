# Milestone 1 — acceptance report

Run: `npm test` (unit) and `npm run smoke` (end-to-end, headless Chromium with **software** WebGL/SwiftShader).
Last run: 16/16 end-to-end checks passed, 38/38 unit tests passed, `npm run build` succeeds.

| # | Acceptance test | Result | Evidence |
|---|---|---|---|
| 1 | Game launches | ✅ | Main menu after ~13 s in software rendering |
| 2 | Walk around a recognisable Indian urban environment | ✅ | Walked 12.6 m on Sagar Nagar platform; screenshots `game_03`, `after_bazaar` |
| 3 | Enter and drive at least one vehicle | ✅ | Kesari Raftaar 110 bike, 0 → 42 km/h in 4 s |
| 4 | Acceleration, braking, steering, collision | ✅ | Braked to 0, turned 1.69 rad, stopped by the road median, 10% damage |
| 5 | Traffic moves through the road network | ✅ | 22 AI vehicles (Low preset density), 13 moved in 8 s, split-phase signals |
| 6 | Pedestrians navigate sidewalks | ✅ | 50 walkers (42 moving) + ~90 vendors/shopkeepers/commuters |
| 7 | Visit at least one shop | ✅ | Raju's Tea Stall UI (`game_06-shop-ui`) |
| 8 | Purchase deducts correct INR | ✅ | Cutting chai ₹12 deducted exactly; ledger entry recorded |
| 9 | Earn money through a mission | ✅ | DabbaDash delivery paid ~₹60 to bank; story missions progress (arrival → chai → scooter) |
| 10 | Railway station integrated with boarding & travel | ✅ | Boarded at Sagar Nagar, rode 698 m to Navrang Road, alighted onto platform |
| 11 | Day/night visibly changes the environment | ✅ | Night factor 0 at noon, 1 at 10 PM; lit windows/signs, street-light pools (`after_bazaar_night_rain`) |
| 12 | Save/load preserves money, position, progress | ✅ | Slot save → drain wallet/move → load restores cash, bank, position, completed missions |
| 13 | No critical errors in the main loop | ✅ | Zero page errors / console errors during the run |
| 14 | Declared performance target on the selected hardware | ⚠️ **Not verified** | Only a software renderer exists here (≈0.3 FPS at Low). Must be measured on your RTX 3050 — see README "Performance & hardware" |

## Unit tests (`tests/`)

* Economy: Indian digit grouping, ₹ formatting, wallet spend/earn/transfer/loan, invalid amounts rejected.
* Save: round trip, checksum corruption detection, garbage rejection, field repair, backup fallback.
* Missions: step progression, event matching, actions, rewards, timed failure/retry, persistence, dialogue steps.
* Vehicle physics: top speed limits, per-vehicle differences, braking, steering direction, fuel, wet grip, collisions.
* World: blocks vs roads, landmarks/shops placement, signal phasing (never two greens), left-hand lanes, clock, collision layers.

## Bugs found and fixed by the tests

* Mission dialogue steps never completed (timer stopped after the last line).
* Vehicles could drive through road medians (collider height band).
* AI traffic could shove a stopped player vehicle.
* Mission loading ignored custom definition sets.
* Character creator "Start" button unreachable on small windows.

## Known issues

* Pedestrians pass through some street props (stalls/trees); AI traffic has no lane changes or overtaking.
* Characters are stylised placeholders; no ragdolls, facial animation or lip-sync.
* Home/office interiors are menu-driven, not walkable levels.
* Train consist "jumps" ends when reversing at the far termini (out of the player's sight).
