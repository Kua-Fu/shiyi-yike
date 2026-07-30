import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(projectRoot, "data/poems/index.json");
const chunkDirectory = path.join(projectRoot, "data/poems/chunks");
const validStatuses = new Set(["reviewed", "pending-review", "ai-draft"]);

const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
const chunkNames = [...new Set(index.poems.map((poem) => poem.chunk))].sort();
const statusesById = new Map();

for (const chunkName of chunkNames) {
  const chunkPath = path.join(chunkDirectory, `${chunkName}.json`);
  const records = JSON.parse(await fs.readFile(chunkPath, "utf8"));
  for (const record of records) {
    const status = record.translationMeta?.reviewStatus;
    if (!validStatuses.has(status)) {
      throw new Error(`${chunkName} 中的 ${record.id} 缺少合法校订状态`);
    }
    statusesById.set(record.id, status);
  }
}

const counts = { reviewed: 0, pendingReview: 0, aiDraft: 0 };
const poems = index.poems.map((poem) => {
  const reviewStatus = statusesById.get(poem.id);
  if (!reviewStatus) throw new Error(`诗库索引中的 ${poem.id} 缺少正文校订状态`);
  if (reviewStatus === "reviewed") counts.reviewed += 1;
  if (reviewStatus === "pending-review") counts.pendingReview += 1;
  if (reviewStatus === "ai-draft") counts.aiDraft += 1;
  // 将紧凑状态写入索引，首页无需加载正文分卷就能默认排除待校与 AI 草稿。
  return { ...poem, reviewStatus };
});

if (statusesById.size !== poems.length) {
  throw new Error(`正文状态数 ${statusesById.size} 与索引数 ${poems.length} 不一致`);
}

const output = {
  ...index,
  counts: {
    ...index.counts,
    ...counts,
  },
  poems,
};

await fs.writeFile(indexPath, `${JSON.stringify(output)}\n`);
console.log(
  `已写入校订状态：已校 ${counts.reviewed}，待校 ${counts.pendingReview}，AI 草稿 ${counts.aiDraft}`,
);
