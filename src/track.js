import * as THREE from 'three';

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function createDirtTexture() {
  const w = 1024;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;
  for (let i = 0; i < w * h; i++) {
    const r = 92 + Math.floor(Math.random() * 50);
    const g = 72 + Math.floor(Math.random() * 44);
    const b = 48 + Math.floor(Math.random() * 34);
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  for (let i = 0; i < 140; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const rad = 10 + Math.random() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(30, 22, 16, ${0.08 + Math.random() * 0.12})`);
    g.addColorStop(1, 'rgba(30, 22, 16, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const rad = 8 + Math.random() * 24;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(150, 130, 100, ${0.06 + Math.random() * 0.1})`);
    g.addColorStop(1, 'rgba(150, 130, 100, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 0.6 + Math.random() * 1.6;
    const v = Math.random();
    if (v < 0.33) ctx.fillStyle = '#2b2b2e';
    else if (v < 0.66) ctx.fillStyle = '#b0a891';
    else ctx.fillStyle = '#6b6257';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#1c1610';
  ctx.lineWidth = 14;
  for (let x = 180; x < w; x += 260) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.03;
  ctx.strokeStyle = '#d8cbb0';
  ctx.lineWidth = 10;
  for (let x = 280; x < w; x += 320) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeNoise(size) {
  const gs = size + 1;
  const grid = new Float32Array(gs * gs);
  for (let i = 0; i < grid.length; i++) grid[i] = Math.random();
  return (x, y) => {
    x = Math.min(Math.max(x, 0), 1);
    y = Math.min(Math.max(y, 0), 1);
    const gx = x * size;
    const gy = y * size;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = Math.min(x0 + 1, size);
    const y1 = Math.min(y0 + 1, size);
    const tx = gx - x0;
    const ty = gy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const v00 = grid[y0 * gs + x0];
    const v10 = grid[y0 * gs + x1];
    const v01 = grid[y1 * gs + x0];
    const v11 = grid[y1 * gs + x1];
    return (v00 + (v10 - v00) * sx) * (1 - sy) + (v01 + (v11 - v01) * sx) * sy;
  };
}

function smoothstep01(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function grassColor(n, fine) {
  return {
    r: 60 + n * 35 + fine * 12,
    g: 120 + n * 55 + fine * 30,
    b: 50 + n * 35 + fine * 12
  };
}

function dirtColor(n) {
  return { r: 110 + n * 46, g: 84 + n * 40, b: 62 + n * 30 };
}

function gravelColor(n) {
  const v = 118 + n * 55;
  return { r: v, g: v * 0.97, b: v * 0.92 };
}

function rockColor(n) {
  const v = 96 + n * 40;
  return { r: v, g: v, b: v };
}

function buildTerrainMaterial() {
  const size = 1024;
  const nL = makeNoise(12);
  const nM = makeNoise(28);
  const nGrass = makeNoise(90);
  const nGrassFine = makeNoise(360);
  const nDirt = makeNoise(70);
  const nGravel = makeNoise(110);
  const nRock = makeNoise(40);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const nl = nL(u, v);
      const nm = nM(u, v);
      let rock = smoothstep01(0.76, 0.9, nl);
      let gravel = smoothstep01(0.64, 0.76, nm) * 0.75 * (1 - rock);
      let dirt = smoothstep01(0.52, 0.63, nl * 0.5 + nm * 0.5) * 0.75 * (1 - rock);
      let grass = Math.max(0, 1 - rock - gravel - dirt);
      const sum = grass + dirt + gravel + rock;
      grass /= sum; dirt /= sum; gravel /= sum; rock /= sum;
      const cG = grassColor(nGrass(u, v), nGrassFine(u, v));
      const cD = dirtColor(nDirt(u, v));
      const cV = gravelColor(nGravel(u, v));
      const cR = rockColor(nRock(u, v));
      const i = (y * size + x) * 4;
      let r = cG.r * grass + cD.r * dirt + cV.r * gravel + cR.r * rock;
      let g = cG.g * grass + cD.g * dirt + cV.g * gravel + cR.g * rock;
      let b = cG.b * grass + cD.b * dirt + cV.b * gravel + cR.b * rock;
      r = 128 + (r - 128) * 1.2;
      g = 128 + (g - 128) * 1.2;
      b = 128 + (b - 128) * 1.2;
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
}

const CROSS_COUNT = 7;
const DIP_DEPTH = 0.05;

function hash01(a, b, seed) {
  let h = (seed ^ Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function irregularOffset(i, k, seed, samples, crossCount) {
  const t = i / samples;
  const base =
    Math.sin(t * 13.7 + seed * 0.3) * 0.5 +
    Math.sin(t * 29.3 + seed * 1.7) * 0.25 +
    Math.sin(t * 47 + seed * 0.7) * 0.25;
  const lane =
    Math.sin(k * 2.1 + seed * 0.6) * 0.6 +
    Math.sin(k * 4.7 + seed * 1.1) * 0.4;
  const half = (crossCount - 1) / 2;
  const edgeGain = Math.min(1, (Math.abs(k - half) / half) * 1.5);
  return (base * 0.5 + lane * 0.7) * 0.03 * (0.2 + 0.8 * edgeGain);
}

function roadBank(curve, samples, i, tangent) {
  if (i >= samples) return 0;
  const t2 = Math.min(1, (i + 1) / samples);
  const tan2 = curve.getTangentAt(t2).normalize();
  const ang = Math.atan2(
    tangent.x * tan2.z - tangent.z * tan2.x,
    tangent.x * tan2.x + tangent.z * tan2.z
  );
  return Math.max(-0.13, Math.min(0.13, ang * 5));
}

function buildRoadPositions(curve, width, samples, crossCount, seed) {
  const up = new THREE.Vector3(0, 1, 0);
  const positions = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(up, tangent).normalize();
    const bank = roadBank(curve, samples, i, tangent);
    for (let k = 0; k < crossCount; k++) {
      const u = (k / (crossCount - 1)) * 2 - 1;
      const dip = DIP_DEPTH * (1 - u * u);
      const irregular = irregularOffset(i, k, seed, samples, crossCount);
      const p = center.clone().addScaledVector(side, u * (width / 2));
      p.y += dip + irregular + bank * u;
      positions.push(p.x, p.y, p.z);
    }
  }
  return new Float32Array(positions);
}

function buildRoadGeometry(curve, width, samples, crossCount, seed) {
  const positions = buildRoadPositions(curve, width, samples, crossCount, seed);
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= samples; i++) {
    for (let k = 0; k < crossCount; k++) {
      uvs.push(k / (crossCount - 1), i / 10);
    }
  }
  for (let i = 0; i < samples; i++) {
    for (let k = 0; k < crossCount - 1; k++) {
      const a = i * crossCount + k;
      const b = a + 1;
      const c = a + crossCount;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildRoadColliderGeometry(curve, width, samples, crossCount, thickness, seed) {
  const top = buildRoadPositions(curve, width, samples, crossCount, seed);
  const ringCount = samples + 1;
  const total = ringCount * crossCount;
  const allPositions = new Float32Array(total * 2 * 3);
  allPositions.set(top, 0);
  for (let i = 0; i < total; i++) {
    allPositions[(total + i) * 3] = top[i * 3];
    allPositions[(total + i) * 3 + 1] = top[i * 3 + 1] - thickness;
    allPositions[(total + i) * 3 + 2] = top[i * 3 + 2];
  }

  const indices = [];
  for (let i = 0; i < samples; i++) {
    for (let k = 0; k < crossCount - 1; k++) {
      const a = i * crossCount + k;
      const b = a + 1;
      const c = a + crossCount;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
      const ab = total + a;
      const bb = ab + 1;
      const cb = total + c;
      const db = cb + 1;
      indices.push(ab, bb, cb, bb, db, cb);
    }
  }
  for (const k of [0, crossCount - 1]) {
    for (let i = 0; i < samples; i++) {
      const a = i * crossCount + k;
      const b = a + crossCount;
      const ab = total + a;
      const bb = total + b;
      indices.push(a, ab, b);
      indices.push(b, ab, bb);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(allPositions, 3));
  geometry.setIndex(indices);
  return geometry;
}

const ROAD_HALF = 6;

function terrainHeightAt(curve, x, z, baseY, samples = 520) {
  let bestD = Infinity;
  let bestY = 0;
  for (let i = 0; i < samples; i++) {
    const p = curve.getPointAt(i / samples);
    const dx = p.x - x;
    const dz = p.z - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestD) { bestD = d; bestY = p.y; }
  }
  if (bestD < ROAD_HALF) return bestY - 0.25;
  return bestY;
}

function buildTerrain(curve, baseY) {
  const size = 260;
  const segs = 80;
  const positions = [];
  const uvs = [];
  const indices = [];
  const rows = segs + 1;
  for (let iz = 0; iz <= segs; iz++) {
    const z = -size / 2 + (iz / segs) * size;
    for (let ix = 0; ix <= segs; ix++) {
      const x = -size / 2 + (ix / segs) * size;
      const y = terrainHeightAt(curve, x, z, baseY);
      positions.push(x, y, z);
      uvs.push(ix / segs, iz / segs);
    }
  }
  for (let iz = 0; iz < segs; iz++) {
    for (let ix = 0; ix < segs; ix++) {
      const a = iz * rows + ix;
      const b = a + 1;
      const c = a + rows;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createLeafTexture() {
  const w = 128;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;
  for (let i = 0; i < w * h; i++) {
    const v = Math.random();
    const r = 70 + Math.floor(v * 45);
    const g = 105 + Math.floor(v * 65);
    const b = 50 + Math.floor(v * 40);
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  for (let i = 0; i < 110; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const rad = 6 + Math.random() * 20;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, Math.random() < 0.5
      ? `rgba(28, 66, 24, ${0.16 + Math.random() * 0.22})`
      : `rgba(190, 224, 150, ${0.12 + Math.random() * 0.2})`);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBarkTexture() {
  const w = 128;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6b4a2f';
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * w;
    const len = 40 + Math.random() * 90;
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(30, 18, 8, 0.35)' : 'rgba(150, 112, 70, 0.3)';
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 10, h * 0.5, x + (Math.random() - 0.5) * 12, h);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const leafTex = createLeafTexture();
const barkTex = createBarkTexture();
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6540, roughness: 1, map: barkTex });
const pineMats = [0x2c5e2c, 0x3a6b3a, 0x245024].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, map: leafTex }));
const leafMats = [0x3f7a2f, 0x4c8a3a, 0x356b28].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, map: leafTex }));
const bushMats = [0x3d7330, 0x4f8a3e, 0x2f6326].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, map: leafTex }));

function createPine(random) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6), trunkMat);
  trunk.position.y = 1.1;
  trunk.castShadow = true;
  g.add(trunk);
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const r = 1.5 - i * 0.4;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 1.9, 7), pineMats[i % pineMats.length]);
    cone.position.y = 1.8 + i * 1.25;
    cone.castShadow = true;
    g.add(cone);
  }
  return g;
}

function createRoundTree(random) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6), trunkMat);
  trunk.position.y = 1.2;
  trunk.castShadow = true;
  g.add(trunk);
  const foliage = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.5, 1),
    leafMats[Math.floor(random() * leafMats.length)]
  );
  foliage.position.y = 3.1;
  foliage.castShadow = true;
  g.add(foliage);
  const blob = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9, 1),
    foliage.material
  );
  blob.position.set(1.1, 2.6, 0.3);
  blob.castShadow = true;
  g.add(blob);
  return g;
}

function createBush(random) {
  const g = new THREE.Group();
  const mat = bushMats[Math.floor(random() * bushMats.length)];
  const n = 2 + Math.floor(random() * 2);
  for (let i = 0; i < n; i++) {
    const s = 0.6 + random() * 0.6;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), mat);
    b.position.set((random() - 0.5) * 1.4, s * 0.6, (random() - 0.5) * 1.4);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

export function createTrack(scene, physics, materials, seed = 1337) {
  const trackGroup = new THREE.Group();
  const random = mulberry32(seed);
  const points = [];
  const total = 28;
  for (let i = 0; i < total; i++) {
    const a = (i / total) * Math.PI * 2;
    const radius = 86 + Math.sin(a * 3) * 18 + (random() - 0.5) * 14;
    const y = Math.sin(a * 2.2) * 1.5 + Math.cos(a * 5) * 0.5;
    points.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius));
  }
  const crestIndexes = [5, 14, 22];
  crestIndexes.forEach((idx) => {
    points[idx].y += 1.5;
    points[(idx + 1) % total].y += 2.2;
    points[(idx + 2) % total].y += 1.2;
  });

  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.35);
  const roadWidth = 12;
  const samples = 520;
  const roadGeometry = buildRoadGeometry(curve, roadWidth, samples, CROSS_COUNT, seed);

  const road = new THREE.Mesh(roadGeometry, new THREE.MeshStandardMaterial({
    map: createDirtTexture(),
    roughness: 0.95,
    metalness: 0
  }));
  road.receiveShadow = true;
  road.castShadow = true;
  trackGroup.add(road);

  const underside = new THREE.Mesh(
    roadGeometry,
    new THREE.MeshStandardMaterial({ color: 0x4a4034, roughness: 1, side: THREE.BackSide })
  );
  underside.position.y = -0.05;
  trackGroup.add(underside);

  const roadBox = new THREE.Box3().setFromBufferAttribute(roadGeometry.attributes.position);
  const baseY = roadBox.min.y - 2;

  const terrainMat = buildTerrainMaterial();
  const terrainGeometry = buildTerrain(curve, baseY);
  const terrain = new THREE.Mesh(terrainGeometry, terrainMat);
  terrain.receiveShadow = true;
  trackGroup.add(terrain);

  const terrainBody = physics.world.createRigidBody(physics.RAPIER.RigidBodyDesc.fixed());
  physics.world.createCollider(
    physics.RAPIER.ColliderDesc.trimesh(
      new Float32Array(terrainGeometry.attributes.position.array),
      new Uint32Array(terrainGeometry.index.array)
    ),
    terrainBody
  );
  terrainBody.userData = { surface: 'grass' };

  const plantBuilders = [createPine, createRoundTree, createBush];
  const plantCount = 320;
  for (let i = 0; i < plantCount; i++) {
    const t = random();
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), tan).normalize();
    const dist = 14 + random() * 35;
    const sign = random() < 0.5 ? -1 : 1;
    const x = p.x + side.x * dist * sign;
    const z = p.z + side.z * dist * sign;
    const y = terrainHeightAt(curve, x, z, baseY);
    const plant = plantBuilders[Math.floor(random() * plantBuilders.length)](random);
    plant.position.set(x, y, z);
    plant.rotation.y = random() * Math.PI * 2;
    const sc = 0.8 + random() * 0.9;
    plant.scale.setScalar(sc);
    trackGroup.add(plant);
  }

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8a85, roughness: 0.95, flatShading: true });
  const rockCount = 26;
  for (let i = 0; i < rockCount; i++) {
    const t = random();
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), tan).normalize();
    const dist = 10 + random() * 16;
    const sign = random() < 0.5 ? -1 : 1;
    const x = p.x + side.x * dist * sign;
    const z = p.z + side.z * dist * sign;
    const y = terrainHeightAt(curve, x, z, baseY);
    const s = 0.5 + random() * 0.9;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), rockMat);
    rock.position.set(x, y + s * 0.25, z);
    rock.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    rock.castShadow = true;
    rock.receiveShadow = true;
    trackGroup.add(rock);

    const rockBody = physics.world.createRigidBody(physics.RAPIER.RigidBodyDesc.fixed());
    physics.world.createCollider(
      physics.RAPIER.ColliderDesc.ball(s * 0.7).setTranslation(x, y + s * 0.25, z),
      rockBody
    );
    rockBody.userData = { surface: 'rock' };
  }

  scene.add(trackGroup);

  const colliderGeometry = buildRoadColliderGeometry(curve, roadWidth, samples, CROSS_COUNT, 0.15, seed);
  const vertices = new Float32Array(colliderGeometry.attributes.position.array);
  const indices = new Uint32Array(colliderGeometry.index.array);
  const body = physics.world.createRigidBody(physics.RAPIER.RigidBodyDesc.fixed());
  physics.world.createCollider(physics.RAPIER.ColliderDesc.trimesh(vertices, indices), body);
  body.userData = { surface: 'dirt' };

  const groundBody = physics.world.createRigidBody(physics.RAPIER.RigidBodyDesc.fixed());
  physics.world.createCollider(
    physics.RAPIER.ColliderDesc.cuboid(160, 1, 160).setTranslation(0, roadBox.min.y - 3, 0),
    groundBody
  );
  groundBody.userData = { surface: 'grass' };

  return {
    group: trackGroup,
    road,
    ground: terrain,
    curve,
    start: curve.getPointAt(0),
    tangent: curve.getTangentAt(0),
    body
  };
}
