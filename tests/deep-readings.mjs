import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));

const deepData = readJson("data/deep-readings.json");
const index = readJson("data/poems/index.json");
const indexById = new Map(index.poems.map((poem) => [poem.id, poem]));
const sourceById = new Map(deepData.sources.map((source) => [source.id, source]));
const chunkCache = new Map();

assert.equal(deepData.version, "1.1.0");
assert.match(
  deepData.editorialPolicy,
  /原创精读稿/,
  "精读数据必须明确说明内容是项目原创整理",
);
assert.equal(deepData.poems.length, 100, "深度精读层应固定为 100 篇");
assert.equal(
  new Set(deepData.poems.map((poem) => poem.id)).size,
  100,
  "精读作品 ID 不得重复",
);
assert.equal(sourceById.size, deepData.sources.length, "精读核对依据 ID 不得重复");
assert.ok(sourceById.has("project-editorial"), "每篇精读应能引用项目原创编辑来源");

const periodCounts = new Map();
for (const reading of deepData.poems) {
  const meta = indexById.get(reading.id);
  assert.ok(meta, `精读作品必须存在于诗库索引：${reading.id}`);
  assert.equal(meta.reviewStatus, "reviewed", `精读作品必须先通过人工校订：《${meta.title}》`);
  assert.equal(reading.status, "deep", `精读层级必须明确标为 deep：《${meta.title}》`);
  periodCounts.set(meta.period, (periodCounts.get(meta.period) ?? 0) + 1);

  if (!chunkCache.has(meta.chunk)) {
    chunkCache.set(meta.chunk, readJson(`data/poems/chunks/${meta.chunk}.json`));
  }
  const body = chunkCache.get(meta.chunk).find((record) => record.id === reading.id);
  assert.ok(body, `精读作品必须存在完整正文：《${meta.title}》`);
  assert.equal(
    body.translationMeta?.reviewStatus,
    "reviewed",
    `精读作品译文必须先通过人工校订：《${meta.title}》`,
  );
  assert.equal(
    body.translation.length,
    body.lines.length,
    `精读作品必须具备逐句对齐译文：《${meta.title}》`,
  );

  assert.ok(reading.background.length >= 30, `精读背景过短：《${meta.title}》`);
  for (const key of ["summary", "turn", "craft"]) {
    assert.ok(reading.guide?.[key]?.length >= 20, `精读导览 ${key} 过短：《${meta.title}》`);
  }
  assert.ok(
    reading.annotations.length >= 2 && reading.annotations.length <= 4,
    `每篇应提供 2–4 条重点难词：《${meta.title}》`,
  );
  for (const annotation of reading.annotations) {
    assert.ok(
      Number.isInteger(annotation.line) &&
        annotation.line >= 0 &&
        annotation.line < body.lines.length,
      `难词行号超出正文范围：《${meta.title}》`,
    );
    assert.ok(annotation.term?.trim(), `难词词目不得为空：《${meta.title}》`);
    assert.ok(annotation.gloss?.length >= 8, `难词解释过短：《${meta.title}》`);
  }

  assert.ok(
    reading.sourceIds.includes("project-editorial"),
    `精读稿必须保留原创编辑署名：《${meta.title}》`,
  );
  assert.ok(reading.sourceIds.length >= 2, `精读稿至少应有一项古籍核对依据：《${meta.title}》`);
  for (const sourceId of reading.sourceIds) {
    assert.ok(sourceById.has(sourceId), `精读稿引用了未知来源：${sourceId}`);
  }
}

assert.deepEqual(
  Object.fromEntries(periodCounts),
  { 唐代: 80, 宋代: 20 },
  "精读层应由 80 首唐诗与 20 首宋词组成",
);

console.log("✓ 100 篇深度精读、逐句对齐、难词点注与核对依据均通过校验");
