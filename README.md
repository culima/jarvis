# Jarvis

A personal desktop assistant for Windows, written from scratch.

- `src/main` — the app: the overlay window Jarvis lives in, the settings window, the tray, and the feed that reads
  how the screen is laid out (window rectangles and how busy each part of the picture is; nothing is stored).
- `src/overlay` — Jarvis himself: his body (`globe.js`), where he stands (`place.js`), how he moves and what he's
  doing (`engine.js`).
- `src/settings` — the settings window.

`npm install`, then `npm start` to run, `npm test` for the checks, `npm run dist` for the Windows installer.
