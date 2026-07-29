const DATA_VERSION = "dc2d8e3bbd41be88";
const FAVORITES_KEY = "poem-favorites-v2";

const state = {
  index: [],
  category: "全部",
  author: "",
  tag: "",
  current: null,
  favorites: new Set(),
  chunks: new Map(),
  requestId: 0,
  busy: false,
};

const elements = {
  categoryButtons: [...document.querySelectorAll("[data-category]")],
  authorLabel: document.querySelector("#author-label"),
  authorSelect: document.querySelector("#author-select"),
  tagSelect: document.querySelector("#tag-select"),
  resultCount: document.querySelector("#result-count"),
  resultTrigger: document.querySelector("#result-trigger"),
  clearFilter: document.querySelector("#clear-filter"),
  favoriteNavCount: document.querySelector("#favorite-nav-count"),
  folioNo: document.querySelector("#folio-no"),
  readingScroll: document.querySelector("#reading-scroll"),
  poem: document.querySelector("#poem"),
  bigCharacter: document.querySelector("#big-character"),
  context: document.querySelector("#context"),
  favoriteAction: document.querySelector("#favorite-action"),
  favoriteIcon: document.querySelector("#favorite-icon"),
  favoriteLabel: document.querySelector("#favorite-label"),
  nextAction: document.querySelector("#next-action"),
  nextLabel: document.querySelector("#next-label"),
  copyAction: document.querySelector("#copy-action"),
  notice: document.querySelector("#notice"),
  poemListDialog: document.querySelector("#poem-list-dialog"),
  poemListTitle: document.querySelector("#poem-list-title"),
  poemListSummary: document.querySelector("#poem-list-summary"),
  poemListClose: document.querySelector("#poem-list-close"),
  poemListSearch: document.querySelector("#poem-list-search"),
  poemList: document.querySelector("#poem-list"),
  poemListEmpty: document.querySelector("#poem-list-empty"),
};

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function normalizeMeta(meta, ordinal) {
  return {
    ...meta,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    ordinal: Number.isInteger(meta.ordinal) ? meta.ordinal : ordinal,
  };
}

function normalizeTranslationMeta(meta = {}) {
  return {
    source: typeof meta.source === "string" ? meta.source : "开放语料整理",
    reviewStatus: meta.reviewStatus === "reviewed" ? "reviewed" : "ai-draft",
  };
}

function matchesFilters(poem) {
  const matchesCategory =
    state.category === "全部" ||
    (state.category === "收藏"
      ? state.favorites.has(poem.id)
      : poem.category === state.category);
  return (
    matchesCategory &&
    (!state.author || poem.author === state.author) &&
    (!state.tag || poem.tags.includes(state.tag))
  );
}

function poemsInCurrentCategory() {
  return state.index.filter(
    (poem) =>
      state.category === "全部" ||
      (state.category === "收藏"
        ? state.favorites.has(poem.id)
        : poem.category === state.category),
  );
}

function filteredPoems() {
  return state.index.filter(matchesFilters);
}

function chooseRandom(poems, excludedId = state.current?.id) {
  if (!poems.length) return null;
  const candidates = poems.length > 1 ? poems.filter((poem) => poem.id !== excludedId) : poems;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function categoryAuthorLabel() {
  if (state.category === "唐诗") return ["诗人", "全部诗人"];
  if (state.category === "宋词") return ["词人", "全部词人"];
  if (state.category === "收藏") return ["收藏作者", "全部作者"];
  return ["诗人 / 词人", "全部作者"];
}

function setOptions(select, placeholder, values, selectedValue) {
  const fragment = document.createDocumentFragment();
  const first = makeElement("option", "", placeholder);
  first.value = "";
  fragment.append(first);

  for (const item of values) {
    const option = makeElement("option", "", typeof item === "string" ? item : item.label);
    option.value = typeof item === "string" ? item : item.value;
    fragment.append(option);
  }

  select.replaceChildren(fragment);
  select.value = selectedValue;
}

function renderFilters() {
  for (const button of elements.categoryButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.category === state.category));
  }

  const categoryPoems = poemsInCurrentCategory();
  const authors = [...new Set(categoryPoems.map((poem) => poem.author))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
  const [label, placeholder] = categoryAuthorLabel();
  elements.authorLabel.textContent = label;
  setOptions(elements.authorSelect, placeholder, authors, state.author);

  const tagCounts = new Map();
  categoryPoems
    .filter((poem) => !state.author || poem.author === state.author)
    .forEach((poem) => {
      for (const tag of poem.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    });
  const tags = [...tagCounts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .map(([tag, count]) => ({ value: tag, label: `${tag}（${count}）` }));
  setOptions(elements.tagSelect, "全部标签", tags, state.tag);

  const resultTotal = filteredPoems().length;
  elements.resultCount.textContent = String(resultTotal);
  elements.resultTrigger.disabled = state.busy || !resultTotal;
  elements.resultTrigger.setAttribute(
    "aria-label",
    `${resultTotal} 首可赏，点击查看诗词列表`,
  );
  elements.favoriteNavCount.textContent = String(state.favorites.size);
  elements.favoriteNavCount.setAttribute("aria-label", `已收藏 ${state.favorites.size} 首`);
  elements.clearFilter.hidden = state.category === "全部" && !state.author && !state.tag;
}

function setBusy(busy) {
  state.busy = busy;
  elements.readingScroll.setAttribute("aria-busy", String(busy));
  for (const control of elements.categoryButtons) control.disabled = busy || !state.index.length;
  elements.authorSelect.disabled = busy || !poemsInCurrentCategory().length;
  elements.tagSelect.disabled = busy || !poemsInCurrentCategory().length;
  elements.resultTrigger.disabled = busy || !filteredPoems().length;
  elements.favoriteAction.disabled = busy || !state.current;
  elements.nextAction.disabled = busy || !filteredPoems().length;
  elements.copyAction.disabled = busy || !state.current;
  elements.nextLabel.textContent = busy ? "展开中…" : "下一首";
}

function updateNotice(message) {
  const favoriteSummary = state.index.length ? ` · 已藏 ${state.favorites.size} 首` : "";
  elements.notice.textContent = `${message}${favoriteSummary}`;
}

function currentFilterSummary() {
  const parts = [
    state.category === "全部"
      ? "全部诗词"
      : state.category === "收藏"
        ? "我的收藏"
        : state.category,
  ];
  if (state.author) parts.push(state.author);
  if (state.tag) parts.push(`标签「${state.tag}」`);
  return parts.join(" · ");
}

function poemMatchesListSearch(poem, query) {
  if (!query) return true;
  return [poem.title, poem.author, poem.dynasty, ...poem.tags]
    .join(" ")
    .toLocaleLowerCase("zh-CN")
    .includes(query);
}

function createPoemListItem(poem, position) {
  const button = makeElement("button", "poem-list-item");
  button.type = "button";
  button.setAttribute("aria-current", String(state.current?.id === poem.id));
  button.setAttribute("aria-label", `打开《${poem.title}》，${poem.dynasty}代${poem.author}`);
  button.title = `打开《${poem.title}》`;

  const index = makeElement("span", "poem-list-item-index", String(position).padStart(3, "0"));
  index.setAttribute("aria-hidden", "true");
  const main = makeElement("span", "poem-list-item-main");
  main.append(
    makeElement("span", "poem-list-item-title", poem.title),
    makeElement(
      "span",
      "poem-list-item-meta",
      `${poem.dynasty} · ${poem.author}${poem.tags.length ? ` · ${poem.tags.slice(0, 3).join(" / ")}` : ""}`,
    ),
  );
  const mark = makeElement(
    "span",
    "poem-list-item-mark",
    state.favorites.has(poem.id) ? "♥" : "›",
  );
  mark.setAttribute("aria-hidden", "true");
  button.append(index, main, mark);
  button.addEventListener("click", () => {
    elements.poemListDialog.close();
    showPoem(poem, `已从列表打开《${poem.title}》`);
  });
  return button;
}

function renderPoemList() {
  const allResults = filteredPoems();
  const query = elements.poemListSearch.value.trim().toLocaleLowerCase("zh-CN");
  const visibleResults = allResults.filter((poem) => poemMatchesListSearch(poem, query));
  const fragment = document.createDocumentFragment();
  visibleResults.forEach((poem, index) => {
    fragment.append(createPoemListItem(poem, index + 1));
  });

  // 列表只在弹层打开时生成，避免常驻两千个按钮拖慢每个新标签页的首屏。
  elements.poemList.replaceChildren(fragment);
  elements.poemList.hidden = !visibleResults.length;
  elements.poemListEmpty.hidden = Boolean(visibleResults.length);
  elements.poemListSummary.textContent = query
    ? `${currentFilterSummary()} · 找到 ${visibleResults.length} / ${allResults.length} 首`
    : `${currentFilterSummary()} · 共 ${allResults.length} 首`;
  elements.poemList.scrollTop = 0;
}

function openPoemList() {
  if (!filteredPoems().length) return;
  elements.poemListSearch.value = "";
  elements.poemListTitle.textContent = state.category === "收藏" ? "我的收藏" : "可赏诗词";
  renderPoemList();
  elements.poemListDialog.showModal();
  elements.poemListClose.focus();
}

function translationBadge(meta) {
  const normalized = normalizeTranslationMeta(meta);
  if (normalized.source === "开放语料整理") {
    return normalized.reviewStatus === "reviewed" ? "开放译文 · 已对齐" : "开放译文 · 待校";
  }
  return normalized.reviewStatus === "reviewed" ? "辅助译文 · 已校订" : "辅助译文 · 待校";
}

function firstHanCharacter(text) {
  return text.match(/\p{Script=Han}/u)?.[0] ?? "诗";
}

function contextualHint(poem) {
  const tag = poem.tags.find((item) => !item.endsWith("诗") && !item.endsWith("词"));
  if (tag) return `此篇可从“${tag}”读起`;
  return poem.category === "唐诗" ? "宜静读，宜慢品" : "宜清赏，宜低吟";
}

function createAuthorLine(poem) {
  const line = makeElement("div", "author-line");
  line.append(makeElement("span", "", poem.dynasty), makeElement("span", "", "·"));
  line.children[1].setAttribute("aria-hidden", "true");

  const button = makeElement("button", "author-filter");
  button.type = "button";
  const selected = state.author === poem.author;
  button.setAttribute("aria-pressed", String(selected));
  button.setAttribute(
    "aria-label",
    selected ? `清除${poem.author}筛选` : `筛选${poem.author}的作品`,
  );
  button.title = selected ? "清除作者筛选" : `只看${poem.author}的作品`;
  button.append(
    makeElement("span", "", poem.author),
    makeElement("span", "author-filter-hint", selected ? "已筛选" : "看作品"),
  );
  button.lastElementChild.setAttribute("aria-hidden", "true");
  button.addEventListener("click", () => {
    state.author = selected ? "" : poem.author;
    keepTagIfAvailable();
    renderFilters();
    if (!selected && matchesFilters(poem)) {
      updateNotice(`${poem.author} · 共 ${filteredPoems().length} 首`);
      renderPoem(poem);
    } else {
      showRandom(`${state.author || categoryAuthorLabel()[1]} · 共 ${filteredPoems().length} 首`);
    }
  });
  line.append(button);
  return line;
}

function createOriginal(poem) {
  const section = makeElement("section", "original");
  section.setAttribute("aria-label", "诗词原文");
  section.append(makeElement("div", "section-kicker", "原文"));
  const verses = makeElement("div", "verses");
  for (const verse of poem.lines) verses.append(makeElement("p", "verse", verse));
  section.append(verses);
  return section;
}

function createTags(poem) {
  const tags = makeElement("div", "poem-tags");
  tags.setAttribute("aria-label", "本篇标签");
  for (const tag of poem.tags) {
    const button = makeElement("button", "poem-tag", tag);
    button.type = "button";
    button.setAttribute("aria-pressed", String(state.tag === tag));
    button.addEventListener("click", () => {
      state.tag = state.tag === tag ? "" : tag;
      renderFilters();
      if (matchesFilters(poem)) {
        updateNotice(`${state.tag ? `标签「${state.tag}」` : "全部标签"} · 共 ${filteredPoems().length} 首`);
        renderPoem(poem);
      } else {
        showRandom(`${state.tag ? `标签「${state.tag}」` : "全部标签"} · 共 ${filteredPoems().length} 首`);
      }
    });
    tags.append(button);
  }
  return tags;
}

function createTranslation(poem) {
  const block = makeElement("section", "translation-block");
  block.setAttribute("aria-labelledby", "translation-title");

  const heading = makeElement("div", "translation-heading");
  const title = makeElement("h2", "", "白话译文");
  title.id = "translation-title";
  heading.append(title, makeElement("span", "", translationBadge(poem.translationMeta)));

  const translation = makeElement("div", "translation-text");
  const paragraphs = poem.translation.length ? poem.translation : ["此篇译文正在校订中。"];
  for (const paragraph of paragraphs) translation.append(makeElement("p", "", paragraph));

  const source = normalizeTranslationMeta(poem.translationMeta).source;
  const note = makeElement(
    "p",
    "translation-note",
    `译文来源：${source}。用于辅助理解诗意；古典诗词意蕴丰富，欢迎结合原文品读。`,
  );
  block.append(heading, translation, note);
  return block;
}

function renderPoem(poem) {
  state.current = poem;
  const article = makeElement("article", "poem");
  article.id = "poem";
  article.append(makeElement("div", "eyebrow", "此刻遇见"));

  const title = makeElement("h1", "poem-title", poem.title);
  if (poem.title.length > 8) title.dataset.longTitle = "true";
  article.append(title, createAuthorLine(poem), createOriginal(poem), createTags(poem));
  article.append(createTranslation(poem));
  article.append(
    makeElement(
      "p",
      "note",
      `完整篇章 · ${poem.source} · 原文共 ${poem.lines.length} 段 · 译文共 ${poem.translation.length} 段`,
    ),
  );

  elements.poem.replaceWith(article);
  elements.poem = article;
  elements.readingScroll.setAttribute(
    "aria-label",
    `${poem.title}，${poem.author}，完整原文与译文`,
  );
  elements.folioNo.textContent = `卷之${String(
    state.index.findIndex((item) => item.id === poem.id) + 1,
  ).padStart(4, "0")} · 随机诗笺`;
  elements.bigCharacter.textContent = firstHanCharacter(poem.title);

  const contextTitle = makeElement("strong", "", poem.form);
  elements.context.replaceChildren(
    contextTitle,
    document.createTextNode("原文与译文完整呈现"),
    document.createElement("br"),
    document.createTextNode(contextualHint(poem)),
  );

  renderFavorite();
  elements.readingScroll.scrollTo({
    top: 0,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

function renderFavorite() {
  const selected = Boolean(state.current && state.favorites.has(state.current.id));
  elements.favoriteAction.setAttribute("aria-pressed", String(selected));
  elements.favoriteIcon.textContent = selected ? "♥" : "♡";
  elements.favoriteLabel.textContent = selected ? "已收藏" : "收藏此篇";
}

async function loadChunk(chunkName) {
  if (!state.chunks.has(chunkName)) {
    // 诗库按每卷 100 首拆分并按需加载，避免新标签页启动时一次解析全部正文。
    const pending = fetch(`data/poems/chunks/${chunkName}.json?v=${DATA_VERSION}`)
      .then((response) => {
        if (!response.ok) throw new Error(`诗文分卷读取失败：${response.status}`);
        return response.json();
      })
      .then((records) => new Map(records.map((record) => [record.id, record])))
      .catch((error) => {
        state.chunks.delete(chunkName);
        throw error;
      });
    state.chunks.set(chunkName, pending);
  }
  return state.chunks.get(chunkName);
}

async function expandPoem(meta) {
  const chunk = await loadChunk(meta.chunk);
  const body = chunk.get(meta.id);
  if (!body) throw new Error(`未在分卷中找到《${meta.title}》`);
  return {
    ...meta,
    lines: Array.isArray(body.lines) ? body.lines : [],
    translation: Array.isArray(body.translation) ? body.translation : [],
    translationMeta: normalizeTranslationMeta(body.translationMeta),
  };
}

async function showPoem(meta, message) {
  if (!meta) {
    updateNotice("当前组合暂无诗词，请换一个筛选条件");
    return;
  }

  // 用户可能快速切换筛选；只允许最后一次请求更新页面，避免慢分卷覆盖新选择。
  const requestId = ++state.requestId;
  setBusy(true);
  updateNotice("正在展开完整诗笺…");
  try {
    const poem = await expandPoem(meta);
    if (requestId !== state.requestId) return;
    renderPoem(poem);
    updateNotice(message);
  } catch (error) {
    if (requestId === state.requestId) {
      console.error(error);
      updateNotice("这页诗笺暂未能展开，请再试一首");
    }
  } finally {
    if (requestId === state.requestId) setBusy(false);
  }
}

function showEmptyCollection() {
  // 收藏为空时清除上一首，避免用户误以为屏幕上的诗仍属于收藏列表。
  state.requestId += 1;
  state.current = null;

  const article = makeElement("article", "poem");
  article.id = "poem";
  article.append(makeElement("div", "eyebrow", "我的收藏"));
  article.append(makeElement("h1", "poem-title", "诗笺尚空"));
  article.append(
    makeElement(
      "p",
      "empty-collection-copy",
      "回到“全部”，遇见喜欢的诗词时，点击“收藏此篇”。",
    ),
  );
  elements.poem.replaceWith(article);
  elements.poem = article;
  elements.readingScroll.setAttribute("aria-label", "我的收藏目前为空");
  elements.folioNo.textContent = "卷之0000 · 我的收藏";
  elements.bigCharacter.textContent = "藏";
  elements.context.replaceChildren(
    makeElement("strong", "", "私藏诗笺 · 待君题写"),
    document.createTextNode("喜欢的篇章会在这里相逢"),
    document.createElement("br"),
    document.createTextNode("从“全部”开始漫游吧"),
  );
  renderFavorite();
  setBusy(false);
  updateNotice("诗笺尚空，先去收藏喜欢的诗词吧");
}

function showRandom(message = "又逢一篇好诗词") {
  const poems = filteredPoems();
  if (!poems.length && state.category === "收藏") {
    showEmptyCollection();
    return;
  }
  showPoem(
    chooseRandom(poems),
    poems.length === 1 ? "已是此筛选下的唯一一首" : message,
  );
}

function keepTagIfAvailable() {
  if (!state.tag) return;
  const tagStillExists = state.index.some(
    (poem) =>
      (state.category === "全部" ||
        (state.category === "收藏"
          ? state.favorites.has(poem.id)
          : poem.category === state.category)) &&
      (!state.author || poem.author === state.author) &&
      poem.tags.includes(state.tag),
  );
  if (!tagStillExists) state.tag = "";
}

function copyText(poem) {
  const sections = [
    `《${poem.title}》`,
    `${poem.dynasty}·${poem.author}`,
    poem.lines.join("\n"),
  ];
  if (poem.translation.length) sections.push(`白话译文\n${poem.translation.join("\n")}`);
  if (poem.tags.length) sections.push(`标签：${poem.tags.join(" · ")}`);
  return sections.join("\n\n");
}

async function copyCurrent() {
  if (!state.current) return;
  try {
    await navigator.clipboard.writeText(copyText(state.current));
    updateNotice(state.current.translation.length ? "原文、译文与标签已复制" : "原文与标签已复制");
  } catch (error) {
    console.error(error);
    updateNotice("复制未成功，请稍后重试");
  }
}

function loadFavorites() {
  return new Promise((resolve) => {
    // 普通网页预览没有扩展存储 API，回退到 localStorage 以便本地开发和视觉检查。
    if (!globalThis.chrome?.storage?.local) {
      try {
        state.favorites = new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]"));
      } catch {
        state.favorites = new Set();
      }
      resolve();
      return;
    }
    chrome.storage.local.get([FAVORITES_KEY], (result) => {
      const saved = Array.isArray(result[FAVORITES_KEY]) ? result[FAVORITES_KEY] : [];
      state.favorites = new Set(saved);
      resolve();
    });
  });
}

function saveFavorites() {
  const saved = [...state.favorites];
  if (globalThis.chrome?.storage?.local) {
    chrome.storage.local.set({ [FAVORITES_KEY]: saved });
  } else {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(saved));
  }
}

function toggleFavorite() {
  if (!state.current) return;
  const removed = state.favorites.has(state.current.id);
  if (removed) {
    state.favorites.delete(state.current.id);
    updateNotice("已取消收藏");
  } else {
    state.favorites.add(state.current.id);
    updateNotice("已收入诗笺");
  }
  saveFavorites();
  renderFavorite();
  renderFilters();

  if (removed && state.category === "收藏") {
    // 当前筛选可能只命中被移除的诗；自动放宽作者与标签，继续展示其余收藏。
    if (!filteredPoems().length && state.favorites.size) {
      state.author = "";
      state.tag = "";
      renderFilters();
    }
    showRandom(state.favorites.size ? "已从收藏移除" : "收藏已清空");
  }
}

function bindEvents() {
  for (const button of elements.categoryButtons) {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      state.author = "";
      state.tag = "";
      renderFilters();
      const message =
        state.category === "收藏"
          ? `我的收藏 · 共 ${filteredPoems().length} 首`
          : `已切换至${state.category} · 共 ${filteredPoems().length} 首`;
      showRandom(message);
    });
  }

  elements.authorSelect.addEventListener("change", () => {
    state.author = elements.authorSelect.value;
    keepTagIfAvailable();
    renderFilters();
    showRandom(`${state.author || categoryAuthorLabel()[1]} · 共 ${filteredPoems().length} 首`);
  });

  elements.tagSelect.addEventListener("change", () => {
    state.tag = elements.tagSelect.value;
    renderFilters();
    showRandom(`${state.tag ? `标签「${state.tag}」` : "全部标签"} · 共 ${filteredPoems().length} 首`);
  });

  elements.clearFilter.addEventListener("click", () => {
    state.category = "全部";
    state.author = "";
    state.tag = "";
    renderFilters();
    showRandom(`筛选已清除 · 共 ${state.index.length} 首`);
  });

  elements.resultTrigger.addEventListener("click", openPoemList);
  elements.poemListClose.addEventListener("click", () => elements.poemListDialog.close());
  elements.poemListSearch.addEventListener("input", renderPoemList);
  elements.poemListDialog.addEventListener("click", (event) => {
    if (event.target === elements.poemListDialog) elements.poemListDialog.close();
  });
  elements.poemListDialog.addEventListener("close", () => {
    if (!elements.resultTrigger.disabled) elements.resultTrigger.focus({ preventScroll: true });
  });

  elements.nextAction.addEventListener("click", () => showRandom());
  elements.favoriteAction.addEventListener("click", toggleFavorite);
  elements.copyAction.addEventListener("click", copyCurrent);

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isFormControl =
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLButtonElement;
    if (isFormControl || event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.code === "Space" || event.code === "ArrowRight") {
      event.preventDefault();
      if (!state.busy) showRandom();
    } else if (event.key.toLowerCase() === "f") {
      toggleFavorite();
    } else if (event.key.toLowerCase() === "c") {
      copyCurrent();
    }
  });
}

async function initialize() {
  bindEvents();
  try {
    const [response] = await Promise.all([
      fetch(`data/poems/index.json?v=${DATA_VERSION}`),
      loadFavorites(),
    ]);
    if (!response.ok) throw new Error(`诗库索引读取失败：${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.poems) || !data.poems.length) throw new Error("诗库索引为空");

    state.index = data.poems.map(normalizeMeta);
    state.favorites = new Set(
      [...state.favorites].filter((id) => state.index.some((poem) => poem.id === id)),
    );
    renderFilters();
    await showPoem(
      chooseRandom(state.index),
      `诗库已展开 · 唐诗 ${data.counts.tang} 首 · 宋词 ${data.counts.song} 首`,
    );
  } catch (error) {
    console.error(error);
    setBusy(false);
    updateNotice("诗库暂未能展开，请重新打开此页");
  }
}

initialize();
