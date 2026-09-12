import { loadStatus, renderStatus, unavailable, validateStatus } from './version-status-core.mjs';
import { ready } from './i18n.mjs';

await ready;

const root = document.getElementById('version-status');
const button = document.getElementById('refresh-status');
let lastGood;
try {
  lastGood = validateStatus(JSON.parse(document.getElementById('version-status-snapshot').textContent));
} catch {
  lastGood = unavailable();
}
root.innerHTML = renderStatus(lastGood);
async function refresh() {
  button.disabled = true;
  root.setAttribute('aria-busy', 'true');
  try {
    lastGood = await loadStatus({ fallback: lastGood });
    root.innerHTML = renderStatus(lastGood);
  } finally {
    root.setAttribute('aria-busy', 'false');
    button.disabled = false;
  }
}
button.addEventListener('click', refresh);
await refresh();
