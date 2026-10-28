// Desktop pet: a transparent, always-on-top window the character lives in. The renderer runs the
// pet (animation, behaviour, stats); this process owns the window, menus, tray and the save file.
const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { writeDiary, DIR: DIARY_DIR } = require('./diary');

// the installed app is named "여우귀 친구"; keep the save where `npm start` has always kept it
app.setPath('userData', path.join(app.getPath('appData'), 'fox-pet'));

const WIN_W = 300, WIN_H = 380;          // fits the sprite at the largest size plus bubble/status above
const ANIMS = ['idle', 'walk_left', 'walk_right', 'sleep', 'eat', 'play', 'splat'];
const SAVE = () => path.join(app.getPath('userData'), 'pet.json');

let win = null, tray = null;

if (!app.requestSingleInstanceLock()) app.quit();

function workArea() {
  return screen.getPrimaryDisplay().workArea;
}
// every monitor's work area (the primary one first), for walking and dropping across monitors
function workAreas() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().sort((a, b) => (b.id === primary) - (a.id === primary)).map(d => d.workArea);
}

function createWindow() {
  const wa = workArea();
  win = new BrowserWindow({
    width: WIN_W, height: WIN_H,
    x: Math.round(wa.x + wa.width / 2 - WIN_W / 2), y: wa.y + wa.height - WIN_H,
    transparent: true, frame: false, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, show: false,
    // (no background throttling: the pet must keep animating while other windows have focus)
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setIgnoreMouseEvents(true, { forward: true });   // click-through until the pointer is on the pet
  win.loadFile('index.html');
  win.once('ready-to-show', () => win.showInactive());
  // page errors and warnings go to the terminal running `npm start`
  win.webContents.on('console-message', (_, level, message, line, source) => {
    if (level >= 2) console.error(`[pet] ${message} (${path.basename(source)}:${line})`);
  });
  win.webContents.on('render-process-gone', (_, d) => console.error('[pet] renderer gone:', d.reason));
  win.on('closed', () => { win = null; });
}

// menu shared by the right-click menu and the tray; `st` is the renderer's current settings
function menuTemplate(st) {
  const act = a => () => win && win.webContents.send('action', a);
  return [
    { label: '🍖 밥 주기', click: act('feed') },
    { label: '🎾 놀아 주기', click: act('play') },
    { label: '💤 재우기', click: act('sleep') },
    { type: 'separator' },
    { label: '상태 항상 보기', type: 'checkbox', checked: !!st.statsAlways, click: act('toggle-stats') },
    {
      label: '크기', submenu: [['작게', 0.6], ['보통', 0.8], ['크게', 1]].map(([label, s]) => ({
        label, type: 'radio', checked: st.scale === s, click: act('scale:' + s),
      })),
    },
    { type: 'separator' },
    { label: '📔 일기 보기', click: () => { fs.mkdirSync(DIARY_DIR, { recursive: true }); shell.openPath(DIARY_DIR); } },
    { label: win && win.isVisible() ? '숨기기' : '보이기', click: () => win && (win.isVisible() ? win.hide() : win.showInactive()) },
    { label: '종료', click: () => app.quit() },
  ];
}

let lastSettings = { scale: 0.8, statsAlways: false };

app.whenReady().then(() => {
  // the app was first called wolf-pet: carry its save over to the new name's folder once
  const oldSave = path.join(app.getPath('appData'), 'wolf-pet', 'pet.json');
  if (!fs.existsSync(SAVE()) && fs.existsSync(oldSave)) {
    fs.mkdirSync(path.dirname(SAVE()), { recursive: true });
    fs.copyFileSync(oldSave, SAVE());
  }
  ipcMain.handle('sprites', () => {
    const out = {};
    for (const a of ANIMS) {
      const dir = path.join(__dirname, 'sprites', a);
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
      meta.png = [...Array(meta.frames).keys()].map(i => fs.readFileSync(path.join(dir, String(i).padStart(2, '0') + '.png')));
      out[a] = meta;
    }
    return out;
  });
  ipcMain.handle('screens', () => workAreas());
  ipcMain.handle('cursor', () => screen.getCursorScreenPoint());
  ipcMain.handle('load', () => {
    try { return JSON.parse(fs.readFileSync(SAVE(), 'utf8')); } catch { return null; }
  });
  ipcMain.on('save', (_, state) => {
    lastSettings = { scale: state.scale, statsAlways: state.statsAlways };
    try { fs.writeFileSync(SAVE(), JSON.stringify(state)); } catch (e) { console.error('save failed', e); }
  });
  ipcMain.on('diary', (_, day) => writeDiary(day));
  ipcMain.on('move',(_, x, y) => win && win.setPosition(Math.round(x), Math.round(y)));
  ipcMain.on('mouse-through', (_, on) => win && win.setIgnoreMouseEvents(on, { forward: true }));
  ipcMain.on('menu', (_, st) => {
    lastSettings = st;
    Menu.buildFromTemplate(menuTemplate(st)).popup({ window: win });
  });

  createWindow();

  const icon = nativeImage.createFromPath(path.join(__dirname, 'sprites', 'idle', '00.png'))
    .crop({ x: 70, y: 10, width: 120, height: 120 }).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('여우귀 친구');
  tray.on('click', () => win && (win.isVisible() ? win.hide() : win.showInactive()));
  tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate(menuTemplate(lastSettings))));

  const sendScreens = () => win && win.webContents.send('screens', workAreas());
  for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(ev, sendScreens);
});

app.on('second-instance', () => win && win.showInactive());
app.on('window-all-closed', () => app.quit());
