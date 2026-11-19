const { app, BrowserWindow, screen, ipcMain, net } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const express = require('express');

let win = null;
let server = null;

const HTTP_PORT = process.env.SECOND_SCREEN_PORT || 37251;

// AutoUpdater ayarları - sadece packaged uygulamada çalışır
const isDev = !app.isPackaged;

if (!isDev) {
  console.log('[AutoUpdater] Production modu - electron-updater kullaniliyor');
  
  // electron-updater ayarlari
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  
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
      win.webContents.send('update-error', { message: err?.message || String(err) });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent);
    console.log(`[AutoUpdater] Indiriliyor: ${percent}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Guncelleme hazir:', info?.version, '- ekran bosa dusunce kurulacak');
    if (win && win.webContents) {
      win.webContents.send('update-downloaded', { version: info?.version });
    }
    guncellemeyiBostaKur();
  });
  
  console.log('[AutoUpdater] electron-updater hazir - GitHub: iaydogdu/easyrest-second-screen-clean');
} else {
  console.log('[AutoUpdater] Development modu - guncelleme kontrolu devre disi');
}

// ── Güncellemeyi ekran boştayken kur ─────────────────────────────────────
// İndirilen güncelleme, müşteri sipariş/ödeme görürken uygulamayı kapatmasın diye
// ekran boşa düşene kadar bekletilir: açık sipariş yok ve 2 dk'dır POS'tan istek
// gelmemiş olmalı. POS /clear göndermeden kapanırsa diye 30 dk hareketsizlikte
// sipariş açık görünse bile kurulur. Uygulama kapanırken de kurulur (autoInstallOnAppQuit).
const BOSTA_BEKLEME_MS = 2 * 60 * 1000;
const ZORLA_KUR_MS = 30 * 60 * 1000;
let aktifSiparis = false;
let sonEkranHareketi = 0;
let guncellemeZamanlayici = null;

function ekranHareketi(aktif) {
  sonEkranHareketi = Date.now();
  if (typeof aktif === 'boolean') aktifSiparis = aktif;
}

function guncellemeyiBostaKur() {
  if (guncellemeZamanlayici) return;
  const dene = () => {
    const sessizlik = Date.now() - sonEkranHareketi;
    const bosta = sessizlik >= BOSTA_BEKLEME_MS && (!aktifSiparis || sessizlik >= ZORLA_KUR_MS);
    if (!bosta) return;
    clearInterval(guncellemeZamanlayici);
    console.log('[AutoUpdater] Ekran bosta - guncelleme kuruluyor...');
    autoUpdater.quitAndInstall();
  };
  guncellemeZamanlayici = setInterval(dene, 30 * 1000);
  dene();
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

// ── Arka plan resmi yerel önbelleği ──────────────────────────────────────
// POS her /update'te aynı arkaPlanResmi URL'ini gönderir. Resim URL başına
// bir kez indirilip userData/reklam-cache altına kaydedilir; URL aynı kaldıkça
// diskteki dosya kullanılır, URL değişince yenisi indirilip eskisi silinir.
const REKLAM_MAX_BYTES = 30 * 1024 * 1024;   // 30 MB üst sınır
const REKLAM_RETRY_MS = 60 * 1000;           // başarısız indirmeyi en erken 1 dk sonra tekrar dene
let reklamCacheDir = null;
let reklamMeta = { url: null, file: null };  // diskteki geçerli kopya
let reklamIndirilen = null;                  // şu an indirilen URL
let reklamSonHata = { url: null, at: 0 };

function reklamMetaPath() { return path.join(reklamCacheDir, 'meta.json'); }

function initReklamCache() {
  reklamCacheDir = path.join(app.getPath('userData'), 'reklam-cache');
  try {
    fs.mkdirSync(reklamCacheDir, { recursive: true });
    const meta = JSON.parse(fs.readFileSync(reklamMetaPath(), 'utf8'));
    if (meta?.url && meta?.file && fs.existsSync(path.join(reklamCacheDir, meta.file))) {
      reklamMeta = meta;
      console.log('[Reklam] Yerel kopya bulundu:', meta.file);
    }
  } catch (_) { /* ilk çalıştırma - meta yok */ }
}

function reklamLocalUrl() {
  return pathToFileURL(path.join(reklamCacheDir, reklamMeta.file)).href;
}

// /update payload'undaki uzak URL'i yerel kopyayla değiştirir.
// Yerel kopya yoksa uzak URL'i olduğu gibi bırakır ve arka planda indirmeyi başlatır.
let reklamIstenen = null;                    // POS'un en son gönderdiği URL
function resolveArkaPlanResmi(url) {
  reklamIstenen = url;
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return url;
  if (reklamMeta.url === url) return reklamLocalUrl();
  indirArkaPlanResmi(url);
  return url;
}

async function indirArkaPlanResmi(url) {
  if (reklamIndirilen === url) return;
  if (reklamSonHata.url === url && Date.now() - reklamSonHata.at < REKLAM_RETRY_MS) return;
  reklamIndirilen = url;
  const tmp = path.join(reklamCacheDir, 'indiriliyor.tmp');
  try {
    console.log('[Reklam] Yeni resim indiriliyor:', url);
    const res = await net.fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) throw new Error('Resim değil: ' + type);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > REKLAM_MAX_BYTES) throw new Error('Dosya çok büyük: ' + buf.length);

    const ext = (path.extname(new URL(url).pathname) || '.' + type.split('/')[1] || '.img')
      .toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6);
    const file = crypto.createHash('sha1').update(url).digest('hex') + ext;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, path.join(reklamCacheDir, file));

    const eski = reklamMeta.file;
    reklamMeta = { url, file };
    fs.writeFileSync(reklamMetaPath(), JSON.stringify(reklamMeta));
    if (eski && eski !== file) fs.rm(path.join(reklamCacheDir, eski), { force: true }, () => {});
    console.log(`[Reklam] Kaydedildi: ${file} (${Math.round(buf.length / 1024)} KB)`);

    // Ekran hâlâ bu URL'i gösteriyorsa yerel kopyaya geçir
    if (reklamIstenen === url && win && win.webContents) win.webContents.send('data:update', { arkaPlanResmi: reklamLocalUrl() });
  } catch (err) {
    console.log('[Reklam] İndirme hatası:', err.message);
    reklamSonHata = { url, at: Date.now() };
    fs.rm(tmp, { force: true }, () => {});
  } finally {
    if (reklamIndirilen === url) reklamIndirilen = null;
  }
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
    if (Object.prototype.hasOwnProperty.call(payload, 'arkaPlanResmi')) {
      payload.arkaPlanResmi = resolveArkaPlanResmi(payload.arkaPlanResmi);
    }
    if (payload.isCompleted === true) ekranHareketi(false);
    else if (Array.isArray(payload.orderItems)) ekranHareketi(payload.orderItems.length > 0);
    else ekranHareketi();
    if (win && win.webContents) win.webContents.send('data:update', payload);
    res.json({ ok: true });
  });

  api.post('/clear', (_req, res) => {
    ekranHareketi(false);
    if (win && win.webContents) win.webContents.send('data:clear', { isCompleted: true });
    res.json({ ok: true });
  });

  api.post('/error', (req, res) => {
    const payload = req.body || {};
    if (win && win.webContents) win.webContents.send('data:error', payload);
    res.json({ ok: true });
  });

  api.post('/para-ustu', (req, res) => {
    const payload = req.body || {};
    ekranHareketi();
    if (win && win.webContents) win.webContents.send('data:para-ustu', payload);
    res.json({ ok: true });
  });

  api.post('/hide-para-ustu', (req, res) => {
    ekranHareketi();
    if (win && win.webContents) win.webContents.send('data:hide-para-ustu');
    res.json({ ok: true });
  });

  // Kasa açık/kapalı durumu
  // Body: { "kapali": true | false, "mesaj"?: "Lütfen diğer kasayı kullanınız" }
  // kapali=true  -> sol panelde büyük "Kasa Kapalıdır" yazısı, sağdaki reklam devam eder
  // kapali=false -> ekran normale döner
  api.post('/kasa-durumu', (req, res) => {
    const { kapali, mesaj } = req.body || {};
    if (typeof kapali !== 'boolean') {
      return res.status(400).json({ ok: false, error: '"kapali" alanı true/false olmalı' });
    }
    const payload = { kapali, mesaj: typeof mesaj === 'string' ? mesaj.slice(0, 200) : '' };
    if (win && win.webContents) win.webContents.send('data:kasa-durumu', payload);
    res.json({ ok: true, kapali });
  });

  server = api.listen(HTTP_PORT, '127.0.0.1', () =>
    console.log(`[SecondScreen] Server çalışıyor: 127.0.0.1:${HTTP_PORT}`));
}

ipcMain.handle('app:version', () => app.getVersion());

// IPC handler - logo'ya 5 kere tıklama ile kapat
ipcMain.on('app:quit', () => {
  console.log('[SecondScreen] Logo 5x click - uygulama kapatılıyor');
  app.quit();
});

app.whenReady().then(() => {
  initReklamCache();
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
    
    // Her 5 dakikada bir periyodik kontrol
    setInterval(() => {
      console.log('[AutoUpdater] Periyodik guncelleme kontrolu (5dk)...');
      try {
        autoUpdater.checkForUpdates();
      } catch (error) {
        console.log('[AutoUpdater] Periyodik kontrol hatasi (normal):', error.message);
      }
    }, 5 * 60 * 1000);
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
