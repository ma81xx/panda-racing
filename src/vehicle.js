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
    wheelRadius: 0.42
  };

  const yaw = Math.atan2(tangent.x, tangent.z);
  group.position.set(start.x, start.y + 1, start.z);
  group.rotation.y = yaw;

  let speed = 0;
  let verticalVelocity = 0;
  let groundY = group.position.y;

  function getForward() {
    return new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
  }

  function update(input, dt, getGroundHeight) {
    if (getGroundHeight) {
      const forward = getForward();
      const sampleX = group.position.x + forward.x * 2;
      const sampleZ = group.position.z + forward.z * 2;
      const h = getGroundHeight(sampleX, sampleZ);
      if (h !== null) groundY = h;
    }

    const throttle = input.throttle;
    const reverse = input.reverse;

    if (throttle) {
      speed += tuning.acceleration * dt;
    }
    if (reverse) {
      speed -= tuning.acceleration * 0.8 * dt;
    }
    if (!throttle && !reverse) {
      const drag = 1 - tuning.airResistance;
      speed *= Math.pow(drag, dt * 60);
    }

    const brake = input.braking && !input.throttle ? tuning.brakeForce : 0;
    if (brake > 0 && Math.abs(speed) > 0.1) {
      const brakeDir = Math.sign(speed);
      speed -= brakeDir * brake * dt;
      if (Math.sign(speed) !== brakeDir) speed = 0;
    }

    speed = THREE.MathUtils.clamp(speed, -tuning.maxSpeed * 0.4, tuning.maxSpeed);

    const steerInput = input.steer * tuning.maxSteer;
    const steerFactor = Math.abs(speed) > 1 ? Math.min(Math.abs(speed) / tuning.maxSpeed, 1) : 0;
    group.rotation.y += steerInput * steerFactor * 3 * dt;

    const forward = getForward();
    group.position.x += forward.x * speed * dt;
    group.position.z += forward.z * speed * dt;

    const targetY = groundY + tuning.groundOffset;
    const inAir = group.position.y > targetY + 0.15;
    if (inAir) {
      verticalVelocity -= 9.81 * dt;
      group.position.y += verticalVelocity * dt;
      if (group.position.y <= targetY) {
        group.position.y = targetY;
        verticalVelocity = 0;
      }
    } else {
      verticalVelocity = 0;
      const alpha = 1 - Math.exp(-dt * 25);
      group.position.y += (targetY - group.position.y) * alpha;
    }

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
  }

  return { group, tuning, update, sync, addGui };
}
