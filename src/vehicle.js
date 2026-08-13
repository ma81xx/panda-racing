import * as THREE from 'three';
import { syncMeshToBody } from './physics.js';

export function createVehicle(scene, physics, start, tangent, gltfScene, colliders = {}) {
  const group = new THREE.Group();
  const chassis = new THREE.Group();

  const model = gltfScene.clone(true);

  model.updateMatrixWorld();
  const junk = [];
  model.traverse((node) => {
    if (!node.isMesh) return;
    const bb = new THREE.Box3().setFromObject(node);
    const sz = new THREE.Vector3();
    bb.getSize(sz);
    if ((sz.x > 8 || sz.z > 8) && Math.min(sz.x, sz.y, sz.z) < 0.005) {
      junk.push(node);
    }
  });
  junk.forEach((n) => { if (n.parent) n.parent.remove(n); });

  const bbox = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const targetWidth = 2.2;
  const scale = targetWidth / size.x;
  model.scale.setScalar(scale);
  model.position.y = -(bbox.min.y + bbox.max.y) / 2;

  chassis.add(model);
  group.add(chassis);
  group.updateMatrixWorld();

  const wheelData = [];

  const wheelNodes = [];
  model.traverse((node) => {
    if (node.name === 'Circle_7' || node.name === 'Circle.001_9') {
      wheelNodes.push(node);
    }
  });

  wheelNodes.forEach((node) => {
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    node.getWorldPosition(worldPos);
    node.getWorldQuaternion(worldQuat);

    const meshBbox = new THREE.Box3();
    node.traverse((child) => { if (child.isMesh) meshBbox.expandByObject(child); });
    const meshCenter = new THREE.Vector3();
    meshBbox.getCenter(meshCenter);

    const pivot = new THREE.Group();
    pivot.position.copy(meshCenter);

    const orientation = new THREE.Group();
    orientation.quaternion.copy(worldQuat);
    pivot.add(orientation);

    const spinner = new THREE.Group();
    orientation.add(spinner);

    while (node.children.length > 0) {
      spinner.attach(node.children[0]);
    }

    node.removeFromParent();
    group.add(pivot);

    wheelData.push({ pivot, spinner, baseY: pivot.position.y });
  });

  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  scene.add(group);

  const wheelPositions = [
    [-1.18, 0.25, 1.12], [1.18, 0.25, 1.12],
    [-1.18, 0.25, -1.16], [1.18, 0.25, -1.16]
  ];

  const bodyDesc = physics.RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(start.x, start.y + 0.55, start.z)
    .setCanSleep(false)
    .setCcdEnabled(true)
    .setLinearDamping(0.15)
    .setAngularDamping(0.4);
  const yaw = Math.atan2(tangent.x, tangent.z);
  bodyDesc.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
  const body = physics.world.createRigidBody(bodyDesc);
  const bodyCollider = physics.world.createCollider(physics.RAPIER.ColliderDesc.cuboid(1.1, 0.55, 1.75).setDensity(100), body);

  const controller = physics.world.createVehicleController(body);
  controller.indexUpAxis = 1;
  controller.setIndexForwardAxis = 2;
  const tuning = {
    suspensionRestLength: 0.48,
    suspensionStiffness: 24,
    maxSuspensionTravel: 0.42,
    dampingCompression: 6,
    dampingRelaxation: 8,
    frictionSlip: 1.45,
    wheelRadius: 0.42,
    frontGrip: 1.35,
    rearGrip: 1.15,
    offRoadGrip: 0.5,
    maxSteer: 0.55,
    brakeForce: 28,
    handbrakeForce: 55,
    maxTorque: 160,
    idleRPM: 900,
    redlineRPM: 7200,
    upshiftRPM: 6800,
    downshiftRPM: 2600,
    finalDrive: 4.0
  };

  const GEAR_RATIOS = [6.0, 4.0, 2.9, 2.2, 1.75];
  const REVERSE_RATIO = 6.0;
  const SHIFT_COOLDOWN = 0.3;
  const CLUTCH_TIME = 0.15;

  let currentGear = 0;
  let currentRpm = tuning.idleRPM;
  let shiftCooldown = 0;
  let clutchTimer = 0;
  let shifting = false;

  function ratioForGear(g) {
    if (g > 0) return GEAR_RATIOS[g - 1];
    if (g < 0) return REVERSE_RATIO;
    return 0;
  }

  function torqueFactor(rpm) {
    const idle = tuning.idleRPM;
    const red = tuning.redlineRPM;
    if (rpm < idle) return 0;
    if (rpm < 2500) {
      const t = Math.min(Math.max((rpm - idle) / (2500 - idle), 0), 1);
      return 0.55 + 0.45 * t;
    }
    if (rpm < 5500) return 1;
    const t = Math.min(Math.max((rpm - 5500) / (red - 5500), 0), 1);
    return Math.max(0.7, 1 - t * 0.3);
  }

  function rpmForSpeed(speed, g) {
    const r = ratioForGear(g);
    if (r <= 0) return tuning.idleRPM;
    const wheelRpm = (speed / (2 * Math.PI * tuning.wheelRadius)) * r * tuning.finalDrive * 60;
    return Math.max(tuning.idleRPM, Math.min(tuning.redlineRPM, wheelRpm));
  }

  function engageGear(g) {
    currentGear = g;
    shiftCooldown = SHIFT_COOLDOWN;
    clutchTimer = CLUTCH_TIME;
  }

  function updateGearbox(input, dt, forwardSpeed) {
    shiftCooldown = Math.max(0, shiftCooldown - dt);
    if (clutchTimer > 0) {
      clutchTimer -= dt;
      shifting = true;
    } else {
      shifting = false;
    }

    const absSpeed = Math.abs(forwardSpeed);
    const stopped = absSpeed < 0.8;

    if (input.reverse && stopped) {
      if (currentGear !== -1 && shiftCooldown <= 0) engageGear(-1);
    } else if (input.throttle) {
      if (currentGear < 1 && shiftCooldown <= 0) {
        engageGear(1);
      } else if (currentGear >= 1 && !shifting && shiftCooldown <= 0) {
        if (currentRpm >= tuning.upshiftRPM && currentGear < GEAR_RATIOS.length) {
          engageGear(currentGear + 1);
        } else if (currentRpm <= tuning.downshiftRPM && currentGear > 1) {
          engageGear(currentGear - 1);
        }
      }
    } else if (stopped) {
      if (currentGear !== 0 && shiftCooldown <= 0) engageGear(0);
    }

    if (currentGear === 0) {
      const targetRpm = tuning.idleRPM + (input.throttle ? 2500 : 0);
      currentRpm += (targetRpm - currentRpm) * Math.min(dt * 8, 1);
    } else if (shifting) {
      const targetRpm = rpmForSpeed(absSpeed, currentGear);
      currentRpm += (targetRpm - currentRpm) * Math.min(dt * 12, 1);
    } else {
      currentRpm = rpmForSpeed(absSpeed, currentGear);
    }
  }

  function engineForce(input) {
    if (shifting) return 0;
    const ratio = ratioForGear(currentGear);
    if (ratio <= 0) return 0;
    const reversing = currentGear < 0;
    const engaged = reversing ? input.reverse : input.throttle;
    if (!engaged) return 0;
    if (currentRpm >= tuning.redlineRPM) return 0;
    const wheelForce = tuning.maxTorque * torqueFactor(currentRpm) * ratio * tuning.finalDrive / tuning.wheelRadius;
    return reversing ? -wheelForce : wheelForce;
  }

  function resetGearbox() {
    currentGear = 0;
    currentRpm = tuning.idleRPM;
    shiftCooldown = 0;
    clutchTimer = 0;
    shifting = false;
  }

  const down = { x: 0, y: -1, z: 0 };
  const axle = { x: -1, y: 0, z: 0 };
  wheelPositions.forEach(([x, y, z]) => controller.addWheel({ x, y, z }, down, axle, tuning.suspensionRestLength, tuning.wheelRadius));

  let lastTuningKey = '';
  const appliedSurface = ['road', 'road', 'road', 'road'];

  function slipForSurface(i, surface) {
    const base = tuning.frictionSlip * (i < 2 ? tuning.frontGrip : tuning.rearGrip);
    return surface === 'dirt' ? base * tuning.offRoadGrip : base;
  }

  function applyGrip(i) {
    controller.setWheelFrictionSlip(i, slipForSurface(i, appliedSurface[i]));
  }

  function syncTuning() {
    const key = [
      tuning.suspensionRestLength, tuning.suspensionStiffness, tuning.maxSuspensionTravel,
      tuning.dampingCompression, tuning.dampingRelaxation, tuning.frictionSlip,
      tuning.wheelRadius, tuning.frontGrip, tuning.rearGrip, tuning.offRoadGrip
    ].join(',');
    if (key === lastTuningKey) return;
    lastTuningKey = key;
    for (let i = 0; i < 4; i++) {
      controller.setWheelSuspensionRestLength(i, tuning.suspensionRestLength);
      controller.setWheelSuspensionStiffness(i, tuning.suspensionStiffness);
      controller.setWheelMaxSuspensionTravel(i, tuning.maxSuspensionTravel);
      controller.setWheelSuspensionCompression(i, tuning.dampingCompression);
      controller.setWheelSuspensionRelaxation(i, tuning.dampingRelaxation);
      controller.setWheelRadius(i, tuning.wheelRadius);
      applyGrip(i);
    }
  }
  syncTuning();

  let currentSteer = 0;
  let wheelSpin = 0;

  const state = {
    speed: 0,
    slipAmount: 0,
    slips: [0, 0, 0, 0],
    skids: [false, false, false, false],
    contactPoints: [null, null, null, null],
    surfaces: ['road', 'road', 'road', 'road'],
    compressions: [0, 0, 0, 0],
    offRoad: false,
    flipped: false,
    gear: 0,
    rpm: 900,
    redline: 7200,
    shifting: false
  };

  const quat = new THREE.Quaternion();
  const fwdVec = new THREE.Vector3();
  const latVec = new THREE.Vector3();
  const linVec = new THREE.Vector3();

  function readState(input) {
    const lin = body.linvel();
    const q = body.rotation();
    state.speed = Math.abs(controller.currentVehicleSpeed());

    quat.set(q.x, q.y, q.z, q.w);
    linVec.set(lin.x, lin.y, lin.z);
    fwdVec.set(0, 0, 1).applyQuaternion(quat);
    latVec.set(1, 0, 0).applyQuaternion(quat);
    const lateralSlip = Math.abs(latVec.dot(linVec));
    state.slipAmount = Math.min(lateralSlip / 6, 1);

    let offRoad = false;
    for (let i = 0; i < 4; i++) {
      const suspLen = controller.wheelSuspensionLength(i);
      const compression = suspLen == null ? 0 : tuning.suspensionRestLength - suspLen;
      state.compressions[i] = THREE.MathUtils.clamp(compression, -0.3, 0.3);

      const contact = controller.wheelContactPoint(i);
      state.contactPoints[i] = contact ? new THREE.Vector3(contact.x, contact.y, contact.z) : null;

      const ground = controller.wheelGroundObject(i);
      let surface = 'road';
      if (ground && colliders.terrain && ground.handle === colliders.terrain.handle) {
        surface = 'dirt';
        offRoad = true;
      }
      state.surfaces[i] = surface;

      if (surface !== appliedSurface[i]) {
        appliedSurface[i] = surface;
        applyGrip(i);
      }

      const inContact = state.contactPoints[i] !== null;
      const handbrakeActive = input.handbrake && i >= 2;
      const hardBrake = input.braking && !input.throttle && state.speed > 3;
      const lateral = lateralSlip > 2.2;
      state.skids[i] = inContact && state.speed > 1.5 && (lateral || handbrakeActive || hardBrake);
      state.slips[i] = state.slipAmount;
    }
    state.offRoad = offRoad;

    state.gear = currentGear;
    state.rpm = currentRpm;
    state.redline = tuning.redlineRPM;
    state.shifting = shifting;

    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    state.flipped = upY < 0.1;
  }

  function update(input, dt) {
    syncTuning();
    const lin = body.linvel();
    const rot = body.rotation();
    const fwdX = 2 * (rot.x * rot.z + rot.w * rot.y);
    const fwdY = 2 * (rot.y * rot.z - rot.w * rot.x);
    const fwdZ = 1 - 2 * (rot.x * rot.x + rot.y * rot.y);
    const forwardSpeed = lin.x * fwdX + lin.y * fwdY + lin.z * fwdZ;
    updateGearbox(input, dt, forwardSpeed);

    const engine = engineForce(input);
    const targetSteer = input.steer * tuning.maxSteer;
    const steerSpeed = 12;
    currentSteer += (targetSteer - currentSteer) * Math.min(dt * steerSpeed, 1);
    const brake = input.braking && !input.throttle && currentGear >= 0 ? tuning.brakeForce : 0;
    for (let i = 0; i < 4; i++) {
      controller.setWheelEngineForce(i, i < 2 ? engine : engine * 0.25);
      controller.setWheelBrake(i, input.handbrake && i >= 2 ? tuning.handbrakeForce : brake);
      controller.setWheelSteering(i, i < 2 ? currentSteer : 0);
    }
    controller.updateVehicle(dt);
    readState(input);
  }

  const chassisTilt = { x: 0, z: 0 };

  function sync() {
    syncMeshToBody(group, body);

    const c = state.compressions;
    const front = (c[0] + c[1]) / 2;
    const rear = (c[2] + c[3]) / 2;
    const rightSide = c[0] + c[2];
    const leftSide = c[1] + c[3];
    const targetX = THREE.MathUtils.clamp((front - rear) * 0.9, -0.22, 0.22);
    const targetZ = THREE.MathUtils.clamp((rightSide - leftSide) * 0.55, -0.22, 0.22);
    chassisTilt.x += (targetX - chassisTilt.x) * 0.22;
    chassisTilt.z += (targetZ - chassisTilt.z) * 0.22;
    chassis.rotation.x = chassisTilt.x;
    chassis.rotation.z = chassisTilt.z;

    wheelData.forEach((wd, i) => {
      wd.pivot.position.y = wd.baseY + state.compressions[i];
      wd.pivot.rotation.y = i < 2 ? currentSteer : 0;
      const rot = controller.wheelRotation(i);
      if (rot != null) {
        wheelSpin = rot;
      } else {
        wheelSpin += (state.speed * 0.016) / tuning.wheelRadius;
      }
      wd.spinner.rotation.y = wheelSpin;
    });
  }

  function addGui(gui) {
    const f = gui.addFolder('Panda tuning');
    f.add(tuning, 'suspensionRestLength', 0.15, 1.1, 0.01);
    f.add(tuning, 'suspensionStiffness', 5, 80, 0.5);
    f.add(tuning, 'maxSuspensionTravel', 0.05, 1, 0.01);
    f.add(tuning, 'dampingCompression', 0.5, 10, 0.1);
    f.add(tuning, 'dampingRelaxation', 0.5, 12, 0.1);
    f.add(tuning, 'frictionSlip', 0.2, 4, 0.01);
    f.add(tuning, 'wheelRadius', 0.25, 0.75, 0.01);
    f.add(tuning, 'frontGrip', 0.2, 3, 0.01);
    f.add(tuning, 'rearGrip', 0.2, 3, 0.01);
    f.add(tuning, 'offRoadGrip', 0.05, 1.2, 0.01).name('grip erba/fango');
    f.add(tuning, 'maxSteer', 0.1, 1.1, 0.01).name('sterzata');
    f.add(tuning, 'brakeForce', 0, 90, 1).name('freno');
    f.add(tuning, 'handbrakeForce', 0, 120, 1).name('freno a mano');

    const g = f.addFolder('Cambio');
    g.add(tuning, 'maxTorque', 40, 400, 5).name('coppia motore (Nm)');
    g.add(tuning, 'finalDrive', 2, 8, 0.1).name('rapporto finale');
    g.add(tuning, 'idleRPM', 400, 2000, 50).name('minimo RPM');
    g.add(tuning, 'redlineRPM', 4000, 10000, 100).name('limitatore RPM');
    g.add(tuning, 'upshiftRPM', 3000, 10000, 100).name('cambio su RPM');
    g.add(tuning, 'downshiftRPM', 1000, 5000, 100).name('scalata RPM');

    return f;
  }

  return { group, chassis, body, bodyCollider, controller, tuning, state, update, sync, addGui, resetGearbox };
}
