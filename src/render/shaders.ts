/** GLSL for space and sky, the ocean, the air at the planet's edge, and the clouds. */

export const NOISE = /* glsl */ `
float hash3(vec3 p){ p = fract(p * vec3(443.897, 441.423, 437.195)); p += dot(p, p.yzx + 19.19); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float s = 0.0, a = 0.5; for(int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
/** How much cloud stands over a direction from the planet's middle. */
float cloudAt(vec3 d, float t, float cover){
  vec3 q = d * 3.1 + vec3(t * 0.011, 0.0, t * 0.007);
  float n = fbm(q) * 0.62 + fbm(q * 2.7 + 5.0 - vec3(0.0, t * 0.01, 0.0)) * 0.38;
  // Bands: more cloud along the middle and in the high latitudes, clearer over the dry belts.
  float lat = abs(d.y);
  n += 0.07 * cos(lat * 9.0) - 0.03;
  return smoothstep(0.5 - cover, 0.66 - cover, n);
}
`;

/* ---------------- space, and the sky seen from the ground ---------------- */

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

export const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uSunDir, uUp, uDay, uHorizon;
uniform float uTime, uInAir, uLocalSun, uDrop;
${NOISE}
void main(){
  vec3 d = normalize(vDir);
  // Space: stars on a jittered grid, and a faint band of dust.
  vec3 sp = d * 90.0;
  vec3 cell = floor(sp);
  float r = hash3(cell);
  vec3 off = vec3(hash3(cell + 3.1), hash3(cell + 7.7), hash3(cell + 1.3)) - 0.5;
  float star = smoothstep(0.16, 0.0, length(fract(sp) - 0.5 - off * 0.6)) * step(0.9, r);
  star *= 0.55 + 0.45 * sin(uTime * (0.6 + r * 2.0) + r * 60.0);
  vec3 tint = mix(vec3(1.0, 0.86, 0.72), vec3(0.75, 0.86, 1.0), hash3(cell + 9.0));
  float band = pow(max(0.0, 1.0 - abs(dot(d, normalize(vec3(0.3, 0.9, 0.25)))) * 2.4), 2.0);
  vec3 space = vec3(0.012, 0.014, 0.03) + tint * star * 1.3 + vec3(0.09, 0.07, 0.13) * band * (0.4 + 0.6 * fbm(d * 5.0));
  // The sun itself.
  float sd = max(dot(d, uSunDir), 0.0);
  vec3 sun = vec3(1.0, 0.93, 0.8) * (smoothstep(0.99962, 0.99978, sd) * 6.0 + pow(sd, 600.0) * 0.9 + pow(sd, 60.0) * 0.16 + pow(sd, 8.0) * 0.04);
  // From down in the air: a sky that depends on how high the sun stands here.
  float h = dot(d, uUp) + uDrop;
  float day = smoothstep(-0.12, 0.3, uLocalSun);
  float dusk = max(0.0, 1.0 - abs(uLocalSun) / 0.38);
  vec3 zen = mix(vec3(0.02, 0.03, 0.08), uDay, day);
  vec3 hor = mix(vec3(0.05, 0.07, 0.15), uHorizon, day);
  hor = mix(hor, vec3(0.98, 0.56, 0.3), dusk * 0.75 * smoothstep(-0.2, 0.9, dot(d, uSunDir)));
  vec3 sky = mix(hor, zen, pow(clamp(h * 0.8, 0.0, 1.0), 0.6));
  float air = uInAir * (0.25 + 0.75 * day) * smoothstep(-0.06, 0.12, h);
  vec3 col = mix(space, sky + space * (1.0 - day) * 0.8, air) + sun * (1.0 + 2.0 * uInAir * day);
  gl_FragColor = vec4(col, 1.0);
}`;

/* ---------------- the ocean ---------------- */

export const OCEAN_VERT = /* glsl */ `
attribute float depth;
varying float vDepth;
varying vec3 vWorld;
varying vec3 vDirN;
void main(){
  vDepth = depth;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vDirN = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const OCEAN_FRAG = /* glsl */ `
precision highp float;
varying float vDepth;
varying vec3 vWorld;
varying vec3 vDirN;
uniform vec3 uSunDir, uDeep, uShallow;
uniform float uTime, uCover, uNear;
${NOISE}
void main(){
  if (vDepth < -0.06) discard;
  vec3 up = vDirN;
  vec3 v = normalize(cameraPosition - vWorld);
  // Ripples: fine near the camera, broad swell from far.
  vec3 q = vWorld * mix(0.07, 0.55, uNear);
  float t = uTime * 0.35;
  float n1 = fbm(q + vec3(t, 0.0, t * 0.7));
  float e = 0.4;
  vec3 g = vec3(fbm(q + vec3(t + e, 0.0, t * 0.7)) - n1, fbm(q + vec3(t, e, t * 0.7)) - n1, fbm(q + vec3(t, 0.0, t * 0.7 + e)) - n1);
  vec3 n = normalize(up - (g - up * dot(g, up)) * mix(0.55, 1.5, uNear));
  float sunUp = dot(up, uSunDir);
  float lit = smoothstep(-0.12, 0.25, sunUp);
  float deepness = smoothstep(0.0, 3.2, vDepth);
  vec3 body = mix(uShallow, uDeep, deepness);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 sky = mix(vec3(0.62, 0.78, 0.92), vec3(0.2, 0.42, 0.78), clamp(reflect(-v, n).y * 0.5 + 0.5, 0.0, 1.0));
  vec3 col = mix(body, sky, 0.12 + 0.55 * fres) * (0.06 + 0.94 * lit);
  // The sun on the water.
  vec3 r = reflect(-uSunDir, n);
  float glint = pow(max(dot(r, v), 0.0), mix(60.0, 220.0, uNear));
  col += vec3(1.0, 0.92, 0.78) * glint * 1.5 * lit;
  col += vec3(1.0, 0.7, 0.45) * pow(max(dot(r, v), 0.0), 9.0) * 0.12 * lit;
  // Foam along the shore.
  float lap = sin(vDepth * 9.0 - uTime * 1.8 + n1 * 7.0) * 0.5 + 0.5;
  float foam = (smoothstep(0.5, 0.0, vDepth) * (0.35 + 0.65 * lap) + smoothstep(0.14, 0.0, vDepth)) * (0.35 + 0.65 * uNear);
  col = mix(col, vec3(1.0) * (0.035 + 0.965 * lit), clamp(foam, 0.0, 1.0) * 0.8);
  // Cloud shadow.
  col *= 1.0 - 0.26 * cloudAt(normalize(up + uSunDir * 0.04), uTime, uCover) * lit;
  // A faint glow in the night sea.
  col += vec3(0.02, 0.09, 0.1) * (1.0 - lit) * smoothstep(0.75, 0.95, fbm(q * 3.0 + t)) * (1.0 - deepness);
  float alpha = max(mix(0.62, 0.97, deepness), clamp(foam, 0.0, 1.0));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/* ---------------- the air ---------------- */

export const AIR_VERT = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vWorld;
void main(){
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

/** Drawn on the inside of a shell a little bigger than the planet: the glow at the edge. */
export const AIR_FRAG = /* glsl */ `
precision highp float;
varying vec3 vNormalW;
varying vec3 vWorld;
uniform vec3 uSunDir;
uniform float uFade;
void main(){
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 n = normalize(vNormalW);
  // Strongest where the line of sight grazes the shell.
  float rim = pow(1.0 - abs(dot(v, n)), 2.6);
  float sun = dot(normalize(vWorld), uSunDir);
  float day = smoothstep(-0.25, 0.35, sun);
  float edge = max(0.0, 1.0 - abs(sun + 0.02) / 0.3);
  vec3 col = mix(vec3(0.25, 0.55, 1.0), vec3(1.0, 0.45, 0.18), edge * 0.8);
  // Looking towards the sun through the air: a bright arc.
  float through = pow(max(dot(-v, uSunDir), 0.0), 6.0);
  float a = rim * (0.08 + 1.25 * day + 0.9 * through * edge) * uFade;
  gl_FragColor = vec4(col * a, a);
}`;

/* ---------------- clouds ---------------- */

export const CLOUD_VERT = /* glsl */ `
varying vec3 vDirN;
varying vec3 vWorld;
void main(){
  vDirN = normalize(position);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const CLOUD_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDirN;
varying vec3 vWorld;
uniform vec3 uSunDir;
uniform float uTime, uCover, uFade;
${NOISE}
void main(){
  vec3 d = normalize(vDirN);
  float c = cloudAt(d, uTime, uCover);
  if (c < 0.01) discard;
  // Light from the sun side: sample a little towards the sun for a soft shaded edge.
  float towards = cloudAt(normalize(d + uSunDir * 0.02), uTime, uCover);
  float sunUp = dot(d, uSunDir);
  float lit = smoothstep(-0.18, 0.25, sunUp);
  float edge = max(0.0, 1.0 - abs(sunUp) / 0.28);
  float shade = clamp(0.62 + (c - towards) * 1.6, 0.35, 1.0);
  vec3 col = mix(vec3(0.03, 0.04, 0.09), vec3(0.9, 0.92, 0.95), lit) * shade;
  col = mix(col, vec3(1.0, 0.62, 0.38) * shade, edge * 0.6 * lit);
  gl_FragColor = vec4(col, c * 0.78 * uFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Added to the ground's own shader: cloud shadows, and a little grain so it holds up close. */
export const GROUND_PATCH = {
  head: /* glsl */ `
uniform vec3 uSunDir;
uniform float uTime, uCover;
varying vec3 vPlanet;
`,
  vertex: /* glsl */ `vPlanet = position;`,
  color: /* glsl */ `
  {
    vec3 pd = normalize(vPlanet);
    float grain = vnoise(vPlanet * 2.6) * 0.5 + vnoise(vPlanet * 9.0) * 0.5;
    diffuseColor.rgb *= 0.9 + 0.2 * grain;
    float sunHere = smoothstep(-0.1, 0.2, dot(pd, uSunDir));
    diffuseColor.rgb *= 1.0 - 0.26 * cloudAt(normalize(pd + uSunDir * 0.04), uTime, uCover) * sunHere;
  }
`,
};
