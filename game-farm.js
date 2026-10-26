// Mini-game "Фарм диванов": a 90-second league. Run maps (click) to farm Divine Orbs and sell them before the
// price falls. The launch price follows the same decay curve as the RMT model, starting from today's real
// FunPay price; random league events push the price and drops around. Unsold Divines burn at league end.

const KEY = "phill_farm_best";
const DAYS = 30;
const DAY_MS = 3000;
const K = 3, TAU = 6;                    // launch premium and how fast it fades (in game days)
const DROP = 0.22, STACK = 0.015;        // chance per map run for 1 Divine, and for a 5-Divine stack
const SCAM = 0.07;                       // chance a sale gets scammed (half the money lost)

const EVENTS = [
  { id: "nerf", text: "Патч: дроп понерфили на 4 дня", apply: (s) => { s.dropMult = 0.5; s.dropUntil = s.day + 4; } },
  { id: "leak", text: "Стример слил стратегию — цена −25%", apply: (s) => { s.priceMult *= 0.75; } },
  { id: "bots", text: "Ботоводы зашли в лигу — цена −15%", apply: (s) => { s.priceMult *= 0.85; } },
  { id: "hype", text: "Хайп на новом билде — цена ×1.3 на 3 дня", apply: (s) => { s.hype = 1.3; s.hypeUntil = s.day + 3; } },
  { id: "bath", text: "Фил ушёл в ванну — 2 дня без фарма", apply: (s) => { s.afkUntil = s.day + 2; } }
];

const LINES = {
  start: { id: "farm_start", mood: "smug", pri: 2, lines: ["Старт лиги! Диваны сами себя не нафармят.", "Погнали фармить. Компьютер ждёт."] },
  stack: { id: "farm_stack", mood: "shock", pri: 2, lines: ["СТАК ДИВАНОВ! Скриньте!", "Пять диванов разом! Пошла вода горячая!"] },
  sell: { id: "farm_sell", mood: "happy", pri: 1, chance: 0.6, lines: ["Продано. Минус один кредит на ипотеку компьютера.", "Деньги пришли. На хлеб хватит.", "FunPay кормит."] },
  scam: { id: "farm_scam", mood: "sad", pri: 3, act: "angry", lines: ["Скамнули! Покупатель открыл арбитраж!", "Опять скам. Это всё FunPay."] },
  event: { id: "farm_event", mood: "shock", pri: 2, lines: ["Ну вот, началось.", "Такое только в моей лиге."] },
  burn: { id: "farm_burn", mood: "sad", pri: 3, act: "angry", lines: ["Лига кончилась, диваны ушли в Стандарт. Зачем я их копил?"] },
  end: { id: "farm_end", mood: "smug", pri: 3, lines: ["Лига закрыта. До компьютера осталось совсем чуть-чуть. Лет двадцать.", "Хорошая лига. Почти окупил сигареты."] }
};

// ctx.skin (builder portals): { currency, market, action } renames the round; events become generic
const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

export function mountFarm(el, ctx) {
  const sk = ctx.skin || null;
  const T = sk ? {
    cur: cap(sk.currency), action: sk.action, market: sk.market,
    events: [
      { text: "Рынок обвалился — цена −25%", apply: (s) => { s.priceMult *= 0.75; } },
      { text: "Конкуренты демпингуют — цена −15%", apply: (s) => { s.priceMult *= 0.85; } },
      { text: "Ажиотаж — цена ×1.3 на 3 дня", apply: (s) => { s.hype = 1.3; s.hypeUntil = s.day + 3; } },
      { text: "Добыча идёт хуже 4 дня", apply: (s) => { s.dropMult = 0.5; s.dropUntil = s.day + 4; } },
      { text: `${ctx.hero || "Герой"} ушёл отдыхать — 2 дня простоя`, apply: (s) => { s.afkUntil = s.day + 2; } }
    ],
    afk: "😴 отдых", scam: (m) => `🚨 Обман на рынке «${sk.market}»: пришла только половина (${m}).`,
    burnt: (n) => `🔥 ${n} непроданных пропали в конце раунда. `, start: () => "",
    best: (b) => `Рекорд за раунд: ${b}`, idle: "Раунд длится 90 секунд: 30 игровых дней по 3 секунды."
  } : {
    cur: "Диваны", action: "🗺️ Бежать карту", market: "FunPay", events: EVENTS, afk: "🛁 в ванне",
    scam: (m) => `🚨 Скам: покупатель открыл арбитраж, пришла только половина (${m}).`,
    burnt: (n) => `🔥 ${n} непроданных диванов ушли в Стандарт. `,
    start: (real, f) => (real ? `Стартовая цена — от сегодняшней на FunPay (${f(real)} за Divine), в начале лиги втрое дороже.` : ""),
    best: (b) => `Рекорд за лигу: ${b}`, idle: "Лига длится 90 секунд: 30 игровых дней по 3 секунды."
  };
  el.innerHTML = `
    <div class="farm-top">
      <div class="game-stats">
        <div><span class="sb-label">День</span><b class="fm-day">—</b></div>
        <div><span class="sb-label">Цена</span><b class="fm-price">—</b></div>
        <div><span class="sb-label">${T.cur}</span><b class="fm-divs">0</b></div>
        <div><span class="sb-label">Рубли</span><b class="fm-rub">0</b></div>
      </div>
      <div class="progress"><div class="progress-bar fm-bar"></div></div>
      <svg class="fm-chart" viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true"><polyline class="fm-line" points=""/></svg>
      <p class="fm-event muted small" aria-live="polite"></p>
    </div>
    <div class="farm-actions">
      <button type="button" class="btn primary fm-start">Старт лиги</button>
      <button type="button" class="btn fm-run" disabled>${T.action}</button>
      <button type="button" class="btn fm-sell" disabled>💰 Продать всё</button>
    </div>
    <p class="muted small fm-best"></p>`;
  const q = (s) => el.querySelector(s);
  let s = null, timer = null;
  const best = () => ctx.store.get(KEY, 0);

  const price = () => {
    const base = s.base * (1 + (K - 1) * Math.exp(-s.day / TAU));
    return base * s.priceMult * s.noise * (s.day < s.hypeUntil ? s.hype : 1);
  };
  const fmtRub = (x) => `${x.toLocaleString("ru-RU", { maximumFractionDigits: x < 10 ? 2 : 0 })} ₽`;

  function start() {
    const real = sk ? null : ctx.divinePrice();
    s = {
      day: 0, divs: 0, rub: 0, base: real || 1.2, priceMult: 1, noise: 1, hype: 1, hypeUntil: -1,
      dropMult: 1, dropUntil: -1, afkUntil: -1, history: [], sold: 0, running: true, lastEvent: -5, scammed: false
    };
    s.history.push(price());
    q(".fm-start").hidden = true;
    q(".fm-run").disabled = false;
    q(".fm-sell").disabled = false;
    q(".fm-event").textContent = T.start(real, fmtRub);
    ctx.say(LINES.start, { force: true });
    ctx.scene?.("dota");
    clearInterval(timer);
    timer = setInterval(tick, 100);
    s.dayStarted = performance.now();
    render();
  }

  // Days advance only while the game is on screen
  let lastT = performance.now();
  function tick() {
    const now = performance.now();
    const dt = now - lastT;
    lastT = now;
    if (!s || !s.running) return;
    if (!el.offsetParent || document.hidden) { s.dayStarted += dt; return; }
    if (now - s.dayStarted < DAY_MS) { renderBar(now); return; }
    s.dayStarted = now;
    s.day++;
    if (s.day >= DAYS) return finish();
    s.noise = 0.93 + Math.random() * 0.14;
    if (s.day >= s.dropUntil) s.dropMult = 1;
    if (s.day > 2 && s.day - s.lastEvent > 3 && Math.random() < 0.18) {
      const ev = T.events[Math.floor(Math.random() * T.events.length)];
      ev.apply(s);
      s.lastEvent = s.day;
      q(".fm-event").textContent = `📢 День ${s.day + 1}: ${ev.text}`;
      ctx.say(LINES.event);
    }
    s.history.push(price());
    render();
  }

  function run(e) {
    if (!s || !s.running) return;
    if (s.day < s.afkUntil) { flash(e, T.afk); return; }
    const r = Math.random();
    if (r < STACK * s.dropMult) { s.divs += 5; flash(e, "+5 💎"); ctx.sfx.egg(); ctx.say(LINES.stack); ctx.scene?.("divine"); }
    else if (r < (STACK + DROP) * s.dropMult) { s.divs += 1; flash(e, "+1 💎"); ctx.sfx.pop(0.4); }
    else ctx.sfx.pop(0.12);
    render();
  }

  function sell() {
    if (!s || !s.running || !s.divs) return;
    let money = s.divs * price();
    s.sold += s.divs;
    s.divs = 0;
    if (Math.random() < SCAM) {
      money /= 2;
      q(".fm-event").textContent = T.scam(fmtRub(money));
      ctx.say(LINES.scam, { force: true });
      ctx.scene?.("rage");
      ctx.unlock("farm_scam");
      s.scammed = true;
    } else ctx.say(LINES.sell);
    s.rub += money;
    ctx.sfx.swish();
    ctx.unlock("farm_first");
    if (s.sold >= 100) ctx.unlock("farm_baron");
    render();
  }

  function finish() {
    s.running = false;
    clearInterval(timer);
    const burnt = s.divs;
    if (burnt >= 20) ctx.unlock("farm_hodl");
    const left = Math.max(0, ctx.goalRub - s.rub);
    q(".fm-event").textContent = (burnt ? T.burnt(burnt) : "") +
      `Итог лиги: ${fmtRub(s.rub)}. До компьютера осталось ${fmtRub(left)}.`;
    ctx.say(burnt ? LINES.burn : LINES.end, { force: true });
    if (s.rub > best()) ctx.store.set(KEY, s.rub);
    ctx.log?.("farm_end", { rub: Math.round(s.rub), sold: s.sold, burnt, scammed: s.scammed });
    q(".fm-start").hidden = false;
    q(".fm-start").textContent = "Новая лига";
    q(".fm-run").disabled = true;
    q(".fm-sell").disabled = true;
    render();
  }

  function flash(e, text) {
    const t = document.createElement("span");
    t.className = "smk-float";
    t.textContent = text;
    const r = el.getBoundingClientRect();
    t.style.left = `${(e?.clientX ?? r.left + r.width / 2) - r.left}px`;
    t.style.top = `${(e?.clientY ?? r.top + r.height / 2) - r.top - 16}px`;
    el.append(t);
    setTimeout(() => t.remove(), 1300);
  }

  function renderBar(now) {
    const part = (s.day + Math.min(1, (now - s.dayStarted) / DAY_MS)) / DAYS;
    q(".fm-bar").style.width = `${(part * 100).toFixed(1)}%`;
  }

  function render() {
    q(".fm-best").textContent = best() ? T.best(fmtRub(best())) : T.idle;
    if (!s) return;
    q(".fm-day").textContent = `${Math.min(DAYS, s.day + 1)}/${DAYS}`;
    const p = price();
    const prev = s.history[s.history.length - 2];
    q(".fm-price").textContent = `${p.toFixed(2)}${prev ? (p >= prev ? "▲" : "▼") : ""}`;
    q(".fm-divs").textContent = s.divs;
    q(".fm-rub").textContent = Math.round(s.rub).toLocaleString("ru-RU");
    q(".fm-sell").textContent = s.divs ? `💰 Продать ${s.divs} за ${fmtRub(s.divs * p)}` : "💰 Продать всё";
    renderBar(performance.now());
    // Price history sparkline
    const h = s.history, max = Math.max(...h) * 1.05, n = DAYS - 1;
    q(".fm-line").setAttribute("points", h.map((v, i) => `${(i / n) * 300},${70 - (v / max) * 66}`).join(" "));
  }

  q(".fm-start").addEventListener("click", start);
  q(".fm-run").addEventListener("click", run);
  q(".fm-sell").addEventListener("click", sell);
  render();
}
