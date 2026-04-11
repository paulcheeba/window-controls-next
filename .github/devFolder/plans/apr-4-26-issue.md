# Window Controls Next — Issue Plan (Apr 4, 2026)

## Issue List

| # | Type | Title | Source |
|---|------|--------|--------|
| Local | Bug | AppV2 journals/documents force-open on canvas reload instead of staying minimized | Internal |
| #5 | Bug | Taskbar overlaps UI buttons (sidebar bottom content + system-specific buttons) | GitHub |
| #6 | Feature Request | Maximize button for windows (expand to fill viewport) | GitHub |
| #7 | Bug | Console error on token right-click (`curateTitle`/`curateId` crash on null input) | GitHub |
| #8 | Bug | Infinite recursion / "too much recursion" error when libWrapper + Mobile Improvements are active | GitHub |

---

## Issue #5 — Taskbar Overlaps UI Buttons

### Status
Under investigation.

### Reporter Summary
When the taskbar (top or bottom) is active, UI buttons at the bottom of the sidebar or canvas area become inaccessible because the taskbar bar overlays them. Specifically observed with Twilight:2000's "Start Fight" button in the combat tracker sidebar.

### Self-Test Result (paulcheeba, v13.351, WCN only)
With only Window Controls Next loaded and set to bottom bar mode:
- The bottom taskbar **does** nudge the sidebar vertically (shortens `#interface` height), which is the intended behavior.
- The taskbar bar itself spans the **full browser window width** (left: 0, right: 0), which includes the area behind the sidebar.
- The "Start Fight" button issue is likely caused by the full-width bar overlapping bottom-positioned sidebar controls, OR system-specific buttons that are positioned absolutely at the viewport bottom outside of `#interface`.

### Root Cause (Code)

**CSS — `windowcontrols.css`:**
```css
#window-controls-persistent {
    position: fixed;
    left: 0;
    right: 0;   /* <-- spans full viewport width, including over the sidebar */
    height: var(--wc-taskbar-height);
    ...
}
```
The `#interface` and `#board` height adjustments via `wc-taskbar-top`/`wc-taskbar-bottom` classes correctly reduce the canvas height, but the bar itself still visually covers the sidebar's bottom edge.

**Sidebar height is also adjusted:**
```css
body.wc-taskbar-top,
body.wc-taskbar-bottom {
    --minisidebaradj: calc(100vh - var(--wc-taskbar-height) - 10px);
}
#sidebar {
    height: var(--minisidebaradj);
}
```
This shortens the sidebar, but system-specific frames (like T2K's combat button row) may be positioned absolutely relative to the viewport or outside the sidebar flow, and are therefore not shortened — the fixed-position full-width bar covers them.

### Is This a WCN Issue?
**Yes, partially.** The full-width bar spanning behind the sidebar is a WCN design choice. The shortened sidebar is also WCN behavior. Whether a particular system's buttons are clickable depends on how that system positions them — but WCN can avoid the problem by restricting the bar to the canvas area only.

### Proposed Fix
Limit the taskbar width to the canvas area only (i.e., exclude the sidebar width). In Foundry v13, `#sidebar` is the right panel. The taskbar `right` offset should equal the sidebar's computed width.

Two implementation options:
1. **CSS variable approach** — Set a `--wc-sidebar-width` CSS variable dynamically from JS by reading `document.getElementById('sidebar')?.offsetWidth`, then use `right: var(--wc-sidebar-width, 0)` in the taskbar CSS.
2. **JS inline style approach** — After layout settles, set `bar.style.right = sidebarWidth + 'px'` directly (override the CSS).

Option 1 is cleaner. The variable needs to be updated on resize (sidebar can collapse).

### Console Debug Commands (Electron/CDP)
Run in Foundry's DevTools console to inspect the layout:
```js
// Check taskbar element position
const bar = document.getElementById('window-controls-persistent');
console.log('taskbar rect:', bar.getBoundingClientRect());
console.log('taskbar style:', bar.style.cssText);

// Check sidebar width
const sidebar = document.getElementById('sidebar');
console.log('sidebar rect:', sidebar?.getBoundingClientRect());

// Check interface height after WCN adjustment
const iface = document.getElementById('interface');
console.log('interface rect:', iface?.getBoundingClientRect());

// Check if sidebar bottom is obscured by taskbar
const sidebarRect = sidebar?.getBoundingClientRect();
const barRect = bar?.getBoundingClientRect();
const overlap = barRect && sidebarRect ? barRect.top < sidebarRect.bottom : false;
console.log('taskbar overlaps sidebar bottom:', overlap);
```

---

## Issue Local — AppV2 Journals Force-Open on Reload

### Status
Under investigation.

### Description
Some AppV2-based sheets (confirmed: journals) reopen in a fully visible state after a canvas reload even though they were minimized/hidden to the taskbar before the reload. Other document types (e.g., actor sheets) restore correctly as minimized. The inconsistency is AppV2-specific.

### Next Steps
- Identify hook/code path that re-opens AppV2 apps on load
- Check `renderApplicationV2` hook logic — specifically the safety unhide block
- Check if journals use a different `uuid` resolution path that bypasses the taskbar-hidden check

---

## Issue #7 — Console Error on Token Right-Click

### Status
Reporter has a workaround. Needs code review.

### Description
Crash in `curateTitle` or `curateId` when a null/non-string title is passed. Specifically triggered when right-clicking a token with Token Mold active.

### Reporter Fix
```js
static curateId(text) { return (text || "").replace(/\W/g, '_'); }
static curateTitle(title) { if (!title || typeof title !== 'string') return ""; return title.replace("[Token] ", "~ ").replace("Table Configuration: ", ""); }
static uncurateTitle(title) { if (!title || typeof title !== 'string') return ""; return title.replace("~ ", "[Token] "); }
```

---

## Issue #8 — libWrapper + Mobile Improvements Recursion

### Status
Under investigation.

### Description
`close()` method wrapping by WCN causes a recursion loop when libWrapper and Mobile Improvements are both active. Stack trace shows:
`initHooks (windowcontrols.js:1987)` → `method (windowcontrols.js:494)` → libWrapper's `call_wrapped` → loop.

### Next Steps
- Check `close` wrap in `initHooks` — ensure it does not call back through a wrapped chain
- Consider using libWrapper API directly if libWrapper is detected, rather than wrapping `ApplicationV2.prototype.close` manually

---

## Issue #6 — Maximize Button (Feature Request)

### Status
Deferred / low priority.

### Description
User wants a button to maximize a window to fill the viewport. Reporter found a workaround (Monk's Enhanced Journal). Consider implementing as an optional header button toggle.
