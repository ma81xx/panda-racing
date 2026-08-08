import * as THREE from 'three';

const DIRT = [0.55, 0.45, 0.34];
const GRASS = [0.42, 0.5, 0.36];
const ROCK = [0.5, 0.48, 0.46];

const MARK_MAX = 5000;
const DUST_MAX = 700;

const tmpV1 = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();

class SkidMarks {
  constructor(scene) {
    this.maxSegs = MARK_MAX;
    this.positions = new Float32Array(MARK_MAX * 6 * 3);
    this.indices = new Uint32Array(MARK_MAX * 6);
    for (let q = 0; q < MARK_MAX; q++) {
      const v = q * 6;
      this.indices.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], q * 6);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setIndex(new THREE.BufferAttribute(this.indices, 1));

    this.material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);

    this.count = 0;
    this.prev = [null, null, null, null];
  }

  addQuad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
    if (this.count >= this.maxSegs) this.clear();
    const base = this.count * 6 * 3;
    const p = this.positions;
    p[base] = ax; p[base + 1] = ay; p[base + 2] = az;
    p[base + 3] = bx; p[base + 4] = by; p[base + 5] = bz;
    p[base + 6] = cx; p[base + 7] = cy; p[base + 8] = cz;
    p[base + 9] = dx; p[base + 10] = dy; p[base + 11] = dz;
    this.count++;
    this.geometry.setDrawRange(0, this.count * 6);
    this.geometry.attributes.position.needsUpdate = true;
  }

  updateWheel(i, ws, vehicle, speed, skidding, halfWidth) {
    if (skidding && ws.contact && ws.normal) {
      const n = tmpV1.set(ws.normal.x, ws.normal.y, ws.normal.z).normalize();
      const f = vehicle.wheelForwardWorld(i);
      let right = tmpV2.crossVectors(n, f);
      if (right.lengthSq() < 1e-6) right.crossVectors(n, tmpV3.set(0, 1, 0));
      right.normalize();
      const row = {
        l: new THREE.Vector3(ws.contact.x, ws.contact.y, ws.contact.z).addScaledVector(right, halfWidth),
        r: new THREE.Vector3(ws.contact.x, ws.contact.y, ws.contact.z).addScaledVector(right, -halfWidth)
      };
      const prev = this.prev[i];
      if (prev) {
        this.addQuad(prev.l.x, prev.l.y, prev.l.z, row.l.x, row.l.y, row.l.z, prev.r.x, prev.r.y, prev.r.z, row.r.x, row.r.y, row.r.z);
      }
      this.prev[i] = row;
    } else {
      this.prev[i] = null;
    }
  }

  clear() {
    this.count = 0;
    this.prev = [null, null, null, null];
    this.geometry.setDrawRange(0, 0);
  }
}

class Dust {
  constructor(scene) {
    this.max = DUST_MAX;
    this.positions = new Float32Array(DUST_MAX * 3);
    this.velocities = new Float32Array(DUST_MAX * 3);
    this.lives = new Float32Array(DUST_MAX);
    this.sizes = new Float32Array(DUST_MAX);
    this.colors = new Float32Array(DUST_MAX * 3);
    this.cursor = 0;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lives, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {},
      vertexShader: `
        attribute float aLife;
        attribute float aSize;
        attribute vec3 aColor;
        varying float vLife;
        varying vec3 vColor;
        void main() {
          vLife = aLife;
          vColor = aColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (150.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }`,
      fragmentShader: `
        varying float vLife;
        varying vec3 vColor;
        void main() {
          if (vLife <= 0.001) discard;
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float alpha = smoothstep(0.5, 0.0, d) * vLife;
          gl_FragColor = vec4(vColor, alpha * 0.85);
        }`
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, size, color) {
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.positions[idx * 3] = x;
    this.positions[idx * 3 + 1] = y;
    this.positions[idx * 3 + 2] = z;
    this.velocities[idx * 3] = vx;
    this.velocities[idx * 3 + 1] = vy;
    this.velocities[idx * 3 + 2] = vz;
    this.lives[idx] = life;
    this.sizes[idx] = size;
    this.colors[idx * 3] = color[0];
    this.colors[idx * 3 + 1] = color[1];
    this.colors[idx * 3 + 2] = color[2];
  }

  burst(x, y, z, strength, color) {
    const n = Math.min(14, 6 + Math.floor(strength * 6));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.8 * strength;
      this.spawn(
        x + Math.random() * 0.4 - 0.2, y + Math.random() * 0.3, z + Math.random() * 0.4 - 0.2,
        Math.cos(a) * r, 0.6 + Math.random() * strength * 1.4, Math.sin(a) * r,
        0.5 + Math.random() * 0.5, 0.3 + Math.random() * 0.4, color
      );
    }
  }

  update(dt) {
    const p = this.positions;
    const v = this.velocities;
    const l = this.lives;
    for (let i = 0; i < this.max; i++) {
      if (l[i] <= 0) continue;
      l[i] -= dt;
      if (l[i] <= 0) {
        this.sizes[i] = 0;
        continue;
      }
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
      v[i * 3 + 1] -= 1.4 * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aLife.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
  }

  clear() {
    this.lives.fill(0);
    this.sizes.fill(0);
    this.points.geometry.attributes.aLife.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
  }
}

export function createFx(scene, getVehicle) {
  const marks = new SkidMarks(scene);
  const dust = new Dust(scene);

  const settings = {
    sideSkidThreshold: 60,
    brakeSkidSpeed: 4,
    wheelspinSpeed: 12,
    wheelspinImp: 400,
    markOpacity: 0.38,
    markHalfWidth: 0.11,
    dustAmount: 1
  };

  const surfaceColor = (surface) => surface === 'grass' ? GRASS : surface === 'rock' ? ROCK : DIRT;

  function shouldSkid(ws, input, speed, i) {
    if (!ws.isContact) return false;
    if (speed < 1.2) return false;
    if (ws.sideImp > settings.sideSkidThreshold) return true;
    if (input.handbrake && i >= 2 && speed > settings.brakeSkidSpeed) return true;
    if (input.braking && speed > settings.brakeSkidSpeed) return true;
    if (input.throttle && speed > 1 && speed < settings.wheelspinSpeed && ws.fwdImp > settings.wheelspinImp) return true;
    return false;
  }

  function update(dt, input) {
    const vehicle = getVehicle();
    const state = vehicle.getWheelState();
    const speed = vehicle.speed;
    marks.material.opacity = settings.markOpacity;
    for (let i = 0; i < 4; i++) {
      const ws = state[i];
      const skidding = shouldSkid(ws, input, speed, i);
      marks.updateWheel(i, ws, vehicle, speed, skidding, settings.markHalfWidth);
      if (skidding && ws.contact && Math.random() < settings.dustAmount * 0.5) {
        dust.spawn(
          ws.contact.x + (Math.random() - 0.5) * 0.2,
          ws.contact.y + 0.05,
          ws.contact.z + (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2,
          0.35 + Math.random() * 0.4, 0.22 + Math.random() * 0.3,
          surfaceColor(ws.surface)
        );
      }
    }
    dust.update(dt);
  }

  function onImpact(x, y, z, strength) {
    dust.burst(x, y, z, Math.max(0.5, Math.min(2, strength)), DIRT);
  }

  function addGui(gui) {
    const f = gui.addFolder('Effetti (gomma/polvere)');
    f.add(settings, 'sideSkidThreshold', 5, 300, 5).name('slip laterale');
    f.add(settings, 'brakeSkidSpeed', 1, 25, 0.5).name('vel. frenata skid');
    f.add(settings, 'wheelspinSpeed', 1, 25, 0.5).name('vel. spunto ruote');
    f.add(settings, 'wheelspinImp', 100, 1000, 20).name('impulso spunto');
    f.add(settings, 'markOpacity', 0.1, 0.8, 0.01).name('opacità segni');
    f.add(settings, 'markHalfWidth', 0.04, 0.3, 0.01).name('larghezza segno');
    f.add(settings, 'dustAmount', 0, 3, 0.1).name('quantità polvere');
    return f;
  }

  function clear() {
    marks.clear();
    dust.clear();
  }

  return { update, onImpact, addGui, clear };
}
