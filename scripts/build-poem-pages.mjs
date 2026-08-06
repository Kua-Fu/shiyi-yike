import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPoemPages } from "./lib/poem-pages.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = process.env.POEM_PAGE_OUTPUT_DIR
  ? path.resolve(process.env.POEM_PAGE_OUTPUT_DIR)
  : path.join(projectRoot, "dist/site");
const count = await buildPoemPages({ projectRoot, outputRoot });
console.log(`静态精读页已生成：${count} 篇`);
