import * as THREE from 'three';

export function createDebugRenderer(scene, world, gui) {
  const material = new THREE.LineBasicMaterial({ color: 0x00ff88, vertexColors: true });
  const geometry = new THREE.BufferGeometry();
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  scene.add(lines);

  const settings = { showPhysicsDebug: false };
  gui.add(settings, 'showPhysicsDebug').name('Physics wireframe');

  function update() {
    lines.visible = settings.showPhysicsDebug;
    if (!settings.showPhysicsDebug) return;
    const buffers = world.debugRender();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffers.vertices, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 4));
    geometry.computeBoundingSphere();
  }

  return { update, settings, lines };
}
