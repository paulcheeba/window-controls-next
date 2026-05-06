# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project aims to follow Semantic Versioning.

Note: The 13.x versions are the reworked Foundry VTT v13+ fork/modernization of the original module. 14.x versions target Foundry VTT v14.

## [14.0.2.0]
### Added
- **Theme Manager**: Added a full Theme Manager in Module Settings for editing and previewing WCN visual variables (taskbar buttons, pinned buttons, header inject buttons, and taskbar appearance) in one place.
- **Preset + custom theme system**:
  - Added `themes.css` preset themes loaded at runtime.
  - Added client-scoped custom theme storage (`wcCustomThemes`).
  - Added import/export of custom themes using OS file dialogs (`wcn-themes.json`).
- **Taskbar pattern engine**:
  - Added taskbar pattern settings (pattern type, secondary color, opacity, size).
  - Added standalone `taskbarPatterns.js` pattern registry (`WCN_PATTERNS`) loaded via `module.json` scripts.
  - Added curated pattern list including **Herringbone**, **Seigaiha**, and **Dragon Scale**.
- **Dragon Scale SVG pattern**: Added runtime-colored Dragon Scale pattern via inline SVG data URI with color placeholder injection.
- **Button size setting**: Added client setting for header/taskbar control size (`Small 18px`, `Medium 20px`, `Large 24px`).
- **Unsaved Theme draft workflow**:
  - `Apply & Close` now writes a temporary custom entry named **Unsaved Theme**.
  - Users can switch to another theme and back to Unsaved Theme during iterative edits.

### Changed
- **Theme application flow**:
  - `Apply & Close` now applies current editor values immediately without requiring Save Custom.
  - Theme Manager now favors draft workflow: edits can be tested first, then saved when ready.
- **Theme Manager layout and field UX**:
  - Reworked preview/controls arrangement for clearer top-to-bottom flow.
  - Split editor text fields into dedicated input styles: value fields, color fields, and percent fields.
  - Converted taskbar pattern size/opacity from sliders to text inputs.
  - Updated labels and groups for clarity (for example, non-pinned vs pinned taskbar text groups).
- **Taskbar button styling variables expanded**:
  - Added non-pinned button background variable (`--wc-btn-bg`, default black at 40% alpha).
  - Added pinned font-weight variable (`--wc-btn-pinned-font-weight`).

### Fixed
- **Custom theme save collisions**: Saving with an existing custom theme name now prompts for overwrite instead of silently creating duplicate copies.
- **Theme Manager draft persistence**: Switching away from draft edits and back now reliably restores the unsaved draft via the temporary Unsaved Theme entry.
- **Taskbar text styling reliability**: Improved stroke/shadow propagation for taskbar labels and preview rendering to better reflect configured text effects.

## [14.0.1.0]
### Added
- **Disable Window Controls (client setting)**: A new per-user toggle (default: off) completely disables all WCN features for that client — no taskbar, no header buttons, no pinning, no single-instance enforcement. Minimize/maximize/close revert to Foundry defaults. GMs retain control over world-scoped settings; this only affects the individual user who enables it.
- **Client-scoped settings**: The following settings have been changed from world-scope to client-scope, allowing each user to configure their own preferences independently of the GM:
  - Taskbar Location
  - Minimize Button
  - Default Size Button
  - Maximize Button
  - Max Width / Max Height
  - Taskbar Color
  - Taskbar Scrollbar Color
  - Taskbar Width
  - Pinned Button
  - Pinned Header Color
  - Remember Pinned Windows
- **Setting scope labels**: All setting hints now include `(Client)` or `(World)` to clearly indicate their scope.
- **Debug settings hidden from non-GM players**: "Enable Debugging" and "Verbose Debug Logs" are no longer visible in the settings UI for non-GM users.

### Fixed
- **Issue #14 — PF1e ChangeEditor (and similar sub-editors) closed on open**: `_enforceSingleInstanceByPersistentId` was running on every AppV1 render, including document-relative sub-editors like PF1e's `ChangeEditor`. These share a UUID with their parent item sheet, causing WCN to treat them as duplicates and immediately close them. The fix adds an early `_isTargetSheet` guard so only WCN-managed canonical sheets are subject to single-instance enforcement. (Credit: Runemaster24)

## [14.0.0.1]
### Fixed
- **Issue #12 — Inline header button sizing**: `.window-controls-inline-btn` now has an explicit `width: 24px; height: 24px;`, matching standard Foundry header button dimensions. Previously only flex `gap` spacing was defined, causing misaligned button hit-areas in UI-heavy setups (e.g. D&D 5e + TidySheets + Carolingian). (Credit: crazyblot)

## [14.0.0.0]
> First public release for Foundry VTT v14. Incorporates all changes from pre-release beta versions 13.1.2.0 – 13.1.2.5.

### Changed
- **Foundry VTT v14 compatibility**: Verified against Foundry VTT v14. Compatibility updated to minimum v13, verified v14, maximum v14.
- **English-only localisation**: All non-English language files (de, es, ja) have been removed. Foundry VTT's AI content policy prohibits AI-generated translations, and no human-verified translations are currently available. The module now ships with English only (`lang/en.json`). Community-contributed translations are welcome via pull request.

#### Included from beta 13.1.2.5
##### Added
- **Maximize Width / Height settings**: Two new client settings (10–100%, step 5) control the size the Maximize button resizes a window to. Defaults remain 60% wide × 80% tall of the `#board` area.
- **Default Size Button / Maximize Button visibility settings**: Independent enabled/disabled toggles for the Default Size and Maximize header buttons, matching the existing Minimize Button setting. All three default to enabled. The new settings appear in the Taskbar section of module settings, grouped after Minimize Button.
- **Learned Sheet Defaults (per world)**: The first time any sheet type renders in a world, WCN automatically captures its dimensions as the learned default for that class. Stored as a hidden world setting keyed by constructor name, so each world builds its own table independently. GM permission is required to save captures.
- **View / Edit / Clear defaults dialog**: GMs see a *View / Edit Defaults* button directly below the Default Size Button toggle in Module Settings. The dialog lists every captured class with its recorded size. Each row has an **Edit** button to override dimensions, and a **Clear All** button (with confirmation) to reset the table.
- **Startup log of learned defaults**: On world load, WCN prints all captured learned defaults (or a "none yet" message) to the console for easy inspection.
- **Default Size fallback notification**: If the Default Size button is clicked for a sheet type with no captured default, WCN shows a `ui.notifications.info` message advising the user to open a sheet of that type once so WCN can record it automatically.

#### Included from beta 13.1.2.4
##### Changed
- **Maximize behaviour**: The maximize button no longer snaps the window to a fixed corner. It now resizes the window in place to 60% × 80% of the `#board` area via `setPosition()`, so the window remains draggable and the size sticks on drag.
- **Button order**: Default Size and Maximize buttons are now ordered Default Size → Maximize (left to right) for logical progression.
##### Fixed
- **Pinned journal flash on load**: Remembered pinned AppV2 windows (journals and other complex sheets) were visible on world load and not being hidden to the taskbar. Root cause: Foundry's `ApplicationV2.render(force=true)` unconditionally calls `maximize().then(bringToFront())` after all render hooks complete, overriding our hook's `display:none`. The fix temporarily overrides `maximize` to a no-op on the sheet instance before calling `render`, then restores it and explicitly minimises after the render promise resolves — eliminating the race entirely.
- **Sweep after `window-controls-next.ready`**: Fixed iteration over `foundry.applications.instances` (a `Map`) — `Object.values()` on a Map yields empty results; now uses `Array.from(instances.values())`.
- **Pin toggle cross-contamination**: Clicking pin on an AppV2 window was accidentally toggling unrelated AppV1 windows. Root cause: the linked-window lookup used `appId` equality, but AppV2 apps have no `appId` (`undefined === undefined` matched any AppV1 window with no `targetApp`). The lookup is now guarded to only run when `appId` is a real value.

#### Included from beta 13.1.2.3
##### Added
- **Third-party app registration API**: Module developers can now opt standalone AppV2 windows into WCN management (taskbar, pin, minimize) by calling `WindowControls.registerApp(YourAppClass)` inside a `Hooks.once('window-controls-next.ready', ...)` callback. WCN fires the `window-controls-next.ready` hook after full initialisation.
- **Post-registration sweep**: After firing `window-controls-next.ready`, WCN sweeps all currently-open windows and applies controls/pin state to any that now pass `_isTargetSheet`. This ensures windows opened during a third-party module's `ready` callback that ran before WCN's are not missed.
##### Fixed
- **Sub-sheet isolation**: `_isTargetSheet` now requires a document-backed app to be the document's canonical sheet (`document.sheet === app`). Sub-windows opened from a sheet (Sheet Config, Permission Control, Token Config, etc.) no longer inherit WCN controls or pinned state from their parent.
- `Dialog` (AppV1) and `DialogV2` (AppV2) instances are now explicitly excluded from WCN management regardless of other conditions.

#### Included from beta 13.1.2.2
##### Fixed
- **Issue #8 — Compatibility with libWrapper modules** (Mobile Improvements, TouchVTT, GM Screen, etc.): All prototype wraps (`_getHeaderButtons`, `setPosition`, `minimize`, `maximize`, `close` on both AppV1 and AppV2) now detect the real libWrapper at runtime and route through it when present. This eliminates infinite recursion caused by Mobile Improvements' libWrapper LISTENERs on `ApplicationV2.prototype.close/minimize/maximize` conflicting with WCN's direct prototype assignment. When libWrapper is absent, all wraps fall back to WCN's built-in `_wrapMethod` exactly as before — no hard dependency added.
- A console info message is logged on startup when libWrapper is detected, confirming which dispatch path is active.

#### Included from beta 13.1.2.1
##### Fixed
- **Issue #7 — Null-guard on string helpers**: `curateId`, `curateTitle`, and `uncurateTitle` now guard against `null`/non-string input that caused errors on sheets with missing titles. (Credit: Andersants)

#### Included from beta 13.1.2.0
##### Added
- **Canvas-only taskbar width** setting: the taskbar can now stop at the sidebar's left edge instead of spanning the full viewport, avoiding overlap with the chat/notifications column. A `ResizeObserver` keeps the boundary accurate when the sidebar resizes or collapses.
- **Taskbar right-click context menu**: right-clicking a taskbar button opens a context menu with Restore, Maximize, Default Size, Pin/Unpin, and Close actions.
- **Maximize** action: expands the window to fill the available viewport (accounting for taskbar height at top or bottom).
- **Default Size** action: resets a window to its configured default dimensions (read from `DEFAULT_OPTIONS`, `defaultOptions`, or instantiation options).
- AppV2 inline header now also includes **Maximize** and **Default Size** buttons alongside Minimize.
- **Scroll-edge fade masks** on the taskbar: items cut off by horizontal overflow fade out at the left and/or right edge (toggled by JS scroll state).
- New **Verbose Debug Logs** setting for per-method tracing (separate from the existing Debug Logging toggle).
- One-time warning notification when a legacy **AppV1** sheet is detected, informing users that header controls may not appear until the system/module is updated to ApplicationV2.
##### Changed
- Taskbar buttons are now **24 px tall** (tighter, less intrusive).
- Taskbar now shows a **1 px dark border** on its screen-facing edge (bottom border for top taskbar, top border for bottom taskbar).
- AppV1 header controls (Minimize, Maximize, Default Size, Pin) are now injected via a **prototype-level wrap** of `Application.prototype._getHeaderButtons` instead of relying solely on the hook, making injection reliable for systems that rebuild headers after the hook fires (e.g. Twilight: 2000).
- The **Close button** is always positioned as the rightmost header control on AppV1 sheets, with WCN buttons immediately to its left.

## [13.1.2.5] *(Pre-release beta — changes included in 14.0.0.0)*
### Added
- **Maximize Width / Height settings**: Two new client settings (10–100%, step 5) control the size the Maximize button resizes a window to. Defaults remain 60% wide × 80% tall of the `#board` area.
- **Default Size Button / Maximize Button visibility settings**: Independent enabled/disabled toggles for the Default Size and Maximize header buttons, matching the existing Minimize Button setting. All three default to enabled. The new settings appear in the Taskbar section of module settings, grouped after Minimize Button.
- **Learned Sheet Defaults (per world)**: The first time any sheet type renders in a world, WCN automatically captures its dimensions as the learned default for that class. Stored as a hidden world setting keyed by constructor name, so each world builds its own table independently. GM permission is required to save captures.
- **View / Edit / Clear defaults dialog**: GMs see a *View / Edit Defaults* button directly below the Default Size Button toggle in Module Settings. The dialog lists every captured class with its recorded size. Each row has an **Edit** button to override dimensions, and a **Clear All** button (with confirmation) to reset the table.
- **Startup log of learned defaults**: On world load, WCN prints all captured learned defaults (or a "none yet" message) to the console for easy inspection.
- **Default Size fallback notification**: If the Default Size button is clicked for a sheet type with no captured default, WCN shows a `ui.notifications.info` message advising the user to open a sheet of that type once so WCN can record it automatically.

## [13.1.2.4] *(Pre-release beta — changes included in 14.0.0.0)*
### Changed
- **Maximize behaviour**: The maximize button no longer snaps the window to a fixed corner. It now resizes the window in place to 60% × 80% of the `#board` area via `setPosition()`, so the window remains draggable and the size sticks on drag.
- **Button order**: Default Size and Maximize buttons are now ordered Default Size → Maximize (left to right) for logical progression.
### Fixed
- **Pinned journal flash on load**: Remembered pinned AppV2 windows (journals and other complex sheets) were visible on world load and not being hidden to the taskbar. Root cause: Foundry's `ApplicationV2.render(force=true)` unconditionally calls `maximize().then(bringToFront())` after all render hooks complete, overriding our hook's `display:none`. The fix temporarily overrides `maximize` to a no-op on the sheet instance before calling `render`, then restores it and explicitly minimises after the render promise resolves — eliminating the race entirely. The 250ms retry poller (`_persistRenderMinimizeRetry`) is retained as a fallback for slow renderers and to restore saved position / sync the taskbar button. Also mitigates Issue #9 (GM Screen module seeing WCN-restored journals open momentarily on load).
- **Sweep after `window-controls-next.ready`**: Fixed iteration over `foundry.applications.instances` (a `Map`) — `Object.values()` on a Map yields empty results; now uses `Array.from(instances.values())`.
- **Pin toggle cross-contamination**: Clicking pin on an AppV2 window was accidentally toggling unrelated AppV1 windows. Root cause: the linked-window lookup used `appId` equality, but AppV2 apps have no `appId` (`undefined === undefined` matched any AppV1 window with no `targetApp`). The lookup is now guarded to only run when `appId` is a real value.

## [13.1.2.3] *(Pre-release beta — changes included in 14.0.0.0)*
### Added
- **Third-party app registration API**: Module developers can now opt standalone AppV2 windows into WCN management (taskbar, pin, minimize) by calling `WindowControls.registerApp(YourAppClass)` inside a `Hooks.once('window-controls-next.ready', ...)` callback. WCN fires the `window-controls-next.ready` hook after full initialisation. Example: `About Time Next` registers `ATEventManagerAppV2` this way so its Event Manager window gets full taskbar/pin support.
- **Post-registration sweep**: After firing `window-controls-next.ready`, WCN sweeps all currently-open windows and applies controls/pin state to any that now pass `_isTargetSheet`. This ensures windows opened during a third-party module's `ready` callback that ran before WCN's are not missed.
### Fixed
- **Sub-sheet isolation**: `_isTargetSheet` now requires a document-backed app to be the document's canonical sheet (`document.sheet === app`). Sub-windows opened from a sheet (Sheet Config, Permission Control, Token Config, etc.) no longer inherit WCN controls or pinned state from their parent.
- `Dialog` (AppV1) and `DialogV2` (AppV2) instances are now explicitly excluded from WCN management regardless of other conditions.

## [13.1.2.2] *(Pre-release beta — changes included in 14.0.0.0)*
### Fixed
- **Issue #8 — Compatibility with libWrapper modules** (Mobile Improvements, TouchVTT, GM Screen, etc.): All prototype wraps (`_getHeaderButtons`, `setPosition`, `minimize`, `maximize`, `close` on both AppV1 and AppV2) now detect the real libWrapper at runtime and route through it when present. This eliminates infinite recursion caused by Mobile Improvements' libWrapper LISTENERs on `ApplicationV2.prototype.close/minimize/maximize` conflicting with WCN's direct prototype assignment. When libWrapper is absent, all wraps fall back to WCN's built-in `_wrapMethod` exactly as before — no hard dependency added.
- A console info message is logged on startup when libWrapper is detected, confirming which dispatch path is active.

## [13.1.2.1] *(Pre-release beta — changes included in 14.0.0.0)*
### Fixed
- **Issue #7 — Null-guard on string helpers**: `curateId`, `curateTitle`, and `uncurateTitle` now guard against `null`/non-string input that caused errors on sheets with missing titles. (Credit: Andersants)

## [13.1.2.0] *(Pre-release beta — changes included in 14.0.0.0)*
### Added
- **Canvas-only taskbar width** setting: the taskbar can now stop at the sidebar's left edge instead of spanning the full viewport, avoiding overlap with the chat/notifications column. A `ResizeObserver` keeps the boundary accurate when the sidebar resizes or collapses.
- **Taskbar right-click context menu**: right-clicking a taskbar button opens a context menu with Restore, Maximize, Default Size, Pin/Unpin, and Close actions.
- **Maximize** action: expands the window to fill the available viewport (accounting for taskbar height at top or bottom).
- **Default Size** action: resets a window to its configured default dimensions (read from `DEFAULT_OPTIONS`, `defaultOptions`, or instantiation options).
- AppV2 inline header now also includes **Maximize** and **Default Size** buttons alongside Minimize.
- **Scroll-edge fade masks** on the taskbar: items cut off by horizontal overflow fade out at the left and/or right edge (toggled by JS scroll state).
- New **Verbose Debug Logs** setting for per-method tracing (separate from the existing Debug Logging toggle).
- One-time warning notification when a legacy **AppV1** sheet is detected, informing users that header controls may not appear until the system/module is updated to ApplicationV2.

### Changed
- Taskbar buttons are now **24 px tall** (tighter, less intrusive).
- Taskbar now shows a **1 px dark border** on its screen-facing edge (bottom border for top taskbar, top border for bottom taskbar).
- AppV1 header controls (Minimize, Maximize, Default Size, Pin) are now injected via a **prototype-level wrap** of `Application.prototype._getHeaderButtons` instead of relying solely on the hook, making injection reliable for systems that rebuild headers after the hook fires (e.g. Twilight: 2000).
- The **Close button** is always positioned as the rightmost header control on AppV1 sheets, with WCN buttons immediately to its left.

## [13.1.1.0]
### Added
- Required dependency on OEV Suite Monitor (OverEngineeredVTT Suite)

### Changed
- README now includes a Dependencies section describing the required Suite Monitor

## [13.1.0.4]
### Fixed
- Windows minimized to the taskbar are no longer force-unhidden on render (fixes some sheets reappearing after reload)

## [13.1.0.3]
### Changed
- Taskbar docking debug output no longer uses console warnings; adds minimal always-on startup/state logs (version + top/bottom/off)

### Fixed
- Persistent top/bottom taskbar now reliably reserves viewport height (prevents bottom clipping in top mode and UI overlap in bottom mode)
- Switching between top and bottom taskbar no longer leaves the UI in a partially offset state

## [13.1.0.2]
### Added
- Optional debug logging toggle for troubleshooting

### Changed
- Taskbar background is now 80% transparent
- Taskbar background is click-through (taskbar buttons remain clickable)

### Fixed
- Releasing a dragged window behind the taskbar no longer traps the window under it

## [13.1.0.1]
### Fixed
- Clicking a taskbar button while the window is hover-previewed now properly restores the window (instead of behaving like a preview/temporary state)

### Changed
- Taskbar button labels are shorter (tooltip still shows the full window title)

## [13.1.0.0]
### Added
- New "Pinned Header Color" setting (with color picker)

### Changed
- Pinned window header overlay uses the selected color at 25% opacity
- Pinned taskbar buttons use a 20% darker solid color derived from the pinned header color

## [13.0.1.2]
### Added
- Taskbar buttons can be scrolled horizontally when they overflow
- Thin horizontal scrollbar under taskbar buttons
- New setting for taskbar scrollbar thumb color (with color picker)

## [13.0.1.1]
### Changed
- Settings reorganized into "Taskbar" and "Pinning" sections
- Taskbar color setting now includes a built-in style color picker

### Fixed
- Remember pinned windows restore idempotently (won't accidentally unpin on reload)
- Settings organizer supports both jQuery and raw HTMLElement hook args
- Taskbar color applies on startup (not only after changing the setting)

### Removed
- Maximize button and setting

## [13.0.0.1]
### Added
- Taskbar is docked above/below the UI (cannot be covered), and the Foundry viewport/canvas is resized to make room
- Taskbar-only minimize is instant (hide/show without Foundry's native minimize animation)
- Taskbar buttons show tooltip and support hover-preview
- Pinned windows can be remembered across sessions via Document UUID

### Changed
- Foundry V13 support
- Window Controls only applies to Document sheets (no sidebar directories/popouts)

### Fixed
- Prevent duplicate sheet windows for the same Document UUID

# Below is the existing changelog for the changes made before Paulcheeba took over maintenance of the module.

## [1.12.0]
### Changed
- Foundry V12 support

## [1.11.5]
### Fixed
- Fixed placement of Camera Views with Taskbar mode

## [1.11.4]
### Fixed
- Fixed placement in canvas with taskbar

## [1.11.3]
### Changed
- Fixed Tokenizer window

### Fixed
- Fixed placement in canvas with taskbar

## [1.11.1]
### Changed
- Fixed module metadata

## [1.11.0]
### Changed
- Foundry V11 support

## [1.10.0]
### Changed
- Foundry V10 support

## [1.9.8]
### Added
- Click outside to minimize all windows, does not include pinned windows

## [1.9.7]
### Added
- Simple click on Taskbar mode now maximizes clicked window

### Changed
- Support PDFoundry when restoring open windows enabled on session start

### Fixed
- Corrected some issues in the behavior of minimize/restore header buttons

## [1.9.6]
### Changed
- Click outside to minimize all windows, includes pinned windows too again

## [1.9.5]
### Changed
- Minimize on click outside won't minimize dialogs

### Fixed
- Minimize on click outside won't minimize anything if any token is active

## [1.9.4]
### Added
- Minimize on click outside won't minimize pinned windows

### Changed
- Minimize on click outside won't minimize 'Destiny Tracker' From StarWarsFFG

## [1.9.3]
### Changed
- Simplified logic for locking window movement

### Fixed
- Fixed Forien Quest window not moving (Thanks XtraButtery)
- Fixed some issues in window movements lock when reopening (Thanks roguedevjake)

## [1.9.2]
### Changed
- PDFoundry now works well with bar modes

### Fixed
- Limited height of windows when using Taskbar modes
- Resolved problem with Bottom Taskbar when browser size changes

## [1.9.1]
### Added
- Japanese localization (thanks to Brother Sharp)

### Fixed
- Fixed minimum and maximum window heights when using Taskbar mode

## [1.9.0]
### Added
- New setting 'Bottom Taskbar' allows for bottom dedicated area for open windows

## [1.8.1]
### Changed
- Reverted to some more conservative defaults for "Click Outside" and "Remember Pinned Windows" to be disabled

## [1.8.0]
### Added
- New setting 'Minimize Everything on Outside Click', enabled by default
- 'Remember Pinned Windows' will now also remember sidebar tabs (floating chat, playlists, etc)

### Fixed
- Fixed a bug where minimized windows could be moved out of the bar

## [1.7.8]
### Fixed
- Fixed an issue with remember pinned windows on startup where some events did not trigger in some system actors
- Fixed an issue where minimizing a window too fast, would disable the minimize button
- Added color to pinned icon to make it clear the window pinned
- Shifted default colors to users without Minimal UI to be softer

## [1.7.7]
### Changed
- Taskbar mode support for: Monk's Enhanced Journal, SoundBoard by Blitz, Simple Calendar, Inline WebViewer, Forien's Quest Log

## [1.7.6]
### Changed
- OneJournal and Monk's Enhanced Journal compatibility

## [1.7.5]
### Changed
- Support for Foundry V9 as a major release

### Fixed
- Fixed an issue with the right sidebar margins in relation to taskbar mode

## [1.7.4]
### Fixed
- Use libwrapper to reposition windows rather than innerHeight

## [1.7.3]
### Fixed
- Better support for multiple screen resolution sizes with Taskbar mode

## [1.7.2]
### Fixed
- Organized Minimize is now a setting per user and not global (i.e. per client)

## [1.7.1]
### Fixed
- Top Taskbar mode corrected an issue in calculation of unsupported windows minimization
- Top Taskbar mode limited height of minimum height for settings

## [1.7.0]
### Added
- New Organized Minimize Mode "Taskbar Top" fixes a taskbar on top of all canvas for minimized windows

### Changed
- Persistent modes now deprecated in favor of Taskbar mode

## [1.6.3]
### Changed
- Forien's Quest Log V9+ compatibility

## [1.6.2]
### Changed
- Adjust Top bar positioning alongside Minimal UI Logo and Navigation settings

## [1.6.1]
### Fixed
- Fixed a specific bug when restoring loaded windows that cannot be opened again
- Rolled back some risky decisions in favor of compatibility over functionality

## [1.6.0]
### Added
- Persistent Window mode will now work universally (can detect module apps like Fate Utilities, Inline WebViewer, FXMaster, etc.)

### Changed
- Persistent Mode of Windows will now minimize "non-important" windows into the bar as well, as opposed to leave them floating
- PopOut! support improved
- Setting Persisted TopBar mode is now the default
- Setting remember pinned windows is now set by default

## [1.5.3]
### Fixed
- Fixed a bug where some modules might trigger some ghost windows that trick Window Controls and thus throwing an error (Thank you Casanova for helping find it)

## [1.5.2]
### Fixed
- Fixed a bug when combining persisted mode and remember pinned windows, where closing them would not be remembered

## [1.5.1]
### Added
- Remember Pinned Windows will now also remember position and size of windows (at the time of getting pinned)
- Remember Pinned Windows will start minimized

### Changed
- Inline WebViewer window application now counts for persisted bar mode

### Fixed
- Fixed wrong rounded corners in pinned windows
- Fixed pinned mode not setting up correctly in persisted loaded windows
- Fixed a certain situation where minimizing windows would not work after unpinning them

## [1.5.0]
### Added
- New feature (experimental, disabled by default) remembers the pinned windows for next sessions

### Changed
- GM Screen entries should no longer spawn persistent window tabs

### Fixed
- Fixed a specific situation where unpinning and closing very fast caused in a minimize because of double clicking recognition

## [1.4.1]
### Added
- Added Roll Tables to supported window types for Persistent Mode

### Fixed
- Minor style adjustments for the horizontal bar

## [1.4.0]
### Added
- V9 support and internal code quality improvements (thanks to the community for the help)

### Fixed
- Fixed a specific situation where double clicking on minimize would double minimize

## [1.3.5]
### Fixed
- Small pixel position tweak in the positioning of bottom bar

## [1.3.4]
### Changed
- Make better use of space with Minimal UI

## [1.3.3]
### Fixed
- Restored an accidentally deleted bugfix for minimized windows appearing below navigation context menus

## [1.3.2]
### Added
- Color markings when persistent mode windows are already open

## [1.3.1]
### Added
- Persistent mode windows will be brought to top on click in the bar
- Persistent mode windows show a minimize button when open and can toggle

### Changed
- Ironed out animations all over the module

### Fixed
- Fixed a bug where windows closed with ESC wouldn't remember the original position afterwards
- Fixed a bug where closing left side windows on the bar would move maximized windows of the right
- Fixed a bug with bottom located windows were not being restored correctly after minimized
- Fixed a bug where closed windows from the bar would not remember correctly the windows length

## [1.3.0]
### Added
- Organized Minimize windows will auto adjust their positions when closing other windows
- Pinned windows will no longer minimize on ESC; double tapping ESC will do instead (configurable in Settings)
- Organized Minimize windows will be smarter when looking for an empty space in the panel
- Added smoother animations to Organized Minimized in any of the "Bar" modes

### Fixed
- Overflow minimized windows will no longer go to the panel positions, instead they will be minimized in place
- Improved overall stability by simplification of logic

## [1.2.5]
### Added
- German language and Settings configuration improvements (thanks to @Grayhead)

### Fixed
- Fixed Bar cleanup with unsupported modules or applications
- Fixed persistent mode bug when opening duplicated tokens

## [1.2.4]
### Fixed
- Fixed journal switching between text and images also broken in 1.2.3

## [1.2.3]
### Fixed
- Fixed Journal switching between text and images broken in 1.2.2
- Fixed persistent mode when updating names of open windows

## [1.2.2]
### Fixed
- Improved stability after ugly code cleanup

## [1.2.1]
### Fixed
- Fixed an issue caused by Windows with non-letter characters in Persistent BAR mode to disappear

## [1.2.0]
### Changed
- When using Organized Minimize with BAR, minimized or persisted Windows cannot be moved (unless overflowed)

## [1.1.8]
### Added
- German language (thanks to @Grayhead)

## [1.1.7]
### Fixed
- Fixed missing language localizations of previous build

## [1.1.6]
### Fixed
- Fixed ghost tabs appearing when changing scenes in persistent mode setting

## [1.1.5]
### Fixed
- Fixed a situation where the persistent mode bar would not disappear after closing last open window

## [1.1.4]
### Fixed
- Tweaked some race condition parameters for better stability

## [1.1.3]
### Fixed
- Fixed pinned handouts not staying pinned after changing from text to image

## [1.1.2]
### Added
- Replaced [Token] from minimized Windows to shorten header titles

### Changed
- Window Pin button enabled by default

### Fixed
- Fixed a bug preventing the bar from disappearing in some situations
- Fixed a bug where windows would not correctly restore to their proper size
- Fixed a bug where pressing Escape to all Windows did not clean the interface properly
- Fixed a bug where closing minimized windows threw an error in some situations
- Reduced code redundancies

## [1.1.1]
### Fixed
- Fixed context menu priority in Scene right click when top bar is used (Thanks @Grayhead)
- Improved compatibility between pinned windows and windows that might close themselves (i.e. image-text journals) (Thanks @Grayhead)

## [1.1.0]
### Added
- New Persistent Bar mode where open windows are also visible in the Panel (experimental)

## [1.0.2]
### Fixed
- Fixed windows restoring to a wrong size when exceeding taskbar width

### 1.0.1
* Compatibility: Changing multiple settings now works fine with 0.8.3+

### 1.0.0
* Initial Release
