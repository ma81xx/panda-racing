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

const CROSS_COUNT = 7;
const DIP_DEPTH = 0.12;

function irregularOffset(t, k) {
  const a = t * Math.PI * 2 * 31 + k * 1.13;
  const b = t * Math.PI * 2 * 71 + k * 2.6 + 1.7;
  return Math.sin(a) * 0.045 + Math.sin(b) * 0.02;
}

function buildRoadPositions(curve, width, samples, crossCount) {
  const up = new THREE.Vector3(0, 1, 0);
  const positions = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i % samples) / samples;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(up, tangent).normalize();
    for (let k = 0; k < crossCount; k++) {
      const u = (k / (crossCount - 1)) * 2 - 1;
      const dip = DIP_DEPTH * (1 - u * u);
      const p = center.clone().addScaledVector(side, u * (width / 2));
      p.y += dip + irregularOffset(t, k);
      positions.push(p.x, p.y, p.z);
    }
  }
  return new Float32Array(positions);
}

function buildRoadGeometry(curve, width, samples, crossCount) {
  const positions = buildRoadPositions(curve, width, samples, crossCount);
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

function buildRoadColliderGeometry(curve, width, samples, crossCount, thickness, terrainFn) {
  const up = new THREE.Vector3(0, 1, 0);
  const cross = crossCount + 2;
  const ringCount = samples + 1;
  const total = ringCount * cross;
  const wingOffset = width / 2 + 3.5;
  const allPositions = new Float32Array(total * 2 * 3);

  for (let i = 0; i <= samples; i++) {
    const t = (i % samples) / samples;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(up, tangent).normalize();

    for (const [wingK, sign] of [[0, -1], [cross - 1, 1]]) {
      const p = center.clone().addScaledVector(side, sign * wingOffset);
      p.y = terrainFn(p.x, p.z) - 0.15;
      const idx = (i * cross + wingK) * 3;
      allPositions[idx] = p.x;
      allPositions[idx + 1] = p.y;
      allPositions[idx + 2] = p.z;
    }
    for (let k = 0; k < crossCount; k++) {
      const u = (k / (crossCount - 1)) * 2 - 1;
      const dip = DIP_DEPTH * (1 - u * u);
      const p = center.clone().addScaledVector(side, u * (width / 2));
      p.y += dip + irregularOffset(t, k);
      const idx = (i * cross + k + 1) * 3;
      allPositions[idx] = p.x;
      allPositions[idx + 1] = p.y;
      allPositions[idx + 2] = p.z;
    }
  }

  for (let i = 0; i < total; i++) {
    allPositions[(total + i) * 3] = allPositions[i * 3];
    allPositions[(total + i) * 3 + 1] = allPositions[i * 3 + 1] - thickness;
    allPositions[(total + i) * 3 + 2] = allPositions[i * 3 + 2];
  }

  const indices = [];
  for (let i = 0; i < samples; i++) {
    for (let k = 0; k < cross - 1; k++) {
      const a = i * cross + k;
      const b = a + 1;
      const c = a + cross;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
      const ab = total + a;
      const bb = ab + 1;
      const cb = total + c;
      const db = cb + 1;
      indices.push(ab, bb, cb, bb, db, cb);
    }
  }
  for (const k of [0, cross - 1]) {
    for (let i = 0; i < samples; i++) {
      const a = i * cross + k;
      const b = a + cross;
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
const SHOULDER = 16;
const TRACK_SAMPLES = 520;

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function backgroundHills(x, z) {
  const r = Math.sqrt(x * x + z * z);
  const rim = smoothstep(170, 310, r);
  if (rim <= 0) return 0;
  const h = 18
    + Math.sin(x * 0.016 + 1.7) * 10
    + Math.cos(z * 0.019 - 0.6) * 8
    + Math.sin((x + z) * 0.011) * 5;
  return rim * h;
}

function buildRoadSamples(curve, count) {
  const samples = new Array(count);
  for (let i = 0; i < count; i++) samples[i] = curve.getPointAt(i / count);
  return samples;
}

function terrainSample(roadSamples, x, z, baseY) {
  let bestD = Infinity;
  let bestY = 0;
  for (let i = 0; i < roadSamples.length; i++) {
    const p = roadSamples[i];
    const dx = p.x - x;
    const dz = p.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; bestY = p.y; }
  }
  bestD = Math.sqrt(bestD);
  const edgeY = bestY - 0.5;
  let y;
  if (bestD < ROAD_HALF) {
    y = edgeY;
  } else {
    y = edgeY + (baseY - edgeY) * smoothstep(ROAD_HALF, ROAD_HALF + SHOULDER, bestD);
    if (bestD >= ROAD_HALF + SHOULDER) y += backgroundHills(x, z);
  }
  return { y, d: bestD };
}

function terrainHeightAt(roadSamples, x, z, baseY) {
  return terrainSample(roadSamples, x, z, baseY).y;
}

function buildTerrain(roadSamples, baseY) {
  const size = 800;
  const segs = 120;
  const rows = segs + 1;
  const positions = [];
  const uvs = [];
  const indices = [];
  const heights = new Float32Array(rows * rows);
  const dists = new Float32Array(rows * rows);
  for (let iz = 0; iz <= segs; iz++) {
    const z = -size / 2 + (iz / segs) * size;
    for (let ix = 0; ix <= segs; ix++) {
      const x = -size / 2 + (ix / segs) * size;
      const sample = terrainSample(roadSamples, x, z, baseY);
      const idx = iz * rows + ix;
      heights[idx] = sample.y;
      dists[idx] = sample.d;
      positions.push(x, sample.y, z);
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

  const colors = new Float32Array(rows * rows * 3);
  const grassLow = new THREE.Color(0x467f31);
  const grassHigh = new THREE.Color(0x6f9c44);
  const dirt = new THREE.Color(0x6f5b40);
  const rock = new THREE.Color(0x6d6b59);
  const color = new THREE.Color();
  const cell = size / segs;
  for (let iz = 0; iz <= segs; iz++) {
    const rowNext = Math.min(iz + 1, segs) * rows;
    const rowPrev = Math.max(iz - 1, 0) * rows;
    for (let ix = 0; ix <= segs; ix++) {
      const idx = iz * rows + ix;
      const y = heights[idx];
      const left = iz * rows + Math.max(ix - 1, 0);
      const right = iz * rows + Math.min(ix + 1, segs);
      const slopeX = (heights[right] - heights[left]) / (2 * cell);
      const slopeZ = (heights[rowNext + ix] - heights[rowPrev + ix]) / (2 * cell);
      const slope = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);
      const heightT = smoothstep(baseY, baseY + 9, y);
      const patch = hash2(ix * 3 + 1, iz * 7 + 5);
      color.copy(grassLow).lerp(grassHigh, heightT * 0.65 + patch * 0.25);
      const shoulder = 1 - smoothstep(ROAD_HALF + 2, ROAD_HALF + 8, dists[idx]);
      color.lerp(dirt, shoulder * 0.85);
      const rocky = smoothstep(0.55, 1.1, slope);
      color.lerp(rock, rocky * 0.55);
      const shade = 0.88 + hash2(ix + 11, iz + 3) * 0.12;
      color.multiplyScalar(shade);
      colors[idx * 3] = color.r;
      colors[idx * 3 + 1] = color.g;
      colors[idx * 3 + 2] = color.b;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildRoadSkirt(curve, width, samples, crossCount, terrainFn) {
  const up = new THREE.Vector3(0, 1, 0);
  const positions = [];
  const indices = [];
  const half = width / 2;
  const skirtWidth = 0.9;
  for (let i = 0; i <= samples; i++) {
    const t = (i % samples) / samples;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(up, tangent).normalize();
    for (const sign of [-1, 1]) {
      const edge = center.clone().addScaledVector(side, sign * half);
      edge.y += irregularOffset(t, sign < 0 ? 0 : crossCount - 1);
      const outer = center.clone().addScaledVector(side, sign * (half + skirtWidth));
      outer.y = terrainFn(outer.x, outer.z) - 0.25;
      positions.push(edge.x, edge.y, edge.z, outer.x, outer.y, outer.z);
    }
    if (i > 0) {
      const prev = (i - 1) * 4;
      const curr = i * 4;
      for (let s = 0; s < 2; s++) {
        const a = prev + s * 2;
        const b = curr + s * 2;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
const foliageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });

const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6);
const coneGeos = [1.5, 1.1, 0.7].map((r) => new THREE.ConeGeometry(r, 1.9, 7));
const leafGeo = new THREE.IcosahedronGeometry(1.5, 1);
const blobGeo = new THREE.IcosahedronGeometry(0.9, 1);
const bushGeo = new THREE.IcosahedronGeometry(1, 1);

const PINE_COLORS = [0x2c5e2c, 0x3a6b3a, 0x245024];
const LEAF_COLORS = [0x3f7a2f, 0x4c8a3a, 0x356b28];
const BUSH_COLORS = [0x3d7330, 0x4f8a3e, 0x2f6326];

function pick(random, colors) {
  return colors[Math.floor(random() * colors.length)];
}

function pineParts(random) {
  return [
    { key: 'trunk', px: 0, py: 1.1, pz: 0, ps: 1, color: null },
    { key: 'pine_0', px: 0, py: 1.8, pz: 0, ps: 1, color: pick(random, PINE_COLORS) },
    { key: 'pine_1', px: 0, py: 3.05, pz: 0, ps: 1, color: pick(random, PINE_COLORS) },
    { key: 'pine_2', px: 0, py: 4.3, pz: 0, ps: 1, color: pick(random, PINE_COLORS) }
  ];
}

function roundTreeParts(random) {
  const c = pick(random, LEAF_COLORS);
  return [
    { key: 'trunk', px: 0, py: 1.2, pz: 0, ps: 1, color: null },
    { key: 'leaf', px: 0, py: 3.1, pz: 0, ps: 1, color: c },
    { key: 'blob', px: 1.1, py: 2.6, pz: 0.3, ps: 1, color: c }
  ];
}

function bushParts(random) {
  const c = pick(random, BUSH_COLORS);
  const n = 2 + Math.floor(random() * 2);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const s = 0.6 + random() * 0.6;
    parts.push({ key: 'bush', px: (random() - 0.5) * 1.4, py: s * 0.6, pz: (random() - 0.5) * 1.4, ps: s, color: c });
  }
  return parts;
}

function buildPlants(trackGroup, curve, roadSamples, baseY, random, plantCount) {
  const instances = { trunk: [], pine_0: [], pine_1: [], pine_2: [], leaf: [], blob: [], bush: [] };
  const hazardSpots = [];
  const builders = [pineParts, roundTreeParts, bushParts];

  const m4 = new THREE.Matrix4();
  const rot = new THREE.Matrix4();
  const scl = new THREE.Matrix4();
  const trs = new THREE.Matrix4();
  const spl = new THREE.Matrix4();
  const side = new THREE.Vector3();

  function pushPart(key, x, y, z, yaw, sc, px, py, pz, ps, color) {
    m4.makeTranslation(x, y, z);
    rot.makeRotationY(yaw);
    scl.makeScale(sc, sc, sc);
    m4.multiply(rot).multiply(scl);
    trs.makeTranslation(px, py, pz);
    m4.multiply(trs);
    spl.makeScale(ps, ps, ps);
    m4.multiply(spl);
    instances[key].push({ m: m4.clone(), color });
  }

  for (let i = 0; i < plantCount; i++) {
    const t = random();
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    side.crossVectors(new THREE.Vector3(0, 1, 0), tan).normalize();
    const dist = 14 + random() * 35;
    const sign = random() < 0.5 ? -1 : 1;
    const x = p.x + side.x * dist * sign;
    const z = p.z + side.z * dist * sign;
    const y = terrainHeightAt(roadSamples, x, z, baseY);
    const yaw = random() * Math.PI * 2;
    const sc = 0.8 + random() * 0.9;
    const parts = builders[Math.floor(random() * builders.length)](random);
    for (const part of parts) {
      pushPart(part.key, x, y, z, yaw, sc, part.px, part.py, part.pz, part.ps, part.color);
    }
    if (parts[0].key === 'trunk' && dist < 24) {
      hazardSpots.push([x, y, z]);
    }
  }

  const meshDefs = [
    { key: 'trunk', geo: trunkGeo, mat: trunkMat, colored: false },
    { key: 'pine_0', geo: coneGeos[0], mat: foliageMat, colored: true },
    { key: 'pine_1', geo: coneGeos[1], mat: foliageMat, colored: true },
    { key: 'pine_2', geo: coneGeos[2], mat: foliageMat, colored: true },
    { key: 'leaf', geo: leafGeo, mat: foliageMat, colored: true },
    { key: 'blob', geo: blobGeo, mat: foliageMat, colored: true },
    { key: 'bush', geo: bushGeo, mat: foliageMat, colored: true }
  ];
  const color = new THREE.Color();
  for (const def of meshDefs) {
    const list = instances[def.key];
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(def.geo, def.mat, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    for (let i = 0; i < list.length; i++) {
      mesh.setMatrixAt(i, list[i].m);
      if (def.colored && list[i].color) {
        color.setHex(list[i].color).multiplyScalar(0.78 + random() * 0.22);
        mesh.setColorAt(i, color);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (def.colored) mesh.instanceColor.needsUpdate = true;
    trackGroup.add(mesh);
  }

  return hazardSpots;
}

function buildGrass(trackGroup, curve, roadSamples, baseY, random, count) {
  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.05, 0, 0,
    0.05, 0, 0,
    0, 0.55, 0,
    -0.05, 0, 0,
    0, 0.55, 0,
    0.05, 0, 0
  ]), 3));
  bladeGeo.computeVertexNormals();

  const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 1 });
  const mesh = new THREE.InstancedMesh(bladeGeo, grassMat, count);
  mesh.frustumCulled = false;

  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const sideV = new THREE.Vector3();
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const t = random();
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    sideV.crossVectors(new THREE.Vector3(0, 1, 0), tan).normalize();
    const dist = ROAD_HALF + 1.5 + random() * 8;
    const sign = random() < 0.5 ? -1 : 1;
    const x = p.x + sideV.x * dist * sign;
    const z = p.z + sideV.z * dist * sign;
    const y = terrainHeightAt(roadSamples, x, z, baseY);
    const sc = 0.7 + random() * 0.9;
    euler.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.3);
    quat.setFromEuler(euler);
    m4.compose(pos.set(x, y, z), quat, scl.set(sc, sc, sc));
    mesh.setMatrixAt(i, m4);
    color.setHex(random() < 0.5 ? 0x4d9e33 : 0x6cbd45).multiplyScalar(0.78 + random() * 0.22);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  trackGroup.add(mesh);
}

export function createTrack(scene, physics, materials, seed = 1337) {
  const trackGroup = new THREE.Group();
  const random = mulberry32(seed);
  const points = [];
  const total = 28;
  for (let i = 0; i < total; i++) {
    const a = (i / total) * Math.PI * 2;
    const radius = 86 + Math.sin(a * 3) * 18 + (random() - 0.5) * 14;
    const y = Math.sin(a * 2.2) * 3.0 + Math.cos(a * 5) * 1.0;
    points.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius));
  }
  const crestIndexes = [5, 14, 22];
  crestIndexes.forEach((idx) => {
    points[idx].y += 3.0;
    points[(idx + 1) % total].y += 4.5;
    points[(idx + 2) % total].y += 2.5;
  });

  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.35);

  function roadSurfaceHeightAt(t) {
    const p = curve.getPointAt(t);
    return p.y + DIP_DEPTH + irregularOffset(t, (CROSS_COUNT - 1) / 2);
  }

  const roadWidth = 12;
  const samples = TRACK_SAMPLES;
  const roadSamples = buildRoadSamples(curve, samples);
  const roadGeometry = buildRoadGeometry(curve, roadWidth, samples, CROSS_COUNT);

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

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0
  });
  const terrainGeometry = buildTerrain(roadSamples, baseY);
  const terrain = new THREE.Mesh(terrainGeometry, terrainMat);
  terrain.receiveShadow = true;
  trackGroup.add(terrain);

  const terrainFn = (x, z) => terrainHeightAt(roadSamples, x, z, baseY);
  const skirt = new THREE.Mesh(
    buildRoadSkirt(curve, roadWidth, samples, CROSS_COUNT, terrainFn),
    new THREE.MeshStandardMaterial({
      color: 0x6f5b40,
      roughness: 1,
      side: THREE.DoubleSide
    })
  );
  skirt.receiveShadow = true;
  trackGroup.add(skirt);

  const terrainBody = physics.world.createRigidBody(physics.RAPIER.RigidBodyDesc.fixed());
  const terrainCollider = physics.world.createCollider(
    physics.RAPIER.ColliderDesc.trimesh(
      new Float32Array(terrainGeometry.attributes.position.array),
      new Uint32Array(terrainGeometry.index.array)
    ),
    terrainBody
  );
  terrainCollider.setFriction(0.35);

  const plantCount = 600;
  const hazardSpots = buildPlants(trackGroup, curve, roadSamples, baseY, random, plantCount);
  buildGrass(trackGroup, curve, roadSamples, baseY, random, 1800);

  const hazardColliders = [];
  for (const [x, y, z] of hazardSpots) {
    const hazardBody = physics.world.createRigidBody(physics.RAPIER.RigidBodyDesc.fixed());
    const hazardCollider = physics.world.createCollider(
      physics.RAPIER.ColliderDesc.ball(0.5).setTranslation(x, y + 0.7, z),
      hazardBody
    );
    hazardColliders.push(hazardCollider);
  }

  scene.add(trackGroup);

  const colliderGeometry = buildRoadColliderGeometry(
    curve, roadWidth, samples, CROSS_COUNT, 0.8,
    terrainFn
  );
  const vertices = new Float32Array(colliderGeometry.attributes.position.array);
  const indices = new Uint32Array(colliderGeometry.index.array);
  const body = physics.world.createRigidBody(physics.RAPIER.RigidBodyDesc.fixed());
  const roadCollider = physics.world.createCollider(physics.RAPIER.ColliderDesc.trimesh(vertices, indices), body);

  const groundBody = physics.world.createRigidBody(physics.RAPIER.RigidBodyDesc.fixed());
  physics.world.createCollider(
    physics.RAPIER.ColliderDesc.cuboid(160, 1, 160).setTranslation(0, roadBox.min.y - 5, 0),
    groundBody
  );

  return {
    group: trackGroup,
    road,
    ground: terrain,
    curve,
    start: curve.getPointAt(0),
    tangent: curve.getTangentAt(0),
    roadSurfaceHeightAt,
    body,
    colliders: { road: roadCollider, terrain: terrainCollider },
    hazards: { colliders: hazardColliders, positions: hazardSpots }
  };
}
