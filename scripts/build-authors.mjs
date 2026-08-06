import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as OpenCC from "opencc-js";
import { fetchLockedJson } from "./lib/upstream-lock.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

function profileProvenance(profile = {}) {
  const result = {};
  for (const key of [
    "sourceUrl",
    "sourceTitle",
    "sourceRevisionId",
    "sourcePermalink",
    "retrievedAt",
    "attribution",
    "sourceLicense",
    "sourceLicenseUrl",
    "reuseMode",
    "sourceChanges",
    "sourceTransform",
    "researchReference",
  ]) {
    if (profile[key] !== undefined) result[key] = profile[key];
  }
  return result;
}

function firstUsableProfile(...profiles) {
  return profiles.find((profile) => compactText(profile?.biography ?? "").length >= 8);
}

const index = JSON.parse(
  await fs.readFile(path.join(projectRoot, "data/poems/index.json"), "utf8"),
);
const supplementalData = JSON.parse(
  await fs.readFile(
    path.join(projectRoot, "data/sources/author-profiles.json"),
    "utf8",
  ),
);
const [tangAuthors, songPoets, songAuthors] = await Promise.all([
  fetchLockedJson(projectRoot, "chinese-poetry.tang-authors"),
  fetchLockedJson(projectRoot, "chinese-poetry.song-poets"),
  fetchLockedJson(projectRoot, "chinese-poetry.song-authors"),
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

const earlyProfiles = new Map([
  [
    "先秦:佚名",
    {
      biography:
        "《诗经》中的作品产生于西周初年至春秋中叶，作者大多已不可考，既有民间歌谣，也有朝会、祭祀与贵族宴飨之作。后世将这些无确切署名的创作者统称为“佚名”。",
      source: "《诗经》作者资料整理",
    },
  ],
  [
    "屈原",
    {
      biography:
        "屈原，战国时期楚国诗人、政治家，名平，字原。其作品以深沉的家国情怀、瑰丽想象和香草美人传统著称，代表作有《离骚》《九歌》《九章》《天问》等，对后世辞赋与诗歌影响深远。",
      source: "先秦人物资料整理",
    },
  ],
  [
    "宋玉",
    {
      biography:
        "宋玉，战国后期楚国辞赋家，生平记载有限，传统上被视为屈原之后的重要楚辞作家。其作品善于铺陈景物、体察情思，对汉代辞赋的发展产生了重要影响。",
      source: "先秦人物资料整理",
    },
  ],
  [
    "景差",
    {
      biography:
        "景差，战国时期楚国辞赋家，生平资料较少，传统文献常将其与屈原、宋玉并称。其作品承续楚地文学的想象、音韵与抒情传统。",
      source: "先秦人物资料整理",
    },
  ],
  [
    "贾谊",
    {
      biography:
        "贾谊，西汉政论家、文学家，洛阳人。年少有才，曾任博士、太中大夫，后为长沙王太傅、梁怀王太傅。其辞赋感慨身世、忧思国政，代表作有《吊屈原赋》《鵩鸟赋》。",
      source: "两汉人物资料整理",
    },
  ],
  [
    "淮南小山",
    {
      biography:
        "淮南小山是西汉淮南王刘安门客群体的文学署名，具体成员已难确考。传世《招隐士》以楚辞体写山林幽深与召唤归来的情思，语言瑰丽而富有节奏。",
      source: "两汉人物资料整理",
    },
  ],
  [
    "东方朔",
    {
      biography:
        "东方朔，西汉文学家，平原厌次人，以博闻善辩和诙谐机智著称，曾任常侍郎、太中大夫等职。其文学形象对后世志怪、滑稽与辞赋传统影响深远。",
      source: "两汉人物资料整理",
    },
  ],
  [
    "王褒",
    {
      biography:
        "王褒，西汉辞赋家，蜀郡资中人，字子渊。汉宣帝时入朝待诏，擅长辞赋，作品兼具铺陈华采与讽谏意味，是西汉中后期重要文学家。",
      source: "两汉人物资料整理",
    },
  ],
  [
    "刘向",
    {
      biography:
        "刘向，西汉经学家、目录学家、文学家，本名更生，字子政。曾主持校理皇家藏书，编订整理多种先秦两汉典籍，著有《新序》《说苑》《列女传》等。",
      source: "两汉人物资料整理",
    },
  ],
  [
    "庄忌",
    {
      biography:
        "庄忌，又称严忌，西汉辞赋家，会稽吴人。以辞赋知名，曾游于梁孝王门下，传世作品承续楚辞的抒情方式与问答结构。",
      source: "两汉人物资料整理",
    },
  ],
  [
    "王逸",
    {
      biography:
        "王逸，东汉文学家、经学家，南郡宜城人，字叔师。其《楚辞章句》是现存较早的《楚辞》完整注本，对篇目编次、作者归属和后世楚辞研究影响深远。",
      source: "东汉人物资料整理",
    },
  ],
]);

const counts = new Map();
for (const poem of index.poems) {
  const key = `${poem.dynasty}:${poem.author}`;
  const current = counts.get(key) ?? {
    name: poem.author,
    dynasty: poem.dynasty,
    role:
      poem.form === "散曲"
        ? "曲家"
        : poem.category === "宋词" || poem.form === "词"
        ? "词人"
        : poem.category === "先秦"
          ? poem.author === "佚名"
            ? "传唱者"
            : "辞赋家"
          : "诗人",
    works: 0,
  };
  current.works += 1;
  counts.set(key, current);
}

const supplementalProfiles = new Map(
  supplementalData.profiles.map((profile) => [
    `${profile.dynasty}:${profile.name}`,
    profile,
  ]),
);

const authors = [...counts.values()]
  .map((author) => {
    // 五代词人可能被诗库归在“唐”卷；只按姓名跨表补齐，朝代与身份仍以本地诗库为准。
    const profile = firstUsableProfile(
      earlyProfiles.get(`${author.dynasty}:${author.name}`),
      earlyProfiles.get(author.name),
      supplementalProfiles.get(`${author.dynasty}:${author.name}`),
      ...(author.dynasty === "宋"
        ? [songProfiles.get(author.name), songPoetProfiles.get(author.name)]
        : author.dynasty === "唐"
          ? [tangProfiles.get(author.name), songProfiles.get(author.name)]
          : []),
    );
    const period = ["唐", "宋"].includes(author.dynasty)
      ? `${author.dynasty}代`
      : author.dynasty;
    return {
      ...author,
      biography:
        profile?.biography ||
        `${period}${author.role}。现有开放作者语料尚未提供更完整的生平条目；“诗意一刻”当前收录其作品 ${author.works} 篇，可从作品本身认识其创作风貌。`,
      source: profile?.source || "诗库索引整理",
      ...profileProvenance(profile),
      profileStatus: profile?.profileStatus || (profile ? "sourced" : "index-only"),
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
  supplementalSources: supplementalData.sources,
  counts: {
    total: authors.length,
    complete: authors.filter((author) => author.profileStatus !== "index-only").length,
    sourced: authors.filter((author) => author.profileStatus === "sourced").length,
    limitedRecord: authors.filter((author) => author.profileStatus === "limited-record").length,
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
  `✓ 已生成 ${result.counts.total} 位作者简介：${result.counts.sourced} 位来源资料，` +
    `${result.counts.limitedRecord} 位有限记载，${result.counts.indexOnly} 位待补充`,
);
