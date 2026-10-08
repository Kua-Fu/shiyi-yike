import { loadStylesheetOnce } from "./reader-resource-loader.js";

let sharePosterModulePromise = null;

function loadSharePosterModule() {
  if (!sharePosterModulePromise) {
    sharePosterModulePromise = import("./share-poster.js").catch((error) => {
      sharePosterModulePromise = null;
      throw error;
    });
  }
  return sharePosterModulePromise;
}

export function createShareController({
  elements,
  getCurrentPoem,
  clearAutoNextTimer,
  scheduleAutoNext,
  displayText,
  dynastyLabel,
  setLocalizedText,
}) {
  let sharePosterPoemId = null;
  let sharePosterVerse = null;

  function shareAppearance() {
    const styles = getComputedStyle(document.documentElement);
    return {
      paper: styles.getPropertyValue("--paper"),
      paperDeep: styles.getPropertyValue("--paper-deep"),
      ink: styles.getPropertyValue("--ink"),
      inkSoft: styles.getPropertyValue("--ink-soft"),
      line: styles.getPropertyValue("--line"),
      accent: styles.getPropertyValue("--cinnabar"),
      moss: styles.getPropertyValue("--moss"),
      serif: styles.getPropertyValue("--serif"),
      kai: styles.getPropertyValue("--kai"),
    };
  }

  function localizedSharePoem(poem) {
    return {
      ...poem,
      title: displayText(poem.title),
      dynasty: displayText(dynastyLabel(poem.dynasty)),
      author: displayText(poem.author),
      lines: poem.lines.map(displayText),
    };
  }

  function shareCanvasBlob() {
    return new Promise((resolve, reject) => {
      elements.shareCanvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("图片导出失败"));
      }, "image/png");
    });
  }

  function canSharePosterFile() {
    if (!globalThis.File || !navigator.share || !navigator.canShare) return false;
    try {
      const probe = new File([""], "诗意一刻.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  }

  function loadIllustration({ url, verse, id }) {
    const imageUrl = new URL(url, location.href);
    if (imageUrl.origin !== location.origin) throw new Error("插画地址必须与页面同源");
    const image = new Image();
    return new Promise((resolve, reject) => {
      image.onload = () => resolve({ image, verse, id });
      image.onerror = () => reject(new Error("插画加载失败"));
      image.src = imageUrl.href;
    });
  }

  async function open({ illustration } = {}) {
    const poem = getCurrentPoem();
    if (!poem) return;
    clearAutoNextTimer();
    // 分享弹层样式与绘图实现都等到用户点击后再加载，首屏不解析非核心交互代码。
    await loadStylesheetOnce("reader-share.css", "share-dialog");
    sharePosterPoemId = null;
    sharePosterVerse = null;
    elements.shareLoading.hidden = false;
    elements.shareCopyAction.disabled = true;
    elements.shareDownloadAction.disabled = true;
    setLocalizedText(elements.shareDialogStatus, "正在生成高清诗笺与二维码…");
    setLocalizedText(
      elements.shareDownloadLabel,
      canSharePosterFile() ? "分享图片" : "下载高清图片",
    );
    if (!elements.shareDialog.open) elements.shareDialog.showModal();

    try {
      const { createSharePoster } = await loadSharePosterModule();
      const loadedIllustration = illustration ? await loadIllustration(illustration) : null;
      if (document.fonts?.ready) await document.fonts.ready;
      createSharePoster(elements.shareCanvas, localizedSharePoem(poem), shareAppearance(), { illustration: loadedIllustration });
      if (!elements.shareDialog.open || getCurrentPoem()?.id !== poem.id) return;
      sharePosterPoemId = poem.id;
      sharePosterVerse = loadedIllustration?.verse ?? null;
      elements.shareLoading.hidden = true;
      elements.shareCopyAction.disabled = false;
      elements.shareDownloadAction.disabled = false;
      setLocalizedText(
        elements.shareDialogStatus,
        loadedIllustration ? "插画诗笺已生成；二维码可直达对应图片。" : "高清 PNG 已生成；二维码可直接打开当前诗篇。",
      );
      elements.shareDownloadAction.focus({ preventScroll: true });
    } catch (error) {
      console.error(error);
      elements.shareLoading.hidden = true;
      setLocalizedText(elements.shareDialogStatus, "诗笺生成未成功，请关闭后再试一次。");
    }
  }

  async function copySharePoster() {
    const poem = getCurrentPoem();
    if (!poem || sharePosterPoemId !== poem.id) return;
    if (!navigator.clipboard?.write || !globalThis.ClipboardItem) {
      setLocalizedText(
        elements.shareDialogStatus,
        "当前浏览器暂不支持复制图片，请使用“下载高清图片”。",
      );
      return;
    }
    try {
      const blob = await shareCanvasBlob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setLocalizedText(elements.shareDialogStatus, "图片已复制，可直接粘贴到聊天或笔记中。");
    } catch (error) {
      console.error(error);
      setLocalizedText(elements.shareDialogStatus, "图片复制未成功，请改用“下载高清图片”。");
    }
  }

  function downloadShareBlob(blob, fileName) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }

  async function shareOrDownloadPoster() {
    const poem = getCurrentPoem();
    if (!poem || sharePosterPoemId !== poem.id) return;
    try {
      const { buildShareFileName } = await loadSharePosterModule();
      const localizedPoem = localizedSharePoem(poem);
      const blob = await shareCanvasBlob();
      const fileName = buildShareFileName(localizedPoem, sharePosterVerse);
      if (canSharePosterFile()) {
        const file = new File([blob], fileName, { type: "image/png" });
        try {
          await navigator.share({
            files: [file],
            title: `《${localizedPoem.title}》· 诗意一刻`,
            text: `${localizedPoem.dynasty} · ${localizedPoem.author}`,
          });
          setLocalizedText(elements.shareDialogStatus, "分享面板已打开。");
          return;
        } catch (error) {
          if (error?.name === "AbortError") return;
          // 某些桌面环境声明支持文件分享却无法唤起面板，此时仍交付可用的高清图片。
        }
      }
      downloadShareBlob(blob, fileName);
      setLocalizedText(
        elements.shareDialogStatus,
        canSharePosterFile() ? "系统分享暂不可用，已改为下载高清图片。" : "高清图片已下载。",
      );
    } catch (error) {
      console.error(error);
      setLocalizedText(elements.shareDialogStatus, "图片分享未成功，请稍后重试。");
    }
  }

  elements.shareDialogClose.addEventListener("click", () => elements.shareDialog.close());
  elements.shareDialog.addEventListener("click", (event) => {
    if (event.target === elements.shareDialog) elements.shareDialog.close();
  });
  elements.shareDialog.addEventListener("close", () => {
    sharePosterPoemId = null;
    sharePosterVerse = null;
    scheduleAutoNext();
    if (!elements.shareAction.disabled) elements.shareAction.focus({ preventScroll: true });
  });
  elements.shareCopyAction.addEventListener("click", copySharePoster);
  elements.shareDownloadAction.addEventListener("click", shareOrDownloadPoster);

  return { open };
}
