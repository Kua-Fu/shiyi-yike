const $ = (id) => document.getElementById(id);
let state, saving = Promise.resolve(), toastTimer;
const names = { cream: '奶油', gray: '乌云', peach: '蜜桃' };
function notify(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2600); }
function render(next) {
  state = next;
  const seconds = Math.ceil(next.remainingMs / 1000);
  $('countdown').innerHTML = `${String(Math.floor(seconds / 60)).padStart(2, '0')}<span>:</span>${String(seconds % 60).padStart(2, '0')}`;
  $('progress').style.transform = `scaleX(${Math.max(0, Math.min(1, next.remainingMs / next.durationMs))})`;
  const copy = {
    idle: ['准备好，就慢慢开始', '下一次休息，让猫猫来提醒你。', '开始专注', '▶'],
    work: ['专注进行中，猫猫在陪你', '不着急，一次只做好一件事。', '暂停一下', 'Ⅱ'],
    paused: ['暂停中，按自己的节奏来', '准备好了，就从这里继续。', '继续专注', '▶'],
    break: ['现在，把时间留给自己', '放下手里的事，和猫猫休息一会儿。', '结束休息', '✓'],
  }[next.phase];
  $('phase-label').textContent = copy[0]; $('timer-note').textContent = copy[1];
  $('primary-label').textContent = copy[2]; $('primary-icon').textContent = copy[3];
  $('rounds').textContent = next.rounds; $('focus-minutes').textContent = Math.round(next.focusMinutes);
  $('preview').disabled = next.phase === 'break';
  for (const cat of document.querySelectorAll('[data-cat]')) {
    cat.dataset.color = next.settings.cat;
    cat.classList.toggle('sleeping', next.phase === 'break'); cat.classList.toggle('awake', next.phase !== 'break');
  }
  $('cat-name').textContent = names[next.settings.cat];
  document.querySelectorAll('[data-choice]').forEach((button) => { const selected = button.dataset.choice === next.settings.cat; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  document.querySelectorAll('[data-work]').forEach((button) => button.classList.toggle('selected', Number(button.dataset.work) === next.settings.workMinutes));
}
async function command(action) { try { render(await window.catGuard.command(action)); } catch { notify('操作没有完成，请再试一次。'); } }
function save(patch) {
  // 串行保存，连续点击时后一项必须合并最新设置，避免把前一项覆盖回去。
  saving = saving.then(async () => {
    $('save-status').textContent = '保存中…';
    try { render(await window.catGuard.command('settings', { ...state.settings, ...patch })); $('save-status').textContent = state.phase === 'idle' ? '已保存' : '已保存 · 时长在下一阶段生效'; }
    catch { $('save-status').textContent = '保存失败'; notify('设置没有保存成功，请检查磁盘空间后重试。'); }
  });
  return saving;
}
$('primary').addEventListener('click', async () => { await saving; if (state) command(state.phase === 'work' ? 'pause' : state.phase === 'break' ? 'dismiss' : 'start'); });
$('reset').addEventListener('click', () => command('reset'));
$('preview').addEventListener('click', async () => { await saving; command('preview'); });
$('quit').addEventListener('click', () => command('quit'));
for (const [id, key, max] of [['work-minutes', 'workMinutes', 180], ['break-minutes', 'breakMinutes', 60]]) {
  $(id).addEventListener('change', () => {
    const value = Number($(id).value);
    if (!Number.isInteger(value) || value < 1 || value > max) { $(id).value = state.settings[key]; notify(`请输入 1–${max} 之间的整数分钟。`); return; }
    save({ [key]: value });
  });
}
document.querySelectorAll('[data-work]').forEach((button) => button.addEventListener('click', () => { $('work-minutes').value = button.dataset.work; save({ workMinutes: Number(button.dataset.work) }); }));
document.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => save({ cat: button.dataset.choice })));
$('auto-start').addEventListener('change', () => save({ autoStart: $('auto-start').checked }));
$('all-displays').addEventListener('change', () => save({ allDisplays: $('all-displays').checked }));
$('pet-cat').addEventListener('click', () => {
  const cat = document.querySelector('[data-cat]'); cat.classList.remove('petting'); void cat.offsetWidth; cat.classList.add('petting');
  const messages = ['呼噜呼噜… 收到你的摸摸了。', '再忙，也要记得喝水喔。', '今天也有认真照顾自己吗？', '你已经做得很好啦，慢慢来。'];
  $('cat-message').textContent = messages[Math.floor(Math.random() * messages.length)];
});
window.catGuard.subscribe(render);
window.catGuard.getState().then((next) => {
  $('work-minutes').value = next.settings.workMinutes; $('break-minutes').value = next.settings.breakMinutes;
  $('auto-start').checked = next.settings.autoStart; $('all-displays').checked = next.settings.allDisplays;
  render(next);
}).catch(() => notify('暂时无法连接计时器，请重新打开应用。'));
