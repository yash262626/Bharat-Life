# Asset manifest & licensing

BHARAT LIFE (browser vertical slice) ships **no third-party meshes or textures except the CC0 HDRIs listed below**.
Everything else is generated procedurally at load time by original code in this repository.

## Third-party assets

| Asset | Source | Licence | Used for |
|---|---|---|---|
| HDRIs `dawn`, `sky`, `city`, `sunset`, `night` (512px EXR) | [Poly Haven](https://polyhaven.com/hdris) via npm package [`@pmndrs/assets`](https://www.npmjs.com/package/@pmndrs/assets) v1.7.0 | CC0 1.0 (package `LICENSE` file) | Image-based lighting & reflections (`src/render/hdri.ts`) |

## Procedural (original) assets

| Asset | Code |
|---|---|
| Asphalt, pavers, plaster, concrete, bark, leaves, palm fronds, cloth, shutters, decals (tar patches, dust, oil, monsoon streaks), drain grates, manholes, number plates, signboards, packaging labels | `src/world/textures.ts` |
| Building facades (recessed windows, grills, chajjas, balconies, chawl galleries, pipes, AC units) | `src/world/facade.ts`, `src/world/buildings.ts` |
| Landmarks (station, petrol pump, garage, temple, chawl, park, maidan...) | `src/world/landmarks.ts`, `src/world/railway.ts` |
| Vehicles (fictional brands: Kesari, Tejas, Vayu, Sahyadri, Rajhans, Gajraj, Aurum, Vega, Pratap, Dhruv) | `src/vehicles/VehicleModels.ts` |
| Crowd human body (stylised placeholder, GPU-animated) | `src/npc/HumanMesh.ts`, `src/npc/HumanRenderer.ts` |
| Shop names, banners, adverts | Generic Indian shop names and fictional brands only — no real trademarks |

## Assets investigated but NOT used

| Candidate | Why not |
|---|---|
| Poly Haven / ambientCG PBR textures & models (CC0) | Blocked by this development container's network egress policy. Recommended for the PC build — download them on your own machine. |
| Sketchfab, Quaternius, Kenney | Blocked by the egress policy (and Sketchfab licences vary per model). |
| `makehuman-data` npm package (realistic human base mesh, skins, rig) | Package metadata states an **AGPL-3 derived** licence. MakeHuman's own site describes its assets as CC0, but this redistribution is labelled AGPL. Not used without the project owner's legal decision. |
| Mixamo characters/animations (e.g. three.js example `Xbot.glb`, `Michelle.glb`) | Adobe terms forbid redistributing raw files; unsuitable for a public repository. |

## Honest quality statement

Procedural geometry and textures cannot reach the fidelity of scanned/artist-made assets. Current limitations:

* **Humans** are stylised, smooth-shaded figures (no realistic faces, hair or cloth simulation).
* **Vehicles** have correct proportions and parts but simplified surfacing (no hand-modelled panels, no detailed interiors).
* **Textures** are 512–1024 px procedural maps — no photo-sourced detail.

## Drop-in replacement plan (for your PC)

The renderer uses `GLTFLoader`-compatible PBR materials. Recommended properly-licensed sources:

* Textures/HDRIs: Poly Haven (CC0), ambientCG (CC0).
* Characters: Unreal **MetaHuman** (for the UE5 build — licensed for use in Unreal Engine), Ready Player Me / MakeHuman exports (check terms), Mixamo animations (use in-project only).
* Vehicles/props: commission or buy licensed models; avoid real brand names/logos without permission.
