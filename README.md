# LocalTube

Desktop app to download YouTube videos, transcode to iPhone-compatible MP4 (H.264 + AAC), and share via a temporary local URL/QR code.

## Structure

- `Contract.md` — source of truth for behavior.
- `apps/desktop` — Electron app (Node.js) with `yt-dlp` + `ffmpeg` pipeline.

## Requirements

- Node.js 20+
- `yt-dlp` nightly builds (automatically managed by the app)
- `ffmpeg` / `ffprobe` (bundled via `ffmpeg-static` / `ffprobe-static`)

## YouTube Download Bypass

To ensure reliable downloads and bypass YouTube's bot detection, this project implements several key strategies:

- **Nightly Builds:** The app automatically updates `yt-dlp` to the latest nightly version.
- **JavaScript Runtime:** Uses `node` as a JS runtime (`--js-runtimes node`) to solve YouTube's signature challenges.
- **Client Spoofing:** Uses the `ios` player client for better extraction success.
- **PO Token (Proof of Origin):** Includes a `po_token` in extractor arguments.
- **Cookies:** Optionally pulls cookies from the user's local browser (default: Chrome) via `--cookies-from-browser chrome`.

## Logging

Logs are stored in:
- `apps/desktop/logs/` (named by date, e.g., `2026-04-01.log`)

Logs include `DEBUG`, `INFO`, `WARN`, and `ERROR` levels with timestamps and stack traces for failures. Old logs (older than 7 days) are automatically cleaned up.

## Run

```bash
cd apps/desktop
npm install
npm run start
```

## E2E Testing

A standalone E2E test is available to verify the download pipeline:

```bash
cd apps/desktop
node e2e_download.js
```

## Notes

- **Output directory:**
  - macOS: `~/Movies/LocalTube`
  - Windows: `%USERPROFILE%\Videos\LocalTube`
- **Transfer link:** Expires after 10 minutes.
- **Caching:** Completed videos are cached in `.cache.json` within the output directory to avoid redundant downloads.
