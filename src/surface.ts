export enum SurfaceType {
  ASPHALT = 0,
  DIRT = 1,
  MUD = 2,
  SNOW = 3,
}

export interface SurfaceParams {
  mu: number;
  rollingResistance: number;
}

export const SURFACES: Record<SurfaceType, SurfaceParams> = {
  [SurfaceType.ASPHALT]: { mu: 1.0, rollingResistance: 0.015 },
  [SurfaceType.DIRT]: { mu: 0.65, rollingResistance: 0.035 },
  [SurfaceType.MUD]: { mu: 0.45, rollingResistance: 0.060 },
  [SurfaceType.SNOW]: { mu: 0.25, rollingResistance: 0.025 },
};
