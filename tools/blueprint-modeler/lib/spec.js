import fs from 'node:fs';

const NON_LENGTH_KEYS = new Set([
  'spokes',
  'radialSegments',
  'tubularSegments',
  'segments',
  'opacity',
  'metalness',
  'roughness',
  'emissiveIntensity',
  'arc',
  'rot'
]);

function scaleLengths(value, key, factor) {
  if (typeof value === 'number') {
    return NON_LENGTH_KEYS.has(key) ? value : value * factor;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => scaleLengths(entry, key, factor));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      out[childKey] = scaleLengths(childValue, childKey, factor);
    }
    return out;
  }
  return value;
}

function fail(message) {
  throw new Error(`Spec non valida: ${message}`);
}

export function loadSpec(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const units = (raw.units || 'mm').toLowerCase();
  const factor = units === 'mm' ? 0.001 : units === 'm' ? 1 : null;
  if (factor == null) fail(`unità non supportate "${raw.units}" (usa mm o m)`);

  const spec = scaleLengths(raw, null, factor);
  spec.units = 'm';

  const dims = spec.dimensions || {};
  for (const key of ['length', 'width', 'height', 'wheelbase', 'track']) {
    if (!(dims[key] > 0)) fail(`dimensions.${key} mancante o <= 0`);
  }

  const stations = spec.body?.stations;
  if (!Array.isArray(stations) || stations.length < 3) fail('body.stations richiede almeno 3 stazioni');
  stations.sort((a, b) => a.d - b.d);
  for (const st of stations) {
    for (const key of ['d', 'halfWidth', 'topHalfWidth', 'bottomY', 'shoulderY', 'topY']) {
      if (!Number.isFinite(st[key])) fail(`station ${st.d ?? '?'}: ${key} mancante`);
    }
    if (st.topY - st.bottomY < 0.05) fail(`station ${st.d}: altezza sezione troppo piccola`);
    if (st.halfWidth <= 0) fail(`station ${st.d}: halfWidth <= 0`);
    if (st.shoulderY <= st.bottomY || st.shoulderY >= st.topY) fail(`station ${st.d}: shoulderY fuori sezione`);
  }
  if (stations[0].d > 0.01) fail('la prima stazione deve partire da d=0');
  if (Math.abs(stations[stations.length - 1].d - dims.length) > 0.01) {
    fail(`l'ultima stazione (${stations[stations.length - 1].d}) deve coincidere con length (${dims.length})`);
  }

  const wheels = spec.wheels || {};
  for (const key of ['frontAxle', 'rearAxle', 'track', 'radius', 'width', 'rimRadius']) {
    if (!(wheels[key] > 0)) fail(`wheels.${key} mancante o <= 0`);
  }
  if (Math.abs(wheels.rearAxle - wheels.frontAxle - dims.wheelbase) > 0.025) {
    fail(`passo ruote (${wheels.rearAxle - wheels.frontAxle}) diverso da dimensions.wheelbase (${dims.wheelbase})`);
  }
  if (wheels.rimRadius >= wheels.radius) fail('wheels.rimRadius deve essere minore di wheels.radius');
  if (!Array.isArray(spec.materials) && !spec.materials) fail('materials mancante');

  spec.halfLength = dims.length / 2;
  spec.zFromFront = (d) => spec.halfLength - d;
  return spec;
}
