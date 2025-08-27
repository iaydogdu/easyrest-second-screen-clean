const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const express = require('express');

let win = null;
let server = null;

const HTTP_PORT = process.env.SECOND_SCREEN_PORT || 37251;

// AutoUpdater ayarları - sadece packaged uygulamada çalışır
const isDev = !app.isPackaged;

if (!isDev) {
  console.log('[AutoUpdater] Production modu - AutoUpdater devre dışı (güvenlik için)');
  console.log('[AutoUpdater] Manuel güncelleme: https://github.com/iaydogdu/easyrest-second-screen-clean/releases');
} else {
  console.log('[AutoUpdater] Development modu - güncelleme kontrolü devre dışı');
}

function createWindow() {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const secondary = displays.find(d => d.id !== primary.id) || primary;

  win = new BrowserWindow({
    x: secondary.bounds.x,
    y: secondary.bounds.y,
    width: secondary.size.width,
    height: secondary.size.height,
    frame: false,
    fullscreen: true,
    kiosk: true,
    alwaysOnTop: 'screen-saver',
    backgroundColor: '#000000',
    webPreferences: { 
      nodeIntegration: true, 
      contextIsolation: false 
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

function createHttpServer() {
  const api = express();
  api.use(express.json({ limit: '1mb' }));
  
  // CORS
  api.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  api.get('/health', (_req, res) => res.json({ ok: true, hasWindow: !!win }));

  api.post('/update', (req, res) => {
    const payload = req.body || {};
    if (win && win.webContents) win.webContents.send('data:update', payload);
    res.json({ ok: true });
  });

  api.post('/clear', (_req, res) => {
    if (win && win.webContents) win.webContents.send('data:clear', { isCompleted: true });
    res.json({ ok: true });
  });

  server = api.listen(HTTP_PORT, '127.0.0.1', () =>
    console.log(`[SecondScreen] Server çalışıyor: 127.0.0.1:${HTTP_PORT}`));
}

// IPC handler - logo'ya 5 kere tıklama ile kapat
ipcMain.on('app:quit', () => {
  console.log('[SecondScreen] Logo 5x click - uygulama kapatılıyor');
  app.quit();
});

app.whenReady().then(() => { 
  createWindow(); 
  createHttpServer(); 
  
  console.log('[App] Uygulama başlatıldı - Server: 127.0.0.1:' + HTTP_PORT);
});

app.on('activate', () => { 
  if (BrowserWindow.getAllWindows().length === 0) createWindow(); 
});

app.on('window-all-closed', () => { 
  if (process.platform !== 'darwin') app.quit(); 
});

app.on('will-quit', () => { 
  try { server?.close(); } catch (_) {} 
});
