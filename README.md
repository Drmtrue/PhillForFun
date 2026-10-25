# PhillForFun — «Трансформация Безработного»

**Live site:** https://rootb1t.github.io/PhillForFun/

A Russian-language party quiz about our friend Phil (aka **x23x**). Each game picks 10 random questions from a shared pool, each with 4 answers, and results go to a shared leaderboard. Any player can submit a fact about Phil, and **Root AI - model b1t quiz v1.1** turns it into new funny questions that join the pool right away.

> The code, comments and docs are in English. Everything players see (questions, buttons, verdicts) is in Russian on purpose.

## How it works

| Part | Where | What it does |
| --- | --- | --- |
| Site | `index.html`, `style.css`, `app.js`, `config.js` | Static front end, hosted on GitHub Pages |
| Built-in questions | `questions.js` | The starting question pool |
| Server | `worker/` | Cloudflare Worker: takes facts, generates and moderates questions with Root AI - model b1t quiz v1.1, stores questions and scores |
| Admin | `admin.html` | Review and delete player-generated questions, browse submitted facts |

If `API_URL` in `config.js` is empty, the site runs in local mode: built-in questions only, and the leaderboard is stored in the browser.

## Server setup (one time)

1. Get an API key for Root AI and add credit.
2. Sign up at https://dash.cloudflare.com.
3. Workers & Pages → Create → **Import a repository** → connect GitHub → pick `PhillForFun`.
   Set **Path / Root directory** to `worker`, leave the build command empty, deploy command `npx wrangler deploy`.
4. In the new Worker: Settings → Variables and secrets → add two **secrets**:
   - `AI_API_KEY` — the key from step 1;
   - `ADMIN_TOKEN` — any long password for the admin page.
5. Put the Worker URL (`https://phill-quiz-api.<account>.workers.dev`) into `API_URL` in `config.js`.

After that, every push to `main` redeploys both the site (GitHub Pages) and the server (Cloudflare).

## Server settings (`worker/wrangler.toml`)

- `MODEL` — model ID used by Root AI for generation;
- `FACTS_PER_HOUR_PER_IP` — facts one IP can submit per hour (default 20);
- `FACTS_PER_DAY_TOTAL` — global daily cap that protects the API balance (default 100).

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/questions` | Player-generated questions |
| `GET` | `/scores` | Leaderboard (best result per player) |
| `POST` | `/scores` | Save a result `{ name, score, total }` |
| `POST` | `/facts` | Submit a fact `{ fact, author }` → generated questions or a rejection reason |
| `GET` | `/admin/questions`, `/admin/facts` | Admin lists (`Authorization: Bearer <ADMIN_TOKEN>`) |
| `DELETE` | `/admin/questions/:id` | Remove a question from the game |

## Adding built-in questions

Add an entry to `questions.js` (question text in Russian):

```js
{
  q: "Текст вопроса?",
  correct: "Правильный ответ",
  wrong: ["Неправильный 1", "Неправильный 2", "Неправильный 3"]
},
```

Answers are shuffled automatically, so always put the right one in `correct`.
