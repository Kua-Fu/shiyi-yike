const stylesheetPromises = new Map();

export function loadStylesheetOnce(href, id, documentRoot = document) {
  const existing = documentRoot.querySelector(`link[data-reader-resource="${id}"]`);
  if (existing?.sheet) return Promise.resolve(existing);
  if (stylesheetPromises.has(id)) return stylesheetPromises.get(id);

  const pending = new Promise((resolve, reject) => {
    const link = existing ?? documentRoot.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.readerResource = id;
    link.addEventListener("load", () => resolve(link), { once: true });
    link.addEventListener("error", () => {
      link.remove();
      reject(new Error(`样式资源加载失败：${href}`));
    }, { once: true });
    if (!existing) {
      // 领域样式放在主响应式样式之前，保证 extension.css 中的手机覆盖仍拥有最终优先级。
      const runtimeStyle = documentRoot.querySelector("#reader-runtime-style");
      documentRoot.head.insertBefore(link, runtimeStyle);
    }
  }).catch((error) => {
    stylesheetPromises.delete(id);
    throw error;
  });
  stylesheetPromises.set(id, pending);
  return pending;
}

export async function loadXingshuFont(version, documentRoot = document) {
  await loadStylesheetOnce(
    `reader-fonts.css?v=${encodeURIComponent(version)}`,
    "xingshu-font",
    documentRoot,
  );
  // 主动等待预览字形完成，避免用户点击后通知已经成功但页面仍处在回退字体。
  if (documentRoot.fonts?.load) {
    await documentRoot.fonts.load('1em "Zhi Mang Xing Local"', "山月");
  }
}
