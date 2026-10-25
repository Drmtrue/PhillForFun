import { spinDetector, drawFace } from "./ballskin.js?v=202610251538";

// Side-court mini-game: a hoop appears in the empty space left or right of the quiz column,
// the ball lies at the bottom of the viewport, and the player drags and flings it into the hoop.
// Baskets are reported through onBasket(); counting and storage live in app.js.

const COLUMN = 660;          // width of the central content column (matches .wrap max-width)
const MIN_ZONE = 170;        // minimum free side width for the game to appear
const R = 17;                // ball radius
const RIM_W = 82;            // distance between the rim edges
const RIM_DOT = 3;           // rim edge collision radius
const GRAVITY = 1900;        // px/s^2
const MAX_SPEED = 2600;      // px/s cap on throws
const FLOOR_PAD = 14;        // ball rests this far above the viewport bottom

export function initHoop({ onBasket, onMiss, onDunk, onNpcBasket, onNpcMiss, sound }) {
  const canvas = document.createElement("canvas");
  canvas.className = "hoop-layer";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const g = canvas.getContext("2d");

  let vw = 0, vh = 0, dpr = 1, enabled = false;
  let zones = null;          // { left: [x0, x1], right: [x0, x1] }
  let hoop = null;           // { side, x, y, board }
  const ball = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, state: "rest" }; // rest | drag | flight | reset | npc (held by Phil)
  let throwInfo = null;      // { scored, dunk, npc, t0, settledAt }
  let trail = [];            // recent pointer samples while dragging
  const spin = spinDetector(); // fast loops while holding the ball swap the skin
  let netWobble = 0;
  let pops = [];             // floating "+1" labels
  let last = performance.now();

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth;
    vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + "px";
    canvas.style.height = vh + "px";
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const side = (vw - COLUMN) / 2 - 12;
    enabled = side >= MIN_ZONE;
    canvas.hidden = !enabled;
    document.body.classList.toggle("hoop-on", enabled);
    if (!enabled) return;
    zones = { left: [0, side], right: [vw - side, vw] };
    if (!hoop || hoop.vw !== vw || hoop.vh !== vh) placeHoop();
    if (ball.state === "rest") restBall();
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function placeHoop() {
    // Random side and height; the backboard is always flush with that edge of the screen
    const side = Math.random() < 0.5 ? "left" : "right";
    const BOARD_W = 7;
    const boardX = side === "left" ? BOARD_W : vw - BOARD_W;
    const x = side === "left" ? boardX + 12 : boardX - 12 - RIM_W;
    const y = rand(vh * 0.18, vh * 0.55);
    hoop = { side, x, y, boardX, vw, vh, born: performance.now() };
  }

  function restBall() {
    const side = hoop ? hoop.side : "left";
    const [z0, z1] = zones[side];
    // Keep clear of the avatar in the bottom-right corner
    const right = side === "right" ? Math.max(z0 + 2 * R + 40, z1 - 130) : z1;
    ball.x = (z0 + right) / 2 + rand(-15, 15);
    ball.y = vh - FLOOR_PAD - R;
    ball.vx = ball.vy = 0;
    ball.state = "rest";
  }

  // ----- Input: the canvas ignores the mouse, so the page stays clickable; we hit-test the ball ourselves
  const onBall = (x, y) => enabled && Math.hypot(x - ball.x, y - ball.y) <= R + 10;

  document.addEventListener("pointerdown", (e) => {
    if (!onBall(e.clientX, e.clientY) || ball.state === "reset" || ball.state === "npc") return;
    if (ball.state === "flight" && throwInfo && throwInfo.npc) return; // Phil's shot is his own
    e.preventDefault();
    e.stopPropagation();
    ball.state = "drag";
    ball.vx = ball.vy = 0;
    trail = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    spin.reset();
    spin.push(e.clientX, e.clientY);
    document.body.classList.add("hoop-grabbing");
    try { e.target.setPointerCapture?.(e.pointerId); } catch (_) {}
  }, { capture: true });

  document.addEventListener("pointermove", (e) => {
    if (ball.state === "drag") {
      ball.x = e.clientX;
      ball.y = Math.min(e.clientY, vh - FLOOR_PAD - R);
      trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (trail.length > 8) trail.shift();
      ball.angle += spin.push(e.clientX, e.clientY);
      return;
    }
    document.body.classList.toggle("hoop-hover", onBall(e.clientX, e.clientY));
  }, { capture: true });

  const release = () => {
    if (ball.state !== "drag") return;
    document.body.classList.remove("hoop-grabbing");
    const now = performance.now();
    const recent = trail.filter((p) => now - p.t < 90);
    const a = recent[0] || trail[0], b = trail[trail.length - 1];
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    let vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
    const sp = Math.hypot(vx, vy);
    if (sp > MAX_SPEED) { vx *= MAX_SPEED / sp; vy *= MAX_SPEED / sp; }
    ball.vx = vx;
    ball.vy = vy;
    ball.state = "flight";
    // Releasing above the rim is a dunk: fun, but it does not count
    throwInfo = { scored: false, dunk: hoop && ball.y < hoop.y - 4, t0: now, settledAt: 0 };
  };
  document.addEventListener("pointerup", release, { capture: true });
  document.addEventListener("pointercancel", release, { capture: true });

  // ----- Physics
  function collidePoint(px, py, rad, bounce) {
    const dx = ball.x - px, dy = ball.y - py;
    const d = Math.hypot(dx, dy);
    const min = R + rad;
    if (d >= min || d === 0) return false;
    const nx = dx / d, ny = dy / d;
    ball.x = px + nx * min;
    ball.y = py + ny * min;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= (1 + bounce) * vn * nx;
      ball.vy -= (1 + bounce) * vn * ny;
    }
    return true;
  }

  function step(dt) {
    if (ball.state !== "flight") return;
    const prevY = ball.y;
    ball.vy += GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.angle += (ball.vx * dt) / R;

    // Walls
    if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx) * 0.6; }
    if (ball.x > vw - R) { ball.x = vw - R; ball.vx = -Math.abs(ball.vx) * 0.6; }
    if (ball.y < -400) ball.vy = Math.abs(ball.vy) * 0.3;

    if (hoop) {
      // Backboard: a vertical segment from above the rim to just below it
      const top = hoop.y - 78, bottom = hoop.y + 16;
      if (ball.y + R > top && ball.y - R < bottom) {
        const bx = hoop.boardX;
        if (hoop.side === "left" && ball.x - R < bx && ball.x > bx - 6) { ball.x = bx + R; ball.vx = Math.abs(ball.vx) * 0.55; }
        if (hoop.side === "right" && ball.x + R > bx && ball.x < bx + 6) { ball.x = bx - R; ball.vx = -Math.abs(ball.vx) * 0.55; }
      }
      // Rim edges
      const hitL = collidePoint(hoop.x, hoop.y, RIM_DOT, 0.5);
      const hitR = collidePoint(hoop.x + RIM_W, hoop.y, RIM_DOT, 0.5);
      if ((hitL || hitR) && sound) sound("rim");

      // Basket: center passes the rim line downward between the edges
      if (!throwInfo.scored && prevY < hoop.y && ball.y >= hoop.y && ball.vy > 0 &&
          ball.x > hoop.x + 4 && ball.x < hoop.x + RIM_W - 4) {
        throwInfo.scored = true;
        netWobble = 1;
        ball.vx *= 0.3;
        ball.vy = Math.min(ball.vy, 380);
        if (throwInfo.npc) {
          pops.push({ x: hoop.x + RIM_W / 2, y: hoop.y - 30, text: "ФИЛ!", t: 0 });
          onNpcBasket && onNpcBasket();
        } else if (throwInfo.dunk) {
          pops.push({ x: hoop.x + RIM_W / 2, y: hoop.y - 30, text: "Данк не засчитан", t: 0, bad: true });
          onDunk && onDunk();
        } else {
          pops.push({ x: hoop.x + RIM_W / 2, y: hoop.y - 30, text: "+1", t: 0 });
          onBasket && onBasket();
        }
      }
    }

    // Floor
    const floor = vh - FLOOR_PAD;
    if (ball.y + R > floor) {
      ball.y = floor - R;
      if (Math.abs(ball.vy) > 140 && sound) sound("bounce", Math.min(1, Math.abs(ball.vy) / 1400));
      ball.vy = -ball.vy * 0.55;
      ball.vx *= 0.86;
      if (Math.abs(ball.vy) < 70) ball.vy = 0;
    }
    if (ball.y + R >= floor - 0.5 && ball.vy === 0) ball.vx *= 0.97;

    // End of throw: ball settled on the floor, or it has been flying too long
    const now = performance.now();
    const settled = ball.vy === 0 && Math.abs(ball.vx) < 14;
    if ((settled || now - throwInfo.t0 > 5000) && !throwInfo.settledAt) {
      throwInfo.settledAt = now;
      if (!throwInfo.scored && throwInfo.npc) onNpcMiss && onNpcMiss();
      else if (!throwInfo.scored && !throwInfo.dunk && onMiss) onMiss();
      ball.state = "reset";
      setTimeout(() => {
        placeHoop();       // new hoop position after every throw
        restBall();
      }, throwInfo.scored ? 450 : 650);
    }
  }

  // Silent copy of the physics above: would a throw from (x, y) with this velocity score?
  function simulate(x, y, vx, vy, dt) {
    const b = { x, y, vx, vy };
    const dot = (px, py) => {
      const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy), min = R + RIM_DOT;
      if (d >= min || d === 0) return;
      const nx = dx / d, ny = dy / d;
      b.x = px + nx * min;
      b.y = py + ny * min;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= 1.5 * vn * nx; b.vy -= 1.5 * vn * ny; }
    };
    const floor = vh - FLOOR_PAD;
    for (let t = 0; t < 5; t += dt) {
      const prevY = b.y;
      b.vy += GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx) * 0.6; }
      if (b.x > vw - R) { b.x = vw - R; b.vx = -Math.abs(b.vx) * 0.6; }
      if (b.y < -400) b.vy = Math.abs(b.vy) * 0.3;
      const top = hoop.y - 78, bottom = hoop.y + 16, bx = hoop.boardX;
      if (b.y + R > top && b.y - R < bottom) {
        if (hoop.side === "left" && b.x - R < bx && b.x > bx - 6) { b.x = bx + R; b.vx = Math.abs(b.vx) * 0.55; }
        if (hoop.side === "right" && b.x + R > bx && b.x < bx + 6) { b.x = bx - R; b.vx = -Math.abs(b.vx) * 0.55; }
      }
      dot(hoop.x, hoop.y);
      dot(hoop.x + RIM_W, hoop.y);
      if (prevY < hoop.y && b.y >= hoop.y && b.vy > 0 && b.x > hoop.x + 4 && b.x < hoop.x + RIM_W - 4) return true;
      if (b.y + R > floor) {
        b.y = floor - R;
        b.vy = -b.vy * 0.55;
        b.vx *= 0.86;
        if (Math.abs(b.vy) < 70) b.vy = 0;
      }
      if (b.vy === 0 && Math.abs(b.vx) < 14) return false;
    }
    return false;
  }

  // ----- Drawing
  function drawBall() {
    g.save();
    g.translate(ball.x, ball.y);
    g.rotate(ball.angle);
    if (drawFace(g, R)) { g.restore(); return; }
    const grad = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    grad.addColorStop(0, "#ffa057");
    grad.addColorStop(1, "#c4520f");
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#2b1405";
    g.lineWidth = 1.6;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(-R, 0); g.lineTo(R, 0); g.stroke();
    g.beginPath(); g.moveTo(0, -R); g.lineTo(0, R); g.stroke();
    g.beginPath(); g.ellipse(-R * 0.95, 0, R * 0.55, R, 0, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.beginPath(); g.ellipse(R * 0.95, 0, R * 0.55, R, 0, Math.PI / 2, Math.PI * 1.5); g.stroke();
    g.restore();
  }

  function drawBoard() {
    const h = hoop;
    const bx = h.boardX, w = 7; // board width (matches BOARD_W in placeHoop)
    g.fillStyle = "rgba(245, 239, 233, .92)";
    g.fillRect(h.side === "left" ? bx - w : bx, h.y - 78, w, 94);
    // Bracket
    g.strokeStyle = "#9a9a9a";
    g.lineWidth = 3;
    g.beginPath();
    const ax = h.side === "left" ? bx : bx;
    const rimEdge = h.side === "left" ? h.x : h.x + RIM_W;
    g.moveTo(ax, h.y + 2); g.lineTo(rimEdge, h.y + 2); g.stroke();
  }

  function drawNet() {
    const h = hoop;
    const wob = Math.sin(performance.now() / 40) * netWobble * 6;
    g.strokeStyle = "rgba(245, 239, 233, .75)";
    g.lineWidth = 1.2;
    const depth = 46 + netWobble * 10;
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const tx = h.x + (RIM_W * i) / n;
      const bx = h.x + 14 + ((RIM_W - 28) * i) / n + wob;
      g.beginPath(); g.moveTo(tx, h.y); g.lineTo(bx, h.y + depth); g.stroke();
    }
    for (let k = 1; k <= 3; k++) {
      const y = h.y + (depth * k) / 3;
      const inset = 14 * (k / 3);
      g.beginPath(); g.moveTo(h.x + inset + wob * (k / 3), y); g.lineTo(h.x + RIM_W - inset + wob * (k / 3), y); g.stroke();
    }
  }

  function drawRim(front) {
    const h = hoop;
    g.strokeStyle = "#ff5a1f";
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(h.x + RIM_W / 2, h.y, RIM_W / 2, 7, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    g.stroke();
  }

  function drawPops(dt) {
    pops = pops.filter((p) => p.t < 1.1);
    for (const p of pops) {
      p.t += dt;
      g.globalAlpha = Math.max(0, 1 - p.t / 1.1);
      g.font = p.bad ? '700 15px "Manrope", sans-serif' : '28px "Anton", sans-serif';
      g.textAlign = "center";
      g.fillStyle = p.bad ? "#c8874a" : "#4fd17a";
      g.fillText(p.text, p.x, p.y - p.t * 40);
    }
    g.globalAlpha = 1;
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (enabled && !document.hidden) {
      // Sub-steps keep fast throws from tunnelling through the rim
      for (let i = 0; i < 4; i++) step(dt / 4);
      netWobble = Math.max(0, netWobble - dt * 1.4);
      g.clearRect(0, 0, vw, vh);
      if (hoop) {
        const age = (now - hoop.born) / 300;
        g.globalAlpha = Math.min(1, age);
        drawBoard();
        drawRim(false);
        g.globalAlpha = 1;
      }
      // Ball goes in front of the back rim and behind the net/front rim when it is inside the hoop
      const shown = ball.state !== "npc";
      const inside = shown && hoop && ball.y > hoop.y - R && ball.y < hoop.y + 50 && ball.x > hoop.x - R && ball.x < hoop.x + RIM_W + R;
      if (shown && !inside) drawBall();
      if (hoop) {
        g.globalAlpha = Math.min(1, (now - hoop.born) / 300);
        if (inside) drawBall();
        drawNet();
        drawRim(true);
        g.globalAlpha = 1;
      }
      if (ball.state === "rest") {
        g.font = '700 11px "Manrope", sans-serif';
        g.textAlign = "center";
        g.fillStyle = "rgba(168, 153, 143, .8)";
        g.fillText("брось меня", ball.x, ball.y - R - 8);
      }
      drawPops(dt);
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", layout);
  layout();
  requestAnimationFrame(frame);

  // ----- Phil (the mascot) plays too: he takes the resting ball and throws it from a screen point.
  // make = true aims at the rim center so the ball drops in; otherwise the aim is off by enough to miss.
  const court = {
    get enabled() { return enabled; },
    ballAvailable: () => enabled && ball.state === "rest",
    ballPos: () => ({ x: ball.x, y: ball.y }),
    hoopInfo: () => hoop && { x: hoop.x, y: hoop.y, side: hoop.side, rimW: RIM_W },
    npcTake() {
      if (!enabled || ball.state !== "rest") return false;
      ball.state = "npc";
      return true;
    },
    npcCancel() { if (ball.state === "npc") restBall(); },
    npcThrow(x, y, make) {
      if (ball.state !== "npc" || !hoop) return;
      const y0 = Math.min(y, vh - FLOOR_PAD - R);
      // Try trajectories and keep one whose simulated outcome matches the plan (checked at three step sizes,
      // so the frame rate does not flip it). Rim and backboard bounces make plain aiming unreliable.
      let pick = null, fallback = null;
      for (let i = 0; i < 40 && !pick; i++) {
        let tx = hoop.x + RIM_W / 2, ty = hoop.y;
        if (make) tx += rand(-6, 6);
        else {
          tx += (Math.random() < 0.5 ? -1 : 1) * rand(45, 140);   // short into the front rim, or long off the board
          ty += rand(-60, 10);
        }
        const dx = tx - x, dy = ty - y0;
        // Flight time: long enough that the ball is already falling when it reaches the rim
        const T = Math.min(1.8, Math.max(0.9 + Math.abs(dx) / 900, Math.sqrt((2 * Math.max(0, -dy)) / GRAVITY) * rand(1.15, 1.45)));
        const v = { vx: dx / T, vy: dy / T - 0.5 * GRAVITY * T };
        fallback = fallback || v;
        if ([1 / 240, 1 / 120, 1 / 576].every((dt) => simulate(x, y0, v.vx, v.vy, dt) === make)) pick = v;
      }
      const v = pick || fallback;
      ball.x = x;
      ball.y = y0;
      ball.vx = v.vx;
      ball.vy = v.vy;
      ball.state = "flight";
      throwInfo = { scored: false, dunk: false, npc: true, t0: performance.now(), settledAt: 0 };
      if (sound) sound("bounce", 0.4);
    }
  };

  // court is for Phil; state is a test hook for automated checks
  return { court, get state() { return { enabled, hoop: hoop && { ...hoop }, ball: { ...ball } }; } };
}
