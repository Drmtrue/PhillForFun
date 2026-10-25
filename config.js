// Настройки общего рейтинга (Firebase).
// Пока firebase = null, рейтинг хранится только в этом браузере.
// Чтобы рейтинг стал общим, вставьте сюда конфиг веб-приложения из Firebase.

export const QUIZ = {
  title: "Трансформация безрабочего",
  friend: "Фил",
  questionsPerGame: 10
};

export const firebase = null;
/* Пример:
export const firebase = {
  apiKey: "...",
  authDomain: "....firebaseapp.com",
  projectId: "...",
  storageBucket: "....appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
*/
