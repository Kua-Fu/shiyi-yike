import assert from "node:assert/strict";

import {
  checkRecallAnswer,
  createRecallPrompt,
  dueLearningPoemIds,
  learningProgressCounts,
  normalizeLearningProgress,
  normalizeRecallText,
  scheduleLearningReview,
} from "../learning-progress.js";

const punctuationPrompt = createRecallPrompt("慈母手中线，游子身上衣。");
assert.equal(punctuationPrompt.prefix, "慈母手中线，");
assert.equal(punctuationPrompt.answer, "游子身上衣");
assert.match(punctuationPrompt.prompt, /^慈母手中线，＿+$/);

const midpointPrompt = createRecallPrompt("白日依山尽");
assert.equal(midpointPrompt.prefix, "白日依");
assert.equal(midpointPrompt.answer, "山尽");
assert.equal(normalizeRecallText(" 游子，身上衣。"), "游子身上衣");
assert.equal(checkRecallAnswer("游子身上衣", "游子，身上衣。"), true);
assert.equal(checkRecallAnswer("游子身上衣", "临行密密缝"), false);

let progress = scheduleLearningReview(null, "poem-a", {
  rating: "good",
  correct: 4,
  total: 4,
  todayKey: "2026-07-30",
});
assert.deepEqual(progress.poems["poem-a"], {
  attempts: 1,
  intervalDays: 3,
  successfulReviews: 1,
  lastScore: 1,
  bestScore: 1,
  lastRating: "good",
  lastReviewed: "2026-07-30",
  dueDate: "2026-08-02",
  mastered: false,
});
assert.deepEqual(dueLearningPoemIds(progress, "2026-08-01"), []);
assert.deepEqual(dueLearningPoemIds(progress, "2026-08-02"), ["poem-a"]);

progress = scheduleLearningReview(progress, "poem-a", {
  rating: "good",
  correct: 4,
  total: 4,
  todayKey: "2026-07-30",
});
assert.equal(
  progress.poems["poem-a"].successfulReviews,
  1,
  "提前重复练习不能刷高按期复习次数",
);
assert.equal(progress.poems["poem-a"].dueDate, "2026-08-02");
assert.equal(progress.poems["poem-a"].mastered, false);

progress = scheduleLearningReview(progress, "poem-a", {
  rating: "good",
  correct: 4,
  total: 4,
  todayKey: "2026-08-02",
});
assert.equal(progress.poems["poem-a"].intervalDays, 7);
assert.equal(progress.poems["poem-a"].mastered, false);

progress = scheduleLearningReview(progress, "poem-a", {
  rating: "good",
  correct: 4,
  total: 4,
  todayKey: "2026-08-09",
});
assert.equal(progress.poems["poem-a"].intervalDays, 14);
assert.equal(progress.poems["poem-a"].mastered, true, "连续三次全对后才应标为掌握");

progress = scheduleLearningReview(progress, "poem-b", {
  rating: "good",
  correct: 3,
  total: 4,
  todayKey: "2026-08-09",
});
assert.equal(
  progress.poems["poem-b"].lastRating,
  "hard",
  "未全对时不应接受“已掌握”的乐观自评",
);
assert.equal(progress.poems["poem-b"].intervalDays, 2);

progress = scheduleLearningReview(progress, "poem-c", {
  rating: "hard",
  correct: 1,
  total: 4,
  todayKey: "2026-08-09",
});
assert.equal(progress.poems["poem-c"].lastRating, "again");
assert.equal(progress.poems["poem-c"].dueDate, "2026-08-10");

assert.deepEqual(learningProgressCounts(progress, "2026-08-10"), {
  started: 3,
  mastered: 1,
  due: 1,
});

const normalized = normalizeLearningProgress({
  poems: {
    valid: {
      attempts: 1,
      intervalDays: 999,
      successfulReviews: 0,
      lastScore: 2,
      bestScore: -1,
      lastRating: "unknown",
      lastReviewed: "invalid",
      dueDate: "invalid",
      mastered: true,
    },
    invalid: null,
  },
});
assert.equal(normalized.poems.valid.intervalDays, 60);
assert.equal(normalized.poems.valid.lastScore, 1);
assert.equal(normalized.poems.valid.lastRating, "again");
assert.equal(normalized.poems.valid.mastered, false);
assert.equal(normalized.poems.invalid, undefined);

console.log("✓ 逐句回想、掌握门槛与间隔复习排期均通过校验");
