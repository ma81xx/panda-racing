import * as THREE from 'three';

const MAX_SEGMENTS = 700;
const WHEEL_COUNT = 4;
const WIDTH = 0.12;
const LIFT = 0.02;

function createSkidTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = Math.min(x, size - 1 - x) / (size - 1);
      const alpha = Math.min(1, edge / 0.32);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha * 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  return texture;
}

export function createSkidMarks(scene) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_SEGMENTS * 4 * 3);
  const uvs = new Float32Array(MAX_SEGMENTS * 4 * 2);
  const positionAttr = new THREE.BufferAttribute(positions, 3);
  geometry.setAttribute('position', positionAttr);
  for (let i = 0; i < MAX_SEGMENTS; i++) {
    const offset = i * 8;
    uvs[offset] = 0;
    uvs[offset + 1] = 0;
    uvs[offset + 2] = 1;
    uvs[offset + 3] = 0;
    uvs[offset + 4] = 1;
    uvs[offset + 5] = 1;
    uvs[offset + 6] = 0;
    uvs[offset + 7] = 1;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
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
    color: 0x1b1611,
    map: createSkidTexture(),
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
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
    dir.subVectors(p1, p0);
    const len = dir.length();
    if (len < 1e-4) return false;
    dir.divideScalar(len);
    perp.crossVectors(dir, up).normalize();

    if (count < MAX_SEGMENTS) count++;
    const slot = cursor % MAX_SEGMENTS;
    cursor++;

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
    positionAttr.addUpdateRange(o, 12);
    return true;
  }

  function update(state) {
    let wrote = false;
    for (let i = 0; i < WHEEL_COUNT; i++) {
      const p = state.contactPoints[i];
      if (!p) {
        last[i] = null;
        continue;
      }
      if (state.skids[i]) {
        if (last[i] && last[i].distanceTo(p) > 0.04) {
          wrote = writeSegment(last[i], p) || wrote;
        }
        last[i] = p.clone();
      } else {
        last[i] = null;
      }
    }
    geometry.setDrawRange(0, count * 4);
    if (wrote) positionAttr.needsUpdate = true;
  }

  function clear() {
    cursor = 0;
    count = 0;
    last.fill(null);
    positionAttr.clearUpdateRanges();
    geometry.setDrawRange(0, 0);
  }

  return { update, clear };
}
