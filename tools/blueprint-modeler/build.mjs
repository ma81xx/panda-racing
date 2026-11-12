import path from 'node:path';
import * as THREE from 'three';
import { loadSpec } from './lib/spec.js';
import { createMaterials } from './lib/materials.js';
import { buildBody } from './lib/loft.js';
import { buildWheels } from './lib/wheels.js';
import { buildParts } from './lib/details.js';
import { exportGLB } from './lib/export.js';

const [specPath, outPath] = process.argv.slice(2);

if (!specPath || !outPath) {
  console.error('Uso: node tools/blueprint-modeler/build.mjs <spec.json> <out.glb>');
  process.exit(2);
}

const spec = loadSpec(path.resolve(specPath));
const materials = createMaterials(spec);

const root = new THREE.Group();
root.name = spec.name || 'Vehicle';
root.add(buildBody(spec, materials));
root.add(buildWheels(spec, materials));
root.add(buildParts(spec, materials));
root.updateMatrixWorld(true);

const box = new THREE.Box3().setFromObject(root);
const size = new THREE.Vector3();
box.getSize(size);

let triangles = 0;
root.traverse((node) => {
  if (!node.isMesh) return;
  const index = node.geometry.getIndex();
  const positions = node.geometry.getAttribute('position');
  triangles += index ? index.count / 3 : positions.count / 3;
});

const bytes = await exportGLB(root, path.resolve(outPath));
const dims = spec.dimensions;
console.log(`Modello: ${root.name}`);
console.log(`BBox: ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)} m (atteso ${dims.width} x ${dims.height} x ${dims.length})`);
console.log(`Triangoli: ${Math.round(triangles)}`);
console.log(`Scritto: ${outPath} (${(bytes / 1024).toFixed(1)} KiB)`);
