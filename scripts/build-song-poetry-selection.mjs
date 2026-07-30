import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const poemDirectory = path.join(projectRoot, "data/poems");
const chunkDirectory = path.join(poemDirectory, "chunks");
const indexPath = path.join(poemDirectory, "index.json");
const sourcePath = path.join(
  projectRoot,
  "data/sources/song-poetry-selection.json",
);
const prefix = "song-poetry-selection";
const chunk = `${prefix}-00`;
const generatedIdPattern = /^song-poetry-selection-\d{4}$/;

function normalizeText(value) {
  return String(value).replace(/[^\p{Script=Han}]/gu, "");
}

function titleKey(author, title) {
  return `${normalizeText(author)}|${normalizeText(title)}`;
}

function insertAfterSongPeriod(poems, additions) {
  const lastSongIndex = poems.findLastIndex((poem) => poem.period === "宋代");
  if (lastSongIndex === -1) return [...poems, ...additions];
  return [
    ...poems.slice(0, lastSongIndex + 1),
    ...additions,
    ...poems.slice(lastSongIndex + 1),
  ];
}

const [index, sourceData, chunkFiles] = await Promise.all([
  fs.readFile(indexPath, "utf8").then(JSON.parse),
  fs.readFile(sourcePath, "utf8").then(JSON.parse),
  fs.readdir(chunkDirectory),
]);
const basePoems = index.poems.filter((poem) => !generatedIdPattern.test(poem.id));
const addedWorks = sourceData.selection.works.filter((work) => work.status === "added");

if (addedWorks.length !== sourceData.selection.added) {
  throw new Error("《宋诗选注》来源记录中的新增篇数不一致");
}
const existingTitles = new Set(
  basePoems.map((poem) => titleKey(poem.author, poem.title)),
);
for (const work of addedWorks) {
  if (existingTitles.has(titleKey(work.author, work.title))) {
    throw new Error(`诗库已存在同作者同题作品：${work.author}《${work.title}》`);
  }
  if (!work.lines?.length || !work.translation?.length) {
    throw new Error(`${work.author}《${work.title}》缺少原文或译文`);
  }
}

const baseIds = new Set(basePoems.map((poem) => poem.id));
const baseBodies = new Set(
  (
    await Promise.all(
      chunkFiles
        .filter((filename) => filename.endsWith(".json"))
        .map((filename) =>
          fs.readFile(path.join(chunkDirectory, filename), "utf8").then(JSON.parse),
        ),
    )
  )
    .flat()
    .filter((record) => baseIds.has(record.id))
    .map((record) => normalizeText(record.lines.join(""))),
);
for (const work of addedWorks) {
  const body = normalizeText(work.lines.join(""));
  if (baseBodies.has(body)) {
    throw new Error(`${work.author}《${work.title}》与诗库已有正文重复`);
  }
  baseBodies.add(body);
}

const additions = addedWorks.map((work) => ({
  id: work.id,
  title: work.title,
  author: work.author,
  dynasty: "宋",
  period: "宋代",
  category: "宋诗",
  form: work.form,
  source: `钱锺书《宋诗选注》书目参照 · ${work.textSource}`,
  tags: work.tags,
  chunk,
}));
const poems = insertAfterSongPeriod(basePoems, additions).map((poem, ordinal) => ({
  ...poem,
  ordinal,
}));

// 来源页没有公开完整选目，因此只构建页面明确点名的篇目，并避开页面明示未选的作品。
const bodies = addedWorks.map((work) => ({
  id: work.id,
  lines: work.lines,
  translation: work.translation,
  translationMeta: {
    source: "本项目依据公版原文重新整理",
    reviewStatus: sourceData.selection.translationReviewStatus,
  },
}));
await Promise.all(
  chunkFiles
    .filter((filename) => /^song-poetry-selection-\d+\.json$/.test(filename))
    .map((filename) => fs.unlink(path.join(chunkDirectory, filename))),
);
await fs.writeFile(
  path.join(chunkDirectory, `${chunk}.json`),
  `${JSON.stringify(bodies)}\n`,
);

const periodCount = (period) => poems.filter((poem) => poem.period === period).length;
await fs.writeFile(
  indexPath,
  `${JSON.stringify({
    ...index,
    counts: {
      ...index.counts,
      total: poems.length,
      tang: periodCount("唐代"),
      song: periodCount("宋代"),
      songCi: poems.filter((poem) => poem.category === "宋词").length,
      songPoetry: poems.filter((poem) => poem.category === "宋诗").length,
    },
    poems,
  })}\n`,
);

console.log("✓ 已补充《宋诗选注》来源页明确点名且本地缺少的宋诗 4 首");
