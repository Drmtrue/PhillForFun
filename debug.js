// Debug mode: a panel to test every animation, reaction, line and shot outcome of Phil.
// Entered with a secret combo (see app.js); while it is on, nothing is sent to the server
// (no events, no XP, no achievements) and the mascot's talents are shown as fully unlocked.
// initDebug({ phil, hoop, sfx, toast, onEnter, onExit }) → { enter(), exit(), get on() }

import { TALENTS, BRANCHES, TALENT_LINES, MAX_LEVEL, xpForLevel } from "./talents.js?v=202610260526";

const REACTIONS = ["happy", "sad", "shock", "smug", "wave", "angry"];
const SCENE_TITLES = Object.fromEntries(TALENTS.filter((t) => t.anim).map((t) => [t.anim, `${t.icon} ${t.title}`]));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function initDebug({ phil, hoop, sfx, toast, onEnter, onExit }) {
  let on = false, panel = null, savedXp = null;

  function enter() {
    if (on) return;
    on = true;
    document.body.classList.add("debug-on");
    savedXp = { ...(phil.progress?.xp || {}) };
    phil.setProgress(Object.fromEntries(Object.keys(BRANCHES).map((b) => [b, xpForLevel(MAX_LEVEL)]))); // everything unlocked for testing
    onEnter && onEnter();
    build();
    toast("🛠️ Дебаг-режим", "Опыт, события и ачивки на сервер не идут. Все таланты открыты.");
    sfx.egg();
  }

  function exit() {
    if (!on) return;
    on = false;
    document.body.classList.remove("debug-on");
    panel?.remove();
    panel = null;
    phil.body?.stop();
    onExit && onExit();
    toast("Дебаг выключен", "Прогресс и лента снова настоящие.");
  }

  function build() {
    panel = document.createElement("aside");
    panel.className = "dbg";
    panel.setAttribute("aria-label", "Дебаг-панель");
    const scenes = phil.body ? phil.body.scenes : [];
    panel.innerHTML = `
      <header class="dbg-head">
        <b>🛠️ Дебаг Фила</b>
        <span class="dbg-state"></span>
        <button type="button" class="dbg-min" title="Свернуть">—</button>
        <button type="button" class="btn primary dbg-exit">Выход</button>
      </header>
      <div class="dbg-body">
        ${!phil.body ? '<p class="muted small">3D-Фил не загрузился (нет WebGL): анимации недоступны, но фразы и реакции работают.</p>' : ""}
        <h4>Анимации талантов</h4>
        <div class="dbg-grid">${scenes.map((n) => `<button type="button" data-scene="${n}">${esc(SCENE_TITLES[n] || n)}</button>`).join("")}</div>
        <h4>Реакции и действия</h4>
        <div class="dbg-grid">
          ${REACTIONS.map((r) => `<button type="button" data-react="${r}">${r}</button>`).join("")}
          <button type="button" data-act="smoke">🚬 перекур</button>
          <button type="button" data-act="glasses">🕶️ очки</button>
          <button type="button" data-act="stop">⏹ стоп</button>
        </div>
        <h4>Бросок в боковое кольцо</h4>
        <div class="dbg-grid">
          <button type="button" data-shot="make">попасть</button>
          <button type="button" data-shot="miss">промазать</button>
          <button type="button" data-shot="random">как повезёт (5%)</button>
        </div>
        <p class="muted small dbg-note">${hoop?.court?.enabled ? "Кольцо на экране, мяч свободен." : "Кольца нет: нужен широкий экран."}</p>
        <h4>Фразы</h4>
        <div class="dbg-row">
          <select class="dbg-pool">${Object.keys(phil.lines).map((k) => `<option value="${k}">${k}</option>`).join("")}</select>
          <button type="button" class="dbg-say">сказать</button>
        </div>
        <div class="dbg-row">
          <select class="dbg-tpool">${Object.entries(TALENT_LINES).map(([k, v]) => Object.keys(v).map((ev) => `<option value="${k}:${ev}">${k} → ${ev}</option>`).join("")).join("")}</select>
          <button type="button" class="dbg-tsay">острая</button>
        </div>
        <h4>Уровни веток (только здесь)</h4>
        ${Object.entries(BRANCHES).map(([k, b]) => `<label class="dbg-lvl"><span>${b.icon} ${b.title} <b data-lvl-out="${k}">${MAX_LEVEL}</b></span><input type="range" min="0" max="${MAX_LEVEL}" value="${MAX_LEVEL}" data-lvl="${k}"></label>`).join("")}
        <p class="muted small">Ползунки меняют открытые таланты только в этом браузере и только пока дебаг включён.</p>
      </div>`;
    document.body.append(panel);

    const state = panel.querySelector(".dbg-state");
    const tick = () => { if (!on) return; state.textContent = phil.body ? (phil.body.scene ? `сцена: ${phil.body.scene}` : phil.body.busy ? "занят" : "свободен") : ""; requestAnimationFrame(tick); };
    tick();

    panel.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.classList.contains("dbg-exit")) return exit();
      if (b.classList.contains("dbg-min")) { panel.classList.toggle("min"); b.textContent = panel.classList.contains("min") ? "+" : "—"; return; }
      if (b.dataset.scene) { phil.body?.stop(); if (!phil.body?.play(b.dataset.scene)) toast("Фил занят", "Нажми «стоп» и попробуй ещё раз."); }
      if (b.dataset.react) phil.body?.react(b.dataset.react);
      if (b.dataset.act === "smoke") phil.smoke();
      if (b.dataset.act === "glasses") { phil.body?.glasses(true); setTimeout(() => phil.body?.glasses(false), 6000); }
      if (b.dataset.act === "stop") phil.body?.stop();
      if (b.dataset.shot) {
        const make = b.dataset.shot === "make" ? true : b.dataset.shot === "miss" ? false : Math.random() < 0.05;
        if (!phil.shoot(make, true)) toast("Бросок не вышел", "Кольца нет на экране или мяч в руках у игрока.");
      }
      if (b.classList.contains("dbg-say")) phil.say(panel.querySelector(".dbg-pool").value, { force: true });
      if (b.classList.contains("dbg-tsay")) {
        const [pool, ev] = panel.querySelector(".dbg-tpool").value.split(":");
        const lines = TALENT_LINES[pool][ev];
        phil.say({ id: `dbg_${pool}_${ev}`, mood: "smug", pri: 3, lines }, { force: true });
      }
    });
    panel.addEventListener("input", (e) => {
      const r = e.target.closest("input[data-lvl]");
      if (!r) return;
      panel.querySelector(`[data-lvl-out="${r.dataset.lvl}"]`).textContent = r.value;
      const xp = {};
      panel.querySelectorAll("input[data-lvl]").forEach((i) => { xp[i.dataset.lvl] = xpForLevel(+i.value); });
      phil.setProgress(xp);
    });
  }

  return { enter, exit, get on() { return on; }, get savedXp() { return savedXp; } };
}
