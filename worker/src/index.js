import { DurableObject } from "cloudflare:workers";
import { generateQuestions, regenerateAnswer } from "./generate.js";
import { fetchDivinePrices } from "./prices.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });

const clean = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Event feed: types the browser may post (the rest are logged by the server itself)
const CLIENT_EVENTS = new Set(["quiz_quit", "phil_shot", "phil_say", "ft_session", "farm_end", "bath_end", "smoke_milestone"]);
// Phil's progression: every event feeds XP into one of four talent branches, shared by all players
const BRANCHES = ["hoops", "farm", "chill", "mind"];
function xpFor(type, d = {}) {
  switch (type) {
    case "quiz_finish": return { mind: 20 + (d.score || 0) * 4 + (d.score === d.total ? 40 : 0) };
    case "quiz_quit": return { mind: 5 };
    case "fact_added": return { mind: 35 };
    case "ach": return { mind: 25 };
    case "basket": return { hoops: 8 * (d.n || 1) };
    case "ft_session": return { hoops: 4 * (d.shots || 0) + 6 * (d.made || 0) + 10 * (d.best || 0) };
    case "phil_shot": return { hoops: d.made ? 120 : 10 };
    case "phil_say": return { chill: 3 };
    case "farm_end": return { farm: 15 + Math.min(150, Math.round((d.rub || 0) / 10)) + (d.scammed ? 10 : 0) };
    case "bath_end": return { chill: 10 + Math.min(120, Math.round((d.sec || 0) / 2)) };
    case "smoke_milestone": return { chill: d.upgrade ? 60 : 30 };
    default: return {};
  }
}

// Small, flat event payloads only: numbers, booleans and short strings
function cleanData(d) {
  const out = {};
  if (!d || typeof d !== "object") return out;
  for (const [k, v] of Object.entries(d).slice(0, 10)) {
    if (!/^[a-z_]{1,20}$/i.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.round(v * 100) / 100;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = clean(v, 160);
  }
  return out;
}

export default {
  // Hourly cron: keep the price cache and the daily history fresh even when nobody visits
  async scheduled(event, env, ctx) {
    const store = env.STORE.get(env.STORE.idFromName("main"));
    ctx.waitUntil(store.divinePrices(fetchDivinePrices));
  },

  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const store = env.STORE.get(env.STORE.idFromName("main"));
    const ip = request.headers.get("CF-Connecting-IP") || "local";

    try {
      // Generated questions for the game
      if (path === "/questions" && request.method === "GET") {
        return json({ questions: await store.listQuestions() });
      }

      // Leaderboard
      if (path === "/scores" && request.method === "GET") {
        return json({ scores: await store.topScores(20) });
      }
      if (path === "/scores" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const name = clean(body.name, 30);
        const total = Number(body.total);
        const score = Number(body.score);
        if (!name || !Number.isInteger(total) || total < 1 || total > 10 ||
            !Number.isInteger(score) || score < 0 || score > total) {
          return json({ error: "Некорректный результат" }, 400);
        }
        if (!(await store.allow(ip, "score", 30, 3600))) {
          return json({ error: "Слишком много попыток, передохни" }, 429);
        }
        await store.addScore(name, score, total);
        await store.logEvent("quiz_finish", name, { score, total });
        return json({ ok: true });
      }

      // One player's totals
      if (path === "/player" && request.method === "GET") {
        const name = clean(url.searchParams.get("name"), 30);
        if (!name) return json({ error: "Нужно имя" }, 400);
        return json(await store.playerStats(name));
      }

      // Cheapest Divine Orb prices on FunPay (cached, refreshed at most every 20 minutes)
      if (path === "/prices" && request.method === "GET") {
        return json(await store.divinePrices(fetchDivinePrices));
      }

      // Side-court baskets (counted separately from quiz points)
      if (path === "/baskets" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const name = clean(body.name, 30);
        const add = Number(body.add ?? 1);
        if (!name || !Number.isInteger(add) || add < 1 || add > 50) return json({ error: "Некорректный бросок" }, 400);
        if (!(await store.allow(ip, "basket", 400, 3600))) {
          return json({ error: "Слишком много бросков. Даже MJ отдыхал." }, 429);
        }
        const baskets = await store.addBaskets(name, add);
        await store.logEvent("basket", name, { n: add }, { mergeMinutes: 15 });
        return json({ baskets });
      }

      // Achievements (per player name)
      if (path === "/achievements" && request.method === "GET") {
        const name = clean(url.searchParams.get("name"), 30);
        if (!name) return json({ error: "Нужно имя" }, 400);
        return json({ ids: await store.listAchievements(name) });
      }
      if (path === "/achievements" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const name = clean(body.name, 30);
        const ids = (Array.isArray(body.ids) ? body.ids : [body.id])
          .map((x) => String(x ?? ""))
          .filter((x) => /^[a-z0-9_]{2,40}$/.test(x))
          .slice(0, 60);
        if (!name || !ids.length) return json({ error: "Некорректная ачивка" }, 400);
        if (!(await store.allow(ip, "ach", 300, 3600))) {
          return json({ error: "Слишком много ачивок за час. Даже Фил так не фармит." }, 429);
        }
        // A live unlock posts one id; a bulk sync from a new device posts many and is not announced
        return json({ ids: await store.addAchievements(name, ids, ids.length <= 2) });
      }

      // Event feed for the home page (newest first; pass ?before=<id> for older pages, ?after=<id> for new ones)
      if (path === "/events" && request.method === "GET") {
        const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit")) || 40));
        return json({ events: await store.listEvents(limit, Number(url.searchParams.get("before")) || 0, Number(url.searchParams.get("after")) || 0) });
      }
      if (path === "/events" && request.method === "POST") {
        // Accepts text/plain too, so navigator.sendBeacon works without a CORS preflight
        let body = {};
        try { body = JSON.parse((await request.text()) || "{}"); } catch (_) { return json({ error: "Некорректное событие" }, 400); }
        const type = String(body.type || "");
        if (!CLIENT_EVENTS.has(type)) return json({ error: "Неизвестное событие" }, 400);
        const name = clean(body.name, 30) || "Гость";
        if (!(await store.allow(ip, "event", 60, 3600))) return json({ error: "Слишком много событий" }, 429);
        if (type === "phil_say" && !(await store.allow(ip, "phil_say", 6, 3600))) return json({ ok: true, skipped: true });
        await store.logEvent(type, name, cleanData(body.data));
        return json({ ok: true });
      }

      // Phil's progression: XP per talent branch (shared by everyone)
      if (path === "/phil" && request.method === "GET") {
        return json(await store.philProgress());
      }

      // New fact -> questions
      if (path === "/facts" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const fact = clean(body.fact, 300);
        const author = clean(body.author, 30) || "Аноним";
        if (fact.length < 8) return json({ error: "Слишком коротко. Расскажи подробнее!" }, 400);
        if (!(env.AI_API_KEY || env.ANTHROPIC_API_KEY)) return json({ error: "Генерация не настроена" }, 503);

        const perHour = Number(env.FACTS_PER_HOUR_PER_IP || 20);
        const perDay = Number(env.FACTS_PER_DAY_TOTAL || 100);
        if (!(await store.allow(ip, "fact", perHour, 3600))) {
          return json({ error: `Не больше ${perHour} фактов в час. Фил столько не работал, и ты отдохни.` }, 429);
        }
        if (!(await store.allow("all", "fact", perDay, 86400))) {
          return json({ error: "На сегодня лимит фактов исчерпан. Приходи завтра!" }, 429);
        }

        const context = await store.context();
        const result = await generateQuestions(env, fact, context);
        if (!result.accepted) {
          await store.logFact(fact, author, ip, "rejected", result.reason);
          return json({ accepted: false, reason: result.reason });
        }
        const factId = await store.logFact(fact, author, ip, "accepted", "");
        const saved = await store.addQuestions(factId, author, result.questions);
        await store.logEvent("fact_added", author, { fact: fact.slice(0, 140), n: saved.length });
        return json({ accepted: true, questions: saved });
      }

      // Admin: list and delete
      if (path.startsWith("/admin")) {
        const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ error: "Нет доступа" }, 401);

        if (path === "/admin/questions" && request.method === "GET") {
          return json({ questions: await store.listQuestions(true) });
        }
        if (path === "/admin/facts" && request.method === "GET") {
          return json({ facts: await store.listFacts() });
        }
        const m = path.match(/^\/admin\/questions\/(\d+)$/);
        if (m && request.method === "DELETE") {
          await store.deleteQuestion(Number(m[1]));
          return json({ ok: true });
        }

        // Manual edit of the question text or any answer
        if (m && request.method === "PATCH") {
          const id = Number(m[1]);
          const cur = await store.getQuestion(id);
          if (!cur) return json({ error: "Вопрос не найден" }, 404);
          const body = await request.json().catch(() => ({}));
          const next = {
            q: body.q !== undefined ? clean(body.q, 200) : cur.q,
            correct: body.correct !== undefined ? clean(body.correct, 100) : cur.correct,
            wrong: Array.isArray(body.wrong) ? body.wrong.map((w) => clean(w, 100)) : cur.wrong
          };
          const all = [next.correct, ...next.wrong];
          if (!next.q || next.wrong.length !== 3 || all.some((x) => !x)) return json({ error: "Пустые поля не допускаются" }, 400);
          if (new Set(all.map((x) => x.toLowerCase())).size !== 4) return json({ error: "Ответы должны различаться" }, 400);
          return json({ question: await store.updateQuestion(id, next) });
        }

        // Ask Root AI for a replacement of one answer: { slot: "correct" | 0 | 1 | 2 }
        const rg = path.match(/^\/admin\/questions\/(\d+)\/regenerate$/);
        if (rg && request.method === "POST") {
          if (!(env.AI_API_KEY || env.ANTHROPIC_API_KEY)) return json({ error: "Генерация не настроена" }, 503);
          const id = Number(rg[1]);
          const cur = await store.getQuestion(id);
          if (!cur) return json({ error: "Вопрос не найден" }, 404);
          const body = await request.json().catch(() => ({}));
          const slot = body.slot === "correct" ? "correct" : Number(body.slot);
          if (slot !== "correct" && ![0, 1, 2].includes(slot)) return json({ error: "Неизвестный ответ" }, 400);
          let text;
          try { text = await regenerateAnswer(env, cur, slot, cur.fact); }
          catch (e) { console.error(e); return json({ error: "Root AI не справился, попробуй ещё раз" }, 502); }
          const next = { q: cur.q, correct: cur.correct, wrong: [...cur.wrong] };
          if (slot === "correct") next.correct = text; else next.wrong[slot] = text;
          return json({ question: await store.updateQuestion(id, next) });
        }
      }

      if (path === "/") return json({ ok: true, name: "Трансформация Безработного API" });
      return json({ error: "Не найдено" }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: "Что-то сломалось. Где я в этой схеме?" }, 500);
    }
  }
};

export class QuizStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    const schema = [
      `CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          text TEXT NOT NULL,
          author TEXT NOT NULL,
          ip TEXT,
          status TEXT NOT NULL,
          reason TEXT,
          created_at INTEGER NOT NULL
        )`,
      `CREATE TABLE IF NOT EXISTS questions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          fact_id INTEGER,
          author TEXT NOT NULL,
          q TEXT NOT NULL,
          correct TEXT NOT NULL,
          wrong TEXT NOT NULL,
          deleted INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        )`,
      `CREATE TABLE IF NOT EXISTS scores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          score INTEGER NOT NULL,
          total INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )`,
      `CREATE TABLE IF NOT EXISTS hits (
          key TEXT NOT NULL,
          kind TEXT NOT NULL,
          ts INTEGER NOT NULL
        )`,
      `CREATE INDEX IF NOT EXISTS hits_idx ON hits (key, kind, ts)`,
      `CREATE TABLE IF NOT EXISTS kv (
          k TEXT PRIMARY KEY,
          v TEXT NOT NULL
        )`,
      `CREATE TABLE IF NOT EXISTS price_history (
          game TEXT NOT NULL,
          league TEXT NOT NULL,
          day TEXT NOT NULL,
          price REAL NOT NULL,
          samples INTEGER NOT NULL DEFAULT 1,
          PRIMARY KEY (game, league, day)
        )`,
      // Every price refresh (at most every 20 minutes): price, sellers and stock, for intraday charts
      `CREATE TABLE IF NOT EXISTS price_ticks (
          game TEXT NOT NULL,
          league TEXT NOT NULL,
          ts INTEGER NOT NULL,
          price REAL,
          online INTEGER NOT NULL,
          offers INTEGER NOT NULL,
          stock INTEGER NOT NULL DEFAULT 0
        )`,
      `CREATE INDEX IF NOT EXISTS price_ticks_idx ON price_ticks (game, league, ts)`,
      `CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts INTEGER NOT NULL,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          data TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 1
        )`,
      `CREATE TABLE IF NOT EXISTS phil_xp (
          branch TEXT PRIMARY KEY,
          xp INTEGER NOT NULL DEFAULT 0,
          events INTEGER NOT NULL DEFAULT 0
        )`,
      `CREATE TABLE IF NOT EXISTS league_seen (
          game TEXT NOT NULL,
          league TEXT NOT NULL,
          first_seen TEXT NOT NULL,
          PRIMARY KEY (game, league)
        )`,
      `CREATE TABLE IF NOT EXISTS baskets (
          name_key TEXT PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        )`,
      `CREATE TABLE IF NOT EXISTS achievements (
          name_key TEXT NOT NULL,
          ach_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (name_key, ach_id)
        )`
    ];
    for (const q of schema) this.sql.exec(q);
  }

  // Simple rate limit: at most `limit` events per `windowSec` seconds
  allow(key, kind, limit, windowSec) {
    const now = Date.now();
    const since = now - windowSec * 1000;
    this.sql.exec("DELETE FROM hits WHERE ts < ?", now - 2 * 86400 * 1000);
    const n = this.sql.exec("SELECT COUNT(*) AS n FROM hits WHERE key = ? AND kind = ? AND ts > ?", key, kind, since).one().n;
    if (n >= limit) return false;
    this.sql.exec("INSERT INTO hits (key, kind, ts) VALUES (?, ?, ?)", key, kind, now);
    return true;
  }

  context() {
    const facts = this.sql.exec("SELECT text FROM facts WHERE status = 'accepted' ORDER BY id DESC LIMIT 150").toArray().map((r) => r.text);
    const questions = this.sql.exec("SELECT q FROM questions WHERE deleted = 0 ORDER BY id DESC LIMIT 150").toArray().map((r) => r.q);
    return { facts, questions };
  }

  logFact(text, author, ip, status, reason) {
    this.sql.exec(
      "INSERT INTO facts (text, author, ip, status, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      text, author, ip, status, reason, Date.now()
    );
    return this.sql.exec("SELECT last_insert_rowid() AS id").one().id;
  }

  addQuestions(factId, author, list) {
    const saved = [];
    for (const x of list) {
      this.sql.exec(
        "INSERT INTO questions (fact_id, author, q, correct, wrong, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        factId, author, x.q, x.correct, JSON.stringify(x.wrong), Date.now()
      );
      const id = this.sql.exec("SELECT last_insert_rowid() AS id").one().id;
      saved.push({ id, author, ...x });
    }
    return saved;
  }

  listQuestions(withFact = false) {
    const rows = this.sql.exec(`
      SELECT q.id, q.author, q.q, q.correct, q.wrong, q.created_at, f.text AS fact
      FROM questions q LEFT JOIN facts f ON f.id = q.fact_id
      WHERE q.deleted = 0 ORDER BY q.id DESC
    `).toArray();
    return rows.map((r) => ({
      id: r.id,
      author: r.author,
      q: r.q,
      correct: r.correct,
      wrong: JSON.parse(r.wrong),
      ...(withFact ? { fact: r.fact, createdAt: r.created_at } : {})
    }));
  }

  listFacts() {
    return this.sql.exec("SELECT id, text, author, status, reason, created_at FROM facts ORDER BY id DESC LIMIT 300").toArray();
  }

  getQuestion(id) {
    const r = this.sql.exec(`
      SELECT q.id, q.author, q.q, q.correct, q.wrong, q.created_at, f.text AS fact
      FROM questions q LEFT JOIN facts f ON f.id = q.fact_id
      WHERE q.id = ? AND q.deleted = 0
    `, id).toArray()[0];
    if (!r) return null;
    return { id: r.id, author: r.author, q: r.q, correct: r.correct, wrong: JSON.parse(r.wrong), fact: r.fact, createdAt: r.created_at };
  }

  updateQuestion(id, { q, correct, wrong }) {
    this.sql.exec("UPDATE questions SET q = ?, correct = ?, wrong = ? WHERE id = ?", q, correct, JSON.stringify(wrong), id);
    return this.getQuestion(id);
  }

  deleteQuestion(id) {
    this.sql.exec("UPDATE questions SET deleted = 1 WHERE id = ?", id);
  }

  addScore(name, score, total) {
    this.sql.exec("INSERT INTO scores (name, score, total, created_at) VALUES (?, ?, ?, ?)", name, score, total, Date.now());
  }

  // Per-player totals from all attempts. Grouping is done in JS because SQLite's lower()
  // only folds ASCII, and most names here are Cyrillic.
  playerTotals() {
    const rows = this.sql.exec("SELECT name, score, total, created_at FROM scores ORDER BY id").toArray();
    const map = new Map();
    for (const r of rows) {
      const k = r.name.trim().toLowerCase();
      const p = map.get(k) || { name: r.name, attempts: 0, points: 0, possible: 0, firstAt: r.created_at };
      p.name = r.name; // latest spelling wins
      p.attempts += 1;
      p.points += r.score;
      p.possible += r.total;
      map.set(k, p);
    }
    return map;
  }

  // Sorted by average points per attempt; ties go to more attempts, then to whoever started first.
  topScores(limit) {
    const ach = new Map(
      this.sql.exec("SELECT name_key AS k, COUNT(*) AS n FROM achievements GROUP BY name_key").toArray().map((r) => [r.k, r.n])
    );
    const baskets = this.basketMap();
    return [...this.playerTotals().entries()]
      .map(([k, p]) => ({ ...p, avg: Math.round((p.points / p.attempts) * 10) / 10, achievements: ach.get(k) || 0, baskets: baskets.get(k) || 0 }))
      .sort((a, b) => b.points / b.attempts - a.points / a.attempts || b.attempts - a.attempts || a.firstAt - b.firstAt)
      .slice(0, limit);
  }

  playerStats(name) {
    const k = name.trim().toLowerCase();
    const p = this.playerTotals().get(k);
    const baskets = this.basketMap().get(k) || 0;
    if (!p) return { attempts: 0, points: 0, avg: 0, baskets };
    return { attempts: p.attempts, points: p.points, avg: Math.round((p.points / p.attempts) * 10) / 10, baskets };
  }

  // Price cache: refresh when older than 20 minutes; keep the previous value to show the trend
  async divinePrices(fetcher) {
    const TTL = 20 * 60 * 1000;
    const row = this.sql.exec("SELECT v FROM kv WHERE k = 'divine2'").toArray()[0];
    const cached = row ? JSON.parse(row.v) : null;
    if (cached && Date.now() - cached.updatedAt < TTL) return this.withHistory(cached);
    // Only one refresh at a time; other callers get the cached copy meanwhile
    if (this.refreshing) return cached ? this.withHistory(cached) : { prices: {}, updatedAt: 0, stale: true };
    this.refreshing = true;
    try {
      const { prices, errors } = await fetcher();
      const next = { prices: {}, updatedAt: Date.now(), errors };
      for (const k of ["poe1", "poe2"]) {
        const now = prices[k];
        const before = cached?.prices?.[k];
        if (now) {
          // Previous price for the trend arrow; it only changes when the price actually moves
          // and is reset when the league changes (new league = new economy)
          const same = before && before.league === now.league && before.price != null;
          const prev = same ? (before.price !== now.price ? before.price : before.prev ?? null) : null;
          next.prices[k] = { ...now, prev };
        } else if (before) {
          next.prices[k] = { ...before, stale: true };
        }
      }
      this.sql.exec("INSERT INTO kv (k, v) VALUES ('divine2', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", JSON.stringify(next));
      this.recordHistory(next.prices);
      return this.withHistory(next);
    } catch (e) {
      console.error("prices", e);
      return cached ? this.withHistory({ ...cached, stale: true }) : { prices: {}, updatedAt: 0, stale: true };
    } finally {
      this.refreshing = false;
    }
  }

  // One row per game, league and UTC day: the lowest online price seen that day
  recordHistory(prices) {
    const now = new Date().toISOString();
    const day = now.slice(0, 10);
    for (const [game, p] of Object.entries(prices || {})) {
      if (!p || p.stale || !p.league) continue;
      // Remember when each league first appeared: the real launch moment if the calendar is out of date
      this.sql.exec("INSERT OR IGNORE INTO league_seen (game, league, first_seen) VALUES (?, ?, ?)", game, p.league, now);
      this.sql.exec(
        "INSERT INTO price_ticks (game, league, ts, price, online, offers, stock) VALUES (?, ?, ?, ?, ?, ?, ?)",
        game, p.league, Date.now(), p.price, p.onlineOffers || 0, p.offers || 0, p.stock || 0
      );
      if (p.price == null) continue;
      this.sql.exec(
        `INSERT INTO price_history (game, league, day, price, samples) VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(game, league, day) DO UPDATE SET price = MIN(price, excluded.price), samples = samples + 1`,
        game, p.league, day, p.price
      );
    }
  }

  // Attach the current league's daily history and the last 14 days of hourly ticks to each game.
  // ticks: [hour start (ms), lowest price that hour, max online sellers, max offers, max online stock]
  withHistory(data) {
    const since = Date.now() - 14 * 86400000;
    this.sql.exec("DELETE FROM price_ticks WHERE ts < ?", Date.now() - 120 * 86400000);
    const out = { ...data, prices: { ...data.prices } };
    for (const [game, p] of Object.entries(out.prices)) {
      if (!p?.league) continue;
      const rows = this.sql.exec(
        "SELECT day, price FROM price_history WHERE game = ? AND league = ? ORDER BY day", game, p.league
      ).toArray();
      const seen = this.sql.exec("SELECT first_seen FROM league_seen WHERE game = ? AND league = ?", game, p.league).toArray()[0];
      const ticks = this.sql.exec(
        `SELECT (ts / 3600000) * 3600000 AS h, MIN(price) AS price, MAX(online) AS online, MAX(offers) AS offers, MAX(stock) AS stock
         FROM price_ticks WHERE game = ? AND league = ? AND ts >= ? GROUP BY h ORDER BY h`, game, p.league, since
      ).toArray();
      out.prices[game] = {
        ...p,
        firstSeen: seen?.first_seen || null,
        history: rows.map((r) => [r.day, Math.round(r.price * 10000) / 10000]),
        ticks: ticks.map((t) => [t.h, t.price == null ? null : Math.round(t.price * 10000) / 10000, t.online, t.offers, t.stock])
      };
    }
    return out;
  }

  basketMap() {
    return new Map(this.sql.exec("SELECT name_key AS k, count FROM baskets").toArray().map((r) => [r.k, r.count]));
  }

  addBaskets(name, add) {
    const k = name.trim().toLowerCase();
    this.sql.exec(
      `INSERT INTO baskets (name_key, count, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(name_key) DO UPDATE SET count = count + excluded.count, updated_at = excluded.updated_at`,
      k, add, Date.now()
    );
    return this.sql.exec("SELECT count FROM baskets WHERE name_key = ?", k).one().count;
  }

  // Feed. mergeMinutes: fold a repeat of the same type by the same player into their latest row
  // (e.g. "забил 5 мячей" instead of five rows); the merged row moves to the top with a new id and time.
  logEvent(type, name, data = {}, { mergeMinutes = 0 } = {}) {
    const now = Date.now();
    this.addXp(xpFor(type, data));
    if (mergeMinutes) {
      const mine = this.sql.exec("SELECT id, data, ts FROM events WHERE type = ? AND name = ? ORDER BY id DESC LIMIT 1", type, name).toArray()[0];
      if (mine && now - mine.ts < mergeMinutes * 60000) {
        // Re-post under a new id so open pages that poll for newer ids pick up the updated count
        const d = JSON.parse(mine.data);
        d.n = (d.n || 1) + (data.n || 1);
        this.sql.exec("DELETE FROM events WHERE id = ?", mine.id);
        this.sql.exec("INSERT INTO events (ts, type, name, data) VALUES (?, ?, ?, ?)", now, type, name, JSON.stringify(d));
        return;
      }
    }
    this.sql.exec("INSERT INTO events (ts, type, name, data) VALUES (?, ?, ?, ?)", now, type, name, JSON.stringify(data));
    this.sql.exec("DELETE FROM events WHERE id <= (SELECT MAX(id) FROM events) - 5000");
  }

  addXp(gains) {
    for (const [branch, xp] of Object.entries(gains)) {
      if (!BRANCHES.includes(branch) || !(xp > 0)) continue;
      this.sql.exec(
        `INSERT INTO phil_xp (branch, xp, events) VALUES (?, ?, 1)
         ON CONFLICT(branch) DO UPDATE SET xp = xp + excluded.xp, events = events + 1`,
        branch, Math.round(xp)
      );
    }
  }

  philProgress() {
    const rows = this.sql.exec("SELECT branch, xp, events FROM phil_xp").toArray();
    const xp = Object.fromEntries(BRANCHES.map((b) => [b, 0]));
    const events = Object.fromEntries(BRANCHES.map((b) => [b, 0]));
    for (const r of rows) { xp[r.branch] = r.xp; events[r.branch] = r.events; }
    const players = this.sql.exec("SELECT COUNT(DISTINCT name) AS n FROM events").one().n;
    return { xp, events, players };
  }

  listEvents(limit, before, after) {
    const rows = after
      ? this.sql.exec("SELECT * FROM events WHERE id > ? ORDER BY id DESC LIMIT ?", after, limit).toArray()
      : before
        ? this.sql.exec("SELECT * FROM events WHERE id < ? ORDER BY id DESC LIMIT ?", before, limit).toArray()
        : this.sql.exec("SELECT * FROM events ORDER BY id DESC LIMIT ?", limit).toArray();
    return rows.map((r) => ({ id: r.id, ts: r.ts, type: r.type, name: r.name, data: JSON.parse(r.data) }));
  }

  listAchievements(name) {
    return this.sql.exec("SELECT ach_id FROM achievements WHERE name_key = ? ORDER BY created_at", name.trim().toLowerCase())
      .toArray().map((r) => r.ach_id);
  }

  addAchievements(name, ids, announce = false) {
    const key = name.trim().toLowerCase();
    const have = this.sql.exec("SELECT COUNT(*) AS n FROM achievements WHERE name_key = ?", key).one().n;
    let room = Math.max(0, 100 - have);
    for (const id of ids) {
      if (room <= 0) break;
      const known = this.sql.exec("SELECT 1 FROM achievements WHERE name_key = ? AND ach_id = ?", key, id).toArray().length;
      if (known) continue;
      this.sql.exec("INSERT INTO achievements (name_key, ach_id, created_at) VALUES (?, ?, ?)", key, id, Date.now());
      if (announce) this.logEvent("ach", name, { id });
      room--;
    }
    return this.listAchievements(name);
  }
}
