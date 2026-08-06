import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { fetchLockedAsset } from "./lib/upstream-lock.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const poemDirectory = path.join(projectRoot, "data/poems");
const chunkDirectory = path.join(poemDirectory, "chunks");

const stageConfigs = [
  {
    period: "汉魏六朝",
    prefix: "period-hanwei",
    dynasties: [
      { source: "两汉", label: "两汉", target: 120 },
      { source: "魏晋", label: "魏晋", target: 120 },
      { source: "南北朝", label: "南北朝", target: 120 },
    ],
  },
  {
    period: "元代",
    prefix: "period-yuan",
    dynasties: [{ source: "元代", label: "元", target: 300 }],
  },
  {
    period: "明代",
    prefix: "period-ming",
    dynasties: [{ source: "明代", label: "明", target: 300 }],
  },
  {
    period: "清代",
    prefix: "period-qing",
    dynasties: [{ source: "清代", label: "清", target: 300 }],
  },
];

const proseTitlePattern =
  /(记|传|书|论|说|表|疏|策|问|序|令|诏|檄|状|案|录|纪|志|碑|铭|文|喻|世家|列传|本纪|墓志铭|家训)$/;
const proseSectionPattern = /(文言知识|文言现象|词类活用|一词多义|古今异义|通假字|特殊句式)/;
const proseTopicPattern =
  /(军细柳|治邺|开天辟地|大同篇|封伯禽于鲁|不辱使命|说楚襄王|上书谏|本纪赞|世家赞|商鞅立木|垓下之围|孙膑|田忌赛马|管鲍之交|陈涉起义|毛遂自荐|过蒙屯下|捉鬼|斩蛇|嫦娥奔月|后羿射日|女娲造人|孟门山|王子坊|涉务|水经注|西陵峡|乐羊子妻|共工怒触|江乙对|孟母戒子|黄琬巧对|博学之|嗟来之食|塞翁失马|文侯与虞人期猎|临淄劳耿弇|荆轲刺秦王|鸿门宴|晏子使楚|项羽之死|智退司马懿|北人食菱|泣学|好学|外科医生|公冶长背诺|王翱秉公|猩猩嗜酒|西山十记|于园|为学一首示子侄|狼子野心|世无良猫|红毛毡|种梨|地震|天目|白洋潮|龙山雪|记雪月之观|记王忠肃|虎丘中秋夜|极乐寺纪游|西湖游记|游天都|蚊对|牡丹亭记题词|鲁藩烟火|芙蕖)/;
const lateHanAuthors = new Set(["曹操"]);
const threeKingdomsAuthors = new Set([
  "曹丕",
  "曹植",
  "曹叡",
  "甄氏",
  "王粲",
  "刘桢",
  "应玚",
  "陈琳",
  "徐干",
  "阮瑀",
]);

function decodeHtml(value = "") {
  return value
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

function splitOriginal(html) {
  return htmlToParagraphs(html).flatMap((paragraph) => {
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

function hasVerseLikeClauses(record) {
  if (record.title.endsWith("赋")) return true;
  const plainText = decodeHtml(record.content.replace(/<[^>]+>/g, ""));
  const lengths = plainText
    .split(/[，。！？；：、]/)
    .map((clause) => normalizeText(clause).length)
    .filter(Boolean);
  if (lengths.length < 2) return false;
  const longClauses = lengths.filter((length) => length > 14).length;
  return Math.max(...lengths) <= 24 && longClauses / lengths.length <= 0.12;
}

function isPoetryRecord(record) {
  const lines = splitOriginal(record.content);
  const length = normalizeText(lines.join("")).length;
  const sectionNames =
    record.sons && typeof record.sons === "object" ? Object.keys(record.sons).join(" ") : "";
  return (
    Boolean(record.title?.trim() && record.author?.trim()) &&
    lines.length > 0 &&
    length >= 8 &&
    length <= 800 &&
    !record.title.includes("节选") &&
    !proseTitlePattern.test(record.title.trim()) &&
    !proseTopicPattern.test(record.title.trim()) &&
    !proseSectionPattern.test(sectionNames) &&
    hasVerseLikeClauses(record) &&
    extractTranslation(record).length > 0
  );
}

function balancedSelection(records, target, dynasty) {
  const queues = new Map();
  for (const record of records) {
    if (record.dynasty !== dynasty || !isPoetryRecord(record)) continue;
    const queue = queues.get(record.author) ?? [];
    queue.push(record);
    queues.set(record.author, queue);
  }

  const selected = [];
  while (selected.length < target) {
    let added = false;
    for (const queue of queues.values()) {
      const record = queue.shift();
      if (!record) continue;
      selected.push(record);
      added = true;
      if (selected.length === target) break;
    }
    if (!added) break;
  }

  if (selected.length !== target) {
    throw new Error(`${dynasty}仅找到 ${selected.length} 篇带完整译文的诗词，少于目标 ${target} 篇`);
  }
  return selected;
}

function formFor(record, period) {
  const numberedPart = /·(?:其|之)[一二三四五六七八九十百]+$/.test(record.title);
  if (period === "元代" && record.title.includes("·") && !numberedPart) return "散曲";
  if (["明代", "清代"].includes(period) && record.title.includes("·") && !numberedPart) {
    return "词";
  }
  if (record.title.endsWith("赋")) return "辞赋";
  if (period === "汉魏六朝" && /(?:歌|行|辞|引|篇)$/.test(record.title)) {
    return "乐府与古体诗";
  }
  return period === "元代" ? "元代诗曲" : `${period}诗`;
}

function displayDynastyFor(record, fallback) {
  const author = record.author.replace(/^(?:魏朝|西晋)·/, "");
  if (lateHanAuthors.has(author)) return "东汉";
  if (threeKingdomsAuthors.has(author)) return "三国";
  return fallback;
}

function buildStage(records, config) {
  const selected = config.dynasties.flatMap((dynasty) =>
    balancedSelection(records, dynasty.target, dynasty.source).map((record) => ({
      record,
      dynasty: displayDynastyFor(record, dynasty.label),
    })),
  );
  const chunks = new Map();
  const poems = selected.map(({ record, dynasty }, index) => {
    const chunk = `${config.prefix}-${String(Math.floor(index / 100)).padStart(2, "0")}`;
    const id = `${config.prefix}-${String(record.id).padStart(6, "0")}`;
    const form = formFor(record, config.period);
    const bodies = chunks.get(chunk) ?? [];
    bodies.push({
      id,
      lines: splitOriginal(record.content),
      translation: extractTranslation(record),
      translationMeta: {
        source: "yht050511/gushiwen · MIT 开放数据",
        reviewStatus: "pending-review",
      },
    });
    chunks.set(chunk, bodies);
    return {
      id,
      title: record.title.trim(),
      author: record.author.trim().replace(/^(?:魏朝|西晋)·/, ""),
      dynasty,
      period: config.period,
      category: config.period,
      form,
      source: "yht050511/gushiwen · 古诗文开放语料",
      tags: [...new Set([config.period, dynasty, form])],
      chunk,
    };
  });
  return { poems, chunks };
}

function periodFor(poem) {
  if (poem.period) return poem.period;
  if (poem.category === "先秦") return "先秦";
  if (poem.category === "唐诗") return "唐代";
  if (poem.category === "宋词") return "宋代";
  return poem.dynasty.endsWith("代") ? poem.dynasty : `${poem.dynasty}代`;
}

async function fetchSourceRecords() {
  const bytes = await fetchLockedAsset(projectRoot, "gushiwen.corpus");
  return JSON.parse(gunzipSync(bytes).toString("utf8"));
}

const indexPath = path.join(poemDirectory, "index.json");
const [index, sourceRecords] = await Promise.all([
  fs.readFile(indexPath, "utf8").then(JSON.parse),
  fetchSourceRecords(),
]);
const stages = stageConfigs.map((config) => buildStage(sourceRecords, config));
const generatedPoems = stages.flatMap((stage) => stage.poems);
const basePoems = index.poems
  .filter((poem) => !poem.id.startsWith("period-"))
  .map((poem) => ({ ...poem, period: periodFor(poem) }));
const poems = [...basePoems, ...generatedPoems].map((poem, ordinal) => ({ ...poem, ordinal }));

// 只更新本脚本负责的分卷前缀，避免影响先秦、唐诗、宋诗词或用户自行加入的数据。
const existingChunks = await fs.readdir(chunkDirectory);
await Promise.all(
  existingChunks
    .filter((filename) => /^period-(hanwei|yuan|ming|qing)-\d+\.json$/.test(filename))
    .map((filename) => fs.unlink(path.join(chunkDirectory, filename))),
);
for (const [chunk, bodies] of new Map(stages.flatMap((stage) => [...stage.chunks]))) {
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
      total: poems.length,
      preqin: periodCount("先秦"),
      shijing: index.counts.shijing,
      chuci: index.counts.chuci,
      hanweiliuchao: periodCount("汉魏六朝"),
      tang: periodCount("唐代"),
      song: periodCount("宋代"),
      songCi: poems.filter((poem) => poem.category === "宋词").length,
      songPoetry: poems.filter((poem) => poem.category === "宋诗").length,
      yuan: periodCount("元代"),
      ming: periodCount("明代"),
      qing: periodCount("清代"),
    },
    poems,
  })}\n`,
);

console.log(
  `✓ 已生成历代诗词 ${generatedPoems.length} 篇：汉魏六朝 360 篇、元明清各 300 篇`,
);
