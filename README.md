# PhillForFun — «Трансформация Безработного»

**Live site:** https://rootb1t.github.io/PhillForFun/

A Russian-language party quiz about our friend Phil (aka **x23x**). Each game picks 10 random questions from a shared pool, each with 4 answers. The shared leaderboard tracks every player's attempts, total points and average score, and is ranked by the average. Players also collect themed achievements and can hunt for hidden easter eggs. Any player can submit a fact about Phil, and **Root AI - model b1t quiz v1.1** turns it into new funny questions that join the pool right away.

> The code, comments and docs are in English. Everything players see (questions, buttons, verdicts) is in Russian on purpose.

## How it works

| Part | Where | What it does |
| --- | --- | --- |
| Site | `index.html`, `style.css`, `app.js`, `config.js` | Static front end, hosted on GitHub Pages |
| Built-in questions | `questions.js` | The starting question pool |
| Achievements | `achievements.js` | Achievement catalogue (unlock logic and easter eggs live in `app.js`) |
| Side-court mini-game | `hoop.js` | Drag-and-throw basketball in the free space beside the quiz (wide screens only) |
| Free throw | `freethrow.js` | Second-chance shot after a wrong answer (all screen sizes) |
| Ball skin | `ballskin.js`, `assets/phil-face.png` | Spin gesture that turns the ball into Phil's face (shared by both courts) |
| Phil mascot | `avatar.js`, `phil3d.js` | 3D cartoon Phil who walks along the bottom of the screen, comments on the game and takes smoke breaks |
| Server | `worker/` | Cloudflare Worker: takes facts, generates and moderates questions with Root AI - model b1t quiz v1.1, stores questions and scores |
| Admin | `admin.html` | Review, edit and delete player-generated questions (🔄 regenerate or ✏️ edit any answer), browse submitted facts |

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
| `GET` | `/scores` | Leaderboard: attempts, total points, average and achievement count per player, sorted by average |
| `GET` | `/player?name=` | One player's attempts, points, average and side-court baskets |
| `POST` | `/baskets` | Add side-court baskets `{ name, add }` (counted separately from quiz points) |
| `GET` | `/prices` | Cheapest Divine Orb (PoE 1 / PoE 2) on FunPay in rubles: current league, online sellers only; cached 20 min |
| `GET` | `/achievements?name=` | Achievement ids unlocked by a player |
| `POST` | `/achievements` | Unlock achievements `{ name, ids: [...] }` |
| `POST` | `/scores` | Save a result `{ name, score, total }` |
| `POST` | `/facts` | Submit a fact `{ fact, author }` → generated questions or a rejection reason |
| `GET` | `/admin/questions`, `/admin/facts` | Admin lists (`Authorization: Bearer <ADMIN_TOKEN>`) |
| `DELETE` | `/admin/questions/:id` | Remove a question from the game |
| `PATCH` | `/admin/questions/:id` | Edit the question text or answers `{ q?, correct?, wrong? }` (answers must stay distinct) |
| `POST` | `/admin/questions/:id/regenerate` | Root AI rewrites one answer `{ slot: "correct" \| 0 \| 1 \| 2 }` and saves it |

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

## Achievements

Defined in `achievements.js` (`id`, `icon`, `title`, `desc`, optional `secret` + `hint` for easter eggs). To add one, append an entry and call `unlock("<id>")` from `app.js` where it should trigger. Unlocks are cached in the browser and synced to the server per player name, so they follow the player across devices.

## Side-court mini-game

On screens wider than ~1100px a hoop appears in the empty space left or right of the quiz. The ball lies at the bottom of the viewport; drag it with the mouse (or finger) and release to throw. A basket adds one point to a separate counter (top-left HUD, leaderboard 🏀), and after every throw the hoop jumps to a random side and height, always with its backboard flush against that edge of the screen. Releasing the ball above the rim is a dunk and does not count. Add `?debug` to the URL to expose `window.__hoop` for automated checks.

## RMT exchange widget

The "Биржа РМТ" panel shows the cheapest price for 1 Divine Orb on FunPay for PoE 1 and PoE 2 (`worker/src/prices.js`):

- only the current main league: event, Standard, Hardcore and Ruthless leagues are skipped (PoE 1 uses the PC league), and among the rest the **newest** league (highest FunPay league id) wins as soon as it has 3+ online sellers — so a new season replaces the old one on launch day even while old lots are still listed;
- only offers from sellers who are online at the moment of the check;
- prices in rubles: the server asks FunPay for ruble prices via its currency switch; if FunPay does not offer rubles for the server's location, it converts using the Central Bank of Russia daily rate and the page says so;
- refreshed at most every 20 minutes, with a trend arrow when the price moves.

Below the prices is a savings goal (`RMT_GOAL` in `config.js`: a new PC for 250 000 ₽). For each game it shows how many Divine Orbs must be sold at the current cheapest price, how many hours of farming that is at 8 Divine/hour (an above-average player: between "comfortable mapper" 3–6/h and "disciplined farmer" 10–20/h in community estimates), the same in years at 6 hours a day and non-stop, and the resulting income per hour. Sources for the rates are noted in `config.js`.

### Season forecast

The goal block is collapsed by default to a one-line summary (goal, price and the estimated month per game) with a "Подробнее ▾" toggle; the open/closed state is remembered per browser.

`rmtmodel.js` turns the current price into a season-aware forecast, using the league calendar in `SEASONS` (`config.js`):

- **Price curve:** `p(d) = floor · (1 + (k − 1) · e^(−d/τ))` for day `d` of the league. With fewer than 5 days of real history the shape comes from `RMT_MODEL` (k = 3, τ = 10 days, an assumption — no public RMT price history exists) and only the floor is solved from today's price; with 5+ days the server's real daily prices are fitted (grid search over k and τ, closed-form floor in log space).
- **Stats per game:** day of season and days left, next league date, modelled launch → now → end price, drop over the season / first week / this week.
- **Savings:** a day-by-day walk from today: farming income during leagues (`divinesPerHour × hoursPerDay × p(d)`), nothing in the gap between leagues, following leagues repeating the same rhythm and curve, until the goal is reached. Shows earnings until the end of this league, the first week of the next one, and the estimated month the PC is affordable.
- **Season switch-over:** `resolveSeason()` compares the league the server is pricing with the calendar. Phases: `live`; `ended` (league over, next not launched — prices are marked stale and earn nothing); `waiting` (next league launched but FunPay has too few online sellers). If a newer league is priced while the calendar still points at the old one, dates roll forward automatically (launch = announced date, or when the server first saw the league if that was clearly earlier) and are labelled as estimated. History is kept per league name and the fit ignores days outside the league, so old-season prices never leak into a new season.
- **Data:** the Worker records the lowest online price per game, league and UTC day (`price_history`), refreshed hourly by a cron trigger, so the next leagues (PoE 1 3.30 on Nov 13, PoE 2 1.0 on Dec 11) are captured from day one.

## Free throw (second chance)

After the first wrong answer to a question, the right answer stays hidden and a free-throw court opens in a modal. The player gets one throw from behind the free-throw line:

- make it → the wrong option stays crossed out and the player answers the same question again (a right answer still earns the point);
- miss it (or press "Не бросать") → the right answer is revealed and the game moves on.

Only one free throw per question. `freeThrow()` resolves to `{ made, skipped, stats }` (rim hits, backboard, highest point, odd throws), and live events (`forgot`, `nudge`, `wrongway`, `down`) fire while the modal is open. These drive 16 free-throw achievements: made / saved / choked, swish, bank shot, lucky rim roll, rim-out, airball, 3 made or 3 missed in one game, skipped, plus secret ones for forgetting to throw, throwing the wrong way, into the floor, off the screen, or too weakly.

## Face ball

Grab the ball (side court or free throw) and spin it fast — about two quick loops with the mouse or finger within 1.5 s. The ball turns into Phil's face (`assets/phil-face.png`, used with his consent) and spins along with the gesture. Spin fast again, or refresh the page, to get the normal ball back; the mode is kept in memory only. The detector (`spinDetector()` in `ballskin.js`) adds up the signed change of the pointer's heading over a sliding window, so zigzags cancel out and only real loops count. The first transformation unlocks the secret achievement «Голова кругом».

## Phil mascot

`phil3d.js` builds a chunky 3D cartoon Phil from simple shapes with Three.js (loaded from jsDelivr): buzz cut, blue-grey eyes, stubble, black #23 shirt, jeans and red sneakers. All animation is procedural — no model files:

- he wanders along the bottom of the screen (on phones only a short stretch by the right edge), turns toward where he walks, and glances at the cursor when standing;
- reactions: jump with arms up (happy), slump (sad), jump back (shock), hand behind the head (smug), wave; plus breathing and blinking;
- every 50–120 s (wide screens, side court on) he walks to the side-court ball, picks it up, carries it to a spot facing the hoop and takes a jump shot. He makes it with a 5% chance. `court.npcThrow()` in `hoop.js` tries candidate trajectories in a silent copy of the physics (at three step sizes) and keeps one whose result matches the plan, because rim and backboard bounces make plain aiming unreliable. On a miss he gets angry (stomping, fists, red face) and blames everything around him; on a make he lights up, sunglasses drop onto his face and he tells everyone they are noobs. If the player is watching (tab visible and focused) when he scores, the secret achievement «Свидетель чуда» unlocks. His shots never count toward the player's baskets;
- his signature smoke break: he stops, puts a cigarette in his mouth, raises a lighter, the flame flickers, the ember glows, smoke drifts from the tip and he exhales a cloud.

`avatar.js` owns the speech bubble (it follows his head and stays inside the screen) and the lines. If WebGL or the library is not available, it falls back to a flat anime-style SVG badge in the corner with the same lines and a 2D smoke animation.

He reacts to: game start, right/wrong answers, the free throw (start, made, missed, skipped), side-court baskets, misses and dunks, achievements, the face ball, going idle and the final score. Clicking him gives a random line.

- Every event has several lines in `LINES`; one is picked at random and never the same twice in a row. Add lines there (a line can be `{ t, smoke: true }` to light up while saying it). `ACTS` maps events to body reactions.
- Every 30–70 s, and after some lines, he takes a smoke break.
- Important events always speak; minor ones (misses, achievements) are rate-limited so he does not talk over every click.
