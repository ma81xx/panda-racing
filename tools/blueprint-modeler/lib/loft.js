import * as THREE from 'three';

const RING = 18;
const PAINT = 0;
const GLASS = 1;
const TRIM = 2;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function inRange(value, range) {
  return Array.isArray(range) && value >= range[0] && value <= range[1];
}

function ringFor(station) {
  const w = station.halfWidth;
  const tw = Math.min(station.topHalfWidth, w);
  const y0 = station.bottomY;
  const y1 = station.topY;
  const h = y1 - y0;
  const ys = THREE.MathUtils.clamp(station.shoulderY, y0 + 0.28 * h, y1 - 0.08 * h);

  const right = [
    [0, y0],
    [0.45 * w, y0],
    [0.8 * w, y0 + 0.06 * h],
    [0.96 * w, y0 + 0.22 * h],
    [w, ys],
    [lerp(w, tw, 0.45), lerp(ys, y1, 0.42)],
    [lerp(w, tw, 0.85), lerp(ys, y1, 0.78)],
    [tw, y1 - 0.03 * h],
    [tw * 0.55, y1],
    [0, y1]
  ];

  const points = right.slice();
  for (let i = 8; i >= 1; i--) points.push([-right[i][0], right[i][1]]);
  return points;
}

function materialFor(segment, midD, windows) {
  if (segment === 0 || segment === 17) return TRIM;
  if ((segment >= 4 && segment <= 6) || (segment >= 11 && segment <= 13)) {
    if (windows.pillars.some((range) => inRange(midD, range))) return TRIM;
    if (windows.sides.some((range) => inRange(midD, range))) {
      if (segment === 6 || segment === 11) return TRIM;
      return GLASS;
    }
  }
  if (segment >= 7 && segment <= 10) {
    if (inRange(midD, windows.windshield) || inRange(midD, windows.rear)) return GLASS;
  }
  return PAINT;
}

function stationAt(key, d) {
  if (d <= key[0].d) return { ...key[0], d };
  const last = key[key.length - 1];
  if (d >= last.d) return { ...last, d };
  for (let i = 0; i < key.length - 1; i++) {
    const a = key[i];
    const b = key[i + 1];
    if (d > b.d) continue;
    const t = (d - a.d) / (b.d - a.d);
    const station = { d };
    for (const field of Object.keys(a)) {
      if (field === 'd') continue;
      station[field] = a[field] + (b[field] - a[field]) * t;
    }
    return station;
  }
  return { ...last, d };
}

function refineStations(spec) {
  const key = spec.body.stations;
  const length = spec.dimensions.length;
  const step = spec.body.stationStep ?? 0.05;
  const arches = spec.body.wheelArches;
  const distances = new Set(key.map((station) => station.d));

  for (let d = 0; d <= length + 1e-6; d += step) {
    distances.add(Math.min(Number(d.toFixed(6)), length));
  }
  distances.add(length);

  const windows = spec.body.windows ?? {};
  const ranges = [windows.windshield, windows.rear, ...(windows.sides ?? []), ...(windows.pillars ?? [])];
  for (const range of ranges) {
    if (!Array.isArray(range)) continue;
    distances.add(range[0]);
    distances.add(range[1]);
  }

  if (arches) {
    const radius = arches.radius ?? 0.43;
    const segments = arches.segments ?? 12;
    for (const center of [spec.wheels.frontAxle, spec.wheels.rearAxle]) {
      for (let i = 0; i <= segments; i++) {
        distances.add(center - radius + (2 * radius * i) / segments);
      }
    }
  }

  return [...distances]
    .filter((d) => d >= -1e-6 && d <= length + 1e-6)
    .sort((a, b) => a - b)
    .map((d) => {
      const station = stationAt(key, d);
      if (!arches) return station;
      const radius = arches.radius ?? 0.43;
      const lift = arches.lift ?? 0.47;
      let bottomY = station.bottomY;
      for (const center of [spec.wheels.frontAxle, spec.wheels.rearAxle]) {
        const dz = station.d - center;
        if (Math.abs(dz) >= radius) continue;
        const archY = station.bottomY + lift * Math.sqrt(1 - (dz / radius) ** 2);
        bottomY = Math.max(bottomY, archY);
      }
      return { ...station, bottomY };
    });
}

export function buildBody(spec, materials) {
  const stations = refineStations(spec);
  const windows = {
    sides: spec.body.windows?.sides ?? [],
    pillars: spec.body.windows?.pillars ?? [],
    windshield: spec.body.windows?.windshield,
    rear: spec.body.windows?.rear
  };
  const z = (d) => spec.halfLength - d;

  const positions = [];
  const rings = stations.map((station) => ringFor(station));
  for (let i = 0; i < stations.length; i++) {
    const zi = z(stations[i].d);
    for (const [x, y] of rings[i]) positions.push(x, y, zi);
  }
  const normals = new Array(positions.length).fill(0);

  const indices = [[], [], []];

  const vertex = (i, j) => i * RING + (j % RING);
  const point = (index) => new THREE.Vector3(
    positions[index * 3],
    positions[index * 3 + 1],
    positions[index * 3 + 2]
  );
  const accumulate = (normal, list) => {
    for (const index of list) {
      normals[index * 3] += normal.x;
      normals[index * 3 + 1] += normal.y;
      normals[index * 3 + 2] += normal.z;
    }
  };

  for (let i = 0; i < stations.length - 1; i++) {
    const st0 = stations[i];
    const st1 = stations[i + 1];
    const midD = (st0.d + st1.d) * 0.5;
    const midY = (st0.bottomY + st0.topY + st1.bottomY + st1.topY) * 0.25;
    for (let segment = 0; segment < RING; segment++) {
      const a = vertex(i, segment);
      const b = vertex(i, segment + 1);
      const c = vertex(i + 1, segment + 1);
      const d = vertex(i + 1, segment);
      const pa = point(a);
      const pb = point(b);
      const pc = point(c);
      const pd = point(d);
      const normal = new THREE.Vector3()
        .subVectors(pb, pa)
        .cross(new THREE.Vector3().subVectors(pc, pa))
        .normalize();
      const center = new THREE.Vector3(0, midY, (pa.z + pc.z) * 0.5);
      const flip = normal.dot(pa.clone().sub(center)) < 0;
      if (flip) normal.negate();
      const order = flip ? [a, d, c, b] : [a, b, c, d];
      const target = indices[materialFor(segment, midD, windows)];
      target.push(order[0], order[1], order[2], order[0], order[2], order[3]);
      accumulate(normal, order);
    }
  }

  const addCap = (ringIndex, front) => {
    const zc = z(stations[ringIndex].d);
    const cy = rings[ringIndex].reduce((sum, p) => sum + p[1], 0) / RING;
    const centerIndex = positions.length / 3;
    positions.push(0, cy, zc);
    normals.push(0, 0, 0);
    const normal = new THREE.Vector3(0, 0, front ? 1 : -1);
    for (let segment = 0; segment < RING; segment++) {
      const a = vertex(ringIndex, segment);
      const b = vertex(ringIndex, segment + 1);
      const tri = front ? [centerIndex, a, b] : [centerIndex, b, a];
      indices[PAINT].push(tri[0], tri[1], tri[2]);
      accumulate(normal, tri);
    }
  };
  addCap(0, true);
  addCap(stations.length - 1, false);

  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (length > 1e-8) {
      normals[i] /= length;
      normals[i + 1] /= length;
      normals[i + 2] /= length;
    } else {
      normals[i] = 0;
      normals[i + 1] = 1;
      normals[i + 2] = 0;
    }
  }

  const group = new THREE.Group();
  group.name = 'BodyGroup';

  const definitions = [
    ['Body', PAINT, materials.Carpaint],
    ['BodyGlass', GLASS, materials.Window],
    ['BodyTrim', TRIM, materials.Plastic]
  ];

  for (const [name, indexList, material] of definitions) {
    const list = indices[indexList];
    if (!list.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(list);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}
