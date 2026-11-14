#version 300 es
// Fills one slice of a tiling 3D noise texture. Two kinds:
//   0  shape  : R = Perlin-Worley, GBA = Worley at three rising scales
//   1  detail : RGB = Worley at three rising scales (used to eat into cloud edges)
// Every octave wraps, so the texture repeats without a seam.
precision highp float;
uniform float uZ;
uniform float uSize;
uniform int uKind;
out vec4 o;

vec3 hash33(vec3 p) {
  uvec3 q = uvec3(ivec3(p)) * uvec3(1597334673u, 3812015801u, 2798796415u);
  q = (q.x ^ q.y ^ q.z) * uvec3(1597334673u, 3812015801u, 2798796415u);
  return -1.0 + 2.0 * vec3(q) * (1.0 / float(0xffffffffu));
}

float gradientNoise(vec3 x, float freq) {
  vec3 p = floor(x);
  vec3 w = fract(x);
  vec3 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
  vec3 ga = hash33(mod(p + vec3(0, 0, 0), freq));
  vec3 gb = hash33(mod(p + vec3(1, 0, 0), freq));
  vec3 gc = hash33(mod(p + vec3(0, 1, 0), freq));
  vec3 gd = hash33(mod(p + vec3(1, 1, 0), freq));
  vec3 ge = hash33(mod(p + vec3(0, 0, 1), freq));
  vec3 gf = hash33(mod(p + vec3(1, 0, 1), freq));
  vec3 gg = hash33(mod(p + vec3(0, 1, 1), freq));
  vec3 gh = hash33(mod(p + vec3(1, 1, 1), freq));
  float va = dot(ga, w - vec3(0, 0, 0));
  float vb = dot(gb, w - vec3(1, 0, 0));
  float vc = dot(gc, w - vec3(0, 1, 0));
  float vd = dot(gd, w - vec3(1, 1, 0));
  float ve = dot(ge, w - vec3(0, 0, 1));
  float vf = dot(gf, w - vec3(1, 0, 1));
  float vg = dot(gg, w - vec3(0, 1, 1));
  float vh = dot(gh, w - vec3(1, 1, 1));
  return va + u.x * (vb - va) + u.y * (vc - va) + u.z * (ve - va) + u.x * u.y * (va - vb - vc + vd) +
         u.y * u.z * (va - vc - ve + vg) + u.z * u.x * (va - vb - ve + vf) +
         u.x * u.y * u.z * (-va + vb + vc - vd + ve - vf - vg + vh);
}

float worley(vec3 uv, float freq) {
  vec3 id = floor(uv);
  vec3 p = fract(uv);
  float nearest = 1e4;
  for (float x = -1.0; x <= 1.0; x++)
    for (float y = -1.0; y <= 1.0; y++)
      for (float z = -1.0; z <= 1.0; z++) {
        vec3 off = vec3(x, y, z);
        vec3 h = hash33(mod(id + off, vec3(freq))) * 0.5 + 0.5;
        vec3 d = p - (h + off);
        nearest = min(nearest, dot(d, d));
      }
  return 1.0 - nearest;
}

float perlinFbm(vec3 p, float freq, int octaves) {
  float G = exp2(-0.85);
  float amp = 1.0;
  float n = 0.0;
  for (int i = 0; i < octaves; i++) {
    n += amp * gradientNoise(p * freq, freq);
    freq *= 2.0;
    amp *= G;
  }
  return n;
}

float worleyFbm(vec3 p, float freq) {
  return worley(p * freq, freq) * 0.625 + worley(p * freq * 2.0, freq * 2.0) * 0.25 + worley(p * freq * 4.0, freq * 4.0) * 0.125;
}

float remap(float x, float a, float b, float c, float d) {
  return (x - a) / (b - a) * (d - c) + c;
}

void main() {
  vec3 p = vec3(gl_FragCoord.xy / uSize, uZ);
  if (uKind == 0) {
    float pf = mix(1.0, perlinFbm(p, 4.0, 5), 0.5);
    pf = abs(pf * 2.0 - 1.0); // billows
    float g = worleyFbm(p, 2.0);
    float b = worleyFbm(p, 4.0);
    float a = worleyFbm(p, 8.0);
    o = vec4(remap(pf, 0.0, 1.0, g, 1.0), g, b, a);
  } else {
    o = vec4(worleyFbm(p, 2.0), worleyFbm(p, 4.0), worleyFbm(p, 8.0), 1.0);
  }
}
