import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "data/sources/upstream-lock.json"), "utf8"),
);
const assets = Object.entries(lock.assets ?? {});
assert.ok(assets.length >= 7, "上游锁应覆盖诗经、楚辞、作者、宋词分卷与译文语料");
for (const [key, asset] of assets) {
  assert.match(asset.repository, /^[\w.-]+\/[\w.-]+$/, `${key} 应记录仓库`);
  assert.match(asset.commit, /^[0-9a-f]{40}$/, `${key} 必须固定完整 commit`);
  assert.match(asset.sha256, /^[0-9a-f]{64}$/, `${key} 必须固定 SHA-256`);
  assert.ok(Number.isInteger(asset.bytes) && asset.bytes > 0, `${key} 必须固定字节数`);
  assert.ok(asset.path || asset.pathTemplate, `${key} 必须固定仓库内路径`);
}

const buildSources = [
  "scripts/build-preqin.mjs",
  "scripts/build-authors.mjs",
  "scripts/build-dynasties.mjs",
  "scripts/build-tang-song.mjs",
  "scripts/build-song-ci.mjs",
].map((file) => fs.readFileSync(path.join(projectRoot, file), "utf8")).join("\n");
assert.doesNotMatch(buildSources, /raw\.githubusercontent\.com[^\n]+\/(?:master|main)\//, "数据构建不得追随浮动分支");
assert.match(buildSources, /fetchLocked(?:Asset|Json|JsonCollection)/, "数据构建必须经过锁文件校验");

const atomicBuild = fs.readFileSync(path.join(projectRoot, "scripts/build-data-atomic.mjs"), "utf8");
assert.match(atomicBuild, /stagedProject[\s\S]+build:data:in-place[\s\S]+tests\/validate\.mjs[\s\S]+fs\.rename/, "完整数据应在副本生成、校验后整体替换");

console.log("✓ 上游 commit、路径、字节数、哈希与原子数据生成流程均已锁定");
