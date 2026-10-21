# Spoiler Shield: GTA VI & Custom Keywords

A Manifest V3 Chrome extension that covers anything mentioning GTA 6 / GTA VI, plus keywords you add.

## Features
- GTA VI filter on by default, switchable on its own.
- Custom keywords: whole-word, case-insensitive, phrases supported, works with non-Latin scripts. Add several at once with commas.
- Blur (click to reveal) or remove matches completely.
- Pause everywhere, or skip individual sites.
- Popup shows how many items were covered on the current page, with "Reveal everything".
- Watches dynamically loaded content (feeds, infinite scroll) and only rescans what changed.
- Also checks image alt text.
- No analytics, tracking or network requests.

## Install locally
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked** and select this folder (the one containing `manifest.json`).

## Limitations
- Text inside images, video and audio isn't detected. Some shadow-DOM sites may be missed.
- Which part of a page gets covered depends on its HTML. Known feeds (X, Reddit, YouTube, Hacker News, Google results) are handled; other pages fall back to the matching paragraph or list item.
- Chrome sync allows about 8 KB per stored item, so keywords are capped at 100 of up to 60 characters each.

## Before Chrome Web Store submission
Host `PRIVACY-POLICY.md` at a public URL with a real contact email, and make store screenshots without Rockstar/GTA logos or artwork.
