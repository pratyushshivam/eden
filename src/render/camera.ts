/**
 * Looking at the island: drag to turn, pinch or scroll to zoom, two fingers
 * (or right-drag, or shift-drag) to slide. A short press without a drag is a tap.
 */
import * as THREE from "three";

export class OrbitCam {
  readonly target = new THREE.Vector3(0, 2, 0);
  /** Turn around the island, tilt from straight down, and distance. */
  az = 0.6;
  tilt = 1.02;
  dist = 150;
  /** Slow turning while nobody is touching. */
  drift = true;
  onTap: (x: number, y: number) => void = () => {};
  /** Called when the visitor moves the view by hand. */
  onMove: (panned: boolean) => void = () => {};

  private goal = new THREE.Vector3(0, 2, 0);
  private gAz = 0.6;
  private gTilt = 1.02;
  private gDist = 150;
  private following = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private down = { x: 0, y: 0, t: 0, moved: false, button: 0, shift: false };
  private pinch = 0;
  private mid = { x: 0, y: 0 };

  constructor(private camera: THREE.PerspectiveCamera, el: HTMLElement) {
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) this.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, button: e.button, shift: e.shiftKey };
      else {
        this.down.moved = true;
        const [a, b] = [...this.pointers.values()];
        this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
        this.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    });
    el.addEventListener("pointermove", (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 1) {
        if (!this.down.moved && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 7) return;
        this.down.moved = true;
        this.drift = false;
        if (this.down.button === 2 || this.down.shift) this.pan(dx, dy);
        else {
          this.gAz -= dx * 0.0052;
          this.gTilt = Math.min(1.46, Math.max(0.12, this.gTilt - dy * 0.004));
          this.onMove(false);
        }
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (this.pinch > 0) this.zoom(this.pinch / d);
        this.pan(mx - this.mid.x, my - this.mid.y);
        this.pinch = d;
        this.mid = { x: mx, y: my };
        this.drift = false;
      }
    });
    const up = (e: PointerEvent): void => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0 && !this.down.moved && performance.now() - this.down.t < 450 && this.down.button === 0) this.onTap(e.clientX, e.clientY);
      this.pinch = 0;
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", (e) => this.pointers.delete(e.pointerId));
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom(Math.exp(Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100) * 0.16));
      this.drift = false;
    }, { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  zoom(factor: number): void {
    this.gDist = Math.min(230, Math.max(9, this.gDist * factor));
    this.onMove(false);
  }

  private pan(dx: number, dy: number): void {
    const k = this.gDist * 0.0016;
    const c = Math.cos(this.gAz), s = Math.sin(this.gAz);
    this.goal.x += (-dx * c - dy * s) * k;
    this.goal.z += (dx * s - dy * c) * k;
    const r = Math.hypot(this.goal.x, this.goal.z);
    if (r > 62) this.goal.multiplyScalar(62 / r);
    this.following = false;
    this.onMove(true);
  }

  /** Keep the view centred on a moving point. */
  follow(x: number, y: number, z: number): void {
    this.goal.set(x, y + 0.6, z);
    this.following = true;
  }

  /** Glide to a spot and a distance. */
  goTo(x: number, z: number, dist?: number, tilt?: number): void {
    this.goal.set(x, this.goal.y, z);
    if (dist) this.gDist = dist;
    if (tilt) this.gTilt = tilt;
    this.drift = false;
  }

  /** Back to the whole island. */
  home(): void {
    this.goal.set(0, 2, 0);
    this.gDist = 150;
    this.gTilt = 1.02;
    this.following = false;
  }

  get zoomedIn(): boolean {
    return this.gDist < 70;
  }

  update(dt: number, groundAt: (x: number, z: number) => number): void {
    if (this.drift) this.gAz += dt * 0.035;
    const k = Math.min(1, dt * 6);
    if (!this.following) this.goal.y += (groundAt(this.goal.x, this.goal.z) + 1 - this.goal.y) * k;
    this.target.lerp(this.goal, Math.min(1, dt * (this.following ? 4 : 7)));
    this.az += (this.gAz - this.az) * k;
    this.tilt += (this.gTilt - this.tilt) * k;
    this.dist += (this.gDist - this.dist) * k;
    const st = Math.sin(this.tilt), ct = Math.cos(this.tilt);
    const cam = this.camera;
    cam.position.set(this.target.x + Math.sin(this.az) * st * this.dist, this.target.y + ct * this.dist, this.target.z + Math.cos(this.az) * st * this.dist);
    // Never under the ground.
    const g = groundAt(cam.position.x, cam.position.z) + 1.2;
    if (Math.hypot(cam.position.x, cam.position.z) < 60 && cam.position.y < g) cam.position.y = g;
    cam.lookAt(this.target);
  }
}
