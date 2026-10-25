import { QUIZ, API_URL } from "./config.js";

const $ = (id) => document.getElementById(id);
const NAME_COOKIE = "phill_quiz_name";
const LOCAL_KEY = "phill_quiz_scores";

/* ---------- Cookie с именем ---------- */
function getName() {
  const m = document.cookie.match(new RegExp("(?:^|; )" + NAME_COOKIE + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}
function setName(name) {
  document.cookie = `${NAME_COOKIE}=${encodeURIComponent(name)}; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
}

/* ---------- Сервер (Cloudflare) или локальный режим ---------- */
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
  const list = readLocal();
  list.push({ name, score, total, createdAt: Date.now() });
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch (_) {}
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; } catch (_) { return []; }
}

async function loadScores() {
  if (API) return (await api("/scores")).scores;
  return readLocal();
}

// Вопросы: встроенные + сгенерированные по фактам
let generated = [];
async function loadGenerated() {
  if (!API) return;
  try { generated = (await api("/questions")).questions || []; } catch (e) { console.error(e); }
}
function questionPool() {
  return [...(window.QUESTIONS || []), ...generated];
}

// Лучший результат каждого игрока; при равенстве выше тот, кто набрал раньше
function bestPerPlayer(rows) {
  const best = new Map();
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    const cur = best.get(key);
    if (!cur || r.score > cur.score || (r.score === cur.score && r.createdAt < cur.createdAt)) {
      best.set(key, r);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
}

async function renderBoard(el) {
  el.innerHTML = '<li class="muted">Загрузка…</li>';
  try {
    const rows = bestPerPlayer(await loadScores()).slice(0, 15);
    if (!rows.length) {
      el.innerHTML = '<li class="muted">Пока никого. Будь первым!</li>';
      return;
    }
    const me = getName().trim().toLowerCase();
    el.innerHTML = "";
    for (const r of rows) {
      const li = document.createElement("li");
      if (r.name.trim().toLowerCase() === me) li.className = "me";
      const n = document.createElement("span");
      n.className = "name";
      n.textContent = r.name;
      const p = document.createElement("span");
      p.className = "pts";
      p.textContent = `${r.score}/${r.total}`;
      li.append(n, p);
      el.append(li);
    }
  } catch (e) {
    console.error(e);
    el.innerHTML = '<li class="muted">Не удалось загрузить рейтинг</li>';
  }
}

/* ---------- Игра ---------- */
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

function verdictFor(score, total) {
  const scaled = Math.round((score / total) * 10);
  return VERDICTS.filter((v) => scaled >= v.min).pop();
}

let game = null;

function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
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
    score: 0
  };
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
}

function pick(btn, text) {
  const cur = game.questions[game.i];
  const right = text === cur.correct;
  if (right) game.score++;
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
  show("screen-result");

  try {
    await saveScore(game.name, game.score, total);
    $("save-status").textContent = API ? "" : "Рейтинг пока сохраняется только в этом браузере.";
  } catch (e) {
    console.error(e);
    $("save-status").textContent = "Не удалось сохранить результат.";
  }
  renderBoard($("board-result"));
}

/* ---------- События ---------- */
$("start-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("player-name").value.trim().slice(0, 30);
  if (!name) return;
  setName(name);
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

/* ---------- Добавление фактов ---------- */
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
  setName(author);
  $("fact-btn").disabled = true;
  $("fact-btn").textContent = "ИИ сочиняет…";
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
      await loadGenerated();
      updateFoot();
    } else {
      box.classList.add("bad");
      box.textContent = `Факт не принят: ${res.reason}`;
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

/* ---------- Запуск ---------- */
$("player-name").value = getName();
$("fact-block").hidden = !API;
updateFoot();
renderBoard($("board-start"));
loadGenerated().then(updateFoot);
