import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd9f2);
  scene.fog = new THREE.Fog(0xbfd9f2, 90, 320);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 8, -14);

  const ambient = new THREE.AmbientLight(0xffffff, 0.18);
  const hemi = new THREE.HemisphereLight(0xd8f0ff, 0x5c7a37, 0.55);
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.2);
  sun.position.set(-45, 65, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 38;
  sun.shadow.camera.bottom = -38;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.02;
  scene.add(ambient, hemi, sun);
  scene.add(sun.target);

  const sky = new Sky();
  sky.scale.setScalar(700);
  const skyUniforms = sky.material.uniforms;
  skyUniforms.turbidity.value = 6;
  skyUniforms.rayleigh.value = 1.6;
  skyUniforms.mieCoefficient.value = 0.005;
  skyUniforms.mieDirectionalG.value = 0.8;
  skyUniforms.sunPosition.value.copy(sun.position).normalize();
  skyUniforms.showSunDisc.value = 1;
  skyUniforms.cloudCoverage.value = 0.35;
  skyUniforms.cloudDensity.value = 0.5;
  skyUniforms.cloudElevation.value = 0.45;
  skyUniforms.cloudScale.value = 0.0003;
  skyUniforms.cloudSpeed.value = 0.0002;
  scene.add(sky);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = sky.clone();
  envScene.add(envSky);
  const envGround = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshBasicMaterial({ color: 0x5f7a3a })
  );
  envGround.rotation.x = -Math.PI / 2;
  envGround.position.y = -12;
  envScene.add(envGround);
  const cloudCoverage = skyUniforms.cloudCoverage.value;
  skyUniforms.cloudCoverage.value = 0;
  const envTarget = pmrem.fromScene(envScene, 0, 1, 1000);
  skyUniforms.cloudCoverage.value = cloudCoverage;
  const environment = envTarget.texture;
  pmrem.dispose();
  envGround.geometry.dispose();
  envGround.material.dispose();

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
  });

  return { scene, renderer, camera, materials, sun, sky, environment };
}
