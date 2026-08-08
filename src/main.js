import * as THREE from 'three';
import GUI from 'lil-gui';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createScene } from './scene.js';
import { createPhysics } from './physics.js';
import { createTrack } from './track.js';
import { createVehicle } from './vehicle.js';
import { createInput } from './input.js';
import { createDebugRenderer } from './debugRenderer.js';
import './style.css';

async function bootstrap() {
  const canvas = document.querySelector('#app');
  const { scene, renderer, camera, materials } = createScene(canvas);
  const physics = await createPhysics();
  const input = createInput();

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
  const camGui = gui.addFolder('Camera');
  camGui.add(cam, 'lag', 0.5, 8, 0.1).name('ritardo (inverso)');
  camGui.add(cam, 'baseFov', 50, 80, 1).name('FOV base');
  camGui.add(cam, 'fovBoost', 0, 1.5, 0.05).name('FOV velocità');
  camGui.add(cam, 'maxFov', 60, 110, 1).name('FOV max');
  camGui.add(cam, 'leanStrength', 0, 0.05, 0.002).name('inclinazione curva');
  camGui.add(cam, 'leanMax', 0, 0.3, 0.01).name('inclinazione max');
  camGui.add(cam, 'shakeStrength', 0, 0.1, 0.003).name('vibrazione buche');
  camGui.add(cam, 'shakeMax', 0, 0.15, 0.01).name('vibrazione max');

  let track;
  let vehicle;
  let vehicleGuiFolder;
  function resetWorld(seed) {
    if (vehicleGuiFolder) { vehicleGuiFolder.destroy(); vehicleGuiFolder = null; }
    if (track) scene.remove(track.group);
    if (vehicle) scene.remove(vehicle.group);
    physics.world.forEachRigidBody((body) => physics.world.removeRigidBody(body));
    track = createTrack(scene, physics, materials, seed);
    vehicle = createVehicle(scene, physics, track.start, track.tangent, pandaGltf.scene);
    vehicleGuiFolder = vehicle.addGui(gui);
  }
  resetWorld(settings.seed);

  const debug = createDebugRenderer(scene, physics.world, gui);
  const clock = new THREE.Clock();
  const chasePosition = new THREE.Vector3();
  const chaseTarget = new THREE.Vector3();
  const tmpFwd = new THREE.Vector3();
  const tmpUp = new THREE.Vector3();
  const tmpView = new THREE.Vector3();
  let prevVy = 0;
  let currentFov = cam.baseFov;
  let currentLean = 0;

  function updateCamera(delta) {
    const car = vehicle.group;
    const body = vehicle.body;
    const vel = body.linvel();
    const angvel = body.angvel();
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);

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

    const vy = vel.y;
    const dvy = vy - prevVy;
    prevVy = vy;
    const bump = Math.abs(vy) + Math.abs(dvy) * 0.2;
    const amp = Math.min(bump * cam.shakeStrength, cam.shakeMax);

    camera.position.copy(chasePosition);
    camera.position.x += (Math.random() * 2 - 1) * amp;
    camera.position.y += (Math.random() * 2 - 1) * amp;
    camera.lookAt(chaseTarget);

    const targetLean = Math.max(-cam.leanMax, Math.min(cam.leanMax, latAccel * cam.leanStrength));
    currentLean += (targetLean - currentLean) * Math.min(delta * 6, 1);
    if (currentLean !== 0) {
      camera.getWorldDirection(tmpView);
      camera.rotateOnWorldAxis(tmpView, currentLean);
    }

    const targetFov = Math.min(cam.maxFov, cam.baseFov + speed * cam.fovBoost);
    currentFov += (targetFov - currentFov) * Math.min(delta * 3, 1);
    if (camera.fov !== currentFov) {
      camera.fov = currentFov;
      camera.updateProjectionMatrix();
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    physics.step(delta, (dt) => vehicle.update(input, dt));
    vehicle.sync();
    updateCamera(delta);
    debug.update();
    renderer.render(scene, camera);
  }

  chasePosition.copy(vehicle.group.position).add(new THREE.Vector3(0, 5, -9));
  chaseTarget.copy(vehicle.group.position);
  animate();
}

bootstrap().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<pre class="boot-error">${error.stack || error.message}</pre>`;
});
