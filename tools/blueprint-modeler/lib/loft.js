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
  const rocker = station.rocker ?? 0;

  const right = [
    [0, y0],
    [0.45 * w + rocker, y0],
    [0.8 * w + rocker, y0 + 0.06 * h],
    [0.96 * w + rocker * 0.6, y0 + 0.22 * h],
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

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function materialFor(segment, midD, centerY, windows) {
  if (segment === 0 || segment === 17) return TRIM;
  if ((segment >= 4 && segment <= 6) || (segment >= 11 && segment <= 13)) {
    if (windows.sidePolygons.length) {
      if (windows.sidePolygons.some((polygon) => pointInPolygon(midD, centerY, polygon))) return GLASS;
      if (windows.pillars.some((range) => inRange(midD, range))) return TRIM;
      return PAINT;
    }
    if (windows.pillars.some((range) => inRange(midD, range))) return TRIM;
    if (windows.sides.some((range) => inRange(midD, range))) return GLASS;
  }
  if (segment >= 7 && segment <= 10) {
    if (inRange(midD, windows.windshield) || inRange(midD, windows.rear)) return GLASS;
  }
  return PAINT;
}

function inWheelArch(spec, d, y) {
  const arches = spec.body.wheelArches;
  if (!arches) return false;
  const radiusX = arches.radius ?? 0.43;
  const radiusY = arches.lift ?? 0.38;
  const centerY = spec.wheels.radius;
  for (const center of [spec.wheels.frontAxle, spec.wheels.rearAxle]) {
    const dx = (d - center) / radiusX;
    const dy = (y - centerY) / radiusY;
    if (dx * dx + dy * dy < 1) return true;
  }
  return false;
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
  for (const polygon of windows.sidePolygons ?? []) {
    for (const point of polygon) distances.add(point[0]);
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
      const bottomY = station.bottomY;
      let rocker = 0;
      const rockerConfig = spec.body.rocker;
      if (rockerConfig && d >= rockerConfig.from && d <= rockerConfig.to) {
        const fade = rockerConfig.fade ?? 0.08;
        const t = Math.min(
          1,
          Math.min((d - rockerConfig.from) / fade, (rockerConfig.to - d) / fade)
        );
        rocker = (rockerConfig.outward ?? 0) * Math.max(0, t);
      }
      return { ...station, bottomY, rocker };
    });
}

function rockerAt(spec, d) {
  const rockerConfig = spec.body.rocker;
  if (!rockerConfig || d < rockerConfig.from || d > rockerConfig.to) return 0;
  const fade = rockerConfig.fade ?? 0.08;
  const t = Math.min(
    1,
    Math.min((d - rockerConfig.from) / fade, (rockerConfig.to - d) / fade)
  );
  return (rockerConfig.outward ?? 0) * Math.max(0, t);
}

function sideXAt(spec, d, y, side) {
  const base = stationAt(spec.body.stations, d);
  const ring = ringFor({ ...base, rocker: rockerAt(spec, d) });
  for (let i = 0; i < 9; i++) {
    const y0 = ring[i][1];
    const y1 = ring[i + 1][1];
    const lo = Math.min(y0, y1);
    const hi = Math.max(y0, y1);
    if (y < lo - 1e-6 || y > hi + 1e-6) continue;
    const t = hi - lo < 1e-6 ? 0 : (y - y0) / (y1 - y0);
    const x = ring[i][0] + (ring[i + 1][0] - ring[i][0]) * t;
    return side === 'right' ? x : -x;
  }
  return null;
}

export function buildBody(spec, materials) {
  const stations = refineStations(spec);
  const windows = {
    sides: spec.body.windows?.sides ?? [],
    sidePolygons: spec.body.windows?.sidePolygons ?? [],
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
      const centerY = (pa.y + pb.y + pc.y + pd.y) * 0.25;
      const sideLower = segment === 1 || segment === 2 || segment === 3 ||
        segment === 14 || segment === 15 || segment === 16;
      if (sideLower && inWheelArch(spec, midD, centerY)) continue;
      const normal = new THREE.Vector3()
        .subVectors(pb, pa)
        .cross(new THREE.Vector3().subVectors(pc, pa))
        .normalize();
      const center = new THREE.Vector3(0, midY, (pa.z + pc.z) * 0.5);
      const flip = normal.dot(pa.clone().sub(center)) < 0;
      if (flip) normal.negate();
      const order = flip ? [a, d, c, b] : [a, b, c, d];
      const target = indices[materialFor(segment, midD, centerY, windows)];
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

  const sidePanels = spec.details?.sidePanels ?? [];
  if (sidePanels.length) {
    const panelGroup = new THREE.Group();
    panelGroup.name = 'SidePanels';
    for (const panel of sidePanels) {
      const side = panel.side ?? 'left';
      const sign = side === 'right' ? 1 : -1;
      const offset = panel.offset ?? 0.006;
      const points = [];
      for (const [d, y] of panel.points) {
        const x = sideXAt(spec, d, y, side);
        if (x == null) continue;
        points.push(new THREE.Vector3(x + sign * offset, y, z(d)));
      }
      if (points.length < 3) continue;
      const positions = points.flatMap((point) => [point.x, point.y, point.z]);
      let indices = [];
      for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1);
      const normal = new THREE.Vector3()
        .subVectors(points[1], points[0])
        .cross(new THREE.Vector3().subVectors(points[2], points[0]))
        .normalize();
      const average = points
        .reduce((sum, point) => sum.add(point), new THREE.Vector3())
        .multiplyScalar(1 / points.length);
      if (normal.dot(average.clone().sub(new THREE.Vector3(0, 0.7, 0))) < 0) {
        indices = [];
        for (let i = 1; i < points.length - 1; i++) indices.push(0, i + 1, i);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, materials[panel.material] ?? materials.Plastic);
      mesh.name = panel.name || 'SidePanel';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      panelGroup.add(mesh);
    }
    group.add(panelGroup);
  }

  const arches = spec.body.wheelArches;
  if (arches) {
    const lipGroup = new THREE.Group();
    lipGroup.name = 'ArchLips';
    const radiusX = arches.radius ?? 0.43;
    const radiusY = arches.lift ?? 0.38;
    const centerY = spec.wheels.radius;
    const sillY = 0.2;
    const tube = 0.01;
    const steps = 28;
    const sinStart = Math.max(-1, Math.min(1, (sillY - centerY) / radiusY));
    const thetaStart = Math.asin(sinStart);
    const thetaEnd = Math.PI - thetaStart;

    for (const [label, center] of [['F', spec.wheels.frontAxle], ['R', spec.wheels.rearAxle]]) {
      for (const side of ['right', 'left']) {
        const sign = side === 'right' ? 1 : -1;
        const points = [];
        for (let i = 0; i <= steps; i++) {
          const theta = thetaStart + ((thetaEnd - thetaStart) * i) / steps;
          const d = center + radiusX * Math.cos(theta);
          const y = centerY + radiusY * Math.sin(theta);
          const x = sideXAt(spec, d, y, side);
          if (x == null) continue;
          points.push(new THREE.Vector3(x + sign * 0.006, y, z(d)));
        }
        if (points.length < 2) continue;
        const curve = new THREE.CatmullRomCurve3(points);
        const tubeGeometry = new THREE.TubeGeometry(curve, steps * 2, tube, 6, false);
        const lip = new THREE.Mesh(tubeGeometry, materials.Carpaint);
        lip.name = `ArchLip${label}${side === 'right' ? 'R' : 'L'}`;
        lip.castShadow = true;
        lip.receiveShadow = true;
        lipGroup.add(lip);
        for (const point of [points[0], points[points.length - 1]]) {
          const cap = new THREE.Mesh(new THREE.SphereGeometry(tube * 1.05, 8, 6), materials.Carpaint);
          cap.position.copy(point);
          cap.castShadow = true;
          cap.receiveShadow = true;
          lipGroup.add(cap);
        }
      }
    }
    group.add(lipGroup);
  }

  return group;
}
