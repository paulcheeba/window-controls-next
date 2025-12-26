# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project aims to follow Semantic Versioning.

Note: The 13.x versions are the reworked Foundry VTT v13+ fork/modernization of the original module.

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
