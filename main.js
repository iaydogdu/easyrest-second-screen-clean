const { app, BrowserWindow, screen, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const express = require('express');

let win = null;
let server = null;

const HTTP_PORT = process.env.SECOND_SCREEN_PORT || 37251;

// AutoUpdater ayarları - sadece packaged uygulamada çalışır
const isDev = false; // TEST İÇİN GEÇİCİ OLARAK FALSE

if (!isDev) {
  console.log('[AutoUpdater] Production modu - electron-updater kullaniliyor');
  
  // electron-updater ayarlari
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  
  // Development modunda da çalışması için zorla
  autoUpdater.forceDevUpdateConfig = true;
  
  // GitHub repository ayarlari
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'iaydogdu',
    repo: 'easyrest-second-screen-clean',
    private: false
  });
  
  // Event handlerlar
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Guncelleme kontrol ediliyor...');
    if (win && win.webContents) {
      win.webContents.send('update-checking');
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Guncelleme mevcut:', info.version);
    if (win && win.webContents) {
      win.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] Son surum kullaniliyor.');
    if (win && win.webContents) {
      win.webContents.send('update-not-available');
    }
  });

  autoUpdater.on('error', (err) => {
    console.log('[AutoUpdater] Guncelleme hatasi:', err.message);
    if (win && win.webContents) {
      win.webContents.send('update-error', err);
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent);
    console.log(`[AutoUpdater] Indiriliyor: ${percent}%`);
  });

  autoUpdater.on('update-downloaded', () => {
    console.log('[AutoUpdater] Guncelleme hazir! 5 saniye sonra yeniden baslatilacak...');
    if (win && win.webContents) {
      win.webContents.send('update-downloaded');
    }
    
    // 5 saniye bekle ve otomatik yeniden başlat
    setTimeout(() => {
      console.log('[AutoUpdater] Yeniden baslatiliyor...');
      autoUpdater.quitAndInstall();
    }, 5000);
  });
  
  console.log('[AutoUpdater] electron-updater hazir - GitHub: iaydogdu/easyrest-second-screen-clean');
} else {
  console.log('[AutoUpdater] Development modu - guncelleme kontrolu devre disi');
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
  
  // Otomatik güncelleme kontrolü (sadece production'da)
  if (!isDev) {
    // 5 saniye sonra ilk kontrol
    setTimeout(() => {
      console.log('[AutoUpdater] Ilk guncelleme kontrolu baslatiliyor...');
      try {
        autoUpdater.checkForUpdates();
      } catch (error) {
        console.log('[AutoUpdater] Ilk kontrol hatasi (normal):', error.message);
      }
    }, 5000);
    
    // TEST: Her 10 saniyede bir kontrol et (geçici)
    setInterval(() => {
      console.log('[AutoUpdater] TEST - Periyodik guncelleme kontrolu (10sn)...');
      try {
        autoUpdater.checkForUpdates();
      } catch (error) {
        console.log('[AutoUpdater] Periyodik kontrol hatasi (normal):', error.message);
      }
    }, 10 * 1000); // 10 saniye - TEST İÇİN
  }
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
