const CONTROL_KEYS = new Map([
  ['w', 'throttle'],
  ['arrowup', 'throttle'],
  ['s', 'reverse'],
  ['arrowdown', 'reverse'],
  ['a', 'left'],
  ['arrowleft', 'left'],
  ['d', 'right'],
  ['arrowright', 'right'],
  [' ', 'handbrake']
]);

export function createInput(root = document) {
  const active = new Set();
  const normalize = (key) => key.toLowerCase();
  const setControl = (control, enabled) => {
    if (!control) return;
    if (enabled) active.add(control);
    else active.delete(control);
  };

  window.addEventListener('keydown', (event) => {
    const control = CONTROL_KEYS.get(normalize(event.key));
    if (!control) return;
    event.preventDefault();
    setControl(control, true);
  }, { passive: false });

  window.addEventListener('keyup', (event) => {
    const control = CONTROL_KEYS.get(normalize(event.key));
    if (!control) return;
    event.preventDefault();
    setControl(control, false);
  }, { passive: false });

  root.querySelectorAll('[data-control]').forEach((button) => {
    const control = button.dataset.control;
    const press = (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      setControl(control, true);
      button.classList.add('is-pressed');
    };
    const release = (event) => {
      event.preventDefault();
      setControl(control, false);
      button.classList.remove('is-pressed');
    };
    button.addEventListener('pointerdown', press, { passive: false });
    button.addEventListener('pointerup', release, { passive: false });
    button.addEventListener('pointercancel', release, { passive: false });
    button.addEventListener('lostpointercapture', release, { passive: false });
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });

  return {
    get throttle() { return active.has('throttle') ? 1 : 0; },
    get reverse() { return active.has('reverse') ? 1 : 0; },
    get steer() { return (active.has('left') ? 1 : 0) - (active.has('right') ? 1 : 0); },
    get handbrake() { return active.has('handbrake'); },
    get braking() { return active.has('reverse'); }
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
