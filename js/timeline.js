/* Zoomed timeline around a lick, with draggable start/end handles.
 *
 * - drag a handle: move that edge
 * - drag the shaded part: move the whole lick
 * - tap anywhere: onSeek(ms), used to listen from that point
 *
 * The view (visible time range) is frozen while dragging so the handle stays
 * under the finger, then re-centres on release.
 */
import { $ } from './util.js';

export const MIN_LEN = 500;
const SNAP = 50;
const TAP_SLOP = 6;     // px of movement before a press counts as a drag
const snap = ms => Math.round(ms / SNAP) * SNAP;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const label = ms => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

function viewFor(l){
  const pad = Math.max(4000, (l.endMs - l.startMs) * 0.6);
  const dur = l.durationMs || Infinity;
  let a = l.startMs - pad, b = l.endMs + pad;
  if (a < 0) { b -= a; a = 0; }
  if (b > dur) { a = Math.max(0, a - (b - dur)); b = dur; }
  return [a, b];
}

export function createTimeline(root, { onDrag, onCommit, onSeek }){
  root.innerHTML = '<div class="tl-ticks"></div><div class="tl-sel"></div>' +
    '<div class="tl-h" data-edge="start"><i></i></div><div class="tl-h" data-edge="end"><i></i></div>' +
    '<div class="tl-ph" hidden></div>';
  const ticks = $('.tl-ticks', root), sel = $('.tl-sel', root), ph = $('.tl-ph', root);
  const hStart = $('[data-edge=start]', root), hEnd = $('[data-edge=end]', root);
  let lick = null, view = [0, 1], drag = null, playMs = null;

  const span = () => view[1] - view[0];
  const pct = ms => ((ms - view[0]) / span() * 100) + '%';
  const msAt = x => { const r = root.getBoundingClientRect(); return view[0] + (x - r.left) / r.width * span(); };
  const pxPerMs = () => root.getBoundingClientRect().width / span();

  function drawTicks(){
    const s = span();
    const minor = s <= 40000 ? 1000 : 5000, major = s <= 40000 ? 5000 : 10000;
    let html = '';
    for (let t = Math.ceil(view[0] / minor) * minor; t <= view[1]; t += minor) {
      const maj = t % major === 0;
      html += `<i class="${maj ? 'maj' : ''}" style="left:${pct(t)}"></i>`;
      if (maj) html += `<span style="left:${pct(t)}">${label(t)}</span>`;
    }
    ticks.innerHTML = html;
  }
  function drawEdges(s, e){
    sel.style.left = pct(s); sel.style.width = ((e - s) / span() * 100) + '%';
    hStart.style.left = pct(s); hEnd.style.left = pct(e);
  }
  function drawPlayhead(){
    const show = playMs != null && playMs >= view[0] && playMs <= view[1];
    ph.hidden = !show;
    if (show) ph.style.left = pct(playMs);
  }

  function render(l){
    if (drag && (!l || l.id !== lick.id)) drag = null;
    lick = l;
    if (!l || drag) return;
    view = viewFor(l);
    drawTicks(); drawEdges(l.startMs, l.endMs); drawPlayhead();
  }

  function edgesFor(x){
    const d = snap(msAt(x)) - drag.ms0;
    const lo = Math.max(0, view[0]), hi = Math.min(lick.durationMs || Infinity, view[1]);
    const { s0, e0 } = drag;
    if (drag.mode === 'start') return [clamp(s0 + d, lo, e0 - MIN_LEN), e0];
    if (drag.mode === 'end') return [s0, clamp(e0 + d, s0 + MIN_LEN, hi)];
    const dd = clamp(d, lo - s0, hi - e0);   // move both, keep the length
    return [s0 + dd, e0 + dd];
  }

  root.addEventListener('pointerdown', ev => {
    if (!lick || ev.button > 0) return;
    const ms = msAt(ev.clientX);
    // pick the nearer handle if the press is within its hit area (they can overlap on short licks)
    const hit = 22 / pxPerMs();
    const dS = Math.abs(ms - lick.startMs), dE = Math.abs(ms - lick.endMs);
    let mode = 'tap';
    if (Math.min(dS, dE) <= hit) mode = dS < dE ? 'start' : 'end';
    else if (ms > lick.startMs && ms < lick.endMs) mode = 'move';
    drag = { mode, x0: ev.clientX, ms0: snap(ms), s0: lick.startMs, e0: lick.endMs, moved: false, s: lick.startMs, e: lick.endMs };
    root.setPointerCapture(ev.pointerId);
    root.classList.toggle('grabbing', mode !== 'tap');
  });
  root.addEventListener('pointermove', ev => {
    if (!drag) return;
    if (!drag.moved && Math.abs(ev.clientX - drag.x0) < TAP_SLOP) return;
    drag.moved = true;
    if (drag.mode === 'tap') return;
    [drag.s, drag.e] = edgesFor(ev.clientX);
    drawEdges(drag.s, drag.e);
    onDrag(drag.s, drag.e);
  });
  const end = ev => {
    if (!drag) return;
    const d = drag; drag = null;
    root.classList.remove('grabbing');
    if (ev.type === 'pointercancel') { render(lick); return; }
    if (!d.moved) onSeek(clamp(snap(msAt(ev.clientX)), 0, lick.durationMs || Infinity));
    else if (d.mode !== 'tap' && (d.s !== d.s0 || d.e !== d.e0)) onCommit(d.s, d.e);
    render(lick);
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);

  return {
    render,
    setPlayhead(ms){ playMs = ms; drawPlayhead(); },
    get dragging(){ return !!drag; }
  };
}
