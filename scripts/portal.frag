// The second clip: fly at a blue portal hanging in the clouds, go through it,
// and fall down a tunnel of cloud that opens onto the garden far below.
// Same noise and sky as clouds.frag, rendered by scripts/render-cloud-frames.mjs.
// STEPS, LSTEPS and OCT are #defined by whoever compiles this.
precision highp float;

uniform vec2 uRes;
uniform float uT; // 0..1 along the clip

const vec3 SUN = normalize(vec3(0.45, 0.5, 0.74));
const float FAR = 16.0;
const float PZ = 13.0; // the portal stands here, across the flight line
const float PR = 1.15; // its radius
const float TUNNEL = 22.0; // how long the cloud tunnel is
const float GROUND = 33.0; // the garden lies this far past the portal

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

// the line we fly along; it straightens out past the portal
vec2 line(float z) {
  float k = 1.0 - smoothstep(PZ - 3.0, PZ + 1.0, z);
  vec2 at = vec2(sin(PZ * 0.35) * 0.5, 0.25 + sin(PZ * 0.22) * 0.2);
  return mix(at, vec2(sin(z * 0.35) * 0.5, 0.25 + sin(z * 0.22) * 0.2), k);
}

float camZ(float t) {
  float start = PZ - 9.0;
  float end = PZ + GROUND - 1.6;
  return start + (end - start) * (0.26 * t + 0.74 * pow(t, 2.3));
}

// the same clouds as the first clip
float clouds(vec3 p) {
  float slab = 1.0 - smoothstep(0.9, 2.8, abs(p.y + 0.6));
  float shape = fbm(p * 0.5);
  float detail = fbm(p * 1.9 + vec3(4.0, 9.0, 2.0));
  float gap = smoothstep(0.2, 1.7, length((p.xy - line(p.z)) * vec2(1.0, 1.4)));
  float d = shape - 0.5 + 0.16 * slab - (1.0 - gap) * 0.3;
  d -= detail * 0.22 * (1.0 - smoothstep(0.0, 0.25, d));
  return clamp(d * 7.0, 0.0, 1.0) * slab;
}

// a hollow tube of cloud around the flight line, thinning out before the garden
float tunnel(vec3 p) {
  vec2 q = p.xy - line(p.z);
  float r = length(q);
  float along = p.z - PZ;
  float bore = 0.85 + 0.5 * smoothstep(4.0, TUNNEL, along); // it widens as it goes down
  float wall = smoothstep(bore, bore + 0.9, r);
  float shape = fbm(vec3(q * 0.55, p.z * 0.3) + vec3(7.0, 2.0, 0.0));
  float detail = fbm(vec3(q * 2.0, p.z * 0.9) + vec3(1.0, 5.0, 3.0));
  float d = wall * (shape * 2.3 - 0.82) - detail * 0.2;
  d *= 1.0 - smoothstep(TUNNEL - 9.0, TUNNEL, along);
  d *= 1.0 - smoothstep(5.0, 8.0, r);
  return clamp(d * 6.0, 0.0, 1.0);
}

vec3 sky(vec3 rd) {
  float h = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(vec3(0.80, 0.89, 0.97), vec3(0.20, 0.47, 0.86), pow(h, 1.4));
  float s = max(dot(rd, SUN), 0.0);
  c += vec3(1.0, 0.86, 0.62) * (pow(s, 24.0) * 0.35 + pow(s, 1800.0) * 2.0);
  return c;
}

// what lies at the bottom of the tunnel: the lawn from above, hazy while it is far away
vec3 garden(vec3 ro, vec3 rd) {
  float gz = PZ + GROUND;
  float t = (gz - ro.z) / max(rd.z, 0.05);
  vec2 g = ro.xy + rd.xy * t;
  float patches = fbm(vec3(g * 0.55, 3.0));
  float fine = fbm(vec3(g * 3.2, 9.0));
  vec3 lawn = mix(vec3(0.13, 0.25, 0.07), vec3(0.38, 0.52, 0.17), smoothstep(0.25, 0.75, patches));
  lawn *= 0.72 + fine * 0.6;
  lawn = mix(lawn, vec3(0.52, 0.47, 0.2), smoothstep(0.62, 0.8, fbm(vec3(g * 0.3, 14.0))) * 0.5);
  float haze = 1.0 - exp(-t * 0.085);
  vec3 air = mix(vec3(0.86, 0.93, 0.98), vec3(0.62, 0.8, 0.96), clamp(length(rd.xy) * 1.4, 0.0, 1.0));
  return mix(lawn, air, haze);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);

  float z = camZ(uT);
  float ahead = camZ(min(uT + 0.02, 1.0)) + 1.2;
  vec3 ro = vec3(line(z), z);
  // keep the portal in the middle of the picture on the way in
  vec3 ta = z < PZ - 0.5 ? vec3(line(PZ), PZ) : vec3(line(ahead), ahead);
  vec3 f = normalize(ta - ro);
  // a slow roll once inside, so the fall does not feel like a slide
  float roll = 0.5 * smoothstep(PZ, PZ + GROUND, z);
  vec3 up = vec3(sin(roll), cos(roll), 0.0);
  vec3 r = normalize(cross(f, up));
  vec3 u = cross(r, f);
  vec3 rd = normalize(f * 1.35 + r * uv.x + u * uv.y);

  bool inside = ro.z >= PZ;
  vec2 pc = line(PZ);
  // where this ray meets the portal's plane, and whether it goes through the ring
  float tHit = inside ? -1.0 : (PZ - ro.z) / max(rd.z, 0.001);
  vec2 hit = ro.xy + rd.xy * tHit - pc;
  float hr = length(hit);
  bool through = !inside && hr < PR;
  float depth = PZ - ro.z; // how far away the portal still is

  vec3 bgSky = sky(rd);
  vec3 bgIn = garden(ro, rd);
  float dt = FAR / float(STEPS);
  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = dt * jit;

  vec3 col = vec3(0.0);
  float trans = 1.0;
  float sunAmt = max(dot(rd, SUN), 0.0);
  bool crossed = inside;

  for (int i = 0; i < STEPS; i++) {
    // the ring and the film across it are laid in at the moment the ray reaches them
    if (!crossed && t >= tHit) {
      crossed = true;
      float ang = atan(hit.y, hit.x);
      float edge = hr - PR;
      float flicker = 0.75 + 0.5 * fbm(vec3(ang * 2.2, uT * 9.0, 2.0));
      float core = exp(-edge * edge * 520.0);
      float halo = exp(-abs(edge) * 5.5) * 0.55 + exp(-abs(edge) * 1.6) * 0.16;
      vec3 ring = (vec3(0.82, 0.93, 1.0) * core * 1.5 + vec3(0.16, 0.5, 1.0) * halo) * flicker;
      col += trans * ring;
      if (through) {
        // a film of blue light, swirling, thinner as we get close
        float swirl = fbm(vec3(hit * 1.6 + vec2(cos(uT * 5.0), sin(uT * 5.0)) * 0.4, ang * 0.6 + uT * 4.0));
        float film = mix(0.82, 0.3, smoothstep(7.0, 0.6, depth)) * (0.65 + swirl * 0.6);
        vec3 blue = mix(vec3(0.08, 0.3, 0.95), vec3(0.55, 0.82, 1.0), swirl * swirl * 1.6);
        col += trans * film * blue;
        trans *= 1.0 - film * 0.85;
      }
    }
    vec3 p = ro + rd * t;
    bool inTunnel = inside || (through && crossed);
    float d = inTunnel ? tunnel(p) : clouds(p);
    if (d > 0.005) {
      vec3 lit;
      if (inTunnel) {
        // lit from below, by the daylight coming up the tunnel, and blue near the mouth
        vec2 q = p.xy - line(p.z);
        vec3 L = normalize(vec3(-q * 0.25, 0.0) + vec3(0.42, 0.55, 0.6));
        float occ = 0.0;
        vec3 lp = p;
        for (int j = 0; j < LSTEPS; j++) {
          lp += L * (1.6 / float(LSTEPS));
          occ += tunnel(lp);
        }
        float light = exp(-occ * (1.6 / float(LSTEPS)) * 2.4);
        float mouth = exp(-(p.z - PZ) * 0.22);
        vec3 shade = mix(vec3(0.38, 0.48, 0.7), vec3(0.16, 0.36, 0.86), mouth);
        vec3 bright = mix(vec3(1.0, 0.98, 0.92), vec3(0.72, 0.88, 1.0), mouth * 0.8);
        lit = mix(shade, bright, light);
        lit = mix(lit, bgIn, smoothstep(FAR * 0.55, FAR, t) * 0.6);
      } else {
        float occ = 0.0;
        vec3 lp = p;
        for (int j = 0; j < LSTEPS; j++) {
          lp += SUN * (1.6 / float(LSTEPS));
          occ += clouds(lp);
        }
        float light = exp(-occ * (1.6 / float(LSTEPS)) * 1.9);
        lit = mix(vec3(0.46, 0.55, 0.72), vec3(1.0, 0.97, 0.9), light);
        lit += vec3(1.0, 0.8, 0.55) * pow(sunAmt, 6.0) * light * 0.35;
        // the portal throws blue light on the clouds around it
        float near = exp(-length(vec3(p.xy - pc, p.z - PZ)) * 0.55);
        lit += vec3(0.1, 0.32, 0.9) * near * 0.55;
        lit = mix(lit, bgSky, smoothstep(FAR * 0.45, FAR, t) * 0.85);
      }
      float a = 1.0 - exp(-d * dt * 4.5);
      col += trans * a * lit;
      trans *= 1.0 - a;
      if (trans < 0.012) break;
    }
    t += dt;
  }

  col += ((inside || through) ? bgIn : bgSky) * trans;
  // going through: the whole view washes blue-white for a moment
  float wash = exp(-pow((ro.z - PZ) * 0.9, 2.0));
  col = mix(col, vec3(0.72, 0.88, 1.0), wash * 0.85);
  col = pow(col, vec3(0.92));
  gl_FragColor = vec4(col, 1.0);
}
