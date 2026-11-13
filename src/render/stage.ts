/**
 * Draws the world: the floating island, its water, sky, weather and plants.
 * Reads the engine's state every frame; never changes it.
 */
import * as THREE from "three";
import { BUSH_MAX, DAY, ISLAND_R, N, YEAR_DAYS } from "../engine/config";
import { FOREST, HILLS, LAKE, PLAINS, RIVER, SEA, BEACH, heightAt, type Terrain } from "../engine/terrain";
import type { World } from "../engine/types";
import { OrbitCam } from "./camera";
import { Critters } from "./critters";
import { ball, box, cone, join, part, tube } from "./geo";
import { CLOUDSEA_FRAG, FALLS_FRAG, FALLS_VERT, SKY_FRAG, SKY_VERT, WATER_FRAG, WATER_VERT } from "./shaders";

const RIM = 58;
const H = N / 2;
const C = (hex: number): THREE.Color => new THREE.Color(hex);
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

const hash1 = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Colours of the sky and light for a moment of the day. */
interface Light {
  zenith: THREE.Color;
  horizon: THREE.Color;
  below: THREE.Color;
  sun: THREE.Color;
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  day: number;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.5, 1400);
  readonly cam: OrbitCam;
  readonly critters: Critters;
  /** Frames per second, smoothed. */
  fps = 60;
  /** Creature under the ring, or -1. */
  selected = -1;

  private world: World | null = null;
  private terrain: Terrain | null = null;
  private land = new THREE.Group();
  private sun = new THREE.DirectionalLight(0xffffff, 3);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x6d6046, 1);
  private sky: THREE.Mesh;
  private skyU: Record<string, THREE.IUniform>;
  private waters: THREE.ShaderMaterial[] = [];
  private riverMat: THREE.ShaderMaterial | null = null;
  private fallsMat: THREE.ShaderMaterial | null = null;
  private cloudSea: THREE.ShaderMaterial;
  private landColors: THREE.BufferAttribute | null = null;
  private landJitter: Float32Array = new Float32Array(0);
  private canopy: THREE.InstancedMesh | null = null;
  private conifer: THREE.InstancedMesh | null = null;
  private berries: THREE.InstancedMesh | null = null;
  private tufts: THREE.InstancedMesh | null = null;
  private tuftCell: Int32Array = new Int32Array(0);
  private tuftBase: Float32Array = new Float32Array(0);
  private clouds: THREE.InstancedMesh;
  private cloudAt: { x: number; z: number; y: number; s: number; storm: boolean }[] = [];
  private rain: THREE.LineSegments;
  private snow: THREE.Points;
  private drops: Float32Array;
  private fires: THREE.InstancedMesh;
  private flames: THREE.InstancedMesh;
  private glows: THREE.InstancedMesh;
  private huts: THREE.InstancedMesh;
  private cairns: THREE.InstancedMesh;
  private lumps: THREE.InstancedMesh;
  private piles: THREE.InstancedMesh;
  private fireLights: THREE.PointLight[] = [];
  private ring: THREE.Mesh;
  private placeRing: THREE.Mesh | null = null;
  private links: THREE.LineSegments;
  private snowCover = 0;
  private slow = 0;
  private lastSlow = -1;
  private time = 0;
  private light: Light = {
    zenith: C(0), horizon: C(0), below: C(0), sun: C(0), sunDir: new THREE.Vector3(0, 1, 0), moonDir: new THREE.Vector3(0, -1, 0), day: 1,
  };
  private ratio = 1;
  private slowFrames = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.ratio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.cam = new OrbitCam(this.camera, canvas);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -68;
    sc.right = sc.top = 68;
    sc.near = 20;
    sc.far = 320;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.35;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.land);
    this.scene.fog = new THREE.Fog(0xbcd9ee, 220, 900);

    // Sky.
    this.skyU = {
      uZenith: { value: C(0) }, uHorizon: { value: C(0) }, uBelow: { value: C(0) }, uSunDir: { value: new THREE.Vector3() },
      uSunCol: { value: C(0) }, uMoonDir: { value: new THREE.Vector3() }, uNight: { value: 0 }, uTime: { value: 0 }, uRain: { value: 0 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 20),
      new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, depthTest: false }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    // A sea of cloud far below.
    this.cloudSea = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT, fragmentShader: CLOUDSEA_FRAG, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uLight: { value: C(0xffffff) }, uShade: { value: C(0x9fb4cc) }, uBelow: { value: C(0) } },
    });
    const seaOfCloud = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100).rotateX(-Math.PI / 2), this.cloudSea);
    seaOfCloud.position.y = -62;
    seaOfCloud.renderOrder = -5;
    this.scene.add(seaOfCloud);

    // Clouds overhead.
    const puff = join([
      part(ball(1), 0xffffff, { s: [5, 2.4, 3.4] }),
      part(ball(1), 0xffffff, { p: [3.6, 0.5, 0.8], s: [3.4, 2, 2.8] }),
      part(ball(1), 0xffffff, { p: [-3.8, 0.2, -0.4], s: [3.2, 1.7, 2.6] }),
      part(ball(1), 0xffffff, { p: [0.6, 1.5, -0.4], s: [3, 1.9, 2.4] }),
    ]);
    this.clouds = new THREE.InstancedMesh(puff, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1, vertexColors: true, transparent: true, opacity: 0.96 }), 18);
    this.clouds.castShadow = true;
    this.clouds.frustumCulled = false;
    for (let i = 0; i < 18; i++) {
      this.cloudAt.push({ x: (hash1(i) * 2 - 1) * 95, z: (hash1(i + 50) * 2 - 1) * 80, y: 25 + hash1(i + 9) * 9, s: 0.7 + hash1(i + 3) * 0.9, storm: i >= 7 });
    }
    this.scene.add(this.clouds);

    // Rain and snow.
    const n = 1500;
    this.drops = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = hash1(i) * Math.PI * 2;
      const r = Math.sqrt(hash1(i + 0.5)) * 70;
      this.drops[i * 3] = Math.cos(a) * r;
      this.drops[i * 3 + 1] = hash1(i + 0.25) * 40;
      this.drops[i * 3 + 2] = Math.sin(a) * r;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xdfeaf5, transparent: true, opacity: 0.4, depthWrite: false }));
    this.rain.frustumCulled = false;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.42, transparent: true, opacity: 0.9, depthWrite: false }));
    this.snow.frustumCulled = false;
    this.scene.add(this.rain, this.snow);

    // Things the folk make, and what gets left behind.
    const std = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const logs = join([
      part(tube(5), 0x5a4030, { s: [0.09, 0.7, 0.09], r: [Math.PI / 2, 0, 0], p: [0, 0.09, 0] }),
      part(tube(5), 0x4d3628, { s: [0.09, 0.7, 0.09], r: [Math.PI / 2, 1.1, 0], p: [0, 0.12, 0] }),
      part(tube(5), 0x664a36, { s: [0.09, 0.7, 0.09], r: [Math.PI / 2, 2.2, 0], p: [0, 0.15, 0] }),
      part(ball(0), 0x8a8780, { s: 0.13, p: [0.42, 0.06, 0.1] }),
      part(ball(0), 0x7d7a74, { s: 0.12, p: [-0.38, 0.06, 0.22] }),
      part(ball(0), 0x8a8780, { s: 0.12, p: [0.05, 0.06, -0.44] }),
    ]);
    this.fires = new THREE.InstancedMesh(logs, std(), 24);
    this.flames = new THREE.InstancedMesh(
      join([part(cone(5), 0xffa23a, { s: [0.2, 0.62, 0.2], p: [0, 0.48, 0] }), part(cone(5), 0xffe08a, { s: [0.11, 0.36, 0.11], p: [0.03, 0.4, 0.02] })]),
      new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), 24,
    );
    this.glows = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xff9a40, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 24,
    );
    const hut = join([
      part(cone(7), 0x8a6a45, { s: [0.95, 1.15, 0.95], p: [0, 0.57, 0] }),
      part(cone(7), 0x6f5437, { s: [1.02, 0.5, 1.02], p: [0, 0.25, 0] }),
      part(box(), 0x1d1712, { s: [0.34, 0.55, 0.1], p: [0, 0.27, 0.72], r: [-0.33, 0, 0] }),
      part(tube(4), 0x5a4030, { s: [0.03, 0.5, 0.03], p: [0.05, 1.25, 0], r: [0, 0, 0.3] }),
      part(tube(4), 0x5a4030, { s: [0.03, 0.5, 0.03], p: [-0.05, 1.25, 0], r: [0, 0, -0.3] }),
    ]);
    this.huts = new THREE.InstancedMesh(hut, std(), 30);
    const cairn = join([
      part(ball(0), 0x8d8a82, { s: [0.28, 0.16, 0.26], p: [0, 0.12, 0] }),
      part(ball(0), 0x9a968d, { s: [0.2, 0.13, 0.19], p: [0.02, 0.36, 0] }),
      part(ball(0), 0x85827a, { s: [0.13, 0.1, 0.13], p: [0, 0.55, 0.01] }),
    ]);
    this.cairns = new THREE.InstancedMesh(cairn, std(), 40);
    const bones = join([
      part(ball(0), 0xe9e2d0, { s: [0.3, 0.1, 0.2], p: [0, 0.07, 0] }),
      part(tube(4), 0xe9e2d0, { s: [0.03, 0.4, 0.03], r: [0, 0, 1.4], p: [0.2, 0.08, 0.1] }),
      part(tube(4), 0xddd5c0, { s: [0.03, 0.34, 0.03], r: [0.3, 0, 1.2], p: [-0.1, 0.1, -0.12] }),
    ]);
    this.lumps = new THREE.InstancedMesh(bones, std(), 60);
    const fruit = join([
      part(ball(0), 0xd4491a, { s: 0.16, p: [0, 0.12, 0] }),
      part(ball(0), 0xe2702c, { s: 0.15, p: [0.22, 0.11, 0.08] }),
      part(ball(0), 0xc93f17, { s: 0.15, p: [-0.12, 0.11, 0.2] }),
      part(ball(0), 0xe58a3a, { s: 0.14, p: [0.06, 0.3, 0.1] }),
      part(ball(0), 0xd4491a, { s: 0.14, p: [-0.16, 0.1, -0.14] }),
    ]);
    this.piles = new THREE.InstancedMesh(fruit, std(), 40);
    for (const mesh of [this.fires, this.flames, this.glows, this.huts, this.cairns, this.lumps, this.piles]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
    this.huts.castShadow = true;
    this.cairns.castShadow = true;
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xff8a3a, 0, 16, 1.6);
      this.fireLights.push(l);
      this.scene.add(l);
    }

    // The ring under whoever is being followed.
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.74, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xd4491a, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false }),
    );
    this.ring.renderOrder = 20;
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.links = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xd4491a, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }),
    );
    this.links.renderOrder = 19;
    this.links.frustumCulled = false;
    this.scene.add(this.links);

    this.critters = new Critters(this.scene);
    this.resize();
  }

  /* ---------------- building a world ---------------- */

  setWorld(w: World): void {
    this.world = w;
    const t = (this.terrain = w.terrain);
    this.land.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    this.land.clear();
    this.waters = [];
    this.snowCover = 0;
    this.lastSlow = -1;
    this.setPlace(-1);

    // The ground.
    const pos = new Float32Array(N * N * 3);
    this.landJitter = new Float32Array(N * N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        pos[i * 3] = x + 0.5 - H;
        pos[i * 3 + 1] = Math.max(t.height[i], -3.2);
        pos[i * 3 + 2] = y + 0.5 - H;
        this.landJitter[i] = hash1(i * 1.37) * 2 - 1;
      }
    const idx: number[] = [];
    const inside = (x: number, y: number): boolean => Math.hypot(x + 0.5 - H, y + 0.5 - H) < RIM + 0.4;
    for (let y = 0; y < N - 1; y++)
      for (let x = 0; x < N - 1; x++) {
        if (!inside(x, y) || !inside(x + 1, y) || !inside(x, y + 1) || !inside(x + 1, y + 1)) continue;
        const a = y * N + x;
        // Alternate the diagonal so the facets do not all lean one way.
        if ((x + y) & 1) idx.push(a, a + N, a + 1, a + 1, a + N, a + N + 1);
        else idx.push(a, a + N, a + N + 1, a, a + N + 1, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.landColors = new THREE.BufferAttribute(new Float32Array(N * N * 3), 3);
    g.setAttribute("color", this.landColors);
    g.setIndex(idx);
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    ground.receiveShadow = true;
    ground.castShadow = true;
    this.land.add(ground);

    // The rock the island sits on.
    this.land.add(this.makeRock(t.seed));

    // Water: sea, lake, river, and the falls off the rim.
    const hData = new Uint16Array(N * N);
    for (let i = 0; i < N * N; i++) hData[i] = THREE.DataUtils.toHalfFloat(t.height[i]);
    const hTex = new THREE.DataTexture(hData, N, N, THREE.RedFormat, THREE.HalfFloatType);
    hTex.magFilter = hTex.minFilter = THREE.LinearFilter;
    hTex.needsUpdate = true;
    const water = (level: number, flow: boolean, edge: number): THREE.ShaderMaterial => {
      const m = new THREE.ShaderMaterial({
        vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false,
        uniforms: {
          uHeight: { value: hTex }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: C(0) }, uHorizon: { value: C(0) }, uZenith: { value: C(0) },
          uDeep: { value: C(0x1f6f8f) }, uShallow: { value: C(0x58c2bd) }, uFog: { value: C(0) }, uTime: { value: 0 }, uLevel: { value: level },
          uSize: { value: N }, uFlow: { value: flow ? 1 : 0 }, uAmount: { value: 1 }, uFogNear: { value: 220 }, uFogFar: { value: 900 }, uNight: { value: 0 }, uEdge: { value: edge },
        },
      });
      this.waters.push(m);
      return m;
    };
    const sea = new THREE.Mesh(new THREE.CircleGeometry(RIM + 0.5, 96).rotateX(-Math.PI / 2), water(0, false, RIM + 0.5));
    sea.renderOrder = 2;
    this.land.add(sea);
    const lakeMat = water(t.lake.level, false, 0);
    (lakeMat.uniforms.uDeep.value as THREE.Color).set(0x236a86);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(t.lake.r * 1.35 + 3, 48).rotateX(-Math.PI / 2), lakeMat);
    lake.position.set(t.lake.x - H, t.lake.level, t.lake.y - H);
    lake.renderOrder = 2;
    this.land.add(lake);
    // The river: a ribbon laid along its course, in two stretches either side of the lake.
    this.riverMat = water(0, true, 0);
    for (const [from, to] of [[0, t.riverLakeIn + 2], [t.riverLakeOut - 2, t.river.length - 1]]) {
      const pts = t.river.slice(Math.max(0, from), to + 1);
      if (pts.length < 2) continue;
      const rp: number[] = [];
      const uv: number[] = [];
      const ri: number[] = [];
      let along = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
        const wide = 1.55;
        const p = pts[i];
        if (i > 0) along += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
        rp.push(p.x + nx * wide - H, p.h - 0.04, p.y + ny * wide - H, p.x - nx * wide - H, p.h - 0.04, p.y - ny * wide - H);
        uv.push(0, along, 1, along);
        if (i > 0) {
          const k = i * 2;
          ri.push(k - 2, k - 1, k, k, k - 1, k + 1);
        }
      }
      const rgeo = new THREE.BufferGeometry();
      rgeo.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3));
      rgeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      rgeo.setIndex(ri);
      const rm = new THREE.Mesh(rgeo, this.riverMat);
      rm.renderOrder = 3;
      this.land.add(rm);
    }
    // The river shader measures depth from each fragment's own height.
    this.riverMat.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace("float depth = uLevel - ground;", "float depth = vWorld.y + 0.04 - ground;");
    };
    this.fallsMat = new THREE.ShaderMaterial({
      vertexShader: FALLS_VERT, fragmentShader: FALLS_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uShallow: { value: C(0x7fd0d0) }, uSunCol: { value: C(0xffffff) } },
    });
    const falls = new THREE.Mesh(new THREE.CylinderGeometry(RIM + 0.75, RIM + 1.6, 26, 128, 1, true), this.fallsMat);
    falls.position.y = -13;
    falls.renderOrder = 4;
    this.land.add(falls);

    this.makeFlora(t);
    this.paintLand(w, true);
    this.critters.reset();
  }

  /** The underside: a great inverted crag, banded like old rock. */
  private makeRock(seed: number): THREE.Mesh {
    const profile: [number, number][] = [
      [RIM + 0.9, -0.12], [RIM + 1.5, -1.6], [RIM - 1, -7], [RIM - 9, -15], [RIM - 20, -24], [RIM - 31, -33], [RIM - 42, -43], [RIM - 50, -52], [3, -60], [0, -62],
    ];
    const seg = 72;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const strata = [C(0x7d705f), C(0x6a5e52), C(0x8a7b66), C(0x5d544b), C(0x74685a)];
    for (let r = 0; r < profile.length; r++) {
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        const k = s % seg;
        const wob = r === 0 ? 0 : (hash1(k * 3.1 + r * 17.3 + seed) - 0.5) * (2.2 + r * 0.9);
        const rad = Math.max(0, profile[r][0] + wob);
        const y = profile[r][1] + (r > 1 ? (hash1(k * 5.3 + r * 3.7 + seed) - 0.5) * 2.4 : 0);
        pos.push(Math.cos(a) * rad, y, Math.sin(a) * rad);
        const c = strata[(r + (hash1(k + r * 9) > 0.7 ? 1 : 0)) % strata.length];
        const shade = 0.82 + hash1(k * 2.3 + r) * 0.3;
        col.push(c.r * shade, c.g * shade, c.b * shade);
      }
    }
    for (let r = 0; r < profile.length - 1; r++)
      for (let s = 0; s < seg; s++) {
        const a = r * (seg + 1) + s;
        const b = a + seg + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    mesh.receiveShadow = true;
    return mesh;
  }

  private makeFlora(t: Terrain): void {
    const std = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const broad = t.trees.filter((tr) => tr.type === 0);
    const conif = t.trees.filter((tr) => tr.type === 1);
    const trunkGeo = join([part(tube(5, 0.6), 0x6b4a33, { s: [0.16, 1.2, 0.16], p: [0, 0.6, 0] })]);
    const canopyGeo = join([
      part(ball(1), 0xffffff, { s: [0.95, 0.85, 0.95], p: [0, 1.75, 0] }),
      part(ball(0), 0xf2f2f2, { s: [0.62, 0.55, 0.62], p: [0.5, 1.35, 0.25] }),
      part(ball(0), 0xe9e9e9, { s: [0.55, 0.5, 0.55], p: [-0.45, 1.45, -0.3] }),
    ]);
    const coniferGeo = join([
      part(tube(5, 0.7), 0x5a3f2c, { s: [0.12, 0.7, 0.12], p: [0, 0.35, 0] }),
      part(cone(6), 0xffffff, { s: [0.85, 1.2, 0.85], p: [0, 1.1, 0] }),
      part(cone(6), 0xf0f0f0, { s: [0.65, 1.0, 0.65], p: [0, 1.75, 0] }),
      part(cone(6), 0xe4e4e4, { s: [0.42, 0.85, 0.42], p: [0, 2.35, 0] }),
    ]);
    const put = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, s: number, sy = s): void => {
      tmpQ.setFromAxisAngle(UP, hash1(i * 7.7 + x) * 6.28);
      tmpM.compose(tmpP.set(x - H, heightAt(t, x, y) - 0.05, y - H), tmpQ, tmpS.set(s, sy, s));
      mesh.setMatrixAt(i, tmpM);
    };
    const trunks = new THREE.InstancedMesh(trunkGeo, std(), broad.length);
    this.canopy = new THREE.InstancedMesh(canopyGeo, std(), broad.length);
    broad.forEach((tr, i) => {
      put(trunks, i, tr.x, tr.y, tr.s, tr.s * (0.9 + hash1(i) * 0.3));
      this.canopy?.setMatrixAt(i, tmpM);
      this.canopy?.setColorAt(i, tmpC.set(0x5f9a3e));
    });
    this.conifer = new THREE.InstancedMesh(coniferGeo, std(), conif.length);
    conif.forEach((tr, i) => {
      put(this.conifer as THREE.InstancedMesh, i, tr.x, tr.y, tr.s, tr.s * (0.95 + hash1(i + 3) * 0.4));
      this.conifer?.setColorAt(i, tmpC.set(0x3f7a48));
    });
    const bushGeo = join([
      part(ball(0), 0x5b8f3d, { s: [0.5, 0.36, 0.5], p: [0, 0.26, 0] }),
      part(ball(0), 0x6a9d45, { s: [0.34, 0.28, 0.34], p: [0.3, 0.22, 0.12] }),
    ]);
    const bushes = new THREE.InstancedMesh(bushGeo, std(), t.bushes.length);
    const berryGeo = join(
      [[0.2, 0.42, 0.25], [-0.26, 0.38, 0.12], [0.05, 0.52, -0.2], [0.4, 0.28, -0.05], [-0.1, 0.3, 0.42], [-0.3, 0.3, -0.28]].map((p) =>
        part(ball(0), 0xd4491a, { s: 0.085, p: p as [number, number, number] }),
      ),
    );
    this.berries = new THREE.InstancedMesh(berryGeo, std(), t.bushes.length);
    t.bushes.forEach((b, i) => put(bushes, i, b.x, b.y, 0.9 + hash1(i) * 0.4));
    const rockGeo = join([part(new THREE.DodecahedronGeometry(1, 0), 0x8f8b82, { s: [1, 0.7, 0.85] })]);
    const rocks = new THREE.InstancedMesh(rockGeo, std(), t.rocks.length);
    t.rocks.forEach((r, i) => {
      put(rocks, i, r.x, r.y, r.s, r.s * (0.7 + hash1(i) * 0.6));
      rocks.setColorAt(i, tmpC.setScalar(0.8 + hash1(i * 3) * 0.35));
    });
    // Grass tufts: where they stand tall, nobody has grazed.
    const cells: number[] = [];
    for (let i = 0; i < N * N; i++) {
      const k = t.kind[i];
      if ((k === PLAINS && t.fert[i] > 0.55 && hash1(i * 0.77) < 0.55) || (k === FOREST && hash1(i * 0.77) < 0.12)) cells.push(i);
    }
    const blade = (x: number, z: number, lean: number): THREE.BufferGeometry => part(cone(3), 0xffffff, { s: [0.05, 0.46, 0.05], p: [x, 0.2, z], r: [lean, 0, lean * 0.7] });
    const tuftGeo = join([blade(0, 0, 0.12), blade(0.1, 0.06, -0.25), blade(-0.09, 0.05, 0.3), blade(0.02, -0.1, -0.1), blade(-0.05, -0.04, 0.4)]);
    this.tufts = new THREE.InstancedMesh(tuftGeo, std(), cells.length);
    this.tuftCell = Int32Array.from(cells);
    this.tuftBase = new Float32Array(cells.length * 3);
    cells.forEach((i, k) => {
      const x = (i % N) + 0.2 + hash1(i) * 0.6;
      const y = ((i / N) | 0) + 0.2 + hash1(i + 0.3) * 0.6;
      this.tuftBase[k * 3] = x;
      this.tuftBase[k * 3 + 1] = heightAt(t, x, y);
      this.tuftBase[k * 3 + 2] = y;
    });
    for (const mesh of [trunks, this.canopy, this.conifer, bushes, rocks]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    this.tufts.receiveShadow = true;
    for (const mesh of [trunks, this.canopy, this.conifer, bushes, this.berries, rocks, this.tufts]) {
      mesh.frustumCulled = false;
      this.land.add(mesh);
    }
  }

  /* ---------------- things that change slowly ---------------- */

  /** Recolours the ground and plants for the season, the weather and what has been eaten. */
  private paintLand(w: World, force = false): void {
    const t = w.terrain;
    const col = this.landColors;
    if (!col) return;
    const year = ((w.t / DAY) % YEAR_DAYS) / YEAR_DAYS;
    // Grass colour through the year: fresh, deep, golden, grey.
    const ramp = [C(0x8cc152), C(0x6fa446), C(0xb0a04a), C(0x98a184)];
    const f = year * 4 - 0.5;
    const a = ((Math.floor(f) % 4) + 4) % 4;
    const grassCol = ramp[a].clone().lerp(ramp[(a + 1) % 4], smooth(0, 1, f - Math.floor(f)));
    const dry = C(0xb9a36a).lerp(C(0x9c8a5e), 1 - w.wet);
    const sand = C(0xdccb9c);
    const rock = C(0x8d877b);
    const high = C(0xaaa69c);
    const bed = C(0x7d9a8c);
    const wood = grassCol.clone().multiplyScalar(0.72);
    const snow = C(0xf2f5f7);
    const arr = col.array as Float32Array;
    const c = new THREE.Color();
    for (let i = 0; i < N * N; i++) {
      const k = t.kind[i];
      const h = t.height[i];
      const j = this.landJitter[i];
      if (k === SEA) c.copy(sand).lerp(C(0x9fb7a8), smooth(0, -1.6, h));
      else if (k === BEACH) c.copy(sand);
      else if (k === LAKE || k === RIVER) c.copy(bed);
      else {
        const fert = t.fert[i] || 0.01;
        const g = Math.min(1, w.grass[i] / fert);
        if (k === HILLS) c.copy(rock).lerp(high, smooth(4, 7.5, h)).lerp(grassCol, g * 0.35 * smooth(5, 3, h));
        else c.copy(dry).lerp(k === FOREST ? wood : grassCol, 0.25 + 0.75 * g);
      }
      if (k !== SEA && k !== LAKE && k !== RIVER) {
        const s = this.snowCover * (0.55 + 0.45 * smooth(1.5, 5, h)) + (k === HILLS ? smooth(6.2, 7.6, h) * 0.8 : 0);
        if (s > 0.01) c.lerp(snow, Math.min(1, s));
      }
      const shade = 1 + j * 0.055;
      arr[i * 3] = c.r * shade;
      arr[i * 3 + 1] = c.g * shade;
      arr[i * 3 + 2] = c.b * shade;
    }
    col.needsUpdate = true;

    // Leaves.
    if (this.canopy && (force || this.lastSlow !== Math.floor(year * 96))) {
      this.lastSlow = Math.floor(year * 96);
      const leaf = [C(0x86bb4e), C(0x5c9a3c), C(0xd08a2e), C(0xa3957f)];
      const base = leaf[a].clone().lerp(leaf[(a + 1) % 4], smooth(0, 1, f - Math.floor(f)));
      const autumn = Math.max(0, 1 - Math.abs(year - 0.625) * 7);
      const reds = [C(0xd9a23a), C(0xcf6a2a), C(0xb8402a), C(0xc98f2c)];
      for (let i = 0; i < this.canopy.count; i++) {
        tmpC.copy(base).lerp(reds[i % 4], autumn * (0.35 + hash1(i) * 0.65));
        tmpC.multiplyScalar(0.88 + hash1(i * 1.9) * 0.24).lerp(snow, this.snowCover * 0.7);
        this.canopy.setColorAt(i, tmpC);
      }
      if (this.canopy.instanceColor) this.canopy.instanceColor.needsUpdate = true;
      if (this.conifer) {
        for (let i = 0; i < this.conifer.count; i++) {
          tmpC.set(0x3f7a48).multiplyScalar(0.85 + hash1(i * 2.3) * 0.3).lerp(snow, this.snowCover * 0.55);
          this.conifer.setColorAt(i, tmpC);
        }
        if (this.conifer.instanceColor) this.conifer.instanceColor.needsUpdate = true;
      }
    }
    // Berries and tufts.
    if (this.berries) {
      for (let i = 0; i < t.bushes.length; i++) {
        const b = t.bushes[i];
        const s = Math.min(1, w.bush[i] / (BUSH_MAX * 0.6));
        tmpM.compose(tmpP.set(b.x - H, heightAt(t, b.x, b.y) - 0.05, b.y - H), tmpQ.identity(), tmpS.setScalar(s < 0.15 ? 0 : (0.9 + hash1(i) * 0.4) * (0.5 + 0.5 * s)));
        this.berries.setMatrixAt(i, tmpM);
      }
      this.berries.instanceMatrix.needsUpdate = true;
    }
    if (this.tufts) {
      tmpC.copy(grassCol).multiplyScalar(0.92).lerp(snow, this.snowCover * 0.6);
      for (let k = 0; k < this.tuftCell.length; k++) {
        const i = this.tuftCell[k];
        const g = Math.min(1, w.grass[i] / (t.fert[i] || 1));
        const s = g < 0.2 ? 0 : 0.5 + g * 0.9;
        tmpQ.setFromAxisAngle(UP, hash1(k) * 6.28);
        tmpM.compose(tmpP.set(this.tuftBase[k * 3] - H, this.tuftBase[k * 3 + 1] - 0.03, this.tuftBase[k * 3 + 2] - H), tmpQ, tmpS.set(s, s * (0.8 + hash1(k + 5) * 0.5), s));
        this.tufts.setMatrixAt(k, tmpM);
        this.tufts.setColorAt(k, tmpC);
      }
      this.tufts.instanceMatrix.needsUpdate = true;
      if (this.tufts.instanceColor) this.tufts.instanceColor.needsUpdate = true;
    }
  }

  private skyFor(w: World): void {
    const L = this.light;
    const s = w.sun;
    const day = smooth(-0.08, 0.38, s);
    const dusk = Math.max(0, 1 - Math.abs(s) / 0.42);
    L.day = day;
    L.zenith.set(0x0a1026).lerp(C(0x3a82d6), day).lerp(C(0x4d5f96), dusk * 0.45);
    L.horizon.set(0x1a2444).lerp(C(0xc3ddef), day).lerp(C(0xf5a55e), dusk * 0.8);
    const grey = C(0x8794a3).multiplyScalar(0.35 + 0.65 * day);
    L.zenith.lerp(grey, w.rain * 0.75);
    L.horizon.lerp(grey.multiplyScalar(1.12), w.rain * 0.7);
    L.below.copy(L.horizon).lerp(L.zenith, 0.55).multiplyScalar(0.92);
    L.sun.set(0xff9350).lerp(C(0xfff2dc), smooth(0.02, 0.5, s));
    const a = ((w.t / DAY) % 1) * Math.PI * 2 - Math.PI / 2;
    L.sunDir.set(Math.cos(a) * 0.86, Math.sin(a), 0.4).normalize();
    L.moonDir.set(-Math.cos(a) * 0.8, -Math.sin(a), -0.45).normalize();
  }

  /* ---------------- every frame ---------------- */

  frame(w: World, dt: number): void {
    if (this.world !== w) this.setWorld(w);
    const t = w.terrain;
    this.time += dt;
    this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.05;
    this.skyFor(w);
    const L = this.light;

    // Snow settles in the cold and melts in the warm.
    const snowing = w.temp < 1.5 && w.rain > 0.15;
    this.snowCover = Math.min(1, Math.max(0, this.snowCover + dt * (snowing ? 0.05 : w.temp > 3 ? -0.03 : w.temp < 0 ? 0.004 : 0)));
    this.slow -= dt;
    if (this.slow <= 0) {
      this.slow = 0.5;
      this.paintLand(w);
    }

    // Light.
    const up = L.sunDir.y > -0.06;
    const dir = up ? L.sunDir : L.moonDir;
    const target = this.cam.target;
    this.sun.target.position.set(target.x * 0.5, 0, target.z * 0.5);
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 150);
    const sunPower = smooth(-0.06, 0.3, w.sun) * 3.1 * (1 - w.rain * 0.55);
    if (up) this.sun.color.copy(L.sun);
    else this.sun.color.set(0x8fa6ee);
    this.sun.intensity = up ? Math.max(sunPower, 0.02) : 0.55 * w.night * (1 - w.rain * 0.5);
    this.hemi.color.copy(L.horizon).lerp(L.zenith, 0.4);
    this.hemi.groundColor.set(0x6d6046).lerp(C(0x20263a), w.night);
    this.hemi.intensity = 0.42 + 0.95 * L.day;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(L.horizon).lerp(L.below, 0.3);
    fog.near = 200 - w.rain * 110;
    fog.far = 900 - w.rain * 420;
    this.renderer.setClearColor(fog.color);

    const U = this.skyU;
    (U.uZenith.value as THREE.Color).copy(L.zenith);
    (U.uHorizon.value as THREE.Color).copy(L.horizon);
    (U.uBelow.value as THREE.Color).copy(L.below);
    (U.uSunDir.value as THREE.Vector3).copy(L.sunDir);
    (U.uMoonDir.value as THREE.Vector3).copy(L.moonDir);
    (U.uSunCol.value as THREE.Color).copy(L.sun).multiplyScalar(smooth(-0.1, 0.1, w.sun));
    U.uNight.value = w.night;
    U.uTime.value = this.time;
    U.uRain.value = w.rain;
    this.sky.position.copy(this.camera.position);
    this.sky.scale.setScalar(1000);
    const cu = this.cloudSea.uniforms;
    cu.uTime.value = this.time;
    (cu.uLight.value as THREE.Color).set(0x1c2542).lerp(C(0xffffff), L.day).lerp(L.sun, 0.25 * (1 - L.day) * (1 - w.night));
    (cu.uShade.value as THREE.Color).copy(L.zenith).lerp(L.horizon, 0.6).multiplyScalar(0.9);
    (cu.uBelow.value as THREE.Color).copy(L.below);

    for (const m of this.waters) {
      const u = m.uniforms;
      u.uTime.value = this.time;
      (u.uSunDir.value as THREE.Vector3).copy(dir);
      (u.uSunCol.value as THREE.Color).copy(this.sun.color).multiplyScalar(Math.min(1, this.sun.intensity / 2.2));
      (u.uHorizon.value as THREE.Color).copy(L.horizon);
      (u.uZenith.value as THREE.Color).copy(L.zenith);
      (u.uFog.value as THREE.Color).copy(fog.color);
      u.uFogNear.value = fog.near;
      u.uFogFar.value = fog.far;
      u.uNight.value = w.night;
      const lit = 0.16 + 0.84 * L.day;
      (u.uDeep.value as THREE.Color).set(m === this.waters[1] ? 0x236a86 : 0x1f6f8f).multiplyScalar(lit);
      (u.uShallow.value as THREE.Color).set(0x58c2bd).multiplyScalar(lit);
    }
    if (this.riverMat) {
      const u = this.riverMat.uniforms.uAmount;
      u.value += ((w.riverRuns ? 0.4 + 0.6 * Math.min(1, w.wet * 2) : 0) - u.value) * Math.min(1, dt * 0.8);
    }
    if (this.fallsMat) {
      this.fallsMat.uniforms.uTime.value = this.time;
      this.fallsMat.uniforms.uNight.value = w.night;
      (this.fallsMat.uniforms.uShallow.value as THREE.Color).set(0x7fd0d0).multiplyScalar(0.2 + 0.8 * L.day);
    }

    // Clouds drift; more of them, and darker, when it rains.
    for (let i = 0; i < this.cloudAt.length; i++) {
      const c = this.cloudAt[i];
      c.x += dt * (0.7 + (i % 3) * 0.25);
      if (c.x > 110) c.x = -110;
      const show = c.storm ? smooth(0.05, 0.5, w.rain) : 1;
      const s = c.s * (0.8 + 0.5 * w.rain) * show;
      tmpM.compose(tmpP.set(c.x, c.y, c.z), tmpQ.identity(), tmpS.set(s * 1.3, s, s * 1.2));
      this.clouds.setMatrixAt(i, tmpM);
      tmpC.set(0xffffff).lerp(C(0x7f8a96), w.rain * 0.8);
      this.clouds.setColorAt(i, tmpC);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
    if (this.clouds.instanceColor) this.clouds.instanceColor.needsUpdate = true;

    this.weatherFx(w, dt);
    this.things(w, t);
    this.critters.update(w, dt, this.time, this.cam.dist);

    // The ring under the followed creature.
    const sel = this.selected >= 0 ? w.byId.get(this.selected) : undefined;
    if (sel) {
      const p = this.critters.where(sel.id);
      if (p) {
        this.ring.visible = true;
        this.ring.position.set(p.x, p.y + 0.08, p.z);
        const pulse = 1 + Math.sin(this.time * 3) * 0.06;
        this.ring.scale.setScalar(pulse * (sel.sp === 1 ? 1.25 : 1));
        this.cam.follow(p.x, p.y, p.z);
      }
    } else this.ring.visible = false;

    this.cam.update(dt, (x, z) => (Math.hypot(x, z) < RIM ? Math.max(0, heightAt(t, x + H, z + H)) : 0));

    // Keep the picture smooth on slower machines.
    if (dt > 1 / 40) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 90 && this.ratio > 1) {
      this.ratio = Math.max(1, this.ratio - 0.25);
      this.slowFrames = 0;
      this.resize();
    }
    this.renderer.render(this.scene, this.camera);
  }

  private weatherFx(w: World, dt: number): void {
    const snowing = w.temp < 1.5;
    const amount = w.rain;
    this.rain.visible = amount > 0.02 && !snowing;
    this.snow.visible = amount > 0.02 && snowing;
    if (amount <= 0.02) return;
    const n = this.drops.length / 3;
    const shown = Math.floor(n * Math.min(1, amount * 1.2));
    const cx = this.cam.target.x, cz = this.cam.target.z;
    const fall = snowing ? 3.2 : 38;
    const d = this.drops;
    if (snowing) {
      const arr = (this.snow.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < shown; i++) {
        d[i * 3 + 1] -= fall * dt * (0.7 + hash1(i) * 0.6);
        if (d[i * 3 + 1] < 0) d[i * 3 + 1] += 40;
        arr[i * 3] = cx + d[i * 3] + Math.sin(this.time * 0.8 + i) * 0.6;
        arr[i * 3 + 1] = d[i * 3 + 1];
        arr[i * 3 + 2] = cz + d[i * 3 + 2] + Math.cos(this.time * 0.7 + i * 1.3) * 0.6;
      }
      this.snow.geometry.setDrawRange(0, shown);
      this.snow.geometry.attributes.position.needsUpdate = true;
    } else {
      const arr = (this.rain.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < shown; i++) {
        d[i * 3 + 1] -= fall * dt * (0.8 + hash1(i) * 0.4);
        if (d[i * 3 + 1] < 0) d[i * 3 + 1] += 40;
        const x = cx + d[i * 3], y = d[i * 3 + 1], z = cz + d[i * 3 + 2];
        arr[i * 6] = x;
        arr[i * 6 + 1] = y;
        arr[i * 6 + 2] = z;
        arr[i * 6 + 3] = x + 0.12;
        arr[i * 6 + 4] = y + 0.9;
        arr[i * 6 + 5] = z;
      }
      this.rain.geometry.setDrawRange(0, shown * 2);
      this.rain.geometry.attributes.position.needsUpdate = true;
      (this.rain.material as THREE.LineBasicMaterial).opacity = 0.16 + 0.3 * amount;
    }
  }

  private things(w: World, t: Terrain): void {
    const at = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, s: number, spin = 0, lift = 0): void => {
      tmpQ.setFromAxisAngle(UP, spin);
      tmpM.compose(tmpP.set(x - H, Math.max(heightAt(t, x, y), 0) + lift, y - H), tmpQ, tmpS.setScalar(s));
      mesh.setMatrixAt(i, tmpM);
    };
    const nf = Math.min(w.fires.length, 24);
    for (let i = 0; i < nf; i++) {
      const f = w.fires[i];
      const life = Math.min(1, f.fuel / (DAY * 0.12));
      at(this.fires, i, f.x, f.y, 1, i * 1.3);
      const flick = 0.75 + 0.25 * Math.sin(this.time * 11 + i * 2.1) + 0.12 * Math.sin(this.time * 23 + i);
      at(this.flames, i, f.x, f.y, (0.55 + 0.6 * life) * flick, this.time * 1.5 + i);
      at(this.glows, i, f.x, f.y, (3.2 + 2.6 * w.night) * (0.6 + 0.4 * life) * (0.92 + 0.08 * flick), 0, 0.12);
    }
    this.fires.count = this.flames.count = this.glows.count = nf;
    (this.glows.material as THREE.MeshBasicMaterial).opacity = 0.14 + 0.5 * w.night;
    // A few real lights, on the fires nearest the middle of the view.
    const near = w.fires.map((f) => ({ f, d: (f.x - H - this.cam.target.x) ** 2 + (f.y - H - this.cam.target.z) ** 2 })).sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.fireLights.length; i++) {
      const l = this.fireLights[i];
      const e = near[i];
      if (e) {
        l.position.set(e.f.x - H, heightAt(t, e.f.x, e.f.y) + 0.9, e.f.y - H);
        l.intensity = (10 + 34 * w.night) * (0.85 + 0.15 * Math.sin(this.time * 13 + i * 4));
      } else l.intensity = 0;
    }
    const nh = Math.min(w.shelters.length, 30);
    for (let i = 0; i < nh; i++) {
      const s = w.shelters[i];
      at(this.huts, i, s.x, s.y, s.done ? 1 : 0.35 + 0.18 * s.wood, (s.x * 7 + s.y) % 6.28);
    }
    this.huts.count = nh;
    const nm = Math.min(w.markers.length, 40);
    for (let i = 0; i < nm; i++) at(this.cairns, i, w.markers[i].x, w.markers[i].y, 1.15, i);
    this.cairns.count = nm;
    const nc = Math.min(w.carcasses.length, 60);
    for (let i = 0; i < nc; i++) at(this.lumps, i, w.carcasses[i].x, w.carcasses[i].y, 0.7 + Math.min(1, w.carcasses[i].energy / 120) * 0.7, i * 2.1);
    this.lumps.count = nc;
    const np = Math.min(w.piles.length, 40);
    for (let i = 0; i < np; i++) at(this.piles, i, w.piles[i].x, w.piles[i].y, 0.6 + Math.min(1, w.piles[i].energy / 160) * 0.9, i);
    this.piles.count = np;
    for (const m of [this.fires, this.flames, this.glows, this.huts, this.cairns, this.lumps, this.piles]) m.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- pointing at things ---------------- */

  private ray(clientX: number, clientY: number): THREE.Ray {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    return rc.ray;
  }

  /** Where on the ground a screen point falls, in world-grid units, or null if it misses the island. */
  pickGround(clientX: number, clientY: number): { x: number; y: number } | null {
    const t = this.terrain;
    if (!t) return null;
    const ray = this.ray(clientX, clientY);
    const p = new THREE.Vector3();
    let prev = 0;
    for (let d = 2; d < 700; d += d < 300 ? 0.6 : 2) {
      ray.at(d, p);
      if (Math.hypot(p.x, p.z) > RIM + 2) continue;
      const ground = Math.max(heightAt(t, p.x + H, p.z + H), 0);
      if (p.y <= ground) {
        // Refine between the last two samples.
        let lo = prev || d - 0.6, hi = d;
        for (let k = 0; k < 6; k++) {
          const mid = (lo + hi) / 2;
          ray.at(mid, p);
          if (p.y <= Math.max(heightAt(t, p.x + H, p.z + H), 0)) hi = mid;
          else lo = mid;
        }
        ray.at(hi, p);
        if (Math.hypot(p.x, p.z) > ISLAND_R + 5) return null;
        return { x: p.x + H, y: p.z + H };
      }
      prev = d;
    }
    return null;
  }

  /** The creature nearest a screen point, if any is close enough to count as tapped. */
  pickCreature(w: World, clientX: number, clientY: number): number {
    const r = this.canvas.getBoundingClientRect();
    let best = -1;
    let bd = 26 * 26;
    const v = new THREE.Vector3();
    for (const c of w.creatures) {
      const p = this.critters.where(c.id);
      if (!p) continue;
      v.set(p.x, p.y + 0.4, p.z).project(this.camera);
      if (v.z > 1) continue;
      const sx = r.left + ((v.x + 1) / 2) * r.width, sy = r.top + ((1 - v.y) / 2) * r.height;
      const d = (sx - clientX) ** 2 + (sy - clientY) ** 2;
      if (d < bd) {
        bd = d;
        best = c.id;
      }
    }
    return best;
  }

  /** Screen position of a point in the world (grid units), or null if behind the camera. */
  toScreen(x: number, y: number, lift = 0): { x: number; y: number } | null {
    const t = this.terrain;
    if (!t) return null;
    const v = new THREE.Vector3(x - H, Math.max(heightAt(t, x, y), 0) + lift, y - H).project(this.camera);
    if (v.z > 1) return null;
    const r = this.canvas.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
  }

  /** Screen position of a creature, where it is drawn. */
  creatureOnScreen(id: number, lift = 1.2): { x: number; y: number } | null {
    const p = this.critters.where(id);
    if (!p) return null;
    const v = new THREE.Vector3(p.x, p.y + lift, p.z).project(this.camera);
    if (v.z > 1) return null;
    const r = this.canvas.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
  }

  /** Draws a ring round a place on the ground (or clears it with -1). */
  setPlace(placeId: number, color = 0xd4491a): void {
    if (this.placeRing) {
      this.scene.remove(this.placeRing);
      this.placeRing.geometry.dispose();
      this.placeRing = null;
    }
    const t = this.terrain;
    if (!t || placeId < 0) return;
    const p = t.places[placeId];
    const pos: number[] = [];
    const idx: number[] = [];
    const seg = 96;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      for (const r of [p.r, p.r + 0.45]) {
        const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        pos.push(x - H, Math.max(heightAt(t, x, y), 0) + 0.25, y - H);
      }
      if (i > 0) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2, i * 2 - 1, i * 2 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.placeRing = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide, toneMapped: false }));
    this.placeRing.renderOrder = 18;
    this.scene.add(this.placeRing);
  }

  /** Draws arcs between pairs of creatures: who told whom. */
  setLinks(pairs: [number, number][]): void {
    const pos: number[] = [];
    for (const [a, b] of pairs) {
      const pa = this.critters.where(a), pb = this.critters.where(b);
      if (!pa || !pb) continue;
      const steps = 14;
      const lift = Math.min(6, 1 + Math.hypot(pa.x - pb.x, pa.z - pb.z) * 0.18);
      for (let i = 0; i < steps; i++) {
        for (const k of [i, i + 1]) {
          const u = k / steps;
          pos.push(pa.x + (pb.x - pa.x) * u, pa.y + (pb.y - pa.y) * u + 1 + Math.sin(u * Math.PI) * lift, pa.z + (pb.z - pa.z) * u);
        }
      }
    }
    this.links.geometry.dispose();
    this.links.geometry = new THREE.BufferGeometry();
    this.links.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the whole island in view on a tall phone screen.
    this.camera.fov = w / h < 0.8 ? 52 : 38;
    this.camera.updateProjectionMatrix();
  }

  /** A large still of the current view, as a JPEG data URL. */
  photo(width = 3840): string {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const scale = Math.min(width / w, 4);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(Math.round(w * scale), Math.round(h * scale), false);
    const ringWas = this.ring.visible;
    this.ring.visible = false;
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL("image/jpeg", 0.93);
    this.ring.visible = ringWas;
    this.resize();
    this.renderer.render(this.scene, this.camera);
    return url;
  }
}

/** A soft round glow, drawn once. */
function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

