// Keyboard and mouse, reduced to the game's actions. Keys are held in a
// set; a press is an edge that is consumed when read once.
export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mousePressed = false;

  const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyR', 'KeyP', 'KeyM', 'KeyH', 'KeyC', 'Enter', 'Escape'];

  function onKeyDown(e) {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    held.add(e.code);
  }
  function onKeyUp(e) {
    held.delete(e.code);
  }
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  }
  function onMouseDown(e) {
    if (e.button === 0) {
      mouseDown = true;
      mousePressed = true;
    }
  }
  function onMouseUp(e) {
    if (e.button === 0) mouseDown = false;
  }
  function onBlur() {
    held.clear();
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    held(code) {
      return held.has(code);
    },
    // True once per physical press; reading consumes it.
    pressed(code) {
      if (pressed.has(code)) {
        pressed.delete(code);
        return true;
      }
      return false;
    },
    get mouseDown() {
      return mouseDown;
    },
    mousePressed() {
      const v = mousePressed;
      mousePressed = false;
      return v;
    },
    // Mouse position in world coordinates, through the letterboxed view.
    aimWorld(camera, view) {
      const wx = (mouseX - view.ox) / view.scale + camera.x;
      const wy = (mouseY - view.oy) / view.scale + camera.y;
      return { x: wx, y: wy };
    },
    endFrame() {
      pressed.clear();
      mousePressed = false;
    },
  };
}
