// Keyboard and mouse input. Keys are tracked by code; the mouse position is
// kept in screen pixels and the aim angle is computed by the world from it.
export const ACTION = {
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
  RUN: 'run',
  ENTER: 'enter',
  BRAKE: 'brake',
  SHOOT: 'shoot',
  RELOAD: 'reload',
  PAUSE: 'pause',
  MUTE: 'mute',
  INTERACT: 'interact',
  CONFIRM: 'confirm',
};

const KEYMAP = {
  KeyW: ACTION.UP,
  ArrowUp: ACTION.UP,
  KeyS: ACTION.DOWN,
  ArrowDown: ACTION.DOWN,
  KeyA: ACTION.LEFT,
  ArrowLeft: ACTION.LEFT,
  KeyD: ACTION.RIGHT,
  ArrowRight: ACTION.RIGHT,
  ShiftLeft: ACTION.RUN,
  ShiftRight: ACTION.RUN,
  KeyE: ACTION.ENTER,
  Space: ACTION.BRAKE,
  KeyR: ACTION.RELOAD,
  KeyF: ACTION.INTERACT,
  KeyM: ACTION.MUTE,
  KeyP: ACTION.PAUSE,
  Escape: ACTION.PAUSE,
  Enter: ACTION.CONFIRM,
  NumpadEnter: ACTION.CONFIRM,
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  function onKeyDown(event) {
    const action = KEYMAP[event.code];
    if (!action) return;
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
    if (!event.repeat) pressed.add(action);
    held.add(action);
  }
  function onKeyUp(event) {
    const action = KEYMAP[event.code];
    if (action) held.delete(action);
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }
  function onMouseDown(event) {
    if (event.button !== 0) return;
    onMouseMove(event);
    mouse.down = true;
    mouse.clicked = true;
    pressed.add(ACTION.SHOOT);
    held.add(ACTION.SHOOT);
  }
  function onMouseUp(event) {
    if (event.button !== 0) return;
    mouse.down = false;
    held.delete(ACTION.SHOOT);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', () => held.clear());

  return {
    held,
    mouse,
    is(action) {
      return held.has(action);
    },
    /** True once, on the frame the action started; cleared each frame. */
    wasPressed(action) {
      return pressed.has(action);
    },
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
  };
}
