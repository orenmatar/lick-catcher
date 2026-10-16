/* Cloud storage: one private GitHub Gist holding licks.json.
 *
 * Every change is applied to the local copy at once and queued in localStorage
 * (new licks in `lc.pending`, edits/deletes in `lc.ops`), so nothing is lost if
 * the tab closes or the network drops. flush() then does a read-modify-write:
 * pull the Gist, replay the queue on top, push, and drop what was sent. That
 * keeps the phone and tablet from overwriting each other.
 *
 * Events: 'change' (data changed), 'status' (sync status changed),
 * 'error' (background sync failed; detail = message).
 */
import { LS } from './util.js';
import { settings, saveSettings } from './settings.js';

const GH = 'https://api.github.com';
const GIST_FILE = 'licks.json', GIST_DESC = 'Lick Catcher data';
const EDIT_DEBOUNCE = 800;

const emptyData = () => ({ version:1, config:{}, licks:[] });
const normalize = d => {
  d = d && typeof d === 'object' ? d : emptyData();
  d.version = d.version || 1;
  d.config = d.config || {};
  d.licks = Array.isArray(d.licks) ? d.licks : [];
  return d;
};

function replay(d, adds, ops){
  for (const p of adds) if (!d.licks.some(l => l.id === p.id)) d.licks.push({ ...p });
  for (const op of ops) {
    if (op.type === 'edit') { const x = d.licks.find(l => l.id === op.id); if (x) Object.assign(x, op.fields); }
    else if (op.type === 'delete') d.licks = d.licks.filter(l => l.id !== op.id);
    else if (op.type === 'config') Object.assign(d.config, op.fields);
  }
  return d;
}

class Store extends EventTarget {
  constructor(){
    super();
    this.data = normalize(LS.get('cache', null));
    this.pending = LS.get('pending', []);   // new licks not yet in the Gist
    this.ops = LS.get('ops', []);           // edits/deletes not yet in the Gist
    this.status = this.unsynced() ? 'local' : 'synced';
    this._flushing = null; this._again = false; this._timer = null; this._inflight = null;
  }
  get licks(){ return this.data.licks; }
  find(id){ return this.data.licks.find(l => l.id === id) || null; }
  newest(){ return this.data.licks.slice().sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')); }
  unsynced(){ return this.pending.length > 0 || this.ops.length > 0; }

  emit(type, detail){ this.dispatchEvent(new CustomEvent(type, { detail })); }
  setStatus(s){ if (s !== this.status) { this.status = s; this.emit('status'); } }
  saveLocal(){ LS.set('pending', this.pending); LS.set('ops', this.ops); LS.set('cache', this.data); }

  /* ---- GitHub ---- */
  async gh(path, opts = {}){
    if (!settings.ghToken) throw new Error('Add your GitHub token in Setup');
    const headers = { Authorization: 'Bearer ' + settings.ghToken, Accept: 'application/vnd.github+json' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    const r = await fetch(GH + path, { ...opts, headers, cache: 'no-store' }).catch(() => { throw new Error("Can't reach cloud storage. Check your connection."); });
    if (r.status === 401) throw new Error('GitHub token rejected. Check it in Setup.');
    if (r.status === 404 && path.startsWith('/gists/')) { settings.gistId = ''; saveSettings(); throw new Error('Storage gist not found. Reconnect storage in Setup.'); }
    if (!r.ok) throw new Error('GitHub error ' + r.status);
    return r.json();
  }
  async ensureGist(){
    if (settings.gistId) return settings.gistId;
    const list = await this.gh('/gists?per_page=100');
    const found = list.find(g => g.description === GIST_DESC && g.files && g.files[GIST_FILE]);
    if (found) settings.gistId = found.id;
    else {
      const d = emptyData(); if (settings.clientId) d.config.clientId = settings.clientId;
      const created = await this.gh('/gists', { method:'POST', body: JSON.stringify({
        description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: JSON.stringify(d, null, 1) } } }) });
      settings.gistId = created.id;
    }
    saveSettings();
    return settings.gistId;
  }
  async pull(){
    const id = await this.ensureGist();
    const g = await this.gh('/gists/' + id);
    const f = g.files[GIST_FILE];
    let txt = f ? f.content : '';
    if (f && f.truncated) txt = await (await fetch(f.raw_url, { cache:'no-store' })).text();
    let d; try { d = JSON.parse(txt); } catch { d = null; }
    this.data = replay(normalize(d), this.pending, this.ops);
    LS.set('cache', this.data);
    this.emit('change');
  }
  async push(){
    const id = await this.ensureGist();
    await this.gh('/gists/' + id, { method:'PATCH', body: JSON.stringify({
      files: { [GIST_FILE]: { content: JSON.stringify(this.data, null, 1) } } }) });
  }

  /* Pull, replay the local queue, push. Single-flight: calls made while a
     flush is running make it go round once more. Throws on failure. */
  flush(){
    clearTimeout(this._timer); this._timer = null;
    if (this._flushing) { this._again = true; return this._flushing; }
    this._flushing = (async () => {
      this.setStatus('saving');
      try {
        do {
          this._again = false;
          await this.pull();
          if (!this.unsynced()) continue;
          const adds = this.pending.slice(), ops = this.ops.slice();
          this._inflight = new Set(ops);
          try { await this.push(); } finally { this._inflight = null; }
          this.pending = this.pending.filter(p => !adds.includes(p));
          this.ops = this.ops.filter(o => !ops.includes(o));
          this.saveLocal();
        } while (this._again);
        this.setStatus(this.unsynced() ? 'saving' : 'synced');
      } catch (e) {
        this.setStatus(this.unsynced() ? 'local' : 'synced');
        throw e;
      } finally {
        this._flushing = null;
      }
      if (this.unsynced()) this.later(0);
    })();
    return this._flushing;
  }
  /* background flush; failures are reported as an 'error' event */
  later(delay = EDIT_DEBOUNCE){
    if (!settings.ghToken) { this.setStatus('local'); return; }
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush().catch(e => this.emit('error', e.message)), delay);
  }
  /* sync on demand (boot, tab switch, ↻): also adopts the shared clientId */
  async sync(){
    await this.flush();
    const cid = this.data.config.clientId;
    if (cid && !settings.clientId) { settings.clientId = cid; saveSettings(); }
  }

  queue(op){
    const last = this.ops[this.ops.length - 1];
    const canMerge = op.type === 'edit' && last && last.type === 'edit' && last.id === op.id && !(this._inflight && this._inflight.has(last));
    if (canMerge) Object.assign(last.fields, op.fields);
    else this.ops.push(op);
    replay(this.data, [], [op]);
    this.saveLocal();
    this.setStatus('saving');
    this.emit('change');
  }

  /* ---- public mutations ---- */
  /* resolves true if it reached the cloud, false if only saved on this device */
  async add(lick){
    this.pending.push(lick);
    replay(this.data, [lick], []);
    this.saveLocal();
    this.emit('change');
    try { await this.flush(); return true; }
    catch (e) { console.warn(e); return false; }
  }
  edit(id, fields){ this.queue({ type:'edit', id, fields: { ...fields } }); this.later(); }
  remove(id){ this.queue({ type:'delete', id }); this.later(0); }
  setConfig(fields){ this.queue({ type:'config', fields: { ...fields } }); return this.flush(); }
}

export const store = new Store();
