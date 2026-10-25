import { QUIZ, API_URL } from "./config.js";

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
}

function unlock(id) {
  const a = ACH_BY_ID[id];
  if (!a || unlocked.has(id)) return;
  unlocked.add(id);
  saveLocalAch();
  toast(`${a.icon} Ачивка: ${a.title}`, a.desc);
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
  const right = text === cur.correct;
  const took = performance.now() - game.shownAt;

  if (right) { game.score++; game.streak++; game.misses = 0; }
  else { game.streak = 0; game.misses++; }

  if (took < 1500) unlock("fast");
  if (took > 60000) unlock("slow");
  if (game.streak >= 5) unlock("streak5");
  if (game.misses >= 3) unlock("brick3");
  if (!right && WORK_WORDS.test(text)) unlock("workaholic");
  if (right && /аджик/i.test(cur.q + " " + cur.correct)) unlock("adjika");

  $("live-score").textContent = game.score;
  $("call").textContent = right ? pickOne(SWISH) : pickOne(BRICK);
  $("call").className = "call " + (right ? "swish" : "brick");
  document.querySelectorAll(".answer").forEach((b) => {
    b.disabled = true;
    const val = b.lastChild.textContent;
    if (val === cur.correct) b.classList.add("correct");
    else if (b === btn) b.classList.add("wrong");
    else b.classList.add("dim");
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
  if (comeback) {
    toast("I'm back.", "Фил тоже однажды вернётся. На работу — вряд ли.");
    unlock("jersey45");
  } else {
    toast("Классика", "Номер 23 вернулся на место.");
  }
});

// 2. Smoke above the jersey: five puffs
clicks($("smoke"), 5, 2500, () => {
  overlay(`<p class="overlay-big">💨</p><h2>Фил вышел покурить</h2><p>Вернётся через 5 минут. По его часам — через полтора часа.</p>`, "smoky");
  unlock("smoke");
}, (n, e) => {
  e.stopPropagation();
  const puff = document.createElement("span");
  puff.className = "puff";
  $("smoke").append(puff);
  setTimeout(() => puff.remove(), 1200);
});

// 3. Bath bubbles: pop ten
let popped = 0;
document.querySelectorAll(".bubbles i").forEach((b) => {
  b.addEventListener("click", () => {
    if (b.classList.contains("pop")) return;
    b.classList.add("pop");
    popped++;
    setTimeout(() => {
      b.classList.remove("pop");
      b.style.animation = "none";
      void b.offsetWidth;
      b.style.animation = "";
    }, 450);
    if (popped === 10) {
      toast("🛁 Буль!", "Фил бы не одобрил: пена — это святое.");
      unlock("bubbles");
    }
  });
});

// 4. Scoreboard ball: 23 dribbles
let dribbles = 0;
$("sb-ball").addEventListener("click", () => {
  dribbles++;
  const ball = $("sb-ball");
  ball.classList.remove("bounce");
  void ball.offsetWidth;
  ball.classList.add("bounce");
  if (dribbles === 23) {
    rain("🏀", 23);
    toast("⛹️ 23 касания", "Майкл бы кивнул. Фил бы спросил, где он в этой схеме.");
    unlock("dribble");
  }
});

// 5. "Где ты в этой схеме?" opens the actual scheme
$("scheme-link").addEventListener("click", () => {
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
    rain(["🏀", "💸", "🎮"], 34);
    overlay(`<p class="overlay-big">🎮</p><h2>Чит-код активирован</h2><p>+1 рабочий день добавлен в резюме Фила.</p><p class="muted">…шутка. Их всё ещё ноль.</p>`);
    unlock("konami");
    return;
  }

  if (e.key && e.key.length === 1) typed = (typed + e.key.toLowerCase()).slice(-12);
  if (/x23x$|ч23ч$/.test(typed)) {
    typed = "";
    rain("🏀", 30);
    toast("🎽 x23x в здании", "Старый ник, вечная легенда.");
    unlock("nick");
  } else if (/аджика$|adjika$/.test(typed)) {
    typed = "";
    rain("🌶️", 36);
    document.body.classList.add("spicy");
    setTimeout(() => document.body.classList.remove("spicy"), 2600);
    toast("🌶️ Остренько!", "Фил одобряет. Добавь ещё ложку.");
    unlock("spicy");
  } else if (/poe$|зщу$/.test(typed)) {
    typed = "";
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

/* ---------- Startup ---------- */
$("player-name").value = getName();
$("fact-block").hidden = !API;
updateFoot();
syncAch(getName());
bumpIdle();
renderBoard($("board-start"));
loadGenerated().then(updateFoot);
