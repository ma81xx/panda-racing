const ACTIONS = {
  throttle: ['KeyW', 'ArrowUp'],
  reverse: ['KeyS', 'ArrowDown'],
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  handbrake: ['Space']
};

const CONTROL_CODES = new Set(Object.values(ACTIONS).flat());
const hasAction = (action) => Object.prototype.hasOwnProperty.call(ACTIONS, action);
const getControlButton = (target) => target?.closest?.('[data-control]');

export function createInput() {
  const pressedKeys = new Set();
  const pressedControls = new Set();
  const activePointers = new Map();
  const isPressed = (action) => pressedControls.has(action) || ACTIONS[action].some((code) => pressedKeys.has(code));
  const buttons = Array.from(document.querySelectorAll('[data-control]')).filter((button) => hasAction(button.dataset.control));

  function updateButtonState(action) {
    buttons
      .filter((button) => button.dataset.control === action)
      .forEach((button) => button.classList.toggle('is-pressed', pressedControls.has(action)));
  }

  function setControl(action, pressed) {
    if (!hasAction(action)) return;
    if (pressed) pressedControls.add(action);
    else pressedControls.delete(action);
    updateButtonState(action);
  }

  function setKey(event, pressed) {
    if (!CONTROL_CODES.has(event.code)) return;
    event.preventDefault();
    if (pressed) pressedKeys.add(event.code);
    else pressedKeys.delete(event.code);
  }

  function clearControls() {
    pressedKeys.clear();
    pressedControls.clear();
    activePointers.clear();
    buttons.forEach((button) => button.classList.remove('is-pressed'));
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', clearControls);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearControls();
  });

  if (window.PointerEvent) {
    buttons.forEach((button) => {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        activePointers.set(event.pointerId, button.dataset.control);
        setControl(button.dataset.control, true);
        if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
      });
    });

    const releasePointer = (event) => {
      const action = activePointers.get(event.pointerId);
      if (!action) return;
      event.preventDefault();
      activePointers.delete(event.pointerId);
      if (![...activePointers.values()].includes(action)) setControl(action, false);
    };

    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
  } else {
    const syncTouches = (event) => {
      event.preventDefault();
      const touchedActions = new Set();

      for (const touch of event.touches) {
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const button = getControlButton(target);
        const action = button?.dataset.control;
        if (hasAction(action)) touchedActions.add(action);
      }

      Object.keys(ACTIONS).forEach((action) => setControl(action, touchedActions.has(action)));
    };

    window.addEventListener('touchstart', syncTouches, { passive: false });
    window.addEventListener('touchmove', syncTouches, { passive: false });
    window.addEventListener('touchend', syncTouches, { passive: false });
    window.addEventListener('touchcancel', syncTouches, { passive: false });

    buttons.forEach((button) => {
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        setControl(button.dataset.control, true);
      });
    });
    window.addEventListener('mouseup', () => Object.keys(ACTIONS).forEach((action) => setControl(action, false)));
  }

  buttons.forEach((button) => button.addEventListener('contextmenu', (event) => event.preventDefault()));

  return {
    get throttle() { return isPressed('throttle') ? 1 : 0; },
    get reverse() { return isPressed('reverse') ? 1 : 0; },
    get steer() { return (isPressed('steerLeft') ? 1 : 0) - (isPressed('steerRight') ? 1 : 0); },
    get handbrake() { return isPressed('handbrake'); },
    get braking() { return isPressed('reverse'); }
  };
}
