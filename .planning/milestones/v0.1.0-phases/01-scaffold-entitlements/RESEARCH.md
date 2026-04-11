# Phase 1: Scaffold + Entitlements - Research

**Researched:** 2026-04-06
**Domain:** Tauri 2 app scaffold, Arrow.js vendoring, macOS entitlements, CSS split handles
**Confidence:** HIGH (most findings verified via official docs and npm registry)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use `create-tauri-app` with the blank/vanilla template (no framework, no bundler).
- **D-02:** `src/` organized by feature: `index.html`, `components/sidebar.js`, `main-panel.js`, `right-panel.js`, `styles/layout.css`, `styles/theme.css`, `vendor/arrow.js`.
- **D-03:** Three horizontal zones: sidebar (200px full / 40px icon strip) + main (~50%) + right (~25%+25%).
- **D-04:** Right panel is two vertically stacked sub-panels.
- **D-05:** Main panel has `terminal-area` (flex: 1) and `server-pane` (height: 0, collapsed placeholder).
- **D-06:** Vanilla JS drag manager — `mousedown`/`mousemove`/`mouseup` on split handle dividers.
- **D-07:** Ratios as CSS custom properties (`--sidebar-w`, `--main-w`, `--right-w`) updated live during drag.
- **D-08:** Ratios persisted to `localStorage` in Phase 1 (Phase 4 migrates to `state.json`).
- **D-09:** Three split handles: vertical sidebar/main, vertical main/right, horizontal between right sub-panels.
- **D-10:** `@arrow-js/core` ESM bundle pinned to 1.0.6, committed to `src/vendor/arrow.js`. No CDN.
- **D-11:** Import map inline in `index.html` as `<script type="importmap">`. No external file.
- **D-12:** Entitlements: sandbox=false, network.client=true, files.user-selected.read-write=true, files.downloads.read-write=true.
- **D-13:** Entitlements applied to both debug and release profiles in `tauri.conf.json`.
- **D-14:** Forest-green dark palette: `--bg: #1e2d25`, `--bg-raised: #2d3d32`, `--border: #3a4d3f`, `--text: #8e9a90`, `--text-bright: #c8d4ca`, `--accent: #26a641`. Font: FiraCode Light 14.
- **D-15:** Colors as CSS custom properties in `theme.css`. No hardcoded colors in component files.
- **D-16:** Cmd+C / Cmd+V via Tauri macOS menu system in `tauri.conf.json`. No custom JS clipboard handling.

### Claude's Discretion
- Exact pixel widths for split handle hit targets
- Min/max constraints for panel resize (minimum usable widths)
- Sidebar icon strip content (placeholder icons or empty)
- Collapsed server pane trigger element design

### Deferred Ideas (OUT OF SCOPE)
- Server pane controls (start/stop/open in browser, log output) — Phase 7
- Ctrl+` toggle keybinding for server pane — Phase 8
- Light mode toggle — Phase 3
- state.json persistence for split ratios — Phase 4
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LAYOUT-01 | 3-zone layout (sidebar + main 50% + right 2×25%) on launch | CSS custom properties with flexbox; `create-tauri-app` scaffold |
| LAYOUT-02 | Drag split handles; ratios persist in state.json (localStorage in Phase 1) | Vanilla JS drag manager; `localStorage.setItem`; no known WKWebView blockers |
| LAYOUT-03 | Ctrl+B collapse/expand sidebar (40px ↔ 200px) | JS keydown listener on `document`; CSS transition on `--sidebar-w` |
| LAYOUT-04 | Cmd+C/Cmd+V clipboard in all panels | Tauri 2 `PredefinedMenuItem` in Rust menu builder; no JS clipboard plugin needed |
| LAYOUT-05 | Forest-green dark palette with FiraCode Light 14 | System font reference or `@font-face` from vendored `.woff2`; CSS custom properties |
</phase_requirements>

---

## Summary

Phase 1 bootstraps the Tauri 2 application shell. The scaffold is straightforward: `npm create tauri-app@latest` with the `--template vanilla` flag produces a minimal no-bundler project with `src/` for frontend and `src-tauri/` for Rust. Arrow.js 1.0.6 ships as an ESM bundle split across two files; both must be vendored together at `src/vendor/arrow.js` and `src/vendor/chunks/internal-DchK7S7v.mjs` with the import map pointing to the parent file. The Tauri 2 macOS clipboard is handled entirely through the Rust `MenuBuilder` API using `PredefinedMenuItem` — no JS plugin required. Entitlements go in `src-tauri/Entitlements.plist` and are referenced from `tauri.conf.json` under `bundle.macOS.entitlements`. CSS cursor changes (`col-resize`, `row-resize`) are confirmed working in WKWebView as of Tauri 2 (the 2021 bug was fixed in wry). FiraCode is best loaded from a vendored `.woff2` file via `@font-face`; it is also present on macOS as a system font but cannot be relied upon.

**Primary recommendation:** Use `npm create tauri-app@latest gsd-mux -- --template vanilla --manager npm` to scaffold, then restructure `src/` per D-02 before writing any component code.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tauri (Rust) | 2.10.3 | Desktop shell, PTY, IPC, menu | Project decision; latest stable |
| @tauri-apps/cli (npm) | 2.10.1 | Tauri dev/build CLI | Matches core; used for `tauri dev` and `tauri build` |
| @tauri-apps/api (JS) | ^2.0.0 | Invoke, listen, event | Required for IPC; version floats to match core |
| @arrow-js/core | 1.0.6 | Reactive state + html template rendering | Project decision; latest stable on npm |

**Version verification:** [VERIFIED: npm registry]
- `@tauri-apps/cli`: 2.10.1 (2025-xx-xx)
- `@tauri-apps/api`: 2.10.1 (floats with core via `^2.0.0`)
- `create-tauri-app`: 4.6.2
- `@arrow-js/core`: 1.0.6 (latest tag confirmed)

**Installation (devDependencies only — no bundler):**
```bash
npm create tauri-app@latest gsd-mux -- --template vanilla --manager npm
cd gsd-mux
# @tauri-apps/api added automatically via template
```

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| FiraCode font (woff2) | 6.2.0 | Monospace font for app chrome | Embed as static asset for reliable cross-machine rendering |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vendored Arrow.js ESM | CDN (jsDelivr) | CDN breaks offline and requires CSP relaxation; vendor wins |
| @font-face woff2 | System font reference | System font faster but FiraCode not guaranteed installed; vendor wins |
| Tauri menu clipboard | `@tauri-apps/plugin-clipboard-manager` | Plugin adds dependencies and JS code; native menu is simpler for Cmd+C/V |

---

## Architecture Patterns

### Recommended Project Structure

After scaffolding and restructuring:
```
gsd-mux/
├── package.json                    # scripts: { "tauri": "tauri" }
├── index.html                      # entry point, inline importmap
├── src/
│   ├── main.js                     # app bootstrap, mounts components
│   ├── vendor/
│   │   ├── arrow.js                # copy of dist/index.mjs (renamed)
│   │   └── chunks/
│   │       └── internal-DchK7S7v.mjs  # required by arrow.js
│   ├── components/
│   │   ├── sidebar.js
│   │   ├── main-panel.js
│   │   └── right-panel.js
│   └── styles/
│       ├── theme.css               # CSS custom properties only
│       └── layout.css              # flexbox zones, split handles
└── src-tauri/
    ├── tauri.conf.json
    ├── Entitlements.plist          # macOS entitlements
    ├── Cargo.toml
    ├── build.rs
    ├── capabilities/
    │   └── default.json
    └── src/
        ├── main.rs
        └── lib.rs
```

**What `create-tauri-app` generates (vanilla template):**

The `template-vanilla` template produces:
- `package.json` with a single script `"tauri": "tauri"`, devDep `@tauri-apps/cli`
- `index.html` at root with a minimal HTML shell
- `src/main.js` — placeholder JS
- `src-tauri/` — full Rust project (Cargo.toml, build.rs, src/main.rs, src/lib.rs)
- `src-tauri/tauri.conf.json` with `build.frontendDist: "../src"` (no devUrl, no beforeDevCommand)
- `src-tauri/capabilities/default.json` — default capability file
- `src-tauri/icons/` — placeholder icons

The template does NOT use Vite. `tauri dev` starts its own built-in file server pointing at `frontendDist`. [VERIFIED: npm registry + official docs]

### Pattern 1: No-Bundler tauri.conf.json Build Section

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "GSD MUX",
  "version": "0.1.0",
  "identifier": "com.gsd.mux",
  "build": {
    "frontendDist": "../src"
  },
  "app": {
    "windows": [
      {
        "title": "GSD MUX",
        "width": 1400,
        "height": 900,
        "resizable": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    }
  }
}
```

**CSP note:** `'unsafe-inline'` in `script-src` is required for the `<script type="importmap">` inline block. Tauri 2 auto-injects nonces for regular inline scripts but import maps are treated as inline script blocks by browsers. `'unsafe-inline'` is the documented workaround; since this app has no remote content, the risk is low. [CITED: https://v2.tauri.app/security/csp/] [ASSUMED: import map specifically requires unsafe-inline; not confirmed with a Tauri+importmap repro]

### Pattern 2: Arrow.js Vendor Layout

Arrow.js 1.0.6 ESM bundle is NOT a single file. It uses code splitting:

```
dist/
  index.mjs          → src/vendor/arrow.js      (rename for cleanliness)
  chunks/
    internal-DchK7S7v.mjs  → src/vendor/chunks/internal-DchK7S7v.mjs
```

The `index.mjs` starts with:
```javascript
import { ... } from './chunks/internal-DchK7S7v.mjs';
```

This relative import resolves correctly when both files are in `src/vendor/`. The import map only needs to point to the parent file:

```html
<script type="importmap">
{
  "imports": {
    "@arrow-js/core": "/vendor/arrow.js"
  }
}
</script>
```

**Acquisition command:**
```bash
# From project root
npm pack @arrow-js/core@1.0.6
tar -xzf arrow-js-core-1.0.6.tgz
cp package/dist/index.mjs src/vendor/arrow.js
mkdir -p src/vendor/chunks
cp package/dist/chunks/internal-DchK7S7v.mjs src/vendor/chunks/
rm -rf arrow-js-core-1.0.6.tgz package/
```

**Alternative:** Use the CJS `dist/index.js` bundle (self-contained IIFE, 70KB) via `<script>` tag — but this loses ESM named imports. Do NOT use this approach; stick with ESM + import map per D-10/D-11.

[VERIFIED: npm registry — @arrow-js/core 1.0.6 inspected via `npm pack`]

### Pattern 3: macOS Menu with Clipboard (Rust)

Clipboard Cmd+C / Cmd+V in WKWebView requires a native macOS `Edit` menu. Tauri 2 provides `PredefinedMenuItem` which maps to OS-level accelerators automatically.

```rust
// src-tauri/src/lib.rs
use tauri::menu::{MenuBuilder, SubmenuBuilder, PredefinedMenuItem};

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_menu = SubmenuBuilder::new(app, "GSD MUX")
                .item(&PredefinedMenuItem::about(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, None)?)
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "Window")
                .item(&PredefinedMenuItem::minimize(app, None)?)
                .item(&PredefinedMenuItem::close(app, None)?)
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&app_menu, &edit_menu, &window_menu])
                .build()?;

            app.set_menu(menu)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
```

**macOS constraint:** All menu items MUST be in submenus. Top-level items are ignored on macOS. The first submenu is the app name menu. [CITED: https://v2.tauri.app/learn/window-menu/]

**Important:** `@tauri-apps/plugin-clipboard-manager` is NOT needed for Cmd+C/V in webview. The native `Edit` menu with `PredefinedMenuItem::copy/paste` wires to the OS clipboard, which WKWebView inherits. The plugin is for programmatic JS clipboard access (Phase 7+).

### Pattern 4: macOS Entitlements

**File location:** `src-tauri/Entitlements.plist`

**Reference in tauri.conf.json:**
```json
{
  "bundle": {
    "active": true,
    "targets": ["dmg", "macos"],
    "macOS": {
      "entitlements": "./Entitlements.plist"
    }
  }
}
```

The path in `tauri.conf.json` is relative to the `tauri.conf.json` file itself (which lives in `src-tauri/`). [CITED: https://v2.tauri.app/distribute/macos-application-bundle/]

**Full entitlements file for this project:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- Sandbox disabled: required for PTY spawning (Phase 2) -->
  <key>com.apple.security.app-sandbox</key>
  <false/>
  <!-- Network access: required for Phase 7 agent network calls -->
  <key>com.apple.security.network.client</key>
  <true/>
  <!-- File access: required for Phase 5/6 project file operations -->
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
  <!-- Downloads: required for Phase 6 file tree operations -->
  <key>com.apple.security.files.downloads.read-write</key>
  <true/>
</dict>
</plist>
```

**Note on debug vs release:** The `bundle.macOS.entitlements` key applies to both debug and release builds via `tauri dev` and `tauri build`. D-13 (apply to both) is satisfied by a single entry — there is no separate debug entitlements configuration in Tauri 2. [ASSUMED: no separate debug-specific entitlements path in Tauri 2; the single `entitlements` key covers both]

**Note on sandbox=false:** With `app-sandbox = false`, Tauri 2 can spawn PTY processes (Phase 2). Setting this to `false` means the app cannot be submitted to the Mac App Store — this is intentional and documented as out-of-scope in REQUIREMENTS.md. [CITED: REQUIREMENTS.md Out of Scope table]

### Pattern 5: CSS Split Handles

```css
/* layout.css */
:root {
  --sidebar-w: 200px;
  --main-w: 50%;
  --right-w: 25%;
  --handle-size: 4px;
  --handle-hit: 8px;       /* hit target, wider than visual */
}

.app-layout {
  display: flex;
  flex-direction: row;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.sidebar { width: var(--sidebar-w); min-width: 40px; max-width: 400px; }
.main-panel { flex: 1; }
.right-panel { width: var(--right-w); min-width: 120px; }

.split-handle-v {
  width: var(--handle-size);
  cursor: col-resize;
  background: var(--border);
  flex-shrink: 0;
  /* Widen hit area with negative margin + transparent padding */
  margin: 0 calc((var(--handle-hit) - var(--handle-size)) / -2);
  padding: 0 calc((var(--handle-hit) - var(--handle-size)) / 2);
}

.split-handle-h {
  height: var(--handle-size);
  cursor: row-resize;
  background: var(--border);
}
```

**WKWebView cursor status:** `cursor: col-resize` and `cursor: row-resize` are confirmed working in Tauri 2 / WKWebView on macOS. A regression fixed in 2021 (wry PR #220) resolved CSS cursor not changing. No outstanding blockers as of 2025. [CITED: https://github.com/tauri-apps/tauri/issues/1526 — closed resolved]

**Pointer events during drag:** During a drag, if the pointer moves over an iframe or another element, `mousemove` events stop firing. Add `pointer-events: none` to all panels during drag and restore on `mouseup`. This is a standard browser pattern, not Tauri-specific. [ASSUMED: standard browser behavior; no Tauri-specific gotcha confirmed]

### Pattern 6: FiraCode Font

FiraCode is a system font on macOS if the user has installed it, but it cannot be relied upon. The correct approach for a bundled Tauri app:

1. Download FiraCode Light woff2 from the official release
2. Place at `src/fonts/FiraCode-Light.woff2`
3. Reference in `theme.css`:

```css
@font-face {
  font-family: 'FiraCode';
  src: url('/fonts/FiraCode-Light.woff2') format('woff2');
  font-weight: 300;
  font-style: normal;
  font-display: block;  /* no FOUT flash on initial render */
}

:root {
  --font: 'FiraCode', 'Fira Code', monospace;
  --font-size: 14px;
}
```

Tauri's built-in dev server (no bundler) serves static files from `frontendDist` (`../src`), so `/fonts/FiraCode-Light.woff2` resolves to `src/fonts/FiraCode-Light.woff2`. No webpack/Vite asset pipeline needed.

**Acquisition:**
```bash
# Download from Nerd Fonts or official FiraCode release
curl -L "https://github.com/tonsky/FiraCode/releases/download/6.2/Fira_Code_v6.2.zip" -o /tmp/fira.zip
unzip /tmp/fira.zip "ttf/FiraCode-Light.ttf" -d /tmp/
# Convert to woff2 (requires woff2 tool) OR download the woff2 directly from CDN
# OR use the system font stack fallback during Phase 1 if woff2 not yet available
```

**Simpler Phase 1 approach:** Use CSS font stack that works without downloading:
```css
--font: 'Fira Code', 'FiraCode', 'JetBrains Mono', monospace;
```
This works on developer machines that have FiraCode installed and degrades gracefully. Wire the `@font-face` vendored approach in a follow-up commit if needed.

[CITED: https://github.com/tauri-apps/tauri/discussions/2334]

### Anti-Patterns to Avoid

- **Using CDN for Arrow.js**: Breaks offline use, requires CSP `connect-src`, violates D-10.
- **Importing `@arrow-js/core` via bare specifier without import map**: Will throw a module resolution error in WKWebView (no node_modules lookup in browser context).
- **Copying only `index.mjs` without the `chunks/` file**: The ESM bundle is split; missing the chunk file causes a 404 at runtime.
- **Using `type="module"` on the import map `<script>` tag**: Import maps must use `type="importmap"`, not `type="module"`.
- **Putting the import map after module scripts**: Import maps must appear in the HTML before any `<script type="module">` tags that use them.
- **Building custom clipboard JS**: Tauri 2 WKWebView does NOT automatically wire Cmd+C/V — this requires the native menu. Without it, users cannot paste into any text input. [CITED: https://github.com/tauri-apps/tauri/issues/1055]
- **Setting `sandbox=true` with PTY**: PTY spawning (`portable-pty`) requires process launching, which is forbidden under App Sandbox. Setting `sandbox=false` is mandatory for Phase 2 to work.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| macOS clipboard Cmd+C/V | Custom JS clipboard intercept | Tauri `PredefinedMenuItem` menu | OS menu wires to WKWebView selection natively; JS intercept is fragile and misses native text inputs |
| Reactive state | Custom pub/sub event system | Arrow.js `reactive()` + `watch()` | Arrow.js tracks expression-level dependencies; custom systems rerender too much or miss updates |
| Arrow.js from CDN | Fetch at runtime | Vendored ESM at `src/vendor/` | CDN unavailable offline; Tauri CSP default-src 'self' blocks external URLs |

---

## Common Pitfalls

### Pitfall 1: Arrow.js Chunk File Missing
**What goes wrong:** `index.mjs` (renamed `arrow.js`) loads but throws `Failed to fetch` or module resolution error at runtime because `./chunks/internal-DchK7S7v.mjs` is not present.
**Why it happens:** Developers copy only the parent ESM file, not the code-split chunk.
**How to avoid:** Copy both files. The chunk lives at `dist/chunks/internal-DchK7S7v.mjs` in the npm package. Mirror the relative path: `src/vendor/arrow.js` + `src/vendor/chunks/internal-DchK7S7v.mjs`.
**Warning signs:** Browser DevTools shows a 404 on `/vendor/chunks/internal-DchK7S7v.mjs`.

### Pitfall 2: Import Map Before Module Scripts Constraint
**What goes wrong:** Arrow.js component imports fail with "Bare specifier not in import map" error.
**Why it happens:** `<script type="importmap">` must appear in the HTML document before any `<script type="module">`. If `main.js` loads before the import map, the browser resolves specifiers before the map is registered.
**How to avoid:** In `index.html`, place the importmap block before ALL module script tags.
**Warning signs:** Console error referencing bare specifier `@arrow-js/core` failing to resolve.

### Pitfall 3: Drag Events Lost Over Panel Boundaries
**What goes wrong:** Drag handle stops responding mid-drag when mouse moves over a different panel.
**Why it happens:** `mousemove` fires on the element under the cursor; if the cursor leaves the handle div, events stop.
**How to avoid:** Attach `mousemove` and `mouseup` to `document` during drag (not to the handle element). Set `pointer-events: none` on all panels during drag; restore on `mouseup`.
**Warning signs:** Split drag works near start but stops if dragged quickly.

### Pitfall 4: Sidebar Width CSS Variable Race
**What goes wrong:** On startup, sidebar flashes at full width before collapsing, or persisted ratio doesn't apply before first paint.
**Why it happens:** `localStorage` is read in JS after CSS has already rendered with default `--sidebar-w: 200px`.
**How to avoid:** Read localStorage and write CSS custom properties via `document.documentElement.style.setProperty()` as the very first thing in `main.js`, before any Arrow.js components render. Alternatively, use a CSS `<style>` block that reads from localStorage via a tiny inline script.
**Warning signs:** Layout visibly "jumps" on app startup.

### Pitfall 5: Missing tauri.conf.json CSP for Import Map
**What goes wrong:** `<script type="importmap">` is blocked by CSP in Tauri 2 debug build.
**Why it happens:** Tauri 2 injects a strict CSP by default. Import map `<script>` blocks are treated as inline scripts and blocked unless `'unsafe-inline'` is in `script-src`.
**How to avoid:** Add `"script-src": "'self' 'unsafe-inline'"` to the `security.csp` object in `tauri.conf.json`.
**Warning signs:** DevTools console shows `Refused to execute inline script because it violates the following Content Security Policy directive`.

### Pitfall 6: PredefinedMenuItem on macOS Requires Submenu Nesting
**What goes wrong:** Clipboard menu items are created but don't appear or don't work on macOS.
**Why it happens:** macOS ignores top-level menu items — all items MUST be inside a `SubmenuBuilder`. The Edit submenu is the correct container for clipboard items.
**How to avoid:** Always wrap all items in `SubmenuBuilder`. The first submenu becomes the application name menu on macOS.
**Warning signs:** `app.set_menu(menu)` succeeds but no menu appears or Edit menu is missing.

---

## Code Examples

### index.html skeleton
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GSD MUX</title>
  <!-- Import map MUST come before any module scripts -->
  <script type="importmap">
  {
    "imports": {
      "@arrow-js/core": "/vendor/arrow.js"
    }
  }
  </script>
  <link rel="stylesheet" href="/styles/theme.css" />
  <link rel="stylesheet" href="/styles/layout.css" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/main.js"></script>
</body>
</html>
```

### Tauri app build config (tauri.conf.json excerpt)
```json
{
  "build": {
    "frontendDist": "../src"
  },
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "macos"],
    "macOS": {
      "entitlements": "./Entitlements.plist"
    }
  }
}
```

### localStorage persistence for split ratios
```javascript
// In main.js — first thing before component mount
const defaults = { '--sidebar-w': '200px', '--right-w': '25%' };
const saved = JSON.parse(localStorage.getItem('split-ratios') || '{}');
const ratios = { ...defaults, ...saved };
Object.entries(ratios).forEach(([k, v]) =>
  document.documentElement.style.setProperty(k, v)
);
```

### Ctrl+B sidebar toggle
```javascript
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'b') {
    e.preventDefault();
    const root = document.documentElement;
    const current = getComputedStyle(root).getPropertyValue('--sidebar-w').trim();
    const next = current === '40px' ? '200px' : '40px';
    root.style.setProperty('--sidebar-w', next);
    localStorage.setItem('split-ratios',
      JSON.stringify({ '--sidebar-w': next, '--right-w':
        getComputedStyle(root).getPropertyValue('--right-w').trim() }));
  }
});
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| cargo / rustc | Tauri Rust build | Yes | 1.93.1 | — |
| node | npm, Tauri CLI | Yes | 22.22.1 | — |
| npm | Package management | Yes | 10.9.4 | — |
| @tauri-apps/cli | `npm run tauri dev/build` | Not globally installed | — | Install as devDep via template |
| Tauri CLI (cargo) | Alternative CLI | Not installed | — | Use npm `@tauri-apps/cli` instead |
| FiraCode font | LAYOUT-05 | System-dependent | Unknown | CSS font stack fallback; vendor woff2 |
| tmux | Phase 2+ only | Not checked | — | Out of scope for Phase 1 |

**Missing dependencies with no fallback:**
- None for Phase 1. All required tools are present (cargo, node, npm).

**Missing dependencies with fallback:**
- `@tauri-apps/cli` — installed as devDependency by `create-tauri-app` template; no global install needed.
- FiraCode font — CSS fallback font stack works for Phase 1; vendor woff2 in follow-up.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None established — Phase 1 is UI-only, Rust build verification is the test |
| Config file | n/a |
| Quick run command | `cargo build --manifest-path src-tauri/Cargo.toml` |
| Full suite command | `cargo test --manifest-path src-tauri/Cargo.toml` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LAYOUT-01 | 3-zone layout renders on launch | smoke (visual) | `cargo build` (build succeeds) | — Wave 0 |
| LAYOUT-02 | Split handles drag and ratios persist | manual | Launch app, drag handle, restart | — |
| LAYOUT-03 | Ctrl+B collapses/expands sidebar | manual | Launch app, press Ctrl+B | — |
| LAYOUT-04 | Cmd+C/V works in panels | manual | Launch app, type + copy/paste | — |
| LAYOUT-05 | Forest-green palette + FiraCode visible | smoke (visual) | Launch app, inspect visually | — |

**Note:** Phase 1 is a pure UI scaffold with no Tauri commands. Automated tests are limited to confirming the Rust project compiles clean. All functional requirements are verified visually at phase end.

### Sampling Rate
- **Per task commit:** `cargo build --manifest-path src-tauri/Cargo.toml`
- **Per wave merge:** `cargo build` + manual visual check in `tauri dev`
- **Phase gate:** `tauri dev` launches without errors; all 5 success criteria met visually

### Wave 0 Gaps
- No test files to create — Phase 1 has no Tauri commands, no business logic.
- `cargo build` is the only automated gate.

*(No test infrastructure gaps that would block implementation.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in Phase 1 |
| V3 Session Management | No | No sessions in Phase 1 |
| V4 Access Control | No | Single-user desktop app |
| V5 Input Validation | No | No user input processed in Phase 1 |
| V6 Cryptography | No | No crypto in Phase 1 |

### Relevant Security Notes

- **Entitlements sandbox=false**: Disabling App Sandbox removes macOS process isolation. This is a deliberate project decision (PTY requires it) documented in REQUIREMENTS.md. Risk is accepted.
- **CSP 'unsafe-inline'**: Required for import map. Since the app has no remote content and `default-src 'self'` blocks external loads, the XSS risk from inline scripts is low for a local desktop app.
- **No network-accessible attack surface**: The app runs locally; no server endpoints, no remote code loading.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `<script type="importmap">` requires `'unsafe-inline'` in Tauri 2 CSP | Architecture Pattern 1, Pitfall 5 | If wrong: import map may work without it; low risk (extra permissive CSP is not dangerous here) |
| A2 | Tauri 2 `bundle.macOS.entitlements` applies to debug builds as well as release | Architecture Pattern 4 | If wrong: entitlements may only apply to `tauri build`; debug PTY may fail in Phase 2 |
| A3 | FiraCode is not reliably installed as a system font on macOS | Pattern 6 | If wrong: CSS font stack sufficient; low risk |
| A4 | `pointer-events: none` on panels during drag prevents mousemove loss in WKWebView | Architecture Pattern 5 | If wrong: need to track mouse on document regardless; standard browser fix applies |

---

## Open Questions

1. **Does `bundle.macOS.entitlements` affect `tauri dev`?**
   - What we know: Entitlements are applied during code signing (bundle). `tauri dev` does not produce a signed bundle.
   - What's unclear: PTY spawning in Phase 2 runs unsigned during dev. Does the entitlements file matter for dev, or only for `tauri build`?
   - Recommendation: Test PTY spawn in Phase 2 during `tauri dev` to confirm; unsigned binaries typically run without entitlements being enforced in dev mode on macOS.

2. **Import map and `'unsafe-inline'` in Tauri 2 CSP**
   - What we know: Tauri auto-hashes inline scripts; import maps are inline script blocks.
   - What's unclear: Does Tauri 2's hash-injection cover `type="importmap"` blocks automatically?
   - Recommendation: Test with the default CSP first. If import map fails, add `'unsafe-inline'` to `script-src`.

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: npm registry] — `@arrow-js/core` 1.0.6 package inspected via `npm pack`; confirmed two-file ESM bundle
- [VERIFIED: npm registry] — `@tauri-apps/cli` 2.10.1, `create-tauri-app` 4.6.2 current versions
- [CITED: https://v2.tauri.app/learn/window-menu/] — PredefinedMenuItem API, macOS submenu requirement
- [CITED: https://v2.tauri.app/distribute/macos-application-bundle/] — Entitlements file path and tauri.conf.json syntax
- [CITED: https://v2.tauri.app/security/csp/] — CSP configuration format and inline script handling
- [CITED: https://github.com/tauri-apps/tauri/issues/1526] — Cursor CSS resolved in Tauri 2

### Secondary (MEDIUM confidence)
- [CITED: https://github.com/tauri-apps/tauri/blob/dev/examples/state/tauri.conf.json] — frontendDist usage for no-bundler config
- [CITED: https://github.com/tauri-apps/tauri/discussions/2334] — Font loading in Tauri apps

### Tertiary (LOW confidence — see Assumptions Log)
- A1-A4 above are unverified assumptions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry verified all versions
- create-tauri-app scaffold: HIGH — CLI help + official docs confirmed template names and no-bundler setup
- Arrow.js vendoring: HIGH — package contents inspected directly via npm pack
- Tauri menu clipboard: HIGH — official docs pattern verified
- Entitlements: HIGH — official docs confirmed file path and JSON syntax
- CSS cursor in WKWebView: HIGH — GitHub issue confirmed resolved
- FiraCode font: MEDIUM — standard @font-face approach; Tauri-specific caveats not exhaustively tested
- CSP + import map: MEDIUM — Tauri CSP docs clear; import map + unsafe-inline not directly confirmed

**Research date:** 2026-04-06
**Valid until:** 2026-07-06 (stable ecosystem; Tauri releases infrequently break config)
