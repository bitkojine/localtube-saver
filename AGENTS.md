### 🤖 Coding Guidelines for Agents (and Humans)

This file contains critical rules and architectural patterns that must be followed to maintain the stability and quality of the LocalTube Saver project.

#### 🏗️ Architecture & Module System

The project uses a **dual-module architecture**. This is the most common cause of "UI breaking" bugs when ignored.

1.  **Main & Preload Processes (CommonJS):**
    *   Files: `apps/desktop/main.ts`, `apps/desktop/preload.ts`, and everything in `apps/desktop/src/`.
    *   Compilation: Handled by `tsconfig.json`.
    *   Target: Node.js (Electron Main).
    *   Rule: Use CommonJS patterns. Although written in TS, the output must be compatible with Node.js `require`.

2.  **Renderer Process (ES Modules):**
    *   Files: `apps/desktop/renderer.ts`.
    *   Compilation: Handled by `tsconfig.renderer.json`.
    *   Target: Browser (Electron Renderer).
    *   Rule: Must be a pure ES Module.
    *   **CRITICAL:** `index.html` loads the script with `<script type="module" src="dist-tsc/renderer.js"></script>`. Do NOT change this. Changing the renderer to CommonJS will cause "exports is not defined" errors in the browser.

#### 🛡️ Strict Type Safety

*   **NEVER use `any`:** Use `unknown`, specific interfaces, or generic constraints.
*   **Generics:** Do not use `any` as a default type for generics.
*   **Catch Blocks:** Always type your error as `unknown` and use type guards or assertions before accessing properties.

#### 🏎️ Race Conditions

Always architect to avoid race conditions:
*   Use state variables (e.g., `isDeleting`, `isDownloading`) to disable UI elements during async operations.
*   Ensure IPC handlers in the main process are idempotent or properly queued if they modify shared state (like the file system).

#### 📝 Documentation & Comments

*   **No Code Comments:** The project has a strict ESLint rule (`local/no-comments`) that forbids comments in the codebase.
*   **Where to document:** Move all architectural, functional, or complex logic documentation to `.md` files (like this one or `Contract.md`).

#### 🛠️ Build & Development

*   **Commands:** Always use `pnpm` from the root or within `apps/desktop`.
*   **TS Compilation:** `pnpm run build:ts` in `apps/desktop` runs two compilers sequentially. Ensure both pass before submitting changes.
*   **Cleaning:** If weird module errors occur, run `rm -rf apps/desktop/dist-tsc` and rebuild.

#### 📂 File Naming

*   Source files should be `.ts`.
*   Avoid legacy `.js` files in the source tree.

#### 🩺 Production-Grade Logging & Debugging

The project uses a centralized, file-based logging system that bridges both processes. **NEVER use `console.log`** for production features.

1.  **Centralized Logging (`apps/desktop/src/logging.ts`):**
    *   Logs are stored in `apps/desktop/dist-tsc/logs/` (or the equivalent in the packed app).
    *   Logs are rotated daily and kept for 7 days.
    *   Available levels: `DEBUG`, `INFO`, `WARN`, `ERROR`.

2.  **Process Bridging:**
    *   **Main Process:** Import and use `* as logging from './src/logging'`.
    *   **Renderer Process:** Use `window.localtube.log(level, message, error?)`. This sends logs to the Main process via the `app-log` IPC channel to ensure they are persisted to the same file.

3.  **Debugging Workflow:**
    *   If a feature (like the QR code button) fails silently or behaves unexpectedly, first add `INFO` or `DEBUG` logs at key entry points and `ERROR` logs in catch blocks.
    *   Rebuild and run the app locally: `pnpm run build:ts && cd apps/desktop && ./node_modules/.bin/electron .`.
    *   Monitor the latest log file in `apps/desktop/dist-tsc/logs/` using `tail -f` to identify the root cause (e.g., `TypeError`, network timeout, or IPC mismatch).

#### 🧪 Testing

*   Always run `pnpm run lint` before committing.
*   If you modify the download or storage logic, create a temporary reproduction script to verify the fix and then delete it.
