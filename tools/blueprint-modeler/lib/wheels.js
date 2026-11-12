import * as THREE from 'three';

function cylinderX(radius, length, segments, openEnded = false) {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments, 1, openEnded);
  geometry.rotateZ(Math.PI / 2);
  return geometry;
}

function addMesh(group, geometry, material, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function buildWheel(spec, materials, name, x, z) {
  const { radius, width, rimRadius } = spec.wheels;
  const spokes = spec.wheels.spokes ?? 5;
  const group = new THREE.Group();
  group.name = name;

  addMesh(group, cylinderX(radius, width, 32, true), materials.Tyre, `${name}_Tread`);

  for (const side of [-1, 1]) {
    const sidewallGeometry = new THREE.RingGeometry(rimRadius * 0.98, radius, 32);
    sidewallGeometry.rotateY(Math.PI / 2);
    const sidewall = addMesh(group, sidewallGeometry, materials.Tyre, `${name}_Sidewall${side < 0 ? 'L' : 'R'}`);
    sidewall.position.x = side * (width / 2 - 0.001);

    const lipGeometry = new THREE.TorusGeometry(rimRadius * 0.95, 0.018, 8, 32);
    lipGeometry.rotateY(Math.PI / 2);
    const lip = addMesh(group, lipGeometry, materials.Metal, `${name}_Lip${side < 0 ? 'L' : 'R'}`);
    lip.position.x = side * (width / 2 - 0.01);

    for (let i = 0; i < spokes; i++) {
      const baseAngle = (Math.PI * 2 / spokes) * i;
      for (const offset of [-0.09, 0.09]) {
        const spokeGeometry = new THREE.BoxGeometry(0.028, rimRadius * 0.95, 0.055);
        spokeGeometry.translate(0, rimRadius * 0.475, 0);
        const spoke = addMesh(
          group,
          spokeGeometry,
          materials.Metal,
          `${name}_Spoke${side < 0 ? 'L' : 'R'}${i}${offset < 0 ? 'a' : 'b'}`
        );
        spoke.rotation.x = baseAngle + offset;
        spoke.position.x = side * (width / 2 - 0.022);
      }
    }

    const sidewallBulgeGeometry = new THREE.TorusGeometry(radius - 0.04, 0.02, 8, 40);
    sidewallBulgeGeometry.rotateY(Math.PI / 2);
    const sidewallBulge = addMesh(group, sidewallBulgeGeometry, materials.Tyre, `${name}_Shoulder${side < 0 ? 'L' : 'R'}`);
    sidewallBulge.position.x = side * (width / 2 - 0.006);

    const hub = addMesh(group, cylinderX(rimRadius * 0.22, 0.05, 16), materials.Metal, `${name}_Hub${side < 0 ? 'L' : 'R'}`);
    hub.position.x = side * (width / 2 - 0.005);
  }

  addMesh(group, cylinderX(rimRadius, width * 0.9, 24, true), materials.Brake, `${name}_Barrel`);
  addMesh(group, cylinderX(rimRadius * 0.82, 0.02, 24), materials.Brake, `${name}_Disc`);

  const caliper = addMesh(group, new THREE.BoxGeometry(0.07, 0.1, 0.16), materials.Caliper, `${name}_Caliper`);
  caliper.position.set(0, rimRadius * 0.55, 0);

  group.position.set(x, radius, z);
  group.userData = {
    vehicleWheel: true,
    radius,
    side: x < 0 ? 'L' : 'R',
    axle: z > 0 ? 'front' : 'rear'
  };
  return group;
}

export function buildWheels(spec, materials) {
  const group = new THREE.Group();
  group.name = 'Wheels';

  const halfTrack = spec.wheels.track / 2;
  const frontZ = spec.halfLength - spec.wheels.frontAxle;
  const rearZ = spec.halfLength - spec.wheels.rearAxle;

  group.add(buildWheel(spec, materials, 'Wheel_FL', -halfTrack, frontZ));
  group.add(buildWheel(spec, materials, 'Wheel_FR', halfTrack, frontZ));
  group.add(buildWheel(spec, materials, 'Wheel_RL', -halfTrack, rearZ));
  group.add(buildWheel(spec, materials, 'Wheel_RR', halfTrack, rearZ));

  return group;
}
