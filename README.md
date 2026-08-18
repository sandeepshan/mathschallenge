# Maths Champions — Grade 5 Practice

An adaptive maths practice app built as an installable PWA, with cross-device progress that follows each student automatically and a school-wide leaderboard.

## What's in this folder

```
index.html                        the whole app (UI, question generators, game logic)
manifest.json                     PWA metadata (name, icons, colours)
sw.js                             service worker — caches the app for offline use
icons/                            app icons (192, 512, maskable, Apple touch icon)
netlify.toml                      Netlify build config + cache headers
package.json                      declares the one dependency the serverless functions need
netlify/functions/progress.js     serverless function powering per-student cross-device sync
netlify/functions/leaderboard.js  serverless function powering the shared leaderboard
```

There's no build step and no separate frontend framework — `index.html` is the entire client app.

## Deploy to Netlify via GitHub

Cross-device sync and the leaderboard need the serverless functions to actually build, and **that only happens on a Git-connected deploy** (drag-and-drop deploys skip functions).

1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repo.
3. Build settings: leave the build command empty, publish directory `.` (already set in `netlify.toml`, so Netlify should pick it up automatically).
4. Deploy. Netlify will run `npm install` (pulling in `@netlify/blobs`) and publish the site plus both functions automatically.

No extra accounts, API keys, or environment variables needed — Netlify Blobs (the storage behind sync and the leaderboard) is provisioned automatically for every Netlify site. One deploy of this app can serve an entire class or school — every student just opens the same URL on their own device.

## First launch: name, avatar, and personal code

The very first time the app opens on a device, it asks for a name (first name + last initial is a good pattern, e.g. "Alex T", to avoid mix-ups between classmates who share a first name) and an emoji avatar. This is required — there's no "skip" — because the name and avatar are what show up on the leaderboard and in results.

Right after that, the app generates a random 8-character **personal code** (e.g. `7HKX2QRM`) and shows it once on screen. That code is the student's identity: it's what makes their progress follow them to a second device (a tablet at school, a laptop at home) instead of staying stuck on the first one. Students should write it down or screenshot it.

On any other device, choosing **"Already used this app on another device? Enter your code"** on the welcome screen pulls that student's existing progress down from the cloud and picks up exactly where they left off — no re-entering their name or redoing any topics.

Only the name, avatar, personal code, and practice stats are stored (in the cloud, plus locally as a fast cache); no email, password, login, or other personal info is collected.

## How the leaderboard works

- A **Leaderboard** tab shows every student who has opted in, with two views: **This Week** (ranked by points earned since Monday — resets naturally each week so a student who joins in week 6 isn't stuck behind everyone's accumulated total) and **All-Time** (career points, accuracy, best streak).
- A **Most Improved** spotlight highlights whoever had the biggest week-over-week accuracy gain — rewarding students who are closing gaps, not just the ones with the most raw practice time.
- Opting in/out is a simple checkbox (on by default) on the Leaderboard tab and in the initial name prompt — turning it off just stops that student's row from being pushed publicly; their own local progress and stats are unaffected either way.
- There's no teacher login and no class grouping by design — it's one shared board for the whole grade/cohort using this deployed URL, so any student in Grade 5 can join in regardless of which class or teacher they have. That keeps setup at zero configuration: one link, everyone's on the same board.
- Student names are sanitized server-side and escaped client-side before rendering, so the shared leaderboard is safe even if someone types something unexpected into the name field.

## Learning features

- **Spaced repetition**: a missed question quietly resurfaces a few days later (2, then 4, then 7, then 14, then 30 days if it keeps getting missed) woven into a normal Practice/Challenge session. Get it right and it's retired; get it wrong again and it comes back sooner.
- **Drill Weak Spot**: a quick-mode card on Home that jumps straight into a focused 10-question session on whichever topic currently has the lowest accuracy.
- **Accessibility**: a "Large text / easy-read mode" toggle (bigger, more spaced-out text) and a "Read questions aloud" toggle (uses the browser's built-in text-to-speech; there's also a manual 🔊 button on every question) — both live in the settings row under the Start Session button on Home.
- **Printable certificate**: a "🖨️ Print my certificate" button on the Achievements tab generates a clean, print-only Certificate of Achievement with the student's name, avatar, rank, key stats, and earned badges — good for a folder, fridge, or classroom wall.

## How cross-device sync works

Sync is on by default from the moment a student sets up their profile — there's no separate "turn on sync" step to remember.

- At first launch, the app generates that student's personal code and immediately starts backing their progress up to the cloud in the background, automatically, after every session.
- On a second device, choosing **"Enter your code"** on the welcome screen pulls that progress down and picks up right where they left off. From then on, both devices quietly stay in sync whenever the app is open.
- The **Achievements** tab always shows the student's code (with a copy button) under **Cross-device sync**, along with a live sync status, in case they need to check or re-enter it on another device later.
- **Stop syncing** on a device just disconnects that device; the progress already on it stays put, and the cloud copy (and any other synced device) is unaffected.

There are no logins or passwords — the personal code *is* the access key, similar to an "anyone with this link" share, and it also doubles as the student's leaderboard identity (so the same student is recognized consistently no matter which device they're on). Treat it like a shared link: don't post it somewhere public.

Local storage on each device is always the source of truth for instant reads/writes; the cloud copy (Netlify Blobs) mirrors it in the background, so the app works completely normally offline and simply syncs up again once it's back online.

## Installing as an app (PWA)

Once deployed, open the Netlify URL on a phone, tablet, or laptop:

- **Android/Chrome**: tap the "📲 Install app on this device" button in the app, or use the browser menu → *Install app*.
- **iOS/Safari**: Share icon → *Add to Home Screen* (Safari doesn't support the automatic install prompt, so this manual step is required on iPhone/iPad).

Once installed, it behaves like a native app icon and works offline (service worker caches the app shell).

## Local development (optional)

If you have the [Netlify CLI](https://docs.netlify.com/cli/get-started/) installed:

```
npm install
netlify dev
```

This runs the site with a local, sandboxed Blobs store (separate from production) so you can test both functions without affecting real data.

## Notes

- The question bank is procedurally generated (not a fixed list), covering Number, Fractions & Decimals, Algebra, Measurement, Geometry, Statistics & Probability, and Logic — across 12 adaptive difficulty levels (Bronze through Legendary) — so it won't run out or repeat.
- Game modes: adaptive Practice, timed Challenge, a 60-second Speed Round, a daily-refreshing Daily Challenge (identical for every student on a given date), a milestone Boss Battle that unlocks every 5 completed sessions, and a Drill Weak Spot quick-practice mode.
- The mascot (Professor Hoot) visually levels up as a student earns more badges — a fun, non-competitive nod to progress that only that student sees.
- All progress, achievements, and sync codes live in the browser's `localStorage` plus (optionally) the Netlify Blobs store. The leaderboard store only ever holds a student's chosen name, avatar, points, accuracy, and best streak — never anything else.
