import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verifyOnly = process.argv.includes("--verify-only");
const stagingRoot = await fs.mkdtemp(
  path.join(path.dirname(projectRoot), ".shiyi-data-build-"),
);
const stagedProject = path.join(stagingRoot, "project");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 退出码为 ${code}`));
    });
  });
}

try {
  await fs.cp(projectRoot, stagedProject, {
    recursive: true,
    filter(source) {
      const relative = path.relative(projectRoot, source);
      return !(
        relative === ".git" ||
        relative.startsWith(`.git${path.sep}`) ||
        relative === "dist" ||
        relative.startsWith(`dist${path.sep}`) ||
        relative === "node_modules" ||
        relative.startsWith(`node_modules${path.sep}`)
      );
    },
  });
  await fs.symlink(path.join(projectRoot, "node_modules"), path.join(stagedProject, "node_modules"));
  // 所有远程下载、分卷写入和索引生成都在副本中完成；任何一步失败都不会留下半套正式数据。
  await run("npm", ["run", "build:data:in-place"], { cwd: stagedProject });
  await run("node", ["tests/validate.mjs"], { cwd: stagedProject });
  await run("node", ["tests/deep-readings.mjs"], { cwd: stagedProject });

  if (verifyOnly) {
    console.log("临时副本中的完整数据生成与校验成功；验证模式未替换正式数据");
    process.exitCode = 0;
  } else {

    const liveData = path.join(projectRoot, "data");
    const backupData = path.join(stagingRoot, "previous-data");
    await fs.rename(liveData, backupData);
    try {
      await fs.rename(path.join(stagedProject, "data"), liveData);
    } catch (error) {
      await fs.rename(backupData, liveData);
      throw error;
    }
    console.log("完整数据已在临时副本通过校验并整体替换");
  }
} finally {
  await fs.rm(stagingRoot, { force: true, recursive: true });
}
