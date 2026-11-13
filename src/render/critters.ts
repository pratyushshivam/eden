/**
 * The creatures, drawn as instanced low-poly models: one draw call per kind
 * however many there are. Movement is smoothed between simulation steps.
 */
import * as THREE from "three";
import { BIRD, DAY, KITH, N, PREDATOR, SPECIES } from "../engine/config";
import { LAKE, RIVER, cellOf, heightAt } from "../engine/terrain";
import type { World } from "../engine/types";
import { ball, box, cone, join, part, tube } from "./geo";

const CAP = 560;
const H = N / 2;
const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const e = new THREE.Euler(0, 0, 0, "YXZ");
const s = new THREE.Vector3();
const p = new THREE.Vector3();
const col = new THREE.Color();

/** Cloak colours a kith family line can carry. */
const CLOAKS = [0xd9a441, 0xc65d3b, 0x9a5a86, 0x5a6aa8, 0x4f8f8c, 0x7c9a4a].map((c) => new THREE.Color(c));
export function cloakColor(hue: number, out = new THREE.Color()): THREE.Color {
  const f = ((hue + 1) / 2) * (CLOAKS.length - 1);
  const i = Math.min(CLOAKS.length - 2, Math.floor(f));
  return out.copy(CLOAKS[i]).lerp(CLOAKS[i + 1], f - i);
}

interface Seen {
  x: number;
  y: number;
  z: number;
  yaw: number;
  phase: number;
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

function skimGeo(): THREE.BufferGeometry {
  return join([
    part(ball(1), 0xf5f2ea, { s: [0.15, 0.14, 0.3], p: [0, 0.2, 0] }),
    part(ball(0), 0x6c8ca6, { s: [0.13, 0.08, 0.26], p: [0, 0.27, -0.03] }),
    part(ball(0), 0xf5f2ea, { s: 0.11, p: [0, 0.3, 0.27] }),
    part(cone(4), 0xe07a2a, { s: [0.035, 0.2, 0.035], p: [0, 0.29, 0.44], r: [Math.PI / 2, 0, 0] }),
    part(box(), 0x4f6a82, { s: [0.14, 0.02, 0.22], p: [0, 0.2, -0.36] }),
    part(ball(0), 0x1d1a16, { s: 0.025, p: [0.07, 0.33, 0.33] }),
    part(ball(0), 0x1d1a16, { s: 0.025, p: [-0.07, 0.33, 0.33] }),
  ]);
}

/** One wing, hinged at the origin, reaching out along +x. */
function wingGeo(): THREE.BufferGeometry {
  return join([
    part(box(), 0x6c8ca6, { s: [0.34, 0.02, 0.22], p: [0.19, 0, 0] }),
    part(box(), 0x3d5469, { s: [0.24, 0.02, 0.15], p: [0.46, 0, -0.03] }),
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

export class Critters {
  private meshes: THREE.InstancedMesh[] = [];
  private faces: THREE.InstancedMesh;
  private wingL: THREE.InstancedMesh;
  private wingR: THREE.InstancedMesh;
  private wood: THREE.InstancedMesh;
  private talk: THREE.InstancedMesh;
  private seen = new Map<number, Seen>();
  private frame = 0;

  constructor(scene: THREE.Scene) {
    const mat = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
    const make = (g: THREE.BufferGeometry, shadow = true): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(g, mat(), CAP);
      mesh.count = 0;
      mesh.castShadow = shadow;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      return mesh;
    };
    this.meshes = [make(dappleGeo()), make(russetGeo()), make(skimGeo()), make(cloakGeo())];
    this.faces = make(faceGeo(), false);
    this.wingL = make(wingGeo(), false);
    this.wingR = make(wingGeo(), false);
    this.wood = make(join([part(tube(5), 0x6b4a33, { s: [0.06, 0.5, 0.06], r: [0, 0, Math.PI / 2], p: [0, 0.62, -0.26] })]), false);
    this.talk = new THREE.InstancedMesh(
      join([part(ball(0), 0xffffff, { s: [0.13, 0.1, 0.05] }), part(cone(3), 0xffffff, { s: [0.05, 0.1, 0.03], p: [-0.06, -0.11, 0], r: [0, 0, Math.PI] })]),
      new THREE.MeshBasicMaterial({ color: 0xf2eee5, toneMapped: false }), 80,
    );
    this.talk.count = 0;
    this.talk.frustumCulled = false;
    scene.add(this.talk);
  }

  reset(): void {
    this.seen.clear();
  }

  /** Where a creature is drawn right now (scene units), if it is. */
  where(id: number): Seen | undefined {
    return this.seen.get(id);
  }

  update(w: World, dt: number, time: number, camDist: number): void {
    const t = w.terrain;
    this.frame++;
    const counts = [0, 0, 0, 0];
    let woods = 0, talks = 0;
    // From far away, draw them a little larger than life so they can still be seen.
    const big = Math.min(2.5, Math.max(1.15, camDist / 52));
    const ease = Math.min(1, dt * 10);
    for (const c of w.creatures) {
      const def = SPECIES[c.sp];
      const cell = cellOf(c.x, c.y);
      let ground = heightAt(t, c.x, c.y);
      const k = t.kind[cell];
      let swim = 0;
      if (c.sp !== BIRD) {
        const level = k === LAKE ? t.lake.level : k === RIVER ? ground + 0.22 : 0;
        if ((k === LAKE || k === RIVER || ground < 0) && ground < level - 0.2) {
          swim = 1;
          ground = level - 0.3;
        }
      } else ground = Math.max(ground, 0) + c.z * 1.15 + (c.z > 0.5 ? Math.sin(time * 1.7 + c.id) * 0.25 : 0);
      let sn = this.seen.get(c.id);
      const yawTo = Math.atan2(c.hx, c.hy);
      if (!sn) {
        sn = { x: c.x - H, y: ground, z: c.y - H, yaw: yawTo, phase: (c.id * 1.7) % 6.28, frame: this.frame };
        this.seen.set(c.id, sn);
      }
      sn.frame = this.frame;
      sn.x += (c.x - H - sn.x) * ease;
      sn.z += (c.y - H - sn.z) * ease;
      sn.y += (ground - sn.y) * Math.min(1, dt * 8);
      let dy = yawTo - sn.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      sn.yaw += dy * Math.min(1, dt * 7);
      sn.phase += dt * (2 + c.pace * 9);

      const age = (w.t - c.born) / DAY;
      const grown = Math.min(1, 0.5 + 0.5 * (age / def.adultAt));
      const size = grown * c.traits.size * big * (c.sp === PREDATOR ? 1.05 : c.sp === KITH ? 1.1 : 1);
      const resting = c.state === 3;
      const eating = c.state === 1;
      let lift = 0, pitch = 0, roll = 0, squash = 1;
      if (c.sp === BIRD) {
        const flying = c.z > 0.6;
        pitch = flying ? -0.08 + (eating ? 0.5 : 0) : 0;
        roll = flying ? Math.sin(time * 0.9 + c.id) * 0.18 : 0;
      } else if (resting) {
        squash = 0.74 + Math.sin(time * 1.6 + c.id) * 0.02;
      } else if (swim) {
        lift = Math.sin(time * 3 + c.id) * 0.04;
        pitch = -0.12;
      } else {
        const hop = Math.abs(Math.sin(sn.phase));
        lift = hop * (c.sp === KITH ? 0.07 : 0.11) * Math.min(1, c.pace * 1.6) * size;
        roll = Math.sin(sn.phase) * 0.07 * Math.min(1, c.pace * 2);
        pitch = c.pace * 0.1 + (eating && c.sp !== KITH ? 0.42 + Math.sin(time * 9 + c.id) * 0.08 : 0);
        if (c.state === 6) lift += Math.abs(Math.sin(time * 5 + c.id)) * 0.05;
      }
      e.set(pitch, sn.yaw, roll);
      q.setFromEuler(e);
      p.set(sn.x, sn.y + lift, sn.z);
      s.set(size, size * squash, size);
      m.compose(p, q, s);
      const i = counts[c.sp]++;
      if (i >= CAP) continue;
      const mesh = this.meshes[c.sp];
      mesh.setMatrixAt(i, m);
      if (c.sp === KITH) {
        cloakColor(c.traits.hue, col);
        this.faces.setMatrixAt(i, m);
        if (c.carrying && woods < CAP) this.wood.setMatrixAt(woods++, m);
        if (c.state === 6 && talks < 80) {
          p.y += 1.45 * size + Math.sin(time * 4 + c.id) * 0.05;
          s.setScalar(size * 1.5);
          m.compose(p, q, s);
          this.talk.setMatrixAt(talks++, m);
        }
      } else {
        // A little natural variety in the coat.
        const v = 1 + c.traits.hue * 0.12;
        col.setRGB(v * (1 + c.traits.hue * 0.05), v, v * (1 - c.traits.hue * 0.08));
        if (c.health < 0.6) col.multiplyScalar(0.8 + c.health * 0.33);
      }
      mesh.setColorAt(i, col);
      if (c.sp === BIRD) {
        // Wings: hinged at the shoulders, beating when in the air.
        const flap = c.z > 0.6 ? Math.sin(time * 13 + c.id * 2) * 0.75 + 0.1 : -1.25;
        for (const side of [1, -1]) {
          e.set(0, 0, side * flap);
          q2.setFromEuler(e);
          if (side < 0) q2.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
          const off = new THREE.Vector3(side * 0.1 * size, 0.24 * size, 0).applyQuaternion(q);
          m.compose(new THREE.Vector3(sn.x, sn.y + lift, sn.z).add(off), q.clone().multiply(q2), s);
          (side > 0 ? this.wingR : this.wingL).setMatrixAt(i, m);
        }
      }
    }
    for (let sp = 0; sp < 4; sp++) {
      const mesh = this.meshes[sp];
      mesh.count = Math.min(CAP, counts[sp]);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.faces.count = this.meshes[KITH].count;
    this.faces.instanceMatrix.needsUpdate = true;
    this.wingL.count = this.wingR.count = this.meshes[BIRD].count;
    this.wingL.instanceMatrix.needsUpdate = true;
    this.wingR.instanceMatrix.needsUpdate = true;
    this.wood.count = woods;
    this.wood.instanceMatrix.needsUpdate = true;
    this.talk.count = talks;
    this.talk.instanceMatrix.needsUpdate = true;
    if (this.frame % 120 === 0) for (const [id, sn] of this.seen) if (sn.frame !== this.frame) this.seen.delete(id);
  }
}

