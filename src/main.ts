import * as THREE from 'three';
import GUI from 'lil-gui';
import { createScene } from './scene';
import { createPhysics } from './physics';
import { createTrack } from './track';
import { createVehicle } from './vehicle';
import { createInput } from './input';
import { createDebugRenderer } from './debug';
import './style.css';

const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);

async function bootstrap() {
  const loading = document.querySelector('#loading');
  if (loading) loading.classList.remove('hidden');

  const physics = await createPhysics();

  if (loading) loading.classList.add('hidden');

  const canvas = document.querySelector('#app') as HTMLCanvasElement;
  const { scene, renderer, camera, materials } = createScene(canvas);
  const input = createInput();
  const gui = new GUI({ title: 'Panda Racing' });
  const settings = { seed: 1337, regenerate: () => resetWorld(settings.seed) };
  gui.add(settings, 'seed', 1, 999999, 1);
  gui.add(settings, 'regenerate').name('Rigenera tracciato');

  let track = createTrack(scene, physics, materials, settings.seed);
  let vehicle = createVehicle(scene, physics, materials, track.start, track.tangent);
  vehicle.addGui(gui);

  function resetWorld(seed: number): void {
    scene.remove(track.road);
    scene.remove(track.ground);
    scene.remove(vehicle.group);
    track = createTrack(scene, physics, materials, seed);
    vehicle = createVehicle(scene, physics, materials, track.start, track.tangent);
    vehicle.addGui(gui);
  }

  const debug = createDebugRenderer(scene, physics.world, gui);
  const clock = new THREE.Clock();
  const chasePosition = new THREE.Vector3();
  const chaseTarget = new THREE.Vector3();

  function updateCamera(delta: number): void {
    const car = vehicle.group;
    const q = car.quaternion;
    const offset = new THREE.Vector3(0, 5.5, -10).applyQuaternion(q);
    const target = car.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const alpha = 1 - Math.exp(-delta * 5);
    chasePosition.lerp(car.position.clone().add(offset), alpha);
    chaseTarget.lerp(target, alpha);
    camera.position.copy(chasePosition);
    camera.lookAt(chaseTarget);
  }

  chasePosition.copy(vehicle.group.position).add(new THREE.Vector3(0, 6, -12));
  chaseTarget.copy(vehicle.group.position);

  function animate(): void {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    physics.step(delta, (dt) => vehicle.update(dt, input));
    vehicle.sync();
    updateCamera(delta);
    debug.update();
    renderer.render(scene, camera);
  }
  animate();
}

bootstrap().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<pre style="margin:2rem;color:#fff;background:#5b1d1d;padding:1rem;border-radius:.75rem;white-space:pre-wrap">${error.stack || error.message}</pre>`;
});
