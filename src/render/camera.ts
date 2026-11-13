/**
 * Looking at the planet, like a map you can fall into: drag to spin it, pinch
 * or scroll to go from orbit down to the ground, right-drag (or two fingers
 * turning) to look around. A short press without a drag is a tap.
 */
import * as THREE from "three";
import { R } from "../engine/config";

const Y = new THREE.Vector3(0, 1, 0);
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class GlobeCam {
  /** The point on the planet being looked at: a unit vector. */
  readonly tgt = new THREE.Vector3(0.62, 0.35, 0.7).normalize();
  /** Compass heading of the view (0 looks north), extra tilt, and distance from the point looked at. */
  az = 0;
  tilt = 0;
  dist = 330;
  /** Slow turning while nobody is touching. */
  drift = true;
  onTap: (x: number, y: number) => void = () => {};
  /** Called when the visitor moves the view by hand. */
  onMove: (panned: boolean) => void = () => {};
  /** The frame at the target, refreshed every update. */
  readonly up = new THREE.Vector3();
  readonly fwd = new THREE.Vector3();
  readonly right = new THREE.Vector3();
  /** 0 in orbit, 1 down in the air near the ground. */
  inAir = 0;

  private goal = this.tgt.clone();
  private gAz = 0;
  private gTilt = 0;
  private gDist = 330;
  private following = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private down = { x: 0, y: 0, t: 0, moved: false, button: 0, shift: false };
  private pinch = 0;
  private twist = 0;
  private mid = { x: 0, y: 0 };
  private north = new THREE.Vector3();
  private east = new THREE.Vector3();

  constructor(private camera: THREE.PerspectiveCamera, private el: HTMLElement) {
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) this.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, button: e.button, shift: e.shiftKey };
      else {
        this.down.moved = true;
        const [a, b] = [...this.pointers.values()];
        this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
        this.twist = Math.atan2(b.y - a.y, b.x - a.x);
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
        if (this.down.button === 2 || this.down.shift) this.look(dx, dy);
        else this.pan(dx, dy);
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (this.pinch > 0) this.zoom(this.pinch / d);
        let da = ang - this.twist;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        this.gAz -= da;
        this.gTilt = Math.min(0.5, Math.max(-1, this.gTilt + (my - this.mid.y) * 0.004));
        this.pinch = d;
        this.twist = ang;
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
      this.zoom(Math.exp(Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100) * 0.17));
      this.drift = false;
    }, { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  zoom(factor: number): void {
    this.gDist = Math.min(440, Math.max(9, this.gDist * factor));
    this.onMove(false);
  }

  /** Slides the planet under the pointer. */
  private pan(dx: number, dy: number): void {
    const perPx = (2 * this.dist * Math.tan((this.camera.fov * Math.PI) / 360)) / this.el.clientHeight;
    const k = (perPx / R) * (this.dist > 200 ? 1.5 : 1);
    this.goal.addScaledVector(this.right, -dx * k).addScaledVector(this.fwd, dy * k).normalize();
    if (Math.abs(this.goal.y) > 0.975) {
      this.goal.y = Math.sign(this.goal.y) * 0.975;
      this.goal.normalize();
    }
    this.following = false;
    this.onMove(true);
  }

  /** Turns the view about the point looked at, and tips it. */
  private look(dx: number, dy: number): void {
    this.gAz -= dx * 0.005;
    this.gTilt = Math.min(0.5, Math.max(-1, this.gTilt - dy * 0.004));
    this.onMove(false);
  }

  /** Keep the view centred on a moving point (a unit vector). */
  follow(x: number, y: number, z: number): void {
    this.goal.set(x, y, z).normalize();
    this.following = true;
  }

  /** Glide to a spot and a distance. */
  flyTo(x: number, y: number, z: number, dist?: number): void {
    this.goal.set(x, y, z).normalize();
    if (dist) this.gDist = dist;
    this.drift = false;
    this.following = false;
  }

  /** Go at once, with no glide, to look at a point. */
  jump(x: number, y: number, z: number): void {
    this.goal.set(x, y, z).normalize();
    this.goal.y = Math.max(-0.9, Math.min(0.9, this.goal.y));
    this.goal.normalize();
    this.tgt.copy(this.goal);
  }

  /** Back out to the whole planet. */
  home(): void {
    this.gDist = 330;
    this.gTilt = 0;
    this.gAz = 0;
    this.following = false;
  }

  get close(): boolean {
    return this.gDist < 70;
  }

  update(dt: number, surfaceAt: (x: number, y: number, z: number) => number): void {
    if (this.drift) this.goal.applyAxisAngle(Y, dt * 0.03);
    const k = Math.min(1, dt * 6);
    this.tgt.lerp(this.goal, Math.min(1, dt * (this.following ? 5 : 7))).normalize();
    this.az += (this.gAz - this.az) * k;
    this.tilt += (this.gTilt - this.tilt) * k;
    this.dist += (this.gDist - this.dist) * k;

    const up = this.up.copy(this.tgt);
    this.north.copy(Y).addScaledVector(up, -up.y).normalize();
    this.east.crossVectors(up, this.north);
    this.fwd.copy(this.north).multiplyScalar(Math.cos(this.az)).addScaledVector(this.east, Math.sin(this.az));
    this.right.copy(this.east).multiplyScalar(Math.cos(this.az)).addScaledVector(this.north, -Math.sin(this.az));

    // From orbit, look straight down. Closer in, tip towards the horizon.
    const tilt = Math.min(1.36, Math.max(0, 1.02 * (1 - smooth(45, 230, this.dist)) + this.tilt));
    const ground = surfaceAt(up.x, up.y, up.z);
    const cam = this.camera;
    const px = up.x * (R + ground + 0.6), py = up.y * (R + ground + 0.6), pz = up.z * (R + ground + 0.6);
    const c = Math.cos(tilt) * this.dist, s = Math.sin(tilt) * this.dist;
    cam.position.set(px + up.x * c - this.fwd.x * s, py + up.y * c - this.fwd.y * s, pz + up.z * c - this.fwd.z * s);
    // Never under the ground.
    const r = cam.position.length();
    const floor = R + surfaceAt(cam.position.x / r, cam.position.y / r, cam.position.z / r) + 1.4;
    if (r < floor) cam.position.multiplyScalar(floor / r);
    cam.up.copy(up).multiplyScalar(Math.sin(tilt)).addScaledVector(this.fwd, Math.cos(tilt)).normalize();
    cam.lookAt(px, py, pz);
    cam.near = Math.max(0.3, this.dist * 0.03);
    cam.far = this.dist + R * 3.2;
    cam.updateProjectionMatrix();
    this.inAir = 1 - smooth(16, 75, cam.position.length() - R);
  }
}
