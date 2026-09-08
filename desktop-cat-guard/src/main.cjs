const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, globalShortcut, powerMonitor, dialog } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Timer } = require('./timer.cjs');
const { readSettings, saveSettings } = require('./settings.cjs');

const ROOT = path.join(__dirname, '..');
const TEST = process.env.CAT_GUARD_TEST === '1';
if (TEST && process.env.CAT_GUARD_TEST_DATA) app.setPath('userData', process.env.CAT_GUARD_TEST_DATA);
app.setName('猫猫守卫');
let mainWindow, tray, timer, settingsFile, interval, quitting = false;
let overlays = [], overlayKind = null, previewUntil = 0, resumeAfterSleep = false;
let lastMenuKey = '';
const webPreferences = { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true };

function secure(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('render-process-gone', () => {
    // 即使渲染器崩溃也不留下无法操作的透明遮罩，计时器回到可重新启动的状态。
    if (overlays.includes(win)) { closeOverlays(); timer.reset(); broadcast(); }
  });
}
function showMain() {
  if (!mainWindow || mainWindow.isDestroyed()) createMain();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function createMain() {
  mainWindow = new BrowserWindow({ width: 1000, height: 740, minWidth: 880, minHeight: 690,
    title: '猫猫守卫', backgroundColor: '#f7f6f2', show: false,
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 19 }, webPreferences });
  secure(mainWindow);
  mainWindow.loadFile(path.join(ROOT, 'ui/index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => { if (!quitting && tray) { event.preventDefault(); mainWindow.hide(); } });
}
function closeOverlays() {
  const old = overlays;
  overlays = [];
  overlayKind = null;
  previewUntil = 0;
  for (const win of old) if (!win.isDestroyed()) win.destroy();
}
function overlayState() {
  return { ...timer.snapshot(), overlayKind, previewUntil };
}
function openOverlays(kind) {
  closeOverlays();
  overlayKind = kind;
  if (kind === 'preview') previewUntil = Date.now() + 12000;
  const displays = timer.settings.allDisplays ? screen.getAllDisplays() : [screen.getPrimaryDisplay()];
  for (const display of displays) {
    const win = new BrowserWindow({ ...display.workArea, show: false, frame: false, transparent: true,
      backgroundColor: '#00000000', resizable: false, movable: false, minimizable: false,
      maximizable: false, skipTaskbar: true, hasShadow: false, fullscreenable: false,
      title: '猫猫守卫 · 休息一下', webPreferences });
    overlays.push(win);
    secure(win);
    win.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // 使用工作区而非整个物理屏幕：macOS 会自动把普通窗口避开菜单栏，
    // 强行使用全屏尺寸会导致底部越界。保留菜单栏也让用户始终能退出。
    // 每块屏幕独立显示，支持副屏位于主屏左侧时的负坐标。
    win.setBounds(display.workArea);
    win.once('ready-to-show', () => { if (overlays.includes(win)) { win.show(); win.webContents.send('guard:update', overlayState()); } });
    win.on('close', (event) => { if (!quitting && overlays.includes(win)) { event.preventDefault(); dismiss(); } });
    win.loadFile(path.join(ROOT, 'ui/break.html')).catch(() => { dismiss(); showMain(); });
  }
}
function dismiss() {
  const kind = overlayKind;
  closeOverlays();
  if (kind === 'break') timer.finishBreak(false);
  broadcast();
}
function syncOverlays() {
  if (timer.phase === 'break' && overlayKind !== 'break') openOverlays('break');
  else if (overlayKind === 'break' && timer.phase !== 'break') closeOverlays();
  else if (overlayKind === 'preview' && Date.now() >= previewUntil) closeOverlays();
}
function broadcast() {
  const state = overlayState();
  for (const win of [mainWindow, ...overlays]) {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('guard:update', state);
  }
  if (tray) {
    const seconds = Math.ceil(state.remainingMs / 1000);
    const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const label = { idle: '等你开始', work: '专注中', paused: '已暂停', break: '休息中' }[state.phase];
    tray.setToolTip(`猫猫守卫 · ${label} ${time}`);
    if (process.platform === 'darwin') tray.setTitle(state.phase === 'idle' ? '' : time, { fontType: 'monospacedDigit' });
    const menuKey = `${state.phase}:${overlayKind}`;
    if (menuKey !== lastMenuKey) { lastMenuKey = menuKey; updateTray(); }
  }
}
function updateTray() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开猫猫守卫', click: showMain },
    { type: 'separator' },
    { label: timer.phase === 'work' ? '暂停专注' : timer.phase === 'paused' ? '继续专注' : '开始专注',
      enabled: timer.phase !== 'break', click: () => { if (timer.phase === 'work') timer.pause(); else timer.start(); broadcast(); } },
    { label: '预览猫猫', enabled: timer.phase !== 'break', click: () => { openOverlays('preview'); broadcast(); } },
    { label: '结束本次休息 / 预览', enabled: !!overlayKind, click: dismiss },
    { label: '停止计时', click: () => { timer.reset(); closeOverlays(); broadcast(); } },
    { type: 'separator' },
    { label: '退出猫猫守卫', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
  ]));
}

// IPC 只接受本应用的主框架；遮罩只拥有解除权限，不能借传参访问文件或执行任意操作。
function senderType(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || event.senderFrame !== event.sender.mainFrame) throw new Error('无效窗口');
  const expected = pathToFileURL(path.join(ROOT, win === mainWindow ? 'ui/index.html' : 'ui/break.html')).href;
  if (event.senderFrame.url !== expected || (win !== mainWindow && !overlays.includes(win))) throw new Error('无效来源');
  return win === mainWindow ? 'main' : 'overlay';
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showMain);
  app.whenReady().then(() => {
    settingsFile = path.join(app.getPath('userData'), 'settings.json');
    timer = new Timer(readSettings(settingsFile));
    app.on('web-contents-created', (_event, contents) => {
      contents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    });
    ipcMain.handle('guard:state', (event) => { senderType(event); return overlayState(); });
    ipcMain.handle('guard:command', (event, action, value) => {
      const type = senderType(event);
      if (type === 'overlay' && action !== 'dismiss') throw new Error('不支持的操作');
      switch (action) {
        case 'start': timer.start(); break;
        case 'pause': timer.pause(); break;
        case 'reset': timer.reset(); closeOverlays(); break;
        case 'dismiss': dismiss(); break;
        case 'preview': if (timer.phase !== 'break') openOverlays('preview'); break;
        case 'settings': {
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('设置格式不正确');
          const next = saveSettings(settingsFile, value);
          timer.updateSettings(next);
          break;
        }
        case 'quit': app.quit(); break;
        default: throw new Error('不支持的操作');
      }
      syncOverlays(); broadcast(); return overlayState();
    });
    createMain();
    const icon = nativeImage.createFromPath(path.join(ROOT, 'assets/tray.png')).resize({ width: 22, height: 22 });
    icon.setTemplateImage(true);
    try { tray = new Tray(icon); tray.on('double-click', showMain); } catch (error) { console.error('托盘不可用', error.message); }
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '猫猫守卫', submenu: [{ label: '关于猫猫守卫', role: 'about' }, { type: 'separator' },
        { label: '打开主窗口', click: showMain }, { label: '结束休息', click: dismiss }, { type: 'separator' }, { role: 'quit', label: '退出猫猫守卫' }] },
      { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: '窗口', submenu: [{ role: 'minimize', label: '最小化' }, { label: '显示主窗口', click: showMain }] },
    ]));
    globalShortcut.register('CommandOrControl+Shift+X', dismiss);
    // 休眠不算工作时间；手动暂停不会因唤醒而被意外恢复。休息则按真实经过的时间结束。
    powerMonitor.on('suspend', () => { resumeAfterSleep = timer.pause(); syncOverlays(); broadcast(); });
    powerMonitor.on('resume', () => { if (resumeAfterSleep && timer.phase === 'paused') timer.start(); resumeAfterSleep = false; timer.tick(); syncOverlays(); broadcast(); });
    const updateDisplays = () => { if (overlayKind) { const kind = overlayKind; const until = previewUntil; openOverlays(kind); if (kind === 'preview') previewUntil = until; } };
    screen.on('display-added', updateDisplays);
    screen.on('display-removed', updateDisplays);
    screen.on('display-metrics-changed', updateDisplays);
    interval = setInterval(() => { timer.tick(); syncOverlays(); broadcast(); }, 250);
    broadcast();
    // 测试入口仅由显式环境变量启用，不在生产页面暴露调试 API。
    if (TEST) global.__catGuardTest = { timer, state: overlayState, sync: () => { timer.tick(); syncOverlays(); broadcast(); }, windows: () => overlays, powerMonitor };
  }).catch((error) => { dialog.showErrorBox('猫猫守卫未能启动', error.message); app.quit(); });
}
app.on('activate', () => { if (app.isReady()) showMain(); });
app.on('before-quit', () => { quitting = true; clearInterval(interval); closeOverlays(); globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => { if (!tray) app.quit(); });
