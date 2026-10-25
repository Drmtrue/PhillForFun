// Shared ball skin: the regular basketball or Phil's face.
// Face mode is toggled by spinning the held ball fast (about two quick loops with the mouse or finger).
// It lives only in memory, so a page refresh brings the normal ball back.

const face = new Image();
let faceReady = false;
face.onload = () => { faceReady = true; };
face.src = "assets/phil-face.png";

let faceMode = false;
const listeners = new Set();

export const isFace = () => faceMode;
export function onSkinChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function toggleFace() {
  faceMode = !faceMode;
  listeners.forEach((fn) => { try { fn(faceMode); } catch (_) { /* a listener must not break the game */ } });
}

const LOOPS = 2;              // full turns needed
const WINDOW_MS = 1500;       // ...within this time
const MIN_STEP = 3;           // ignore pointer jitter shorter than this (px)
const COOLDOWN_MS = 700;

// Feed pointer positions while the ball is held; it calls toggleFace() after fast loops.
// push() returns the heading change of this sample, so callers can spin the ball visually.
export function spinDetector() {
  let prev = null, heading = null, turns = [], coolUntil = 0;
  return {
    reset() { prev = null; heading = null; turns = []; },
    push(x, y, t = performance.now()) {
      if (!prev) { prev = { x, y }; return 0; }
      const dx = x - prev.x, dy = y - prev.y;
      if (Math.hypot(dx, dy) < MIN_STEP) return 0;
      prev = { x, y };
      const h = Math.atan2(dy, dx);
      if (heading === null) { heading = h; return 0; }
      let d = h - heading;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      heading = h;
      turns.push({ t, d });
      while (turns.length && t - turns[0].t > WINDOW_MS) turns.shift();
      const total = turns.reduce((s, p) => s + p.d, 0);   // zigzags cancel out, loops add up
      if (Math.abs(total) >= LOOPS * 2 * Math.PI && t > coolUntil) {
        turns = [];
        coolUntil = t + COOLDOWN_MS;
        toggleFace();
      }
      return d;
    }
  };
}

// Draws the face clipped to the ball circle; the caller has already translated and rotated the context.
// Returns false when face mode is off (or the image is not loaded), so the caller draws the regular ball.
export function drawFace(g, R) {
  if (!faceMode || !faceReady) return false;
  g.save();
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.clip();
  g.drawImage(face, -R, -R, R * 2, R * 2);
  g.restore();
  g.strokeStyle = "#c4520f";
  g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
  return true;
}
