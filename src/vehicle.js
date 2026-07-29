import * as THREE from 'three';

function createWheelMesh(materials) {
  const group = new THREE.Group();

  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.34, 24),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 })
  );
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  group.add(tire);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.35, 12),
    new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.4, metalness: 0.6 })
  );
  hub.rotation.z = Math.PI / 2;
  hub.castShadow = true;
  group.add(hub);

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.04, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })
    );
    spoke.position.x = Math.cos(angle) * 0.15;
    spoke.position.y = Math.sin(angle) * 0.15;
    group.add(spoke);
  }

  return group;
}

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

  const wheelGroups = [];
  const wheelPositions = [
    [-1.18, 0.25, 1.12], [1.18, 0.25, 1.12],
    [-1.18, 0.25, -1.16], [1.18, 0.25, -1.16]
  ];
  wheelPositions.forEach(([x, y, z]) => {
    const wg = new THREE.Group();
    const mesh = createWheelMesh(materials);
    wg.add(mesh);
    wg.position.set(x, y, z);
    group.add(wg);
    wheelGroups.push(wg);
  });
  scene.add(group);

  const tuning = {
    mass: 1200,
    enginePower: 12000,
    brakeForce: 20000,
    maxSteer: 0.55,
    wheelRadius: 0.42,
    springRest: 0.48,
    springStiffness: 38000,
    springDamping: 3200,
    tireGrip: 1.6,
    groundOffset: 0.72,
    airResistance: 0.02
  };

  const yaw = Math.atan2(tangent.x, tangent.z);
  group.position.set(start.x, start.y + 1.5, start.z);
  group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

  const velocity = new THREE.Vector3();
  const angularVelocity = new THREE.Vector3();
  let steerAngle = 0;
  let wasInAir = false;

  const springLength = [tuning.springRest, tuning.springRest, tuning.springRest, tuning.springRest];
  const springVel = [0, 0, 0, 0];

  function worldPos(bodyLocal) {
    return bodyLocal.clone().applyQuaternion(group.quaternion).add(group.position);
  }

  function bodyLocalToWorld(local) {
    return local.clone().applyQuaternion(group.quaternion);
  }

  function update(input, dt, getGroundHeight, guardrailData) {
    dt = Math.min(dt, 0.05);

    const forward = bodyLocalToWorld(new THREE.Vector3(0, 0, 1));
    const right = bodyLocalToWorld(new THREE.Vector3(1, 0, 0));
    const up = bodyLocalToWorld(new THREE.Vector3(0, 1, 0));

    const targetSteer = input.steer * tuning.maxSteer;
    steerAngle += (targetSteer - steerAngle) * (1 - Math.exp(-dt * 12));

    const totalForce = new THREE.Vector3();
    const totalTorque = new THREE.Vector3();

    totalForce.y -= tuning.mass * 9.81;

    const speedFwd = forward.dot(velocity);
    const speedAbs = Math.abs(speedFwd);

    for (let i = 0; i < 4; i++) {
      const [lx, ly, lz] = wheelPositions[i];
      const localPos = new THREE.Vector3(lx, ly, lz);
      const wsPos = worldPos(localPos);
      const isFront = i < 2;

      let steerOffset = 0;
      if (isFront) {
        const s = i === 0 ? steerAngle : steerAngle;
        const cosS = Math.cos(s);
        const sinS = Math.sin(s);
        const sx = lx * cosS - lz * sinS;
        const sz = lx * sinS + lz * cosS;
        const steeredLocal = new THREE.Vector3(sx, ly, sz);
        const steeredWs = bodyLocalToWorld(steeredLocal);
        steerOffset = steeredWs.clone().sub(wsPos).length();
        wsPos.copy(steeredWs);
      }

      if (getGroundHeight) {
        const rayY = wsPos.y + 0.5;
        const groundH = getGroundHeight(wsPos.x, wsPos.z);
        if (groundH !== null) {
          const targetLen = rayY - groundH;
          const clampedLen = THREE.MathUtils.clamp(targetLen, 0.05, tuning.springRest + 0.35);
          springVel[i] += (clampedLen - springLength[i]) * dt * 30;
          springLength[i] += springVel[i] * dt;
          springLength[i] = THREE.MathUtils.clamp(springLength[i], 0.05, tuning.springRest + 0.35);

          const compression = tuning.springRest - springLength[i];
          if (compression > 0) {
            const springForce = tuning.springStiffness * compression - tuning.springDamping * springVel[i];
            if (springForce > 0) {
              totalForce.y += springForce;

              const contactWorld = new THREE.Vector3(wsPos.x, groundH, wsPos.z);
              const r = contactWorld.clone().sub(group.position);
              const torque = new THREE.Vector3().crossVectors(r, new THREE.Vector3(0, springForce, 0));
              totalTorque.add(torque);
            }
          }
        }
      }

      if (springLength[i] < tuning.springRest - 0.02 && Math.abs(speedFwd) > 0.1) {
        let wheelForward = forward.clone();
        if (isFront) {
          const steerQuat = new THREE.Quaternion().setFromAxisAngle(up, steerAngle);
          wheelForward = forward.clone().applyQuaternion(steerQuat);
        }

        if (i >= 2 && input.throttle) {
          const engineF = wheelForward.clone().multiplyScalar(tuning.enginePower * dt);
          totalForce.add(engineF);
          const r = wsPos.clone().sub(group.position);
          totalTorque.add(new THREE.Vector3().crossVectors(r, engineF));
        }

        if (input.reverse && speedFwd > 0.1) {
          const brakeF = forward.clone().multiplyScalar(-tuning.brakeForce * dt);
          totalForce.add(brakeF);
          const r = wsPos.clone().sub(group.position);
          totalTorque.add(new THREE.Vector3().crossVectors(r, brakeF));
        }

        if (input.reverse && speedFwd <= 0.1) {
          const revF = forward.clone().multiplyScalar(-tuning.enginePower * 0.35 * dt);
          totalForce.add(revF);
          const r = wsPos.clone().sub(group.position);
          totalTorque.add(new THREE.Vector3().crossVectors(r, revF));
        }

        const lateralVel = right.dot(velocity);
        const frictionF = right.clone().multiplyScalar(-lateralVel * tuning.tireGrip * tuning.mass * dt);
        totalForce.add(frictionF);
        const rFric = wsPos.clone().sub(group.position);
        totalTorque.add(new THREE.Vector3().crossVectors(rFric, frictionF));
      }
    }

    if (!input.throttle && !input.reverse) {
      const drag = 1 - tuning.airResistance;
      velocity.multiplyScalar(Math.pow(drag, dt * 60));
      angularVelocity.multiplyScalar(Math.pow(drag, dt * 60));
    }

    velocity.add(totalForce.clone().divideScalar(tuning.mass).multiplyScalar(dt));
    group.position.add(velocity.clone().multiplyScalar(dt));

    const inertiaInv = new THREE.Vector3(1 / 800, 1 / 1500, 1 / 800);
    angularVelocity.add(totalTorque.multiply(inertiaInv).multiplyScalar(dt));

    const angVelWorld = bodyLocalToWorld(angularVelocity);
    if (angVelWorld.lengthSq() > 0.0001) {
      const axis = angVelWorld.clone().normalize();
      const angle = angVelWorld.length() * dt;
      const qRot = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      group.quaternion.premultiply(qRot).normalize();
    }

    if (getGroundHeight) {
      const groundH = getGroundHeight(group.position.x, group.position.z);
      if (groundH !== null) {
        const targetY = groundH + tuning.groundOffset;
        const inAir = group.position.y > targetY + 0.15;

        if (!wasInAir && inAir && Math.abs(speedFwd) > 2) {
          const hF = getGroundHeight(
            group.position.x + forward.x * 2,
            group.position.z + forward.z * 2
          );
          const hR = getGroundHeight(
            group.position.x - forward.x * 2,
            group.position.z - forward.z * 2
          );
          if (hF !== null && hR !== null) {
            const pitchV = Math.atan2(hR - hF, 4) * speedFwd * 0.6;
            angularVelocity.x += pitchV;
          }
        }

        if (inAir) {
          if (group.position.y <= targetY) {
            group.position.y = targetY;
            if (velocity.y < -5) velocity.multiplyScalar(0.75);
            velocity.y = 0;
            angularVelocity.multiplyScalar(0.4);
          }
        } else {
          if (velocity.y < 0) velocity.y *= 0.5;
          const alpha = 1 - Math.exp(-dt * 25);
          group.position.y += (targetY - group.position.y) * alpha;
        }
        wasInAir = inAir;
      }
    }

    if (guardrailData && guardrailData.length > 0) {
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
          const dot = forward.x * nx + forward.z * nz;
          if (dot > 0) {
            velocity.multiplyScalar(0.7);
          } else {
            velocity.multiplyScalar(0.9);
          }
          angularVelocity.multiplyScalar(0.5);
          break;
        }
      }
    }

    for (let i = 0; i < 4; i++) {
      const wg = wheelGroups[i];
      const [lx, ly, lz] = wheelPositions[i];
      wg.position.set(lx, ly - (tuning.springRest - springLength[i]), lz);

      wg.children[0].rotation.x += velocity.length() * dt / tuning.wheelRadius * (speedFwd >= 0 ? 1 : -1);

      if (i < 2) {
        wg.rotation.y = steerAngle;
      }
    }
  }

  function sync() {
  }

  function addGui(gui) {
    const f = gui.addFolder('Panda tuning');
    f.add(tuning, 'enginePower', 2000, 30000, 500).name('potenza motore');
    f.add(tuning, 'brakeForce', 5000, 40000, 1000).name('freni');
    f.add(tuning, 'maxSteer', 0.1, 1.1, 0.01).name('sterzata');
    f.add(tuning, 'springStiffness', 10000, 80000, 1000).name('molle');
    f.add(tuning, 'springDamping', 1000, 8000, 200).name('ammortizzatori');
    f.add(tuning, 'tireGrip', 0.3, 3, 0.05).name('grip gomme');
    f.add(tuning, 'airResistance', 0, 0.1, 0.005).name('resistenza aria');
    f.add(tuning, 'groundOffset', 0.3, 1.2, 0.01).name('altezza suolo');
  }

  return { group, tuning, update, sync, addGui };
}
