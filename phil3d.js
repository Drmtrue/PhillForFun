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

export function createPhil3D(root, { bubble, onClick, onContext } = {}) {
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
    skin: std(COLORS.skin, { roughness: 0.5 }),
    nose: std(COLORS.skinDark, { roughness: 0.45 }),
    hair: std(COLORS.hair, { roughness: 1, map: speckle() }),
    brow: std(COLORS.brow, { roughness: 0.9 }),
    shirt: std(COLORS.shirt, { roughness: 0.75 }),
    jeans: std(COLORS.jeans, { roughness: 0.8 }),
    shoe: std(COLORS.shoe, { roughness: 0.4 }),
    sole: std(COLORS.sole, { roughness: 0.6 }),
    white: std(0xffffff, { roughness: 0.25 }),
    iris: std(COLORS.iris, { roughness: 0.2 }),
    pupil: std(0x111418, { roughness: 0.2 }),
    mouth: basic(COLORS.mouth, { side: THREE.DoubleSide }),
    stubble: std(0x7a5a42, { roughness: 1, transparent: true, opacity: 0.3, depthWrite: false }),
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
  const torso = add(sphere(0.56), M.shirt, hips, [0, 0.36, 0], [1, 1.08, 0.86]);
  add(sphere(0.45), M.jeans, hips, [0, -0.1, 0], [1.08, 0.62, 0.86]);
  add(new THREE.PlaneGeometry(0.44, 0.3), basic(0xffffff, { map: numberTexture(), transparent: true }), hips, [0, 0.4, 0.488], null, [-0.08, 0, 0]);

  // Head
  const head = group(hips, [0, 1.2, 0]);
  add(sphere(0.62, 48, 32), M.skin, head, [0, 0, 0], [1, 1.02, 0.96]);
  add(new THREE.SphereGeometry(0.64, 48, 24, 0, Math.PI * 2, 0, 1.18), M.hair, head, [0, 0.01, -0.01], [1, 1.02, 0.97], [-0.32, 0, 0]);
  add(new THREE.SphereGeometry(0.627, 40, 16, 0.35, Math.PI - 0.7, 1.72, 1.05), M.stubble, head, [0, 0, 0], [1, 1.02, 0.965]);
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

  // ----- State
  const st = {
    x: 0, target: 0, pause: 1.5, dir: 1, phase: 0, facing: 0, t: 0,
    react: null, reactT: 0, smokeT: -1, nextPuff: 0, blinkAt: 2, blinkT: -1,
    look: 0, mouseX: null, task: null, shades: 0, shadesOn: false
  };
  const J = { // smoothed joint values
    armRX: [0, 0], armRZ: [-0.15, 0.15], legX: [0, 0], headX: 0, headY: 0, headZ: 0,
    hipsY: 0.78, jump: 0, eye: 1, back: 0, lean: 0
  };

  function layout() {
    const k = small() ? 0.72 : 1;
    W = Math.round(180 * k);
    H = Math.round(230 * k);
    root.style.width = W + "px";
    root.style.height = H + "px";
    renderer.setSize(W, H, false);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    const [a, b] = range();
    st.x = Math.min(Math.max(st.x || b, a), b);
    st.target = st.x;
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
    } else if (!reduced && !st.react && !smoking && !st.task) { // a smoke break is a break: he stands still
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
    phil.position.y = -0.06 + J.jump;
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
    M.skin.color.setHex(mood === "angry" ? 0xf6aa8e : COLORS.skin); // red in the face

    // Sunglasses slide down from above and sit on the eyes
    st.shades = lerp(st.shades, st.shadesOn ? 1 : 0, 1 - Math.exp(-dt * 7));
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
    react, smoke, shoot,
    glasses(on) { if (!(on && st.task)) st.shadesOn = on; },
    get busy() { return !!st.task || st.smokeT >= 0 || !!st.react; },
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

// Red "23" for the shirt
function numberTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 176;
  const g = c.getContext("2d");
  g.fillStyle = "#c8102e";
  g.font = "bold 150px Anton, Impact, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("23", 128, 96);
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
