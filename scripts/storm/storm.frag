#version 300 es
// The storm: one raymarched cloud volume used for both clips.
//   uMode 0  the cloud loop (the camera goes exactly one noise period, so it loops with no seam)
//   uMode 1  the portal: a cloud wall with a calm blue eye in it, then the tunnel behind
//   uSun  1  the picture itself (dim sun through breaks in the deck, sky light, haze)
//   uSun  0  only what the lightning and the portal add, on black. The site lays these
//            over the picture and drives their brightness, so every flash is real light
//            travelling through the same cloud, and can be left out for people who need calm.
// Shape: Perlin-Worley base, Worley erosion (Schneider's Nubis recipe). Light: Beer-Lambert,
// two-lobe Henyey-Greenstein, octave multi-scatter (Wrenninge), energy-conserving steps (Hillaire).
precision highp float;
precision highp sampler3D;

uniform vec2 uRes;
uniform float uU; // 0..1 along the clip
uniform int uMode;
uniform float uSun;
uniform vec2 uJit; // sub-pixel offset of this sample
uniform float uSeed; // which sample this is
uniform sampler3D uBase;
uniform sampler3D uDetail;

#define MAXL 6
uniform int uNL;
uniform vec4 uLightP[MAXL]; // xyz, size
uniform vec4 uLightC[MAXL]; // rgb, kind (0 point, 1 far glow)
#define MAXS 56
uniform int uNS;
uniform vec4 uSegA[MAXS]; // xyz, brightness
uniform vec4 uSegB[MAXS]; // xyz, width
uniform vec4 uEye; // portal eye: glow strength, rim strength, swirl angle, wall amount
uniform float uWhite; // the last frames burn out to daylight

out vec4 o;

const float L = 16.0; // loop length = noise period along the flight
const float SIGMA = 13.0; // how thick the cloud is
const float FAR = 42.0;
const float PZ = 19.4444; // the eye stands here (9 ahead of where the loop hands over)
const float PR = 1.15;
const float TL = 26.0; // tunnel length
const vec3 SUN = normalize(vec3(-0.30, 0.62, 0.72));
const vec3 SUNC = vec3(1.0, 0.95, 0.88) * 11.0;
const vec3 AMB_TOP = vec3(0.15, 0.20, 0.29);
const vec3 AMB_BOT = vec3(0.060, 0.046, 0.082);
const vec3 HORIZON = normalize(vec3(0.12, 0.04, 1.0));
const vec3 HORIZC = vec3(0.78, 0.86, 1.0) * 4.0;
const float PI = 3.14159265;

float remap(float x, float a, float b, float c, float d) {
  return (x - a) / (b - a) * (d - c) + c;
}
float sat(float x) {
  return clamp(x, 0.0, 1.0);
}

// the line we fly along. It repeats every L, and straightens out toward the eye.
vec2 wiggle(float z) {
  float a = 2.0 * PI * z / L;
  return vec2(0.55 * sin(a) + 0.22 * sin(2.0 * a + 1.3), 0.16 * sin(2.0 * a + 0.4) + 0.09 * sin(3.0 * a + 2.0));
}
vec2 lineAt(float z) {
  if (uMode == 0) return wiggle(z);
  float k = 1.0 - smoothstep(PZ - 4.0, PZ - 0.5, z);
  return mix(wiggle(PZ), wiggle(z), k);
}

float portalZ(float t) {
  // starts at the loop's own speed, is through the eye at t = 0.42, out of the tunnel at 1
  t = max(t, 0.0);
  return PZ - 9.0 + 7.2 * t + 27.8 * pow(t, 1.772);
}

float dens(vec3 p, int q) {
  if (p.y > 5.7) return 0.0;
  float lod = float(q);
  vec2 ln = lineAt(p.z);
  vec2 rel = p.xy - ln;
  float r0 = length(rel);
  vec3 s = p;
  float along = p.z - PZ;
  if (uMode == 1) {
    // the cloud in front of the eye is wound around it, tighter toward the middle
    float near = smoothstep(-7.0, -1.5, along) * (1.0 - smoothstep(1.0, 5.0, along)) * (1.0 - smoothstep(4.0, 9.0, r0));
    float ang = uEye.z * near / (0.5 + r0 * 0.8);
    float c = cos(ang), sn = sin(ang);
    s.xy = ln + mat2(c, -sn, sn, c) * rel;
    s.z = along > 0.0 ? PZ + along * 0.7 : p.z; // tunnel walls are drawn out along the fall
  }

  float w = textureLod(uBase, vec3(s.x / 26.0 + s.z / L, s.y / 26.0 + 0.37, s.z / L), lod + 1.0).r;
  float w2 = textureLod(uBase, vec3(s.x / 19.0 + 0.5 + 2.0 * s.z / L, 0.21, s.z / L + 0.3), lod + 1.0).g;
  float low = smoothstep(-1.3, -3.0, s.y);
  float up = smoothstep(2.0, 3.4, s.y) * (1.0 - smoothstep(4.4, 5.6, s.y));
  float breaks = smoothstep(0.52, 0.66, w2);
  float cov = mix(smoothstep(0.74, 0.97, w) * 0.72, 0.70 + 0.24 * w, max(low, up * breaks));
  // the gap we fly in: wide and ragged, not a pipe
  float gapW = 1.0 + 1.7 * w;
  float canyon = smoothstep(0.35, 1.0, length(rel / vec2(gapW, 1.55)));

  if (uMode == 1) {
    float wall = smoothstep(-4.2, -1.2, along) * (1.0 - smoothstep(6.0, 11.0, r0)) * uEye.w;
    // spiral arms, like the bands around the eye of a hurricane
    float th = atan(rel.y, rel.x);
    float arms = sin(3.0 * th + 3.2 * log(r0 + 0.3) - uEye.z * 1.6);
    float wallCov = 0.66 + 0.16 * w + 0.10 * arms * (1.0 - smoothstep(3.5, 7.0, r0));
    cov = mix(cov * canyon, wallCov, wall);
    // the eye: a round opening with a soft billowing lip, funnelling out toward us
    float holeR = PR + max(-along, 0.0) * 0.2;
    cov *= mix(1.0, smoothstep(holeR * 0.9, holeR + 1.5, r0), smoothstep(-6.5, -3.0, along) * uEye.w);
    // behind it, a hollow tube of cloud that widens and thins toward the daylight
    float bore = PR - 0.1 + 0.8 * smoothstep(3.0, TL, along);
    float tube = smoothstep(bore, bore + 2.3, r0) * (1.0 - smoothstep(6.0, 8.5, r0));
    tube *= 0.92 * (1.0 - smoothstep(TL - 11.0, TL - 2.0, along));
    cov = mix(cov, tube, smoothstep(-0.35, 0.35, along));
  } else {
    cov *= canyon;
  }
  if (cov < 0.02) return 0.0;

  vec4 b = textureLod(uBase, vec3(s.x / 8.0 + s.z / L, s.y / 8.0, s.z / 8.0), lod);
  float wf = b.g * 0.625 + b.b * 0.25 + b.a * 0.125;
  float base = remap(b.r, wf - 1.0, 1.0, 0.0, 1.0);
  float d = sat(remap(base, 1.0 - cov, 1.0, 0.0, 1.0)) * cov;
  if (q == 0 && d > 0.0) {
    // small Worley shapes eat the edges; the lookup is pushed around a little so they curl
    vec3 dn = texture(uDetail, s / 1.6 + (b.gba - 0.5) * 0.3).rgb;
    float hf = dn.r * 0.625 + dn.g * 0.25 + dn.b * 0.125;
    float fine = texture(uDetail, s / 0.4 + dn * 0.2).g;
    hf = mix(hf, fine, 0.22);
    d = sat(remap(d, hf * 0.42, 1.0, 0.0, 1.0));
  }
  return sat(d * (uMode == 1 && along > 0.0 ? 7.0 : 3.2));
}

float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}

vec3 sky(vec3 rd) {
  // a high pale overcast overhead, and far off, under the deck, the bright strip where the storm ends
  float up = smoothstep(0.0, 0.9, rd.y);
  vec3 c = mix(vec3(0.085, 0.10, 0.135), vec3(0.46, 0.53, 0.64) * 1.3, up);
  float band = exp(-(rd.y / 0.11) * (rd.y / 0.11)) * (0.3 + 0.7 * smoothstep(-0.3, 0.7, rd.z));
  c += vec3(0.72, 0.80, 0.92) * 0.85 * band;
  float s = max(dot(rd, SUN), 0.0);
  c += vec3(1.0, 0.95, 0.88) * (pow(s, 10.0) * 1.3 + pow(s, 160.0) * 7.0);
  return c;
}

void camera(vec2 uv, out vec3 ro, out vec3 rd) {
  vec3 ta;
  float roll;
  if (uMode == 0) {
    float z = uU * L;
    float a = 2.0 * PI * uU;
    ro = vec3(wiggle(z) + vec2(0.05 * sin(3.0 * a + 1.0), 0.04 * sin(5.0 * a)), z);
    ta = vec3(wiggle(z + 2.4) + vec2(0.07 * sin(4.0 * a + 2.0), 0.05 * sin(3.0 * a + 0.7) - 0.02), z + 2.4);
    roll = 0.04 * sin(2.0 * a + 0.5) + 0.022 * sin(5.0 * a + 1.7);
  } else {
    float z = portalZ(uU);
    float a = 2.0 * PI * (PZ - 9.0) / L; // carries the loop's own sway over the join
    float ease = 1.0 - smoothstep(0.0, 0.35, uU);
    ro = vec3(lineAt(z) + ease * vec2(0.05 * sin(3.0 * a + 1.0), 0.04 * sin(5.0 * a)), z);
    vec3 loopTa = vec3(wiggle(z + 2.4) + vec2(0.07 * sin(4.0 * a + 2.0), 0.05 * sin(3.0 * a + 0.7) - 0.02), z + 2.4);
    vec3 eyeTa = vec3(lineAt(max(PZ, z + 3.0)) + 0.03 * vec2(sin(uU * 31.0), cos(uU * 23.0)), max(PZ, z + 3.0));
    ta = mix(loopTa, eyeTa, smoothstep(0.0, 0.22, uU));
    roll = mix(0.04 * sin(2.0 * a + 0.5) + 0.022 * sin(5.0 * a + 1.7), 0.0, smoothstep(0.0, 0.3, uU));
    roll += 0.55 * smoothstep(PZ, PZ + TL, z); // a slow roll on the way down
  }
  vec3 f = normalize(ta - ro);
  vec3 upv = vec3(sin(roll), cos(roll), 0.0);
  vec3 r = normalize(cross(upv, f));
  vec3 u = cross(f, r);
  rd = normalize(f * 1.35 + r * uv.x + u * uv.y);
}

// light from one lamp (a lightning channel, the eye, the daylight at the tunnel's end)
// reaching p through the cloud between them
vec3 lamp(int i, vec3 p, vec3 rd, float jit) {
  vec3 dl = uLightP[i].xyz - p;
  float r = length(dl);
  vec3 dir = dl / r;
  float size = uLightP[i].w;
  float reach = min(r, 5.0);
  float st = reach / 6.0;
  float tau = 0.0;
  for (int k = 0; k < 6; k++) tau += dens(p + dir * st * (float(k) + jit), 1);
  tau *= SIGMA * st;
  float att = 1.0 / (r * r + size * size);
  // the far glows belong to the tunnel: the film across the eye keeps them in
  if (uLightC[i].a > 0.5) att = smoothstep(PZ - 0.2, PZ + 0.7, p.z) / (1.0 + r * r / (size * size));
  float fwd = mix(hg(dot(rd, dir), 0.65), 1.0 / (4.0 * PI), 0.55);
  float iso = 1.0 / (4.0 * PI);
  // the direct beam, then light that has bounced a few times and gone soft
  return uLightC[i].rgb * att * (exp(-tau) * fwd + iso * (0.55 * exp(-tau * 0.34) + 0.3 * exp(-tau * 0.11)));
}

void main() {
  vec2 px = gl_FragCoord.xy + uJit;
  vec2 uv = (px * 2.0 - uRes) / min(uRes.x, uRes.y);
  vec3 ro, rd;
  camera(uv, ro, rd);

  float ign = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float jit = fract(ign + uSeed * 0.61803399);
  float jit2 = fract(ign * 7.13 + uSeed * 0.7548777);

  // things that sit at one depth and glow: the lightning channel, the film across the eye
  float boltT = 1e9;
  vec3 boltG = vec3(0.0);
  {
    float wsum = 0.0, tsum = 0.0;
    for (int i = 0; i < MAXS; i++) {
      if (i >= uNS) break;
      vec3 a = uSegA[i].xyz, b = uSegB[i].xyz;
      vec3 ab = b - a, ao = a - ro;
      float d1 = dot(ab, rd), d2 = dot(ab, ab), d3 = dot(ab, ao), d4 = dot(rd, ao);
      float den = d2 - d1 * d1;
      float sSeg = den > 1e-6 ? sat((d1 * d4 - d3) / den) : 0.0;
      vec3 c = a + ab * sSeg;
      float tc = dot(c - ro, rd);
      if (tc < 0.05) continue;
      float dist = length(ro + rd * tc - c);
      float wid = max(uSegB[i].w, tc * 0.0011); // never thinner than about a pixel
      float x = dist / wid;
      float g = uSegA[i].w * (exp(-x * x * 0.7) * 3.2 + 0.55 / (1.0 + x * x * 0.55) + 0.11 / (1.0 + x * x * 0.012));
      wsum += g;
      tsum += g * tc;
      boltG += g * vec3(0.80, 0.87, 1.0);
    }
    if (wsum > 0.0) boltT = tsum / wsum;
  }
  float eyeT = 1e9;
  float eyeA = 0.0;
  vec3 eyeG = vec3(0.0);
  if ((uEye.x > 0.0 || uEye.y > 0.0) && ro.z < PZ && rd.z > 0.001) {
    float th = (PZ - ro.z) / rd.z;
    vec2 hit = ro.xy + rd.xy * th - lineAt(PZ);
    float hr = length(hit);
    float ang = atan(hit.y, hit.x);
    // streaks that wind inward, like water going down a drain
    float lr = log(hr + 0.25);
    float sw = textureLod(uDetail, vec3(ang * 0.4775 + lr * 0.9 - uEye.z * 0.22, lr * 0.55 - uEye.z * 0.07, 0.31), 0.0).g;
    hr *= 1.0 + 0.10 * (textureLod(uDetail, vec3(ang * 0.159, 0.3, uEye.z * 0.05), 1.0).r - 0.6);
    float film = exp(-pow(hr / (PR * 1.25), 6.0)) * (0.42 + 0.75 * sw * sw) * (0.6 + 0.8 * exp(-hr * hr * 1.6));
    film *= 0.3 + 0.7 * smoothstep(0.3, 4.5, PZ - ro.z);
    float edge = (hr - PR) / 0.07;
    float rim = exp(-edge * edge) + 0.22 * exp(-abs(hr - PR) * 4.0);
    eyeG = vec3(0.10, 0.36, 1.0) * film * uEye.x + vec3(0.55, 0.80, 1.0) * rim * uEye.y;
    eyeT = th;
    // seen from far off the film hides the tunnel; it thins as we come up to it
    eyeA = 0.995 * smoothstep(0.3, 4.0, PZ - ro.z) * exp(-pow(hr / (PR * 1.7), 16.0)) * step(0.001, uEye.x) * uSun;
  }

  vec3 col = vec3(0.0);
  float T = 1.0;
  float t = 0.02;
  float cosS = dot(rd, SUN);
  vec3 p = ro;
  bool boltDone = false, eyeDone = false;

  for (int i = 0; i < STEPS; i++) {
    float dt = max(0.034, t * 0.0135);
    float tm = t + dt * jit;
    if (!boltDone && tm >= boltT) {
      col += T * boltG;
      boltDone = true;
    }
    if (!eyeDone && tm >= eyeT) {
      col += T * eyeG;
      T *= 1.0 - eyeA;
      eyeDone = true;
    }
    p = ro + rd * tm;
    if ((p.y > 5.8 && rd.y > 0.0) || p.y < -7.0) break;
    float d = dens(p, 0);
    float haze = 0.010 + 0.010 * smoothstep(3.0, -1.5, p.y);
    if (uMode == 1) haze = mix(haze, 0.004, smoothstep(PZ - 1.0, PZ + 1.0, p.z));
    if (uSun < 0.5) haze *= 0.5; // a flash should light the cloud, not veil the whole view
    float sig = d * SIGMA + haze;
    vec3 S = vec3(0.0);

    if (uSun > 0.5) {
      // how much cloud lies between here and the sun: ten steps, each longer than the last
      float tau = 0.0;
      float len = 0.09;
      vec3 lp = p;
      int n = d > 0.0 ? 10 : 7;
      float grow = d > 0.0 ? 1.5 : 1.85;
      for (int k = 0; k < n; k++) {
        lp += SUN * len * (k == 0 ? jit2 : 1.0);
        tau += dens(lp, d > 0.0 && k < 3 ? 0 : (k < 6 ? 1 : 2)) * len;
        len *= grow;
      }
      tau *= SIGMA;
      // multi-scatter: each octave is dimmer, sees less shadow and scatters more evenly
      float sun = 0.0;
      float a = 1.0, b = 1.0, c = 1.0;
      for (int k = 0; k < 4; k++) {
        sun += a * exp(-tau * b) * mix(hg(cosS, -0.28 * c), hg(cosS, 0.82 * c), 0.62);
        a *= 0.56;
        b *= 0.38;
        c *= 0.5;
      }
      float powder = 1.0 - exp(-(d * SIGMA * 0.35 + tau * 1.6));
      sun *= mix(1.0, powder, 0.4 * sat(d * 4.0));
      // sky light from above, cut off by whatever cloud is overhead; bruised light from below
      float over = dens(p + vec3(0.0, 0.3, 0.0), 1) * 0.3 + dens(p + vec3(0.07, 1.0, 0.0), 2) * 0.8;
      float open = exp(-over * SIGMA * 0.42);
      vec3 amb = mix(AMB_BOT, AMB_TOP, open) * (0.45 + 0.55 * exp(-d * 3.0));
      float tunnelDark = uMode == 1 ? 1.0 - smoothstep(PZ - 0.6, PZ + 1.4, p.z) : 1.0;
      // the far clearing lights the storm from the side, under the deck
      float side = 0.0;
      for (int k = 0; k < 4; k++) side += dens(p + HORIZON * (0.25 + 0.9 * float(k) * float(k) + 0.2 * jit2), 2);
      vec3 glow = HORIZC * (exp(-side * SIGMA * 0.55) + 0.25 * exp(-side * SIGMA * 0.12)) * mix(hg(dot(rd, HORIZON), 0.55), 0.08, 0.5);
      S += (SUNC * sun + amb + glow) * tunnelDark;
    }
    if (uMode == 1 && uSun > 0.5) {
      // near the bottom of the tunnel the daylight floods in
      float dayAmt = smoothstep(TL - 15.0, TL - 3.0, p.z - PZ);
      S += vec3(1.0, 0.98, 0.94) * 1.5 * dayAmt * (0.35 + 0.65 * exp(-d * 2.5));
    }
    for (int k = 0; k < MAXL; k++) {
      if (k >= uNL) break;
      S += lamp(k, p, rd, jit2);
    }

    S *= sig;
    float e = exp(-sig * dt);
    col += T * (S - S * e) / sig;
    T *= e;
    t += dt;
    if (T < 0.004 || t > FAR) break;
  }
  if (!boltDone && boltT < 1e8) col += T * boltG;
  if (!eyeDone && eyeT < 1e8) col += T * eyeG;

  if (uSun > 0.5) {
    vec3 bg = sky(rd);
    if (uMode == 1) {
      // past the eye the only sky is the daylight at the bottom of the tunnel
      // only a ray that went in through the eye (or started inside) can see it
      float inside = smoothstep(PZ - 0.5, PZ + 1.5, p.z);
      if (ro.z < PZ) {
        float th = (PZ - ro.z) / max(rd.z, 0.001);
        inside *= 1.0 - smoothstep(2.0, 3.2, length(ro.xy + rd.xy * th - lineAt(PZ)));
      }
      float te = (PZ + TL - ro.z) / max(rd.z, 0.02);
      float off = length(ro.xy + rd.xy * te - lineAt(PZ));
      vec3 day = mix(vec3(1.0, 0.97, 0.90) * 3.0, vec3(0.50, 0.72, 1.0) * 1.7, smoothstep(0.0, 5.0, off));
      bg = mix(bg, rd.z > 0.0 ? day : vec3(0.02), inside);
    }
    col += T * bg;
  }

  if (uMode == 1) {
    // going through: the film fills the view for a moment
    float wz = (ro.z - PZ) * 2.6;
    float wash = exp(-wz * wz);
    col = mix(col, vec3(0.42, 0.66, 1.0) * 2.0, wash * 0.36 * uSun);
    col = mix(col, vec3(1.0, 0.985, 0.95) * 8.0, uWhite * uSun);
  }
  o = vec4(col, 1.0);
}
