import assert from "node:assert/strict";
import { sitemapLocations, verifyDeployedSite } from "../scripts/verify-deployed-site.mjs";

const poemUrls = Array.from(
  { length: 100 },
  (_, index) => `https://poetries.cn/poems/poem-${index + 1}/`,
);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset>${[
  "https://poetries.cn/",
  "https://poetries.cn/poems/",
  ...poemUrls,
  "https://poetries.cn/privacy.html",
].map((url) => `<url><loc>${url}</loc></url>`).join("")}</urlset>`;

assert.equal(sitemapLocations(sitemap).length, 103, "冒烟检查应完整解析 sitemap 网址");

const requestedUrls = [];
const responseByUrl = new Map([
  ["https://pages.example/project/", "<h1>从读懂一句，到记住一首</h1>"],
  ["https://pages.example/project/newtab.html", "<article id=\"poem\"></article>"],
  ["https://pages.example/project/poems/", "<ul class=\"poem-index\"></ul>"],
  ["https://pages.example/project/sitemap.xml", sitemap],
  [poemUrls[0], "<link rel=\"canonical\" href=\"https://poetries.cn/poems/poem-1/\"><h2 id=\"translation-title\">白话译文</h2>"],
]);
const fetchImpl = async (url) => {
  const href = String(url);
  requestedUrls.push(href);
  const body = responseByUrl.get(href);
  return new Response(body ?? "not found", { status: body ? 200 : 404 });
};

const result = await verifyDeployedSite("https://pages.example/project", {
  attempts: 1,
  fetchImpl,
  retryDelay: 0,
});
assert.equal(result.sitemapUrlCount, 103);
assert.equal(result.poemUrl, poemUrls[0]);
assert.deepEqual(requestedUrls.sort(), [...responseByUrl.keys()].sort(), "冒烟检查应覆盖首页、阅读器、目录、sitemap 与精读页");

let sitemapRequestCount = 0;
await verifyDeployedSite("https://pages.example/project", {
  attempts: 2,
  fetchImpl: async (url) => {
    const href = String(url);
    if (href.endsWith("sitemap.xml")) {
      sitemapRequestCount += 1;
      return new Response(sitemapRequestCount === 1 ? "<urlset></urlset>" : sitemap);
    }
    const body = responseByUrl.get(href);
    return new Response(body ?? "not found", { status: body ? 200 : 404 });
  },
  retryDelay: 0,
});
assert.equal(sitemapRequestCount, 2, "自定义域名短暂返回旧内容时应重试整轮线上检查");

await assert.rejects(
  verifyDeployedSite("https://pages.example/project", {
    attempts: 1,
    fetchImpl: async (url) => new Response(
      String(url).endsWith("sitemap.xml") ? "<urlset></urlset>" : "<div id=\"poem\" class=\"poem-index\">从读懂一句，到记住一首</div>",
      { status: 200 },
    ),
    retryDelay: 0,
  }),
  /sitemap 仅包含 0 个网址/,
  "线上仍是三网址或空 sitemap 时必须阻断发布验收",
);

console.log("✓ GitHub Pages 发布后冒烟检查覆盖旧产物与精读页 404 断点");
