const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pipeline } = require('stream/promises');
const { Readable, Transform } = require('stream');
const { Client, Authenticator } = require('minecraft-launcher-core');
const AdmZip = require('adm-zip');

// ---- Config (build.gradle / gradle.properties se liya gaya) ----
const MC_VERSION = '1.21.11';
const FABRIC_LOADER = '0.18.4';
const FABRIC_API_VERSION = '0.141.3+1.21.11';
const FABRIC_ID = `fabric-loader-${FABRIC_LOADER}-${MC_VERSION}`;
const GITHUB_REPO = 'iamniketan44-cpu/ghost-client';
const JAVA_URL =
  'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse';
const UA = 'GhostLauncher/1.0';

let win = null;
let busy = false;

const ROOT = () => path.join(app.getPath('appData'), '.ghostlauncher');
const SETTINGS_FILE = () => path.join(ROOT(), 'settings.json');

// ---- Helpers ----
const send = (ch, data) => {
  if (win && !win.isDestroyed()) win.webContents.send(ch, data);
};
const log = (m) => send('log', String(m).slice(0, 400));
const progress = (pct, text) =>
  send('progress', { pct: Math.max(0, Math.min(100, Math.round(pct))), text });

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8'));
  } catch {
    return {};
  }
}
function saveSettings(s) {
  fs.mkdirSync(ROOT(), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(s));
}

async function fetchJson(url, extraHeaders = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...extraHeaders } });
  if (!res.ok) throw new Error(`Request fail (${res.status}): ${url}`);
  return res.json();
}

async function download(url, dest, onPct) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download fail (${res.status}): ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let done = 0;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = dest + '.part';
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      done += chunk.length;
      if (total && onPct) onPct(done / total);
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(part));
  fs.renameSync(part, dest);
}

function removeOthers(dir, regex, keepName) {
  for (const f of fs.readdirSync(dir)) {
    if (regex.test(f) && f !== keepName) {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch {}
    }
  }
}
const hasJar = (dir, regex) => fs.readdirSync(dir).some((f) => regex.test(f));

// ---- Java 21 (automatic) ----
async function ensureJava() {
  const javaw = path.join(ROOT(), 'runtime', 'jre21', 'bin', 'javaw.exe');
  if (fs.existsSync(javaw)) return javaw;

  log('Java 21 download ho raha hai (sirf pehli baar)...');
  const runtime = path.join(ROOT(), 'runtime');
  const zipPath = path.join(runtime, 'jre21.zip');
  await download(JAVA_URL, zipPath, (p) =>
    progress(2 + p * 20, `Java download ho raha hai ${Math.round(p * 100)}%`)
  );

  progress(23, 'Java extract ho raha hai...');
  const tmp = path.join(runtime, 'tmp');
  fs.rmSync(tmp, { recursive: true, force: true });
  new AdmZip(zipPath).extractAllTo(tmp, true);
  const inner = fs.readdirSync(tmp).find((n) => fs.statSync(path.join(tmp, n)).isDirectory());
  if (!inner) throw new Error('Java zip sahi nahi tha');
  fs.rmSync(path.join(runtime, 'jre21'), { recursive: true, force: true });
  fs.renameSync(path.join(tmp, inner), path.join(runtime, 'jre21'));
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });

  if (!fs.existsSync(javaw)) throw new Error('Java install nahi ho paya');
  return javaw;
}

// ---- Fabric profile ----
async function ensureFabric() {
  const dir = path.join(ROOT(), 'versions', FABRIC_ID);
  const file = path.join(dir, `${FABRIC_ID}.json`);
  if (fs.existsSync(file)) return;
  log('Fabric setup ho raha hai...');
  const profile = await fetchJson(
    `https://meta.fabricmc.net/v2/versions/loader/${MC_VERSION}/${FABRIC_LOADER}/profile/json`
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(profile));
}

// ---- Mods: Fabric API + Ghost Menu ----
async function ensureMods() {
  const mods = path.join(ROOT(), 'game', 'mods');
  fs.mkdirSync(mods, { recursive: true });

  // Fabric API (Modrinth)
  try {
    const q =
      `https://api.modrinth.com/v2/project/fabric-api/version` +
      `?game_versions=${encodeURIComponent(JSON.stringify([MC_VERSION]))}` +
      `&loaders=${encodeURIComponent(JSON.stringify(['fabric']))}`;
    const versions = await fetchJson(q);
    const v = versions.find((x) => x.version_number === FABRIC_API_VERSION) || versions[0];
    if (!v) throw new Error('Fabric API version nahi mila');
    const f = v.files.find((x) => x.primary) || v.files[0];
    const dest = path.join(mods, f.filename);
    if (!fs.existsSync(dest)) {
      log('Fabric API download ho raha hai...');
      await download(f.url, dest);
    }
    removeOthers(mods, /^fabric-api.*\.jar$/i, f.filename);
  } catch (e) {
    if (!hasJar(mods, /^fabric-api.*\.jar$/i)) throw e;
    log('Fabric API update skip: ' + e.message);
  }

  // Ghost Menu (GitHub release)
  try {
    const releases = await fetchJson(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`,
      { Accept: 'application/vnd.github+json' }
    );
    let asset = null;
    for (const r of releases) {
      if (r.draft) continue;
      asset = r.assets.find((a) => /^ghostmenu.*\.jar$/i.test(a.name));
      if (asset) break;
    }
    if (!asset) throw new Error('GitHub release mein ghostmenu jar nahi mili');
    const dest = path.join(mods, asset.name);
    const same = fs.existsSync(dest) && fs.statSync(dest).size === asset.size;
    if (!same) {
      log('Ghost Menu download ho raha hai...');
      await download(asset.browser_download_url, dest);
    }
    removeOthers(mods, /^ghostmenu.*\.jar$/i, asset.name);
  } catch (e) {
    if (!hasJar(mods, /^ghostmenu.*\.jar$/i)) throw e;
    log('Ghost Menu update skip: ' + e.message);
  }
}

// ---- Play ----
async function play({ username, ram }) {
  if (busy) return;
  busy = true;
  send('state', 'busy');
  try {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username || '')) {
      throw new Error('Username 3-16 characters ka hona chahiye (sirf English letters, numbers, _).');
    }
    const ramGb = Math.max(1, Number(ram) || 4);
    saveSettings({ username, ram: ramGb });
    fs.mkdirSync(ROOT(), { recursive: true });

    progress(1, 'Shuru ho raha hai...');
    const javaPath = await ensureJava();

    progress(30, 'Fabric check ho raha hai...');
    await ensureFabric();

    progress(35, 'Mods check ho rahe hain...');
    await ensureMods();

    progress(40, 'Minecraft files check ho rahi hain...');
    const launcher = new Client();
    launcher.on('debug', (m) => log(m));
    launcher.on('data', (m) => log(m));
    launcher.on('progress', (e) => {
      if (e && e.total) {
        progress(40 + 55 * (e.task / e.total), `Minecraft files: ${e.type} ${e.task}/${e.total}`);
      }
    });
    launcher.on('close', (code) => {
      log(`Game band hua (code ${code})`);
      busy = false;
      progress(0, '');
      send('state', 'idle');
    });

    const proc = await launcher.launch({
      authorization: Authenticator.getAuth(username),
      root: ROOT(),
      javaPath,
      version: { number: MC_VERSION, type: 'release', custom: FABRIC_ID },
      memory: { max: `${ramGb}G`, min: '1G' },
      overrides: { gameDirectory: path.join(ROOT(), 'game') },
    });
    if (!proc) throw new Error('Game start nahi hua. "Log dikhao" dabakar error dekhein.');

    progress(100, 'Game chal raha hai! Thodi der mein window khulegi.');
    send('state', 'running');
  } catch (e) {
    busy = false;
    progress(0, '');
    send('state', 'idle');
    send('error', e.message || String(e));
  }
}

// ---- Window ----
function createWindow() {
  win = new BrowserWindow({
    width: 480,
    height: 640,
    resizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1117',
    title: 'Ghost Launcher',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('init', () => {
  const s = loadSettings();
  return {
    username: s.username || '',
    ram: s.ram || 4,
    totalGb: Math.floor(os.totalmem() / 1024 ** 3),
    mcVersion: MC_VERSION,
  };
});
ipcMain.handle('play', (_e, data) => play(data));
ipcMain.handle('open-folder', () => {
  fs.mkdirSync(path.join(ROOT(), 'game'), { recursive: true });
  return shell.openPath(path.join(ROOT(), 'game'));
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
