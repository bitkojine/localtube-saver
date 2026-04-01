# LocalTube

Desktop app to download YouTube videos, transcode to MP4, and share to iPhone via QR code.

## Structure

- `Contract.md` — source of truth for behavior.
- `apps/desktop` — Electron app with `yt-dlp` + `ffmpeg` pipeline.

## Requirements

- Node.js 20+

## YouTube Download Bypass

To bypass YouTube's detection, this project:
- Uses `yt-dlp` nightly builds (auto-managed).
- Uses `node` JS runtime for signature challenges.
- Spoofs `ios` player client.
- Uses `po_token` and local browser cookies (`chrome`).

## Run

```bash
cd apps/desktop
npm install
npm run start
```

## Logs

Stored in `apps/desktop/logs/`. Auto-cleaned after 7 days.

## Notes

- **Output:** `~/Movies/LocalTube` (macOS) or `%USERPROFILE%\Videos\LocalTube` (Windows).
- **Transfer:** Link expires after 10 minutes.
- **Caching:** Uses `.cache.json` in output directory to skip redownloads.
