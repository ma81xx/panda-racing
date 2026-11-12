import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const [glbPath] = process.argv.slice(2);
if (!glbPath) {
  console.error('Uso: node tools/blueprint-modeler/lib/validate.js <model.glb>');
  process.exit(2);
}

const buffer = fs.readFileSync(glbPath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
const models = [];

function nodeBox(node) {
  const box = new THREE.Box3().setFromObject(node);
  return box;
}

gltf.scene.traverse((node) => {
  if (node.userData?.vehicleWheel) models.push(node);
});

const errors = [];
const round = (value, digits = 3) => Number(value.toFixed(digits));

if (models.length !== 4) errors.push(`ruote con metadati: ${models.length} (attese 4)`);

const wheels = models.map((node) => {
  const box = nodeBox(node);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = size.y / 2;
  const meta = node.userData;
  if (Math.abs(radius - meta.radius) > 0.01) {
    errors.push(`${node.name}: raggio reale ${round(radius)} != metadato ${round(meta.radius)}`);
  }
  return {
    name: node.name,
    center,
    radius,
    axle: meta.axle,
    side: meta.side
  };
});

const front = wheels.filter((wheel) => wheel.axle === 'front');
const rear = wheels.filter((wheel) => wheel.axle === 'rear');
if (front.length !== 2) errors.push(`ruote anteriori: ${front.length} (attese 2)`);
if (rear.length !== 2) errors.push(`ruote posteriori: ${rear.length} (attese 2)`);

if (front.length === 2) {
  const wheelbase = Math.abs(front[0].center.z - rear[0].center.z);
  if (wheelbase < 2.4 || wheelbase > 2.9) errors.push(`passo rilevato inatteso: ${round(wheelbase)} m`);
}
if (wheels.length === 4) {
  const track = Math.abs(wheels[0].center.x - wheels[1].center.x);
  if (track < 1.4 || track > 1.7) errors.push(`carreggiata rilevata inattesa: ${round(track)} m`);
}

let bodyNode = null;
const materialNames = new Set();
gltf.scene.traverse((node) => {
  if (node.name === 'Body') bodyNode = node;
  if (!node.isMesh) return;
  const list = Array.isArray(node.material) ? node.material : [node.material];
  for (const material of list) if (material?.name) materialNames.add(material.name);
});

if (bodyNode) {
  const size = nodeBox(bodyNode).getSize(new THREE.Vector3());
  if (size.z < 4.2 || size.z > 4.7) errors.push(`lunghezza carrozzeria inattesa: ${round(size.z)} m`);
  if (size.x < 1.6 || size.x > 1.95) errors.push(`larghezza carrozzeria inattesa: ${round(size.x)} m`);
  if (size.y < 1.2 || size.y > 1.5) errors.push(`altezza carrozzeria inattesa: ${round(size.y)} m`);
}

for (const material of ['Carpaint', 'Window', 'Tyre', 'Metal', 'Plastic', 'BrakeLight', 'ReverseLight']) {
  if (!materialNames.has(material)) errors.push(`materiale mancante: ${material}`);
}

console.log('Ruote:');
for (const wheel of wheels) {
  console.log(`  ${wheel.name}: x=${round(wheel.center.x)} y=${round(wheel.center.y)} z=${round(wheel.center.z)} r=${round(wheel.radius)}`);
}
if (bodyNode) {
  const size = nodeBox(bodyNode).getSize(new THREE.Vector3());
  console.log(`Carrozzeria: ${round(size.x)} x ${round(size.y)} x ${round(size.z)} m`);
}
console.log(`Materiali: ${[...materialNames].sort().join(', ')}`);

if (errors.length) {
  console.error('\nValidazione FALLITA:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('\nValidazione OK');
