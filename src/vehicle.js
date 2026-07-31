import * as THREE from 'three';
import { syncMeshToBody } from './physics.js';

export function createVehicle(scene, physics, materials, start, tangent) {
  const group = new THREE.Group();
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.05, 3.5), materials.pandaWhite);
  chassis.position.y = 0.75;
  chassis.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.9, 1.7), materials.glass);
  cabin.position.set(0, 1.45, 0.25);
  cabin.castShadow = true;
  const bumperFront = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.35, 0.35), materials.pandaBlack);
  bumperFront.position.set(0, 0.55, 1.9);
  const bumperRear = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.35, 0.35), materials.pandaBlack);
  bumperRear.position.set(0, 0.55, -1.9);
  group.add(chassis, cabin, bumperFront, bumperRear);

  chassis.material = chassis.material.clone();
  chassis.material.transparent = true;
  chassis.material.opacity = 0.3;
  chassis.material.depthWrite = false;
  cabin.material = cabin.material.clone();
  cabin.material.transparent = true;
  cabin.material.opacity = 0.35;
  cabin.material.depthWrite = false;
  bumperFront.material = bumperFront.material.clone();
  bumperFront.material.transparent = true;
  bumperFront.material.opacity = 0.4;
  bumperFront.material.depthWrite = false;
  bumperRear.material = bumperRear.material.clone();
  bumperRear.material.transparent = true;
  bumperRear.material.opacity = 0.4;
  bumperRear.material.depthWrite = false;

  const axleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.36, 8);
  const frontAxle = new THREE.Mesh(axleGeo, materials.pandaBlack);
  frontAxle.rotation.z = Math.PI / 2;
  frontAxle.position.set(0, 0.25, 1.12);
  const rearAxle = new THREE.Mesh(axleGeo, materials.pandaBlack);
  rearAxle.rotation.z = Math.PI / 2;
  rearAxle.position.set(0, 0.25, -1.16);
  group.add(frontAxle, rearAxle);

  const wheelMeshes = [];
  const wheelPositions = [
    [-1.18, 0.25, 1.12], [1.18, 0.25, 1.12],
    [-1.18, 0.25, -1.16], [1.18, 0.25, -1.16]
  ];
  wheelPositions.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.34, 12), materials.wheel);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheelMeshes.push(wheel);
  });
  scene.add(group);

  const bodyDesc = physics.RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(start.x, start.y + 1, start.z)
    .setCanSleep(false);
  const yaw = Math.atan2(tangent.x, tangent.z);
  bodyDesc.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
  const body = physics.world.createRigidBody(bodyDesc);
  physics.world.createCollider(physics.RAPIER.ColliderDesc.cuboid(1.1, 0.55, 1.75).setDensity(420), body);

  const controller = physics.world.createVehicleController(body);
  controller.indexUpAxis = 1;
  controller.setIndexForwardAxis = 2;
  const tuning = {
    suspensionRestLength: 0.48,
    suspensionStiffness: 28,
    maxSuspensionTravel: 0.42,
    dampingCompression: 3.6,
    dampingRelaxation: 4.8,
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

  function applyTuning() {
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
  applyTuning();

  let currentSteer = 0;

  function update(input, dt) {
    applyTuning();
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
  }

  function sync() {
    syncMeshToBody(group, body);
    for (let i = 0; i < 4; i++) {
      const transform = controller.wheelChassisConnectionPointCs(i);
      if (transform) wheelMeshes[i].position.set(transform.x, transform.y, transform.z);
      wheelMeshes[i].scale.setScalar(tuning.wheelRadius / 0.42);
      if (i < 2) wheelMeshes[i].rotation.y = currentSteer;
    }
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
