# Ashwin & Akshata Wedding Website

A static, mobile-first South Indian garden wedding invitation for Ashwin & Akshata. No build system is required: edit HTML, CSS, JS, and `data/wedding.json`, then host the folder for free.

## Run Locally

From this folder:

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080`.

## Edit Wedding Details

All couple, parent, venue, event, travel, and FAQ content lives in:

```text
data/wedding.json
```

Update these before launch:

- `siteUrl`
- `venue.name`
- `venue.address`
- `venue.mapQuery`
- `whatsappPhone`
- `rsvpEndpoint`

## Production Vercel Deploy

This directory is already linked to the Vercel project `akshwin-together` through `.vercel/project.json`. Deploy from this directory, not the sibling `akshata-ashwin-wedding` project.

Use this established command:

```bash
npx --yes vercel@latest deploy --prod --yes --archive=tgz
```

`--archive=tgz` makes the Vercel CLI package the project as a source archive. Vercel may display the internal upload as `.vercel/source.tgz.part1`; do not create that file manually.

The upload occasionally fails with an SSL `bad record mac` error. If it does, confirm no deployment was created and retry the exact same command once. Do not switch to custom upload scripts or another project directory.

If the CLI keeps trying to upload the whole working tree, create a clean linked copy under `/private/tmp` with the same `.vercel/project.json`, excluding source-only folders like top-level `video/`, `.git/`, `scripts/`, and unused video variants. Deploy from that clean copy with the same command above first. If archive mode still repeatedly fails with the SSL `bad record mac` upload error, use the standard Vercel upload path from the same clean copy:

```bash
npx --yes vercel@latest deploy --prod --yes
```

Keep the production story videos under `assets/video/` included.

Deploy packaging notes learned from production:

- `.vercelignore` patterns like `video/` or `video/**` can also match `assets/video/` and remove the live story videos. Use the anchored `/video/` pattern for the top-level source folder.
- The live site needs `entry.mp4`, `assets/video/our-story-v2.mp4`, and `assets/video/our-story-v2-portrait.mp4`.
- After any deploy-copy workaround, verify the story video URLs directly with `curl -I`; a good deploy returns `HTTP/2 200` for both `assets/video/our-story-v2.mp4` and `assets/video/our-story-v2-portrait.mp4`.

After deployment, verify the production alias and RSVP API:

```bash
curl -I https://akshwin-together.vercel.app
curl 'https://akshwin-together.vercel.app/api/rsvp?phone=TEST_PHONE'
```

The successful deployment should finish with:

```text
Aliased https://akshwin-together.vercel.app
```

## Google Sheets RSVP Wiring

The site supports creating, retrieving, and updating an RSVP by phone number. Browser requests go through the same-origin Vercel function at `api/rsvp.js`, which proxies the Google Apps Script web app. The Apps Script also sends the themed RSVP confirmation email from the Google account that owns the deployment.

1. Create a Google Sheet and copy its ID from the URL between `/d/` and `/edit`.
2. Open Extensions → Apps Script.
3. Paste `scripts/google-apps-script-rsvp.gs`.
4. Replace `PASTE_GOOGLE_SHEET_ID_HERE` with the copied Sheet ID.
5. Deploy → New deployment → Web app.
6. Set Execute as to `Me` and Who has access to `Anyone`.
7. Copy the `/exec` Web App URL into `data/wedding.json` as `rsvpEndpoint`.
8. Submit one test RSVP after deploying the Apps Script and approve the Google permission prompt for sending email.
9. Redeploy the website to Vercel.

The script creates the `RSVP` sheet headers automatically, including `phone`, `phoneNormalized`, `rsvpStatus`, and `roomNights`. A submission with a new normalized phone number creates a row; another submission with the same number updates that row. The lookup UI loads the row back into a collapsed summary, and guests can expand the form with Edit RSVP.

When updating an existing Apps Script deployment, replace its code with `scripts/google-apps-script-rsvp.gs`, then use Deploy → Manage deployments → Edit → New version → Deploy. The Web App URL remains the same. On its next request, the script safely renames legacy `whatsapp` and `whatsappNormalized` headers to `phone` and `phoneNormalized` without changing the RSVP rows.

For local static demos, an unconfigured endpoint falls back to `localStorage`. Phone-only lookup is convenient but is not identity verification. Use an SMS OTP provider before exposing more sensitive guest information.

## Included Interactions

- Envelope invitation opener
- Scratch-to-reveal wedding date
- Three illustrated event cards with attire, venue maps, and `.ics`
- Petal shower, vilakku click blessing, peacock night mode
- Kolam Builder puzzle with accessible solve
- Marigold Catch canvas game and wallpaper unlock
- Konami, AKSHATA typing, and ampersand Kannada easter eggs
- PWA manifest and service worker offline shell

## Assets

The user-provided artwork is stored under `assets/images`. SVG motifs live under `assets/svg`.
