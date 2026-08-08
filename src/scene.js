import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

function createSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#2f66c4');
  grad.addColorStop(0.45, '#6fa3e6');
  grad.addColorStop(0.8, '#bcd9f4');
  grad.addColorStop(1, '#e8f3fc');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe4f2);
  scene.fog = new THREE.Fog(0xcfe4f2, 260, 900);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;

  const skyTexture = createSkyTexture();

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSphere = new THREE.Mesh(
    new THREE.SphereGeometry(30, 32, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide })
  );
  envScene.add(envSphere);
  scene.environment = pmrem.fromScene(envScene, 0.06).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 8, -14);

  const hemi = new THREE.HemisphereLight(0xd8f0ff, 0x5c7a37, 0.35);
  const sun = new THREE.DirectionalLight(0xfff2d0, 3.2);
  sun.position.set(-45, 65, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 180;
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  scene.add(hemi, sun);

  const sky = new Sky();
  sky.scale.setScalar(1000);
  sky.material.depthWrite = false;
  sky.material.fog = false;
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  const sunDir = new THREE.Vector3(sun.position.x, sun.position.y, sun.position.z).normalize();
  const skyUniforms = sky.material.uniforms;
  skyUniforms.sunPosition.value.copy(sunDir);
  skyUniforms.turbidity.value = 6;
  skyUniforms.rayleigh.value = 2.2;
  skyUniforms.mieCoefficient.value = 0.005;
  skyUniforms.mieDirectionalG.value = 0.8;
  scene.add(sky);

  const bloom = { enabled: false, strength: 0.45, radius: 0.6, threshold: 0.85 };
  let composer = null;
  let bloomPass = null;

  function ensureComposer() {
    if (composer) return;
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), bloom.strength, bloom.radius, bloom.threshold);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  function setBloom(enabled) {
    bloom.enabled = enabled;
    if (enabled) ensureComposer();
  }

  function renderFrame() {
    sky.position.copy(camera.position);
    if (bloom.enabled && composer) {
      bloomPass.strength = bloom.strength;
      bloomPass.radius = bloom.radius;
      bloomPass.threshold = bloom.threshold;
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  }

  const materials = {
    road: new THREE.MeshStandardMaterial({ color: 0x343840, roughness: 0.9, flatShading: true }),
    shoulder: new THREE.MeshStandardMaterial({ color: 0x8a7448, roughness: 1, flatShading: true }),
    grass: new THREE.MeshStandardMaterial({ color: 0x5f9f41, roughness: 1, flatShading: true }),
    pandaWhite: new THREE.MeshStandardMaterial({ color: 0xf4eee4, roughness: 0.7, flatShading: true }),
    pandaBlack: new THREE.MeshStandardMaterial({ color: 0x202329, roughness: 0.8, flatShading: true }),
    glass: new THREE.MeshStandardMaterial({ color: 0x7fc7d9, roughness: 0.35, metalness: 0.05, flatShading: true }),
    wheel: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 1, flatShading: true })
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, renderer, camera, materials, renderFrame, bloom, setBloom };
}
