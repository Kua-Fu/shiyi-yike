import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as OpenCC from "opencc-js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tangAuthorsUrl =
  "https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/master/%E5%85%A8%E5%94%90%E8%AF%97/authors.tang.json";
const songPoetsUrl =
  "https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/master/%E5%85%A8%E5%94%90%E8%AF%97/authors.song.json";
const songAuthorsUrl =
  "https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/master/%E5%AE%8B%E8%AF%8D/author.song.json";
const toSimplified = OpenCC.Converter({ from: "tw", to: "cn" });

function compactText(value = "") {
  return toSimplified(value)
    .replace(/^--\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deduplicateSentences(value) {
  const sentences = value.match(/[^。！？]+[。！？]?/g) ?? [value];
  const seen = new Set();
  return sentences
    .filter((sentence) => {
      const key = sentence.replace(/[《》“”‘’、，；：·\s]/g, "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("");
}

function conciseBiography(value, maxLength = 420) {
  const text = deduplicateSentences(compactText(value));
  if (text.length <= maxLength) return text;

  const draft = text.slice(0, maxLength);
  const punctuation = Math.max(
    draft.lastIndexOf("。"),
    draft.lastIndexOf("！"),
    draft.lastIndexOf("？"),
  );
  return punctuation >= 220 ? draft.slice(0, punctuation + 1) : `${draft}……`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`作者资料下载失败：${response.status} ${url}`);
  return response.json();
}

const index = JSON.parse(
  await fs.readFile(path.join(projectRoot, "data/poems/index.json"), "utf8"),
);
const [tangAuthors, songPoets, songAuthors] = await Promise.all([
  fetchJson(tangAuthorsUrl),
  fetchJson(songPoetsUrl),
  fetchJson(songAuthorsUrl),
]);

const tangProfiles = new Map(
  tangAuthors.map((author) => [
    compactText(author.name),
    {
      biography: conciseBiography(author.desc),
      source: "chinese-poetry · 全唐诗作者资料",
    },
  ]),
);
const songPoetProfiles = new Map(
  songPoets.map((author) => [
    compactText(author.name),
    {
      biography: conciseBiography(author.desc),
      source: "chinese-poetry · 宋代诗人资料",
    },
  ]),
);
const songProfiles = new Map(
  songAuthors.map((author) => [
    compactText(author.name),
    {
      biography: conciseBiography(author.short_description || author.description),
      source: "chinese-poetry · 宋词作者资料",
    },
  ]),
);

const counts = new Map();
for (const poem of index.poems) {
  const key = `${poem.dynasty}:${poem.author}`;
  const current = counts.get(key) ?? {
    name: poem.author,
    dynasty: poem.dynasty,
    role: poem.category === "宋词" ? "词人" : "诗人",
    works: 0,
  };
  current.works += 1;
  counts.set(key, current);
}

const authors = [...counts.values()]
  .map((author) => {
    // 五代词人可能被诗库归在“唐”卷；只按姓名跨表补齐，朝代与身份仍以本地诗库为准。
    const profile =
      (author.dynasty === "宋"
        ? songProfiles.get(author.name) || songPoetProfiles.get(author.name)
        : tangProfiles.get(author.name) || songProfiles.get(author.name)) ||
      songPoetProfiles.get(author.name);
    return {
      ...author,
      biography:
        profile?.biography ||
        `${author.dynasty}代${author.role}。现有开放作者语料尚未提供更完整的生平条目；“诗意一刻”当前收录其作品 ${author.works} 首，可从作品本身认识其创作风貌。`,
      source: profile?.source || "诗库索引整理",
      profileStatus: profile ? "sourced" : "index-only",
    };
  })
  .sort(
    (left, right) =>
      left.dynasty.localeCompare(right.dynasty, "zh-CN") ||
      right.works - left.works ||
      left.name.localeCompare(right.name, "zh-CN"),
  );

const result = {
  generatedAt: new Date().toISOString(),
  source: {
    name: "chinese-poetry",
    repository: "https://github.com/chinese-poetry/chinese-poetry",
    license: "MIT",
  },
  counts: {
    total: authors.length,
    sourced: authors.filter((author) => author.profileStatus === "sourced").length,
    indexOnly: authors.filter((author) => author.profileStatus === "index-only").length,
  },
  authors,
};

// 作者资料在构建阶段固化进扩展，避免新标签页运行时访问外部服务或申请额外权限。
await fs.writeFile(
  path.join(projectRoot, "data/authors.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);

console.log(
  `✓ 已生成 ${result.counts.total} 位作者简介：${result.counts.sourced} 位开放资料，${result.counts.indexOnly} 位索引简介`,
);
