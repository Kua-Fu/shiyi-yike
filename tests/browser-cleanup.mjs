import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanupChrome } from "./lib/browser-cleanup.mjs";

class FakeChromeProcess extends EventEmitter {
  constructor({ ignoreSigterm = false } = {}) {
    super();
    this.exitCode = null;
    this.signalCode = null;
    this.ignoreSigterm = ignoreSigterm;
    this.signals = [];
    this.stderr = {
      destroyed: false,
      destroy() { this.destroyed = true; },
    };
  }

  kill(signal) {
    this.signals.push(signal);
    if (signal === "SIGTERM" && this.ignoreSigterm) return true;
    setTimeout(() => {
      this.signalCode = signal;
      this.emit("exit", null, signal);
    }, 0);
    return true;
  }
}

async function createProfileDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "shiyi-cleanup-test-"));
  await fs.mkdir(path.join(directory, "Default"));
  await fs.writeFile(path.join(directory, "Default", "Preferences"), "{}");
  return directory;
}

const gracefulProfile = await createProfileDirectory();
const gracefulChild = new FakeChromeProcess();
await cleanupChrome(
  { child: gracefulChild, userDataDirectory: gracefulProfile },
  { timeoutMs: 20 },
);
assert.deepEqual(gracefulChild.signals, ["SIGTERM"], "正常退出时不应发送强制结束信号");
assert.equal(gracefulChild.stderr.destroyed, true, "清理前应断开可能被后台进程继承的 stderr 管道");
await assert.rejects(fs.access(gracefulProfile), { code: "ENOENT" }, "进程退出后应删除浏览器临时目录");

const forcedProfile = await createProfileDirectory();
const forcedChild = new FakeChromeProcess({ ignoreSigterm: true });
await cleanupChrome(
  { child: forcedChild, userDataDirectory: forcedProfile },
  { timeoutMs: 20 },
);
assert.deepEqual(forcedChild.signals, ["SIGTERM", "SIGKILL"], "退出超时后应强制结束 Chrome");
await assert.rejects(fs.access(forcedProfile), { code: "ENOENT" }, "强制退出后仍应删除浏览器临时目录");

if (process.platform !== "win32") {
  const groupedProfile = await createProfileDirectory();
  const groupedChild = spawn(
    process.execPath,
    [
      "-e",
      `const { spawn } = require("node:child_process");
       spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
       setInterval(() => {}, 1000);`,
    ],
    { detached: true, stdio: "ignore" },
  );
  await new Promise((resolve, reject) => {
    groupedChild.once("spawn", resolve);
    groupedChild.once("error", reject);
  });
  await cleanupChrome(
    { child: groupedChild, userDataDirectory: groupedProfile, processGroup: true },
    { timeoutMs: 1000 },
  );
  await assert.rejects(fs.access(groupedProfile), { code: "ENOENT" }, "进程组退出后应删除浏览器临时目录");
}

let cleanupWarning = "";
await cleanupChrome(
  { child: null, userDataDirectory: "/tmp/shiyi-busy-profile" },
  {
    onCleanupWarning: (message) => { cleanupWarning = message; },
    removeProfile: async () => {
      const error = new Error("directory not empty");
      error.code = "ENOTEMPTY";
      throw error;
    },
  },
);
assert.match(cleanupWarning, /ENOTEMPTY/, "后台占用临时目录时应给出非阻断清理告警");

await assert.rejects(
  cleanupChrome(
    { child: null, userDataDirectory: "/tmp/shiyi-invalid-profile" },
    {
      removeProfile: async () => {
        const error = new Error("invalid path");
        error.code = "EINVAL";
        throw error;
      },
    },
  ),
  { code: "EINVAL" },
  "非瞬时文件系统错误仍应阻断测试",
);

console.log("✓ Chrome 正常退出、超时强制退出、子进程组与临时目录竞态均通过校验");
