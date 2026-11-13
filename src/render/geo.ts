/** Small helpers for building the low-poly models out of coloured primitives. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export interface PartOpts {
  /** Position. */
  p?: [number, number, number];
  /** Scale. */
  s?: [number, number, number] | number;
  /** Rotation in radians (x, y, z). */
  r?: [number, number, number];
}

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();

/** Paints a primitive one colour and moves it into place. */
export function part(geo: THREE.BufferGeometry, color: number, o: PartOpts = {}): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute("uv");
  const s = typeof o.s === "number" ? [o.s, o.s, o.s] : (o.s ?? [1, 1, 1]);
  e.set(o.r?.[0] ?? 0, o.r?.[1] ?? 0, o.r?.[2] ?? 0);
  q.setFromEuler(e);
  m.compose(new THREE.Vector3(...(o.p ?? [0, 0, 0])), q, new THREE.Vector3(s[0], s[1], s[2]));
  g.applyMatrix4(m);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

export function join(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  return g;
}

export const ball = (detail = 1): THREE.BufferGeometry => new THREE.IcosahedronGeometry(1, detail);
export const cone = (sides = 6): THREE.BufferGeometry => new THREE.ConeGeometry(1, 1, sides);
export const tube = (sides = 6, top = 1): THREE.BufferGeometry => new THREE.CylinderGeometry(top, 1, 1, sides);
export const box = (): THREE.BufferGeometry => new THREE.BoxGeometry(1, 1, 1);
