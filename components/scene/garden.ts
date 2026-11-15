import * as THREE from "three";

// Everything growing or lying around the book: grass blades, clover, daisies,
// dandelion leaves, fallen oak leaves. All of it is cut from photographs
// (ambientCG, CC0) except the clover, and each kind is one draw call.

// Where each cut-out sits in its photo sheet: [u, v, width, height].
type Rect = [number, number, number, number];
export const SHEETS = {
  blades: {
    url: "/textures/garden/Foliage008.webp",
    rects: [
      [0.043, 0.8633, 0.9258, 0.0742], [0.0547, 0.6992, 0.8867, 0.1406], [0.0977, 0.543, 0.7617, 0.1094],
      [0.0391, 0.4258, 0.9297, 0.0859], [0.082, 0.293, 0.8398, 0.082], [0.0234, 0.1992, 0.9492, 0.0586],
      [0.1055, 0.0508, 0.8242, 0.0508],
    ] as Rect[],
  },
  oak: {
    url: "/textures/garden/LeafSet030.webp",
    rects: [
      [0.0117, 0.8125, 0.2383, 0.1406], [0.7578, 0.7969, 0.1758, 0.1484], [0.2539, 0.7969, 0.2422, 0.1445],
      [0.5156, 0.7891, 0.1797, 0.1523], [0.0117, 0.5625, 0.2383, 0.1445], [0.2578, 0.5625, 0.2109, 0.1406],
      [0.5, 0.5586, 0.1914, 0.125], [0.75, 0.5547, 0.1914, 0.1211], [0.5039, 0.3164, 0.1992, 0.1289],
      [0.2539, 0.3086, 0.2148, 0.1289], [0.0234, 0.3125, 0.1641, 0.1211], [0.7656, 0.3164, 0.1758, 0.1094],
      [0.2812, 0.0703, 0.1562, 0.1172], [0.5117, 0.0703, 0.1836, 0.1133], [0.7539, 0.0625, 0.1836, 0.1172],
      [0.0195, 0.0664, 0.1719, 0.1094],
    ] as Rect[],
  },
  daisy: {
    url: "/textures/garden/FlowerSet001.webp",
    rects: [
      [0.3555, 0.543, 0.2812, 0.3047], [0.0508, 0.5664, 0.2812, 0.2773], [0.6875, 0.5703, 0.2656, 0.2695],
      [0.0273, 0.1602, 0.332, 0.3359], [0.375, 0.1797, 0.2773, 0.2734], [0.6914, 0.1523, 0.2852, 0.2891],
    ] as Rect[],
  },
  dandelion: {
    url: "/textures/garden/LeafSet020.webp",
    rects: [
      [0.8203, 0.0742, 0.1289, 0.8555], [0.5781, 0.0664, 0.168, 0.8594], [0.0391, 0.1094, 0.1133, 0.793],
      [0.4141, 0.0977, 0.1016, 0.7773], [0.2188, 0.1172, 0.1133, 0.7539],
    ] as Rect[],
  },
};

export type Obstacle = { cx: number; cz: number; hw: number; hl: number; yaw: number };

export type GardenOpts = {
  halfW: number; // half of what the camera sees, in scene units
  halfH: number;
  density: number; // blades per square unit of lawn
  leaves: number; // fallen oak leaves
  book: Obstacle;
  // where the cover comes down when the book opens: grass there gets pressed flat as it lands
  landing: Obstacle | null;
  press: { value: number };
  // the cover's own size, for the leaf and clippings lying on it
  cover: { w: number; l: number };
  wind: { value: number };
  // one of the photo sheets as a texture; the scene makes and keeps them, and loads them
  photo: (url: string) => THREE.Texture;
};

// `litter` sits in the cover's own space (origin at the spine edge) so it can ride on the cover.
export type Garden = { objects: THREE.Object3D[]; litter: THREE.Object3D[]; blades: number; width: number; height: number; dispose: () => void };

function noise2(x: number, y: number) {
  const h = (a: number, b: number) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// signed distance from a point to a rotated rectangle on the ground, and the way out of it
export function rectDistance(x: number, z: number, o: Obstacle) {
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  const lx = (x - o.cx) * c - (z - o.cz) * s;
  const lz = (x - o.cx) * s + (z - o.cz) * c;
  const dx = Math.abs(lx) - o.hw;
  const dz = Math.abs(lz) - o.hl;
  const d = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
  const ox = dx > dz ? Math.sign(lx) : 0;
  const oz = dx > dz ? 0 : Math.sign(lz);
  return { d, outX: ox * c + oz * s, outZ: -ox * s + oz * c };
}

// Points each instance at its own cut-out in the photo sheet.
// `along` says which way the cut-out runs in the sheet: sideways (blades) or upward.
function cutOut<T extends THREE.Material>(mat: T, along: "u" | "v", more?: (shader: Parameters<THREE.Material["onBeforeCompile"]>[0]) => void) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aRect;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = aRect.xy + ${along === "u" ? "uv.yx" : "uv"} * aRect.zw;\n#endif`,
      );
    more?.(shader);
  };
  mat.customProgramCacheKey = () => `cutout-${along}-${more ? "blade" : "card"}`;
  return mat;
}

function bladeGeometry() {
  const SEG = 3;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let y = 0;
  let z = 0;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const ang = t * 0.95;
    if (i > 0) {
      const mid = (t - 0.5 / SEG) * 0.95;
      y += Math.cos(mid) / SEG;
      z += Math.sin(mid) / SEG;
    }
    for (const side of [-1, 1]) {
      pos.push(side * 0.5, y, z);
      const n = new THREE.Vector3(side * 0.4, Math.sin(ang), -Math.cos(ang)).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(side * 0.5 + 0.5, t);
    }
    if (i < SEG) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function cloverTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.translate(64, 64);
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI * 2) / 3 + 0.2);
    const g = ctx.createRadialGradient(0, -30, 4, 0, -30, 30);
    g.addColorStop(0, "#6b9440");
    g.addColorStop(1, "#3c6524");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.bezierCurveTo(-34, -18, -30, -62, 0, -52);
    ctx.bezierCurveTo(30, -62, 34, -18, 0, -2);
    ctx.fill();
    // the pale V most clover leaves carry, and the midrib
    ctx.strokeStyle = "rgba(196,220,160,0.55)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-17, -36);
    ctx.quadraticCurveTo(0, -18, 17, -36);
    ctx.stroke();
    ctx.strokeStyle = "rgba(30,60,20,0.5)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, -50);
    ctx.stroke();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Card = {
  x: number; y: number; z: number;
  yaw: number; pitch: number; roll: number;
  w: number; l: number;
  rect: Rect;
  tint: number;
};

export function growGarden(o: GardenOpts): Garden {
  const objects: THREE.Object3D[] = [];
  const disposables: { dispose: () => void }[] = [];
  const photo = o.photo;

  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)];

  const width = o.halfW * 2 + 1.6;
  const height = o.halfH * 2 + 1.6;
  const obstacles = [o.book];
  const keepClear = o.landing ? [o.book, o.landing] : [o.book];
  const nearest = (x: number, z: number) => {
    let best = rectDistance(x, z, obstacles[0]);
    for (let i = 1; i < obstacles.length; i++) {
      const r = rectDistance(x, z, obstacles[i]);
      if (r.d < best.d) best = r;
    }
    return best;
  };
  // a free spot the camera can see, clear of the book and paper
  const spot = (clear: number) => {
    for (let i = 0; i < 60; i++) {
      const x = (rnd() - 0.5) * 2 * (o.halfW - 0.25);
      const z = (rnd() - 0.5) * 2 * (o.halfH - 0.25);
      if (keepClear.every((k) => rectDistance(x, z, k).d > clear)) return [x, z] as const;
    }
    return [o.halfW * 0.7, o.halfH * 0.75] as const;
  };

  const cloverSpots = [spot(0.25), spot(0.25)];
  const weedSpots = [spot(0.45), spot(0.45), spot(0.45)];
  const cloverAt = (x: number, z: number) =>
    Math.max(...cloverSpots.map(([cx, cz]) => 1 - Math.hypot(x - cx, z - cz) / 0.75));

  // ---------- grass ----------
  let bladeCount = 0;
  {
    const count = Math.round(width * height * o.density);
    const geo = bladeGeometry();
    const rects = new Float32Array(count * 4);
    const dry = new Float32Array(count);
    const pressed = new Float32Array(count);

    const blade = (shader: Parameters<THREE.Material["onBeforeCompile"]>[0]) => {
      shader.uniforms.uTime = o.wind;
      shader.uniforms.uPress = o.press;
      shader.vertexShader = shader.vertexShader
        .replace("attribute vec4 aRect;", "attribute vec4 aRect;\nattribute float aDry;\nattribute float aPress;\nuniform float uTime;\nuniform float uPress;\nvarying float vT;\nvarying float vDry;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vT = uv.y;
          vDry = aDry;
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
            float bend = uv.y * uv.y * (1.0 - aDry * 0.7);
            transformed.z += (sin(uTime * 1.5 + ph) * 0.6 + sin(uTime * 0.6 + ph * 0.31)) * 0.04 * bend;
            transformed.x += cos(uTime * 1.1 + ph) * 0.35 * bend;
          #endif
          // flattened under the opened cover
          float squash = aPress * uPress;
          transformed.y *= 1.0 - squash * 0.94;
          transformed.z *= 1.0 + squash * 0.4;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vT;\nvarying float vDry;")
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          // dead blades lose their green and go the colour of straw
          float lum = dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.6, 0.36) * lum * 1.9, vDry);
          // dark down in the thatch, brighter toward the tip
          diffuseColor.rgb *= mix(0.22, 1.0, smoothstep(0.0, 0.7, vT));`,
        );
    };
    const map = photo(SHEETS.blades.url);
    const mat = cutOut(
      new THREE.MeshStandardMaterial({ map, alphaTest: 0.3, alphaToCoverage: true, roughness: 0.52, side: THREE.DoubleSide }),
      "u",
      blade,
    );
    const depth = cutOut(new THREE.MeshDepthMaterial({ map, alphaTest: 0.3 }), "u");
    disposables.push(geo, mat, depth);

    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(0, 0, 0, "YXZ");
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const colour = new THREE.Color();
    const lush = new THREE.Color(0.5, 0.78, 0.42);
    const yellow = new THREE.Color(0.95, 0.92, 0.5);
    const cool = new THREE.Color(0.52, 0.74, 0.6);
    let n = 0;

    for (let i = 0; i < count; i++) {
      const x = (rnd() - 0.5) * width;
      const z = (rnd() - 0.5) * height;
      const edge = nearest(x, z);
      if (edge.d < -0.04) continue;

      // slow noise decides the lawn's patches: worn-through soil, dried-out areas, lush tufts
      const bare = smooth(0.74, 0.86, noise2(x * 0.5 + 3, z * 0.5 + 7));
      if (rnd() < bare * 0.85) continue;
      const clover = Math.max(0, cloverAt(x, z));
      if (rnd() < clover * 0.4) continue;
      const parched = smooth(0.5, 0.78, noise2(x * 0.32 + 20, z * 0.32 + 11));
      const patch = noise2(x * 0.38 + 9, z * 0.38 + 4);
      const tuft = smooth(0.6, 0.8, noise2(x * 2.4 + 1, z * 2.4 + 5));
      const clump = noise2(x * 1.3, z * 1.3);

      // three sorts of blade: fine lawn grass, broader blades, and the odd long floppy one
      const kind = rnd();
      let length: number;
      let wide: number;
      let lean = 0.05 + rnd() * rnd() * 0.7;
      if (kind < 0.62) {
        length = 0.1 + rnd() * 0.16;
        wide = 0.012 + rnd() * 0.008;
      } else if (kind < 0.97) {
        length = 0.18 + rnd() * 0.22;
        wide = 0.018 + rnd() * 0.012;
      } else {
        length = 0.4 + rnd() * 0.3;
        wide = 0.026 + rnd() * 0.014;
        lean += 0.35;
      }
      length *= (0.6 + patch * 0.75) * (1 + tuft * 0.7) * (1 - parched * 0.35);

      const isDry = rnd() < 0.05 + parched * 0.5 + bare * 0.6;
      let yaw = clump * 9 + (rnd() - 0.5) * 2.6;
      if (isDry) lean += 0.25 + rnd() * 0.4; // dead grass lies down

      // blades against the book or the paper get pushed over, away from it, and sit in its shade
      const push = Math.max(0, 1 - edge.d / 0.3);
      if (push > 0) {
        yaw = Math.atan2(edge.outX, edge.outZ) + (rnd() - 0.5) * 1.5;
        lean += push * 0.5;
        length *= 1 - push * 0.25;
      }
      e.set(lean, yaw, 0);
      q.setFromEuler(e);
      p.set(x, 0, z);
      s.set(wide * 2.2, length, length); // the cut-out has empty margin, so the quad is wider than the blade
      mesh.setMatrixAt(n, m.compose(p, q, s));

      const tone = noise2(x * 0.27 + 40, z * 0.27 + 2);
      colour.copy(lush).lerp(yellow, smooth(0.45, 0.85, tone) * 0.7 + parched * 0.25).lerp(cool, smooth(0.5, 0.9, patch) * 0.5);
      const shade = (0.8 + rnd() * 0.5) * (0.75 + clump * 0.3) * (0.35 + 0.65 * smooth(0, 0.32, edge.d));
      colour.multiplyScalar(isDry ? shade * 1.25 : shade);
      mesh.setColorAt(n, colour);
      dry[n] = isDry ? 0.75 + rnd() * 0.25 : parched * rnd() * 0.5;
      pressed[n] = o.landing ? smooth(0.4, 0.02, rectDistance(x, z, o.landing).d) : 0;
      rects.set(pick(SHEETS.blades.rects), n * 4);
      n++;
    }
    mesh.count = n;
    geo.setAttribute("aRect", new THREE.InstancedBufferAttribute(rects, 4));
    geo.setAttribute("aDry", new THREE.InstancedBufferAttribute(dry, 1));
    geo.setAttribute("aPress", new THREE.InstancedBufferAttribute(pressed, 1));
    mesh.customDepthMaterial = depth;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    objects.push(mesh);
    disposables.push(mesh);
    bladeCount = n;
  }

  // ---------- flat cut-outs: leaves, flowers, clover ----------
  const litter: THREE.Object3D[] = [];
  const cards = (map: THREE.Texture, along: "u" | "v", list: Card[], pivotAtBase = false, into = objects) => {
    const geo = new THREE.PlaneGeometry(1, 1, 1, 3).rotateX(-Math.PI / 2);
    if (pivotAtBase) geo.translate(0, 0, -0.5);
    // a slight cup along the length, so nothing is a perfectly flat card
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = pivotAtBase ? -pos.getZ(i) : pos.getZ(i) + 0.5;
      pos.setY(i, Math.sin(t * Math.PI) * 0.06 - Math.abs(pos.getX(i)) * 0.08);
    }
    geo.computeVertexNormals();
    const mat = cutOut(
      new THREE.MeshStandardMaterial({ map, alphaTest: 0.4, alphaToCoverage: true, roughness: 0.78, side: THREE.DoubleSide }),
      along,
    );
    const depth = cutOut(new THREE.MeshDepthMaterial({ map, alphaTest: 0.4 }), along);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const rects = new Float32Array(list.length * 4);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(0, 0, 0, "YXZ");
    const c = new THREE.Color();
    list.forEach((card, i) => {
      e.set(card.pitch, card.yaw, card.roll);
      mesh.setMatrixAt(
        i,
        m.compose(new THREE.Vector3(card.x, card.y, card.z), q.setFromEuler(e), new THREE.Vector3(card.w, card.l, card.l)),
      );
      mesh.setColorAt(i, c.setScalar(card.tint));
      rects.set(card.rect, i * 4);
    });
    geo.setAttribute("aRect", new THREE.InstancedBufferAttribute(rects, 4));
    mesh.customDepthMaterial = depth;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    into.push(mesh);
    disposables.push(geo, mat, depth, mesh);
  };
  const tilt = (amount: number) => (rnd() - 0.5) * 2 * amount;

  // fallen oak leaves on the grass
  const oak: Card[] = [];
  for (let i = 0; i < o.leaves; i++) {
    const [x, z] = spot(0.1);
    const size = 0.42 + rnd() * 0.32;
    oak.push({ x, z, y: 0.2 + rnd() * 0.16, yaw: rnd() * 6.3, pitch: tilt(0.3), roll: tilt(0.3), w: size, l: size * 0.62, rect: pick(SHEETS.oak.rects), tint: 0.36 + rnd() * 0.2 });
  }
  cards(photo(SHEETS.oak.url), "v", oak);

  // daisies in loose groups, heads at slightly different heights and angles
  const daisies: Card[] = [];
  for (let g = 0; g < 3; g++) {
    const [gx, gz] = spot(0.35);
    const heads = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < heads; i++) {
      const x = gx + tilt(0.45);
      const z = gz + tilt(0.45);
      if (nearest(x, z).d < 0.12) continue;
      const size = 0.17 + rnd() * 0.09;
      daisies.push({ x, z, y: 0.36 + rnd() * 0.2, yaw: rnd() * 6.3, pitch: tilt(0.35), roll: tilt(0.35), w: size, l: size, rect: pick(SHEETS.daisy.rects), tint: 0.7 + rnd() * 0.12 });
    }
  }
  cards(photo(SHEETS.daisy.url), "v", daisies);

  // dandelion plants: a ring of leaves lying nearly flat, the weed every lawn has
  const weeds: Card[] = [];
  for (const [wx, wz] of weedSpots) {
    const leaves = 5 + Math.floor(rnd() * 4);
    const turn = rnd() * 6.3;
    for (let i = 0; i < leaves; i++) {
      const len = 0.42 + rnd() * 0.3;
      weeds.push({ x: wx, z: wz, y: 0.1 + rnd() * 0.04, yaw: turn + (i / leaves) * 6.283 + tilt(0.3), pitch: 0.12 + rnd() * 0.3, roll: tilt(0.2), w: len * 0.3, l: len, rect: pick(SHEETS.dandelion.rects), tint: 0.26 + rnd() * 0.14 });
    }
  }
  cards(photo(SHEETS.dandelion.url), "v", weeds, true);

  // clover patches
  const cloverMap = cloverTexture();
  disposables.push(cloverMap);
  const cloverLeaves: Card[] = [];
  for (const [cx, cz] of cloverSpots) {
    const leaves = Math.round(o.density / 13);
    for (let i = 0; i < leaves; i++) {
      const r = Math.sqrt(rnd()) * 0.75;
      const a = rnd() * 6.283;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (nearest(x, z).d < 0.06) continue;
      const size = 0.11 + rnd() * 0.09;
      cloverLeaves.push({ x, z, y: 0.1 + rnd() * 0.16, yaw: rnd() * 6.3, pitch: tilt(0.4), roll: tilt(0.4), w: size, l: size, rect: [0, 0, 1, 1], tint: 0.55 + rnd() * 0.35 });
    }
  }
  cards(cloverMap, "v", cloverLeaves);

  // one leaf and a few loose clippings that ended up on the cover; they ride on it
  const top = 0.045;
  cards(photo(SHEETS.oak.url), "v", [{ x: o.cover.w * 0.24, z: o.cover.l * 0.4, y: top + 0.02, yaw: 0.9, pitch: 0.05, roll: -0.04, w: 0.5, l: 0.31, rect: SHEETS.oak.rects[6], tint: 0.6 }], false, litter);
  const clippings: Card[] = [];
  for (let i = 0; i < 5; i++) {
    const len = 0.22 + rnd() * 0.2;
    clippings.push({
      x: o.cover.w * (0.1 + rnd() * 0.8), z: tilt(o.cover.l * 0.42), y: top,
      yaw: rnd() * 6.3, pitch: 0, roll: 0, w: len, l: len * 0.14, rect: pick(SHEETS.blades.rects), tint: 0.45 + rnd() * 0.3,
    });
  }
  cards(photo(SHEETS.blades.url), "v", clippings, false, litter);

  return {
    objects,
    litter,
    blades: bladeCount,
    width,
    height,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
