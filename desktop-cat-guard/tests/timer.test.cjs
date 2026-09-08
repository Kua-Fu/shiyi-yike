const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Timer, normalizeSettings, DEFAULTS } = require('../src/timer.cjs');
function setup(settings = {}) {
  let now = 1000;
  const timer = new Timer({ workMinutes: 1, breakMinutes: 1, ...settings }, () => now);
  return { timer, advance: (ms) => { now += ms; }, tick: (ms) => { now += ms; timer.tick(); } };
}
test('拒绝损坏、超限或非数字设置，保留已验证字段', () => {
  assert.deepEqual(normalizeSettings({ workMinutes: -1, breakMinutes: Infinity, autoStart: 'yes', allDisplays: false, cat: '../file' }), { ...DEFAULTS, allDisplays: false });
  assert.equal(normalizeSettings({ workMinutes: '45' }).workMinutes, 45);
});
test('未启动时不消耗时间', () => { const { timer, tick } = setup(); tick(900000); assert.equal(timer.phase, 'idle'); assert.equal(timer.snapshot().remainingMs, 60000); });
test('专注到期只进入一次休息，记录完成轮数', () => {
  const { timer, tick } = setup(); timer.start(); tick(59999); assert.equal(timer.phase, 'work'); tick(1);
  assert.equal(timer.phase, 'break'); assert.equal(timer.rounds, 1); assert.equal(timer.focusMinutes, 1);
  timer.tick(); assert.equal(timer.rounds, 1);
});
test('暂停冻结剩余时间，继续使用冻结值而不是重新开始', () => {
  const { timer, tick } = setup(); timer.start(); tick(15000); assert.equal(timer.pause(), true);
  tick(3600000); assert.equal(timer.snapshot().remainingMs, 45000); timer.start(); tick(45000); assert.equal(timer.phase, 'break');
});
test('重复启动、暂停及结束操作保持幂等', () => {
  const { timer, tick } = setup(); timer.start(); tick(10000); timer.start(); assert.equal(timer.snapshot().remainingMs, 50000);
  timer.pause(); timer.pause(); assert.equal(timer.snapshot().remainingMs, 50000); timer.finishBreak(true); assert.equal(timer.phase, 'paused');
});
test('休息结束默认等待用户开始下一轮', () => { const { timer, tick } = setup(); timer.start(); tick(60000); tick(60000); assert.equal(timer.phase, 'idle'); assert.equal(timer.breaks, 1); });
test('开启自动循环后，结束休息开始新一轮', () => { const { timer, tick } = setup({ autoStart: true }); timer.start(); tick(60000); tick(60000); assert.equal(timer.phase, 'work'); assert.equal(timer.snapshot().remainingMs, 60000); });
test('提前解除不算完成休息', () => { const { timer, tick } = setup(); timer.start(); tick(60000); timer.finishBreak(false); assert.equal(timer.phase, 'idle'); assert.equal(timer.breaks, 0); });
test('修改时长不改变进行中的轮次，新阶段采用新设置', () => {
  const { timer, tick } = setup(); timer.start(); tick(30000); timer.updateSettings({ workMinutes: 45, breakMinutes: 10 });
  assert.equal(timer.snapshot().remainingMs, 30000); tick(30000); assert.equal(timer.snapshot().remainingMs, 600000);
  timer.finishBreak(); assert.equal(timer.snapshot().remainingMs, 2700000);
});
test('暂停时改设置也不会丢失当前进度', () => { const { timer, tick } = setup(); timer.start(); tick(10000); timer.pause(); timer.updateSettings({ workMinutes: 45 }); timer.start(); assert.equal(timer.snapshot().remainingMs, 50000); });
test('未开始时调整设置立即更新显示', () => { const { timer } = setup(); timer.updateSettings({ workMinutes: 45 }); assert.equal(timer.snapshot().remainingMs, 2700000); });
test('事件循环迟到不能跳过用户尚未看到的休息', () => { const { timer, tick } = setup(); timer.start(); tick(3600000); assert.equal(timer.phase, 'break'); assert.equal(timer.snapshot().remainingMs, 60000); });
test('休息计时按结束时刻计算，不依赖轮询次数', () => { const { timer, tick } = setup(); timer.start(); tick(60000); tick(3600000); assert.equal(timer.phase, 'idle'); assert.equal(timer.breaks, 1); });
test('重置移除截止时间但保留本次会话统计', () => { const { timer, tick } = setup(); timer.start(); tick(60000); timer.reset(); tick(3600000); assert.equal(timer.phase, 'idle'); assert.equal(timer.endsAt, null); assert.equal(timer.rounds, 1); });
test('快照返回独立设置副本', () => { const { timer } = setup(); timer.snapshot().settings.workMinutes = 99; assert.equal(timer.settings.workMinutes, 1); });
