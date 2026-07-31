import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const poemDirectory = path.join(projectRoot, "data", "poems");
const chunkDirectory = path.join(poemDirectory, "chunks");

const [index, deepData, chunkFiles] = await Promise.all([
  fs.readFile(path.join(poemDirectory, "index.json"), "utf8").then(JSON.parse),
  fs
    .readFile(path.join(projectRoot, "data", "deep-readings.json"), "utf8")
    .then(JSON.parse),
  fs.readdir(chunkDirectory),
]);

const deepById = new Map(deepData.poems.map((reading) => [reading.id, reading]));
const deepMeta = index.poems.filter((poem) => deepById.has(poem.id));
const neededChunks = new Set(deepMeta.map((poem) => `${poem.chunk}.json`));
const chunkRecords = (
  await Promise.all(
    chunkFiles
      .filter((filename) => neededChunks.has(filename))
      .map((filename) =>
        fs.readFile(path.join(chunkDirectory, filename), "utf8").then(JSON.parse),
      ),
  )
).flat();
const bodyById = new Map(chunkRecords.map((record) => [record.id, record]));

const poems = deepMeta.map((meta) => {
  const body = bodyById.get(meta.id);
  if (!body) throw new Error(`首屏精读数据缺少正文：${meta.id}`);
  return {
    ...meta,
    ...body,
    deepReading: deepById.get(meta.id),
  };
});

if (poems.length !== deepData.poems.length) {
  throw new Error(
    `首屏精读数据数量不一致：索引 ${poems.length} 篇，精读稿 ${deepData.poems.length} 篇`,
  );
}

const startupData = {
  schemaVersion: 1,
  counts: {
    deep: poems.length,
    reviewed: index.counts.reviewed,
    all: index.counts.total,
  },
  editorialPolicy: deepData.editorialPolicy,
  sources: deepData.sources,
  poems,
};

await fs.writeFile(
  path.join(poemDirectory, "startup.json"),
  `${JSON.stringify(startupData)}\n`,
);

console.log(`✓ 已生成 ${poems.length} 篇可直接首屏展示的精读诗词`);
