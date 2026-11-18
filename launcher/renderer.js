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

(async () => {
  const s = await window.ghost.init();
  $('version').textContent = `Minecraft ${s.mcVersion} · Fabric`;
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
})();

playBtn.addEventListener('click', () => {
  errorEl.hidden = true;
  window.ghost.play({ username: usernameEl.value.trim(), ram: Number(ramEl.value) });
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
  ramEl.disabled = locked;
  $('addMod').disabled = locked;
  document.body.dataset.locked = String(locked);
  window.ghost.listMods().then(renderMods);
  playBtn.textContent = state === 'busy' ? 'WAIT...' : state === 'running' ? 'GAME CHAL RAHA HAI' : 'PLAY';
});

window.ghost.onError((msg) => {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  appendLog('ERROR: ' + msg);
});
