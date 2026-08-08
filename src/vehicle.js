import * as THREE from 'three';
import { syncMeshToBody } from './physics.js';

const SURFACE_GRIP = { dirt: 1, grass: 0.72, rock: 0.9 };

export function createVehicle(scene, physics, start, tangent, gltfScene) {
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);

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

    wheelData.push({ pivot, spinner });
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
    .setLinearDamping(0.3)
    .setAngularDamping(0.4);
  const yaw = Math.atan2(tangent.x, tangent.z);
  bodyDesc.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
  const body = physics.world.createRigidBody(bodyDesc);
  const collider = physics.world.createCollider(physics.RAPIER.ColliderDesc.roundCuboid(1.1, 0.55, 1.75, 0.15).setDensity(100).setTranslation(0, 0.25, 0), body);
  collider.setActiveEvents(physics.RAPIER.ActiveEvents.COLLISION_EVENTS);
  const baseMass = body.mass();
  const baseInertia = body.principalInertia();
  const identityQuat = { x: 0, y: 0, z: 0, w: 1 };

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
    sideFrictionStiffness: 1.15,
    maxSuspensionForce: 26000,
    maxSteer: 0.55,
    brakeForce: 28,
    handbrakeForce: 55,
    engineForce: 8000,
    comY: -0.15,
    comZ: 0.1,
    antiRollK: 10000,
    antiRollDamp: 800,
    loadSensitivity: 0.25
  };

  const down = { x: 0, y: -1, z: 0 };
  const axle = { x: -1, y: 0, z: 0 };
  wheelPositions.forEach(([x, y, z]) => controller.addWheel({ x, y, z }, down, axle, tuning.suspensionRestLength, tuning.wheelRadius));

  let lastTuningKey = '';
  function syncTuning() {
    const key = [
      tuning.suspensionRestLength, tuning.suspensionStiffness, tuning.maxSuspensionTravel,
      tuning.dampingCompression, tuning.dampingRelaxation, tuning.frictionSlip,
      tuning.wheelRadius, tuning.frontGrip, tuning.rearGrip,
      tuning.sideFrictionStiffness, tuning.maxSuspensionForce
    ].join(',');
    if (key === lastTuningKey) return;
    lastTuningKey = key;
    for (let i = 0; i < 4; i++) {
      controller.setWheelSuspensionRestLength(i, tuning.suspensionRestLength);
      controller.setWheelSuspensionStiffness(i, tuning.suspensionStiffness);
      controller.setWheelMaxSuspensionTravel(i, tuning.maxSuspensionTravel);
      controller.setWheelSuspensionCompression(i, tuning.dampingCompression);
      controller.setWheelSuspensionRelaxation(i, tuning.dampingRelaxation);
      controller.setWheelFrictionSlip(i, tuning.frictionSlip * (i < 2 ? tuning.frontGrip : tuning.rearGrip));
      controller.setWheelRadius(i, tuning.wheelRadius);
      controller.setWheelSideFrictionStiffness(i, tuning.sideFrictionStiffness);
      controller.setWheelMaxSuspensionForce(i, tuning.maxSuspensionForce);
    }
  }
  syncTuning();

  let lastComKey = '';
  function applyCom() {
    const key = [tuning.comY, tuning.comZ].join(',');
    if (key === lastComKey) return;
    lastComKey = key;
    body.setAdditionalMassProperties(
      baseMass,
      { x: 0, y: tuning.comY, z: tuning.comZ },
      baseInertia,
      identityQuat,
      true
    );
  }
  applyCom();

  const tmpUp = new THREE.Vector3();
  const tmpFwd = new THREE.Vector3();
  const tmpRight = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpWorldUp = new THREE.Vector3(0, 1, 0);
  let tmpUpDot = 1;

  function applyAntiRoll() {
    const q = body.rotation();
    tmpQuat.set(q.x, q.y, q.z, q.w);
    tmpUp.set(0, 1, 0).applyQuaternion(tmpQuat);
    tmpFwd.set(0, 0, 1).applyQuaternion(tmpQuat);

    const ang = body.angvel();
    const rollRate = ang.x * tmpFwd.x + ang.y * tmpFwd.y + ang.z * tmpFwd.z;
    const damp = -tuning.antiRollDamp * rollRate;
    body.addTorque({ x: tmpFwd.x * damp, y: tmpFwd.y * damp, z: tmpFwd.z * damp }, true);

    if (tmpUp.y < 0.5) return;

    tmpRight.crossVectors(tmpFwd, tmpWorldUp).normalize();
    const rollAngle = Math.asin(Math.max(-1, Math.min(1, tmpUp.dot(tmpRight))));
    const spring = -tuning.antiRollK * rollAngle;
    body.addTorque({ x: tmpFwd.x * spring, y: tmpFwd.y * spring, z: tmpFwd.z * spring }, true);
  }

  let currentSteer = 0;
  let wheelSpin = 0;
  let speed = 0;
  const wheelLoads = [0, 0, 0, 0];

  model.updateMatrixWorld(true);
  const mbox = new THREE.Box3().setFromObject(model);
  const msize = new THREE.Vector3();
  mbox.getSize(msize);
  const halfW = msize.x / 2;
  const rearZ = -msize.z / 2;
  const lightY = mbox.min.y + msize.y * 0.55;
  const brakeMats = [
    new THREE.MeshStandardMaterial({ color: 0x1a0505, emissive: 0xff2200, emissiveIntensity: 0, roughness: 0.4 }),
    new THREE.MeshStandardMaterial({ color: 0x1a0505, emissive: 0xff2200, emissiveIntensity: 0, roughness: 0.4 })
  ];
  const lightGeo = new THREE.BoxGeometry(0.22, 0.09, 0.03);
  const brakeLightMeshes = [
    new THREE.Mesh(lightGeo, brakeMats[0]),
    new THREE.Mesh(lightGeo, brakeMats[1])
  ];
  brakeLightMeshes[0].position.set(-halfW * 0.8, lightY, rearZ - 0.02);
  brakeLightMeshes[1].position.set(halfW * 0.8, lightY, rearZ - 0.02);
  chassis.add(...brakeLightMeshes);
  let brakeGlow = 0;

  function surfaceFor(i) {
    const wheelCollider = controller.wheelGroundObject(i);
    const groundBody = wheelCollider ? wheelCollider.parent() : null;
    return (groundBody && groundBody.userData && groundBody.userData.surface) || 'dirt';
  }

  function update(input, dt) {
    syncTuning();
    applyCom();

    const upQ = body.rotation();
    tmpQuat.set(upQ.x, upQ.y, upQ.z, upQ.w);
    tmpUp.set(0, 1, 0).applyQuaternion(tmpQuat);
    tmpUpDot = tmpUp.y;

    const engine = input.throttle ? tuning.engineForce : input.reverse ? -0.55 * tuning.engineForce : 0;
    const targetSteer = input.steer * tuning.maxSteer;
    const steerSpeed = 12;
    currentSteer += (targetSteer - currentSteer) * Math.min(dt * steerSpeed, 1);
    const brake = input.braking && !input.throttle ? tuning.brakeForce : 0;

    const axleLoads = [0, 0];
    for (let i = 0; i < 4; i++) axleLoads[i >> 1] += wheelLoads[i];
    axleLoads[0] /= 2;
    axleLoads[1] /= 2;

    for (let i = 0; i < 4; i++) {
      let slip = tuning.frictionSlip * (i < 2 ? tuning.frontGrip : tuning.rearGrip);
      if (tuning.loadSensitivity > 0 && tmpUpDot > 0.5 && axleLoads[i >> 1] > 0) {
        const ratio = wheelLoads[i] / axleLoads[i >> 1];
        slip *= 1 - tuning.loadSensitivity * (ratio - 1);
      }
      slip *= SURFACE_GRIP[surfaceFor(i)] ?? 1;
      controller.setWheelFrictionSlip(i, slip);
      controller.setWheelEngineForce(i, i < 2 ? engine : engine * 0.25);
      controller.setWheelBrake(i, input.handbrake && i >= 2 ? tuning.handbrakeForce : brake);
      controller.setWheelSteering(i, i < 2 ? currentSteer : 0);
    }
    controller.updateVehicle(dt);

    for (let i = 0; i < 4; i++) {
      const f = controller.wheelSuspensionForce(i);
      wheelLoads[i] = f === null ? 0 : f;
    }

    applyAntiRoll();

    const vel = body.linvel();
    speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);

    const wr = controller.wheelRotation(0);
    if (wr !== null) wheelSpin = wr;

    const rollLoad = wheelLoads[0] + wheelLoads[2] - (wheelLoads[1] + wheelLoads[3]);
    const pitchLoad = wheelLoads[0] + wheelLoads[1] - (wheelLoads[2] + wheelLoads[3]);
    const targetRoll = Math.max(-0.045, Math.min(0.045, rollLoad * 0.00006));
    const targetPitch = Math.max(-0.04, Math.min(0.04, pitchLoad * 0.00005));
    chassis.rotation.x += (targetPitch - chassis.rotation.x) * Math.min(dt * 10, 1);
    chassis.rotation.z += (targetRoll - chassis.rotation.z) * Math.min(dt * 10, 1);

    const targetBrake = (brake > 0 || input.handbrake) ? 1.2 : 0;
    brakeGlow += (targetBrake - brakeGlow) * Math.min(dt * 8, 1);
    brakeMats.forEach((m) => { m.emissiveIntensity = brakeGlow; });
  }

  function getWheelState() {
    const out = [];
    for (let i = 0; i < 4; i++) {
      const cp = controller.wheelContactPoint(i);
      const cn = controller.wheelContactNormal(i);
      out.push({
        contact: cp ? { x: cp.x, y: cp.y, z: cp.z } : null,
        normal: cn ? { x: cn.x, y: cn.y, z: cn.z } : null,
        isContact: controller.wheelIsInContact(i),
        fwdImp: controller.wheelForwardImpulse(i) || 0,
        sideImp: controller.wheelSideImpulse(i) || 0,
        surface: surfaceFor(i),
        steer: i < 2 ? currentSteer : 0
      });
    }
    return out;
  }

  function wheelForwardWorld(i) {
    const q = body.rotation();
    tmpQuat.set(q.x, q.y, q.z, q.w);
    tmpUp.set(0, 1, 0).applyQuaternion(tmpQuat);
    tmpFwd.set(0, 0, 1).applyQuaternion(tmpQuat);
    if (i < 2 && currentSteer !== 0) {
      tmpFwd.applyAxisAngle(tmpUp, currentSteer);
    }
    return tmpFwd.clone().normalize();
  }

  function sync() {
    syncMeshToBody(group, body);
    wheelData.forEach((wd) => {
      wd.pivot.rotation.y = currentSteer;
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
    f.add(tuning, 'sideFrictionStiffness', 0.2, 3, 0.01).name('grip laterale');
    f.add(tuning, 'maxSuspensionForce', 5000, 80000, 500).name('forza sosp. max');
    f.add(tuning, 'maxSteer', 0.1, 1.1, 0.01).name('sterzata');
    f.add(tuning, 'brakeForce', 0, 90, 1).name('freno');
    f.add(tuning, 'handbrakeForce', 0, 120, 1).name('freno a mano');
    f.add(tuning, 'comY', -0.4, 0.3, 0.01).name('centro massa Y');
    f.add(tuning, 'comZ', -0.3, 0.3, 0.01).name('centro massa Z');
    f.add(tuning, 'antiRollK', 0, 40000, 500).name('rigidità rollio');
    f.add(tuning, 'antiRollDamp', 0, 4000, 50).name('smorzamento rollio');
    f.add(tuning, 'loadSensitivity', 0, 0.8, 0.01).name('grip per carico');
    return f;
  }

  return {
    group,
    chassis,
    body,
    controller,
    collider,
    tuning,
    update,
    sync,
    addGui,
    getWheelState,
    wheelForwardWorld,
    get speed() { return speed; },
    get steerAngle() { return currentSteer; },
    get wheelSpin() { return wheelSpin; }
  };
}
