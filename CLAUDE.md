# Lick Catcher: notes for Claude

Personal jazz practice app. Read README.md for the user-facing picture.

## Architecture
- Everything is in `index.html`: inline CSS and one inline IIFE script. It's static and deployed by GitHub Pages from `main` at https://orenmatar.github.io/lick-catcher/
- No build step and no dependencies. Keep it that way unless a feature clearly needs one; ask before adding a framework or bundler.
- **Spotify:** Authorization Code + PKCE straight from the browser (no client secret).
  - Scopes: `user-read-currently-playing user-read-playback-state user-modify-playback-state`.
  - The redirect URI is `location.origin + location.pathname`.
  - The app is in Spotify Development Mode (2026 rules: Premium required, allow-listed users only). Don't rely on endpoints that need Extended Quota.
- **Storage:** one private Gist with description `Lick Catcher data` and file `licks.json`, shape `{version, config:{clientId}, licks:[...]}`.
  - Writes are read-modify-write (`store.mutate`) so the phone and tablet don't clobber each other.
  - Offline catches queue in `localStorage` key `lc.pending`.
- **Lick record:** `{id, trackId, uri, title, artist, album, cover, durationMs, startMs, endMs, note, createdAt}`.
  - Adding fields is fine. Never rename or drop existing ones without a migration, because real data already lives in the Gist.
- **Practice loop** (`playLoop`): play from `startMs` → wait for the lick length → pause → seek → wait for the gap → play.
  - Timing accuracy is limited by API latency; `LATENCY_PAD` is the fudge factor.
- **Quick mode:** the URL hash `#quick` saves a lick on load and when the tab becomes visible again. This backs the Android home-screen shortcut.

## Conventions
- Mobile-first. Test at 390px wide (phone) and around 1100px (tablet). Tap targets are at least 40px.
- Persist all `localStorage` access through the `LS` helper; it is wrapped in try/catch.
- Escape user and Spotify strings with `esc()` before putting them in `innerHTML`.
- Show errors to the user with `toast(msg, 'err')`, in plain language.

## Testing
- There are no automated tests yet. At minimum, after changes:
  - extract the script and run `node --check` on it;
  - load the page in a headless browser at both widths and check there are no console errors.
- Run locally with `python3 -m http.server 8000` and open `http://127.0.0.1:8000/`.

## Workflow
- Commit small, descriptive changes. Pushing to `main` deploys, so make sure the page loads before pushing.
