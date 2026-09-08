const DEFAULTS = Object.freeze({ workMinutes: 25, breakMinutes: 5, autoStart: false, allDisplays: true, cat: 'cream' });

function normalizeSettings(value = {}) {
  const number = (key, min, max) => {
    const n = Number(value[key]);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : DEFAULTS[key];
  };
  return {
    workMinutes: number('workMinutes', 1, 180), breakMinutes: number('breakMinutes', 1, 60),
    autoStart: typeof value.autoStart === 'boolean' ? value.autoStart : DEFAULTS.autoStart,
    allDisplays: typeof value.allDisplays === 'boolean' ? value.allDisplays : DEFAULTS.allDisplays,
    cat: ['cream', 'gray', 'peach'].includes(value.cat) ? value.cat : DEFAULTS.cat,
  };
}

class Timer {
  constructor(settings, now = Date.now) {
    this.settings = normalizeSettings(settings);
    this.now = now;
    this.phase = 'idle';
    this.endsAt = null;
    this.remainingMs = this.settings.workMinutes * 60000;
    this.durationMs = this.remainingMs;
    this.rounds = 0;
    this.breaks = 0;
    this.focusMinutes = 0;
  }
  begin(phase, durationMs) {
    this.phase = phase;
    this.durationMs = durationMs;
    this.remainingMs = durationMs;
    this.endsAt = this.now() + durationMs;
  }
  start() {
    if (this.phase === 'paused') {
      this.phase = 'work';
      this.endsAt = this.now() + this.remainingMs;
    } else if (this.phase === 'idle') this.begin('work', this.settings.workMinutes * 60000);
  }
  pause() {
    this.tick();
    if (this.phase !== 'work') return false;
    this.remainingMs = Math.max(0, this.endsAt - this.now());
    this.endsAt = null;
    this.phase = 'paused';
    return true;
  }
  reset() {
    this.phase = 'idle';
    this.endsAt = null;
    this.remainingMs = this.settings.workMinutes * 60000;
    this.durationMs = this.remainingMs;
  }
  finishBreak(completed = false) {
    if (this.phase !== 'break') return;
    if (completed) this.breaks++;
    this.reset();
    if (this.settings.autoStart) this.start();
  }
  updateSettings(settings) {
    this.settings = normalizeSettings(settings);
    // 正在进行的一轮保持原来的长度，避免修改设置突然触发休息；下一阶段采用新设置。
    if (this.phase === 'idle') this.reset();
  }
  tick() {
    if (this.endsAt === null || this.now() < this.endsAt) return;
    if (this.phase === 'work') {
      this.rounds++;
      this.focusMinutes += this.durationMs / 60000;
      // 主线程延迟唤醒时从实际展示开始算休息，不能让用户在没看到猫时就完成休息。
      this.begin('break', this.settings.breakMinutes * 60000);
    } else if (this.phase === 'break') this.finishBreak(true);
  }
  snapshot() {
    const remainingMs = this.endsAt === null ? this.remainingMs : Math.max(0, this.endsAt - this.now());
    return { phase: this.phase, remainingMs, durationMs: this.durationMs, endsAt: this.endsAt,
      rounds: this.rounds, breaks: this.breaks, focusMinutes: this.focusMinutes, settings: { ...this.settings } };
  }
}
module.exports = { Timer, normalizeSettings, DEFAULTS };
