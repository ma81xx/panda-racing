import * as THREE from 'three';
import GUI from 'lil-gui';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createScene } from './scene.js';
import { createPhysics } from './physics.js';
import { createTrack } from './track.js';
import { createVehicle } from './vehicle.js';
import { createInput } from './input.js';
import { createDebugRenderer } from './debugRenderer.js';
import { createSkidMarks } from './skidmarks.js';
import { createParticles } from './particles.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import './style.css';

const PROGRESS_SAMPLES = 600;
const CAM_BASE_FOV = 60;
const CAM_DISTANCE = 10;
const CAM_HEIGHT = 5.5;
const CAM_SMOOTH_TIME = 0.18;
const CAM_COLLISION_MARGIN = 0.4;
const CAM_MIN_DISTANCE = 1.2;
const MAX_DELTA = 0.1;
const SPAWN_CLEARANCE = 0.58;

function smoothDamp(current, target, velocity, smoothTime, delta) {
  const omega = 2 / Math.max(smoothTime, 0.0001);
  const x = omega * delta;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const cx = current.x - target.x;
  const cy = current.y - target.y;
  const cz = current.z - target.z;
  const tx = (velocity.x + omega * cx) * delta;
  const ty = (velocity.y + omega * cy) * delta;
  const tz = (velocity.z + omega * cz) * delta;
  velocity.x = (velocity.x - omega * tx) * exp;
  velocity.y = (velocity.y - omega * ty) * exp;
  velocity.z = (velocity.z - omega * tz) * exp;
  current.set(
    target.x + (cx + tx) * exp,
    target.y + (cy + ty) * exp,
    target.z + (cz + tz) * exp
  );
}

async function bootstrap() {
  const canvas = document.querySelector('#app');
  const { scene, renderer, camera, materials, sun, sky, environment } = createScene(canvas);
  const physics = await createPhysics();
  const input = createInput();

  const loader = new GLTFLoader();
  const pandaGltf = await loader.loadAsync('models/panda.glb?t=' + Date.now());
  const gui = new GUI({ title: 'Panda Racing Debug' });
  gui.close();
  const settings = { seed: 1337, audio: true, chassisTransparent: false, regenerate: () => resetWorld(settings.seed) };
  gui.add(settings, 'seed', 1, 999999, 1);
  gui.add(settings, 'chassisTransparent').name('Chassis trasparente').onChange((v) => {
    if (vehicle) vehicle.setChassisTransparent(v);
  });
  gui.add(settings, 'regenerate').name('Rigenera tracciato');
  const audio = createAudio();
  gui.add(settings, 'audio').name('Audio').onChange((v) => audio.setEnabled(v));

  let track;
  let vehicle;
  let vehicleGuiFolder;
  let hud;
  let flipTimer = 0;
  let offRoadTimer = 0;
  let paused = false;
  const pauseOverlay = document.querySelector('[data-pause]');
  const skidmarks = createSkidMarks(scene);
  const particles = createParticles(scene);

  const chasePosition = new THREE.Vector3();
  const chaseTarget = new THREE.Vector3();
  const cameraVel = new THREE.Vector3();
  const smoothedVelocity = new THREE.Vector3();
  const desiredPosition = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const camForward = new THREE.Vector3();
  const camRayDir = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();
  const tmpLateral = new THREE.Vector3();
  const tmpVelocity = new THREE.Vector3();
  const tmpProbe = new THREE.Vector3();
  const tmpUp = new THREE.Vector3(0, 1.2, 0);
  const camDown = new THREE.Vector3(0, -1, 0);
  const tmpQuat = new THREE.Quaternion();
  const sunOffset = new THREE.Vector3(-45, 65, 20);
  const camRay = new physics.RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  let shake = 0;
  let dustAccum = 0;
  let fpsSmoothed = 60;

  let progressPts = new Float32Array((PROGRESS_SAMPLES + 1) * 3);
  let progressSample = -1;
  const trackPoint = new THREE.Vector3();

  function buildProgressSamples() {
    for (let i = 0; i <= PROGRESS_SAMPLES; i++) {
      const p = track.curve.getPointAt(i / PROGRESS_SAMPLES);
      progressPts[i * 3] = p.x;
      progressPts[i * 3 + 1] = p.y;
      progressPts[i * 3 + 2] = p.z;
    }
    progressSample = -1;
  }

  function trackProgress(x, z) {
    const n = PROGRESS_SAMPLES;
    let best = 0;
    let bestD = Infinity;
    if (progressSample < 0) {
      for (let i = 0; i < n; i++) {
        const dx = progressPts[i * 3] - x;
        const dz = progressPts[i * 3 + 2] - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    } else {
      const search = 40;
      for (let o = -search; o <= search; o++) {
        const i = ((progressSample + o) % n + n) % n;
        const dx = progressPts[i * 3] - x;
        const dz = progressPts[i * 3 + 2] - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    progressSample = best;
    let t = best / n;
    let bt = t;
    let bd = bestD;
    const step = 1 / n;
    for (let k = 1; k <= 6; k++) {
      for (const s of [-1, 1]) {
        let tt = t + s * k * (step / 6);
        tt = ((tt % 1) + 1) % 1;
        track.curve.getPointAt(tt, trackPoint);
        const dx = trackPoint.x - x;
        const dz = trackPoint.z - z;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; bt = tt; }
      }
    }
    return bt;
  }

  const timing = { cumulative: 0, lastFloor: 0, lap: 1, elapsed: 0, best: null, progress: 0, prevRaw: 0, started: false };

  function resetTiming() {
    timing.cumulative = 0;
    timing.lastFloor = 0;
    timing.lap = 1;
    timing.elapsed = 0;
    timing.best = null;
    timing.progress = 0;
    timing.prevRaw = 0;
    timing.started = false;
  }

  function updateTiming(delta, throttle) {
    if (!timing.started && throttle) timing.started = true;
    if (!timing.started) return;
    const t = vehicle.body.translation();
    const raw = trackProgress(t.x, t.z);
    let d = raw - timing.prevRaw;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    timing.prevRaw = raw;
    timing.cumulative += d;
    timing.progress = ((timing.cumulative % 1) + 1) % 1;

    const floor = Math.floor(timing.cumulative);
    if (floor !== timing.lastFloor) {
      if (floor === timing.lastFloor + 1 && timing.elapsed > 1) {
        const lapTime = timing.elapsed;
        if (timing.best == null || lapTime < timing.best) timing.best = lapTime;
        timing.lap += 1;
        timing.elapsed = 0;
      }
      timing.lastFloor = floor;
    }
    timing.elapsed += delta;
  }

  function spawnPointAt(t) {
    const p = track.curve.getPointAt(t);
    return new THREE.Vector3(p.x, track.roadSurfaceHeightAt(t) + SPAWN_CLEARANCE, p.z);
  }

  function placeCarAt(t) {
    const b = vehicle.body;
    const p = spawnPointAt(t);
    const tan = track.curve.getTangentAt(t).normalize();
    const yaw = Math.atan2(tan.x, tan.z);
    b.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    b.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    vehicle.resetGearbox();
    vehicle.snapInterpolation();
    progressSample = -1;
    resetCamera();
  }

  function respawn() {
    placeCarAt(0);
    flipTimer = 0;
    resetTiming();
  }

  function resetWorld(seed) {
    if (vehicleGuiFolder) { vehicleGuiFolder.destroy(); vehicleGuiFolder = null; }
    if (track) scene.remove(track.group);
    if (vehicle) scene.remove(vehicle.group);
    if (hud) { hud.destroy(); hud = null; }
    physics.world.forEachRigidBody((body) => physics.world.removeRigidBody(body));
    skidmarks.clear();
    particles.clear();
    track = createTrack(scene, physics, materials, seed);
    vehicle = createVehicle(scene, physics, spawnPointAt(0), track.tangent, pandaGltf.scene, track.colliders, environment);
    vehicle.setChassisTransparent(settings.chassisTransparent);
    vehicleGuiFolder = vehicle.addGui(gui);
    buildProgressSamples();
    resetCamera();
    resetTiming();
    hud = createHud(track.curve);
    flipTimer = 0;
    offRoadTimer = 0;
    renderer.compile(scene, camera);
  }
  resetWorld(settings.seed);
  renderer.render(scene, camera);

  const debug = createDebugRenderer(scene, physics.world, gui, renderer);
  const clock = new THREE.Clock();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) clock.getDelta();
  });

  window.addEventListener('keydown', () => audio.resume(), { once: true });
  window.addEventListener('pointerdown', () => audio.resume(), { once: true });
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (event.code === 'Escape') {
      paused = !paused;
      if (pauseOverlay) pauseOverlay.hidden = !paused;
      audio.setPaused(paused);
    } else if (event.code === 'KeyR') {
      respawn();
    }
  });

  function detectImpacts() {
    const colliders = track.hazards.colliders;
    const positions = track.hazards.positions;
    const t = vehicle.body.translation();
    for (let i = 0; i < colliders.length; i++) {
      const spot = positions[i];
      const dx = spot[0] - t.x;
      const dz = spot[2] - t.z;
      if (dx * dx + dz * dz > 36) continue;
      physics.world.contactPair(vehicle.bodyCollider, colliders[i], (manifold) => {
        let impulse = 0;
        const n = manifold.numContacts();
        for (let k = 0; k < n; k++) impulse += Math.abs(manifold.contactImpulse(k) || 0);
        if (impulse > 1500) {
          const intensity = Math.min(impulse / 7000, 1);
          shake = Math.max(shake, 0.2 + intensity * 0.6);
          audio.impact(intensity);
        }
      });
    }
  }

  function emitDust(delta) {
    const st = vehicle.state;
    dustAccum += delta;
    if (st.offRoad && st.speed > 2) {
      const interval = st.speed > 8 ? 0.06 : 0.12;
      if (dustAccum > interval) {
        dustAccum = 0;
        for (let i = 0; i < 4; i++) {
          if (st.contactPoints[i]) {
            particles.emit(st.contactPoints[i], 0xc0b096, 2.2, 12, 0.9, 0.6);
          }
        }
      }
    } else if (st.slipAmount > 0.55) {
      const interval = 0.05;
      if (dustAccum > interval) {
        dustAccum = 0;
        for (let i = 0; i < 4; i++) {
          if (st.skids[i] && st.contactPoints[i]) {
            particles.emit(st.contactPoints[i], 0xdddddd, 2.2, 12, 0.45, 0.6);
          }
        }
      }
    }
  }

  function isTrackCollider(collider) {
    return !!track && (
      collider.handle === track.colliders.road.handle ||
      collider.handle === track.colliders.terrain.handle
    );
  }

  function castCameraRay(origin, dir, maxToi) {
    camRay.origin.x = origin.x;
    camRay.origin.y = origin.y;
    camRay.origin.z = origin.z;
    camRay.dir.x = dir.x;
    camRay.dir.y = dir.y;
    camRay.dir.z = dir.z;
    return physics.world.castRay(camRay, maxToi, true, 0, undefined, undefined, undefined, isTrackCollider);
  }

  function clampCameraAboveGround(position) {
    tmpProbe.set(position.x, position.y + 10, position.z);
    const hit = castCameraRay(tmpProbe, camDown, 20);
    if (!hit) return;
    const groundY = tmpProbe.y - hit.timeOfImpact;
    const minY = groundY + 0.6;
    if (position.y < minY) position.y = minY;
  }

  function resolveCameraCollision(target, desired) {
    camRayDir.copy(desired).sub(target);
    const distance = camRayDir.length();
    if (distance < 0.001) return;
    camRayDir.multiplyScalar(1 / distance);
    const hit = castCameraRay(target, camRayDir, distance);
    if (hit && hit.timeOfImpact < distance) {
      const safeDistance = Math.max(hit.timeOfImpact - CAM_COLLISION_MARGIN, CAM_MIN_DISTANCE);
      desired.copy(target).addScaledVector(camRayDir, safeDistance);
    }
    clampCameraAboveGround(desired);
  }

  function resetCamera() {
    if (!vehicle) return;
    const t = vehicle.body.translation();
    const r = vehicle.body.rotation();
    tmpQuat.set(r.x, r.y, r.z, r.w);
    camForward.set(0, 0, 1).applyQuaternion(tmpQuat);
    camForward.y = 0;
    if (camForward.lengthSq() < 1e-4) camForward.set(0, 0, 1);
    camForward.normalize();
    chasePosition.set(t.x, t.y, t.z).addScaledVector(camForward, -CAM_DISTANCE);
    chasePosition.y += CAM_HEIGHT;
    chaseTarget.set(t.x, t.y + tmpUp.y, t.z);
    cameraVel.set(0, 0, 0);
    smoothedVelocity.set(0, 0, 0);
    shake = 0;
    camera.fov = CAM_BASE_FOV;
    camera.position.copy(chasePosition);
    camera.lookAt(chaseTarget);
    camera.updateProjectionMatrix();
    sky.position.copy(camera.position);
  }

  function updateCamera(delta) {
    const car = vehicle.group;
    const speed = Math.abs(vehicle.state.speed);

    camForward.set(0, 0, 1).applyQuaternion(car.quaternion);
    camForward.y = 0;
    if (camForward.lengthSq() < 1e-4) camForward.set(0, 0, 1);
    camForward.normalize();

    const distance = CAM_DISTANCE + Math.min(speed, 35) * 0.06;
    desiredPosition.copy(car.position).addScaledVector(camForward, -distance);
    desiredPosition.y += CAM_HEIGHT;

    const lin = vehicle.body.linvel();
    tmpVelocity.set(lin.x, 0, lin.z);
    smoothedVelocity.lerp(tmpVelocity, 1 - Math.exp(-delta * 8));

    const forwardSpeed = smoothedVelocity.x * camForward.x + smoothedVelocity.z * camForward.z;
    tmpLateral.set(
      smoothedVelocity.x - camForward.x * forwardSpeed,
      0,
      smoothedVelocity.z - camForward.z * forwardSpeed
    );

    const lookAhead = Math.min(2 + speed * 0.12, 8);
    tmpLook.copy(camForward).multiplyScalar(lookAhead).addScaledVector(tmpLateral, 0.15);
    desiredTarget.copy(car.position).add(tmpUp).add(tmpLook);

    resolveCameraCollision(desiredTarget, desiredPosition);
    smoothDamp(chasePosition, desiredPosition, cameraVel, CAM_SMOOTH_TIME, delta);
    clampCameraAboveGround(chasePosition);

    chaseTarget.lerp(desiredTarget, 1 - Math.exp(-delta * 6));

    const targetFov = CAM_BASE_FOV + Math.min(speed, 35) * 0.42;
    const nextFov = camera.fov + (targetFov - camera.fov) * (1 - Math.exp(-delta * 3.5));
    if (Math.abs(nextFov - camera.fov) > 1e-3) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }

    camera.position.copy(chasePosition);
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      camera.position.z += (Math.random() - 0.5) * shake;
    }
    camera.lookAt(chaseTarget);
    sky.position.copy(camera.position);

    sun.position.copy(car.position).add(sunOffset);
    sun.target.position.copy(car.position);
    sun.target.updateMatrixWorld();
  }

  function handleRespawn(delta) {
    const st = vehicle.state;
    if (st.flipped) flipTimer += delta;
    else flipTimer = 0;
    const t = vehicle.body.translation();
    if (flipTimer > 2 || t.y < -15) respawn();
  }

  function handleOffRoad(delta) {
    const st = vehicle.state;
    const fullyOffRoad = st.surfaces.every((surface) => surface === 'dirt');
    if (fullyOffRoad) {
      offRoadTimer += delta;
      if (offRoadTimer > 4) {
        offRoadTimer = 0;
        const t = vehicle.body.translation();
        placeCarAt(trackProgress(t.x, t.z));
      }
    } else {
      offRoadTimer = 0;
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), MAX_DELTA);
    const instantFps = 1 / Math.max(delta, 1e-4);
    fpsSmoothed += (instantFps - fpsSmoothed) * Math.min(delta * 4, 1);
    if (hud) hud.setFps(fpsSmoothed);
    input.poll();
    if (paused) {
      renderer.render(scene, camera);
      return;
    }
    const alpha = physics.step(delta, (dt) => vehicle.update(input, dt));
    vehicle.sync(alpha);
    skidmarks.update(vehicle.state);
    particles.update(delta);
    emitDust(delta);
    audio.update(vehicle.state);
    detectImpacts();
    handleRespawn(delta);
    handleOffRoad(delta);
    updateTiming(delta, input.throttle);
    hud.update({
      lap: timing.lap,
      time: timing.elapsed,
      best: timing.best,
      progress: timing.progress,
      pos: vehicle.body.translation(),
      gear: vehicle.state.gear,
      rpm: vehicle.state.rpm,
      redline: vehicle.state.redline
    });
    shake *= Math.exp(-delta * 4.8);
    if (shake < 0.001) shake = 0;
    sky.material.uniforms.time.value += delta;
    updateCamera(delta);
    debug.update(delta, fpsSmoothed);
    renderer.render(scene, camera);
  }

  animate();
}

bootstrap().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<pre class="boot-error">${error.stack || error.message}</pre>`;
});
