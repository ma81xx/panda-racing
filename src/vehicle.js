import * as THREE from 'three';
import { syncMeshToBody } from './physics.js';

export function createVehicle(scene, physics, start, tangent, gltfScene) {
  const group = new THREE.Group();

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

  group.add(model);
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
  physics.world.createCollider(physics.RAPIER.ColliderDesc.cuboid(1.1, 0.55, 1.75).setDensity(100), body);

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
    maxSteer: 0.55,
    brakeForce: 28,
    handbrakeForce: 55,
    engineForce: 8000
  };

  const down = { x: 0, y: -1, z: 0 };
  const axle = { x: -1, y: 0, z: 0 };
  wheelPositions.forEach(([x, y, z]) => controller.addWheel({ x, y, z }, down, axle, tuning.suspensionRestLength, tuning.wheelRadius));

  let lastTuningKey = '';
  function syncTuning() {
    const key = [
      tuning.suspensionRestLength, tuning.suspensionStiffness, tuning.maxSuspensionTravel,
      tuning.dampingCompression, tuning.dampingRelaxation, tuning.frictionSlip,
      tuning.wheelRadius, tuning.frontGrip, tuning.rearGrip
    ].join(',');
    if (key === lastTuningKey) return;
    lastTuningKey = key;
    for (let i = 0; i < 4; i++) {
      controller.setWheelSuspensionRestLength(i, tuning.suspensionRestLength);
      controller.setWheelSuspensionStiffness(i, tuning.suspensionStiffness);
      controller.setWheelMaxSuspensionTravel(i, tuning.maxSuspensionTravel);
      controller.setWheelSuspensionCompression(i, tuning.dampingCompression);
      controller.setWheelSuspensionRelaxation(i, tuning.dampingRelaxation);
      const axleGrip = i < 2 ? tuning.frontGrip : tuning.rearGrip;
      controller.setWheelFrictionSlip(i, tuning.frictionSlip * axleGrip);
      controller.setWheelRadius(i, tuning.wheelRadius);
    }
  }
  syncTuning();

  let currentSteer = 0;
  let wheelSpin = 0;

  function update(input, dt) {
    syncTuning();
    const engine = input.throttle ? tuning.engineForce : input.reverse ? -0.55 * tuning.engineForce : 0;
    const targetSteer = input.steer * tuning.maxSteer;
    const steerSpeed = 12;
    currentSteer += (targetSteer - currentSteer) * Math.min(dt * steerSpeed, 1);
    const brake = input.braking && !input.throttle ? tuning.brakeForce : 0;
    for (let i = 0; i < 4; i++) {
      controller.setWheelEngineForce(i, i < 2 ? engine : engine * 0.25);
      controller.setWheelBrake(i, input.handbrake && i >= 2 ? tuning.handbrakeForce : brake);
      controller.setWheelSteering(i, i < 2 ? currentSteer : 0);
    }
    controller.updateVehicle(dt);

    const vel = body.linvel();
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
    wheelSpin += speed * dt / tuning.wheelRadius;
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
    f.add(tuning, 'maxSteer', 0.1, 1.1, 0.01).name('sterzata');
    f.add(tuning, 'brakeForce', 0, 90, 1).name('freno');
    f.add(tuning, 'handbrakeForce', 0, 120, 1).name('freno a mano');
    return f;
  }

  return { group, body, controller, tuning, update, sync, addGui };
}
