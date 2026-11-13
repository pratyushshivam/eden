/**
 * The planet's shape for drawing: the engine's grid of cells turned into a
 * smooth mesh, with heights and colours blended across cell corners.
 */
import * as THREE from "three";
import { DAY, GRID, R, YEAR_DAYS } from "../engine/config";
import { CELLS, cellOf, facePoint, grid } from "../engine/sphere";
import { BEACH, DESERT, FOREST, ICE, JUNGLE, LAKE, MOUNTAIN, PLAINS, RIVER, SEA, SHALLOW, TUNDRA, type Terrain } from "../engine/terrain";
import type { World } from "../engine/types";
import { regionOf } from "../engine/world";

const G = GRID;
const G1 = G + 1;
const VERTS = 6 * G1 * G1;
const STEP = 2 / G;

/** Which face a direction is on, and where on it (0..G in each direction). */
function faceUV(x: number, y: number, z: number, out: number[]): void {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let f: number, u: number, v: number;
  if (ax >= ay && ax >= az) {
    if (x > 0) { f = 0; u = -z / ax; v = y / ax; } else { f = 1; u = z / ax; v = y / ax; }
  } else if (ay >= az) {
    if (y > 0) { f = 2; u = x / ay; v = -z / ay; } else { f = 3; u = x / ay; v = z / ay; }
  } else if (z > 0) { f = 4; u = x / az; v = y / az; } else { f = 5; u = -x / az; v = y / az; }
  out[0] = f;
  out[1] = (u + 1) * 0.5 * G;
  out[2] = (v + 1) * 0.5 * G;
}

const C = (hex: number): THREE.Color => new THREE.Color(hex);
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Globe {
  /** Height at each mesh corner (the mean of the cells around it). */
  readonly cornerH = new Float32Array(VERTS);
  /** The cells around each corner. */
  private cornerCells = new Int32Array(VERTS * 4);
  readonly land: THREE.BufferGeometry;
  readonly sea: THREE.BufferGeometry;
  private colors: THREE.BufferAttribute;
  private face = 0;
  private tmp = [0, 0, 0];
  private col = new THREE.Color();
  private mix = new THREE.Color();

  constructor(private terrain: Terrain) {
    const t = terrain;
    const p = [0, 0, 0];
    const pos = new Float32Array(VERTS * 3);
    const seaPos = new Float32Array(VERTS * 3);
    const depth = new Float32Array(VERTS);
    const h = STEP / 2;
    for (let f = 0; f < 6; f++)
      for (let iy = 0; iy <= G; iy++)
        for (let ix = 0; ix <= G; ix++) {
          const vi = (f * G1 + iy) * G1 + ix;
          const u = -1 + ix * STEP, v = -1 + iy * STEP;
          let sum = 0;
          const quad = [[u - h, v - h], [u + h, v - h], [u - h, v + h], [u + h, v + h]];
          for (let k = 0; k < 4; k++) {
            facePoint(f, quad[k][0], quad[k][1], p);
            const c = cellOf(p[0], p[1], p[2]);
            this.cornerCells[vi * 4 + k] = c;
            sum += t.height[c];
          }
          this.cornerH[vi] = sum / 4;
        }
    // Positions, and a sea surface over the same grid.
    for (let f = 0; f < 6; f++)
      for (let iy = 0; iy <= G; iy++)
        for (let ix = 0; ix <= G; ix++) {
          const vi = (f * G1 + iy) * G1 + ix;
          facePoint(f, -1 + ix * STEP, -1 + iy * STEP, p);
          const l = Math.hypot(p[0], p[1], p[2]);
          const hh = Math.max(this.cornerH[vi], -3.5);
          for (let k = 0; k < 3; k++) {
            pos[vi * 3 + k] = (p[k] / l) * (R + hh);
            seaPos[vi * 3 + k] = (p[k] / l) * R;
          }
          depth[vi] = -this.cornerH[vi];
        }
    const idx = new Uint32Array(6 * G * G * 6);
    let q = 0;
    for (let f = 0; f < 6; f++)
      for (let iy = 0; iy < G; iy++)
        for (let ix = 0; ix < G; ix++) {
          const a = (f * G1 + iy) * G1 + ix, b = a + 1, c = a + G1, d = c + 1;
          // Faces 0, 3, 4 and 1, 2, 5 wind opposite ways; pick the order that faces outward.
          const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
          const e1x = pos[b * 3] - ax, e1y = pos[b * 3 + 1] - ay, e1z = pos[b * 3 + 2] - az;
          const e2x = pos[c * 3] - ax, e2y = pos[c * 3 + 1] - ay, e2z = pos[c * 3 + 2] - az;
          const out = (e1y * e2z - e1z * e2y) * ax + (e1z * e2x - e1x * e2z) * ay + (e1x * e2y - e1y * e2x) * az;
          if (out > 0) {
            idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c;
          } else {
            idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
          }
        }
    // Normals from the height field itself, so there is no seam where two faces meet.
    const nor = new Float32Array(VERTS * 3);
    const a3 = new THREE.Vector3(), b3 = new THREE.Vector3(), n3 = new THREE.Vector3();
    const at = (f: number, u: number, v: number, o: THREE.Vector3): void => {
      facePoint(f, u, v, p);
      const l = Math.hypot(p[0], p[1], p[2]);
      const hh = Math.max(this.heightAt(p[0] / l, p[1] / l, p[2] / l), -3.5);
      o.set((p[0] / l) * (R + hh), (p[1] / l) * (R + hh), (p[2] / l) * (R + hh));
    };
    for (let f = 0; f < 6; f++)
      for (let iy = 0; iy <= G; iy++)
        for (let ix = 0; ix <= G; ix++) {
          const vi = (f * G1 + iy) * G1 + ix;
          const u = -1 + ix * STEP, v = -1 + iy * STEP;
          at(f, u + STEP, v, a3);
          at(f, u - STEP, v, n3);
          a3.sub(n3);
          at(f, u, v + STEP, b3);
          at(f, u, v - STEP, n3);
          b3.sub(n3);
          n3.crossVectors(a3, b3).normalize();
          if (n3.x * pos[vi * 3] + n3.y * pos[vi * 3 + 1] + n3.z * pos[vi * 3 + 2] < 0) n3.negate();
          nor[vi * 3] = n3.x;
          nor[vi * 3 + 1] = n3.y;
          nor[vi * 3 + 2] = n3.z;
        }
    this.land = new THREE.BufferGeometry();
    this.land.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.land.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    this.colors = new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3);
    this.land.setAttribute("color", this.colors);
    this.land.setIndex(new THREE.BufferAttribute(idx, 1));
    this.sea = new THREE.BufferGeometry();
    this.sea.setAttribute("position", new THREE.BufferAttribute(seaPos, 3));
    this.sea.setAttribute("depth", new THREE.BufferAttribute(depth, 1));
    this.sea.setIndex(new THREE.BufferAttribute(idx, 1));
    this.land.computeBoundingSphere();
    this.sea.computeBoundingSphere();
  }

  /** Ground height in a direction, exactly as the mesh is drawn. */
  heightAt(x: number, y: number, z: number): number {
    const o = this.tmp;
    faceUV(x, y, z, o);
    const f = o[0];
    const fx = Math.min(G - 0.0001, Math.max(0, o[1])), fy = Math.min(G - 0.0001, Math.max(0, o[2]));
    const ix = fx | 0, iy = fy | 0, ax = fx - ix, ay = fy - iy;
    const a = (f * G1 + iy) * G1 + ix;
    const H = this.cornerH;
    return (H[a] * (1 - ax) + H[a + 1] * ax) * (1 - ay) + (H[a + G1] * (1 - ax) + H[a + G1 + 1] * ax) * ay;
  }

  /** Height to stand something on: the ground, or the water's surface over sea. */
  surfaceAt(x: number, y: number, z: number): number {
    return Math.max(this.heightAt(x, y, z), 0);
  }

  /** Repaints one face of the planet for the season and what has been eaten; call often and it cycles round. */
  paint(w: World, all = false): void {
    const t = this.terrain;
    const g = grid();
    const year = ((w.t / DAY) % YEAR_DAYS) / YEAR_DAYS;
    const swing = 9 * Math.sin((year - 0.125) * Math.PI * 2);
    const ramp = [C(0x8cc152), C(0x6fa446), C(0xb0a04a), C(0x98a184)];
    const arr = this.colors.array as Float32Array;
    const col = this.col, mix = this.mix;
    const dry = C(0xb9a36a), sand = C(0xe2d2a2), rock = C(0x8a8479), snow = C(0xf4f7fa), water = C(0x3b8fb5), dune = C(0xdab676), dune2 = C(0xc9965a);
    const steppe = C(0x9da27c), woods = C(0x4c7a3a), jungle = C(0x2c6b38), bed = C(0xa9c7a6), deepBed = C(0x1d4558), ice = C(0xeaf3f8);
    const grassFor = (north: boolean): THREE.Color => {
      const f = ((year + (north ? 0 : 0.5)) % 1) * 4 - 0.5;
      const a = ((Math.floor(f) % 4) + 4) % 4;
      return ramp[a].clone().lerp(ramp[(a + 1) % 4], smooth(0, 1, f - Math.floor(f)));
    };
    const gN = grassFor(true), gS = grassFor(false);
    const cellColor = (i: number, out: THREE.Color): number => {
      const k = t.kind[i];
      const hgt = t.height[i];
      const north = g.cy[i] >= 0;
      const grass = north ? gN : gS;
      const T = t.temp[i] + swing * g.cy[i];
      let weight = 1;
      if (k === SEA) out.copy(deepBed);
      else if (k === SHALLOW) out.copy(bed).lerp(deepBed, smooth(0, -1.2, hgt));
      else if (k === LAKE || k === RIVER) {
        out.copy(water);
        weight = 3;
      } else if (k === BEACH) out.copy(sand);
      else if (k === ICE) out.copy(ice);
      else if (k === DESERT) out.copy(dune).lerp(dune2, (i * 0.6180339) % 1);
      else if (k === MOUNTAIN) out.copy(rock).lerp(snow, smooth(6.5, 8.5, hgt + (10 - T) * 0.12));
      else {
        const fert = t.fert[i] || 0.01;
        const have = Math.min(1, w.grass[i] / fert);
        const wet = w.wetGrid[regionOf(i)];
        mix.copy(dry).lerp(C(0x9c8a5e), 1 - wet);
        if (k === PLAINS) out.copy(mix).lerp(grass, 0.2 + 0.8 * have);
        else if (k === TUNDRA) out.copy(steppe).lerp(grass, 0.25 * have);
        else if (k === FOREST) out.copy(mix).lerp(woods, 0.55 + 0.45 * have).lerp(grass, 0.15);
        else if (k === JUNGLE) out.copy(jungle);
        else out.copy(grass);
      }
      if (k >= BEACH && k !== LAKE && k !== RIVER && k !== ICE) out.lerp(snow, smooth(1.5, -4, T) * (k === DESERT ? 0.4 : 0.92));
      return weight;
    };
    const faces = all ? [0, 1, 2, 3, 4, 5] : [this.face];
    this.face = (this.face + 1) % 6;
    const tmp = new THREE.Color();
    for (const f of faces) {
      const start = f * G1 * G1, end = start + G1 * G1;
      for (let vi = start; vi < end; vi++) {
        let r = 0, gg = 0, b = 0, ws = 0;
        for (let k = 0; k < 4; k++) {
          const wgt = cellColor(this.cornerCells[vi * 4 + k], tmp);
          r += tmp.r * wgt;
          gg += tmp.g * wgt;
          b += tmp.b * wgt;
          ws += wgt;
        }
        arr[vi * 3] = r / ws;
        arr[vi * 3 + 1] = gg / ws;
        arr[vi * 3 + 2] = b / ws;
      }
    }
    void col;
    this.colors.needsUpdate = true;
  }
}

export { CELLS };
