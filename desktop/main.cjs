'use strict';
const { app, BrowserWindow, Menu, dialog, protocol, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

// A fixed, secure origin keeps the diary independent of browser profiles and local ports.
protocol.registerSchemesAsPrivileged([{ scheme: 'maplelog', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.setName('메이플로그');
app.setPath('userData', path.join(app.getPath('appData'), 'Maplelog'));
app.setAppUserModelId('com.maplelog.diary');
const hasLock = app.requestSingleInstanceLock();
let mainWindow;
if (!hasLock) app.quit();
else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  });
  app.whenReady().then(async () => {
    const allowedFiles = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/game-theme.css': 'game-theme.css', '/maple-theme.css': 'maple-theme.css', '/assets/maple-autumn.jpg': 'assets/maple-autumn.jpg', '/assets/maple-scene.jpg': 'assets/maple-scene.jpg', '/assets/maple-character.png': 'assets/maple-character.png', '/assets/meso.png': 'assets/meso.png', '/assets/fonts/Maplestory-Light.ttf': 'assets/fonts/Maplestory-Light.ttf', '/assets/fonts/Maplestory-Bold.ttf': 'assets/fonts/Maplestory-Bold.ttf' };
    allowedFiles['/content.js'] = 'content.js';
    allowedFiles['/backup.js'] = 'backup.js';
    const types = { '.json': 'application/json', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' };
    protocol.handle('maplelog', async request => {
      const url = new URL(request.url);
      const file = url.hostname === 'app' && allowedFiles[url.pathname];
      if (!file) return new Response('Not found', { status: 404 });
      try {
        const content = await fs.readFile(path.join(app.getAppPath(), file));
        return new Response(content, { headers: {
          'Content-Type': `${types[path.extname(file)]}; charset=utf-8`,
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'"
        } });
      } catch { return new Response('Could not read file', { status: 500 }); }
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({ title: '메이플로그 백업 저장', defaultPath: path.join(app.getPath('documents'), item.getFilename()), filters: [{ name: '메이플로그 백업', extensions: ['json'] }] });
    });
    let state = {};
    try { state = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'window.json'), 'utf8')); } catch {}
    mainWindow = new BrowserWindow({
      width: Math.max(860, Math.min(1800, Number(state.width) || 1280)),
      height: Math.max(640, Math.min(1200, Number(state.height) || 860)),
      minWidth: 780, minHeight: 600, title: '메이플로그',
      icon: path.join(app.getAppPath(), 'assets', 'icon.ico'),
      backgroundColor: '#f6f5ef', show: true, autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, devTools: !app.isPackaged }
    });
    Menu.setApplicationMenu(null);
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (url !== 'maplelog://app/' && url !== 'maplelog://app/index.html') event.preventDefault();
    });
    mainWindow.once('ready-to-show', () => { if (state.maximized) mainWindow.maximize(); mainWindow.show(); });
    mainWindow.on('close', () => {
      const { width, height } = mainWindow.getNormalBounds();
      try {
        require('node:fs').mkdirSync(app.getPath('userData'), { recursive: true });
        require('node:fs').writeFileSync(path.join(app.getPath('userData'), 'window.json'), JSON.stringify({ width, height, maximized: mainWindow.isMaximized() }));
      } catch { /* A window preference failure must not prevent closing the diary. */ }
    });
    mainWindow.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3) dialog.showErrorBox('메이플로그 실행 오류', `${description}\n${url}`);
    });
    await mainWindow.loadURL('maplelog://app/');
  }).catch(error => { dialog.showErrorBox('메이플로그 실행 오류', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
