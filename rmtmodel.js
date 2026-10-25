// Season-aware Divine Orb price model and savings forecast.
//
// Price over a league (day d since launch):
//   p(d) = floor * (1 + (k - 1) * exp(-d / tau))
// - floor: the late-league price level the market settles at
// - k:     launch price as a multiple of the floor (day-0 premium)
// - tau:   how fast the launch premium fades, in days
//
// With fewer than MIN_POINTS days of real history the shape (k, tau) comes from config and only the
// floor is solved from today's price. With enough history all three are fitted to the real data.

const DAY = 86400000;
export const MIN_POINTS = 5;

export const priceAt = (m, d) => m.floor * (1 + (m.k - 1) * Math.exp(-Math.max(0, d) / m.tau));

export function seasonDay(season, now = Date.now()) {
  const start = Date.parse(season.start);
  const end = Date.parse(season.end);
  return {
    day: (now - start) / DAY,
    length: (end - start) / DAY,
    left: Math.max(0, (end - now) / DAY),
    nextIn: season.next ? Math.max(0, (Date.parse(season.next) - now) / DAY) : null
  };
}

const normLeague = (x) => String(x || "").replace(/^\((PC|PS|Xbox)\)\s*/i, "").trim().toLowerCase();

// Works out which season the prices belong to, so a new league never gets mixed with the old one.
// cfg: the calendar entry from config.js; detected: league name the server is pricing; firstSeen: ISO time
// the server first saw that league. Phases:
//   live    – the priced league is running
//   ended   – the configured league is over, the next one has not launched yet (prices are stale)
//   waiting – the next league has launched but FunPay has too few online sellers yet
// estimated = true when the calendar is out of date and dates were derived automatically.
export function resolveSeason(cfg, detected, firstSeen, now = Date.now()) {
  const start = Date.parse(cfg.start), end = Date.parse(cfg.end), next = Date.parse(cfg.next || cfg.end);
  const length = end - start, gap = Math.max(0, next - end);
  const isConfigured = !detected || normLeague(detected) === normLeague(cfg.league);

  if (isConfigured) {
    const phase = now < end ? "live" : now < next ? "ended" : "waiting";
    return { ...cfg, league: detected || cfg.league, phase, estimated: false };
  }

  // A different (newer) league is being priced: the calendar is out of date, roll it forward.
  // Prefer the announced launch date; if the league appeared well before it, trust when we first saw it.
  const seen = firstSeen ? Date.parse(firstSeen) : now;
  const launch = seen < next - DAY * 2 ? seen : Math.min(next, seen);
  return {
    league: detected,
    start: new Date(launch).toISOString(),
    end: new Date(launch + length).toISOString(),
    next: new Date(launch + length + gap).toISOString(),
    nextName: "следующий сезон",
    phase: "live",
    estimated: true
  };
}

// history: [[ "YYYY-MM-DD", price ], ...] for the current league
export function calibrate(season, todayPrice, history, defaults, now = Date.now()) {
  const start = Date.parse(season.start);
  const points = (history || [])
    .map(([day, price]) => [(Date.parse(day + "T12:00:00Z") - start) / DAY, price])
    .filter(([d, p]) => d >= 0 && p > 0 && d <= (Date.parse(season.end) - start) / DAY + 1); // only this league's days

  if (points.length >= MIN_POINTS) {
    // Grid search over the shape; the floor has a closed form in log space for each shape
    let best = null;
    for (let k = 1; k <= 12; k += 0.25) {
      for (let tau = 2; tau <= 60; tau += 1) {
        const logs = points.map(([d, p]) => Math.log(p) - Math.log(1 + (k - 1) * Math.exp(-d / tau)));
        const logFloor = logs.reduce((a, b) => a + b, 0) / logs.length;
        const err = logs.reduce((a, l) => a + (l - logFloor) ** 2, 0);
        if (!best || err < best.err) best = { k, tau, floor: Math.exp(logFloor), err };
      }
    }
    return { floor: best.floor, k: best.k, tau: best.tau, source: "fit", points: points.length };
  }

  const d = seasonDay(season, now).day;
  const { k, tau } = defaults;
  return { floor: todayPrice / (1 + (k - 1) * Math.exp(-d / tau)), k, tau, source: "estimate", points: points.length };
}

// Walks day by day from now: farming income during leagues, nothing in the gap between leagues,
// then the next leagues follow the same calendar rhythm and price curve.
// track = true also returns weekly [time, saved] points for a savings chart
export function forecast({ season, model, divinesPerHour, hoursPerDay, goal, now = Date.now(), maxYears = 40, track = false }) {
  const start = Date.parse(season.start);
  const end = Date.parse(season.end);
  const next = Date.parse(season.next || season.end);
  const length = end - start;
  const gap = Math.max(0, next - end);
  const perDayDivines = divinesPerHour * hoursPerDay;

  let saved = 0;
  let thisSeason = 0;
  let firstWeekNext = 0;
  let goalAt = null;
  let seasonIndex = 0;
  let seasonStart = start;
  const points = track ? [[now, 0]] : null;
  let step = 0;

  for (let t = now; t < now + maxYears * 365 * DAY; t += DAY) {
    // Move to the season that contains t
    while (t >= seasonStart + length + gap) {
      seasonStart = seasonIndex === 0 ? next : seasonStart + length + gap;
      seasonIndex++;
    }
    const inLeague = t >= seasonStart && t < seasonStart + length;
    if (track && ++step % 7 === 0) points.push([t, saved]);
    if (!inLeague) continue;
    const d = (t - seasonStart) / DAY;
    const income = perDayDivines * priceAt(model, d);
    saved += income;
    if (seasonIndex === 0) thisSeason += income;
    if (seasonIndex === 1 && d < 7) firstWeekNext += income;
    if (saved >= goal && !goalAt) { goalAt = t; if (track) points.push([t, saved]); break; }
  }

  return {
    thisSeason,
    firstWeekNext,
    goalAt,
    points,
    seasonsToGoal: goalAt ? Math.max(0, Math.round((goalAt - start) / (length + gap) * 10) / 10) : null
  };
}

export function decayStats(model, season, now = Date.now()) {
  const { day, length } = seasonDay(season, now);
  const pNow = priceAt(model, day);
  return {
    start: priceAt(model, 0),
    now: pNow,
    end: priceAt(model, length),
    seasonDrop: 1 - priceAt(model, length) / priceAt(model, 0),
    weekDropNow: 1 - priceAt(model, day + 7) / pNow,
    firstWeekDrop: 1 - priceAt(model, 7) / priceAt(model, 0)
  };
}
