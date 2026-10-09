import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupChrome } from "./lib/browser-cleanup.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.join(projectRoot, "dist/site");
const chromeCandidates = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

function contentType(file) {
  return new Map([
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".mjs", "text/javascript; charset=utf-8"],
    [".css", "text/css; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".woff2", "font/woff2"],
    [".png", "image/png"],
    [".svg", "image/svg+xml"],
  ]).get(path.extname(file)) ?? "application/octet-stream";
}

async function startServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
      let target = path.resolve(siteRoot, `.${pathname}`);
      if (!target.startsWith(`${siteRoot}${path.sep}`) && target !== siteRoot) {
        response.writeHead(403).end();
        return;
      }
      const stat = await fs.stat(target).catch(() => null);
      if (stat?.isDirectory()) target = path.join(target, "index.html");
      const body = await fs.readFile(target);
      response.writeHead(200, { "Content-Type": contentType(target) });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

async function launchChrome() {
  const executable = await (async () => {
    for (const candidate of chromeCandidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {}
    }
    return null;
  })();
  if (!executable) throw new Error("未找到 Chrome/Chromium；可通过 CHROME_PATH 指定真实浏览器");
  const userDataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "shiyi-browser-"));
  const processGroup = process.platform !== "win32";
  const child = spawn(executable, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDirectory}`,
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
  ], {
    // 单独的进程组让 Linux CI 能一次结束 Chrome 主进程、渲染器与后台写盘进程。
    detached: processGroup,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let webSocketUrl;
  try {
    webSocketUrl = await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
      };
      const timer = setTimeout(
        () => finish(reject, new Error("Chrome 调试端口启动超时")),
        15000,
      );
      let output = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) finish(resolve, match[1]);
      });
      child.once("error", (error) => finish(reject, error));
      child.once("exit", (code) => finish(reject, new Error(`Chrome 提前退出：${code}`)));
    });
  } catch (error) {
    await cleanupChrome({ child, userDataDirectory, processGroup });
    throw error;
  }
  return { child, userDataDirectory, webSocketUrl, processGroup };
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const listeners = new Map();
  const subscriptions = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }
    const eventListeners = listeners.get(message.method) ?? [];
    listeners.delete(message.method);
    eventListeners.forEach((resolve) => resolve(message.params));
    for (const callback of subscriptions.get(message.method) ?? []) callback(message.params);
  });
  return {
    send(method, params = {}) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    once(method) {
      return new Promise((resolve) => {
        listeners.set(method, [...(listeners.get(method) ?? []), resolve]);
      });
    },
    on(method, callback) {
      subscriptions.set(method, [...(subscriptions.get(method) ?? []), callback]);
    },
    close() {
      socket.close();
    },
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(cdp, expression, timeout = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(cdp, `Boolean(${expression})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`浏览器等待超时：${expression}`);
}

async function navigate(cdp, url) {
  const loaded = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url });
  await loaded;
}

const server = await startServer();
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
let chrome;
let cdp;
try {
  chrome = await launchChrome();
  const debugUrl = new URL(chrome.webSocketUrl);
  const target = await fetch(
    `http://${debugUrl.host}/json/new?${encodeURIComponent(`${origin}/newtab.html`)}`,
    { method: "PUT" },
  ).then((response) => response.json());
  cdp = await connectCdp(target.webSocketDebuggerUrl);
  const runtimeErrors = [];
  await Promise.all([
    cdp.send("Page.enable"),
    cdp.send("Runtime.enable"),
    cdp.send("Accessibility.enable"),
    cdp.send("Log.enable"),
  ]);
  // 持续错误监听不参与流程控制，最后统一断言；页面主动 console.error 也不能悄悄通过。
  cdp.on("Runtime.exceptionThrown", (error) => runtimeErrors.push(error));
  cdp.on("Log.entryAdded", ({ entry }) => {
    if (["error", "warning"].includes(entry.level)) runtimeErrors.push(entry);
  });

  await navigate(cdp, `${origin}/newtab.html`);
  await waitFor(cdp, `!document.querySelector("#search-trigger").disabled`);
  assert.ok(await evaluate(cdp, `document.querySelector(".poem-title").textContent.length > 0`));
  await evaluate(cdp, `(() => { const input = document.querySelector("#author-input"); input.focus(); input.value = "诗仙"; input.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await waitFor(cdp, `document.querySelectorAll("#author-options .author-option").length === 1`);
  assert.match(await evaluate(cdp, `document.querySelector("#author-options .author-option").textContent`), /李白 · 诗仙/);
  await evaluate(cdp, `(() => { const input = document.querySelector("#author-input"); input.value = "诗圣"; input.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  assert.match(await evaluate(cdp, `document.querySelector("#author-options .author-option").textContent`), /杜甫 · 诗圣/);
  await evaluate(cdp, `document.querySelector("#author-input").blur()`);

  const initialResources = await evaluate(
    cdp,
    `performance.getEntriesByType("resource").map((entry) => entry.name)`,
  );
  for (const deferredResource of [
    "reader-fonts.css",
    "ZhiMangXing-Deep.woff2",
    "ZhiMangXing-Extended.woff2",
    "reader-share.js",
    "reader-share.css",
    "reader-puzzle.js",
    "reader-puzzle.css",
  ]) {
    assert.equal(
      initialResources.some((resource) => resource.includes(deferredResource)),
      false,
      `首屏不应请求按需资源 ${deferredResource}`,
    );
  }

  await evaluate(cdp, `document.querySelector("#theme-trigger").click()`);
  assert.equal(await evaluate(cdp, `document.querySelector("#theme-dialog").open`), true);
  assert.equal(
    await evaluate(cdp, `performance.getEntriesByType("resource").some((entry) => entry.name.includes("reader-fonts.css"))`),
    false,
    "只预览外观设置时不应下载行书",
  );
  await evaluate(cdp, `document.querySelector('[data-font-option="xingshu"]').click()`);
  await waitFor(cdp, `document.documentElement.dataset.fontReady === "xingshu"`);
  const xingshuResources = await evaluate(
    cdp,
    `performance.getEntriesByType("resource").map((entry) => entry.name)`,
  );
  assert.ok(xingshuResources.some((resource) => resource.includes("reader-fonts.css")));
  assert.ok(xingshuResources.some((resource) => resource.includes("ZhiMangXing-Deep.woff2")));
  assert.equal(
    xingshuResources.some((resource) => resource.includes("ZhiMangXing-Extended.woff2")),
    false,
    "当前精读页不应提前下载行书扩展字符包",
  );
  await evaluate(cdp, `document.querySelector('[data-script-option="traditional"]').click()`);
  await waitFor(cdp, `document.documentElement.dataset.script === "traditional"`);
  await evaluate(cdp, `document.fonts.ready.then(() => true)`);
  assert.equal(
    await evaluate(cdp, `performance.getEntriesByType("resource").some((entry) => entry.name.includes("ZhiMangXing-Extended.woff2"))`),
    false,
    "繁体精读页也应复用精读字体包，不应提前下载扩展字符包",
  );
  await evaluate(cdp, `document.querySelector('[data-script-option="simplified"]').click()`);
  await waitFor(cdp, `document.documentElement.dataset.script === "simplified"`);
  await evaluate(cdp, `document.querySelector("#theme-dialog-close").click()`);

  await evaluate(cdp, `document.querySelector("#puzzle-action").click()`);
  await waitFor(cdp, `document.querySelector("#puzzle-dialog").open`);
  assert.ok(await evaluate(cdp, `performance.getEntriesByType("resource").some((entry) => entry.name.includes("reader-puzzle.js"))`));
  assert.ok(await evaluate(cdp, `performance.getEntriesByType("resource").some((entry) => entry.name.includes("reader-puzzle.css"))`));
  await evaluate(cdp, `document.querySelector("#puzzle-dialog-close").click()`);

  await evaluate(cdp, `document.querySelector("#share-action").click()`);
  await waitFor(cdp, `document.querySelector("#share-dialog").open`);
  await waitFor(cdp, `document.querySelector("#share-loading").hidden`);
  assert.ok(await evaluate(cdp, `performance.getEntriesByType("resource").some((entry) => entry.name.includes("reader-share.js"))`));
  assert.ok(await evaluate(cdp, `performance.getEntriesByType("resource").some((entry) => entry.name.includes("reader-share.css"))`));
  await evaluate(cdp, `document.querySelector("#share-dialog-close").click()`);

  const axTree = await cdp.send("Accessibility.getFullAXTree");
  const unnamedControls = axTree.nodes.filter((node) =>
    !node.ignored &&
    ["button", "textbox", "combobox", "link"].includes(node.role?.value) &&
    !node.name?.value?.trim(),
  );
  assert.deepEqual(unnamedControls, [], "所有可操作控件都必须拥有无障碍名称");

  const contrast = await evaluate(cdp, `(() => {
    const themes = ["xuan", "yuebai", "qingci", "taojian", "zhuying", "songyan"];
    const parse = (value) => value.trim().match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16) / 255);
    const luminance = (value) => {
      const channels = parse(value).map((part) => part <= .04045 ? part / 12.92 : ((part + .055) / 1.055) ** 2.4);
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    };
    const ratio = (left, right) => {
      const a = luminance(left), b = luminance(right);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    };
    return themes.map((theme) => {
      document.documentElement.dataset.theme = theme;
      const style = getComputedStyle(document.documentElement);
      const paper = style.getPropertyValue("--paper");
      return { theme, soft: ratio(style.getPropertyValue("--ink-soft"), paper), moss: ratio(style.getPropertyValue("--moss"), paper), accent: ratio(style.getPropertyValue("--cinnabar"), paper), placeholder: ratio(style.getPropertyValue("--placeholder"), paper) };
    });
  })()`);
  for (const result of contrast) {
    for (const [token, ratio] of Object.entries(result).filter(([key]) => key !== "theme")) {
      assert.ok(ratio >= 4.5, `${result.theme} 的 ${token} 对比度 ${ratio.toFixed(2)} 应不低于 4.5:1`);
    }
  }

  await evaluate(cdp, `document.querySelector(".verse-trigger").click()`);
  assert.equal(
    await evaluate(cdp, `document.querySelector("#web-install-prompt").hidden`),
    true,
    "桌面端展开第一句时不应过早出现安装邀请",
  );

  await evaluate(cdp, `document.querySelector("#search-trigger").click()`);
  assert.equal(await evaluate(cdp, `document.activeElement.id`), "global-search-input");
  await evaluate(cdp, `(() => { const input = document.querySelector("#global-search-input"); input.value = "床前明月光疑是地上霜"; input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "霜" })); })()`);
  await waitFor(cdp, `document.querySelectorAll("#search-results .poem-list-item").length > 0`);
  assert.equal(await evaluate(cdp, `document.querySelector("#search-results .poem-list-item-title").textContent`), "静夜思");
  assert.ok(await evaluate(cdp, `document.querySelectorAll("#search-results mark.search-match").length > 0`));
  await evaluate(cdp, `(() => { const input = document.querySelector("#global-search-input"); input.value = "诗仙"; input.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await waitFor(cdp, `document.querySelector("#search-results .poem-list-item-meta")?.textContent.includes("诗仙")`);
  assert.equal(await evaluate(cdp, `[...document.querySelectorAll("#search-results .poem-list-item-meta")].every((item) => item.textContent.includes("李白 · 诗仙"))`), true);
  await evaluate(cdp, `document.querySelector("#search-results .poem-list-item").click()`);
  await waitFor(cdp, `!document.querySelector("#search-dialog").open`);
  assert.match(await evaluate(cdp, `document.querySelector(".author-filter").textContent`), /李白 · 诗仙/);
  await evaluate(cdp, `document.querySelector(".author-filter").click()`);
  await waitFor(cdp, `document.querySelector("#author-dialog").open`);
  assert.equal(await evaluate(cdp, `document.querySelector("#author-dialog-epithet").textContent`), "称号 · 诗仙");
  assert.equal(await evaluate(cdp, `document.querySelector("#author-dialog-epithet").hidden`), false);
  await evaluate(cdp, `document.querySelector("#author-dialog-close").click()`);

  assert.equal(await evaluate(cdp, `document.querySelectorAll(".reader-illustration-card").length`), 4, "《静夜思》在线赏读应展示四张逐句插画");
  await evaluate(cdp, `document.querySelector("#illustration-3 .illustration-image-link").click()`);
  await waitFor(cdp, `document.querySelector(".reader-illustrations .poem-image-dialog").open`);
  assert.match(
    await evaluate(cdp, `document.querySelector(".reader-illustrations .poem-image-dialog img").src`),
    /03-ju-tou-wang-ming-yue\.webp$/,
    "点击第三张插画应打开对应大图",
  );
  await evaluate(cdp, `document.querySelector(".reader-illustrations .poem-image-share").click()`);
  await waitFor(cdp, `document.querySelector("#share-dialog").open && document.querySelector("#share-loading").hidden`);
  assert.equal(await evaluate(cdp, `document.querySelector(".reader-illustrations .poem-image-dialog").open`), false, "进入诗笺分享时应关闭大图弹层");
  assert.match(await evaluate(cdp, `document.querySelector("#share-dialog-status").textContent`), /插画诗笺已生成/);
  assert.ok(
    await evaluate(cdp, `document.querySelector("#share-canvas").toDataURL("image/png").length > 50000`),
    "插画诗笺应生成包含图片的高清 PNG",
  );
  await evaluate(cdp, `document.querySelector("#share-dialog-close").click()`);

  await navigate(cdp, `${origin}/newtab.html?poem=seed-tang-76fddedec15fe5992d27`);
  await waitFor(cdp, `document.querySelector(".poem-title")?.textContent === "早发白帝城"`);
  assert.equal(await evaluate(cdp, `document.querySelectorAll(".reader-illustration-card").length`), 4, "《早发白帝城》在线赏读应展示四张逐句插画");
  await evaluate(cdp, `document.querySelector("#illustration-4 .illustration-image-link").click()`);
  await waitFor(cdp, `document.querySelector(".reader-illustrations .poem-image-dialog").open`);
  assert.match(
    await evaluate(cdp, `document.querySelector(".reader-illustrations .poem-image-dialog img").src`),
    /zao-fa-bai-di-cheng\/04-qing-zhou-yi-guo-wan-chong-shan\.webp$/,
  );
  await evaluate(cdp, `document.querySelector(".reader-illustrations .poem-image-share").click()`);
  await waitFor(cdp, `document.querySelector("#share-dialog").open && document.querySelector("#share-loading").hidden`);
  assert.match(await evaluate(cdp, `document.querySelector("#share-dialog-status").textContent`), /插画诗笺已生成/);
  await evaluate(cdp, `document.querySelector("#share-dialog-close").click()`);

  for (const [poemId, title, count] of [
    ["seed-tang-f31387b81a5a217197c2", "望庐山瀑布", 4],
    ["seed-tang-22d24dc50d375641beef", "闻王昌龄左迁龙标遥有此寄", 4],
    ["tang-d5da9d7d-1e52-4992-8be5-73e556b07e0b", "清平调 一", 4],
    ["tang-a7b8e17f-ee93-4bdc-a144-b1ba5ab32bb5", "行路难三首 三", 16],
  ]) {
    await navigate(cdp, `${origin}/newtab.html?poem=${poemId}`);
    await waitFor(cdp, `document.querySelector(".poem-title")?.textContent === ${JSON.stringify(title)}`);
    assert.equal(await evaluate(cdp, `document.querySelectorAll(".reader-illustration-card").length`), count, `《${title}》应逐句展示插画`);
    await evaluate(cdp, `document.querySelector("#illustration-${count} .illustration-image-link").click()`);
    await waitFor(cdp, `document.querySelector(".reader-illustrations .poem-image-dialog img")?.naturalWidth > 0`);
    if (count === 16) {
      await evaluate(cdp, `document.querySelector(".reader-illustrations .poem-image-share").click()`);
      await waitFor(cdp, `document.querySelector("#share-dialog").open && document.querySelector("#share-loading").hidden`);
      assert.match(await evaluate(cdp, `document.querySelector("#share-dialog-status").textContent`), /插画诗笺已生成/);
      await evaluate(cdp, `document.querySelector("#share-dialog-close").click()`);
    } else {
      await evaluate(cdp, `document.querySelector(".reader-illustrations .poem-image-close").click()`);
    }
  }

  await navigate(cdp, `${origin}/newtab.html?poem=seed-tang-9d4a83c5a8d5fcd77de1`);
  await waitFor(cdp, `document.querySelector(".poem-title")?.textContent === "望岳"`);
  assert.equal(await evaluate(cdp, `document.querySelectorAll(".reader-illustration-card").length`), 0, "无配图诗篇不应出现插画区");
  assert.equal(await evaluate(cdp, `document.querySelector("#review-mode-select").value`), "all");

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await navigate(cdp, `${origin}/newtab.html`);
  await waitFor(cdp, `!document.querySelector("#search-trigger").disabled`);
  assert.equal(await evaluate(cdp, `document.documentElement.scrollWidth <= innerWidth`), true);
  assert.ok(await evaluate(cdp, `document.querySelector("#next-action").getBoundingClientRect().height >= 44`));
  const mobileOverlayGeometry = await evaluate(cdp, `(() => {
    const guide = document.querySelector("#onboarding-guide");
    const actions = document.querySelector(".side-panel");
    const guideRect = guide.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    return {
      guideHidden: guide.hidden,
      guideBottom: guideRect.bottom,
      actionsTop: actionsRect.top,
    };
  })()`);
  assert.equal(mobileOverlayGeometry.guideHidden, false, "手机首访引导应继续可见");
  // Chrome 设备模拟会产生少量小数视口波动；保留 6px 可见间距即可严格避免两层相接或重叠。
  const minimumMobileGuideGap = 6;
  assert.ok(
    mobileOverlayGeometry.guideBottom <= mobileOverlayGeometry.actionsTop - minimumMobileGuideGap,
    `手机首访引导底边 ${mobileOverlayGeometry.guideBottom} 应与操作坞顶边 ${mobileOverlayGeometry.actionsTop} 保留间距`,
  );
  await evaluate(cdp, `document.querySelector("#web-install-prompt").hidden = false`);
  assert.equal(
    await evaluate(cdp, `getComputedStyle(document.querySelector("#web-install-prompt")).display`),
    "none",
    "手机端即使提示状态异常，也不应显示桌面 Chrome 安装入口",
  );
  await evaluate(cdp, `document.querySelector("#web-install-prompt").hidden = true`);

  await navigate(cdp, `${origin}/newtab.html?poem=tang-a7b8e17f-ee93-4bdc-a144-b1ba5ab32bb5`);
  await waitFor(cdp, `document.querySelectorAll(".reader-illustration-card").length === 16`);
  assert.equal(await evaluate(cdp, `document.documentElement.scrollWidth <= innerWidth`), true, "长诗的 16 张插画在手机上不应撑宽页面");
  await evaluate(cdp, `document.querySelector("#illustration-16 .illustration-image-link").click()`);
  await waitFor(cdp, `document.querySelector(".reader-illustrations .poem-image-dialog").open`);
  assert.equal(
    await evaluate(cdp, `document.querySelector(".reader-illustrations .poem-image-dialog img").getBoundingClientRect().width <= innerWidth`),
    true,
    "手机端放大插画应限制在视口宽度内",
  );
  await evaluate(cdp, `document.querySelector(".reader-illustrations .poem-image-close").click()`);

  await cdp.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "forced-colors", value: "active" }],
  });
  assert.equal(await evaluate(cdp, `matchMedia("(forced-colors: active)").matches`), true);
  assert.notEqual(await evaluate(cdp, `getComputedStyle(document.querySelector("#next-action")).borderTopStyle`), "none");
  await cdp.send("Emulation.setEmulatedMedia", { media: "screen", features: [] });
  await cdp.send("Emulation.clearDeviceMetricsOverride");
  await navigate(cdp, `${origin}/authors/`);
  const authorCardHeights = await evaluate(cdp, `[...document.querySelectorAll("#author-directory-list > li > a")].map((card) => Math.round(card.getBoundingClientRect().height))`);
  assert.equal(new Set(authorCardHeights).size, 1, "有称号和无称号的诗人卡片应等高");
  await evaluate(cdp, `(() => { const input = document.querySelector("#author-directory-query"); input.value = "诗仙"; input.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await waitFor(cdp, `document.querySelector("#author-directory-status").textContent === "找到 1 位诗人"`);
  assert.equal(await evaluate(cdp, `[...document.querySelectorAll("#author-directory-list > li:not([hidden])")].map((item) => item.dataset.name).join(",")`), "李白");
  await evaluate(cdp, `(() => { const input = document.querySelector("#author-directory-query"); input.value = "诗圣"; input.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  assert.equal(await evaluate(cdp, `[...document.querySelectorAll("#author-directory-list > li:not([hidden])")].map((item) => item.dataset.name).join(",")`), "杜甫");
  await evaluate(cdp, `(() => { const input = document.querySelector("#author-directory-query"); input.value = "不存在的称号"; input.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  assert.equal(await evaluate(cdp, `document.querySelector("#author-directory-empty").hidden`), false);
  assert.deepEqual(runtimeErrors, [], "真实浏览器运行期间不应出现脚本错误或警告日志");
} finally {
  cdp?.close();
  await cleanupChrome(chrome);
  await new Promise((resolve) => server.close(resolve));
}

console.log("✓ 真实 Chrome 按需资源、深链接、称号搜索、移动布局、无障碍名称、主题对比度与高对比度模式均通过验收");
