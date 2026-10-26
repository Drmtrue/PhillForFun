// The "Биржа РМТ" section: overview cards, charts, order book, season timelines, the savings goal with a
// farming-rate calculator, and the method notes. renderRmt(root, rows, meta) rebuilds it from /prices data.

import { SEASONS, RMT_GOAL, RMT_MODEL } from "./config.js?v=202610251836";
import { calibrate, forecast, decayStats, seasonDay, priceAt, resolveSeason, MIN_POINTS } from "./rmtmodel.js?v=202610251836";
import { lineChart } from "./charts.js?v=202610251836";

const COLORS = { poe1: "#cc8208", poe2: "#3b8fe8" };   // validated categorical pair on the dark surface
const DAY = 86400000;
const RANGE_KEY = "phill_rmt_range";
const CALC_KEY = "phill_rmt_calc";

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_FULL = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many;
};
const rub = (x, digits) => `${x.toLocaleString("ru-RU", { maximumFractionDigits: digits ?? (x < 10 ? 2 : 0), minimumFractionDigits: x < 10 && digits == null ? 2 : 0 })} ₽`;
const int = (x) => Math.round(x).toLocaleString("ru-RU");
const pct = (x) => `${(x * 100).toLocaleString("ru-RU", { maximumFractionDigits: Math.abs(x) < 0.01 ? 1 : 0 })}%`;
const daysTxt = (n) => `${Math.round(n)} ${plural(Math.round(n), "день", "дня", "дней")}`;
const dateTxt = (t) => { const d = new Date(t); return `${d.getDate()} ${MONTHS_FULL[d.getMonth()]}`; };
const shortDate = (t) => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const monthYear = (t) => { const d = new Date(t); return `${MONTHS_NOM[d.getMonth()]} ${d.getFullYear()}`; };
const hourTxt = (t) => { const d = new Date(t); return `${shortDate(t)}, ${String(d.getHours()).padStart(2, "0")}:00`; };
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  return `${h} ${plural(h, "час", "часа", "часов")} назад`;
};
const yearsTxt = (y) => {
  const r = Math.round(y * 10) / 10;
  return `${r.toLocaleString("ru-RU")} ${Number.isInteger(r) ? plural(r, "год", "года", "лет") : "года"}`;
};
const leagueName = (l) => String(l || "").replace(/^\(PC\)\s*/, "");
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const SECTIONS = [
  ["overview", "Обзор"], ["charts", "Графики"], ["book", "Стакан"], ["seasons", "Сезоны"], ["goal", "Копилка"], ["method", "Как считаем"]
];

export function renderRmt(root, rows, meta, store) {
  // Prepare per-game data: the season, the fitted price model and the decay stats
  const games = rows.map((r) => {
    const key = r.short === "PoE 1" ? "poe1" : "poe2";
    const season = resolveSeason(SEASONS[key], r.league, r.firstSeen);
    const model = r.price ? calibrate(season, r.price, r.history, RMT_MODEL) : null;
    return { ...r, key, color: COLORS[key], season, model, sd: seasonDay(season), stats: model ? decayStats(model, season) : null };
  });
  const scrollY = window.scrollY;
  root.innerHTML = "";

  // In-page navigation: buttons (not hash links) so the section router is not involved
  const nav = h("nav", "subnav");
  nav.setAttribute("aria-label", "Разделы биржи");
  for (const [id, label] of SECTIONS) {
    const b = h("button", "", label);
    b.type = "button";
    b.dataset.target = id;
    b.addEventListener("click", () => {
      const t = root.querySelector(`#rmt-${id}`);
      const top = t.getBoundingClientRect().top + window.scrollY - 130;
      window.scrollTo({ top, behavior: "smooth" });
    });
    nav.append(b);
  }
  root.append(nav);

  root.append(section("overview", "Обзор", overview(games, meta)));
  root.append(section("charts", "Графики", charts(games, store)));
  root.append(section("book", "Стакан", book(games)));
  root.append(section("seasons", "Сезоны", seasons(games)));
  root.append(section("goal", `Копилка: ${RMT_GOAL.title.toLowerCase()} за ${int(RMT_GOAL.priceRub)} ₽`, goal(games, store)));
  root.append(section("method", "Как считаем", method(games, meta)));

  // Highlight the section in view
  const buttons = [...nav.querySelectorAll("button")];
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const id = e.target.id.replace("rmt-", "");
      buttons.forEach((b) => b.classList.toggle("active", b.dataset.target === id));
    }
  }, { rootMargin: "-140px 0px -60% 0px" });
  root.querySelectorAll(".rmt-section").forEach((s) => io.observe(s));
  buttons[0].classList.add("active");
  if (root.offsetParent) window.scrollTo({ top: scrollY });
}

function section(id, title, body) {
  const s = h("section", "rmt-section");
  s.id = `rmt-${id}`;
  s.append(h("h2", "rmt-h", title), body);
  return s;
}

// ---------- Overview cards ----------
function overview(games, meta) {
  const wrap = h("div", "");
  const grid = h("div", "rmt-cards");
  for (const g of games) {
    const live = g.season.phase === "live";
    const c = h("article", "rmt-card");
    c.style.setProperty("--c", g.color);
    const trend = g.price != null && g.prev ? (g.price - g.prev) / g.prev : null;
    const dayN = Math.min(Math.floor(g.sd.day) + 1, Math.round(g.sd.length));
    c.innerHTML = `
      <header><b>${g.short}</b><span>${esc(leagueName(g.league))}</span><em class="${live ? "ok" : "stale"}">${live ? "лига идёт" : g.season.phase === "ended" ? "лига завершена" : "ждём продавцов"}</em></header>
      <div class="rmt-big">${g.price != null ? rub(g.price) : "—"}${trend != null ? `<span class="rmt-trend ${trend >= 0 ? "up" : "down"}">${trend >= 0 ? "▲" : "▼"} ${Math.abs(trend * 100).toFixed(1)}%</span>` : ""}</div>
      <p class="rmt-cap">за 1 Divine Orb · 100 шт ≈ ${g.price != null ? rub(g.price * 100) : "—"}</p>
      <dl class="rmt-kv">
        <div><dt>Продавцов онлайн</dt><dd>${g.onlineOffers} <small>из ${g.offers}</small></dd></div>
        <div><dt>Медиана онлайн</dt><dd>${g.median != null ? rub(g.median) : "—"}</dd></div>
        <div><dt>У 10 самых дешёвых</dt><dd>${g.ladder?.length ? `${int(g.ladder.reduce((n, o) => n + o.amount, 0))} шт` : "—"}</dd></div>
        <div><dt>От цены на старте</dt><dd>${g.stats ? `${pct(g.stats.now / g.stats.start)}` : "—"}</dd></div>
      </dl>
      <div class="rmt-season-bar" title="День сезона"><i style="width:${Math.min(100, (g.sd.day / g.sd.length) * 100).toFixed(1)}%"></i></div>
      <p class="rmt-cap">День ${dayN} из ${Math.round(g.sd.length)} · до конца ${daysTxt(g.sd.left)}${g.season.estimated ? " (даты оценочные)" : ""}</p>
      <a class="rmt-link" href="${g.url}" target="_blank" rel="noopener">Открыть на FunPay →</a>`;
    grid.append(c);
  }
  wrap.append(grid);
  const [a, b] = games;
  const parts = [];
  if (a?.price && b?.price) {
    const r = a.price / b.price;
    parts.push(`Divine в ${r >= 1 ? "PoE 1" : "PoE 2"} дороже в ${(r >= 1 ? r : 1 / r).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} раза.`);
  }
  parts.push(`Обновлено ${meta.updatedAt ? ago(meta.updatedAt) : "—"}; цены берутся у продавцов онлайн в текущей лиге.`);
  wrap.append(h("p", "muted small rmt-note", parts.join(" ")));
  return wrap;
}

// ---------- Charts ----------
function charts(games, store) {
  const wrap = h("div", "");
  const RANGES = [["24h", "24 ч", 1], ["3d", "3 дня", 3], ["14d", "14 дней", 14]];
  let range = store.get(RANGE_KEY, "3d");
  const seg = h("div", "seg");
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", "Период");
  const priceBox = h("div", "rmt-chart"), sellersBox = h("div", "rmt-chart");

  function draw() {
    const days = RANGES.find((r) => r[0] === range)?.[2] || 3;
    const from = Date.now() - days * DAY;
    const tickSeries = (idx) => games.map((g) => ({ name: g.short, color: g.color, points: (g.ticks || []).filter((t) => t[0] >= from).map((t) => [t[0], t[idx]]) }));
    const xf = days <= 1 ? (t) => `${String(new Date(t).getHours()).padStart(2, "0")}:00` : shortDate;
    const since = games.map((g) => g.ticks?.[0]?.[0]).filter(Boolean);
    const empty = `Почасовые данные копятся с ${since.length ? dateTxt(Math.min(...since)) : "сегодняшнего дня"} — график заполнится в ближайшие часы.`;
    const xTicks = days <= 1 ? 6 : days;  // one label per day on multi-day ranges
    const span = { xMin: from, xMax: Date.now(), xTicks };   // always show the whole chosen period
    lineChart(priceBox, { series: tickSeries(1), xFmt: xf, ...span, tipX: hourTxt, yFmt: (v) => rub(v), height: 230, empty, label: "Минимальная цена Divine по часам" });
    lineChart(sellersBox, { series: tickSeries(2), xFmt: xf, ...span, tipX: hourTxt, yFmt: (v) => int(v), height: 180, empty, label: "Продавцов онлайн по часам" });
  }
  for (const [id, label] of RANGES) {
    const b = h("button", id === range ? "active" : "", label);
    b.type = "button";
    b.addEventListener("click", () => {
      range = id;
      store.set(RANGE_KEY, id);
      seg.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      draw();
    });
    seg.append(b);
  }

  const first = Math.min(...games.map((g) => g.ticks?.[0]?.[0] || Infinity));
  if (Number.isFinite(first) && Date.now() - first < 14 * DAY) {
    wrap.append(h("p", "muted small rmt-collecting", `Почасовые данные собираются с ${hourTxt(first)} — графики будут заполняться со временем.`));
  }
  const head = h("div", "rmt-chart-head");
  head.append(h("h3", "", "Минимальная цена за 1 Divine"), seg);
  wrap.append(head, priceBox);
  wrap.append(h("h3", "rmt-h3", "Продавцов онлайн"), sellersBox);

  // Season curves: one small chart per game (prices differ in scale, so no shared axis)
  wrap.append(h("h3", "rmt-h3", "Цена за сезон: модель и реальные дни"));
  const multi = h("div", "rmt-multi");
  for (const g of games) {
    if (!g.model) continue;
    const cell = h("div", "");
    cell.append(h("p", "rmt-multi-title", `<i style="--c:${g.color}"></i>${g.short} · ${esc(leagueName(g.season.league))}`));
    const box = h("div", "rmt-chart");
    cell.append(box);
    multi.append(cell);
    const start = Date.parse(g.season.start), end = Date.parse(g.season.end);
    const curve = [];
    for (let t = start; t <= end; t += DAY) curve.push([t, priceAt(g.model, (t - start) / DAY)]);
    const real = (g.history || []).map(([d, p]) => [Date.parse(d + "T12:00:00Z"), p]).filter(([t]) => t >= start && t <= end + DAY);
    lineChart(box, {
      series: [
        { name: "Модель", color: g.color, points: curve, dash: g.model.source === "estimate" },
        { name: "Факт (минимум за день)", color: "#f5efe9", points: real, dots: true }
      ],
      legend: true,
      xFmt: shortDate, tipX: dateTxt, yFmt: (v) => rub(v), height: 190,
      marks: [{ x: Math.min(Date.now(), end), label: "сегодня" }],
      label: `Кривая цены ${g.short} за сезон`
    });
  }
  wrap.append(multi);
  setTimeout(draw, 0);
  return wrap;
}

// ---------- Order book ----------
function book(games) {
  const grid = h("div", "rmt-multi");
  for (const g of games) {
    const cell = h("div", "rmt-book");
    cell.append(h("p", "rmt-multi-title", `<i style="--c:${g.color}"></i>${g.short} · 10 самых дешёвых онлайн`));
    const list = g.ladder || [];
    if (!list.length) { cell.append(h("p", "muted small", "Стакан появится после следующего обновления цен.")); grid.append(cell); continue; }
    const maxAmt = Math.max(...list.map((o) => o.amount));
    const ol = h("ol", "");
    list.forEach((o, i) => {
      const li = h("li", i === 0 ? "best" : "");
      li.title = `${rub(o.price)} за 1 Divine · в наличии ${int(o.amount)} шт`;
      li.innerHTML = `<span class="bk-price">${rub(o.price)}</span><span class="bk-bar"><i style="width:${Math.max(3, (Math.log10(o.amount + 1) / Math.log10(maxAmt + 1)) * 100).toFixed(1)}%;--c:${g.color}"></i></span><span class="bk-amt">${int(o.amount)} шт</span>`;
      ol.append(li);
    });
    cell.append(ol);
    const spread = list.length > 1 ? (list[list.length - 1].price - list[0].price) / list[0].price : 0;
    cell.append(h("p", "muted small", `Топ-${list.length} дешёвых онлайн: от ${rub(list[0].price)} до ${rub(list[list.length - 1].price)} (разброс ${pct(spread)}). Длина полосы — сколько Divine у продавца (лог. шкала).`));
    grid.append(cell);
  }
  return grid;
}

// ---------- Seasons ----------
function seasons(games) {
  const wrap = h("div", "rmt-seasons");
  for (const g of games) {
    const s = g.season, start = Date.parse(s.start), end = Date.parse(s.end), next = Date.parse(s.next);
    const span = next + (end - start) * 0.15 - start;
    const at = (t) => `${Math.max(0, Math.min(100, ((t - start) / span) * 100)).toFixed(2)}%`;
    const row = h("div", "ss-row");
    row.innerHTML = `
      <p class="rmt-multi-title"><i style="--c:${g.color}"></i>${g.short}</p>
      <div class="ss-track">
        <span class="ss-league" style="left:0;width:${at(end)};--c:${g.color}"><b>${esc(leagueName(s.league))}</b></span>
        <span class="ss-next" style="left:${at(next)};right:0;--c:${g.color}"><b>${esc(s.nextName)}</b></span>
        <span class="ss-today" style="left:${at(Date.now())}"><em>сегодня</em></span>
      </div>
      <div class="ss-dates"><span>старт ${dateTxt(start)}</span><span>конец ${dateTxt(end)}</span><span>${esc(s.nextName)} — ${dateTxt(next)}</span></div>
      <p class="small">${
        s.phase === "live" ? `Идёт день ${Math.floor(g.sd.day) + 1} из ${Math.round(g.sd.length)}, до конца лиги ${daysTxt(g.sd.left)}, до старта ${esc(s.nextName)} — ${daysTxt(g.sd.nextIn)}.`
        : s.phase === "ended" ? `Лига закончилась, до старта ${esc(s.nextName)} — ${daysTxt(g.sd.nextIn)}. Цены сейчас неактуальны.`
        : `${esc(s.nextName)} уже стартовал, ждём продавцов на FunPay — пока показаны цены прошлой лиги.`
      }${s.estimated ? " Даты оценочные: календарь обновился автоматически." : ""}${g.newerLeagues?.length ? ` На FunPay уже появилась лига: ${esc(g.newerLeagues.join(", "))}.` : ""}</p>`;
    wrap.append(row);
  }
  return wrap;
}

// ---------- Savings goal with a farming-rate calculator ----------
function goal(games, store) {
  const wrap = h("div", "");
  const saved = store.get(CALC_KEY, null);
  const calc = { rate: saved?.rate ?? RMT_GOAL.divinesPerHour.poe1, hours: saved?.hours ?? RMT_GOAL.hoursPerDay };
  const controls = h("div", "rmt-calc");
  controls.innerHTML = `
    <label><span>Divine в час <b class="cv-rate"></b></span><input type="range" min="1" max="30" step="1" class="ci-rate"></label>
    <label><span>Часов фарма в день <b class="cv-hours"></b></span><input type="range" min="1" max="16" step="1" class="ci-hours"></label>
    <button type="button" class="link-egg cv-reset">Вернуть оценку по умолчанию</button>`;
  const cards = h("div", "rmt-cards");
  const chartBox = h("div", "rmt-chart");
  wrap.append(h("p", "muted small", "Сколько нужно продать и когда накопится, если фармить и продавать по самой низкой цене FunPay. Двигай ползунки — всё пересчитается."), controls, cards, h("h3", "rmt-h3", "Как растёт копилка"), chartBox);

  const ri = controls.querySelector(".ci-rate"), hi = controls.querySelector(".ci-hours");
  ri.value = calc.rate;
  hi.value = calc.hours;

  function draw() {
    controls.querySelector(".cv-rate").textContent = calc.rate;
    controls.querySelector(".cv-hours").textContent = calc.hours;
    cards.innerHTML = "";
    const series = [];
    for (const g of games) {
      if (!g.price || !g.model) continue;
      const need = Math.ceil(RMT_GOAL.priceRub / g.price);
      const fc = forecast({ season: g.season, model: g.model, divinesPerHour: calc.rate, hoursPerDay: calc.hours, goal: RMT_GOAL.priceRub, track: true });
      const farmDays = need / calc.rate / calc.hours;
      const c = h("article", "rmt-card goal");
      c.style.setProperty("--c", g.color);
      c.innerHTML = `
        <header><b>${g.short}</b><span>по сегодняшней цене ${rub(g.price)}</span></header>
        <div class="rmt-big">${int(need)} <small>Divine</small></div>
        <p class="rmt-cap">≈ ${int(need / calc.rate)} ч фарма · ${farmDays >= 365 ? yearsTxt(farmDays / 365) : daysTxt(farmDays)} по ${calc.hours} ч в день · без перерыва ${yearsTxt(need / calc.rate / 24 / 365)}</p>
        <dl class="rmt-kv">
          <div><dt>До конца этой лиги</dt><dd>${rub(fc.thisSeason, 0)}</dd></div>
          <div><dt>Первая неделя ${esc(g.season.nextName)}</dt><dd>${rub(fc.firstWeekNext, 0)}</dd></div>
          <div><dt>Доход в час сейчас</dt><dd>${rub(calc.rate * g.price, 0)}</dd></div>
          <div><dt>Накопит на ПК</dt><dd class="eta">${fc.goalAt ? monthYear(fc.goalAt) : "не за 40 лет"}</dd></div>
        </dl>`;
      cards.append(c);
      series.push({ name: g.short, color: g.color, points: fc.points || [] });
    }
    lineChart(chartBox, {
      series,
      xFmt: (t) => String(new Date(t).getFullYear()), tipX: (t) => monthYear(t),
      yFmt: (v, tip) => (tip ? rub(v, 0) : v >= 1000 ? `${int(v / 1000)} тыс` : int(v)),
      refs: [{ y: RMT_GOAL.priceRub, label: `цель ${int(RMT_GOAL.priceRub)} ₽` }],
      height: 230,
      label: "Накопления по времени"
    });
  }
  const onInput = () => { calc.rate = +ri.value; calc.hours = +hi.value; store.set(CALC_KEY, calc); draw(); };
  ri.addEventListener("input", onInput);
  hi.addEventListener("input", onInput);
  controls.querySelector(".cv-reset").addEventListener("click", () => {
    ri.value = RMT_GOAL.divinesPerHour.poe1;
    hi.value = RMT_GOAL.hoursPerDay;
    onInput();
  });
  setTimeout(draw, 0);
  return wrap;
}

// ---------- Method ----------
function method(games, meta) {
  const estimate = games.some((g) => g.model?.source === "estimate");
  const converted = games.find((g) => g.source === "cbr" && g.original);
  const ul = h("ul", "rmt-method");
  const items = [
    "Цена — самая низкая за 1 Divine Orb у продавцов, которые сейчас онлайн, в текущей основной лиге (без Standard, Hardcore, Ruthless и ивентов). Обновляется раз в 20 минут.",
    "Новая лига подхватывается автоматически, как только у неё на FunPay появляются 3+ продавца онлайн; история цен хранится отдельно по каждой лиге.",
    "Почасовые графики: минимум цены и максимум продавцов за каждый час, последние 14 дней. Стакан — 10 самых дешёвых онлайн-предложений.",
    estimate
      ? `Кривая сезона: цена = пол × (1 + (k − 1)·e^(−день/τ)). Пока реальных дней меньше ${MIN_POINTS}, форма оценочная (k = ${RMT_MODEL.k}, τ = ${RMT_MODEL.tau} дней), по ней решается только «пол» из сегодняшней цены.`
      : "Кривая сезона построена по реальным ежедневным минимумам FunPay за эту лигу (подбор k и τ).",
    "Копилка: день за днём доход = Divine в час × часы × цена по кривой; между лигами дохода нет, следующие лиги повторяют тот же ритм и кривую. Комиссия FunPay не учитывается.",
    `Оценка темпа по умолчанию (${RMT_GOAL.divinesPerHour.poe1} Divine/ч, ${RMT_GOAL.hoursPerDay} ч в день) — игрок выше среднего: уверенный маппер 3–6/ч, дисциплинированный фармер 10–20/ч.`
  ];
  if (converted) items.push(`FunPay отдаёт цены в ${converted.original.unit}; пересчёт по курсу ЦБ: 1 ${converted.original.unit} = ${converted.rate} ₽.`);
  for (const t of items) ul.append(h("li", "", esc(t)));
  return ul;
}
