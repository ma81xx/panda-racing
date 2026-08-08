import * as THREE from 'three';
import GUI from 'lil-gui';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createScene } from './scene.js';
import { createPhysics } from './physics.js';
import { createTrack } from './track.js';
import { createVehicle } from './vehicle.js';
import { createInput } from './input.js';
import { createDebugRenderer } from './debugRenderer.js';
import { createFx } from './fx.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import './style.css';

const CAM_MODES = ['chase', 'cockpit', 'hood'];

function gearFor(speedKmh) {
  if (speedKmh < 1) return 'N';
  if (speedKmh < 25) return '1';
  if (speedKmh < 45) return '2';
  if (speedKmh < 70) return '3';
  if (speedKmh < 100) return '4';
  if (speedKmh < 135) return '5';
  return '6';
}

function sampleCurve(curve, n = 520) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(curve.getPointAt(i / n));
  return pts;
}

async function bootstrap() {
  const canvas = document.querySelector('#app');
  const { scene, renderer, camera, materials, renderFrame, bloom, setBloom } = createScene(canvas);
  const physics = await createPhysics();
  const input = createInput();
  const hud = createHud();
  const audio = createAudio();

  const startAudio = () => audio.start();
  window.addEventListener('keydown', startAudio, { once: true });
  window.addEventListener('pointerdown', startAudio, { once: true });

  const loader = new GLTFLoader();
  const pandaGltf = await loader.loadAsync('models/panda.glb?t=' + Date.now());
  const gui = new GUI({ title: 'Panda Racing Debug' });
  gui.close();
  const settings = { seed: 1337, regenerate: () => resetWorld(settings.seed) };
  gui.add(settings, 'seed', 1, 999999, 1);
  gui.add(settings, 'regenerate').name('Rigenera tracciato');

  const renderGui = gui.addFolder('Rendering');
  renderGui.add(renderer, 'toneMappingExposure', 0.2, 3, 0.05).name('esposizione');
  renderGui.add(scene, 'environmentIntensity', 0, 3, 0.05).name('luce ambiente');
  renderGui.add(bloom, 'enabled').name('bloom').onChange(setBloom);
  renderGui.add(bloom, 'strength', 0, 1.5, 0.05).name('intensità bloom');
  renderGui.add(bloom, 'radius', 0, 1, 0.05).name('raggio bloom');

  const cam = {
    lag: 3.0,
    baseFov: 60,
    fovBoost: 0.6,
    maxFov: 82,
    leanStrength: 0.004,
    leanMax: 0.09,
    shakeStrength: 0.012,
    shakeMax: 0.03
  };
  let camMode = 0;
  const camModeObj = { mode: CAM_MODES[0] };
  const camGui = gui.addFolder('Camera');
  camGui.add(cam, 'lag', 0.5, 8, 0.1).name('ritardo (inverso)');
  camGui.add(cam, 'baseFov', 50, 80, 1).name('FOV base');
  camGui.add(cam, 'fovBoost', 0, 1.5, 0.05).name('FOV velocità');
  camGui.add(cam, 'maxFov', 60, 110, 1).name('FOV max');
  camGui.add(cam, 'leanStrength', 0, 0.05, 0.002).name('inclinazione curva');
  camGui.add(cam, 'leanMax', 0, 0.3, 0.01).name('inclinazione max');
  camGui.add(cam, 'shakeStrength', 0, 0.1, 0.003).name('vibrazione buche');
  camGui.add(cam, 'shakeMax', 0, 0.15, 0.01).name('vibrazione max');
  const camModeController = camGui.add(camModeObj, 'mode', CAM_MODES).name('camera (tasto C)').onChange((v) => {
    camMode = CAM_MODES.indexOf(v);
  });
  input.onCameraCycle = () => {
    camMode = (camMode + 1) % CAM_MODES.length;
    camModeObj.mode = CAM_MODES[camMode];
    camModeController.updateDisplay();
  };

  let track;
  let vehicle;
  let fx;
  let vehicleGuiFolder;
  let audioGuiFolder;
  let fxGuiFolder;
  let lapSamples = [];
  let prevProgressIdx = 0;
  let lapStartTime = performance.now();
  let lapTime = 0;
  let bestLap = Infinity;
  const chasePosition = new THREE.Vector3();
  const chaseTarget = new THREE.Vector3();
  let impactShake = 0;
  let prevVy = 0;
  let currentFov = cam.baseFov;
  let currentLean = 0;

  function resetWorld(seed) {
    if (vehicleGuiFolder) { vehicleGuiFolder.destroy(); vehicleGuiFolder = null; }
    if (audioGuiFolder) { audioGuiFolder.destroy(); audioGuiFolder = null; }
    if (fxGuiFolder) { fxGuiFolder.destroy(); fxGuiFolder = null; }
    if (track) scene.remove(track.group);
    if (vehicle) scene.remove(vehicle.group);
    if (fx) fx.clear();
    physics.world.forEachRigidBody((body) => physics.world.removeRigidBody(body));
    track = createTrack(scene, physics, materials, seed);
    vehicle = createVehicle(scene, physics, track.start, track.tangent, pandaGltf.scene);
    vehicleGuiFolder = vehicle.addGui(gui);
    audioGuiFolder = audio.addGui(gui);
    fxGuiFolder = fx.addGui(gui);

    lapSamples = sampleCurve(track.curve);
    prevProgressIdx = 0;
    lapStartTime = performance.now();
    lapTime = 0;
    bestLap = Infinity;
    impactShake = 0;
    prevVy = 0;
    currentFov = cam.baseFov;
    currentLean = 0;
    hud.reset();

    vehicle.sync();
    chasePosition.copy(vehicle.group.position).add(new THREE.Vector3(0, 5, -9));
    chaseTarget.copy(vehicle.group.position);
  }
  fx = createFx(scene, () => vehicle);
  resetWorld(settings.seed);

  const debug = createDebugRenderer(scene, physics.world, gui);
  const clock = new THREE.Clock();
  const tmpFwd = new THREE.Vector3();
  const tmpUp = new THREE.Vector3();
  const tmpView = new THREE.Vector3();

  function updateCamera(delta) {
    const car = vehicle.group;
    const body = vehicle.body;
    const vel = body.linvel();
    const angvel = body.angvel();
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);

    if (camMode === 0) {
      tmpFwd.set(0, 0, 1).applyQuaternion(car.quaternion);
      tmpUp.set(0, 1, 0).applyQuaternion(car.quaternion);
      const forwardSpeed = vel.x * tmpFwd.x + vel.y * tmpFwd.y + vel.z * tmpFwd.z;
      const yawRate = angvel.x * tmpUp.x + angvel.y * tmpUp.y + angvel.z * tmpUp.z;
      const latAccel = forwardSpeed * yawRate;

      const desiredOffset = new THREE.Vector3(0, 4.5, -8).applyQuaternion(car.quaternion);
      const desiredPosition = car.position.clone().add(desiredOffset);
      const desiredTarget = car.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      const alpha = 1 - Math.exp(-delta * cam.lag);
      chasePosition.lerp(desiredPosition, alpha);
      chaseTarget.lerp(desiredTarget, alpha);

      camera.position.copy(chasePosition);

      const targetLean = Math.max(-cam.leanMax, Math.min(cam.leanMax, latAccel * cam.leanStrength));
      currentLean += (targetLean - currentLean) * Math.min(delta * 6, 1);
      if (currentLean !== 0) {
        camera.lookAt(chaseTarget);
        camera.getWorldDirection(tmpView);
        camera.rotateOnWorldAxis(tmpView, currentLean);
      } else {
        camera.lookAt(chaseTarget);
      }
    } else {
      const offset = new THREE.Vector3(
        0,
        camMode === 1 ? 0.55 : 0.85,
        camMode === 1 ? 0.3 : 0.5
      ).applyQuaternion(car.quaternion);
      camera.position.copy(car.position).add(offset);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(car.quaternion);
      const aim = car.position.clone().addScaledVector(fwd, 30);
      aim.y += camMode === 1 ? 0.6 : 0;
      camera.lookAt(aim);
    }

    const vy = vel.y;
    const dvy = vy - prevVy;
    prevVy = vy;
    const bump = Math.abs(vy) + Math.abs(dvy) * 0.2;
    const amp = Math.min(bump * cam.shakeStrength, cam.shakeMax) + impactShake;
    impactShake *= Math.exp(-delta * 3.5);
    if (amp > 0) {
      camera.position.x += (Math.random() * 2 - 1) * amp;
      camera.position.y += (Math.random() * 2 - 1) * amp;
    }

    const targetFov = Math.min(cam.maxFov, cam.baseFov + speed * cam.fovBoost);
    currentFov += (targetFov - currentFov) * Math.min(delta * 3, 1);
    if (camera.fov !== currentFov) {
      camera.fov = currentFov;
      camera.updateProjectionMatrix();
    }
  }

  function handleEvents() {
    physics.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      if (h1 !== vehicle.collider.handle && h2 !== vehicle.collider.handle) return;
      const vy = vehicle.body.linvel().y;
      const speed = vehicle.speed;
      if (vy < -2.5 || speed > 8) {
        const strength = Math.min(1, Math.max(0.2, Math.abs(vy) / 8 * 0.6 + speed / 60 * 0.4));
        const p = vehicle.group.position;
        fx.onImpact(p.x, p.y, p.z, strength * 2);
        audio.thud(strength);
        impactShake = Math.max(impactShake, strength * 0.06);
      }
    });
  }

  function computeSlipLevel() {
    const state = vehicle.getWheelState();
    let level = 0;
    for (const ws of state) {
      if (ws.sideImp > 0) level = Math.max(level, Math.min(1, ws.sideImp / 120));
      if (ws.fwdImp > 350) level = Math.max(level, Math.min(1, (ws.fwdImp - 350) / 300));
    }
    if (input.handbrake && vehicle.speed > 4) level = Math.max(level, 0.6);
    if (input.braking && vehicle.speed > 8) level = Math.max(level, 0.4);
    return level;
  }

  function updateLap() {
    const pos = vehicle.group.position;
    let bestIdx = prevProgressIdx;
    let bestD = Infinity;
    const n = lapSamples.length;
    for (let i = 0; i < n; i++) {
      const dx = pos.x - lapSamples[i].x;
      const dz = pos.z - lapSamples[i].z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; bestIdx = i; }
    }
    if (prevProgressIdx > n * 0.85 && bestIdx < n * 0.15) {
      const tangent = track.curve.getTangentAt(bestIdx / n);
      const vel = vehicle.body.linvel();
      const fwd = vel.x * tangent.x + vel.y * tangent.y + vel.z * tangent.z;
      if (fwd > 0) {
        const now = performance.now();
        lapTime = (now - lapStartTime) / 1000;
        if (lapTime > 3 && lapTime < bestLap) bestLap = lapTime;
        lapStartTime = now;
      }
    }
    prevProgressIdx = bestIdx;

    const speedKmh = vehicle.speed * 3.6;
    const rpm01 = Math.min(1, Math.max(0, vehicle.speed / 55)) * 0.7 + (input.throttle ? 0.3 : 0);
    hud.update({
      speedKmh,
      gear: gearFor(speedKmh),
      lapTime: (performance.now() - lapStartTime) / 1000,
      bestLap,
      rpm01
    });
  }

  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    physics.step(delta, (dt) => vehicle.update(input, dt));
    handleEvents();
    vehicle.sync();
    fx.update(delta, input);
    audio.update(delta, { speed: vehicle.speed, throttle: input.throttle, slipLevel: computeSlipLevel() });
    updateCamera(delta);
    updateLap();
    debug.update();
    renderFrame();
  }

  animate();
}

bootstrap().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<pre class="boot-error">${error.stack || error.message}</pre>`;
});
