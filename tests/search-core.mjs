import assert from "node:assert/strict";
import {
  compactSearchText,
  highlightTextSegments,
  prepareSearchRecord,
  searchPreparedRecords,
  searchTerms,
} from "../search-core.js";

assert.equal(compactSearchText("床前明月光，疑是地上霜。"), "床前明月光疑是地上霜");
assert.deepEqual(searchTerms("李白，月夜"), ["李白", "月夜"]);

const records = [
  prepareSearchRecord(
    ["jing-ye-si", "静夜思 李白 唐 月夜 床前明月光,疑是地上霜。", "床前明月光，疑是地上霜。"],
    { title: "静夜思", author: "李白", epithet: "诗仙", tags: ["月夜"], ordinal: 2 },
  ),
  prepareSearchRecord(
    ["other", "月下独酌 李白 唐 饮酒 花间一壶酒", "花间一壶酒，独酌无相亲。"],
    { title: "月下独酌", author: "李白", epithet: "诗仙", tags: ["饮酒"], ordinal: 1 },
  ),
  prepareSearchRecord(
    ["wang-yue", "望岳 杜甫 唐 岱宗夫如何", "岱宗夫如何，齐鲁青未了。"],
    { title: "望岳", author: "杜甫", epithet: "诗圣", tags: ["山岳"], ordinal: 3 },
  ),
];

assert.equal(searchPreparedRecords(records, "床前明月光疑是地上霜").results[0].id, "jing-ye-si");
assert.equal(searchPreparedRecords(records, "床前明月光，疑是地上霜").results[0].id, "jing-ye-si");
assert.equal(searchPreparedRecords(records, "静夜思").results[0].score, 140, "题目精确命中应最高");
assert.deepEqual(searchPreparedRecords(records, "诗仙").results.map(({ id }) => id), ["other", "jing-ye-si"], "称号应命中对应诗人的作品");
assert.equal(searchPreparedRecords(records, "诗圣").results[0].id, "wang-yue", "不同称号不能串到其他诗人");
assert.equal(searchPreparedRecords(records, "诗仙").results[0].score, 125, "称号精确命中应作为作者相关结果排序");
assert.deepEqual(
  searchPreparedRecords(records, "李白 月夜").results.map(({ id }) => id),
  ["jing-ye-si"],
  "多个关键词应跨作者、标签与正文共同匹配",
);

assert.deepEqual(highlightTextSegments("床前明月光，疑是地上霜。", ["明月光疑是"]), [
  { text: "床前", highlight: false },
  { text: "明月光，疑是", highlight: true },
  { text: "地上霜。", highlight: false },
]);

console.log("✓ 搜索标点归一化、字段权重、跨字段多词匹配与高亮均通过校验");
