/* Small shared helpers: DOM, localStorage, escaping, time formatting, toast. */

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

export const LS = {
  get(k, d){ try{ const v = localStorage.getItem('lc.'+k); return v == null ? d : JSON.parse(v); }catch{ return d; } },
  set(k, v){ try{ localStorage.setItem('lc.'+k, JSON.stringify(v)); }catch{} },
  del(k){ try{ localStorage.removeItem('lc.'+k); }catch{} }
};

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ms → "m:ss.t" */
export const fmt = ms => {
  const t = Math.max(0, Math.round(ms / 100)) / 10;   // tenths of a second
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(1);
  return m + ':' + (parseFloat(s) < 10 ? '0' : '') + s;
};

/* "1:23.4", "83.4" or "1:23" → ms, or null if it doesn't parse */
export const parseTime = str => {
  const m = String(str).trim().replace(',', '.').match(/^(?:(\d+):)?(\d+(?:\.\d*)?)$/);
  if (!m) return null;
  return Math.round(((+m[1] || 0) * 60 + parseFloat(m[2])) * 1000);
};

export const secs = ms => (ms / 1000).toFixed(1) + ' s';
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let toastTimer;
export function toast(msg, kind = ''){
  const t = $('#toast');
  t.textContent = msg; t.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = kind, 3200);
}
