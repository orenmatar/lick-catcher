# Lick Catcher

Catch jazz licks from Spotify on your phone with one tap, then practice them on your tablet: looped, with a break after each repeat so you can play it back.

**Live app:** https://orenmatar.github.io/lick-catcher/

## How it works

- **Catch (phone):** tapping *Save lick* asks Spotify what's playing and where, then saves the track plus a start/end time (the last N seconds). No audio is recorded. A lick is a bookmark into the track.
- **Practice (tablet):** pick a lick and the app drives the Spotify app on your tablet. It seeks to the start, plays to the end, pauses for your turn, and repeats.
- **Trim:** the timeline under the lick shows a few seconds either side of it.
  - Drag a handle to move the start or end, or drag the shaded part to move the whole lick.
  - Tap anywhere on the timeline to listen from that point, then press **⌖ Now** to set an edge exactly where Spotify is.
  - The ±¼ s and ±1 s buttons fine-tune each edge, and you can type a time such as `1:23.4`.
- **Saving:** every change (trim, note, delete) is saved on the device at once and synced to the cloud in the background. The status next to *Length* says *Saving…*, *Saved ✓*, or *Saved on this device · will sync* when you're offline. Unsynced changes retry when the connection returns or the app is reopened.
- **Storage:** all licks live in one JSON file in a private GitHub Gist, so every device sees the same library. Tokens stay in each browser's `localStorage`.

The app is static HTML, CSS and native ES modules. It has no build step, no server and no dependencies.

## Setup

1. **Spotify app:** create one at <https://developer.spotify.com/dashboard>.
   - Set the Redirect URI to `https://orenmatar.github.io/lick-catcher/` (exact, with the trailing slash).
   - Tick *Web API* and copy the Client ID.
   - Spotify Premium is required. If login gives a 403, add your account under *User Management*.
2. **GitHub token:** create a classic token at <https://github.com/settings/tokens/new> with only the `gist` scope.
3. **Each device:** open the app, go to **Setup**, paste the token and connect Spotify.
   - On Android, open the quick-save link and choose *Add to Home screen* for a one-tap catch button.

## Development

```bash
git clone https://github.com/orenmatar/lick-catcher.git
cd lick-catcher
python3 -m http.server 8000   # then open http://127.0.0.1:8000/
```

- Use a local server rather than opening `index.html` as a file: browsers don't load ES modules from `file://`.
- Spotify login only works on a URL listed as a Redirect URI. To test login locally, also add `http://127.0.0.1:8000/` in the Spotify dashboard.
- Spotify does not accept `localhost` as a Redirect URI; use `127.0.0.1`.
- Pushing to `main` redeploys GitHub Pages within about a minute.

### Layout

```
index.html        markup only
css/style.css     all styles
js/main.js        entry point: tabs, wiring, quick mode, boot
js/util.js        DOM, localStorage, escaping, time helpers, toast
js/settings.js    per-device settings
js/spotify.js     Spotify auth (PKCE) and Web API calls
js/store.js       Gist storage with an offline edit queue
js/catch.js       Catch tab
js/lists.js       lick lists
js/practice.js    player, trim controls, practice loop
js/timeline.js    draggable trim timeline
js/setup.js       Setup tab
```

## Known limits

- Loop timing is about ±0.2 s, because every play, pause and seek goes through Spotify's Web API.
- There's no slow-down: Spotify can't change playback speed.
- Spotify's Web API in Development Mode only works for accounts you add under *User Management*.

## Ideas

- Slow-down practice from purchased audio, cut automatically at the saved timestamps
- Tags (key, tune, chord type) and search
- A "lick of the day" review queue (spaced repetition)
- Waveform view for fine trimming
