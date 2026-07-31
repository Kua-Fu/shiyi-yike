import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenCC from "opencc-js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));

const manifest = readJson("manifest.json");
assert.equal(manifest.manifest_version, 3, "扩展必须使用 Manifest V3");
assert.equal(manifest.version, "1.15.0");
assert.equal(
  manifest.chrome_url_overrides,
  undefined,
  "不得接管 Chrome 新标签页，以免与 Momentum 等扩展冲突",
);
assert.deepEqual(manifest.permissions, ["storage"], "扩展应只申请本地偏好存储权限");
assert.deepEqual(
  manifest.commands?._execute_action?.suggested_key,
  { default: "Alt+Shift+P", mac: "Command+Shift+P" },
  "扩展应提供浏览器级快捷键，并复用工具栏入口",
);

const requiredFiles = [
  "index.html",
  "newtab.html",
  manifest.background.service_worker,
  "app.js",
  "share-poster.js",
  "reading-insights.js",
  "learning-progress.js",
  "styles.css",
  "extension.css",
  "data/deep-readings.json",
  "assets/fonts/ZhiMangXing-Regular.ttf",
  "assets/fonts/ZhiMangXing-OFL.txt",
  "vendor/opencc-js/full.js",
  "vendor/opencc-js/LICENSE",
  "vendor/opencc-js/THIRD_PARTY_LICENSES.md",
  "vendor/qrcode-generator/qrcode.mjs",
  "vendor/qrcode-generator/qrcode_UTF8.mjs",
  "vendor/qrcode-generator/LICENSE",
  ...Object.values(manifest.icons),
];
for (const relativePath of requiredFiles) {
  assert.ok(fs.existsSync(path.join(projectRoot, relativePath)), `缺少扩展文件：${relativePath}`);
}

const backgroundSource = fs.readFileSync(path.join(projectRoot, "background.js"), "utf8");
assert.match(
  backgroundSource,
  /chrome\.action\.onClicked\.addListener/,
  "诗意一刻应仅在用户点击工具栏图标后打开",
);
assert.match(
  backgroundSource,
  /chrome\.tabs\.create\(\{ url: READER_PAGE_URL \}\)/,
  "工具栏入口应在没有现存页签时打开扩展内置诗词阅读页",
);
assert.match(backgroundSource, /chrome\.storage\.session/, "阅读页签 ID 应只保存在当前浏览器会话");
assert.match(backgroundSource, /chrome\.tabs\.get\(tabId\)/, "入口应检查已登记的阅读页");
assert.match(backgroundSource, /chrome\.tabs\.update\(tabId, \{ active: true \}\)/, "入口应复用并激活阅读页");
assert.match(backgroundSource, /chrome\.windows\.update\(tab\.windowId, \{ focused: true \}\)/, "入口应聚焦阅读页所在窗口");
assert.match(backgroundSource, /reader-page-ready/, "浏览器恢复页签后应能重新登记阅读页");

const index = readJson("data/poems/index.json");
assert.equal(index.counts.total, 5334);
assert.equal(index.counts.preqin, 370);
assert.equal(index.counts.shijing, 305);
assert.equal(index.counts.chuci, 65);
assert.equal(index.counts.hanweiliuchao, 360);
assert.equal(index.counts.tang, 2000);
assert.equal(index.counts.song, 1704);
assert.equal(index.counts.songCi, 1200);
assert.equal(index.counts.songPoetry, 504);
assert.equal(index.counts.yuan, 300);
assert.equal(index.counts.ming, 300);
assert.equal(index.counts.qing, 300);
assert.equal(index.counts.reviewed, 938);
assert.equal(index.counts.pendingReview, 3334);
assert.equal(index.counts.aiDraft, 1062);
assert.equal(index.poems.length, 5334);

const indexIds = new Set(index.poems.map((poem) => poem.id));
const indexById = new Map(index.poems.map((poem) => [poem.id, poem]));
assert.equal(indexIds.size, 5334, "诗词索引 ID 必须唯一");
assert.deepEqual(
  [...new Set(index.poems.map((poem) => poem.period))],
  ["唐代", "宋代", "先秦", "汉魏六朝", "元代", "明代", "清代"],
  "诗词索引应覆盖先秦至清代的七个筛选时期",
);

const searchIndex = readJson("data/poems/search.json");
assert.equal(searchIndex.count, 5334, "全文搜索索引应覆盖全部诗词");
assert.equal(searchIndex.records.length, 5334);
const searchIds = new Set(searchIndex.records.map(([id]) => id));
assert.equal(searchIds.size, 5334, "全文搜索索引 ID 必须唯一");
for (const id of indexIds) assert.ok(searchIds.has(id), `全文搜索索引缺少诗词：${id}`);
assert.ok(
  searchIndex.records.some(([, text]) => text.includes("床前明月光")),
  "全文搜索索引应能命中原文诗句",
);
assert.ok(
  searchIndex.records.some(([, text]) => text.includes("明月几时有")),
  "全文搜索索引应能命中宋词原文",
);
assert.ok(
  searchIndex.records.some(([, text]) => text.includes("不识庐山真面目")),
  "全文搜索索引应能命中新补充的宋诗原文",
);
assert.ok(
  searchIndex.records.some(([, text]) => text.includes("我亦是行人")),
  "全文搜索索引应能命中经《全宋词》校核的新增词作",
);
assert.ok(
  searchIndex.records.some(([, text]) => text.includes("关关雎鸠")),
  "全文搜索索引应能命中《诗经》原文",
);
assert.ok(
  searchIndex.records.some(([, text]) => text.includes("路漫漫其修远兮")),
  "全文搜索索引应能命中《楚辞》原文",
);
assert.ok(
  searchIndex.records.some(([, text]) => text.includes("关关和鸣的雎鸠")),
  "全文搜索索引应能命中先秦白话译文",
);
for (const [period, phrase] of [
  ["汉魏六朝", "对酒当歌"],
  ["元代", "枯藤老树昏鸦"],
  ["明代", "粉骨碎身浑不怕"],
  ["清代", "山一程"],
]) {
  assert.ok(
    searchIndex.records.some(([, text]) => text.includes(period) && text.includes(phrase)),
    `全文搜索索引应能命中${period}诗词`,
  );
}

const preqinTranslationSource = readJson("data/sources/preqin-group-translations.json");
assert.equal(preqinTranslationSource.source, "Papersnake/gushiwen");
assert.equal(preqinTranslationSource.license, "CC0-1.0");
assert.deepEqual(
  Object.keys(preqinTranslationSource.groups),
  ["九歌", "九章", "七谏", "九怀", "九叹", "九思"],
  "楚辞组诗译文来源应完整",
);
const songCiSource = readJson("data/sources/song-ci-bibliography.json");
assert.equal(songCiSource.bibliography.title, "全宋词");
assert.equal(songCiSource.bibliography.compiler, "唐圭璋");
assert.equal(songCiSource.bibliography.isbn, "9787101017144");
assert.equal(
  songCiSource.textCorpus.commit,
  "b8594f81a89752241442f2ce267d6f66f96704ee",
);
assert.equal(songCiSource.selection.count, 200);
assert.equal(songCiSource.selection.requiresCorpusBodyMatch, true);
const songPoetrySelectionSource = readJson(
  "data/sources/song-poetry-selection.json",
);
assert.equal(songPoetrySelectionSource.bibliography.title, "宋诗选注");
assert.equal(songPoetrySelectionSource.bibliography.selectorAnnotator, "钱锺书");
assert.equal(songPoetrySelectionSource.bibliography.firstPublished, 1958);
assert.equal(songPoetrySelectionSource.bibliography.reportedPoets, 81);
assert.equal(songPoetrySelectionSource.bibliography.reportedPoems, 289);
assert.equal(songPoetrySelectionSource.bibliography.sourceRevisionId, 90739261);
assert.equal(songPoetrySelectionSource.bibliography.sourceLicense, "CC BY-SA 4.0");
assert.equal(songPoetrySelectionSource.selection.added, 4);
assert.equal(songPoetrySelectionSource.selection.alreadyPresent, 1);
assert.ok(
  ["现代注释", "现代译文", "评语", "版式"].every((item) =>
    songPoetrySelectionSource.usage.doesNotCopy.includes(item),
  ),
  "《宋诗选注》只能作为书目与点名篇目线索，不得复制现代评注或版式",
);
assert.deepEqual(
  songPoetrySelectionSource.usage.explicitExclusions.map(
    ({ author, title }) => `${author}《${title}》`,
  ),
  ["文天祥《正气歌》", "文天祥《过零丁洋》", "朱熹《观书有感》", "佚名《吴歌》"],
);

const authorData = readJson("data/authors.json");
assert.equal(authorData.counts.total, 928, "作者资料应覆盖诗库中的 928 位作者");
assert.equal(authorData.counts.complete, authorData.counts.total, "每位作者都应有小传或有限记载说明");
assert.equal(authorData.counts.indexOnly, 0, "不得遗留仅有索引占位文案的作者");
assert.ok(authorData.counts.sourced >= 800, "带来源或经核对的小传应覆盖至少 800 位作者");
assert.equal(
  authorData.counts.sourced + authorData.counts.limitedRecord,
  authorData.counts.total,
  "作者资料状态计数应与总数一致",
);
assert.equal(authorData.authors.length, authorData.counts.total);
const authorKeys = new Set(
  authorData.authors.map((author) => `${author.dynasty}:${author.name}`),
);
assert.equal(authorKeys.size, authorData.authors.length, "作者人物简介不得重复");
for (const poem of index.poems) {
  assert.ok(
    authorKeys.has(`${poem.dynasty}:${poem.author}`),
    `缺少${poem.dynasty}作者${poem.author}的人物简介`,
  );
}
for (const author of authorData.authors) {
  assert.ok(author.biography.length >= 8, `${author.name}的人物简介缺少基本说明`);
  assert.ok(author.works >= 1, `${author.name}缺少诗库作品数量`);
  assert.doesNotMatch(
    author.biography,
    /现有开放作者语料尚未提供|&(?:[a-z]+|#\d+);|——/,
    `${author.dynasty}·${author.name}仍含占位文案、网页转义或异常标点`,
  );
  assert.ok(
    ["sourced", "limited-record"].includes(author.profileStatus),
    `${author.dynasty}·${author.name}的人物资料状态无效`,
  );
  if (author.sourceLicense === "CC BY-SA 4.0") {
    assert.equal(author.attribution, "中文维基百科贡献者");
    assert.match(author.sourceUrl, /[?&]oldid=\d+$/, `${author.name}应保存维基百科固定版本链接`);
    assert.ok(author.sourceRevisionId, `${author.name}应保存维基百科版本号`);
    assert.equal(author.reuseMode, "adapted-excerpt");
    assert.ok(author.sourceChanges?.length, `${author.name}应说明对来源条目所作改动`);
  }
}

const authorByKey = new Map(
  authorData.authors.map((author) => [`${author.dynasty}:${author.name}`, author]),
);
assert.doesNotMatch(
  authorByKey.get("南北朝:李爽").biography,
  /运动员|曲棍球/,
  "南北朝李爽不得误配现代同名人物",
);
assert.match(authorByKey.get("清:周济").biography, /1781|清代词人/);
assert.match(authorByKey.get("明:王磐").biography, /1470|明代散曲/);
assert.match(authorByKey.get("宋:华岳").biography, /子西|翠微/);
assert.match(authorByKey.get("宋:萧立之").biography, /斯立|冰崖/);

const bodyIds = new Set();
const bodiesById = new Map();
const reviewCounts = new Map();
const chunkDirectory = path.join(projectRoot, "data/poems/chunks");
const chunkFiles = fs.readdirSync(chunkDirectory).filter((name) => name.endsWith(".json")).sort();
assert.equal(chunkFiles.length, 56, "应包含先秦至清代的全部 56 个分卷");
const expectedChunkCounts = new Map();
for (const poem of index.poems) {
  expectedChunkCounts.set(poem.chunk, (expectedChunkCounts.get(poem.chunk) ?? 0) + 1);
}
assert.deepEqual(
  new Set(chunkFiles.map((filename) => filename.replace(/\.json$/, ""))),
  new Set(expectedChunkCounts.keys()),
  "分卷文件应与索引中的 chunk 完全一致",
);

for (const filename of chunkFiles) {
  const records = readJson(`data/poems/chunks/${filename}`);
  const expectedLength = expectedChunkCounts.get(filename.replace(/\.json$/, ""));
  assert.equal(records.length, expectedLength, `${filename} 分卷数量不正确`);
  for (const record of records) {
    assert.ok(indexIds.has(record.id), `${filename} 含有索引外的诗词：${record.id}`);
    assert.ok(!bodyIds.has(record.id), `正文 ID 重复：${record.id}`);
    assert.ok(Array.isArray(record.lines) && record.lines.length > 0, `${record.id} 缺少原文`);
    assert.ok(Array.isArray(record.translation), `${record.id} 的译文格式错误`);
    const poem = indexById.get(record.id);
    assert.equal(
      poem.reviewStatus,
      record.translationMeta?.reviewStatus,
      `${record.id} 的索引校订状态应与正文一致`,
    );
    reviewCounts.set(
      poem.reviewStatus,
      (reviewCounts.get(poem.reviewStatus) ?? 0) + 1,
    );
    assert.ok(record.translation.length > 0, `${record.id} 缺少白话译文`);
    assert.ok(
      record.translation.every((paragraph) => typeof paragraph === "string" && paragraph.trim()),
      `${record.id} 含有空白译文段落`,
    );
    if (!["唐代", "宋代"].includes(poem.period)) {
      assert.equal(
        record.translationMeta?.reviewStatus,
        "pending-review",
        `${record.id} 的联网新增译文应标记为待校订`,
      );
      assert.notEqual(
        record.translationMeta?.source,
        "原典暂未配译",
        `${record.id} 仍使用缺失译文占位来源`,
      );
    }
    bodyIds.add(record.id);
    bodiesById.set(record.id, record);
  }
}

assert.equal(bodyIds.size, indexIds.size, "正文数量与索引数量不一致");
for (const id of indexIds) assert.ok(bodyIds.has(id), `缺少正文：${id}`);
assert.deepEqual(
  Object.fromEntries(reviewCounts),
  { reviewed: 938, "ai-draft": 1062, "pending-review": 3334 },
  "校订状态统计必须与默认精选和全库范围一致",
);

const additionalTang = index.poems.filter((poem) => /^additional-tang-\d/.test(poem.id));
const additionalSong = index.poems.filter((poem) => /^additional-song-\d/.test(poem.id));
const additionalSongCi = index.poems.filter((poem) =>
  poem.id.startsWith("additional-song-ci-"),
);
const selectedSongPoetry = index.poems.filter((poem) =>
  poem.id.startsWith("song-poetry-selection-"),
);
assert.equal(additionalTang.length, 1000, "唐诗补充卷应新增 1000 首");
assert.equal(additionalSong.length, 500, "宋诗补充卷应新增 500 首");
assert.equal(additionalSongCi.length, 200, "《全宋词》补充卷应新增 200 首");
assert.equal(selectedSongPoetry.length, 4, "《宋诗选注》点名篇目应新增 4 首");
assert.ok(
  additionalTang.every(
    (poem) =>
      poem.period === "唐代" &&
      poem.category === "唐诗" &&
      poem.tags.includes("唐诗"),
  ),
  "唐诗补充卷的时期、分类与标签应一致",
);
for (const [author, minimum] of [
  ["李白", 100],
  ["杜甫", 100],
  ["白居易", 80],
]) {
  assert.ok(
    additionalTang.filter((poem) => poem.author === author).length >= minimum,
    `唐诗名家扩展卷应重点补充${author}作品`,
  );
}
assert.ok(
  additionalSong.every(
    (poem) =>
      poem.period === "宋代" &&
      poem.category === "宋诗" &&
      poem.tags.includes("宋诗"),
  ),
  "宋诗补充卷的时期、分类与标签应一致",
);
assert.ok(
  additionalSongCi.every(
    (poem) =>
      poem.period === "宋代" &&
      poem.category === "宋词" &&
      poem.form.startsWith("宋词 · ") &&
      poem.tags.includes("宋词") &&
      poem.source.includes("唐圭璋编《全宋词》"),
  ),
  "宋词补充卷应保留《全宋词》校核来源及正确分类",
);
assert.ok(
  selectedSongPoetry.every(
    (poem) =>
      poem.period === "宋代" &&
      poem.category === "宋诗" &&
      poem.tags.includes("宋诗") &&
      poem.tags.includes("宋诗选注") &&
      poem.source.includes("《宋诗选注》书目参照"),
  ),
  "《宋诗选注》点名篇目应保留书目参照及正确分类",
);
assert.deepEqual(
  selectedSongPoetry.map((poem) => `${poem.author}《${poem.title}》`).sort(),
  [
    "华岳《田家十绝·其十》",
    "梅尧臣《汝坟贫女》",
    "梅尧臣《田家语》",
    "萧立之《第四桥》",
  ].sort(),
);
assert.equal(
  index.poems.filter((poem) => poem.author === "王安石" && poem.title === "夜直").length,
  1,
  "本地已有的王安石《夜直》不应重复收录",
);
for (const { author, title } of songPoetrySelectionSource.usage.explicitExclusions) {
  assert.ok(
    !selectedSongPoetry.some(
      (poem) => poem.author === author && poem.title === title,
    ),
    `来源页明确未选的${author}《${title}》不得进入本补充卷`,
  );
}
for (const [collection, title] of [
  [additionalTang, "黄鹤楼送孟浩然之广陵"],
  [additionalSong, "题西林壁"],
  [additionalSong, "泊船瓜洲"],
  [additionalSongCi, "临江仙·送钱穆父"],
  [additionalSongCi, "虞美人·听雨"],
]) {
  assert.ok(collection.some((poem) => poem.title === title), `补充卷应收录《${title}》`);
}
assert.ok(
  !["长信怨", "长信秋词五首"].every((title) =>
    additionalTang.some((poem) => poem.title === title),
  ),
  "同一组诗的一字异文版本不应重复收录",
);

const proseOrCiTitlePattern =
  /(记|传|书|论|说|表|疏|策|问|序|令|诏|檄|状|案|录|纪|志|碑|铭|文|喻|世家|列传|本纪|墓志铭|家训|赋)$|^(?:望江南|忆江南|梦江南|菩萨蛮|浣溪沙|临江仙|虞美人|更漏子)·/;
for (const poem of [...additionalTang, ...additionalSong]) {
  assert.doesNotMatch(poem.title, proseOrCiTitlePattern, `补充卷混入散文、辞赋或词作：${poem.title}`);
  const body = bodiesById.get(poem.id);
  assert.equal(
    body.translationMeta?.reviewStatus,
    "pending-review",
    `${poem.id} 的开放译文应标记为待校订`,
  );
  assert.match(
    body.translationMeta?.source ?? "",
    /yht050511\/gushiwen/,
    `${poem.id} 应保留译文来源`,
  );
}
for (const poem of additionalSongCi) {
  const body = bodiesById.get(poem.id);
  assert.equal(
    body.translationMeta?.reviewStatus,
    "pending-review",
    `${poem.id} 的白话译文应标记为待校订`,
  );
  assert.match(
    body.translationMeta?.source ?? "",
    /yht050511\/gushiwen/,
    `${poem.id} 应保留译文来源`,
  );
}
for (const poem of selectedSongPoetry) {
  const body = bodiesById.get(poem.id);
  assert.equal(
    body.translationMeta?.reviewStatus,
    "pending-review",
    `${poem.id} 的项目整理译文应标记为待校订`,
  );
  assert.equal(
    body.translationMeta?.source,
    "本项目依据公版原文重新整理",
    `${poem.id} 不应复用《宋诗选注》的现代译文`,
  );
}
assert.ok(
  bodiesById
    .get("song-poetry-selection-0004")
    .lines[0]
    .startsWith("自折孤樽"),
  "《第四桥》应保留传本“自折孤樽”的用字",
);
for (const [title, opening] of [
  ["州桥", "州桥南北是天街"],
  ["宿芥塘佛祠", "青青麰麦欲抽芒"],
  ["入塞", "妾在靖康初"],
]) {
  const poem = additionalSong.find((item) => item.title === title);
  assert.ok(poem, `宋诗补充卷应收录《${title}》`);
  assert.ok(
    bodiesById.get(poem.id).lines[0].startsWith(opening),
    `《${title}》正文前不应混入题下注语`,
  );
}

const normalizedBodyOwners = new Map();
for (const [id, body] of bodiesById) {
  const normalized = body.lines.join("").replace(/[^\p{Script=Han}]/gu, "");
  const owners = normalizedBodyOwners.get(normalized) ?? [];
  owners.push(id);
  normalizedBodyOwners.set(normalized, owners);
}
for (const poem of [
  ...additionalTang,
  ...additionalSong,
  ...additionalSongCi,
  ...selectedSongPoetry,
]) {
  const normalized = bodiesById
    .get(poem.id)
    .lines.join("")
    .replace(/[^\p{Script=Han}]/gu, "");
  assert.deepEqual(
    normalizedBodyOwners.get(normalized),
    [poem.id],
    `${poem.id} 不应与原诗库或其他补充篇目重复`,
  );
}

const shijingEntry = index.poems.find(
  (poem) => poem.category === "先秦" && poem.title === "关雎" && poem.tags.includes("诗经"),
);
assert.ok(shijingEntry, "先秦分类应收录《诗经·关雎》");
assert.equal(shijingEntry.author, "佚名");
assert.match(
  bodiesById.get(shijingEntry.id).translation.join(""),
  /关关和鸣的雎鸠/,
  "《关雎》应包含联网补全的白话译文",
);
const chuciEntry = index.poems.find(
  (poem) => poem.category === "先秦" && poem.title === "离骚" && poem.tags.includes("楚辞"),
);
assert.ok(chuciEntry, "先秦分类应收录《楚辞·离骚》");
assert.equal(chuciEntry.author, "屈原");
assert.match(
  bodiesById.get(chuciEntry.id).translation.join(""),
  /我是古帝高阳氏的子孙/,
  "《离骚》应包含联网补全的白话译文",
);
for (const [period, title] of [
  ["汉魏六朝", "短歌行"],
  ["元代", "天净沙·秋思"],
  ["明代", "石灰吟"],
  ["清代", "长相思·山一程"],
]) {
  const entry = index.poems.find((poem) => poem.period === period && poem.title === title);
  assert.ok(entry, `${period}分类应收录《${title}》`);
  assert.ok(bodiesById.get(entry.id).translation.length > 0, `《${title}》应包含白话译文`);
}
for (const title of ["周亚夫军细柳", "塞翁失马", "于园", "弈喻"]) {
  assert.ok(
    !index.poems.some((poem) => poem.title === title && poem.id.startsWith("period-")),
    `历代诗词补充不应混入文言散文《${title}》`,
  );
}

const newTabHtml = fs.readFileSync(path.join(projectRoot, "newtab.html"), "utf8");
assert.doesNotMatch(newTabHtml, /https?:\/\//, "新标签页不应依赖远程资源");
assert.match(newTabHtml, /id="review-mode-select"/, "筛选区应提供校订范围选择");
assert.match(
  newTabHtml,
  /<option value="deep" selected>深度精读（100）<\/option>/,
  "阅读范围应默认选择 100 篇深度精读",
);
assert.match(newTabHtml, /id="library-panel"/, "完整筛选应收进次级诗库抽屉");
assert.match(newTabHtml, /id="library-summary"/, "诗库抽屉应显示当前范围摘要");
assert.match(
  newTabHtml,
  /<option value="reviewed">已校精选（938）<\/option>/,
  "用户应能从精读层进入 938 篇已校精选",
);
assert.match(
  newTabHtml,
  /<option value="all">全库广览（5334）<\/option>/,
  "用户应能主动进入完整诗库",
);
assert.match(newTabHtml, /id="period-select"/, "筛选区应提供朝代下拉");
assert.match(newTabHtml, /<option value="">全部朝代<\/option>/, "朝代下拉应默认选择全部");
assert.match(newTabHtml, /data-category="收藏"/, "顶部应提供收藏浏览入口");
assert.match(newTabHtml, /id="result-trigger"/, "“篇可赏”数量应提供列表入口");
assert.match(newTabHtml, /id="poem-list-dialog"/, "应提供当前筛选结果的诗词列表弹层");
assert.match(newTabHtml, /id="search-trigger"/, "顶部应提供全库诗词搜索入口");
assert.match(newTabHtml, /id="daily-trigger"/, "顶部应提供今日诗签入口");
assert.match(newTabHtml, /id="daily-trigger-mark"/, "今日入口应能切换为到期复习状态");
assert.match(newTabHtml, /id="learning-dialog"/, "精读作品应提供逐句回想弹层");
assert.match(newTabHtml, /id="learning-answer"/, "逐句回想应要求用户先写下答案");
assert.match(
  newTabHtml,
  /data-learning-rating="again"[\s\S]*data-learning-rating="hard"[\s\S]*data-learning-rating="good"/,
  "回想结束后应提供三档真实感受反馈",
);
assert.match(newTabHtml, /id="search-dialog"/, "应提供全库诗词搜索弹层");
assert.match(newTabHtml, /id="global-search-input"/, "搜索弹层应提供关键词输入框");
assert.match(newTabHtml, /当前范围寻诗/, "搜索弹层应明确继承当前校订范围");
assert.match(newTabHtml, /id="author-dialog"/, "应提供诗人、词人人物简介弹层");
assert.match(newTabHtml, /id="author-works-action"/, "人物简介应提供作者作品入口");
assert.match(newTabHtml, /id="theme-trigger"/, "顶部应提供皮肤切换入口");
assert.match(newTabHtml, /id="theme-dialog"/, "应提供皮肤选择面板");
assert.match(newTabHtml, /data-script="simplified"/, "新标签页应默认使用简体中文");
assert.doesNotMatch(newTabHtml, /id="script-trigger"/, "简繁切换不应继续占用顶部导航");
assert.match(newTabHtml, /data-script-option="simplified"/, "外观面板应提供简体中文选项");
assert.match(newTabHtml, /data-script-option="traditional"/, "外观面板应提供繁体中文选项");
assert.ok(
  newTabHtml.indexOf("data-script-option") > newTabHtml.indexOf('id="theme-dialog"'),
  "简繁选项应融合到外观面板中",
);
assert.match(newTabHtml, /id="auto-next-select"/, "外观设置应提供自动切换间隔");
assert.ok(
  newTabHtml.indexOf('id="auto-next-field"') > newTabHtml.indexOf('id="theme-dialog"'),
  "自动下一首应从主阅读操作区移入外观设置",
);
assert.ok(
  !newTabHtml
    .slice(newTabHtml.indexOf('<div class="actions">'), newTabHtml.indexOf("</aside>"))
    .includes('id="auto-next-field"'),
  "自动下一首不应继续占用主阅读操作区",
);
assert.match(newTabHtml, /id="auto-next-progress"/, "开启自动下一首后应显示进度条");
assert.match(newTabHtml, /id="previous-action"/, "阅读操作区应提供上一篇入口");
assert.match(newTabHtml, /id="share-action"/, "阅读操作区应提供分享诗笺入口");
assert.match(newTabHtml, /id="share-dialog"/, "应提供诗词分享图片预览面板");
assert.match(newTabHtml, /id="share-canvas"/, "分享面板应提供高清图片画布");
assert.match(newTabHtml, /id="share-copy-action"/, "分享面板应支持复制图片");
assert.match(newTabHtml, /id="share-download-action"/, "分享面板应支持分享或下载图片");
assert.match(newTabHtml, /D 今日诗签/, "页面应说明今日诗签快捷键");
assert.match(
  newTabHtml,
  /快捷键：D 今日诗签，S 搜索，T 外观，左方向键上一篇/,
  "页面应向键盘用户说明上一篇快捷键",
);
assert.match(
  newTabHtml,
  /id="auto-next-progress-track"[\s\S]*role="progressbar"/,
  "自动下一首进度条应提供无障碍进度语义",
);
assert.match(newTabHtml, /id="auto-next-remaining"/, "进度条应显示剩余时间");
assert.match(
  newTabHtml,
  /<option value="0" selected>关闭（默认）<\/option>/,
  "自动下一首应默认关闭",
);
for (const [value, label] of [
  ["0", "关闭（默认）"],
  ["30", "30 秒"],
  ["60", "1 分钟"],
  ["120", "2 分钟"],
  ["300", "5 分钟"],
  ["600", "10 分钟"],
  ["1200", "20 分钟"],
  ["1800", "30 分钟"],
  ["3600", "60 分钟"],
]) {
  assert.match(
    newTabHtml,
    new RegExp(`<option value="${value}"(?: selected)?>${label}</option>`),
    `自动下一首缺少“${label}”选项`,
  );
}
assert.match(
  newTabHtml,
  /<script src="vendor\/opencc-js\/full\.js"><\/script>\s*<script type="module" src="app\.js"><\/script>/,
  "离线繁简转换库应在应用脚本前加载",
);
assert.equal(
  (newTabHtml.match(/data-theme-option=/g) ?? []).length,
  6,
  "皮肤面板应提供六种可替换风格",
);
assert.equal(
  (newTabHtml.match(/id="feedback-trigger"/g) ?? []).length,
  1,
  "页面应只提供一个知识纠错入口",
);
assert.match(
  newTabHtml,
  /class="poem-meta-row"[\s\S]*id="feedback-trigger"/,
  "知识纠错入口应位于正文下方的资料信息行",
);
assert.match(
  newTabHtml,
  /id="feedback-trigger"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/,
  "知识纠错入口应安全地在新标签页打开",
);
assert.ok(
  newTabHtml.indexOf('id="feedback-trigger"') > newTabHtml.indexOf('id="reading-scroll"'),
  "知识纠错入口不应继续占用顶部导航位置",
);

const appSource = fs.readFileSync(path.join(projectRoot, "app.js"), "utf8");
assert.match(appSource, /state\.category === "收藏"/, "收藏入口应筛选本地收藏 ID");
assert.match(appSource, /state\.period/, "朝代下拉应通过独立时期状态筛选");
assert.match(appSource, /reviewMode: "deep"/, "应用状态应默认使用深度精读范围");
assert.match(appSource, /function matchesReviewMode\(poem\)/, "随机、筛选和搜索应共用校订范围规则");
assert.match(
  appSource,
  /state\.reviewMode === "deep"[\s\S]*poem\.depthStatus === "deep"/,
  "默认范围只能展示已建立精读稿的作品",
);
assert.match(appSource, /function reviewModeLabel\(/, "界面应统一展示三层诗库名称");
assert.match(
  appSource,
  /const REVIEW_MODE_KEY = "poem-review-mode-v2"/,
  "深度默认范围应使用新版独立存储键完成升级迁移",
);
assert.match(appSource, /function loadReviewModePreference\(\)/, "重新打开页面时应恢复校订范围偏好");
assert.match(appSource, /matchesReviewMode\(item\.poem\)/, "全文搜索应遵循当前校订范围");
assert.match(appSource, /PERIOD_ORDER/, "朝代选项应保持历史顺序");
assert.match(appSource, /诗笺尚空/, "收藏为空时应提供明确提示");
assert.match(appSource, /function openPoemList\(\)/, "应支持打开当前筛选结果列表");
assert.match(appSource, /showPoem\(poem, options\.message \|\|/, "点击列表项应直接进入诗词正文");
assert.match(appSource, /function openGlobalSearch\(\)/, "应支持打开全库诗词搜索");
assert.match(appSource, /function renderGlobalSearch\(\)/, "应支持渲染全库搜索结果");
assert.match(appSource, /fetch\(`data\/poems\/search\.json/, "全文索引必须从扩展包本地加载");
assert.match(appSource, /function openAuthorDialog\(poem\)/, "点击作者应支持打开人物简介");
assert.match(appSource, /function showActiveAuthorWorks\(\)/, "人物简介应可进入作者作品筛选");
assert.match(appSource, /fetch\(`data\/authors\.json/, "作者资料必须从扩展包本地加载");
assert.match(appSource, /pending-review/, "联网新增译文应在界面中明确显示“待校订”");
assert.match(appSource, /const THEME_KEY = "poem-theme-v1"/, "皮肤选择应使用独立的本地存储键");
assert.match(appSource, /document\.documentElement\.dataset\.theme/, "皮肤选择应应用到页面根元素");
assert.match(appSource, /function loadTheme\(\)/, "重新打开页面时应恢复已选皮肤");
assert.match(appSource, /const FONT_KEY = "poem-font-v1"/, "字体选择应使用独立的本地存储键");
assert.match(appSource, /font: "default"/, "默认字体应沿用当前字体组合");
assert.match(appSource, /document\.documentElement\.dataset\.font/, "字体选择应应用到页面根元素");
assert.match(appSource, /function loadFont\(\)/, "重新打开页面时应恢复已选字体");
assert.match(
  appSource,
  /FONTS\.has\(fontId\) \? fontId : "default"/,
  "旧版本若保存了已移除字体，升级后应安全回退到默认字体",
);
assert.match(newTabHtml, /data-font-option="default"/, "外观面板应提供当前字体作为默认选项");
assert.equal(
  (newTabHtml.match(/data-font-option=/g) ?? []).length,
  6,
  "外观面板应提供六种字体选择",
);
assert.match(newTabHtml, /data-font-option="xingshu"/, "外观面板应提供免费行书选项");
assert.match(appSource, /\["xingshu", \{ name: "行书逸韵" \}\]/, "行书选项应接入字体状态");
assert.doesNotMatch(newTabHtml, /data-font-option="caoshu"|草书飞扬/, "外观面板不应保留草书选项");
assert.doesNotMatch(appSource, /caoshu|草书飞扬/, "字体状态不应保留已移除的草书映射");
assert.match(
  fs.readFileSync(path.join(projectRoot, "extension.css"), "utf8"),
  /assets\/fonts\/ZhiMangXing-Regular\.ttf/,
  "行书字体应从扩展包本地加载",
);
assert.equal(
  fs.existsSync(path.join(projectRoot, "assets/fonts/LiuJianMaoCao-Regular.ttf")),
  false,
  "已移除的草书字体文件不应继续占用扩展包",
);
assert.equal(
  fs.existsSync(path.join(projectRoot, "assets/fonts/LiuJianMaoCao-OFL.txt")),
  false,
  "已移除字体的许可文件不应继续随包分发",
);
assert.doesNotMatch(
  fs.readFileSync(path.join(projectRoot, "extension.css"), "utf8"),
  /Liu Jian Mao Cao|LiuJianMaoCao|data-font="caoshu"/,
  "样式中不应残留草书字体声明",
);
assert.match(
  fs.readFileSync(path.join(projectRoot, "scripts/package-extension.mjs"), "utf8"),
  /扩展包仍包含已移除资源/,
  "发布流程应阻止草书字体资源重新混入扩展包",
);
assert.match(appSource, /const SCRIPT_KEY = "poem-script-v1"/, "简繁选择应使用独立的本地存储键");
assert.match(appSource, /script: "simplified"/, "应用状态应默认使用简体中文");
assert.match(appSource, /function updateScriptOptions\(\)/, "外观面板应同步简繁选中状态");
assert.match(appSource, /function loadScriptPreference\(\)/, "重新打开页面时应恢复简繁偏好");
assert.match(
  appSource,
  /const AUTO_NEXT_KEY = "poem-auto-next-seconds-v1"/,
  "自动下一首应使用独立的本地存储键",
);
assert.match(
  appSource,
  /const DEFAULT_AUTO_NEXT_SECONDS = 0/,
  "自动下一首默认状态应为关闭",
);
assert.match(appSource, /function loadAutoNextPreference\(\)/, "重新打开页面时应恢复自动切换间隔");
assert.match(appSource, /function scheduleAutoNext\(\)/, "自动下一首应统一调度定时器");
assert.match(appSource, /const MAX_READING_HISTORY = 30/, "阅读历史应限制内存中的最大数量");
assert.match(
  appSource,
  /const READING_STATS_KEY = "poem-reading-stats-v1"/,
  "阅读统计应使用独立的本地存储键",
);
assert.match(appSource, /function dailyPoemForToday\(\)/, "应按本地日期生成今日诗签");
assert.match(
  appSource,
  /poem\.depthStatus === "deep"/,
  "今日诗签必须限定在深度精读层",
);
assert.match(appSource, /function openDailyPoem\(\)/, "应支持直接打开今日诗签");
assert.match(appSource, /function loadReadingStats\(\)/, "应恢复本地阅读统计");
assert.match(appSource, /recordReading\(poem\.id\)/, "成功展开诗词后应记录阅读");
assert.match(appSource, /readingStreak\(state\.readingStats/, "状态区应显示连续阅读天数");
assert.match(
  appSource,
  /const LEARNING_PROGRESS_KEY = "poem-learning-progress-v1"/,
  "学习进度应使用独立的本地存储键",
);
assert.match(appSource, /function createLearningCard\(poem\)/, "精读页应提供学习入口与复习状态");
assert.match(appSource, /function openLearningPractice\(poem\)/, "应支持进入不看原文的逐句回想");
assert.match(appSource, /function checkLearningAnswer\(\)/, "逐句回想应先核对用户输入");
assert.match(appSource, /function rateLearningPractice\(rating\)/, "完成回想后应按反馈安排复习");
assert.match(
  appSource,
  /完成三次按期复习且全对，才会进入“已掌握”/,
  "练习结束页应向用户解释严格的掌握门槛",
);
assert.match(appSource, /function loadLearningProgress\(\)/, "重新打开页面时应恢复本地学习进度");
assert.match(appSource, /function dueLearningPoems\(\)/, "今日入口应优先处理到期复习");
assert.match(
  appSource,
  /if \(opened && dueCount && state\.current\) openLearningPractice\(state\.current\)/,
  "点击到期复习入口后应直接进入主动回想",
);
assert.match(
  appSource,
  /dueCount \? `复习 \$\{dueCount\}` : "今日"/,
  "有到期任务时今日入口应明确显示待复习数量",
);
assert.match(
  appSource,
  /new Set\(state\.recentPoemIds\)/,
  "随机漫游应优先避开最近读过的篇目",
);
assert.match(
  appSource,
  /function rememberRecentlyRead\(poemId\)/,
  "随机去重队列应独立于上一篇历史",
);
assert.match(appSource, /event\.key\.toLowerCase\(\) === "d"/, "D 键应打开今日诗签");
assert.match(appSource, /function rememberPreviousPoem\(/, "成功展开新诗后应记录上一篇");
assert.match(appSource, /async function showPreviousPoem\(\)/, "应支持返回上一篇诗词");
assert.match(
  appSource,
  /options\.recordPrevious !== false/,
  "返回历史时不得把当前诗再次写入历史栈",
);
assert.match(appSource, /event\.code === "ArrowLeft"/, "左方向键应返回上一篇");
assert.match(appSource, /function formatRemainingTime\(seconds\)/, "应格式化自动切换剩余时间");
assert.match(appSource, /function updateAutoNextProgress\(\)/, "应持续更新自动下一首进度");
assert.match(
  appSource,
  /state\.autoNextTimer = setTimeout\(/,
  "自动下一首应按所选间隔启动一次性计时",
);
assert.match(
  appSource,
  /state\.autoNextProgressTimer = setInterval\(updateAutoNextProgress, 250\)/,
  "自动下一首应使用同一截止时间刷新进度条",
);
assert.match(
  appSource,
  /document\.addEventListener\("visibilitychange"/,
  "页面不可见时应暂停自动下一首",
);
assert.match(
  appSource,
  /elements\.autoNextSelect\.addEventListener\("change"/,
  "用户应能即时切换自动下一首间隔",
);
assert.match(
  appSource,
  /TO_SIMPLIFIED\(String\(value\)\)/,
  "搜索关键词应先转换为简体以兼容繁体输入",
);
assert.match(
  appSource,
  /return displayText\(sections\.join\("\\n\\n"\)\)/,
  "复制内容应跟随当前简繁显示偏好",
);
for (const copiedField of ["资料来源", "原文：", "译文：", "译文状态："]) {
  assert.ok(appSource.includes(copiedField), `复制内容应包含${copiedField}`);
}
assert.match(appSource, /AI 辅助译文 · 待人工校订/, "AI 草稿必须在界面中明确标注");
assert.match(appSource, /reader-page-ready/, "阅读页加载后应向后台登记以支持入口复用");
assert.match(
  appSource,
  /https:\/\/github\.com\/Kua-Fu\/shiyi-yike\/issues\/new/,
  "知识纠错应指向当前 GitHub 项目的新建 Issue 页面",
);
assert.match(appSource, /url\.searchParams\.set\("title"/, "纠错链接应预填 Issue 标题");
assert.match(appSource, /url\.searchParams\.set\("body"/, "纠错链接应预填 Issue 内容");
for (const contextField of ["作品 ID", "原文来源", "译文来源", "扩展数据版本"]) {
  assert.ok(appSource.includes(contextField), `纠错 Issue 应包含${contextField}`);
}
assert.match(appSource, /GitHub Issue 提交后为公开内容/, "纠错模板应提示 Issue 为公开内容");
assert.match(appSource, /function createPoemMeta\(text\)/, "正文资料信息行应承载纠错入口");
assert.match(appSource, /function createDeepReadingGuide\(poem\)/, "深度作品应提供固定结构的精读导览");
assert.match(
  appSource,
  /makeElement\("button", "verse verse-trigger"\)/,
  "深度作品应支持点击诗句逐句展开",
);
assert.match(appSource, /data\/deep-readings\.json/, "精读数据必须从扩展包本地加载");
assert.doesNotMatch(appSource, /fetch\([^)]*github\.com/, "扩展不应自动向 GitHub 发送请求");
assert.match(appSource, /function renderAuthorSource\(profile\)/, "人物小传应渲染可核对的来源");
assert.match(appSource, /sourceLink\.rel = "noopener noreferrer"/, "人物资料外链应隔离来源页面");

const licenseAudit = readJson("data/sources/content-license-audit.json");
assert.equal(licenseAudit.releaseVersion, manifest.version);
assert.deepEqual(licenseAudit.reviewCounts, {
  reviewed: 938,
  pendingReview: 3334,
  aiDraft: 1062,
  total: 5334,
});
assert.equal(licenseAudit.releasePolicy.defaultReviewMode, "deep");
assert.equal(licenseAudit.releasePolicy.deepReadingCount, 100);
assert.equal(licenseAudit.releasePolicy.deepReadingUsesOriginalEditorialText, true);
assert.equal(licenseAudit.releasePolicy.fullLibraryRequiresExplicitOptIn, true);
assert.equal(licenseAudit.releasePolicy.copyIncludesSourceAndReviewStatus, true);
assert.equal(
  licenseAudit.sources.find((source) => source.id === "yht050511-gushiwen")
    ?.upstreamRightsVerified,
  false,
  "授权审计不得把上游仓库许可误写成现代译文权利担保",
);
for (const auditFile of ["CONTENT_LICENSE_AUDIT.md", "THIRD_PARTY_NOTICES.md"]) {
  assert.ok(fs.existsSync(path.join(projectRoot, auditFile)), `发布包应保留授权说明：${auditFile}`);
}

const packageData = readJson("package.json");
assert.equal(packageData.version, manifest.version, "npm 包版本与扩展版本必须一致");
for (const script of [
  "build:review",
  "build:store-assets",
  "build:web",
  "package:extension",
  "release:prepare",
]) {
  assert.ok(packageData.scripts[script], `缺少发布脚本：${script}`);
}
for (const releaseScript of [
  "scripts/build-review-metadata.mjs",
  "scripts/build-store-assets.mjs",
  "scripts/build-web.mjs",
  "scripts/package-extension.mjs",
]) {
  assert.ok(fs.existsSync(path.join(projectRoot, releaseScript)), `缺少发布流程文件：${releaseScript}`);
}
const pagesEntryHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
assert.match(
  pagesEntryHtml,
  /http-equiv="refresh" content="0; url=newtab\.html"/,
  "GitHub Pages 域名根路径应自动进入扩展共用阅读页",
);
assert.match(
  pagesEntryHtml,
  /new URL\("newtab\.html", window\.location\.href\)/,
  "GitHub Pages 根入口应兼容默认项目路径与自定义域名",
);

const extensionStyles = fs.readFileSync(path.join(projectRoot, "extension.css"), "utf8");
assert.match(extensionStyles, /height <= 820px/, "应适配商店截图常用的 1280×800 视口");
assert.match(
  extensionStyles,
  /height <= 680px[\s\S]*width > 650px[\s\S]*width <= 1120px/,
  "应为 800×600 等低高度窗口提供紧凑布局",
);
assert.match(extensionStyles, /\.secondary-actions/, "上一篇与复制操作应共享紧凑的次级操作区");
assert.match(extensionStyles, /\.script-option/, "外观面板应提供简繁选项样式");
assert.match(extensionStyles, /\.daily-trigger/, "应提供今日诗签控件样式");
assert.match(extensionStyles, /\.auto-next-field/, "应提供自动下一首控件样式");
assert.match(extensionStyles, /\.auto-next-progress-track/, "应提供自动下一首进度条样式");
assert.match(extensionStyles, /\.library-panel/, "完整筛选应提供次级诗库抽屉样式");
assert.match(extensionStyles, /\.verse-trigger/, "逐句点注应提供可交互诗句样式");
assert.match(extensionStyles, /\.deep-reading-guide/, "应提供精读导览样式");
assert.match(extensionStyles, /\.learning-card/, "精读页应提供学习状态卡片样式");
assert.match(extensionStyles, /\.learning-dialog/, "逐句回想应提供专用弹层样式");
assert.match(extensionStyles, /\.learning-ratings/, "练习结束页应提供自评选项样式");
assert.match(extensionStyles, /font-variant-numeric: tabular-nums/, "剩余时间数字宽度应保持稳定");
for (const theme of ["xuan", "yuebai", "qingci", "taojian", "zhuying", "songyan"]) {
  assert.match(
    extensionStyles,
    new RegExp(`html\\[data-theme="${theme}"\\]`),
    `缺少 ${theme} 皮肤样式`,
  );
}

const toTraditional = OpenCC.Converter({ from: "cn", to: "tw" });
const toSimplified = OpenCC.Converter({ from: "tw", to: "cn" });
assert.equal(toTraditional("明月几时有，把酒问青天"), "明月幾時有，把酒問青天");
assert.equal(toSimplified("明月幾時有，把酒問青天"), "明月几时有，把酒问青天");

console.log(
  `✓ Manifest V3、入口复用、100 篇深度精读、全文搜索、${authorData.counts.total} 位作者简介及 5334 篇诗词数据均通过校验`,
);
