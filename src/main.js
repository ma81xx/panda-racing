import * as THREE from 'three';
import GUI from 'lil-gui';
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
  const gui = new GUI({ title: 'Panda Racing Debug' });
  const settings = { seed: 1337, regenerate: () => resetWorld(settings.seed) };
  gui.add(settings, 'seed', 1, 999999, 1);
  gui.add(settings, 'regenerate').name('Rigenera tracciato');

  let track;
  let vehicle;
  function resetWorld(seed) {
    if (track) [track.road, track.ground].forEach((obj) => scene.remove(obj));
    if (vehicle) scene.remove(vehicle.group);
    physics.world.forEachRigidBody((body) => physics.world.removeRigidBody(body));
    track = createTrack(scene, physics, materials, seed);
    vehicle = createVehicle(scene, physics, materials, track.start, track.tangent);
    vehicle.addGui(gui);
  }
  resetWorld(settings.seed);

  const debug = createDebugRenderer(scene, physics.world, gui);
  const clock = new THREE.Clock();
  const chasePosition = new THREE.Vector3();
  const chaseTarget = new THREE.Vector3();

  function updateCamera(delta) {
    const car = vehicle.group;
    const desiredOffset = new THREE.Vector3(0, 5.5, 10).applyQuaternion(car.quaternion);
    const desiredPosition = car.position.clone().add(desiredOffset);
    const desiredTarget = car.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const alpha = 1 - Math.exp(-delta * 5);
    chasePosition.lerp(desiredPosition, alpha);
    chaseTarget.lerp(desiredTarget, alpha);
    camera.position.copy(chasePosition);
    camera.lookAt(chaseTarget);
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

  chasePosition.copy(vehicle.group.position).add(new THREE.Vector3(0, 6, 12));
  chaseTarget.copy(vehicle.group.position);
  animate();
}

bootstrap().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<pre class="boot-error">${error.stack || error.message}</pre>`;
});
