# LocalTube Saver

A CLI tool that downloads YouTube videos, transcodes them to iPhone-compatible MP4, and serves them over local Wi-Fi via QR code.

## Quick Start

```bash
npx github:bitkojine/localtube-saver <youtube-url>
```

Or from a clone:

```bash
git clone https://github.com/bitkojine/localtube-saver.git
cd localtube-saver
cd apps/desktop
npm install
npm run build:ts
node dist-tsc/src/cli.js <youtube-url>
```

The pipeline runs: download → transcode → start local HTTP server → print QR code. Scan with your iPhone on the same Wi-Fi.

## Status

**Working prototype — macOS only.** The core download → transcode → serve pipeline works end-to-end on macOS.

### What Actually Works

- YouTube video info retrieval via `yt-dlp` nightly builds (auto-updated daily)
- Download with progress reporting, 30s stall detection, 5 min total timeout, 720p max
- Auto-retry on format failure (falls back from `bv*[height<=720]+ba/best` to `best`)
- ffmpeg transcode to H.264 High + AAC (CRF 30, fast preset, `-movflags +faststart`, audio copy at >=160kbps)
- Local HTTP transfer server with random 128-bit token auth, 2GB file limit, QR code in terminal
- File cache (video ID → output path, avoids re-download)
- Concurrency-limited queue (max 2 simultaneous downloads)
- Disk space check (requires 2x estimated size)
- Static file-based daily rotating logs with 7-day retention
- Dependency injection across all modules — download, transcode, storage, tools, transfer accept deps interfaces for testability
- Strict ESLint: no `any`, no `unknown`, no code comments

### What's Well-Engineered

- **Error types.** `AppError` with `AppErrorType` union, typed stderr/stdout/code fields.
- **Dependency injection.** Every module accepts a deps interface falling back to real implementations — mocking is trivial.
- **Pipeline extracted.** Orchestration lives in `pipeline.ts` with `PipelineDeps`; the Electron `main.ts` is dead reference only.
- **Pure functions extracted.** `classifyError`, `parseFfprobeOutput`, `getAudioArgs`, `parseCache`, `classifyPipelineError` all testable without spawning processes.
- **Task queue.** Simple, correct bounded concurrency — no external dependency.
- **Binary management.** yt-dlp auto-update with daily version check + graceful fallback.
- **All Lithuanian UI strings** centralized in `strings.ts`.
- **Zero framework dependencies.** Vanilla TypeScript, CommonJS output.

### What Doesn't Work / Needs Work

- **No tests.** Zero test files. Dependency injection was added to enable testing, but no tests are written yet.
- **YouTube is unstable.** `YOUTUBE_PO_TOKEN` and `YOUTUBE_VISITOR_DATA` in `src/config.ts` are hardcoded to empty strings. Without these, YouTube may return bot-detection errors. No env loading, no config file, no documentation on obtaining these values.
- **Windows is broken.** `storage.ts` uses `fs.statfsSync` (POSIX-only, crashes on Windows) — now injectable via `FsModule` so a mock can be provided, but the real impl still breaks. Cookie extraction assumes Chrome exists. The CI builds on Windows (TypeScript) but the app has never run there.
- **No configuration system.** PO tokens, cookie browser, bind address, output dir — all hardcoded in `config.ts`. No `.env`, no config file, no CLI flags beyond the URL.
- **Transfer server is HTTP on `0.0.0.0`.** No HTTPS. Security relies entirely on a random 128-bit token in the URL with a 10-min TTL.
- **Cache JSON has no locking.** Concurrent downloads to the same video ID could race on the cache file.
- **Log location.** Defaults to `apps/desktop/logs/` (relative to `dist-tsc/src/` at runtime). `Contract.md` specifies `~/Library/Logs/LocalTube`.
- **Lithuanian-only.** No i18n system. By design per contract, but limits the audience.
- **TypeScript 6.0.2 with `ignoreDeprecations: "6.0"`.** Very new TS version, may not work with standard tooling.
- **No resumable downloads.** `--no-part` flag means partial downloads are discarded on failure.
- **`apps/desktop-hs/`** contains abandoned Haskell build artifacts (`.o`, `.hi`, `.dylib`) — 103M of dead weight.
- **`main.ts`** (491 lines) is dead Electron reference code, not compiled, kept for archival reference.

### Fixed

- ~~Electron renderer/preload/HTML/CSS — deleted. CLI replaces the desktop app entirely.~~
- ~~`electron`, `electron-builder`, `electron-updater` deps — removed.~~
- ~~`ee-first` dead dependency — removed.~~
- ~~`apps/desktop-go/` stale Go directory (175MB) — removed.~~
- ~~`apps/desktop/dist/` stale installer artifacts (696MB) — removed.~~
- ~~ESLint `unknown` ban vs `AGENTS.md` contradiction — `AGENTS.md` corrected.~~
- ~~`init()` without `await` in renderer — dead code deleted.~~
- ~~CI built Electron binaries that were never published — now just lint + build.~~
- ~~Release workflow built Electron for macOS+Windows matrix — now just tag + create GitHub release.~~

## Technical Architecture

- **Entry point** (`src/cli.ts`): wires the pipeline, starts transfer server, prints QR code.
- **Pipeline** (`src/pipeline.ts`): orchestrates download → transcode → cache with all I/O injected via `PipelineDeps`.
- **Download** (`src/download.ts`): spawns yt-dlp with progress/stall/timeout/retry, accepts `DownloadDeps`.
- **Transcode** (`src/transcode.ts`): spawns ffprobe then ffmpeg, exports pure `parseFfprobeOutput`/`getAudioArgs`.
- **Transfer** (`src/transfer.ts`): Express server with token auth + QR generation, accepts `TransferDeps`.
- **Storage** (`src/storage.ts`): file management + JSON cache, all fs ops via `FsModule`.
- **Tools** (`src/tools.ts`): yt-dlp binary management (auto-update), accepts `ToolsDeps`.
- **Queue** (`src/queue.ts`): concurrency-limited task queue (62 lines).
- **Logging** (`src/logging.ts`): daily rotating file logger.
- **main.ts**: dead Electron reference (491 lines), not compiled, kept for archival purposes.

### Key Dependencies

| Tool | Purpose |
|------|---------|
| yt-dlp (nightly) | Video extraction and download |
| ffmpeg-static | Bundled ffmpeg (no system install) |
| ffprobe-static | Bundled ffprobe |
| Express | Local HTTP transfer server |
| qrcode | QR code generation (terminal output) |

## Project Structure

```
apps/desktop/
  main.ts              -- Dead Electron reference (491 lines, not compiled)
  src/
    cli.ts             -- CLI entry point (129 lines)
    pipeline.ts        -- Pipeline orchestration with DI (189 lines)
    types.ts           -- Shared interfaces and types (108 lines)
    AppError.ts        -- Typed error class
    config.ts          -- Hardcoded configuration (PO tokens = empty)
    download.ts        -- yt-dlp pipeline with progress/stall/timeout/retry
    transcode.ts       -- ffmpeg pipeline with probe + progress
    transfer.ts        -- Express transfer server + QR generation
    storage.ts         -- File management + cache (statfsSync breaks Windows)
    queue.ts           -- Concurrency-limited task queue (62 lines)
    tools.ts           -- Binary management (yt-dlp auto-update)
    logging.ts         -- Daily rotating file logger
    validation.ts      -- YouTube URL parser
    util.ts            -- Local IP, throttle
    strings.ts         -- Lithuanian UI strings
  dist-tsc/            -- Compiled JS (gitignored)

.github/workflows/
  ci.yml               -- Lint + build on macOS/Windows (Windows build only, app never ran)
  release.yml          -- Manual tag + GitHub release workflow
```

## CLI Usage

```bash
localtube <youtube-url>
```

Or directly:

```bash
node dist-tsc/src/cli.js <youtube-url>
```

The tool downloads the video, transcodes to MP4, saves to `~/Movies/LocalTube/`, starts a local HTTP server, and prints a QR code. Scan the QR code from your iPhone on the same Wi-Fi to download.

## License

MIT
