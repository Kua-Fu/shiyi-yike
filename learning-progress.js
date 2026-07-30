const RATINGS = new Set(["again", "hard", "good"]);
const MAX_LEARNING_RECORDS = 200;
const GOOD_INTERVALS = [3, 7, 14, 30, 60];

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function shiftDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const attempts = Number.isInteger(raw.attempts) && raw.attempts > 0 ? raw.attempts : 0;
  if (!attempts) return null;
  const intervalDays =
    Number.isInteger(raw.intervalDays) && raw.intervalDays >= 1
      ? Math.min(raw.intervalDays, 60)
      : 1;
  const successfulReviews =
    Number.isInteger(raw.successfulReviews) && raw.successfulReviews >= 0
      ? Math.min(raw.successfulReviews, 1000)
      : 0;
  const lastScore =
    typeof raw.lastScore === "number" && Number.isFinite(raw.lastScore)
      ? Math.max(0, Math.min(raw.lastScore, 1))
      : 0;
  const bestScore =
    typeof raw.bestScore === "number" && Number.isFinite(raw.bestScore)
      ? Math.max(lastScore, Math.min(raw.bestScore, 1))
      : lastScore;
  return {
    attempts,
    intervalDays,
    successfulReviews,
    lastScore,
    bestScore,
    lastRating: RATINGS.has(raw.lastRating) ? raw.lastRating : "again",
    lastReviewed: isDateKey(raw.lastReviewed) ? raw.lastReviewed : "",
    dueDate: isDateKey(raw.dueDate) ? raw.dueDate : "",
    mastered: raw.mastered === true && successfulReviews >= 3 && bestScore === 1,
  };
}

export function normalizeLearningProgress(raw) {
  const source =
    raw?.poems && typeof raw.poems === "object" && !Array.isArray(raw.poems)
      ? raw.poems
      : {};
  const poems = Object.fromEntries(
    Object.entries(source)
      .filter(([id]) => typeof id === "string" && id)
      .map(([id, entry]) => [id, normalizeEntry(entry)])
      .filter(([, entry]) => entry)
      .sort(([, left], [, right]) =>
        (right.lastReviewed || "").localeCompare(left.lastReviewed || ""),
      )
      .slice(0, MAX_LEARNING_RECORDS),
  );
  return { version: 1, poems };
}

export function normalizeRecallText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s，,。.!！?？；;：:、'"“”‘’（）()《》〈〉【】[\]…—-]+/gu, "")
    .trim();
}

export function createRecallPrompt(line) {
  const fullLine = String(line ?? "").trim();
  const matches = [...fullLine.matchAll(/[，,；;：:！？!?。]/gu)];
  const split = matches.find((match) => {
    const before = normalizeRecallText(fullLine.slice(0, match.index)).length;
    const after = normalizeRecallText(
      fullLine.slice(match.index + match[0].length),
    ).length;
    return before >= 2 && after >= 2;
  });

  let prefix;
  let answer;
  if (split) {
    const splitEnd = split.index + split[0].length;
    prefix = fullLine.slice(0, splitEnd);
    answer = fullLine.slice(splitEnd).replace(/[。.!！?？；;]+$/gu, "").trim();
  } else {
    const readable = fullLine.replace(/[。.!！?？；;]+$/gu, "");
    const characters = Array.from(readable);
    const cut = Math.max(1, Math.ceil(characters.length / 2));
    prefix = characters.slice(0, cut).join("");
    answer = characters.slice(cut).join("");
  }

  const answerLength = Math.max(2, Array.from(normalizeRecallText(answer)).length);
  return {
    fullLine,
    prefix,
    answer,
    prompt: `${prefix}${"＿".repeat(Math.min(answerLength, 10))}`,
  };
}

export function checkRecallAnswer(expected, actual) {
  const normalizedExpected = normalizeRecallText(expected);
  return Boolean(
    normalizedExpected && normalizedExpected === normalizeRecallText(actual),
  );
}

export function scheduleLearningReview(
  progress,
  poemId,
  { rating, correct, total, todayKey },
) {
  const normalized = normalizeLearningProgress(progress);
  if (!poemId || !isDateKey(todayKey) || !RATINGS.has(rating)) return normalized;
  const safeTotal = Number.isInteger(total) && total > 0 ? total : 1;
  const safeCorrect =
    Number.isInteger(correct) && correct >= 0
      ? Math.min(correct, safeTotal)
      : 0;
  const score = safeCorrect / safeTotal;
  const previous = normalized.poems[poemId];

  // “已掌握”必须建立在全对之上；回想不完整时自动降级，避免自评制造虚假熟练。
  let effectiveRating = rating;
  if (score < 0.6) effectiveRating = "again";
  else if (score < 1 && rating === "good") effectiveRating = "hard";

  let intervalDays;
  let successfulReviews;
  let dueDate;
  const scheduledReviewIsDue =
    !previous?.dueDate || previous.dueDate <= todayKey;
  if (effectiveRating === "again") {
    intervalDays = 1;
    successfulReviews = 0;
  } else if (effectiveRating === "hard") {
    intervalDays = Math.min(
      14,
      previous?.intervalDays ? Math.max(2, Math.ceil(previous.intervalDays * 1.5)) : 2,
    );
    successfulReviews = Math.max(0, (previous?.successfulReviews ?? 0) - 1);
  } else if (!scheduledReviewIsDue) {
    // 提前练习可以巩固记忆，但不能刷次数跨过真实时间间隔。
    intervalDays = previous.intervalDays;
    successfulReviews = previous.successfulReviews;
    dueDate = previous.dueDate;
  } else {
    successfulReviews = (previous?.successfulReviews ?? 0) + 1;
    intervalDays =
      GOOD_INTERVALS[Math.min(successfulReviews - 1, GOOD_INTERVALS.length - 1)];
  }

  const entry = {
    attempts: (previous?.attempts ?? 0) + 1,
    intervalDays,
    successfulReviews,
    lastScore: score,
    bestScore: Math.max(previous?.bestScore ?? 0, score),
    lastRating: effectiveRating,
    lastReviewed: todayKey,
    dueDate: dueDate ?? shiftDateKey(todayKey, intervalDays),
    mastered:
      effectiveRating === "good" && score === 1 && successfulReviews >= 3,
  };
  return normalizeLearningProgress({
    version: 1,
    poems: { ...normalized.poems, [poemId]: entry },
  });
}

export function dueLearningPoemIds(progress, todayKey) {
  if (!isDateKey(todayKey)) return [];
  const normalized = normalizeLearningProgress(progress);
  return Object.entries(normalized.poems)
    .filter(([, entry]) => entry.dueDate && entry.dueDate <= todayKey)
    .sort(
      ([leftId, left], [rightId, right]) =>
        left.dueDate.localeCompare(right.dueDate) ||
        left.lastReviewed.localeCompare(right.lastReviewed) ||
        leftId.localeCompare(rightId),
    )
    .map(([id]) => id);
}

export function learningProgressCounts(progress, todayKey) {
  const normalized = normalizeLearningProgress(progress);
  const entries = Object.values(normalized.poems);
  return {
    started: entries.length,
    mastered: entries.filter((entry) => entry.mastered).length,
    due: dueLearningPoemIds(normalized, todayKey).length,
  };
}
