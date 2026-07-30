import assert from "node:assert/strict";

import {
  addReading,
  dailyPoemIndex,
  localDateKey,
  normalizeReadingStats,
  readingStreak,
} from "../reading-insights.js";

assert.equal(
  localDateKey(new Date(2026, 6, 30, 8, 0, 0)),
  "2026-07-30",
  "日期键应使用用户本地日期",
);

const dailyIndex = dailyPoemIndex("2026-07-30", 938);
assert.equal(dailyIndex, dailyPoemIndex("2026-07-30", 938), "同一天应命中同一诗签");
assert.ok(dailyIndex >= 0 && dailyIndex < 938, "今日诗签索引应落在已校诗库范围");
assert.equal(dailyPoemIndex("2026-07-30", 0), -1, "空诗库不应返回有效索引");

let result = addReading(null, "poem-a", "2026-07-30");
assert.equal(result.changed, true);
assert.equal(result.stats.total, 1);
assert.equal(result.stats.days["2026-07-30"], 1);

result = addReading(result.stats, "poem-a", "2026-07-30");
assert.equal(result.changed, false, "同一天重复打开同一篇不应重复计数");
assert.equal(result.stats.total, 1);

result = addReading(result.stats, "poem-b", "2026-07-30");
assert.equal(result.stats.days["2026-07-30"], 2);
assert.equal(result.stats.total, 2);

result = addReading(result.stats, "poem-c", "2026-07-31");
assert.equal(result.stats.days["2026-07-31"], 1);
assert.deepEqual(result.stats.todayIds, ["poem-c"], "跨日后应重置当天去重列表");
assert.equal(readingStreak(result.stats, "2026-07-31"), 2);

const gapStats = normalizeReadingStats(
  {
    days: { "2026-07-29": 2, "2026-07-31": 1 },
    total: 3,
    todayKey: "2026-07-31",
    todayIds: ["poem-c"],
  },
  "2026-07-31",
);
assert.equal(readingStreak(gapStats, "2026-07-31"), 1, "中断后应从今天重新计连续天数");

const manyDays = {};
for (let offset = 0; offset < 100; offset += 1) {
  const date = new Date(Date.UTC(2026, 0, 1 + offset));
  manyDays[date.toISOString().slice(0, 10)] = 1;
}
const trimmed = normalizeReadingStats({ days: manyDays }, "2026-04-10");
assert.equal(Object.keys(trimmed.days).length, 90, "历史聚合最多保留 90 天");

console.log("✓ 今日诗签、本地阅读计数与连续阅读统计均通过校验");
