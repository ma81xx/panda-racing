import * as THREE from 'three';

export function createVehicle(scene, materials, start, tangent) {
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

  const tuning = {
    maxSpeed: 35,
    acceleration: 18,
    brakeForce: 22,
    maxSteer: 0.55,
    airResistance: 0.03,
    groundOffset: 0.72,
    wheelRadius: 0.42,
    reverseAccel: 8
  };

  let yawAngle = Math.atan2(tangent.x, tangent.z);
  let pitchAngle = 0;
  group.position.set(start.x, start.y + 1, start.z);

  let speed = 0;
  let verticalVelocity = 0;
  let pitchVelocity = 0;
  let groundY = group.position.y;
  let wasInAir = false;

  function updateOrientation() {
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAngle);
    const rightAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(qYaw);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(rightAxis, pitchAngle);
    group.quaternion.copy(qPitch.multiply(qYaw));
  }

  function getForward() {
    return new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
  }

  function getRight() {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(group.quaternion);
  }

  function checkGuardrailCollision(guardrailData, dt) {
    if (!guardrailData || guardrailData.length === 0) return;
    const carRadius = 1.8;
    for (const rail of guardrailData) {
      const dx = group.position.x - rail.x;
      const dz = group.position.z - rail.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < carRadius) {
        const nx = dist > 0.001 ? dx / dist : rail.nx;
        const nz = dist > 0.001 ? dz / dist : rail.nz;
        const overlap = carRadius - dist;
        group.position.x += nx * overlap * 0.15;
        group.position.z += nz * overlap * 0.15;
        const forward = getForward();
        const dot = forward.x * nx + forward.z * nz;
        const turnForce = (forward.x * nz - forward.z * nx) * 2;
        yawAngle += turnForce * overlap * 0.4 * dt;
        if (dot > 0) {
          speed *= 0.85;
        } else {
          speed *= 0.92;
        }
        return;
      }
    }
  }

  function update(input, dt, getGroundHeight, guardrailData) {
    let hF = null;
    let hR = null;
    if (getGroundHeight) {
      const forward = getForward();
      const sampleXF = group.position.x + forward.x * 2;
      const sampleZF = group.position.z + forward.z * 2;
      hF = getGroundHeight(sampleXF, sampleZF);
      const sampleXR = group.position.x - forward.x * 2;
      const sampleZR = group.position.z - forward.z * 2;
      hR = getGroundHeight(sampleXR, sampleZR);
      if (hF !== null) groundY = hF;
      if (hF !== null && hR !== null) {
        const slope = Math.atan2(hR - hF, 4);
        pitchAngle += (slope - pitchAngle) * (1 - Math.exp(-dt * 12));
      }
    }

    const throttle = input.throttle;
    const reverse = input.reverse;

    if (throttle) {
      const speedFactor = 1 - Math.abs(speed) / tuning.maxSpeed;
      const accel = tuning.acceleration * Math.max(speedFactor, 0.05);
      speed += accel * dt;
    } else if (reverse) {
      if (speed > 0.1) {
        speed -= tuning.brakeForce * dt;
        if (speed < 0) speed = 0;
      } else {
        const speedFactor = 1 - Math.abs(speed) / (tuning.maxSpeed * 0.4);
        const revAccel = tuning.reverseAccel * Math.max(speedFactor, 0.05);
        speed -= revAccel * dt;
      }
    } else {
      const drag = 1 - tuning.airResistance;
      speed *= Math.pow(drag, dt * 60);
      if (Math.abs(speed) < 0.05) speed = 0;
    }

    speed = THREE.MathUtils.clamp(speed, -tuning.maxSpeed * 0.4, tuning.maxSpeed);

    const steerInput = input.steer * tuning.maxSteer;
    const steerFactor = Math.abs(speed) > 0.5 ? Math.min(Math.abs(speed) / tuning.maxSpeed, 1) : 0;
    yawAngle += steerInput * steerFactor * 3 * dt;

    updateOrientation();

    const forward = getForward();
    group.position.x += forward.x * speed * dt;
    group.position.z += forward.z * speed * dt;

    checkGuardrailCollision(guardrailData, dt);

    const targetY = groundY + tuning.groundOffset;
    const inAir = group.position.y > targetY + 0.15;

    if (!wasInAir && inAir && speed > 2) {
      const rampSlope = hF !== null && hR !== null ? Math.atan2(hR - hF, 4) : 0;
      pitchVelocity = rampSlope * speed * 0.6 + verticalVelocity * 0.2;
    }

    if (inAir) {
      verticalVelocity -= 9.81 * dt;
      group.position.y += verticalVelocity * dt;
      pitchAngle += pitchVelocity * dt;
      if (group.position.y <= targetY) {
        group.position.y = targetY;
        if (verticalVelocity < -5) speed *= 0.8;
        verticalVelocity = 0;
        pitchVelocity *= 0.3;
      }
    } else {
      if (wasInAir) {
        pitchVelocity *= 0.1;
      }
      verticalVelocity = 0;
      if (hF !== null && hR !== null) {
        const slope = Math.atan2(hR - hF, 4);
        pitchAngle += (slope - pitchAngle) * (1 - Math.exp(-dt * 12));
      }
      const alpha = 1 - Math.exp(-dt * 25);
      group.position.y += (targetY - group.position.y) * alpha;
    }
    wasInAir = inAir;

    for (let i = 0; i < 4; i++) {
      wheelMeshes[i].rotation.x += speed * dt / tuning.wheelRadius;
    }
  }

  function sync() {
  }

  function addGui(gui) {
    const f = gui.addFolder('Panda tuning');
    f.add(tuning, 'maxSpeed', 10, 60, 1).name('velocità max');
    f.add(tuning, 'acceleration', 5, 40, 1).name('accelerazione');
    f.add(tuning, 'brakeForce', 5, 50, 1).name('freno');
    f.add(tuning, 'maxSteer', 0.1, 1.1, 0.01).name('sterzata');
    f.add(tuning, 'airResistance', 0, 0.15, 0.01).name('resistenza aria');
    f.add(tuning, 'groundOffset', 0.3, 1.2, 0.01).name('altezza suolo');
    f.add(tuning, 'reverseAccel', 2, 20, 1).name('retromarcia');
  }

  return { group, tuning, update, sync, addGui };
}
