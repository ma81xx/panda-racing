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

function createTrees(scene, materials, random) {
  const group = new THREE.Group();
  for (let i = 0; i < 50; i++) {
    const a = random() * Math.PI * 2;
    const r = 60 + random() * 120;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const tree = new THREE.Group();
    const h = 3 + random() * 3;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.35, h, 6),
      materials.wood
    );
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    tree.add(trunk);

    const foliageLayers = 2 + Math.floor(random() * 2);
    for (let j = 0; j < foliageLayers; j++) {
      const radius = 1.2 + random() * 0.8 - j * 0.3;
      const fy = h * 0.6 + j * 0.9;
      const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(radius, 2 + random(), 8),
        materials.foliage
      );
      foliage.position.y = fy;
      foliage.castShadow = true;
      tree.add(foliage);
    }
    tree.position.set(x, 0, z);
    group.add(tree);
  }
  scene.add(group);
  return group;
}

function buildGuardrails(scene, materials, curve, roadWidth, samples) {
  const guardrailData = [];
  const group = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.15, 0.8, 0.15);
  const railGeo = new THREE.BoxGeometry(0.1, 0.15, 2.2);
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < samples; i++) {
    const t = i / samples;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(up, tangent).normalize();

    for (const dir of [-1, 1]) {
      const edge = center.clone().addScaledVector(side, dir * roadWidth / 2);
      const postY = edge.y + 0.4;

      const post = new THREE.Mesh(postGeo, materials.guardrail);
      post.position.copy(edge);
      post.position.y = postY;
      post.castShadow = true;
      group.add(post);

      const rail = new THREE.Mesh(railGeo, materials.guardrail);
      rail.position.copy(edge);
      rail.position.y = postY + 0.35;
      rail.lookAt(edge.clone().add(tangent));
      rail.castShadow = true;
      group.add(rail);

      guardrailData.push({ x: edge.x, y: rail.position.y, z: edge.z, nx: side.x * dir, nz: side.z * dir });
    }
  }
  scene.add(group);
  return { data: guardrailData, group };
}

export function createTrack(scene, materials, seed = 1337) {
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
  const roadGeometry = buildRoadGeometry(curve, 13, 520);
  const road = new THREE.Mesh(roadGeometry, materials.road);
  road.receiveShadow = true;
  road.castShadow = true;
  scene.add(road);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260, 36, 36), materials.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3.5;
  const pos = ground.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, (random() - 0.5) * 3);
  ground.geometry.computeVertexNormals();
  ground.receiveShadow = true;
  scene.add(ground);

  const treesGroup = createTrees(scene, materials, random);

  const guardrail = buildGuardrails(scene, materials, curve, 13, 600);

  return { road, ground, curve, treesGroup, guardrailGroup: guardrail.group, guardrailData: guardrail.data, start: curve.getPointAt(0), tangent: curve.getTangentAt(0) };
}
