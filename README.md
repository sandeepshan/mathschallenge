# MAV Maths Challenge — Grade 5 Prep

An adaptive maths practice app for the Maths Association of Victoria competition, built as an installable PWA with cross-device progress sync.

## What's in this folder

```
index.html                    the whole app (UI, question generators, game logic)
manifest.json                 PWA metadata (name, icons, colours)
sw.js                         service worker — caches the app for offline use
icons/                        app icons (192, 512, maskable, Apple touch icon)
netlify.toml                  Netlify build config + cache headers
package.json                  declares the one dependency the sync function needs
netlify/functions/progress.js serverless function powering cross-device sync
```

There's no build step and no separate frontend framework — `index.html` is the entire client app.

## Deploy to Netlify via GitHub

Cross-device sync needs the serverless function to actually build, and **that only happens on a Git-connected deploy** (drag-and-drop deploys skip functions). Since you're hosting from GitHub already, this is exactly the right setup:

1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repo.
3. Build settings: leave the build command empty, publish directory `.` (already set in `netlify.toml`, so Netlify should pick it up automatically).
4. Deploy. Netlify will run `npm install` (pulling in `@netlify/blobs`) and publish both the site and the `progress` function automatically.

No extra accounts, API keys, or environment variables needed — Netlify Blobs (the storage behind sync) is provisioned automatically for every Netlify site.

## How cross-device sync works

- On the **Achievements** tab there's a **Cross-device sync** card.
- Tap **Create sync code** on Vivaan's main device — this generates a random 8-character code (e.g. `7HKX2QRM`) and starts backing up progress to the cloud in the background.
- On a second device, open the app, go to Achievements, and enter the same code under **Join**. That device pulls down the existing progress (it'll ask before overwriting anything already on that device) and from then on both devices quietly sync whenever the app is open — after finishing a session, and whenever a tab is reopened or refocused.
- **Stop syncing** on a device just disconnects it; the progress already on that device stays put.

There are no logins or passwords — the sync code *is* the access key, similar to an "anyone with this link" share. That's fine for a low-stakes practice app, but treat the code like you would a shared link: don't post it somewhere public. If a code is ever compromised, just create a new one.

Local storage on each device is always the source of truth for instant reads/writes; the cloud copy (Netlify Blobs) is a background mirror, so the app works completely normally offline and simply syncs up again once it's back online.

## Installing as an app (PWA)

Once deployed, open the Netlify URL on a phone or tablet:

- **Android/Chrome**: tap the "📲 Install app on this device" button in the app, or use the browser menu → *Install app*.
- **iOS/Safari**: Share icon → *Add to Home Screen* (Safari doesn't support the automatic install prompt, so this manual step is required on iPhone/iPad).

Once installed, it behaves like a native app icon and works offline (service worker caches the app shell).

## Local development (optional)

If you have the [Netlify CLI](https://docs.netlify.com/cli/get-started/) installed:

```
npm install
netlify dev
```

This runs the site with a local, sandboxed Blobs store (separate from production) so you can test the sync function without affecting real data.

## Notes

- The question bank is procedurally generated (not a fixed list), covering Number, Fractions & Decimals, Algebra, Measurement, Geometry, Statistics & Probability, and Logic — across 10 adaptive difficulty levels — so it won't run out or repeat.
- All progress, achievements, and the sync code itself live in the browser's `localStorage` plus (optionally) the Netlify Blobs store — nothing is sent anywhere else.
