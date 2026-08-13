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
const CAM_STIFFNESS = 70;
const CAM_DAMPING = 16;

async function bootstrap() {
  const canvas = document.querySelector('#app');
  const { scene, renderer, camera, materials, sun, sky } = createScene(canvas);
  const physics = await createPhysics();
  const input = createInput();

  const loader = new GLTFLoader();
  const pandaGltf = await loader.loadAsync('models/panda.glb?t=' + Date.now());
  const gui = new GUI({ title: 'Panda Racing Debug' });
  gui.close();
  const settings = { seed: 1337, audio: true, regenerate: () => resetWorld(settings.seed) };
  gui.add(settings, 'seed', 1, 999999, 1);
  gui.add(settings, 'regenerate').name('Rigenera tracciato');
  const audio = createAudio();
  gui.add(settings, 'audio').name('Audio').onChange((v) => audio.setEnabled(v));

  let track;
  let vehicle;
  let vehicleGuiFolder;
  let hud;
  let flipTimer = 0;
  let offRoadTimer = 0;
  const skidmarks = createSkidMarks(scene);
  const particles = createParticles(scene);

  let progressPts = new Float32Array((PROGRESS_SAMPLES + 1) * 3);

  function buildProgressSamples() {
    for (let i = 0; i <= PROGRESS_SAMPLES; i++) {
      const p = track.curve.getPointAt(i / PROGRESS_SAMPLES);
      progressPts[i * 3] = p.x;
      progressPts[i * 3 + 1] = p.y;
      progressPts[i * 3 + 2] = p.z;
    }
  }

  function trackProgress(x, z) {
    const n = PROGRESS_SAMPLES;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i <= n; i++) {
      const dx = progressPts[i * 3] - x;
      const dz = progressPts[i * 3 + 2] - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    let t = best / n;
    let bt = t;
    let bd = bestD;
    const step = 1 / n;
    for (let k = 1; k <= 6; k++) {
      for (const s of [-1, 1]) {
        let tt = t + s * k * (step / 6);
        tt = ((tt % 1) + 1) % 1;
        const p = track.curve.getPointAt(tt);
        const dx = p.x - x;
        const dz = p.z - z;
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

  function placeCarAt(t) {
    const b = vehicle.body;
    const p = track.curve.getPointAt(t);
    const tan = track.curve.getTangentAt(t).normalize();
    const yaw = Math.atan2(tan.x, tan.z);
    b.setTranslation({ x: p.x, y: p.y + 0.55, z: p.z }, true);
    b.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    vehicle.resetGearbox();
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
    vehicle = createVehicle(scene, physics, track.start, track.tangent, pandaGltf.scene, track.colliders);
    vehicleGuiFolder = vehicle.addGui(gui);
    buildProgressSamples();
    resetTiming();
    hud = createHud(track.curve);
    flipTimer = 0;
    offRoadTimer = 0;
  }
  resetWorld(settings.seed);

  const debug = createDebugRenderer(scene, physics.world, gui);
  const clock = new THREE.Clock();
  const chasePosition = new THREE.Vector3();
  const chaseTarget = new THREE.Vector3();
  const cameraVel = new THREE.Vector3();

  let shake = 0;
  let dustAccum = 0;

  window.addEventListener('keydown', () => audio.resume(), { once: true });
  window.addEventListener('pointerdown', () => audio.resume(), { once: true });

  function detectImpacts() {
    for (const hazardCollider of track.hazards.colliders) {
      physics.world.contactPair(vehicle.bodyCollider, hazardCollider, (manifold) => {
        let impulse = 0;
        const n = manifold.numContacts();
        for (let i = 0; i < n; i++) impulse += Math.abs(manifold.contactImpulse(i) || 0);
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

  const sunOffset = new THREE.Vector3(-45, 65, 20);
  const desiredPosition = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const tmpOffset = new THREE.Vector3();
  const tmpUp = new THREE.Vector3(0, 1.2, 0);
  const tmpLook = new THREE.Vector3();

  function updateCamera(delta) {
    const car = vehicle.group;
    const speed = Math.abs(vehicle.state.speed);

    desiredPosition.copy(car.position).add(tmpOffset.set(0, 5.5, -10).applyQuaternion(car.quaternion));
    cameraVel.addScaledVector(desiredPosition.sub(chasePosition), CAM_STIFFNESS * delta);
    cameraVel.multiplyScalar(1 / (1 + CAM_DAMPING * delta));
    chasePosition.addScaledVector(cameraVel, delta);

    tmpLook.set(vehicle.body.linvel().x, 0, vehicle.body.linvel().z);
    const lookAhead = Math.min(2 + speed * 0.12, 8);
    if (tmpLook.lengthSq() > 0.001) tmpLook.normalize().multiplyScalar(lookAhead);
    else tmpLook.set(0, 0, 0);
    desiredTarget.copy(car.position).add(tmpUp).add(tmpLook);
    const targetAlpha = 1 - Math.exp(-delta * 6);
    chaseTarget.lerp(desiredTarget, targetAlpha);

    const targetFov = 60 + Math.min(speed, 35) * 0.42;
    camera.fov += (targetFov - camera.fov) * Math.min(delta * 3, 1);
    camera.updateProjectionMatrix();

    camera.position.copy(chasePosition);
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      camera.position.z += (Math.random() - 0.5) * shake;
    }
    camera.lookAt(chaseTarget);

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
    if (vehicle.state.offRoad) {
      offRoadTimer += delta;
      if (offRoadTimer > 3) {
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
    const delta = clock.getDelta();
    physics.step(delta, (dt) => vehicle.update(input, dt));
    vehicle.sync();
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
    shake = Math.max(0, shake - delta * 2.4);
    sky.material.uniforms.time.value += delta;
    updateCamera(delta);
    debug.update();
    renderer.render(scene, camera);
  }

  chasePosition.copy(vehicle.group.position).add(new THREE.Vector3(0, 6, -12));
  chaseTarget.copy(vehicle.group.position);
  animate();
}

bootstrap().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<pre class="boot-error">${error.stack || error.message}</pre>`;
});
