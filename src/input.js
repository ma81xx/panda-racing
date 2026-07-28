const ACTIONS = {
  throttle: ['KeyW', 'ArrowUp'],
  reverse: ['KeyS', 'ArrowDown'],
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  handbrake: ['Space']
};

const CONTROL_CODES = new Set(Object.values(ACTIONS).flat());

export function createInput() {
  const pressedKeys = new Set();
  const pressedControls = new Set();
  const isPressed = (action) => pressedControls.has(action) || ACTIONS[action].some((code) => pressedKeys.has(code));

  function setKey(event, pressed) {
    if (!CONTROL_CODES.has(event.code)) return;
    event.preventDefault();
    if (pressed) pressedKeys.add(event.code);
    else pressedKeys.delete(event.code);
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    pressedKeys.clear();
    pressedControls.clear();
  });

  document.querySelectorAll('[data-control]').forEach((button) => {
    const action = button.dataset.control;
    if (!(action in ACTIONS)) return;

    const press = (event) => {
      event.preventDefault();
      pressedControls.add(action);
      button.classList.add('is-pressed');
    };
    const release = (event) => {
      event.preventDefault();
      pressedControls.delete(action);
      button.classList.remove('is-pressed');
    };

    button.addEventListener('pointerdown', (event) => {
      press(event);
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  });

  return {
    get throttle() { return isPressed('throttle') ? 1 : 0; },
    get reverse() { return isPressed('reverse') ? 1 : 0; },
    get steer() { return (isPressed('steerLeft') ? 1 : 0) - (isPressed('steerRight') ? 1 : 0); },
    get handbrake() { return isPressed('handbrake'); },
    get braking() { return isPressed('reverse'); }
  };
}
