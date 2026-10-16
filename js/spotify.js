/* Spotify Web API client: Authorization Code + PKCE straight from the browser. */
import { LS, toast } from './util.js';
import { settings, REDIRECT, QUICK } from './settings.js';

const SP_API = 'https://api.spotify.com/v1';
const SP_TOKEN = 'https://accounts.spotify.com/api/token';
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const randStr = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); };
const devQ = (sep = '?') => settings.deviceId ? sep + 'device_id=' + encodeURIComponent(settings.deviceId) : '';

export const sp = {
  tok: LS.get('sp', null),
  refreshing: null,
  onExpire: () => {},          // set by main to refresh the Setup view
  connected(){ return !!(this.tok && this.tok.refresh); },
  async login(){
    if (!settings.clientId) { toast('Enter your Spotify Client ID first', 'err'); return; }
    const verifier = randStr(64), state = randStr(16);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    LS.set('pkce', verifier); LS.set('pkceState', state); LS.set('afterLogin', QUICK ? '#quick' : '');
    location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
      client_id: settings.clientId, response_type: 'code', redirect_uri: REDIRECT,
      code_challenge_method: 'S256', code_challenge: b64url(new Uint8Array(digest)),
      scope: SCOPES, state
    });
  },
  async handleRedirect(){
    const p = new URLSearchParams(location.search);
    const code = p.get('code'), err = p.get('error');
    if (!code && !err) return false;
    history.replaceState(null, '', REDIRECT + LS.get('afterLogin', ''));
    if (err) { toast('Spotify login cancelled', 'err'); return true; }
    if (p.get('state') !== LS.get('pkceState')) { toast('Login check failed, try again', 'err'); return true; }
    const r = await fetch(SP_TOKEN, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams({ client_id: settings.clientId, grant_type:'authorization_code', code,
        redirect_uri: REDIRECT, code_verifier: LS.get('pkce') }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast('Spotify: ' + (j.error_description || j.error || r.status), 'err'); return true; }
    this.store(j); LS.del('pkce'); LS.del('pkceState');
    toast('Spotify connected', 'ok');
    return true;
  },
  store(j){
    this.tok = { access: j.access_token, refresh: j.refresh_token || (this.tok && this.tok.refresh), exp: Date.now() + (j.expires_in || 3600) * 1000 };
    LS.set('sp', this.tok);
  },
  logout(){ this.tok = null; LS.del('sp'); },
  refresh(){
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const r = await fetch(SP_TOKEN, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body: new URLSearchParams({ client_id: settings.clientId, grant_type:'refresh_token', refresh_token: this.tok.refresh }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { this.logout(); this.onExpire(); throw new Error('Spotify session expired. Reconnect in Setup.'); }
      this.store(j);
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  },
  async api(path, opts = {}, retry = true){
    if (!this.connected()) throw new Error('Connect Spotify in Setup first');
    if (Date.now() > this.tok.exp - 60000) await this.refresh();
    const headers = { Authorization: 'Bearer ' + this.tok.access };
    if (opts.body) headers['Content-Type'] = 'application/json';
    const r = await fetch(SP_API + path, { ...opts, headers }).catch(() => { throw new Error("Can't reach Spotify. Check your connection."); });
    if (r.status === 401 && retry) { await this.refresh(); return this.api(path, opts, false); }
    if (r.status === 429) throw new Error('Spotify says slow down. Wait a few seconds.');
    if (!r.ok) {
      let msg = 'Spotify error ' + r.status;
      try {
        const j = await r.json();
        if (j.error && j.error.reason === 'NO_ACTIVE_DEVICE') msg = 'No active Spotify device. Open Spotify on this device, then tap ↻.';
        else if (j.error && j.error.message) msg = 'Spotify: ' + j.error.message;
      } catch {}
      if (r.status === 403 && msg.endsWith('403')) msg = 'Spotify refused (403). Is your account added under User Management in the developer app?';
      throw new Error(msg);
    }
    return r;
  },
  async json(path){
    const r = await this.api(path);
    if (r.status === 204) return null;
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  },

  /* playback shortcuts; they target the chosen device if there is one */
  nowPlaying(){ return this.json('/me/player/currently-playing'); },
  devices(){ return this.json('/me/player/devices'); },
  play(body){ return this.api('/me/player/play' + devQ(), { method:'PUT', body: body ? JSON.stringify(body) : undefined }); },
  pause(){ return this.api('/me/player/pause' + devQ(), { method:'PUT' }); },
  seek(ms){ return this.api('/me/player/seek?position_ms=' + Math.round(ms) + devQ('&'), { method:'PUT' }); }
};
