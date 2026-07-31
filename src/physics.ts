import RAPIER from '@dimforge/rapier3d-compat';

const FIXED_DT = 1 / 60;

export interface PhysicsWorld {
  RAPIER: typeof RAPIER;
  world: RAPIER.World;
  step: (delta: number, beforeStep: (dt: number) => void) => void;
}

export async function createPhysics(): Promise<PhysicsWorld> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  let accumulator = 0;

  function step(delta: number, beforeStep: (dt: number) => void): void {
    accumulator += Math.min(delta, 0.1);
    while (accumulator >= FIXED_DT) {
      beforeStep(FIXED_DT);
      world.step();
      accumulator -= FIXED_DT;
    }
  }

  return { RAPIER, world, step };
}
