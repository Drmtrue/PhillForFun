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
      // Сгенерированные вопросы для игры
      if (path === "/questions" && request.method === "GET") {
        return json({ questions: await store.listQuestions() });
      }

      // Рейтинг
      if (path === "/scores" && request.method === "GET") {
        return json({ scores: await store.topScores(15) });
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

      // Новый факт → вопросы
      if (path === "/facts" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const fact = clean(body.fact, 300);
        const author = clean(body.author, 30) || "Аноним";
        if (fact.length < 8) return json({ error: "Слишком коротко. Расскажи подробнее!" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "Генерация не настроена" }, 503);

        const perHour = Number(env.FACTS_PER_HOUR_PER_IP || 5);
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

      // Админка: список и удаление
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

      if (path === "/") return json({ ok: true, name: "Трансформация безрабочего API" });
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
      `CREATE INDEX IF NOT EXISTS hits_idx ON hits (key, kind, ts)`
    ];
    for (const q of schema) this.sql.exec(q);
  }

  // Простой лимит: не больше `limit` событий за `windowSec` секунд
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

  // Лучший результат каждого игрока (по проценту), при равенстве — кто раньше
  topScores(limit) {
    const rows = this.sql.exec("SELECT name, score, total, created_at FROM scores ORDER BY id").toArray();
    const best = new Map();
    for (const r of rows) {
      const key = r.name.toLowerCase();
      const cur = best.get(key);
      const ratio = r.score / r.total;
      if (!cur || ratio > cur.score / cur.total) best.set(key, r);
    }
    return [...best.values()]
      .sort((a, b) => b.score / b.total - a.score / a.total || a.created_at - b.created_at)
      .slice(0, limit)
      .map((r) => ({ name: r.name, score: r.score, total: r.total, createdAt: r.created_at }));
  }
}
