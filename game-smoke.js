// Mini-game "Перекур-кликер": click the cigarette to take a drag and earn smoke, spend smoke on upgrades.
// Progress is saved in the browser; idle upgrades keep earning while the page is open,
// and at half rate (up to 8 hours) while it is closed.

const KEY = "phill_smoke_clicker";
const PUFFS_PER_CIG = 12;
const OFFLINE_CAP_S = 8 * 3600;
const OFFLINE_RATE = 0.5;

const UPGRADES = [
  { id: "deep", icon: "😮‍💨", name: "Глубокая затяжка", desc: "+1 дыма за клик", base: 15, click: 1 },
  { id: "balcony", icon: "🪟", name: "Перекур на балконе", desc: "+1 дыма в секунду", base: 60, rate: 1 },
  { id: "lungs", icon: "🫁", name: "Лёгкие профи", desc: "+6 дыма за клик", base: 450, click: 6 },
  { id: "neighbor", icon: "🧔", name: "Сосед по лестнице", desc: "+5 дыма в секунду", base: 650, rate: 5 },
  { id: "office", icon: "🏢", name: "Курилка у офиса", desc: "Работы нет, курилка есть. +20/с", base: 4000, rate: 20 },
  { id: "hookah", icon: "🪔", name: "Кальянная", desc: "+80 дыма в секунду", base: 20000, rate: 80 },
  { id: "factory", icon: "🏭", name: "Завод дыма", desc: "+400 дыма в секунду", base: 120000, rate: 400 }
];

const LINES = {
  buy: { id: "smk_buy", mood: "happy", pri: 1, chance: 0.5, lines: ["Инвестиция в будущее. Дымное.", "Вот это я понимаю апгрейд.", "Ну с пивком потянет."] },
  cig: { id: "smk_cig", mood: "smug", pri: 1, chance: 0.35, lines: ["Ещё одна. Последняя. Честно.", "Пошёл дым.", "Сигарета кончилась, а перекур — нет."] },
  factory: { id: "smk_factory", mood: "shock", pri: 3, lines: ["Целый завод дыма?! Я дома."] },
  offline: { id: "smk_offline", mood: "smug", pri: 2, lines: ["Пока тебя не было, я не терял времени."] }
};

// ctx.skin (builder portals): { unit, item, itemPlural, upgrades: [[emoji, name, effect] x7] } renames everything
export function mountSmoke(el, ctx) {
  const sk = ctx.skin || null;
  const UP = sk?.upgrades?.length === 7 ? UPGRADES.map((u, i) => ({ ...u, icon: sk.upgrades[i][0], name: sk.upgrades[i][1], desc: sk.upgrades[i][2] || u.desc })) : UPGRADES;
  const T = {
    hint: sk ? "клик!" : "клик = затяжка",
    unit: sk ? cap(sk.unit) : "Дым",
    items: sk ? cap(sk.itemPlural) : "Сигарет",
    offline: (n) => (sk ? `Пока тебя не было, ${ctx.hero || "герой"} заработал ${n} (${sk.unit}).` : `Пока тебя не было, Фил накурил ${n} дыма.`)
  };
  const st = { smoke: 0, total: 0, cigs: 0, puffs: 0, own: {}, last: Date.now(), ...ctx.store.get(KEY, {}) };
  const owned = (id) => st.own[id] || 0;
  const perClick = () => 1 + UP.reduce((s, u) => s + (u.click || 0) * owned(u.id), 0);
  const perSec = () => UP.reduce((s, u) => s + (u.rate || 0) * owned(u.id), 0);
  const cost = (u) => Math.ceil(u.base * Math.pow(1.15, owned(u.id)));
  const save = () => { st.last = Date.now(); ctx.store.set(KEY, st); };

  el.innerHTML = `
    <p class="smk-offline" hidden></p>
    <div class="smk">
      <div class="smk-left">
        <button type="button" class="smk-cig" aria-label="Затянуться">
          <svg viewBox="0 0 300 80" aria-hidden="true">
            <rect class="smk-filter" x="10" y="28" width="70" height="24" rx="4"/>
            <rect class="smk-paper" x="80" y="28" width="190" height="24" rx="2"/>
            <rect class="smk-ash" x="80" y="28" width="12" height="24"/>
            <circle class="smk-ember" cx="270" cy="40" r="10"/>
          </svg>
          <span class="smk-hint">${T.hint}</span>
        </button>
        <div class="smk-fx" aria-hidden="true"></div>
      </div>
      <div class="game-stats smk-stats">
        <div><span class="sb-label">${T.unit}</span><b class="smk-smoke">0</b></div>
        <div><span class="sb-label">За клик</span><b class="smk-click">1</b></div>
        <div><span class="sb-label">В секунду</span><b class="smk-rate">0</b></div>
        <div><span class="sb-label">${T.items}</span><b class="smk-cigs">0</b></div>
      </div>
    </div>
    <div class="smk-shop"></div>`;
  const q = (s) => el.querySelector(s);
  const cigBtn = q(".smk-cig"), paper = q(".smk-paper"), ember = q(".smk-ember"), fx = q(".smk-fx"), shop = q(".smk-shop");

  // Earnings while the page was closed
  const away = Math.min(OFFLINE_CAP_S, (Date.now() - st.last) / 1000);
  const offline = perSec() * away * OFFLINE_RATE;
  if (offline >= 1) {
    st.smoke += offline;
    st.total += offline;
    const n = q(".smk-offline");
    n.hidden = false;
    n.textContent = T.offline(fmt(offline));
    ctx.onShow(() => ctx.say(LINES.offline), true);
  }

  // Shop buttons are built once and updated in place
  const rows = UP.map((u) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "smk-up";
    b.innerHTML = `<span class="smk-up-icon">${u.icon}</span><span class="smk-up-text"><b>${u.name}</b><small>${u.desc}</small></span><span class="smk-up-cost"></span><span class="smk-up-own"></span>`;
    b.addEventListener("click", () => {
      const c = cost(u);
      if (st.smoke < c) return;
      st.smoke -= c;
      st.own[u.id] = owned(u.id) + 1;
      ctx.sfx.pop(0.6);
      if (u.id === "factory") {
        ctx.unlock("smk_factory");
        ctx.say(LINES.factory, { force: true });
        if (owned(u.id) === 1) ctx.log?.("smoke_milestone", { upgrade: u.name });
      }
      else ctx.say(LINES.buy);
      save();
      render();
    });
    shop.append(b);
    return { u, b };
  });

  cigBtn.addEventListener("click", (e) => {
    const gain = perClick();
    st.smoke += gain;
    st.total += gain;
    st.puffs++;
    ctx.sfx.pop(0.25);
    cigBtn.classList.remove("drag");
    void cigBtn.offsetWidth;
    cigBtn.classList.add("drag");
    floatText(`+${fmt(gain)}`, e);
    if (st.puffs >= PUFFS_PER_CIG) {
      st.puffs = 0;
      st.cigs++;
      ctx.say(LINES.cig);
      if (st.cigs >= 20) ctx.unlock("smk_pack");
      if (st.cigs % 5 === 0 && !ctx.scene?.("rings")) ctx.phil.smoke();
      if (st.cigs % 25 === 0) ctx.log?.("smoke_milestone", { cigs: st.cigs });
    }
    checkAch();
    render();
  });

  function floatText(text, e) {
    const r = fx.getBoundingClientRect();
    const t = document.createElement("span");
    t.className = "smk-float";
    t.textContent = text;
    const x = e && e.clientX ? e.clientX - r.left : r.width / 2;
    t.style.left = `${x}px`;
    t.style.top = `${(e && e.clientY ? e.clientY - r.top : r.height / 2) - 10}px`;
    fx.append(t);
    const puff = document.createElement("i");
    puff.className = "smk-puff";
    puff.style.left = `${r.width * 0.86}px`;
    fx.append(puff);
    setTimeout(() => { t.remove(); puff.remove(); }, 1400);
  }

  function checkAch() {
    if (st.total >= 10000) ctx.unlock("smk_10k");
  }

  function render() {
    q(".smk-smoke").textContent = fmt(st.smoke);
    q(".smk-click").textContent = fmt(perClick());
    q(".smk-rate").textContent = fmt(perSec());
    q(".smk-cigs").textContent = st.cigs;
    // The cigarette burns down with every drag
    const left = 1 - st.puffs / PUFFS_PER_CIG;
    const len = 20 + 170 * left;
    paper.setAttribute("width", len.toFixed(1));
    ember.setAttribute("cx", (80 + len).toFixed(1));
    for (const { u, b } of rows) {
      const c = cost(u);
      b.disabled = st.smoke < c;
      b.querySelector(".smk-up-cost").textContent = `${fmt(c)} 💨`;
      b.querySelector(".smk-up-own").textContent = owned(u.id) ? `×${owned(u.id)}` : "";
    }
  }

  // Idle income: keeps ticking while the page is open, even in other sections
  let lastTick = performance.now(), sinceSave = 0;
  setInterval(() => {
    const now = performance.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    const gain = perSec() * dt;
    if (gain > 0) { st.smoke += gain; st.total += gain; checkAch(); }
    sinceSave += dt;
    if (sinceSave > 5) { sinceSave = 0; save(); }
    if (el.offsetParent) render();
  }, 250);
  window.addEventListener("pagehide", save);
  render();
}

const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

function fmt(x) {
  x = Math.floor(x);
  if (x >= 1e9) return `${(x / 1e9).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд`;
  if (x >= 1e6) return `${(x / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
  if (x >= 1e5) return `${(x / 1e3).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} тыс`;
  return x.toLocaleString("ru-RU");
}
