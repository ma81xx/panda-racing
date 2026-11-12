import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

const MAX_PIXEL_RATIO = 1.5;

function supportsEnvironmentMap(renderer) {
  if (!renderer.capabilities.isWebGL2) return false;
  const gl = renderer.getContext();
  return !!(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
}

function isEnvironmentUsable(renderer, environment) {
  const probeScene = new THREE.Scene();
  const probeCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
  probeCamera.position.z = 2.5;
  const geometry = new THREE.SphereGeometry(1, 16, 10);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 0.1,
    envMap: environment
  });
  probeScene.add(new THREE.Mesh(geometry, material));

  const target = new THREE.WebGLRenderTarget(8, 8);
  const previousTarget = renderer.getRenderTarget();
  let usable = false;
  try {
    renderer.setRenderTarget(target);
    renderer.render(probeScene, probeCamera);
    const pixels = new Uint8Array(8 * 8 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 8, 8, pixels);
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 4) sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
    usable = sum > 256;
  } catch (error) {
    usable = false;
  } finally {
    renderer.setRenderTarget(previousTarget);
    target.dispose();
    geometry.dispose();
    material.dispose();
  }
  return usable;
}

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd9f2);
  scene.fog = new THREE.Fog(0xbfd9f2, 90, 320);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const lowPower = renderer.capabilities.precision !== 'highp' || renderer.capabilities.maxTextureSize < 4096;
  const pixelRatioCap = lowPower ? 1 : MAX_PIXEL_RATIO;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = lowPower ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  canvas.addEventListener('webglcontextlost', (event) => event.preventDefault());

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 8, -14);

  const ambient = new THREE.AmbientLight(0xffffff, 0.18);
  const hemi = new THREE.HemisphereLight(0xd8f0ff, 0x5c7a37, 0.55);
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.2);
  sun.position.set(-45, 65, 20);
  sun.castShadow = true;
  const shadowSize = lowPower ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
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

  let environment = null;
  if (supportsEnvironmentMap(renderer)) {
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
    try {
      const envTarget = pmrem.fromScene(envScene, 0, 1, 1000);
      environment = envTarget.texture;
      if (!isEnvironmentUsable(renderer, environment)) {
        envTarget.dispose();
        environment = null;
      }
    } catch (error) {
      environment = null;
    } finally {
      skyUniforms.cloudCoverage.value = cloudCoverage;
      pmrem.dispose();
      envGround.geometry.dispose();
      envGround.material.dispose();
    }
  }

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);

  return { scene, renderer, camera, sun, sky, environment };
}
