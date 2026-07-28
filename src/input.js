export function createInput() {
  const keys = new Set();
  const normalize = (key) => key.toLowerCase();
  window.addEventListener('keydown', (event) => keys.add(normalize(event.key)));
  window.addEventListener('keyup', (event) => keys.delete(normalize(event.key)));

  return {
    get throttle() { return keys.has('w') || keys.has('arrowup') ? 1 : 0; },
    get reverse() { return keys.has('s') || keys.has('arrowdown') ? 1 : 0; },
    get steer() { return (keys.has('a') || keys.has('arrowleft') ? 1 : 0) - (keys.has('d') || keys.has('arrowright') ? 1 : 0); },
    get handbrake() { return keys.has(' '); },
    get braking() { return keys.has('s') || keys.has('arrowdown'); }
  };
}
