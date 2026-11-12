import * as THREE from 'three';

export function createMaterials(spec) {
  const materials = {};

  for (const [name, def] of Object.entries(spec.materials || {})) {
    const material = new THREE.MeshStandardMaterial({ name });
    if (def.color) material.color.set(def.color);
    if (def.emissive) material.emissive.set(def.emissive);
    if (def.emissiveIntensity != null) material.emissiveIntensity = def.emissiveIntensity;
    if (def.metalness != null) material.metalness = def.metalness;
    if (def.roughness != null) material.roughness = def.roughness;
    if (def.opacity != null) {
      material.opacity = def.opacity;
      material.transparent = def.opacity < 1;
      if (material.transparent) material.depthWrite = false;
    }
    if (def.side === 'double') material.side = THREE.DoubleSide;
    if (def.side === 'back') material.side = THREE.BackSide;
    material.needsUpdate = true;
    materials[name] = material;
  }

  return materials;
}
