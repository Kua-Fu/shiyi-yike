import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = await mkdtemp(path.join(os.tmpdir(), 'cat-guard-e2e-'));
await mkdir(path.join(root, 'artifacts'), { recursive: true });
const errors = [];
let app;
async function waitFor(fn, message) {
  for (let attempt = 0; attempt < 60; attempt++) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(message);
}
try {
  app = await electron.launch({
    ...(process.env.CAT_GUARD_EXECUTABLE ? { executablePath: process.env.CAT_GUARD_EXECUTABLE, args: [] } : { args: [root] }),
    env: { ...process.env, CAT_GUARD_TEST: '1', CAT_GUARD_TEST_DATA: data }, timeout: 30000,
  });
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => !!window.catGuard && document.getElementById('primary-label').textContent === '开始专注');
  assert.equal(await page.locator('#countdown').textContent(), '25:00');
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.process), 'undefined');
  await page.screenshot({ path: path.join(root, 'artifacts/main.png') });
  await page.locator('[data-work="45"]').click();
  await waitFor(async () => (await page.locator('#countdown').textContent()) === '45:00', '预设时长没有生效');
  await page.locator('[data-choice="gray"]').click();
  await waitFor(async () => (await page.locator('#cat-name').textContent()) === '乌云', '猫咪选择没有生效');
  await page.locator('[data-choice="cream"]').click();
  await page.locator('[data-work="25"]').click();
  await page.locator('#primary').click();
  await waitFor(async () => (await page.locator('#primary-label').textContent()) === '暂停一下', '计时没有开始');
  await page.locator('#primary').click();
  assert.equal(await app.evaluate(() => global.__catGuardTest.state().phase), 'paused');
  const pausedTime = await app.evaluate(() => global.__catGuardTest.state().remainingMs);
  await app.evaluate(() => global.__catGuardTest.powerMonitor.emit('resume'));
  assert.equal(await app.evaluate(() => global.__catGuardTest.state().remainingMs), pausedTime, '手动暂停不应被唤醒事件解除');
  await page.locator('#primary').click();
  await app.evaluate(() => global.__catGuardTest.powerMonitor.emit('suspend'));
  assert.equal(await app.evaluate(() => global.__catGuardTest.state().phase), 'paused');
  await app.evaluate(() => global.__catGuardTest.powerMonitor.emit('resume'));
  assert.equal(await app.evaluate(() => global.__catGuardTest.state().phase), 'work');
  await page.locator('#preview').click();
  await waitFor(async () => (await app.windows()).length > 1, '预览窗口没有出现');
  let overlay = (await app.windows()).find(p => p.url().endsWith('break.html'));
  await overlay.waitForSelector('#hold-button');
  overlay.on('pageerror', error => errors.push(error.message));
  await overlay.screenshot({ path: path.join(root, 'artifacts/break.png'), animations: 'disabled' });
  const bounds = await app.evaluate(({ screen }) => ({ actual: global.__catGuardTest.windows().map(w => w.getBounds()), expected: screen.getAllDisplays().map(d => d.workArea), onTop: global.__catGuardTest.windows().every(w => w.isAlwaysOnTop()) }));
  assert.deepEqual(bounds.actual, bounds.expected); assert.equal(bounds.onTop, true);
  // Esc 会在 keydown 时销毁原生窗口，Playwright 的 keyup 可能已无接收页。
  await overlay.keyboard.press('Escape').catch(error => { if (!overlay.isClosed()) throw error; });
  await waitFor(async () => (await app.windows()).length === 1, 'Esc 未关闭预览');
  assert.equal(await app.evaluate(() => global.__catGuardTest.state().phase), 'work', '预览不应改变原来的计时阶段');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  assert.equal(await app.evaluate(() => global.__catGuardTest.state().phase), 'work');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await app.evaluate(() => { global.__catGuardTest.timer.endsAt = Date.now() - 1; global.__catGuardTest.sync(); });
  await waitFor(async () => (await app.windows()).length > 1, '到期后未出现休息窗口');
  overlay = (await app.windows()).find(p => p.url().endsWith('break.html'));
  await overlay.waitForSelector('#hold-button');
  assert.equal(await app.evaluate(() => global.__catGuardTest.state().phase), 'break');
  const rejected = await overlay.evaluate(async () => { try { await window.catGuard.command('settings', {}); return false; } catch { return true; } });
  assert.equal(rejected, true, '休息窗口不应拥有修改设置的权限');
  const button = overlay.locator('#hold-button');
  await button.click();
  assert.equal(await app.evaluate(() => global.__catGuardTest.state().phase), 'break', '短按不能误触解除');
  await button.focus();
  await overlay.keyboard.down('Space');
  await waitFor(async () => (await app.windows()).length === 1, '长按未解除休息');
  assert.equal(await app.evaluate(() => global.__catGuardTest.state().phase), 'idle');
  await page.keyboard.up('Space');
  await page.locator('#primary').click();
  await app.evaluate(() => { global.__catGuardTest.timer.endsAt = Date.now() - 1; global.__catGuardTest.sync(); });
  await waitFor(async () => (await app.windows()).length > 1, '第二次休息未显示');
  await app.evaluate(() => { global.__catGuardTest.timer.endsAt = Date.now() - 1; global.__catGuardTest.sync(); });
  await waitFor(async () => (await app.windows()).length === 1, '休息到期未自动清除遮罩');
  assert.equal(await app.evaluate(() => global.__catGuardTest.state().breaks), 1);
  assert.deepEqual(errors, [], '页面出现运行错误');
  console.log('桌面验证通过：计时、暂停、睡眠恢复、预览隔离、置顶与屏幕边界、托盘驻留、长按与 Esc、IPC 权限、自动结束。');
} finally {
  if (app) await app.close();
  await rm(data, { recursive: true, force: true });
}
