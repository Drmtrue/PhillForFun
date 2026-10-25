// Quiz settings. Title and name are player-facing, so they stay in Russian.

export const QUIZ = {
  title: "Трансформация Безработного",
  friend: "Фил",
  questionsPerGame: 10
};

// Cloudflare Worker URL (e.g. "https://phill-quiz-api.<account>.workers.dev").
// If empty, the leaderboard is stored only in the browser and adding facts is disabled.
export const API_URL = "https://phill-quiz-api.feezmo.workers.dev";

// RMT goal shown under the Divine Orb prices.
// divinesPerHour: estimated income of an above-average player, in Divine-equivalent value per hour.
//   PoE 2: community ranges — comfortable mapper 3–6, budget Breach build 6–10, disciplined farmer 10–20,
//          optimized ceiling ~50 (timesaver.gg, PoE2 0.5.x).
//   PoE 1: ~1 Divine per 2 maps on a stable 3.27 Atlas strategy (≈6–8/h with 4-minute maps),
//          ~13/h on a budget Harvest farm (pobarchives.com, 3.27).
//   8/h sits between "comfortable" and "disciplined" for both games.
export const RMT_GOAL = {
  title: "Новый компьютер",
  priceRub: 250000,
  divinesPerHour: { poe1: 8, poe2: 8 },
  hoursPerDay: 6
};

// League calendar (UTC). Sources: pathofexile.com announcement for 3.29 end / 3.30 launch, seasondex.com.
//   PoE 1: Curse of the Allflame (3.29) launched Jul 24, 2026; ends Nov 9, 2026 1 PM PST; 3.30 launches Nov 13, 2026.
//   PoE 2: Runes of Aldur (0.5) launched May 29, 2026 1 PM PDT; ends Dec 11, 2026; 1.0 launches Dec 11, 2026.
// Launch times not announced yet use 8 PM UTC (GGG's usual 1 PM PT slot). Update these when GGG announces new dates.
export const SEASONS = {
  poe1: { league: "Curse of the Allflame", start: "2026-07-24T20:00:00Z", end: "2026-11-09T21:00:00Z", next: "2026-11-13T20:00:00Z", nextName: "3.30" },
  poe2: { league: "Runes of Aldur", start: "2026-05-29T20:00:00Z", end: "2026-12-11T19:00:00Z", next: "2026-12-11T20:00:00Z", nextName: "1.0" }
};

// Price curve shape used until there are 5+ days of real FunPay history for the current league:
// launch price = k × the settled late-league price, and the launch premium fades with a time constant of tau days.
// Assumption: no public RMT price history exists; in-game data shows Divines carry a 20–35% week-1 premium
// over week 3 (in Chaos terms), and real-money prices fall harder as fresh supply floods in.
// k = 3, tau = 10 → ×3 at launch, ×1.7 after a week, ×1.25 after three weeks.
export const RMT_MODEL = { k: 3, tau: 10 };
