// Account (#/me) and the portal builder (#/create).
// Joining is invite-only: an invite code creates an account with a secret key kept in this browser.
// The builder walks through photos, facts, Root AI content, theme and animations, then preview and publish.

import { API_URL } from "./config.js?v=202610260531";
import { ACCOUNT_KEY, escapeHtml as esc } from "./portal.js?v=202610260531";

const API = API_URL.replace(/\/+$/, "");
const getKey = () => { try { return localStorage.getItem(ACCOUNT_KEY) || ""; } catch (_) { return ""; } };
const setKey = (k) => { try { k ? localStorage.setItem(ACCOUNT_KEY, k) : localStorage.removeItem(ACCOUNT_KEY); } catch (_) {} };

async function call(path, { method = "GET", body } = {}) {
  const key = getKey();
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Ошибка сервера"), { status: res.status, data });
  return data;
}

const LINE_LABELS = {
  start: "Начало квиза", correct: "Верный ответ", wrong: "Неверный ответ", ftStart: "Штрафной: начало", ftMade: "Штрафной: попал",
  ftMiss: "Штрафной: мимо", ftSkip: "Штрафной: отказался", basket: "Игрок попал в кольцо", miss: "Игрок промазал", dunk: "Данк (не засчитан)",
  achievement: "Ачивка", faceOn: "Мяч стал лицом", faceOff: "Мяч вернулся", idle: "Бездействие", click: "Клик по герою", endPerfect: "Квиз 10/10",
  endGood: "Квиз — хорошо", endBad: "Квиз — плохо", endZero: "Квиз — 0", shootStart: "Герой идёт бросать", noHoop: "Нет кольца",
  callShot: "Перед своим попаданием", blame: "Свой промах: винит всех", pwned: "Своё попадание: «нубы»", smoke: "Перекур (если курит)"
};
const ANIMS = {
  dribble: "Дриблинг", spin: "Мяч на пальце", dunk: "Данк в прыжке", glassdunk: "Данк с разбитым щитом", loot: "Танец радости", divine: "Сокровище с неба",
  dota: "Игра за компьютером", rage: "Рейдж-квит", mirror: "Зеркало с неба", stretch: "Потягушки", bath: "Ванна", bathduck: "Ванна с уточкой",
  rings: "Кольца дыма", nap: "Сон на подушке", levitate: "Левитация", think: "Задумался", facepalm: "Фейспалм", scheme: "Схема", adjika: "Острая еда"
};
const BRANCH_KEYS = ["hoops", "farm", "chill", "mind"];
const BRANCH_HINT = { hoops: "баскетбол", farm: "экономическая игра", chill: "отдых и реплики", mind: "квиз и ачивки" };

// Russian -> URL slug
function slugify(s) {
  const map = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
  return String(s).toLowerCase().split("").map((c) => map[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
}

// Downscale a photo in the browser (the original never leaves the device in full size)
function shrink(file, max = 768) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve({ canvas: c, b64: c.toDataURL("image/jpeg", 0.85).split(",")[1] });
    };
    img.onerror = () => reject(new Error("Не удалось открыть фото"));
    img.src = URL.createObjectURL(file);
  });
}
// Round-ready square crop of the face for the face-ball and the fallback avatar
function cropFace(canvas, f) {
  const side = Math.max(32, Math.min(canvas.width, canvas.height) * Math.max(0.15, Math.min(1, f.size)) * 1.25);
  const cx = f.x * canvas.width, cy = f.y * canvas.height;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  c.getContext("2d").drawImage(canvas, Math.max(0, cx - side / 2), Math.max(0, cy - side / 2), side, side, 0, 0, 256, 256);
  return c.toDataURL("image/jpeg", 0.85);
}

export function initCreate({ meRoot, createRoot, toast }) {
  let me = null, draft = null, busy = false, photos = [];

  async function refreshMe() {
    if (!getKey()) { me = null; return; }
    try { me = await call("/me"); } catch (e) { if (e.status === 401) { setKey(""); me = null; } }
  }
  async function refreshDraft() {
    if (!me) { draft = null; return; }
    try { draft = (await call("/builder/draft")).draft; } catch (_) { draft = null; }
  }

  // ---------- Join / account ----------
  function joinForm(where) {
    return `
      <div class="panel join">
        <div class="panel-head"><h2>Вход по приглашению</h2><span class="tag">только для своих</span></div>
        <p class="muted small">Портал можно создать только по приглашению участника. Попроси код у друга, который уже здесь.</p>
        <form class="cr-form" data-act="redeem">
          <input name="code" maxlength="20" placeholder="Код приглашения, например ABCD-EF23" required autocomplete="off">
          <input name="name" maxlength="30" placeholder="Как тебя зовут" required>
          <button class="btn primary">Войти</button>
        </form>
        <details class="cr-key-restore"><summary>У меня уже есть ключ доступа</summary>
          <form class="cr-form" data-act="restore"><input name="key" placeholder="Ключ доступа" required autocomplete="off"><button class="btn">Войти по ключу</button></form>
        </details>
        <p class="cr-msg" data-where="${where}"></p>
      </div>`;
  }

  async function renderMe() {
    await refreshMe();
    if (!me) { meRoot.innerHTML = joinForm("me"); return; }
    const key = getKey();
    meRoot.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h2>${esc(me.user.name)}</h2><span class="tag">${me.user.admin ? "админ" : "участник"}</span></div>
        <p class="muted small">Ключ доступа — это твой пароль. Сохрани его, чтобы войти с другого устройства. Никому не показывай.</p>
        <div class="cr-key"><code class="cr-key-val">${"•".repeat(16)}</code><button class="btn" data-act="show-key">Показать</button><button class="btn" data-act="copy-key">Скопировать</button></div>
        <button class="link-egg" data-act="logout">Выйти на этом устройстве</button>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Мои порталы</h2><span class="tag">${me.user.admin ? "без лимита" : "1 бесплатный"}</span></div>
        ${me.portals.length ? `<ul class="cr-list">${me.portals.map((p) => `<li><b>${esc(p.name)}</b> · ${p.status === "published" ? "опубликован" : "черновик"} · <a href="./?p=${p.slug}">открыть</a></li>`).join("")}</ul>` : '<p class="muted small">Пока нет. <a href="#/create">Создать портал</a></p>'}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Приглашения</h2><span class="tag">${me.invitesLeft == null ? "без лимита" : `осталось ${me.invitesLeft}`}</span></div>
        <p class="muted small">Каждое приглашение — одноразовое. Друг с приглашением сможет создать своего персонажа.</p>
        <ul class="cr-list">${me.invites.map((i) => `<li><code>${i.code}</code> ${i.used ? `· использовал(а) ${esc(i.by || "кто-то")}` : `· свободно <button class="link-egg" data-copy="${i.code}">скопировать</button>`}</li>`).join("") || '<li class="muted small">Ещё нет приглашений.</li>'}</ul>
        ${me.invitesLeft === 0 ? "" : '<button class="btn primary" data-act="invite">Создать приглашение</button>'}
      </div>`;
    meRoot.dataset.key = key;
  }

  // ---------- Builder ----------
  const STEPS = [["photos", "Фото"], ["facts", "Факты"], ["content", "Шутки, ачивки, квиз"], ["theme", "Тема и игры"], ["anims", "Анимации"], ["publish", "Превью"]];
  let step = "photos";
  const done = (d) => ({
    photos: !!d.look, facts: (d.facts || []).length >= 5, content: !!(d.persona && d.lines && d.questions),
    theme: !!(d.site && d.games), anims: !!(d.talents && d.talents.length), publish: draft?.status === "published"
  });

  async function renderCreate() {
    await refreshMe();
    if (!me) { createRoot.innerHTML = joinForm("create"); return; }
    await refreshDraft();
    if (!draft) {
      const can = me.user.admin || me.portals.length < (me.user.quota || 1);
      createRoot.innerHTML = can ? `
        <div class="panel">
          <div class="panel-head"><h2>Новый портал</h2><span class="tag">шаг 0</span></div>
          <form class="cr-form" data-act="start">
            <label>Как зовут героя портала<input name="name" maxlength="40" placeholder="Например: Вася" required></label>
            <label>Адрес портала<input name="slug" maxlength="30" placeholder="vasya" required pattern="[a-z0-9][a-z0-9-]{1,28}[a-z0-9]"></label>
            <label class="cr-check"><input type="checkbox" name="consent" required> Человек знает об этом портале и согласен, чтобы его фото и факты о нём были на сайте. Ему 18 или больше.</label>
            <button class="btn primary">Начать</button>
          </form>
          <p class="cr-msg"></p>
        </div>` : `<div class="panel"><p>Ты уже создал своего персонажа. Новые порталы скоро станут платными.</p><a class="btn" href="#/me">Мой аккаунт</a></div>`;
      const nameIn = createRoot.querySelector('[name="name"]'), slugIn = createRoot.querySelector('[name="slug"]');
      nameIn?.addEventListener("input", () => { if (!slugIn.dataset.touched) slugIn.value = slugify(nameIn.value); });
      slugIn?.addEventListener("input", () => { slugIn.dataset.touched = "1"; });
      return;
    }
    const d = draft.data, ok = done(d);
    if (!STEPS.some(([id]) => id === step)) step = "photos";
    createRoot.innerHTML = `
      <div class="cr-head">
        <div><b>${esc(draft.name)}</b> · <code>?p=${draft.slug}</code> · ${draft.status === "published" ? "опубликован" : "черновик"}</div>
        <a class="btn" href="./?p=${draft.slug}" target="_blank" rel="noopener">Превью ↗</a>
      </div>
      <ol class="cr-steps">${STEPS.map(([id, label], i) => `<li><button data-step="${id}" class="${id === step ? "active" : ""} ${ok[id] ? "ok" : ""}"><span>${ok[id] ? "✓" : i + 1}</span>${label}</button></li>`).join("")}</ol>
      <div class="cr-body">${stepHtml(step, d)}</div>
      <p class="cr-msg"></p>`;
    afterRender(step, d);
  }

  function stepHtml(id, d) {
    if (id === "photos") {
      const L = d.look || {};
      return `
        <div class="panel">
          <div class="panel-head"><h2>1. Фото</h2><span class="tag">1–5 штук</span></div>
          <p class="muted small">Лучше всего: лицо анфас, хорошо видны волосы и одежда. Root AI по фото подберёт внешность 3D-аватара и вырежет лицо для «мяча-лица». Сами фото не сохраняются.</p>
          <input type="file" accept="image/*" multiple class="cr-files">
          <div class="cr-thumbs"></div>
          <button class="btn primary" data-act="analyze">Подобрать внешность</button>
        </div>
        ${d.look ? `
        <div class="panel">
          <div class="panel-head"><h2>Внешность аватара</h2>${draft.face ? `<img class="cr-face" src="${draft.face}" alt="">` : ""}</div>
          <p class="muted small">${esc(d.summary || "")} Поправь, если что-то не так.</p>
          <form class="cr-grid" data-act="look">
            ${sel("hair_style", "Причёска", L.hair?.style, { bald: "лысый", buzz: "ёжик", short: "короткая", medium: "средняя", long: "длинная", curly: "кудри", ponytail: "хвост" })}
            ${col("hair_color", "Цвет волос", L.hair?.color)}
            ${col("skin", "Кожа", L.skin)}${col("eyes", "Глаза", L.eyes)}
            ${sel("beard", "Борода", L.beard, { none: "нет", stubble: "щетина", short: "короткая", full: "густая" })}
            ${sel("mustache", "Усы", L.mustache ? "yes" : "no", { no: "нет", yes: "есть" })}
            ${sel("glasses", "Очки", L.glasses, { none: "нет", regular: "обычные", sun: "тёмные" })}
            ${sel("build", "Телосложение", L.build, { slim: "худой", average: "среднее", chubby: "плотный" })}
            ${sel("top_type", "Верх", L.top?.type, { tshirt: "футболка", hoodie: "худи", shirt: "рубашка", jersey: "майка с номером" })}
            ${col("top_color", "Цвет верха", L.top?.color)}${col("pants", "Штаны", L.pants)}${col("shoes", "Обувь", L.shoes)}
            <button class="btn primary">Сохранить внешность</button>
          </form>
        </div>` : ""}`;
    }
    if (id === "facts") {
      return `
        <div class="panel">
          <div class="panel-head"><h2>2. Факты о личности</h2><span class="tag">минимум 5</span></div>
          <p class="muted small">По одному факту в строке: привычки, хобби, словечки, смешные истории, любимые игры и еда. Чем конкретнее, тем смешнее получится. Без оскорблений, здоровья, интима и личных данных — Root AI такое пропустит.</p>
          <form data-act="facts"><textarea name="facts" rows="12" placeholder="Курит дольше всех&#10;Обожает аджику&#10;Ник в играх — x23x">${esc((d.facts || []).join("\n"))}</textarea>
          <button class="btn primary">Сохранить факты</button></form>
        </div>`;
    }
    if (id === "content") {
      return `
        <div class="panel">
          <div class="panel-head"><h2>3. Шутки, ачивки и квиз</h2><span class="tag">Root AI</span></div>
          <p class="muted small">Root AI напишет реплики героя на все события сайта, переименует ачивки под него и составит квиз из 30 вопросов. Можно перегенерировать или поправить руками.</p>
          <div class="cr-row"><button class="btn primary" data-gen="content">${d.persona ? "Перегенерировать шутки и ачивки" : "Сгенерировать"}</button>${d.persona ? '<button class="btn" data-gen="quiz">Перегенерировать квиз</button>' : ""}</div>
        </div>
        ${d.persona ? `
        <details class="panel cr-sec" open><summary><h2>Имя и характер</h2></summary>
          <form class="cr-grid" data-act="persona">
            ${["nom", "gen", "dat", "acc", "ins", "pre"].map((f, i) => txt(`f_${f}`, ["Кто", "Кого/чего", "Кому", "Кого", "Кем", "О ком"][i], d.persona.forms?.[f])).join("")}
            ${txt("nickname", "Прозвище", d.persona.nickname)}${txt("catchphrase", "Коронная фраза", d.persona.catchphrase)}
            <button class="btn primary">Сохранить</button>
          </form>
        </details>
        <details class="panel cr-sec"><summary><h2>Реплики героя</h2><span class="tag">${Object.keys(d.lines || {}).length} событий</span></summary>
          <form data-act="lines">${Object.keys(LINE_LABELS).map((k) => `<label class="cr-lines"><span>${LINE_LABELS[k]}</span><textarea name="${k}" rows="3">${esc((d.lines?.[k] || []).join("\n"))}</textarea></label>`).join("")}
          <button class="btn primary">Сохранить реплики</button></form>
        </details>
        <details class="panel cr-sec"><summary><h2>Ачивки</h2><span class="tag">${Object.keys(d.achievements || {}).length}</span></summary>
          <form data-act="ach">${Object.entries(d.achievements || {}).map(([id, a]) => `<div class="cr-ach"><input name="${id}__0" value="${esc(a[0])}" maxlength="8"><input name="${id}__1" value="${esc(a[1])}" maxlength="40"><input name="${id}__2" value="${esc(a[2])}" maxlength="120"></div>`).join("")}
          <button class="btn primary">Сохранить ачивки</button></form>
        </details>
        <details class="panel cr-sec"><summary><h2>Квиз</h2><span class="tag">${(d.questions || []).length} вопросов</span></summary>
          <form data-act="quiz">${(d.questions || []).map((q, i) => `<fieldset class="cr-q"><legend>#${i + 1} <button type="button" class="link-egg" data-del-q="${i}">удалить</button></legend>
            <input name="q${i}" value="${esc(q.q)}" maxlength="200"><input name="c${i}" value="${esc(q.correct)}" maxlength="100" class="ok">
            ${q.wrong.map((w, j) => `<input name="w${i}_${j}" value="${esc(w)}" maxlength="100">`).join("")}</fieldset>`).join("")}
          <button class="btn primary">Сохранить квиз</button></form>
        </details>` : ""}`;
    }
    if (id === "theme") {
      const s = d.site || {}, c = d.colors || {}, g = d.games || {};
      return `
        <div class="panel">
          <div class="panel-head"><h2>4. Тема сайта и мини-игры</h2><span class="tag">Root AI</span></div>
          <p class="muted small">Название, цвета, шрифт и фон под героя, плюс его версии мини-игр (кликер, экономическая игра и «расслабон»).</p>
          <button class="btn primary" data-gen="theme" ${d.persona ? "" : "disabled"}>${d.site ? "Перегенерировать тему" : "Сгенерировать тему"}</button>
          ${d.persona ? "" : '<p class="muted small">Сначала шаг 3.</p>'}
        </div>
        ${d.site ? `
        <div class="panel cr-preview" style="--p-accent:${c.accent};--p-dark:${c.accentDark};--p-hi:${c.highlight};--p-bg:${c.bg}">
          <p class="cr-pv-kicker">${esc(s.kicker)}</p><h1>${esc(s.title1)}<br><span>${esc(s.title2)}</span></h1><p>${esc(s.tagline)}</p>
          <span class="cr-pv-jersey">${esc(s.emblemText)} <b>${esc(s.emblemNumber)}</b></span>
        </div>
        <form class="panel cr-grid" data-act="theme">
          ${txt("title1", "Заголовок 1", s.title1)}${txt("title2", "Заголовок 2", s.title2)}${txt("kicker", "Надзаголовок", s.kicker)}${txt("tagline", "Слоган", s.tagline)}
          ${txt("emblemText", "Имя на майке", s.emblemText)}${txt("emblemNumber", "Номер", s.emblemNumber)}
          ${col("accent", "Акцент", c.accent)}${col("accentDark", "Тень акцента", c.accentDark)}${col("highlight", "Цифры", c.highlight)}${col("bg", "Фон", c.bg)}
          ${sel("font", "Шрифт", d.font, Object.fromEntries(["Anton", "Russo One", "Unbounded", "Rubik Mono One", "Press Start 2P", "Oswald", "Comfortaa"].map((f) => [f, f])))}
          ${sel("pattern", "Узор фона", d.pattern, { court: "площадка", grid: "сетка", waves: "волны", stars: "звёзды", dots: "точки" })}
          ${txt("g_clicker", "Кликер: название", g.clicker?.title)}${txt("g_clicker_unit", "Кликер: валюта", g.clicker?.unit)}
          ${txt("g_farm", "Экономика: название", g.farm?.title)}${txt("g_farm_cur", "Экономика: что добываем", g.farm?.currency)}${txt("g_farm_action", "Экономика: кнопка", g.farm?.action)}
          ${txt("g_relax", "Расслабон: название", g.relax?.title)}${txt("g_relax_place", "Расслабон: место", g.relax?.place)}${txt("g_relax_phone", "Что роняет", g.relax?.phone)}
          <button class="btn primary">Сохранить тему</button>
        </form>` : ""}`;
    }
    if (id === "anims") {
      return `
        <div class="panel">
          <div class="panel-head"><h2>5. Анимации аватара</h2><span class="tag">10 штук</span></div>
          <p class="muted small">Root AI выберет 10 анимаций под героя из библиотеки, назовёт их и разложит по веткам прокачки. Они открываются по мере того, как люди играют.</p>
          <button class="btn primary" data-gen="anims" ${d.persona ? "" : "disabled"}>${d.talents ? "Перегенерировать" : "Сгенерировать"}</button>
        </div>
        ${d.talents ? `
        <form class="panel" data-act="anims">
          <div class="cr-grid">${BRANCH_KEYS.map((b) => `${txt(`b_${b}_icon`, `Ветка «${BRANCH_HINT[b]}»: значок`, d.branches?.[b]?.icon)}${txt(`b_${b}_title`, "название", d.branches?.[b]?.title)}`).join("")}</div>
          ${d.talents.map((t, i) => `<div class="cr-talent">
            <select name="t${i}_anim">${Object.entries(ANIMS).map(([k, v]) => `<option value="${k}" ${k === t.anim ? "selected" : ""}>${v}</option>`).join("")}</select>
            <select name="t${i}_branch">${BRANCH_KEYS.map((b) => `<option value="${b}" ${b === t.branch ? "selected" : ""}>${esc(d.branches?.[b]?.title || b)}</option>`).join("")}</select>
            <input name="t${i}_icon" value="${esc(t.icon)}" maxlength="8"><input name="t${i}_title" value="${esc(t.title)}" maxlength="32"><input name="t${i}_desc" value="${esc(t.desc)}" maxlength="120">
          </div>`).join("")}
          <button class="btn primary">Сохранить анимации</button>
        </form>` : ""}`;
    }
    const ok = done(d);
    return `
      <div class="panel">
        <div class="panel-head"><h2>6. Превью и публикация</h2><span class="tag">${draft.status === "published" ? "опубликован" : "черновик"}</span></div>
        <ul class="cr-check-list">${STEPS.slice(0, 5).map(([sid, label]) => `<li class="${ok[sid] ? "ok" : ""}">${ok[sid] ? "✓" : "○"} ${label}</li>`).join("")}</ul>
        <p class="muted small">Открой превью: там всё как у посетителей, но видишь только ты. Если что-то не нравится — вернись к нужному шагу.</p>
        <div class="cr-row">
          <a class="btn" href="./?p=${draft.slug}" target="_blank" rel="noopener">Открыть превью ↗</a>
          <button class="btn primary" data-act="publish" ${["content", "theme", "anims"].every((k) => ok[k]) ? "" : "disabled"}>${draft.status === "published" ? "Обновить опубликованный" : "Опубликовать"}</button>
        </div>
        ${draft.status === "published" ? `<p>Ссылка для друзей: <code class="cr-link">${location.origin}${location.pathname}?p=${draft.slug}</code> <button class="link-egg" data-copy="${location.origin}${location.pathname}?p=${draft.slug}">скопировать</button></p>` : ""}
        <details class="cr-danger"><summary>Удалить портал</summary><p class="muted small">Удаляется навсегда вместе со всеми данными.</p><button class="btn" data-act="delete">Удалить</button></details>
      </div>`;
  }

  const txt = (n, label, v) => `<label><span>${label}</span><input name="${n}" value="${esc(v || "")}" maxlength="160"></label>`;
  const col = (n, label, v) => `<label><span>${label}</span><input type="color" name="${n}" value="${/^#[0-9a-f]{6}$/i.test(v || "") ? v : "#888888"}"></label>`;
  const sel = (n, label, v, opts) => `<label><span>${label}</span><select name="${n}">${Object.entries(opts).map(([k, t]) => `<option value="${k}" ${k === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>`;

  function afterRender(id) {
    const files = createRoot.querySelector(".cr-files");
    files?.addEventListener("change", async () => {
      photos = [];
      const thumbs = createRoot.querySelector(".cr-thumbs");
      thumbs.innerHTML = "";
      for (const f of [...files.files].slice(0, 5)) {
        try {
          const r = await shrink(f);
          photos.push(r);
          const im = document.createElement("img");
          im.src = r.canvas.toDataURL("image/jpeg", 0.6);
          thumbs.append(im);
        } catch (e) { msg(e.message); }
      }
    });
    void id;
  }

  const msg = (text, bad = true) => {
    const el = (createRoot.offsetParent ? createRoot : meRoot).querySelector(".cr-msg");
    if (el) { el.textContent = text; el.className = `cr-msg ${bad ? "bad" : "good"}`; }
  };
  async function withBusy(btn, label, fn) {
    if (busy) return;
    busy = true;
    const old = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = label; }
    try { await fn(); } catch (e) { msg(e.message || "Ошибка"); }
    busy = false;
    if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = old; }
  }
  const save = async (patch, note = "Сохранено") => { draft = (await call("/builder/draft", { method: "PATCH", body: patch })).draft; toast?.(`💾 ${note}`, ""); await renderCreate(); };
  const form = (f) => Object.fromEntries(new FormData(f).entries());
  const lines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);

  // ---------- Events (one delegated handler for both pages) ----------
  async function onSubmit(e) {
    const f = e.target.closest("form[data-act]");
    if (!f) return;
    e.preventDefault();
    const act = f.dataset.act, v = form(f), btn = f.querySelector("button:not([type=button])");
    await withBusy(btn, "…", async () => {
      if (act === "redeem") {
        const r = await call("/auth/redeem", { method: "POST", body: { code: v.code.trim().toUpperCase(), name: v.name.trim() } });
        setKey(r.key);
        toast?.("🎉 Добро пожаловать!", "Ключ доступа сохранён в этом браузере. Скопируй его в «Мой аккаунт».");
        return rerender();
      }
      if (act === "restore") {
        setKey(v.key.trim());
        await refreshMe();
        if (!me) { setKey(""); throw new Error("Ключ не подошёл"); }
        return rerender();
      }
      if (act === "start") {
        await call("/builder/draft", { method: "POST", body: { name: v.name.trim(), slug: v.slug.trim().toLowerCase(), consent: !!v.consent } });
        step = "photos";
        return renderCreate();
      }
      const d = draft.data;
      if (act === "look") {
        return save({ look: {
          hair: { style: v.hair_style, color: v.hair_color }, skin: v.skin, eyes: v.eyes, beard: v.beard, mustache: v.mustache === "yes",
          glasses: v.glasses, build: v.build, top: { type: v.top_type, color: v.top_color }, pants: v.pants, shoes: v.shoes
        } }, "Внешность сохранена");
      }
      if (act === "facts") {
        const facts = lines(v.facts);
        if (facts.length < 5) throw new Error("Нужно хотя бы 5 фактов");
        await save({ facts }, "Факты сохранены");
        step = "content";
        return renderCreate();
      }
      if (act === "persona") {
        const forms = {};
        for (const k of ["nom", "gen", "dat", "acc", "ins", "pre"]) forms[k] = v[`f_${k}`];
        return save({ persona: { ...d.persona, forms, nickname: v.nickname, catchphrase: v.catchphrase } });
      }
      if (act === "lines") return save({ lines: Object.fromEntries(Object.keys(LINE_LABELS).map((k) => [k, lines(v[k])])) }, "Реплики сохранены");
      if (act === "ach") {
        const a = {};
        for (const id of Object.keys(d.achievements || {})) a[id] = [v[`${id}__0`], v[`${id}__1`], v[`${id}__2`]];
        return save({ achievements: a }, "Ачивки сохранены");
      }
      if (act === "quiz") {
        const qs = (d.questions || []).map((_, i) => ({ q: v[`q${i}`], correct: v[`c${i}`], wrong: [0, 1, 2].map((j) => v[`w${i}_${j}`]) }))
          .filter((q) => q.q && q.correct && q.wrong.every(Boolean));
        return save({ questions: qs }, "Квиз сохранён");
      }
      if (act === "theme") {
        const g = d.games || {};
        return save({
          site: { title1: v.title1, title2: v.title2, kicker: v.kicker, tagline: v.tagline, emblemText: v.emblemText, emblemNumber: v.emblemNumber },
          colors: { accent: v.accent, accentDark: v.accentDark, highlight: v.highlight, bg: v.bg }, font: v.font, pattern: v.pattern,
          games: {
            clicker: { ...g.clicker, title: v.g_clicker, unit: v.g_clicker_unit },
            farm: { ...g.farm, title: v.g_farm, currency: v.g_farm_cur, action: v.g_farm_action },
            relax: { ...g.relax, title: v.g_relax, place: v.g_relax_place, phone: v.g_relax_phone }
          }
        }, "Тема сохранена");
      }
      if (act === "anims") {
        const branches = Object.fromEntries(BRANCH_KEYS.map((b) => [b, { ...(d.branches?.[b] || {}), icon: v[`b_${b}_icon`], title: v[`b_${b}_title`], stat: v[`b_${b}_title`] }]));
        const talents = d.talents.map((_, i) => ({ anim: v[`t${i}_anim`], branch: v[`t${i}_branch`], icon: v[`t${i}_icon`], title: v[`t${i}_title`], desc: v[`t${i}_desc`] }));
        return save({ branches, talents }, "Анимации сохранены");
      }
    });
  }

  async function onClick(e) {
    const b = e.target.closest("button, [data-copy]");
    if (!b) return;
    if (b.dataset.copy) { navigator.clipboard?.writeText(b.dataset.copy); toast?.("📋 Скопировано", b.dataset.copy); return; }
    if (b.dataset.step) { step = b.dataset.step; return renderCreate(); }
    if (b.dataset.delQ != null) { b.closest("fieldset").remove(); return; }
    const act = b.dataset.act;
    if (act === "show-key") { meRoot.querySelector(".cr-key-val").textContent = getKey(); return; }
    if (act === "copy-key") { navigator.clipboard?.writeText(getKey()); toast?.("📋 Ключ скопирован", "Храни его в надёжном месте."); return; }
    if (act === "logout") { setKey(""); return rerender(); }
    if (act === "invite") return withBusy(b, "…", async () => { await call("/invites", { method: "POST" }); await renderMe(); });
    if (act === "analyze") {
      if (!photos.length) return msg("Выбери хотя бы одно фото");
      return withBusy(b, "Root AI смотрит фото…", async () => {
        const r = await call("/builder/photos", { method: "POST", body: { images: photos.map((p) => p.b64) } });
        if (!r.ok) throw new Error(r.reason || "Не получилось");
        const face = cropFace(photos[r.face.image]?.canvas || photos[0].canvas, r.face);
        await save({ face }, "Внешность подобрана");
      });
    }
    if (b.dataset.gen) {
      const g = b.dataset.gen;
      const label = { content: "Root AI пишет шутки и ачивки… (до минуты)", quiz: "Root AI пишет квиз… (до минуты)", theme: "Root AI подбирает тему…", anims: "Root AI выбирает анимации…" }[g];
      return withBusy(b, label, async () => {
        let r = await call("/builder/step", { method: "POST", body: { step: g } });
        if (!r.ok) throw new Error(r.reason || "Не получилось");
        // The first content run also writes the quiz
        if (g === "content" && !r.draft.data.questions) {
          b.textContent = "Root AI пишет квиз… (до минуты)";
          r = await call("/builder/step", { method: "POST", body: { step: "quiz" } });
        }
        draft = r.draft;
        await renderCreate();
      });
    }
    if (act === "publish") {
      return withBusy(b, "Публикую…", async () => {
        await call("/builder/publish", { method: "POST" });
        toast?.("🚀 Портал опубликован!", "Отправь ссылку друзьям.");
        await renderCreate();
      });
    }
    if (act === "delete") {
      if (!confirmDelete(b)) return;
      return withBusy(b, "Удаляю…", async () => { await call("/builder/draft", { method: "DELETE" }); draft = null; step = "photos"; await renderCreate(); });
    }
  }
  // Two-step delete without a browser dialog: the first click arms the button
  function confirmDelete(b) {
    if (b.dataset.armed) return true;
    b.dataset.armed = "1";
    b.textContent = "Точно удалить? Нажми ещё раз";
    setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "Удалить"; } }, 4000);
    return false;
  }

  for (const r of [meRoot, createRoot]) {
    r.addEventListener("submit", onSubmit);
    r.addEventListener("click", onClick);
  }
  const rerender = () => Promise.all([renderMe(), renderCreate()]);
  return { showMe: renderMe, showCreate: renderCreate };
}
