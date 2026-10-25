import { QUIZ, firebase } from "./config.js";

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

/* ---------- Рейтинг: Firebase или локально ---------- */
let db = null;
let fs = null;

async function initStore() {
  if (!firebase) return;
  try {
    const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    fs = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    db = fs.getFirestore(appMod.initializeApp(firebase));
  } catch (e) {
    console.error("Firebase не подключился", e);
    db = null;
  }
}

async function saveScore(name, score, total) {
  if (db) {
    await fs.addDoc(fs.collection(db, "scores"), {
      name, score, total, createdAt: fs.serverTimestamp()
    });
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
  if (db) {
    const q = fs.query(fs.collection(db, "scores"), fs.orderBy("score", "desc"), fs.limit(300));
    const snap = await fs.getDocs(q);
    return snap.docs.map((d) => {
      const x = d.data();
      return { ...x, createdAt: x.createdAt?.toMillis?.() ?? Date.now() };
    });
  }
  return readLocal();
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
  { min: 0,  title: "Ты вообще кто?",              sub: "Где ты в этой схеме? Явно не рядом с Филом." },
  { min: 3,  title: "Знакомы по чату в POE",        sub: "Видел ник, пару раз здоровались. Не больше." },
  { min: 5,  title: "Вместе курили. Недолго",       sub: "Ну, по меркам Фила вы толком и не начинали." },
  { min: 7,  title: "Почти братан",                 sub: "Аджику тебе доверить можно. Схему — пока нет." },
  { min: 9,  title: "Правая рука в РМТ",            sub: "Ты знаешь о Филе больше, чем любой работодатель. Хотя их было немного." },
  { min: 10, title: "Ты и есть Фил?",               sub: "Идеально. Подозрительно идеально. Ты точно не безработный?" }
];

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
  const pool = window.QUESTIONS || [];
  const n = Math.min(QUIZ.questionsPerGame, pool.length);
  game = {
    name,
    questions: shuffle(pool).slice(0, n).map((q) => ({
      q: q.q,
      correct: q.correct,
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
  $("q-counter").textContent = `Вопрос ${i + 1} из ${questions.length}`;
  $("progress-bar").style.width = `${(i / questions.length) * 100}%`;
  $("q-text").textContent = cur.q;
  $("next-btn").hidden = true;

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
  $("verdict").textContent = v.title;
  $("verdict-sub").textContent = v.sub;
  $("save-status").textContent = "Сохраняю результат…";
  show("screen-result");

  try {
    await saveScore(game.name, game.score, total);
    $("save-status").textContent = db ? "" : "Рейтинг пока сохраняется только в этом браузере.";
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

$("again-btn").addEventListener("click", () => startGame(game.name));

$("share-btn").addEventListener("click", async () => {
  const data = { title: QUIZ.title, text: `Я набрал ${game.score}/${game.questions.length}. А ты знаешь Фила лучше?`, url: location.href };
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
$("foot").textContent = `В пуле ${(window.QUESTIONS || []).length} вопросов`;
await initStore();
renderBoard($("board-start"));
