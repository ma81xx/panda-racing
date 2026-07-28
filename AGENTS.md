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
| 3D engine   | Three.js 0.185                      |
| Physics     | Rapier3D 0.19 (`@dimforge/rapier3d-compat`) |
| Debug UI    | lil-gui 0.21                        |
| Deployment  | GitHub Pages                        |

## Build & deploy

- Vite runs with **zero config** — there is no `vite.config.js`.
- CI (`.github/workflows/build-and-deploy.yml`) deploys to GitHub Pages on push to `main`. The build step appends `--base` from the Pages action.
- `npm ci` (not `npm install`) is used in CI.

## Architecture

Single-package vanilla JS app. No TypeScript, no framework.

```
index.html      # entry — single `<canvas id="app">` + touch controls
src/
  main.js       # bootstrap: creates scene, physics, track, vehicle, game loop
  scene.js      # THREE.js scene, renderer, camera, lights, materials
  physics.js    # Rapier3D world + fixed-timestep accumulator (60 Hz)
  vehicle.js    # Rapier vehicle controller + THREE.js car mesh
  track.js      # procedural CatmullRom road + Rapier trimesh collider
  input.js      # keyboard + touch input extraction
  debugRenderer.js  # Rapier physics wireframe toggle
  style.css
```

Each module exports a `createX()` factory function.

## Design goals

Realistic driving simulator featuring a **Fiat Panda**. The vehicle tuning (`vehicle.js`) aims for plausible real-world behavior:
- **Tire grip** via `frictionSlip`, `frontGrip`, `rearGrip` — front-biased to match FWD layout.
- **Suspension** modeled with rest length, stiffness, travel, and separate compression/relaxation damping.
- **Forces**: engine force is split 100% front / 25% rear (FWD), brake force on all four wheels, handbrake on rear only.

## Key gotchas

- **Rapier requires async init**: `createPhysics()` calls `await RAPIER.init()` before creating the world. Do not try to use Rapier synchronously.
- **No build tooling config**: there is no ESLint, Prettier, or tsconfig. Do not add tooling unless asked.
- **The app targets browsers directly**: it's a single `<canvas>` with no SPA, router, or SSR.
- **Physics uses a fixed-timestep accumulator** (`physics.js:step()`). The game loop passes `delta` to `physics.step()`, which sub-steps at 1/60s.
- **Touch controls** are rendered server-side in `index.html` and bound in `input.js` via `[data-control]` attributes.
