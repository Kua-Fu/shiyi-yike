import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const poemDirectory = path.join(projectRoot, "data/poems");
const chunkDirectory = path.join(poemDirectory, "chunks");

function normalizeSearchText(parts) {
  return parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/\s+/g, " ")
    .trim();
}

const index = JSON.parse(await fs.readFile(path.join(poemDirectory, "index.json"), "utf8"));
const chunkFiles = (await fs.readdir(chunkDirectory))
  .filter((filename) => filename.endsWith(".json"))
  .sort();
const chunks = await Promise.all(
  chunkFiles.map(async (filename) =>
    JSON.parse(await fs.readFile(path.join(chunkDirectory, filename), "utf8")),
  ),
);
const bodiesById = new Map(chunks.flat().map((record) => [record.id, record]));

const records = index.poems.map((poem) => {
  const body = bodiesById.get(poem.id);
  if (!body) throw new Error(`搜索索引缺少正文：${poem.id}`);
  return [
    poem.id,
    normalizeSearchText([
      poem.title,
      poem.author,
      poem.dynasty,
      poem.period,
      poem.category,
      poem.form,
      ...poem.tags,
      ...body.lines,
      ...body.translation,
    ]),
    body.lines.slice(0, 2).join(" "),
  ];
});

async function writeSearchIndex(filename, scopedRecords) {
  const outputPath = path.join(poemDirectory, filename);
  try {
    const existing = JSON.parse(await fs.readFile(outputPath, "utf8"));
    // 内容没有变化时保留原生成时间并跳过写盘，避免仅因构建时间不同制造数 MB 的无意义 diff。
    if (
      existing.count === scopedRecords.length &&
      JSON.stringify(existing.records) === JSON.stringify(scopedRecords)
    ) {
      return false;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await fs.writeFile(
    outputPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      count: scopedRecords.length,
      records: scopedRecords,
    })}\n`,
  );
  return true;
}

const reviewedIds = new Set(
  index.poems
    .filter((poem) => poem.reviewStatus === "reviewed")
    .map((poem) => poem.id),
);
const reviewedRecords = records.filter(([id]) => reviewedIds.has(id));

// 938 篇精选索引服务常用搜索范围；只有用户明确进入全库时才读取 5334 篇全量索引。
await Promise.all([
  writeSearchIndex("search-reviewed.json", reviewedRecords),
  writeSearchIndex("search.json", records),
]);

console.log(
  `✓ 已生成 ${reviewedRecords.length} 篇精选与 ${records.length} 篇全库的分层搜索索引`,
);
