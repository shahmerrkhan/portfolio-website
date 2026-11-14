// Cloud fly-through. One shader, two quality levels:
//   real-time  : few steps, runs live on the visitor's GPU
//   pre-render : many steps, rendered once by scripts/render-cloud-frames.mjs
// STEPS, LSTEPS and OCT are #defined by whoever compiles this.
precision highp float;

uniform vec2 uRes;
uniform float uT; // 0..1 along the clip

const vec3 SUN = normalize(vec3(0.45, 0.5, 0.74));
const float FAR = 16.0;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
        mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
        mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < OCT; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec3(13.1, 7.7, 3.3);
    a *= 0.5;
  }
  return s;
}

// where the camera is at clip time t
vec3 camPath(float t) {
  float z = t * 9.0;
  return vec3(sin(z * 0.35) * 0.5, 0.25 + sin(z * 0.22) * 0.2, z);
}

float density(vec3 p) {
  // a thick slab of cloud, thinning toward the top and bottom
  float slab = 1.0 - smoothstep(0.9, 2.8, abs(p.y + 0.6));
  // big billows first, then smaller noise eats into their edges
  float shape = fbm(p * 0.5);
  float detail = fbm(p * 1.9 + vec3(4.0, 9.0, 2.0));
  // keep a soft gap around the flight line so we pass between banks
  float z = p.z;
  vec2 line = vec2(sin(z * 0.35) * 0.5, 0.25 + sin(z * 0.22) * 0.2);
  float gap = smoothstep(0.2, 1.7, length((p.xy - line) * vec2(1.0, 1.4)));
  float d = shape - 0.5 + 0.16 * slab - (1.0 - gap) * 0.3;
  d -= detail * 0.22 * (1.0 - smoothstep(0.0, 0.25, d));
  return clamp(d * 7.0, 0.0, 1.0) * slab;
}

vec3 sky(vec3 rd) {
  float h = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(vec3(0.80, 0.89, 0.97), vec3(0.20, 0.47, 0.86), pow(h, 1.4));
  float s = max(dot(rd, SUN), 0.0);
  c += vec3(1.0, 0.86, 0.62) * (pow(s, 24.0) * 0.35 + pow(s, 1800.0) * 2.0);
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);

  vec3 ro = camPath(uT);
  vec3 ta = camPath(uT + 0.12) + vec3(0.0, -0.05, 0.0);
  vec3 f = normalize(ta - ro);
  vec3 r = normalize(cross(f, vec3(0.0, 1.0, 0.0)));
  vec3 u = cross(r, f);
  vec3 rd = normalize(f * 1.35 + r * uv.x + u * uv.y);

  vec3 bg = sky(rd);
  float dt = FAR / float(STEPS);
  // per-pixel offset hides the step layers (shows as grain when STEPS is low)
  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = dt * jit;

  vec3 col = vec3(0.0);
  float trans = 1.0;
  float sunAmt = max(dot(rd, SUN), 0.0);

  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;
    float d = density(p);
    if (d > 0.005) {
      // how much cloud sits between this point and the sun
      float occ = 0.0;
      vec3 lp = p;
      for (int j = 0; j < LSTEPS; j++) {
        lp += SUN * (1.6 / float(LSTEPS));
        occ += density(lp);
      }
      float light = exp(-occ * (1.6 / float(LSTEPS)) * 1.9);
      vec3 lit = mix(vec3(0.46, 0.55, 0.72), vec3(1.0, 0.97, 0.9), light);
      lit += vec3(1.0, 0.8, 0.55) * pow(sunAmt, 6.0) * light * 0.35; // silver lining
      // far cloud fades into the sky colour
      lit = mix(lit, bg, smoothstep(FAR * 0.45, FAR, t) * 0.85);
      float a = 1.0 - exp(-d * dt * 4.5);
      col += trans * a * lit;
      trans *= 1.0 - a;
      if (trans < 0.012) break;
    }
    t += dt;
  }

  col += bg * trans;
  col = pow(col, vec3(0.92));
  gl_FragColor = vec4(col, 1.0);
}
