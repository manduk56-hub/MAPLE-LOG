'use strict';
const { app, BrowserWindow, Menu, dialog, protocol, session, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
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
    if (process.platform === 'win32' && !app.isPackaged) {
      // Windows resolves taskbar groups through Start Menu shortcuts. Replace
      // a stale installed-app link with the current source launcher and icon.
      const programs = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
      await fs.mkdir(programs, { recursive: true });
      if (!shell.writeShortcutLink(path.join(programs, '메이플로그.lnk'), 'create', {
        target: process.execPath,
        cwd: app.getAppPath(),
        args: `"${app.getAppPath()}"`,
        description: '메이플로그 로컬 소스 실행',
        icon: path.join(app.getAppPath(), 'assets', 'maplelog-icon.ico'),
        iconIndex: 0,
        appUserModelId: 'com.maplelog.diary'
      })) console.warn('메이플로그 시작 메뉴 바로가기를 갱신하지 못했습니다.');
    }
    const allowedFiles = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/game-theme.css': 'game-theme.css', '/maple-theme.css': 'maple-theme.css', '/assets/maple-autumn.jpg': 'assets/maple-autumn.jpg', '/assets/maple-scene.jpg': 'assets/maple-scene.jpg', '/assets/maple-character.png': 'assets/maple-character.png', '/assets/meso.png': 'assets/meso.png', '/assets/fonts/Maplestory-Light.ttf': 'assets/fonts/Maplestory-Light.ttf', '/assets/fonts/Maplestory-Bold.ttf': 'assets/fonts/Maplestory-Bold.ttf' };
    for (const weight of ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black']) allowedFiles[`/assets/fonts/NotoSansKR-${weight}.woff2`] = `assets/fonts/NotoSansKR-${weight}.woff2`;
    allowedFiles['/assets/boss-count.png'] = 'assets/boss-count.png';
    allowedFiles['/assets/item-count.png'] = 'assets/item-count.png';
    allowedFiles['/assets/expense-empty.png'] = 'assets/expense-empty.png';
    allowedFiles['/assets/maplelog-icon.png'] = 'assets/maplelog-icon.png';
    allowedFiles['/content.js'] = 'content.js';
    allowedFiles['/backup.js'] = 'backup.js';
    allowedFiles['/pagination.js'] = 'pagination.js';
    for (const file of ['expense-model.js', 'expense.js', 'diary-ui.css']) allowedFiles[`/${file}`] = file;
    const types = { '.json': 'application/json', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
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
      icon: path.join(app.getAppPath(), 'assets', 'maplelog-icon.ico'),
      backgroundColor: '#f6f5ef', show: false, autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, devTools: !app.isPackaged }
    });
    if (process.platform === 'win32') {
      // The source launcher is electron.exe, so Windows needs Maplelog's own
      // taskbar identity and icon before the window becomes visible.
      mainWindow.setAppDetails({
        appId: 'com.maplelog.diary',
        appIconPath: path.join(app.getAppPath(), 'assets', 'maplelog-icon.ico'),
        appIconIndex: 0,
        relaunchCommand: app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${app.getAppPath()}"`,
        relaunchDisplayName: '메이플로그'
      });
      const nativeHandle = mainWindow.getNativeWindowHandle();
      const handle = nativeHandle.length === 8 ? nativeHandle.readBigUInt64LE().toString() : String(nativeHandle.readUInt32LE());
      const helperPath = path.join(__dirname, 'korean-input.ps1').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
      const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const helper = spawn(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPath, '-WindowHandle', handle], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
      helper.on('error', () => {}); helper.stdin.on('error', () => {});
      let lastRequest = 0;
      ipcMain.on('maplelog:korean-input', event => {
        if (event.sender !== mainWindow.webContents || event.senderFrame?.url !== 'maplelog://app/' && event.senderFrame?.url !== 'maplelog://app/index.html') return;
        if (!mainWindow.isFocused() || helper.exitCode !== null || helper.killed || Date.now() - lastRequest < 100) return;
        lastRequest = Date.now(); helper.stdin.write('korean\n');
      });
      mainWindow.on('closed', () => { helper.stdin.end(); helper.kill(); });
    }
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
