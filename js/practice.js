/* Practice player: trim controls, the call-and-response loop, devices. */
import { $, $$, LS, esc, fmt, parseTime, secs, sleep, toast } from './util.js';
import { settings, saveSettings } from './settings.js';
import { sp } from './spotify.js';
import { store } from './store.js';
import { createTimeline, MIN_LEN } from './timeline.js';

const LATENCY_PAD = 150;   // Spotify starts audio a little after the API call returns
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/* ---------- selection ---------- */
export let selectedId = LS.get('selected', null);
export const current = () => store.find(selectedId);
export function select(id){
  if (id === selectedId) return;
  if (loop) stopLoop();
  selectedId = id; LS.set('selected', id);
}

/* ---------- playback state ----------
   `loop` is a token for whatever is driving Spotify: {kind:'loop'} or
   {kind:'listen'} (tap-to-listen). Replacing or nulling it stops the old one. */
let loop = null;
let playhead = null;       // {fromMs, at} while audio is (probably) playing
let raf = 0;

function startPlayhead(fromMs){
  playhead = { fromMs, at: performance.now() };
  if (!raf) raf = requestAnimationFrame(tickPlayhead);
}
function stopPlayhead(){ playhead = null; timeline.setPlayhead(null); }
function tickPlayhead(){
  raf = 0;
  if (!playhead) return;
  timeline.setPlayhead(playhead.fromMs + performance.now() - playhead.at);
  raf = requestAnimationFrame(tickPlayhead);
}

/* ---------- edges ---------- */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const maxMs = l => l.durationMs || Infinity;

function saveEdges(l, startMs, endMs){
  startMs = Math.round(startMs); endMs = Math.round(endMs);
  if (startMs === l.startMs && endMs === l.endMs) return;
  store.edit(l.id, { startMs, endMs });   // applies locally now, syncs in the background
}
/* ± buttons: move one edge, never past the other */
function nudge(edge, d){
  const l = current(); if (!l) return;
  if (edge === 'startMs') saveEdges(l, clamp(l.startMs + d, 0, l.endMs - MIN_LEN), l.endMs);
  else saveEdges(l, l.startMs, clamp(l.endMs + d, l.startMs + MIN_LEN, maxMs(l)));
}
/* typed or "Now": set one edge exactly; if it crosses the other, carry the other along (same length) */
function setEdge(edge, ms){
  const l = current(); if (!l) return;
  const len = l.endMs - l.startMs;
  ms = clamp(ms, 0, maxMs(l));
  if (edge === 'startMs') {
    const e = ms > l.endMs - MIN_LEN ? Math.min(maxMs(l), ms + len) : l.endMs;
    saveEdges(l, Math.min(ms, e - MIN_LEN), e);
  } else {
    const s = ms < l.startMs + MIN_LEN ? Math.max(0, ms - len) : l.startMs;
    saveEdges(l, s, Math.max(ms, s + MIN_LEN));
  }
}
async function markNow(edge){
  const l = current(); if (!l) return;
  try {
    const j = await sp.nowPlaying();
    if (!j || !j.item || j.item.id !== l.trackId) throw new Error("Spotify isn't playing this track. Tap the timeline to start it.");
    setEdge(edge, j.progress_ms || 0);
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------- rendering ---------- */
const timeline = createTimeline($('#timeline'), {
  onDrag: (s, e) => showEdges(s, e),
  onCommit: (s, e) => { const l = current(); if (l) saveEdges(l, s, e); },
  onSeek: ms => listenFrom(ms)
});

function showEdges(s, e){
  for (const [edge, ms] of [['startMs', s], ['endMs', e]]) {
    const inp = $(`.edge[data-edge=${edge}] .time`);
    if (document.activeElement !== inp) inp.value = fmt(ms);
  }
  $('#lenOut').textContent = secs(e - s);
}

const STATUS = { saving: 'Saving…', synced: 'Saved ✓', local: 'Saved on this device · will sync' };
export function renderSaveState(){
  const el = $('#saveState');
  el.textContent = STATUS[store.status] || '';
  el.dataset.s = store.status;
}

export function renderPlayer(){
  const l = current();
  $('#noSel').hidden = !!l; $('#pl').hidden = !l;
  if (!l) { timeline.render(null); return; }
  $('#plCover').src = l.cover || BLANK;
  $('#plTitle').textContent = l.title;
  $('#plArtist').textContent = l.artist + (l.album ? ' · ' + l.album : '');
  $('#plNote').textContent = l.note || '';
  $('#openSp').href = 'https://open.spotify.com/track/' + encodeURIComponent(l.trackId);
  if (!timeline.dragging) { timeline.render(l); showEdges(l.startMs, l.endMs); }
  renderSaveState();
  if (!loop) setStage('', 'Ready', secs(l.endMs - l.startMs) + ' lick');
}

function setStage(kind, phase, sub){
  $('#stage').className = 'stage ' + kind;
  $('#phase').textContent = phase;
  $('#phaseSub').textContent = sub || ' ';
}
function runBar(ms){
  const b = $('#bar');
  b.style.transition = 'none'; b.style.width = '0'; void b.offsetWidth;
  b.style.transition = `width ${Math.max(0, ms)}ms linear`; b.style.width = '100%';
}
function resetBar(){ const b = $('#bar'); b.style.transition = 'none'; b.style.width = '0'; }
function setButtons(){
  $('#playBtn').disabled = !!loop && loop.kind === 'loop';
  $('#stopBtn').disabled = !loop;
}

/* ---------- loop ---------- */
async function waitWhile(ms, token, onTick){
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (loop !== token) return false;
    if (onTick) onTick(end - Date.now());
    await sleep(Math.min(100, end - Date.now()));
  }
  return loop === token;
}

async function playLoop(){
  const l = current(); if (!l) return;
  const token = { kind:'loop' }; loop = token; setButtons();
  const reps = parseInt(settings.reps, 10) || 0;
  let i = 0;
  try {
    await sp.play({ uris:[l.uri], position_ms: l.startMs });
    while (loop === token) {
      const cur = current() || l;            // pick up trims made while looping
      const len = cur.endMs - cur.startMs;
      i++;
      setStage('listen', 'LISTEN', reps ? `Repeat ${i} of ${reps}` : `Repeat ${i}`);
      runBar(len); startPlayhead(cur.startMs);
      if (!await waitWhile(len + LATENCY_PAD, token)) break;
      await sp.pause(); stopPlayhead();
      if (reps && i >= reps) break;
      const next = current() || cur;
      await sp.seek(next.startMs);
      const gap = settings.gap === 'same' ? len : (parseFloat(settings.gap) || 0) * 1000;
      if (gap > 0) {
        setStage('turn', 'YOUR TURN', '');
        runBar(gap);
        const ok = await waitWhile(gap, token, left => { $('#phaseSub').textContent = Math.ceil(left / 1000) + ' s'; });
        if (!ok) break;
      }
      if (loop !== token) break;
      await sp.play();
    }
    if (loop === token) { const c = current() || l; setStage('', 'Done', `${i} × ${secs(c.endMs - c.startMs)}`); }
  } catch (e) {
    if (loop === token) setStage('', 'Stopped', '');
    toast(e.message, 'err');
  } finally {
    if (loop === token) { loop = null; stopPlayhead(); resetBar(); }
    setButtons();
  }
}

/* tap on the timeline: play from there so you can find the edges by ear */
async function listenFrom(ms){
  const l = current(); if (!l) return;
  const token = { kind:'listen' }; loop = token; setButtons();
  resetBar();
  try {
    await sp.play({ uris:[l.uri], position_ms: Math.round(ms) });
    if (loop !== token) return;
    startPlayhead(ms);
    setStage('listen', 'LISTENING', 'From ' + fmt(ms) + ' · tap ⌖ Now to mark an edge');
  } catch (e) {
    if (loop === token) { loop = null; setStage('', 'Stopped', ''); }
    toast(e.message, 'err');
  } finally { setButtons(); }
}

export async function stopLoop(){
  if (!loop) return;
  loop = null;
  stopPlayhead(); resetBar(); setButtons();
  setStage('', 'Stopped', '');
  try { await sp.pause(); } catch {}
}

/* ---------- devices ---------- */
export async function loadDevices(){
  const sel = $('#devSel');
  try {
    const j = await sp.devices();
    const devs = (j && j.devices) || [];
    sel.innerHTML = '<option value="">Active Spotify device</option>' +
      devs.map(d => `<option value="${esc(d.id)}">${esc(d.name)}${d.is_active ? ' (active)' : ''}</option>`).join('');
    if (settings.deviceId && devs.some(d => d.id === settings.deviceId)) sel.value = settings.deviceId;
    else { settings.deviceId = ''; saveSettings(); }
    if (!devs.length) toast('No Spotify devices found. Open the Spotify app on this tablet, then tap ↻.');
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------- events ---------- */
export function initPractice(){
  $('#gapSel').value = settings.gap; $('#repSel').value = settings.reps;

  $$('.edge').forEach(box => {
    const edge = box.dataset.edge, inp = $('.time', box);
    $('.nudge', box).addEventListener('click', e => { const b = e.target.closest('button'); if (b) nudge(edge, +b.dataset.d); });
    $('.mark', box).addEventListener('click', () => markNow(edge));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = ''; inp.blur(); } });
    inp.addEventListener('blur', () => {
      const l = current(); if (!l) return;
      const ms = inp.value.trim() ? parseTime(inp.value) : null;
      if (inp.value.trim() && ms == null) toast('Type a time like 1:23.4', 'err');
      if (ms != null) setEdge(edge, ms);
      showEdges(current().startMs, current().endMs);
    });
    inp.addEventListener('focus', () => inp.select());
  });

  $('#gapSel').addEventListener('change', e => { settings.gap = e.target.value; saveSettings(); });
  $('#repSel').addEventListener('change', e => { settings.reps = e.target.value; saveSettings(); });
  $('#devSel').addEventListener('change', e => { settings.deviceId = e.target.value; saveSettings(); });
  $('#devRefresh').addEventListener('click', loadDevices);
  $('#playBtn').addEventListener('click', playLoop);
  $('#stopBtn').addEventListener('click', stopLoop);
  $('#noteBtn').addEventListener('click', () => {
    const l = current(); if (!l) return;
    const note = prompt('Note for this lick (e.g. "ii-V into bar 9, Bb")', l.note || '');
    if (note !== null) store.edit(l.id, { note: note.trim() });
  });
  $('#delBtn').addEventListener('click', () => {
    const l = current(); if (!l || !confirm('Delete this lick?')) return;
    if (loop) stopLoop();
    selectedId = null; LS.set('selected', null);
    store.remove(l.id);
  });
}
