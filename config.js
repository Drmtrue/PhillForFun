// Quiz settings. Title and name are player-facing, so they stay in Russian.

export const QUIZ = {
  title: "Трансформация Безработного",
  friend: "Фил",
  questionsPerGame: 10
};

// Cloudflare Worker URL (e.g. "https://phill-quiz-api.<account>.workers.dev").
// If empty, the leaderboard is stored only in the browser and adding facts is disabled.
export const API_URL = "https://phill-quiz-api.feezmo.workers.dev";
