const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { readSettings, saveSettings } = require('../src/settings.cjs');
const { DEFAULTS } = require('../src/timer.cjs');
test('首次启动和损坏设置文件可以安全恢复', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-guard-settings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'settings.json');
  assert.deepEqual(readSettings(file), DEFAULTS);
  fs.writeFileSync(file, '{"workMinutes":'); assert.deepEqual(readSettings(file), DEFAULTS);
  fs.writeFileSync(file, 'null'); assert.deepEqual(readSettings(file), DEFAULTS);
});
test('设置持久化后可重读，忽略未知字段且不遗留临时文件', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-guard-settings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'nested', 'settings.json');
  saveSettings(file, { workMinutes: 45, cat: 'gray', autoStart: true, malicious: 'ignored' });
  assert.deepEqual(readSettings(file), { ...DEFAULTS, workMinutes: 45, cat: 'gray', autoStart: true });
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});
test('磁盘写入失败向调用方报告，不误报保存成功', () => {
  assert.throws(() => saveSettings(path.join(__filename, 'settings.json'), DEFAULTS));
});
