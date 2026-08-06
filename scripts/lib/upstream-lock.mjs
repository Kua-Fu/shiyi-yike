import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

let lockPromise;

async function readLock(projectRoot) {
  if (!lockPromise) {
    lockPromise = fs.readFile(
      path.join(projectRoot, "data/sources/upstream-lock.json"),
      "utf8",
    ).then(JSON.parse);
  }
  return lockPromise;
}

export async function fetchLockedAsset(projectRoot, assetKey) {
  const lock = await readLock(projectRoot);
  const asset = lock.assets?.[assetKey];
  if (!asset) throw new Error(`上游锁文件缺少资源：${assetKey}`);
  const url = new URL(
    `${asset.commit}/${asset.path}`,
    `https://raw.githubusercontent.com/${asset.repository}/`,
  );
  const response = await fetch(url);
  if (!response.ok) throw new Error(`上游资源下载失败：${response.status} ${assetKey}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  // commit 固定仍不足以防远端异常覆盖；长度和内容哈希必须都吻合后才能进入生成流程。
  if (bytes.length !== asset.bytes || sha256 !== asset.sha256) {
    throw new Error(
      `上游资源校验失败：${assetKey}，期望 ${asset.bytes}/${asset.sha256}，实际 ${bytes.length}/${sha256}`,
    );
  }
  return bytes;
}

export async function fetchLockedJson(projectRoot, assetKey) {
  return JSON.parse((await fetchLockedAsset(projectRoot, assetKey)).toString("utf8"));
}

export async function fetchLockedJsonCollection(projectRoot, assetKey) {
  const lock = await readLock(projectRoot);
  const asset = lock.assets?.[assetKey];
  if (!asset?.pathTemplate || !Array.isArray(asset.parts)) {
    throw new Error(`上游锁文件缺少分卷资源：${assetKey}`);
  }
  const buffers = await Promise.all(asset.parts.map(async (part) => {
    const pathName = asset.pathTemplate.replace("{part}", String(part));
    const url = new URL(
      `${asset.commit}/${pathName}`,
      `https://raw.githubusercontent.com/${asset.repository}/`,
    );
    const response = await fetch(url);
    if (!response.ok) throw new Error(`上游分卷下载失败：${response.status} ${assetKey}/${part}`);
    return Buffer.from(await response.arrayBuffer());
  }));
  const joined = Buffer.concat(buffers);
  const sha256 = crypto.createHash("sha256").update(joined).digest("hex");
  if (joined.length !== asset.bytes || sha256 !== asset.sha256) {
    throw new Error(`上游分卷聚合校验失败：${assetKey}`);
  }
  return buffers.map((buffer) => JSON.parse(buffer.toString("utf8")));
}
