// Talent tree page: four branches with level, XP bar and the talents of each as a vertical path.
// renderTree(root, progress, xp, players)

import { BRANCHES, TALENTS, MAX_LEVEL, xpForLevel } from "./talents.js?v=202610260531";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const int = (x) => Math.round(x).toLocaleString("ru-RU");

const GENERIC_SOURCES = {
  hoops: "попадания в боковое кольцо, штрафные, броски героя (его попадание — +120)",
  farm: "раунды экономической мини-игры: чем больше заработал, тем больше опыта",
  chill: "расслабляющая игра (секунды), кликер, реплики героя",
  mind: "квизы (очки и 10/10), факты, ачивки"
};
// XP sources per branch, shown as a hint under each one
const SOURCES = {
  hoops: "попадания в боковое кольцо, штрафные, броски Фила (его попадание — +120)",
  farm: "лиги в «Фарме диванов»: чем больше рублей, тем больше опыта",
  chill: "ванна (секунды), перекур-кликер (сигареты и постройки), реплики Фила",
  mind: "квизы (очки и 10/10), факты о Филе, ачивки"
};

// hero: { nom, gen } — Phil by default; generic: XP hints without Phil's game names (builder portals)
export function renderTree(root, progress, xp, players, hero = { nom: "Фил", gen: "Фила" }, generic = false) {
  const src = generic ? GENERIC_SOURCES : SOURCES;
  const total = progress.total;
  root.innerHTML = `
    <div class="tree-summary">
      <div class="tree-level"><span class="sb-label">Уровень: ${esc(hero.nom)}</span><b>${total}</b><small>из ${MAX_LEVEL * 4}</small></div>
      <div class="tree-stats">
        ${Object.entries(BRANCHES).map(([k, b]) => `<div class="tree-stat"><span>${b.icon} ${b.stat}</span><i><em style="width:${(progress.levels[k] / MAX_LEVEL) * 100}%"></em></i><b>${progress.levels[k]}</b></div>`).join("")}
      </div>
      <p class="muted small">Открыто талантов: ${progress.unlocked.size} из ${TALENTS.length}${players ? ` · качают ${esc(hero.gen)} ${int(players)} ${plural(players, "человек", "человека", "человек")}` : ""}.</p>
    </div>
    <div class="tree-branches">
      ${Object.entries(BRANCHES).map(([k, b]) => branch(k, b, progress, xp[k] || 0, src)).join("")}
    </div>`;
}

function branch(key, b, progress, xp, src) {
  const lvl = progress.levels[key];
  const next = progress.next[key];
  const bar = next ? ((xp - next.from) / (next.need - next.from)) * 100 : 100;
  const items = TALENTS.filter((t) => t.branch === key).map((t) => {
    const open = progress.unlocked.has(t.id);
    const nextOne = !open && t.level === lvl + 1;
    return `
      <li class="talent ${open ? "open" : nextOne ? "next" : "locked"}" title="${esc(t.desc)}">
        <span class="talent-icon">${open ? t.icon : "🔒"}</span>
        <span class="talent-text"><b>${esc(t.title)}</b><small>${open ? esc(t.desc) : `Уровень ${t.level}${t.anim ? " · анимация" : ""}${t.lines ? " · фразы" : ""}`}</small></span>
        <span class="talent-lvl">${t.level}</span>
      </li>`;
  }).join("");
  return `
    <section class="branch branch-${key}">
      <header>
        <span class="branch-icon">${b.icon}</span>
        <div><h2>${b.title}</h2><p class="muted small">${b.desc}</p></div>
        <span class="branch-level">ур. ${lvl}</span>
      </header>
      <div class="branch-xp"><i style="width:${bar.toFixed(1)}%"></i></div>
      <p class="branch-xp-text">${next ? `${int(xp)} / ${int(next.need)} XP до уровня ${lvl + 1}` : `${int(xp)} XP · максимум`}</p>
      <ol class="talents">${items}</ol>
      <p class="muted small branch-src">Опыт: ${src[key]}.</p>
    </section>`;
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many;
}
