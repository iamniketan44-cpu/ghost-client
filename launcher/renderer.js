const $ = (id) => document.getElementById(id);

const playBtn = $('play');
const usernameEl = $('username');
const ramEl = $('ram');
const barEl = $('bar');
const fillEl = $('fill');
const statusEl = $('status');
const errorEl = $('error');
const logEl = $('log');

function appendLog(line) {
  logEl.textContent += line.replace(/\s+$/, '') + '\n';
  const lines = logEl.textContent.split('\n');
  if (lines.length > 300) logEl.textContent = lines.slice(-300).join('\n');
  logEl.scrollTop = logEl.scrollHeight;
}

const modListEl = $('modList');

function renderMods(mods) {
  modListEl.textContent = '';
  if (!mods.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Abhi koi mod nahi. Play dabane par Ghost Menu apne aap aa jayega.';
    modListEl.appendChild(li);
    return;
  }
  for (const m of mods) {
    const li = document.createElement('li');
    if (m.icon) {
      const img = document.createElement('img');
      img.className = 'mod-icon';
      img.src = m.icon;
      img.alt = '';
      li.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'mod-icon ph';
      ph.textContent = (m.title || m.name).charAt(0).toUpperCase();
      li.appendChild(ph);
    }
    const info = document.createElement('div');
    info.className = 'mod-info';
    const title = document.createElement('span');
    title.className = 'mod-name';
    title.textContent = m.title || m.name;
    const file = document.createElement('span');
    file.className = 'mod-file';
    file.textContent = m.name;
    info.appendChild(title);
    info.appendChild(file);
    li.appendChild(info);
    if (m.locked) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'auto';
      li.appendChild(tag);
    } else {
      const rm = document.createElement('button');
      rm.className = 'rm';
      rm.type = 'button';
      rm.title = 'Hatayein';
      rm.textContent = '✕';
      rm.addEventListener('click', async () => {
        const r = await window.ghost.removeMod(m.name);
        renderMods(r.mods);
        if (r.error) showError(r.error);
      });
      li.appendChild(rm);
    }
    modListEl.appendChild(li);
  }
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

$('addMod').addEventListener('click', async () => {
  errorEl.hidden = true;
  const r = await window.ghost.addMods();
  renderMods(r.mods);
  if (r.error) showError(r.error);
});

window.ghost.listMods().then(renderMods);

// ---- Modrinth ----
const mrEl = $('mr');
const mrList = $('mrList');
const mrStatus = $('mrStatus');
const mrQuery = $('mrQuery');
let mrTimer = null;
let mrSeq = 0;

function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n || 0);
}

function renderMr(hits) {
  mrList.textContent = '';
  for (const h of hits) {
    const li = document.createElement('li');
    if (h.icon) {
      const img = document.createElement('img');
      img.className = 'mod-icon';
      img.src = h.icon;
      img.alt = '';
      li.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'mod-icon ph';
      ph.textContent = (h.title || '?').charAt(0).toUpperCase();
      li.appendChild(ph);
    }
    const info = document.createElement('div');
    info.className = 'mod-info';
    const t = document.createElement('span');
    t.className = 'mod-name';
    t.textContent = h.title;
    const d = document.createElement('span');
    d.className = 'mr-desc';
    d.textContent = h.description || '';
    const meta = document.createElement('span');
    meta.className = 'mr-meta';
    meta.textContent = `${h.author} · ${fmtNum(h.downloads)} downloads`;
    info.append(t, d, meta);
    li.appendChild(info);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mr-btn';
    btn.textContent = h.installed ? 'Installed' : 'Install';
    btn.disabled = h.installed;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Wait...';
      const r = await window.ghost.mrInstall(h.id);
      if (r.error) {
        btn.disabled = false;
        btn.textContent = 'Install';
        mrStatus.textContent = r.error;
      } else {
        btn.textContent = 'Installed';
        mrStatus.textContent = `Lag gaya: ${r.files.join(', ')}`;
        renderMods(r.mods);
      }
    });
    li.appendChild(btn);
    mrList.appendChild(li);
  }
}

async function mrSearch() {
  const seq = ++mrSeq;
  mrStatus.textContent = 'Dhundh raha hai...';
  const r = await window.ghost.mrSearch(mrQuery.value);
  if (seq !== mrSeq) return;
  renderMr(r.hits);
  mrStatus.textContent = r.error || (r.hits.length ? '' : 'Kuch nahi mila.');
}

$('openMr').addEventListener('click', () => {
  mrEl.hidden = false;
  mrQuery.focus();
  mrSearch();
});
$('mrClose').addEventListener('click', () => {
  mrEl.hidden = true;
});
mrQuery.addEventListener('input', () => {
  clearTimeout(mrTimer);
  mrTimer = setTimeout(mrSearch, 400);
});

(async () => {
  const s = await window.ghost.init();
  $('version').textContent = `Minecraft ${s.mcVersion} · Fabric`;
  usernameEl.value = s.username;
  setMode(s.mode);
  setAccount(s.msName);

  const maxRam = Math.max(2, s.totalGb);
  const options = [2, 3, 4, 6, 8, 12, 16, 20, 24, 28, 32].filter((n) => n <= maxRam);
  if (!options.length) options.push(2);
  for (const n of options) {
    const o = document.createElement('option');
    o.value = String(n);
    o.textContent = `${n} GB`;
    ramEl.appendChild(o);
  }
  const wanted = options.includes(s.ram) ? s.ram : options.includes(4) ? 4 : options[options.length - 1];
  ramEl.value = String(wanted);
})();

let mode = 'offline';
const msInfo = $('msInfo');
const msLogout = $('msLogout');

function setMode(m) {
  mode = m;
  $('modeOffline').classList.toggle('active', m === 'offline');
  $('modePremium').classList.toggle('active', m === 'premium');
  $('offlineBox').hidden = m !== 'offline';
  $('premiumBox').hidden = m !== 'premium';
}
function setAccount(name) {
  if (name) {
    msInfo.textContent = `Login: ${name}`;
    msLogout.hidden = false;
  } else {
    msInfo.textContent = 'Play dabane par Microsoft login window khulegi.';
    msLogout.hidden = true;
  }
}
// ---- Capes ----
const cpEl = $('cp');
const cpList = $('cpList');
const cpStatus = $('cpStatus');

function drawCape(canvas, url) {
  const img = new Image();
  img.onload = () => {
    const s = img.width / 64; // cape texture ka scale
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 1 * s, 1 * s, 10 * s, 16 * s, 0, 0, canvas.width, canvas.height);
  };
  img.src = url;
}

function renderCapes(capes) {
  cpList.textContent = '';
  if (!capes.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Is account par koi cape nahi hai.';
    cpList.appendChild(li);
    return;
  }
  for (const c of capes) {
    const li = document.createElement('li');
    const canvas = document.createElement('canvas');
    canvas.className = 'cape-canvas';
    canvas.width = 40;
    canvas.height = 64;
    drawCape(canvas, c.url);
    li.appendChild(canvas);

    const info = document.createElement('div');
    info.className = 'mod-info';
    const t = document.createElement('span');
    t.className = 'mod-name';
    t.textContent = c.alias;
    info.appendChild(t);
    li.appendChild(info);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mr-btn';
    btn.textContent = c.active ? 'Lagi hui hai' : 'Lagao';
    btn.disabled = c.active;
    btn.addEventListener('click', () => setCape(c.id));
    li.appendChild(btn);
    cpList.appendChild(li);
  }
}

async function loadCapes(p) {
  cpStatus.textContent = 'Load ho raha hai... (zaroorat par Microsoft login window khulegi)';
  const r = await p;
  renderCapes(r.capes);
  cpStatus.textContent = r.error || '';
}
function setCape(id) {
  return loadCapes(window.ghost.capeSet(id));
}

$('openCape').addEventListener('click', () => {
  cpEl.hidden = false;
  loadCapes(window.ghost.capeList());
});
$('cpClose').addEventListener('click', () => {
  cpEl.hidden = true;
});
$('cpNone').addEventListener('click', () => setCape(null));

$('modeOffline').addEventListener('click', () => setMode('offline'));
$('modePremium').addEventListener('click', () => setMode('premium'));
msLogout.addEventListener('click', async () => {
  await window.ghost.msLogout();
  setAccount('');
});
window.ghost.onAccount(setAccount);

playBtn.addEventListener('click', () => {
  errorEl.hidden = true;
  window.ghost.play({ mode, username: usernameEl.value.trim(), ram: Number(ramEl.value) });
});

$('folder').addEventListener('click', () => window.ghost.openFolder());
$('toggleLog').addEventListener('click', () => {
  logEl.hidden = !logEl.hidden;
  $('toggleLog').textContent = logEl.hidden ? 'Log dikhao' : 'Log chhupao';
});

window.ghost.onLog(appendLog);

window.ghost.onProgress(({ pct, text }) => {
  barEl.hidden = !text;
  fillEl.style.width = pct + '%';
  statusEl.textContent = text || '';
});

window.ghost.onState((state) => {
  const locked = state !== 'idle';
  playBtn.disabled = locked;
  usernameEl.disabled = locked;
  $('modeOffline').disabled = locked;
  $('modePremium').disabled = locked;
  msLogout.disabled = locked;
  $('openCape').disabled = locked;
  ramEl.disabled = locked;
  $('addMod').disabled = locked;
  $('openMr').disabled = locked;
  document.body.dataset.locked = String(locked);
  window.ghost.listMods().then(renderMods);
  playBtn.textContent = state === 'busy' ? 'WAIT...' : state === 'running' ? 'GAME CHAL RAHA HAI' : 'PLAY';
});

window.ghost.onError((msg) => {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  appendLog('ERROR: ' + msg);
});
