![GitHub all releases](https://img.shields.io/github/downloads/paulcheeba/foundryvtt-window-controls/total?logo=GitHub) ![GitHub release (latest by date)](https://img.shields.io/github/downloads/paulcheeba/foundryvtt-window-controls/latest/total) ![GitHub release (latest by date)](https://img.shields.io/github/v/release/paulcheeba/foundryvtt-window-controls) ![GitHub issues](https://img.shields.io/github/issues-raw/paulcheeba/foundryvtt-window-controls) ![GitHub](https://img.shields.io/github/license/paulcheeba/foundryvtt-window-controls)

# Window Controls (Foundry VTT v13)

Window taskbar + window header buttons for Document sheets: Minimize, Maximize, and Pin.

This fork targets Foundry VTT v13+ and focuses on a taskbar-only workflow: minimized sheets are hidden and represented by taskbar buttons.

Screenshots are being refreshed.

## Features
### Sheet-Only Scope
Only affects Document sheets (Actor/Item/Journal/etc). It does not add controls to sidebar directories or other non-sheet UI.

### Taskbar (Top/Bottom)
Dock a fixed taskbar above or below the Foundry UI. It reserves space so it cannot be covered by windows and the canvas resizes correctly.

### Minimize
Adds a minimize button to supported sheets. In taskbar mode, minimize is instant: the sheet is hidden and represented by a taskbar button.

### Taskbar Buttons
Taskbar buttons are sorted (pinned first, then type, then title), show a tooltip with the full title, and support hover preview.

### Pin
Pin a sheet so it stays available on the taskbar and can optionally be restored across sessions.

### Remember Pinned Windows
When enabled, pinned sheets are remembered by Document UUID and restored on next load.

### Maximize
Optional maximize button to expand a sheet to available space.

# Appreciations
* Thanks to the FoundryVTT Discord community for the amazing issue reports and feedback.
* Thanks to Grayhead for the German translations!

# Credits
* Original module concept and early implementations: JeansenVaars
* Community maintenance and prior v12-era fork work: saif-ellafi
* Current v13+ modernization, taskbar workflow, and ongoing maintenance: paulcheeba

# License
[MIT License](./LICENSE.md)
