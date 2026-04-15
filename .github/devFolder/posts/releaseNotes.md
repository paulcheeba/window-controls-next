# Window Controls Next v14.0.0.1 (2026-04-14)

Patch release fixing inline header button sizing reported by the community.

Added:
- None

Changed:
- None

Fixed:
- **Issue #12 — Inline header button sizing**: `.window-controls-inline-btn` now has an explicit `width: 24px; height: 24px;`, matching standard Foundry header button dimensions. Previously only flex `gap` spacing was defined, causing misaligned button hit-areas in UI-heavy setups (e.g. D&D 5e + TidySheets + Carolingian). (Credit: crazyblot)

Breaking Changes:
- None

Manifest URL:
- https://github.com/paulcheeba/window-controls-next/releases/download/v14.0.0.1/module.json

Patreon:
- OverEngineeredVTT - https://www.patreon.com/cw/u45257624

Discord:
- OverEngineeredVTT - Window Controls Next - https://discord.com/channels/1038881475732451368/1454747458180485160

---

# Window Controls Next v14.0.0.0 (2026-04-11)

First public release for Foundry VTT v14. Bundles all features and fixes developed across six pre-release beta versions (13.1.2.0 – 13.1.2.5).

Added (since last public release 13.1.1.0):
- Learned Sheet Defaults: automatic per-world capture of sheet dimensions on first render; GM-managed View / Edit / Clear defaults dialog in Module Settings
- Default Size fallback notification when no dimension has been captured for a sheet type yet
- Startup console log of all captured learned defaults
- Maximize Width / Height settings: configurable max size percentages (10–100%, step 5) for the Maximize button
- Default Size Button and Maximize Button independent visibility toggles
- Third-party app registration API: `WindowControls.registerApp(YourAppClass)` inside `window-controls-next.ready` hook, with post-registration window sweep
- Canvas-only taskbar width setting (stops at sidebar edge; ResizeObserver-tracked)
- Taskbar right-click context menu (Restore, Maximize, Default Size, Pin/Unpin, Close)
- Maximize and Default Size inline header buttons on AppV2 sheets
- Scroll-edge fade masks on taskbar overflow
- Verbose Debug Logs setting
- AppV1 legacy sheet warning notification

Changed:
- Verified compatibility with Foundry VTT v14 (minimum v13, verified v14, maximum v14)
- Removed all non-English language files (de, es, ja) — Foundry VTT AI content policy compliance; English only for now; community-contributed translations welcome via pull request
- Maximize button resizes in place via `setPosition()` (no longer snaps to a fixed corner)
- Default Size → Maximize button order (left to right)
- Taskbar buttons 24 px tall
- 1 px dark border on taskbar screen-facing edge
- AppV1 header controls injected via prototype-level wrap of `Application.prototype._getHeaderButtons`
- Close button always rightmost on AppV1 sheets

Fixed:
- Pinned journal flash on load (AppV2 maximize/bringToFront race condition)
- `foundry.applications.instances` iteration (Map vs Object)
- Pin toggle cross-contamination between AppV2 and AppV1 windows
- libWrapper compatibility (Mobile Improvements, TouchVTT, GM Screen) — Issue #8
- Null-guard on string helpers (`curateId`, `curateTitle`, `uncurateTitle`) — Issue #7
- Sub-sheet isolation (`document.sheet === app` guard)
- Dialog/DialogV2 excluded from WCN management

Breaking Changes:
- None

Manifest URL:
- https://github.com/paulcheeba/window-controls-next/releases/download/v14.0.0.0/module.json

Patreon:
- OverEngineeredVTT - https://www.patreon.com/cw/u45257624

Discord:
- OverEngineeredVTT - Window Controls Next - https://discord.com/channels/1038881475732451368/1454747458180485160

---

# Window Controls Next v13.1.1.0 (2026-01-04)

This release introduces a new required dependency: **OEV Suite Monitor** (the lightweight OverEngineeredVTT hub module).

Added:
- Required dependency on OEV Suite Monitor

Fixed:
- None

Breaking Changes:
- OEV Suite Monitor is now required; if it isn’t installed, Foundry will prompt you to install it before enabling Window Controls Next

Manifest URL:
- https://github.com/paulcheeba/window-controls-next/releases/latest/download/module.json

Patreon:
- OverEngineeredVTT - https://www.patreon.com/cw/u45257624

Discord:
- OverEngineeredVTT - Window Controls Next - https://discord.com/channels/1038881475732451368/1454747458180485160
