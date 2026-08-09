import * as THREE from 'three';

const MAX_SEGMENTS = 700;
const WHEEL_COUNT = 4;
const WIDTH = 0.1;
const LIFT = 0.02;

export function createSkidMarks(scene) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_SEGMENTS * 4 * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);

  const indices = new Uint32Array(MAX_SEGMENTS * 6);
  for (let i = 0; i < MAX_SEGMENTS; i++) {
    const base = i * 4;
    const o = i * 6;
    indices[o + 0] = base;
    indices[o + 1] = base + 2;
    indices[o + 2] = base + 1;
    indices[o + 3] = base;
    indices[o + 4] = base + 3;
    indices[o + 5] = base + 2;
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  const material = new THREE.MeshBasicMaterial({
    color: 0x141414,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  let cursor = 0;
  let count = 0;
  const last = new Array(WHEEL_COUNT).fill(null);
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const perp = new THREE.Vector3();

  function writeSegment(p0, p1) {
    if (count < MAX_SEGMENTS) count++;
    const slot = cursor % MAX_SEGMENTS;
    cursor++;

    dir.subVectors(p1, p0);
    const len = dir.length();
    if (len < 1e-4) return;
    dir.divideScalar(len);
    perp.crossVectors(dir, up).normalize();

    const hw = WIDTH / 2;
    const o = slot * 4 * 3;
    positions[o + 0] = p0.x - perp.x * hw;
    positions[o + 1] = p0.y + LIFT;
    positions[o + 2] = p0.z - perp.z * hw;
    positions[o + 3] = p0.x + perp.x * hw;
    positions[o + 4] = p0.y + LIFT;
    positions[o + 5] = p0.z + perp.z * hw;
    positions[o + 6] = p1.x + perp.x * hw;
    positions[o + 7] = p1.y + LIFT;
    positions[o + 8] = p1.z + perp.z * hw;
    positions[o + 9] = p1.x - perp.x * hw;
    positions[o + 10] = p1.y + LIFT;
    positions[o + 11] = p1.z - perp.z * hw;
  }

  function update(state) {
    for (let i = 0; i < WHEEL_COUNT; i++) {
      const p = state.contactPoints[i];
      if (!p) {
        last[i] = null;
        continue;
      }
      if (state.skids[i]) {
        if (last[i] && last[i].distanceTo(p) > 0.04) {
          writeSegment(last[i], p);
        }
        last[i] = p.clone();
      } else {
        last[i] = null;
      }
    }
    geometry.setDrawRange(0, count * 4);
    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundingSphere();
  }

  function clear() {
    cursor = 0;
    count = 0;
    last.fill(null);
    geometry.setDrawRange(0, 0);
  }

  return { update, clear };
}
