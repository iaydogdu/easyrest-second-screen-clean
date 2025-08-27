const { app, BrowserWindow, screen, ipcMain, autoUpdater, dialog } = require('electron');
const path = require('path');
const express = require('express');

let win = null;
let server = null;

const HTTP_PORT = process.env.SECOND_SCREEN_PORT || 37251;

// AutoUpdater ayarları - sadece packaged uygulamada çalışır
const isDev = !app.isPackaged;

if (!isDev) {
  console.log('[AutoUpdater] Production modu - Güvenli otomatik güncelleme aktif');
  
  // Güvenli AutoUpdater ayarları
  try {
    // GitHub Releases URL'i manuel olarak ayarla
    const updateUrl = `https://github.com/iaydogdu/easyrest-second-screen-clean/releases/latest/download/latest.yml`;
    console.log('[AutoUpdater] Update URL:', updateUrl);
    
    // Event handler'ları önce tanımla
    autoUpdater.on('checking-for-update', () => {
      console.log('[AutoUpdater] Güncelleme kontrol ediliyor...');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('[AutoUpdater] Güncelleme mevcut:', info.version);
      if (win && win.webContents) {
        win.webContents.send('update-available', info);
      }
    });

    autoUpdater.on('update-not-available', () => {
      console.log('[AutoUpdater] Son sürüm kullanılıyor.');
    });

    autoUpdater.on('error', (err) => {
      console.log('[AutoUpdater] Güncelleme hatası (normal):', err.message);
      // Hata durumunda sessiz kalır, crash etmez
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const percent = Math.round(progressObj.percent);
      console.log(`[AutoUpdater] İndiriliyor: ${percent}%`);
    });

    autoUpdater.on('update-downloaded', () => {
      console.log('[AutoUpdater] Güncelleme hazır! 5 saniye sonra yeniden başlatılacak...');
      if (win && win.webContents) {
        win.webContents.send('update-downloaded');
      }
      
      // 5 saniye bekle ve otomatik yeniden başlat
      setTimeout(() => {
        console.log('[AutoUpdater] Yeniden başlatılıyor...');
        autoUpdater.quitAndInstall();
      }, 5000);
    });

    // GitHub Releases için feed URL ayarla
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'iaydogdu',
      repo: 'easyrest-second-screen-clean',
      private: false
    });
    
    console.log('[AutoUpdater] GitHub Releases bağlantısı kuruldu');
    
  } catch (error) {
    console.log('[AutoUpdater] Kurulum hatası (devam ediyor):', error.message);
  }
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
  
  // Otomatik güncelleme kontrolü (sadece production'da)
  if (!isDev) {
    // 5 saniye sonra ilk kontrol
    setTimeout(() => {
      console.log('[AutoUpdater] İlk güncelleme kontrolü başlatılıyor...');
      try {
        autoUpdater.checkForUpdatesAndNotify();
      } catch (error) {
        console.log('[AutoUpdater] İlk kontrol hatası (normal):', error.message);
      }
    }, 5000);
    
    // Her 10 dakikada bir kontrol et
    setInterval(() => {
      console.log('[AutoUpdater] Periyodik güncelleme kontrolü...');
      try {
        autoUpdater.checkForUpdatesAndNotify();
      } catch (error) {
        console.log('[AutoUpdater] Periyodik kontrol hatası (normal):', error.message);
      }
    }, 10 * 60 * 1000); // 10 dakika
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
