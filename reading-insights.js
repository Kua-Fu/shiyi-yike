const MAX_READING_DAYS = 90;

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dailyPoemIndex(dateKey, total) {
  if (!Number.isInteger(total) || total <= 0) return -1;
  let hash = 2166136261;
  for (const character of dateKey) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % total;
}

export function normalizeReadingStats(raw, todayKey = localDateKey()) {
  const sourceDays =
    raw?.days && typeof raw.days === "object" && !Array.isArray(raw.days)
      ? raw.days
      : {};
  const days = Object.fromEntries(
    Object.entries(sourceDays)
      .filter(
        ([key, value]) =>
          /^\d{4}-\d{2}-\d{2}$/.test(key) &&
          Number.isInteger(value) &&
          value > 0,
      )
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-MAX_READING_DAYS),
  );
  const todayIds =
    raw?.todayKey === todayKey && Array.isArray(raw.todayIds)
      ? [...new Set(raw.todayIds.filter((id) => typeof id === "string" && id))]
      : [];
  if (todayIds.length) {
    days[todayKey] = Math.max(days[todayKey] ?? 0, todayIds.length);
  }

  return {
    total:
      Number.isInteger(raw?.total) && raw.total >= 0
        ? raw.total
        : Object.values(days).reduce((sum, count) => sum + count, 0),
    days,
    todayKey,
    todayIds,
  };
}

function dateKeyBefore(todayKey, offset) {
  const [year, month, day] = todayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() - offset);
  return localDateKey(date);
}

export function readingStreak(stats, todayKey = localDateKey()) {
  let streak = 0;
  while ((stats.days?.[dateKeyBefore(todayKey, streak)] ?? 0) > 0) streak += 1;
  return streak;
}

export function addReading(stats, poemId, todayKey = localDateKey()) {
  const normalized = normalizeReadingStats(stats, todayKey);
  if (normalized.todayIds.includes(poemId)) {
    return { changed: false, stats: normalized };
  }

  normalized.todayIds.push(poemId);
  normalized.days[todayKey] = Math.max(
    normalized.days[todayKey] ?? 0,
    normalized.todayIds.length,
  );
  normalized.total += 1;
  // 仅保留 90 天聚合和当天去重 ID，兼顾连续阅读统计与本地存储体积。
  normalized.days = Object.fromEntries(
    Object.entries(normalized.days)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-MAX_READING_DAYS),
  );
  return { changed: true, stats: normalized };
}
