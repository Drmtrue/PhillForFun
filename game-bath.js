// Mini-game "Ванна": keep the water hot (but not boiling) and keep Phil awake as long as possible.
// Hold the hot tap to heat the water, splash his face to wake him, and catch the phone when he drops it.
// The water cools faster and he gets sleepier the longer the bath lasts. Warm water makes him sleepy.

const KEY = "phill_bath_best";
const T_MIN = 30, T_MAX = 45, T_OK = [36, 42];

const LINES = {
  start: { id: "bath_start", mood: "happy", pri: 2, lines: ["Пошла вода горячая!", "Ванна — лучшая работа в мире.", "Только не дай мне уснуть. Хотя…"] },
  hot: { id: "bath_hot", mood: "shock", pri: 3, act: "angry", lines: ["Сварился! Кто так кипяток льёт?!", "Я тебе не пельмень!"] },
  cold: { id: "bath_cold", mood: "sad", pri: 3, lines: ["Замёрз. Вода как моя трудовая — холодная.", "Брр. Это не ванна, это прорубь."] },
  sleep: { id: "bath_sleep", mood: "sad", pri: 3, lines: ["Хррр… Опять уснул в ванне.", "Zzz… разбудите к старту лиги…"] },
  phone: { id: "bath_phone_lost", mood: "shock", pri: 3, act: "angry", lines: ["Телефон утонул! Там же был аккаунт с диванами!", "Буль. Прощай, FunPay."] },
  catch: { id: "bath_catch", mood: "happy", pri: 1, lines: ["Поймал! Реакция как у MJ.", "Фух, телефон спасён."] },
  splash: { id: "bath_splash", mood: "shock", pri: 0, chance: 0.25, lines: ["Эй! Холодно!", "Я не сплю! Я думаю."] },
  milestone: { id: "bath_ms", mood: "smug", pri: 2, lines: ["Минута в ванне. Я в своей стихии.", "Вот это ванна. Вот это жизнь."] }
};

// ctx.skin (builder portals): { place, phone } renames the scene
export function mountBath(el, ctx) {
  const sk = ctx.skin || null;
  const phoneName = sk?.phone || "телефон";
  const startText = sk ? `Начать: ${sk.place}` : "Набрать ванну";
  el.innerHTML = `
    <div class="bath-scene">
      <svg viewBox="0 0 320 210" class="bath-svg" aria-hidden="true">
        <defs><clipPath id="bath-head-clip"><circle cx="0" cy="0" r="34"/></clipPath></defs>
        <g class="bath-steam"><path d="M90 60 q-10 -15 0 -30 q10 -15 0 -30"/><path d="M160 50 q-10 -15 0 -30 q10 -15 0 -30"/><path d="M230 60 q-10 -15 0 -30 q10 -15 0 -30"/></g>
        <g class="bath-head"><image href="${ctx.face || "assets/phil-face.png"}" x="-34" y="-34" width="68" height="68" clip-path="url(#bath-head-clip)"/><circle r="34" fill="none" stroke="#e8a33d" stroke-width="2"/><g class="bath-lids"><rect x="-34" y="-7" width="68" height="0" rx="6" fill="#e9b796" opacity=".92"/></g></g>
        <text class="bath-z" x="200" y="70">Z</text><text class="bath-z z2" x="216" y="54">z</text>
        <rect class="bath-water" x="30" y="110" width="260" height="16" rx="8"/>
        <g class="bath-bubbles"><circle cx="62" cy="112" r="9"/><circle cx="84" cy="108" r="12"/><circle cx="108" cy="113" r="7"/><circle cx="226" cy="110" r="10"/><circle cx="248" cy="113" r="8"/><circle cx="208" cy="114" r="6"/></g>
        <path class="bath-tub" d="M24 120 h272 v10 c0 40 -24 60 -60 60 h-152 c-36 0 -60 -20 -60 -60 Z"/>
        <path class="bath-feet" d="M70 188 l-8 16 M250 188 l8 16"/>
        <path class="bath-tap" d="M286 120 v-40 h-22 v10"/>
        <path class="bath-flow" d="M264 92 v34"/>
      </svg>
      <button type="button" class="bath-phone" hidden>📱 Поймать!</button>
      <div class="bath-over" hidden><b></b><button type="button" class="btn primary bath-again">Ещё раз</button></div>
    </div>
    <div class="bath-meters">
      <div class="meter"><span class="sb-label">Температура <b class="bt-temp">38°</b></span><div class="meter-track temp"><i class="ok"></i><span class="bt-temp-bar"></span></div></div>
      <div class="meter"><span class="sb-label">Сонливость <b class="bt-sleep">0%</b></span><div class="meter-track"><span class="bt-sleep-bar"></span></div></div>
    </div>
    <div class="game-stats"><div><span class="sb-label">Время</span><b class="bt-time">0,0 с</b></div><div><span class="sb-label">Рекорд</span><b class="bt-best">0 с</b></div></div>
    <div class="farm-actions">
      <button type="button" class="btn primary bt-start">${startText}</button>
      <button type="button" class="btn bt-hot" disabled>🔥 Горячий кран (держи)</button>
      <button type="button" class="btn bt-splash" disabled>💦 Плеснуть в лицо</button>
    </div>`;
  const q = (s) => el.querySelector(s);
  const okBand = q(".meter-track.temp .ok");
  okBand.style.left = `${((T_OK[0] - T_MIN) / (T_MAX - T_MIN)) * 100}%`;
  okBand.style.width = `${((T_OK[1] - T_OK[0]) / (T_MAX - T_MIN)) * 100}%`;

  let s = null, raf = 0, last = 0, hot = false;
  const best = () => ctx.store.get(KEY, 0);

  function start() {
    s = { t: 0, temp: 38, sleep: 0, splashAt: -9, nextPhone: 9 + Math.random() * 8, phoneUntil: 0, catches: 0, running: true, ms60: false };
    q(".bath-over").hidden = true;
    q(".bt-start").hidden = true;
    q(".bt-hot").disabled = q(".bt-splash").disabled = false;
    ctx.say(LINES.start, { force: true });
    if (!ctx.scene?.("bathduck")) ctx.scene?.("bath");
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!s || !s.running) return;
    raf = requestAnimationFrame(loop);
    if (!el.offsetParent || document.hidden) return; // paused while off screen
    s.t += dt;
    // Water cools faster over time; the hot tap fights it
    s.temp += (hot ? 2.4 : 0) * dt - (0.35 + s.t * 0.004) * dt;
    // Sleepiness: warm water and time make him drowsy; cold water keeps him up
    let rate = 3 + s.t * 0.03 + (s.temp > 40 ? (s.temp - 40) * 2.5 : 0);
    if (s.temp < 35) rate *= 0.4;
    s.sleep = Math.min(100, s.sleep + rate * dt);
    // The phone
    if (!s.phoneUntil && s.t > s.nextPhone) {
      s.phoneUntil = s.t + 1.7;
      const b = q(".bath-phone");
      b.hidden = false;
      b.style.left = `${15 + Math.random() * 55}%`;
      b.style.top = `${10 + Math.random() * 35}%`;
    }
    if (s.phoneUntil && s.t > s.phoneUntil) return lose("phone");
    if (s.temp >= T_MAX) return lose("hot");
    if (s.temp <= T_MIN) return lose("cold");
    if (s.sleep >= 100) return lose("sleep");
    if (s.t >= 60 && !s.ms60) { s.ms60 = true; ctx.unlock("bath_60"); ctx.say(LINES.milestone); }
    if (s.t >= 180) ctx.unlock("bath_180");
    render();
  }

  function splash() {
    if (!s || !s.running || s.t - s.splashAt < 0.8) return;
    s.splashAt = s.t;
    s.sleep = Math.max(0, s.sleep - 28);
    s.temp -= 1.2;
    ctx.sfx.pop(0.7);
    el.querySelector(".bath-scene").classList.remove("splash");
    void el.offsetWidth;
    el.querySelector(".bath-scene").classList.add("splash");
    ctx.say(LINES.splash);
  }

  function catchPhone() {
    if (!s || !s.phoneUntil) return;
    s.phoneUntil = 0;
    s.nextPhone = s.t + 8 + Math.random() * 10;
    s.catches++;
    q(".bath-phone").hidden = true;
    ctx.sfx.swish();
    ctx.say(LINES.catch);
    if (s.catches >= 5) ctx.unlock("bath_phone");
  }

  function lose(why) {
    s.running = false;
    hot = false;
    q(".bath-phone").hidden = true;
    q(".bt-hot").disabled = q(".bt-splash").disabled = true;
    ctx.sfx.brick();
    ctx.say(LINES[why], { force: true });
    const reason = sk
      ? { hot: "Перегрелся", cold: "Замёрз", sleep: "Уснул", phone: `Уронил: ${phoneName}` }[why]
      : { hot: "Сварился", cold: "Замёрз", sleep: "Уснул", phone: "Утопил телефон" }[why];
    const sec = Math.floor(s.t);
    const rec = sec > best();
    if (rec) ctx.store.set(KEY, sec);
    ctx.log?.("bath_end", { sec, why, record: rec });
    q(".bath-over b").textContent = `${reason} на ${sec}-й секунде${rec ? " · новый рекорд!" : ""}`;
    q(".bath-over").hidden = false;
    render();
  }

  function render() {
    q(".bt-best").textContent = `${best()} с`;
    if (!s) return;
    const tPart = Math.max(0, Math.min(1, (s.temp - T_MIN) / (T_MAX - T_MIN)));
    q(".bt-temp").textContent = `${s.temp.toFixed(1)}°`;
    q(".bt-temp-bar").style.left = `calc(${(tPart * 100).toFixed(1)}% - 2px)`;
    q(".bt-sleep").textContent = `${Math.round(s.sleep)}%`;
    q(".bt-sleep-bar").style.width = `${s.sleep.toFixed(1)}%`;
    q(".bt-time").textContent = `${s.t.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} с`;
    // Scene: steam follows the temperature, the head sinks and the eyes close as he falls asleep
    el.style.setProperty("--steam", Math.max(0, Math.min(1, (s.temp - 33) / 10)).toFixed(2));
    el.style.setProperty("--cold", Math.max(0, Math.min(1, (35 - s.temp) / 5)).toFixed(2));
    const sink = s.sleep / 100;
    q(".bath-head").setAttribute("transform", `translate(160 ${96 + sink * 30}) rotate(${Math.sin(s.t * 1.3) * 4 + sink * 14})`);
    q(".bath-lids rect").setAttribute("height", (sink * 15).toFixed(1));
    q(".bath-lids").style.visibility = sink > 0.05 ? "visible" : "hidden";
    el.style.setProperty("--zzz", sink > 0.5 ? ((sink - 0.5) * 2).toFixed(2) : "0");
    q(".bath-flow").style.opacity = hot ? 1 : 0;
  }

  const hotBtn = q(".bt-hot");
  const setHot = (on) => (e) => { if (e.cancelable) e.preventDefault(); hot = on && s && s.running; };
  hotBtn.addEventListener("pointerdown", setHot(true));
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => hotBtn.addEventListener(ev, setHot(false)));
  hotBtn.addEventListener("contextmenu", (e) => e.preventDefault());
  q(".bt-splash").addEventListener("click", splash);
  q(".bath-phone").addEventListener("click", catchPhone);
  q(".bt-start").addEventListener("click", start);
  q(".bath-again").addEventListener("click", start);
  q(".bath-head").setAttribute("transform", "translate(160 96)");
  render();
}
