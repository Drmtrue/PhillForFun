// 3D cartoon Phil who walks along the bottom of the screen and acts out reactions.
// Built from simple shapes with Three.js; all animation is procedural (no rig or model files).
// createPhil3D(root, { bubble, onClick, onContext }) → { react(kind), smoke(), shoot(court, make, force), glasses(on), busy, smoking }
// Reactions: "happy", "sad", "shock", "smug", "wave", "neutral".

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const COLORS = {
  skin: 0xf3c4a0, skinDark: 0xeeac86, hair: 0xc9a37a, brow: 0x9c7a55, shirt: 0x1f1f27,
  jeans: 0x34466b, shoe: 0xc8102e, sole: 0xf2f2f2, iris: 0x6f8ea6, mouth: 0x6b1f1a
};
const SPEED = 62;          // walking speed, px/s
const DPR = Math.min(window.devicePixelRatio || 1, 2);

// look (builder portals): { hair: { style, color }, skin, eyes, beard, mustache, glasses, build, top: { type, color }, pants, shoes, number }
// Without a look the avatar is Phil: buzz cut, stubble, black #23 jersey, jeans, red sneakers.
export function createPhil3D(root, { bubble, onClick, onContext, look = null } = {}) {
  const L = lookOf(look);
  const small = () => window.innerWidth < 700;
  let W = 0, H = 0;

  const canvas = document.createElement("canvas");
  canvas.className = "phil-canvas";
  const hit = document.createElement("button");
  hit.type = "button";
  hit.className = "phil-hit";
  hit.title = "Фил";
  root.append(canvas, hit);
  hit.addEventListener("click", () => onClick && onClick());
  hit.addEventListener("contextmenu", (e) => { e.preventDefault(); onContext && onContext(); });

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 180 / 230, 0.1, 50);
  camera.position.set(0, 1.75, 9);
  camera.lookAt(0, 1.75, 0);

  scene.add(new THREE.HemisphereLight(0xfff4e8, 0x4a2a2a, 1.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(2.5, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9a5a, 1.1);
  rim.position.set(-3, 2.5, -4);
  scene.add(rim);

  // ----- Materials and helpers
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o });
  const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });
  const M = {
    skin: std(L.skin, { roughness: 0.5 }),
    nose: std(shade(L.skin, -0.06), { roughness: 0.45 }),
    hair: std(L.hair, { roughness: 1, map: L.hairStyle === "buzz" ? speckle() : null }),
    brow: std(shade(L.hair, -0.18), { roughness: 0.9 }),
    shirt: std(L.top, { roughness: 0.75 }),
    jeans: std(L.pants, { roughness: 0.8 }),
    shoe: std(L.shoes, { roughness: 0.4 }),
    sole: std(COLORS.sole, { roughness: 0.6 }),
    white: std(0xffffff, { roughness: 0.25 }),
    iris: std(L.eyes, { roughness: 0.2 }),
    pupil: std(0x111418, { roughness: 0.2 }),
    mouth: basic(COLORS.mouth, { side: THREE.DoubleSide }),
    stubble: std(look ? shade(L.hair, -0.25) : 0x7a5a42, { roughness: 1, transparent: true, opacity: L.beard === "short" ? 0.55 : 0.3, depthWrite: false }),
    blush: basic(0xff8c8c, { transparent: true, opacity: 0.4, depthWrite: false })
  };
  function add(geo, mat, parent, pos = [0, 0, 0], scale = null, rot = null) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (scale) m.scale.set(...scale);
    if (rot) m.rotation.set(...rot);
    parent.add(m);
    return m;
  }
  const group = (parent, pos = [0, 0, 0]) => { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; };
  const sphere = (r, w = 32, h = 24) => new THREE.SphereGeometry(r, w, h);

  // ----- Body
  const phil = group(scene, [0, -0.06, 0]);
  const hips = group(phil, [0, 0.78, 0]);
  const torso = add(sphere(0.56), M.shirt, hips, [0, 0.36, 0], [L.width, 1.08, 0.86 * (L.width > 1 ? 1.08 : 1)]);
  add(sphere(0.45), M.jeans, hips, [0, -0.1, 0], [1.08 * L.width, 0.62, 0.86]);
  if (L.number) add(new THREE.PlaneGeometry(0.44, 0.3), basic(0xffffff, { map: numberTexture(L.number, L.numberColor), transparent: true }), hips, [0, 0.4, 0.488], null, [-0.08, 0, 0]);
  if (L.topType === "hoodie") {
    add(new THREE.TorusGeometry(0.34, 0.11, 10, 24, Math.PI * 1.3), M.shirt, hips, [0, 0.9, -0.14], [1, 1, 0.8], [0.4, 0, Math.PI * 0.85]);
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), std(0xeeeeee), hips, [s * 0.1, 0.62, 0.47]);
  }
  if (L.topType === "shirt") add(new THREE.ConeGeometry(0.17, 0.18, 3), std(0xf2f2f2), hips, [0, 0.82, 0.38], [1.4, 1, 0.4], [Math.PI, 0, 0]);

  // Head
  const head = group(hips, [0, 1.2, 0]);
  add(sphere(0.62, 48, 32), M.skin, head, [0, 0, 0], [1, 1.02, 0.96]);
  buildHair(L.hairStyle);
  if (L.beard === "stubble" || L.beard === "short") add(new THREE.SphereGeometry(0.627, 40, 16, 0.35, Math.PI - 0.7, 1.72, 1.05), M.stubble, head, [0, 0, 0], [1, 1.02, 0.965]);
  if (L.beard === "full") {
    add(new THREE.SphereGeometry(0.645, 40, 16, 0.3, Math.PI - 0.6, 1.85, 1.0), M.hair, head, [0, 0, 0.01], [1, 1.02, 0.98]);
    add(sphere(0.2, 16, 12), M.hair, head, [0, -0.52, 0.42], [1.2, 1, 0.8]);
  }
  if (L.mustache) add(new THREE.CapsuleGeometry(0.035, 0.2, 4, 8), M.hair, head, [0, -0.22, 0.585], null, [0, 0, Math.PI / 2]);

  // Hair styles are built from a few spheres and capsules around the head
  function buildHair(style) {
    if (style === "bald") return;
    if (style === "buzz") {
      add(new THREE.SphereGeometry(0.64, 48, 24, 0, Math.PI * 2, 0, 1.18), M.hair, head, [0, 0.01, -0.01], [1, 1.02, 0.97], [-0.32, 0, 0]);
      return;
    }
    // A thicker cap for every other style
    add(new THREE.SphereGeometry(0.67, 48, 24, 0, Math.PI * 2, 0, style === "curly" ? 1.25 : 1.3), M.hair, head, [0, 0.03, -0.02], [1.02, 1.04, 1], [-0.38, 0, 0]);
    if (style === "short") add(new THREE.CapsuleGeometry(0.1, 0.35, 4, 8), M.hair, head, [0.18, 0.52, 0.42], null, [0.3, 0, 1.25]); // a fringe
    if (style === "medium" || style === "long" || style === "ponytail") {
      for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.13, style === "long" ? 0.75 : 0.3, 6, 10), M.hair, head, [s * 0.56, style === "long" ? -0.3 : 0.02, -0.12], null, [0, 0, s * 0.12]);
      add(sphere(0.6, 32, 20), M.hair, head, [0, style === "long" ? -0.2 : 0.05, -0.2], [1.05, style === "long" ? 1.25 : 0.95, 0.85]);
    }
    if (style === "ponytail") add(new THREE.CapsuleGeometry(0.11, 0.55, 6, 10), M.hair, head, [0, -0.15, -0.68], null, [0.5, 0, 0]);
    if (style === "curly") {
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 * 3, r = 0.25 + (i % 5) * 0.08;
        add(sphere(0.17, 14, 10), M.hair, head, [Math.cos(a) * r * 1.4, 0.45 + (i % 3) * 0.08 - r * 0.25, Math.sin(a) * r - 0.1]);
      }
    }
  }
  for (const s of [-1, 1]) {
    add(sphere(0.15, 16, 12), M.skin, head, [s * 0.61, 0, 0], [0.55, 1, 0.8]);
    add(sphere(0.09, 16, 12), M.blush, head, [s * 0.36, -0.13, 0.475], [1, 0.55, 0.3]);
  }
  add(sphere(0.12, 20, 16), M.nose, head, [0, -0.07, 0.6], [1, 0.9, 0.9]);

  const eyes = [], brows = [];
  for (const s of [-1, 1]) {
    const eye = group(head, [s * 0.22, 0.1, 0.5]);
    eye.rotation.y = s * 0.18;
    add(sphere(0.155, 24, 16), M.white, eye, [0, 0, 0], [1, 1.15, 0.7]);
    add(sphere(0.09, 20, 14), M.iris, eye, [0, -0.01, 0.085], [1, 1.1, 0.4]);
    add(sphere(0.048, 16, 12), M.pupil, eye, [0, -0.01, 0.112], [1, 1.1, 0.3]);
    add(sphere(0.024, 10, 8), basic(0xffffff), eye, [-0.035, 0.04, 0.128]);
    eyes.push(eye);
    const brow = group(head, [s * 0.22, 0.34, 0.5]);
    add(new THREE.CapsuleGeometry(0.034, 0.17, 4, 8), M.brow, brow, [0, 0, 0], null, [0, 0, Math.PI / 2]);
    brow.userData.side = s;
    brows.push(brow);
  }

  // Mouths for each expression
  const mouth = group(head, [0, -0.3, 0.535]);
  mouth.rotation.x = -0.22;
  const arc = new THREE.TorusGeometry(0.1, 0.02, 8, 20, Math.PI);
  const mouths = {
    neutral: add(arc, M.mouth, mouth, [0, 0.02, 0], [1, 0.45, 1], [0, 0, Math.PI]),
    sad: add(arc, M.mouth, mouth, [0, -0.03, 0], [1, 0.55, 1]),
    smug: add(arc, M.mouth, mouth, [0.05, 0.02, 0], [0.8, 0.5, 1], [0, 0, Math.PI + 0.35]),
    shock: add(new THREE.CircleGeometry(0.07, 20), M.mouth, mouth, [0, -0.02, 0], [1, 1.3, 1]),
    happy: group(mouth)
  };
  add(new THREE.CircleGeometry(0.16, 24, Math.PI, Math.PI), M.mouth, mouths.happy, [0, 0.03, 0]);
  add(new THREE.PlaneGeometry(0.22, 0.045), basic(0xffffff), mouths.happy, [0, 0.005, 0.004]);
  const setMouth = (k) => { for (const [name, m] of Object.entries(mouths)) m.visible = name === k; };

  // Arms: index 0 = character's right (screen left), 1 = character's left (screen right)
  const arms = [], hands = [];
  for (const s of [-1, 1]) {
    const shoulder = group(hips, [s * 0.55, 0.66, 0]);
    add(sphere(0.17, 20, 16), M.shirt, shoulder, [0, -0.04, 0]);
    add(new THREE.CapsuleGeometry(0.1, 0.38, 6, 12), M.skin, shoulder, [0, -0.3, 0]);
    const hand = group(shoulder, [0, -0.6, 0]);
    add(sphere(0.13, 20, 16), M.skin, hand);
    arms.push(shoulder);
    hands.push(hand);
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = group(hips, [s * 0.22, 0.05, 0]);
    add(new THREE.CapsuleGeometry(0.13, 0.32, 6, 12), M.jeans, hip, [0, -0.32, 0]);
    add(sphere(0.17, 20, 16), M.shoe, hip, [0, -0.66, 0.08], [1, 0.62, 1.55]);
    add(sphere(0.17, 20, 12), M.sole, hip, [0, -0.72, 0.08], [1.04, 0.3, 1.6]);
    legs.push(hip);
  }

  // Cigarette in the mouth corner and a lighter in the left hand
  const cig = group(head, [0.11, -0.31, 0.55]);
  cig.rotation.set(0, -0.5, -1.75);
  add(new THREE.CylinderGeometry(0.024, 0.024, 0.24, 10), std(0xf4f0e6, { roughness: 0.7 }), cig, [0, 0.2, 0]);
  add(new THREE.CylinderGeometry(0.025, 0.025, 0.09, 10), std(0xd98c3a), cig, [0, 0.045, 0]);
  const ember = add(sphere(0.03, 10, 8), basic(0x55443a), cig, [0, 0.325, 0]);
  cig.scale.setScalar(0.001);
  cig.visible = false;

  // Positioned for the raised-arm pose: in front of the hand and upright (the arm is rotated about -1.35 rad)
  const lighter = group(hands[1], [0, -0.1, 0.12]);
  lighter.rotation.x = 1.35;
  add(new THREE.BoxGeometry(0.1, 0.18, 0.07), std(0xd33b2c, { roughness: 0.35 }), lighter);
  add(new THREE.BoxGeometry(0.1, 0.04, 0.07), std(0xb8b8c0, { metalness: 0.6, roughness: 0.3 }), lighter, [0, 0.11, 0]);
  const flame = add(new THREE.ConeGeometry(0.04, 0.13, 10), basic(0xffb02e, { transparent: true, opacity: 0.95 }), lighter, [0, 0.2, 0]);
  lighter.visible = false;
  flame.visible = false;

  // Smoke puffs
  const puffs = [];
  for (let i = 0; i < 16; i++) {
    const p = add(sphere(0.08, 12, 10), basic(0xdedad2, { transparent: true, opacity: 0, depthWrite: false }), scene);
    p.visible = false;
    p.userData = { life: 0, max: 1 };
    puffs.push(p);
  }
  const tmp = new THREE.Vector3();
  function puff(from, strength = 1) {
    const p = puffs.find((x) => !x.visible);
    if (!p) return;
    p.position.copy(from);
    p.scale.setScalar(0.6 * strength);
    p.visible = true;
    p.userData = { life: 0, max: 2 + Math.random() * 0.8, vx: 0.08 + Math.random() * 0.12, vy: 0.32 + Math.random() * 0.15, s: strength };
  }

  // Basketball he carries and shoots (the side-court ball while he holds it)
  const ball = add(sphere(0.31, 32, 24), std(0xffffff, { roughness: 0.6, map: ballTexture() }), hips, [0, 0.4, 0.62]);
  ball.visible = false;

  // Sunglasses that drop onto his face after a lucky basket
  const shades = group(head, [0, 0.12, 0.6]);
  const lensMat = std(0x0b0b10, { roughness: 0.12, metalness: 0.4 });
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.17, 0.15, 0.05, 28), lensMat, shades, [s * 0.22, 0, 0.05], [1.2, 1, 0.85], [Math.PI / 2, 0, 0]);
    add(new THREE.PlaneGeometry(0.05, 0.16), basic(0xffffff, { transparent: true, opacity: 0.35 }), shades, [s * 0.22 - 0.06, 0.02, 0.08], null, [0, 0, -0.6]);
    add(new THREE.BoxGeometry(0.035, 0.035, 0.6), lensMat, shades, [s * 0.6, 0.02, -0.28]);
  }
  add(new THREE.BoxGeometry(0.16, 0.035, 0.035), lensMat, shades, [0, 0.05, 0.06]);
  shades.visible = false;
  // Everyday glasses: thin round frames with clear lenses
  if (L.glasses === "regular") {
    const frame = std(0x1b1b1f, { roughness: 0.3, metalness: 0.4 });
    for (const s of [-1, 1]) {
      add(new THREE.TorusGeometry(0.16, 0.022, 8, 28), frame, head, [s * 0.22, 0.1, 0.63]);
      add(new THREE.CircleGeometry(0.15, 24), std(0xdff1ff, { transparent: true, opacity: 0.18, roughness: 0.05 }), head, [s * 0.22, 0.1, 0.632]);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.55), frame, head, [s * 0.4, 0.12, 0.38]);
    }
    add(new THREE.BoxGeometry(0.14, 0.025, 0.025), frame, head, [0, 0.13, 0.64]);
  }

  // ----- Scene props (hidden until a talent animation needs them)
  const props = new THREE.Group();
  scene.add(props);
  const prop = (g) => { g.visible = false; props.add(g); return g; };

  // Bath tub with water and steam
  const bath = prop(new THREE.Group());
  const tubMat = std(0xf2f2f4, { roughness: 0.3 });
  add(new THREE.CylinderGeometry(1.25, 1.0, 0.9, 32, 1, true), tubMat, bath, [0, 0.45, 0], [1, 1, 0.6]);
  add(new THREE.TorusGeometry(1.25, 0.08, 10, 40), tubMat, bath, [0, 0.9, 0], [1, 0.6, 1], [Math.PI / 2, 0, 0]);
  add(new THREE.CylinderGeometry(1.0, 1.0, 0.06, 32), tubMat, bath, [0, 0.03, 0], [1, 1, 0.6]);
  const water = add(new THREE.CylinderGeometry(1.18, 1.18, 0.04, 32), std(0x4fa0e0, { roughness: 0.1, transparent: true, opacity: 0.85 }), bath, [0, 0.8, 0], [1, 1, 0.6]);
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.07, 0.05, 0.3, 8), std(0xb9b9c2), bath, [s * 0.9, -0.1, 0.35]);
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.07, 0.05, 0.3, 8), std(0xb9b9c2), bath, [s * 0.9, -0.1, -0.35]);
  const duck = add(sphere(0.16, 16, 12), std(0xffd23f, { roughness: 0.5 }), bath, [0.6, 0.9, 0.2]);
  add(sphere(0.1, 12, 10), std(0xffd23f), duck, [0.08, 0.13, 0]);
  add(new THREE.ConeGeometry(0.04, 0.09, 8), std(0xff7a1a), duck, [0.19, 0.12, 0], null, [0, 0, -Math.PI / 2]);
  duck.visible = false;

  // Desk with a PC and a glowing monitor
  const desk = prop(new THREE.Group());
  // Low desk in front of him; the monitor stands to his right so his face stays in view
  add(new THREE.BoxGeometry(1.9, 0.07, 0.7), std(0x5a3b26, { roughness: 0.8 }), desk, [0.2, 0.72, 0]);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.07, 0.72, 0.07), std(0x3b2619), desk, [0.2 + s * 0.85, 0.36, 0.2]);
  add(new THREE.BoxGeometry(0.8, 0.52, 0.05), std(0x151518, { roughness: 0.3 }), desk, [0.75, 1.08, -0.05], null, [0, -0.5, 0]);
  const screen = add(new THREE.PlaneGeometry(0.72, 0.44), basic(0x2a6fb3), desk, [0.737, 1.08, -0.02], null, [0, -0.5, 0]);
  add(new THREE.BoxGeometry(0.08, 0.1, 0.08), std(0x151518), desk, [0.75, 0.78, -0.05]);
  add(new THREE.BoxGeometry(0.6, 0.035, 0.22), std(0x222228, { roughness: 0.5 }), desk, [0.1, 0.77, 0.15]);
  const keyboard = desk.children[desk.children.length - 1];
  add(new THREE.BoxGeometry(0.3, 0.7, 0.7), std(0x111114, { roughness: 0.4 }), desk, [1.3, 0.35, 0.1]);
  const pcLight = add(new THREE.PlaneGeometry(0.16, 0.55), basic(0xff2a55), desk, [1.145, 0.35, 0.1], null, [0, -Math.PI / 2, 0]);

  // Divine Orb (a glowing golden sphere) and the Mirror
  const orb = prop(new THREE.Group());
  add(sphere(0.22, 24, 18), std(0xffd36b, { emissive: 0xffa020, emissiveIntensity: 0.9, roughness: 0.2 }), orb);
  add(new THREE.TorusGeometry(0.3, 0.025, 8, 30), std(0xfff1b0, { emissive: 0xffc040, emissiveIntensity: 0.7 }), orb, [0, 0, 0], null, [Math.PI / 2.4, 0, 0]);
  const mirror = prop(new THREE.Group());
  add(new THREE.CylinderGeometry(0.38, 0.38, 0.05, 32), std(0xd0d8e8, { metalness: 0.9, roughness: 0.1 }), mirror, [0, 0, 0], null, [Math.PI / 2, 0, 0]);
  add(new THREE.TorusGeometry(0.38, 0.05, 10, 40), std(0xf0c45c, { metalness: 0.8, roughness: 0.25 }), mirror);

  // Scheme board ("где я в этой схеме")
  const board = prop(new THREE.Group());
  add(new THREE.PlaneGeometry(0.9, 0.65), basic(0xffffff, { map: schemeTexture() }), board);
  // Adjika jar with a spoon
  const jar = prop(new THREE.Group());
  add(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 16), std(0xc8102e, { roughness: 0.4 }), jar);
  add(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 16), std(0xc9a37a), jar, [0, 0.17, 0]);
  const spoon = prop(new THREE.Group());
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), std(0xcfd3da, { metalness: 0.8, roughness: 0.3 }), spoon, [0, 0.15, 0]);
  add(sphere(0.06, 12, 8), std(0xcfd3da, { metalness: 0.8, roughness: 0.3 }), spoon, [0, 0.32, 0], [1, 0.5, 1.3]);
  // Pillow for the nap
  const pillow = prop(add(new THREE.BoxGeometry(0.8, 0.22, 0.5), std(0xf4e9d8, { roughness: 0.9 }), new THREE.Group()).parent);
  // Portable hoop for dunks
  const hoopProp = prop(new THREE.Group());
  add(new THREE.BoxGeometry(0.1, 2.3, 0.1), std(0x9a9a9a), hoopProp, [0, 1.15, -0.5]);
  const backboard = add(new THREE.BoxGeometry(1.3, 0.8, 0.05), std(0xe8f4ff, { roughness: 0.05, transparent: true, opacity: 0.55 }), hoopProp, [0, 2.6, -0.45]);
  add(new THREE.TorusGeometry(0.33, 0.035, 10, 32), std(0xff6a1f, { roughness: 0.4 }), hoopProp, [0, 2.3, -0.1], null, [Math.PI / 2, 0, 0]);
  const glass = [];
  for (let i = 0; i < 26; i++) {
    const sh = add(new THREE.PlaneGeometry(0.12 + Math.random() * 0.14, 0.1 + Math.random() * 0.14), std(0xe8f4ff, { roughness: 0.05, transparent: true, opacity: 0.8, side: THREE.DoubleSide }), hoopProp);
    sh.visible = false;
    glass.push(sh);
  }
  const dribbleBall = prop(add(sphere(0.31, 32, 24), std(0xffffff, { roughness: 0.6, map: ballTexture() }), new THREE.Group()).parent);

  // ----- State
  const st = {
    x: 0, target: 0, pause: 1.5, dir: 1, phase: 0, facing: 0, t: 0,
    react: null, reactT: 0, smokeT: -1, nextPuff: 0, blinkAt: 2, blinkT: -1,
    look: 0, mouseX: null, task: null, shades: 0, shadesOn: false,
    scene: null, sceneT: 0              // talent animation in progress
  };
  const J = { // smoothed joint values
    armRX: [0, 0], armRZ: [-0.15, 0.15], legX: [0, 0], headX: 0, headY: 0, headZ: 0,
    hipsY: 0.78, jump: 0, eye: 1, back: 0, lean: 0
  };

  let stage = false;        // bigger canvas while a talent animation plays
  function layout() {
    const k = small() ? 0.72 : 1;
    W = Math.round((stage ? 430 : 180) * k);
    H = Math.round((stage ? 330 : 230) * k);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    root.style.width = W + "px";
    root.style.height = H + "px";
    renderer.setSize(W, H, false);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    const [a, b] = range();
    st.x = Math.min(Math.max(st.x || b, a), b);
    st.target = st.x;
    // The hit area and the bubble anchor follow the character, not the canvas
    hit.style.left = stage ? `${(W - 180 * k) / 2 / W * 100 + 28 * 180 * k / W}%` : "28%";
    hit.style.width = stage ? `${44 * 180 * k / W}%` : "44%";
  }
  // Where he may walk: the whole width on desktop, a short stretch by the right edge on phones
  function range() {
    const vw = window.innerWidth;
    return small() ? [vw - W - 70, vw - W + 18] : [-20, vw - W + 20];
  }
  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.addEventListener("resize", layout);
  document.addEventListener("pointermove", (e) => { st.mouseX = e.clientX; }, { passive: true });
  layout();

  const REACT_LEN = { happy: 1.2, sad: 2.2, shock: 1.2, smug: 1.8, wave: 1.6, angry: 2.2, neutral: 0.1 };
  function react(kind) {
    if (st.task) return; // busy with the ball
    st.react = REACT_LEN[kind] ? kind : "neutral";
    st.reactT = 0;
    st.facing = 0;
  }
  function smoke() {
    if (st.smokeT >= 0 || st.task) return;
    st.smokeT = 0;
    st.nextPuff = 2.6;
  }

  // Walk to the side-court ball, carry it to a spot facing the hoop, and take a jump shot.
  // The court decides where it lands; make = true aims for the rim center.
  // force = true drops whatever he is doing (a reaction, a smoke break, the shades) and goes right away
  function shoot(court, make, force = false) {
    if (st.task || !court.ballAvailable()) return false;
    if (force) {
      st.react = null;
      st.smokeT = -1;
      cig.visible = lighter.visible = flame.visible = false;
      st.shadesOn = false;
    }
    if (st.react || st.smokeT >= 0) return false;
    st.task = { court, make, phase: "toBall", t: 0, targetX: court.ballPos().x - W / 2 };
    return true;
  }
  const clampX = (x) => { const [a, b] = range(); return Math.min(b, Math.max(a, x)); };

  // Talent animations ("scenes"). Each runs for SCENES[name].len seconds, blocks wandering and reactions,
  // and may show props. play() returns false when Phil is busy.
  const SCENES = {
    dribble: { len: 5 }, spin: { len: 5 }, dunk: { len: 5.2 }, glassdunk: { len: 6.5 },
    loot: { len: 3 }, divine: { len: 4.5 }, dota: { len: 9 }, rage: { len: 4 }, mirror: { len: 6 },
    stretch: { len: 3.2 }, bath: { len: 11 }, bathduck: { len: 11 }, rings: { len: 7 }, nap: { len: 8 }, levitate: { len: 9 },
    think: { len: 3 }, facepalm: { len: 2.6 }, scheme: { len: 6 }, adjika: { len: 7 }
  };
  function play(name) {
    if (!SCENES[name] || st.scene || st.task || st.smokeT >= 0) return false;
    st.scene = name;
    stage = true;
    const before = W;
    layout();
    st.x -= (W - before) / 2;   // grow around the character so he does not jump sideways
    st.target = st.x;
    st.sceneT = 0;
    st.react = null;
    st.shadesOn = false;
    for (const g of glass) g.visible = false;
    backboard.visible = true;
    backboard.material.opacity = 0.55;
    return true;
  }
  function endScene() {
    st.scene = null;
    stage = false;
    const before = W;
    layout();
    st.x += (before - W) / 2;
    st.target = Math.min(Math.max(st.x, range()[0]), range()[1]);
    st.x = st.target;
    for (const p of props.children) p.visible = false;
    duck.visible = false;
    cig.visible = false;
    dribbleBall.visible = false;
  }
  // Props sit on the floor in front of / beside Phil in scene space (phil is at x=0)
  const FLOOR_Y = -0.06;

  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

  // ----- Frame
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    st.t += dt;
    const t = st.t;

    // Reaction timer
    if (st.react) { st.reactT += dt; if (st.reactT > REACT_LEN[st.react]) st.react = null; }
    if (st.scene) { st.sceneT += dt; if (st.sceneT > SCENES[st.scene].len) endScene(); }
    const smoking = st.smokeT >= 0;
    if (smoking) st.smokeT += dt;
    const lighting = smoking && st.smokeT < 2.6;

    // Shot task: walking phases override wandering
    const task = st.task;
    if (task) {
      task.t += dt;
      if (task.phase === "toBall" && !task.court.ballAvailable()) { st.task = null; }      // someone else took it
    }
    const goal = task && (task.phase === "toBall" || task.phase === "carry") ? task.targetX : null;

    // Wandering
    let walking = false;
    if (goal != null) {
      const dx = goal - st.x;
      if (Math.abs(dx) < 3) {
        task.phase = task.phase === "toBall" ? "pickup" : "aim";
        task.t = 0;
      } else {
        walking = true;
        st.dir = Math.sign(dx);
        st.x += st.dir * Math.min(Math.abs(dx), SPEED * 1.5 * dt);
      }
      st.target = st.x;
    } else if (!reduced && !st.react && !smoking && !st.task && !st.scene) { // a smoke break is a break: he stands still
      const dx = st.target - st.x;
      if (Math.abs(dx) < 2) {
        st.pause -= dt;
        if (st.pause <= 0) {
          const [a, b] = range();
          st.target = a + Math.random() * (b - a);
          st.pause = 2 + Math.random() * 5;
        }
      } else {
        walking = true;
        st.dir = Math.sign(dx);
        st.x += st.dir * Math.min(Math.abs(dx), SPEED * (small() ? 0.6 : 1) * dt);
      }
    }
    root.style.transform = `translateX(${st.x.toFixed(1)}px)`;

    // Target pose
    const T = { armRX: [0, 0], armRZ: [-0.15, 0.15], legX: [0, 0], headX: 0, headY: 0, headZ: 0, hipsY: 0.78, jump: 0, eye: 1, back: 0, lean: 0 };
    let face = walking ? st.dir * 0.95 : 0;
    let mood = smoking ? "smug" : "neutral";
    const breathe = Math.sin(t * 2.2);
    torso.scale.y = 1.08 + breathe * 0.012;
    T.armRZ[0] -= breathe * 0.03;
    T.armRZ[1] += breathe * 0.03;

    if (walking) {
      st.phase += dt * 8.5;
      const s = Math.sin(st.phase);
      T.legX = [s * 0.6, -s * 0.6];
      T.armRX = [-s * 0.5, s * 0.5];
      T.hipsY += Math.abs(Math.cos(st.phase)) * 0.05;
      T.lean = 0.06;
    } else if (st.mouseX != null) {
      // Idle: glance toward the cursor
      const cx = st.x + W / 2;
      T.headY = Math.max(-0.45, Math.min(0.45, (st.mouseX - cx) / 900));
    }

    const r = st.reactT;
    switch (st.react) {
      case "happy":
        mood = "happy";
        T.jump = Math.max(0, Math.sin((r / 0.55) * Math.PI)) * 0.45 * (r < 1.1 ? 1 : 0);
        T.armRZ = [-2.5 - Math.sin(r * 14) * 0.2, 2.5 + Math.sin(r * 14) * 0.2];
        T.legX = [T.jump * 0.6, -T.jump * 0.3];
        break;
      case "sad":
        mood = "sad";
        T.headX = 0.38;
        T.hipsY -= 0.05;
        T.armRZ = [-0.04, 0.04];
        T.armRX = [0.15, 0.15];
        T.headZ = Math.sin(r * 2) * 0.06;
        break;
      case "shock":
        mood = "shock";
        T.jump = r < 0.35 ? Math.sin((r / 0.35) * Math.PI) * 0.28 : 0;
        T.back = -0.12;
        T.armRZ = [-1.3, 1.3];
        T.armRX = [-0.4, -0.4];
        T.eye = 1.35;
        break;
      case "smug":
        mood = "smug";
        T.armRZ = [-2.35, 0.55];          // hand behind the head, other hand on the hip
        T.armRX = [-0.35, 0.3];
        T.headZ = 0.14;
        T.back = 0.05;
        break;
      case "angry":
        mood = "angry";
        T.armRZ = [-0.55 + Math.sin(r * 22) * 0.18, 0.55 - Math.sin(r * 22) * 0.18]; // shaking fists
        T.armRX = [-0.5, -0.5];
        T.headY = Math.sin(r * 9) * 0.35;                                           // head shake
        T.legX = r < 0.9 ? [Math.max(0, Math.sin(r * 14)) * -0.45, 0] : [0, 0];   // stomping
        T.back = 0.05;
        break;
      case "wave":
        mood = "happy";
        T.armRZ = [-2.75 + Math.sin(r * 12) * 0.35, 0.18];
        T.headZ = -0.08;
        break;
    }

    let hideBody = false, phX = 0, phZ = 0, phRotX = 0, phRotZ = 0;
    if (st.scene) {
      const u = st.sceneT, L = SCENES[st.scene].len;
      const bounce = (p) => Math.max(0, Math.sin(p * Math.PI));
      face = 0;
      switch (st.scene) {
        case "dribble": {
          dribbleBall.visible = true;
          const ph = (u * 3.2) % 1;
          dribbleBall.position.set(0.55, FLOOR_Y + 0.31 + Math.abs(Math.sin(ph * Math.PI)) * 0.9, 0.55);
          dribbleBall.rotation.z -= dt * 6;
          T.armRX[1] = -0.9 + Math.sin(ph * Math.PI * 2) * 0.35;
          T.armRZ[1] = -0.35;
          T.lean = 0.12;
          T.headX = 0.25;
          mood = "smug";
          if (ph < 0.05 && !st.lastBounceAt) st.lastBounceAt = 1;
          if (ph > 0.5) st.lastBounceAt = 0;
          break;
        }
        case "spin": {
          dribbleBall.visible = true;
          const up = ease(u / 0.6);
          dribbleBall.position.set(0.55 * (1 - up), FLOOR_Y + 0.31 + up * 2.75, 0.5 + up * 0.1);
          dribbleBall.rotation.y += dt * 11;
          dribbleBall.rotation.x = 0.3;
          T.armRX[1] = -2.6 * up;
          T.armRZ[1] = 0.05;
          T.headX = -0.3 * up;
          T.headY = 0.3;
          mood = "smug";
          break;
        }
        case "dunk":
        case "glassdunk": {
          hoopProp.visible = true;
          hoopProp.position.set(1.55, FLOOR_Y, -0.1);
          dribbleBall.visible = u < 3.1;
          const glassMode = st.scene === "glassdunk";
          // 0-1.2 crouch and dribble, 1.2-2.4 run, 2.4-3.2 jump + slam, then land
          if (u < 1.2) {
            const ph = (u * 2.5) % 1;
            dribbleBall.position.set(0.5, FLOOR_Y + 0.31 + Math.abs(Math.sin(ph * Math.PI)) * 0.7, 0.5);
            T.armRX[1] = -0.8; T.armRZ[1] = -0.35; T.hipsY -= 0.08; T.lean = 0.2;
            mood = "smug";
          } else if (u < 2.4) {
            const k = (u - 1.2) / 1.2;
            phX = k * 0.95;
            st.phase += dt * 12;
            const sgn = Math.sin(st.phase);
            T.legX = [sgn * 0.8, -sgn * 0.8];
            T.armRX = [-1.3, -1.3]; T.armRZ = [0.4, -0.4];
            dribbleBall.position.set(phX + 0.05, FLOOR_Y + 1.25, 0.6);
            T.lean = 0.2;
            face = 0.9;
            mood = "shock";
          } else if (u < 3.2) {
            const k = (u - 2.4) / 0.8;
            phX = 0.95 + k * 0.4;
            T.jump = bounce(k * 0.9 + 0.05) * (glassMode ? 1.5 : 1.3);
            T.armRX = [-2.9, -2.9]; T.armRZ = [0.25, -0.25];
            T.legX = [0.5, -0.4];
            T.headX = -0.3;
            dribbleBall.position.set(phX + 0.15, FLOOR_Y + T.jump + 2.45, 0.1);
            face = 0.9;
            mood = "shock";
            if (k > 0.75 && !st.slammed) {
              st.slammed = true;
              if (glassMode) {
                backboard.visible = false;
                glass.forEach((g, i) => {
                  g.visible = true;
                  g.position.set((Math.random() - 0.5) * 1.1, 2.6 + (Math.random() - 0.5) * 0.7, -0.45);
                  g.userData.v = { x: (Math.random() - 0.5) * 2.5, y: Math.random() * 2, z: 1 + Math.random() * 2, r: (Math.random() - 0.5) * 12 };
                });
              }
            }
          } else {
            const k = u - 3.2;
            phX = 1.35;
            T.jump = Math.max(0, 0.9 - k * 2.2);
            T.armRZ = [-2.4, 2.4]; T.armRX = [0, 0];
            mood = "happy";
            st.slammed = false;
            if (glassMode) for (const g of glass) if (g.visible) {
              const v = g.userData.v;
              g.position.x += v.x * dt; g.position.y += v.y * dt; g.position.z += v.z * dt;
              v.y -= 9 * dt;
              g.rotation.x += v.r * dt; g.rotation.y += v.r * 0.7 * dt;
              if (g.position.y < FLOOR_Y + 0.05) { g.position.y = FLOOR_Y + 0.05; v.y = 0; v.x *= 0.9; v.z *= 0.9; }
            }
          }
          if (u > 3.1) dribbleBall.visible = false;
          break;
        }
        case "loot": {
          T.jump = bounce((u * 1.6) % 1) * 0.3;
          T.armRZ = [-2.3, 2.3];
          mood = "happy";
          break;
        }
        case "divine":
        case "mirror": {
          const it = st.scene === "divine" ? orb : mirror;
          it.visible = true;
          const drop = ease(u / 1.2);
          it.position.set(0.1, FLOOR_Y + 4.5 - drop * 1.9, 0.9);
          it.rotation.y += dt * 2;
          it.rotation.x = st.scene === "mirror" ? 0.3 : 0;
          if (u < 1.4) { T.headX = -0.5; mood = "shock"; T.eye = 1.3; }
          else { T.armRX = [-2.2, -2.2]; T.armRZ = [0.5, -0.5]; it.position.y = FLOOR_Y + 2.5 + Math.sin(t * 3) * 0.05; mood = st.scene === "mirror" ? "shock" : "happy"; T.jump = st.scene === "mirror" ? bounce(((u - 1.4) * 1.3) % 1) * 0.35 : 0; }
          break;
        }
        case "dota":
        case "rage": {
          desk.visible = true;
          desk.position.set(-0.1, FLOOR_Y, 1.0);
          face = 0.25;
          screen.material.color.setHex(Math.floor(t * 4) % 3 === 0 ? 0x2a6fb3 : 0x3b8fe8);
          pcLight.material.color.setHSL((t * 0.25) % 1, 1, 0.55);
          T.hipsY -= 0.3;                          // sitting
          T.legX = [-1.3, -1.3];
          T.lean = 0.12;
          T.headX = 0.08;
          T.headY = -0.35;                         // looking at the monitor on his right
          const typing = st.scene === "dota" || u < 1.5;
          T.armRX = typing ? [-0.75 + Math.sin(u * 16) * 0.12, -0.75 + Math.cos(u * 15) * 0.12] : [-2.2, -2.2];
          T.armRZ = typing ? [0.3, -0.3] : [0.6, -0.6];
          keyboard.position.set(0.1, 0.77, 0.15);
          keyboard.rotation.z = 0;
          mood = st.scene === "dota" ? (u > 6 ? "angry" : "neutral") : "angry";
          if (st.scene === "dota" && u > 6) T.headY = Math.sin(u * 7) * 0.3;
          if (st.scene === "rage" && u > 1.5) {
            // keyboard flies off the desk
            const k = u - 1.5;
            keyboard.position.set(0.1 + k * 2.2, Math.max(0.03, 0.77 + k * 2.4 - 4.9 * k * k), 0.15 + k * 0.6);
            keyboard.rotation.z = -k * 7;
            T.jump = k < 0.3 ? bounce(k / 0.3) * 0.2 : 0;
            T.hipsY += 0.3 * ease(k / 0.3);
            T.legX = [0, 0];
          }
          break;
        }
        case "stretch": {
          const k = ease(u / 1.2) * (1 - ease((u - 2.2) / 0.9));
          T.armRZ = [-2.9 * k - 0.15, 2.9 * k + 0.15];
          T.back = -0.18 * k;
          T.headX = -0.35 * k;
          T.hipsY += 0.06 * k;
          T.eye = 1 - 0.7 * k;
          mood = "happy";
          break;
        }
        case "bath":
        case "bathduck": {
          bath.visible = true;
          const slide = ease(u / 1.1);
          bath.position.set(3.2 - slide * 3.2, FLOOR_Y, 0.5);
          duck.visible = st.scene === "bathduck" && u > 1.5;
          duck.position.set(0.6, 0.9 + Math.sin(t * 2.5) * 0.04, 0.2);
          duck.rotation.z = Math.sin(t * 2) * 0.15;
          if (u > 1.1) {
            const sit = ease((u - 1.1) / 0.8);
            T.hipsY -= 0.55 * sit;                 // sinks into the tub: legs hidden by the water
            T.legX = [-1.5 * sit, -1.5 * sit];
            T.armRZ = [-1.2 * sit - 0.15, 1.2 * sit + 0.15];
            T.armRX = [0.3 * sit, 0.3 * sit];
            T.back = -0.25 * sit;
            T.headX = -0.15 * sit;
            T.eye = 1 - 0.5 * sit;
            mood = "happy";
            if (u > 2.5 && Math.random() < dt * 3) { puff(new THREE.Vector3((Math.random() - 0.5) * 1.6, FLOOR_Y + 1.0, 0.5 + (Math.random() - 0.5) * 0.6), 1.4); }
            if (u > L - 1.2) { const out = ease((u - (L - 1.2)) / 1.0); T.hipsY += 0.55 * out; T.legX = [-1.5 * (1 - out), -1.5 * (1 - out)]; }
          }
          break;
        }
        case "rings": {
          cig.visible = true;
          cig.scale.setScalar(1);
          ember.material.color.setHex(Math.sin(t * 5) > 0 ? 0xff5a1f : 0xffa040);
          T.eye = 0.65;
          mood = "smug";
          if (Math.floor(u * 1.25) !== st.lastRing && u > 0.8) {
            st.lastRing = Math.floor(u * 1.25);
            mouth.getWorldPosition(tmp);
            // a ring: puffs on a circle, drifting away together
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              const p = puffs.find((x) => !x.visible);
              if (!p) break;
              p.position.set(tmp.x + Math.cos(a) * 0.12, tmp.y + Math.sin(a) * 0.12, tmp.z + 0.15);
              p.visible = true;
              p.userData = { life: 0, max: 2.2, vx: 0.9 + Math.cos(a) * 0.12, vy: Math.sin(a) * 0.12 + 0.05, s: 0.5 };
            }
          }
          break;
        }
        case "nap": {
          pillow.visible = u > 0.8;
          pillow.position.set(0.1, FLOOR_Y + 0.11, 0.4);
          const down = ease((u - 0.3) / 1.2) * (1 - ease((u - (L - 1.3)) / 1.0));
          phRotZ = -Math.PI / 2 * down;
          phZ = 0.3 * down;
          T.hipsY -= 0.2 * down;
          T.eye = 1 - 0.95 * down;
          T.armRZ = [-0.3, 0.6 * down + 0.15];
          mood = down > 0.5 ? "happy" : "neutral";
          if (down > 0.9 && Math.random() < dt * 1.2) { head.getWorldPosition(tmp); tmp.y += 0.6; puff(tmp, 0.9); }
          break;
        }
        case "levitate": {
          const up = ease(u / 1.5) * (1 - ease((u - (L - 1.5)) / 1.4));
          T.jump = up * 1.1 + Math.sin(t * 2) * 0.08 * up;
          T.legX = [-2.2 * up, -2.2 * up];
          T.armRZ = [-0.9 * up - 0.15, 0.9 * up + 0.15];
          T.armRX = [0.6 * up, 0.6 * up];
          T.eye = 1 - 0.85 * up;
          T.headX = 0.1 * up;
          phRotZ = Math.sin(t * 0.8) * 0.05 * up;
          mood = "happy";
          if (up > 0.8 && Math.random() < dt * 2) { puff(new THREE.Vector3((Math.random() - 0.5) * 1.2, FLOOR_Y + 0.6, 0.6), 0.8); }
          break;
        }
        case "think": {
          const k = ease(u / 0.6) * (1 - ease((u - 2.2) / 0.6));
          T.armRX[1] = -2.4 * k;
          T.armRZ[1] = -0.55 * k;
          T.headZ = -0.2 * k;
          T.headY = 0.2 * k + Math.sin(u * 5) * 0.05 * k; // scratching
          mood = "neutral";
          break;
        }
        case "facepalm": {
          const k = ease(u / 0.4) * (1 - ease((u - 1.9) / 0.5));
          T.armRX[1] = -2.6 * k;
          T.armRZ[1] = -0.05;
          T.headX = 0.45 * k;
          mood = "sad";
          break;
        }
        case "scheme": {
          board.visible = u > 0.5;
          const k = ease((u - 0.5) / 0.6) * (1 - ease((u - (L - 0.8)) / 0.6));
          board.position.set(0.0, FLOOR_Y + 1.6 + 0.4 * k, 1.0);
          board.rotation.x = -0.15;
          T.armRX = [-1.7 * k, -1.7 * k];
          T.armRZ = [0.55 * k - 0.15, -0.55 * k + 0.15];
          T.headX = 0.35 * k;
          T.headY = Math.sin(u * 2.5) * 0.25 * k; // searching the chart
          mood = u > 4.5 ? "sad" : "neutral";
          break;
        }
        case "adjika": {
          jar.visible = spoon.visible = u > 0.4;
          const k = ease((u - 0.4) / 0.6) * (1 - ease((u - (L - 0.8)) / 0.6));
          jar.position.set(-0.45, FLOOR_Y + 1.35, 0.85);
          T.armRX[0] = -1.4 * k; T.armRZ[0] = 0.5 * k - 0.15;
          const bite = ((u - 1) * 1.1) % 1;
          const lift = u > 1 ? bounce(bite) : 0;
          spoon.position.set(0.35 - lift * 0.25, FLOOR_Y + 1.3 + lift * 0.75, 0.75 - lift * 0.1);
          spoon.rotation.z = -0.3 - lift * 0.9;
          T.armRX[1] = (-1.3 - lift * 1.1) * k; T.armRZ[1] = (-0.4 + lift * 0.2) * k;
          mood = lift > 0.6 ? "happy" : "neutral";
          if (u > 3) M.skin.color.setHex(look ? shade(L.skin, 0.04, 0.14) : 0xf7b8a0);
          break;
        }
      }
    }

    if (st.task) {
      const k2 = st.task, tt = k2.t;
      if (k2.phase === "pickup") {
        face = 0;
        const bend = Math.sin(Math.min(1, tt / 0.7) * Math.PI);
        T.hipsY -= 0.14 * bend;
        T.lean = 0.45 * bend;
        T.armRX = [-0.9 * bend, -0.9 * bend];
        T.armRZ = [0.25 * bend - 0.15, -0.25 * bend + 0.15];
        if (tt > 0.35 && !ball.visible) {
          if (k2.court.npcTake()) ball.visible = true;
          else st.task = null;
        }
        if (st.task && tt > 0.75) {
          // Carry it to a spot on the open side of the hoop
          const h = k2.court.hoopInfo();
          const rimC = h.x + h.rimW / 2;
          const open = h.side === "left" ? 1 : -1;
          k2.rimC = rimC;
          k2.targetX = clampX(rimC + open * (150 + Math.random() * 120) - W / 2);
          k2.phase = "carry";
          k2.t = 0;
        }
      }
      if (k2.phase === "carry") {
        T.armRX = [-1.15, -1.15];
        T.armRZ = [0.4, -0.4];
        ball.position.set(0, 0.42, 0.62);
      }
      if (k2.phase === "aim" || k2.phase === "follow") {
        face = Math.sign(k2.rimC - (st.x + W / 2)) * 0.75;
        mood = "smug";
      }
      if (k2.phase === "aim") {
        const up = ease(tt / 0.5);
        T.armRX = [lerp(-1.15, -2.75, up), lerp(-1.15, -2.75, up)];
        T.armRZ = [0.4 - 0.2 * up, -0.4 + 0.2 * up];
        ball.position.set(0, lerp(0.42, 2.25, up), lerp(0.62, 0.15, up));
        T.headX = -0.25 * up;
        T.hipsY -= tt < 0.5 ? 0.08 * up : 0;
        if (tt > 0.5) T.jump = Math.sin(Math.min(1, (tt - 0.5) / 0.55) * Math.PI) * 0.3;
        if (tt > 0.72) {
          // Release: hand the ball to the court at its current screen position
          ball.getWorldPosition(tmp);
          tmp.project(camera);
          const rect = canvas.getBoundingClientRect();
          k2.court.npcThrow(rect.left + ((tmp.x + 1) / 2) * rect.width, rect.top + (1 - (tmp.y + 1) / 2) * rect.height, k2.make);
          ball.visible = false;
          k2.phase = "follow";
          k2.t = 0;
        }
      }
      if (k2.phase === "follow") {
        T.armRX = [-2.3, -2.3];
        T.armRZ = [0.15, -0.15];
        T.headX = -0.2;
        T.jump = tt < 0.3 ? Math.sin((0.5 + tt / 0.6) * Math.PI) * 0.3 : 0;
        if (tt > 1.3) st.task = null;
      }
    } else if (ball.visible) {
      ball.visible = false;
    }

    // Smoke break: light up, then puff away (he may wander again once it is lit)
    if (smoking) {
      const s = st.smokeT;
      cig.visible = true;
      cig.scale.setScalar(Math.max(0.001, s < 0.35 ? ease(s / 0.35) : s > 8.6 ? 1 - ease((s - 8.6) / 0.4) : 1));
      lighter.visible = s > 0.25 && s < 2.7;
      if (s > 0.25 && s < 2.4) {
        const up = ease((s - 0.25) / 0.6) * (1 - ease((s - 2.0) / 0.4));
        T.armRX[1] = lerp(T.armRX[1], -1.35, up);
        T.armRZ[1] = lerp(T.armRZ[1], -0.28, up);
        T.headX = 0.1 * up;
        face = 0;
      }
      flame.visible = s > 0.95 && s < 1.9;
      if (flame.visible) flame.scale.set(0.85 + Math.random() * 0.3, 0.8 + Math.random() * 0.5, 0.85 + Math.random() * 0.3);
      const lit = s > 1.7;
      ember.material.color.setHex(lit ? (Math.sin(t * 5) > 0 ? 0xff5a1f : 0xffa040) : 0x55443a);
      if (lit && s > st.nextPuff && s < 8.6) {
        ember.getWorldPosition(tmp);
        puff(tmp, 0.7);
        st.nextPuff = s + 0.35;
      }
      // Exhale from the mouth now and then
      for (const at of [4.4, 6.9]) {
        if (s - dt < at && s >= at) {
          mouth.getWorldPosition(tmp);
          tmp.z += 0.1;
          for (let i = 0; i < 4; i++) puff(tmp.clone().add(new THREE.Vector3(i * 0.05, i * 0.04, 0)), 1.2);
        }
      }
      if (!lighting) T.eye = Math.min(T.eye, 0.65); // relaxed, half-closed eyes
      if (s > 9.1) { st.smokeT = -1; cig.visible = false; lighter.visible = false; }
    }

    // Blink
    if (t > st.blinkAt) { st.blinkT = 0; st.blinkAt = t + 2.5 + Math.random() * 4; }
    let blink = 1;
    if (st.blinkT >= 0) { st.blinkT += dt; blink = st.blinkT < 0.14 ? 0.1 : 1; if (st.blinkT > 0.14) st.blinkT = -1; }

    // Smooth everything toward the target pose
    const k = 1 - Math.exp(-dt * 12);
    for (const i of [0, 1]) {
      J.armRX[i] = lerp(J.armRX[i], T.armRX[i], k);
      J.armRZ[i] = lerp(J.armRZ[i], T.armRZ[i], k);
      J.legX[i] = lerp(J.legX[i], T.legX[i], k);
      arms[i].rotation.set(J.armRX[i], 0, J.armRZ[i]);
      legs[i].rotation.x = J.legX[i];
    }
    for (const n of ["headX", "headY", "headZ", "hipsY", "eye", "back", "lean"]) J[n] = lerp(J[n], T[n], k);
    J.jump = T.jump; // jumps are already smooth curves
    st.look = lerp(st.look, face, 1 - Math.exp(-dt * 6));
    phil.rotation.y = st.look;
    phil.rotation.z = phRotZ;
    phil.rotation.x = phRotX;
    phil.position.set(phX, -0.06 + J.jump, phZ);
    hips.position.y = J.hipsY;
    hips.rotation.x = J.lean + J.back;
    head.rotation.set(J.headX, J.headY, J.headZ);
    for (const e of eyes) e.scale.set(J.eye > 1 ? J.eye : 1, J.eye * blink, 1);
    for (const b of brows) {
      const s = b.userData.side;
      b.position.y = 0.34 + (mood === "shock" ? 0.07 : mood === "sad" ? 0.02 : 0);
      b.rotation.z = mood === "sad" ? s * -0.3 : mood === "angry" ? s * 0.38 : mood === "smug" ? (s > 0 ? 0.25 : -0.05) : mood === "happy" ? s * 0.12 : 0;
      if (mood === "angry") b.position.y = 0.3;
    }
    setMouth(mood === "angry" ? "sad" : mood);
    if (!(st.scene === "adjika" && st.sceneT > 3)) M.skin.color.setHex(mood === "angry" ? (look ? shade(L.skin, 0.05, 0.12) : 0xf6aa8e) : L.skin); // red in the face

    // Sunglasses slide down from above and sit on the eyes
    st.shades = lerp(st.shades, st.shadesOn || L.glasses === "sun" ? 1 : 0, 1 - Math.exp(-dt * 7));
    shades.visible = st.shades > 0.02;
    shades.position.y = 0.12 + (1 - st.shades) * 1.4;

    // Smoke particles
    for (const p of puffs) {
      if (!p.visible) continue;
      const u = p.userData;
      u.life += dt;
      const f = u.life / u.max;
      if (f >= 1) { p.visible = false; continue; }
      p.position.x += u.vx * dt;
      p.position.y += u.vy * dt;
      p.scale.setScalar((0.6 + f * 2.4) * u.s);
      p.material.opacity = 0.55 * (1 - f) * Math.min(1, u.life * 5);
    }

    const wantFov = st.scene ? 36 : 26;
    if (Math.abs(camera.fov - wantFov) > 0.1) { camera.fov = lerp(camera.fov, wantFov, 1 - Math.exp(-dt * 6)); camera.updateProjectionMatrix(); }
    renderer.render(scene, camera);
    placeBubble();
    requestAnimationFrame(frame);
  }

  // Speech bubble rides above his head and stays inside the viewport
  const headTop = new THREE.Vector3();
  function placeBubble() {
    if (!bubble || bubble.hidden) return;
    head.localToWorld(headTop.set(0, 0.8, 0));
    headTop.project(camera);
    const yFromTop = (1 - (headTop.y + 1) / 2) * H;
    const xInCanvas = ((headTop.x + 1) / 2) * W;
    const bw = bubble.offsetWidth;
    const vw = window.innerWidth;
    let left = st.x + xInCanvas - bw / 2;
    left = Math.max(8, Math.min(vw - bw - 8, left));
    bubble.style.bottom = `${(H - yFromTop + 6).toFixed(0)}px`;
    bubble.style.left = `${(left - st.x).toFixed(0)}px`;
    bubble.style.setProperty("--tail", `${(st.x + xInCanvas - left).toFixed(0)}px`);
  }

  requestAnimationFrame(frame);
  return {
    react, smoke, shoot, play,
    scenes: Object.keys(SCENES),
    stop: endScene,
    get scene() { return st.scene; },
    glasses(on) { if (!(on && st.task)) st.shadesOn = on; },
    get busy() { return !!st.task || st.smokeT >= 0 || !!st.react || !!st.scene; },
    get smoking() { return st.smokeT >= 0; }, get puffs() { return puffs.filter((p) => p.visible).length; }
  };
}

// Orange basketball with black seams (equirectangular map)
function ballTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#d9681e";
  g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 900; i++) { g.fillStyle = "rgba(120,40,0,.18)"; g.fillRect(Math.random() * 256, Math.random() * 128, 1.5, 1.5); }
  g.strokeStyle = "#241005";
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 64); g.lineTo(256, 64); g.stroke();
  for (const x of [64, 192]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  for (const x of [0, 128, 256]) { g.beginPath(); g.ellipse(x, 64, 34, 64, 0, 0, Math.PI * 2); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The famous scheme: boxes and arrows, with a question mark where Phil should be
function schemeTexture() {
  const c = document.createElement("canvas");
  c.width = 360; c.height = 260;
  const g = c.getContext("2d");
  g.fillStyle = "#fff8ec";
  g.fillRect(0, 0, 360, 260);
  g.strokeStyle = "#1b0d07"; g.lineWidth = 3; g.fillStyle = "#1b0d07";
  g.font = "bold 20px Manrope, sans-serif"; g.textAlign = "center";
  const box = (x, y, w, h, label) => { g.strokeRect(x, y, w, h); g.fillText(label, x + w / 2, y + h / 2 + 7); };
  box(20, 20, 120, 50, "Фарм"); box(220, 20, 120, 50, "FunPay"); box(20, 120, 120, 50, "Диваны"); box(220, 120, 120, 50, "Рубли"); box(120, 200, 120, 45, "ПК");
  g.beginPath(); g.moveTo(140, 45); g.lineTo(220, 45); g.moveTo(80, 70); g.lineTo(80, 120); g.moveTo(140, 145); g.lineTo(220, 145); g.moveTo(280, 70); g.lineTo(280, 120); g.moveTo(280, 170); g.lineTo(200, 200); g.stroke();
  g.fillStyle = "#c8102e"; g.font = "bold 46px Anton, Impact, sans-serif"; g.fillText("?", 180, 110);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Phil's look, and how a builder look maps onto the avatar
function lookOf(look) {
  const hex = (h, d) => (typeof h === "string" && /^#[0-9a-f]{6}$/i.test(h) ? parseInt(h.slice(1), 16) : d);
  if (!look) return { skin: COLORS.skin, hair: COLORS.hair, eyes: COLORS.iris, top: COLORS.shirt, pants: COLORS.jeans, shoes: COLORS.shoe, hairStyle: "buzz", beard: "stubble", mustache: false, glasses: "none", width: 1, topType: "jersey", number: "23", numberColor: "#c8102e" };
  const top = hex(look.top?.color, COLORS.shirt);
  return {
    skin: hex(look.skin, COLORS.skin), hair: hex(look.hair?.color, 0x6b4a2b), eyes: hex(look.eyes, COLORS.iris),
    top, pants: hex(look.pants, COLORS.jeans), shoes: hex(look.shoes, COLORS.shoe),
    hairStyle: look.hair?.style || "short", beard: look.beard || "none", mustache: !!look.mustache, glasses: look.glasses || "none",
    width: look.build === "slim" ? 0.88 : look.build === "chubby" ? 1.14 : 1,
    topType: look.top?.type || "tshirt",
    number: look.top?.type === "jersey" ? String(look.number || "") : "",
    numberColor: luminance(top) > 0.5 ? "#1b1b1f" : "#ffffff"
  };
}
const luminance = (c) => (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255;
// Lighten (+) or darken (-) a color; red adds a flush
function shade(c, k, red = 0) {
  const ch = (v, extra) => Math.max(0, Math.min(255, Math.round(v + (k >= 0 ? (255 - v) * k : v * k) + extra * 255)));
  const r = ch((c >> 16) & 255, red), g = ch((c >> 8) & 255, -red * 0.4), b = ch(c & 255, -red * 0.4);
  return (r << 16) | (g << 8) | b;
}

// Number on the jersey
function numberTexture(text = "23", color = "#c8102e") {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 176;
  const g = c.getContext("2d");
  g.fillStyle = color;
  g.font = `bold ${text.length > 2 ? 110 : 150}px Anton, Impact, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 96);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Light speckle so the buzz cut reads as short hair, not a helmet
function speckle() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) {
    const v = 175 + Math.floor(Math.random() * 80);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
