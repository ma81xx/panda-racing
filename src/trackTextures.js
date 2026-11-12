import * as THREE from 'three';

export const ROAD_TILE_METERS = 6;
export const TERRAIN_TILE_METERS = 6;
export const RUT_U = 1 / 6;
export const RUT_WIDTH = 0.11;

const ROAD_TEXTURE_WIDTH = 1024;
const ROAD_TEXTURE_HEIGHT = 512;
const TERRAIN_TEXTURE_SIZE = 512;
const ROUGHNESS_TEXTURE_SIZE = 256;
const TEXTURE_SEED = 0x51a7b3;
const MAX_ANISOTROPY = 8;

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeFbm(seed, periods) {
  const layers = periods.map((period, index) => {
    const random = mulberry32((seed + index * 0x9e3779b1) >>> 0);
    const values = new Float32Array(period * period);
    for (let i = 0; i < values.length; i++) values[i] = random();
    return { period, values };
  });
  const weights = periods.map((_, index) => Math.pow(0.55, index));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  return (u, v) => {
    let total = 0;
    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
      const { period, values } = layers[layerIndex];
      const x = u * period;
      const y = v * period;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const ix0 = ((x0 % period) + period) % period;
      const iy0 = ((y0 % period) + period) % period;
      const ix1 = (ix0 + 1) % period;
      const iy1 = (iy0 + 1) % period;
      const row0 = iy0 * period;
      const row1 = iy1 * period;
      const a = values[row0 + ix0];
      const b = values[row0 + ix1];
      const c = values[row1 + ix0];
      const d = values[row1 + ix1];
      const top = a + (b - a) * sx;
      const bottom = c + (d - c) * sx;
      total += (top + (bottom - top) * sy) * weights[layerIndex];
    }
    return total / weightSum;
  };
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function gauss(value, width) {
  return Math.exp(-((value * value) / (width * width)));
}

function applyTextureSettings(texture, colorSpace, wrapS, wrapT) {
  texture.colorSpace = colorSpace;
  texture.wrapS = wrapS;
  texture.wrapT = wrapT;
  texture.flipY = false;
  texture.anisotropy = MAX_ANISOTROPY;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  texture.userData.shared = true;
  return texture;
}

function drawStone(ctx, x, y, radius, width, height) {
  const xs = [x];
  if (x - radius < 0) xs.push(x + width);
  if (x + radius > width) xs.push(x - width);
  const ys = [y];
  if (y - radius < 0) ys.push(y + height);
  if (y + radius > height) ys.push(y - height);
  for (const px of xs) {
    for (const py of ys) {
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function createRoadAlbedo() {
  const width = ROAD_TEXTURE_WIDTH;
  const height = ROAD_TEXTURE_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const data = image.data;
  const heights = new Float32Array(width * height);
  const ruts = new Float32Array(width * height);

  const coarse = makeFbm(TEXTURE_SEED ^ 0x11, [3, 6, 12, 24, 48]);
  const fine = makeFbm(TEXTURE_SEED ^ 0x22, [48, 96, 192]);
  const grain = makeFbm(TEXTURE_SEED ^ 0x33, [192, 384]);
  const wobbleSampler = makeFbm(TEXTURE_SEED ^ 0x44, [2, 4, 8]);

  const dark = [45, 37, 28];
  const mid = [108, 86, 60];
  const light = [168, 143, 110];
  const green = [88, 89, 55];
  const compacted = [96, 89, 78];
  const edgeColor = [77, 76, 49];

  for (let y = 0; y < height; y++) {
    const v = y / height;
    const wobble = (wobbleSampler(0.37, v) - 0.5) * 0.024;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const across = u * 2 - 1;
      const rut = gauss(across + RUT_U + wobble, RUT_WIDTH) + gauss(across - RUT_U - wobble, RUT_WIDTH);
      const nCoarse = coarse(u, v);
      const nFine = fine(u, v);
      const nGrain = grain(u, v);
      const h = nCoarse * 0.52 + nFine * 0.3 + nGrain * 0.18 - rut * 0.22;
      const index = y * width + x;
      heights[index] = h;
      ruts[index] = rut;

      const t = clamp01(h * 1.15 + 0.1);
      let r;
      let g;
      let b;
      if (t < 0.5) {
        const k = t * 2;
        r = dark[0] + (mid[0] - dark[0]) * k;
        g = dark[1] + (mid[1] - dark[1]) * k;
        b = dark[2] + (mid[2] - dark[2]) * k;
      } else {
        const k = (t - 0.5) * 2;
        r = mid[0] + (light[0] - mid[0]) * k;
        g = mid[1] + (light[1] - mid[1]) * k;
        b = mid[2] + (light[2] - mid[2]) * k;
      }

      const greenAmount = smoothstep(0.58, 0.85, nCoarse) * 0.28;
      r += (green[0] - r) * greenAmount;
      g += (green[1] - g) * greenAmount;
      b += (green[2] - b) * greenAmount;

      const rutMix = rut * 0.25;
      r += (compacted[0] - r) * rutMix;
      g += (compacted[1] - g) * rutMix;
      b += (compacted[2] - b) * rutMix;

      const edge = smoothstep(0.76, 0.99, Math.abs(across));
      r += (edgeColor[0] - r) * edge * 0.4;
      g += (edgeColor[1] - g) * edge * 0.4;
      b += (edgeColor[2] - b) * edge * 0.4;

      const grainShade = 1 + (nGrain - 0.5) * 0.14 - rut * 0.12 - edge * 0.08;
      const offset = index * 4;
      data[offset] = clamp01((r * grainShade) / 255) * 255;
      data[offset + 1] = clamp01((g * grainShade) / 255) * 255;
      data[offset + 2] = clamp01((b * grainShade) / 255) * 255;
      data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const random = mulberry32(TEXTURE_SEED ^ 0x55);
  const stoneColors = [[43, 43, 46], [110, 102, 86], [150, 140, 120], [78, 72, 62]];
  const stoneCount = 2200;
  for (let i = 0; i < stoneCount; i++) {
    const x = random() * width;
    const y = random() * height;
    const u = x / width;
    const v = y / height;
    const across = u * 2 - 1;
    const edge = smoothstep(0.65, 1, Math.abs(across));
    const cluster = coarse(u, v);
    if (cluster < 0.5 - edge * 0.14) continue;
    const radius = 0.5 + Math.pow(random(), 3) * 4;
    const color = stoneColors[Math.floor(random() * stoneColors.length)];
    ctx.globalAlpha = 0.18 + random() * 0.35;
    ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    drawStone(ctx, x, y, radius, width, height);
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  applyTextureSettings(
    texture,
    THREE.SRGBColorSpace,
    THREE.ClampToEdgeWrapping,
    THREE.RepeatWrapping
  );
  return { texture, heights };
}

function createNormalTexture(sourceHeights, sourceWidth, sourceHeight, width, height, strength, wrapS, wrapT) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const data = image.data;
  const sample = (x, y) => {
    const sx = Math.round((x * sourceWidth) / width);
    const sy = Math.round((y * sourceHeight) / height);
    return sourceHeights[(((sy % sourceHeight) + sourceHeight) % sourceHeight) * sourceWidth + (((sx % sourceWidth) + sourceWidth) % sourceWidth)];
  };
  const stepU = sourceWidth / width;
  const stepV = sourceHeight / height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = ((sample(x + 1, y) - sample(x - 1, y)) / (2 * stepU)) * strength;
      const dy = ((sample(x, y + 1) - sample(x, y - 1)) / (2 * stepV)) * strength;
      let nx = -dx;
      let ny = -dy;
      let nz = 1;
      const inverseLength = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inverseLength;
      ny *= inverseLength;
      nz *= inverseLength;
      const offset = (y * width + x) * 4;
      data[offset] = (nx * 0.5 + 0.5) * 255;
      data[offset + 1] = (ny * 0.5 + 0.5) * 255;
      data[offset + 2] = (nz * 0.5 + 0.5) * 255;
      data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  applyTextureSettings(texture, THREE.NoColorSpace, wrapS, wrapT);
  return texture;
}

function createTerrainAlbedo() {
  const size = TERRAIN_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const heights = new Float32Array(size * size);
  const base = makeFbm(TEXTURE_SEED ^ 0x66, [4, 8, 16, 32, 64, 128]);
  const detail = makeFbm(TEXTURE_SEED ^ 0x77, [64, 128, 256]);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const nBase = base(u, v);
      const nDetail = detail(u, v);
      const h = nBase * 0.68 + nDetail * 0.32;
      const index = y * size + x;
      heights[index] = h;
      let shade = 0.8 + h * 0.2;
      if (nDetail > 0.76) shade *= 0.82;
      const r = shade;
      const g = shade * 0.98;
      const b = shade * 0.9;
      const offset = index * 4;
      data[offset] = clamp01(r) * 255;
      data[offset + 1] = clamp01(g) * 255;
      data[offset + 2] = clamp01(b) * 255;
      data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  applyTextureSettings(
    texture,
    THREE.SRGBColorSpace,
    THREE.RepeatWrapping,
    THREE.RepeatWrapping
  );
  return { texture, heights };
}

function createRoughnessTexture() {
  const size = ROUGHNESS_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const noise = makeFbm(TEXTURE_SEED ^ 0x88, [8, 16, 32, 64, 128]);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const value = 0.72 + noise(x / size, v) * 0.28;
      const offset = (y * size + x) * 4;
      const byte = clamp01(value) * 255;
      data[offset] = byte;
      data[offset + 1] = byte;
      data[offset + 2] = byte;
      data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  applyTextureSettings(
    texture,
    THREE.NoColorSpace,
    THREE.RepeatWrapping,
    THREE.RepeatWrapping
  );
  return texture;
}

let cache = null;

export function getTrackTextures() {
  if (cache) return cache;
  const road = createRoadAlbedo();
  const terrain = createTerrainAlbedo();
  cache = {
    roadAlbedo: road.texture,
    roadNormal: createNormalTexture(
      road.heights,
      ROAD_TEXTURE_WIDTH,
      ROAD_TEXTURE_HEIGHT,
      ROAD_TEXTURE_WIDTH / 2,
      ROAD_TEXTURE_HEIGHT / 2,
      7,
      THREE.ClampToEdgeWrapping,
      THREE.RepeatWrapping
    ),
    terrainAlbedo: terrain.texture,
    terrainNormal: createNormalTexture(
      terrain.heights,
      TERRAIN_TEXTURE_SIZE,
      TERRAIN_TEXTURE_SIZE,
      TERRAIN_TEXTURE_SIZE / 2,
      TERRAIN_TEXTURE_SIZE / 2,
      5,
      THREE.RepeatWrapping,
      THREE.RepeatWrapping
    ),
    roughness: createRoughnessTexture()
  };
  return cache;
}
