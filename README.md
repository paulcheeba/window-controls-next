![GitHub all releases](https://img.shields.io/github/downloads/paulcheeba/foundryvtt-window-controls/total?logo=GitHub) ![GitHub release (latest by date)](https://img.shields.io/github/downloads/paulcheeba/foundryvtt-window-controls/latest/total) ![GitHub release (latest by date)](https://img.shields.io/github/v/release/paulcheeba/foundryvtt-window-controls) ![GitHub issues](https://img.shields.io/github/issues-raw/paulcheeba/foundryvtt-window-controls) ![GitHub](https://img.shields.io/github/license/paulcheeba/foundryvtt-window-controls)

# Window Controls (Foundry VTT v13)

Window Taskbar and Window Buttons: Minimize and Pin floating Windows to a top or bottom taskbar. Updated for Foundry VTT v13+.


## Features

### Taskbar (Top/Bottom)
Dock a fixed taskbar above or below the Foundry UI. It nudges the UI and canvas resizes correctly.

Taskbar appearance is configurable, including taskbar background color and taskbar scrollbar color.

<img width="627" height="39" alt="image" src="https://github.com/user-attachments/assets/c91b0d71-1275-414a-916b-8600891646ab" />

### Taskbar Buttons
Taskbar buttons are sorted (pinned first, then type, then title), show a tooltip with the full title, and support hover preview.

When there are too many buttons, the taskbar button strip scrolls horizontally and shows a thin scrollbar.

### Minimize
Adds a minimize button to supported sheets. Minimize is instant: the sheet is hidden and represented by a taskbar button.

<img width="808" height="40" alt="image" src="https://github.com/user-attachments/assets/906122e5-6051-4dab-82c1-c40330eab8a7" />

### Pin
Pin a sheet so it stays available on the taskbar and can optionally be restored across sessions.

<img width="805" height="44" alt="image" src="https://github.com/user-attachments/assets/19cd7f53-4f20-4e3d-8917-0b85c2166f8e" />

### Quick view on hover
Hover your mouse over a minimized window tab for a quick view of the sheet without reopening it.

### Remember Pinned Windows
When enabled, pinned sheets are remembered by Document UUID and restored on next load.

# Credits
* Original module concept and early implementations: JeansenVaars
* Community maintenance and prior v12-era fork work: saif-ellafi
* Current v13+ modernization, taskbar workflow, and ongoing maintenance: paulcheeba

# License
[MIT License](./LICENSE.md)
