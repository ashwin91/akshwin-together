# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A single-page, mobile-first static wedding invitation for Ashwin & Akshata (South Indian garden muhurtham, August 16, 2026). No build system, no framework, no package manager — just `index.html`, `styles.css`, `app.js`, and `data/wedding.json`. Hosted as static files (Vercel: Framework Preset `Other`, empty build command, output directory `.`).

## Run / Develop

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080`. There are no tests, no linter, and no build step — editing a file and refreshing the browser is the full dev loop. The service worker (`sw.js`) only registers over http/https, not `file://`, so use the server above rather than opening `index.html` directly.

## Architecture

**Data-driven rendering.** Almost all guest-facing content (events, travel, FAQ, bilingual copy, venue) lives in `data/wedding.json`, fetched at runtime by `loadWeddingData()` in `app.js`. `index.html` ships mostly empty container elements (`#events-grid`, `#travel-accordion`, `#faq-list`, etc.) that JS fills in. **To change wedding content, edit the JSON, not the HTML.** `app.js` carries a hardcoded fallback copy of this structure inside `loadWeddingData()`'s `catch` block — if you add or rename a top-level JSON field, update that fallback too or it will break when the fetch fails.

**Single init pipeline.** `app.js` runs everything from one `init()` on `DOMContentLoaded` (line ~26). Each feature is an `initX()` function called in sequence; they're largely independent, so adding a feature means writing an `initX()` and adding one call to `init()`.

**Bilingual (EN / Kannada).** Language is toggled by `applyLanguage()`, which swaps `textContent` on every `[data-i18n]` element using keys from `data.copy.en` / `data.copy.kn`. Events re-render on toggle to pick up `titleKannada`. New translatable strings need: a `data-i18n` attribute in HTML + matching keys in both `copy.en` and `copy.kn`.

**Time handling.** The muhurtham countdown target is **hardcoded** as `2026-08-16T11:15:00+05:30` in `initCountdown()` — it is not read from JSON. IST is the canonical display timezone (`formatISTTime` pins `Asia/Kolkata`); guest local time is shown as a secondary hint via `formatLocalDateTime`. Event start/end in JSON are ISO strings with the `+05:30` offset.

**Canvas + animation layers.** A persistent full-screen `#petal-canvas` runs a `requestAnimationFrame` loop (`initPetalCanvas`); `petalBurst()` / `petalRain()` push particles into the shared `state.petals` array (capped at 120). The Marigold Catch game (`initMarigoldCatch`) uses its own separate `#game-canvas`. All motion is gated by `prefersReducedMotion()` — respect this guard when adding animation. GSAP/ScrollTrigger, jQuery, and Lenis smooth-scroll are loaded from CDN and treated as **progressive enhancements** (`initPremiumEnhancements` guards on `window.gsap`, `window.jQuery`, and try/catches the Lenis dynamic import); the site must work without them.

**State & persistence.** Runtime state is the module-level `state` object. User progress persists only in `localStorage` (keys prefixed `akshwin*`): `akshwinLang`, `akshwinKolamUnlocked`, `akshwinMarigoldUnlocked`, `akshwinInviteOpened`, and `akshwinRsvps`. There is no backend.

**RSVP submission** (`initRSVP`): if `data.rsvpEndpoint` is set, POSTs JSON to it with `mode: "no-cors"` (intended for a Google Apps Script web app — see README for the receiving script and Sheet columns). If the endpoint is blank, it falls back to storing submissions in `localStorage`. Either way it then opens a WhatsApp share.

**Interactive unlockables.** The Kolam Builder (`initKolamBuilder`) is an SVG 3×3 dot-tracing puzzle; tracing the `target` sequence (or the "Accessible Solve" button) unlocks the hidden gallery and sets the RSVP code `GOLDENGARLAND`. Marigold Catch unlocks a downloadable wallpaper. Easter eggs (`initEasterEggs`): Konami code and typing `AKSHATA`. These are intentional features, not dead code.

**PWA.** `sw.js` is network-first with cache fallback and maintains an explicit `CORE_ASSETS` list for the offline shell. If you add a core asset (or rename `app.js`/`styles.css`), update `CORE_ASSETS` and bump `CACHE_NAME` (`akshwin-static-v1`) so clients pick up the change.

## Conventions

- Vanilla ES (no transpilation, no modules other than the one dynamic `import()` for Lenis). Use the `qs` / `qsa` helpers at the top of `app.js` instead of raw `querySelector`.
- The `palette` object in `app.js` mirrors the CSS color scheme; reuse it for canvas drawing so JS and CSS stay in sync.
- Assets: raster art under `assets/images/`, motif/icon vectors under `assets/svg/`.

## Launch Checklist (from README)

Before going live, replace the placeholder values in `data/wedding.json`: `siteUrl`, `venue.name`, `venue.address`, `venue.mapQuery`, `whatsappPhone`, and `rsvpEndpoint`. The venue fields currently contain `[VENUE NAME]` / `[FULL ADDRESS, REDMOND WA]` placeholders.
