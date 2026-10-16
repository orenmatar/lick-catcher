# Lick Catcher

Catch jazz licks from Spotify on your phone with one tap, then practice them on your tablet: looped, with a break after each repeat so you can play it back.

**Live app:** https://orenmatar.github.io/lick-catcher/

## How it works

- **Catch (phone):** tapping *Save lick* asks Spotify what's playing and where, then saves the track plus a start/end time (the last N seconds). No audio is recorded. A lick is a bookmark into the track.
- **Practice (tablet):** pick a lick and the app drives the Spotify app on your tablet. It seeks to the start, plays to the end, pauses for your turn, and repeats.
- **Storage:** all licks live in one JSON file in a private GitHub Gist, so every device sees the same library. Tokens stay in each browser's `localStorage`.

The app is a single static `index.html` with no build step, no server and no dependencies.

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

- Spotify login only works on a URL listed as a Redirect URI. To test login locally, also add `http://127.0.0.1:8000/` in the Spotify dashboard.
- Spotify does not accept `localhost` as a Redirect URI; use `127.0.0.1`.
- Pushing to `main` redeploys GitHub Pages within about a minute.

## Known limits

- Loop timing is about ±0.2 s, because every play, pause and seek goes through Spotify's Web API.
- There's no slow-down: Spotify can't change playback speed.
- Spotify's Web API in Development Mode only works for accounts you add under *User Management*.

## Ideas

- Slow-down practice from purchased audio, cut automatically at the saved timestamps
- Tags (key, tune, chord type) and search
- A "lick of the day" review queue (spaced repetition)
- Waveform view for fine trimming
