export const VEHICLE_MODELS = {
  lancer: {
    label: 'Mitsubishi Lancer Evo IX',
    url: 'models/mitsubishi-lancer-evo9.glb',
    config: {
      label: 'Lancer Evo IX',
      targetWidth: null,
      brakeLightMaterial: 'BrakeLight',
      reverseLightMaterial: 'ReverseLight',
      collider: {
        halfExtents: [0.885, 0.45, 2.245],
        offset: [0, 0.05, 0],
        density: 196
      },
      tuning: {
        suspensionRestLength: 0.48,
        suspensionStiffness: 36,
        maxSuspensionTravel: 0.42,
        dampingCompression: 8,
        dampingRelaxation: 10,
        frictionSlip: 0.95,
        frontGrip: 1.0,
        rearGrip: 0.95,
        offRoadGrip: 0.6,
        brakeForce: 18,
        handbrakeForce: 18,
        maxTorque: 280,
        idleRPM: 900,
        redlineRPM: 7500,
        upshiftRPM: 7100,
        downshiftRPM: 2800,
        finalDrive: 4.06,
        engineBrakeTorque: 30,
        gearRatios: [3.66, 2.37, 1.72, 1.32, 1.05, 0.86],
        reverseRatio: 3.5,
        frontDrive: 0.5,
        rearDrive: 0.5
      }
    }
  },
  panda: {
    label: 'Fiat Panda',
    url: 'models/panda.glb',
    config: {
      label: 'Panda',
      targetWidth: 2.2,
      brakeLightMaterial: 'Material.001',
      reverseLightMaterial: 'Reverse',
      collider: {
        halfExtents: [1.1, 0.4, 2.0],
        offset: [0, 0.08, 0],
        density: 120
      }
    }
  }
};
