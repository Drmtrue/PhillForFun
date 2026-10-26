// Home page event feed: everything that happens on the site, for all players, newest first.
// initFeed(root, { api, achById, verdictFor, isVisible }) → { refresh() }

const PAGE = 40;
const POLL_MS = 25000;
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

const CATEGORY = {
  quiz_finish: "quiz", quiz_quit: "quiz", fact_added: "quiz",
  basket: "games", ft_session: "games", farm_end: "games", bath_end: "games", smoke_milestone: "games",
  phil_shot: "phil", phil_say: "phil",
  ach: "ach"
};
// The hero's name (Phil by default) and game names come from ctx: { hero: { nom, gen, pre }, games: { farm, relax, clicker } }
const filtersFor = (ctx) => [["all", "Все"], ["quiz", "Квиз"], ["games", "Игры"], ["phil", ctx.hero.nom], ["ach", "Ачивки"]];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many;
};
const num = (x) => Number(x || 0).toLocaleString("ru-RU", { maximumFractionDigits: 0 });

function when(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function dayLabel(ts) {
  const d = new Date(ts), today = new Date();
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// One line of text per event type. Everything user-provided is escaped.
function describe(e, ctx) {
  const n = `<b>${esc(e.name)}</b>`;
  const d = e.data || {};
  const H = ctx.hero, G = ctx.games;
  switch (e.type) {
    case "quiz_finish": {
      const v = ctx.verdictFor ? ctx.verdictFor(d.score, d.total)?.title : "";
      return ["🏁", `${n} прошёл квиз: <strong>${d.score}/${d.total}</strong>${v ? ` — «${esc(v)}»` : ""}`];
    }
    case "quiz_quit":
      return ["🚪", `${n} сбежал с квиза на ${d.at}-м вопросе из ${d.total}${d.score != null ? ` (${d.score} ${plural(d.score, "очко", "очка", "очков")})` : ""}`];
    case "fact_added":
      return ["📝", `${n} рассказал о ${esc(H.pre)}: «${esc(d.fact)}» — Root AI сделал ${d.n} ${plural(d.n, "вопрос", "вопроса", "вопросов")}`];
    case "ach": {
      const a = ctx.achById[d.id];
      return [a?.icon || "🏆", a ? `${n} ${a.secret ? "нашёл пасхалку" : "получил ачивку"} «${esc(a.title)}»` : `${n} получил ачивку`];
    }
    case "basket":
      return ["🏀", `${n} ${d.n > 1 ? `забил ${d.n} ${plural(d.n, "мяч", "мяча", "мячей")}` : "забил мяч"} в боковое кольцо`];
    case "phil_shot":
      return d.made
        ? ["🕶️", `<b>${esc(H.nom)}</b> попал в кольцо у ${n}! Те самые 5%.${d.line ? ` «${esc(d.line)}»` : ""}`]
        : ["🧱", `<b>${esc(H.nom)}</b> промазал у ${n}.${d.line ? ` «${esc(d.line)}»` : ""}`];
    case "phil_say":
      return ["💬", `<b>${esc(H.nom)}</b> у ${n}: «${esc(d.line)}»`];
    case "ft_session":
      return ["🎯", `${n} отработал штрафные: ${d.made} из ${d.shots}, лучшая серия ${d.best}`];
    case "farm_end":
      if (G) return ["💰", `${n} сыграл в «${esc(G.farm)}»: <strong>${num(d.rub)}</strong>, продано ${num(d.sold)}` + (d.burnt ? `, ${num(d.burnt)} пропало` : "")];
      return ["💎", `${n} закрыл лигу в «Фарме диванов»: <strong>${num(d.rub)} ₽</strong>, продал ${num(d.sold)} Divine` +
        (d.burnt ? `, ${num(d.burnt)} сгорело в Стандарт` : "") + (d.scammed ? ". Скамнули!" : "")];
    case "bath_end": {
      const why = { sleep: "уснул", hot: "сварился", cold: "замёрз", phone: "утопил телефон" }[d.why] || "вылез";
      if (G) return ["🧘", `${n} продержался в «${esc(G.relax)}» <strong>${num(d.sec)} с</strong> — ${why}`];
      return ["🛁", `${n} продержал Фила в ванне <strong>${num(d.sec)} с</strong> — ${why}`];
    }
    case "smoke_milestone":
      if (G) return ["⭐", d.upgrade ? `${n} купил «${esc(d.upgrade)}» в «${esc(G.clicker)}»` : `${n}: уже ${num(d.cigs)} в «${esc(G.clicker)}»`];
      return ["🚬", d.upgrade ? `${n} построил «${esc(d.upgrade)}» в перекур-кликере` : `${n} выкурил уже ${num(d.cigs)} ${plural(d.cigs, "сигарету", "сигареты", "сигарет")} в перекур-кликере`];
    default:
      return ["•", `${n}: ${esc(e.type)}`];
  }
}

export function initFeed(root, ctx) {
  root.innerHTML = `
    <div class="feed-head">
      <h2>Лента событий</h2>
      <span class="tag feed-live"><i></i> в прямом эфире</span>
    </div>
    <div class="seg feed-filter" role="group" aria-label="Фильтр ленты"></div>
    <ol class="feed-list" aria-live="polite"><li class="muted feed-empty">Загружаю…</li></ol>
    <button type="button" class="btn feed-more" hidden>Показать ещё</button>`;
  const list = root.querySelector(".feed-list");
  const more = root.querySelector(".feed-more");
  const seg = root.querySelector(".feed-filter");
  let events = [], filter = "all", freshIds = new Set(), exhausted = false;

  ctx.hero = ctx.hero || { nom: "Фил", gen: "Фила", pre: "Филе" };
  for (const [id, label] of filtersFor(ctx)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.className = id === filter ? "active" : "";
    b.addEventListener("click", () => {
      filter = id;
      seg.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      render();
    });
    seg.append(b);
  }

  function render() {
    const shown = events.filter((e) => filter === "all" || CATEGORY[e.type] === filter);
    list.innerHTML = "";
    if (!shown.length) {
      list.innerHTML = `<li class="muted feed-empty">${events.length ? "Тут пока пусто — попробуй другой фильтр." : "Пока ничего не произошло. Сыграй во что-нибудь — и ты первый в ленте!"}</li>`;
    }
    let day = "";
    for (const e of shown) {
      const label = dayLabel(e.ts);
      if (label !== day) {
        day = label;
        const hd = document.createElement("li");
        hd.className = "feed-day";
        hd.textContent = label;
        list.append(hd);
      }
      const [icon, html] = describe(e, ctx);
      const li = document.createElement("li");
      li.className = `feed-item cat-${CATEGORY[e.type] || "other"}${freshIds.has(e.id) ? " fresh" : ""}`;
      li.innerHTML = `<span class="feed-icon" aria-hidden="true">${icon}</span><p>${html}</p><time datetime="${new Date(e.ts).toISOString()}">${when(e.ts)}</time>`;
      list.append(li);
    }
    more.hidden = exhausted || !events.length;
    freshIds.clear();
  }

  async function loadFirst() {
    try {
      events = (await ctx.api(`/events?limit=${PAGE}`)).events;
      exhausted = events.length < PAGE;
    } catch (_) {
      list.innerHTML = '<li class="muted feed-empty">Не удалось загрузить ленту.</li>';
      return;
    }
    render();
  }

  // New events since the newest one we have
  async function refresh() {
    if (!events.length) return loadFirst();
    try {
      const fresh = (await ctx.api(`/events?after=${events[0].id}&limit=${PAGE}`)).events;
      if (!fresh.length) { render(); return; } // still re-render to update "N мин назад"
      const ids = new Set(fresh.map((e) => e.id));
      fresh.forEach((e) => freshIds.add(e.id));
      // A merged row (e.g. a basket streak) comes back under a new id: drop the copy it replaced
      const merged = fresh.filter((e) => e.type === "basket");
      events = [...fresh, ...events.filter((e) => !ids.has(e.id) && !merged.some((m) => m.name === e.name && m.type === e.type && m.ts - e.ts < 16 * 60000))];
      render();
    } catch (_) { /* try again on the next tick */ }
  }

  more.addEventListener("click", async () => {
    more.disabled = true;
    try {
      const older = (await ctx.api(`/events?before=${events[events.length - 1].id}&limit=${PAGE}`)).events;
      exhausted = older.length < PAGE;
      events = events.concat(older);
      render();
    } catch (_) { /* keep the button */ }
    more.disabled = false;
  });

  loadFirst();
  setInterval(() => { if (ctx.isVisible() && !document.hidden) refresh(); }, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && ctx.isVisible()) refresh(); });
  return { refresh };
}
