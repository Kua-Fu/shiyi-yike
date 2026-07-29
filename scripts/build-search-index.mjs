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
      poem.category,
      poem.form,
      ...poem.tags,
      ...body.lines,
      ...body.translation,
    ]),
    body.lines.slice(0, 2).join(" "),
  ];
});

// 搜索索引只保留 ID 与标准化文本，既覆盖原文和译文，也避免复制完整诗词结构。
await fs.writeFile(
  path.join(poemDirectory, "search.json"),
  `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    count: records.length,
    records,
  })}\n`,
);

console.log(`✓ 已生成 ${records.length} 首诗词的本地全文搜索索引`);
