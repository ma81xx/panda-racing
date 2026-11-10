import * as THREE from 'three';

const PUFF_COUNT = 36;
const PER_PUFF = 14;
const BASE_SIZE = 0.85;

function createDustTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.45, 'rgba(255, 255, 255, 0.75)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createParticles(scene) {
  const puffs = [];
  let nextPuff = 0;
  const dustTexture = createDustTexture();

  for (let i = 0; i < PUFF_COUNT; i++) {
    const material = new THREE.PointsMaterial({
      color: 0xc8c0b0,
      size: BASE_SIZE,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      map: dustTexture,
      alphaTest: 0.01
    });
    const positions = new Float32Array(PER_PUFF * 3);
    for (let k = 0; k < PER_PUFF; k++) positions[k * 3 + 1] = -9999;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.visible = false;
    scene.add(points);
    puffs.push({
      points,
      material,
      geometry,
      positions,
      velocities: new Float32Array(PER_PUFF * 3),
      life: 0,
      maxLife: 1,
      count: PER_PUFF,
      alive: false
    });
  }

  function emit(position, color = 0xc8c0b0, speed = 2, count = PER_PUFF, maxLife = 0.9, spread = 0.7) {
    const puff = puffs[nextPuff];
    nextPuff = (nextPuff + 1) % PUFF_COUNT;
    puff.alive = true;
    puff.points.visible = true;
    puff.life = maxLife;
    puff.maxLife = maxLife;
    puff.count = Math.min(count, PER_PUFF);
    puff.material.size = BASE_SIZE;
    puff.material.color.setHex(color);
    for (let i = 0; i < puff.count; i++) {
      puff.positions[i * 3] = position.x + (Math.random() - 0.5) * spread;
      puff.positions[i * 3 + 1] = position.y + Math.random() * 0.4;
      puff.positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * spread;
      puff.velocities[i * 3] = (Math.random() - 0.5) * speed * 0.8;
      puff.velocities[i * 3 + 1] = 0.4 + Math.random() * speed * 0.7;
      puff.velocities[i * 3 + 2] = (Math.random() - 0.5) * speed * 0.8;
    }
    for (let i = puff.count; i < PER_PUFF; i++) puff.positions[i * 3 + 1] = -9999;
    puff.geometry.attributes.position.needsUpdate = true;
  }

  function update(dt) {
    for (const puff of puffs) {
      if (!puff.alive) continue;
      puff.life -= dt;
      if (puff.life <= 0) {
        puff.alive = false;
        puff.material.opacity = 0;
        puff.points.visible = false;
        continue;
      }
      const g = 3.4 * dt;
      for (let i = 0; i < puff.count; i++) {
        puff.velocities[i * 3 + 1] -= g;
        puff.positions[i * 3] += puff.velocities[i * 3] * dt;
        puff.positions[i * 3 + 1] += puff.velocities[i * 3 + 1] * dt;
        puff.positions[i * 3 + 2] += puff.velocities[i * 3 + 2] * dt;
      }
      const age = 1 - puff.life / puff.maxLife;
      puff.material.opacity = (puff.life / puff.maxLife) * 0.55;
      puff.material.size = BASE_SIZE * (1 + age * 0.7);
      puff.geometry.attributes.position.needsUpdate = true;
    }
  }

  function clear() {
    for (const puff of puffs) {
      puff.alive = false;
      puff.material.opacity = 0;
      puff.points.visible = false;
    }
  }

  return { emit, update, clear };
}
