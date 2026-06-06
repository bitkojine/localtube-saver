# LocalTube Saver

An Electron desktop app that downloads YouTube videos, transcodes them to iPhone-compatible MP4, and lets you grab them over local Wi-Fi via QR code.

## Current Status

**Late beta / working prototype — macOS only.** The core download → transcode → transfer pipeline works end-to-end on macOS. Everything else ranges from incomplete to broken.

### What Actually Works

- YouTube video info retrieval via `yt-dlp` nightly builds (auto-updated daily)
- Download with progress reporting, 30s stall detection, 5 min total timeout, 720p max
- Auto-retry on format failure (falls back from `bv*[height<=720]+ba/best` to `best`)
- ffmpeg transcode to H.264 High + AAC (CRF 30, fast preset, `-movflags +faststart`, audio copy at >=160kbps)
- Local HTTP transfer server with random 128-bit token auth, 2GB file limit, QR code display
- File cache (video ID → output path, avoids re-download)
- Concurrency-limited queue (max 2 simultaneous downloads)
- Disk space check (requires 2x estimated size)
- Static file-based daily rotating logs with 7-day retention
- Smoke test mode (`--smoke-test`) that validates the full pipeline headlessly
- Strict ESLint enforcement: no `any`, no code comments, clean `unknown`-free types
- Clean, well-typed Electron context bridge (`preload.ts`, 22 lines)

### What's Well-Engineered

- **Error types.** `AppError` class with `AppErrorType` union, typed stderr/stdout/code fields — no stringly-typed errors.
- **Task queue.** Simple, correct bounded concurrency — no external dependency.
- **Binary management.** yt-dlp auto-update with daily version check + graceful fallback if download fails.
- **Zero dependencies for UI.** Vanilla HTML/CSS/TypeScript with no framework or bundler.
- **Cross-process logging.** Renderer logs via IPC, main writes to rotating files — unified view.
- **Transfer server HTML page.** An actual web page with `<video>` tag + download link, not just a raw file endpoint.
- **All Lithuanian UI strings** centralized in `strings.ts` (well, mostly — see below).
- **Contract.md** exists and is mostly accurate for intended behavior (see log location mismatch below).
- **Preload is minimal and type-safe.** Only 22 lines, exports a single typed object via `contextBridge`.

### What Doesn't Work / Needs Major Work

**Critical / Shipping-Blocking:**
- **No tests.** Zero test files, zero test infrastructure. No assertions on any logic anywhere.
- **YouTube is unstable.** `YOUTUBE_PO_TOKEN` and `YOUTUBE_VISITOR_DATA` in `src/config.ts` are hardcoded to empty strings. Without these, YouTube frequently returns bot-detection or age-restriction errors. There is no env loading, no config UI, and no documentation on how to obtain these values. yt-dlp compatibility with YouTube breaks unpredictably regardless.
- **Windows is completely broken.** `storage.ts` uses `fs.statfsSync` (POSIX-only, crashes on Windows). Cookie extraction assumes Chrome exists. Path handling is inconsistent. Windows has never successfully run the app. The Electron dependency adds enormous complexity for no benefit here — the same functionality could be delivered as a CLI tool + simple HTTP server, which would actually be cross-platform.
- **ESLint bans `unknown`, but `AGENTS.md` says "use `unknown`".** This is a direct internal contradiction: `eslint.config.mjs` line 52-58 bans `unknown` via `no-restricted-types`, while `AGENTS.md` section "Strict Type Safety" instructs to "use `unknown`, specific interfaces, or generic constraints." One of these must be wrong, and the codebase uses neither consistently — catch blocks that should type `error: unknown` instead use the default `any`, which the linter doesn't catch because `no-explicit-any` does not flag implicit `any`.

**Moderate Issues:**
- **Memory leak.** The `downloads` Map in `main.ts` appends items forever — completed and failed downloads are never evicted.
- **String duplication.** Lithuanian strings exist in three places: `strings.ts`, `renderer.ts` (as `STORAGE_STRINGS`), and inline in error-classification `if` chains in `main.ts`. The renderer cannot import `strings.ts` because it's ESM and `strings.ts` compiles to CommonJS.
- **Log location doesn't match Contract.md.** `Contract.md` specifies `~/Library/Logs/LocalTube`. Actual: `apps/desktop/logs/` (development) or the app bundle's `resources/` directory (packaged).
- **No configuration system.** PO tokens, cookie browser choice, bind address — all hardcoded in `config.ts`. No `.env`, no config file, no settings UI.
- **Transfer server binds to `0.0.0.0` on HTTP.** Exposed on all network interfaces with no HTTPS. Security relies entirely on a random 128-bit token in the URL with a 10-minute TTL. The `Contract.md` explicitly requires this, but it's still worth flagging.
- **CI/CD exists but no releases.** Both `ci.yml` and `release.yml` workflows exist, but all previous releases and tags have been deleted. `electron-updater` is configured but will never fire because no releases exist to check against.
- **`apps/desktop-hs/` is a dead Haskell directory.** Contains only `.stack-work/` build artifacts (`.o`, `.hi`, `.dylib` files). All source files and build configuration have been deleted.
- **`.env` files are shell artifacts.** Both `apps/.env` and `apps/desktop/.env` contain only `PWD` and `OLDPWD` — terminal session variables, not configuration. The app does not use `dotenv`.

**Minor Issues:**
- **No resumable downloads.** `--no-part` flag means partial downloads are discarded on failure.
- **Unhandled promise rejection for non-crash errors.** `main.ts` line 17-19 logs `unhandledRejection` but does not forward it to the renderer via the `app-crash` IPC channel, unlike `uncaughtException`.
- **TypeScript 6.0.2 with `ignoreDeprecations: "6.0"`.** Very new TS version, may not work with standard tooling.
- **Lithuanian-only, no i18n.** By design per contract, but limits the audience.
- **`index.html` is Lithuanian but `strings.ts` is the canonical source.** The HTML file uses hardcoded Lithuanian strings as well as some loaded via JS. This is fine but not centralized.

### Issues (Struck Through — Fixed)
- ~~**Dead dependency `ee-first`** — removed.~~
- ~~**Stale Go directory** `apps/desktop-go/` (175MB of abandoned Wails builds) — removed.~~
- ~~**Old installer artifact** `apps/desktop/dist/` (696MB, v0.4.2 binaries while package.json says v0.4.8) — removed.~~
- ~~**Unsafe `init()` without `await`** in `renderer.ts` — now caught with `.catch()`.~~

## How to Run (macOS Only)

```bash
git clone https://github.com/bitkojine/localtube-saver.git
cd localtube-saver
npm install
cd apps/desktop
npm run build:ts
npx electron dist-tsc/main.js
```

The app opens a window. Paste a YouTube URL and click "Atsisiųsti". When processing finishes, a QR code appears — scan it from your iPhone on the same Wi-Fi network, or click "Siųsti į iPhone" for a fresh link.

## Technical Architecture

- **Main process** (`main.ts`, `src/`): CommonJS, compiled by `tsconfig.json`. Runs yt-dlp, ffmpeg, Express server.
- **Renderer** (`renderer.ts`): ESM (`<script type="module">`), compiled by `tsconfig.renderer.json`. Pure browser-side UI.
- **Preload** (`preload.ts`): Context bridge exposing a typed `LocaltubeAPI` interface via `contextBridge`.
- **No framework.** Vanilla HTML/CSS/TypeScript renderer. No React, no Vue, no bundler (TypeScript only).
- **No comments anywhere** enforced by a custom ESLint rule.
- **Strict type safety** — `no-explicit-any: error`. Note: `unknown` is **banned** by ESLint despite `AGENTS.md` recommending it.

### Key Dependencies

| Tool | Purpose |
|------|---------|
| yt-dlp (nightly) | Video extraction and download |
| ffmpeg-static | Bundled ffmpeg (no system install) |
| ffprobe-static | Bundled ffprobe |
| Express | Local HTTP transfer server |
| qrcode | QR code generation (data URI) |
| electron-updater | Auto-update (non-functional — no releases exist) |

## Project Structure

```
apps/desktop/
  main.ts              -- Electron main process (581 lines)
  preload.ts           -- Context bridge (22 lines, type-safe)
  renderer.ts          -- Browser UI (347 lines)
  index.html           -- App shell (Lithuanian)
  styles.css           -- All styles (302 lines)
  src/
    types.ts           -- Shared interfaces and types (108 lines)
    AppError.ts        -- Typed error class
    config.ts          -- Hardcoded configuration (PO tokens = empty)
    download.ts        -- yt-dlp pipeline with progress/stall/timeout/retry
    transcode.ts       -- ffmpeg pipeline with probe + progress
    transfer.ts        -- Express transfer server + QR generation
    storage.ts         -- File management + cache (Windows-broken statfsSync)
    queue.ts           -- Concurrency-limited task queue (50 lines)
    tools.ts           -- Binary management (yt-dlp auto-update)
    logging.ts         -- Daily rotating file logger
    validation.ts      -- YouTube URL parser
    util.ts            -- Local IP, throttle
    strings.ts         -- Lithuanian UI strings
  dist-tsc/            -- Compiled JS (gitignored)
apps/desktop-hs/       -- Dead Haskell rewrite (artifacts only, no source)

.github/workflows/
  ci.yml               -- Build + lint on macOS/Windows (Windows build succeeds, app crashes at runtime)
  release.yml          -- Manual release workflow (no releases published to date)
```

## License

MIT
