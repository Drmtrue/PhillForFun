// Which portal this page shows. ?p=<slug> picks a portal made with the builder; without it the page is Phil's.
// loadPortal() fetches the published config (or the owner's draft for a preview) before the app starts.
// Phil's own content stays in the code; other portals override it from their config.

import { API_URL } from "./config.js?v=202610260526";

const params = new URLSearchParams(location.search);
export const SLUG = (params.get("p") || "phil").toLowerCase().replace(/[^a-z0-9-]/g, "") || "phil";
export const IS_PHIL = SLUG === "phil";
export const ACCOUNT_KEY = "phill_account_key";

// Live config; empty for Phil
export const PORTAL = { slug: SLUG, config: null, face: null, name: null, error: null };

export function accountKey() {
  try { return localStorage.getItem(ACCOUNT_KEY) || ""; } catch (_) { return ""; }
}

// Name of the hero in a Russian case: nom, gen, dat, acc, ins, pre
export function hero(form = "nom") {
  if (IS_PHIL || !PORTAL.config) return { nom: "Фил", gen: "Фила", dat: "Филу", acc: "Фила", ins: "Филом", pre: "Филе" }[form];
  return PORTAL.config.persona?.forms?.[form] || PORTAL.name || "";
}

// Adds ?portal=<slug> to API paths for everything that belongs to one portal
export function withPortal(path) {
  if (IS_PHIL) return path;
  return path + (path.includes("?") ? "&" : "?") + "portal=" + encodeURIComponent(SLUG);
}

export async function loadPortal() {
  if (IS_PHIL) return PORTAL;
  try {
    const key = accountKey();
    const res = await fetch(`${API_URL.replace(/\/+$/, "")}/portal?slug=${encodeURIComponent(SLUG)}`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {}
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Портал не найден");
    PORTAL.config = data.config || {};
    PORTAL.face = data.face || null;
    PORTAL.name = data.name;
    PORTAL.status = data.status;
  } catch (e) {
    PORTAL.error = String(e.message || e);
  }
  return PORTAL;
}

const FONTS = { "Anton": "Anton", "Russo One": "Russo+One", "Unbounded": "Unbounded:wght@700", "Rubik Mono One": "Rubik+Mono+One", "Press Start 2P": "Press+Start+2P", "Oswald": "Oswald:wght@600", "Comfortaa": "Comfortaa:wght@700" };

// Theme and static texts of the page for a builder portal
export function applyPortalPage() {
  if (IS_PHIL) return;
  const $ = (s) => document.querySelector(s);
  const set = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
  if (PORTAL.error) {
    document.body.classList.add("portal-missing");
    $(".wrap").innerHTML = `<div class="portal-404"><h1 class="page-title">Портал не найден</h1><p class="lead">${PORTAL.error}. Проверь ссылку.</p><a class="btn primary" href="./">На главную</a></div>`;
    return;
  }
  const c = PORTAL.config, site = c.site || {}, col = c.colors || {};
  document.body.classList.add("portal", `pattern-${c.pattern || "court"}`);
  if (PORTAL.status !== "published") document.body.classList.add("portal-preview");

  // Colors and the heading font
  const root = document.documentElement.style;
  if (col.accent) { root.setProperty("--red", col.accent); root.setProperty("--red-2", col.accent); }
  if (col.accentDark) root.setProperty("--red-dark", col.accentDark);
  if (col.highlight) root.setProperty("--led", col.highlight);
  if (col.bg) root.setProperty("--bg", col.bg);
  if (c.font && FONTS[c.font] && c.font !== "Anton") {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = `https://fonts.googleapis.com/css2?family=${FONTS[c.font]}&display=swap`;
    document.head.append(l);
    root.setProperty("--head-font", `"${c.font}"`);
  }

  // Texts
  const nom = hero("nom"), gen = hero("gen"), dat = hero("dat"), pre = hero("pre");
  document.title = `${site.title1 || ""} ${site.title2 || ""}`.trim() || nom;
  $('meta[name="description"]')?.setAttribute("content", site.tagline || `Квиз и мини-игры про ${gen}`);
  set(".hero .kicker", ""); $(".hero .kicker").innerHTML = `<span class="dot"></span> ${escapeHtml(site.kicker || `фан-клуб • ${nom}`)}`;
  const h1 = $(".hero h1");
  h1.innerHTML = `${escapeHtml(site.title1 || "Портал")}<br><span id="title-word">${escapeHtml(site.title2 || gen)}</span>`;
  $(".hero .lead").textContent = site.tagline || `Всё про ${gen}: квиз, мини-игры и таланты.`;
  set("#jersey-num", site.emblemNumber || "7");
  set(".jersey-name", (site.emblemText || nom).toUpperCase().slice(0, 10));
  set('[data-page="quiz"] .page-title', `Кто знает ${gen}?`);
  set("#fact-block h2", `Знаешь что-то о ${pre}?`);
  $("#fact-text")?.setAttribute("placeholder", `Например: смешная история про ${gen}`);
  set(".sb-cell.sb-mid .sb-label", c.persona?.nickname || nom);
  set('[data-page="phil"] .page-title', `Таланты: ${nom}`);
  set('[data-page="phil"] .lead', `${nom} качается вместе со всеми: каждая игра, бросок, факт и ачивка на сайте идут в опыт. Новые уровни открывают анимации и острые фразы.`);
  set('.topnav a[data-page="phil"] b', "Таланты");

  // No RMT exchange for builder portals
  document.querySelectorAll('[data-page="rmt"]').forEach((el) => el.remove());

  // Mini-game names from the portal's skins
  const g = c.games || {};
  const card = (href, title, intro, btn) => {
    const a = document.querySelector(`a[href="${href}"]`);
    const art = a?.closest("article");
    if (!art) return;
    art.querySelector("h2").textContent = title;
    if (intro) art.querySelector("p").textContent = intro;
    if (btn) a.textContent = btn;
  };
  if (g.clicker) { card("#/games/smoke", `${g.clicker.upgrades?.[0]?.[0] || "⭐"} ${g.clicker.title}`, g.clicker.intro, "Играть"); set('.game-view[data-game="smoke"] .game-title', g.clicker.title); }
  if (g.farm) { card("#/games/farm", `💰 ${g.farm.title}`, g.farm.intro, "Старт"); set('.game-view[data-game="farm"] .game-title', g.farm.title); }
  if (g.relax) { card("#/games/bath", `🧘 ${g.relax.title}`, g.relax.intro, "Начать"); set('.game-view[data-game="bath"] .game-title', g.relax.title); }
  const side = document.querySelector('#side-count')?.closest("article")?.querySelector("p");
  if (side) side.textContent = `На широком экране сбоку от любого раздела висит кольцо. Хватай мяч у края экрана и бросай. ${nom} тоже иногда бросает — попробуй застать попадание.`;

  // Preview banner for the owner
  if (PORTAL.status !== "published") {
    const b = document.createElement("div");
    b.className = "preview-banner";
    b.innerHTML = `Превью портала — видишь только ты. <a href="./#/create">Вернуться в билдер</a>`;
    document.body.prepend(b);
  }
  void dat;
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
}
