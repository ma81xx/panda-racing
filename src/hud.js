const SAMPLES = 520;

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

export function createHud(curve) {
  const root = document.createElement('div');
  root.className = 'hud';
  root.innerHTML = `
    <div class="hud__top">
      <div class="hud__lap">GIRO <span data-hud="lap">1</span></div>
      <div class="hud__time" data-hud="time">0:00.000</div>
      <div class="hud__best">BEST <span data-hud="best">&mdash;</span></div>
    </div>
    <div class="hud__progress"><div class="hud__progress-fill" data-hud="progress"></div></div>
    <canvas class="hud__minimap" width="160" height="160"></canvas>
  `;
  document.body.appendChild(root);

  const el = {
    lap: root.querySelector('[data-hud="lap"]'),
    time: root.querySelector('[data-hud="time"]'),
    best: root.querySelector('[data-hud="best"]'),
    progress: root.querySelector('[data-hud="progress"]')
  };

  const canvas = root.querySelector('.hud__minimap');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const pts = new Float32Array((SAMPLES + 1) * 3);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i <= SAMPLES; i++) {
    const p = curve.getPointAt(i / SAMPLES);
    pts[i * 3] = p.x;
    pts[i * 3 + 1] = p.y;
    pts[i * 3 + 2] = p.z;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const pad = 14;
  const scale = Math.min(
    (W - pad * 2) / Math.max(maxX - minX, 1e-6),
    (H - pad * 2) / Math.max(maxZ - minZ, 1e-6)
  );
  const ox = (W - (maxX - minX) * scale) / 2 - minX * scale;
  const oz = (H - (maxZ - minZ) * scale) / 2 - minZ * scale;

  function draw(pos, progress) {
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const x = pts[i * 3] * scale + ox;
      const y = pts[i * 3 + 2] * scale + oz;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const pi = Math.round(progress * SAMPLES);
    if (pi >= 0 && pi <= SAMPLES) {
      ctx.fillStyle = 'rgba(255, 204, 90, 0.95)';
      ctx.beginPath();
      ctx.arc(pts[pi * 3] * scale + ox, pts[pi * 3 + 2] * scale + oz, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#ff5c5c';
    ctx.beginPath();
    ctx.arc(pos.x * scale + ox, pos.z * scale + oz, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    update({ lap, time, best, progress, pos }) {
      el.lap.textContent = String(lap);
      el.time.textContent = fmtTime(time);
      el.best.textContent = best == null ? '\u2014' : fmtTime(best);
      el.progress.style.width = `${(progress * 100).toFixed(1)}%`;
      draw(pos, progress);
    },
    destroy() {
      root.remove();
    }
  };
}
