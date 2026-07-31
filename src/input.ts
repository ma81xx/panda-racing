const ACTIONS: Record<string, string[]> = {
  throttle: ['KeyW', 'ArrowUp'],
  reverse: ['KeyS', 'ArrowDown'],
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
};

const CONTROL_CODES = new Set(Object.values(ACTIONS).flat());

export interface InputState {
  readonly throttle: number;
  readonly reverse: number;
  readonly steer: number;
  readonly handbrake: boolean;
}

export function createInput(): InputState {
  const pressedKeys = new Set<string>();
  const pressedControls = new Set<string>();
  const isPressed = (action: string): boolean =>
    pressedControls.has(action) || ACTIONS[action].some((code) => pressedKeys.has(code));

  function setKey(event: KeyboardEvent, pressed: boolean): void {
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
    const el = button as HTMLElement;
    const action = el.dataset.control;
    if (!action || !(action in ACTIONS)) return;

    const press = (event: Event): void => {
      event.preventDefault();
      pressedControls.add(action);
      el.classList.add('is-pressed');
    };
    const release = (event: Event): void => {
      event.preventDefault();
      pressedControls.delete(action);
      el.classList.remove('is-pressed');
    };

    el.addEventListener('pointerdown', (event) => {
      press(event);
      el.setPointerCapture((event as PointerEvent).pointerId);
    });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
  });

  return {
    get throttle(): number { return isPressed('throttle') ? 1 : 0; },
    get reverse(): number { return isPressed('reverse') ? 1 : 0; },
    get steer(): number { return (isPressed('steerLeft') ? 1 : 0) - (isPressed('steerRight') ? 1 : 0); },
    get handbrake(): boolean { return isPressed('handbrake'); },
  };
}
