// Keyboard + mouse input with action mapping and per-frame "just pressed" tracking.

export type Action =
  | 'forward' | 'back' | 'left' | 'right'
  | 'sprint' | 'jump' | 'crouch'
  | 'interact' | 'vehicle' | 'horn' | 'lights' | 'camera'
  | 'indicatorL' | 'indicatorR' | 'handbrake'
  | 'phone' | 'map' | 'pause' | 'quicksave' | 'quickload' | 'hail';

const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  handbrake: ['Space'],
  crouch: ['KeyC'],
  interact: ['KeyE'],
  vehicle: ['KeyF'],
  horn: ['KeyH'],
  lights: ['KeyL'],
  camera: ['KeyV'],
  indicatorL: ['KeyZ'],
  indicatorR: ['KeyX'],
  phone: ['Tab', 'KeyP'],
  map: ['KeyM'],
  pause: ['Escape'],
  quicksave: ['F5'],
  quickload: ['F9'],
  hail: ['KeyT'],
};

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private bindings = DEFAULT_BINDINGS;
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  mouseDown = false;
  pointerLocked = false;
  /** When true (menus/phone open), gameplay actions read as idle. */
  uiCapture = false;

  constructor(canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'F5' || e.code === 'F9' || e.code === 'Space') e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked || this.mouseDown) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    canvas.addEventListener('mousedown', () => {
      this.mouseDown = true;
      if (!this.uiCapture && !this.pointerLocked && canvas.requestPointerLock) {
        try {
          const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch { /* pointer lock unavailable (e.g. headless) */ }
      }
    });
    window.addEventListener('mouseup', () => (this.mouseDown = false));
    window.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
  }

  releasePointer() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Held state for gameplay actions (suppressed while UI captures input). */
  held(a: Action): boolean {
    if (this.uiCapture && !isUiAction(a)) return false;
    return this.bindings[a].some((k) => this.down.has(k));
  }

  /** Edge-triggered press this frame. */
  just(a: Action): boolean {
    if (this.uiCapture && !isUiAction(a)) return false;
    return this.bindings[a].some((k) => this.pressed.has(k));
  }

  axis(neg: Action, pos: Action) {
    return (this.held(pos) ? 1 : 0) - (this.held(neg) ? 1 : 0);
  }

  /** Programmatic key injection used by automated smoke tests. */
  simulate(code: string, isDown: boolean) {
    if (isDown) {
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    } else this.down.delete(code);
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}

function isUiAction(a: Action) {
  return a === 'phone' || a === 'map' || a === 'pause' || a === 'quicksave' || a === 'quickload';
}
