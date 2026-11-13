import * as THREE from 'three';

function applyAxis(geometry, axis) {
  if (axis === 'x') geometry.rotateZ(Math.PI / 2);
  else if (axis === 'z') geometry.rotateX(Math.PI / 2);
}

export function buildParts(spec, materials) {
  const group = new THREE.Group();
  group.name = 'Details';

  for (const part of spec.details?.parts ?? []) {
    let geometry;
    if (part.type === 'box') {
      geometry = new THREE.BoxGeometry(...part.size);
    } else if (part.type === 'cylinder') {
      geometry = new THREE.CylinderGeometry(
        part.radius,
        part.radius,
        part.length,
        part.segments ?? 20,
        1,
        part.open ?? false
      );
      applyAxis(geometry, part.axis ?? 'y');
    } else if (part.type === 'halfCylinder') {
      geometry = new THREE.CylinderGeometry(
        part.radius,
        part.radius,
        part.length,
        part.segments ?? 16,
        1,
        true,
        0,
        Math.PI
      );
      applyAxis(geometry, part.axis ?? 'x');
    } else if (part.type === 'torus') {
      geometry = new THREE.TorusGeometry(
        part.radius,
        part.tube,
        part.radialSegments ?? 8,
        part.tubularSegments ?? 32,
        THREE.MathUtils.degToRad(part.arc ?? 360)
      );
    } else if (part.type === 'quad') {
      const points = part.points.map((point) => new THREE.Vector3(...point));
      if (points.length !== 4) throw new Error(`${part.name}: una quad richiede 4 punti`);
      const average = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(0.25);
      const normal = new THREE.Vector3()
        .subVectors(points[1], points[0])
        .cross(new THREE.Vector3().subVectors(points[2], points[0]))
        .normalize();
      const reverse = normal.dot(average.clone().sub(new THREE.Vector3(0, 0.7, 0))) < 0;
      const order = reverse ? [0, 3, 2, 1] : [0, 1, 2, 3];
      const positions = points.flatMap((point) => [point.x, point.y, point.z]);
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex([order[0], order[1], order[2], order[0], order[2], order[3]]);
      geometry.computeVertexNormals();
    } else if (part.type === 'arch') {
      const points = [];
      const steps = part.segments ?? 20;
      for (let i = 0; i <= steps; i++) {
        const theta = (Math.PI * i) / steps;
        points.push(new THREE.Vector3(
          part.x,
          part.baseY + part.lift * Math.sin(theta),
          part.z + part.radius * Math.cos(theta)
        ));
      }
      geometry = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        steps * 2,
        part.tube,
        8,
        false
      );
    } else if (part.type === 'polyline') {
      const points = part.points.map((point) => new THREE.Vector3(...point));
      geometry = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        part.segments ?? 32,
        part.tube,
        6,
        false
      );
    } else if (part.type === 'archWell') {
      const steps = part.segments ?? 20;
      const positions = [];
      const indices = [];
      for (let i = 0; i <= steps; i++) {
        const theta = (Math.PI * i) / steps;
        const y = part.baseY + part.lift * Math.sin(theta);
        const z = part.z + part.radius * Math.cos(theta);
        positions.push(part.xOuter, y, z);
        positions.push(part.xInner, y, z);
      }
      for (let i = 0; i < steps; i++) {
        const outer0 = i * 2;
        const inner0 = i * 2 + 1;
        const outer1 = (i + 1) * 2;
        const inner1 = (i + 1) * 2 + 1;
        indices.push(outer0, outer1, inner1, outer0, inner1, inner0);
      }
      const centerIndex = positions.length / 3;
      positions.push(part.xInner, part.baseY + part.lift * 0.5, part.z);
      for (let i = 0; i < steps; i++) {
        indices.push(centerIndex, i * 2 + 3, i * 2 + 1);
      }
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
    } else {
      throw new Error(`Tipo parte non supportato: ${part.type}`);
    }

    const material = materials[part.material] ?? materials.Plastic;
    const meshMaterial = part.type === 'archWell' ? material.clone() : material;
    if (part.type === 'archWell') {
      meshMaterial.side = THREE.DoubleSide;
      meshMaterial.needsUpdate = true;
    }
    const mesh = new THREE.Mesh(geometry, meshMaterial);
    mesh.name = part.name || part.type;
    if (part.pos) mesh.position.set(...part.pos);
    if (part.rot) {
      mesh.rotation.set(
        THREE.MathUtils.degToRad(part.rot[0]),
        THREE.MathUtils.degToRad(part.rot[1]),
        THREE.MathUtils.degToRad(part.rot[2])
      );
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}
