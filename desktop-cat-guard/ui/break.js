const button = document.getElementById('hold-button');
let startedAt = null, animation, state, dismissing = false;
async function dismiss() {
  if (dismissing) return;
  dismissing = true; stopHold();
  try { await window.catGuard.command('dismiss'); }
  catch { dismissing = false; document.getElementById('hold-hint').textContent = '请重试，或从菜单栏结束休息。'; }
}
function render(next) {
  state = next;
  const preview = next.overlayKind === 'preview';
  const seconds = Math.ceil((preview ? Math.max(0, next.previewUntil - Date.now()) : next.remainingMs) / 1000);
  document.getElementById('break-time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  document.getElementById('break-badge').textContent = preview ? '预览中 · 不影响专注计时' : '猫猫接班啦';
  document.getElementById('escape-button').firstChild.textContent = preview ? '关闭预览 ' : '结束休息 ';
  document.querySelector('[data-cat]').dataset.color = next.settings.cat;
}
function tick(now) {
  if (startedAt === null) return;
  const ratio = Math.min(1, (now - startedAt) / 3000);
  document.getElementById('hold-fill').style.transform = `scaleX(${ratio})`;
  if (ratio >= 1) dismiss(); else animation = requestAnimationFrame(tick);
}
function startHold() { if (startedAt !== null) return; startedAt = performance.now(); animation = requestAnimationFrame(tick); }
function stopHold() { cancelAnimationFrame(animation); startedAt = null; document.getElementById('hold-fill').style.transform = 'scaleX(0)'; }
button.addEventListener('pointerdown', (event) => { if (event.button !== 0) return; event.preventDefault(); button.setPointerCapture(event.pointerId); startHold(); });
button.addEventListener('pointerup', () => {
  if (startedAt !== null) { document.getElementById('hold-hint').textContent = '再陪我一会儿？按住直到进度填满就好。'; const cat = document.querySelector('[data-cat]'); cat.classList.remove('petting'); void cat.offsetWidth; cat.classList.add('petting'); }
  stopHold();
});
for (const name of ['pointercancel', 'lostpointercapture', 'blur']) button.addEventListener(name, stopHold);
button.addEventListener('keydown', (event) => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); if (!event.repeat) startHold(); } });
button.addEventListener('keyup', (event) => { if ([' ', 'Enter'].includes(event.key)) stopHold(); });
window.addEventListener('blur', stopHold);
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') dismiss(); });
document.getElementById('escape-button').addEventListener('click', dismiss);
window.catGuard.subscribe(render);
window.catGuard.getState().then(render);
button.focus();
