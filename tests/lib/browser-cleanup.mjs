import fs from "node:fs/promises";

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child, timeoutMs) {
  if (hasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timer;
    const finish = (exited) => {
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    child.once("exit", onExit);
    timer = setTimeout(() => finish(false), timeoutMs);
  });
}

export async function stopChrome(child, { timeoutMs = 3000 } = {}) {
  if (!child || hasExited(child)) return;
  const gracefulExit = waitForExit(child, timeoutMs);
  child.kill("SIGTERM");
  if (await gracefulExit) return;

  const forcedExit = waitForExit(child, timeoutMs);
  child.kill("SIGKILL");
  if (!(await forcedExit)) throw new Error("Chrome 进程未能在清理前退出");
}

export async function cleanupChrome(chrome, options = {}) {
  if (!chrome) return;
  // Linux CI 中 Chrome 收到 SIGTERM 后仍可能写入 Default 目录；必须等进程退出后再带重试删除。
  await stopChrome(chrome.child, options);
  if (chrome.userDataDirectory) {
    await fs.rm(chrome.userDataDirectory, {
      force: true,
      recursive: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}
