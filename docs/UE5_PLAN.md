# BHARAT LIFE — High-fidelity PC version (Unreal Engine 5) plan

The browser slice in this repo is a **systems + layout prototype**. Final-quality visuals (realistic
faces, scanned materials, Lumen GI, Nanite-density cities) need Unreal Engine 5 on your own PC.
This container cannot run Unreal Engine (no GPU, Linux headless, no Epic toolchain) — everything
below is for your machine.

## 0. Confirm your hardware first

The "RTX 3050" name covers very different parts. Please confirm:

| Variant | VRAM | Practical UE5 target |
|---|---|---|
| RTX 3050 desktop 8 GB | 8 GB | 1080p, Lumen (software), Nanite, TSR 66%, High/Medium mix, 45–60 FPS in a dense district |
| RTX 3050 desktop 6 GB | 6 GB | 1080p, Lumen Medium, Nanite, TSR/DLSS Performance, 40–60 FPS |
| RTX 3050 Laptop 4 GB / 6 GB | 4–6 GB | 900p–1080p, DLSS Performance, Lumen Low or Screen-Space GI, 30–50 FPS |

Also needed: **system RAM** (16 GB minimum for the UE5 editor with a city map; 32 GB recommended),
storage (SSD, ~150 GB free for engine + assets + DDC), and the exact "Intel Core 5" model
(Core 5 120U is a 10-core mobile chip; editor shader compiles will be slow but workable).

Hardware-specific notes for an RTX 3050:
* Hardware ray tracing is supported but expensive — use **software Lumen**; keep HW RT off.
* Enable **DLSS** (NVIDIA plugin) — the single biggest win on this GPU.
* VRAM is the main limit: use virtual textures, texture streaming pool ≤ 2–3 GB, 2K textures max for hero props.
* Profile with `stat unit`, `stat gpu`, Unreal Insights — don't guess.

## 1. Project setup (week 1)

1. Install Epic Games Launcher → **Unreal Engine 5.4+** (or newest stable) with "Starter Content" off.
2. Install Visual Studio 2022 (Game development with C++ workload) for C++ modules.
3. Create a **C++ Third Person** project `BharatLife`. Enable plugins: World Partition (default), Enhanced Input,
   Chaos Vehicles, Mass Entity / Mass AI (crowds & traffic), ZoneGraph, StateTree, Water, DLSS (NVIDIA download).
4. Source control: Git LFS (or Perforce/Diversion for large binaries). Keep this web repo as the design/data reference.

## 2. Port the data, not the rendering code

These files are engine-agnostic data and should become **Unreal DataTables** (CSV/JSON import):

| Web file | UE5 asset |
|---|---|
| `src/config/items.ts` | `DT_Items` (row struct `FItemDef`) |
| `src/config/vehicles.ts` | `DT_Vehicles` → drives Chaos Vehicle Blueprints (mass, torque, gears, steering) |
| `src/config/shops.ts` | `DT_Shops` + `BP_Shop` actor (reusable interaction component) |
| `src/config/economy.ts` | `DA_EconomyTuning` (Primary Data Asset) |
| `src/world/layout.ts` (roads, blocks, stations, landmarks) | Blockout reference for the World Partition map; road spline import via a small Python/Editor Utility script |
| `src/economy/*`, `src/core/GameClock.ts`, save logic | Re-implement as C++ `UGameInstanceSubsystem`s (`UWalletSubsystem`, `UClockSubsystem`) — the unit tests in `tests/` define the expected behaviour |

## 3. Vertical slice: one excellent street (weeks 2–8)

Recreate **Bazaar Gali + Sagar Nagar station forecourt** only, at final quality:

1. **Kitbash library**: modular Mumbai building kit (window bays with box grills, chajjas, balconies,
   chawl gallery modules, shop shutters, signboard frames, AC units, pipes, water tanks) authored in
   Blender → Nanite meshes. Use the facade rules in `src/world/facade.ts` as the design spec.
2. **Materials**: Poly Haven / ambientCG (CC0) plaster, asphalt, concrete, metal + Substance-style
   grime layers; vertex-painted monsoon streaks; decals (tar patches, paan stains, puddles, posters).
3. **Lighting**: Lumen GI + reflections, Sky Atmosphere, Volumetric Clouds, Exponential Height Fog
   (Mumbai haze), post-process LUT. Day/night via a time-of-day Blueprint rotating the sun + MPC for
   window/sign emissives.
4. **Vegetation**: rain trees, gulmohar, coconut palms — SpeedTree (free for UE) or Megascans foliage.
5. **Characters**: **MetaHuman Creator** for the player and key NPCs (realistic South-Asian faces,
   free for use in Unreal). Crowds: MetaHuman LODs / Mass crowd with animation sharing.
   Animations: UE5 Game Animation Sample (motion matching) + Mixamo/marketplace clips (in-engine use).
6. **Vehicles**: Chaos Vehicles. Commission/buy licensed models of *fictional* designs
   (auto-rickshaw, commuter bike, hatchback, BEST-style bus) — avoid real brand names/logos.
   Two-wheelers need a custom lean/balance controller (Chaos is car-oriented).
7. **Audio**: MetaSounds engine models per vehicle class, recorded Mumbai ambience (license or record yourself).

Acceptance: walk + ride a bike through the street at 1080p ≥ 45 FPS on your 3050 with DLSS.

## 4. Systems port (weeks 6–14, overlaps)

* Player: Third-person template + Enhanced Input, interaction component, phone UI in UMG.
* Traffic: ZoneGraph lanes (left-hand traffic) + Mass traffic; signals as StateTree; use
  `src/traffic/RoadGraph.ts` (lanes, split-phase signals, connectors) as the reference implementation.
* Pedestrians: Mass crowd on ZoneGraph sidewalks; schedules via StateTree.
* Trains: spline-following train actors with timetable subsystem; station platform triggers;
  ticketing through `UWalletSubsystem`.
* Missions: data-driven mission graph (DataTable of steps + `UMissionSubsystem`), same step types as the web build.
* Save: `USaveGame` with versioning; validation rules mirror `src/save/`.

## 5. Expansion (after the slice is solid)

Station → second district → coastal promenade → local-train route with 3–4 stations (World Partition
cells + HLODs), then jobs/property/business systems. Grow only when the previous area meets the
quality bar and performance target.
