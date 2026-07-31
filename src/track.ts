import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { SurfaceType } from './surface';

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRoadGeometry(curve: THREE.CatmullRomCurve3, width: number, samples: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(up, tangent).normalize();
    const crown = Math.sin(t * Math.PI * 2) * 0.04;
    const hw = width / 2 + crown;
    positions.push(
      center.x + side.x * hw, center.y, center.z + side.z * hw,
      center.x - side.x * hw, center.y, center.z - side.z * hw,
    );
    uvs.push(0, i / 8, 1, i / 8);
    if (i < samples) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export interface Track {
  road: THREE.Mesh;
  ground: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  start: THREE.Vector3;
  tangent: THREE.Vector3;
  guardrailData: { x: number; y: number; z: number; nx: number; nz: number }[];
  mudZones: { x: number; z: number; radius: number }[];
}

export function createTrack(
  scene: THREE.Scene,
  physics: { RAPIER: typeof RAPIER; world: RAPIER.World },
  materials: Record<string, THREE.Material>,
  seed: number = 1337,
): Track {
  const random = mulberry32(seed);
  const points: THREE.Vector3[] = [];
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

  let minY = Infinity;
  for (const p of points) minY = Math.min(minY, p.y);
  const yOffset = -3.2 - minY;
  if (yOffset > 0) for (const p of points) p.y += yOffset;

  const baseY = points[0].y;
  const r0 = Math.sqrt(points[0].x ** 2 + points[0].z ** 2);
  const aStep = (Math.PI * 2) / total;
  for (const idx of [0, 1, 2, total - 1, total - 2]) points[idx].y = baseY;
  for (const [idx, mult] of [[1, 1], [total - 1, -1], [total - 2, -2]] as [number, number][]) {
    points[idx].x = r0 * Math.cos(aStep * mult);
    points[idx].z = r0 * Math.sin(aStep * mult);
  }

  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.35);
  const roadGeometry = buildRoadGeometry(curve, 13, 520);
  const road = new THREE.Mesh(roadGeometry, materials.road);
  road.receiveShadow = true;
  road.castShadow = true;
  scene.add(road);

  const vertices = new Float32Array(roadGeometry.attributes.position.array);
  const indices = new Uint32Array(roadGeometry.index!.array);
  const trimeshBody = physics.world.createRigidBody(physics.RAPIER.RigidBodyDesc.fixed());
  physics.world.createCollider(physics.RAPIER.ColliderDesc.trimesh(vertices, indices), trimeshBody);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260, 36, 36), materials.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3.5;
  const pos = ground.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, (random() - 0.5) * 3);
  ground.geometry.computeVertexNormals();
  ground.receiveShadow = true;
  scene.add(ground);

  const treesGroup = new THREE.Group();
  for (let i = 0; i < 60; i++) {
    const a = random() * Math.PI * 2;
    const r = 50 + random() * 140;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const cp = curve.getPointAt(random());
    const dx = x - cp.x, dz = z - cp.z;
    if (Math.sqrt(dx * dx + dz * dz) < 9) continue;

    const h = 3 + random() * 3;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.35, h, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4c3b, roughness: 0.9, flatShading: true }),
    );
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    const tree = new THREE.Group();
    tree.add(trunk);
    for (let j = 0; j < 2; j++) {
      const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(1.2 + random() * 0.8 - j * 0.3, 2 + random(), 8),
        new THREE.MeshStandardMaterial({ color: 0x3d7a28, roughness: 0.85, flatShading: true }),
      );
      foliage.position.y = h * 0.6 + j * 0.9;
      foliage.castShadow = true;
      tree.add(foliage);
    }
    tree.position.set(x, 0, z);
    treesGroup.add(tree);
  }
  scene.add(treesGroup);

  const guardrailData: { x: number; y: number; z: number; nx: number; nz: number }[] = [];
  const guardrailGroup = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.12, 0.7, 0.12);
  const railGeo = new THREE.BoxGeometry(0.08, 0.12, 2.5);
  const guardMat = new THREE.MeshStandardMaterial({ color: 0x889099, roughness: 0.6, metalness: 0.7 });
  const upV = new THREE.Vector3(0, 1, 0);
  const samples = 500;
  for (let i = 0; i < samples; i++) {
    const t = i / samples;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(upV, tangent).normalize();
    for (const dir of [-1, 1]) {
      const edge = center.clone().addScaledVector(side, dir * 6.5);
      const post = new THREE.Mesh(postGeo, guardMat);
      post.position.copy(edge);
      post.position.y += 0.35;
      post.castShadow = true;
      guardrailGroup.add(post);

      const rail = new THREE.Mesh(railGeo, guardMat);
      rail.position.copy(edge);
      rail.position.y += 0.65;
      rail.lookAt(edge.clone().add(tangent));
      rail.castShadow = true;
      guardrailGroup.add(rail);

      guardrailData.push({ x: edge.x, y: rail.position.y, z: edge.z, nx: side.x * dir, nz: side.z * dir });
    }
  }
  scene.add(guardrailGroup);

  const mudZones: { x: number; z: number; radius: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const t = random();
    const pt = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(upV, tangent).normalize();
    const offsetDir = random() > 0.5 ? 1 : -1;
    const dist = 9 + random() * 15;
    const mx = pt.x + side.x * offsetDir * dist;
    const mz = pt.z + side.z * offsetDir * dist;
    mudZones.push({ x: mx, z: mz, radius: 4 + random() * 6 });
  }

  return {
    road,
    ground,
    curve,
    start: curve.getPointAt(0),
    tangent: curve.getTangentAt(0),
    guardrailData,
    mudZones,
  };
}
