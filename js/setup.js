/* Setup view: GitHub token, Spotify connection, quick-save link. */
import { $, toast } from './util.js';
import { settings, saveSettings, REDIRECT, QUICK } from './settings.js';
import { sp } from './spotify.js';
import { store } from './store.js';

export function renderSetup(){
  $('#redir').textContent = REDIRECT;
  $('#quickLink').href = REDIRECT + '#quick';
  $('#ghToken').value = settings.ghToken;
  $('#clientId').value = settings.clientId;
  $('#stepGh').classList.toggle('ok', !!settings.gistId);
  $('#ghStatus').textContent = settings.gistId ? 'Connected ✓' : '';
  $('#stepSp').classList.toggle('ok', sp.connected());
  $('#spStatus').textContent = sp.connected() ? 'Connected ✓' : '';
  $('#quickHint').textContent = QUICK ? 'Quick mode: opening this page saves a lick automatically.' : '';
}

export function initSetup(){
  $('#ghSave').addEventListener('click', async () => {
    settings.ghToken = $('#ghToken').value.trim(); settings.gistId = ''; saveSettings();
    $('#ghStatus').textContent = 'Connecting…';
    try {
      await store.sync();
      renderSetup();
      toast(store.licks.length ? `Found ${store.licks.length} licks` : 'Storage ready', 'ok');
    } catch (e) { $('#ghStatus').textContent = ''; toast(e.message, 'err'); }
  });
  $('#spConnect').addEventListener('click', async () => {
    settings.clientId = $('#clientId').value.trim(); saveSettings();
    if (settings.gistId && settings.clientId && store.data.config.clientId !== settings.clientId) {
      try { await store.setConfig({ clientId: settings.clientId }); } catch {}
    }
    sp.login();
  });
  $('#spLogout').addEventListener('click', () => { sp.logout(); renderSetup(); toast('Spotify disconnected'); });
}
