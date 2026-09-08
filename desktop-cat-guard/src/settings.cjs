const fs = require('node:fs');
const path = require('node:path');
const { normalizeSettings } = require('./timer.cjs');
function readSettings(filename) {
  try { return normalizeSettings(JSON.parse(fs.readFileSync(filename, 'utf8'))); }
  catch { return normalizeSettings(); }
}
function saveSettings(filename, settings) {
  const normalized = normalizeSettings(settings);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  // 先写临时文件再替换，避免退出或断电留下半份 JSON，导致用户设置丢失。
  const temporary = `${filename}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(normalized, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, filename);
  return normalized;
}
module.exports = { readSettings, saveSettings };
