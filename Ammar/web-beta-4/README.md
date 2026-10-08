# GuideLens PWA — web app for visually impaired & elderly users

A **static, installable Progressive Web App** (no build step, no server code, no API keys).
Everything runs **on the phone**: obstacle detection (TensorFlow.js, on-device), walking
routes (OpenStreetMap routing), spoken output, vibration, OCR, SOS.

## Why GitHub Pages (recommended)
- GitHub Pages gives you **free HTTPS automatically** — required for camera, mic, GPS and "Add to Home Screen".
- The app is 100% static, so Node.js adds nothing except complexity. Use Node only if you later add your own backend.

### Deploy (2 minutes)
1. Create a GitHub repo, upload **all files in this folder** (keep `sw.js` and `manifest.webmanifest` at the repo root).
2. Repo → **Settings → Pages → Source: `main` / root → Save**.
3. Open `https://<you>.github.io/<repo>/` on the phone → browser menu → **Add to Home screen / Install app**.
4. First launch: allow **camera**, **microphone**, **location** when asked.

Local testing: `npx serve .` or `python3 -m http.server` (camera needs `localhost` or HTTPS).

## Using the app (voice-first)
- **Hold the big "Hold to Talk" button** and say:
  - "Navigate to the library" · "Where am I?" · "Read this" · "What's around me?"
  - "Repeat" · "Stop navigation" · "Help me" (SOS)
- Or use the large buttons directly. Hold **Space** on a desktop keyboard to talk.

## Features in this build
| Feature | How it works |
|---|---|
| Obstacle alerts | Camera + COCO-SSD on-device; distance estimated from apparent size; INFO/CAUTION/DANGER tiers with spoken + vibration alerts, 8 s dedup |
| Walking navigation | Geolocation + OSRM (OpenStreetMap) walking routes; pre-announce (≈20 m) + "Now" prompts; auto-recalculate when off-route |
| Where am I | Reverse geocoding, spoken address + GPS accuracy |
| Sign reading | Tesseract.js OCR on a camera snapshot |
| SOS | Vibrating alert + prefilled SMS with a Google Maps link to your exact location (set contact number in Settings) |
| Accessibility | Huge 88 px targets, dark high-contrast theme, Atkinson Hyperlegible font, TalkBack-friendly live regions, speech rate, verbosity & alert-distance settings |
| Installable/offline | PWA manifest + service worker (app shell + models cache) |

## Honest limitations (safety-critical — read this)
- **Distance is estimated from a single camera** (monocular). Treat alerts as *approximate*: "close" means 1–3 m, not exact centimeters.
- The browser **cannot guarantee < 500 ms alert latency** like the native spec; on older phones expect ~1 s.
- Voice recognition uses the browser engine (best in **Chrome on Android**); iOS Safari support is limited.
- Free map services (OSM routing/Nominatim) have **rate limits** — fine for personal use, not for thousands of users.
- No crosswalk/vehicle "safe to cross" advisory is implemented; the app **never** claims a road is safe.
- **GuideLens is a complement to your cane or guide dog, never a replacement.** This build is a working prototype, not a certified safety device.
