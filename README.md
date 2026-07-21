# Project Review

A phone + PC web app for running a **standardised project review process** and exporting a
**standardised review form** per project.

Built as an installable Progressive Web App (PWA): one codebase that runs in the browser on
your phone and your PC, stores everything **on the device** (no server, no account), and works
offline once loaded.

## Features

| Feature | How it works |
|---|---|
| 📷 Camera capture | "Add photo" opens your phone's camera directly; photos land straight in the review section and appear in the exported form (auto-downscaled to keep storage light). Captions supported. |
| 🎤 Dictation | Per-section mic button converts speech to text live (Web Speech API). Say "new point" / "full stop" to structure as you speak. |
| ✨ Tidy | One tap turns raw dictation into concise bullet points. Two modes: built-in **offline tidy** (removes filler words, splits into points), or optional **AI tidy** powered by Claude (bring your own Anthropic API key in Settings). |
| 🗂 Project database | Manually add projects (name, project aspect, reference, CAD name, CAD version, location, status, tags). Search and filter the list. |
| 📋 Reviews with sections | Each review has metadata (title, date, one or more reviewers picked from the NPI team list — new people can be added on the fly) plus any number of sections (e.g. Progress, Budget, Quality, Risks), each with notes and photos. Sections can be reordered. |
| 🗄 Saved reviews library | A **Saved reviews** tab on the home screen lists every review across all projects — searchable by project, title, reviewer, or date — so all saved reviews live in one browsable place, not just under each project. Reviews auto-save as you work and appear here automatically. |
| 👁 PDF-style read view | Tapping a review in **Saved reviews** opens it as the finished, formatted review form (the same layout as the export) rather than the edit screen. An **Edit review** button jumps into the editor when you need to change it, and Print / Save as PDF and Download are right there too. |
| 📄 Standardised export | One tap builds the review form: header, project/review metadata table, numbered sections with bullets and captioned photos, sign-off block. Print / Save as PDF, or download as an HTML file. |
| 📱 Installable + offline | Add to Home Screen on your phone; the app shell is cached by a service worker. |

## Getting it on your phone & PC

Camera and microphone need HTTPS, so host the app — GitHub Pages is free and takes a minute:

1. In this repo on GitHub: **Settings → Pages**.
2. Under *Build and deployment*, set **Source: Deploy from a branch**, pick the branch and `/ (root)`, save.
3. Open the URL GitHub gives you (e.g. `https://<user>.github.io/project-management/`) on your phone and PC.
4. On your phone: browser menu → **Add to Home Screen** to install it like an app.

No build step — it's plain HTML/CSS/JS.

## Using the app

1. **Settings** (gear icon): set your name and company (both appear on exported forms).
2. **New project** → fill in the details.
3. Open a project → **New review**. Add sections for each point you review.
4. In a section: tap **Dictate**, speak, tap **Stop**, then **Tidy into bullets**. Add photos with the camera button and caption them.
5. **Export review form** → Print / Save as PDF (or download the HTML file for records).

Everything autosaves as you type.

## AI tidy (optional)

Settings → enable **AI tidy** and paste an Anthropic API key. Dictation is then cleaned up by
Claude (`claude-opus-4-8`): filler removed, related fragments merged, all concrete facts
(measurements, locations, defects, actions) preserved as concise bullets. If the AI call fails
(offline, bad key), the app falls back to the offline tidy automatically.

Security notes:
- The key is stored only in this device's browser storage and sent only to `api.anthropic.com`.
- Use a dedicated key with a spend limit (console.anthropic.com → API keys).

## Data & limitations

- All data (projects, reviews, photos) lives in the browser's IndexedDB **on each device** —
  there is no sync between phone and PC yet. Export the HTML/PDF form to share.
- Dictation works best in Chrome (Android/desktop) and Edge. On iOS Safari support is partial —
  the keyboard's built-in mic key works in any text field as a fallback.
- Clearing browser site data deletes the app's data. Export anything you need to keep.

## Ideas for next iterations

- Sync between devices (e.g. via a simple backend or file-based export/import)
- Review templates (predefined section sets per review type)
- Photo annotation (draw/arrow on photos)
- Company logo on the exported form
- Direct PDF generation (no print dialog)
