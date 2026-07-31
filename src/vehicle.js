import * as THREE from 'three';

function createWheelMesh() {
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

  const bodyWhite = materials.pandaWhite.clone();
  bodyWhite.transparent = true;
  bodyWhite.opacity = 0.35;
  bodyWhite.depthWrite = false;

  const bodyBlack = materials.pandaBlack.clone();
  bodyBlack.transparent = true;
  bodyBlack.opacity = 0.35;
  bodyBlack.depthWrite = false;

  const bodyGlass = materials.glass.clone();
  bodyGlass.transparent = true;
  bodyGlass.opacity = 0.25;
  bodyGlass.depthWrite = false;

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

  const wheelGroups = [];
  const springMeshes = [];
  const wheelPositions = [
    [-1.18, 0.25, 1.12], [1.18, 0.25, 1.12],
    [-1.18, 0.25, -1.16], [1.18, 0.25, -1.16]
  ];
  wheelPositions.forEach(([x, y, z]) => {
    const wg = new THREE.Group();
    const mesh = createWheelMesh();
    wg.add(mesh);
    wg.position.set(x, y, z);
    group.add(wg);
    wheelGroups.push(wg);
  });

  const axles = [];
  for (const zPos of [1.12, -1.16]) {
    const axle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.36, 8),
      new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.9 })
    );
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, 0.25, zPos);
    group.add(axle);
    axles.push(axle);
  }

  const springOffsets = [-0.7, 0.7, -0.7, 0.7];
  const springZ = [1.12, 1.12, -1.16, -1.16];
  for (let i = 0; i < 4; i++) {
    const spring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 1, 8),
      new THREE.MeshStandardMaterial({ color: 0xcccc44, roughness: 0.5, metalness: 0.8 })
    );
    spring.position.set(springOffsets[i], 0.25, springZ[i]);
    group.add(spring);
    springMeshes.push(spring);
  }

  scene.add(group);

  const tuning = {
    mass: 1200,
    enginePower: 8000,
    brakeForce: 18000,
    maxSteer: 0.55,
    wheelRadius: 0.42,
    springRest: 0.52,
    springStiffness: 35000,
    springDamping: 7000,
    tireGrip: 3.6,
    tireGive: 0.04,
    awd: true,
    groundOffset: 0.22,
    airResistance: 0.015
  };

  const yaw = Math.atan2(tangent.x, tangent.z);
  group.position.set(start.x, start.y + 5, start.z);
  group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

  const velocity = new THREE.Vector3();
  const angularVelocity = new THREE.Vector3();
  let steerAngle = 0;
  let wheelSpin = 0;

  const springLength = [0.52, 0.52, 0.52, 0.52];
  const springPrevLength = [0.42, 0.42, 0.42, 0.42];

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
    const grounded = [false, false, false, false];
    const normalForces = [0, 0, 0, 0];

    for (let i = 0; i < 4; i++) {
      const [lx, ly, lz] = wheelPositions[i];
      const localMount = new THREE.Vector3(lx, ly, lz);
      const isFront = i < 2;

      let wsMount = worldPos(localMount);

      if (isFront) {
        const cosS = Math.cos(steerAngle);
        const sinS = Math.sin(steerAngle);
        const sx = lx * cosS - lz * sinS;
        const sz = lx * sinS + lz * cosS;
        wsMount = worldPos(new THREE.Vector3(sx, ly, sz));
      }

      if (getGroundHeight) {
        const groundH = getGroundHeight(wsMount.x, wsMount.z);
        if (groundH !== null) {
          const dist = wsMount.y - groundH - tuning.wheelRadius;
          const maxExt = tuning.springRest + 0.25;
          const minComp = 0.04;
          springLength[i] = THREE.MathUtils.clamp(dist, minComp, maxExt);

          if (dist < maxExt) {
            const rawCompression = tuning.springRest - springLength[i];
            const compressionVelRaw = (springLength[i] - springPrevLength[i]) / Math.max(dt*2, 0.001);
            const compressionVel = THREE.MathUtils.clamp(compressionVelRaw, -5, 5);
            const tireCompression = Math.min(rawCompression, tuning.tireGive);
            const springCompression = Math.max(0, rawCompression - tuning.tireGive);
            if (springCompression > 0) {
              grounded[i] = true;
              totalForce.y += tuning.springStiffness * springCompression;
              const contactPt = new THREE.Vector3(wsMount.x, groundH, wsMount.z);
              const r = contactPt.clone().sub(group.position);
              totalTorque.add(new THREE.Vector3().crossVectors(r, new THREE.Vector3(0, tuning.springStiffness * springCompression, 0)));
            }
            if (rawCompression > 0) {
              grounded[i] = true;
              totalForce.y += tuning.springStiffness * 0.3 * tireCompression;
            }
            normalForces[i] = tuning.springStiffness * springCompression + tuning.springStiffness * 0.3 * tireCompression;
            if (rawCompression > -0.05) {
              const dampForce = THREE.MathUtils.clamp(-tuning.springDamping * compressionVel, -tuning.springStiffness * 0.5, tuning.springStiffness * 0.5);
              totalForce.y += dampForce;
            }
          }
        }
      }

      springPrevLength[i] = springLength[i];
    }

    for (let i = 0; i < 4; i++) {
      if (!grounded[i]) continue;
      const isFront = i < 2;
      const [lx, ly, lz] = wheelPositions[i];
      const localMount = new THREE.Vector3(lx, ly, lz);
      let wsMount = worldPos(localMount);
      if (isFront) {
        const cosS = Math.cos(steerAngle);
        const sinS = Math.sin(steerAngle);
        const sx = lx * cosS - lz * sinS;
        const sz = lx * sinS + lz * cosS;
        wsMount = worldPos(new THREE.Vector3(sx, ly, sz));
      }

      if ((tuning.awd && i >= 2) || (!tuning.awd && i < 2)) {
        if (input.throttle) {
          const engineForce = forward.clone().multiplyScalar(tuning.enginePower);
          totalForce.add(engineForce);
          totalTorque.add(new THREE.Vector3().crossVectors(wsMount.clone().sub(group.position), engineForce));
        }
      }

      if (input.reverse) {
        if (speedFwd > 0.1) {
          totalForce.add(forward.clone().multiplyScalar(-tuning.brakeForce));
        } else {
          totalForce.add(forward.clone().multiplyScalar(-tuning.enginePower * 0.35));
        }
      }

      const normalForce = normalForces[i];
      if (normalForce > 0) {
        let wheelForward = forward.clone();
        if (isFront) {
          const steerQ = new THREE.Quaternion().setFromAxisAngle(up, steerAngle);
          wheelForward = forward.clone().applyQuaternion(steerQ);
        }
        const wheelLat = new THREE.Vector3(-wheelForward.z, 0, wheelForward.x).normalize();
        const wheelOffset = wsMount.clone().sub(group.position);
        const angVelContribution = new THREE.Vector3().crossVectors(angularVelocity, wheelOffset);
        const wheelVel = velocity.clone().add(angVelContribution);
        const lateralVel = wheelLat.dot(wheelVel);
        const frictionForce = wheelLat.clone().multiplyScalar(-lateralVel * tuning.tireGrip * normalForce * 0.08);
        totalForce.add(frictionForce);
        totalTorque.add(new THREE.Vector3().crossVectors(wheelOffset, frictionForce));
      }
    }

    const anyGrounded = grounded.some(g => g);

    if (anyGrounded && getGroundHeight) {
      const hFront = getGroundHeight(group.position.x + forward.x * 2, group.position.z + forward.z * 2);
      const hRear = getGroundHeight(group.position.x - forward.x * 2, group.position.z - forward.z * 2);
      if (hFront !== null && hRear !== null) {
        const slopeAngle = Math.atan2(hRear - hFront, 4);
        const slopeForce = forward.clone().multiplyScalar(tuning.mass * 9.81 * Math.sin(slopeAngle));
        totalForce.add(slopeForce);
      }
    }

    if (!input.throttle && !input.reverse) {
      velocity.multiplyScalar(Math.max(0, 1 - tuning.airResistance * dt * 60));
      angularVelocity.multiplyScalar(Math.max(0, 1 - tuning.airResistance * dt * 60));
    }

    velocity.add(totalForce.clone().divideScalar(tuning.mass).multiplyScalar(dt));
    group.position.add(velocity.clone().multiplyScalar(dt));

    const inertiaInv = new THREE.Vector3(1 / 400, 1 / 1400, 1 / 400);
    angularVelocity.add(totalTorque.multiply(inertiaInv).multiplyScalar(dt));

    const rearGrounded = grounded[2] || grounded[3];
    if (rearGrounded && Math.abs(speedFwd) > 0.1) {
      angularVelocity.y += steerAngle * speedFwd * 0.8 * dt;
    }

    if (angularVelocity.lengthSq() > 0.0001) {
      const angVelWorld = angularVelocity.clone();
      const axis = angVelWorld.clone().normalize();
      const angle = angVelWorld.length() * dt;
      const qRot = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      group.quaternion.premultiply(qRot).normalize();
    }

    if (getGroundHeight) {
      const groundH = getGroundHeight(group.position.x, group.position.z);
      if (groundH !== null) {
        const minBodyY = groundH - 0.1;
        if (group.position.y < minBodyY) {
          group.position.y = minBodyY;
          if (velocity.y < 0) velocity.y = 0;
          angularVelocity.multiplyScalar(0.5);
        }
      }
    }

    if (guardrailData && guardrailData.length > 0) {
      for (const rail of guardrailData) {
        const dx = group.position.x - rail.x;
        const dz = group.position.z - rail.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 1.8) {
          const nx = dist > 0.001 ? dx / dist : rail.nx;
          const nz = dist > 0.001 ? dz / dist : rail.nz;
          const overlap = 1.8 - dist;
          group.position.x += nx * overlap * 0.15;
          group.position.z += nz * overlap * 0.15;
          const dot = forward.x * nx + forward.z * nz;
          velocity.multiplyScalar(dot > 0 ? 0.7 : 0.9);
          angularVelocity.multiplyScalar(0.5);
          break;
        }
      }
    }

    if (anyGrounded) {
      wheelSpin += speedFwd * dt / tuning.wheelRadius;
    }

    for (let i = 0; i < 4; i++) {
      const wg = wheelGroups[i];
      const [lx, ly, lz] = wheelPositions[i];
      wg.position.set(lx, ly - springLength[i], lz);
      wg.children[0].rotation.x = wheelSpin;

      const s = springMeshes[i];
      s.position.set(springOffsets[i], ly - springLength[i] * 0.5, springZ[i]);
      s.scale.y = springLength[i];

      if (i < 2) {
        wg.rotation.y = steerAngle;
      }
    }

    const frontAxleY = (wheelGroups[0].position.y + wheelGroups[1].position.y) * 0.5;
    const rearAxleY = (wheelGroups[2].position.y + wheelGroups[3].position.y) * 0.5;
    axles[0].position.y = frontAxleY;
    axles[1].position.y = rearAxleY;
  }

  function sync() {
  }

  function addGui(gui) {
    const f = gui.addFolder('Panda tuning');
    f.add(tuning, 'enginePower', 2000, 30000, 500).name('potenza');
    f.add(tuning, 'brakeForce', 5000, 40000, 1000).name('freni');
    f.add(tuning, 'maxSteer', 0.1, 1.1, 0.01).name('sterzata');
    f.add(tuning, 'springStiffness', 20000, 150000, 5000).name('molle');
    f.add(tuning, 'springDamping', 3000, 20000, 500).name('ammortizz');
    f.add(tuning, 'tireGrip', 0.5, 8, 0.1).name('grip');
    f.add(tuning, 'awd').name('traz. integrale');
    f.add(tuning, 'airResistance', 0, 0.1, 0.005).name('aria');
  }

  return { group, tuning, update, sync, addGui };
}
