import * as THREE from 'three';
import { syncMeshToBody } from './physics.js';

const baseColors = new WeakMap();

export function createVehicle(scene, physics, start, tangent, gltfScene, colliders = {}, environment = null) {
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
    if (node.name === 'Circle_7' || node.name === 'Circle001_9' || node.name === 'Circle.001_9') {
      wheelNodes.push(node);
    }
  });

  const tmpPos = new THREE.Vector3();
  const tmpNrm = new THREE.Vector3();
  const normalMat = new THREE.Matrix3();

  for (const node of wheelNodes) {
    const meshes = [];
    node.traverse((child) => { if (child.isMesh) meshes.push(child); });

    const sides = [0, 1].map(() => ({
      min: new THREE.Vector3(Infinity, Infinity, Infinity),
      max: new THREE.Vector3(-Infinity, -Infinity, -Infinity),
      meshes: []
    }));

    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      normalMat.getNormalMatrix(mesh.matrixWorld);
      const geometry = mesh.geometry;
      const posAttr = geometry.getAttribute('position');
      const nrmAttr = geometry.getAttribute('normal');
      const uvAttr = geometry.getAttribute('uv');
      const index = geometry.getIndex();
      const triangleCount = index ? index.count / 3 : posAttr.count / 3;
      const buffers = [0, 1].map(() => ({ positions: [], normals: [], uvs: [] }));

      for (let t = 0; t < triangleCount; t++) {
        const ia = index ? index.getX(t * 3) : t * 3;
        const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
        tmpPos.fromBufferAttribute(posAttr, ia).applyMatrix4(mesh.matrixWorld);
        let cx = tmpPos.x;
        tmpPos.fromBufferAttribute(posAttr, ib).applyMatrix4(mesh.matrixWorld);
        cx += tmpPos.x;
        tmpPos.fromBufferAttribute(posAttr, ic).applyMatrix4(mesh.matrixWorld);
        cx += tmpPos.x;
        const target = buffers[cx < 0 ? 0 : 1];
        for (const idx of [ia, ib, ic]) {
          tmpPos.fromBufferAttribute(posAttr, idx).applyMatrix4(mesh.matrixWorld);
          target.positions.push(tmpPos.x, tmpPos.y, tmpPos.z);
          if (nrmAttr) {
            tmpNrm.fromBufferAttribute(nrmAttr, idx).applyMatrix3(normalMat).normalize();
            target.normals.push(tmpNrm.x, tmpNrm.y, tmpNrm.z);
          }
          if (uvAttr) target.uvs.push(uvAttr.getX(idx), uvAttr.getY(idx));
        }
      }

      for (let s = 0; s < 2; s++) {
        const data = buffers[s];
        if (!data.positions.length) continue;
        const side = sides[s];
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
        if (data.normals.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
        else geo.computeVertexNormals();
        if (data.uvs.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
        const splitMesh = new THREE.Mesh(geo, mesh.material);
        splitMesh.castShadow = true;
        splitMesh.receiveShadow = true;
        side.meshes.push(splitMesh);
        for (let k = 0; k < data.positions.length; k += 3) {
          tmpPos.set(data.positions[k], data.positions[k + 1], data.positions[k + 2]);
          side.min.min(tmpPos);
          side.max.max(tmpPos);
        }
      }
    }

    node.removeFromParent();

    for (const side of sides) {
      if (!side.meshes.length) continue;
      const center = new THREE.Vector3().addVectors(side.min, side.max).multiplyScalar(0.5);
      const radius = (side.max.y - side.min.y) * 0.5;
      const pivot = new THREE.Group();
      pivot.position.copy(center);
      const spinner = new THREE.Group();
      pivot.add(spinner);
      for (const splitMesh of side.meshes) {
        splitMesh.position.copy(center).negate();
        spinner.add(splitMesh);
      }
      group.add(pivot);
      wheelData.push({ pivot, spinner, position: center.clone(), radius, baseY: center.y });
    }
  }

  wheelData.sort((a, b) => {
    const af = a.position.z > 0 ? 0 : 1;
    const bf = b.position.z > 0 ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.position.x - b.position.x;
  });

  const wheelRadiusAvg = wheelData.length
    ? wheelData.reduce((sum, wheel) => sum + wheel.radius, 0) / wheelData.length
    : 0.42;

  const tunedMaterials = new Set();
  const chassisMeshes = [];
  chassis.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    chassisMeshes.push(node);
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of list) {
      if (material && material.name === 'Window' && !tunedMaterials.has(material)) {
        tunedMaterials.add(material);
        material.transparent = true;
        material.opacity = 0.8;
        material.depthWrite = false;
        material.color.setHex(0x26343a);
        material.roughness = 0.06;
        material.metalness = 0.1;
        material.needsUpdate = true;
      }
    }
    node.userData.opaqueMaterial = node.material;
  });

  if (environment) {
    const envIntensity = { Carpaint: 0.18, Metal: 0.18, Plastic: 0.2, Tyre: 0.15, Window: 0.08 };
    group.traverse((node) => {
      if (!node.isMesh) return;
      const list = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of list) {
        if (!material || !('envMap' in material)) continue;
        material.envMap = environment;
        material.envMapIntensity = envIntensity[material.name] ?? 0.18;
        if (!baseColors.has(material)) baseColors.set(material, material.color.clone());
        const base = baseColors.get(material);
        if (material.name === 'Carpaint') {
          material.color.copy(base).multiplyScalar(0.78);
          material.metalness = 0.3;
          material.roughness = 0.35;
        } else if (material.name === 'Metal') {
          material.color.copy(base).multiplyScalar(0.7);
          material.roughness = 0.3;
        } else if (material.name === 'Window') {
          material.opacity = 0.8;
        }
        material.needsUpdate = true;
      }
    });
  }

  function makeTransparentMaterial(material) {
    const clone = material.clone();
    clone.transparent = true;
    clone.opacity = 0.28;
    clone.depthWrite = false;
    clone.needsUpdate = true;
    return clone;
  }

  function setChassisTransparent(enabled) {
    for (const mesh of chassisMeshes) {
      if (enabled) {
        if (!mesh.userData.transparentMaterial) {
          const base = mesh.userData.opaqueMaterial;
          mesh.userData.transparentMaterial = Array.isArray(base)
            ? base.map(makeTransparentMaterial)
            : makeTransparentMaterial(base);
        }
        mesh.material = mesh.userData.transparentMaterial;
      } else {
        mesh.material = mesh.userData.opaqueMaterial;
      }
    }
  }

  scene.add(group);

  const bodyDesc = physics.RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(start.x, start.y, start.z)
    .setCanSleep(false)
    .setCcdEnabled(true);
  const yaw = Math.atan2(tangent.x, tangent.z);
  bodyDesc.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
  const body = physics.world.createRigidBody(bodyDesc);
  const bodyCollider = physics.world.createCollider(
    physics.RAPIER.ColliderDesc.cuboid(1.1, 0.4, 2.0).setDensity(120).setTranslation(0, 0.08, 0),
    body
  );

  const controller = physics.world.createVehicleController(body);
  controller.indexUpAxis = 1;
  controller.setIndexForwardAxis = 2;
  const tuning = {
    suspensionRestLength: 0.48,
    suspensionStiffness: 24,
    maxSuspensionTravel: 0.42,
    dampingCompression: 6,
    dampingRelaxation: 8,
    frictionSlip: 0.95,
    wheelRadius: wheelRadiusAvg,
    frontGrip: 1.0,
    rearGrip: 0.95,
    offRoadGrip: 0.63,
    maxSteer: 0.55,
    highSpeedSteer: 0.28,
    steerSpeed: 12,
    steerReturn: 20,
    reverseHold: 0.35,
    throttleRampUp: 0.15,
    throttleRampDown: 0.05,
    brakeForce: 16,
    handbrakeForce: 16,
    maxTorque: 85,
    idleRPM: 900,
    redlineRPM: 7200,
    upshiftRPM: 6800,
    downshiftRPM: 2600,
    finalDrive: 4.0,
    engineBrakeTorque: 20,
    rollingResistance: 0.015,
    dirtRollingResistance: 0.06,
    aeroDrag: 0.6
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
  let reverseHoldTimer = 0;
  let throttleRamp = 0;
  let reverseRamp = 0;

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
    if (g < 0) reverseRamp = 0;
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
    const throttleDown = input.throttle > 0.1;
    const brakeDown = input.reverse > 0.1;

    if (brakeDown && stopped) reverseHoldTimer += dt;
    else reverseHoldTimer = 0;

    if (throttleDown) {
      if (currentGear < 1 && shiftCooldown <= 0) {
        engageGear(1);
      } else if (currentGear >= 1 && !shifting && shiftCooldown <= 0) {
        if (currentRpm >= tuning.upshiftRPM && currentGear < GEAR_RATIOS.length) {
          engageGear(currentGear + 1);
        } else if (currentRpm <= tuning.downshiftRPM && currentGear > 1) {
          engageGear(currentGear - 1);
        }
      }
    } else if (brakeDown && stopped) {
      if (reverseHoldTimer >= tuning.reverseHold && currentGear !== -1 && shiftCooldown <= 0) {
        engageGear(-1);
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

  function engineForce(throttleAmount, reverseAmount) {
    if (shifting) return 0;
    const ratio = ratioForGear(currentGear);
    if (ratio <= 0) return 0;
    const reversing = currentGear < 0;
    const amount = reversing ? reverseAmount : throttleAmount;
    if (amount <= 0.01) return 0;
    if (currentRpm >= tuning.redlineRPM) return 0;
    const wheelForce = tuning.maxTorque * torqueFactor(currentRpm) * ratio * tuning.finalDrive / tuning.wheelRadius;
    return (reversing ? -wheelForce : wheelForce) * amount;
  }

  function rampToward(current, target, dt, upTime, downTime) {
    const rate = target > current ? 1 / Math.max(upTime, 0.001) : 1 / Math.max(downTime, 0.001);
    const step = rate * dt;
    if (Math.abs(target - current) <= step) return target;
    return current + Math.sign(target - current) * step;
  }

  function resetGearbox() {
    currentGear = 0;
    currentRpm = tuning.idleRPM;
    shiftCooldown = 0;
    clutchTimer = 0;
    shifting = false;
    reverseHoldTimer = 0;
    throttleRamp = 0;
    reverseRamp = 0;
  }

  const down = { x: 0, y: -1, z: 0 };
  const axle = { x: -1, y: 0, z: 0 };
  wheelData.forEach((wheel) => controller.addWheel(
    { x: wheel.position.x, y: wheel.position.y + tuning.suspensionRestLength, z: wheel.position.z },
    down,
    axle,
    tuning.suspensionRestLength,
    tuning.wheelRadius
  ));

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
      const hardBrake = input.braking > 0.1 && input.throttle < 0.05 && state.speed > 3;
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
    throttleRamp = rampToward(throttleRamp, input.throttle, dt, tuning.throttleRampUp, tuning.throttleRampDown);
    reverseRamp = rampToward(reverseRamp, input.reverse, dt, tuning.throttleRampUp, tuning.throttleRampDown);
    updateGearbox(input, dt, forwardSpeed);

    let driveForce = engineForce(throttleRamp, reverseRamp);
    if (throttleRamp < 0.02 && reverseRamp < 0.02 && currentGear !== 0 && !shifting && Math.abs(forwardSpeed) > 0.05) {
      const ratio = ratioForGear(currentGear);
      if (ratio > 0) {
        const brakeTorque = tuning.engineBrakeTorque * torqueFactor(currentRpm) * ratio * tuning.finalDrive / tuning.wheelRadius;
        driveForce = -Math.sign(forwardSpeed) * brakeTorque;
      }
    }

    const speedT = THREE.MathUtils.smoothstep(Math.abs(forwardSpeed), 2, 28);
    const steerLimit = THREE.MathUtils.lerp(tuning.maxSteer, tuning.highSpeedSteer, speedT);
    const targetSteer = input.steer * steerLimit;
    const steerRate = Math.abs(targetSteer) > Math.abs(currentSteer) ? tuning.steerSpeed : tuning.steerReturn;
    currentSteer += (targetSteer - currentSteer) * Math.min(dt * steerRate, 1);

    for (let i = 0; i < 4; i++) {
      const gripScale = appliedSurface[i] === 'dirt' ? tuning.offRoadGrip : 1;
      const braking = input.braking > 0.05 && input.throttle < 0.05 && currentGear >= 0;
      const serviceBrake = braking ? input.braking * tuning.brakeForce * gripScale : 0;
      const handbrake = input.handbrake && i >= 2 ? tuning.handbrakeForce * gripScale : serviceBrake;
      controller.setWheelEngineForce(i, i < 2 ? driveForce * 0.5 : 0);
      controller.setWheelBrake(i, handbrake);
      controller.setWheelSteering(i, i < 2 ? currentSteer : 0);
    }

    const grounded = state.contactPoints.some((point) => point !== null);
    const horizontalSpeed = Math.hypot(lin.x, lin.z);
    if (horizontalSpeed > 0.01) {
      let resistance = tuning.aeroDrag * horizontalSpeed * horizontalSpeed;
      if (grounded) {
        const rolling = state.offRoad ? tuning.dirtRollingResistance : tuning.rollingResistance;
        resistance += rolling * body.mass() * 9.81;
      }
      const impulse = -resistance * dt / horizontalSpeed;
      body.applyImpulse({ x: lin.x * impulse, y: 0, z: lin.z * impulse }, true);
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
      const spin = rot != null ? rot : (state.speed * 0.016) / tuning.wheelRadius;
      wd.spinner.rotation.x = -spin;
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
    f.add(tuning, 'frontGrip', 0.2, 3, 0.01);
    f.add(tuning, 'rearGrip', 0.2, 3, 0.01);
    f.add(tuning, 'offRoadGrip', 0.05, 1.2, 0.01).name('grip erba/fango');
    f.add(tuning, 'maxSteer', 0.1, 1.1, 0.01).name('sterzata (lenta)');
    f.add(tuning, 'highSpeedSteer', 0.05, 0.8, 0.01).name('sterzata (veloce)');
    f.add(tuning, 'steerSpeed', 2, 40, 0.5).name('rapidità sterzo');
    f.add(tuning, 'steerReturn', 2, 60, 0.5).name('rientro sterzo');
    f.add(tuning, 'brakeForce', 0, 90, 1).name('freno');
    f.add(tuning, 'handbrakeForce', 0, 120, 1).name('freno a mano');
    f.add(tuning, 'engineBrakeTorque', 0, 60, 1).name('freno motore');
    f.add(tuning, 'rollingResistance', 0, 0.05, 0.005).name('rotolamento asfalto');
    f.add(tuning, 'dirtRollingResistance', 0, 0.2, 0.005).name('rotolamento terra');
    f.add(tuning, 'aeroDrag', 0, 2, 0.05).name('drag aerodinamico');

    const g = f.addFolder('Cambio');
    g.add(tuning, 'maxTorque', 40, 400, 5).name('coppia motore (Nm)');
    g.add(tuning, 'finalDrive', 2, 8, 0.1).name('rapporto finale');
    g.add(tuning, 'idleRPM', 400, 2000, 50).name('minimo RPM');
    g.add(tuning, 'redlineRPM', 4000, 10000, 100).name('limitatore RPM');
    g.add(tuning, 'upshiftRPM', 3000, 10000, 100).name('cambio su RPM');
    g.add(tuning, 'downshiftRPM', 1000, 5000, 100).name('scalata RPM');
    g.add(tuning, 'reverseHold', 0, 1.5, 0.05).name('attesa retromarcia');
    g.add(tuning, 'throttleRampUp', 0, 0.6, 0.01).name('gas: salita');
    g.add(tuning, 'throttleRampDown', 0, 0.3, 0.01).name('gas: rilascio');

    return f;
  }

  return { group, chassis, body, bodyCollider, controller, tuning, state, update, sync, addGui, resetGearbox, setChassisTransparent };
}
