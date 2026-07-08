# PhotoFlow 📸

A fast, minimal photo manager for Windows, inspired by the classic FastStone
Image Viewer — rebuilt with a modern look and a tiny footprint.

**1.76 MB installer · 4.6 MB app · no Electron.**

*Gestor de fotografies ràpid i minimalista per a Windows, inspirat en FastStone
però amb aspecte modern. Interfície en català.*

## Download

**[⬇ Download the latest installer](https://github.com/ponelplay/photoflow/releases/latest)**
(Windows 11, x64 · ~1.8 MB · needs WebView2, already bundled with Windows 11)

On first launch Windows SmartScreen may warn about an unsigned app — click
*More info → Run anyway*. The source in this repo is what the installer is built from.

## Features

- **Browse your whole PC** — drive tree with lazy loading, quick links, instant
  thumbnails (parallel Rust decoding, EXIF-orientation aware, disk cache)
- **Virtualized grid** — folders with 10k+ photos stay smooth
- **Viewer** — zoom to cursor, pan, visual rotation, prev/next preloading
- **Non-destructive editor** — rotate, crop, brightness/contrast/saturation
  saved as *recipes*; originals are never touched. Export edited copies.
- **Ratings & labels** — 1–5 stars and color labels, all keyboard-driven,
  with instant search and filters
- **Culling mode** — review a full card with the keyboard only: rate,
  label or discard with auto-advance, then empty the rejects in one go
- **Batch tools** — pattern renaming (`{date}_{counter}` style, live preview)
  and format/size conversion with real-time progress
- **File operations** — copy, move, rename, recycle-bin delete, drag & drop
  onto the folder tree, drag-in import from Explorer
- **Duplicates finder** — perceptual hash (dHash) detects near-identical shots
- **Side-by-side compare** — 2–4 photos with synchronized zoom & pan
- **Timeline view** — photos grouped by month
- **EXIF panel + histogram** — luminance + RGB channels
- Light & dark themes, custom titlebar, Catalan UI

## Tech

[Tauri 2](https://tauri.app) (Rust backend) + React + TypeScript + Zustand.
Thumbnails are served through a custom `thumb://` protocol with a disk cache;
the catalog (ratings/labels/edit recipes) is a debounced-write JSON store.
Only two Rust crates beyond the Tauri stack: `image` and `trash`.

## Building

Requirements: Node 18+, Rust (MSVC toolchain), Visual Studio C++ Build Tools.

```sh
npm install
npm run tauri dev     # development window
npm run tauri build   # release + NSIS/MSI installers in src-tauri/target/release/bundle/
```

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free for any noncommercial use
(personal, education, research, nonprofits). Commercial use is not permitted.

The lens artwork used for the app icon may be subject to third-party stock
image rights; replace `app-icon.png` (then run `npx tauri icon app-icon.png`)
if you redistribute.
