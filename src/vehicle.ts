import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { SurfaceType, SURFACES } from './surface';
import type { InputState } from './input';

const TORQUE_CURVE: [number, number][] = [
  [800, 80],
  [2000, 130],
  [3800, 150],
  [5000, 130],
  [6500, 90],
];

const GEAR_RATIOS = [0, 3.5, 2.1, 1.4, 1.0, 0.75];
const FINAL_DRIVE = 3.9;
const SHIFT_UP_RPM = 5800;
const SHIFT_DOWN_RPM = 2500;
const KICKDOWN_THRESHOLD = 0.95;

function interpolateTorque(rpm: number): number {
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
  [-1.18, 0.25, 1.12],
  [1.18, 0.25, 1.12],
  [-1.18, 0.25, -1.16],
  [1.18, 0.25, -1.16],
];

const SPRING_REST = 0.48;
const MIN_COMP = 0.04;
const MAX_EXT = SPRING_REST + 0.20;

export interface Vehicle {
  group: THREE.Group;
  chassisBody: RAPIER.RigidBody;
  update: (dt: number, input: InputState) => void;
  sync: () => void;
  addGui: (gui: any) => void;
}

function createWheelVisual(): THREE.Group {
  const g = new THREE.Group();
  const segments = 12;
  for (let i = 0; i < segments; i++) {
    const color = i % 2 === 0 ? 0x1a1a1a : 0x888888;
    const angle = (i / segments) * Math.PI * 2;
    const nextAngle = ((i + 0.6) / segments) * Math.PI * 2;
    const midAngle = (angle + nextAngle) / 2;
    const len = 0.34;
    const r = 0.42;
    const hw = (nextAngle - angle) * r;
    const shape = new THREE.Shape();
    shape.moveTo(0, -len / 2);
    shape.lineTo(hw, -len / 2);
    shape.lineTo(hw, len / 2);
    shape.lineTo(0, len / 2);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    mesh.position.x = -0.01;
    mesh.rotation.y = midAngle;
    mesh.castShadow = true;
    g.add(mesh);
  }
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.02, 12),
    new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.3, metalness: 0.7 })
  );
  cap.rotation.z = Math.PI / 2;
  cap.castShadow = true;
  g.add(cap);
  return g;
}

export function createVehicle(
  scene: THREE.Scene,
  physics: { RAPIER: typeof RAPIER; world: RAPIER.World },
  materials: Record<string, THREE.Material>,
  start: THREE.Vector3,
  tangent: THREE.Vector3,
): Vehicle {
  const bodyWhite = (materials.pandaWhite as THREE.MeshStandardMaterial).clone();
  bodyWhite.transparent = true;
  bodyWhite.opacity = 0.35;
  bodyWhite.depthWrite = false;

  const bodyBlack = (materials.pandaBlack as THREE.MeshStandardMaterial).clone();
  bodyBlack.transparent = true;
  bodyBlack.opacity = 0.35;
  bodyBlack.depthWrite = false;

  const bodyGlass = (materials.glass as THREE.MeshStandardMaterial).clone();
  bodyGlass.transparent = true;
  bodyGlass.opacity = 0.25;
  bodyGlass.depthWrite = false;

  const group = new THREE.Group();

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.05, 3.5), bodyWhite);
  chassis.position.y = 0.75;
  chassis.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.9, 1.7), bodyGlass);
  cabin.position.set(0, 1.45, 0.25);
  cabin.castShadow = true;
  const bumperFront = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.35, 0.35), bodyBlack);
  bumperFront.position.set(0, 0.55, 1.9);
  const bumperRear = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.35, 0.35), bodyBlack);
  bumperRear.position.set(0, 0.55, -1.9);
  group.add(chassis, cabin, bumperFront, bumperRear);

  const wheelVisuals: THREE.Group[] = [];
  WHEEL_OFFSETS.forEach(([x, y, z]) => {
    const wg = new THREE.Group();
    wg.add(createWheelVisual());
    wg.position.set(x, y, z);
    group.add(wg);
    wheelVisuals.push(wg);
  });

  const springMeshes: THREE.Mesh[] = [];
  const springX = [-0.7, 0.7, -0.7, 0.7];
  const springZ = [1.12, 1.12, -1.16, -1.16];
  for (let i = 0; i < 4; i++) {
    const spring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 1, 8),
      new THREE.MeshStandardMaterial({ color: 0xcccc44, roughness: 0.5, metalness: 0.8 }),
    );
    spring.position.set(springX[i], 0.25, springZ[i]);
    group.add(spring);
    springMeshes.push(spring);
  }

  const axles: THREE.Mesh[] = [];
  for (const zPos of [1.12, -1.16]) {
    const axle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2.36, 8),
      new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.9 }),
    );
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, 0.25, zPos);
    group.add(axle);
    axles.push(axle);
  }

  scene.add(group);

  const tuning = {
    springStiffness: 35000,
    springDamping: 7000,
    enginePower: 15000,
    brakeForce: 22000,
    maxSteer: 0.55,
    tireGrip: 3.6,
    awd: true,
    pacejkaB: 10,
    pacejkaC: 1.9,
    pacejkaE: 0.97,
    gear: 1,
    wheelRadius: 0.42,
  };

  const yaw = Math.atan2(tangent.x, tangent.z);
  const bodyDesc = physics.RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(start.x, start.y + 1.5, start.z)
    .setCanSleep(false);
  bodyDesc.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
  const chassisBody = physics.world.createRigidBody(bodyDesc);
  physics.world.createCollider(
    physics.RAPIER.ColliderDesc.cuboid(1.1, 0.55, 1.75).setDensity(1200 / (4.4 * 2.2 * 3.5)),
    chassisBody,
  );
  chassisBody.setAdditionalMassProperties(
    1200,
    { x: 0, y: -0.15, z: -0.20 },
    { x: 2400, y: 6800, z: 5400 },
    { x: 0, y: 0, z: 0, w: 1 },
    true,
  );

  const springLength = [SPRING_REST, SPRING_REST, SPRING_REST, SPRING_REST];
  const prevSpringLength = [SPRING_REST, SPRING_REST, SPRING_REST, SPRING_REST];
  let currentGear = 1;
  let gearTimer = 0;
  const wheelRpm: number[] = [0, 0, 0, 0];

  const down = new THREE.Vector3(0, -1, 0);

  function computeAckermann(steerInput: number): [number, number] {
    if (Math.abs(steerInput) < 0.001) return [0, 0];
    const wheelBase = 2.28;
    const trackW = 2.36;
    const turnRadius = wheelBase / Math.tan(Math.abs(steerInput));
    const inner = Math.atan(wheelBase / (turnRadius - trackW / 2));
    const outer = Math.atan(wheelBase / (turnRadius + trackW / 2));
    return steerInput > 0 ? [inner, outer] : [outer, inner];
  }

  function update(dt: number, input: InputState): void {
    const pos = chassisBody.translation();
    const rot = chassisBody.rotation();
    const bodyPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    const bodyQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(bodyQuat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(bodyQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(bodyQuat);
    const bodyVel = new THREE.Vector3(
      chassisBody.linvel().x,
      chassisBody.linvel().y,
      chassisBody.linvel().z,
    );
    const bodyAngVel = new THREE.Vector3(
      chassisBody.angvel().x,
      chassisBody.angvel().y,
      chassisBody.angvel().z,
    );

    const throttle = input.throttle;
    const brake = input.reverse ? 1 : 0;
    const steerInput = input.steer * tuning.maxSteer;

    const [ackL, ackR] = computeAckermann(steerInput);
    const steerAngles = [ackL, ackR, 0, 0];

    const speedFwd = forward.dot(bodyVel);

    // Gear shift
    const avgRpm = wheelRpm.reduce((a, b) => a + b, 0) / 4;
    gearTimer -= dt;
    if (gearTimer <= 0) {
      if (throttle > KICKDOWN_THRESHOLD && avgRpm > SHIFT_UP_RPM * 0.8 && currentGear > 1) {
        currentGear--;
        gearTimer = 0.4;
      } else if (avgRpm > SHIFT_UP_RPM && currentGear < 5) {
        currentGear++;
        gearTimer = 0.5;
      } else if (avgRpm < SHIFT_DOWN_RPM && currentGear > 1) {
        currentGear--;
        gearTimer = 0.4;
      }
    }
    if (currentGear < 1) currentGear = 1;
    tuning.gear = currentGear;

    // Process each wheel
    const grounded = [false, false, false, false];
    const contactPts: THREE.Vector3[] = [];
    const surfaceTypes: SurfaceType[] = [];

    for (let i = 0; i < 4; i++) {
      const [lx, ly, lz] = WHEEL_OFFSETS[i];
      const localOffset = new THREE.Vector3(lx, ly, lz);
      const worldOffset = localOffset.clone().applyQuaternion(bodyQuat);
      const wheelPos = bodyPos.clone().add(worldOffset);

      const rayOrigin = new THREE.Vector3(wheelPos.x, wheelPos.y + 0.3, wheelPos.z);
      const ray = new physics.RAPIER.Ray(
        { x: rayOrigin.x, y: rayOrigin.y, z: rayOrigin.z },
        { x: 0, y: -1, z: 0 },
      );
      const hit = physics.world.castRay(ray, 2.0, true);

      let surfaceType = SurfaceType.ASPHALT;
      let contactPt = new THREE.Vector3(wheelPos.x, wheelPos.y - SPRING_REST - tuning.wheelRadius, wheelPos.z);

      if (hit !== null) {
        const toi = hit.timeOfImpact;
        contactPt = new THREE.Vector3(
          rayOrigin.x,
          rayOrigin.y - toi,
          rayOrigin.z,
        );
        surfaceType = SurfaceType.ASPHALT;
      }

      const dist = wheelPos.y - contactPt.y;
      springLength[i] = THREE.MathUtils.clamp(dist, MIN_COMP, MAX_EXT);
      const compressionVel = (springLength[i] - prevSpringLength[i]) / Math.max(dt, 0.001);
      prevSpringLength[i] = springLength[i];

      const compression = SPRING_REST - springLength[i];
      if (compression > 0) {
        grounded[i] = true;
        const normalForce = tuning.springStiffness * compression;
        const dampForce = THREE.MathUtils.clamp(
          -tuning.springDamping * compressionVel,
          -tuning.springStiffness * 0.4,
          tuning.springStiffness * 0.4,
        );
        const totalVertical = Math.max(0, normalForce + dampForce);
        const force = { x: 0, y: totalVertical, z: 0 };
        chassisBody.addForceAtPoint(force, { x: contactPt.x, y: contactPt.y, z: contactPt.z }, true);
      }

      contactPts.push(contactPt);
      surfaceTypes.push(surfaceType);
    }

    // Engine + brake + lateral forces on grounded wheels
    for (let i = 0; i < 4; i++) {
      if (!grounded[i]) continue;

      const surface = SURFACES[surfaceTypes[i]];
      const contactPt = contactPts[i];
      const r = contactPt.clone().sub(bodyPos);

      // Engine
      const isDriven = tuning.awd || i < 2;
      if (isDriven && throttle > 0) {
        const w = bodyAngVel.clone().cross(r);
        const contactVel = bodyVel.clone().add(w);
        const wheelFwdSpeed = forward.dot(contactVel);
        const rpm = (Math.abs(wheelFwdSpeed) * 60) / (2 * Math.PI * tuning.wheelRadius);
        wheelRpm[i] = rpm;
        const torque = interpolateTorque(rpm) * GEAR_RATIOS[currentGear] * FINAL_DRIVE * throttle;
        const engineForce = forward.clone().multiplyScalar(torque / tuning.wheelRadius);
        chassisBody.addForceAtPoint(
          { x: engineForce.x, y: engineForce.y, z: engineForce.z },
          { x: contactPt.x, y: contactPt.y, z: contactPt.z },
          true,
        );
      }

      // Brake
      if (brake > 0) {
        const brakeF = -Math.sign(speedFwd) * tuning.brakeForce * brake;
        chassisBody.addForceAtPoint(
          { x: forward.x * brakeF, y: forward.y * brakeF, z: forward.z * brakeF },
          { x: contactPt.x, y: contactPt.y, z: contactPt.z },
          true,
        );
      }

      // Steer angle for front wheels
      const wheelForward = i < 2
        ? forward.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(up, steerAngles[i]))
        : forward.clone();

      const wheelLat = new THREE.Vector3(-wheelForward.z, 0, wheelForward.x).normalize();
      const angVelContribution = bodyAngVel.clone().cross(r);
      const wheelVel = bodyVel.clone().add(angVelContribution);
      const lateralVel = wheelLat.dot(wheelVel);
      const longVel = wheelForward.dot(wheelVel);
      const slipAngle = Math.abs(longVel) > 0.001 ? Math.atan2(lateralVel, Math.abs(longVel)) : 0;
      const normalForce = tuning.springStiffness * Math.max(0, SPRING_REST - springLength[i]) * 0.5 + 1500;
      const pacejkaForce = pacejka(
        slipAngle,
        tuning.pacejkaB,
        tuning.pacejkaC,
        surface.mu,
        tuning.pacejkaE,
      ) * normalForce;
      const lateralForce = wheelLat.clone().multiplyScalar(-Math.sign(lateralVel) * pacejkaForce);
      chassisBody.addForceAtPoint(
        { x: lateralForce.x, y: lateralForce.y, z: lateralForce.z },
        { x: contactPt.x, y: contactPt.y, z: contactPt.z },
        true,
      );

      // Rolling resistance
      const rrForce = -surface.rollingResistance * normalForce * Math.sign(speedFwd);
      chassisBody.addForceAtPoint(
        { x: forward.x * rrForce, y: forward.y * rrForce, z: forward.z * rrForce },
        { x: contactPt.x, y: contactPt.y, z: contactPt.z },
        true,
      );
    }
  }

  function sync(): void {
    const p = chassisBody.translation();
    const q = chassisBody.rotation();
    group.position.set(p.x, p.y, p.z);
    group.quaternion.set(q.x, q.y, q.z, q.w);

    const bodyPos = group.position.clone();
    const bodyQuat = group.quaternion.clone();

    for (let i = 0; i < 4; i++) {
      const [lx, ly, lz] = WHEEL_OFFSETS[i];
      const wg = wheelVisuals[i];

      const localOffset = new THREE.Vector3(lx, ly - springLength[i] + tuning.wheelRadius * 0.3, lz);
      wg.position.copy(localOffset);

      const speed = chassisBody.linvel();
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bodyQuat);
      const fwdSpeed = fwd.dot(new THREE.Vector3(speed.x, speed.y, speed.z));
      wg.children[0].rotation.x += fwdSpeed * 0.016 / tuning.wheelRadius;

      if (i < 2) {
        const [ackL, ackR] = computeAckermann(0);
        const steer = i === 0 ? 0 : 0;
        wg.rotation.y = 0;
      }

      const s = springMeshes[i];
      const sx = springX[i];
      const sz = springZ[i];
      s.position.set(sx, ly - springLength[i] * 0.5, sz);
      s.scale.y = springLength[i];
    }

    const frontAxleY = (wheelVisuals[0].position.y + wheelVisuals[1].position.y) * 0.5;
    const rearAxleY = (wheelVisuals[2].position.y + wheelVisuals[3].position.y) * 0.5;
    axles[0].position.y = frontAxleY;
    axles[1].position.y = rearAxleY;
  }

  function addGui(gui: any): void {
    const f = gui.addFolder('Panda tuning');
    f.add(tuning, 'springStiffness', 15000, 120000, 5000).name('molle');
    f.add(tuning, 'springDamping', 3000, 25000, 500).name('ammortizz');
    f.add(tuning, 'enginePower', 5000, 40000, 1000).name('potenza');
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
