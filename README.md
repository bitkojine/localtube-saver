# 📺 LocalTube Saver

[![Release](https://img.shields.io/github/v/release/bitkojine/localtube-saver?include_prereleases&style=flat-square)](https://github.com/bitkojine/localtube-saver/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

**LocalTube Saver** is a powerful, production-grade desktop application designed to download YouTube videos, transcode them into iOS-compatible MP4 files, and seamlessly transfer them to your iPhone via a simple QR code. No cables, no cloud uploads, no hassle.

---

## ✨ Key Features

- **🚀 High-Speed Downloads:** Powered by `yt-dlp` with automatic nightly updates and YouTube detection bypass (PO Token support).
- **🎞️ Native Transcoding:** Built-in `ffmpeg` pipeline ensures every video is perfectly formatted for iOS.
- **📱 QR Code Transfer:** Instant local network transfer to iPhone—just scan and save to your Photos app.
- **🖥️ Cross-Platform:** Beautifully crafted for both **macOS** and **Windows**.
- **🔄 Auto-Updates:** Stay up to date automatically with built-in update checks and notifications.
- **🛠️ Production Observability:** Detailed pipeline logging and crash reporting for a reliable experience.

---

## 🚀 Getting Started

### For Users

1. **Download:** Head over to the [Releases](https://github.com/bitkojine/localtube-saver/releases) page.
2. **Install:** 
   - **Windows:** Download and run `LocalTube-Saver-Setup-X.X.X.exe`.
   - **macOS:** Download `LocalTube-Saver-X.X.X.dmg`, open it, and drag to Applications.
3. **Enjoy:** Paste a YouTube link, wait for it to process, and scan the QR code to send it to your iPhone.

### For Developers

**Prerequisites:** [Node.js](https://nodejs.org/) 20+ installed.

1. **Clone & Install:**
   ```bash
   git clone https://github.com/bitkojine/localtube-saver.git
   cd localtube-saver
   npm install
   ```
2. **Development:** Start the app in watch mode (TypeScript build + Electron).
   ```bash
   npm start -w localtube-desktop
   ```
3. **Build Installers:**
   ```bash
   # Build for current OS
   npm run build -w localtube-desktop

   # Build for both Windows and macOS (macOS required for DMG)
   npm run build -w localtube-desktop -- -wm
   ```

---

## 🏗️ Technical Architecture & Module Strategy

This application uses a specific dual-module architecture to ensure compatibility between Electron's Node.js environment and the browser-based renderer:

- **Main & Preload Processes (CommonJS):** These run in Node.js and use `module.exports`/`require`. They are compiled from TypeScript using `tsconfig.json`.
- **Renderer Process (ES Modules):** The UI runs in a browser context and uses standard `import`/`export`. It is compiled using `tsconfig.renderer.json` and loaded in `index.html` via `<script type="module">`.

**Crucial:** Never mix these strategies. Changing the renderer to CommonJS will break the UI with "exports is not defined" errors. Always refer to `AGENTS.md` before making architectural changes.

- **Frontend:** HTML5/CSS3 with a vanilla TypeScript renderer for maximum performance.
- **Main Process:** Electron (TypeScript) managing the download/transcode pipeline.
- **Core Tools:** 
  - `yt-dlp`: For robust video extraction.
  - `ffmpeg`: For high-quality MP4 transcoding.
  - `Express`: Temporary local server for iPhone transfers.
- **Workflow:** Automated CI/CD using GitHub Actions for testing and multi-platform releases.

---

## 🛡️ YouTube Bypass & Stability

This project maintains high reliability by implementing several advanced techniques:
- **Nightly Tooling:** Automatically manages and updates `yt-dlp` binaries.
- **PO Token Support:** Configurable `YOUTUBE_PO_TOKEN` and `YOUTUBE_VISITOR_DATA` to handle YouTube's latest security requirements.
- **Player Spoofing:** Uses the `mweb` and `ios` player clients to ensure stable streams.
- **Local Caching:** Avoids duplicate downloads by checking for existing files in `~/Movies/LocalTube` (macOS) or `%USERPROFILE%\Videos\LocalTube` (Windows).

---

## 📱 How to Save to iPhone

1. **Scan:** Use your iPhone's camera to scan the QR code displayed in the app.
2. **Open:** Open the link in **Safari**.
3. **Share:** Tap the **Share** button at the bottom of the screen.
4. **Save:** Select **"Save Video"** to add it directly to your Photos app.
*Note: Your iPhone and computer must be on the same Wi-Fi network.*

---

## 📂 Project Structure

- `apps/desktop/` — Main Electron application source.
- `apps/desktop/src/` — Core TypeScript logic (Download, Transcode, Transfer).
- `AGENTS.md` — Critical coding guidelines for AI agents and human developers.
- `.github/workflows/` — CI and Release automation.
- `Contract.md` — Technical specification and source of truth for behavior.

---

## 📜 License

Distributed under the MIT License. See `LICENSE` (if provided) or the repository for more information.

---

*Built with ❤️ by the LocalTube Team.*
