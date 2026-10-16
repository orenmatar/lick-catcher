/* Catch view: now-playing card, length chips and the big Save button. */
import { $, esc, fmt, uid, toast } from './util.js';
import { settings, saveSettings } from './settings.js';
import { sp } from './spotify.js';
import { store } from './store.js';

const LENS = [5, 8, 10, 15, 20, 30];
let lastCatch = 0, catching = false;

function renderLenChips(){
  $('#lenChips').innerHTML = LENS.map(n => `<button class="chip ${n == settings.len ? 'on' : ''}" data-len="${n}">${n} s</button>`).join('');
  $('#catchSub').textContent = 'last ' + settings.len + ' s';
}

export async function catchLick(){
  if (catching || Date.now() - lastCatch < 3000) return;   // debounce double taps / quick-mode re-opens
  catching = true; const btn = $('#catchBtn'); btn.classList.add('busy');
  try {
    const j = await sp.nowPlaying();
    if (!j || !j.item) throw new Error('Nothing is playing on Spotify right now');
    if (j.currently_playing_type && j.currently_playing_type !== 'track') throw new Error('That is not a music track');
    const it = j.item;
    const endMs = Math.max(0, j.progress_ms || 0);
    const startMs = Math.max(0, endMs - settings.len * 1000);
    const imgs = (it.album && it.album.images) || [];
    const lick = {
      id: uid(), trackId: it.id, uri: it.uri,
      title: it.name, artist: (it.artists || []).map(a => a.name).join(', '),
      album: it.album ? it.album.name : '',
      cover: imgs.length ? imgs[imgs.length - 1].url : '',
      durationMs: it.duration_ms || null,
      startMs, endMs, note: '', createdAt: new Date().toISOString()
    };
    lastCatch = Date.now();
    const synced = await store.add(lick);
    btn.classList.remove('done'); void btn.offsetWidth; btn.classList.add('done');
    if (navigator.vibrate) navigator.vibrate(60);
    toast(synced ? `Saved ${fmt(startMs)}–${fmt(endMs)} · ${lick.title}` : 'Saved on this phone. Will sync to the cloud later.', synced ? 'ok' : '');
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    catching = false; btn.classList.remove('busy');
  }
}

let npTimer = null;
async function refreshNowPlaying(){
  const el = $('#np');
  if (!sp.connected()) { el.innerHTML = '<div class="muted">Connect Spotify in Setup to start.</div>'; return; }
  try {
    const j = await sp.nowPlaying();
    if (!j || !j.item) { el.innerHTML = '<div class="muted">Nothing playing on Spotify.</div>'; return; }
    const imgs = (j.item.album && j.item.album.images) || [];
    el.innerHTML = `${imgs.length ? `<img src="${esc(imgs[imgs.length-1].url)}" alt="">` : '<div class="noimg">♪</div>'}
      <div class="grow" style="min-width:0"><div class="t">${esc(j.item.name)}</div>
      <div class="muted small">${esc((j.item.artists||[]).map(a=>a.name).join(', '))}</div>
      <div class="small np-pos">${j.is_playing ? '▶' : '❚❚'} ${fmt(j.progress_ms)} / ${fmt(j.item.duration_ms)}</div></div>`;
  } catch (e) { el.innerHTML = `<div class="muted">${esc(e.message)}</div>`; }
}
export function startNowPlaying(){
  stopNowPlaying(); refreshNowPlaying();
  npTimer = setInterval(() => { if (!document.hidden) refreshNowPlaying(); }, 5000);
}
export function stopNowPlaying(){ clearInterval(npTimer); npTimer = null; }

export function initCatch(){
  renderLenChips();
  $('#lenChips').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    settings.len = +c.dataset.len; saveSettings(); renderLenChips();
  });
  $('#catchBtn').addEventListener('click', catchLick);
}
