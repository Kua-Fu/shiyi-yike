import fs from "node:fs/promises";
import path from "node:path";

const SITE_ORIGIN = "https://poetries.cn";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonLd(value) {
  // JSON-LD 位于 script 标签内，额外转义“<”以阻断正文中的闭合标签影响页面结构。
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function poemUrl(poem) {
  return `${SITE_ORIGIN}/poems/${encodeURIComponent(poem.id)}/`;
}

function readerUrl(poem) {
  return `${SITE_ORIGIN}/newtab.html?poem=${encodeURIComponent(poem.id)}`;
}

function renderPoemPage(poem, previous, next) {
  const title = `《${poem.title}》${poem.author}｜原文、译文与精读｜诗意一刻`;
  const description = `${poem.dynasty}代${poem.author}《${poem.title}》原文、白话译文、难词点注与篇章导览。${poem.deepReading.guide.summary}`;
  const canonical = poemUrl(poem);
  const lines = poem.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n");
  const translations = poem.translation
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("\n");
  const annotations = poem.deepReading.annotations
    .map((item) => `<li><strong>${escapeHtml(item.term)}</strong><span>${escapeHtml(item.gloss)}</span></li>`)
    .join("\n");
  const tags = poem.tags.map((tag) => `<span># ${escapeHtml(tag)}</span>`).join("");
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `《${poem.title}》原文、译文与精读`,
    description,
    inLanguage: "zh-CN",
    url: canonical,
    mainEntityOfPage: canonical,
    author: { "@type": "Person", name: poem.author },
    publisher: { "@type": "Organization", name: "诗意一刻", url: SITE_ORIGIN },
    articleSection: `${poem.period}诗词精读`,
    keywords: [poem.title, poem.author, poem.dynasty, ...poem.tags].join(","),
    text: poem.lines.join("\n"),
  };

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${canonical}">
    <link rel="icon" type="image/png" href="../../assets/icons/icon-32.png">
    <link rel="stylesheet" href="../../poem-page.css">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="诗意一刻">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${SITE_ORIGIN}/assets/store/social-card-1400x560.png">
    <script type="application/ld+json">${jsonLd(structuredData)}</script>
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="../../"><span aria-hidden="true">诗</span>诗意一刻</a>
      <a class="reader-link" href="../../newtab.html?poem=${encodeURIComponent(poem.id)}">在阅读器中打开</a>
    </header>
    <main>
      <article>
        <p class="eyebrow">${escapeHtml(poem.period)} · 深度精读</p>
        <h1>${escapeHtml(poem.title)}</h1>
        <p class="byline">${escapeHtml(poem.dynasty)} · ${escapeHtml(poem.author)} · ${escapeHtml(poem.form)}</p>
        <section class="original" aria-labelledby="original-title">
          <h2 id="original-title">原文</h2>
          <div class="verses">${lines}</div>
        </section>
        <div class="tags" aria-label="诗词标签">${tags}</div>
        <section aria-labelledby="translation-title">
          <h2 id="translation-title">白话译文</h2>
          <div class="prose">${translations}</div>
        </section>
        <section aria-labelledby="guide-title">
          <h2 id="guide-title">篇章导览</h2>
          <div class="guide-grid">
            <div><h3>写作背景</h3><p>${escapeHtml(poem.deepReading.background)}</p></div>
            <div><h3>这首诗写了什么</h3><p>${escapeHtml(poem.deepReading.guide.summary)}</p></div>
            <div><h3>转折在哪里</h3><p>${escapeHtml(poem.deepReading.guide.turn)}</p></div>
            <div><h3>它如何写成</h3><p>${escapeHtml(poem.deepReading.guide.craft)}</p></div>
          </div>
        </section>
        <section aria-labelledby="annotation-title">
          <h2 id="annotation-title">难词点注</h2>
          <ul class="annotations">${annotations}</ul>
        </section>
        <p class="source">原文来源：${escapeHtml(poem.source)}；译文来源：${escapeHtml(poem.translationMeta?.source ?? "开放语料整理")}。</p>
        <a class="primary-cta" href="../../newtab.html?poem=${encodeURIComponent(poem.id)}">进入阅读器，开始逐句回想</a>
      </article>
      <nav class="poem-nav" aria-label="相邻精读诗词">
        ${previous ? `<a href="../${encodeURIComponent(previous.id)}/">← 《${escapeHtml(previous.title)}》</a>` : "<span></span>"}
        ${next ? `<a href="../${encodeURIComponent(next.id)}/">《${escapeHtml(next.title)}》 →</a>` : "<span></span>"}
      </nav>
    </main>
    <footer>每日一诗 · 逐句精读 · 间隔复习</footer>
  </body>
</html>
`;
}

function renderPoemIndex(poems) {
  const items = poems
    .map((poem) => `<li><a href="${encodeURIComponent(poem.id)}/"><strong>${escapeHtml(poem.title)}</strong><span>${escapeHtml(poem.dynasty)} · ${escapeHtml(poem.author)}</span><small>${escapeHtml(poem.deepReading.guide.summary)}</small></a></li>`)
    .join("\n");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>100 篇古诗词深度精读｜诗意一刻</title><meta name="description" content="诗意一刻 100 篇古诗词深度精读目录，包含原文、译文、难词点注与篇章导览。"><link rel="canonical" href="${SITE_ORIGIN}/poems/"><link rel="icon" type="image/png" href="../assets/icons/icon-32.png"><link rel="stylesheet" href="../poem-page.css"></head>
<body><header class="site-header"><a class="brand" href="../"><span aria-hidden="true">诗</span>诗意一刻</a><a class="reader-link" href="../newtab.html">打开在线阅读器</a></header><main><article><p class="eyebrow">古诗词精读目录</p><h1>一百篇，读懂再记住</h1><p class="lead">每篇包含完整原文、白话译文、难词点注和篇章导览。</p><ul class="poem-index">${items}</ul></article></main><footer>诗意一刻 · 古诗词精读与记忆</footer></body></html>\n`;
}

function renderSitemap(poems) {
  const entries = [
    ["/", "weekly", "1.0"],
    ["/poems/", "weekly", "0.9"],
    ...poems.map((poem) => [`/poems/${encodeURIComponent(poem.id)}/`, "monthly", "0.8"]),
    ["/privacy.html", "monthly", "0.4"],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(([pathname, changefreq, priority]) => `  <url><loc>${SITE_ORIGIN}${pathname}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`).join("\n")}
</urlset>\n`;
}

export async function buildPoemPages({ projectRoot, outputRoot }) {
  const startup = JSON.parse(
    await fs.readFile(path.join(projectRoot, "data/poems/startup.json"), "utf8"),
  );
  const poems = startup.poems.filter((poem) => poem.deepReading?.status === "deep");
  if (poems.length !== 100) throw new Error(`静态精读页需要 100 篇，实际为 ${poems.length} 篇`);

  const poemRoot = path.join(outputRoot, "poems");
  await fs.rm(poemRoot, { force: true, recursive: true });
  await fs.mkdir(poemRoot, { recursive: true });
  await Promise.all(poems.map(async (poem, index) => {
    const directory = path.join(poemRoot, poem.id);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, "index.html"),
      renderPoemPage(poem, poems[index - 1], poems[index + 1]),
    );
  }));
  await fs.writeFile(path.join(poemRoot, "index.html"), renderPoemIndex(poems));
  await fs.writeFile(path.join(outputRoot, "sitemap.xml"), renderSitemap(poems));
  return poems.length;
}
