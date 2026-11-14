import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { createScaler, type Quality } from "@/lib/quality";
import { BOOK_H, COVER_LANDING, COVER_PIVOT, createBook, HINGE_X, LEAF_CLIMB, LEAF_REST, LEAVES, OPEN_ANGLE, PAGE_L, PAGE_TOP, PAGE_W } from "./book";
import { buildCover, COVER_L, COVER_W, type CoverMaps } from "./bookCover";
import { growGarden, rectDistance, SHEETS, type Garden } from "./garden";

// The garden and the notebook, seen from straight above. The camera only ever
// looks down; scrolling opens the book and turns its leaves.
//
// Locked choices (PLAN.md): brown_leather with the chestnut tint, forrest_ground_01
// soil, meadow_2 sky light, Paper 001 tinted cream, cream ribbon, leaf shade on.

// Where the pages are on screen, so the real text can be laid over them.
// Lengths are CSS pixels. Seen from straight above, a flat page is always a plain
// rectangle on screen, only moved, turned a little and scaled.
export type View = {
  wide: boolean; // both pages in the shot, or only the right-hand one
  hx: number; // top of the hinge, where the two pages meet
  hy: number;
  rot: number; // radians, the way CSS rotate() counts them
  pw: number; // right-hand page, as it is now
  ph: number;
  lw: number; // left-hand page width
  rest: { pw: number; ph: number; lw: number }; // the same sizes once the book is fully open
  cover: number; // how far the cover still reaches over the right page, in page widths
  leafRight: number; // how far the leaf in the air reaches to the right of the hinge, in page widths
  leafLeft: number; // and to the left (zero or negative)
  flowers: { x: number; y: number; r: number }[]; // the secret flowers
};

export type SceneRig = {
  // open: 0 closed, 1 open. turns: 0..6, a fraction is a leaf in the air.
  // side: on a tall screen, which page the camera is over, 0 the left one, 1 the right one.
  set: (open: number, turns: number, side?: number) => View;
  view: () => View;
  // Draws one frame. The caller runs this from the same tick that moved the text,
  // so the picture and the text can never be a frame apart.
  frame: (now: number) => void;
  liftCorner: (on: boolean) => void; // the loose corner of the top right-hand leaf
  pokeFlower: (i: number) => void; // a secret flower was touched: make it bob
  setActive: (on: boolean) => void; // stop drawing while something covers the garden
  dispose: () => void;
};

export type SceneOpts = {
  onReady: () => void;
  onResize: () => void; // the page boxes moved; ask for view() again
  still?: boolean; // one fixed wide shot of the open, empty book, for the fallback picture
};

export const SECRET_COUNT = 5;

const BOOK_YAW = 0.05;
const FOV = 36;
const SUN_DIR = new THREE.Vector3(-0.64, 0.58, -0.5).normalize(); // mid-afternoon, from the upper left
const CHESTNUT = "#e8c4a0";
const CREAM = "#cdbd97";
const T = "/textures";
const STILL_HALF_H = 2.5; // half the height of ground in the fallback picture, in scene units

// One pass after the scene: depth of field, then vignette, tone mapping, a little
// contrast and film grain. Reads the scene's colour and depth.
const POST_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uPx;
uniform float uNear, uFar, uFocus, uAperture, uMaxBlur, uDof, uTime;
varying vec2 vUv;
#include <packing>

float dist(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
float coc(float z) { return min(abs(z - uFocus) / z * uAperture, 1.0); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  if (uDof > 0.5) {
    float total = 1.0;
    float spin = hash(gl_FragCoord.xy) * 6.2831;
    for (int i = 0; i < TAPS; i++) {
      float fi = float(i) + 0.5;
      float r = sqrt(fi / float(TAPS));
      float a = fi * 2.39996 + spin;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uMaxBlur * uPx;
      // a neighbour only smears onto this pixel if it is out of focus enough to reach it
      float w = smoothstep(r - 0.15, r, coc(dist(uv)));
      col += texture2D(tColor, uv).rgb * w;
      total += w;
    }
    col /= total;
  }

  vec2 q = (vUv - 0.5) * 2.0;
  col *= mix(0.62, 1.0, smoothstep(1.45, 0.45, length(q)));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>

  vec3 c = gl_FragColor.rgb;
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.4);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += vec3(0.018, 0.006, -0.02) * (l - 0.45);
  c += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.022;
  gl_FragColor = vec4(c, 1.0);
}`;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// leaf shade: the shadows of leaves and a couple of twigs, as if a branch hung over the lawn
function leafShade() {
  const sharp = document.createElement("canvas");
  sharp.width = sharp.height = 512;
  const ctx = sharp.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 512, 512);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = ctx.strokeStyle = "rgba(0,0,0,0.5)";
  for (let b = 0; b < 6; b++) {
    let x = rnd() * 512;
    let y = rnd() * 512;
    let dir = rnd() * 6.3;
    ctx.lineWidth = 2 + rnd() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const leaves: [number, number, number][] = [];
    for (let k = 0; k < 16; k++) {
      dir += (rnd() - 0.5) * 0.7;
      x += Math.cos(dir) * 16;
      y += Math.sin(dir) * 16;
      ctx.lineTo(x, y);
      for (let l = 0; l < 3; l++) leaves.push([x + (rnd() - 0.5) * 50, y + (rnd() - 0.5) * 50, rnd() * 3.2]);
    }
    ctx.stroke();
    for (const [lx, ly, rot] of leaves) {
      ctx.beginPath();
      ctx.ellipse(lx, ly, 9 + rnd() * 9, 4 + rnd() * 5, rot, 0, 6.3);
      ctx.fill();
    }
  }
  // shrink and stretch back: the cheap way to soften the edges like real leaf shade
  const small = document.createElement("canvas");
  small.width = small.height = 150;
  small.getContext("2d")!.drawImage(sharp, 0, 0, 150, 150);
  const out = document.createElement("canvas");
  out.width = out.height = 512;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(small, 0, 0, 512, 512);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// where the book presses into the lawn almost no light gets in: a dark, soft-edged patch under it
function contactShadow() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const padX = (0.5 / (COVER_W + 1)) * 256;
  const padY = (0.5 / (COVER_L + 1)) * 256;
  for (let i = 0; i < 24; i++) {
    const g = i / 23;
    ctx.fillStyle = `rgba(0,0,0,${0.035 + g * 0.05})`;
    ctx.beginPath();
    ctx.roundRect(padX * g * 0.9, padY * g * 0.9, 256 - padX * g * 1.8, 256 - padY * g * 1.8, 30 * (1 - g) + 4);
    ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

function pageEdges() {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  for (let y = 0; y < 128; y++) {
    const v = 205 + Math.floor(Math.sin(y * 1.9) * 14 + Math.sin(y * 0.7) * 10);
    ctx.fillStyle = `rgb(${v + 22},${v + 12},${v - 14})`;
    ctx.fillRect(0, y, 8, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function build(canvas: HTMLCanvasElement, q: Quality, opts: SceneOpts): SceneRig {
  const { onReady } = opts;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // The camera barely moves and the wind is slight, so shadows are only redrawn
  // when something changes (loading, the book opening, a leaf turning).
  renderer.shadowMap.autoUpdate = false;
  let shadowFrames = 0;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const scaler = createScaler();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#141a10");
  scene.environmentIntensity = 0.95;

  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 40);
  camera.up.set(0, 0, -1);

  // The sun: a spot light far away, so it can carry the leaf-shade pattern.
  const shade = leafShade();
  const sun = new THREE.SpotLight(0xffe6c4, 5.2, 0, 0.19, 0.5, 0);
  sun.position.copy(SUN_DIR).multiplyScalar(40);
  sun.map = shade;
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(2048);
  sun.shadow.camera.near = 28;
  sun.shadow.camera.far = 52;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.015;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);

  // ---------- loading ----------
  const texLoader = new THREE.TextureLoader();
  const disposables: { dispose: () => void }[] = [shade];
  let pending = 0;
  let dead = false;
  let ready = false;
  const track = (n: number) => {
    pending += n;
    shadowFrames = 6;
    if (pending === 0 && !ready && !dead) {
      ready = true;
      onReady();
    }
  };
  const tex = (url: string, rx: number, ry: number, colour = false) => {
    track(1);
    const t = texLoader.load(url, () => track(-1), undefined, () => track(-1));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = maxAniso;
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    disposables.push(t);
    return t;
  };
  const image = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

  // ---------- materials ----------
  // The photo's own shine is too high for worn leather, so lift the roughness floor.
  const leather = () => {
    const m = new THREE.MeshPhysicalMaterial({
      roughness: 1,
      metalness: 0,
      sheen: 0.3,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color("#a8683a"),
      specularIntensity: 0.55,
      normalScale: new THREE.Vector2(1.3, 1.3),
    });
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * 0.75 + 0.2, 0.0, 1.0);",
      );
    };
    disposables.push(m);
    return m;
  };
  const leatherFile = (kind: string) => `${T}/leather/brown_leather_${kind}${q.textures}.jpg`;
  const tiledLeather = (rx: number, ry: number) => {
    const m = leather();
    const arm = tex(leatherFile("arm"), rx, ry);
    m.map = tex(leatherFile("diff"), rx, ry, true);
    m.normalMap = tex(leatherFile("nor"), rx, ry);
    m.aoMap = m.roughnessMap = arm;
    m.color.set(CHESTNUT);
    return m;
  };
  const coverMat = leather();
  const edgeMat = tiledLeather(2, 0.12);
  const strapMat = tiledLeather(0.45, 0.25);

  const paperMaps = {
    map: tex(`${T}/paper/Paper001_diff.jpg`, 1, 1, true),
    normalMap: tex(`${T}/paper/Paper001_nor.jpg`, 1, 1),
    roughnessMap: tex(`${T}/paper/Paper001_rough.jpg`, 1, 1),
  };
  const paperMat = new THREE.MeshStandardMaterial({ ...paperMaps, roughness: 1, color: CREAM, side: THREE.DoubleSide });
  // endpaper inside the cover: the same paper, a shade browner
  const liningMat = new THREE.MeshStandardMaterial({ ...paperMaps, roughness: 1, color: "#9c8763" });
  const edgesMap = pageEdges();
  const pageEdgesMat = new THREE.MeshStandardMaterial({ map: edgesMap, roughness: 0.9 });
  const brassMat = new THREE.MeshStandardMaterial({ color: "#c9a660", metalness: 1, roughness: 0.48 });
  const ribbonMat = new THREE.MeshStandardMaterial({ color: "#d6c49c", roughness: 0.85 });
  const groundMat = new THREE.MeshStandardMaterial({ roughness: 1, color: "#a79c8c" });
  const contactMap = contactShadow();
  const contactMat = new THREE.MeshBasicMaterial({ map: contactMap, transparent: true, depthWrite: false, color: 0x000000 });
  disposables.push(paperMat, liningMat, edgesMap, pageEdgesMat, brassMat, ribbonMat, groundMat, contactMap, contactMat);

  // the cover's maps are painted once from the leather photos
  let cover: CoverMaps | null = null;
  track(1);
  Promise.all([image(leatherFile("diff")), image(leatherFile("nor")), image(leatherFile("arm"))])
    .then(([diff, nor, arm]) =>
      buildCover(
        { diff, nor, arm },
        {
          height: q.coverSize,
          chestnut: true,
          name: "Shahmeer Khan",
          nameFont: getComputedStyle(document.documentElement).getPropertyValue("--font-apple") || "cursive",
        },
      ),
    )
    .then((maps) => {
      if (dead) return Object.values(maps).forEach((t) => t.dispose());
      cover = maps;
      coverMat.map = maps.map;
      coverMat.normalMap = maps.normalMap;
      coverMat.aoMap = coverMat.roughnessMap = maps.armMap;
      coverMat.needsUpdate = true;
    })
    .catch(() => {})
    .finally(() => track(-1));

  track(1);
  new HDRLoader().load(
    `${T}/hdri/meadow_2.hdr`,
    (env) => {
      if (dead) return env.dispose();
      env.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = env;
      track(-1);
    },
    undefined,
    () => track(-1),
  );

  // ---------- the book, its contact shadow, the ground ----------
  const book = createBook({
    cover: coverMat,
    edge: edgeMat,
    strap: strapMat,
    lining: liningMat,
    pageEdges: pageEdgesMat,
    paper: paperMat,
    brass: brassMat,
    ribbon: ribbonMat,
  });
  book.group.rotation.y = BOOK_YAW;
  scene.add(book.group);

  const contactGeo = new THREE.PlaneGeometry(COVER_W + 1, COVER_L + 1).rotateX(-Math.PI / 2);
  const contact = new THREE.Mesh(contactGeo, contactMat);
  contact.position.y = 0.012;
  contact.rotation.y = BOOK_YAW;
  scene.add(contact);

  const groundGeo = new THREE.PlaneGeometry(1, 1);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  {
    const file = (kind: string) => `${T}/ground/forrest_ground_01_${kind}${q.textures}.jpg`;
    const arm = tex(file("arm"), 1, 1);
    groundMat.map = tex(file("diff"), 1, 1, true);
    groundMat.normalMap = tex(file("nor"), 1, 1);
    groundMat.aoMap = groundMat.roughnessMap = arm;
  }
  disposables.push(contactGeo, groundGeo);

  // ---------- the garden ----------
  const wind = { value: 0 };
  const press = { value: 0 };
  let garden: Garden | null = null;
  let grownFor = 0;

  // book-flat coordinates to world, allowing for the book's slight turn
  const cosY = Math.cos(BOOK_YAW);
  const sinY = Math.sin(BOOK_YAW);
  const toWorld = (x: number, z: number) => [x * cosY + z * sinY, -x * sinY + z * cosY] as const;
  const [landX, landZ] = toWorld(COVER_LANDING.x, COVER_LANDING.z);
  const [spineX, spineZ] = toWorld(-COVER_W / 2, 0);

  const grow = (halfW: number, halfH: number, wide: boolean) => {
    if (garden) {
      garden.objects.forEach((o) => scene.remove(o));
      garden.litter.forEach((o) => book.coverPivot.remove(o));
      garden.dispose();
    }
    garden = growGarden({
      halfW,
      halfH,
      density: q.density,
      leaves: q.leaves,
      book: { cx: 0, cz: 0, hw: COVER_W / 2, hl: COVER_L / 2, yaw: -BOOK_YAW },
      // the cover comes down on the grass on every screen, and tall screens now look at it too
      landing: { cx: landX, cz: landZ, hw: COVER_LANDING.hw, hl: COVER_LANDING.hl, yaw: -BOOK_YAW },
      press,
      cover: { w: COVER_W, l: COVER_L },
      wind,
      maxAniso,
      track,
    });
    garden.objects.forEach((o) => scene.add(o));
    garden.litter.forEach((o) => book.coverPivot.add(o));
    ground.scale.set(garden.width, garden.height, 1);
    for (const t of [groundMat.map, groundMat.normalMap, groundMat.aoMap]) t?.repeat.set(garden.width / 3, garden.height / 3);
    if (!opts.still) plantSecrets(wide);
    shadowFrames = 6;
  };

  // ---------- the secret flowers ----------
  // Five daisies a shade of blue, a little bigger than the rest. They are put where the
  // open-book shot can see them, clear of the book and of the corners the buttons use.
  const daisyMap = tex(SHEETS.daisy.url, 1, 1, true);
  const secretMat = new THREE.MeshStandardMaterial({ map: daisyMap, alphaTest: 0.4, color: "#aebcff", roughness: 0.7, side: THREE.DoubleSide });
  const secretDepth = new THREE.MeshDepthMaterial({ map: daisyMap, alphaTest: 0.4 });
  disposables.push(secretMat, secretDepth);
  const SECRET_SIZE = 0.3;
  const SECRET_Y = 0.56;
  const secrets = SHEETS.daisy.rects.slice(0, SECRET_COUNT).map(([u, v, w, h], i) => {
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u + uv.getX(k) * w, v + uv.getY(k) * h);
    disposables.push(g);
    const mesh = new THREE.Mesh(g, secretMat);
    mesh.customDepthMaterial = secretDepth;
    mesh.castShadow = true;
    mesh.scale.setScalar(SECRET_SIZE);
    mesh.rotation.set(0.12 - i * 0.05, i * 1.3, i % 2 ? 0.14 : -0.1, "YXZ");
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
  const plantSecrets = (isWide: boolean) => {
    const s = shot(1, 1);
    const halfH = (BOOK_H + s.d - SECRET_Y) * tan;
    const halfW = halfH * aspect;
    const blocks = [
      { cx: 0, cz: 0, hw: COVER_W / 2, hl: COVER_L / 2, yaw: -BOOK_YAW },
      { cx: landX, cz: landZ, hw: COVER_LANDING.hw, hl: COVER_LANDING.hl, yaw: -BOOK_YAW },
    ];
    // candidate spots on a grid over the shot, in -1..1 both ways
    const spots: { x: number; z: number; clear: number }[] = [];
    for (let iy = 0; iy <= 12; iy++) {
      for (let ix = 0; ix <= 12; ix++) {
        const nx = -0.88 + (ix / 12) * 1.76 + (iy % 2 ? 0.05 : -0.05);
        const ny = -0.82 + (iy / 12) * 1.66;
        // the bottom corners hold the contact and chat buttons, the top left the sound tag
        if (ny > 0.74 && Math.abs(nx) > (isWide ? 0.78 : 0.42)) continue;
        if (ny < -0.76 && nx < (isWide ? -0.78 : -0.3)) continue;
        const x = s.x + nx * halfW;
        const z = s.z + ny * halfH;
        const clear = Math.min(...blocks.map((b) => rectDistance(x, z, b).d));
        if (clear > 0.24) spots.push({ x, z, clear: Math.min(clear, 0.9) });
      }
    }
    // pick five that keep well apart from each other
    const chosen: typeof spots = [];
    for (let n = 0; n < SECRET_COUNT && spots.length; n++) {
      let best = 0;
      let bestScore = -1;
      spots.forEach((p, i) => {
        const apart = chosen.length ? Math.min(...chosen.map((c) => Math.hypot(c.x - p.x, c.z - p.z))) : 1 + ((i * 7) % 5) * 0.01;
        const score = apart + p.clear * 0.3;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      chosen.push(spots.splice(best, 1)[0]);
    }
    secrets.forEach((mesh, i) => {
      const c = chosen[i];
      mesh.visible = !!c;
      if (c) mesh.position.set(c.x, SECRET_Y, c.z);
    });
  };
  const bob = secrets.map((mesh) => ({ at: 0, speed: 0, tilt: mesh.rotation.x }));

  // ---------- seeds drifting in the air ----------
  const seeds: { x: number; y: number; z: number; phase: number }[] = [];
  let seedPoints: THREE.Points | null = null;
  if (q.pollen > 0 && !opts.still) {
    const dot = document.createElement("canvas");
    dot.width = dot.height = 32;
    const dctx = dot.getContext("2d")!;
    const glow = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.4, "rgba(255,255,255,0.5)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    dctx.fillStyle = glow;
    dctx.fillRect(0, 0, 32, 32);
    const dotMap = new THREE.CanvasTexture(dot);
    const seedGeo = new THREE.BufferGeometry();
    seedGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(q.pollen * 3), 3));
    const seedMat = new THREE.PointsMaterial({ map: dotMap, size: 0.045, color: "#fff3cf", transparent: true, opacity: 0.6, depthWrite: false });
    for (let i = 0; i < q.pollen; i++) {
      const r = (n: number) => {
        const v = Math.sin((i + 1) * n) * 43758.5453;
        return v - Math.floor(v);
      };
      seeds.push({ x: (r(12.9) - 0.5) * 9, y: 0.7 + r(78.2) * 1.1, z: (r(39.3) - 0.5) * 7, phase: r(5.1) * 6.28 });
    }
    seedPoints = new THREE.Points(seedGeo, seedMat);
    seedPoints.frustumCulled = false;
    scene.add(seedPoints);
    disposables.push(dotMap, seedGeo, seedMat);
  }

  // ---------- render target and post pass ----------
  const target = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    samples: q.msaa,
    depthTexture: new THREE.DepthTexture(2, 2),
  });
  const post = new THREE.ShaderMaterial({
    defines: { TAPS: q.blurTaps },
    uniforms: {
      tColor: { value: target.texture },
      tDepth: { value: target.depthTexture },
      uPx: { value: new THREE.Vector2() },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uFocus: { value: 6 },
      uAperture: { value: 6.5 },
      uMaxBlur: { value: 10 },
      uDof: { value: q.depthOfField ? 1 : 0 },
      uTime: { value: 0 },
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: POST_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const postScene = new THREE.Scene();
  const postGeo = new THREE.PlaneGeometry(2, 2);
  const postQuad = new THREE.Mesh(postGeo, post);
  postQuad.frustumCulled = false;
  postScene.add(postQuad);
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  disposables.push(target, post, postGeo);

  // ---------- framing ----------
  // Closed, the camera sits over the middle of the cover. On a wide screen it
  // slides over the spine and backs off as the book opens, so both pages fit.
  // On a tall screen it stays put and the cover swings out of view.
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  let aspect = 1;
  let wide = false;
  let open = 0;
  // On a tall screen it stays over the right-hand page and comes closer, so the
  // page nearly fills the width and the text on it is big enough to read.
  // It can slide across to the left-hand page and back; `side` says how far.
  const [pageX, pageZ] = toWorld(HINGE_X + PAGE_W / 2, 0);
  const [leftX, leftZ] = toWorld(HINGE_X - PAGE_W * 0.49, 0);
  let side = 1;
  let breath = 0;
  const shot = (amount: number, over = side) => {
    if (opts.still) return { x: spineX, z: spineZ, d: STILL_HALF_H / tan };
    const closedD = (Math.max((COVER_L / 2) * 1.3, ((COVER_W / 2) * 1.42) / aspect) / tan) * (1 + breath);
    if (!wide) {
      const openD = Math.max(PAGE_L / 2 / 0.8, PAGE_W / 2 / 0.93 / aspect) / tan;
      const x = leftX + (pageX - leftX) * over;
      const z = leftZ + (pageZ - leftZ) * over;
      return { x: x * amount, z: z * amount, d: closedD + (openD - closedD) * amount };
    }
    const openD = Math.max((COVER_L / 2) * 1.17, (COVER_W * 1.12) / aspect) / tan;
    return { x: spineX * amount, z: spineZ * amount, d: closedD + (openD - closedD) * amount };
  };
  const aim = () => {
    const s = shot(open);
    camera.position.set(s.x, BOOK_H + s.d, s.z);
    camera.lookAt(s.x, 0, s.z);
    post.uniforms.uFocus.value = s.d;
  };

  // ---------- where the pages are on screen ----------
  let cssW = 1;
  let cssH = 1;
  let turns = 0;
  // world point to CSS pixels. The camera looks straight down with -z up the screen.
  const scaleAt = (camY: number, y: number) => cssH / 2 / (tan * (camY - y));
  const measure = (): View => {
    const s = shot(open);
    const camY = BOOK_H + s.d;
    const f = scaleAt(camY, PAGE_TOP);
    const px = (x: number, y: number, z: number) => {
      const [wx, wz] = toWorld(x, z);
      const k = scaleAt(camY, y);
      return [cssW / 2 + (wx - s.x) * k, cssH / 2 + (wz - s.z) * k] as const;
    };
    const [hx, hy] = px(HINGE_X, PAGE_TOP, -PAGE_L / 2);
    const [mx, my] = px(HINGE_X, PAGE_TOP, 0);
    const pw = PAGE_W * f;
    // how far along the page (in page widths) a point of the book's cross-section lands
    const along = (x: number, y: number) => {
      const [sx, sy] = px(x, y, 0);
      return ((sx - mx) * cosY - (sy - my) * sinY) / pw;
    };
    const leftDrop = LEAF_CLIMB + (Math.sin(LEAF_REST) * PAGE_W) / 2; // the left page's middle, against the right page's height
    const leftRun = -Math.cos(LEAF_REST) * PAGE_W * 0.975; // a little is lost climbing out of the gutter
    const restCamY = BOOK_H + shot(1).d;
    const restF = scaleAt(restCamY, PAGE_TOP);

    let leafRight = 0;
    let leafLeft = 0;
    const k = Math.floor(turns);
    if (turns > k && k < LEAVES) {
      const line = book.leafLine(k);
      for (let i = 0; i < line.length; i += 2) {
        const u = along(HINGE_X + line[i], PAGE_TOP + line[i + 1]);
        leafRight = Math.max(leafRight, u);
        leafLeft = Math.min(leafLeft, u);
      }
    }
    const lid = OPEN_ANGLE * smooth(0, 1, open);
    return {
      wide,
      hx,
      hy,
      rot: -BOOK_YAW,
      pw,
      ph: PAGE_L * f,
      lw: leftRun * scaleAt(camY, PAGE_TOP + leftDrop),
      rest: {
        pw: PAGE_W * restF,
        ph: PAGE_L * restF,
        lw: leftRun * scaleAt(restCamY, PAGE_TOP + leftDrop),
      },
      cover: along(COVER_PIVOT.x + Math.cos(lid) * (COVER_W + 0.03), COVER_PIVOT.y + Math.sin(lid) * (COVER_W + 0.03)),
      leafRight,
      leafLeft,
      flowers: secrets
        .filter((m) => m.visible)
        .map((m) => {
          const k2 = scaleAt(camY, SECRET_Y);
          return { x: cssW / 2 + (m.position.x - s.x) * k2, y: cssH / 2 + (m.position.z - s.z) * k2, r: (SECRET_SIZE / 2) * k2 };
        }),
    };
  };

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    cssW = w;
    cssH = h;
    renderer.setPixelRatio(q.pixelRatio * scaler.scale);
    renderer.setSize(w, h, false);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    target.setSize(size.x, size.y);
    post.uniforms.uPx.value.set(1 / size.x, 1 / size.y);
    post.uniforms.uMaxBlur.value = size.y * 0.011;

    aspect = w / h;
    wide = aspect > 1.15 || !!opts.still;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    aim();

    // grow enough lawn for the widest the camera will ever see
    if (Math.abs(aspect - grownFor) > 0.04) {
      grownFor = aspect;
      const a = shot(0);
      const b = shot(1, 1);
      const c = shot(1, 0);
      const halfH = Math.max(a.d, b.d + BOOK_H) * tan + BOOK_H * tan;
      const halfW = Math.max((a.d + BOOK_H) * tan * aspect, Math.max(Math.abs(b.x), Math.abs(c.x)) + (b.d + BOOK_H) * tan * aspect);
      grow(halfW, halfH, wide);
    }
    opts.onResize();
  };
  let resizeTimer = 0;
  const observer = new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 120);
  });
  observer.observe(canvas);
  resize();

  // ---------- scroll ----------
  // a leaf that has just landed keeps a little bounce in its free edge
  const landed = Array.from({ length: LEAVES }, () => -1);
  let clock = performance.now() / 1000;
  const set = (amount: number, turned: number, over = 1) => {
    amount = Math.min(1, Math.max(0, amount));
    turned = Math.min(LEAVES, Math.max(0, turned));
    over = Math.min(1, Math.max(0, over));
    if (amount !== open || turned !== turns || over !== side) {
      for (let k = 0; k < LEAVES; k++) {
        const was = Math.min(1, Math.max(0, turns - k));
        const now = Math.min(1, Math.max(0, turned - k));
        if (was > 0 && was < 1 && (now === 0 || now === 1) && q.wind) landed[k] = clock;
      }
      open = amount;
      turns = turned;
      side = over;
      book.setOpen(open);
      book.setTurns(turns);
      press.value = smooth(0.7, 1, open);
      aim();
      shadowFrames = 2;
    }
    return measure();
  };

  // the loose corner of the top right-hand leaf, on a soft spring
  const corner = { want: 0, at: 0, speed: 0, leaf: -1 };
  book.setOpen(0);
  if (opts.still) set(1, 3);

  // ---------- loop ----------
  let last = performance.now();
  let frames = 0;
  let since = last;
  let active = true;
  const frame = (now: number) => {
    if (dead) return;
    if (!opts.still && scaler.sample(now - last)) resize();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // nothing to draw for while the intro is in front, once everything has loaded
    if (!active && ready && shadowFrames <= 0) return;
    const t = now / 1000;
    clock = t;
    if (q.wind) wind.value = t;
    post.uniforms.uTime.value = q.wind ? t : 0;

    if (q.wind && !opts.still) {
      // the closed book breathes a very little; it stops before any text is in view
      const idle = 1 - smooth(0, 0.3, open);
      const next = idle > 0 ? Math.sin(t * 0.9) * 0.004 * idle : 0;
      if (next !== breath) {
        breath = next;
        aim();
      }
      // daylight that is never quite steady, as if thin cloud were passing
      sun.intensity = 5.2 * (1 + 0.05 * Math.sin(t * 0.23) + 0.03 * Math.sin(t * 0.61 + 1));

      // the bounce of a leaf that just landed
      for (let k = 0; k < LEAVES; k++) {
        if (landed[k] < 0) continue;
        const since = t - landed[k];
        if (since > 1.1) landed[k] = -1;
        book.setSettle(k, landed[k] < 0 ? 0 : 0.11 * Math.exp(-4.5 * since) * Math.sin(13 * since));
        shadowFrames = Math.max(shadowFrames, 1);
      }

      // the picked-up corner
      const top = Number.isInteger(turns) && turns < LEAVES && open === 1 ? turns : -1;
      if (corner.leaf !== top) {
        if (corner.leaf >= 0) book.setCorner(corner.leaf, 0);
        corner.leaf = top;
        corner.at = corner.speed = 0;
      }
      if (top >= 0 && (corner.want !== corner.at || Math.abs(corner.speed) > 0.001)) {
        corner.speed += ((corner.want - corner.at) * 150 - corner.speed * 15) * dt;
        corner.at += corner.speed * dt;
        if (Math.abs(corner.want - corner.at) < 0.002 && Math.abs(corner.speed) < 0.02) corner.at = corner.want;
        book.setCorner(top, Math.max(0, corner.at));
        shadowFrames = Math.max(shadowFrames, 1);
      }

      // the secret flowers nod in the breeze, and bob when touched
      secrets.forEach((mesh, i) => {
        const b = bob[i];
        b.speed += (-b.at * 120 - b.speed * 7) * dt;
        b.at += b.speed * dt;
        mesh.rotation.x = b.tilt + Math.sin(t * 1.2 + i * 2.1) * 0.07 + b.at * 0.5;
        mesh.rotation.z = Math.sin(t * 0.9 + i * 1.3) * 0.06 - b.at * 0.3;
        mesh.scale.setScalar(SECRET_SIZE * (1 + Math.abs(b.at) * 0.25));
      });

      if (seedPoints) {
        const pos = seedPoints.geometry.attributes.position as THREE.BufferAttribute;
        seeds.forEach((s, i) => {
          const x = ((((s.x + t * 0.11 + 4.5) % 9) + 9) % 9) - 4.5; // carried slowly across, then round again
          pos.setXYZ(i, x + Math.sin(t * 0.5 + s.phase) * 0.12, s.y + Math.sin(t * 0.37 + s.phase * 2) * 0.1, s.z + Math.cos(t * 0.31 + s.phase) * 0.15);
        });
        pos.needsUpdate = true;
      }
    }
    if (pending > 0 || shadowFrames > 0) {
      renderer.shadowMap.needsUpdate = true;
      shadowFrames--;
    }
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);

    // left on the canvas for anyone checking speed in dev tools
    frames++;
    if (now - since >= 1000) {
      canvas.dataset.fps = String(Math.round((frames * 1000) / (now - since)));
      canvas.dataset.scale = scaler.scale.toFixed(2);
      canvas.dataset.blades = String(garden?.blades ?? 0);
      frames = 0;
      since = now;
    }
  };

  return {
    set,
    view: measure,
    frame,
    liftCorner: (on) => {
      corner.want = on ? 1 : 0;
    },
    pokeFlower: (i) => {
      if (bob[i]) bob[i].speed += 5;
    },
    setActive: (on) => {
      active = on;
      if (on) shadowFrames = 2;
    },
    dispose: () => {
      dead = true;
      window.clearTimeout(resizeTimer);
      observer.disconnect();
      garden?.dispose();
      book.dispose();
      if (cover) Object.values(cover).forEach((t) => t.dispose());
      scene.environment?.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    },
  };
}
