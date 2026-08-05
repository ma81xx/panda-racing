# AGENTS.md

## Commands

```
npm run dev        # start dev server (Vite, --host 0.0.0.0)
npm run build      # production build to dist/
npm run preview    # preview production build (--host 0.0.0.0)
```

No lint, typecheck, format, or test commands exist.

## Stack

| Category    | Choice                              |
|-------------|-------------------------------------|
| Runtime     | Vite 8, vanilla JS (ES modules)     |
| 3D engine   | Three.js 0.185 (`GLTFLoader` from `three/examples/jsm`) |
| Physics     | Rapier3D 0.19 (`@dimforge/rapier3d-compat`) |
| Debug UI    | lil-gui 0.21 (panel starts **closed**) |
| Deployment  | GitHub Pages                        |

## Build & deploy

- Vite runs with **zero config** — there is no `vite.config.js`.
- CI (`.github/workflows/build-and-deploy.yml`) deploys to GitHub Pages on push to `main`. The build step appends `--base` from the Pages action.
- `npm ci` (not `npm install`) is used in CI.
- **Static assets go in `public/`** (Vite copies them to `dist/` as-is). The car model lives at `public/models/panda.glb`.

## Architecture

Single-package vanilla JS app. No TypeScript, no framework.

```
index.html      # entry — single `<canvas id="app">` + touch controls
public/models/panda.glb  # Fiat Panda car model (Sketchfab, axis-flipped hierarchy)
src/
  main.js       # bootstrap: loads GLB async, creates scene/physics/track/vehicle, game loop, resetWorld()
  scene.js      # THREE.js scene, renderer, camera, lights, materials
  physics.js    # Rapier3D world + fixed-timestep accumulator (120 Hz)
  vehicle.js    # Rapier vehicle controller + GLB car + wheel steering/spinning
  track.js      # procedural rally dirt track: road, terrain, vegetation, colliders
  input.js      # keyboard + touch input extraction
  debugRenderer.js  # Rapier physics wireframe toggle
  style.css
```

Each module exports a `createX()` factory function.

## Design goals

Rally driving simulator featuring a **Fiat Panda** rendered from `panda.glb`.

- **Track** (`track.js`): closed CatmullRom loop, seeded procedurally (seed in GUI). Dirt road is **concave** (`DIP_DEPTH` ~0.12) and irregular (`irregularOffset`), 12m wide with 7 cross-section points. Terrain is a height grid that blends from road level to a low base; **terrain has its own trimesh collider**. Trees/bushes (pine, round tree, bush) line the road at random offsets. Physics collider is a **thick road slab** built from the same positions as the visual road — visual and collider must always stay in sync.
- **Vehicle** (`vehicle.js`): GLB model cloned and scaled to ~2.2m wide; `Circle_7` / `Circle.001_9` nodes are extracted into `pivot → orientation → spinner` groups for steering (pivot `rotation.y`) and spinning (spinner `rotation.y`). Body mass ≈ 850 kg (density 100), **CCD enabled**, linear/angular damping. Suspension/damping tuned to avoid high-speed vibration.
- **Tire grip** via `frictionSlip`, `frontGrip`, `rearGrip` — front-biased to match FWD layout.
- **Forces**: engine split 100% front / 25% rear (FWD), brake on all four, handbrake rear-only.

## Key gotchas

- **Rapier requires async init**: `createPhysics()` calls `await RAPIER.init()` before creating the world. Do not use Rapier synchronously.
- **Fixed-timestep is 120 Hz** (`FIXED_DT = 1/120` in `physics.js`). The accumulator must match `world.integrationParameters.dt`; custom `IntegrationParameters` also raise `numSolverIterations` (12) and `numInternalPgsIterations` (2). Never rely on `world.timestep = x` — it's a no-op JS property.
- **GLB load is async**: `main.js` must `await loader.loadAsync(...)` and pass `pandaGltf.scene` into `createVehicle`. The URL is cache-busted with `?t=Date.now()`.
- **Wheel winding/order**: GLTF nodes with baked matrices keep `matrixAutoUpdate` semantics — extract wheel meshes via `attach()` into controlled pivot groups; don't mutate their matrices directly.
- **Tuning applied only on change**: `syncTuning()` in `vehicle.js` re-applies suspension params only when the GUI values actually change (avoiding per-frame Rapier setter churn that destabilizes the solver).
- **Road geometry winding matters**: indices are ordered so the front face points up; the terrain and collider geometry must use the same heights (`terrainHeightAt`) so physics matches visuals and nothing pokes through.
- **Reset/regenerate**: all track visuals live in `track.group` and the car in `vehicle.group`; `resetWorld()` removes both from the scene and clears every rigid body before rebuilding.
- **No build tooling config**: no ESLint, Prettier, or tsconfig. Do not add tooling unless asked.
- **The app targets browsers directly**: single `<canvas>`, no SPA, router, or SSR.
- **Touch controls** are rendered server-side in `index.html` and bound in `input.js` via `[data-control]` attributes.
