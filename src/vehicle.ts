import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { SurfaceType, SURFACES } from './surface';
import type { InputState } from './input';

const TORQUE_CURVE: [number, number][] = [
  [800, 80], [2000, 130], [3800, 150], [5000, 130], [6500, 90],
];
const GEAR_RATIOS = [0, 3.5, 2.1, 1.4, 1.0, 0.75];
const FINAL_DRIVE = 3.9;
const SHIFT_UP_RPM = 5800;
const SHIFT_DOWN_RPM = 2500;
const KICKDOWN = 0.95;
const MAX_EXT = 0.70;
const MIN_COMP = 0.03;
const SPRING_REST = 0.48;

function interpTorque(rpm: number): number {
  if (rpm <= TORQUE_CURVE[0][0]) return TORQUE_CURVE[0][1];
  if (rpm >= TORQUE_CURVE[4][0]) return TORQUE_CURVE[4][1];
  for (let i = 0; i < TORQUE_CURVE.length - 1; i++) {
    if (rpm >= TORQUE_CURVE[i][0] && rpm <= TORQUE_CURVE[i + 1][0]) {
      const t = (rpm - TORQUE_CURVE[i][0]) / (TORQUE_CURVE[i + 1][0] - TORQUE_CURVE[i][0]);
      return TORQUE_CURVE[i][1] + t * (TORQUE_CURVE[i + 1][1] - TORQUE_CURVE[i][1]);
    }
  }
  return TORQUE_CURVE[4][1];
}

function pacejka(slip: number, B: number, C: number, D: number, E: number): number {
  const x = B * slip;
  return D * Math.sin(C * Math.atan(x - E * (x - Math.atan(x))));
}

const WHEEL_OFFSETS: [number, number, number][] = [
  [-1.18, 0.25, 1.12], [1.18, 0.25, 1.12],
  [-1.18, 0.25, -1.16], [1.18, 0.25, -1.16],
];

function createWheelVisual(): THREE.Group {
  const g = new THREE.Group();
  const segs = 16;
  const r = 0.42;
  const w = 0.34;

  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const am = (a0 + a1) / 2;

    const dark = i % 2 === 0;
    const shape = new THREE.Shape();
    shape.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    shape.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
    shape.lineTo(Math.cos(a1) * (r - 0.08), Math.sin(a1) * (r - 0.08));
    shape.lineTo(Math.cos(a0) * (r - 0.08), Math.sin(a0) * (r - 0.08));
    shape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      steps: 1,
      depth: w,
      bevelEnabled: false,
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.translate(0, 0, -w / 2);

    const mat = new THREE.MeshStandardMaterial({
      color: dark ? 0x1a1a1a : 0x888888,
      roughness: dark ? 0.9 : 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    g.add(mesh);
  }

  const cap1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.03, 16),
    new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.3, metalness: 0.7 }),
  );
  cap1.position.z = -w / 2 - 0.015;
  cap1.castShadow = true;
  g.add(cap1);

  const cap2 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.03, 16),
    new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.3, metalness: 0.7 }),
  );
  cap2.position.z = w / 2 + 0.015;
  cap2.castShadow = true;
  g.add(cap2);

  g.rotation.x = Math.PI / 2;
  return g;
}

export interface Vehicle {
  group: THREE.Group;
  chassisBody: RAPIER.RigidBody;
  update: (dt: number, input: InputState, hud?: { rpm: number; speed: number }) => void;
  sync: () => void;
  addGui: (gui: any) => void;
}

export function createVehicle(
  scene: THREE.Scene,
  physics: { RAPIER: typeof RAPIER; world: RAPIER.World },
  materials: Record<string, THREE.Material>,
  start: THREE.Vector3,
  tangent: THREE.Vector3,
): Vehicle {
  const bodyWhite = (materials.pandaWhite as THREE.MeshStandardMaterial).clone();
  bodyWhite.transparent = true; bodyWhite.opacity = 0.35; bodyWhite.depthWrite = false;
  const bodyBlack = (materials.pandaBlack as THREE.MeshStandardMaterial).clone();
  bodyBlack.transparent = true; bodyBlack.opacity = 0.35; bodyBlack.depthWrite = false;
  const bodyGlass = (materials.glass as THREE.MeshStandardMaterial).clone();
  bodyGlass.transparent = true; bodyGlass.opacity = 0.25; bodyGlass.depthWrite = false;

  const group = new THREE.Group();
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.05, 3.5), bodyWhite);
  chassis.position.y = 0.75; chassis.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.9, 1.7), bodyGlass);
  cabin.position.set(0, 1.45, 0.25); cabin.castShadow = true;
  const bf = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.35, 0.35), bodyBlack);
  bf.position.set(0, 0.55, 1.9);
  const br = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.35, 0.35), bodyBlack);
  br.position.set(0, 0.55, -1.9);
  group.add(chassis, cabin, bf, br);

  const wheelVisuals: THREE.Group[] = [];
  WHEEL_OFFSETS.forEach(([x, y, z]) => {
    const wg = new THREE.Group();
    wg.add(createWheelVisual());
    wg.position.set(x, y, z);
    group.add(wg);
    wheelVisuals.push(wg);
  });

  const springMeshes: THREE.Mesh[] = [];
  const sX = [-0.7, 0.7, -0.7, 0.7];
  const sZ = [1.12, 1.12, -1.16, -1.16];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 1, 8),
      new THREE.MeshStandardMaterial({ color: 0xcccc44, roughness: 0.5, metalness: 0.8 }),
    );
    s.position.set(sX[i], 0.25, sZ[i]);
    group.add(s);
    springMeshes.push(s);
  }

  const axles: THREE.Mesh[] = [];
  for (const z of [1.12, -1.16]) {
    const a = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2.36, 8),
      new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.9 }),
    );
    a.rotation.z = Math.PI / 2;
    a.position.set(0, 0.25, z);
    group.add(a);
    axles.push(a);
  }
  scene.add(group);

  const tuning = {
    springStiffness: 35000,
    springDamping: 7000,
    enginePower: 1.0,
    brakeForce: 20000,
    maxSteer: 0.55,
    tireGrip: 3.6,
    awd: true,
    pacejkaB: 10, pacejkaC: 1.9, pacejkaE: 0.97,
    gear: 1,
    wheelRadius: 0.42,
  };

  const yaw = Math.atan2(tangent.x, tangent.z);
  const bodyDesc = physics.RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(start.x, start.y + 1.5, start.z).setCanSleep(false);
  bodyDesc.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
  const chassisBody = physics.world.createRigidBody(bodyDesc);
  physics.world.createCollider(
    physics.RAPIER.ColliderDesc.cuboid(1.1, 0.55, 1.75).setDensity(1200 / (4.4 * 2.2 * 3.5)),
    chassisBody,
  );
  chassisBody.setAdditionalMassProperties(1200, { x: 0, y: -0.15, z: -0.20 },
    { x: 2400, y: 6800, z: 5400 }, { x: 0, y: 0, z: 0, w: 1 }, true);

  const springLen = [SPRING_REST, SPRING_REST, SPRING_REST, SPRING_REST];
  const prevSpringLen = [SPRING_REST, SPRING_REST, SPRING_REST, SPRING_REST];
  let currentGear = 1;
  let gearTimer = 0;
  const wheelRpm = [0, 0, 0, 0];
  let avgRpm = 0;
  let carSpeed = 0;

  function ackermann(si: number): [number, number] {
    if (Math.abs(si) < 0.001) return [0, 0];
    const wb = 2.28, tw = 2.36;
    const tr = wb / Math.tan(Math.abs(si));
    const inner = Math.atan(wb / (tr - tw / 2));
    const outer = Math.atan(wb / (tr + tw / 2));
    return si > 0 ? [inner, outer] : [outer, inner];
  }

  function update(dt: number, input: InputState, hud?: { rpm: number; speed: number }): void {
    const p = chassisBody.translation();
    const r = chassisBody.rotation();
    const bodyPos = new THREE.Vector3(p.x, p.y, p.z);
    const bodyQuat = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(bodyQuat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(bodyQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(bodyQuat);
    const bodyVel = new THREE.Vector3(chassisBody.linvel().x, chassisBody.linvel().y, chassisBody.linvel().z);
    const bodyAngVel = new THREE.Vector3(chassisBody.angvel().x, chassisBody.angvel().y, chassisBody.angvel().z);

    const throttle = input.throttle;
    const reverse = input.reverse;
    const steerInput = input.steer * tuning.maxSteer;
    const [ackL, ackR] = ackermann(steerInput);
    const steerAngles = [ackL, ackR, 0, 0];

    const speedFwd = forward.dot(bodyVel);
    carSpeed = speedFwd;

    // Gear shift
    avgRpm = wheelRpm.reduce((a, b) => a + b, 0) / 4;
    gearTimer -= dt;
    if (gearTimer <= 0) {
      if (throttle > KICKDOWN && avgRpm > SHIFT_UP_RPM * 0.8 && currentGear > 1) {
        currentGear--; gearTimer = 0.4;
      } else if (avgRpm > SHIFT_UP_RPM && currentGear < 5) {
        currentGear++; gearTimer = 0.5;
      } else if (avgRpm < SHIFT_DOWN_RPM && currentGear > 1) {
        currentGear--; gearTimer = 0.4;
      }
    }
    if (currentGear < 1) currentGear = 1;
    tuning.gear = currentGear;

    const grounded = [false, false, false, false];
    const contactPts: THREE.Vector3[] = [];
    const surfaceTypes: SurfaceType[] = [];

    // Wheel spring + raycast loop
    for (let i = 0; i < 4; i++) {
      const [lx, ly] = WHEEL_OFFSETS[i];
      const localOff = new THREE.Vector3(lx, ly, 0);
      const worldOff = localOff.clone().applyQuaternion(bodyQuat);
      const mountPos = bodyPos.clone().add(worldOff);

      const rayOrigin = { x: mountPos.x, y: mountPos.y + 0.5, z: mountPos.z };
      const ray = new physics.RAPIER.Ray(rayOrigin, { x: 0, y: -1, z: 0 });
      const hit = physics.world.castRay(ray, 3.0, true);

      let contactPt = new THREE.Vector3(mountPos.x, mountPos.y - SPRING_REST - tuning.wheelRadius, mountPos.z);
      let surf = SurfaceType.ASPHALT;

      if (hit !== null) {
        const hitPt = ray.pointAt(hit.timeOfImpact);
        contactPt.set(hitPt.x, hitPt.y, hitPt.z);
        surf = SurfaceType.ASPHALT;
      }

      const dist = mountPos.y - contactPt.y;
      const actualSpring = THREE.MathUtils.clamp(dist - tuning.wheelRadius, MIN_COMP, MAX_EXT);
      prevSpringLen[i] = springLen[i];
      springLen[i] = actualSpring;

      const compression = SPRING_REST - springLen[i];
      const compVel = -bodyVel.y;

      if (compression > 0) {
        grounded[i] = true;
        const springF = tuning.springStiffness * compression;
        const dampF = THREE.MathUtils.clamp(tuning.springDamping * compVel, -tuning.springStiffness * 0.4, tuning.springStiffness * 0.4);
        const totalVert = Math.max(0, springF + dampF);
        chassisBody.addForceAtPoint({ x: 0, y: totalVert, z: 0 }, { x: contactPt.x, y: contactPt.y, z: contactPt.z }, true);
      }

      contactPts.push(contactPt);
      surfaceTypes.push(surf);
    }

    // Traction + brake + lateral loop
    for (let i = 0; i < 4; i++) {
      if (!grounded[i]) continue;
      const surface = SURFACES[surfaceTypes[i]];
      const cp = contactPts[i];
      const rOff = cp.clone().sub(bodyPos);

      // Engine
      const driven = tuning.awd || i < 2;
      if (driven && throttle > 0) {
        const w = bodyAngVel.clone().cross(rOff);
        const cv = bodyVel.clone().add(w);
        const wfs = forward.dot(cv);
        const rpm = Math.abs(wfs) * 60 / (2 * Math.PI * tuning.wheelRadius) * GEAR_RATIOS[currentGear] * FINAL_DRIVE;
        wheelRpm[i] = rpm;
        const torque = interpTorque(rpm) * GEAR_RATIOS[currentGear] * FINAL_DRIVE * throttle * tuning.enginePower;
        const ef = forward.clone().multiplyScalar(torque / tuning.wheelRadius);
        chassisBody.addForceAtPoint({ x: ef.x, y: ef.y, z: ef.z }, { x: cp.x, y: cp.y, z: cp.z }, true);
      }

      // Brake + reverse
      if (reverse > 0) {
        if (speedFwd > 0.5) {
          const bf = forward.clone().multiplyScalar(-tuning.brakeForce);
          chassisBody.addForceAtPoint({ x: bf.x, y: bf.y, z: bf.z }, { x: cp.x, y: cp.y, z: cp.z }, true);
        } else {
          const revF = forward.clone().multiplyScalar(-tuning.enginePower * 6000 / tuning.wheelRadius);
          chassisBody.addForceAtPoint({ x: revF.x, y: revF.y, z: revF.z }, { x: cp.x, y: cp.y, z: cp.z }, true);
        }
      }

      // Lateral Pacejka
      const wf = i < 2 ? forward.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(up, steerAngles[i])) : forward.clone();
      const wl = new THREE.Vector3(-wf.z, 0, wf.x).normalize();
      const angCont = bodyAngVel.clone().cross(rOff);
      const wv = bodyVel.clone().add(angCont);
      const latVel = wl.dot(wv);
      const longVel = wf.dot(wv);
      const slip = Math.abs(longVel) > 0.01 ? Math.atan2(latVel, Math.abs(longVel)) : 0;
      const nf = Math.max(tuning.springStiffness * Math.max(0, SPRING_REST - springLen[i]) * 0.5 + 800, 500);
      const pj = pacejka(slip, tuning.pacejkaB, tuning.pacejkaC, surface.mu, tuning.pacejkaE) * nf;
      const latF = wl.clone().multiplyScalar(-Math.sign(latVel) * pj);
      chassisBody.addForceAtPoint({ x: latF.x, y: latF.y, z: latF.z }, { x: cp.x, y: cp.y, z: cp.z }, true);

      // Rolling resistance
      const rr = -surface.rollingResistance * nf * (speedFwd > 0.1 ? 1 : speedFwd < -0.1 ? -1 : 0);
      chassisBody.addForceAtPoint(
        { x: forward.x * rr, y: forward.y * rr, z: forward.z * rr },
        { x: cp.x, y: cp.y, z: cp.z }, true);
    }

    if (hud) { hud.rpm = avgRpm; hud.speed = Math.abs(speedFwd) * 3.6; }
  }

  function sync(): void {
    const p = chassisBody.translation();
    const q = chassisBody.rotation();
    group.position.set(p.x, p.y, p.z);
    group.quaternion.set(q.x, q.y, q.z, q.w);

    const bodyQuat = group.quaternion.clone();
    for (let i = 0; i < 4; i++) {
      const [lx, ly, lz] = WHEEL_OFFSETS[i];
      const wg = wheelVisuals[i];
      wg.position.set(lx, ly - springLen[i], lz);
      wg.rotation.z = carSpeed * 0.016 / tuning.wheelRadius;

      const s = springMeshes[i];
      s.position.set(sX[i], ly - springLen[i] * 0.5, sZ[i]);
      s.scale.y = springLen[i];
    }

    const fay = wheelVisuals[0].position.y + wheelVisuals[1].position.y;
    const ray = wheelVisuals[2].position.y + wheelVisuals[3].position.y;
    axles[0].position.y = fay * 0.5 + 0.21;
    axles[1].position.y = ray * 0.5 + 0.21;
  }

  function addGui(gui: any): void {
    const f = gui.addFolder('Panda tuning');
    f.add(tuning, 'springStiffness', 15000, 120000, 5000).name('molle');
    f.add(tuning, 'springDamping', 3000, 25000, 500).name('ammortizz');
    f.add(tuning, 'enginePower', 0.5, 3.0, 0.1).name('potenza');
    f.add(tuning, 'brakeForce', 5000, 40000, 1000).name('freni');
    f.add(tuning, 'maxSteer', 0.1, 1.0, 0.01).name('sterzata');
    f.add(tuning, 'tireGrip', 0.5, 8, 0.1).name('grip');
    f.add(tuning, 'awd').name('traz. integrale');
    f.add(tuning, 'pacejkaB', 2, 20, 0.5).name('Pacejka B');
    f.add(tuning, 'pacejkaC', 1, 3, 0.1).name('Pacejka C');
    f.add(tuning, 'pacejkaE', 0.5, 1, 0.01).name('Pacejka E');
    f.add(tuning, 'gear', 1, 5, 1).name('marcia').listen();
  }

  return { group, chassisBody, update, sync, addGui };
}
