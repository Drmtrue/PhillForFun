import { DurableObject } from "cloudflare:workers";
import { generateQuestions } from "./generate.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });

const clean = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export default {
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
        return json({ ok: true });
      }

      // One player's totals
      if (path === "/player" && request.method === "GET") {
        const name = clean(url.searchParams.get("name"), 30);
        if (!name) return json({ error: "Нужно имя" }, 400);
        return json(await store.playerStats(name));
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
        return json({ ids: await store.addAchievements(name, ids) });
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
    return [...this.playerTotals().entries()]
      .map(([k, p]) => ({ ...p, avg: Math.round((p.points / p.attempts) * 10) / 10, achievements: ach.get(k) || 0 }))
      .sort((a, b) => b.points / b.attempts - a.points / a.attempts || b.attempts - a.attempts || a.firstAt - b.firstAt)
      .slice(0, limit);
  }

  playerStats(name) {
    const p = this.playerTotals().get(name.trim().toLowerCase());
    if (!p) return { attempts: 0, points: 0, avg: 0 };
    return { attempts: p.attempts, points: p.points, avg: Math.round((p.points / p.attempts) * 10) / 10 };
  }

  listAchievements(name) {
    return this.sql.exec("SELECT ach_id FROM achievements WHERE name_key = ? ORDER BY created_at", name.trim().toLowerCase())
      .toArray().map((r) => r.ach_id);
  }

  addAchievements(name, ids) {
    const key = name.trim().toLowerCase();
    const have = this.sql.exec("SELECT COUNT(*) AS n FROM achievements WHERE name_key = ?", key).one().n;
    let room = Math.max(0, 100 - have);
    for (const id of ids) {
      if (room <= 0) break;
      this.sql.exec("INSERT OR IGNORE INTO achievements (name_key, ach_id, created_at) VALUES (?, ?, ?)", key, id, Date.now());
      room--;
    }
    return this.listAchievements(name);
  }
}
