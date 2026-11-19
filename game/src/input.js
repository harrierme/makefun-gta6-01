// Keyboard and mouse, reduced to the game's actions. Keys are held in a
// set; `pressed` reports an edge (true once per key press) and is cleared
// by the main loop at the end of each frame, so a single tap never fires
// twice. The mouse position is converted from client pixels to world
// coordinates through the renderer's viewport transform.

import { VIEW } from './render.js';

const KEY_ACTIONS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'handbrake',
  KeyE: 'interact',
  KeyR: 'reload',
  KeyP: 'pause', Escape: 'pause',
  KeyM: 'mute',
  Enter: 'confirm',
  KeyC: 'continue',
};

export const ACTION_CONFIRM = 'confirm';
export const ACTION_CONTINUE = 'continue';
export const ACTION_INTERACT = 'interact';
export const ACTION_MUTE = 'mute';
export const ACTION_PAUSE = 'pause';
export const ACTION_RELOAD = 'reload';

export function createInput(canvas) {
  const held = new Set();
  const edges = new Set();
  let mouseX = VIEW.width / 2;
  let mouseY = VIEW.height / 2;
  let mouseDownEdge = false;

  function onKeyDown(event) {
    const action = KEY_ACTIONS[event.code];
    if (!action) return;
    if (['up', 'down', 'left', 'right', 'handbrake', 'interact'].includes(action)) {
      event.preventDefault();
    }
    if (!held.has(action)) edges.add(action);
    held.add(action);
  }

  function onKeyUp(event) {
    const action = KEY_ACTIONS[event.code];
    if (action) held.delete(action);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDownEdge = true;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);

  return {
    down(action) {
      return held.has(action);
    },
    // An edge is consumed when it is read: the loop may run several
    // fixed steps in one frame, and a single tap must fire exactly once
    // (one E press enters a car — it must not enter and exit it again
    // in the same frame).
    pressed(action) {
      if (action === 'shoot') {
        const was = mouseDownEdge;
        mouseDownEdge = false;
        return was;
      }
      if (edges.has(action)) {
        edges.delete(action);
        return true;
      }
      return false;
    },
    // The mouse position in world coordinates, given the camera centre.
    // The canvas is letterboxed around the 1280x720 view, so client
    // pixels are scaled back into view pixels first.
    aimWorld(camera) {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(rect.width / VIEW.width, rect.height / VIEW.height);
      const ox = (rect.width - VIEW.width * scale) / 2;
      const oy = (rect.height - VIEW.height * scale) / 2;
      const viewX = (mouseX - ox) / scale;
      const viewY = (mouseY - oy) / scale;
      return {
        x: camera.x + (viewX - VIEW.width / 2),
        y: camera.y + (viewY - VIEW.height / 2),
      };
    },
    // Called once per frame by the main loop: edges are single-frame.
    endFrame() {
      edges.clear();
      mouseDownEdge = false;
    },
  };
}
