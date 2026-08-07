import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const build = spawnSync(process.execPath, ["scripts/build-web.mjs"], {
  cwd: projectRoot,
  encoding: "utf8",
});

assert.equal(build.status, 0, build.stderr || build.stdout);

const siteRoot = path.join(projectRoot, "dist", "site");
const sourceLanding = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const sourceReader = fs.readFileSync(path.join(projectRoot, "newtab.html"), "utf8");
const sourceApp = fs.readFileSync(path.join(projectRoot, "app.js"), "utf8");
const sourceConfig = fs.readFileSync(path.join(projectRoot, "reader-config.js"), "utf8");
const sourceRouting = fs.readFileSync(path.join(projectRoot, "reader-routing.js"), "utf8");
const deploymentWorkflow = fs.readFileSync(
  path.join(projectRoot, ".github/workflows/deploy-pages.yml"),
  "utf8",
);
const deployedLanding = fs.readFileSync(path.join(siteRoot, "index.html"), "utf8");
const deployedReader = fs.readFileSync(path.join(siteRoot, "newtab.html"), "utf8");
assert.equal(deployedLanding, sourceLanding, "网页版首页必须发布独立获客页");
assert.equal(deployedReader, sourceReader, "在线体验页必须与扩展阅读页完全一致");
assert.match(
  deployedLanding,
  /从读懂一句，到记住一首/,
  "官网首屏应直接表达从精读到记忆的核心价值",
);
assert.match(
  deployedLanding,
  /href="newtab\.html\?from=hero"/,
  "官网首屏应提供零门槛在线体验入口",
);
assert.match(
  deployedLanding,
  /chromewebstore\.google\.com\/detail\/[^"]+\/lkkinajncnbimchpnkfkgmncpbiamgpm/,
  "官网安装入口应直达官方 Chrome 商店详情页",
);
assert.match(deployedReader, /id="web-install-prompt"[^>]+hidden/, "在线体验应内置延迟出现的扩展安装邀请");
assert.match(sourceConfig, /webInstallDismissed: "web-install-dismissed-v1"/, "安装邀请关闭状态应可持久保存");
assert.match(
  sourceApp,
  /function canOfferWebInstall\(\)[\s\S]+WEB_INSTALL_BLOCKING_MEDIA[\s\S]+matchMedia/,
  "安装邀请必须在脚本层拦截窄屏和触屏设备",
);
const originalRenderer = sourceApp.match(
  /function createOriginal\(poem\) \{([\s\S]+?)\n\}\n\nfunction createDeepReadingGuide/,
);
assert.ok(originalRenderer, "应能定位逐句精读渲染逻辑");
assert.doesNotMatch(
  originalRenderer[1],
  /revealWebInstallPrompt\(/,
  "展开第一句只服务精读引导，不应立即打断并索取安装",
);
const learningCompletion = sourceApp.match(
  /function finishLearningPractice\(\) \{([\s\S]+?)\n\}\n\nfunction advanceLearningPractice/,
);
assert.ok(learningCompletion, "应能定位逐句回想完成逻辑");
assert.match(
  learningCompletion[1],
  /revealWebInstallPrompt\(\)/,
  "完成回想练习后仍应保留桌面安装邀请",
);
const puzzleCompletion = sourceApp.match(
  /function finishPuzzleGame\(\) \{([\s\S]+?)\n\}\n\nfunction advancePuzzleGame/,
);
assert.ok(puzzleCompletion, "应能定位诗句拼图完成逻辑");
assert.match(
  puzzleCompletion[1],
  /revealWebInstallPrompt\(\)/,
  "完成诗句拼图后仍应保留桌面安装邀请",
);
assert.match(sourceConfig, /POEM_LIST_PAGE_SIZE = 120/, "全库列表应设置稳定的分批大小");
assert.match(sourceApp, /new Worker\(workerUrl, \{ type: "module"/, "在线全文搜索应在 Worker 中运行");
assert.match(sourceReader, /id="author-input"[^>]+role="combobox"/, "在线诗库应提供可搜索作者选择");
assert.match(sourceRouting, /function requestedPoemId\(/, "在线阅读器应支持作品深链接");
assert.match(
  sourceApp,
  /elements\.libraryPanel\.addEventListener\("toggle"[\s\S]+ensureFullLibrary\(\)/,
  "在线体验不应在首屏后自动请求完整诗库",
);
assert.match(deployedLanding, /rel="canonical" href="https:\/\/poetries\.cn\/"/, "官网应声明规范网址");
assert.match(deployedLanding, /property="og:title"/, "官网应提供社交分享摘要");
assert.match(deployedLanding, /social-card-1400x560\.png/, "社交分享应使用兼容性更稳妥的 PNG 主视觉");
assert.match(deployedLanding, /"@type": "SoftwareApplication"/, "官网应提供软件结构化数据");
assert.match(deployedLanding, /href="poems\/">浏览 100 篇精读目录/, "官网应提供静态精读目录入口");
assert.match(deployedLanding, /href="authors\/">诗人</, "官网应直达可索引的诗人内容目录");
assert.match(deployedLanding, /href="topics\/">主题</, "官网应直达可索引的主题内容目录");
assert.match(deployedLanding, /href="content-policy\/">内容方法</, "官网应公开内容校订方法与边界");
assert.doesNotMatch(deployedLanding, /href="\/"/, "官网内链应兼容 GitHub Pages 项目子路径");

// 手机端依赖安全区视口、覆盖式筛选和不小于 44px 的次级操作区，避免后续样式整理时退回拥挤布局。
const responsiveCss = fs.readFileSync(path.join(projectRoot, "extension.css"), "utf8");
assert.match(sourceReader, /viewport-fit=cover/, "手机端应延伸到刘海屏安全区");
assert.match(
  sourceReader,
  /id="search-trigger"[^>]+aria-label="搜索诗词"/,
  "图标化后的手机搜索入口必须保留无障碍名称",
);
assert.match(
  responsiveCss,
  /@media \(width <= 650px\)[\s\S]+\.library-panel > \.filter-panel[\s\S]+position: absolute;/,
  "手机诗库筛选应覆盖正文，不能持续挤压阅读区",
);
assert.match(
  responsiveCss,
  /\.secondary-actions \.share-action[\s\S]+min-height: 44px;/,
  "手机端次级操作必须保留足够的触控高度",
);
assert.match(
  responsiveCss,
  /@media \(width <= 650px\)[\s\S]+\.onboarding-guide \{[\s\S]+bottom: calc\(126px \+ max\(12px, env\(safe-area-inset-bottom\)\)\);/,
  "手机首访引导必须让出底部操作坞和安全区",
);
assert.match(
  responsiveCss,
  /@media \(width <= 650px\), \(hover: none\) and \(pointer: coarse\) \{\s+\.web-install-prompt \{\s+display: none;/,
  "移动设备应在样式层隐藏无效的桌面扩展安装入口",
);
assert.match(
  sourceReader,
  /id="favorite-label-short"[^>]*>收藏</,
  "窄屏收藏按钮应提供不会折行的短标签",
);
assert.match(
  sourceReader,
  /class="previous-label-short">上一首</,
  "窄屏上一篇按钮应完整显示“上一首”",
);
assert.match(
  sourceReader,
  /id="puzzle-answer"[^>]+aria-label="诗句拼图板"/,
  "诗句拼图应提供可访问的二维拼图板",
);
assert.match(
  responsiveCss,
  /\.puzzle-answer \{[\s\S]+grid-template-columns: repeat\(var\(--puzzle-columns\), var\(--puzzle-slot-size\)\);/,
  "诗句拼图必须使用二维网格，不能退回横向字块队列",
);
assert.match(
  responsiveCss,
  /\.puzzle-piece-text \{[\s\S]+width: 48%;[\s\S]+font-size: \.86em;/,
  "拼片文字应限制在中央安全区，避免覆盖榫口边框",
);
assert.match(
  responsiveCss,
  /@media \(width <= 650px\)[\s\S]+\.puzzle-answer \{[\s\S]+--puzzle-slot-size: 68px;/,
  "手机端拼图板应保持足够大的操作与展示尺寸",
);
assert.match(
  sourceApp,
  /createPuzzleShape\([\s\S]+createJigsawPath\([\s\S]+PUZZLE_PIECE_COLORS/,
  "拼片应使用互补榫口轮廓和多种底色",
);
assert.match(
  sourceApp,
  /resolvePuzzleShapeIndex\([\s\S]+zone === "answer" \? slotIndex : null[\s\S]+createPuzzleShape\(shapeIndex/,
  "拼片进入拼图板后应使用槽位轮廓，避免文字顺序与板槽造型互相冲突",
);
assert.match(
  sourceApp,
  /addEventListener\("pointerdown"[\s\S]+elementFromPoint[\s\S]+movePuzzlePieceToSlot[\s\S]+window\.addEventListener\("pointermove"/,
  "拼片应使用同时兼容鼠标与触屏的 Pointer Events 完成拖放",
);
assert.match(
  responsiveCss,
  /\.puzzle-piece \{[\s\S]+touch-action: none;[\s\S]+\.puzzle-drag-ghost \{[\s\S]+pointer-events: none;/,
  "拖动拼片应阻止触屏滚动抢占，并提供跟手的拖动预览",
);
const puzzlePaletteSource = sourceConfig.match(
  /const PUZZLE_PIECE_COLORS = \[([\s\S]*?)\];/,
);
assert.ok(puzzlePaletteSource, "诗句拼图应定义独立的拼片色板");
const puzzlePalette = puzzlePaletteSource[1].match(/#[0-9a-f]{6}/gi) ?? [];
assert.ok(puzzlePalette.length >= 6, "诗句拼图应保留足够多的可辨识底色");
for (const color of puzzlePalette) {
  const channels = color
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16));
  const lightness = (Math.max(...channels) + Math.min(...channels)) / 510;
  const chroma = Math.max(...channels) - Math.min(...channels);
  assert.ok(lightness >= 0.64 && chroma <= 120, `拼片底色 ${color} 应保持柔和、不过度刺眼`);
}
assert.ok(
  puzzlePalette.some((color) => {
    const channels = color
      .slice(1)
      .match(/.{2}/g)
      .map((channel) => Number.parseInt(channel, 16));
    return Math.max(...channels) - Math.min(...channels) >= 85;
  }),
  "拼片色板应包含更鲜明的颜色，避免整体过灰",
);
assert.match(
  responsiveCss,
  /\.filter-favorites::before[\s\S]+width: 22px;[\s\S]+height: 22px;[\s\S]+mask:/,
  "手机顶栏收藏图标应使用固定比例图形，避免字体心形被纵向拉长",
);
assert.match(
  responsiveCss,
  /@media \(width <= 650px\)[\s\S]+\.select-field select \{[\s\S]+font-size: 14px;/,
  "手机筛选下拉框应使用更紧凑的字号",
);
assert.match(
  sourceApp,
  /document\.addEventListener\("pointerdown"[\s\S]+elements\.libraryPanel\.open = false;/,
  "覆盖式诗库筛选应支持点击外部关闭",
);
assert.match(
  responsiveCss,
  /@media \(width <= 700px\) and \(height <= 650px\)[\s\S]+\.share-dialog-copy \{\s+display: none;/,
  "矮屏手机应优先保证分享海报不变形、不重叠",
);
assert.match(
  responsiveCss,
  /\.notice\[data-visible="true"\][\s\S]+opacity: 1;/,
  "手机端操作反馈应使用不占布局高度的短时提示",
);

for (const requiredEntry of [
  ".nojekyll",
  "newtab.html",
  "privacy.html",
  "landing.css",
  "poem-page.css",
  "robots.txt",
  "sitemap.xml",
  "CNAME",
  "app.js",
  "author-library.js",
  "reader-config.js",
  "reader-routing.js",
  "reader-appearance.css",
  "storage-adapter.js",
  "search-core.js",
  "search-worker.js",
  "share-poster.js",
  "poem-puzzle.js",
  "styles.css",
  "extension.css",
  "assets/icons/icon-32.png",
  "assets/store/promo-marquee.svg",
  "assets/store/social-card-1400x560.png",
  "assets/fonts/ZhiMangXing-Subset.woff2",
  "assets/fonts/ZhiMangXing-Subset.meta.json",
  "vendor/opencc-js/full.js",
  "vendor/qrcode-generator/qrcode.mjs",
  "data/poems/startup.json",
  "data/poems/index.json",
  "data/poems/search-reviewed.json",
  "data/poems/search.json",
  "data/deep-readings.json",
]) {
  assert.ok(
    fs.existsSync(path.join(siteRoot, requiredEntry)),
    `网页发布产物缺少：${requiredEntry}`,
  );
}

const poemDirectory = path.join(siteRoot, "poems");
const poemPages = fs.readdirSync(poemDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory());
assert.equal(poemPages.length, 100, "网页构建应生成 100 篇独立精读详情页");
const firstPoemPage = fs.readFileSync(
  path.join(poemDirectory, poemPages[0].name, "index.html"),
  "utf8",
);
assert.match(firstPoemPage, /rel="canonical" href="https:\/\/poetries\.cn\/poems\//, "精读页应提供独立规范链接");
assert.match(firstPoemPage, /<script type="application\/ld\+json">/, "精读页应提供 JSON-LD 结构化数据");
assert.match(firstPoemPage, /<h2 id="translation-title">白话译文<\/h2>/, "精读页应直接输出译文而非空壳");
assert.match(firstPoemPage, /原文已校订/, "精读页应在正文前清楚展示原文校订状态");
assert.match(firstPoemPage, /<h2 id="provenance-title">内容依据与编辑说明<\/h2>/, "精读页应区分原文、译文和原创导览的来源");
assert.match(firstPoemPage, /不等同于对上游内容的版权担保/, "精读页不能把校订状态包装成版权担保");
assert.match(firstPoemPage, /href="\.\.\/\.\.\/authors\/%/, "精读页作者名应链接到诗人聚合页");
assert.match(firstPoemPage, /href="\.\.\/\.\.\/topics\/%/, "精读页标签应链接到主题聚合页");
assert.match(firstPoemPage, /<h2 id="related-title">延伸阅读<\/h2>/, "精读页应基于内容关系继续分发站内精读");

const authorDirectory = path.join(siteRoot, "authors");
const authorPages = fs.readdirSync(authorDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory());
assert.equal(authorPages.length, 49, "只应为现有深度精读覆盖的 49 位诗人生成内容页");
const firstAuthorPage = fs.readFileSync(path.join(authorDirectory, authorPages[0].name, "index.html"), "utf8");
assert.match(firstAuthorPage, /<h2 id="profile-title">作者小传<\/h2>/, "诗人页应提供带来源的小传");
assert.match(firstAuthorPage, /资料来源：/, "诗人页必须公开作者资料来源");
assert.match(firstAuthorPage, /<h2 id="works-title">站内精读作品<\/h2>/, "诗人页应汇聚真实站内作品而非空壳简介");

const topicDirectory = path.join(siteRoot, "topics");
const topicPages = fs.readdirSync(topicDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory());
assert.equal(topicPages.length, 16, "只应为深度精读真实使用的 16 个主题生成内容页");
const firstTopicPage = fs.readFileSync(path.join(topicDirectory, topicPages[0].name, "index.html"), "utf8");
assert.match(firstTopicPage, /只收录已完成原文校订、译文对齐与原创导览的精读/, "主题页应明确内容入选门槛");
assert.match(firstTopicPage, /<h2 id="topic-poems-title">/, "主题页应汇聚对应的真实精读作品");

const contentPolicy = fs.readFileSync(path.join(siteRoot, "content-policy", "index.html"), "utf8");
assert.match(contentPolicy, /先说明依据，再谈数量/, "公开站应提供内容方法说明页");
assert.match(contentPolicy, /不批量生成搜索落地页/, "内容方法应明确拒绝用待校全库制造薄页面");
assert.match(contentPolicy, /最终授权仍需权利人确认或专业法律复核/, "内容方法应如实公开上游权利边界");

const sitemap = fs.readFileSync(path.join(siteRoot, "sitemap.xml"), "utf8");
assert.equal((sitemap.match(/<url>/g) ?? []).length, 171, "sitemap 应包含首页、精读、诗人、主题、内容方法和隐私页");
assert.match(sitemap, /https:\/\/poetries\.cn\/authors\/%/, "sitemap 应提交诗人内容页");
assert.match(sitemap, /https:\/\/poetries\.cn\/topics\/%/, "sitemap 应提交主题内容页");
assert.equal(fs.existsSync(path.join(siteRoot, "assets/fonts/ZhiMangXing-Regular.ttf")), false, "网页发布产物不应继续携带原始 TTF");

// 遍历构建产物中的站内链接，防止新增中文目录或相对路径形成可抓取但打不开的内容孤岛。
function collectHtmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? collectHtmlFiles(entryPath)
      : entry.name.endsWith(".html") ? [entryPath] : [];
  });
}

for (const htmlFile of collectHtmlFiles(siteRoot)) {
  const html = fs.readFileSync(htmlFile, "utf8");
  const relativePage = path.relative(siteRoot, htmlFile).split(path.sep).join("/");
  const baseUrl = new URL(relativePage, "https://poetries.cn/");
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    if (href.startsWith("#")) continue;
    const linkedUrl = new URL(href, baseUrl);
    if (linkedUrl.origin !== "https://poetries.cn") continue;
    let linkedPath = decodeURIComponent(linkedUrl.pathname).replace(/^\/+/, "");
    if (!linkedPath || linkedPath.endsWith("/")) linkedPath += "index.html";
    assert.ok(
      fs.existsSync(path.join(siteRoot, linkedPath)),
      `${relativePage} 的站内链接不存在：${href}`,
    );
  }
}

assert.match(deploymentWorkflow, /on:[\s\S]+branches:\s+- main/, "GitHub Pages 应在 main 更新后自动发布");
assert.match(deploymentWorkflow, /\n\s+npm test(?:\s|$)/, "发布前必须执行完整回归测试");
assert.match(
  deploymentWorkflow,
  /test_status=\$\{PIPESTATUS\[0\]\}[\s\S]+exit "\$test_status"/,
  "回归测试通过管道输出诊断时仍必须透传失败状态",
);
assert.match(deploymentWorkflow, /run: npm run build:web/, "发布工作流必须显式生成公开站点");
assert.match(deploymentWorkflow, /uses: actions\/configure-pages@v6/, "Pages 配置动作应使用 Node 24 版本");
assert.match(
  deploymentWorkflow,
  /uses: actions\/upload-pages-artifact@v5[\s\S]+path: dist\/site[\s\S]+include-hidden-files: true/,
  "Pages 只能上传 dist/site，并保留 .nojekyll",
);
assert.match(deploymentWorkflow, /uses: actions\/deploy-pages@v5/, "Pages 应使用 Node 24 部署动作发布构建产物");
assert.match(
  deploymentWorkflow,
  /needs: deploy[\s\S]+verify-deployed-site\.mjs/,
  "部署完成后必须继续检查真实线上页面",
);

for (const privateEntry of [
  "manifest.json",
  "background.js",
  "package.json",
  "tests",
  "scripts",
]) {
  assert.ok(
    !fs.existsSync(path.join(siteRoot, privateEntry)),
    `网页发布产物不应包含扩展或开发文件：${privateEntry}`,
  );
}

console.log("✓ 网页获客首页与扩展共用的在线阅读器均可从发布产物加载");
