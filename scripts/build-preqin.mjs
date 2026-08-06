import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { fetchLockedAsset, fetchLockedJson } from "./lib/upstream-lock.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const poemDirectory = path.join(projectRoot, "data/poems");
const chunkDirectory = path.join(poemDirectory, "chunks");
const groupTranslationPath = path.join(
  projectRoot,
  "data/sources/preqin-group-translations.json",
);

const chuciDynasties = {
  屈原: "战国",
  宋玉: "战国",
  景差: "战国",
  贾谊: "西汉",
  淮南小山: "西汉",
  东方朔: "西汉",
  王褒: "西汉",
  刘向: "西汉",
  庄忌: "西汉",
  王逸: "东汉",
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function htmlToLines(html) {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;|　/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractTranslation(html) {
  const lines = htmlToLines(html);
  const start = lines[0]?.endsWith("译文") && lines[0].length <= 6 ? 1 : 0;
  const annotationIndex = lines.findIndex((line, index) => index >= start && line === "注释");
  return lines.slice(start, annotationIndex === -1 ? undefined : annotationIndex);
}

function sourceTranslation(record) {
  const sections = record.sons && typeof record.sons === "object" ? record.sons : {};
  for (const key of ["译文及注释", "译文"]) {
    const content = sections[key]?.content;
    if (typeof content === "string" && content.trim()) return extractTranslation(content);
  }
  return [];
}

function normalizeText(text) {
  return String(text).replace(/<[^>]+>/g, "").replace(/[^\p{Script=Han}]/gu, "");
}

function diceSimilarity(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const pairs = new Map();
  for (let index = 0; index < a.length - 1; index += 1) {
    const pair = a.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }
  let overlap = 0;
  for (let index = 0; index < b.length - 1; index += 1) {
    const pair = b.slice(index, index + 2);
    const count = pairs.get(pair) ?? 0;
    if (!count) continue;
    overlap += 1;
    pairs.set(pair, count - 1);
  }
  return (2 * overlap) / (a.length + b.length - 2);
}

const manualShijingTranslations = {
  芣苡: [
    "采呀采呀采车前草，快把它采下来；采呀采呀采车前草，快把它收起来。",
    "采呀采呀采车前草，一片片拾起来；采呀采呀采车前草，一把把捋下来。",
    "采呀采呀采车前草，提起衣襟兜起来；采呀采呀采车前草，把衣襟掖在腰带间兜回来。",
  ],
  着: [
    "他在门屏之间等候我，冠旁垂着洁白的充耳丝带，末端缀着琼华美玉。",
    "他在庭院中等候我，冠旁垂着青色的充耳丝带，末端缀着琼莹美玉。",
    "他在厅堂前等候我，冠旁垂着黄色的充耳丝带，末端缀着琼英美玉。",
  ],
  鳲鸠: [
    "布谷鸟栖在桑树上，公平地哺育七只幼鸟。贤德的君子仪态始终如一；仪态如一，内心专一坚定。",
    "布谷鸟栖在桑树上，幼鸟飞到梅树间。贤德的君子系着整齐的丝带，冠上的玉饰斑斓端庄。",
    "布谷鸟栖在桑树上，幼鸟飞到酸枣树间。贤德的君子仪态没有差错；仪态不差，足以端正四方诸国。",
    "布谷鸟栖在桑树上，幼鸟飞到榛树间。贤德的君子能端正国人；既能端正国人，怎会不能福寿万年？",
  ],
  棠棣: [
    "棠棣花开，花萼鲜明灿烂。环顾世间的人，没有谁比兄弟更亲近。",
    "面对死亡与祸患，兄弟最为牵挂；哪怕尸骨散落原野，兄弟也会前去寻找。",
    "鹡鸰困在原野，兄弟便赶来救难；即使平日好友众多，此时也只能徒然长叹。",
    "兄弟在家中或许争执，对外却共同抵御欺侮；平日好友虽多，危急时未必前来相助。",
    "丧乱平息、生活安宁之后，人们竟说兄弟还不如朋友亲近吗？",
    "摆好笾豆，备下丰盛酒食；兄弟齐聚一堂，和睦快乐又亲厚。",
    "妻子儿女相亲和，如同琴瑟合奏；兄弟彼此和睦，欢乐便深厚长久。",
    "使你的家庭安宁，使妻儿共享快乐。细细推究、认真想想，事情确实就是这样。",
  ],
  绵: [
    "瓜蔓绵延，大瓜小瓜相继而生。周人的先民从杜水迁到沮水、漆水一带；古公亶父那时挖土窑、掘洞穴居住，还没有成形的房屋。",
    "古公亶父清早驱马出发，沿着西边河岸前行，来到岐山脚下；他和姜氏夫人一起，到这里勘察营建居所。",
    "周原土地肥美，连堇菜苦菜也甜如饴糖。众人开始谋划，并灼龟占卜；卜兆说可以停下、时机正好，于是决定在这里建房。",
    "人们安顿下来，安排左右区域，划定疆界、疏理沟渠，开垦土地、整治田亩；从西到东，周人都投入劳作。",
    "于是召来司空，又召来司徒，让他们组织营造家室。绳墨拉得笔直，夹起筑墙的木板，庄严整齐的宗庙由此建成。",
    "人们用筐运土，脚步纷繁；倾土入板，声势轰响；夯土之声登登，削墙之声冯冯。成百面墙同时筑起，连大鼓的声音也压不过施工声。",
    "又建起高大的皋门，皋门巍然耸立；再建起正门，应门宏伟壮丽；还筑起祭祀土地的冢土，军队由此出征。",
    "他没有消除对敌人的警惕，也没有损害自己的声望。柞树棫树被清除，道路变得平坦；昆夷惊惧奔逃，疲惫得气喘吁吁。",
    "虞、芮两国前来请文王裁断争端，文王的德望因此更加兴盛。人们说，他有亲近辅佐的贤臣，有前后引导的贤臣，有奔走传命的贤臣，也有抵御外侮的贤臣。",
  ],
};

function splitGroupTranslation(html, title, titles) {
  const lines = htmlToLines(html).map((line) => (line === "陶雍" ? "陶壅" : line));
  const start = lines.indexOf(title);
  if (start === -1) return [];
  const nextIndexes = titles
    .filter((candidate) => candidate !== title)
    .map((candidate) => lines.indexOf(candidate, start + 1))
    .filter((index) => index > start);
  const end = nextIndexes.length ? Math.min(...nextIndexes) : lines.length;
  return lines.slice(start + 1, end);
}

function buildTranslationResolver(sourceRecords, groupTranslations) {
  const sourceByTitle = new Map();
  for (const record of sourceRecords) {
    const records = sourceByTitle.get(record.title) ?? [];
    records.push(record);
    sourceByTitle.set(record.title, records);
  }

  const groupTitles = {
    九歌: [
      "东皇太一",
      "云中君",
      "湘君",
      "湘夫人",
      "大司命",
      "少司命",
      "东君",
      "河伯",
      "山鬼",
      "国殇",
      "礼魂",
    ],
    九章: ["惜诵", "涉江", "哀郢", "抽思", "怀沙", "思美人", "惜往日", "橘颂", "悲回风"],
    七谏: ["初放", "沉江", "怨世", "怨思", "自悲", "哀命", "谬谏"],
    九怀: ["匡机", "通路", "危俊", "昭世", "尊嘉", "蓄英", "思忠", "陶壅", "株昭"],
    九叹: ["逢纷", "离世", "怨思", "远逝", "惜贤", "忧苦", "愍命", "思古", "远游"],
    九思: ["逢尤", "怨上", "疾世", "悯上", "遭厄", "悼乱", "伤时", "哀岁", "守志"],
  };

  return (record, metadata) => {
    const manual = manualShijingTranslations[record.title];
    if (manual) {
      return {
        translation: manual,
        source: "依据《诗经》原典与公开注本整理",
      };
    }

    const groupedTitles = groupTitles[record.section];
    if (groupedTitles) {
      const translation = splitGroupTranslation(
        groupTranslations.groups[record.section],
        record.title,
        groupedTitles,
      );
      if (translation.length) {
        return {
          translation,
          source: "Papersnake/gushiwen · CC0-1.0",
        };
      }
    }

    const standalone = groupTranslations.standalone?.[record.title];
    if (standalone) {
      return {
        translation: extractTranslation(standalone),
        source: "Papersnake/gushiwen · CC0-1.0",
      };
    }

    // 《诗经》篇章在不同资料中可能署为“佚名”或传统所传作者，故以题名和正文相似度对齐。
    const candidates = sourceByTitle.get(record.title) ?? [];
    const best = candidates
      .map((candidate) => ({
        candidate,
        score: diceSimilarity(record.content.join(""), candidate.content),
      }))
      .sort((left, right) => right.score - left.score)[0];
    const translation = best ? sourceTranslation(best.candidate) : [];
    if (!translation.length) {
      throw new Error(`未找到《${record.title}》（${metadata.author}）的先秦译文`);
    }
    return {
      translation,
      source: "yht050511/gushiwen · MIT 开放数据",
    };
  };
}

function buildCollection(records, prefix, metadataFor, translationFor) {
  const chunks = new Map();
  const poems = [];
  records.forEach((record, index) => {
    const chunk = `${prefix}-${String(Math.floor(index / 100)).padStart(2, "0")}`;
    const id = `${prefix}-${String(index + 1).padStart(3, "0")}`;
    const metadata = metadataFor(record);
    const poem = {
      id,
      title: record.title,
      author: metadata.author,
      dynasty: metadata.dynasty,
      category: "先秦",
      form: metadata.form,
      source: metadata.source,
      tags: metadata.tags,
      chunk,
    };
    poems.push(poem);
    const translated = translationFor(record, metadata);
    const bodies = chunks.get(chunk) ?? [];
    bodies.push({
      id,
      lines: record.content,
      translation: translated.translation,
      translationMeta: {
        source: translated.source,
        reviewStatus: "pending-review",
      },
    });
    chunks.set(chunk, bodies);
  });
  return { poems, chunks };
}

const indexPath = path.join(poemDirectory, "index.json");
const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
const [shijing, chuci, translationRecords, groupTranslations] = await Promise.all([
  fetchLockedJson(projectRoot, "chinese-poetry.shijing"),
  fetchLockedJson(projectRoot, "chinese-poetry.chuci"),
  fetchLockedAsset(projectRoot, "gushiwen.corpus")
    .then((bytes) => JSON.parse(gunzipSync(bytes).toString("utf8"))),
  fs.readFile(groupTranslationPath, "utf8").then(JSON.parse),
]);
const translationFor = buildTranslationResolver(translationRecords, groupTranslations);

const shijingCollection = buildCollection(
  shijing,
  "preqin-shijing",
  (record) => ({
    author: "佚名",
    dynasty: "先秦",
    form: `《诗经》 · ${record.chapter} · ${record.section}`,
    source: "chinese-poetry · 《诗经》开放语料",
    tags: unique(["诗经", record.chapter, record.section]),
  }),
  translationFor,
);
const chuciCollection = buildCollection(
  chuci,
  "preqin-chuci",
  (record) => ({
    author: record.author || "佚名",
    // 《楚辞》收录后世拟骚作品；保留作者实际时代，分类仍统一归入“先秦典籍”。
    dynasty: chuciDynasties[record.author] || "先秦",
    form: `《楚辞》 · ${record.section}`,
    source: "chinese-poetry · 《楚辞》开放语料",
    tags: unique(["楚辞", record.section]),
  }),
  translationFor,
);

const basePoems = index.poems.filter((poem) => poem.category !== "先秦");
const preqinPoems = [...shijingCollection.poems, ...chuciCollection.poems];
const poems = [...basePoems, ...preqinPoems].map((poem, ordinal) => ({ ...poem, ordinal }));

// 只清理本脚本生成的固定前缀分卷，绝不触碰唐诗、宋诗词或其他用户数据。
const existingChunks = await fs.readdir(chunkDirectory);
await Promise.all(
  existingChunks
    .filter((filename) => /^preqin-(shijing|chuci)-\d+\.json$/.test(filename))
    .map((filename) => fs.unlink(path.join(chunkDirectory, filename))),
);
for (const [chunk, records] of new Map([
  ...shijingCollection.chunks,
  ...chuciCollection.chunks,
])) {
  await fs.writeFile(
    path.join(chunkDirectory, `${chunk}.json`),
    `${JSON.stringify(records)}\n`,
  );
}

await fs.writeFile(
  indexPath,
  `${JSON.stringify({
    ...index,
    counts: {
      ...index.counts,
      total: poems.length,
      preqin: preqinPoems.length,
      shijing: shijing.length,
      chuci: chuci.length,
      tang: basePoems.filter((poem) => poem.period === "唐代").length,
      song: basePoems.filter((poem) => poem.period === "宋代").length,
      songCi: basePoems.filter((poem) => poem.category === "宋词").length,
      songPoetry: basePoems.filter((poem) => poem.category === "宋诗").length,
    },
    poems,
  })}\n`,
);

console.log(
  `✓ 已生成先秦典籍 ${preqinPoems.length} 篇：《诗经》${shijing.length} 篇、《楚辞》${chuci.length} 篇`,
);
