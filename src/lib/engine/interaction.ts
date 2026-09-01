/**
 * InteractionEngine — tracks pointer position/velocity/click/drag on the
 * canvas element and exposes a small smoothed state effects can read from.
 * A single instance is shared across the active effect so behavior (mouse
 * repels strings, drag spins a vortex, etc.) is a per-effect choice, not
 * something wired into the DOM layer.
 */

export interface PointerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean; // pointer is over/near canvas
  down: boolean;
  /** smoothed (inertial) position, lags behind raw x/y */
  sx: number;
  sy: number;
}

export class InteractionEngine {
  state: PointerState = { x: 0, y: 0, vx: 0, vy: 0, active: false, down: false, sx: 0, sy: 0 };
  enabled = true;
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private el: HTMLElement | null = null;
  private dpr = 1;

  private onMove = (e: PointerEvent) => {
    if (!this.enabled || !this.el) return;
    const rect = this.el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const t = performance.now();
    const dt = Math.max(1, t - this.lastT);
    this.state.vx = ((x - this.lastX) / dt) * 16.67;
    this.state.vy = ((y - this.lastY) / dt) * 16.67;
    this.state.x = x;
    this.state.y = y;
    this.state.active = true;
    this.lastX = x; this.lastY = y; this.lastT = t;
  };
  private onDown = () => { this.state.down = true; };
  private onUp = () => { this.state.down = false; };
  private onLeave = () => { this.state.active = false; };
  private onEnter = () => { this.state.active = true; };

  attach(el: HTMLElement, dpr = 1) {
    this.detach();
    this.el = el;
    this.dpr = dpr;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("pointerenter", this.onEnter);
  }

  detach() {
    if (!this.el) return;
    this.el.removeEventListener("pointermove", this.onMove);
    this.el.removeEventListener("pointerdown", this.onDown);
    this.el.removeEventListener("pointerup", this.onUp);
    this.el.removeEventListener("pointerleave", this.onLeave);
    this.el.removeEventListener("pointerenter", this.onEnter);
    this.el = null;
  }

  /** Call once per frame to advance the smoothed (inertial) pointer. */
  tick(smoothing = 0.12) {
    this.state.sx += (this.state.x - this.state.sx) * smoothing;
    this.state.sy += (this.state.y - this.state.sy) * smoothing;
  }
}
