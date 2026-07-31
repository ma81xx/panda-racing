import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export function createDebugRenderer(scene: THREE.Scene, world: RAPIER.World, gui: any) {
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x00ff88, vertexColors: true }),
  );
  lines.visible = false;
  scene.add(lines);

  const settings = { showPhysicsDebug: false };

  gui.add(settings, 'showPhysicsDebug').name('Physics wireframe');

  function update(): void {
    lines.visible = settings.showPhysicsDebug;
    if (!settings.showPhysicsDebug) return;
    const v = world.debugRender();
    lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(v.vertices, 3));
    lines.geometry.setAttribute('color', new THREE.Float32BufferAttribute(v.colors, 4));
    lines.geometry.computeBoundingSphere();
  }

  return { update, settings, lines };
}
