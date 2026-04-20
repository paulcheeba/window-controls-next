# Reddit Post — OEV Suite v14 Update (2026-04-19)

**Title:** The OverEngineeredVTT Suite is now fully Foundry VTT v14 compatible — what's new across all five modules

---

All five modules in the OverEngineeredVTT Suite have been updated for Foundry VTT v14. Some modules received major feature work alongside the compatibility update; others were a clean version bump. Here is a rundown by module.

---

## Window Controls Next — v14.0.1.0

The most feature-heavy update in the suite. Window Controls Next received a full taskbar overhaul across the 14.x series, plus two community-reported bug fixes.

**Taskbar & header button improvements:**
- Taskbar right-click context menu (Restore, Maximize, Default Size, Pin/Unpin, Close)
- Separate Maximize and Default Size header buttons, each individually toggleable
- Configurable maximize size (percentage of canvas area, default 60% wide x 80% tall)
- Canvas-only taskbar width option — stops the bar at the sidebar edge to avoid overlap
- Scroll-edge fade masks when the taskbar overflows horizontally
- Hover preview: hovering a taskbar button briefly shows the hidden window

**Learned Sheet Defaults (per world):**
- First time any sheet type opens, WCN captures its dimensions as the learned default for that class
- GMs can view, edit, or clear captured defaults from a dialog in Module Settings

**libWrapper compatibility:**
- All prototype wraps now route through libWrapper when present, resolving conflicts with Mobile Improvements, TouchVTT, and similar modules

**Third-party app registration API:**
- Module developers can opt standalone AppV2 windows into WCN management via `WindowControls.registerApp()`

**Per-client settings (new in v14.0.1.0):**
- Taskbar Location, Minimize/Default Size/Maximize/Pinned Buttons, Max Width/Height, Taskbar Color, Scrollbar Color, Taskbar Width, Pinned Header Color, and Remember Pinned Windows are now all per-client — each player configures their own preferences independently of the GM
- New "Disable Window Controls" client toggle for users who want to opt out entirely
- Debug settings are now hidden from non-GM players

**Bug fixes:**
- Issue #12: Inline header buttons now have an explicit 24x24px size (credit: crazyblot)
- Issue #14: PF1e ChangeEditor and similar sub-editors no longer get closed on open by WCN's single-instance enforcement (credit: Runemaster24)

Full changelog: https://github.com/paulcheeba/window-controls-next/blob/main/CHANGELOG.md

---

## About Time Next — v14.0.0.0

v14.0.0.0 is a compatibility release for Foundry v14. The module's major feature work landed in the v13.x series leading up to this release:

- **Mini Calendar integration** (v13.6.0.0): Full support for wgtgm-mini-calendar using ATN-managed time, including intercalary day handling and time runner conflict detection
- **Simple Calendar Reborn integration** (v13.5.0.0): Full integration with SCR's time authority model; also fixed a critical SCR event duration bug where events could fire immediately with 00:00:00 remaining
- **Neutral calendar selection** (v13.5.0.0): When multiple calendar systems are active, ATN no longer auto-favors one over another; a selection dialog appears instead
- **Event notification sounds** (v13.2.0.0): Configurable audio alerts when scheduled events fire, with three included royalty-free sounds and a custom file picker

Non-English language files have been removed in line with Foundry's AI content policy. Human-verified community translations are welcome via pull request.

Full changelog: https://github.com/paulcheeba/about-time-next/blob/main/changelog.md

---

## Find and Replace — v14.0.0.0

Compatibility release for Foundry v14. Notable improvement landed in v13.1.1.0:

- **CSS Custom Highlight API**: Match highlighting now uses the browser's native Highlight API (pale yellow for all matches, light green for the current match) instead of ProseMirror selection. This fixes matches not showing when the editor does not have focus and falls back gracefully on unsupported environments.
- Fixed a UIController crash on button click caused by stale internal references after toolbar rebuilds

Full changelog: https://github.com/paulcheeba/find-and-replace/blob/main/CHANGELOG.md

---

## Chat Pruner — v14.0.0.0

Compatibility release for Foundry v14. The bulk of the development work for this module was in the v13.x series: full ApplicationV2 migration, resolution of Foundry v13 FontAwesome pseudo-element conflicts with form controls, and smart version detection (ApplicationV1 for v11, ApplicationV2 for v12+).

No functional changes beyond the v14 compatibility bump.

Full changelog: https://github.com/paulcheeba/chat-pruner/blob/main/CHANGELOG.md

---

## OEV Suite Monitor — v14.0.0.0

Compatibility release for Foundry v14. The monitor tracks all five OEV modules and notifies GMs when updates are available. Recent improvements (v13.1.0.0) included:

- Dialog now appears on every world load when modules are out of date (with a dismiss option)
- GitHub API results cached for 12 hours to avoid rate limiting
- Migrated from ApplicationV1 to ApplicationV2

No functional changes beyond the v14 compatibility bump.

Full changelog: https://github.com/paulcheeba/OverEngineeredVTT-Suite-Monitor/blob/main/CHANGELOG.md

---

## Links

- Discord: https://discord.gg/VNZwZTCB5U
- Patreon: https://www.patreon.com/cw/u45257624
- Window Controls Next: https://github.com/paulcheeba/window-controls-next
- About Time Next: https://github.com/paulcheeba/about-time-next
- Find and Replace: https://github.com/paulcheeba/find-and-replace
- Chat Pruner: https://github.com/paulcheeba/chat-pruner
- OEV Suite Monitor: https://github.com/paulcheeba/OverEngineeredVTT-Suite-Monitor

---
