Platforms: GitHub Actions (APK build), Android (Capacitor, no backend/DB/hosting), Gemini / OpenRouter / Groq (AI naming, user's own free keys), GitHub repo bdnir/Scanner

# Scanner

Personal Android app (single user, no security needed) that scans documents with the phone camera, names them with a vision AI model (type -> folder, covered period -> file name) and saves them under a user-chosen main folder. Hebrew documents, UI in Hebrew or English (RTL for Hebrew).

## Where the project lives
- GitHub repo `bdnir/Scanner`, branch `main`. A push to `main` runs `.github/workflows/build.yml`, which builds a debug APK. Download it from the repo's Actions tab, run, artifact `scanner-apk`, and install it over the old one.
- No hosting, no server, no database. Cloudflare / Neon / Supabase are NOT used (deliberate).
- No env vars and no .env. AI API keys are typed by the user in the app's Settings and stored only in the phone's `localStorage` (key `s`). Never put keys in the repo.
- Only one environment: the installed debug APK. The `android/` folder is generated in CI (`npx cap add android`) and is git-ignored.
- Signing: `ci/debug.keystore` (committed on purpose, so APK updates install over the previous build).

## How to work with me
- Read this file first. Never scan the whole repo; open only files relevant to the task.
- Replies are short and direct: no intros, no recap of my request, summary of changes in 1-3 lines. Don't paste full files; make changes in the code.
- If something is ambiguous, state your assumption and proceed. Ask at most one question, only when a wrong guess is costly.
- Git: commit and push directly to main without asking, in small commits, and only if the build/type check passes. Stop and ask me first (in plain language) only for risky changes: auth/payments (n/a), deleting features, dependency upgrades, env/deploy config, large refactors.
- Manual steps: anything I must do by hand (installing the APK, pasting keys, creating a folder, store settings) - give me the exact steps and flag them as manual. Don't assume they were done.
- Run only the narrowest check that proves the change. Here: `node --check www/app.js`. Android/Java code cannot be compiled or run in the Claude workspace (no Android SDK, restricted network) - the only real build is GitHub Actions, and the only real test is the phone. Say so when a change touches Java or the build; if the build fails, I will paste the Actions log error.
- No drive-by refactors or unrelated file changes. Never commit secrets. Never run destructive git operations without my approval.
- When a chat gets long or a task is finished, tell me it's a good time to start a new chat.
- Claude workspace note: the `gh` CLI token there is invalid (can't read Actions runs); git push works through the session's repo proxy.

## Project map
- `www/index.html` - all UI: main screen (status text, results list with rename buttons, "needs a name" buttons, floating scan button), panels for settings / naming / rename, model log. Plain HTML, no framework.
- `www/app.js` - all app logic (single file): settings, i18n strings `T`, image compression, minimal PDF writer, AI calls and model fallback, scan queue, rename, model log.
- `android-src/MediaSavePlugin.java` - native Capacitor plugin `MediaSave`: `pickFolder`, `getFolder`, `folders`, `save`, `rename`, built on Android Storage Access Framework (DocumentsContract).
- `android-src/MainActivity.java` - registers `MediaSavePlugin`.
- `icon/mipmap-*` - launcher icons, copied into the generated Android project by CI.
- `.github/workflows/build.yml` - installs deps, `cap add android`, copies `android-src/*.java` and `icon/`, builds `assembleDebug`, uploads the APK.
- `package.json` / `capacitor.config.json` - Capacitor 7 with `@capacitor-mlkit/document-scanner` (Google ML Kit scanner: edge detection, crop, auto-capture UI, its own rotate button).

## How it works (flow)
1. Scan button -> ML Kit scanner returns JPEG page paths. Each scan is pushed to a background queue immediately (user can keep scanning; Settings can auto-reopen the camera).
2. Queue worker: sends a small thumbnail of page 1 to the AI models in order (list in Settings, one per line `provider:model`, providers `gemini`, `openrouter`, `groq`; next model on error/timeout 25s). Then compresses pages (<= ~110 KB per page) and saves.
3. If the AI is not confident or the period format is invalid, the document goes to a "needs a name" list (tap to name it, with page preview and rotation picker). Never block scanning.
4. Save: `<main folder>/<type>/<period>.<ext>`; folder is created if missing. Format setting: jpg / pdf / auto (1 page = jpg, more = one PDF).

## Non-obvious conventions
- Saving MUST go through the native `MediaSave` plugin (SAF). The Capacitor Filesystem plugin fails on Android 17 ("Missing parent directory"). Android also refuses picking the top-level Downloads folder, so the main folder must be a subfolder (e.g. Download/Scans).
- Plugins are accessed via `Capacitor.registerPlugin(name)` through the `plug()` helper in app.js. Calling `Capacitor.Plugins.X` directly crashed the app on startup.
- Any new native method needs a Java `@PluginMethod` in `MediaSavePlugin.java` AND a JS call via `Media.<method>`. Java is copied to the generated project by the workflow (`cp android-src/*.java ...`), so new Java files are picked up automatically.
- File name format (period): `YYYY.MM` (one month), `YYYY.MM-MM` (same year), `YYYY.MM-YYYY.MM` (different years), `YYYY.MM.DD` (single-date doc). The period is the COVERED billing period (start/end), never the issue/payment date. Israeli dates are day-first. The prompt in `prompt()` encodes this; `askModel()` validates the format and sets `confident=false` if invalid. Keep the prompt and validation in sync.
- Document type comes mainly from the document title (e.g. "חשבון ארנונה" -> ארנונה, "חשבון גז" -> גז, "חשבון מים" -> מים; חשמל if "חברת החשמל" at top or "חשמל" anywhere).
- AI rotation was removed on purpose (user does not want AI deciding rotation). Rotation is only the manual picker in the naming form. Pages are saved as the scanner returns them.
- Gemini requests send `thinkingBudget: 0`; on HTTP 400 the request is retried once without it. Provider names are case-insensitive. Keys/model fields have autocapitalize off because the phone keyboard capitalised "Gemini".
- Duplicate names: automatic saves add `-2`, `-3`; manual rename must NOT auto-suffix - it shows "already exists" and keeps the form open.
- Every user-visible string needs both languages in the `T` object in app.js (he and en), set in `applyLang()`. Defaults: format `jpg`, language `en`.
- Model attempts (model, ok/fail, seconds, error) are logged per file in `localStorage` key `log` (last 300) and shown in Settings -> Model log. Keep logging when changing the AI flow.
- When editing app.js with scripted replacements, re-run `node --check www/app.js` and make sure helper functions (e.g. `tfetch`) were not deleted; a previous prompt rewrite accidentally removed `tfetch`.
- Free-tier model names change; the user edits them in Settings. Don't hard-code a model beyond the default list.
- The results list (with rename buttons) is in-memory only; it clears when the app closes.

## Keeping this file current (all AI tools)
Any tool or chat that works on this project must update AGENTS.md in the same change whenever it adds, changes, or discovers something that belongs here (new platform, env var name, convention, gotcha, changed workflow). Edit the relevant section in place, keep it concise, delete outdated info, and never add progress notes or history. If nothing relevant changed, don't touch it.
