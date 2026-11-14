#version 300 es
// Bloom and the film look. uStage 0: keep only the bright parts, 1: blur, 2: final picture.
precision highp float;
uniform sampler2D uA; // the averaged render
uniform sampler2D uB; // tight bloom
uniform sampler2D uC; // wide bloom
uniform vec2 uDir;
uniform int uStage;
uniform float uExposure;
uniform float uKnee;
uniform float uBloom;
uniform float uSunny;
in vec2 vUv;
out vec4 o;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  if (uStage == 0) {
    vec3 c = texture(uA, vUv).rgb * uExposure;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    o = vec4(c * smoothstep(uKnee, uKnee * 3.0, l), 1.0);
  } else if (uStage == 1) {
    vec3 s = vec3(0.0);
    float wsum = 0.0;
    for (int i = -12; i <= 12; i++) {
      float w = exp(-float(i * i) / 50.0);
      s += texture(uA, vUv + uDir * float(i)).rgb * w;
      wsum += w;
    }
    o = vec4(s / wsum, 1.0);
  } else {
    vec3 c = texture(uA, vUv).rgb * uExposure;
    c += (texture(uB, vUv).rgb * 0.55 + texture(uC, vUv).rgb * 0.75) * uBloom;
    c = aces(c * (uSunny > 0.5 ? 0.46 : 0.66));
    // a cool, slightly lifted grade: slate shadows, clean highlights
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, 1.08);
    c = mix(c, c * vec3(0.94, 0.98, 1.07), 0.5 * (1.0 - l));
    o = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
  }
}
