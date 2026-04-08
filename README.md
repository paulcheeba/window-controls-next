[![Foundry VTT Version](https://img.shields.io/badge/Foundry%20VTT-v13+-blue)](https://foundryvtt.com/)
[![Latest Release](https://img.shields.io/github/v/release/paulcheeba/window-controls-next)](https://github.com/paulcheeba/window-controls-next/releases/latest)
[![Downloads (All Time)](https://img.shields.io/github/downloads/paulcheeba/window-controls-next/total)](https://github.com/paulcheeba/window-controls-next/releases)
[![Downloads (Latest)](https://img.shields.io/github/downloads/paulcheeba/window-controls-next/latest/total)](https://github.com/paulcheeba/window-controls-next/releases/latest)

# Window Controls Next (Foundry VTT v13+)

Window Taskbar and Window Buttons: Minimize and Pin floating Windows to a top or bottom taskbar. Updated for Foundry VTT v13+.

## Features

### Taskbar (Top/Bottom)
Dock a fixed taskbar above or below the Foundry canvas. It nudges the UI and canvas resizes correctly.
- Taskbar appearance is configurable, including taskbar background color and taskbar scrollbar color.

<img width="548" height="45" alt="image" src="https://github.com/user-attachments/assets/670ed316-6bd9-4a1d-9e21-acc3aeb12e4d" />

### Taskbar Buttons
Taskbar buttons are sorted (pinned first, then type, then title), show a tooltip with the full title, and support hover preview. When there are too many buttons, the taskbar button strip scrolls horizontally and shows a thin scrollbar.

### Minimize, Maximize & Default Size
Header buttons (and the taskbar right-click menu) let you minimize a sheet instantly to a taskbar button, resize it to 60% × 80% of the canvas area, or snap it back to its configured default dimensions.

<img width="805" height="39" alt="image" src="https://github.com/user-attachments/assets/cc6b9614-7df8-40cf-93cb-9ffeebbb18d1" />

### Taskbar Right-Click Context Menu
Right-clicking any taskbar button opens a context menu with: Restore, Maximize, Default Size, Pin/Unpin, and Close.

### Canvas-Only Taskbar Width
An optional setting stops the taskbar at the sidebar's left edge so it never overlaps the chat or notifications column. The boundary tracks sidebar resize and collapse automatically.

### Pin
Pin a sheet so it stays available on the taskbar and can optionally be restored across sessions.
- Pinned sheet header appearance is configurable, including header overlay color that also affects the taskbar button color.

<img width="808" height="42" alt="image" src="https://github.com/user-attachments/assets/58816dc4-4679-4ef3-b0f7-745a0144cae3" />

### Quick view on hover
Hover your mouse over a minimized window tab for a quick view of the sheet without reopening it.

### Remember Pinned Windows
When enabled, pinned sheets are remembered by Document UUID and restored on next load.

### Taskbar Width
The taskbar can be set to Canvas width or Full width depending on your preference. Some Game Systems may alter the sidebar in ways that alter the Window Controls Next taskbar, setting Taskbar Width to Canvas should help.

## Third-Party Module Integration

Standalone AppV2 windows (those not backed by a Foundry Document) are not managed by WCN by default. Module developers can opt their applications in by calling `WindowControls.registerApp()` inside a `window-controls-next.ready` hook callback.

### Examples

**Generic pattern** — register your app class at top level in your module's entry file:

```js
Hooks.once('window-controls-next.ready', () => {
  const WCN = game.modules.get('window-controls-next')?.api;
  if (WCN) WCN.registerApp(YourAppClass);
});
```

The `?.api` guard is recommended so your module won't error if WCN is not installed.

**Real-world example** — The [About Time Next](https://github.com/paulcheeba/about-time-next) module includes an `ATEventManagerAppV2` window that has no document backing. To have WCN manage it (taskbar, pin, minimize) register its `ATEventManagerAppV2` window in `main.js`:

```js
// At top level alongside the other Hooks registrations:
Hooks.once('window-controls-next.ready', () => {
  const WCN = game.modules.get('window-controls-next')?.api;
  if (WCN) WCN.registerApp(ATEventManagerAppV2);
});
```

Once registered, WCN will apply the minimize button, pin button, taskbar button, and remembered pin state to any open or future instance of that class. WCN also performs a one-time sweep of all currently-open windows immediately after firing the hook, so windows that opened before WCN's `ready` callback ran are not missed.

# Credits
* Original module concept and early implementations: JeansenVaars
* Community maintenance and prior v12-era fork work: saif-ellafi
* Current v13+ modernization, taskbar workflow, and ongoing maintenance: paulcheeba

## Dependencies

- This module is part of the **OverEngineeredVTT Suite** and Requires the installation of the lightweight OEV Suite Monitor, a master module that tracks OEV module versions for you and lets you know when updates or new modules are available.

## Additional links

- Join our [Discord](https://discord.gg/VNZwZTCB5U) server
- Support me on [Patreon](https://www.patreon.com/cw/u45257624)

# License
[MIT License](./LICENSE.md)
