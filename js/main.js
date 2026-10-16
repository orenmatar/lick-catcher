/* Entry point: tabs, wiring between views, quick mode and boot. */
import { $, $$, LS, toast } from './util.js';
import { settings, QUICK } from './settings.js';
import { sp } from './spotify.js';
import { store } from './store.js';
import { initCatch, catchLick, startNowPlaying, stopNowPlaying } from './catch.js';
import { initLists, renderLists } from './lists.js';
import { initPractice, renderPlayer, renderSaveState, select, loadDevices } from './practice.js';
import { initSetup, renderSetup } from './setup.js';

const renderAll = () => { renderLists(); renderPlayer(); };
const syncNow = () => settings.ghToken ? store.sync().catch(e => toast(e.message, 'err')) : Promise.resolve();

/* ---------- tabs ---------- */
function showTab(name){
  $$('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  $$('main section').forEach(s => s.classList.toggle('on', s.id === name));
  LS.set('tab', name);
  if (name === 'catch') startNowPlaying(); else stopNowPlaying();
  if (name === 'practice') {
    syncNow();
    if (sp.connected()) loadDevices();
  }
}

/* ---------- wiring ---------- */
store.addEventListener('change', renderAll);
store.addEventListener('status', renderSaveState);
store.addEventListener('error', e => toast('Saved on this device, but cloud sync failed: ' + e.detail, 'err'));
sp.onExpire = renderSetup;

$('nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });
$('#syncBtn').addEventListener('click', () => store.sync().then(() => toast('Up to date', 'ok')).catch(e => toast(e.message, 'err')));
initCatch();
initPractice();
initSetup();
initLists((id, fromRecent) => {
  select(id);
  renderAll();
  if (fromRecent) showTab('practice');
  else if (window.innerWidth < 820) $('#player').scrollIntoView({ behavior:'smooth', block:'start' });
});

/* retry queued changes when the connection comes back */
window.addEventListener('online', () => { if (store.unsynced()) store.later(0); });

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    if (store.unsynced()) store.later(0);   // push edits before the tab gets frozen
    return;
  }
  /* Quick mode: re-opening the home-screen icon brings this tab back → save again */
  if (QUICK && sp.connected() && Date.now() - hiddenAt > 1500) { showTab('catch'); catchLick(); }
  else if (store.unsynced()) store.later(0);
});

/* ---------- boot ---------- */
(async function boot(){
  renderSetup(); renderAll();
  try { await sp.handleRedirect(); } catch (e) { toast(e.message, 'err'); }
  renderSetup();
  const ready = settings.ghToken && sp.connected();
  showTab(!ready ? 'setup' : QUICK ? 'catch' : LS.get('tab', 'catch'));
  if (QUICK && sp.connected()) catchLick();   // grab the position first, sync after
  if (settings.ghToken && LS.get('tab') !== 'practice') await syncNow();   // the Practice tab syncs itself
  renderSetup();
})();
