import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import * as OpenCC from "opencc-js";
import { fetchLockedAsset, fetchLockedJsonCollection } from "./lib/upstream-lock.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const poemDirectory = path.join(projectRoot, "data/poems");
const chunkDirectory = path.join(poemDirectory, "chunks");
const target = 200;
const chunkSize = 100;
const prefix = "additional-song-ci";
const generatedIdPattern = /^additional-song-ci-/;
const toSimplified = OpenCC.Converter({ from: "tw", to: "cn" });

const themePatterns = new Map([
  ["月夜", /月|夜|星|银河/],
  ["山水", /山|江|河|湖|溪|泉|峰|海/],
  ["春日", /春|花|桃|柳|莺|燕/],
  ["秋意", /秋|雁|菊|霜|枫/],
  ["思乡", /乡|故园|故国|归梦|家山/],
  ["离别", /送|别|饯|留别/],
  ["家国", /国|朝|君|帝|臣|苍生/],
  ["爱情", /相思|闺|郎|妾|鸳鸯/],
  ["羁旅", /客|旅|舟|驿|孤帆/],
  ["饮酒", /酒|醉|酌|杯|樽/],
]);

function decodeHtml(value = "") {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)),
    )
    .replace(/&#(\d+);/g, (_, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 10)),
    )
    .replace(/&nbsp;|&#160;|　/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#39;|&apos;|&lsquo;|&rsquo;/g, "'")
    .replace(/&hellip;/g, "……");
}

function htmlToParagraphs(html = "") {
  const text = decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  );
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractTranslation(record) {
  const sections = record.sons && typeof record.sons === "object" ? record.sons : {};
  for (const key of ["译文及注释", "译文"]) {
    const content = sections[key]?.content;
    if (typeof content !== "string" || !content.trim()) continue;
    const lines = htmlToParagraphs(content);
    const start = lines[0]?.endsWith("译文") && lines[0].length <= 6 ? 1 : 0;
    const annotationIndex = lines.findIndex((line, index) => index >= start && line === "注释");
    return lines.slice(start, annotationIndex === -1 ? undefined : annotationIndex);
  }
  return [];
}

function normalizeText(value) {
  return toSimplified(String(value)).replace(/[^\p{Script=Han}]/gu, "");
}

function titleKey(author, title) {
  return `${normalizeText(author)}|${normalizeText(title)}`;
}

function bodiesOverlap(left, right) {
  if (left === right) return true;
  if (left.length === right.length) {
    const allowedDifferences = Math.max(1, Math.floor(left.length * 0.03));
    let differences = 0;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] === right[index]) continue;
      differences += 1;
      if (differences > allowedDifferences) break;
    }
    if (differences <= allowedDifferences) return true;
  }
  if (Math.min(left.length, right.length) < 16) return false;
  return left.includes(right) || right.includes(left);
}

function corpusKey(author, rhythmic) {
  return `${normalizeText(author)}|${normalizeText(rhythmic)}`;
}

function buildCorpusMap(records) {
  const result = new Map();
  for (const record of records) {
    const normalizedBody = normalizeText(record.paragraphs.join(""));
    if (!normalizedBody) continue;
    const key = corpusKey(record.author, record.rhythmic);
    const collection = result.get(key) ?? [];
    collection.push({ ...record, normalizedBody });
    result.set(key, collection);
  }
  return result;
}

function matchCorpusRecord(record, corpusByAuthorAndRhythmic) {
  const rhythmic = record.title.split("·")[0].trim();
  const candidates =
    corpusByAuthorAndRhythmic.get(corpusKey(record.author, rhythmic)) ?? [];
  const sourceBody = normalizeText(htmlToParagraphs(record.content).join(""));
  return (
    candidates.find((candidate) => candidate.normalizedBody === sourceBody) ??
    candidates.find(
      (candidate) =>
        candidate.normalizedBody.length >= 16 &&
        sourceBody.includes(candidate.normalizedBody),
    ) ??
    candidates.find(
      (candidate) =>
        sourceBody.length >= 16 &&
        candidate.normalizedBody.includes(sourceBody),
    )
  );
}

function tagsFor(title, lines) {
  const text = `${title}${lines.join("")}`;
  const themes = [...themePatterns]
    .filter(([, pattern]) => pattern.test(text))
    .map(([theme]) => theme)
    .slice(0, 3);
  return [...new Set(["宋词", ...(themes.length ? themes : ["感怀"])])];
}

function balancedSelection(candidates, existingBodies) {
  const queues = new Map();
  for (const candidate of candidates) {
    const queue = queues.get(candidate.sourceRecord.author) ?? [];
    queue.push(candidate);
    queues.set(candidate.sourceRecord.author, queue);
  }

  const selected = [];
  const selectedBodies = [];
  const selectedTitles = new Set();
  while (selected.length < target) {
    let added = false;
    for (const queue of queues.values()) {
      let candidate;
      while ((candidate = queue.shift())) {
        const key = titleKey(candidate.sourceRecord.author, candidate.sourceRecord.title);
        if (selectedTitles.has(key)) continue;
        if (
          existingBodies.some((body) => bodiesOverlap(body, candidate.normalizedBody)) ||
          selectedBodies.some((body) => bodiesOverlap(body, candidate.normalizedBody))
        ) {
          continue;
        }
        selected.push(candidate);
        selectedTitles.add(key);
        selectedBodies.push(candidate.normalizedBody);
        added = true;
        break;
      }
      if (selected.length === target) break;
    }
    if (!added) break;
  }

  if (selected.length !== target) {
    throw new Error(`《全宋词》交叉核对后仅选出 ${selected.length} 首，少于目标 ${target} 首`);
  }
  return selected;
}

function insertAfterSongPeriod(poems, additions) {
  const lastIndex = poems.findLastIndex((poem) => poem.period === "宋代");
  if (lastIndex === -1) return [...poems, ...additions];
  return [
    ...poems.slice(0, lastIndex + 1),
    ...additions,
    ...poems.slice(lastIndex + 1),
  ];
}

async function fetchGushiwenRecords() {
  const bytes = await fetchLockedAsset(projectRoot, "gushiwen.corpus");
  return JSON.parse(gunzipSync(bytes).toString("utf8"));
}

async function fetchSongCiCorpus() {
  const parts = await fetchLockedJsonCollection(
    projectRoot,
    "chinese-poetry.song-ci-corpus",
  );
  return parts.flat();
}

const indexPath = path.join(poemDirectory, "index.json");
const [index, sourceRecords, corpusRecords, chunkFiles] = await Promise.all([
  fs.readFile(indexPath, "utf8").then(JSON.parse),
  fetchGushiwenRecords(),
  fetchSongCiCorpus(),
  fs.readdir(chunkDirectory),
]);
const basePoems = index.poems.filter((poem) => !generatedIdPattern.test(poem.id));
const baseIds = new Set(basePoems.map((poem) => poem.id));
const allowedAuthors = new Set(
  basePoems.filter((poem) => poem.dynasty === "宋").map((poem) => normalizeText(poem.author)),
);
const existingTitleKeys = new Set(
  basePoems.map((poem) => titleKey(poem.author, poem.title)),
);
const chunkRecords = (
  await Promise.all(
    chunkFiles
      .filter((filename) => filename.endsWith(".json"))
      .map((filename) =>
        fs.readFile(path.join(chunkDirectory, filename), "utf8").then(JSON.parse),
      ),
  )
).flat();
const existingBodies = chunkRecords
  .filter((record) => baseIds.has(record.id))
  .map((record) => normalizeText(record.lines.join("")));
const corpusByAuthorAndRhythmic = buildCorpusMap(corpusRecords);

const candidates = sourceRecords
  .filter(
    (record) =>
      record.dynasty === "宋代" &&
      record.title.includes("·") &&
      allowedAuthors.has(normalizeText(record.author)) &&
      extractTranslation(record).length > 0 &&
      !existingTitleKeys.has(titleKey(record.author, record.title)),
  )
  .map((sourceRecord) => {
    const corpusRecord = matchCorpusRecord(sourceRecord, corpusByAuthorAndRhythmic);
    if (!corpusRecord) return null;
    const lines = corpusRecord.paragraphs
      .map((line) => toSimplified(line).replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return {
      sourceRecord,
      corpusRecord,
      lines,
      translation: extractTranslation(sourceRecord),
      normalizedBody: normalizeText(lines.join("")),
    };
  })
  .filter(Boolean);
const selected = balancedSelection(candidates, existingBodies);
const chunks = new Map();
const additions = selected.map(
  ({ sourceRecord, corpusRecord, lines, translation }, index) => {
    const chunk = `${prefix}-${String(Math.floor(index / chunkSize)).padStart(2, "0")}`;
    const id = `${prefix}-${String(sourceRecord.id).padStart(6, "0")}`;
    const bodies = chunks.get(chunk) ?? [];
    bodies.push({
      id,
      lines,
      translation,
      translationMeta: {
        source: "yht050511/gushiwen · MIT 开放数据",
        reviewStatus: "pending-review",
      },
    });
    chunks.set(chunk, bodies);
    return {
      id,
      title: sourceRecord.title.trim(),
      author: toSimplified(corpusRecord.author).trim(),
      dynasty: "宋",
      period: "宋代",
      category: "宋词",
      form: `宋词 · ${toSimplified(corpusRecord.rhythmic).trim()}`,
      source: "唐圭璋编《全宋词》· chinese-poetry 开放语料校核",
      tags: tagsFor(sourceRecord.title, lines),
      chunk,
    };
  },
);
const poems = insertAfterSongPeriod(basePoems, additions).map((poem, ordinal) => ({
  ...poem,
  ordinal,
}));

// 正文必须先与开放《全宋词》语料逐首匹配；现代译文只作辅助阅读并明确标为待校订。
await Promise.all(
  chunkFiles
    .filter((filename) => /^additional-song-ci-\d+\.json$/.test(filename))
    .map((filename) => fs.unlink(path.join(chunkDirectory, filename))),
);
for (const [chunk, bodies] of chunks) {
  await fs.writeFile(
    path.join(chunkDirectory, `${chunk}.json`),
    `${JSON.stringify(bodies)}\n`,
  );
}

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
    chunkSize,
    poems,
  })}\n`,
);

console.log("✓ 已新增经《全宋词》开放语料交叉核对的宋词 200 首");
