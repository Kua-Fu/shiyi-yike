import {
  prepareSearchRecord,
  searchPreparedRecords,
} from "./search-core.js";

const preparedScopes = new Map();
const loadingScopes = new Map();

async function loadScope({ scope, url, expectedCount, records, metadata }) {
  if (preparedScopes.has(scope)) return preparedScopes.get(scope).length;
  if (!loadingScopes.has(scope)) {
    const pending = (async () => {
      let rawRecords = records;
      if (!rawRecords) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`搜索索引读取失败：${response.status}`);
        const data = await response.json();
        rawRecords = data.records;
      }
      if (!Array.isArray(rawRecords) || rawRecords.length !== expectedCount) {
        throw new Error("搜索索引与诗库数量不一致");
      }
      const metadataById = new Map(metadata.map((item) => [item.id, item]));
      // 数 MB 索引的解析、标点归一化与字段预处理全部留在 Worker，避免输入框所在主线程出现长任务。
      const prepared = rawRecords.map((record) =>
        prepareSearchRecord(record, metadataById.get(Array.isArray(record) ? record[0] : record.id)),
      );
      preparedScopes.set(scope, prepared);
      return prepared.length;
    })().finally(() => loadingScopes.delete(scope));
    loadingScopes.set(scope, pending);
  }
  return loadingScopes.get(scope);
}

self.addEventListener("message", async (event) => {
  const { requestId, type, payload } = event.data ?? {};
  try {
    if (type === "load") {
      const count = await loadScope(payload);
      self.postMessage({ requestId, ok: true, result: { count } });
      return;
    }
    if (type === "search") {
      const records = preparedScopes.get(payload.scope);
      if (!records) throw new Error("搜索范围尚未准备完成");
      const result = searchPreparedRecords(records, payload.query, { limit: payload.limit });
      self.postMessage({ requestId, ok: true, result });
      return;
    }
    throw new Error("未知搜索任务");
  } catch (error) {
    self.postMessage({
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
