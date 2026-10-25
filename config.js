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
