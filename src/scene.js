import * as THREE from 'three';

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87bde8);
  scene.fog = new THREE.Fog(0x87bde8, 80, 360);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 8, -14);

  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  const hemi = new THREE.HemisphereLight(0xd8f0ff, 0x5c7a37, 1.2);
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.4);
  sun.position.set(-45, 65, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 180;
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  scene.add(ambient, hemi, sun);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 16, 8),
    new THREE.MeshBasicMaterial({ color: 0x8ec9f4, side: THREE.BackSide })
  );
  scene.add(sky);

  function createRoadTexture() {
    const w = 1024;
    const h = 64;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#383c42';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 8000; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const b = 50 + Math.random() * 18;
      ctx.fillStyle = `rgba(${b},${b},${b},0.35)`;
      ctx.fillRect(x, y, 2, 2);
    }

    ctx.fillStyle = '#f0f0e0';
    ctx.fillRect(0, 0, 16, h);
    ctx.fillRect(w - 16, 0, 16, h);

    ctx.fillStyle = '#f0f0e0';
    const dash = 38;
    const gap = 26;
    for (let y = 0; y < h; y += dash + gap) {
      ctx.fillRect(w / 2 - 3, y, 6, dash);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const roadTexture = createRoadTexture();

  const materials = {
    road: new THREE.MeshStandardMaterial({ map: roadTexture, roughness: 0.85 }),
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

  return { scene, renderer, camera, materials };
}
