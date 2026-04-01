# LocalTube

Desktop app to download YouTube videos, transcode to MP4, and share to iPhone via QR code. Works on Windows and macOS.

## Installation

### For Users

1. **Download:** Go to the [Releases](https://github.com/your-repo/localtube/releases) page and download the installer for your OS:
   - **Windows:** `LocalTube-Saver-Setup-0.1.0.exe`
   - **macOS:** `LocalTube-Saver-0.1.0.dmg`
2. **Install:** Run the installer and follow the instructions.
3. **Launch:** Open "LocalTube Saver" from your Applications folder or Start menu.

### For Developers

1. **Requirements:** Node.js 20+
2. **Clone & Install:**
   ```bash
   git clone https://github.com/your-repo/localtube.git
   cd localtube/apps/desktop
   pnpm install
   ```
3. **Run in Dev Mode:**
   ```bash
   pnpm start
   ```
4. **Build Installers:**
   ```bash
   # Build for current OS
   pnpm run build

   # Build for both Windows and macOS (requires macOS for DMG)
   pnpm run build -- -wm
   ```

## Structure

- `Contract.md` — source of truth for behavior.
- `apps/desktop` — Electron app with `yt-dlp` + `ffmpeg` pipeline.

## YouTube Download Bypass

To bypass YouTube's detection, this project:
- Uses `yt-dlp` nightly builds (auto-managed).
- Uses `node` JS runtime for signature challenges.
- Spoofs `ios` player client.
- Uses `po_token` and local browser cookies (`chrome`).

## Logs

Stored in `apps/desktop/logs/` (dev) or in the app's data directory (production). Auto-cleaned after 7 days.

## Notes

- **Output:** `~/Movies/LocalTube` (macOS) or `%USERPROFILE%\Videos\LocalTube` (Windows).
- **Transfer:** Link expires after 10 minutes.
- **Caching:** Uses `.cache.json` in output directory to skip redownloads.
- **iOS Transfer:** When you scan the QR code on your iPhone:
  1. Open the link in Safari.
  2. Tap the **Share** button.
  3. Select **Save Video** to add it to your Photos app.
