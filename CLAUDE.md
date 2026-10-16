# Lick Catcher: notes for Claude

Personal jazz practice app. Read README.md for the user-facing picture and the file layout.

## Architecture
- Static site deployed by GitHub Pages from `main` at https://orenmatar.github.io/lick-catcher/
  - `index.html` holds markup only, `css/style.css` holds the styles, and `js/*.js` are native ES modules with `js/main.js` as the entry point.
- No build step and no dependencies. Keep it that way unless a feature clearly needs one; ask before adding a framework or bundler.
- **Module wiring:** views don't call each other directly.
  - `store` (an `EventTarget`) emits `change`, `status` and `error`; `main.js` subscribes and re-renders.
  - Cross-view actions are callbacks passed in from `main.js` (for example `initLists(onPick)`).
  - `lists.js` may import from `practice.js` but not the other way round, which avoids import cycles.
- **Spotify:** Authorization Code + PKCE straight from the browser (no client secret).
  - Scopes: `user-read-currently-playing user-read-playback-state user-modify-playback-state`.
  - The redirect URI is `location.origin + location.pathname`.
  - The app is in Spotify Development Mode (2026 rules: Premium required, allow-listed users only). Don't rely on endpoints that need Extended Quota.
  - Use the `sp.play/pause/seek/nowPlaying/devices` helpers; they add the chosen `device_id`.
- **Storage:** one private Gist with description `Lick Catcher data` and file `licks.json`, shape `{version, config:{clientId}, licks:[...]}`.
  - Every change goes through `store.add`, `store.edit(id, fields)`, `store.remove(id)` or `store.setConfig`. Never mutate `store.data` directly.
  - Each change is applied locally at once and queued in `localStorage`: new licks in `lc.pending`, edits and deletes in `lc.ops`.
  - `store.flush()` is single-flight read-modify-write: pull, replay the queue, push, then drop only what was sent. That way the phone and tablet don't clobber each other and nothing is lost offline.
  - Edits are debounced (about 0.8 s) and retried on `online`, on visibility change and on the next sync.
- **Lick record:** `{id, trackId, uri, title, artist, album, cover, durationMs, startMs, endMs, note, createdAt}`.
  - Adding fields is fine. Never rename or drop existing ones without a migration, because real data already lives in the Gist. The same applies to the `lc.*` localStorage keys.
- **Practice loop** (`playLoop` in `practice.js`): play from `startMs` → wait for the lick length → pause → seek → wait for the gap → play.
  - It re-reads the lick on every repeat, so trims made while it's looping take effect.
  - Timing accuracy is limited by API latency; `LATENCY_PAD` is the fudge factor.
- **Trim timeline** (`timeline.js`): a zoomed view around the lick.
  - Dragging fires `onDrag` for display only and commits once on release through `onCommit`. A tap calls `onSeek` (listen from there).
  - The view is frozen while dragging.
- **Quick mode:** the URL hash `#quick` saves a lick on load and when the tab becomes visible again. This backs the Android home-screen shortcut.

## Conventions
- Mobile-first. Test at 390px wide (phone) and around 1100px (tablet). Tap targets are at least 40px.
- Persist all `localStorage` access through the `LS` helper in `util.js`; it is wrapped in try/catch.
- Escape user and Spotify strings with `esc()` before putting them in `innerHTML`.
- Show errors to the user with `toast(msg, 'err')`, in plain language.

## Testing
- There are no automated tests yet. At minimum, after changes:
  - syntax-check the modules, e.g. `node --check js/*.js` if Node is installed (it isn't on the main Windows machine; loading the page in a browser catches syntax errors too);
  - load the page in a headless browser at both widths and check there are no console errors.
- Headless Chrome won't go narrower than 500px, so check phone width by loading the page in a 390px `<iframe>`.
- Mocking `window.fetch` before `js/main.js` loads lets you exercise the Gist and Spotify flows without real tokens.
- Run locally with `python -m http.server 8000` and open `http://127.0.0.1:8000/`. Modules don't load from `file://`.

## Workflow
- Commit small, descriptive changes, and push to `main` when a feature is done. Pushing deploys, so make sure the page loads before pushing.
