import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { fetchLockedAsset } from "./lib/upstream-lock.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const poemDirectory = path.join(projectRoot, "data/poems");
const chunkDirectory = path.join(poemDirectory, "chunks");
const chunkSize = 100;

const collectionConfigs = [
  {
    dynasty: "唐代",
    period: "唐代",
    category: "唐诗",
    prefix: "additional-tang",
    target: 1000,
    balancedTarget: 500,
    // 保留原有 500 首均衡补充卷，再集中扩展名家诗集，兼顾作者广度与代表诗人的作品深度。
    authorExpansionTargets: [
      ["李白", 100],
      ["杜甫", 100],
      ["白居易", 80],
      ["李商隐", 45],
      ["王维", 30],
      ["李贺", 30],
      ["柳宗元", 25],
      ["刘禹锡", 20],
      ["韩愈", 20],
      ["高适", 18],
      ["杜牧", 10],
      ["岑参", 10],
      ["韦应物", 10],
      ["王昌龄", 2],
    ],
  },
  {
    dynasty: "宋代",
    period: "宋代",
    category: "宋诗",
    prefix: "additional-song",
    target: 500,
    // 维持已发布宋诗补充卷的选目稳定，本次只扩展唐诗，不替换既有宋诗。
    excludedIds: ["additional-song-020641"],
  },
];

const proseTitlePattern =
  /(记|传|书|论|说|表|疏|策|问|序|令|诏|檄|状|案|录|纪|志|碑|铭|文|喻|世家|列传|本纪|墓志铭|家训|赋)$/;
const proseSectionPattern =
  /(文言知识|文言现象|词类活用|一词多义|古今异义|通假字|特殊句式|文章结构|寓意)/;
const prefatoryNotePattern =
  /(?:因作《[^》]+》|所留字|旧御路).*(?:也|云)[。！]?$/;
const numberedPartPattern = /^(?:其|之)?[一二三四五六七八九十百]+$/;
const generatedIdPattern = /^additional-(?:tang|song)-\d{6}$/;
const additionalCiPai = new Set([
  "八拍蛮",
  "采莲子",
  "长相思",
  "定西番",
  "更漏子",
  "河传",
  "荷叶杯",
  "花非花",
  "浣溪沙",
  "酒泉子",
  "临江仙",
  "梦江南",
  "南歌子",
  "菩萨蛮",
  "清平乐",
  "生查子",
  "诉衷情",
  "望江南",
  "巫山一段云",
  "喜迁莺",
  "谒金门",
  "忆江南",
  "虞美人",
  "玉蝴蝶",
  "渔歌子",
  "女冠子",
]);

const themePatterns = new Map([
  ["月夜", /月|夜|星|银河/],
  ["山水", /山|江|河|湖|溪|泉|峰|瀑|海/],
  ["春日", /春|花|桃|柳|莺|燕/],
  ["秋意", /秋|雁|菊|霜|枫/],
  ["思乡", /乡|故园|故国|归梦|家山/],
  ["离别", /送|别|饯|留别/],
  ["边塞", /塞|关|戍|胡|羌|烽|从军/],
  ["田园", /田|村|农|园|柴门/],
  ["饮酒", /酒|醉|酌|杯|樽/],
  ["怀古", /怀古|古迹|故垒|旧游/],
  ["家国", /国|朝|君|帝|臣|苍生/],
  ["爱情", /相思|闺|郎|妾|鸳鸯/],
  ["禅意", /寺|僧|禅|佛|梵/],
  ["羁旅", /客|旅|舟|驿|孤帆/],
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

function cleanOriginalHtml(value = "") {
  return value.replace(
    /[（(][^()（）]{0,100}(?:一作|同[：:]|通[：:]|原作|作[：:])[^()（）]{0,100}[)）]/g,
    "",
  );
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

function splitOriginal(record) {
  const paragraphs = htmlToParagraphs(cleanOriginalHtml(record.content));
  if (paragraphs.length > 1 && prefatoryNotePattern.test(paragraphs[0])) {
    paragraphs.shift();
  }
  return paragraphs.flatMap((paragraph) => {
    const sentences = paragraph.match(/[^。！？；]+[。！？；]?/g);
    return (sentences ?? [paragraph]).map((line) => line.trim()).filter(Boolean);
  });
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
  return String(value).replace(/[^\p{Script=Han}]/gu, "");
}

function titleKey(author, title) {
  return `${normalizeText(author)}|${normalizeText(title)}`;
}

function clauseLengths(lines) {
  return lines
    .join("")
    .split(/[，。！？；：、]/)
    .map(normalizeText)
    .map((clause) => clause.length)
    .filter(Boolean);
}

function isVerseRecord(record) {
  const lines = splitOriginal(record);
  const translation = extractTranslation(record);
  const lengths = clauseLengths(lines);
  const sectionNames =
    record.sons && typeof record.sons === "object" ? Object.keys(record.sons).join(" ") : "";
  const originalLength = normalizeText(lines.join("")).length;
  const classicalClauses = lengths.filter((length) => length === 5 || length === 7).length;

  // 补充卷只选结构清晰的五、七言诗，主动排除同源数据中的散文、辞赋和词作。
  return (
    Boolean(record.title?.trim() && record.author?.trim()) &&
    lines.length > 0 &&
    translation.length > 0 &&
    originalLength >= 20 &&
    originalLength <= 500 &&
    lengths.length >= 4 &&
    lengths.length <= 80 &&
    Math.max(...lengths) <= 9 &&
    classicalClauses / lengths.length >= 0.8 &&
    !record.title.includes("节选") &&
    !proseTitlePattern.test(record.title.trim()) &&
    !proseSectionPattern.test(sectionNames)
  );
}

function knownCiPai(index) {
  return new Set([
    ...additionalCiPai,
    ...index.poems
      .filter((poem) => poem.category === "宋词")
      .flatMap((poem) => [
        poem.title.split("·")[0].trim(),
        poem.form.replace(/^宋词\s*·\s*/, "").trim(),
      ])
      .filter(Boolean),
  ]);
}

function isKnownCiTitle(title, ciPai) {
  const prefix = title.split("·")[0].trim();
  return ciPai.has(title.trim()) || ciPai.has(prefix);
}

function isSongPoemTitle(title, ciPai) {
  if (isKnownCiTitle(title, ciPai)) return false;
  const [, subtitle] = title.split("·");
  return !subtitle || numberedPartPattern.test(subtitle.trim());
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

function formFor(lines, category) {
  const lengths = clauseLengths(lines);
  const uniformLength = lengths.every((length) => length === lengths[0])
    ? lengths[0]
    : null;
  const prefix = category;
  if (uniformLength === 5 && lengths.length === 4) return `${prefix} · 五言绝句`;
  if (uniformLength === 7 && lengths.length === 4) return `${prefix} · 七言绝句`;
  if (uniformLength === 5 && lengths.length === 8) return `${prefix} · 五言律诗`;
  if (uniformLength === 7 && lengths.length === 8) return `${prefix} · 七言律诗`;
  if (uniformLength === 5) return `${prefix} · 五言古诗`;
  if (uniformLength === 7) return `${prefix} · 七言古诗`;
  return `${prefix} · 古体诗`;
}

function tagsFor(record, lines, category) {
  const text = `${record.title}${lines.join("")}`;
  const themes = [...themePatterns]
    .filter(([, pattern]) => pattern.test(text))
    .map(([theme]) => theme)
    .slice(0, 3);
  return [...new Set([category, ...(themes.length ? themes : ["感怀"])])];
}

function balancedSelection(candidates, target, existingBodies) {
  const queues = new Map();
  for (const candidate of candidates) {
    const queue = queues.get(candidate.record.author) ?? [];
    queue.push(candidate);
    queues.set(candidate.record.author, queue);
  }

  const selected = [];
  const selectedBodies = [];
  const selectedTitles = new Set();
  while (selected.length < target) {
    let added = false;
    for (const queue of queues.values()) {
      let candidate;
      while ((candidate = queue.shift())) {
        const key = titleKey(candidate.record.author, candidate.record.title);
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
    throw new Error(`去重后仅选出 ${selected.length} 篇，少于目标 ${target} 篇`);
  }
  return selected;
}

function authorExpansionSelection(
  candidates,
  authorTargets,
  existingBodies,
  preservedSelection,
) {
  const selected = [];
  const selectedBodies = preservedSelection.map((candidate) => candidate.normalizedBody);
  const selectedIds = new Set(
    preservedSelection.map((candidate) => String(candidate.record.id)),
  );
  const selectedTitles = new Set(
    preservedSelection.map((candidate) =>
      titleKey(candidate.record.author, candidate.record.title),
    ),
  );

  for (const [author, target] of authorTargets) {
    let authorCount = 0;
    for (const candidate of candidates) {
      if (candidate.record.author !== author) continue;
      if (selectedIds.has(String(candidate.record.id))) continue;
      const key = titleKey(candidate.record.author, candidate.record.title);
      if (selectedTitles.has(key)) continue;
      if (
        existingBodies.some((body) => bodiesOverlap(body, candidate.normalizedBody)) ||
        selectedBodies.some((body) => bodiesOverlap(body, candidate.normalizedBody))
      ) {
        continue;
      }

      selected.push(candidate);
      selectedIds.add(String(candidate.record.id));
      selectedTitles.add(key);
      selectedBodies.push(candidate.normalizedBody);
      authorCount += 1;
      if (authorCount === target) break;
    }
    if (authorCount !== target) {
      throw new Error(`${author} 去重后仅选出 ${authorCount} 篇，少于扩展目标 ${target} 篇`);
    }
  }
  return selected;
}

function buildCollection(sourceRecords, basePoems, baseBodies, ciPai, config) {
  const allowedAuthors = new Set(
    basePoems.filter((poem) => poem.period === config.period).map((poem) => poem.author),
  );
  const existingTitleKeys = new Set(
    basePoems.map((poem) => titleKey(poem.author, poem.title)),
  );
  const candidates = sourceRecords
    .filter(
      (record) =>
        record.dynasty === config.dynasty &&
        allowedAuthors.has(record.author) &&
        !config.excludedIds?.includes(
          `${config.prefix}-${String(record.id).padStart(6, "0")}`,
        ) &&
        isVerseRecord(record) &&
        !isKnownCiTitle(record.title, ciPai) &&
        (config.category !== "宋诗" || isSongPoemTitle(record.title, ciPai)),
    )
    .map((record) => {
      const lines = splitOriginal(record);
      return {
        record,
        lines,
        translation: extractTranslation(record),
        normalizedBody: normalizeText(lines.join("")),
      };
    })
    .filter(
      (candidate) =>
        !existingTitleKeys.has(titleKey(candidate.record.author, candidate.record.title)),
    );

  const balancedTarget = config.balancedTarget ?? config.target;
  const selected = balancedSelection(candidates, balancedTarget, baseBodies);
  if (config.authorExpansionTargets) {
    const expansionTarget = config.authorExpansionTargets.reduce(
      (total, [, count]) => total + count,
      0,
    );
    if (balancedTarget + expansionTarget !== config.target) {
      throw new Error(
        `${config.category} 均衡卷与名家扩展卷合计 ${
          balancedTarget + expansionTarget
        } 篇，与目标 ${config.target} 篇不一致`,
      );
    }
    selected.push(
      ...authorExpansionSelection(
        candidates,
        config.authorExpansionTargets,
        baseBodies,
        selected,
      ),
    );
  }
  const chunks = new Map();
  const poems = selected.map(({ record, lines, translation }, index) => {
    const chunk =
      `${config.prefix}-${String(Math.floor(index / chunkSize)).padStart(2, "0")}`;
    const id = `${config.prefix}-${String(record.id).padStart(6, "0")}`;
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
      title: record.title.trim(),
      author: record.author.trim(),
      dynasty: config.period === "唐代" ? "唐" : "宋",
      period: config.period,
      category: config.category,
      form: formFor(lines, config.category),
      source: "yht050511/gushiwen · 古诗文开放语料",
      tags: tagsFor(record, lines, config.category),
      chunk,
    };
  });
  return { poems, chunks };
}

function insertAfterPeriod(poems, period, additions) {
  const lastIndex = poems.findLastIndex((poem) => poem.period === period);
  if (lastIndex === -1) return [...poems, ...additions];
  return [
    ...poems.slice(0, lastIndex + 1),
    ...additions,
    ...poems.slice(lastIndex + 1),
  ];
}

async function fetchSourceRecords() {
  const bytes = await fetchLockedAsset(projectRoot, "gushiwen.corpus");
  return JSON.parse(gunzipSync(bytes).toString("utf8"));
}

const indexPath = path.join(poemDirectory, "index.json");
const [index, sourceRecords, chunkFiles] = await Promise.all([
  fs.readFile(indexPath, "utf8").then(JSON.parse),
  fetchSourceRecords(),
  fs.readdir(chunkDirectory),
]);
const basePoems = index.poems.filter((poem) => !generatedIdPattern.test(poem.id));
const baseIds = new Set(basePoems.map((poem) => poem.id));
const chunkRecords = (
  await Promise.all(
    chunkFiles
      .filter((filename) => filename.endsWith(".json"))
      .map((filename) =>
        fs.readFile(path.join(chunkDirectory, filename), "utf8").then(JSON.parse),
      ),
  )
).flat();
const baseBodies = chunkRecords
  .filter((record) => baseIds.has(record.id))
  .map((record) => normalizeText(record.lines.join("")));
const ciPai = knownCiPai(index);
const collections = collectionConfigs.map((config) =>
  buildCollection(sourceRecords, basePoems, baseBodies, ciPai, config),
);

let poems = basePoems;
for (const [index, collection] of collections.entries()) {
  poems = insertAfterPeriod(poems, collectionConfigs[index].period, collection.poems);
}
poems = poems.map((poem, ordinal) => ({ ...poem, ordinal }));

// 仅替换本脚本生成的补充卷，保留原有唐诗、宋词和其他朝代数据。
await Promise.all(
  chunkFiles
    .filter((filename) => /^additional-(tang|song)-\d+\.json$/.test(filename))
    .map((filename) => fs.unlink(path.join(chunkDirectory, filename))),
);
for (const [chunk, bodies] of new Map(
  collections.flatMap((collection) => [...collection.chunks]),
)) {
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

console.log("✓ 已新增唐诗 1000 首、宋诗 500 首；唐诗共 2000 首、宋代诗词共 1704 首");
