// Keyboard and mouse input. Held keys give a movement vector each frame;
// one-shot presses (interact, reload, pause, confirm, continue, mute) are
// queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice. The mouse aims in world
// coordinates: the caller supplies the camera each frame.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_RELOAD = 8;
export const ACTION_CONTINUE = 16;
export const ACTION_MUTE = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const HANDBRAKE = new Set(['Space']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const RELOAD = new Set(['KeyR']);
const CONTINUE = new Set(['KeyC']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)
      || RUN.has(event.code) || HANDBRAKE.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
      return;
    }
    if (event.repeat) return;
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (INTERACT.has(event.code)) actions |= ACTION_INTERACT;
    else if (RELOAD.has(event.code)) actions |= ACTION_RELOAD;
    else if (CONTINUE.has(event.code)) actions |= ACTION_CONTINUE;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of
  // everything on blur so the player never drives off on their own.
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function hasAny(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Movement vector for this frame: x and y in [-1, 1]. */
    move() {
      const x = (hasAny(RIGHT) ? 1 : 0) - (hasAny(LEFT) ? 1 : 0);
      const y = (hasAny(DOWN) ? 1 : 0) - (hasAny(UP) ? 1 : 0);
      return { x, y };
    },
    get run() { return hasAny(RUN); },
    get handbrake() { return hasAny(HANDBRAKE); },
    get shooting() { return mouseDown; },
    get mouse() { return { x: mouseX, y: mouseY }; },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
