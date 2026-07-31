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

function createHud(): { updateRpm: (rpm: number) => void; updateSpeed: (kmh: number) => void } {
  const container = document.createElement('div');
  container.id = 'hud';
  container.innerHTML = `
    <canvas id="hud-rpm" width="180" height="180"></canvas>
    <div id="hud-speed"><span id="hud-speed-val">0</span><small>km/h</small></div>
  `;
  document.body.appendChild(container);

  const rpmCanvas = container.querySelector('#hud-rpm') as HTMLCanvasElement;
  const rpmCtx = rpmCanvas.getContext('2d')!;
  const speedEl = container.querySelector('#hud-speed-val') as HTMLElement;

  function drawRpm(rpm: number): void {
    const w = rpmCanvas.width;
    const h = rpmCanvas.height;
    rpmCtx.clearRect(0, 0, w, h);

    rpmCtx.beginPath();
    rpmCtx.arc(w / 2, h / 2, 75, Math.PI * 1.2, Math.PI * 2.8);
    rpmCtx.strokeStyle = 'rgba(255,255,255,0.3)';
    rpmCtx.lineWidth = 12;
    rpmCtx.stroke();

    rpmCtx.beginPath();
    rpmCtx.arc(w / 2, h / 2, 75, Math.PI * 1.2, Math.PI * 1.2 + (rpm / 7000) * Math.PI * 1.6);
    rpmCtx.strokeStyle = rpm > 5500 ? 'rgba(255,60,60,0.7)' : 'rgba(255,255,255,0.7)';
    rpmCtx.lineWidth = 12;
    rpmCtx.stroke();

    rpmCtx.fillStyle = 'rgba(255,255,255,0.8)';
    rpmCtx.font = 'bold 14px system-ui';
    rpmCtx.textAlign = 'center';
    rpmCtx.fillText(Math.round(rpm) + ' RPM', w / 2, h / 2 + 5);

    rpmCtx.font = '10px system-ui';
    rpmCtx.fillStyle = 'rgba(255,255,255,0.4)';
    rpmCtx.fillText('0', 30, h / 2 + 60);
    rpmCtx.fillText('7k', w - 30, h / 2 + 60);
  }

  return {
    updateRpm(rpm: number) { drawRpm(rpm); },
    updateSpeed(kmh: number) { speedEl.textContent = Math.round(kmh).toString(); },
  };
}

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

  const hud = createHud();
  const hudData = { rpm: 0, speed: 0 };

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
    physics.step(delta, (dt) => vehicle.update(dt, input, hudData));
    vehicle.sync();
    hud.updateRpm(hudData.rpm);
    hud.updateSpeed(hudData.speed);
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
