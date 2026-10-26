import { spinDetector, drawFace } from "./ballskin.js?v=202610251836";

// Free throw after a wrong answer: a small court in a modal, one throw.
// Resolves to { made, skipped, stats } where stats describe how the shot went (for achievements).
// The ball can only be held behind the free-throw line, so the shot has to be a real throw (no dunks).
// onEvent(name) fires live for things that happen before the result: "forgot", "nudge", "wrongway", "down".

const R = 16;            // ball radius
const RIM_W = 78;        // distance between rim edges
const RIM_DOT = 3;
const GRAVITY = 1700;
const MAX_SPEED = 2300;

// Default texts are for the quiz's second chance; the mini-games page passes its own via `text`.
const QUIZ_TEXT = {
  kicker: "второй шанс",
  help: "Потяни мяч и брось в кольцо. Одна попытка: попадёшь — ещё раз ответишь на вопрос.",
  made: "Попал! Ещё одна попытка ответа.",
  missed: "Мимо. Идём дальше.",
  skip: "Не бросать"
};

export function freeThrow({ sound, onEvent, text = {} } = {}) {
  const tx = { ...QUIZ_TEXT, ...text };
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "overlay ft-overlay";
    overlay.innerHTML = `
      <div class="overlay-card ft-card">
        <p class="kicker"><span class="dot"></span> ${tx.kicker}</p>
        <h2>Штрафной бросок</h2>
        <p class="ft-help">${tx.help}</p>
        <canvas class="ft-canvas"></canvas>
        <p class="ft-result" aria-live="polite"></p>
        <button type="button" class="link-egg ft-skip">${tx.skip}</button>
      </div>`;
    document.body.append(overlay);
    const canvas = overlay.querySelector("canvas");
    const resultEl = overlay.querySelector(".ft-result");
    const g = canvas.getContext("2d");

    const W = Math.min(400, window.innerWidth - 64);
    const H = Math.max(300, Math.min(420, window.innerHeight - 260));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const floor = H - 10;
    const lineY = Math.round(H * 0.62);                   // free-throw line
    const left = Math.random() < 0.5;
    const hoop = {
      x: left ? 34 + Math.random() * (W * 0.32) : W - RIM_W - 34 - Math.random() * (W * 0.32),
      y: Math.round(H * (0.2 + Math.random() * 0.1))
    };
    hoop.boardX = left ? hoop.x - 11 : hoop.x + RIM_W + 11;
    const side = left ? "left" : "right";

    const ball = { x: W * (0.38 + Math.random() * 0.24), y: floor - R, vx: 0, vy: 0, angle: 0, state: "rest" };
    let trail = [];
    const spin = spinDetector();
    let shot = null;          // { t0, scored, done }
    let netWobble = 0;
    let finished = false;
    let last = performance.now();
    const stats = { rimHits: 0, board: false, minY: Infinity, nudges: 0, wrongWay: false, down: false, forgot: false };
    let lastRimAt = 0;
    const emit = (name) => onEvent && onEvent(name);

    // Standing there without throwing for 15 seconds
    const forgotTimer = setTimeout(() => {
      if (!shot && !finished) { stats.forgot = true; emit("forgot"); }
    }, 15000);

    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
    };

    canvas.addEventListener("pointerdown", (e) => {
      if (ball.state !== "rest") return;
      const p = local(e);
      if (Math.hypot(p.x - ball.x, p.y - ball.y) > R + 14) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* keeps working without capture */ }
      ball.state = "drag";
      trail = [{ ...p, t: performance.now() }];
      spin.reset();
      spin.push(p.x, p.y);
      canvas.classList.add("grabbing");
    });
    canvas.addEventListener("pointermove", (e) => {
      const p = local(e);
      if (ball.state === "drag") {
        ball.x = Math.max(R, Math.min(W - R, p.x));
        ball.y = Math.max(lineY + R, Math.min(floor - R, p.y)); // stay behind the line
        trail.push({ ...p, t: performance.now() });
        if (trail.length > 8) trail.shift();
        ball.angle += spin.push(p.x, p.y);
      } else {
        canvas.classList.toggle("hover", ball.state === "rest" && Math.hypot(p.x - ball.x, p.y - ball.y) <= R + 14);
      }
    });
    const release = () => {
      if (ball.state !== "drag") return;
      canvas.classList.remove("grabbing");
      const now = performance.now();
      const recent = trail.filter((p) => now - p.t < 90);
      const a = recent[0] || trail[0], b = trail[trail.length - 1];
      const dt = Math.max(0.016, (b.t - a.t) / 1000);
      let vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
      const sp = Math.hypot(vx, vy);
      if (sp < 120) { // just a nudge, not a throw
        ball.state = "rest";
        stats.nudges++;
        if (stats.nudges === 3) emit("nudge");
        return;
      }
      if (sp > MAX_SPEED) { vx *= MAX_SPEED / sp; vy *= MAX_SPEED / sp; }
      ball.vx = vx;
      ball.vy = vy;
      ball.state = "flight";
      shot = { t0: now, scored: false, done: false };
      clearTimeout(forgotTimer);
      // Odd throws: away from the hoop, or straight into the floor
      const toHoop = hoop.x + RIM_W / 2 - ball.x;
      if (Math.abs(vx) > 250 && Math.abs(toHoop) > 30 && Math.sign(vx) !== Math.sign(toHoop)) { stats.wrongWay = true; emit("wrongway"); }
      if (vy > 150) { stats.down = true; emit("down"); }
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);

    function finish(made, skipped = false) {
      if (finished) return;
      finished = true;
      clearTimeout(forgotTimer);
      resultEl.textContent = made ? tx.made : tx.missed;
      resultEl.className = "ft-result " + (made ? "ok" : "bad");
      setTimeout(() => {
        overlay.remove();
        resolve({ made, skipped, stats: { ...stats, moonshot: stats.minY < -150 } });
      }, made ? 1100 : 1300);
    }
    overlay.querySelector(".ft-skip").addEventListener("click", () => finish(false, true));

    function collide(px, py) {
      const dx = ball.x - px, dy = ball.y - py, d = Math.hypot(dx, dy), min = R + RIM_DOT;
      if (d >= min || d === 0) return false;
      const nx = dx / d, ny = dy / d;
      ball.x = px + nx * min;
      ball.y = py + ny * min;
      const vn = ball.vx * nx + ball.vy * ny;
      if (vn < 0) { ball.vx -= 1.5 * vn * nx; ball.vy -= 1.5 * vn * ny; }
      return true;
    }

    function step(dt) {
      if (ball.state !== "flight") return;
      const prevY = ball.y;
      ball.vy += GRAVITY * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.angle += (ball.vx * dt) / R;
      if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx) * 0.6; }
      if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx) * 0.6; }

      const top = hoop.y - 70, bottom = hoop.y + 14;
      if (ball.y + R > top && ball.y - R < bottom) {
        const bx = hoop.boardX;
        if (side === "left" && ball.x - R < bx && ball.x > bx - 6) { ball.x = bx + R; ball.vx = Math.abs(ball.vx) * 0.55; stats.board = true; }
        if (side === "right" && ball.x + R > bx && ball.x < bx + 6) { ball.x = bx - R; ball.vx = -Math.abs(ball.vx) * 0.55; stats.board = true; }
      }
      if (collide(hoop.x, hoop.y) || collide(hoop.x + RIM_W, hoop.y)) {
        const now = performance.now();
        if (now - lastRimAt > 90) stats.rimHits++; // count separate touches, not every sub-step
        lastRimAt = now;
        if (sound) sound("rim");
      }
      stats.minY = Math.min(stats.minY, ball.y);

      if (!shot.scored && prevY < hoop.y && ball.y >= hoop.y && ball.vy > 0 &&
          ball.x > hoop.x + 4 && ball.x < hoop.x + RIM_W - 4) {
        shot.scored = true;
        netWobble = 1;
        ball.vx *= 0.3;
        ball.vy = Math.min(ball.vy, 340);
        if (sound) sound("swish");
        finish(true);
      }

      if (ball.y + R > floor) {
        ball.y = floor - R;
        if (Math.abs(ball.vy) > 140 && sound) sound("bounce", Math.min(1, Math.abs(ball.vy) / 1300));
        ball.vy = -ball.vy * 0.55;
        ball.vx *= 0.86;
        if (Math.abs(ball.vy) < 70) ball.vy = 0;
      }
      const settled = ball.vy === 0 && Math.abs(ball.vx) < 14;
      // A miss is clear as soon as the ball drops well below the rim on its way down
      const belowRim = ball.vy > 0 && ball.y - R > hoop.y + 60;
      if (!shot.scored && !shot.done && (belowRim || settled || performance.now() - shot.t0 > 4500)) {
        shot.done = true;
        if (sound) sound("brick");
        finish(false);
      }
    }

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
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(-R, 0); g.lineTo(R, 0); g.stroke();
      g.beginPath(); g.moveTo(0, -R); g.lineTo(0, R); g.stroke();
      g.restore();
    }

    function draw(now) {
      g.clearRect(0, 0, W, H);
      // Court
      g.fillStyle = "#1a120c";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "rgba(200, 135, 74, .12)";
      g.fillRect(0, lineY, W, floor - lineY);
      g.strokeStyle = "rgba(255, 255, 255, .35)";
      g.setLineDash([6, 6]);
      g.beginPath(); g.moveTo(0, lineY); g.lineTo(W, lineY); g.stroke();
      g.setLineDash([]);
      g.fillStyle = "rgba(255, 255, 255, .4)";
      g.font = '700 10px "Manrope", sans-serif';
      g.textAlign = "left";
      g.fillText("ШТРАФНАЯ ЛИНИЯ", 8, lineY - 6);
      g.fillStyle = "rgba(255, 255, 255, .08)";
      g.fillRect(0, floor, W, H - floor);

      // Board
      g.fillStyle = "rgba(245, 239, 233, .92)";
      g.fillRect(side === "left" ? hoop.boardX - 6 : hoop.boardX, hoop.y - 70, 6, 84);
      g.strokeStyle = "#9a9a9a";
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(hoop.boardX, hoop.y + 2); g.lineTo(side === "left" ? hoop.x : hoop.x + RIM_W, hoop.y + 2); g.stroke();
      // Back rim
      g.strokeStyle = "#ff5a1f";
      g.lineWidth = 4;
      g.beginPath(); g.ellipse(hoop.x + RIM_W / 2, hoop.y, RIM_W / 2, 6, 0, Math.PI, Math.PI * 2); g.stroke();

      const inside = ball.y > hoop.y - R && ball.y < hoop.y + 48 && ball.x > hoop.x - R && ball.x < hoop.x + RIM_W + R;
      if (!inside) drawBall();
      if (inside) drawBall();
      // Net
      const wob = Math.sin(now / 40) * netWobble * 6;
      g.strokeStyle = "rgba(245, 239, 233, .75)";
      g.lineWidth = 1.2;
      const depth = 42 + netWobble * 10;
      for (let i = 0; i <= 6; i++) {
        g.beginPath();
        g.moveTo(hoop.x + (RIM_W * i) / 6, hoop.y);
        g.lineTo(hoop.x + 13 + ((RIM_W - 26) * i) / 6 + wob, hoop.y + depth);
        g.stroke();
      }
      for (let k = 1; k <= 3; k++) {
        const y = hoop.y + (depth * k) / 3, inset = 13 * (k / 3);
        g.beginPath(); g.moveTo(hoop.x + inset + wob * k / 3, y); g.lineTo(hoop.x + RIM_W - inset + wob * k / 3, y); g.stroke();
      }
      // Front rim
      g.strokeStyle = "#ff5a1f";
      g.lineWidth = 4;
      g.beginPath(); g.ellipse(hoop.x + RIM_W / 2, hoop.y, RIM_W / 2, 6, 0, 0, Math.PI); g.stroke();

      if (ball.state === "rest") {
        g.fillStyle = "rgba(168, 153, 143, .9)";
        g.font = '700 11px "Manrope", sans-serif';
        g.textAlign = "center";
        g.fillText("потяни и брось", ball.x, ball.y - R - 8);
      }
    }

    function frame(now) {
      if (!overlay.isConnected) return;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      for (let i = 0; i < 4; i++) step(dt / 4);
      netWobble = Math.max(0, netWobble - dt * 1.4);
      draw(now);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // Test hook (only with ?debug in the URL)
    if (new URLSearchParams(location.search).has("debug")) {
      window.__ft = { get state() { return { W, H, hoop: { ...hoop }, ball: { ...ball }, canvas: canvas.getBoundingClientRect() }; } };
    }
  });
}
