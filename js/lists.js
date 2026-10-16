/* Lick lists: "Just caught" on the Catch tab and the library on Practice. */
import { $, esc, fmt, secs } from './util.js';
import { store } from './store.js';
import { selectedId } from './practice.js';

function lickRow(l){
  return `<div class="lick ${l.id === selectedId ? 'sel' : ''}" data-id="${esc(l.id)}">
    ${l.cover ? `<img src="${esc(l.cover)}" alt="" loading="lazy">` : '<div class="noimg">♪</div>'}
    <div class="meta"><div class="t">${esc(l.title)}</div><div class="a">${esc(l.artist)}</div>${l.note ? `<div class="n">${esc(l.note)}</div>` : ''}</div>
    <div class="ts">${fmt(l.startMs)}<br><span class="muted">${secs(l.endMs - l.startMs)}</span></div></div>`;
}

export function renderLists(){
  const all = store.newest();
  $('#recent').innerHTML = all.length ? all.slice(0, 5).map(lickRow).join('') : '<div class="empty">Play something on Spotify and hit the button.</div>';
  $('#library').innerHTML = all.length ? all.map(lickRow).join('') : '<div class="empty">No licks yet. Catch some on your phone.</div>';
  $('#count').textContent = all.length ? '(' + all.length + ')' : '';
}

/* onPick(id, fromRecent) */
export function initLists(onPick){
  for (const id of ['#recent', '#library']) {
    $(id).addEventListener('click', e => {
      const row = e.target.closest('.lick');
      if (row) onPick(row.dataset.id, id === '#recent');
    });
  }
}
