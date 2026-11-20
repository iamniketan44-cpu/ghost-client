const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require('electron');
const { Auth } = require('msmc');
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
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify({ ...loadSettings(), ...s }));
}

// ---- Premium (Microsoft) login ----
function encryptToken(t) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(t).toString('base64');
    }
  } catch {}
  return null; // encrypt na ho paye to save nahi karte, har baar login hoga
}
function decryptToken(b64) {
  try {
    return safeStorage.decryptString(Buffer.from(b64, 'base64'));
  } catch {
    return null;
  }
}

let premiumAuth = null;

async function getPremiumAuth() {
  const authManager = new Auth('select_account');
  const s = loadSettings();
  let xbox = null;

  if (s.msToken) {
    const saved = decryptToken(s.msToken);
    if (saved) {
      try {
        progress(1, 'Checking Microsoft account...');
        xbox = await authManager.refresh(saved);
      } catch {
        xbox = null;
      }
    }
  }
  if (!xbox) {
    progress(1, 'Opening Microsoft login window...');
    try {
      xbox = await authManager.launch('electron');
    } catch (e) {
      const m = String((e && (e.message || e)) || '');
      if (/closed/i.test(m)) throw new Error('Login window was closed. Press Play again.');
      throw new Error('Microsoft login failed: ' + m);
    }
  }

  const token = await xbox.getMinecraft();
  if (typeof token.isDemo === 'function' && token.isDemo()) {
    throw new Error('This Microsoft account does not own Minecraft Java Edition.');
  }
  const name = token.profile && token.profile.name;
  let enc = null;
  try {
    enc = encryptToken(xbox.save());
  } catch {}
  saveSettings({ msToken: enc, msName: name || null });
  send('account', name || '');
  premiumAuth = token.mclc();
  return premiumAuth;
}

// ---- Capes (Mojang API, sirf premium) ----
async function mcs(method, p, body) {
  const doReq = () =>
    fetch('https://api.minecraftservices.com' + p, {
      method,
      headers: {
        Authorization: `Bearer ${premiumAuth.access_token}`,
        'Content-Type': 'application/json',
        'User-Agent': UA,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  if (!premiumAuth) await getPremiumAuth();
  let res = await doReq();
  if (res.status === 401) {
    await getPremiumAuth();
    res = await doReq();
  }
  if (!res.ok) throw new Error(`Mojang server error (${res.status})`);
  return res.json();
}

function mapCapes(profile) {
  return (profile.capes || [])
    .filter((c) => /^https:\/\/textures\.minecraft\.net\//.test(c.url || ''))
    .map((c) => ({
      id: c.id,
      alias: c.alias || 'Cape',
      url: c.url,
      active: c.state === 'ACTIVE',
    }));
}

ipcMain.handle('cape-list', async () => {
  if (busy) return { capes: [], error: 'The game is running. Close it first.' };
  try {
    return { capes: mapCapes(await mcs('GET', '/minecraft/profile')) };
  } catch (e) {
    return { capes: [], error: e.message || String(e) };
  } finally {
    progress(0, '');
  }
});

ipcMain.handle('cape-set', async (_e, id) => {
  if (busy) return { capes: [], error: 'The game is running. Close it first.' };
  try {
    let profile;
    if (id === null) {
      profile = await mcs('DELETE', '/minecraft/profile/capes/active');
    } else if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) {
      profile = await mcs('PUT', '/minecraft/profile/capes/active', { capeId: id });
    } else {
      return { capes: [], error: 'Invalid cape.' };
    }
    return { capes: mapCapes(profile) };
  } catch (e) {
    return { capes: [], error: e.message || String(e) };
  } finally {
    progress(0, '');
  }
});

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

  log('Downloading Java 21 (first time only)...');
  const runtime = path.join(ROOT(), 'runtime');
  const zipPath = path.join(runtime, 'jre21.zip');
  await download(JAVA_URL, zipPath, (p) =>
    progress(2 + p * 20, `Downloading Java ${Math.round(p * 100)}%`)
  );

  progress(23, 'Extracting Java...');
  const tmp = path.join(runtime, 'tmp');
  fs.rmSync(tmp, { recursive: true, force: true });
  new AdmZip(zipPath).extractAllTo(tmp, true);
  const inner = fs.readdirSync(tmp).find((n) => fs.statSync(path.join(tmp, n)).isDirectory());
  if (!inner) throw new Error('Java zip was invalid');
  fs.rmSync(path.join(runtime, 'jre21'), { recursive: true, force: true });
  fs.renameSync(path.join(tmp, inner), path.join(runtime, 'jre21'));
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });

  if (!fs.existsSync(javaw)) throw new Error('Could not install Java');
  return javaw;
}

// ---- Fabric profile ----
async function ensureFabric() {
  const dir = path.join(ROOT(), 'versions', FABRIC_ID);
  const file = path.join(dir, `${FABRIC_ID}.json`);
  if (fs.existsSync(file)) return;
  log('Setting up Fabric...');
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
    if (!v) throw new Error('Fabric API version not found');
    const f = v.files.find((x) => x.primary) || v.files[0];
    const dest = path.join(mods, f.filename);
    if (!fs.existsSync(dest)) {
      log('Downloading Fabric API...');
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
    if (!asset) throw new Error('No ghostmenu jar found in the GitHub release');
    const dest = path.join(mods, asset.name);
    const same = fs.existsSync(dest) && fs.statSync(dest).size === asset.size;
    if (!same) {
      log('Downloading Ghost Menu...');
      await download(asset.browser_download_url, dest);
    }
    removeOthers(mods, /^ghostmenu.*\.jar$/i, asset.name);
  } catch (e) {
    if (!hasJar(mods, /^ghostmenu.*\.jar$/i)) throw e;
    log('Ghost Menu update skip: ' + e.message);
  }
}

// ---- Play ----
async function play({ mode, username, ram }) {
  if (busy) return;
  busy = true;
  send('state', 'busy');
  try {
    const premium = mode === 'premium';
    if (!premium && !/^[A-Za-z0-9_]{3,16}$/.test(username || '')) {
      throw new Error('Username must be 3-16 characters (English letters, numbers, _ only).');
    }
    const ramGb = Math.max(1, Number(ram) || 4);
    fs.mkdirSync(ROOT(), { recursive: true });
    saveSettings({ mode: premium ? 'premium' : 'offline', ram: ramGb, ...(premium ? {} : { username }) });

    const auth = premium ? await getPremiumAuth() : Authenticator.getAuth(username);

    progress(1, 'Starting...');
    const javaPath = await ensureJava();

    progress(30, 'Checking Fabric...');
    await ensureFabric();

    progress(35, 'Checking mods...');
    await ensureMods();

    progress(40, 'Checking Minecraft files...');
    const launcher = new Client();
    launcher.on('debug', (m) => log(m));
    launcher.on('data', (m) => log(m));
    launcher.on('progress', (e) => {
      if (e && e.total) {
        progress(40 + 55 * (e.task / e.total), `Minecraft files: ${e.type} ${e.task}/${e.total}`);
      }
    });
    launcher.on('close', (code) => {
      log(`Game closed (code ${code})`);
      busy = false;
      progress(0, '');
      send('state', 'idle');
    });

    const proc = await launcher.launch({
      authorization: auth,
      root: ROOT(),
      javaPath,
      version: { number: MC_VERSION, type: 'release', custom: FABRIC_ID },
      memory: { max: `${ramGb}G`, min: '1G' },
      overrides: { gameDirectory: path.join(ROOT(), 'game') },
    });
    if (!proc) throw new Error('Game failed to start. Check the Log in Settings for details.');

    progress(100, 'Game is running! The window will open shortly.');
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
    width: 1000,
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
    mode: s.mode === 'premium' ? 'premium' : 'offline',
    msName: s.msToken && s.msName ? s.msName : '',
    ram: s.ram || 4,
    totalGb: Math.round(os.totalmem() / 1024 ** 3),
    mcVersion: MC_VERSION,
  };
});
ipcMain.handle('play', (_e, data) => play(data));
ipcMain.handle('ms-logout', () => {
  saveSettings({ msToken: null, msName: null });
  premiumAuth = null;
  return true;
});

// ---- Mods manager ----
const modsDir = () => path.join(ROOT(), 'game', 'mods');
// Fabric API aur Ghost Menu launcher khud manage karta hai
const isManaged = (f) => /^(fabric-api|ghostmenu)/i.test(f);

// Mod ka naam aur icon jar ke andar fabric.mod.json se padhte hain
const metaCache = new Map();
function readModMeta(file) {
  const full = path.join(modsDir(), file);
  let st;
  try {
    st = fs.statSync(full);
  } catch {
    return {};
  }
  const key = `${file}:${st.size}:${st.mtimeMs}`;
  if (metaCache.has(key)) return metaCache.get(key);

  const meta = {};
  try {
    const zip = new AdmZip(full);
    const entry = zip.getEntry('fabric.mod.json');
    if (entry) {
      const json = JSON.parse(entry.getData().toString('utf8').replace(/^﻿/, ''));
      if (typeof json.name === 'string') meta.title = json.name;
      else if (typeof json.id === 'string') meta.title = json.id;

      let iconPath = json.icon;
      if (iconPath && typeof iconPath === 'object') {
        const sizes = Object.keys(iconPath)
          .map(Number)
          .filter(Number.isFinite)
          .sort((a, b) => b - a);
        iconPath = sizes.length ? iconPath[String(sizes[0])] : null;
      }
      if (typeof iconPath === 'string') {
        const iconEntry = zip.getEntry(iconPath.replace(/^\/+/, ''));
        if (iconEntry) {
          const buf = iconEntry.getData();
          if (buf.length <= 400 * 1024) {
            meta.icon = 'data:image/png;base64,' + buf.toString('base64');
          }
        }
      }
    }
  } catch {}
  metaCache.set(key, meta);
  return meta;
}

function listMods() {
  const dir = modsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.jar$/i.test(f))
    .sort()
    .map((f) => ({ name: f, locked: isManaged(f), ...readModMeta(f) }));
}

ipcMain.handle('list-mods', () => listMods());

ipcMain.handle('add-mods', async () => {
  if (busy) return { mods: listMods(), error: 'The game is running. Close it first, then add the mod.' };
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose mod (.jar)',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Fabric mod (.jar)', extensions: ['jar'] }],
  });
  if (!r.canceled) {
    fs.mkdirSync(modsDir(), { recursive: true });
    for (const p of r.filePaths) {
      fs.copyFileSync(p, path.join(modsDir(), path.basename(p)));
    }
  }
  return { mods: listMods() };
});

// ---- Modrinth ----
const FABRIC_API_PROJECT = 'P7dR8mSH'; // launcher isse khud sambhalta hai
const MR = 'https://api.modrinth.com/v2';
const MR_FILE = () => path.join(ROOT(), 'modrinth.json');

function loadMrMap() {
  try {
    return JSON.parse(fs.readFileSync(MR_FILE(), 'utf8'));
  } catch {
    return {};
  }
}
function saveMrMap(m) {
  fs.mkdirSync(ROOT(), { recursive: true });
  fs.writeFileSync(MR_FILE(), JSON.stringify(m));
}

ipcMain.handle('mr-search', async (_e, arg) => {
  try {
    const isObj = arg && typeof arg === 'object';
    const q = String((isObj ? arg.query : arg) || '').trim().slice(0, 80);
    const page = Math.max(0, Math.min(500, Number(isObj && arg.page) | 0));
    const facets = JSON.stringify([
      ['project_type:mod'],
      ['categories:fabric'],
      [`versions:${MC_VERSION}`],
    ]);
    const url =
      `${MR}/search?query=${encodeURIComponent(q)}` +
      `&facets=${encodeURIComponent(facets)}` +
      `&index=${q ? 'relevance' : 'downloads'}&limit=20&offset=${page * 20}`;
    const data = await fetchJson(url);
    const map = loadMrMap();
    const hits = (data.hits || [])
      .filter((h) => h.project_id !== FABRIC_API_PROJECT)
      .map((h) => ({
        id: h.project_id,
        title: h.title,
        description: h.description,
        author: h.author,
        downloads: h.downloads,
        icon: /^https:\/\/cdn\.modrinth\.com\//.test(h.icon_url || '') ? h.icon_url : '',
        installed: !!(map[h.project_id] && fs.existsSync(path.join(modsDir(), map[h.project_id]))),
      }));
    return { hits, total: data.total_hits || 0 };
  } catch (e) {
    return { hits: [], error: 'Could not connect to Modrinth: ' + (e.message || e) };
  }
});

async function installFromModrinth(projectId, seen, depth) {
  if (seen.has(projectId) || depth > 4) return [];
  seen.add(projectId);
  if (projectId === FABRIC_API_PROJECT) return [];

  const url =
    `${MR}/project/${encodeURIComponent(projectId)}/version` +
    `?game_versions=${encodeURIComponent(JSON.stringify([MC_VERSION]))}` +
    `&loaders=${encodeURIComponent(JSON.stringify(['fabric']))}`;
  const versions = await fetchJson(url);
  const v = versions.find((x) => x.version_type === 'release') || versions[0];
  if (!v) throw new Error(`No Fabric version of this mod for ${MC_VERSION}.`);

  const f = v.files.find((x) => x.primary) || v.files[0];
  const fname = path.basename(f.filename || '');
  if (!/\.jar$/i.test(fname) || fname !== f.filename) throw new Error('Mod file looks invalid.');
  if (new URL(f.url).hostname !== 'cdn.modrinth.com') throw new Error('Download link is not trusted.');

  fs.mkdirSync(modsDir(), { recursive: true });
  const dest = path.join(modsDir(), fname);
  if (!fs.existsSync(dest)) {
    log(`Modrinth: ${fname} downloading...`);
    await download(f.url, dest);
  }
  const map = loadMrMap();
  map[projectId] = fname;
  saveMrMap(map);

  const done = [fname];
  for (const d of v.dependencies || []) {
    if (d.dependency_type === 'required' && d.project_id) {
      done.push(...(await installFromModrinth(d.project_id, seen, depth + 1)));
    }
  }
  return done;
}

ipcMain.handle('mr-install', async (_e, projectId) => {
  if (busy) return { error: 'The game is running. Close it first.' };
  if (typeof projectId !== 'string' || !/^[A-Za-z0-9]{6,12}$/.test(projectId)) {
    return { error: 'Invalid mod.' };
  }
  try {
    const files = await installFromModrinth(projectId, new Set(), 0);
    return { files, mods: listMods() };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

// ---- Skins ----
const SKIN_MODS = ['customskinloader', 'offlineskins']; // pehla chalta hai, na mile to doosra
const skinPaths = (owner) => ({
  customskinloader: path.join(ROOT(), 'game', 'CustomSkinLoader', 'LocalSkin', 'skins', owner + '.png'),
  offlineskins: path.join(ROOT(), 'game', 'config', 'offlineskins', owner + '.png'),
});

function parseSkinPng(dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Invalid skin image (PNG required).');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 1024 * 1024) throw new Error('Skin file is larger than 1 MB.');
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('This is not a PNG.');
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== 64 || (h !== 64 && h !== 32)) throw new Error('Skin must be 64x64 (or 64x32).');
  return buf;
}

async function uploadSkin(buf, slim) {
  if (!premiumAuth) await getPremiumAuth();
  const doReq = () => {
    const fd = new FormData();
    fd.append('variant', slim ? 'slim' : 'classic');
    fd.append('file', new Blob([buf], { type: 'image/png' }), 'skin.png');
    return fetch('https://api.minecraftservices.com/minecraft/profile/skins', {
      method: 'POST',
      headers: { Authorization: `Bearer ${premiumAuth.access_token}`, 'User-Agent': UA },
      body: fd,
    });
  };
  let res = await doReq();
  if (res.status === 401) {
    await getPremiumAuth();
    res = await doReq();
  }
  if (!res.ok) throw new Error(`Mojang server error (${res.status})`);
}

async function ensureSkinMod() {
  const map = loadMrMap();
  for (const slug of SKIN_MODS) {
    if (map[slug] && fs.existsSync(path.join(modsDir(), map[slug]))) return slug;
  }
  let lastErr = null;
  for (const slug of SKIN_MODS) {
    try {
      await installFromModrinth(slug, new Set(), 0);
      return slug;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Skin mod not found.');
}

// kisi bhi player ka skin uske naam se (Mojang)
ipcMain.handle('skin-fetch', async (_e, name) => {
  try {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(String(name || ''))) throw new Error('Invalid player name.');
    let prof;
    try {
      prof = await fetchJson(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
    } catch {
      throw new Error('Player not found (or Mojang is busy).');
    }
    const full = await fetchJson(`https://sessionserver.mojang.com/session/minecraft/profile/${prof.id}`);
    const prop = (full.properties || []).find((p) => p.name === 'textures');
    if (!prop) throw new Error('Could not find this player\'s skin.');
    const tex = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8'));
    const skin = tex.textures && tex.textures.SKIN;
    if (!skin) throw new Error('This player has no custom skin.');
    const url = String(skin.url).replace(/^http:/, 'https:');
    if (new URL(url).hostname !== 'textures.minecraft.net') throw new Error('Skin link is not trusted.');
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error('Skin download failed.');
    const buf = Buffer.from(await res.arrayBuffer());
    const png = 'data:image/png;base64,' + buf.toString('base64');
    parseSkinPng(png);
    return { png, slim: !!(skin.metadata && skin.metadata.model === 'slim'), name: full.name };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

ipcMain.handle('skin-apply', async (_e, { png, slim, mode, owner } = {}) => {
  if (busy) return { error: 'The game is running. Close it first.' };
  try {
    const buf = parseSkinPng(png);
    if (mode === 'premium') {
      await uploadSkin(buf, !!slim);
      return { ok: true, message: 'Skin applied to your Microsoft account. Everyone can see it. It updates when you restart the game.' };
    }
    if (typeof owner !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(owner)) {
      throw new Error('First enter your username on Home (3-16 letters).');
    }
    const slug = await ensureSkinMod();
    const target = skinPaths(owner)[slug];
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buf);
    const note =
      slug === 'offlineskins'
        ? ` In-game, type in chat: /offlineskins change ${owner}`
        : '';
    return { ok: true, mods: listMods(), message: 'Skin applied! It is only visible in your own game.' + note };
  } catch (e) {
    return { error: e.message || String(e) };
  } finally {
    progress(0, '');
  }
});

ipcMain.handle('skin-clear', (_e, owner) => {
  if (busy) return { error: 'The game is running. Close it first.' };
  if (typeof owner === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(owner)) {
    for (const p of Object.values(skinPaths(owner))) {
      try {
        fs.unlinkSync(p);
      } catch {}
    }
  }
  return { ok: true };
});

ipcMain.handle('remove-mod', (_e, name) => {
  if (busy) return { mods: listMods(), error: 'The game is running. Close it first.' };
  if (
    typeof name === 'string' &&
    path.basename(name) === name &&
    /\.jar$/i.test(name) &&
    !isManaged(name)
  ) {
    try {
      fs.unlinkSync(path.join(modsDir(), name));
    } catch {}
  }
  return { mods: listMods() };
});
ipcMain.handle('open-folder', () => {
  fs.mkdirSync(path.join(ROOT(), 'game'), { recursive: true });
  return shell.openPath(path.join(ROOT(), 'game'));
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
