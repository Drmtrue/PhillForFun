import { QUIZ, API_URL } from "./config.js?v=202610251313";
import { initHoop } from "./hoop.js?v=202610251313";
import { freeThrow } from "./freethrow.js?v=202610251313";

const $ = (id) => document.getElementById(id);
const NAME_COOKIE = "phill_quiz_name";
const LOCAL_KEY = "phill_quiz_scores";
const ACH_KEY = "phill_quiz_ach";
const LAST_SCORE_KEY = "phill_quiz_last";

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (_) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }
};

/* ---------- Player name cookie ---------- */
function getName() {
  const m = document.cookie.match(new RegExp("(?:^|; )" + NAME_COOKIE + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}
function setName(name) {
  document.cookie = `${NAME_COOKIE}=${encodeURIComponent(name)}; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
}
const nameKey = (name) => (name || "").trim().toLowerCase();

/* ---------- Server (Cloudflare) or local mode ---------- */
const API = API_URL.replace(/\/+$/, "");

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Ошибка сервера"), { data });
  return data;
}

async function saveScore(name, score, total) {
  if (API) {
    await api("/scores", { method: "POST", body: JSON.stringify({ name, score, total }) });
    return;
  }
  const list = store.get(LOCAL_KEY, []);
  list.push({ name, score, total, createdAt: Date.now() });
  store.set(LOCAL_KEY, list);
}

// Local mode: same aggregation the server does
function aggregateLocal(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = nameKey(r.name);
    const p = map.get(k) || { name: r.name, attempts: 0, points: 0, possible: 0, firstAt: r.createdAt };
    p.name = r.name;
    p.attempts++;
    p.points += r.score;
    p.possible += r.total;
    map.set(k, p);
  }
  return [...map.values()]
    .map((p) => ({ ...p, avg: Math.round((p.points / p.attempts) * 10) / 10, achievements: 0 }))
    .sort((a, b) => b.points / b.attempts - a.points / a.attempts || b.attempts - a.attempts || a.firstAt - b.firstAt);
}

async function loadScores() {
  if (API) return (await api("/scores")).scores;
  return aggregateLocal(store.get(LOCAL_KEY, []));
}

async function loadPlayerStats(name) {
  if (API) return api(`/player?name=${encodeURIComponent(name)}`);
  return aggregateLocal(store.get(LOCAL_KEY, [])).find((p) => nameKey(p.name) === nameKey(name)) || { attempts: 0, points: 0, avg: 0 };
}

// Questions: built-in + generated from player facts
let generated = [];
async function loadGenerated() {
  if (!API) return;
  try { generated = (await api("/questions")).questions || []; } catch (e) { console.error(e); }
}
function questionPool() {
  return [...(window.QUESTIONS || []), ...generated];
}

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const fmtAvg = (x) => (Math.round(x * 10) / 10).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

async function renderBoard(el) {
  el.innerHTML = '<li class="muted">Загрузка…</li>';
  try {
    const rows = (await loadScores()).slice(0, 15);
    if (!rows.length) {
      el.innerHTML = '<li class="muted">Пока никого. Будь первым!</li>';
      return;
    }
    const me = nameKey(getName());
    el.innerHTML = "";
    for (const r of rows) {
      const li = document.createElement("li");
      if (nameKey(r.name) === me) li.className = "me";

      const who = document.createElement("div");
      who.className = "who";
      const n = document.createElement("span");
      n.className = "name";
      n.textContent = r.name;
      const meta = document.createElement("span");
      meta.className = "meta";
      const parts = [
        `${r.attempts} ${plural(r.attempts, "игра", "игры", "игр")}`,
        `${r.points} ${plural(r.points, "очко", "очка", "очков")}`
      ];
      if (r.achievements) parts.push(`🏆 ${r.achievements}`);
      if (r.baskets) parts.push(`🏀 ${r.baskets}`);
      meta.textContent = parts.join(" · ");
      who.append(n, meta);

      const avg = document.createElement("span");
      avg.className = "pts";
      avg.title = "Средний балл за игру";
      avg.textContent = fmtAvg(r.avg);

      li.append(who, avg);
      el.append(li);
    }
  } catch (e) {
    console.error(e);
    el.innerHTML = '<li class="muted">Не удалось загрузить рейтинг</li>';
  }
}

/* ---------- Achievements ---------- */
const ACH = window.ACHIEVEMENTS || [];
const ACH_BY_ID = Object.fromEntries(ACH.map((a) => [a.id, a]));
let unlocked = new Set();

function achStoreKey(name) { return `${ACH_KEY}:${nameKey(name) || "_anon"}`; }

function loadLocalAch(name) {
  // Anonymous unlocks (before a name was entered) carry over to the first name used
  return new Set([...store.get(achStoreKey(name), []), ...store.get(achStoreKey(""), [])]);
}
function saveLocalAch() {
  store.set(achStoreKey(getName()), [...unlocked]);
}

async function syncAch(name) {
  unlocked = loadLocalAch(name);
  if (API && name) {
    try {
      const { ids } = await api(`/achievements?name=${encodeURIComponent(name)}`);
      const missing = [...unlocked].filter((id) => !ids.includes(id));
      ids.forEach((id) => unlocked.add(id));
      if (missing.length) await api("/achievements", { method: "POST", body: JSON.stringify({ name, ids: missing }) });
    } catch (e) { console.error(e); }
  }
  if (name) store.set(achStoreKey(""), []);
  saveLocalAch();
  renderAch();
  await syncBaskets(name);
}

function unlock(id) {
  const a = ACH_BY_ID[id];
  if (!a || unlocked.has(id)) return;
  unlocked.add(id);
  saveLocalAch();
  toast(`${a.icon} Ачивка: ${a.title}`, a.desc);
  // Small delay so it does not clash with the answer sound
  // Easter egg handlers play their own sparkle, so the fanfare comes a bit later for those
  setTimeout(() => sfx.achievement(), a.secret ? 650 : 280);
  if (game && !game.done) game.newAch.push(id);
  else if (game && game.done) addNewAchToResult(id);
  const name = getName();
  if (API && name) api("/achievements", { method: "POST", body: JSON.stringify({ name, ids: [id] }) }).catch(() => {});
  renderAch();
  const others = ACH.filter((x) => x.id !== "all");
  if (others.every((x) => unlocked.has(x.id))) unlock("all");
}

function renderAch() {
  const grid = $("ach-grid");
  if (!grid) return;
  $("ach-count").textContent = `${ACH.filter((a) => unlocked.has(a.id)).length}/${ACH.length}`;
  grid.innerHTML = "";
  for (const a of ACH) {
    const got = unlocked.has(a.id);
    const card = document.createElement("div");
    card.className = "ach" + (got ? " got" : "") + (a.secret && !got ? " secret" : "");
    const icon = document.createElement("span");
    icon.className = "ach-icon";
    icon.textContent = got || !a.secret ? a.icon : "❔";
    const body = document.createElement("div");
    const t = document.createElement("b");
    t.textContent = got || !a.secret ? a.title : "???";
    const d = document.createElement("span");
    d.textContent = got || !a.secret ? a.desc : `Пасхалка. Подсказка: ${a.hint}`;
    body.append(t, d);
    card.append(icon, body);
    grid.append(card);
  }
}

function addNewAchToResult(id) {
  const a = ACH_BY_ID[id];
  const box = $("new-ach");
  box.hidden = false;
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = `${a.icon} ${a.title}`;
  $("new-ach-list").append(chip);
}

/* ---------- Sound (synthesized with Web Audio, no files) ---------- */
const SOUND_KEY = "phill_quiz_sound";
let soundOn = store.get(SOUND_KEY, true);
let audioCtx = null;

function ctx() {
  if (!soundOn) return null;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  } catch (_) { return null; }
}

// One oscillator note with a quick attack and exponential decay
function tone(ac, { freq, to = freq, start = 0, dur = 0.15, type = "sine", vol = 0.25 }) {
  const t = ac.currentTime + start;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Filtered white noise burst; optional sweep of the filter frequency
function noise(ac, { start = 0, dur = 0.1, type = "highpass", freq = 2000, to = freq, q = 0.7, vol = 0.2 }) {
  const t = ac.currentTime + start;
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 1.5;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, t);
  if (to !== freq) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const gain = ac.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
}

const sfx = {
  // Ball hits the rim: short metallic clank (throttled, contacts repeat across sub-steps)
  rim() {
    const now = performance.now();
    if (now - (sfx._rimAt || 0) < 120) return;
    sfx._rimAt = now;
    const ac = ctx(); if (!ac) return;
    tone(ac, { freq: 1150, to: 980, dur: 0.12, type: "triangle", vol: 0.09 });
    tone(ac, { freq: 1730, dur: 0.08, type: "sine", vol: 0.05 });
  },
  // Ball bounces on the floor: low thump, louder for harder bounces
  bounce(power = 0.5) {
    const ac = ctx(); if (!ac) return;
    tone(ac, { freq: 120, to: 60, dur: 0.12, vol: 0.12 + power * 0.25 });
    noise(ac, { dur: 0.04, type: "lowpass", freq: 700, vol: 0.08 + power * 0.12 });
  },

  // Bubble "plop": bigger bubble = lower pitch
  pop(size) {
    const ac = ctx(); if (!ac) return;
    const base = Math.max(260, 980 - size * 18) * (0.9 + Math.random() * 0.2);
    tone(ac, { freq: base * 1.8, to: base * 0.45, dur: 0.12, vol: 0.32 });
    noise(ac, { dur: 0.025, freq: 2500, vol: 0.18 });
  },
  // Correct answer: net "swish" + bright two-note ding
  swish() {
    const ac = ctx(); if (!ac) return;
    noise(ac, { dur: 0.28, type: "bandpass", freq: 5200, to: 1400, q: 1.2, vol: 0.35 });
    tone(ac, { freq: 880, start: 0.12, dur: 0.18, type: "triangle", vol: 0.16 });
    tone(ac, { freq: 1318.5, start: 0.2, dur: 0.32, type: "triangle", vol: 0.16 });
  },
  // Wrong answer: ball thuds off the rim + short arena buzzer
  brick() {
    const ac = ctx(); if (!ac) return;
    tone(ac, { freq: 140, to: 55, dur: 0.22, vol: 0.45 });
    noise(ac, { dur: 0.08, type: "lowpass", freq: 900, vol: 0.3 });
    tone(ac, { freq: 520, to: 470, start: 0.05, dur: 0.18, type: "triangle", vol: 0.05 }); // rim clank
    tone(ac, { freq: 110, start: 0.22, dur: 0.38, type: "sawtooth", vol: 0.07 }); // buzzer
    tone(ac, { freq: 116, start: 0.22, dur: 0.38, type: "square", vol: 0.04 });
  },
  // Achievement: short rising fanfare
  achievement() {
    const ac = ctx(); if (!ac) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(ac, { freq: f, start: i * 0.09, dur: i === 3 ? 0.45 : 0.14, type: "triangle", vol: 0.18 }));
    tone(ac, { freq: 1567.98, start: 0.27, dur: 0.5, type: "sine", vol: 0.06 });
  },
  // Easter egg: magical sparkle glissando
  egg() {
    const ac = ctx(); if (!ac) return;
    const notes = [1046.5, 1318.5, 1568, 2093, 1760, 2637, 3136];
    notes.forEach((f, i) => tone(ac, { freq: f, start: i * 0.055, dur: 0.22, type: "sine", vol: 0.1 }));
    noise(ac, { start: 0.05, dur: 0.5, type: "highpass", freq: 6000, vol: 0.05 });
    tone(ac, { freq: 392, to: 784, dur: 0.35, type: "triangle", vol: 0.08 });
  }
};

/* ---------- Toasts and effects ---------- */
function toast(title, sub = "") {
  const box = $("toasts");
  const el = document.createElement("div");
  el.className = "toast";
  const b = document.createElement("b");
  b.textContent = title;
  el.append(b);
  if (sub) {
    const s = document.createElement("span");
    s.textContent = sub;
    el.append(s);
  }
  box.append(el);
  // Keep at most 3 on screen so they never cover the page
  const all = box.querySelectorAll(".toast");
  for (let i = 0; i < all.length - 3; i++) all[i].remove();
  setTimeout(() => el.classList.add("out"), 3200);
  setTimeout(() => el.remove(), 3700);
}

function rain(emoji, count = 28) {
  const layer = document.createElement("div");
  layer.className = "rain";
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.textContent = Array.isArray(emoji) ? pickOne(emoji) : emoji;
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDelay = `${Math.random() * 1.2}s`;
    s.style.animationDuration = `${2 + Math.random() * 1.6}s`;
    s.style.fontSize = `${20 + Math.random() * 22}px`;
    layer.append(s);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 4500);
}

function overlay(html, cls = "") {
  const o = document.createElement("div");
  o.className = "overlay " + cls;
  o.innerHTML = `<div class="overlay-card">${html}<button class="btn primary overlay-close" type="button">Понятно</button></div>`;
  o.addEventListener("click", (e) => {
    if (e.target === o || e.target.classList.contains("overlay-close")) o.remove();
  });
  document.body.append(o);
}

/* ---------- Game ---------- */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const VERDICTS = [
  { min: 0,  title: "Сидишь на трибуне",       sub: "Где ты в этой схеме? Даже не на скамейке. Купи билет и попробуй ещё раз." },
  { min: 3,  title: "Подаёшь полотенца",       sub: "Ник x23x слышал, пару раз здоровались в чате POE. Пока не больше." },
  { min: 5,  title: "Шестой игрок",            sub: "Вместе курили. Недолго. По меркам Фила вы толком и не начинали." },
  { min: 7,  title: "Стартовая пятёрка",       sub: "Аджику тебе доверить можно. Схему пока нет." },
  { min: 9,  title: "MVP сезона",              sub: "Ты знаешь о Филе больше, чем любой работодатель. Хотя их было немного." },
  { min: 10, title: "Ты и есть x23x?",         sub: "Идеальная игра. Подозрительно идеальная. Признавайся: ты пишешь это из ванны?" }
];

const SWISH = ["Свиш!", "Чисто!", "Трёхочковый!", "Данк!", "Как MJ!"];
const BRICK = ["Кирпич!", "Мимо кольца!", "Эйрбол!", "В щит!", "Блок-шот!"];
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
const WORK_WORDS = /работ|офис|завод|смен|собесед|подработ|трудо|сверхуроч|планёрк|планерк|карьер|повышени|пенси|грамот/i;

function verdictFor(score, total) {
  const scaled = Math.round((score / total) * 10);
  return VERDICTS.filter((v) => scaled >= v.min).pop();
}

let game = null;

function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
  document.body.classList.toggle("playing", id === "screen-quiz");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startGame(name) {
  const pool = questionPool();
  const n = Math.min(QUIZ.questionsPerGame, pool.length);
  game = {
    name,
    questions: shuffle(pool).slice(0, n).map((q) => ({
      q: q.q,
      correct: q.correct,
      author: q.author || "",
      answers: shuffle([q.correct, ...q.wrong])
    })),
    i: 0,
    score: 0,
    streak: 0,
    misses: 0,
    newAch: [],
    done: false
  };
  if (/^(фил|филипп|phil|phill|x23x)$/i.test(name.trim())) unlock("selfcheck");
  show("screen-quiz");
  renderQuestion();
}

function renderQuestion() {
  const { questions, i } = game;
  const cur = questions[i];
  $("q-counter").textContent = `${i + 1}/${questions.length}`;
  $("live-score").textContent = game.score;
  $("call").textContent = "";
  $("call").className = "call";
  $("progress-bar").style.width = `${(i / questions.length) * 100}%`;
  $("q-text").textContent = cur.q;
  $("next-btn").hidden = true;
  $("q-author").hidden = !cur.author;
  $("q-author").textContent = cur.author ? `Вопрос по факту от: ${cur.author}` : "";

  const box = $("answers");
  box.innerHTML = "";
  cur.answers.forEach((text, idx) => {
    const b = document.createElement("button");
    b.className = "answer";
    b.type = "button";
    const l = document.createElement("span");
    l.className = "letter";
    l.textContent = "ABCD"[idx];
    const t = document.createElement("span");
    t.textContent = text;
    b.append(l, t);
    b.addEventListener("click", () => pick(b, text));
    box.append(b);
  });
  game.shownAt = performance.now();
}

function pick(btn, text) {
  const cur = game.questions[game.i];
  if (cur.busy) return;
  const right = text === cur.correct;
  const firstTry = !cur.tries;
  cur.tries = (cur.tries || 0) + 1;
  const took = performance.now() - game.shownAt;

  if (right) { game.score++; game.streak++; game.misses = 0; }
  else { game.streak = 0; game.misses++; }

  if (firstTry && took < 1500) unlock("fast");
  if (firstTry && took > 60000) unlock("slow");
  if (game.streak >= 5) unlock("streak5");
  if (game.misses >= 3) unlock("brick3");
  if (!right && WORK_WORDS.test(text)) unlock("workaholic");
  if (right && /аджик/i.test(cur.q + " " + cur.correct)) unlock("adjika");
  if (right && cur.freeThrowMade) unlock("ft_saved");
  if (!right && cur.freeThrowMade) unlock("ft_choke");

  right ? sfx.swish() : sfx.brick();
  $("live-score").textContent = game.score;
  $("call").textContent = right ? pickOne(SWISH) : pickOne(BRICK);
  $("call").className = "call " + (right ? "swish" : "brick");

  // First wrong answer: a free throw for a second try. The right answer stays hidden until it is over.
  if (!right && firstTry) {
    btn.classList.add("wrong");
    btn.disabled = true;
    cur.busy = true;
    document.querySelectorAll(".answer").forEach((b) => (b.disabled = true));
    $("call").textContent = "Промах! На линию штрафного…";
    setTimeout(async () => {
      const FT_LIVE = { forgot: "ft_forgot", nudge: "ft_nudge", wrongway: "ft_wrongway", down: "ft_floor" };
      const res = await freeThrow({ sound: playCourtSound, onEvent: (name) => FT_LIVE[name] && unlock(FT_LIVE[name]) });
      const made = res.made;
      const st = res.stats;
      cur.busy = false;
      game.freeThrows = (game.freeThrows || 0) + 1;
      if (made) game.ftMade = (game.ftMade || 0) + 1;
      else if (!res.skipped) game.ftMissed = (game.ftMissed || 0) + 1;
      if (res.skipped) unlock("ft_skip");
      if (made && !st.board && st.rimHits === 0) unlock("ft_swish");
      if (made && st.board) unlock("ft_bank");
      if (made && st.rimHits >= 2) unlock("ft_lucky");
      if (!made && !res.skipped && !st.board && st.rimHits === 0 && !st.down) unlock("ft_airball");
      if (!made && st.rimHits >= 3) unlock("ft_rimout");
      if (st.moonshot) unlock("ft_moon");
      if ((game.ftMade || 0) >= 3) unlock("ft_three");
      if ((game.ftMissed || 0) >= 3) unlock("ft_shaq");
      if (made) {
        cur.freeThrowMade = true;
        unlock("ft_made");
        $("call").textContent = "Штрафной забит! Ещё одна попытка";
        $("call").className = "call swish";
        document.querySelectorAll(".answer").forEach((b) => { if (!b.classList.contains("wrong")) b.disabled = false; });
        game.shownAt = performance.now();
      } else {
        $("call").textContent = "Штрафной смазан";
        $("call").className = "call brick";
        reveal(cur);
      }
    }, 650);
    return;
  }
  reveal(cur, btn);
}

// Show the right answer, lock the buttons and offer the next question
function reveal(cur, picked) {
  document.querySelectorAll(".answer").forEach((b) => {
    b.disabled = true;
    const val = b.lastChild.textContent;
    if (val === cur.correct) b.classList.add("correct");
    else if (b === picked) b.classList.add("wrong");
    else if (!b.classList.contains("wrong")) b.classList.add("dim");
  });
  const last = game.i === game.questions.length - 1;
  $("next-btn").textContent = last ? "Узнать результат" : "Дальше";
  $("next-btn").hidden = false;
  $("progress-bar").style.width = `${((game.i + 1) / game.questions.length) * 100}%`;
}

async function finish() {
  const total = game.questions.length;
  const v = verdictFor(game.score, total);
  $("score-num").textContent = game.score;
  $("score-total").textContent = total;
  $("final-name").textContent = game.name;
  $("verdict").textContent = v.title;
  $("verdict-sub").textContent = v.sub;
  $("save-status").textContent = "Сохраняю результат…";
  $("new-ach").hidden = true;
  $("new-ach-list").innerHTML = "";
  show("screen-result");

  // Result-based achievements
  unlock("first_game");
  if (total === 10 && game.score === 10) unlock("perfect");
  if (game.score === 0) unlock("zero");
  if (game.score === 1) unlock("one");
  const lastScores = store.get(LAST_SCORE_KEY, {});
  const prev = lastScores[nameKey(game.name)];
  if (prev != null && prev <= 2 && game.score >= 8) unlock("comeback");
  lastScores[nameKey(game.name)] = game.score;
  store.set(LAST_SCORE_KEY, lastScores);

  game.done = true;
  game.newAch.forEach(addNewAchToResult);

  try {
    await saveScore(game.name, game.score, total);
    $("save-status").textContent = API ? "" : "Рейтинг пока сохраняется только в этом браузере.";
    const stats = await loadPlayerStats(game.name);
    if (stats.attempts >= 5) unlock("attempts5");
    if (stats.attempts >= 23) unlock("attempts23");
    if (stats.points >= 100) unlock("points100");
    if (stats.attempts) {
      $("save-status").textContent = `Всего: ${stats.attempts} ${plural(stats.attempts, "игра", "игры", "игр")}, ` +
        `${stats.points} ${plural(stats.points, "очко", "очка", "очков")}, в среднем ${fmtAvg(stats.avg)} за игру.`;
    }
  } catch (e) {
    console.error(e);
    $("save-status").textContent = "Не удалось сохранить результат.";
  }
  renderBoard($("board-result"));
}

/* ---------- Events ---------- */
$("start-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("player-name").value.trim().slice(0, 30);
  if (!name) return;
  const changed = nameKey(name) !== nameKey(getName());
  setName(name);
  if (changed) await syncAch(name);
  startGame(name);
});

$("next-btn").addEventListener("click", () => {
  if (game.i < game.questions.length - 1) {
    game.i++;
    renderQuestion();
  } else {
    finish();
  }
});

$("again-btn").addEventListener("click", async () => {
  await loadGenerated();
  startGame(game.name);
});

$("home-btn").addEventListener("click", () => {
  show("screen-start");
  renderBoard($("board-start"));
});

/* ---------- Adding facts ---------- */
$("fact-text").addEventListener("input", () => {
  $("fact-count").textContent = `${$("fact-text").value.length}/300`;
});

$("fact-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fact = $("fact-text").value.trim();
  const author = $("player-name").value.trim().slice(0, 30);
  const box = $("fact-result");
  box.hidden = false;
  box.className = "fact-result";
  if (!author) {
    box.classList.add("bad");
    box.textContent = "Сначала впиши своё имя сверху, чтобы мы знали, кого благодарить.";
    $("player-name").focus();
    return;
  }
  if (fact.length < 8) {
    box.classList.add("bad");
    box.textContent = "Слишком коротко. Расскажи подробнее!";
    return;
  }
  if (nameKey(author) !== nameKey(getName())) { setName(author); await syncAch(author); }
  $("fact-btn").disabled = true;
  $("fact-btn").textContent = "Root AI сочиняет…";
  box.textContent = "Придумываю вопросы, это займёт несколько секунд…";
  try {
    const res = await api("/facts", { method: "POST", body: JSON.stringify({ fact, author }) });
    box.innerHTML = "";
    if (res.accepted) {
      box.classList.add("ok");
      const p = document.createElement("p");
      p.textContent = `Готово! В игру добавлено вопросов: ${res.questions.length}`;
      const ul = document.createElement("ul");
      for (const q of res.questions) {
        const li = document.createElement("li");
        li.textContent = q.q;
        ul.append(li);
      }
      box.append(p, ul);
      $("fact-text").value = "";
      $("fact-count").textContent = "0/300";
      unlock("scout");
      await loadGenerated();
      updateFoot();
    } else {
      box.classList.add("bad");
      box.textContent = `Факт не принят: ${res.reason}`;
      unlock("facecontrol");
    }
  } catch (err) {
    box.classList.add("bad");
    box.textContent = err.message || "Не получилось. Попробуй ещё раз.";
  } finally {
    $("fact-btn").disabled = false;
    $("fact-btn").textContent = "Добавить факт";
  }
});

function updateFoot() {
  $("foot").textContent = `В пуле ${questionPool().length} вопросов`;
}

$("share-btn").addEventListener("click", async () => {
  const data = { title: QUIZ.title, text: `Я набрал ${game.score}/${game.questions.length} в квизе про x23x. А ты знаешь Фила лучше?`, url: location.href };
  try {
    if (navigator.share) await navigator.share(data);
    else {
      await navigator.clipboard.writeText(`${data.text} ${data.url}`);
      $("share-btn").textContent = "Ссылка скопирована";
    }
  } catch (_) {}
});

/* ---------- Easter eggs ---------- */

// Click counter that resets if the clicks are too slow
function clicks(el, needed, windowMs, onDone, onEach) {
  let n = 0, timer = null;
  el.addEventListener("click", (e) => {
    n++;
    clearTimeout(timer);
    timer = setTimeout(() => (n = 0), windowMs);
    if (onEach) onEach(n, e);
    if (n >= needed) { n = 0; onDone(e); }
  });
}

// 1. Jersey: three quick clicks flip 23 <-> 45 (the comeback number)
clicks($("jersey"), 3, 1200, () => {
  const num = $("jersey-num");
  const comeback = num.textContent === "23";
  $("jersey").classList.remove("flip");
  void $("jersey").offsetWidth;
  $("jersey").classList.add("flip");
  setTimeout(() => (num.textContent = comeback ? "45" : "23"), 300);
  sfx.egg();
  if (comeback) {
    toast("I'm back.", "Фил тоже однажды вернётся. На работу — вряд ли.");
    unlock("jersey45");
  } else {
    toast("Классика", "Номер 23 вернулся на место.");
  }
});

// 2. Smoke above the jersey: five puffs
clicks($("smoke"), 5, 2500, () => {
  sfx.egg();
  overlay(`<p class="overlay-big">💨</p><h2>Фил вышел покурить</h2><p>Вернётся через 5 минут. По его часам — через полтора часа.</p>`, "smoky");
  unlock("smoke");
}, (n, e) => {
  e.stopPropagation();
  const puff = document.createElement("span");
  puff.className = "puff";
  $("smoke").append(puff);
  setTimeout(() => puff.remove(), 1200);
});

// 3. Bath bubbles: pop ten (with a splash and a "plop")
function splash(x, y, size) {
  const burst = document.createElement("div");
  burst.className = "burst";
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;
  burst.style.width = burst.style.height = `${size}px`;
  burst.style.setProperty("--d", `${size * 1.3 + 26}px`);
  const ring = document.createElement("span");
  ring.className = "ring";
  burst.append(ring);
  const drops = 8 + Math.round(size / 8);
  for (let i = 0; i < drops; i++) {
    const d = document.createElement("span");
    d.className = "drop";
    d.style.setProperty("--a", `${(360 / drops) * i + Math.random() * 20}deg`);
    d.style.animationDuration = `${0.35 + Math.random() * 0.25}s`;
    burst.append(d);
  }
  document.body.append(burst);
  setTimeout(() => burst.remove(), 700);
}

let popped = 0;
document.querySelectorAll(".bubbles i").forEach((b) => {
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault(); // no text selection, no focus jump
    if (b.dataset.popped) return;
    const r = b.getBoundingClientRect();
    b.dataset.popped = "1";
    b.style.visibility = "hidden";
    splash(r.left + r.width / 2, r.top + r.height / 2, r.width);
    sfx.pop(r.width);
    popped++;
    // Respawn the bubble from the bottom after a moment
    setTimeout(() => {
      b.style.animation = "none";
      void b.offsetWidth;
      b.style.animation = "";
      b.style.visibility = "";
      delete b.dataset.popped;
    }, 600);
    if (popped === 10) {
      sfx.egg();
      toast("🛁 Буль!", "Фил бы не одобрил: пена — это святое.");
      unlock("bubbles");
    }
  });
});

function renderSoundBtn() {
  $("sound-btn").textContent = soundOn ? "🔊 звук вкл" : "🔇 звук выкл";
}
$("sound-btn").addEventListener("click", () => {
  soundOn = !soundOn;
  store.set(SOUND_KEY, soundOn);
  renderSoundBtn();
  if (soundOn) sfx.achievement();
});
renderSoundBtn();

// 4. Scoreboard ball: 23 dribbles
let dribbles = 0;
$("sb-ball").addEventListener("click", () => {
  dribbles++;
  const ball = $("sb-ball");
  ball.classList.remove("bounce");
  void ball.offsetWidth;
  ball.classList.add("bounce");
  if (dribbles === 23) {
    sfx.egg();
    rain("🏀", 23);
    toast("⛹️ 23 касания", "Майкл бы кивнул. Фил бы спросил, где он в этой схеме.");
    unlock("dribble");
  }
});

// 5. "Где ты в этой схеме?" opens the actual scheme
$("scheme-link").addEventListener("click", () => {
  sfx.egg();
  overlay(`
    <h2>Схема</h2>
    <svg class="scheme" viewBox="0 0 340 250" role="img" aria-label="Схема жизни Фила">
      <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="currentColor"/></marker></defs>
      <g class="node"><rect x="20" y="20" width="80" height="34" rx="8"/><text x="60" y="42">POE</text></g>
      <g class="node"><rect x="130" y="20" width="80" height="34" rx="8"/><text x="170" y="42">Фарм</text></g>
      <g class="node"><rect x="240" y="20" width="80" height="34" rx="8"/><text x="280" y="42">РМТ</text></g>
      <g class="node"><rect x="240" y="110" width="80" height="34" rx="8"/><text x="280" y="132">Аджика</text></g>
      <g class="node"><rect x="130" y="110" width="80" height="34" rx="8"/><text x="170" y="132">Ванна</text></g>
      <g class="node"><rect x="20" y="110" width="80" height="34" rx="8"/><text x="60" y="132">Перекур</text></g>
      <g class="node off"><rect x="130" y="190" width="80" height="34" rx="8"/><text x="170" y="212">Работа</text><line x1="134" y1="207" x2="206" y2="207"/></g>
      <g class="links">
        <line x1="100" y1="37" x2="128" y2="37" marker-end="url(#arr)"/>
        <line x1="210" y1="37" x2="238" y2="37" marker-end="url(#arr)"/>
        <line x1="280" y1="54" x2="280" y2="108" marker-end="url(#arr)"/>
        <line x1="240" y1="127" x2="212" y2="127" marker-end="url(#arr)"/>
        <line x1="130" y1="127" x2="102" y2="127" marker-end="url(#arr)"/>
        <line x1="60" y1="110" x2="60" y2="56" marker-end="url(#arr)"/>
      </g>
      <g class="you"><circle cx="300" cy="212" r="7"/><text x="286" y="216" text-anchor="end">ТЫ</text></g>
    </svg>
    <p>Ты здесь. Сбоку. Как и все, кто спрашивал.</p>`);
  unlock("scheme");
});

// 6. Title: three clicks try to "transform" the unemployed
clicks($("title-word"), 3, 1500, () => {
  const w = $("title-word");
  if (w.dataset.busy) return;
  w.dataset.busy = "1";
  sfx.egg();
  w.classList.add("glitch");
  w.textContent = "Работающего";
  setTimeout(() => {
    w.textContent = "Безработного";
    w.classList.remove("glitch");
    delete w.dataset.busy;
    toast("Ошибка трансформации", "Откат к стабильной версии: безработный.");
    unlock("title_job");
  }, 1600);
});

// 7. Keyboard: Konami code and typed words (ignored while typing in fields)
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
let codes = [];
let typed = "";
document.addEventListener("keydown", (e) => {
  bumpIdle();
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;

  codes = [...codes, e.code].slice(-KONAMI.length);
  if (codes.join() === KONAMI.join()) {
    codes = [];
    sfx.egg();
    rain(["🏀", "💸", "🎮"], 34);
    overlay(`<p class="overlay-big">🎮</p><h2>Чит-код активирован</h2><p>+1 рабочий день добавлен в резюме Фила.</p><p class="muted">…шутка. Их всё ещё ноль.</p>`);
    unlock("konami");
    return;
  }

  if (e.key && e.key.length === 1) typed = (typed + e.key.toLowerCase()).slice(-12);
  if (/x23x$|ч23ч$/.test(typed)) {
    typed = "";
    sfx.egg();
    rain("🏀", 30);
    toast("🎽 x23x в здании", "Старый ник, вечная легенда.");
    unlock("nick");
  } else if (/аджика$|adjika$/.test(typed)) {
    typed = "";
    sfx.egg();
    rain("🌶️", 36);
    document.body.classList.add("spicy");
    setTimeout(() => document.body.classList.remove("spicy"), 2600);
    toast("🌶️ Остренько!", "Фил одобряет. Добавь ещё ложку.");
    unlock("spicy");
  } else if (/poe$|зщу$/.test(typed)) {
    typed = "";
    sfx.egg();
    const orb = document.createElement("div");
    orb.className = "orb-drop";
    orb.innerHTML = '<span class="orb"></span><b>Сфера возвышения</b><small>Продано через РМТ за 30 центов</small>';
    document.body.append(orb);
    setTimeout(() => orb.remove(), 3800);
    unlock("exalt");
  }
});

// 8. Night visit
const hour = new Date().getHours();
if (hour >= 0 && hour < 5) setTimeout(() => unlock("nightowl"), 1500);

// 9. Two minutes of doing nothing
let idleTimer = null;
function bumpIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    toast("💤 AFK", "Фил бы уже докурил. Хотя нет, не докурил бы.");
    unlock("afk");
  }, 120000);
}
["mousemove", "pointerdown", "scroll", "touchstart"].forEach((ev) => document.addEventListener(ev, bumpIdle, { passive: true }));

/* ---------- RMT exchange: cheapest Divine Orb on FunPay ---------- */
const fmtPrice = (x) => x.toLocaleString("ru-RU", { maximumSignificantDigits: 3 });

function minutesAgo(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  return `${h} ${plural(h, "час", "часа", "часов")} назад`;
}

async function loadPrices() {
  if (!API) return;
  try {
    const data = await api("/prices");
    const rows = [["poe1", "PoE 1"], ["poe2", "PoE 2"]]
      .map(([key, short]) => data.prices?.[key] && { short, ...data.prices[key] })
      .filter(Boolean);
    if (!rows.length) return;
    const box = $("rmt-rows");
    box.innerHTML = "";
    let converted = null;
    for (const r of rows) {
      if (r.source === "cbr" && r.original) converted = r;
      const a = document.createElement("a");
      a.className = "rmt-row";
      a.href = r.url;
      a.target = "_blank";
      a.rel = "noopener";
      const left = document.createElement("div");
      left.className = "rmt-game";
      const b = document.createElement("b");
      b.textContent = r.short;
      const lg = document.createElement("span");
      lg.textContent = r.league.replace(/^\(PC\)\s*/, "");
      const on = document.createElement("span");
      on.className = "rmt-online";
      on.textContent = `продавцов онлайн: ${r.onlineOffers} из ${r.offers}`;
      left.append(b, lg, on);

      const right = document.createElement("div");
      right.className = "rmt-price";
      const price = document.createElement("span");
      price.className = "rmt-num";
      price.textContent = r.price != null ? `${fmtPrice(r.price)} ₽` : "—";
      right.append(price);
      if (r.price != null && r.prev) {
        const diff = ((r.price - r.prev) / r.prev) * 100;
        const t = document.createElement("span");
        // Phil sells, so a rising price is good news
        t.className = "rmt-trend " + (diff >= 0 ? "up" : "down");
        t.textContent = `${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(1)}%`;
        right.append(t);
      }
      const sub = document.createElement("span");
      sub.className = "rmt-sub";
      sub.textContent = r.price != null
        ? `100 шт ≈ ${fmtPrice(r.price * 100)} ₽`
        : "сейчас нет продавцов онлайн";
      right.append(sub);
      a.append(left, right);
      box.append(a);
    }
    $("rmt-upd").textContent = data.updatedAt ? `FunPay · ${minutesAgo(data.updatedAt)}` : "FunPay";
    $("rmt-note").textContent = "Самая низкая цена за 1 Divine Orb у продавцов онлайн в текущей лиге. Обновляется раз в 20 минут." +
      (converted ? ` FunPay показывает цены в ${converted.original.unit}, пересчитано по курсу ЦБ: 1 ${converted.original.unit} = ${fmtPrice(converted.rate)} ₽.` : "");
    $("rmt").hidden = false;
  } catch (e) { console.error(e); }
}

/* ---------- Side-court baskets (separate from quiz points) ---------- */
const BASKET_KEY = "phill_quiz_baskets";
let baskets = 0;
const basketKey = (name) => `${BASKET_KEY}:${nameKey(name) || "_anon"}`;

function renderBaskets() {
  $("hoop-count").textContent = baskets;
}

async function syncBaskets(name) {
  baskets = store.get(basketKey(name), 0);
  if (API && name) {
    try {
      // Baskets made before entering a name are added to that name once
      const anon = store.get(basketKey(""), 0);
      if (anon > 0) {
        await api("/baskets", { method: "POST", body: JSON.stringify({ name, add: Math.min(50, anon) }) });
        store.set(basketKey(""), 0);
      }
      const stats = await api(`/player?name=${encodeURIComponent(name)}`);
      baskets = stats.baskets || 0;
      store.set(basketKey(name), baskets);
    } catch (e) { console.error(e); }
  }
  renderBaskets();
}

function scoredBasket() {
  const name = getName();
  baskets++;
  store.set(basketKey(name), baskets);
  renderBaskets();
  $("hoop-hud").classList.remove("bump");
  void $("hoop-hud").offsetWidth;
  $("hoop-hud").classList.add("bump");
  sfx.swish();
  if (API && name) {
    api("/baskets", { method: "POST", body: JSON.stringify({ name, add: 1 }) })
      .then((r) => { baskets = Math.max(baskets, r.baskets); store.set(basketKey(name), baskets); renderBaskets(); })
      .catch(() => {});
  }
  if (baskets >= 1) unlock("basket1");
  if (baskets >= 10) unlock("basket10");
  if (baskets >= 23) unlock("basket23");
}

function playCourtSound(kind, power) {
  if (kind === "rim") sfx.rim();
  else if (kind === "bounce") sfx.bounce(power);
  else if (kind === "swish") sfx.swish();
  else if (kind === "brick") sfx.brick();
}

const hoopGame = initHoop({
  onBasket: scoredBasket,
  onDunk: () => { sfx.brick(); unlock("dunk"); },
  sound: playCourtSound
});
if (new URLSearchParams(location.search).has("debug")) window.__hoop = hoopGame; // for automated checks only

/* ---------- Startup ---------- */
$("player-name").value = getName();
$("fact-block").hidden = !API;
updateFoot();
syncAch(getName()); // also syncs baskets
bumpIdle();
renderBoard($("board-start"));
loadGenerated().then(updateFoot);
loadPrices();
setInterval(loadPrices, 10 * 60 * 1000);
