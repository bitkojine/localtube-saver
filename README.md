# LocalTube Saver

An Electron desktop app that downloads YouTube videos, transcodes them to iPhone-compatible MP4, and lets you grab them over local Wi-Fi via QR code.

## Current Status

**Working prototype / late beta.** The core download → transcode → transfer pipeline works end-to-end on macOS. Everything else ranges from incomplete to absent.

### What Works

- YouTube video info retrieval via `yt-dlp` (nightly builds, auto-updated daily)
- Download with progress, stall detection, timeout (720p max, 5 min total timeout)
- ffmpeg transcode to libx264 + AAC (CRF 30, High profile, fast preset)
- Local HTTP transfer server with random-token auth
- QR code generation for the transfer URL
- File cache (avoids re-downloading the same video ID)
- Simple Lithuanian UI
- File-based daily rotating logs (7-day retention)
- Concurrency-limited task queue (max 2 downloads)
- Disk space check before download
- Smoke test mode (`--smoke-test`)

### What Doesn't Work / Needs Major Work

- **No tests.** Zero test files, zero test infrastructure.
- **YouTube is unstable.** `YOUTUBE_PO_TOKEN` and `YOUTUBE_VISITOR_DATA` in `src/config.ts` are hardcoded to empty strings. Without them, YouTube may return bot-detection or age-restriction errors. There is no environment variable loading, no config UI, no documentation on how to obtain these values. yt-dlp compatibility with YouTube breaks unpredictably.
- **Windows was never successfully deployed.** Every attempt to run on Windows failed. `storage.ts` uses `fs.statfsSync` (POSIX-only, crashes on Windows). Cookie extraction assumes Chrome. Path separators are inconsistently handled. In retrospect, Electron added complexity far beyond what this project needed — a CLI tool piped through `ffmpeg` + a simple `python -m http.server` would have been more robust, easier to maintain, and actually cross-platform.
- **Lithuanian-only.** All UI strings are hardcoded in Lithuanian with no i18n system. The renderer (`renderer.ts`) duplicates raw Lithuanian strings because it can't import the main process's `strings.ts` module.
- **Dead dependencies.** `ee-first` is listed in `package.json` but never imported anywhere.
- **Stale Go directory.** `apps/desktop-go/` (175MB) contains prebuilt Go/Wails `.app` bundles from an abandoned rewrite attempt. No source files, no build scripts, just compiled binaries and `node_modules`. It's unclear what state they're in or whether they even launch.
- **Old installer artifact.** `apps/desktop/dist/` (696MB) contains a `LocalTube-Saver-0.4.2.dmg` and `mac-arm64/LocalTube Saver.app` from a previous version. The package.json says v0.4.8. This directory is stale and should be cleaned up.
- **Memory leak.** The `downloads` map in `main.ts` grows indefinitely — completed/failed items are never removed.
- **String duplication.** Lithuanian error messages and status strings exist in three places: `strings.ts`, `renderer.ts` (as `STORAGE_STRINGS`), and inline in error-classification code in `main.ts`.
- **Log location doesn't match contract.** `Contract.md` says logs go to `~/Library/Logs/LocalTube`. In practice they go to `apps/desktop/logs/` (dev) or inside the app bundle (packaged).
- **No configuration system.** PO tokens must be edited directly in source code. No `.env` loading, no settings UI, no config file.
- **No CI/CD.** All GitHub releases and tags have been deleted. The release workflow exists but would publish to a repo with no releases.
- **Transfer server binds to `0.0.0.0`.** The HTTP server is exposed on all network interfaces. Security relies entirely on a 128-bit random token in the URL. No HTTPS, no authentication beyond the token.
- **Unsafe init.** `renderer.ts` calls `init()` without `await` — if `getVersion()` or `getFiles()` rejects, the error is unhandled.
- **TS 6.x with hacks.** TypeScript 6.0.2 is very new and the config uses `ignoreDeprecations: "6.0"` to suppress warnings. This is unlikely to work with standard tooling.
- **No auto-updates.** `electron-updater` is configured but there are no releases to check against. The update notification UI will never fire.
- **No resumable downloads.** `yt-dlp` is invoked with `--no-part`, so partial downloads are lost on failure and must restart from zero.

## How to Run (macOS)

```bash
git clone https://github.com/bitkojine/localtube-saver.git
cd localtube-saver
npm install
cd apps/desktop
npm run build:ts
npx electron dist-tsc/main.js
```

The app opens a window. Paste a YouTube URL and click download. When processing finishes, a QR code appears — scan it from your iPhone on the same Wi-Fi network.

## Technical Architecture

- **Main process** (`main.ts`, `src/`): CommonJS, compiled by `tsconfig.json`. Runs yt-dlp, ffmpeg, Express server.
- **Renderer** (`renderer.ts`): ESM (`<script type="module">`), compiled by `tsconfig.renderer.json`. Pure browser-side UI.
- **Preload** (`preload.ts`): Context bridge exposing a typed `LocaltubeAPI` interface via `contextBridge`.
- **No framework.** Vanilla HTML/CSS/TypeScript renderer. No React, no Vue, no bundler (TypeScript only).
- **No comments anywhere** enforced by a custom ESLint rule.
- **Strict type safety** enforced: `no-explicit-any: error`, `no-restricted-types` (bans `unknown`).

### Key Dependencies

| Tool | Purpose |
|------|---------|
| yt-dlp (nightly) | Video extraction and download |
| ffmpeg-static | Binary-free ffmpeg bundling |
| ffprobe-static | Binary-free ffprobe bundling |
| Express | Local HTTP transfer server |
| qrcode | QR code generation (data URI) |
| electron-updater | Auto-update (currently non-functional) |

## Project Structure

```
apps/desktop/
  main.ts              -- Electron main process
  preload.ts           -- Context bridge (22 lines)
  renderer.ts          -- Browser UI (345 lines)
  index.html           -- App shell (Lithuanian)
  styles.css           -- All styles (302 lines)
  src/
    types.ts           -- Shared interfaces and types
    AppError.ts        -- Typed error class
    config.ts          -- Hardcoded configuration
    download.ts        -- yt-dlp pipeline
    transcode.ts       -- ffmpeg pipeline
    transfer.ts        -- Express transfer server
    storage.ts         -- File management + cache
    queue.ts           -- Concurrency-limited task queue
    tools.ts           -- Binary management (yt-dlp update)
    logging.ts         -- File-based daily logger
    validation.ts      -- YouTube URL parser
    util.ts            -- Local IP, throttle
    strings.ts         -- Lithuanian UI strings
  dist-tsc/            -- Compiled JS (gitignored)
  dist/                -- Old installers (stale)
apps/desktop-go/        -- Abandoned Go/Wails port (stale)
```

## License

MIT
