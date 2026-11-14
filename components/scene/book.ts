import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { COVER_L, COVER_W } from "./bookCover";

// The notebook: covers, page block, spine, strap and clasp, ribbon, and the
// loose leaves that turn. Built lying flat with the spine on the left (-x).

export const BOOK_H = 0.37; // top of the closed cover above the ground
export const LEAVES = 6; // six leaves turn, so seven right-hand pages are seen
const SEG = 18;
export const OPEN_ANGLE = Math.PI + 0.12; // the cover swings past flat and rests on the grass
export const PAGE_TOP = BOOK_H - 0.06;
export const PAGE_W = COVER_W - 0.17;
export const PAGE_L = COVER_L - 0.12;
export const HINGE_X = -COVER_W / 2 + 0.09; // where the leaves are bound, in the book's own coordinates
export const COVER_PIVOT = { x: -COVER_W / 2, y: BOOK_H - 0.03 };
export const LEAF_REST = OPEN_ANGLE - 0.012; // the angle a turned leaf lies at, just clear of the opened cover
const LEAF_STEP = 0.85; // a turned leaf first climbs out of the gutter at this angle short of flat
export const LEAF_CLIMB = (PAGE_W / SEG) * Math.sin(LEAF_STEP); // how high that takes it


export type BookMaterials = {
  cover: THREE.Material; // outside of the front cover, with the tooling and the name
  edge: THREE.Material; // plain leather for thin sides, the back and the spine
  strap: THREE.Material;
  lining: THREE.Material; // inside of the front cover
  pageEdges: THREE.Material; // the striped sides of the page block
  paper: THREE.Material;
  brass: THREE.Material;
  ribbon: THREE.Material;
};

export type Book = {
  group: THREE.Group;
  coverPivot: THREE.Group; // origin on the spine edge; things lying on the cover go in here
  setOpen: (amount: number) => void; // 0 closed, 1 open
  setTurns: (turned: number) => void; // 0..LEAVES, fractions are a leaf in mid-air
  // the side-on outline of leaf k as x, y pairs measured from the hinge
  leafLine: (k: number) => Float32Array;
  // a small extra curl at the free edge of leaf k, for the bounce when it lands
  setSettle: (k: number, amount: number) => void;
  // lifts the loose bottom corner of leaf k (0..1), for a finger or the pointer resting on it
  setCorner: (k: number, amount: number) => void;
  dispose: () => void;
};

const ease = (t: number) => t * t * (3 - 2 * t);

export function createBook(m: BookMaterials): Book {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number) => {
    geometries.push(g);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // back cover, page block, spine
  add(group, new RoundedBoxGeometry(COVER_W, 0.06, COVER_L, 5, 0.028), m.edge, 0, 0.05, 0);
  const blockH = PAGE_TOP - 0.08;
  add(
    group,
    new THREE.BoxGeometry(COVER_W - 0.12, blockH, COVER_L - 0.1),
    [m.pageEdges, m.pageEdges, m.paper, m.pageEdges, m.pageEdges, m.pageEdges],
    0.03,
    0.08 + blockH / 2,
    0,
  );
  add(group, new RoundedBoxGeometry(0.1, BOOK_H - 0.04, COVER_L, 4, 0.045), m.edge, -COVER_W / 2 + 0.05, BOOK_H / 2 + 0.01, 0);

  // front cover, hinged on the spine edge, carrying the strap and clasp
  const coverPivot = new THREE.Group();
  coverPivot.position.set(-COVER_W / 2, BOOK_H - 0.03, 0);
  group.add(coverPivot);
  const cx = COVER_W / 2;
  add(
    coverPivot,
    new RoundedBoxGeometry(COVER_W, 0.06, COVER_L, 5, 0.028),
    [m.edge, m.edge, m.cover, m.lining, m.edge, m.edge],
    cx,
    0,
    0,
  );
  add(coverPivot, new RoundedBoxGeometry(0.66, 0.03, 0.36, 3, 0.012), m.strap, cx + 0.74, 0.042, -0.1);
  add(coverPivot, new RoundedBoxGeometry(0.03, BOOK_H, 0.36, 3, 0.012), m.strap, cx + COVER_W / 2 + 0.012, 0.04 - BOOK_H / 2, -0.1);
  add(coverPivot, new RoundedBoxGeometry(0.2, 0.045, 0.27, 4, 0.02), m.brass, cx + 0.5, 0.07, -0.1);
  add(coverPivot, new THREE.SphereGeometry(0.036, 20, 12), m.brass, cx + 0.5, 0.092, -0.1);

  // ribbon bookmark trailing out of the bottom edge
  const ribbon = add(group, new THREE.BoxGeometry(0.11, 0.006, 0.62), m.ribbon, -0.35, BOOK_H - 0.14, COVER_L / 2 + 0.24);
  ribbon.rotation.set(0.32, 0.14, 0);

  // the leaves that turn: strips hinged at the spine, bent by hand each frame they move
  const hinge = new THREE.Group();
  hinge.position.set(-COVER_W / 2 + 0.09, PAGE_TOP, 0);
  group.add(hinge);
  const leaves = Array.from({ length: LEAVES }, (_, k) => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array((SEG + 1) * 2 * 3);
    const uv = new Float32Array((SEG + 1) * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i <= SEG; i++) {
      uv.set([i / SEG, 1, i / SEG, 0], i * 4);
      if (i < SEG) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
      }
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    geometries.push(g);
    // Each leaf has its own copy of the paper so it can glow a little while it stands up:
    // the sun is behind it then, and thin paper lets some of that light through.
    const paper = (m.paper as THREE.MeshStandardMaterial).clone();
    paper.emissive = new THREE.Color("#a98a58");
    paper.emissiveIntensity = 0;
    materials.push(paper);
    const mesh = new THREE.Mesh(g, paper);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    hinge.add(mesh);
    return { g, k, t: -1, paper, line: new Float32Array((SEG + 1) * 2), settle: 0, corner: 0, stale: false };
  });

  const bendLeaf = (leaf: (typeof leaves)[number], t: number) => {
    if (leaf.t === t && !leaf.stale) return;
    leaf.t = t;
    leaf.stale = false;
    leaf.paper.emissiveIntensity = Math.sin(Math.PI * Math.min(1, t * 1.25)) * 0.55;
    const e = ease(t);
    // Waiting leaves are stacked with the first to turn on top. Turned leaves pile up on the
    // opened cover with the latest on top. The cover's inside sits higher than the hinge, so a
    // turned leaf climbs out of the gutter in its first short stretch and then lies along it.
    const rest = LEAF_REST - leaf.k * 0.003;
    const lift = (LEAVES - leaf.k) * 0.0016 * (1 - e) + (leaf.k + 1) * 0.0016 * e;
    const pos = leaf.g.attributes.position as THREE.BufferAttribute;
    let x = 0;
    let y = lift;
    const step = PAGE_W / SEG;
    for (let i = 0; i <= SEG; i++) {
      const along = i / SEG;
      // the free edge trails behind the spine edge, which is what gives a turning page its curl
      const angle =
        (i === 1 ? Math.PI - LEAF_STEP : rest) * e -
        Math.sin(Math.PI * t) * 1.15 * along * along +
        (t > 0.5 ? -leaf.settle : leaf.settle) * along * along;
      if (i > 0) {
        x += Math.cos(angle) * step;
        y += Math.sin(angle) * step;
      }
      leaf.line[i * 2] = x;
      leaf.line[i * 2 + 1] = y;
      pos.setXYZ(i * 2, x, y, -PAGE_L / 2);
      // the bottom outer corner can be picked up a little
      const c = Math.max(0, (along - 0.68) / 0.32);
      pos.setXYZ(i * 2 + 1, x - leaf.corner * c * c * 0.06, y + leaf.corner * c * c * 0.17, PAGE_L / 2);
    }
    pos.needsUpdate = true;
    leaf.g.computeVertexNormals();
  };
  leaves.forEach((leaf) => bendLeaf(leaf, 0));

  return {
    group,
    coverPivot,
    setOpen: (amount) => {
      coverPivot.rotation.z = OPEN_ANGLE * ease(Math.min(1, Math.max(0, amount)));
    },
    setTurns: (turned) => {
      for (const leaf of leaves) bendLeaf(leaf, Math.min(1, Math.max(0, turned - leaf.k)));
    },
    leafLine: (k) => leaves[k].line,
    setSettle: (k, amount) => {
      const leaf = leaves[k];
      if (!leaf || leaf.settle === amount) return;
      leaf.settle = amount;
      leaf.stale = true;
      bendLeaf(leaf, leaf.t);
    },
    setCorner: (k, amount) => {
      const leaf = leaves[k];
      if (!leaf || leaf.corner === amount) return;
      leaf.corner = amount;
      leaf.stale = true;
      bendLeaf(leaf, leaf.t);
    },
    dispose: () => [...geometries, ...materials].forEach((x) => x.dispose()),
  };
}

// The patch of lawn the opened cover lands on, in the book's own flat coordinates.
export const COVER_LANDING = { x: -COVER_W, z: 0, hw: COVER_W / 2, hl: COVER_L / 2 };
