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

function createAsphaltTexture() {
  const w = 1024;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;
  for (let i = 0; i < w * h; i++) {
    const base = 55 + Math.floor(Math.random() * 20);
    data[i * 4] = base;
    data[i * 4 + 1] = base;
    data[i * 4 + 2] = base;
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(50, 0);
  ctx.lineTo(50, h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w - 50, 0);
  ctx.lineTo(w - 50, h);
  ctx.stroke();

  ctx.lineWidth = 10.4;
  ctx.strokeStyle = '#ffffff';
  ctx.setLineDash([40, 36]);
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildRoadGeometry(curve, width, samples) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(up, tangent).normalize();
    const crown = Math.sin(t * Math.PI * 2) * 0.04;
    const left = center.clone().addScaledVector(side, -width / 2); left.y += crown;
    const right = center.clone().addScaledVector(side, width / 2); right.y += crown;
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(0, i / 8, 1, i / 8);
    if (i < samples) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildRoadColliderGeometry(curve, width, samples, thickness) {
  const positions = [];
  const indices = [];
  const up = new THREE.Vector3(0, 1, 0);

  const top = [];
  const bottom = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(up, tangent).normalize();
    const crown = Math.sin(t * Math.PI * 2) * 0.04;
    const left = center.clone().addScaledVector(side, -width / 2); left.y += crown;
    const right = center.clone().addScaledVector(side, width / 2); right.y += crown;
    top.push(left, right);
    bottom.push(
      left.clone().add(new THREE.Vector3(0, -thickness, 0)),
      right.clone().add(new THREE.Vector3(0, -thickness, 0))
    );
  }

  const n = samples;
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    const b = (samples + 1) * 2 + a;
    indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    indices.push(a, b, a + 2);
    indices.push(a + 2, b, b + 2);
    indices.push(a + 1, b + 1, a + 3);
    indices.push(a + 3, b + 1, b + 3);
  }

  const allPositions = new Float32Array((top.length + bottom.length) * 3);
  top.forEach((v, idx) => {
    allPositions[idx * 3] = v.x;
    allPositions[idx * 3 + 1] = v.y;
    allPositions[idx * 3 + 2] = v.z;
  });
  bottom.forEach((v, idx) => {
    const off = top.length * 3 + idx * 3;
    allPositions[off] = v.x;
    allPositions[off + 1] = v.y;
    allPositions[off + 2] = v.z;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(allPositions, 3));
  geometry.setIndex(indices);
  return geometry;
}

export function createTrack(scene, physics, materials, seed = 1337) {
  const random = mulberry32(seed);
  const points = [];
  const total = 28;
  for (let i = 0; i < total; i++) {
    const a = (i / total) * Math.PI * 2;
    const radius = 86 + Math.sin(a * 3) * 18 + (random() - 0.5) * 14;
    const y = Math.sin(a * 2.2) * 5 + Math.cos(a * 5) * 1.8;
    points.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius));
  }
  const jumpIndexes = [5, 14, 22];
  jumpIndexes.forEach((idx) => {
    points[idx].y += 8;
    points[(idx + 1) % total].y += 13;
    points[(idx + 2) % total].y += 7;
  });

  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.35);
  const roadWidth = 12;
  const roadGeometry = buildRoadGeometry(curve, roadWidth, 520);

  const asphaltTex = createAsphaltTexture();
  const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.85, metalness: 0.05 });
  const road = new THREE.Mesh(roadGeometry, roadMat);
  road.receiveShadow = true;
  road.castShadow = true;
  scene.add(road);

  const underMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 1, side: THREE.BackSide });
  const underside = new THREE.Mesh(roadGeometry, underMat);
  underside.position.y = -0.05;
  scene.add(underside);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260, 36, 36), materials.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3.5;
  const pos = ground.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, (random() - 0.5) * 3);
  ground.geometry.computeVertexNormals();
  ground.receiveShadow = true;
  scene.add(ground);

  for (let i = 0; i < 36; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.2 + random(), 5 + random() * 4, 5), materials.shoulder);
    const a = random() * Math.PI * 2;
    const r = 105 + random() * 35;
    cone.position.set(Math.cos(a) * r, -1, Math.sin(a) * r);
    cone.castShadow = true;
    scene.add(cone);
  }

  const colliderGeometry = buildRoadColliderGeometry(curve, roadWidth, 520, 0.6);
  const vertices = new Float32Array(colliderGeometry.attributes.position.array);
  const indices = new Uint32Array(colliderGeometry.index.array);
  const body = physics.world.createRigidBody(physics.RAPIER.RigidBodyDesc.fixed());
  physics.world.createCollider(physics.RAPIER.ColliderDesc.trimesh(vertices, indices), body);

  const groundBody = physics.world.createRigidBody(physics.RAPIER.RigidBodyDesc.fixed());
  physics.world.createCollider(
    physics.RAPIER.ColliderDesc.cuboid(160, 1, 160).setTranslation(0, -4.2, 0),
    groundBody
  );

  return { road, ground, curve, start: curve.getPointAt(0), tangent: curve.getTangentAt(0), body };
}
