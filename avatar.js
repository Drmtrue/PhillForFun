import { TALENTS, TALENT_LINES, progressFrom } from "./talents.js?v=202610251915";

// Phil the mascot: a 3D cartoon Phil who walks along the bottom of the screen (phil3d.js), with a flat
// anime-style SVG badge as the fallback. He reacts to game events with a speech bubble and now and
// then lights a cigarette (his signature move).
// Usage: const phil = initAvatar(); phil.say("wrong");

// Each event has several lines; a line picked at random (never the same one twice in a row).
// A line may be { t, smoke: true } to light up while saying it.
const LINES = {
  start: {
    mood: "smug", pri: 2, lines: [
      "Ну погнали. Посмотрим, кто меня знает.",
      "Только не говори, что ты меня не знаешь.",
      "Давай, удиви меня. Я жду, лёжа."
    ]
  },
  correct: {
    mood: "happy", pri: 2, lines: [
      "Пошла вода горячая!",
      "Это было збс.",
      "Ну с пивком потянет.",
      "Вот это я понимаю — знает меня.",
      "Красава. Почти как MJ в 98-м.",
      "Засчитано. Можно и в ванну.",
      "Угадал. Ты что, следишь за мной?"
    ]
  },
  wrong: {
    mood: "sad", pri: 2, lines: [
      "Это тебе не диваны на фанпее покупать.",
      "МДА.. Лучше бы коробки в доте покрутил..",
      { t: "Ладно.. Ты пока тренируйся, а я пойду покурю.", smoke: true },
      "Где я в этой схеме? Точно не там.",
      "Мимо. Даже аджика в шоке.",
      "Ты меня вообще знаешь?",
      "Пойду полежу в ванне, переживу это."
    ]
  },
  ftStart: {
    mood: "smug", pri: 2, lines: [
      "Ну давай, штрафной. Не опозорь x23x.",
      "Кидай. Это проще, чем найти работу.",
      "Второй шанс. У меня их было много."
    ]
  },
  ftMade: {
    mood: "happy", pri: 2, lines: [
      "Swish! Джордан бы одобрил.",
      "Пошла вода горячая! Отвечай заново.",
      "Это было збс. Теперь не тупи."
    ]
  },
  ftMiss: {
    mood: "sad", pri: 2, lines: [
      "Кирпич. Как моя трудовая — пустая.",
      "Это тебе не диваны на фанпее покупать.",
      "МДА.. Лучше бы коробки в доте покрутил..",
      { t: "Ладно.. Ты пока тренируйся, а я пойду покурю.", smoke: true }
    ]
  },
  ftSkip: {
    mood: "smug", pri: 2, lines: [
      "Даже не бросил? Узнаю себя.",
      "Не бросать — это по-моему. Экономия сил.",
      "Правильно, зачем напрягаться."
    ]
  },
  basket: {
    mood: "happy", pri: 1, lines: [
      "Пошла вода горячая!",
      "Чисто! Как x23x в лучшие годы.",
      "Ну с пивком потянет.",
      "+1. На работу бы так попадал.",
      "Это было збс."
    ]
  },
  miss: {
    mood: "sad", pri: 1, chance: 0.55, lines: [
      "МДА.. Лучше бы коробки в доте покрутил..",
      "Это тебе не диваны на фанпее покупать.",
      { t: "Ладно.. Ты пока тренируйся, а я пойду покурю.", smoke: true },
      "Мимо. Ничего, я тоже по жизни мимо.",
      "Кидай ещё — времени полно, работы нет."
    ]
  },
  dunk: {
    mood: "shock", pri: 2, lines: [
      "Данк не считается, но выглядело збс.",
      "Ты на кольце повис? Слезай."
    ]
  },
  achievement: {
    mood: "happy", pri: 0, chance: 0.45, lines: [
      "О, ачивка! Мне такие не дают.",
      "Ачивка! Повесь в рамочку.",
      "Ну с пивком потянет."
    ]
  },
  faceOn: {
    mood: "shock", pri: 3, lines: [
      "Э! Это моё лицо! Не крути меня!",
      "Меня закрутили… голова кружится.",
      "Я теперь мяч? Ну хоть не работа."
    ]
  },
  faceOff: {
    mood: "smug", pri: 3, lines: [
      "Фух, опять мяч. Голова на месте.",
      "Верните как было… а, уже вернули."
    ]
  },
  idle: {
    mood: "neutral", pri: 0, lines: [
      "Ты там уснул? Я вот всегда сплю.",
      { t: "Пока ты думаешь, я покурю.", smoke: true },
      "Может, в PoE зайдём? Диваны сами себя не нафармят.",
      "Пойду наберу ванну, позовёшь."
    ]
  },
  click: {
    mood: "random", pri: 3, lines: [
      "Где я в этой схеме?",
      "Аджика подходит ко всему. Даже к этому квизу.",
      "x23x на связи.",
      "Работа подождёт. Она всегда ждёт.",
      "Сначала ванна, потом всё остальное.",
      "Пошла вода горячая.",
      { t: "Не тыкай, я курю.", smoke: true },
      "Диваны падают, а я нет."
    ]
  },
  endPerfect: { mood: "happy", pri: 3, lines: ["10 из 10?! Ты меня знаешь лучше мамы.", "Пошла вода горячая! Это было збс."] },
  endGood: { mood: "happy", pri: 3, lines: ["Неплохо. С пивком потянет.", "Почти идеально, как и я."] },
  endBad: { mood: "sad", pri: 3, lines: ["МДА.. Мы точно знакомы?", "Это тебе не диваны на фанпее покупать."] },
  endZero: { mood: "shock", pri: 3, lines: ["Ноль? Ты вообще кто?", "Ноль. Даже я на работе дольше продержался."] },
  shootStart: {
    mood: "smug", pri: 1, chance: 0.6, lines: [
      "Отойдите, профи работает.",
      "Смотрите и учитесь.",
      "Ща покажу, как надо.",
      "Мяч скучает. Сейчас исправим."
    ]
  },
  noHoop: { mood: "sad", pri: 3, lines: ["Кольца нет — бросать некуда. Разверни окно пошире.", "Тут даже кольца нет. Как и работы."] },
  // The 5% roll came up: he calls the shot before taking it
  callShot: { mood: "smug", pri: 3, lines: ["Скриньте - один раз показываю"] },
  // Phil missed his own shot: everything and everyone is to blame
  blame: {
    mood: "sad", pri: 3, lines: [
      "Мяч кривой! Кто его вообще надувал?",
      "Это кольцо двигается, я видел!",
      "Ветер. Определённо ветер.",
      "Лаги! У меня пинг 300!",
      "Солнце в глаза, честно.",
      "Пол скользкий, кто тут разлил аджику?",
      "Это всё вы, отвлекаете!",
      "Кольцо на сантиметр выше нормы, я замерял.",
      "Кроссовки не те. В Джорданах бы попал.",
      "Админ подкрутил физику, сто процентов.",
      "Монитор у тебя кривой, вот и промазал я.",
      "Это FunPay виноват. И диваны. Всё из-за диванов."
    ]
  },
  // Phil made it (5% chance): smoke, shades, and a word for the noobs
  pwned: {
    mood: "smug", pri: 3, lines: [
      "Учитесь, нубы. Вот так играет x23x.",
      "5% шанс? Для меня это 100%.",
      "Вы все нубы по сравнению со мной. MJ бы плакал.",
      "Изи. Даже без разминки.",
      "Скриньте, нубяры. Такое раз в жизни.",
      "Кто там говорил, что я не умею? Нубы.",
      "Вам до меня как до работы. Мне. Далеко."
    ]
  },
  smoke: { mood: "smug", pri: 0, chance: 0.5, lines: ["Перекур.", "Пошёл дым.", "Вот теперь можно и подумать."] }
};

const MOODS = ["neutral", "happy", "sad", "shock", "smug"];
const last = {};
let unlockedPools = new Set(); // ids of line pools unlocked through talents (set by setProgress)
function pickLine(key, ev = LINES[key]) {
  // Unlocked talent lines join the pool for that event (base lines stay, so he does not repeat only the new ones)
  let list = ev.lines;
  const extra = [];
  for (const pool of unlockedPools) for (const t of TALENT_LINES[pool]?.[key] || []) extra.push(t);
  if (extra.length) list = list.concat(extra);
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === last[key]) i = (i + 1) % list.length;
  if (extra.length && Math.random() < 0.5) i = list.length - 1 - Math.floor(Math.random() * extra.length); // prefer sharp lines half the time
  last[key] = i;
  const l = list[i];
  return typeof l === "string" ? { t: l } : l;
}

const SVG = `
<svg viewBox="0 0 120 120" aria-hidden="true">
  <defs>
    <clipPath id="phil-clip"><circle cx="60" cy="60" r="56"/></clipPath>
    <radialGradient id="phil-bg" cx="50%" cy="35%" r="70%">
      <stop offset="0" stop-color="#5a1414"/><stop offset="1" stop-color="#1a0606"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="58" fill="url(#phil-bg)" stroke="#e8a33d" stroke-width="3"/>
  <g clip-path="url(#phil-clip)">
    <!-- shirt and neck -->
    <path d="M12 124 C16 102 36 96 60 96 C84 96 104 102 108 124 Z" fill="#1d1d24"/>
    <text x="60" y="113" text-anchor="middle" class="av-23">23</text>
    <path d="M46 97 C50 104 70 104 74 97" fill="none" stroke="#33333d" stroke-width="3"/>
    <path d="M50 82 h20 v15 c-6 5 -14 5 -20 0 Z" fill="#e7b392"/>
    <!-- ears -->
    <ellipse cx="32" cy="60" rx="5" ry="8" fill="#f0c4a2"/>
    <ellipse cx="88" cy="60" rx="5" ry="8" fill="#f0c4a2"/>
    <!-- face -->
    <path d="M33 50 C33 28 45 19 60 19 C75 19 87 28 87 50 C87 70 79 86 60 89 C41 86 33 70 33 50 Z" fill="#f7d3b5"/>
    <!-- stubble -->
    <path d="M38 66 C42 82 50 88 60 88.5 C70 88 78 82 82 66 C78 76 70 80 60 80 C50 80 42 76 38 66 Z" fill="#a8866a" opacity=".28"/>
    <path d="M52 76 C56 74 64 74 68 76" fill="none" stroke="#a8866a" stroke-width="2.4" opacity=".3" stroke-linecap="round"/>
    <!-- buzz cut -->
    <path d="M32 50 C31 27 44 15 60 15 C76 15 89 27 88 50 C85 38 78 30 60 30 C42 30 35 38 32 50 Z" fill="#c9a37a"/>
    <path d="M38 37 l2 -4 M45 32 l1 -4 M53 30 l1 -4 M61 30 l0 -4 M69 31 l-1 -4 M77 34 l-1 -4 M83 39 l-2 -3" stroke="#a9845c" stroke-width="1.4" stroke-linecap="round"/>
    <!-- blush -->
    <ellipse cx="42" cy="70" rx="5" ry="2.6" fill="#ff8a8a" opacity=".35"/>
    <ellipse cx="78" cy="70" rx="5" ry="2.6" fill="#ff8a8a" opacity=".35"/>
    <!-- brows -->
    <g class="mood mood-neutral mood-happy" stroke="#8c6a48" stroke-width="2.6" stroke-linecap="round">
      <path d="M40 47 q7 -4 13 -1"/><path d="M67 46 q6 -3 13 1"/>
    </g>
    <g class="mood mood-sad" stroke="#8c6a48" stroke-width="2.6" stroke-linecap="round">
      <path d="M40 46 q7 2 13 -2"/><path d="M67 44 q6 4 13 2"/>
    </g>
    <g class="mood mood-shock" stroke="#8c6a48" stroke-width="2.6" stroke-linecap="round">
      <path d="M40 42 q7 -5 13 -2"/><path d="M67 40 q6 -3 13 2"/>
    </g>
    <g class="mood mood-smug" stroke="#8c6a48" stroke-width="2.6" stroke-linecap="round">
      <path d="M40 46 q7 -2 13 0"/><path d="M67 43 q6 -4 13 0"/>
    </g>
    <!-- open eyes -->
    <g class="mood mood-neutral mood-sad mood-shock eyes">
      <g class="eye"><ellipse cx="47" cy="58" rx="6" ry="7.5" fill="#fff"/><ellipse cx="47.5" cy="59" rx="4.4" ry="5.8" fill="#6f8ea6"/><ellipse cx="47.5" cy="60" rx="2.2" ry="3" fill="#1d2a36"/><circle cx="45.6" cy="56.4" r="1.6" fill="#fff"/><circle cx="49.4" cy="62" r=".8" fill="#fff"/><path d="M40.5 52.5 q6.5 -4 13 0" stroke="#2a1d14" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>
      <g class="eye"><ellipse cx="73" cy="58" rx="6" ry="7.5" fill="#fff"/><ellipse cx="72.5" cy="59" rx="4.4" ry="5.8" fill="#6f8ea6"/><ellipse cx="72.5" cy="60" rx="2.2" ry="3" fill="#1d2a36"/><circle cx="70.6" cy="56.4" r="1.6" fill="#fff"/><circle cx="74.4" cy="62" r=".8" fill="#fff"/><path d="M66.5 52.5 q6.5 -4 13 0" stroke="#2a1d14" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>
    </g>
    <!-- half-lidded smug eyes -->
    <g class="mood mood-smug">
      <ellipse cx="47" cy="59.5" rx="6" ry="4.5" fill="#fff"/><ellipse cx="47.5" cy="60.5" rx="4.2" ry="4" fill="#6f8ea6"/><circle cx="47.5" cy="61" r="2.2" fill="#1d2a36"/><circle cx="46" cy="59.5" r="1.1" fill="#fff"/>
      <ellipse cx="73" cy="59.5" rx="6" ry="4.5" fill="#fff"/><ellipse cx="72.5" cy="60.5" rx="4.2" ry="4" fill="#6f8ea6"/><circle cx="72.5" cy="61" r="2.2" fill="#1d2a36"/><circle cx="71" cy="59.5" r="1.1" fill="#fff"/>
      <path d="M40.5 56.5 h13 M66.5 56.5 h13" stroke="#2a1d14" stroke-width="2.4" stroke-linecap="round"/>
    </g>
    <!-- happy closed eyes ^ ^ -->
    <g class="mood mood-happy" stroke="#2a1d14" stroke-width="2.6" fill="none" stroke-linecap="round">
      <path d="M41 60 q6 -7 12 0"/><path d="M67 60 q6 -7 12 0"/>
    </g>
    <!-- sweat drop -->
    <path class="mood mood-sad mood-shock" d="M84 44 q3 5 0 7 q-3 -2 0 -7 Z" fill="#9ad3ff"/>
    <!-- nose -->
    <path d="M60 64 l-2.2 6 h3.4" stroke="#d29a78" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <!-- mouths -->
    <path class="mood mood-neutral" d="M54 78 q6 1.6 12 0" stroke="#7a3b2e" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path class="mood mood-happy" d="M52 75.5 q8 0 16 0 q-2 8 -8 8 q-6 0 -8 -8 Z" fill="#7a2e26" stroke="#7a2e26" stroke-width="1.2" stroke-linejoin="round"/>
    <path class="mood mood-sad" d="M54 80 q6 -4 12 0" stroke="#7a3b2e" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse class="mood mood-shock" cx="60" cy="79" rx="3.6" ry="4.4" fill="#7a2e26"/>
    <path class="mood mood-smug" d="M54 78.5 q8 1 13 -3" stroke="#7a3b2e" stroke-width="2" fill="none" stroke-linecap="round"/>
    <!-- cigarette -->
    <g class="cig">
      <path d="M65 78.5 L86 82.5" stroke="#f3efe6" stroke-width="3.4" stroke-linecap="butt"/>
      <path d="M65 78.5 L70 79.5" stroke="#d98c3a" stroke-width="3.6"/>
      <circle class="ember" cx="86.6" cy="82.6" r="1.9"/>
      <g class="puffs">
        <circle cx="88" cy="78" r="3"/><circle cx="90" cy="74" r="4"/><circle cx="87" cy="70" r="5"/>
      </g>
    </g>
    <!-- hand with lighter -->
    <g class="lighter-hand">
      <rect x="84" y="86" width="7" height="12" rx="1.5" fill="#d33b2c"/>
      <rect x="84" y="84.5" width="7" height="3" rx="1" fill="#b8b8c0"/>
      <path class="flame" d="M87.5 84.5 c-3 -3 -1 -6 0 -9 c1 3 3 6 0 9 Z" fill="#ffb02e"/>
      <ellipse cx="88" cy="103" rx="11" ry="9" fill="#efc09d"/>
      <path d="M79 98 q4 -3 8 -1 M80 102 q4 -2 8 0" stroke="#d29a78" stroke-width="1.3" fill="none"/>
    </g>
  </g>
</svg>`;

// Body movement per event for the 3D Phil (falls back to the event's mood)
const ACTS = { start: "wave", click: ["wave", "happy", "smug", "shock"], faceOn: "shock", faceOff: "smug", blame: "angry", pwned: "smug" };

// onLine(key, text): called with every line Phil says (key is the LINES name or the pool id), e.g. for the event feed
export function initAvatar({ onLine, onContext } = {}) {
  const root = document.createElement("div");
  root.className = "phil-av";
  root.dataset.mood = "neutral";
  root.innerHTML = `<div class="phil-bubble" role="status" aria-live="polite" hidden></div>`;
  document.body.append(root);
  const bubble = root.querySelector(".phil-bubble");

  let body3d = null;           // the walking 3D Phil, once Three.js has loaded
  let hideTimer = null, moodTimer = null, current = null, lastSaid = 0;
  let smoking = false, smokeTimers = [];

  // Prefer the 3D Phil; if WebGL or the library is unavailable, show the flat SVG badge instead
  import("./phil3d.js?v=202610251915")
    .then(({ createPhil3D }) => {
      body3d = createPhil3D(root, {
        bubble,
        onClick: () => say("click", { force: true }),
        onContext: () => { if (!(onContext && onContext() === false)) shootNow(); } // right click: go shoot now (a hook may swallow it)
      });
      root.classList.add("phil-3d");
    })
    .catch((e) => {
      console.warn("3D Phil unavailable, using the flat avatar", e);
      const face = document.createElement("button");
      face.type = "button";
      face.className = "phil-face";
      face.title = "Фил";
      face.innerHTML = SVG;
      face.addEventListener("click", () => say("click", { force: true }));
      face.addEventListener("contextmenu", (e) => { e.preventDefault(); onContext && onContext(); });
      root.append(face);
    });

  function setMood(mood) {
    root.dataset.mood = mood === "random" ? MOODS[Math.floor(Math.random() * MOODS.length)] : mood;
    clearTimeout(moodTimer);
    moodTimer = setTimeout(() => { if (!smoking) root.dataset.mood = "neutral"; }, 4200);
  }

  function smoke() {
    if (body3d) { body3d.smoke(); return; }
    if (smoking) return;
    smoking = true;
    smokeTimers.forEach(clearTimeout);
    root.dataset.mood = "smug";
    const at = (ms, fn) => smokeTimers.push(setTimeout(fn, ms));
    root.classList.add("cig-on");
    at(250, () => root.classList.add("lighter-up"));
    at(900, () => root.classList.add("flame-on"));
    at(1700, () => { root.classList.add("lit"); root.classList.remove("flame-on"); });
    at(2100, () => root.classList.remove("lighter-up"));
    at(2300, () => root.classList.add("puffing"));
    at(9500, () => {
      root.classList.remove("cig-on", "lit", "puffing");
      smoking = false;
      root.dataset.mood = "neutral";
    });
  }
  const isSmoking = () => (body3d ? body3d.busy : smoking);

  // ----- Talents: animations and lines unlocked by everyone's play
  let progress = progressFrom({});
  const unlockedAnims = () => TALENTS.filter((t) => t.anim && progress.unlocked.has(t.id)).map((t) => t.anim);
  function setProgress(xp) {
    const before = progress.unlocked;
    progress = progressFrom(xp);
    unlockedPools = new Set(TALENTS.filter((t) => t.lines && progress.unlocked.has(t.id)).map((t) => t.lines));
    const fresh = TALENTS.filter((t) => progress.unlocked.has(t.id) && !before.has(t.id));
    return fresh;
  }
  // Scenes tied to game moments: played only when that talent is open
  const SCENE_FOR = { wrong: ["facepalm"], correct: ["think"], basket: ["loot"], endZero: ["facepalm"], farm_stack: ["divine"], farm_scam: ["rage"], bath_start: ["bath", "bathduck"] };
  function playScene(name) {
    if (!body3d || !progress.unlocked.size || document.hidden) return false;
    const have = unlockedAnims();
    if (!have.includes(name)) return false;
    return body3d.play(name);
  }
  function sceneFor(key) {
    const list = (SCENE_FOR[key] || []).filter((n) => unlockedAnims().includes(n));
    if (!list.length || Math.random() > 0.5) return;
    body3d.play(list[list.length - 1]); // the highest unlocked variant (e.g. bath with the duck)
  }
  // Idle show: every 40–90 s he performs one of the unlocked animations
  (function scheduleShow() {
    setTimeout(() => {
      const have = unlockedAnims();
      if (have.length && body3d && !body3d.busy && bubble.hidden && !document.hidden) body3d.play(have[Math.floor(Math.random() * have.length)]);
      scheduleShow();
    }, 40000 + Math.random() * 50000);
  })();

  // ----- Phil shoots at the side-court hoop now and then (5% to make it)
  const MAKE_CHANCE = 0.05;
  let court = null;
  function tryShot(make = Math.random() < MAKE_CHANCE, force = false) {
    if (!body3d || !court || !court.enabled || document.hidden || document.querySelector(".ft-overlay")) return false;
    if (!force && body3d.busy) return false;
    if (!body3d.shoot(court, make, force)) return false;
    if (make) say("callShot", { force: true });
    else say("shootStart");
    return true;
  }
  // Right click on Phil. If the player is holding the ball (or it is still flying), he waits a few seconds for it.
  let pending = null;
  function shootNow() {
    if (!court || !court.enabled) { say("noHoop", { force: true }); return; }
    clearInterval(pending);
    const make = Math.random() < MAKE_CHANCE;
    if (tryShot(make, true)) return;
    let tries = 0;
    pending = setInterval(() => {
      if (tryShot(make, true) || ++tries > 20) clearInterval(pending);
    }, 300);
  }
  (function scheduleShot() {
    setTimeout(() => { tryShot(); scheduleShot(); }, 50000 + Math.random() * 70000);
  })();
  function courtResult(made) {
    if (!body3d) return;
    if (!made) { say("blame", { force: true }); return; }
    body3d.react("happy");
    setTimeout(() => body3d.smoke(), 1300);
    setTimeout(() => body3d.glasses(true), 1300 + 2800);
    setTimeout(() => say("pwned", { force: true }), 1300 + 3300);
    setTimeout(() => body3d.glasses(false), 1300 + 12500);
  }

  // Shows a line for an event. Lower-priority events do not interrupt a more important line,
  // and minor events are rate-limited so Phil does not talk over every click.
  // key: an event name from LINES, or a pool object { id, mood, pri, lines, act?, chance? } (used by mini-games)
  function say(key, { force = false } = {}) {
    const ev = typeof key === "string" ? LINES[key] : key;
    if (!ev) return;
    const now = performance.now();
    const busy = !bubble.hidden;
    if (!force) {
      if (ev.chance && Math.random() > ev.chance) return;
      if (busy && current && current.pri > ev.pri) return;
      if (ev.pri <= 1 && now - lastSaid < 3500) return;
    }
    const lineKey = typeof key === "string" ? key : ev.id;
    const line = pickLine(lineKey, ev);
    if (onLine) { try { onLine(lineKey, line.t, ev); } catch (_) { /* never break Phil */ } }
    current = { pri: ev.pri };
    lastSaid = now;
    bubble.textContent = line.t;
    bubble.hidden = false;
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
    if (body3d) {
      let act = ev.act || ACTS[key] || ev.mood;
      if (Array.isArray(act)) act = act[Math.floor(Math.random() * act.length)];
      if (!(line.smoke && !isSmoking())) body3d.react(act);
    } else {
      root.classList.remove("bob");
      void root.offsetWidth;
      root.classList.add("bob");
      if (!smoking) setMood(ev.mood);
    }
    if (line.smoke) setTimeout(smoke, 400);
    if (body3d && !body3d.busy) sceneFor(lineKey);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { bubble.hidden = true; current = null; }, Math.max(3200, line.t.length * 70));
  }

  // A smoke break every so often, his signature move
  (function scheduleSmoke() {
    setTimeout(() => {
      if (!document.hidden && bubble.hidden && !isSmoking()) {
        smoke();
        setTimeout(() => say("smoke"), 2600);
      }
      scheduleSmoke();
    }, 30000 + Math.random() * 40000);
  })();

  // Light blinking for the flat avatar (the 3D one blinks by itself)
  (function blink() {
    setTimeout(() => {
      if (!body3d) {
        root.classList.add("blink");
        setTimeout(() => root.classList.remove("blink"), 140);
      }
      blink();
    }, 2500 + Math.random() * 4000);
  })();

  return {
    say, smoke, el: root, useCourt: (c) => { court = c; }, courtResult, shoot: tryShot, setProgress, playScene,
    get progress() { return progress; },
    get body() { return body3d; },
    lines: LINES
  };
}
