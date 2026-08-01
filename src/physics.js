import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

const FIXED_DT = 1 / 120;

export async function createPhysics() {
  await RAPIER.init();
  const params = new RAPIER.IntegrationParameters();
  params.dt = FIXED_DT;
  params.numSolverIterations = 12;
  params.numInternalPgsIterations = 2;
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }, params.raw);
  let accumulator = 0;

  function step(delta, beforeStep = () => {}) {
    accumulator += Math.min(delta, 0.1);
    while (accumulator >= FIXED_DT) {
      beforeStep(FIXED_DT);
      world.step();
      accumulator -= FIXED_DT;
    }
  }

  return { RAPIER, world, step, fixedDt: FIXED_DT };
}

export function syncMeshToBody(mesh, body) {
  const p = body.translation();
  const q = body.rotation();
  mesh.position.set(p.x, p.y, p.z);
  mesh.quaternion.set(q.x, q.y, q.z, q.w);
}

export function syncObjectToBody(object, body, offset = new THREE.Vector3()) {
  syncMeshToBody(object, body);
  object.position.add(offset);
}
