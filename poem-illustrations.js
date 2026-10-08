export function initPoemIllustrations(illustrationGallery, { pageUrl, onOpen, onClose, onShareImage, localize = (value) => value } = {}) {
  if (!illustrationGallery) return;
  const dialog = illustrationGallery.querySelector(".poem-image-dialog");
  const largeImage = dialog.querySelector("img");
  const caption = dialog.querySelector(".poem-image-caption");
  const closeButton = dialog.querySelector(".poem-image-close");
  const shareButton = dialog.querySelector(".poem-image-share");
  const shareStatus = dialog.querySelector(".poem-image-share-status");
  let activeLink = null;

  async function copyShareText(value) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch {
        // 某些浏览器禁用 Clipboard API 时，继续使用用户点击触发的复制方式。
      }
    }

    const field = document.createElement("textarea");
    field.value = value;
    field.readOnly = true;
    field.style.cssText = "position:fixed;width:1px;height:1px;opacity:0";
    dialog.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    if (!copied) throw new Error("无法复制分享内容");
    shareButton.focus();
  }

  // 保留图片链接作为无脚本时的入口；正常浏览时在当前页面放大。
  illustrationGallery.querySelectorAll(".illustration-image-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (typeof dialog.showModal !== "function") return;
      event.preventDefault();
      if (dialog.open) return;

      activeLink = link;
      largeImage.src = link.href;
      largeImage.alt = link.querySelector("img").alt;
      caption.textContent = link.dataset.verse;
      shareStatus.textContent = "";
      dialog.showModal();
      document.body.classList.add("poem-image-open");
      onOpen?.();
      closeButton.focus();
    });
  });

  shareButton.addEventListener("click", async () => {
    if (!activeLink || shareButton.disabled) return;

    if (onShareImage) {
      const illustration = {
        url: activeLink.href,
        verse: activeLink.dataset.verse,
        id: activeLink.closest(".illustrated-verse").id,
      };
      shareButton.disabled = true;
      dialog.close();
      try {
        await onShareImage(illustration);
      } finally {
        shareButton.disabled = false;
      }
      return;
    }

    const shareUrl = new URL(typeof pageUrl === "function" ? pageUrl() : pageUrl || document.querySelector('link[rel="canonical"]')?.href || location.href);
    shareUrl.hash = activeLink.closest(".illustrated-verse").id;
    shareButton.disabled = true;
    shareStatus.textContent = "";

    try {
      // 触屏设备使用系统分享；桌面浏览器直接复制，避免分享面板停留在未完成状态。
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        try {
          await navigator.share({ url: shareUrl.href });
          return;
        } catch (error) {
          if (error.name === "AbortError") return;
        }
      }
      await copyShareText(shareUrl.href);
      shareStatus.textContent = localize("网页链接已复制，可直接粘贴分享。");
    } catch {
      shareStatus.textContent = localize("暂时无法复制，请使用浏览器分享页面。");
    } finally {
      shareButton.disabled = false;
    }
  });

  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("poem-image-open");
    largeImage.removeAttribute("src");
    if (activeLink?.isConnected) activeLink.focus();
    onClose?.();
  });
}

initPoemIllustrations(document.querySelector(".poem-illustrations"));
