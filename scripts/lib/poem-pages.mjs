import fs from "node:fs/promises";
import path from "node:path";

const SITE_ORIGIN = "https://poetries.cn";
const TRANSLATION_DATASET_URL = "https://huggingface.co/datasets/Papersnake/gushiwen";

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

function routeSegment(value) {
  // 目录名保留可读中文，同时过滤路径分隔符，避免内容字段意外改变发布目录结构。
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replaceAll(/[\\/]+/g, "-")
    .replaceAll(/\s+/g, "-");
}

function authorKey(poem) {
  return routeSegment(`${poem.dynasty}-${poem.author}`);
}

function poemUrl(poem) {
  return `${SITE_ORIGIN}/poems/${encodeURIComponent(poem.id)}/`;
}

function authorUrl(poem) {
  return `${SITE_ORIGIN}/authors/${encodeURIComponent(authorKey(poem))}/`;
}

function topicUrl(tag) {
  return `${SITE_ORIGIN}/topics/${encodeURIComponent(routeSegment(tag))}/`;
}

function internalAuthorHref(poem, prefix = "../../") {
  return `${prefix}authors/${encodeURIComponent(authorKey(poem))}/`;
}

function internalTopicHref(tag, prefix = "../../") {
  return `${prefix}topics/${encodeURIComponent(routeSegment(tag))}/`;
}

function metaTags({ title, description, canonical, cssPrefix, type = "website", structuredData }) {
  return `<title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="index,follow,max-image-preview:large">
    <link rel="canonical" href="${canonical}">
    <link rel="icon" type="image/png" href="${cssPrefix}assets/icons/icon-32.png">
    <link rel="stylesheet" href="${cssPrefix}poem-page.css">
    <meta property="og:type" content="${type}">
    <meta property="og:site_name" content="诗意一刻">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${SITE_ORIGIN}/assets/store/social-card-1400x560.png">
    <script type="application/ld+json">${jsonLd(structuredData)}</script>`;
}

function renderHeader(prefix) {
  return `<header class="site-header">
      <a class="brand" href="${prefix}"><span aria-hidden="true">诗</span>诗意一刻</a>
      <nav class="section-nav" aria-label="内容导航">
        <a href="${prefix}poems/">精读</a>
        <a href="${prefix}authors/">诗人</a>
        <a href="${prefix}topics/">主题</a>
        <a class="reader-link" href="${prefix}newtab.html">在线赏读</a>
      </nav>
    </header>`;
}

function renderFooter(prefix) {
  return `<footer><span>每日一诗 · 逐句精读 · 间隔复习</span><nav aria-label="页脚导航"><a href="${prefix}content-policy/">内容方法</a><a href="${prefix}privacy.html">隐私说明</a></nav></footer>`;
}

function renderBreadcrumb(items) {
  return `<nav class="breadcrumb" aria-label="面包屑导航">${items
    .map((item, index) => item.href
      ? `<a href="${item.href}">${escapeHtml(item.label)}</a><span aria-hidden="true">/</span>`
      : `<span aria-current="page">${escapeHtml(item.label)}</span>`)
    .join("")}</nav>`;
}

function breadcrumbData(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function relatedPoemsFor(poem, poems, limit = 4) {
  return poems
    .filter((candidate) => candidate.id !== poem.id)
    .map((candidate) => {
      const sharedTags = candidate.tags.filter((tag) => poem.tags.includes(tag));
      const sameAuthor = candidate.author === poem.author && candidate.dynasty === poem.dynasty;
      const score = (sameAuthor ? 8 : 0) + (sharedTags.length * 3) + (candidate.period === poem.period ? 1 : 0);
      return { poem: candidate, sameAuthor, sharedTags, score };
    })
    .filter((item) => item.score > 1)
    .sort((left, right) => right.score - left.score || left.poem.id.localeCompare(right.poem.id, "zh-CN"))
    .slice(0, limit);
}

function renderPoemCards(poems, { poemPrefix = "../../poems/", showAuthorLinks = true } = {}) {
  return poems.map((poem) => `<li>
      <a class="poem-card-main" href="${poemPrefix}${encodeURIComponent(poem.id)}/">
        <strong>${escapeHtml(poem.title)}</strong>
        <small>${escapeHtml(poem.deepReading.guide.summary)}</small>
      </a>
      <p>${showAuthorLinks ? `<a href="${internalAuthorHref(poem)}">${escapeHtml(poem.dynasty)} · ${escapeHtml(poem.author)}</a>` : `${escapeHtml(poem.dynasty)} · ${escapeHtml(poem.author)}`}<span>${escapeHtml(poem.form)}</span></p>
    </li>`).join("\n");
}

function renderSourceEvidence(poem, sourceById) {
  return poem.deepReading.sourceIds
    .map((sourceId) => sourceById.get(sourceId))
    .filter(Boolean)
    .map((source) => `<li><strong>${escapeHtml(source.label)}</strong><span>${escapeHtml(source.detail)}</span></li>`)
    .join("\n");
}

function renderPoemPage(poem, previous, next, poems, sourceById, editorialPolicy) {
  const title = `《${poem.title}》${poem.author}｜原文、译文、注释与校订依据｜诗意一刻`;
  const description = `${poem.dynasty}代${poem.author}《${poem.title}》原文、白话译文、难词点注、篇章导览与校订来源。${poem.deepReading.guide.summary}`;
  const canonical = poemUrl(poem);
  const lines = poem.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n");
  const translations = poem.translation.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n");
  const annotations = poem.deepReading.annotations
    .map((item) => `<li><strong>${escapeHtml(item.term)}</strong><span>${escapeHtml(item.gloss)}</span></li>`)
    .join("\n");
  const tags = poem.tags
    .map((tag) => `<a href="${internalTopicHref(tag)}"># ${escapeHtml(tag)}</a>`)
    .join("");
  const sources = poem.deepReading.sourceIds.map((id) => sourceById.get(id)).filter(Boolean);
  const related = relatedPoemsFor(poem, poems);
  const relatedCards = related.map(({ poem: candidate, sameAuthor, sharedTags }) => {
    const reason = sameAuthor ? `同读${candidate.author}` : `共同主题：${sharedTags.join("、")}`;
    return `<li><a href="../${encodeURIComponent(candidate.id)}/"><strong>《${escapeHtml(candidate.title)}》</strong><span>${escapeHtml(candidate.author)} · ${escapeHtml(reason)}</span></a></li>`;
  }).join("\n");
  const crumbs = [
    { name: "首页", url: `${SITE_ORIGIN}/` },
    { name: "古诗词精读", url: `${SITE_ORIGIN}/poems/` },
    { name: poem.title, url: canonical },
  ];
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${canonical}#article`,
        headline: `《${poem.title}》原文、译文、注释与精读`,
        description,
        inLanguage: "zh-CN",
        url: canonical,
        mainEntityOfPage: canonical,
        author: { "@type": "Person", name: poem.author, url: authorUrl(poem) },
        publisher: { "@type": "Organization", name: "诗意一刻", url: SITE_ORIGIN },
        isPartOf: { "@type": "CollectionPage", name: "100 篇古诗词深度精读", url: `${SITE_ORIGIN}/poems/` },
        articleSection: `${poem.period}诗词精读`,
        keywords: [poem.title, poem.author, poem.dynasty, ...poem.tags].join(","),
        about: poem.tags.map((tag) => ({ "@type": "Thing", name: tag, url: topicUrl(tag) })),
        citation: sources.map((source) => source.label),
        text: poem.lines.join("\n"),
      },
      breadcrumbData(crumbs),
    ],
  };

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${metaTags({ title, description, canonical, cssPrefix: "../../", type: "article", structuredData })}
  </head>
  <body>
    ${renderHeader("../../")}
    <main>
      <article>
        ${renderBreadcrumb([
          { label: "首页", href: "../../" },
          { label: "精读目录", href: "../" },
          { label: poem.title },
        ])}
        <p class="eyebrow">${escapeHtml(poem.period)} · 深度精读</p>
        <h1>${escapeHtml(poem.title)}</h1>
        <p class="byline">${escapeHtml(poem.dynasty)} · <a href="${internalAuthorHref(poem)}">${escapeHtml(poem.author)}</a> · ${escapeHtml(poem.form)}</p>
        <ul class="trust-strip" aria-label="内容质量状态">
          <li>原文已校订</li><li>译文已对齐</li><li>精读为原创编辑</li>
        </ul>
        <section class="original" aria-labelledby="original-title">
          <h2 id="original-title">原文</h2>
          <div class="verses">${lines}</div>
        </section>
        <div class="tags" aria-label="诗词主题">${tags}</div>
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
        <section class="provenance" aria-labelledby="provenance-title">
          <h2 id="provenance-title">内容依据与编辑说明</h2>
          <p class="section-intro">本页把原文、译文和精读稿分层标注，方便读者判断内容来自哪里、经过了什么处理。</p>
          <div class="provenance-grid">
            <div><h3>原文</h3><strong>已校订</strong><p>页面来源标识：${escapeHtml(poem.source)}。题名、作者归属与正文按下列古籍或选本复核。</p></div>
            <div><h3>白话译文</h3><strong>已对齐校订</strong><p>整理自 <a href="${TRANSLATION_DATASET_URL}" target="_blank" rel="noopener noreferrer">${escapeHtml(poem.translationMeta?.dataset ?? poem.translationMeta?.source ?? "开放语料")}</a>；数据集页面声明 ${escapeHtml(poem.translationMeta?.license ?? "未标注许可")}。</p></div>
            <div><h3>背景与导览</h3><strong>项目原创编辑</strong><p>依据通行古籍和选本重新表述，不复制现代赏析文章；有争议处不作唯一结论。</p></div>
          </div>
          <h3 class="evidence-heading">本篇核对依据</h3>
          <ul class="evidence-list">${renderSourceEvidence(poem, sourceById)}</ul>
          <p class="content-boundary">${escapeHtml(editorialPolicy)} “已校订”表示内容处理流程，不等同于对上游内容的版权担保，也不代表学术上的唯一解释。<a href="../../content-policy/">查看完整内容方法与边界</a></p>
        </section>
        <a class="primary-cta" href="../../newtab.html?poem=${encodeURIComponent(poem.id)}">进入阅读器，开始逐句回想</a>
        <section class="related-reading" aria-labelledby="related-title">
          <h2 id="related-title">延伸阅读</h2>
          <p class="section-intro">按同作者、共同主题与时代关系，从已校订精读中继续阅读。</p>
          <ul>${relatedCards}</ul>
        </section>
      </article>
      <nav class="poem-nav" aria-label="相邻精读诗词">
        ${previous ? `<a href="../${encodeURIComponent(previous.id)}/">← 《${escapeHtml(previous.title)}》</a>` : "<span></span>"}
        ${next ? `<a href="../${encodeURIComponent(next.id)}/">《${escapeHtml(next.title)}》 →</a>` : "<span></span>"}
      </nav>
    </main>
    ${renderFooter("../../")}
  </body>
</html>
`;
}

function renderPoemIndex(poems, authorCount, topicCount) {
  const items = poems
    .map((poem) => `<li><a href="${encodeURIComponent(poem.id)}/"><strong>${escapeHtml(poem.title)}</strong><span>${escapeHtml(poem.dynasty)} · ${escapeHtml(poem.author)}</span><small>${escapeHtml(poem.deepReading.guide.summary)}</small></a></li>`)
    .join("\n");
  const canonical = `${SITE_ORIGIN}/poems/`;
  const title = "100 篇已校订古诗词深度精读｜诗意一刻";
  const description = "诗意一刻 100 篇已校订古诗词精读目录，包含原文、译文、难词点注、篇章导览与逐篇校订依据。";
  const structuredData = { "@context": "https://schema.org", "@type": "CollectionPage", name: title, description, url: canonical, numberOfItems: poems.length };
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${metaTags({ title, description, canonical, cssPrefix: "../", structuredData })}</head>
<body>${renderHeader("../")}<main><article>${renderBreadcrumb([{ label: "首页", href: "../" }, { label: "精读目录" }])}<p class="eyebrow">古诗词精读目录</p><h1>一百篇，读懂再记住</h1><p class="lead">每篇均已完成原文校订、译文对齐、难词点注和原创篇章导览，并公开逐篇核对依据。</p><div class="directory-links"><a href="../authors/"><strong>按诗人阅读</strong><span>${authorCount} 位诗人的已校精读</span></a><a href="../topics/"><strong>按主题阅读</strong><span>${topicCount} 个真实内容主题</span></a><a href="../content-policy/"><strong>内容如何校订</strong><span>来源、状态与权利边界</span></a></div><ul class="poem-index">${items}</ul></article></main>${renderFooter("../")}</body></html>\n`;
}

function groupPoemsByAuthor(poems) {
  const groups = new Map();
  for (const poem of poems) {
    const key = authorKey(poem);
    const current = groups.get(key) ?? { key, name: poem.author, dynasty: poem.dynasty, poems: [] };
    current.poems.push(poem);
    groups.set(key, current);
  }
  return [...groups.values()].sort((left, right) => right.poems.length - left.poems.length || left.name.localeCompare(right.name, "zh-CN"));
}

function groupPoemsByTopic(poems) {
  const groups = new Map();
  for (const poem of poems) {
    for (const tag of poem.tags) {
      const key = routeSegment(tag);
      const current = groups.get(key) ?? { key, name: tag, poems: [] };
      current.poems.push(poem);
      groups.set(key, current);
    }
  }
  return [...groups.values()].sort((left, right) => right.poems.length - left.poems.length || left.name.localeCompare(right.name, "zh-CN"));
}

function renderAuthorIndex(groups) {
  const canonical = `${SITE_ORIGIN}/authors/`;
  const title = "古诗词诗人目录｜49 位诗人的已校精读｜诗意一刻";
  const description = `按诗人浏览 ${groups.length} 位作者的 100 篇已校订古诗词精读，每个诗人页均包含来源可追溯的小传和站内作品。`;
  const items = groups.map((group) => `<li><a href="${encodeURIComponent(group.key)}/"><strong>${escapeHtml(group.name)}</strong><span>${escapeHtml(group.dynasty)}代</span><small>${group.poems.length} 篇精读</small></a></li>`).join("\n");
  const structuredData = { "@context": "https://schema.org", "@type": "CollectionPage", name: title, description, url: canonical, numberOfItems: groups.length };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${metaTags({ title, description, canonical, cssPrefix: "../", structuredData })}</head><body>${renderHeader("../")}<main><article>${renderBreadcrumb([{ label: "首页", href: "../" }, { label: "诗人目录" }])}<p class="eyebrow">按诗人阅读</p><h1>从一位诗人，读向他的时代</h1><p class="lead">这里只为已有完整精读的诗人建立页面，不用空壳资料页扩充数量。</p><ul class="entity-index">${items}</ul></article></main>${renderFooter("../")}</body></html>\n`;
}

function profileSourceUrl(profile, authorData) {
  if (profile?.sourceUrl?.startsWith("https://")) return profile.sourceUrl;
  if (profile?.source?.includes("chinese-poetry")) return authorData.source?.repository;
  return null;
}

function renderAuthorPage(group, profile, authorData) {
  const canonical = `${SITE_ORIGIN}/authors/${encodeURIComponent(group.key)}/`;
  const title = `${group.dynasty}代${group.name}诗词｜原文、译文与精读｜诗意一刻`;
  const description = `${group.dynasty}代${group.name}诗词精选：收录 ${group.poems.length} 篇已校订精读，含原文、译文、注释、篇章导览和内容依据。`;
  const sourceUrl = profileSourceUrl(profile, authorData);
  const topics = [...new Set(group.poems.flatMap((poem) => poem.tags))];
  const profileText = profile?.biography || `站内目前收录${group.name}的 ${group.poems.length} 篇已校订精读，作者小传资料仍在补充。`;
  const sourceLabel = profile?.source || "诗意一刻作者索引";
  const sourceLine = sourceUrl
    ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceLabel)}</a>`
    : escapeHtml(sourceLabel);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": canonical, name: title, description, url: canonical, mainEntity: { "@id": `${canonical}#person` } },
      { "@type": "Person", "@id": `${canonical}#person`, name: group.name, description: profileText, url: canonical },
      breadcrumbData([
        { name: "首页", url: `${SITE_ORIGIN}/` },
        { name: "诗人目录", url: `${SITE_ORIGIN}/authors/` },
        { name: group.name, url: canonical },
      ]),
    ],
  };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${metaTags({ title, description, canonical, cssPrefix: "../../", structuredData })}</head><body>${renderHeader("../../")}<main><article>${renderBreadcrumb([{ label: "首页", href: "../../" }, { label: "诗人目录", href: "../" }, { label: group.name }])}<p class="eyebrow">${escapeHtml(group.dynasty)}代诗人 · ${group.poems.length} 篇已校精读</p><h1>${escapeHtml(group.name)}</h1><ul class="trust-strip" aria-label="页面内容状态"><li>只收录已校作品</li><li>作者资料标明来源</li></ul><section class="author-profile" aria-labelledby="profile-title"><h2 id="profile-title">作者小传</h2><p>${escapeHtml(profileText)}</p><p class="source-note">资料来源：${sourceLine}${profile?.sourceLicense ? `；许可标注：${escapeHtml(profile.sourceLicense)}` : ""}${profile?.sourceChanges?.length ? `；本页版本经过${escapeHtml(profile.sourceChanges.join("、"))}` : ""}。</p></section><section aria-labelledby="works-title"><h2 id="works-title">站内精读作品</h2><ul class="content-list">${renderPoemCards(group.poems, { showAuthorLinks: false })}</ul></section><section aria-labelledby="author-topics-title"><h2 id="author-topics-title">相关主题</h2><div class="tags">${topics.map((tag) => `<a href="${internalTopicHref(tag)}"># ${escapeHtml(tag)}</a>`).join("")}</div></section></article></main>${renderFooter("../../")}</body></html>\n`;
}

function renderTopicIndex(groups) {
  const canonical = `${SITE_ORIGIN}/topics/`;
  const title = "古诗词主题目录｜山水、思乡、离别等已校精读｜诗意一刻";
  const description = `按 ${groups.length} 个真实内容标签浏览 100 篇已校订古诗词精读，主题页只聚合已有完整内容的作品。`;
  const items = groups.map((group) => `<li><a href="${encodeURIComponent(group.key)}/"><strong>${escapeHtml(group.name)}</strong><small>${group.poems.length} 篇精读</small></a></li>`).join("\n");
  const structuredData = { "@context": "https://schema.org", "@type": "CollectionPage", name: title, description, url: canonical, numberOfItems: groups.length };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${metaTags({ title, description, canonical, cssPrefix: "../", structuredData })}</head><body>${renderHeader("../")}<main><article>${renderBreadcrumb([{ label: "首页", href: "../" }, { label: "主题目录" }])}<p class="eyebrow">按主题阅读</p><h1>循着同一意象，横向读诗</h1><p class="lead">主题来自每篇精读的真实标签；每个入口都通向已校原文和完整导览。</p><ul class="topic-index">${items}</ul></article></main>${renderFooter("../")}</body></html>\n`;
}

function relatedTopicsFor(group) {
  const counts = new Map();
  for (const poem of group.poems) {
    for (const tag of poem.tags) {
      if (tag === group.name) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN")).slice(0, 8);
}

function renderTopicPage(group) {
  const canonical = `${SITE_ORIGIN}/topics/${encodeURIComponent(group.key)}/`;
  const title = `${group.name}主题古诗词｜${group.poems.length} 篇原文、译文与精读｜诗意一刻`;
  const authors = [...new Map(group.poems.map((poem) => [authorKey(poem), poem])).values()];
  const description = `${group.name}主题古诗词精选：${group.poems.length} 篇已校订作品，含原文、译文、难词点注、篇章导览与逐篇内容依据。`;
  const relatedTopics = relatedTopicsFor(group);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", name: title, description, url: canonical, about: { "@type": "Thing", name: group.name }, numberOfItems: group.poems.length },
      breadcrumbData([
        { name: "首页", url: `${SITE_ORIGIN}/` },
        { name: "主题目录", url: `${SITE_ORIGIN}/topics/` },
        { name: group.name, url: canonical },
      ]),
    ],
  };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${metaTags({ title, description, canonical, cssPrefix: "../../", structuredData })}</head><body>${renderHeader("../../")}<main><article>${renderBreadcrumb([{ label: "首页", href: "../../" }, { label: "主题目录", href: "../" }, { label: group.name }])}<p class="eyebrow">古诗词主题 · ${group.poems.length} 篇已校精读</p><h1>${escapeHtml(group.name)}</h1><p class="lead">本页聚合站内明确标注为“${escapeHtml(group.name)}”的作品，只收录已完成原文校订、译文对齐与原创导览的精读。</p><section aria-labelledby="topic-poems-title"><h2 id="topic-poems-title">${escapeHtml(group.name)}主题作品</h2><ul class="content-list">${renderPoemCards(group.poems)}</ul></section><section aria-labelledby="topic-authors-title"><h2 id="topic-authors-title">相关诗人</h2><div class="tags">${authors.map((poem) => `<a href="${internalAuthorHref(poem)}">${escapeHtml(poem.dynasty)} · ${escapeHtml(poem.author)}</a>`).join("")}</div></section>${relatedTopics.length ? `<section aria-labelledby="related-topics-title"><h2 id="related-topics-title">继续探索相邻主题</h2><div class="tags">${relatedTopics.map(([tag, count]) => `<a href="${internalTopicHref(tag)}"># ${escapeHtml(tag)} · ${count} 篇共现</a>`).join("")}</div></section>` : ""}</article></main>${renderFooter("../../")}</body></html>\n`;
}

function renderContentPolicy(startup, authorData) {
  const canonical = `${SITE_ORIGIN}/content-policy/`;
  const title = "内容来源、校订方法与权利边界｜诗意一刻";
  const description = "了解诗意一刻如何区分已校精读、已校作品、待校内容与辅助草稿，以及原文、译文、作者资料和原创导览的来源与权利边界。";
  const sourceItems = startup.sources.map((source) => `<li><strong>${escapeHtml(source.label)}</strong><span>${escapeHtml(source.detail)}</span></li>`).join("\n");
  const structuredData = { "@context": "https://schema.org", "@type": "WebPage", name: title, description, url: canonical, inLanguage: "zh-CN" };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${metaTags({ title, description, canonical, cssPrefix: "../", structuredData })}</head><body>${renderHeader("../")}<main><article>${renderBreadcrumb([{ label: "首页", href: "../" }, { label: "内容方法" }])}<p class="eyebrow">内容可信度说明</p><h1>先说明依据，再谈数量</h1><p class="lead">诗意一刻把古典原文、现代译文、作者资料和项目原创精读分开管理。页面上的“已校订”描述编辑流程，不是版权担保，也不是学术定论。</p><section><h2>当前公开内容分层</h2><div class="policy-levels"><div><strong>${startup.counts.deep}</strong><h3>深度精读</h3><p>原文和译文已校，并具有原创背景、难词点注与篇章导览；静态站只为这一层建立可索引详情页。</p></div><div><strong>${startup.counts.reviewed}</strong><h3>已校作品</h3><p>已完成基础文本与译文匹配，完整浏览需要在阅读器中主动打开诗库。</p></div><div><strong>${startup.counts.all}</strong><h3>全量索引</h3><p>包含待校和辅助草稿，只用于明确选择后的站内检索，不批量生成搜索落地页。</p></div></div></section><section><h2>100 篇精读如何形成</h2><p>${escapeHtml(startup.editorialPolicy)}</p><ul class="evidence-list">${sourceItems}</ul></section><section><h2>译文与上游权利边界</h2><p>白话译文记录来自 <a href="${TRANSLATION_DATASET_URL}" target="_blank" rel="noopener noreferrer">Papersnake/gushiwen</a> 等开放语料整理，并逐篇保存数据集、匹配方式、对齐状态和页面声明的许可信息。数据集页面的许可声明不构成对全部上游内容的权利保证；最终授权仍需权利人确认或专业法律复核。</p></section><section><h2>作者资料如何署名</h2><p>作者资料主要来自 <a href="${escapeHtml(authorData.source.repository)}" target="_blank" rel="noopener noreferrer">${escapeHtml(authorData.source.name)}</a>（${escapeHtml(authorData.source.license)}），部分条目使用带固定版本和署名信息的中文维基百科改编节选，或仅依据资料页事实重新表述。每个诗人页会展示实际来源，不把来源不同的内容混写成项目原创。</p></section><section><h2>发现问题怎么办</h2><p>如果你发现异文、错别字、作者归属或译注问题，请在 <a href="https://github.com/Kua-Fu/shiyi-yike/issues/new" target="_blank" rel="noopener noreferrer">GitHub 提交勘误</a>，并附上所据版本。可核验的反例比笼统评价更有帮助。</p></section></article></main>${renderFooter("../")}</body></html>\n`;
}

function renderSitemap(poems, authorGroups, topicGroups) {
  const entries = [
    ["/", "weekly", "1.0"],
    ["/poems/", "weekly", "0.9"],
    ...poems.map((poem) => [`/poems/${encodeURIComponent(poem.id)}/`, "monthly", "0.8"]),
    ["/authors/", "weekly", "0.8"],
    ...authorGroups.map((group) => [`/authors/${encodeURIComponent(group.key)}/`, "monthly", "0.7"]),
    ["/topics/", "weekly", "0.8"],
    ...topicGroups.map((group) => [`/topics/${encodeURIComponent(group.key)}/`, "monthly", "0.7"]),
    ["/content-policy/", "monthly", "0.6"],
    ["/privacy.html", "monthly", "0.4"],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(([pathname, changefreq, priority]) => `  <url><loc>${SITE_ORIGIN}${pathname}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`).join("\n")}
</urlset>\n`;
}

export async function buildPoemPages({ projectRoot, outputRoot }) {
  const [startup, authorData] = await Promise.all([
    fs.readFile(path.join(projectRoot, "data/poems/startup.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(projectRoot, "data/authors.json"), "utf8").then(JSON.parse),
  ]);
  const poems = startup.poems.filter((poem) => poem.deepReading?.status === "deep");
  if (poems.length !== 100) throw new Error(`静态精读页需要 100 篇，实际为 ${poems.length} 篇`);

  const sourceById = new Map(startup.sources.map((source) => [source.id, source]));
  const profileByAuthor = new Map(authorData.authors.map((author) => [`${author.dynasty}|${author.name}`, author]));
  const authorGroups = groupPoemsByAuthor(poems);
  const topicGroups = groupPoemsByTopic(poems);
  const poemRoot = path.join(outputRoot, "poems");
  const authorRoot = path.join(outputRoot, "authors");
  const topicRoot = path.join(outputRoot, "topics");
  const policyRoot = path.join(outputRoot, "content-policy");

  await Promise.all([poemRoot, authorRoot, topicRoot, policyRoot].map((directory) => fs.rm(directory, { force: true, recursive: true })));
  await Promise.all([poemRoot, authorRoot, topicRoot, policyRoot].map((directory) => fs.mkdir(directory, { recursive: true })));

  await Promise.all(poems.map(async (poem, index) => {
    const directory = path.join(poemRoot, poem.id);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "index.html"), renderPoemPage(
      poem,
      poems[index - 1],
      poems[index + 1],
      poems,
      sourceById,
      startup.editorialPolicy,
    ));
  }));
  await fs.writeFile(path.join(poemRoot, "index.html"), renderPoemIndex(poems, authorGroups.length, topicGroups.length));

  await Promise.all(authorGroups.map(async (group) => {
    const directory = path.join(authorRoot, group.key);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "index.html"), renderAuthorPage(
      group,
      profileByAuthor.get(`${group.dynasty}|${group.name}`),
      authorData,
    ));
  }));
  await fs.writeFile(path.join(authorRoot, "index.html"), renderAuthorIndex(authorGroups));

  await Promise.all(topicGroups.map(async (group) => {
    const directory = path.join(topicRoot, group.key);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "index.html"), renderTopicPage(group));
  }));
  await fs.writeFile(path.join(topicRoot, "index.html"), renderTopicIndex(topicGroups));
  await fs.writeFile(path.join(policyRoot, "index.html"), renderContentPolicy(startup, authorData));
  await fs.writeFile(path.join(outputRoot, "sitemap.xml"), renderSitemap(poems, authorGroups, topicGroups));
  return poems.length;
}
