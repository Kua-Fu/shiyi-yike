import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ATTEMPTS = 8;
const DEFAULT_RETRY_DELAY = 4000;

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

async function wait(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchText(url, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    headers: { "cache-control": "no-cache" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`${url} 返回 HTTP ${response.status}`);
  return await response.text();
}

function assertContains(content, pattern, label) {
  if (!pattern.test(content)) throw new Error(label);
}

export function sitemapLocations(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
}

async function verifyDeployedSiteOnce(baseUrl, options) {
  const base = normalizeBaseUrl(baseUrl);
  const [landing, reader, directory, sitemap] = await Promise.all([
    fetchText(new URL("./", base), options),
    fetchText(new URL("newtab.html", base), options),
    fetchText(new URL("poems/", base), options),
    fetchText(new URL("sitemap.xml", base), options),
  ]);

  assertContains(landing, /从读懂一句，到记住一首/, "首页不是当前构建产物");
  assertContains(reader, /id="poem"/, "在线阅读器未发布");
  assertContains(directory, /class="poem-index"/, "百篇精读目录未发布");

  const locations = sitemapLocations(sitemap);
  if (locations.length < 103) {
    throw new Error(`sitemap 仅包含 ${locations.length} 个网址，预期至少 103 个`);
  }
  const poemUrl = locations.find((location) => /\/poems\/[^/]+\/$/.test(location));
  if (!poemUrl) throw new Error("sitemap 缺少独立精读页网址");

  const poemPage = await fetchText(new URL(poemUrl), options);
  assertContains(poemPage, /id="translation-title"/, "独立精读页未发布或仍返回旧页面");
  assertContains(poemPage, /rel="canonical" href="https:\/\/poetries\.cn\/poems\//, "独立精读页规范链接异常");

  return { baseUrl: base.href, poemUrl, sitemapUrlCount: locations.length };
}

export async function verifyDeployedSite(baseUrl, {
  attempts = DEFAULT_ATTEMPTS,
  retryDelay = DEFAULT_RETRY_DELAY,
  ...options
} = {}) {
  let lastError;
  // Pages 部署完成后自定义域名 CDN 仍可能短暂返回旧内容，因此网络成功和内容断言都要整轮重试。
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await verifyDeployedSiteOnce(baseUrl, options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(retryDelay);
    }
  }
  throw new Error(`发布后检查失败：${lastError?.message ?? "未知错误"}`);
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error("用法：node scripts/verify-deployed-site.mjs <GitHub Pages URL>");
    process.exitCode = 1;
  } else {
    try {
      const result = await verifyDeployedSite(baseUrl);
      console.log(`✓ 线上站点已发布：${result.sitemapUrlCount} 个 sitemap 网址，抽检 ${result.poemUrl}`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
