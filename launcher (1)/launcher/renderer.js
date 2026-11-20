const $ = (id) => document.getElementById(id);

const playBtn = $('play');
const usernameEl = $('username');
const ramEl = $('ram');
const barEl = $('bar');
const fillEl = $('fill');
const statusEl = $('status');
const errorEl = $('error');
const logEl = $('log');
const msInfo = $('msInfo');
const msLogout = $('msLogout');

let mode = 'offline';
let msName = '';
let locked = false;

// ---------- helpers ----------
function appendLog(line) {
  logEl.textContent += line.replace(/\s+$/, '') + '\n';
  const lines = logEl.textContent.split('\n');
  if (lines.length > 300) logEl.textContent = lines.slice(-300).join('\n');
  logEl.scrollTop = logEl.scrollHeight;
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function iconOrLetter(url, label) {
  if (url) {
    const img = document.createElement('img');
    img.className = 'mod-icon';
    img.src = url;
    img.alt = '';
    return img;
  }
  const ph = document.createElement('div');
  ph.className = 'mod-icon ph';
  ph.textContent = (label || '?').charAt(0).toUpperCase();
  return ph;
}

function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n || 0);
}

// ---------- top bar (kaun khel raha hai) ----------
function updateWho() {
  let name;
  if (mode === 'premium') {
    $('whoLabel').textContent = 'Premium';
    name = msName || 'Microsoft login';
  } else {
    $('whoLabel').textContent = 'Playing as';
    name = usernameEl.value.trim() || '—';
  }
  $('whoName').textContent = name;
  $('whoAvatar').textContent = name.charAt(0).toUpperCase();
}

function setAccount(name) {
  msName = name || '';
  if (msName) {
    msInfo.textContent = `Login: ${msName}`;
    msLogout.hidden = false;
  } else {
    msInfo.textContent = 'A Microsoft login window will open when you launch.';
    msLogout.hidden = true;
  }
  updateWho();
}

function setMode(m) {
  mode = m;
  $('modeOffline').classList.toggle('active', m === 'offline');
  $('modePremium').classList.toggle('active', m === 'premium');
  $('offlineBox').hidden = m !== 'offline';
  $('premiumBox').hidden = m !== 'premium';
  updateWho();
  if ($('page-capes').classList.contains('active')) enterCapes();
}

// ---------- navigation ----------
let mrLoaded = false;

function go(page, tab) {
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + page));
  document.querySelectorAll('.nav').forEach((n) => n.classList.toggle('active', n.dataset.page === page));
  if (page === 'mods') showTab(tab || 'installed');
  if (page === 'capes') enterCapes();
}

function showTab(tab) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  $('tab-installed').hidden = tab !== 'installed';
  $('tab-mr').hidden = tab !== 'mr';
  if (tab === 'mr' && !mrLoaded) {
    mrLoaded = true;
    mrSearch();
  }
}

document.querySelectorAll('.nav').forEach((n) => n.addEventListener('click', () => go(n.dataset.page)));
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
document.querySelectorAll('.tile').forEach((t) =>
  t.addEventListener('click', () => {
    if (t.dataset.go === 'modrinth') go('mods', 'mr');
    else go(t.dataset.go);
  })
);

// ---------- installed mods ----------
const modListEl = $('modList');

function renderMods(mods) {
  $('modCount').textContent = `${mods.length} installed`;
  modListEl.textContent = '';
  if (!mods.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No mods yet. Ghost Menu is installed automatically on launch.';
    modListEl.appendChild(li);
    return;
  }
  for (const m of mods) {
    const li = document.createElement('li');
    li.appendChild(iconOrLetter(m.icon, m.title || m.name));

    const info = document.createElement('div');
    info.className = 'mod-info';
    const title = document.createElement('span');
    title.className = 'mod-name';
    title.textContent = m.title || m.name;
    const file = document.createElement('span');
    file.className = 'mod-file';
    file.textContent = m.name;
    info.append(title, file);
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
      rm.title = 'Remove';
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

$('addMod').addEventListener('click', async () => {
  errorEl.hidden = true;
  const r = await window.ghost.addMods();
  renderMods(r.mods);
  if (r.error) showError(r.error);
});

window.ghost.listMods().then(renderMods);

// ---------- Modrinth ----------
const mrList = $('mrList');
const mrStatus = $('mrStatus');
const mrQuery = $('mrQuery');
let mrTimer = null;
let mrSeq = 0;
let mrPageNo = 0;
const mrPager = $('mrPager');
const mrPrev = $('mrPrev');
const mrNext = $('mrNext');
const mrPageLbl = $('mrPage');

function renderMr(hits) {
  mrList.textContent = '';
  for (const h of hits) {
    const li = document.createElement('li');
    li.appendChild(iconOrLetter(h.icon, h.title));

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
    btn.disabled = h.installed || locked;
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
        mrStatus.textContent = `Installed: ${r.files.join(', ')}`;
        renderMods(r.mods);
      }
    });
    li.appendChild(btn);
    mrList.appendChild(li);
  }
}

async function mrSearch() {
  const seq = ++mrSeq;
  mrStatus.textContent = 'Searching...';
  const r = await window.ghost.mrSearch({ query: mrQuery.value, page: mrPageNo });
  if (seq !== mrSeq) return;
  renderMr(r.hits);
  mrStatus.textContent = r.error || (r.hits.length ? '' : 'Nothing found.');
  const pages = Math.max(1, Math.ceil((r.total || 0) / 20));
  mrPager.hidden = !!r.error || (mrPageNo === 0 && pages <= 1);
  mrPageLbl.textContent = `Page ${mrPageNo + 1} of ${pages}`;
  mrPrev.disabled = mrPageNo === 0;
  mrNext.disabled = mrPageNo + 1 >= pages;
  $('page-mods').scrollIntoView();
}

function mrGo(n) {
  mrPageNo = Math.max(0, n);
  mrSearch();
}
mrPrev.addEventListener('click', () => mrGo(mrPageNo - 1));
mrNext.addEventListener('click', () => mrGo(mrPageNo + 1));

mrQuery.addEventListener('input', () => {
  clearTimeout(mrTimer);
  mrPageNo = 0;
  mrTimer = setTimeout(mrSearch, 400);
});

// ---------- Capes ----------
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
    li.textContent = 'This account has no capes.';
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
    btn.textContent = c.active ? 'Applied' : 'Apply';
    btn.disabled = c.active || locked;
    btn.addEventListener('click', () => setCape(c.id));
    li.appendChild(btn);
    cpList.appendChild(li);
  }
}

async function loadCapes(p) {
  cpStatus.textContent = 'Loading... (a Microsoft login window may open)';
  const r = await p;
  renderCapes(r.capes);
  cpStatus.textContent = r.error || '';
}
function setCape(id) {
  return loadCapes(window.ghost.capeSet(id));
}

// ---------- Skins ----------
const skinCanvas = $('skinCanvas');
const skinStatus = $('skinStatus');
let currentSkin = null; // { png, slim }

function drawSkin(img) {
  const ctx = skinCanvas.getContext('2d');
  ctx.clearRect(0, 0, skinCanvas.width, skinCanvas.height);
  ctx.imageSmoothingEnabled = false;
  const S = 6;
  const modern = img.height === 64;
  const part = (sx, sy, sw, sh, dx, dy, flip) => {
    ctx.save();
    if (flip) {
      ctx.translate((dx + sw) * S, dy * S);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw * S, sh * S);
    } else {
      ctx.drawImage(img, sx, sy, sw, sh, dx * S, dy * S, sw * S, sh * S);
    }
    ctx.restore();
  };
  part(8, 8, 8, 8, 4, 0, false); // sir
  part(40, 8, 8, 8, 4, 0, false); // topi layer
  part(20, 20, 8, 12, 4, 8, false); // body
  part(44, 20, 4, 12, 0, 8, false); // daya haath
  modern ? part(36, 52, 4, 12, 12, 8, false) : part(44, 20, 4, 12, 12, 8, true);
  part(4, 20, 4, 12, 4, 20, false); // daya pair
  modern ? part(20, 52, 4, 12, 8, 20, false) : part(4, 20, 4, 12, 8, 20, true);
}

function setSkin(dataUrl, slim, label) {
  const img = new Image();
  img.onload = () => {
    if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) {
      skinStatus.textContent = 'Skin must be 64x64 (or 64x32).';
      return;
    }
    currentSkin = { png: dataUrl, slim: !!slim };
    $('skinModel').value = slim ? 'slim' : 'classic';
    $('skinLabel').textContent = label;
    $('skinApply').disabled = locked;
    drawSkin(img);
    skinStatus.textContent = '';
  };
  img.onerror = () => {
    skinStatus.textContent = 'Could not open this image.';
  };
  img.src = dataUrl;
}

$('skinPick').addEventListener('click', () => $('skinFile').click());
$('skinFile').addEventListener('change', () => {
  const f = $('skinFile').files[0];
  $('skinFile').value = '';
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => setSkin(reader.result, $('skinModel').value === 'slim', f.name);
  reader.readAsDataURL(f);
});

$('skinFetch').addEventListener('click', async () => {
  skinStatus.textContent = 'Fetching skin...';
  const r = await window.ghost.skinFetch($('skinName').value.trim());
  if (r.error) {
    skinStatus.textContent = r.error;
    return;
  }
  setSkin(r.png, r.slim, `${r.name}'s skin`);
});

$('skinModel').addEventListener('change', () => {
  if (currentSkin) currentSkin.slim = $('skinModel').value === 'slim';
});

$('skinApply').addEventListener('click', async () => {
  if (!currentSkin) return;
  const owner = mode === 'premium' ? msName : usernameEl.value.trim();
  skinStatus.textContent =
    mode === 'premium'
      ? 'Applying... (a Microsoft login window may open)'
      : 'Applying... (the skin mod will download the first time)';
  const r = await window.ghost.skinApply({
    png: currentSkin.png,
    slim: currentSkin.slim,
    mode,
    owner,
  });
  skinStatus.textContent = r.error || r.message || '';
  if (r.mods) renderMods(r.mods);
});

$('skinClear').addEventListener('click', async () => {
  const owner = mode === 'premium' ? msName : usernameEl.value.trim();
  const r = await window.ghost.skinClear(owner);
  skinStatus.textContent = r.error || 'Local skin removed (a premium skin stays on the account).';
});

function enterCapes() {
  const premium = mode === 'premium';
  $('cpOffline').hidden = premium;
  $('cpNone').hidden = !premium;
  cpList.textContent = '';
  if (premium) loadCapes(window.ghost.capeList());
  else cpStatus.textContent = '';
}

$('cpNone').addEventListener('click', () => setCape(null));
$('goPremium').addEventListener('click', () => setMode('premium'));

// ---------- account / settings ----------
$('modeOffline').addEventListener('click', () => setMode('offline'));
$('modePremium').addEventListener('click', () => setMode('premium'));
usernameEl.addEventListener('input', updateWho);
msLogout.addEventListener('click', async () => {
  await window.ghost.msLogout();
  setAccount('');
});
window.ghost.onAccount(setAccount);

$('folder').addEventListener('click', () => window.ghost.openFolder());

playBtn.addEventListener('click', () => {
  errorEl.hidden = true;
  window.ghost.play({ mode, username: usernameEl.value.trim(), ram: Number(ramEl.value) });
});

// ---------- events from main ----------
window.ghost.onLog(appendLog);

window.ghost.onProgress(({ pct, text }) => {
  barEl.hidden = !text;
  fillEl.style.width = pct + '%';
  statusEl.textContent = text || '';
});

window.ghost.onState((state) => {
  locked = state !== 'idle';
  playBtn.disabled = locked;
  usernameEl.disabled = locked;
  $('modeOffline').disabled = locked;
  $('modePremium').disabled = locked;
  msLogout.disabled = locked;
  ramEl.disabled = locked;
  $('addMod').disabled = locked;
  $('cpNone').disabled = locked;
  $('skinApply').disabled = locked || !currentSkin;
  $('skinPick').disabled = locked;
  $('skinFetch').disabled = locked;
  $('skinClear').disabled = locked;
  document.body.dataset.locked = String(locked);
  window.ghost.listMods().then(renderMods);
  $('playText').textContent = state === 'busy' ? 'PLEASE WAIT...' : state === 'running' ? 'GAME RUNNING' : 'LAUNCH GAME';
});

window.ghost.onError((msg) => {
  showError(msg);
  appendLog('ERROR: ' + msg);
});

// ---------- start ----------
(async () => {
  const s = await window.ghost.init();
  $('version').textContent = `Minecraft ${s.mcVersion} · Fabric`;
  $('launchSub').textContent = `Fabric ${s.mcVersion} · Ghost Menu`;
  usernameEl.value = s.username;

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

  setAccount(s.msName);
  setMode(s.mode);
})();
