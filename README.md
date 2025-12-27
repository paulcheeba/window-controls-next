[![Foundry VTT Version](https://img.shields.io/badge/Foundry%20VTT-v13+-blue)](https://foundryvtt.com/)
[![Latest Release](https://img.shields.io/github/v/release/paulcheeba/window-controls-next)](https://github.com/paulcheeba/window-controls-next/releases/latest)
[![Downloads (All Time)](https://img.shields.io/github/downloads/paulcheeba/window-controls-next/total)](https://github.com/paulcheeba/window-controls-next/releases)
[![Downloads (Latest)](https://img.shields.io/github/downloads/paulcheeba/window-controls-next/latest/total)](https://github.com/paulcheeba/window-controls-next/releases/latest)

# Window Controls Next (Foundry VTT v13+)

Window Taskbar and Window Buttons: Minimize and Pin floating Windows to a top or bottom taskbar. Updated for Foundry VTT v13+.

## Features

### Taskbar (Top/Bottom)
Dock a fixed taskbar above or below the Foundry UI. It nudges the UI and canvas resizes correctly.
- Taskbar appearance is configurable, including taskbar background color and taskbar scrollbar color.

<img width="548" height="45" alt="image" src="https://github.com/user-attachments/assets/670ed316-6bd9-4a1d-9e21-acc3aeb12e4d" />

### Taskbar Buttons
Taskbar buttons are sorted (pinned first, then type, then title), show a tooltip with the full title, and support hover preview.

When there are too many buttons, the taskbar button strip scrolls horizontally and shows a thin scrollbar.

### Minimize
Adds a minimize button to supported sheets. Minimize is instant: the sheet is hidden and represented by a taskbar button.

<img width="805" height="39" alt="image" src="https://github.com/user-attachments/assets/cc6b9614-7df8-40cf-93cb-9ffeebbb18d1" />

### Pin
Pin a sheet so it stays available on the taskbar and can optionally be restored across sessions.
- Pinned sheet header appearance is configurable, including header overlay color that also affects the taskbar button color.

<img width="808" height="42" alt="image" src="https://github.com/user-attachments/assets/58816dc4-4679-4ef3-b0f7-745a0144cae3" />

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
