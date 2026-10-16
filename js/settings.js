/* Per-device settings, kept in localStorage (never in the Gist, except clientId). */
import { LS } from './util.js';

export const settings = Object.assign(
  { clientId:'', ghToken:'', gistId:'', len:10, gap:'4', reps:'0', deviceId:'' },
  LS.get('settings', {})
);
export const saveSettings = () => LS.set('settings', settings);

export const REDIRECT = location.origin + location.pathname;
export const QUICK = location.hash === '#quick';
