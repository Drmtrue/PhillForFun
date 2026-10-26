# PhillForFun — «Трансформация Безработного» and the portal platform

**Live site:** https://rootb1t.github.io/PhillForFun/

A Russian-language party quiz about our friend Phil (aka **x23x**). Each game picks 10 random questions from a shared pool, each with 4 answers. The shared leaderboard tracks every player's attempts, total points and average score, and is ranked by the average. Players also collect themed achievements and can hunt for hidden easter eggs. Any player can submit a fact about Phil, and **Root AI - model b1t quiz v1.1** turns it into new funny questions that join the pool right away.

> The code, comments and docs are in English. Everything players see (questions, buttons, verdicts) is in Russian on purpose.

## Platform: portals for anyone (invite-only)

Phil's site is the first portal of a small platform. Any member can build a portal like this about themselves or a friend; Root AI fills it in from photos and facts.

- **Access.** Invite-only. An invite code creates an account with a secret key stored in the browser (shown in «Мой аккаунт» to copy to other devices). Every member gets 5 one-time invites and one portal; the admin has no limits. The admin account is created from `admin.html` → «Платформа» with the `ADMIN_TOKEN`.
- **Builder** (`#/create`, `create.js`): 0) hero name, address (`?p=<slug>`) and consent (the person agrees and is 18+); 1) 1–5 photos, downscaled in the browser; Root AI returns the avatar look and a face box, the page crops the face (photos themselves are not stored); 2) at least 5 facts; 3) Root AI writes the persona (name in all Russian cases), lines for every mascot event, themed achievements and a 30-question quiz; 4) theme (title, colors, heading font, background pattern, jersey) and re-skinned mini-games (clicker, economy round, relax game); 5) 10 animations picked from the library with names, talent branches and sharp line packs. Every step can be regenerated or edited by hand; the owner previews the portal privately and publishes it.
- **Runtime** (`portal.js`): `?p=<slug>` loads the portal's config before the app starts; questions, achievements, mascot lines, talents, game names, feed texts and the theme come from the config, and every API call carries `?portal=<slug>`. Phil (no `?p`) keeps his original content, easter eggs and the RMT exchange.
- **Avatar** (`phil3d.js`): parametric — hair style (bald, buzz, short, medium, long, curly, ponytail) and color, skin, eyes, beard, mustache, glasses, build, top type and color (jersey shows the portal number), pants and shoes.
- **Server**: each portal has its own Durable Object (Phil keeps the original one); accounts, invites and portal configs live in a `platform` object. The raw facts stay private. Builder AI calls are limited per member per day and globally (`BUILDER_PER_DAY`, default 600). Content rules in every prompt forbid insults about appearance, ethnicity, religion, health, sexuality and family, sexual content and personal data; photos of minors or without a clear person are rejected.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/auth/redeem` | Join with `{ code, name }` → `{ key, user }` |
| `GET` | `/me` | Account, invites, own portals (Bearer key) |
| `POST` | `/invites` | Create an invite code |
| `GET` | `/portals` | Published portals |
| `GET` | `/portal?slug=` | Portal config (drafts only for the owner) |
| `GET/POST/PATCH/DELETE` | `/builder/draft` | Owner's draft: read, create `{ slug, name, consent }`, edit, delete |
| `POST` | `/builder/photos` | `{ images: [base64 JPEG] }` → look, face box |
| `POST` | `/builder/step` | `{ step: content \| quiz \| theme \| anims }` → Root AI fills that part |
| `POST` | `/builder/publish` | Publish the draft |
| `POST` | `/admin/platform/account` | Create an admin account (ADMIN_TOKEN) |
| `GET/DELETE` | `/admin/platform/portals[/slug]` | List or delete portals (ADMIN_TOKEN) |

Root AI for the builder is called "Root AI - model b1t portal v1.0".

## Sections

The site is a single page with hash routes, so switching sections never reloads it and the shared parts keep running: Phil the mascot, the side-court hoop and ball, the basket counter, toasts and sounds.

| Route | Section |
| --- | --- |
| `#/` | Home: hero with the jersey and easter eggs, and the live event feed (see below) |
| `#/quiz` | Quiz: start form, leaderboard, fact submission, question and result screens (a game in progress survives switching sections) |
| `#/rmt` | RMT exchange page (`rmt-page.js`): sticky in-page menu, overview cards, charts, order book, season timelines, savings goal with a farm-rate calculator, method notes |
| `#/games` | Mini-games list: free-throw practice (inline), the side-court hoop, and links to the full-screen games below |
| `#/games/smoke`, `#/games/farm`, `#/games/bath` | Перекур-кликер, Фарм диванов, Ванна (see below) |
| `#/phil` | Phil's talent tree: shared progression, four branches with levels, XP bars and the talents each unlocks |
| `#/ach` | Achievements shared by the whole site |

### Mini-games

Each full-screen game is its own module with a `mount<Name>(el, ctx)` function. `ctx` gives it `unlock(id)`, `say(pool)` (Phil speaks a line from a `{ id, mood, pri, lines }` pool), `phil`, `sfx`, `store`, `goalRub`, `divinePrice()` (today's PoE 1 FunPay price) and `onShow(fn)`. Records live in the browser.

- **Перекур-кликер** (`game-smoke.js`): click the cigarette to take a drag (it burns down, 12 drags per cigarette). Smoke buys upgrades for more smoke per click or per second (cost × 1.15 per level). Idle income keeps running while the page is open, and at half rate for up to 8 hours while it is closed. Every 5th cigarette, the 3D Phil lights up too.
- **Фарм диванов** (`game-farm.js`): a 90-second league of 30 game days. Each "run a map" click can drop a Divine (22%, or a stack of 5 at 1.5%). The price starts at 3× today's real FunPay price and decays along the RMT model curve with daily noise. Random events: drop nerf, strategy leak, bots, build hype, Phil in the bath. Sales can get scammed (7%, half the money lost). Unsold Divines burn at league end; the result is compared with the PC goal.
- **Ванна** (`game-bath.js`): keep the water between 30° and 45° (36–42° is comfy) by holding the hot tap, keep Phil awake by splashing him (sleepiness grows with time and with hot water), and catch the phone within 1.7 s when he drops it. Score = seconds survived.

Achievements: 3 for the clicker, 4 for the farm, 3 for the bath, plus 2 for free-throw practice streaks.

To add another game, add a card and a `.game-view` to `index.html`, a module with `mount…(el, ctx)`, and register it in `GAMES` in `app.js`.

## Phil's progression

Phil is levelled up by everyone together. Every event in the feed also grants XP to one of four talent branches (`xpFor()` in the Worker, stored in `phil_xp`, served by `GET /phil`):

| Branch | XP from |
| --- | --- |
| 🏀 Баскетбол (`hoops`) | side-court baskets, free-throw sessions, Phil's own shots (a make is +120) |
| 💎 РМТ-фарм (`farm`) | leagues in «Фарм диванов», scaled by the rubles earned |
| 🛁 Релакс (`chill`) | bath time, clicker milestones, Phil's comments |
| 🧠 Эрудиция (`mind`) | quiz results (bonus for 10/10), facts about Phil, achievements |

`talents.js` turns branch XP into levels (level n needs 50·n·(n+1) XP, max 10) and lists 28 talents, each unlocking an animation and/or a pool of sharper lines. Animations are procedural scenes in `phil3d.js` (`play(name)`): dribbling, ball on the finger, a running dunk, a dunk that shatters the backboard, loot dance, a Divine drop, a Dota session at a desk, a rage quit with a flying keyboard, a Mirror drop, stretching, a bath (later with a rubber duck), smoke rings, a nap on a pillow, levitation, scratching his head, a facepalm, studying the scheme, eating adjika. While a scene plays the canvas grows into a wider stage. Unlocked lines (`TALENT_LINES`) are mixed into Phil's existing pools for the matching events (trash talk at misses, roasts of wrong answers, FunPay seller talk, and so on).

Scenes play on matching moments (a facepalm on a wrong answer, the bath when the bath game starts, a Divine drop on a stack, a rage quit on a scam) and as an idle show every 40–90 s. When a browser sees a talent open since its last visit, a toast announces it and Phil performs it.

## Debug mode

Click the jersey 5 times, then right-click Phil twice, all within 10 seconds. A panel opens with every talent animation, the reactions, a smoke break, the sunglasses, a side-court shot with a chosen outcome, every line pool (built-in and talent) and sliders for the branch levels. While it is on, nothing reaches the server: `api()` drops every write, `logEvent()` and the quiz-quit beacon are off, achievements are not granted, and all talents are shown as unlocked. "Выход" restores the real progress. `?debug` in the URL exposes `window.__debug` for automated checks.

## Event feed

The home page shows a shared feed of what everyone did on the site, newest first, grouped by day, with filters (all / quiz / games / Phil / achievements), "show more" paging and a poll for new events every 25 s while the home page is open (`feed.js`).

| Event | Logged by | Text |
| --- | --- | --- |
| `quiz_finish` | Worker, on `POST /scores` | finished the quiz with a score and verdict |
| `quiz_quit` | page, `sendBeacon` on leaving mid-quiz (after at least one answer) | ran away on question N |
| `fact_added` | Worker, on an accepted fact | told a fact; Root AI made N questions |
| `ach` | Worker, on a live unlock (bulk syncs from a new device are not announced) | got an achievement / found an easter egg |
| `basket` | Worker, on `POST /baskets`; repeats within 15 min merge into one row | scored N in the side hoop |
| `phil_shot` | page; makes always, misses at most once per 30 min per visitor | Phil made / missed his shot, with his line |
| `phil_say` | page, selected lines only, at most once per 10 min per visitor and 6 per hour per IP | Phil's comment |
| `ft_session`, `farm_end`, `bath_end`, `smoke_milestone` | page | mini-game results and milestones |

`GET /events?limit=&before=&after=` returns events newest first; `POST /events { type, name, data }` accepts only the page-logged types above (flat data, short strings), 60 per hour per IP. The Worker keeps the latest 5 000 events.

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
| `GET` | `/events` | Event feed, newest first (`limit`, `before`, `after`) |
| `GET` | `/phil` | Phil's shared XP per talent branch and the number of players who contributed |
| `POST` | `/events` | Log a page-side event `{ type, name, data }` |
| `GET` | `/scores` | Leaderboard: attempts, total points, average and achievement count per player, sorted by average |
| `GET` | `/player?name=` | One player's attempts, points, average and side-court baskets |
| `POST` | `/baskets` | Add side-court baskets `{ name, add }` (counted separately from quiz points) |
| `GET` | `/prices` | Cheapest Divine Orb (PoE 1 / PoE 2) on FunPay in rubles: current league, online sellers only; cached 20 min; includes daily `history`, hourly `ticks` (14 days), `ladder` (10 cheapest online offers), `median` and online `stock` |
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

### Exchange page

`rmt-page.js` renders the section from `/prices`; charts come from `charts.js` (dependency-free SVG line charts with a crosshair tooltip, legend, reference lines and markers, redrawn on resize). PoE 1 and PoE 2 use a validated amber/blue pair (`#cc8208`, `#3b8fe8`).

- **Обзор:** per game — cheapest price with trend, 100 pcs, online sellers out of all, median online price, how many Divines the 10 cheapest sellers have (total online stock is not shown: some sellers list placeholder amounts in the billions), price vs league start, day of season.
- **Графики:** hourly minimum price and online sellers for the last 24 h / 3 / 14 days (both games), and per-game season curves (model line, real daily minimums, today marker). Prices of the two games differ in scale, so season curves are separate small charts rather than a shared axis.
- **Стакан:** the 10 cheapest online offers per game with stock bars (log scale) and the spread.
- **Сезоны:** timelines from league start to end and the next league, with a today marker and countdowns.
- **Копилка:** always open. Sliders for Divine per hour and hours per day (remembered per browser) recompute what to sell, farm time, earnings this league and the first week of the next, the month the PC is affordable, and a savings chart against the 250 000 ₽ goal.
- **Как считаем:** the method and assumptions.

The Worker stores a snapshot on every price refresh (`price_ticks`: price, online sellers, offers, online stock; kept 120 days) and returns hourly buckets for the last 14 days as `ticks`, plus `ladder`, `median` and `stock` per game.

### Season forecast

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
- every 50–120 s (wide screens, side court on) he walks to the side-court ball, picks it up, carries it to a spot facing the hoop and takes a jump shot. He makes it with a 5% chance. `court.npcThrow()` in `hoop.js` tries candidate trajectories in a silent copy of the physics (at three step sizes) and keeps one whose result matches the plan, because rim and backboard bounces make plain aiming unreliable. On a miss he gets angry (stomping, fists, red face) and blames everything around him; on a make he lights up, sunglasses drop onto his face and he tells everyone they are noobs. If the player is watching (tab visible and focused) when he scores, the secret achievement «Свидетель чуда» unlocks. His shots never count toward the player's baskets. Right-click Phil (long-press on touch) to send him to shoot right away: he drops whatever he is doing, and if the player is holding the ball he waits a few seconds for it;
- his signature smoke break: he stops, puts a cigarette in his mouth, raises a lighter, the flame flickers, the ember glows, smoke drifts from the tip and he exhales a cloud.

`avatar.js` owns the speech bubble (it follows his head and stays inside the screen) and the lines. If WebGL or the library is not available, it falls back to a flat anime-style SVG badge in the corner with the same lines and a 2D smoke animation.

He reacts to: game start, right/wrong answers, the free throw (start, made, missed, skipped), side-court baskets, misses and dunks, achievements, the face ball, going idle and the final score. Clicking him gives a random line.

- Every event has several lines in `LINES`; one is picked at random and never the same twice in a row. Add lines there (a line can be `{ t, smoke: true }` to light up while saying it). `ACTS` maps events to body reactions.
- Every 30–70 s, and after some lines, he takes a smoke break.
- Important events always speak; minor ones (misses, achievements) are rate-limited so he does not talk over every click.
