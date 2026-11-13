/** GLSL for the sky, the water, the falls at the rim and the cloud sea below. */

const NOISE = /* glsl */ `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for(int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

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
uniform vec3 uZenith, uHorizon, uSunDir, uSunCol, uMoonDir, uBelow;
uniform float uNight, uTime, uRain;
${NOISE}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
  // Below the horizon the sky deepens into the haze the island floats in.
  col = mix(col, uBelow, smoothstep(0.0, -0.55, h));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.22 + pow(sd, 3.0) * 0.08) * (1.0 - uRain * 0.8);
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.9996, md) * 0.9 + pow(md, 60.0) * 0.12) * uNight;
  // Stars: a jittered grid on the sphere, twinkling a little.
  vec2 sp = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0))) * 60.0;
  vec2 cell = floor(sp);
  vec2 f = fract(sp) - 0.5;
  float r = hash(cell);
  vec2 off = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
  float star = smoothstep(0.09, 0.0, length(f - off * 0.7)) * step(0.82, r);
  star *= 0.6 + 0.4 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
  col += vec3(star) * uNight * (1.0 - uRain) * smoothstep(-0.1, 0.25, h);
  gl_FragColor = vec4(col, 1.0);
}`;

export const WATER_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const WATER_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld;
varying vec2 vUv;
uniform sampler2D uHeight;
uniform vec3 uSunDir, uSunCol, uHorizon, uZenith, uDeep, uShallow, uFog;
uniform float uTime, uLevel, uSize, uFlow, uAmount, uFogNear, uFogFar, uNight, uEdge;
${NOISE}
void main(){
  vec2 p = vWorld.xz;
  float ground = texture2D(uHeight, p / uSize + 0.5).r;
  float depth = uLevel - ground;
  if (depth < -0.03) discard;
  vec2 drift = uFlow > 0.5 ? vec2(0.0) : vec2(uTime * 0.25, uTime * 0.18);
  float t = uTime;
  // Ripples: two layers of noise sliding over each other.
  vec2 q = p * 0.55;
  if (uFlow > 0.5) q = vec2(vUv.x * 2.4, vUv.y * 0.9 - t * 1.3);
  float n1 = fbm(q + drift);
  float n2 = fbm(q * 1.9 - drift * 1.4 + 4.0);
  float e = 0.35;
  vec2 g = vec2(fbm(q + drift + vec2(e, 0.0)) - n1, fbm(q + drift + vec2(0.0, e)) - n1) + 0.6 * vec2(fbm(q * 1.9 - drift * 1.4 + 4.0 + vec2(e, 0.0)) - n2, fbm(q * 1.9 - drift * 1.4 + 4.0 + vec2(0.0, e)) - n2);
  vec3 n = normalize(vec3(-g.x * 1.1, 1.0, -g.y * 1.1));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float deepness = smoothstep(0.0, 2.6, depth);
  vec3 body = mix(uShallow, uDeep, deepness);
  vec3 sky = mix(uHorizon, uZenith, clamp(reflect(-v, n).y, 0.0, 1.0));
  vec3 col = mix(body, sky, 0.18 + 0.62 * fres);
  vec3 r = reflect(-uSunDir, n);
  col += uSunCol * pow(max(dot(r, v), 0.0), 140.0) * 1.6;
  col += uSunCol * pow(max(dot(r, v), 0.0), 12.0) * 0.05;
  // Foam where the water meets the land.
  float lap = sin(depth * 16.0 - t * 2.2 + n1 * 6.0) * 0.5 + 0.5;
  float foam = smoothstep(0.34, 0.0, depth) * (0.45 + 0.55 * lap) + smoothstep(0.1, 0.0, depth);
  foam += smoothstep(0.7, 0.8, n1 * n2 * 2.4) * 0.12 * (1.0 - uFlow);
  // And where the sea pours off the rim of the world.
  float rim = uEdge > 0.0 ? smoothstep(uEdge - 2.2, uEdge - 0.2, length(p)) : 0.0;
  foam += rim * (0.5 + 0.5 * vnoise(p * 1.4 + vec2(0.0, t * 1.5)));
  col = mix(col, mix(vec3(0.42, 0.5, 0.62), vec3(1.0), 1.0 - uNight * 0.75), clamp(foam, 0.0, 1.0) * 0.85);
  float alpha = mix(0.5, 0.94, deepness) * uAmount;
  alpha = max(alpha, clamp(foam, 0.0, 1.0) * 0.9 * uAmount);
  float fogD = length(cameraPosition - vWorld);
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, fogD));
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

export const FALLS_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main(){
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const FALLS_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec3 vWorld;
uniform float uTime, uNight;
uniform vec3 uShallow, uSunCol;
${NOISE}
void main(){
  // vUv.y is 1 at the lip and 0 at the bottom.
  float fall = 1.0 - vUv.y;
  float streaks = fbm(vec2(vUv.x * 340.0, fall * 5.0 - uTime * 1.6));
  float fine = vnoise(vec2(vUv.x * 900.0, fall * 16.0 - uTime * 4.0));
  float a = smoothstep(0.25, 0.7, streaks * 0.75 + fine * 0.35);
  a *= smoothstep(1.0, 0.25, fall) * (0.85 - 0.35 * fall);
  a = max(a, smoothstep(0.035, 0.0, fall) * 0.9);
  vec3 white = mix(vec3(1.0), vec3(0.45, 0.52, 0.66), uNight * 0.8);
  vec3 col = mix(uShallow, white, 0.35 + 0.65 * streaks);
  gl_FragColor = vec4(col, a * 0.82);
  #include <colorspace_fragment>
}`;

export const CLOUDSEA_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld;
varying vec2 vUv;
uniform float uTime;
uniform vec3 uLight, uShade, uBelow;
${NOISE}
void main(){
  vec2 p = vWorld.xz * 0.012;
  float n = fbm(p + vec2(uTime * 0.006, 0.0)) * 0.65 + fbm(p * 2.7 - vec2(0.0, uTime * 0.009)) * 0.35;
  float a = smoothstep(0.38, 0.72, n);
  float far = smoothstep(520.0, 150.0, length(vWorld.xz));
  vec3 col = mix(uShade, uLight, smoothstep(0.4, 0.85, n));
  gl_FragColor = vec4(mix(uBelow, col, 0.9), a * far * 0.92);
  #include <colorspace_fragment>
}`;
