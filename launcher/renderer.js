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

(async () => {
  const s = await window.ghost.init();
  $('version').textContent = `Minecraft ${s.mcVersion} · Fabric`;
  usernameEl.value = s.username;

  const maxRam = Math.max(2, s.totalGb - 2);
  const options = [2, 3, 4, 6, 8, 12, 16].filter((n) => n <= maxRam);
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
  playBtn.textContent = state === 'busy' ? 'WAIT...' : state === 'running' ? 'GAME CHAL RAHA HAI' : 'PLAY';
});

window.ghost.onError((msg) => {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  appendLog('ERROR: ' + msg);
});
