import fs from "node:fs/promises";

const wait = (timeoutMs) => new Promise((resolve) => setTimeout(resolve, timeoutMs));

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

function signalProcessGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch (error) {
    // macOS 在进程组刚消失时偶尔返回 EPERM；此时继续让目录清理重试负责最终确认。
    if (["EPERM", "ESRCH"].includes(error.code)) return false;
    throw error;
  }
}

export async function stopChrome(child, { timeoutMs = 3000, processGroup = false } = {}) {
  if (!child) return;
  if (processGroup && Number.isInteger(child.pid) && child.pid > 0) {
    const gracefulExit = waitForExit(child, timeoutMs);
    if (!signalProcessGroup(child, "SIGTERM")) return;
    const parentExited = await gracefulExit;
    // 主进程先退出并不代表渲染器已经停写；短暂收尾后强制结束进程组中剩余成员。
    if (parentExited) await wait(100);
    signalProcessGroup(child, "SIGKILL");
    if (!parentExited && !(await waitForExit(child, timeoutMs))) {
      throw new Error("Chrome 进程组未能在清理前退出");
    }
    await wait(100);
    return;
  }
  if (hasExited(child)) return;
  const gracefulExit = waitForExit(child, timeoutMs);
  child.kill("SIGTERM");
  if (await gracefulExit) return;

  const forcedExit = waitForExit(child, timeoutMs);
  child.kill("SIGKILL");
  if (!(await forcedExit)) throw new Error("Chrome 进程未能在清理前退出");
}

export async function cleanupChrome(chrome, options = {}) {
  if (!chrome) return;
  // Linux CI 中 Chrome 的渲染器可能在主进程退出后继续写 Default；需结束整个独立进程组。
  await stopChrome(chrome.child, {
    ...options,
    processGroup: chrome.processGroup ?? options.processGroup,
  });
  if (chrome.userDataDirectory) {
    await fs.rm(chrome.userDataDirectory, {
      force: true,
      recursive: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}
