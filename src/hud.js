export function createHud() {
  const speedEl = document.querySelector('#hud-speed');
  const gearEl = document.querySelector('#hud-gear');
  const lapEl = document.querySelector('#hud-lap');
  const bestEl = document.querySelector('#hud-best');
  const rpmFill = document.querySelector('#hud-rpm-fill');

  function update(state) {
    speedEl.textContent = String(Math.round(state.speedKmh));
    gearEl.textContent = state.gear;
    lapEl.textContent = state.lapTime.toFixed(1);
    bestEl.textContent = state.bestLap === Infinity ? '-' : state.bestLap.toFixed(1);
    rpmFill.style.width = Math.min(100, Math.max(0, state.rpm01) * 100) + '%';
  }

  function reset() {
    speedEl.textContent = '0';
    gearEl.textContent = 'N';
    lapEl.textContent = '0.0';
    bestEl.textContent = '-';
    rpmFill.style.width = '0%';
  }

  return { update, reset };
}
