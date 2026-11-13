/**
 * The creatures, drawn as instanced low-poly models: one draw call per kind
 * however many there are. Movement is smoothed between simulation steps, and
 * each state (walking, eating, sleeping, fleeing, playing, grieving) has its
 * own way of moving. From orbit they are drawn as points of light instead.
 */
import * as THREE from "three";
import { DAY, KITH, N_SPECIES, R, SPECIES } from "../engine/config";
import type { World } from "../engine/types";
import { sunAt } from "../engine/world";
import { ball, box, cone, join, part, tube } from "./geo";
import type { Globe } from "./globe";

const CAP = 820;
const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const e = new THREE.Euler(0, 0, 0, "YXZ");
const s = new THREE.Vector3();
const p = new THREE.Vector3();
const vx = new THREE.Vector3();
const vy = new THREE.Vector3();
const vz = new THREE.Vector3();
const off = new THREE.Vector3();
const col = new THREE.Color();
const HALF_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/** Cloak colours a kith family line can carry. */
const CLOAKS = [0xd9a441, 0xc65d3b, 0x9a5a86, 0x5a6aa8, 0x4f8f8c, 0x7c9a4a].map((c) => new THREE.Color(c));
export function cloakColor(hue: number, out = new THREE.Color()): THREE.Color {
  const f = ((hue + 1) / 2) * (CLOAKS.length - 1);
  const i = Math.min(CLOAKS.length - 2, Math.floor(f));
  return out.copy(CLOAKS[i]).lerp(CLOAKS[i + 1], f - i);
}

export interface Seen {
  /** Where it is drawn, in scene units. */
  x: number; y: number; z: number;
  /** Smoothed direction from the planet's middle, and facing. */
  ux: number; uy: number; uz: number;
  hx: number; hy: number; hz: number;
  phase: number;
  turn: number;
  frame: number;
}

function dappleGeo(): THREE.BufferGeometry {
  const body = 0xead9b2, spot = 0xb98b5a, leg = 0x7a5a40;
  return join([
    part(ball(1), body, { s: [0.4, 0.36, 0.52], p: [0, 0.52, 0] }),
    part(ball(1), 0xf4e8cc, { s: [0.23, 0.22, 0.24], p: [0, 0.66, 0.5] }),
    part(ball(0), 0x8a6a4c, { s: [0.1, 0.08, 0.1], p: [0, 0.6, 0.71] }),
    part(cone(4), spot, { s: [0.07, 0.2, 0.05], p: [0.15, 0.88, 0.44], r: [0, 0, -0.5] }),
    part(cone(4), spot, { s: [0.07, 0.2, 0.05], p: [-0.15, 0.88, 0.44], r: [0, 0, 0.5] }),
    part(ball(0), spot, { s: [0.17, 0.08, 0.2], p: [0.14, 0.82, -0.08] }),
    part(ball(0), spot, { s: [0.13, 0.07, 0.14], p: [-0.2, 0.78, 0.14] }),
    part(ball(0), spot, { s: [0.11, 0.06, 0.12], p: [-0.06, 0.82, -0.3] }),
    part(tube(5), leg, { s: [0.07, 0.3, 0.07], p: [0.2, 0.15, 0.26] }),
    part(tube(5), leg, { s: [0.07, 0.3, 0.07], p: [-0.2, 0.15, 0.26] }),
    part(tube(5), leg, { s: [0.07, 0.3, 0.07], p: [0.2, 0.15, -0.26] }),
    part(tube(5), leg, { s: [0.07, 0.3, 0.07], p: [-0.2, 0.15, -0.26] }),
    part(ball(0), 0xf4e8cc, { s: 0.09, p: [0, 0.6, -0.54] }),
    part(ball(0), 0x1d1a16, { s: 0.035, p: [0.13, 0.72, 0.68] }),
    part(ball(0), 0x1d1a16, { s: 0.035, p: [-0.13, 0.72, 0.68] }),
  ]);
}

function russetGeo(): THREE.BufferGeometry {
  const coat = 0xb9552b, dark = 0x4a2c1e, pale = 0xead0b0;
  return join([
    part(ball(1), coat, { s: [0.28, 0.28, 0.66], p: [0, 0.62, 0] }),
    part(ball(0), pale, { s: [0.2, 0.14, 0.5], p: [0, 0.48, 0.04] }),
    part(ball(1), coat, { s: [0.22, 0.2, 0.24], p: [0, 0.8, 0.66] }),
    part(cone(5), pale, { s: [0.11, 0.26, 0.11], p: [0, 0.74, 0.93], r: [Math.PI / 2, 0, 0] }),
    part(ball(0), 0x1d1a16, { s: 0.045, p: [0, 0.75, 1.06] }),
    part(cone(4), dark, { s: [0.08, 0.24, 0.06], p: [0.13, 1.03, 0.6] }),
    part(cone(4), dark, { s: [0.08, 0.24, 0.06], p: [-0.13, 1.03, 0.6] }),
    part(tube(5), dark, { s: [0.055, 0.44, 0.055], p: [0.17, 0.22, 0.4] }),
    part(tube(5), dark, { s: [0.055, 0.44, 0.055], p: [-0.17, 0.22, 0.4] }),
    part(tube(5), dark, { s: [0.055, 0.44, 0.055], p: [0.17, 0.22, -0.4] }),
    part(tube(5), dark, { s: [0.055, 0.44, 0.055], p: [-0.17, 0.22, -0.4] }),
    part(tube(5, 0.5), coat, { s: [0.1, 0.62, 0.1], p: [0, 0.78, -0.88], r: [-1.05, 0, 0] }),
    part(ball(0), pale, { s: 0.1, p: [0, 0.94, -1.16] }),
    part(ball(0), 0xf3d37a, { s: 0.035, p: [0.11, 0.86, 0.84] }),
    part(ball(0), 0xf3d37a, { s: 0.035, p: [-0.11, 0.86, 0.84] }),
  ]);
}

/** Body of a flier. White parts take the instance colour, so one shape serves skims and kests. */
function birdGeo(): THREE.BufferGeometry {
  return join([
    part(ball(1), 0xffffff, { s: [0.15, 0.14, 0.3], p: [0, 0.2, 0] }),
    part(ball(0), 0xb9c9d6, { s: [0.13, 0.08, 0.26], p: [0, 0.27, -0.03] }),
    part(ball(0), 0xffffff, { s: 0.11, p: [0, 0.3, 0.27] }),
    part(cone(4), 0xe07a2a, { s: [0.035, 0.2, 0.035], p: [0, 0.29, 0.44], r: [Math.PI / 2, 0, 0] }),
    part(box(), 0x9fb3c4, { s: [0.14, 0.02, 0.22], p: [0, 0.2, -0.36] }),
    part(ball(0), 0x1d1a16, { s: 0.025, p: [0.07, 0.33, 0.33] }),
    part(ball(0), 0x1d1a16, { s: 0.025, p: [-0.07, 0.33, 0.33] }),
  ]);
}

/** One wing, hinged at the origin, reaching out along +x. */
function wingGeo(): THREE.BufferGeometry {
  return join([
    part(box(), 0xc4d2de, { s: [0.34, 0.02, 0.22], p: [0.19, 0, 0] }),
    part(box(), 0x8ea2b4, { s: [0.24, 0.02, 0.15], p: [0.46, 0, -0.03] }),
  ]);
}

/** A sea drifter: a soft bell with trailing arms. */
function glimGeo(): THREE.BufferGeometry {
  const parts = [
    part(ball(1), 0x8fe3d6, { s: [0.3, 0.2, 0.3], p: [0, 0.32, 0] }),
    part(ball(0), 0xd9fff6, { s: [0.17, 0.1, 0.17], p: [0, 0.4, 0] }),
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(part(tube(4, 0.3), 0x5fc7c0, { s: [0.035, 0.42, 0.035], p: [Math.cos(a) * 0.17, 0.04, Math.sin(a) * 0.17], r: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3] }));
  }
  return join(parts);
}

/** A long-armed forager: heavy shoulders, small head, a curl of tail. */
function murrGeo(): THREE.BufferGeometry {
  const coat = 0x6f7f95, pale = 0xcfd6dc, dark = 0x3b4553;
  return join([
    part(ball(1), coat, { s: [0.3, 0.3, 0.36], p: [0, 0.5, -0.02] }),
    part(ball(0), pale, { s: [0.2, 0.2, 0.16], p: [0, 0.46, 0.2] }),
    part(ball(1), coat, { s: [0.19, 0.18, 0.19], p: [0, 0.86, 0.14] }),
    part(ball(0), pale, { s: [0.12, 0.1, 0.1], p: [0, 0.82, 0.29] }),
    part(ball(0), dark, { s: [0.07, 0.09, 0.03], p: [0.2, 0.92, 0.12] }),
    part(ball(0), dark, { s: [0.07, 0.09, 0.03], p: [-0.2, 0.92, 0.12] }),
    part(tube(5, 0.7), dark, { s: [0.07, 0.56, 0.07], p: [0.3, 0.3, 0.12], r: [0.25, 0, 0.18] }),
    part(tube(5, 0.7), dark, { s: [0.07, 0.56, 0.07], p: [-0.3, 0.3, 0.12], r: [0.25, 0, -0.18] }),
    part(tube(5), dark, { s: [0.08, 0.26, 0.08], p: [0.14, 0.13, -0.14] }),
    part(tube(5), dark, { s: [0.08, 0.26, 0.08], p: [-0.14, 0.13, -0.14] }),
    part(tube(5, 0.5), coat, { s: [0.05, 0.4, 0.05], p: [0, 0.6, -0.42], r: [-0.9, 0, 0] }),
    part(ball(0), pale, { s: 0.07, p: [0, 0.8, -0.56] }),
    part(ball(0), 0x1d1a16, { s: 0.03, p: [0.07, 0.88, 0.31] }),
    part(ball(0), 0x1d1a16, { s: 0.03, p: [-0.07, 0.88, 0.31] }),
  ]);
}

/** The part of a kith that takes its family colour: cloak, hood crest, sleeves. */
function cloakGeo(): THREE.BufferGeometry {
  return join([
    part(tube(7, 0.46), 0xffffff, { s: [0.27, 0.56, 0.27], p: [0, 0.3, 0] }),
    part(ball(0), 0xffffff, { s: [0.2, 0.12, 0.2], p: [0, 0.58, 0] }),
    part(cone(5), 0xe6e6e6, { s: [0.2, 0.3, 0.2], p: [0, 0.99, -0.07], r: [-0.5, 0, 0] }),
    part(ball(0), 0xe9e9e9, { s: [0.07, 0.13, 0.07], p: [0.23, 0.4, 0.03] }),
    part(ball(0), 0xe9e9e9, { s: [0.07, 0.13, 0.07], p: [-0.23, 0.4, 0.03] }),
  ]);
}

/** The rest of a kith: face, eyes, feet. */
function faceGeo(): THREE.BufferGeometry {
  return join([
    part(ball(1), 0xf1dcbb, { s: 0.2, p: [0, 0.8, 0.02] }),
    part(ball(0), 0x1d1a16, { s: 0.032, p: [0.075, 0.82, 0.2] }),
    part(ball(0), 0x1d1a16, { s: 0.032, p: [-0.075, 0.82, 0.2] }),
    part(ball(0), 0x3b2c22, { s: [0.08, 0.05, 0.11], p: [0.1, 0.03, 0.05] }),
    part(ball(0), 0x3b2c22, { s: [0.08, 0.05, 0.11], p: [-0.1, 0.03, 0.05] }),
  ]);
}

/** Colours of the points of light seen from orbit, by tier of mind. */
const DOTS = [new THREE.Color(0xf2eee5), new THREE.Color(0xf3c24f), new THREE.Color(0xff6a2c)];

export class Critters {
  private meshes: THREE.InstancedMesh[] = [];
  private faces: THREE.InstancedMesh;
  private wingL: THREE.InstancedMesh;
  private wingR: THREE.InstancedMesh;
  private wood: THREE.InstancedMesh;
  private torch: THREE.InstancedMesh;
  private talk: THREE.InstancedMesh;
  private glow: THREE.InstancedMesh;
  private dots: THREE.Points;
  private seen = new Map<number, Seen>();
  private frame = 0;

  constructor(scene: THREE.Scene) {
    const mat = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
    const make = (g: THREE.BufferGeometry, shadow = true, material: THREE.Material = mat()): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(g, material, CAP);
      mesh.count = 0;
      mesh.castShadow = shadow;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      return mesh;
    };
    const bird = birdGeo();
    const glimMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.4, transparent: true, opacity: 0.86, emissive: 0x2fbfae, emissiveIntensity: 0.35 });
    this.meshes = [make(dappleGeo()), make(russetGeo()), make(bird), make(glimGeo(), false, glimMat), make(murrGeo()), make(bird), make(cloakGeo())];
    this.faces = make(faceGeo(), false);
    this.wingL = make(wingGeo(), false);
    this.wingR = make(wingGeo(), false);
    this.wood = make(join([part(tube(5), 0x6b4a33, { s: [0.06, 0.5, 0.06], r: [0, 0, Math.PI / 2], p: [0, 0.62, -0.26] })]), false);
    this.torch = make(
      join([part(tube(4), 0x5a4030, { s: [0.025, 0.5, 0.025], p: [0.3, 0.62, 0.1] }), part(cone(5), 0xffb347, { s: [0.07, 0.2, 0.07], p: [0.3, 0.95, 0.1] })]),
      false, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    );
    this.talk = make(
      join([part(ball(0), 0xffffff, { s: [0.13, 0.1, 0.05] }), part(cone(3), 0xffffff, { s: [0.05, 0.1, 0.03], p: [-0.06, -0.11, 0], r: [0, 0, Math.PI] })]),
      false, new THREE.MeshBasicMaterial({ color: 0xf2eee5, toneMapped: false }),
    );
    this.glow = make(ball(1), false, new THREE.MeshBasicMaterial({ color: 0x66ffe0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(CAP * 3), 3));
    dg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(CAP * 3), 3));
    this.dots = new THREE.Points(dg, new THREE.PointsMaterial({ size: 3.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }));
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 6;
    scene.add(this.dots);
  }

  reset(): void {
    this.seen.clear();
  }

  /** Where a creature is drawn right now, if it is. */
  where(id: number): Seen | undefined {
    return this.seen.get(id);
  }

  update(w: World, dt: number, time: number, camDist: number, globe: Globe): void {
    this.frame++;
    const counts = new Array(N_SPECIES).fill(0);
    let woods = 0, talks = 0, torches = 0, glows = 0, birds = 0, dots = 0;
    // From far away, draw them larger than life so they can still be seen; from orbit, as points.
    const big = Math.min(3.2, Math.max(1.2, camDist / 50));
    const models = camDist < 250;
    const dotPos = (this.dots.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const dotCol = (this.dots.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array;
    const ease = Math.min(1, dt * 10);
    for (const c of w.creatures) {
      const def = SPECIES[c.sp];
      let sn = this.seen.get(c.id);
      if (!sn) {
        sn = { x: 0, y: 0, z: 0, ux: c.x, uy: c.y, uz: c.z, hx: c.hx, hy: c.hy, hz: c.hz, phase: (c.id * 1.7) % 6.28, turn: 0, frame: this.frame };
        this.seen.set(c.id, sn);
      }
      sn.frame = this.frame;
      // Ease towards where the engine has it, staying on the sphere.
      sn.ux += (c.x - sn.ux) * ease;
      sn.uy += (c.y - sn.uy) * ease;
      sn.uz += (c.z - sn.uz) * ease;
      const ul = Math.hypot(sn.ux, sn.uy, sn.uz);
      sn.ux /= ul;
      sn.uy /= ul;
      sn.uz /= ul;
      const k = Math.min(1, dt * 7);
      const ohx = sn.hx, ohy = sn.hy, ohz = sn.hz;
      sn.hx += (c.hx - sn.hx) * k;
      sn.hy += (c.hy - sn.hy) * k;
      sn.hz += (c.hz - sn.hz) * k;
      const hd = sn.hx * sn.ux + sn.hy * sn.uy + sn.hz * sn.uz;
      sn.hx -= hd * sn.ux;
      sn.hy -= hd * sn.uy;
      sn.hz -= hd * sn.uz;
      const hl = Math.hypot(sn.hx, sn.hy, sn.hz) || 1;
      sn.hx /= hl;
      sn.hy /= hl;
      sn.hz /= hl;
      // How hard it is turning: fliers bank into it.
      vy.set(sn.ux, sn.uy, sn.uz);
      const turning = (ohy * sn.hz - ohz * sn.hy) * sn.ux + (ohz * sn.hx - ohx * sn.hz) * sn.uy + (ohx * sn.hy - ohy * sn.hx) * sn.uz;
      sn.turn += (turning / Math.max(dt, 0.001) - sn.turn) * Math.min(1, dt * 3);

      let ground = globe.heightAt(sn.ux, sn.uy, sn.uz);
      let swim = false;
      if (def.air) ground = Math.max(ground, 0) + c.alt * 1.15 + (c.alt > 0.5 ? Math.sin(time * 1.7 + c.id) * 0.25 : 0);
      else if (def.sea) ground = Math.min(-0.25, Math.max(ground + 0.3, -0.9)) + Math.sin(time * 1.1 + c.id) * 0.08;
      else if (ground < -0.15) {
        swim = true;
        ground = -0.3;
      }
      const rr = R + ground;
      sn.x = sn.ux * rr;
      sn.y = sn.uy * rr;
      sn.z = sn.uz * rr;
      if (dots < CAP) {
        dotPos[dots * 3] = sn.ux * (rr + 0.8);
        dotPos[dots * 3 + 1] = sn.uy * (rr + 0.8);
        dotPos[dots * 3 + 2] = sn.uz * (rr + 0.8);
        const dc = DOTS[def.tier];
        dotCol[dots * 3] = dc.r;
        dotCol[dots * 3 + 1] = dc.g;
        dotCol[dots * 3 + 2] = dc.b;
        dots++;
      }
      if (!models) continue;

      sn.phase += dt * (2 + c.pace * (c.state === 4 ? 12 : 9));
      const age = (w.t - c.born) / DAY;
      const grown = Math.min(1, 0.5 + 0.5 * (age / def.adultAt));
      const size = grown * c.traits.size * big * (c.sp === 1 ? 1.05 : c.sp === KITH ? 1.1 : 1);
      const st = c.state;
      let lift = 0, pitch = 0, roll = 0, yaw = 0, sy = 1, sxz = 1;
      if (def.air) {
        const flying = c.alt > 0.6;
        pitch = flying ? -0.08 + (st === 1 ? 0.5 : 0) : 0;
        roll = flying ? Math.max(-0.7, Math.min(0.7, -sn.turn * 0.5)) + Math.sin(time * 0.9 + c.id) * 0.1 : 0;
      } else if (def.sea) {
        const beat = Math.sin(time * 2.4 + c.id);
        sy = 1 + beat * 0.16;
        sxz = 1 - beat * 0.09;
        pitch = 0.5 * c.pace;
      } else if (st === 3) {
        sy = 0.72 + Math.sin(time * 1.5 + c.id) * 0.025;
        sxz = 1.06;
      } else if (st === 8) {
        pitch = 0.4;
        roll = Math.sin(time * 0.8 + c.id) * 0.04;
        sy = 0.92;
      } else if (swim) {
        lift = Math.sin(time * 3 + c.id) * 0.04;
        pitch = -0.12;
      } else {
        const moving = Math.min(1, c.pace * 1.6);
        const hop = Math.abs(Math.sin(sn.phase));
        const young = grown < 0.95 ? 1.3 : 1;
        lift = hop * (c.sp === KITH ? 0.07 : 0.11) * moving * size * young;
        // Stretch going up, squash on landing: it gives them weight.
        const stretch = Math.sin(sn.phase * 2) * 0.09 * moving;
        sy = 1 + stretch;
        sxz = 1 - stretch * 0.5;
        roll = Math.sin(sn.phase) * (c.sp === KITH ? 0.1 : 0.06) * moving;
        pitch = c.pace * (st === 4 ? 0.22 : 0.1) + (st === 1 && c.sp !== KITH ? 0.42 + Math.sin(time * 9 + c.id) * 0.08 : 0);
        if (st === 6) lift += Math.abs(Math.sin(time * 5 + c.id)) * 0.05;
        if (st === 7) {
          lift += Math.abs(Math.sin(time * 7 + c.id)) * 0.25 * size;
          yaw = Math.sin(time * 3 + c.id) * 0.8;
        }
        if (st === 9) {
          pitch = 0.25 + Math.abs(Math.sin(time * 6 + c.id)) * 0.25;
          sy = 0.9;
        }
        if (st === 1 && c.sp === KITH) pitch = 0.3 + Math.sin(time * 6 + c.id) * 0.06;
      }
      vz.set(sn.hx, sn.hy, sn.hz);
      vx.crossVectors(vy, vz);
      m.makeBasis(vx, vy, vz);
      q.setFromRotationMatrix(m);
      e.set(pitch, yaw, roll);
      q.multiply(q2.setFromEuler(e));
      p.set(sn.x + sn.ux * lift, sn.y + sn.uy * lift, sn.z + sn.uz * lift);
      s.set(size * sxz, size * sy, size * sxz);
      m.compose(p, q, s);
      const i = counts[c.sp]++;
      if (i >= CAP) continue;
      const mesh = this.meshes[c.sp];
      mesh.setMatrixAt(i, m);
      if (c.sp === KITH) {
        cloakColor(c.traits.hue, col);
        this.faces.setMatrixAt(i, m);
        if (c.carrying && woods < CAP) this.wood.setMatrixAt(woods++, m);
        if (c.knows & (1 << 11) && sunAt(w, c.x, c.y, c.z) < 0.1 && torches < CAP) this.torch.setMatrixAt(torches++, m);
        if (st === 6 && talks < CAP) {
          const up = 1.45 * size + Math.sin(time * 4 + c.id) * 0.05;
          off.set(sn.ux * up, sn.uy * up, sn.uz * up);
          m.compose(p.add(off), q, s.setScalar(size * 1.5));
          this.talk.setMatrixAt(talks++, m);
        }
      } else if (c.sp === 5) col.setRGB(0.2, 0.2, 0.26);
      else if (c.sp === 2) col.setRGB(0.96, 0.95, 0.92);
      else {
        // A little natural variety in the coat.
        const v = 1 + c.traits.hue * 0.12;
        col.setRGB(v * (1 + c.traits.hue * 0.05), v, v * (1 - c.traits.hue * 0.08));
      }
      if (c.health < 0.6 && c.sp !== KITH) col.multiplyScalar(0.8 + c.health * 0.33);
      mesh.setColorAt(i, col);
      if (def.sea && glows < CAP) {
        // The glow shows in the dark.
        const dark = Math.max(0, Math.min(1, (0.15 - sunAt(w, c.x, c.y, c.z)) / 0.3));
        if (dark > 0.02) {
          m.compose(p, q, s.setScalar(size * (0.9 + 0.2 * Math.sin(time * 2.4 + c.id)) * dark));
          this.glow.setMatrixAt(glows++, m);
        }
      }
      if (def.air && birds < CAP) {
        // Wings: hinged at the shoulders, beating when in the air.
        const flap = c.alt > 0.6 ? Math.sin(time * (c.sp === 5 ? 9 : 13) + c.id * 2) * 0.75 + 0.1 : -1.25;
        const wsz = size * (c.sp === 5 ? 1.25 : 1);
        for (const side of [1, -1]) {
          e.set(0, 0, side * flap);
          q2.setFromEuler(e);
          if (side < 0) q2.multiply(HALF_TURN);
          off.set(side * 0.1 * size, 0.24 * size, 0).applyQuaternion(q);
          m.compose(vx.copy(p).add(off), q.clone().multiply(q2), s.setScalar(wsz));
          const wing = side > 0 ? this.wingR : this.wingL;
          wing.setMatrixAt(birds, m);
          wing.setColorAt(birds, c.sp === 5 ? col.setRGB(0.22, 0.22, 0.28) : col.setRGB(0.75, 0.82, 0.88));
        }
        birds++;
      }
    }
    for (let sp = 0; sp < N_SPECIES; sp++) {
      const mesh = this.meshes[sp];
      mesh.count = models ? Math.min(CAP, counts[sp]) : 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    const set = (mesh: THREE.InstancedMesh, n: number): void => {
      mesh.count = models ? n : 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    set(this.faces, this.meshes[KITH].count);
    set(this.wingL, birds);
    set(this.wingR, birds);
    set(this.wood, woods);
    set(this.torch, torches);
    set(this.talk, talks);
    set(this.glow, glows);
    this.dots.geometry.setDrawRange(0, dots);
    this.dots.geometry.attributes.position.needsUpdate = true;
    this.dots.geometry.attributes.color.needsUpdate = true;
    const dm = this.dots.material as THREE.PointsMaterial;
    dm.opacity = Math.max(0, Math.min(1, (camDist - 95) / 90));
    this.dots.visible = dm.opacity > 0.01;
    if (this.frame % 120 === 0) for (const [id, sn] of this.seen) if (sn.frame !== this.frame) this.seen.delete(id);
  }
}
