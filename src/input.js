const ACTIONS = {
  throttle: ['KeyW', 'ArrowUp'],
  reverse: ['KeyS', 'ArrowDown'],
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  handbrake: ['Space']
};

const CONTROL_CODES = new Set(Object.values(ACTIONS).flat());
const STICK_DEADZONE = 0.12;
const STICK_EXPO = 1.25;
const STEER_DEADZONE = 0.05;
const STEER_EXPO = 1.15;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyDeadzone(value, deadzone, expo = 1) {
  const abs = Math.abs(value);
  if (abs <= deadzone) return 0;
  const normalized = (abs - deadzone) / (1 - deadzone);
  return Math.sign(value) * Math.pow(normalized, expo);
}

function triggerAxis(value) {
  if (typeof value !== 'number') return 0;
  return clamp((value + 1) / 2, 0, 1);
}

function createSteerStrip() {
  const element = document.querySelector('[data-steer-strip]');
  if (!element) {
    return { active: false, value: 0, reset() {} };
  }

  const knob = element.querySelector('.steer-strip__knob') || element;
  let value = 0;
  let raw = 0;
  let pointerId = null;

  const render = () => {
    knob.style.left = `${(1 - raw) * 50}%`;
    element.classList.toggle('is-active', Math.abs(raw) > 0.01);
  };

  const updateFromEvent = (event) => {
    const rect = element.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
    raw = 1 - ratio * 2;
    value = applyDeadzone(raw, STEER_DEADZONE, STEER_EXPO);
    render();
  };

  const reset = () => {
    pointerId = null;
    element.classList.remove('is-dragging');
    raw = 0;
    value = 0;
    render();
  };

  element.addEventListener('pointerdown', (event) => {
    if (pointerId !== null) return;
    event.preventDefault();
    pointerId = event.pointerId;
    element.setPointerCapture(event.pointerId);
    element.classList.add('is-dragging');
    updateFromEvent(event);
  });

  element.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    updateFromEvent(event);
  });

  const release = (event) => {
    if (event.pointerId !== pointerId) return;
    reset();
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', release);

  reset();

  return {
    get active() { return pointerId !== null; },
    get value() { return value; },
    reset
  };
}

function createGamepad() {
  const state = { steer: 0, throttle: 0, brake: 0, handbrake: false };

  function poll() {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let pad = null;
    for (let i = 0; i < pads.length; i++) {
      const candidate = pads[i];
      if (candidate && candidate.connected) {
        pad = candidate;
        break;
      }
    }

    if (!pad) {
      state.steer = 0;
      state.throttle = 0;
      state.brake = 0;
      state.handbrake = false;
      return;
    }

    const axes = pad.axes || [];
    const buttons = pad.buttons || [];
    const pressed = (index) => Boolean(buttons[index] && buttons[index].pressed);
    const buttonValue = (index) => (buttons[index] ? buttons[index].value || 0 : 0);

    let steer = -applyDeadzone(axes[0] || 0, STICK_DEADZONE, STICK_EXPO);
    if (pressed(14)) steer = 1;
    else if (pressed(15)) steer = -1;

    state.steer = clamp(steer, -1, 1);
    const rightTrigger = buttons[7] ? Math.max(buttonValue(7), pressed(7) ? 1 : 0) : triggerAxis(axes[5]);
    const leftTrigger = buttons[6] ? Math.max(buttonValue(6), pressed(6) ? 1 : 0) : triggerAxis(axes[4]);
    state.throttle = clamp(Math.max(rightTrigger, pressed(0) ? 1 : 0), 0, 1);
    state.brake = clamp(Math.max(leftTrigger, pressed(1) ? 1 : 0), 0, 1);
    state.handbrake = pressed(2) || buttonValue(5) > 0.5;
  }

  return { state, poll };
}

export function createInput() {
  const pressedKeys = new Set();
  const pressedControls = new Set();
  const steerStrip = createSteerStrip();
  const gamepad = createGamepad();
  const isPressed = (action) => pressedControls.has(action) || ACTIONS[action].some((code) => pressedKeys.has(code));

  function clearTransientState() {
    pressedKeys.clear();
    pressedControls.clear();
    steerStrip.reset();
    document.querySelectorAll('[data-control].is-pressed').forEach((button) => {
      button.classList.remove('is-pressed');
    });
  }

  function setKey(event, pressed) {
    if (!CONTROL_CODES.has(event.code)) return;
    event.preventDefault();
    if (pressed) pressedKeys.add(event.code);
    else pressedKeys.delete(event.code);
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', clearTransientState);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTransientState();
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
    poll: gamepad.poll,
    get throttle() { return Math.max(isPressed('throttle') ? 1 : 0, gamepad.state.throttle); },
    get reverse() { return Math.max(isPressed('reverse') ? 1 : 0, gamepad.state.brake); },
    get steer() {
      if (steerStrip.active) return steerStrip.value;
      if (Math.abs(gamepad.state.steer) > 0.01) return gamepad.state.steer;
      return (isPressed('steerLeft') ? 1 : 0) - (isPressed('steerRight') ? 1 : 0);
    },
    get handbrake() { return isPressed('handbrake') || gamepad.state.handbrake; },
    get braking() { return Math.max(isPressed('reverse') ? 1 : 0, gamepad.state.brake); }
  };
}
