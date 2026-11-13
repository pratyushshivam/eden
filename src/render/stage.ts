/**
 * Draws the planet: land, ocean, air, clouds, space, plants, weather and
 * everything the creatures have made. Reads the engine's state every frame;
 * never changes it.
 */
import * as THREE from "three";
import { BUSH_MAX, DAY, R, YEAR_DAYS } from "../engine/config";
import { cellOf, grid } from "../engine/sphere";
import { FOREST, PLAINS, TUNDRA, type Terrain } from "../engine/terrain";
import type { World } from "../engine/types";
import { sunAt, weatherAt } from "../engine/world";
import { GlobeCam } from "./camera";
import { Critters } from "./critters";
import { ball, box, cone, join, part, tube } from "./geo";
import { Globe } from "./globe";
import { AIR_FRAG, AIR_VERT, CLOUD_FRAG, CLOUD_VERT, GROUND_PATCH, NOISE, OCEAN_FRAG, OCEAN_VERT, SKY_FRAG, SKY_VERT } from "./shaders";

const C = (hex: number): THREE.Color => new THREE.Color(hex);
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const vy = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const hash1 = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Stands a model on the planet at a direction: its up is away from the middle. */
function stand(out: THREE.Matrix4, ux: number, uy: number, uz: number, radius: number, scale: number, spin = 0, sy = scale): void {
  vy.set(ux, uy, uz);
  tmpQ.setFromUnitVectors(UP, vy);
  if (spin) tmpQ.multiply(tmpQ2.setFromAxisAngle(UP, spin));
  out.compose(tmpP.set(ux * radius, uy * radius, uz * radius), tmpQ, tmpS.set(scale, sy, scale));
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.5, 2000);
  readonly cam: GlobeCam;
  readonly critters: Critters;
  /** Frames per second, smoothed. */
  fps = 60;
  /** Creature under the ring, or -1. */
  selected = -1;
  /** 2 full, 1 lighter, 0 lightest: steps down by itself if frames run slow. */
  quality = 2;

  private world: World | null = null;
  private globe: Globe | null = null;
  private land = new THREE.Group();
  private flora = new THREE.Group();
  private sun = new THREE.DirectionalLight(0xfff2dc, 3.2);
  private moon = new THREE.DirectionalLight(0x8fa6ee, 0.55);
  private hemi = new THREE.HemisphereLight(0xbcd3ee, 0x40382c, 0.4);
  private sky: THREE.Mesh;
  private skyU: { [k: string]: THREE.IUniform };
  private shared = { uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uTime: { value: 0 }, uCover: { value: 0.03 }, uLow: { value: 0 } };
  private seaMat: THREE.ShaderMaterial;
  private airMat: THREE.ShaderMaterial;
  private cloudMat: THREE.ShaderMaterial;
  private canopy: THREE.InstancedMesh | null = null;
  /** Every tree mesh with where its trees stand, so they can part for whoever is followed. */
  private groves: { mesh: THREE.InstancedMesh; at: { x: number; y: number; z: number }[]; base: THREE.Matrix4[]; down: Uint8Array }[] = [];
  private canopyAt: { x: number; y: number; z: number; cell: number }[] = [];
  private berries: THREE.InstancedMesh | null = null;
  private tufts: THREE.InstancedMesh;
  private tuftAt = new THREE.Vector3(9, 9, 9);
  private rain: THREE.LineSegments;
  private snow: THREE.Points;
  private drops: Float32Array;
  private fires: THREE.InstancedMesh;
  private flames: THREE.InstancedMesh;
  private glows: THREE.InstancedMesh;
  private huts: THREE.InstancedMesh;
  private stoneHuts: THREE.InstancedMesh;
  private cairns: THREE.InstancedMesh;
  private lumps: THREE.InstancedMesh;
  private piles: THREE.InstancedMesh;
  private fireLights: THREE.PointLight[] = [];
  private selfLight = new THREE.PointLight(0xffd27a, 0, 22, 1.5);
  private treeIndex = new Map<object, number>();
  private ring: THREE.Mesh;
  private placeRing: THREE.Mesh | null = null;
  private links: THREE.LineSegments;
  private trail: THREE.Line;
  private trailFor = -1;
  private slow = 0;
  private slower = 0;
  private time = 0;
  private ratio = 1;
  private slowFrames = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", logarithmicDepthBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x03040a);
    this.ratio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.cam = new GlobeCam(this.camera, canvas);

    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.5;
    this.scene.add(this.sun, this.sun.target, this.moon, this.moon.target, this.hemi, this.land, this.flora);

    // Space, and the sky from below.
    this.skyU = {
      uSunDir: this.shared.uSunDir, uTime: this.shared.uTime, uUp: { value: new THREE.Vector3(0, 1, 0) }, uDay: { value: C(0x2f7fe0) },
      uHorizon: { value: C(0xb7d6f2) }, uInAir: { value: 0 }, uLocalSun: { value: 1 }, uDrop: { value: 0 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 20),
      new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, depthTest: false }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    this.seaMat = new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG, transparent: true, depthWrite: false,
      uniforms: { ...this.shared, uDeep: { value: C(0x0d3f66) }, uShallow: { value: C(0x3fb7c2) }, uNear: { value: 0 } },
    });
    this.airMat = new THREE.ShaderMaterial({
      vertexShader: AIR_VERT, fragmentShader: AIR_FRAG, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
      uniforms: { uSunDir: this.shared.uSunDir, uFade: { value: 1 } },
    });
    const air = new THREE.Mesh(new THREE.SphereGeometry(R * 1.13, 96, 64), this.airMat);
    air.renderOrder = 1;
    this.scene.add(air);
    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false,
      uniforms: { ...this.shared, uFade: { value: 1 } },
    });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(R + 11, 128, 80), this.cloudMat);
    clouds.renderOrder = 5;
    this.scene.add(clouds);

    // Rain and snow, near the ground.
    const n = 1400;
    this.drops = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = hash1(i) * Math.PI * 2;
      const r = Math.sqrt(hash1(i + 0.5)) * 55;
      this.drops[i * 3] = Math.cos(a) * r;
      this.drops[i * 3 + 1] = hash1(i + 0.25) * 34;
      this.drops[i * 3 + 2] = Math.sin(a) * r;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xdfeaf5, transparent: true, opacity: 0.4, depthWrite: false }));
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.4, transparent: true, opacity: 0.9, depthWrite: false }));
    this.rain.frustumCulled = this.snow.frustumCulled = false;
    this.rain.renderOrder = this.snow.renderOrder = 7;
    this.scene.add(this.rain, this.snow);

    // Things the folk make, and what gets left behind.
    const std = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const inst = (g: THREE.BufferGeometry, cap: number, mat: THREE.Material = std(), shadow = false): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(g, mat, cap);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = shadow;
      this.scene.add(mesh);
      return mesh;
    };
    this.fires = inst(join([
      part(tube(5), 0x5a4030, { s: [0.09, 0.7, 0.09], r: [Math.PI / 2, 0, 0], p: [0, 0.09, 0] }),
      part(tube(5), 0x4d3628, { s: [0.09, 0.7, 0.09], r: [Math.PI / 2, 1.1, 0], p: [0, 0.12, 0] }),
      part(tube(5), 0x664a36, { s: [0.09, 0.7, 0.09], r: [Math.PI / 2, 2.2, 0], p: [0, 0.15, 0] }),
      part(ball(0), 0x8a8780, { s: 0.13, p: [0.42, 0.06, 0.1] }),
      part(ball(0), 0x7d7a74, { s: 0.12, p: [-0.38, 0.06, 0.22] }),
      part(ball(0), 0x8a8780, { s: 0.12, p: [0.05, 0.06, -0.44] }),
    ]), 60);
    this.flames = inst(
      join([part(cone(5), 0xffa23a, { s: [0.2, 0.62, 0.2], p: [0, 0.48, 0] }), part(cone(5), 0xffe08a, { s: [0.11, 0.36, 0.11], p: [0.03, 0.4, 0.02] })]),
      60, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    );
    this.glows = inst(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 60,
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xff9a40, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.glows.renderOrder = 6;
    const hut = (wall: number, roof: number): THREE.BufferGeometry => join([
      part(cone(7), roof, { s: [0.95, 1.15, 0.95], p: [0, 0.57, 0] }),
      part(cone(7), wall, { s: [1.02, 0.5, 1.02], p: [0, 0.25, 0] }),
      part(box(), 0x1d1712, { s: [0.34, 0.55, 0.1], p: [0, 0.27, 0.72], r: [-0.33, 0, 0] }),
      part(tube(4), 0x5a4030, { s: [0.03, 0.5, 0.03], p: [0.05, 1.25, 0], r: [0, 0, 0.3] }),
      part(tube(4), 0x5a4030, { s: [0.03, 0.5, 0.03], p: [-0.05, 1.25, 0], r: [0, 0, -0.3] }),
    ]);
    this.huts = inst(hut(0x6f5437, 0x8a6a45), 80, std(), true);
    this.stoneHuts = inst(join([
      part(tube(8, 0.92), 0x9a968d, { s: [0.95, 0.62, 0.95], p: [0, 0.31, 0] }),
      part(cone(8), 0x8a6a45, { s: [1.08, 0.75, 1.08], p: [0, 0.98, 0] }),
      part(box(), 0x1d1712, { s: [0.32, 0.46, 0.1], p: [0, 0.24, 0.9] }),
    ]), 80, std(), true);
    this.cairns = inst(join([
      part(ball(0), 0x8d8a82, { s: [0.28, 0.16, 0.26], p: [0, 0.12, 0] }),
      part(ball(0), 0x9a968d, { s: [0.2, 0.13, 0.19], p: [0.02, 0.36, 0] }),
      part(ball(0), 0x85827a, { s: [0.13, 0.1, 0.13], p: [0, 0.55, 0.01] }),
    ]), 80, std(), true);
    this.lumps = inst(join([
      part(ball(0), 0xe9e2d0, { s: [0.3, 0.1, 0.2], p: [0, 0.07, 0] }),
      part(tube(4), 0xe9e2d0, { s: [0.03, 0.4, 0.03], r: [0, 0, 1.4], p: [0.2, 0.08, 0.1] }),
      part(tube(4), 0xddd5c0, { s: [0.03, 0.34, 0.03], r: [0.3, 0, 1.2], p: [-0.1, 0.1, -0.12] }),
    ]), 120);
    this.piles = inst(join([
      part(ball(0), 0xd4491a, { s: 0.16, p: [0, 0.12, 0] }),
      part(ball(0), 0xe2702c, { s: 0.15, p: [0.22, 0.11, 0.08] }),
      part(ball(0), 0xc93f17, { s: 0.15, p: [-0.12, 0.11, 0.2] }),
      part(ball(0), 0xe58a3a, { s: 0.14, p: [0.06, 0.3, 0.1] }),
      part(ball(0), 0xd4491a, { s: 0.14, p: [-0.16, 0.1, -0.14] }),
    ]), 60);
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xff8a3a, 0, 16, 1.6);
      this.fireLights.push(l);
      this.scene.add(l);
    }
    const blade = (x: number, z: number, lean: number): THREE.BufferGeometry => part(cone(3), 0xffffff, { s: [0.05, 0.46, 0.05], p: [x, 0.2, z], r: [lean, 0, lean * 0.7] });
    this.tufts = inst(join([blade(0, 0, 0.12), blade(0.1, 0.06, -0.25), blade(-0.09, 0.05, 0.3), blade(0.02, -0.1, -0.1), blade(-0.05, -0.04, 0.4)]), 2600);
    this.tufts.receiveShadow = true;

    // The ring under whoever is being followed, the line of where it has been, and who told whom.
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.74, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xd4491a, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false }),
    );
    this.ring.renderOrder = 20;
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.links = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xd4491a, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }));
    this.links.renderOrder = 19;
    this.links.frustumCulled = false;
    this.trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf2eee5, transparent: true, opacity: 0.75, toneMapped: false }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 18;
    this.scene.add(this.links, this.trail);

    this.scene.add(this.selfLight);
    this.critters = new Critters(this.scene);
    this.resize();
  }

  /** Seconds since the page opened, as the drawing counts them. */
  get clock(): number {
    return this.time;
  }

  /* ---------------- building a planet ---------------- */

  setWorld(w: World): void {
    this.world = w;
    const t = w.terrain;
    for (const group of [this.land, this.flora]) {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      group.clear();
    }
    this.setPlace(-1);
    const globe = (this.globe = new Globe(t));
    globe.paint(w, true);

    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    groundMat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, this.shared);
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vPlanet;").replace("#include <begin_vertex>", `#include <begin_vertex>\n${GROUND_PATCH.vertex}`);
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", `#include <common>\n${GROUND_PATCH.head}\n${NOISE}`)
        .replace("#include <color_fragment>", `#include <color_fragment>\n${GROUND_PATCH.color}`);
    };
    const ground = new THREE.Mesh(globe.land, groundMat);
    ground.receiveShadow = true;
    ground.castShadow = true;
    this.land.add(ground);
    const sea = new THREE.Mesh(globe.sea, this.seaMat);
    sea.renderOrder = 2;
    this.land.add(sea);

    // Plants.
    const std = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const shapes: THREE.BufferGeometry[] = [
      join([part(tube(5, 0.6), 0x6b4a33, { s: [0.16, 1.2, 0.16], p: [0, 0.6, 0] })]),
      join([
        part(tube(5, 0.7), 0x5a3f2c, { s: [0.12, 0.7, 0.12], p: [0, 0.35, 0] }),
        part(cone(6), 0x3f7a48, { s: [0.85, 1.2, 0.85], p: [0, 1.1, 0] }),
        part(cone(6), 0x3a7044, { s: [0.65, 1.0, 0.65], p: [0, 1.75, 0] }),
        part(cone(6), 0x35673f, { s: [0.42, 0.85, 0.42], p: [0, 2.35, 0] }),
      ]),
      join([
        part(tube(5, 0.7), 0x7a5a3c, { s: [0.11, 2.1, 0.11], p: [0.08, 1.05, 0], r: [0, 0, -0.08] }),
        ...[0, 1, 2, 3, 4, 5].map((i) => part(ball(0), i & 1 ? 0x2f7d3f : 0x3b9148, { s: [0.75, 0.07, 0.2], p: [0.16 + Math.cos(i * 1.05) * 0.55, 2.1 - 0.12 * (i & 1), Math.sin(i * 1.05) * 0.55], r: [0, -i * 1.05, -0.35] })),
      ]),
      join([
        part(tube(6, 0.75), 0x6f8f5a, { s: [0.2, 1.3, 0.2], p: [0, 0.65, 0] }),
        part(tube(5, 0.8), 0x7a9a62, { s: [0.11, 0.6, 0.11], p: [0.3, 0.8, 0] }),
        part(tube(5, 0.8), 0x7a9a62, { s: [0.1, 0.45, 0.1], p: [-0.28, 0.55, 0.05] }),
        part(ball(0), 0xd4491a, { s: 0.07, p: [0, 1.34, 0] }),
      ]),
    ];
    const byType = [0, 1, 2, 3].map((ty) => t.trees.filter((tr) => tr.type === ty));
    const place = (mesh: THREE.InstancedMesh, i: number, o: { x: number; y: number; z: number; s: number }, scale = 1): void => {
      const s = o.s * 0.85 * scale;
      stand(tmpM, o.x, o.y, o.z, R + globe.heightAt(o.x, o.y, o.z) - 0.05, s, hash1(i * 7.7 + o.x) * 6.28, s * (0.9 + hash1(i) * 0.3));
      mesh.setMatrixAt(i, tmpM);
    };
    this.groves = [];
    this.treeIndex = new Map(t.trees.map((tr, i) => [tr as object, i]));
    const grove = (mesh: THREE.InstancedMesh, list: { x: number; y: number; z: number }[]): void => {
      this.groves.push({ mesh, at: list, base: list.map((_, i) => { const mm = new THREE.Matrix4(); mesh.getMatrixAt(i, mm); return mm; }), down: new Uint8Array(list.length) });
    };
    byType.forEach((list, ty) => {
      const mesh = new THREE.InstancedMesh(shapes[ty], std(), list.length);
      list.forEach((tr, i) => place(mesh, i, tr));
      if (ty > 0) grove(mesh, list);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.flora.add(mesh);
    });
    const canopyGeo = join([
      part(ball(1), 0xffffff, { s: [0.95, 0.85, 0.95], p: [0, 1.75, 0] }),
      part(ball(0), 0xf2f2f2, { s: [0.62, 0.55, 0.62], p: [0.5, 1.35, 0.25] }),
      part(ball(0), 0xe9e9e9, { s: [0.55, 0.5, 0.55], p: [-0.45, 1.45, -0.3] }),
    ]);
    this.canopy = new THREE.InstancedMesh(canopyGeo, std(), byType[0].length);
    this.canopyAt = byType[0];
    byType[0].forEach((tr, i) => {
      place(this.canopy as THREE.InstancedMesh, i, tr);
      this.canopy?.setColorAt(i, tmpC.set(0x5f9a3e));
    });
    grove(this.canopy, byType[0]);
    const bushGeo = join([part(ball(0), 0x5b8f3d, { s: [0.5, 0.36, 0.5], p: [0, 0.26, 0] }), part(ball(0), 0x6a9d45, { s: [0.34, 0.28, 0.34], p: [0.3, 0.22, 0.12] })]);
    const bushes = new THREE.InstancedMesh(bushGeo, std(), t.bushes.length);
    t.bushes.forEach((b, i) => place(bushes, i, b));
    const berryGeo = join(
      [[0.2, 0.42, 0.25], [-0.26, 0.38, 0.12], [0.05, 0.52, -0.2], [0.4, 0.28, -0.05], [-0.1, 0.3, 0.42], [-0.3, 0.3, -0.28]].map((p) =>
        part(ball(0), 0xd4491a, { s: 0.085, p: p as [number, number, number] }),
      ),
    );
    this.berries = new THREE.InstancedMesh(berryGeo, std(), t.bushes.length);
    const rocks = new THREE.InstancedMesh(join([part(new THREE.DodecahedronGeometry(1, 0), 0x8f8b82, { s: [1, 0.7, 0.85] })]), std(), t.rocks.length);
    t.rocks.forEach((r, i) => {
      place(rocks, i, r);
      rocks.setColorAt(i, tmpC.setScalar(0.8 + hash1(i * 3) * 0.35));
    });
    for (const mesh of [this.canopy, bushes, rocks, this.berries]) {
      mesh.castShadow = mesh !== this.berries;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.flora.add(mesh);
    }
    // Start over the day side, a little off to one side where the light is low and long.
    const sx = w.sunX * Math.cos(0.75) - w.sunZ * Math.sin(0.75), sz = w.sunX * Math.sin(0.75) + w.sunZ * Math.cos(0.75);
    this.cam.jump(sx, 0.32, sz);
    this.slower = 0;
    this.tuftAt.set(9, 9, 9);
    this.critters.reset();
  }

  /** Pull back to the whole planet, over the side the sun is on. */
  home(w: World): void {
    const sx = w.sunX * Math.cos(0.6) - w.sunZ * Math.sin(0.6), sz = w.sunX * Math.sin(0.6) + w.sunZ * Math.cos(0.6);
    this.cam.home();
    this.cam.flyTo(sx, 0.3, sz, 290);
  }

  /* ---------------- things that change slowly ---------------- */

  private leaves(w: World): void {
    const t = w.terrain;
    const year = ((w.t / DAY) % YEAR_DAYS) / YEAR_DAYS;
    const swing = 9 * Math.sin((year - 0.125) * Math.PI * 2);
    const leaf = [C(0x86bb4e), C(0x5c9a3c), C(0xd08a2e), C(0xa3957f)];
    const reds = [C(0xd9a23a), C(0xcf6a2a), C(0xb8402a), C(0xc98f2c)];
    const snow = C(0xf2f5f7);
    const tone = (north: boolean): { base: THREE.Color; autumn: number } => {
      const y = (year + (north ? 0 : 0.5)) % 1;
      const f = y * 4 - 0.5;
      const a = ((Math.floor(f) % 4) + 4) % 4;
      return { base: leaf[a].clone().lerp(leaf[(a + 1) % 4], smooth(0, 1, f - Math.floor(f))), autumn: Math.max(0, 1 - Math.abs(y - 0.625) * 7) };
    };
    const N = tone(true), S = tone(false);
    if (this.canopy) {
      for (let i = 0; i < this.canopyAt.length; i++) {
        const tr = this.canopyAt[i];
        const h = tr.y >= 0 ? N : S;
        // Near the middle of the planet the leaves never turn.
        const seasonal = smooth(0.12, 0.4, Math.abs(tr.y));
        tmpC.copy(leaf[1]).lerp(h.base, seasonal).lerp(reds[i % 4], h.autumn * seasonal * (0.35 + hash1(i) * 0.65));
        tmpC.multiplyScalar(0.88 + hash1(i * 1.9) * 0.24).lerp(snow, smooth(1, -4, t.temp[tr.cell] + swing * tr.y) * 0.75);
        this.canopy.setColorAt(i, tmpC);
      }
      if (this.canopy.instanceColor) this.canopy.instanceColor.needsUpdate = true;
    }
    if (this.berries && this.globe) {
      for (let i = 0; i < t.bushes.length; i++) {
        const b = t.bushes[i];
        const s = Math.min(1, w.bush[i] / (BUSH_MAX * 0.6));
        stand(tmpM, b.x, b.y, b.z, R + this.globe.heightAt(b.x, b.y, b.z) - 0.05, s < 0.15 ? 0 : b.s * 0.85 * (0.5 + 0.5 * s), hash1(i * 7.7 + b.x) * 6.28);
        this.berries.setMatrixAt(i, tmpM);
      }
      this.berries.instanceMatrix.needsUpdate = true;
    }
  }

  /** Grass tufts on the ground around where the camera is looking: tall where nobody has grazed. */
  private grassNear(w: World): void {
    const globe = this.globe;
    if (!globe) return;
    const t = w.terrain;
    const g = grid();
    const c = this.cam.tgt;
    this.tuftAt.copy(c);
    const seenCell = new Set<number>();
    let n = 0;
    const year = ((w.t / DAY) % YEAR_DAYS) / YEAR_DAYS;
    const f = ((year + (c.y >= 0 ? 0 : 0.5)) % 1) * 4 - 0.5;
    const ramp = [C(0x8cc152), C(0x6fa446), C(0xb0a04a), C(0x98a184)];
    const a = ((Math.floor(f) % 4) + 4) % 4;
    tmpC.copy(ramp[a]).lerp(ramp[(a + 1) % 4], smooth(0, 1, f - Math.floor(f))).multiplyScalar(0.92);
    for (let k = 0; k < 2200 && n < 2590; k++) {
      // A sunflower spiral of sample points over a disc around the target.
      const r = Math.sqrt(k / 2200) * 36;
      const ang = k * 2.39996;
      const dx = (Math.cos(ang) * r) / R, dz = (Math.sin(ang) * r) / R;
      const px = c.x + this.cam.right.x * dx + this.cam.fwd.x * dz, py = c.y + this.cam.right.y * dx + this.cam.fwd.y * dz, pz = c.z + this.cam.right.z * dx + this.cam.fwd.z * dz;
      const cell = cellOf(px, py, pz);
      if (seenCell.has(cell)) continue;
      seenCell.add(cell);
      const kind = t.kind[cell];
      if (kind !== PLAINS && kind !== FOREST && kind !== TUNDRA) continue;
      const have = Math.min(1, w.grass[cell] / (t.fert[cell] || 1));
      if (have < 0.2) continue;
      const per = kind === PLAINS ? 2 : 1;
      for (let j = 0; j < per; j++) {
        const jx = (hash1(cell * 1.3 + j) - 0.5) * 0.02, jy = (hash1(cell * 2.1 + j) - 0.5) * 0.02, jz = (hash1(cell * 3.7 + j) - 0.5) * 0.02;
        let ux = g.cx[cell] + jx, uy = g.cy[cell] + jy, uz = g.cz[cell] + jz;
        const l = Math.hypot(ux, uy, uz);
        ux /= l;
        uy /= l;
        uz /= l;
        const s = 0.5 + have * 0.9;
        stand(tmpM, ux, uy, uz, R + globe.heightAt(ux, uy, uz) - 0.03, s, hash1(cell + j) * 6.28, s * (0.8 + hash1(cell + j + 5) * 0.5));
        this.tufts.setMatrixAt(n, tmpM);
        this.tufts.setColorAt(n, tmpC);
        n++;
      }
    }
    this.tufts.count = n;
    this.tufts.instanceMatrix.needsUpdate = true;
    if (this.tufts.instanceColor) this.tufts.instanceColor.needsUpdate = true;
  }

  /* ---------------- every frame ---------------- */

  frame(w: World, dt: number): void {
    if (this.world !== w) this.setWorld(w);
    const globe = this.globe as Globe;
    this.time += dt;
    this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.05;
    const cam = this.cam;

    // The followed creature leads the camera; in a body of your own, that body does.
    const me = w.avatarId >= 0 ? w.byId.get(w.avatarId) : undefined;
    cam.avatar = !!me;
    const sel = me ?? (this.selected >= 0 ? w.byId.get(this.selected) : undefined);
    const selAt = sel ? this.critters.where(sel.id) : undefined;
    if (sel && selAt) cam.follow(selAt.ux, selAt.uy, selAt.uz);
    cam.update(dt, (x, y, z) => globe.surfaceAt(x, y, z));

    // Light: the sun where the engine says it is; a dim moon opposite so the night side is not black.
    const sunDir = this.shared.uSunDir.value.set(w.sunX, w.sunY, w.sunZ);
    this.shared.uTime.value = this.time;
    const tx = cam.tgt.x * R, ty = cam.tgt.y * R, tz = cam.tgt.z * R;
    const localSun = sunAt(w, cam.tgt.x, cam.tgt.y, cam.tgt.z);
    this.sun.target.position.set(tx, ty, tz);
    this.sun.position.set(tx + sunDir.x * 260, ty + sunDir.y * 260, tz + sunDir.z * 260);
    this.moon.target.position.set(0, 0, 0);
    this.moon.position.copy(sunDir).multiplyScalar(-300);
    const shadows = this.quality > 0 && cam.dist < 150 && localSun > 0.03;
    if (this.sun.castShadow !== shadows) this.sun.castShadow = shadows;
    if (shadows) {
      const sc = this.sun.shadow.camera;
      const ext = Math.min(95, Math.max(22, cam.dist * 0.85));
      if (Math.abs(sc.right - ext) > 2) {
        sc.left = sc.bottom = -ext;
        sc.right = sc.top = ext;
        sc.near = 60;
        sc.far = 460;
        sc.updateProjectionMatrix();
      }
    }
    // Clouds over the whole planet thicken a little when a lot of it is raining.
    let raining = 0;
    for (let i = 0; i < w.rainGrid.length; i += 7) raining += w.rainGrid[i];
    this.shared.uCover.value += (0.02 + Math.min(0.1, (raining / (w.rainGrid.length / 7)) * 0.25) - this.shared.uCover.value) * Math.min(1, dt);

    // Space and sky.
    const camUp = this.skyU.uUp.value as THREE.Vector3;
    camUp.copy(this.camera.position).normalize();
    this.skyU.uInAir.value = cam.inAir;
    this.skyU.uLocalSun.value = camUp.dot(sunDir);
    const camR = this.camera.position.length();
    this.skyU.uDrop.value = Math.sqrt(Math.max(0, 1 - (R / camR) ** 2));
    this.sky.position.copy(this.camera.position);
    this.sky.scale.setScalar(this.camera.far * 0.9);
    this.seaMat.uniforms.uNear.value = 1 - smooth(25, 180, cam.dist);
    this.cloudMat.uniforms.uFade.value = smooth(26, 90, this.camera.position.length() - R);
    this.airMat.uniforms.uFade.value = 0.35 + 0.65 * smooth(20, 120, this.camera.position.length() - R);
    this.flora.visible = cam.dist < 260;

    this.slow -= dt;
    if (this.slow <= 0) {
      this.slow = 0.25;
      globe.paint(w);
      if (cam.dist < 80 && (cam.tgt.distanceTo(this.tuftAt) * R > 6 || this.slower <= 0)) this.grassNear(w);
      this.tufts.visible = cam.dist < 80;
      this.slower -= 0.25;
      if (this.slower <= 0) {
        this.slower = 3;
        this.leaves(w);
      }
      this.drawTrail(w);
    }

    this.weatherFx(w, dt);
    this.things(w);
    this.critters.update(w, dt, this.time, cam.dist, globe);

    this.partTrees(sel && selAt && cam.dist < 70 && !sel.alt ? selAt : null, w);
    if (me && selAt) {
      const dark = 1 - smooth(-0.15, 0.25, sunAt(w, me.x, me.y, me.z));
      this.selfLight.position.set(selAt.x + selAt.ux * 1.4, selAt.y + selAt.uy * 1.4, selAt.z + selAt.uz * 1.4);
      this.selfLight.intensity = 6 + 34 * dark;
    } else this.selfLight.intensity = 0;
    if (sel && selAt && !me) {
      this.ring.visible = true;
      vy.set(selAt.ux, selAt.uy, selAt.uz);
      this.ring.quaternion.setFromUnitVectors(UP, vy);
      this.ring.position.set(selAt.x + vy.x * 0.1, selAt.y + vy.y * 0.1, selAt.z + vy.z * 0.1);
      this.ring.scale.setScalar((1 + Math.sin(this.time * 3) * 0.06) * Math.min(3.2, Math.max(1.2, cam.dist / 50)));
    } else this.ring.visible = false;

    // Keep the picture smooth on slower machines: step down a ladder of quality when frames run under about 52 a second.
    if (this.fps < 52) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 70 && (this.ratio > 0.76 || this.quality > 0)) {
      this.slowFrames = 0;
      if (this.ratio > 1.01) this.ratio = Math.max(1, this.ratio - 0.25);
      else if (this.quality === 2) {
        // Smaller shadows.
        this.quality = 1;
        this.sun.shadow.mapSize.set(1024, 1024);
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
        this.shared.uLow.value = 1; // and cheaper water and cloud
      } else if (this.quality === 1) this.quality = 0; // no shadows
      else this.ratio = 0.75; // and, last, a slightly softer picture
      this.resize();
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** The trees right over the followed creature shrink out of the way, and grow back when it moves on. */
  private partTrees(at: { ux: number; uy: number; uz: number } | null, w: World): void {
    const reach = (3.3 / R) ** 2;
    for (const g of this.groves) {
      let changed = false;
      for (let i = 0; i < g.at.length; i++) {
        const tr = g.at[i];
        // Out of the way of whoever is followed, or cut down for wood: either way it is not drawn standing.
        const cut = w.felled[this.treeIndex.get(tr) ?? 0] > w.t;
        const near = cut || (at !== null && (tr.x - at.ux) ** 2 + (tr.y - at.uy) ** 2 + (tr.z - at.uz) ** 2 < reach) ? 1 : 0;
        if (near === g.down[i]) continue;
        g.down[i] = near;
        changed = true;
        if (near) {
          g.base[i].decompose(tmpP, tmpQ, tmpS);
          tmpM.compose(tmpP, tmpQ, tmpS.multiplyScalar(0.001));
          g.mesh.setMatrixAt(i, tmpM);
        } else g.mesh.setMatrixAt(i, g.base[i]);
      }
      if (changed) g.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private weatherFx(w: World, dt: number): void {
    const cam = this.cam;
    const wx = cam.dist < 130 ? weatherAt(w, cam.tgt.x, cam.tgt.y, cam.tgt.z) : null;
    const amount = wx ? wx.rain * smooth(130, 80, cam.dist) : 0;
    const snowing = !!wx && wx.temp < 1.5;
    this.rain.visible = amount > 0.03 && !snowing;
    this.snow.visible = amount > 0.03 && snowing;
    if (amount <= 0.03 || !this.globe) return;
    const n = this.drops.length / 3;
    const shown = Math.floor(n * Math.min(1, amount * 1.2));
    const up = cam.up, right = cam.right, fwd = cam.fwd;
    const base = R + this.globe.surfaceAt(up.x, up.y, up.z);
    const fall = snowing ? 3 : 34;
    const d = this.drops;
    const arr = ((snowing ? this.snow : this.rain).geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < shown; i++) {
      d[i * 3 + 1] -= fall * dt * (0.8 + hash1(i) * 0.4);
      if (d[i * 3 + 1] < 0) d[i * 3 + 1] += 34;
      const a = d[i * 3] + (snowing ? Math.sin(this.time * 0.8 + i) * 0.6 : 0), b = d[i * 3 + 2], h = base + d[i * 3 + 1];
      const x = up.x * h + right.x * a + fwd.x * b, y = up.y * h + right.y * a + fwd.y * b, z = up.z * h + right.z * a + fwd.z * b;
      if (snowing) {
        arr[i * 3] = x;
        arr[i * 3 + 1] = y;
        arr[i * 3 + 2] = z;
      } else {
        arr[i * 6] = x;
        arr[i * 6 + 1] = y;
        arr[i * 6 + 2] = z;
        arr[i * 6 + 3] = x + up.x * 0.9;
        arr[i * 6 + 4] = y + up.y * 0.9;
        arr[i * 6 + 5] = z + up.z * 0.9;
      }
    }
    const geo = (snowing ? this.snow : this.rain).geometry;
    geo.setDrawRange(0, snowing ? shown : shown * 2);
    geo.attributes.position.needsUpdate = true;
    (this.rain.material as THREE.LineBasicMaterial).opacity = 0.16 + 0.3 * amount;
  }

  private things(w: World): void {
    const globe = this.globe as Globe;
    const cam = this.cam;
    const at = (mesh: THREE.InstancedMesh, i: number, o: { x: number; y: number; z: number }, s: number, spin = 0, lift = 0): void => {
      stand(tmpM, o.x, o.y, o.z, R + globe.surfaceAt(o.x, o.y, o.z) + lift, s, spin);
      mesh.setMatrixAt(i, tmpM);
    };
    const near = cam.dist < 240;
    const far = Math.max(1, cam.dist / 55);
    const nf = Math.min(w.fires.length, 60);
    for (let i = 0; i < nf; i++) {
      const f = w.fires[i];
      const life = Math.min(1, f.fuel / (DAY * 0.12));
      const flick = 0.75 + 0.25 * Math.sin(this.time * 11 + i * 2.1) + 0.12 * Math.sin(this.time * 23 + i);
      const dark = 1 - smooth(-0.15, 0.2, sunAt(w, f.x, f.y, f.z));
      at(this.fires, i, f, 1, i * 1.3);
      at(this.flames, i, f, (0.55 + 0.6 * life) * flick, this.time * 1.5 + i);
      // From far off the glow is drawn larger, so camp fires show on the night side from orbit.
      at(this.glows, i, f, (2.6 + 3.4 * dark) * (0.6 + 0.4 * life) * (0.92 + 0.08 * flick) * (dark > 0.3 ? far : 1), 0, 0.15 + (far - 1) * 0.6);
    }
    this.fires.count = this.flames.count = near ? nf : 0;
    this.glows.count = nf;
    (this.glows.material as THREE.MeshBasicMaterial).opacity = 0.55;
    const close = w.fires
      .map((f) => ({ f, d: (f.x - cam.tgt.x) ** 2 + (f.y - cam.tgt.y) ** 2 + (f.z - cam.tgt.z) ** 2 }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.fireLights.length; i++) {
      const l = this.fireLights[i];
      const e = cam.dist < 120 ? close[i] : undefined;
      if (e && e.d < 0.2) {
        const r = R + globe.surfaceAt(e.f.x, e.f.y, e.f.z) + 0.9;
        l.position.set(e.f.x * r, e.f.y * r, e.f.z * r);
        const dark = 1 - smooth(-0.15, 0.2, sunAt(w, e.f.x, e.f.y, e.f.z));
        l.intensity = (8 + 38 * dark) * (0.85 + 0.15 * Math.sin(this.time * 13 + i * 4));
      } else l.intensity = 0;
    }
    let nh = 0, ns = 0;
    for (const s of w.shelters) {
      const mesh = s.stone ? this.stoneHuts : this.huts;
      const i = s.stone ? ns++ : nh++;
      if (i < 80) at(mesh, i, s, s.done ? 1 : 0.35 + 0.18 * s.wood, (s.x * 700 + s.y * 300) % 6.28);
    }
    this.huts.count = near ? Math.min(80, nh) : 0;
    this.stoneHuts.count = near ? Math.min(80, ns) : 0;
    const nm = Math.min(w.markers.length, 80);
    for (let i = 0; i < nm; i++) at(this.cairns, i, w.markers[i], 1.15, i);
    this.cairns.count = near ? nm : 0;
    const nc = Math.min(w.carcasses.length, 120);
    for (let i = 0; i < nc; i++) at(this.lumps, i, w.carcasses[i], 0.7 + Math.min(1, w.carcasses[i].energy / 120) * 0.7, i * 2.1);
    this.lumps.count = near ? nc : 0;
    const np = Math.min(w.piles.length, 60);
    for (let i = 0; i < np; i++) at(this.piles, i, w.piles[i], 0.6 + Math.min(1, w.piles[i].energy / 200) * 0.9, i);
    this.piles.count = near ? np : 0;
    for (const m of [this.fires, this.flames, this.glows, this.huts, this.stoneHuts, this.cairns, this.lumps, this.piles]) m.instanceMatrix.needsUpdate = true;
  }

  /** The path the followed creature has walked, drawn on the ground. */
  private drawTrail(w: World): void {
    const c = this.selected >= 0 ? w.byId.get(this.selected) : undefined;
    if (!c || !this.globe) {
      if (this.trailFor !== -1) {
        this.trail.geometry.setDrawRange(0, 0);
        this.trailFor = -1;
      }
      return;
    }
    this.trailFor = c.id;
    const pts = [...c.path, c.x, c.y, c.z];
    const pos: number[] = [];
    for (let i = 0; i + 5 < pts.length; i += 3) {
      // Fill in between logged points so the line hugs the ground.
      const steps = 4;
      for (let s = 0; s < steps; s++) {
        const u = s / steps;
        let x = pts[i] + (pts[i + 3] - pts[i]) * u, y = pts[i + 1] + (pts[i + 4] - pts[i + 1]) * u, z = pts[i + 2] + (pts[i + 5] - pts[i + 2]) * u;
        const l = Math.hypot(x, y, z);
        x /= l;
        y /= l;
        z /= l;
        const r = R + this.globe.surfaceAt(x, y, z) + 0.35;
        pos.push(x * r, y * r, z * r);
      }
    }
    this.trail.geometry.dispose();
    this.trail.geometry = new THREE.BufferGeometry();
    this.trail.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  }

  /* ---------------- pointing at things ---------------- */

  /** Where on the planet a screen point falls: a unit vector, or null if it misses. */
  pickGround(clientX: number, clientY: number): THREE.Vector3 | null {
    const globe = this.globe;
    if (!globe) return null;
    const r = this.canvas.getBoundingClientRect();
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = new THREE.Vector3();
    const sphere = new THREE.Sphere(new THREE.Vector3(), R);
    let rad = R + 1;
    for (let k = 0; k < 4; k++) {
      sphere.radius = rad;
      if (!rc.ray.intersectSphere(sphere, hit)) return k === 0 ? null : hit.normalize();
      const l = hit.length();
      rad = R + globe.surfaceAt(hit.x / l, hit.y / l, hit.z / l);
    }
    return hit.normalize();
  }

  /** Whether a point on the planet faces the camera (is not round the back). */
  private facing(x: number, y: number, z: number): boolean {
    const c = this.camera.position;
    return (c.x - x) * x + (c.y - y) * y + (c.z - z) * z > 0;
  }

  /** The creature nearest a screen point, if any is close enough to count as tapped. */
  pickCreature(w: World, clientX: number, clientY: number): number {
    const r = this.canvas.getBoundingClientRect();
    let best = -1, bd = 30 * 30;
    const v = new THREE.Vector3();
    for (const c of w.creatures) {
      const p = this.critters.where(c.id);
      if (!p || !this.facing(p.x, p.y, p.z)) continue;
      v.set(p.x + p.ux * 0.4, p.y + p.uy * 0.4, p.z + p.uz * 0.4).project(this.camera);
      if (v.z > 1 || v.z < -1) continue;
      const sx = r.left + ((v.x + 1) / 2) * r.width, sy = r.top + ((1 - v.y) / 2) * r.height;
      const d = (sx - clientX) ** 2 + (sy - clientY) ** 2;
      if (d < bd) {
        bd = d;
        best = c.id;
      }
    }
    return best;
  }

  /** Screen position of a point on the planet (a unit vector), or null if it is out of sight. */
  toScreen(x: number, y: number, z: number, lift = 0): { x: number; y: number } | null {
    if (!this.globe) return null;
    const rr = R + this.globe.surfaceAt(x, y, z) + lift;
    if (!this.facing(x * rr, y * rr, z * rr)) return null;
    const v = new THREE.Vector3(x * rr, y * rr, z * rr).project(this.camera);
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
    const r = this.canvas.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
  }

  /** Screen position of a creature, where it is drawn. */
  creatureOnScreen(id: number, lift = 1.2): { x: number; y: number } | null {
    const p = this.critters.where(id);
    if (!p || !this.facing(p.x, p.y, p.z)) return null;
    const k = lift * Math.min(3.2, Math.max(1.2, this.cam.dist / 50));
    const v = new THREE.Vector3(p.x + p.ux * k, p.y + p.uy * k, p.z + p.uz * k).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
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
    const t: Terrain | undefined = this.world?.terrain;
    if (!t || !this.globe || placeId < 0) return;
    const p = t.places[placeId];
    const c = new THREE.Vector3(p.x, p.y, p.z);
    const a = new THREE.Vector3().crossVectors(c, Math.abs(c.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
    const b = new THREE.Vector3().crossVectors(c, a);
    const pos: number[] = [];
    const idx: number[] = [];
    const seg = 120;
    for (let i = 0; i <= seg; i++) {
      const ang = (i / seg) * Math.PI * 2;
      for (const rad of [p.r, p.r + 0.5]) {
        const k = rad / R;
        const d = c.clone().addScaledVector(a, Math.cos(ang) * k).addScaledVector(b, Math.sin(ang) * k).normalize();
        const rr = R + this.globe.surfaceAt(d.x, d.y, d.z) + 0.3;
        pos.push(d.x * rr, d.y * rr, d.z * rr);
      }
      if (i > 0) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2, i * 2 - 1, i * 2 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.placeRing = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, toneMapped: false }));
    this.placeRing.renderOrder = 18;
    this.scene.add(this.placeRing);
  }

  /** Draws arcs between pairs of creatures: who told whom. */
  setLinks(pairs: [number, number][]): void {
    const pos: number[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
    for (const [ia, ib] of pairs) {
      const pa = this.critters.where(ia), pb = this.critters.where(ib);
      if (!pa || !pb) continue;
      a.set(pa.x, pa.y, pa.z);
      b.set(pb.x, pb.y, pb.z);
      const steps = 16;
      const lift = Math.min(14, 1 + a.distanceTo(b) * 0.16);
      for (let i = 0; i < steps; i++) {
        for (const k of [i, i + 1]) {
          const u = k / steps;
          q.copy(a).lerp(b, u);
          q.setLength(R + (a.length() - R) * (1 - u) + (b.length() - R) * u + 1 + Math.sin(u * Math.PI) * lift);
          pos.push(q.x, q.y, q.z);
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
    // Keep the whole planet in view on a tall phone screen.
    this.camera.fov = w / h < 0.8 ? 54 : 38;
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
    this.trail.visible = false;
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL("image/jpeg", 0.93);
    this.ring.visible = ringWas;
    this.trail.visible = true;
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
