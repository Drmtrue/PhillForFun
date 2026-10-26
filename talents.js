// Phil's talent tree. XP per branch comes from the server (everyone's actions count); levels and
// unlocks are derived here. Level n of a branch needs xpForLevel(n) total XP in that branch.
// Each talent unlocks an animation (`anim`, played by phil3d.js) and/or a set of sharp lines (`lines`).

export const BRANCHES = {
  hoops: { icon: "🏀", title: "Баскетбол", desc: "Броски в кольцо, штрафные, попадания Фила", stat: "Бросок" },
  farm: { icon: "💎", title: "РМТ-фарм", desc: "Лиги в «Фарме диванов»", stat: "Жадность" },
  chill: { icon: "🛁", title: "Релакс", desc: "Ванна, перекуры, комментарии Фила", stat: "Дзен" },
  mind: { icon: "🧠", title: "Эрудиция", desc: "Квизы, факты о Филе, ачивки", stat: "Схема" }
};

// Total XP needed to reach a level: 100, 300, 600, 1000, 1500 ... (quadratic, so late levels take a crowd)
export const xpForLevel = (n) => (n <= 0 ? 0 : 50 * n * (n + 1));
export const MAX_LEVEL = 10;

export function levelOf(xp) {
  let n = 0;
  while (n < MAX_LEVEL && xp >= xpForLevel(n + 1)) n++;
  return n;
}

export const TALENTS = [
  // ----- Баскетбол
  { id: "dribble", branch: "hoops", level: 1, icon: "🏀", title: "Дриблинг", desc: "Фил стучит мячом об пол, пока никто не смотрит.", anim: "dribble" },
  { id: "spin", branch: "hoops", level: 2, icon: "🌀", title: "Мяч на пальце", desc: "Крутит мяч на пальце, как в рекламе.", anim: "spin" },
  { id: "trash", branch: "hoops", level: 3, icon: "🗣️", title: "Трэш-ток", desc: "Комментирует чужие броски без жалости.", lines: "trash_hoops" },
  { id: "dunk", branch: "hoops", level: 4, icon: "🔥", title: "Данк в прыжке", desc: "Разбегается, взлетает и вколачивает сверху.", anim: "dunk" },
  { id: "mj", branch: "hoops", level: 6, icon: "🐐", title: "Режим MJ", desc: "Высовывает язык перед броском. Так положено.", lines: "mj" },
  { id: "glass", branch: "hoops", level: 8, icon: "💥", title: "Разбить щит", desc: "Данк такой силы, что щит разлетается вдребезги.", anim: "glassdunk" },
  { id: "goat", branch: "hoops", level: 10, icon: "👑", title: "Величайший", desc: "Фил теперь не промахивается. По его словам.", lines: "goat" },
  // ----- РМТ-фарм
  { id: "loot", branch: "farm", level: 1, icon: "🎁", title: "Нюх на лут", desc: "Фил радуется каждому дивану, как первому.", anim: "loot" },
  { id: "divine", branch: "farm", level: 2, icon: "💎", title: "Дроп дивана", desc: "Над головой падает Divine Orb. Иногда даже настоящий.", anim: "divine" },
  { id: "dota", branch: "farm", level: 3, icon: "🎮", title: "Катка в доту", desc: "Садится за компьютер и проигрывает мид.", anim: "dota" },
  { id: "funpay", branch: "farm", level: 4, icon: "💸", title: "Продавец с FunPay", desc: "Комментирует цены и покупателей.", lines: "funpay" },
  { id: "rage", branch: "farm", level: 6, icon: "⌨️", title: "Рейдж-квит", desc: "Кидает клавиатуру после слитой катки.", anim: "rage" },
  { id: "tycoon", branch: "farm", level: 8, icon: "🏦", title: "Магнат РМТ", desc: "Считает, сколько ещё лиг до компьютера. Вслух.", lines: "tycoon" },
  { id: "mirror", branch: "farm", level: 10, icon: "🪞", title: "Дроп Миррора", desc: "Выпал Mirror of Kalandra. Фил не верит сам себе.", anim: "mirror" },
  // ----- Релакс
  { id: "stretch", branch: "chill", level: 1, icon: "🙆", title: "Потягушки", desc: "Потягивается, будто только проснулся. Что правда.", anim: "stretch" },
  { id: "bath", branch: "chill", level: 2, icon: "🛁", title: "Ванна", desc: "Приезжает ванна, Фил ложится и пускает пар.", anim: "bath" },
  { id: "rings", branch: "chill", level: 3, icon: "💨", title: "Кольца дыма", desc: "Выпускает дымные кольца на перекуре.", anim: "rings" },
  { id: "lazy", branch: "chill", level: 4, icon: "😴", title: "Философ дивана", desc: "Острые мысли о работе и отдыхе.", lines: "lazy" },
  { id: "nap", branch: "chill", level: 6, icon: "💤", title: "Сон стоя", desc: "Засыпает прямо посреди экрана.", anim: "nap" },
  { id: "duck", branch: "chill", level: 8, icon: "🦆", title: "Уточка", desc: "В ванне появляется резиновая уточка.", anim: "bathduck" },
  { id: "zen", branch: "chill", level: 10, icon: "☯️", title: "Полный дзен", desc: "Левитирует в позе лотоса. Работа найдёт его сама.", anim: "levitate" },
  // ----- Эрудиция
  { id: "think", branch: "mind", level: 1, icon: "🤔", title: "Задумался", desc: "Чешет затылок, когда вы отвечаете.", anim: "think" },
  { id: "facepalm", branch: "mind", level: 2, icon: "🤦", title: "Фейспалм", desc: "Закрывает лицо рукой на особо плохих ответах.", anim: "facepalm" },
  { id: "roast", branch: "mind", level: 3, icon: "🔥", title: "Прожарка", desc: "Острые комментарии к ответам в квизе.", lines: "roast" },
  { id: "scheme", branch: "mind", level: 4, icon: "📋", title: "Где я в этой схеме", desc: "Достаёт схему и ищет на ней себя.", anim: "scheme" },
  { id: "glasses", branch: "mind", level: 6, icon: "🤓", title: "Умные очки", desc: "Поправляет очки перед умной фразой.", lines: "smart" },
  { id: "adjika", branch: "mind", level: 8, icon: "🌶️", title: "Аджика", desc: "Достаёт банку аджики и ест ложкой.", anim: "adjika" },
  { id: "oracle", branch: "mind", level: 10, icon: "🔮", title: "Оракул", desc: "Знает ответ раньше вас. И говорит об этом.", lines: "oracle" }
];

// Lines unlocked by talents; each pool is used by avatar.js like its built-in pools
export const TALENT_LINES = {
  trash_hoops: {
    basket: ["Залетело? Повезло. Повтори.", "Ладно, засчитано. Но форма — ужас.", "Так и я могу. С закрытыми глазами. В теории."],
    miss: ["Это был бросок или ты мяч ронял?", "Кольцо вон там, если что.", "Мой дед так кидал. Он тоже промахивался."],
    ftMiss: ["Штрафной — это когда попадают. Ты про другое.", "Линия штрафного плачет."],
    ftMade: ["Ну хоть штрафные умеешь. Уже что-то."]
  },
  mj: {
    shootStart: ["Язык наружу. Как MJ учил.", "Смотри: прыжок, язык, кольцо."],
    pwned: ["Air Phil. Запомни это имя.", "Шестое кольцо? Нет, это шестой мяч."]
  },
  goat: {
    blame: ["Я не промахнулся. Кольцо увернулось.", "Величайшие тоже промахиваются. Специально, для драмы."],
    shootStart: ["Величайший выходит на площадку. Тишина."]
  },
  funpay: {
    sell: ["Покупатель спросил скидку. Я спросил, кто он такой.", "Продал за минуту. Рынок меня уважает.", "Комиссию FunPay я записываю как благотворительность."],
    scam: ["Арбитраж? Да я сам кого хочешь арбитражну!", "Ещё один скам, и я иду в Standard."]
  },
  tycoon: {
    farm_start: ["Лига триста какая-то. Компьютер всё ближе. Наверное.", "Посчитал: ещё 40 лиг — и ПК мой."],
    idle: ["Пока ты сидишь, цена падает. Я считаю убытки."]
  },
  lazy: {
    idle: ["Работа — это когда платят за то, что ты не в ванне. Нет уж.", "Отдых перед отдыхом — основа режима.", "Я не ленивый. Я энергоэффективный."],
    click: ["Не трогай меня, я восстанавливаюсь.", "Полежу ещё минут сорок. Для здоровья."],
    smoke: ["Перекур — это пауза между перекурами."]
  },
  roast: {
    wrong: ["Ты меня вообще видел? Хоть раз?", "Такой ответ даже в доте не напишут.", "Ошибся так, будто нарочно. Нарочно?", "Это не ответ, это крик о помощи."],
    correct: ["Угадал. Или подглядел. Я слежу.", "Правильно. Подозрительно правильно."],
    endZero: ["Ноль из десяти. Ты точно сюда заходил?", "Хуже меня на собеседовании. Это достижение."]
  },
  smart: {
    correct: ["Поправлю очки: ответ верный, но я бы сформулировал тоньше.", "Факт. Хоть и очевидный."],
    wrong: ["С точки зрения науки — нет.", "Если бы ты читал схему, знал бы."],
    start: ["Очки надеты. Можно начинать экзамен."]
  },
  oracle: {
    start: ["Я уже знаю твой результат. Не скажу.", "Предсказываю: ошибёшься на третьем."],
    endPerfect: ["Я знал. Я всё знал.", "Так и было написано в схеме."],
    endBad: ["Я предупреждал. Схема не врёт."]
  }
};

// Everything derived from the server's per-branch XP
export function progressFrom(xp) {
  const levels = {}, unlocked = new Set(), next = {};
  for (const b of Object.keys(BRANCHES)) {
    const lvl = levelOf(xp[b] || 0);
    levels[b] = lvl;
    next[b] = lvl >= MAX_LEVEL ? null : { need: xpForLevel(lvl + 1), have: xp[b] || 0, from: xpForLevel(lvl) };
  }
  for (const t of TALENTS) if (levels[t.branch] >= t.level) unlocked.add(t.id);
  const total = Object.values(levels).reduce((a, b) => a + b, 0);
  return { levels, unlocked, next, total };
}
