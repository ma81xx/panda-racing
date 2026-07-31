# AGENTS.md

## Commands

```
npm run dev        # start dev server (Vite, --host 0.0.0.0)
npm run build      # tsc + vite build to dist/
npm run preview    # preview production build (--host 0.0.0.0)
```

No lint, format, or test commands exist.

## Stack

| Category    | Choice                              |
|-------------|-------------------------------------|
| Language    | TypeScript 5.5 (strict mode)        |
| Runtime     | Vite 8, ES modules                  |
| 3D engine   | Three.js 0.185                      |
| Physics     | Rapier3D 0.19 (`@dimforge/rapier3d-compat`) |
| Debug UI    | lil-gui 0.21                        |
| Deployment  | GitHub Pages                        |

## Build & deploy

- Vite runs with **zero config** — there is no `vite.config.js` / `vite.config.ts`.
- CI (`.github/workflows/build-and-deploy.yml`) deploys to GitHub Pages on push to `main`.
- `npm ci` (not `npm install`) is used in CI.
- Build step: `tsc && vite build`. TypeScript compiles first, then Vite bundles.

## Architecture

TypeScript single-package app. No framework.

```
index.html      # entry — canvas + touch controls + loading overlay
src/
  main.ts       # bootstrap: creates scene, physics, track, vehicle, game loop
  scene.ts      # THREE.js scene, renderer, camera, lights, materials
  physics.ts    # Rapier3D world + fixed-timestep accumulator (60 Hz)
  vehicle.ts    # Rapier rigid body + 4 custom wheels (spring/damper/raycast/forces)
  track.ts      # procedural CatmullRom road + Rapier trimesh collider
  input.ts      # keyboard + touch input unified state
  surface.ts    # terrain types (asphalt, dirt, mud, snow) with mu + rolling resistance
  debug.ts     # Rapier physics wireframe toggle
  style.css     # touch controls + loading spinner
```

Each module exports a `createX()` factory function where applicable.

## Design goals

Rally driving simulator featuring a **Fiat Panda**. The physics uses **custom wheels** (no Rapier VehicleController):

### Custom wheel model (per wheel, per physics substep)
1. Compute world-space position from chassis transform
2. Raycast downward to find ground contact
3. Spring force: `stiffness × compression − damping × compressionVel`
4. Engine force: torque curve interpolated from RPM, multiplied by gear ratio and final drive
5. Brake force: applied as negative longitudinal force
6. Lateral force: Pacejka simplified model `D × sin(C × atan(B × slip − E × (B × slip − atan(B × slip))))`
7. Rolling resistance: `−Cr × normalForce × sign(speed)`
8. `chassis.addForceAtPoint(totalForce, contactPoint, true)`

### Vehicle specs
- **Mass**: 1200 kg, CoG offset `(0, -0.15, -0.20)` from geometric center
- **Engine**: 5-point torque curve (80 Nm @ 800 RPM → 150 Nm @ 3800 RPM → 90 Nm @ 6500 RPM)
- **Transmission**: 5-speed automatic with kick-down (shift up @ 5800 RPM, shift down @ 2500 RPM)
- **Gear ratios**: [0, 3.5, 2.1, 1.4, 1.0, 0.75], final drive 3.9
- **Traction**: AWD default (toggle in GUI to FWD)
- **Steering**: Ackermann simplified (inner/outer wheel angles differ)
- **Brakes**: brake torque per wheel, 60/40 front/rear split

### Terrain types
| Surface | μ (friction) | Rolling Resistance (Cr) |
|---------|-------------|------------------------|
| Asphalt | 1.00 | 0.015 |
| Dirt    | 0.65 | 0.035 |
| Mud     | 0.45 | 0.060 |
| Snow    | 0.25 | 0.025 |

Mud zones are randomly placed alongside the track (option B: asphalt on road, dirt at edges, mud off-road).

### Track
- 28 control points on circle (radius ~86) with terrain variation
- 3 jump ramps at indices 5, 14, 22
- Road width: 13 units, 520 samples
- Guardrails: simplified posts + horizontal rails at road edges
- Trees: scattered off-road (excluded from road)

## Key gotchas

- **Rapier requires async init**: `createPhysics()` calls `await RAPIER.init()` before creating the world. A loading overlay is shown during initialisation.
- **TypeScript strict mode**: all files use strict type checking.
- **No VehicleController**: wheels are custom — raycasting, spring forces, and `addForceAtPoint` are used directly.
- **Fixed-timestep accumulator**: `physics.ts:step()` sub-steps at 1/60s. The game loop passes `delta` to `physics.step()`, which calls the vehicle update callback each substep.
- **Touch controls**: rendered in `index.html` and bound in `input.ts` via `[data-control]` attributes.
- **Loading screen**: `#loading` overlay shown during `RAPIER.init()`, hidden on completion.
