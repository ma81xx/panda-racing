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
  main.js       # bootstrap: loads GLB async, creates scene/physics/track/vehicle, game loop, resetWorld(); animates sky cloud drift
  scene.js      # THREE.js scene, renderer, camera, lights, materials, physical Sky (Preetham + procedural clouds)
  physics.js    # Rapier3D world + fixed-timestep accumulator (120 Hz)
  vehicle.js    # Rapier vehicle controller + GLB car + wheel steering/spinning + suspension/chassis visual
  track.js      # procedural rally dirt track: road, terrain, instanced vegetation/grass, colliders, tree hazards
  skidmarks.js  # dynamic skid-mark quads emitted at wheel contact points when slipping
  particles.js  # pooled dust/smoke puffs (Points) for off-road and drifting
  audio.js      # Web Audio: engine, tire screech, off-road rumble, impact thud
  hud.js        # DOM overlay: lap timer, best lap, progress bar, 2D minimap
  input.js      # keyboard + touch input extraction
  debugRenderer.js  # Rapier physics wireframe toggle
  style.css
```

Each module exports a `createX()` factory function.

## Design goals

Rally driving simulator featuring a **Fiat Panda** rendered from `panda.glb`.

- **Track** (`track.js`): closed CatmullRom loop, seeded procedurally (seed in GUI). Dirt road is **concave** (`DIP_DEPTH` ~0.12) and irregular (`irregularOffset`), 12m wide with 7 cross-section points. Terrain is a height grid that sits ~0.5 m below the road surface and **descends monotonically** to a low base (`terrainHeightAt`, `smoothstep` over `SHOULDER`) — no bump beside the road; it is a **large 800×800 m grid (segs 120, ~6.7 m/cell)** so its footprint always **occludes the below-horizon (dark) part of the sky dome**; **terrain has its own trimesh collider** (built from the *same* geometry, so it scales automatically) with low friction (0.35) for slippery off-road. Vegetation is **instanced** (`InstancedMesh`, ~600 plants + ~1800 grass blades near the road) so it is cheap to render dense; all instanced meshes set `frustumCulled = false` (their bounding sphere is a single unit geometry and would be culled incorrectly on a large track). Trees/bushes line the road at random offsets; pines/round trees within ~24 m also get **static ball colliders** (hazard) so the car crashes instead of passing through. Physics collider is a **thick road slab** (~0.8 m) whose cross-section has 9 points: the 7 road points (same positions/height as the visual road) **plus two extra "wing" points** 3.5 m beyond each road edge, dropped to `terrainHeightAt(...) - 0.15` so the slab sides are gentle ramps that end **buried under the terrain** instead of vertical walls (avoids the "invisible wall" at the road edge). The side walls only close the slab at the buried wing tips. Visual road and the 7 collider road points must stay in sync. Exposes `colliders: { road, terrain }` (used by `vehicle.js` for surface detection) and `hazards.colliders` (used by `main.js` for impact detection).
- **Vehicle** (`vehicle.js`): GLB model cloned and scaled to ~2.2m wide; `Circle_7` / `Circle.001_9` nodes are extracted into `pivot → orientation → spinner` groups for steering (pivot `rotation.y`) and spinning (spinner `rotation.y`). The visual model lives in a **`chassis` group** (child of `group`) so it can tilt in roll/pitch from suspension compression without moving the wheel pivots; wheel pivots also translate vertically by suspension travel. Wheel rotation uses Rapier's **`controller.wheelRotation(i)`** (accumulated). Body mass ≈ 850 kg (density 100), **CCD enabled**, linear/angular damping. Suspension/damping tuned to avoid high-speed vibration.
- **Tire grip** via `frictionSlip`, `frontGrip`, `rearGrip` — front-biased to match FWD layout. `readState()` detects the surface under each wheel via `wheelGroundObject(i)` (terrain trimesh = `dirt`) and re-applies a lower `frictionSlip` (`offRoadGrip`, default 0.5) when a wheel leaves the road. **Note:** the raycast vehicle controller uses only the wheel's `frictionSlip` (clamped max lateral impulse), it ignores the ground collider's friction — so per-surface grip MUST be done via `setWheelFrictionSlip`, not ground material.
- **Forces**: engine split 100% front / 25% rear (FWD), brake on all four, handbrake rear-only.
- **Vehicle state** (`vehicle.state` after each fixed step): `speed` (forward speed via `currentVehicleSpeed`), `slipAmount` (lateral slip 0..1 from lateral velocity), `skids[4]` (per-wheel bool for skidmarks), `contactPoints[4]` (world-space wheel contact), `surfaces[4]`, `compressions[4]` (suspension travel), `offRoad`, `flipped` (up vector check). Consumed by `skidmarks.js`, `particles.js`, `audio.js` and `main.js`.
- **Effects**: `skidmarks.js` draws black quads at contact points when `skids[i]` (handbrake/brake/lateral drift), `particles.js` emits pooled dust puffs off-road and smoke when drifting, `audio.js` (Web Audio, lazily resumed on first input) drives engine pitch from speed, screech from slip, rumble off-road and impact thud. Off-road dust is emitted from **all 4 wheels** that have a contact point (`emitDust` loops the whole array — do not `break` on the first one). `main.js` detects impacts via `world.contactPair(vehicle.bodyCollider, hazardCollider)` (sum of `contactImpulse`) → camera shake + audio thud.
- **Sky & atmosphere** (`scene.js` + `main.js`): the sky is **`THREE.Sky`** (Preetham atmospheric model) scaled to ~700, with `sunPosition` set from the (constant) sun light direction `normalize(sunOffset)` so the **sun disc aligns with shadows**; `showSunDisc` 1, `turbidity 6`, `rayleigh 1.6`, `mie*` defaults, and **procedural drifting clouds** (`cloudCoverage 0.35`, `cloudElevation 0.45`, …) whose `time` uniform is advanced by `delta` each frame in `main.js`. `scene.background` and `scene.fog` share the **horizon color** `0xbfd9f2` and the dome is a `ShaderMaterial` (fog:false) so it never fogs over. The sky dome's below-horizon (near-black) part must stay **occluded by terrain** — see the gotcha below.
- **Camera & light** (`main.js` + `scene.js`): chase cam uses a critically-damped spring (position) with **look-ahead** along the car's velocity; **FOV grows with speed** (60 → ~75). The directional light's `sun.target` is added to the scene and both `sun.position` + `sun.target` follow the car each frame so the (narrow, ±38 m) shadow map stays sharp around the vehicle.
- **Gameplay HUD** (`hud.js`): `main.js` projects the car onto the closed curve via nearest-neighbour sampling (`trackProgress`, 600 precomputed samples + local refinement) to get 0..1 progress; a monotonic cumulative counter detects start-line crossings → lap count, per-lap time, best lap, and a 2D minimap drawn on a `<canvas>`. The **lap timer only starts on the first throttle input** (`timing.started` set by `input.throttle`; `updateTiming(delta, throttle)` skips both time and progress until then) and `resetTiming()` clears it on respawn. If the car flips (`state.flipped`) for >2 s or falls below y=-15 it is **respawned** at `track.start` (velocity/rotation zeroed) and the timing resets; if it stays off-road (`state.offRoad`) for >3 s it is **repositioned** at the road center via `placeCarAt(trackProgress(...))` without resetting the timing.

## Key gotchas

- **Rapier requires async init**: `createPhysics()` calls `await RAPIER.init()` before creating the world. Do not use Rapier synchronously.
- **Fixed-timestep is 120 Hz** (`FIXED_DT = 1/120` in `physics.js`). The accumulator must match `world.integrationParameters.dt`; custom `IntegrationParameters` also raise `numSolverIterations` (12) and `numInternalPgsIterations` (2). Never rely on `world.timestep = x` — it's a no-op JS property.
- **GLB load is async**: `main.js` must `await loader.loadAsync(...)` and pass `pandaGltf.scene` into `createVehicle`. The URL is cache-busted with `?t=Date.now()`.
- **Wheel winding/order**: GLTF nodes with baked matrices keep `matrixAutoUpdate` semantics — extract wheel meshes via `attach()` into controlled pivot groups; don't mutate their matrices directly.
- **Tuning applied only on change**: `syncTuning()` in `vehicle.js` re-applies suspension params only when the GUI values actually change (avoiding per-frame Rapier setter churn that destabilizes the solver).
- **Road geometry winding matters**: indices are ordered so the front face points up; the terrain and collider geometry must use the same heights (`terrainHeightAt`) so physics matches visuals and nothing pokes through.
- **Sky dome must stay occluded below the horizon**: `THREE.Sky` renders near-black below its equator. The terrain footprint (800×800 m) is **larger than the sky dome** (scale ~700) so every sightline below the horizon hits terrain first; fog `far` (380) sits inside the terrain radius so the fogged edge blends into the sky's horizon color. If you resize either, keep **terrain footprint ≥ sky dome footprint** and **fog far ≤ terrain radius**, otherwise a dark band appears at the horizon.
- **Reset/regenerate**: all track visuals live in `track.group` and the car in `vehicle.group`; `resetWorld()` removes both from the scene and clears every rigid body before rebuilding.
- **No build tooling config**: no ESLint, Prettier, or tsconfig. Do not add tooling unless asked.
- **The app targets browsers directly**: single `<canvas>`, no SPA, router, or SSR.
- **Touch controls** are rendered server-side in `index.html` and bound in `input.js` via `[data-control]` attributes.
