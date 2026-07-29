import * as THREE from 'three';
import GUI from 'lil-gui';
import { createScene } from './scene.js';
import { createTrack } from './track.js';
import { createVehicle } from './vehicle.js';
import { createInput } from './input.js';
import './style.css';

const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);

function bootstrap() {
  const canvas = document.querySelector('#app');
  const { scene, renderer, camera, materials } = createScene(canvas);
  const input = createInput();
  const gui = new GUI({ title: 'Panda Racing' });
  const settings = { seed: 1337, regenerate: () => resetWorld(settings.seed) };
  gui.add(settings, 'seed', 1, 999999, 1);
  gui.add(settings, 'regenerate').name('Rigenera tracciato');

  let track;
  let vehicle;

  function getGroundHeight(x, z) {
    raycaster.set(new THREE.Vector3(x, 200, z), down);
    const hits = raycaster.intersectObject(track.road, false);
    if (hits.length > 0) return hits[0].point.y;
    const hitsGround = raycaster.intersectObject(track.ground, false);
    if (hitsGround.length > 0) return hitsGround[0].point.y;
    return null;
  }

  function resetWorld(seed) {
    if (track) {
      scene.remove(track.road);
      scene.remove(track.ground);
    }
    if (vehicle) scene.remove(vehicle.group);
    track = createTrack(scene, materials, seed);
    vehicle = createVehicle(scene, materials, track.start, track.tangent);
    vehicle.addGui(gui);
  }
  resetWorld(settings.seed);

  const clock = new THREE.Clock();
  const chasePosition = new THREE.Vector3();
  const chaseTarget = new THREE.Vector3();

  function updateCamera(delta) {
    const car = vehicle.group;
    const desiredOffset = new THREE.Vector3(0, 5.5, -10).applyQuaternion(car.quaternion);
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
    const delta = Math.min(clock.getDelta(), 0.1);
    vehicle.update(input, delta, getGroundHeight);
    updateCamera(delta);
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
