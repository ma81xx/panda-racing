import * as THREE from 'three';

const PUFF_COUNT = 36;
const PER_PUFF = 14;

export function createParticles(scene) {
  const puffs = [];
  let nextPuff = 0;

  for (let i = 0; i < PUFF_COUNT; i++) {
    const material = new THREE.PointsMaterial({
      color: 0xc8c0b0,
      size: 0.85,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const positions = new Float32Array(PER_PUFF * 3);
    for (let k = 0; k < PER_PUFF; k++) positions[k * 3 + 1] = -9999;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
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
    puff.life = maxLife;
    puff.maxLife = maxLife;
    puff.count = Math.min(count, PER_PUFF);
    puff.material.color.setHex(color);
    for (let i = 0; i < puff.count; i++) {
      puff.positions[i * 3] = position.x + (Math.random() - 0.5) * spread;
      puff.positions[i * 3 + 1] = position.y + Math.random() * 0.4;
      puff.positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * spread;
      puff.velocities[i * 3] = (Math.random() - 0.5) * speed * 0.8;
      puff.velocities[i * 3 + 1] = 0.4 + Math.random() * speed * 0.7;
      puff.velocities[i * 3 + 2] = (Math.random() - 0.5) * speed * 0.8;
    }
    puff.geometry.attributes.position.needsUpdate = true;
  }

  function update(dt) {
    for (const puff of puffs) {
      if (!puff.alive) continue;
      puff.life -= dt;
      if (puff.life <= 0) {
        puff.alive = false;
        puff.material.opacity = 0;
        continue;
      }
      const g = 3.4 * dt;
      for (let i = 0; i < puff.count; i++) {
        puff.velocities[i * 3 + 1] -= g;
        puff.positions[i * 3] += puff.velocities[i * 3] * dt;
        puff.positions[i * 3 + 1] += puff.velocities[i * 3 + 1] * dt;
        puff.positions[i * 3 + 2] += puff.velocities[i * 3 + 2] * dt;
      }
      puff.material.opacity = (puff.life / puff.maxLife) * 0.55;
      puff.geometry.attributes.position.needsUpdate = true;
    }
  }

  function clear() {
    for (const puff of puffs) {
      puff.alive = false;
      puff.material.opacity = 0;
    }
  }

  return { emit, update, clear };
}
