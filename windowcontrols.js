class WindowControls {

  // ── Constants & State ─────────────────────────────────────────────────────
  // Known default sizes for Foundry core sheets that don't declare DEFAULT_OPTIONS.position
  // or defaultOptions width/height. Keyed by constructor name. System sheet subclasses
  // (e.g. JournalEntrySheet5e) are included since they inherit the same default dimensions.
  static _KNOWN_DEFAULT_SIZES = {
    'JournalEntrySheet':    { width: 960, height: 800 },
    'JournalEntrySheet5e':  { width: 960, height: 800 },
  };

  static MODULE_ID = 'window-controls-next';

  static externalMinimize = false;

  static _PINNED_FLAG_SCOPE = 'window-controls-next';
  static _PINNED_FLAG_KEY = 'pinned-window-ids';

  static _rememberedPinnedIds = new Set();

  // Maximum z-index WCN will assign to floating windows.
  // Keeps windows below --z-index-tooltip (9999) and --z-index-notification (99999).
  // --z-index-window baseline is 100; 199 gives 100 window slots before the ceiling.
  static WCN_Z_MAX = 199;

  static debouncedReload = (foundry?.utils?.debounce ?? globalThis.debounce)(() => window.location.reload(), 100);

  static _taskbarEntries = new Map();

  // Hover preview (taskbar buttons)
  static _TASKBAR_HOVER_PREVIEW_DELAY_MS = 1000;

  static _patches = new Map();

  // Registry of third-party AppV2 classes that have opted in to WCN management.
  // Module devs call WindowControls.registerApp(MyAppClass) from within a
  // 'window-controls-next.ready' hook to include their standalone AppV2 windows.
  static _registeredAppClasses = new Set();

  // Lets third-party modules register their AppV2 windows so WCN manages them (taskbar, pin, minimize).
  // Call this from a Hooks.once('window-controls-next.ready') callback.
  static registerApp(appClassOrName) {
    if (!appClassOrName) return;
    WindowControls._registeredAppClasses.add(appClassOrName);
  }

  static _barrierWatcherInstalled = false;
  static _barrierEnforcerInstalled = false;

  static _loggedStartup = false;
  static _lastLoggedTaskbarState = null;
  static _shownAppV1Warning = false;
  static _sidebarResizeObserver = null;
  static _taskbarPatternApplyNonce = 0;
  static _customSvgSourceCache = new Map();
  static _customSvgNoticeCache = new Set();

  // Session-only marker used by Theme Manager to remind users that current edits
  // were applied without being saved as a named custom theme.
  static _themeUnsavedPending = false;
  static _themeUnsavedBaseId = null;
  static _UNSAVED_THEME_ID = '__wcn_unsaved__';
  static _UNSAVED_THEME_NAME = 'Unsaved Theme';

  // Parsed preset themes from themes.css (populated by _loadThemesFromCSS at ready).
  static _wcnThemes = [];

  // All CSS variable names that belong to the WCN theme system.
  // Used by _applyTheme to clear inline vars when switching to a preset theme.
  static _WCN_THEME_VARS = [
    '--wc-pinned-header-bg',
    '--wc-pinned-taskbar-btn-bg',
    '--wc-btn-bg',
    '--wc-btn-font-family',
    '--wc-btn-font-size',
    '--wc-btn-font-weight',
    '--wc-btn-color',
    '--wc-btn-text-stroke',
    '--wc-btn-text-shadow',
    '--wc-btn-pinned-font-family',
    '--wc-btn-pinned-font-size',
    '--wc-btn-pinned-font-weight',
    '--wc-btn-pinned-color',
    '--wc-btn-pinned-text-stroke',
    '--wc-btn-pinned-text-shadow',
    '--wc-header-btn-color',
    '--wc-header-btn-bg',
    '--wc-header-btn-pinned-color',
  ];

  // ── Logging & Debug ───────────────────────────────────────────────────────

  // Prints to the browser console regardless of whether debug mode is enabled.
  static _logAlways(...args) {
    try {
      console.log('Window Controls Next |', ...args);
    } catch { /* ignore */ }
  }

  // Returns the current WCN module version string.
  static _getModuleVersion() {
    try {
      const mod = game?.modules?.get?.(WindowControls.MODULE_ID);
      return mod?.version ?? mod?.data?.version ?? null;
    } catch (e) {
      return null;
    }
  }

  // Converts a taskbar setting value into a short readable label: 'top', 'bottom', or 'off'.
  static _getTaskbarStateLabel(setting) {
    if (!WindowControls._isTaskbarMode(setting)) return 'off';
    if (setting === 'persistentTop') return 'top';
    if (setting === 'persistentBottom') return 'bottom';
    return 'on';
  }

  // Returns true when the user has enabled debug logging in module settings.
  static _isDebugLoggingEnabled() {
    try {
      return game?.settings?.get(WindowControls.MODULE_ID, 'debugLogging') === true;
    } catch (e) {
      return false;
    }
  }

  // Returns true when both debug logging and verbose mode are on.
  static _isVerboseDebugLoggingEnabled() {
    try {
      if (!WindowControls._isDebugLoggingEnabled()) return false;
      return game?.settings?.get(WindowControls.MODULE_ID, 'debugVerbose') === true;
    } catch (e) {
      return false;
    }
  }

  // Logs a message only when debug mode is enabled.
  static _debug(...args) {
    if (!WindowControls._isDebugLoggingEnabled()) return;
    console.log('Window Controls Next |', ...args);
  }

  // Logs a message only when verbose debug mode is enabled (very noisy — method call tracing).
  static _debugVerbose(...args) {
    if (!WindowControls._isVerboseDebugLoggingEnabled()) return;
    console.debug('Window Controls Next |', ...args);
  }

  // Captures a detailed snapshot of the taskbar, #interface, and #board positions and logs it.
  // Useful for diagnosing layout issues when the taskbar shifts unexpectedly.
  static _debugDockLayoutSnapshot(phase, setting) {
    if (!WindowControls._isDebugLoggingEnabled()) return;
    try {
      const bar = document.getElementById('window-controls-persistent');
      const iface = document.getElementById('interface');
      const board = document.getElementById('board');

      const cs = (el) => (el instanceof HTMLElement ? getComputedStyle(el) : null);
      const rect = (el) => {
        if (!(el instanceof HTMLElement)) return null;
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      };

      const barCS = cs(bar);
      const ifaceCS = cs(iface);
      const boardCS = cs(board);

      const root = document.documentElement;
      const rootStyle = root ? getComputedStyle(root) : null;
      const wcHeight = rootStyle?.getPropertyValue('--wc-taskbar-height')?.trim() ?? null;

      const body = document.body;
      const wcBodyClasses = body
        ? Array.from(body.classList).filter((c) => c === 'wc-taskbar-top' || c === 'wc-taskbar-bottom')
        : [];

      const snapshot = {
        phase,
        setting,
        body: {
          wcClasses: wcBodyClasses,
          hasTop: body?.classList?.contains('wc-taskbar-top') === true,
          hasBottom: body?.classList?.contains('wc-taskbar-bottom') === true,
        },
        cssVar: {
          wcTaskbarHeight: wcHeight,
        },
        elements: {
          taskbar: {
            exists: bar instanceof HTMLElement,
            display: bar instanceof HTMLElement ? getComputedStyle(bar).display : null,
            position: bar instanceof HTMLElement ? getComputedStyle(bar).position : null,
            top: barCS?.top ?? null,
            bottom: barCS?.bottom ?? null,
            height: barCS?.height ?? null,
            rect: rect(bar),
          },
          interface: {
            exists: iface instanceof HTMLElement,
            position: ifaceCS?.position ?? null,
            top: ifaceCS?.top ?? null,
            bottom: ifaceCS?.bottom ?? null,
            height: ifaceCS?.height ?? null,
            rect: rect(iface),
            inlineTop: iface instanceof HTMLElement ? (iface.style.top || null) : null,
            inlineBottom: iface instanceof HTMLElement ? (iface.style.bottom || null) : null,
          },
          board: {
            exists: board instanceof HTMLElement,
            position: boardCS?.position ?? null,
            top: boardCS?.top ?? null,
            bottom: boardCS?.bottom ?? null,
            height: boardCS?.height ?? null,
            rect: rect(board),
            inlineTop: board instanceof HTMLElement ? (board.style.top || null) : null,
            inlineBottom: board instanceof HTMLElement ? (board.style.bottom || null) : null,
          }
        }
      };

      // Capture-friendly summary (object expansion is often lost in copied warning logs).
      const summary = [
        `phase=${String(phase)}`,
        `setting=${String(setting)}`,
        `classes=${wcBodyClasses.join(',') || 'none'}`,
        `--wc-taskbar-height=${wcHeight ?? 'null'}`,
        `taskbar(pos=${barCS?.position ?? 'null'} top=${barCS?.top ?? 'null'} bottom=${barCS?.bottom ?? 'null'} h=${barCS?.height ?? 'null'})`,
        `interface(pos=${ifaceCS?.position ?? 'null'} top=${ifaceCS?.top ?? 'null'} bottom=${ifaceCS?.bottom ?? 'null'} h=${ifaceCS?.height ?? 'null'} inlineTop=${iface instanceof HTMLElement ? (iface.style.top || '""') : 'null'} inlineBottom=${iface instanceof HTMLElement ? (iface.style.bottom || '""') : 'null'})`,
        `board(pos=${boardCS?.position ?? 'null'} top=${boardCS?.top ?? 'null'} bottom=${boardCS?.bottom ?? 'null'} h=${boardCS?.height ?? 'null'} inlineTop=${board instanceof HTMLElement ? (board.style.top || '""') : 'null'} inlineBottom=${board instanceof HTMLElement ? (board.style.bottom || '""') : 'null'})`,
      ].join(' | ');

      WindowControls._debug('Dock layout summary', summary);

      WindowControls._debug('Dock layout snapshot', snapshot);

      if (!WindowControls._isVerboseDebugLoggingEnabled()) return;

      WindowControls._debugVerbose('Dock layout computed styles', {
        phase,
        setting,
        viewport: {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        taskbar: {
          rect: rect(bar),
          top: barCS?.top ?? null,
          bottom: barCS?.bottom ?? null,
          height: barCS?.height ?? null,
          marginTop: barCS?.marginTop ?? null,
          marginBottom: barCS?.marginBottom ?? null,
          transform: barCS?.transform ?? null,
          zIndex: barCS?.zIndex ?? null,
        },
        interface: {
          rect: rect(iface),
          position: ifaceCS?.position ?? null,
          top: ifaceCS?.top ?? null,
          bottom: ifaceCS?.bottom ?? null,
          height: ifaceCS?.height ?? null,
          paddingTop: ifaceCS?.paddingTop ?? null,
          paddingBottom: ifaceCS?.paddingBottom ?? null,
          marginTop: ifaceCS?.marginTop ?? null,
          marginBottom: ifaceCS?.marginBottom ?? null,
          transform: ifaceCS?.transform ?? null,
        },
        board: {
          rect: rect(board),
          position: boardCS?.position ?? null,
          top: boardCS?.top ?? null,
          bottom: boardCS?.bottom ?? null,
          height: boardCS?.height ?? null,
          paddingTop: boardCS?.paddingTop ?? null,
          paddingBottom: boardCS?.paddingBottom ?? null,
          marginTop: boardCS?.marginTop ?? null,
          marginBottom: boardCS?.marginBottom ?? null,
          transform: boardCS?.transform ?? null,
        }
      });
    } catch (e) {
      // Never let debug logging break the module.
      try {
        console.warn('Window Controls Next | Dock layout snapshot failed', e);
      } catch { /* ignore */ }
    }
  }

  // ── Taskbar Barrier ───────────────────────────────────────────────────────
  // These methods prevent windows from being dragged behind the taskbar.

  // Installs pointer-event listeners that log when a dragged window touches the taskbar edge.
  // Only active when debug logging is on.
  static _installTaskbarBarrierWatcher() {
    if (WindowControls._barrierWatcherInstalled) return;
    WindowControls._barrierWatcherInstalled = true;

    const marginPx = 2;
    const stateByWindowEl = new WeakMap();
    let draggingWindowEl = null;

    const getTaskbarRect = () => {
      const bar = document.getElementById('window-controls-persistent');
      if (!(bar instanceof HTMLElement)) return null;
      const rect = bar.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      // If the bar is hidden due to disabled taskbar mode, don't log.
      if (getComputedStyle(bar).display === 'none') return null;
      return rect;
    };

    const getWindowTitle = (el) => {
      try {
        const titleEl = el.querySelector('.window-title, h4.window-title, header .window-title');
        const title = titleEl?.textContent?.trim();
        if (title) return title;
      } catch { /* ignore */ }
      return el.id || 'window';
    };

    const isTaskbarTop = (barRect) => {
      const distTop = Math.abs(barRect.top);
      const distBottom = Math.abs(window.innerHeight - barRect.bottom);
      return distTop <= distBottom;
    };

    const check = () => {
      if (!WindowControls._isDebugLoggingEnabled()) return;
      if (!(draggingWindowEl instanceof HTMLElement)) return;

      const barRect = getTaskbarRect();
      if (!barRect) return;

      const winRect = draggingWindowEl.getBoundingClientRect();
      const top = isTaskbarTop(barRect);
      const violating = top
        ? (winRect.top < (barRect.bottom + marginPx))
        : (winRect.bottom > (barRect.top - marginPx));

      const prev = stateByWindowEl.get(draggingWindowEl) === true;
      if (violating === prev) return;

      stateByWindowEl.set(draggingWindowEl, violating);
      WindowControls._debug(
        `Taskbar barrier ${violating ? 'CONTACT' : 'clear'}`,
        {
          side: top ? 'top' : 'bottom',
          title: getWindowTitle(draggingWindowEl),
          window: { top: Math.round(winRect.top), bottom: Math.round(winRect.bottom), height: Math.round(winRect.height) },
          taskbar: { top: Math.round(barRect.top), bottom: Math.round(barRect.bottom), height: Math.round(barRect.height) },
          marginPx
        }
      );
    };

    const onPointerDown = (event) => {
      if (!WindowControls._isDebugLoggingEnabled()) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      // Only the primary button should initiate a drag track.
      if (typeof event.button === 'number' && event.button !== 0) return;

      // Identify the Foundry window element.
      // Most Application windows have data-appid and class window-app.
      const win = target.closest('.window-app, .app.window-app, [data-appid]');
      if (!(win instanceof HTMLElement)) return;

      // Only consider clicks within the header zone (avoid tracking content clicks).
      const clientY = typeof event.clientY === 'number' ? event.clientY : null;
      if (clientY != null) {
        const rect = win.getBoundingClientRect();
        const headerZonePx = 64;
        if (clientY > rect.top + headerZonePx) return;
      }

      draggingWindowEl = win;
      // Reset state so the first contact/clear during this drag is reported.
      stateByWindowEl.delete(draggingWindowEl);

      WindowControls._debug('Barrier watch: tracking drag', {
        title: getWindowTitle(draggingWindowEl),
        id: draggingWindowEl.id || null
      });
      check();
    };

    const onPointerMove = () => {
      if (!draggingWindowEl) return;
      check();
    };

    const onPointerUp = () => {
      if (!draggingWindowEl) return;
      // One last check on release.
      check();

      WindowControls._debug('Barrier watch: drag end', {
        title: getWindowTitle(draggingWindowEl),
        id: draggingWindowEl.id || null
      });
      draggingWindowEl = null;
    };

    // Pointer events preferred; mouse events included as fallback.
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerUp, true);

    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('mousemove', onPointerMove, true);
    document.addEventListener('mouseup', onPointerUp, true);
  }

  // Returns the taskbar element's bounding rect and which edge it is on ('top' or 'bottom').
  static _getTaskbarBarrierInfo() {
    const bar = document.getElementById('window-controls-persistent');
    if (!(bar instanceof HTMLElement)) return null;
    if (getComputedStyle(bar).display === 'none') return null;

    const rect = bar.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const distTop = Math.abs(rect.top);
    const distBottom = Math.abs(window.innerHeight - rect.bottom);
    const side = distTop <= distBottom ? 'top' : 'bottom';
    return { rect, side, marginPx: 2 };
  }

  // Returns the raw HTML element for an app, handling both AppV1 (jQuery) and AppV2.
  static _getAppHTMLElement(app) {
    const el = app?.element ?? app?._element;
    if (el instanceof HTMLElement) return el;
    if (Array.isArray(el) && el[0] instanceof HTMLElement) return el[0];
    if (el?.jquery && el[0] instanceof HTMLElement) return el[0];
    return null;
  }

  // If a window overlaps the taskbar, nudges it to the nearest clear edge so it stays visible.
  static _clampAppAgainstTaskbarBarrier(app, barrier) {
    if (!app || !barrier) return false;
    if (WindowControls._shouldIgnoreApp(app)) return false;
    if (!WindowControls._isTargetSheet(app)) return false;
    if (WindowControls._isHiddenToTaskbar(app) || WindowControls._isMinimized(app)) return false;

    const el = WindowControls._getAppHTMLElement(app);
    if (!(el instanceof HTMLElement)) return false;
    if (getComputedStyle(el).display === 'none') return false;

    const winRect = el.getBoundingClientRect();
    const height = winRect.height;
    if (!height) return false;

    const { rect: barRect, side, marginPx } = barrier;
    const topBarrierY = barRect.bottom + marginPx;
    const bottomBarrierY = barRect.top - marginPx;

    // Determine current top in pixels (prefer app.position.top).
    let currentTop = Number.isFinite(app?.position?.top) ? app.position.top : null;
    if (currentTop == null) {
      const rawTop = el.style?.top;
      if (typeof rawTop === 'string' && rawTop.endsWith('px')) {
        const parsed = Number.parseFloat(rawTop);
        if (Number.isFinite(parsed)) currentTop = parsed;
      }
    }
    if (currentTop == null) return false;

    let newTop = currentTop;
    if (side === 'top') {
      // If the window's header is under the taskbar, push it down.
      if (winRect.top < topBarrierY) {
        newTop = currentTop + (topBarrierY - winRect.top);
      }
    } else {
      // If the window's bottom is under the taskbar, push it up.
      if (winRect.bottom > bottomBarrierY) {
        newTop = currentTop - (winRect.bottom - bottomBarrierY);
      }
    }

    if (!Number.isFinite(newTop) || Math.round(newTop) === Math.round(currentTop)) return false;

    // Apply via Foundry when possible; fall back to direct style.
    try {
      if (typeof app.setPosition === 'function') {
        app.setPosition({ top: newTop });
      } else {
        el.style.top = `${Math.round(newTop)}px`;
      }
    } catch {
      el.style.top = `${Math.round(newTop)}px`;
    }

    WindowControls._debug('Barrier enforce: nudged window', {
      app: WindowControls._debugDescribeApp(app),
      side,
      from: Math.round(currentTop),
      to: Math.round(newTop),
      taskbar: { top: Math.round(barRect.top), bottom: Math.round(barRect.bottom), h: Math.round(barRect.height) }
    });

    return true;
  }

  // Runs the barrier clamp on every currently open window.
  static _enforceAllWindowsAgainstTaskbarBarrier() {
    const barrier = WindowControls._getTaskbarBarrierInfo();
    if (!barrier) return;

    const windows = Object.values(ui?.windows ?? {});
    for (const app of windows) {
      WindowControls._clampAppAgainstTaskbarBarrier(app, barrier);
    }
  }

  // Installs a pointer-release listener that clamps all windows against the barrier after every drag.
  static _installTaskbarBarrierEnforcer() {
    if (WindowControls._barrierEnforcerInstalled) return;
    WindowControls._barrierEnforcerInstalled = true;

    const onRelease = () => {
      // Only act when debug is enabled OR when taskbar exists.
      // We always enforce (safety fix), but keep logs behind debug.
      WindowControls._enforceAllWindowsAgainstTaskbarBarrier();
    };

    document.addEventListener('pointerup', onRelease, true);
    document.addEventListener('pointercancel', onRelease, true);
    document.addEventListener('mouseup', onRelease, true);
    window.addEventListener('blur', onRelease, true);
  }

  // Builds a small summary object about an app (type, id, title, minimized) for use in log output.
  static _debugDescribeApp(app) {
    try {
      const ctor = app?.constructor?.name ?? 'App';
      const title = (typeof app?.title === 'string' && app.title.length) ? app.title : (app?.id ?? '');
      const uuid = app?.uuid ?? WindowControls._getAppDocumentUuid(app) ?? null;
      return {
        ctor,
        id: app?.id ?? null,
        appId: app?.appId ?? null,
        uuid,
        title,
        minimized: WindowControls._isMinimized(app),
      };
    } catch (e) {
      return { ctor: 'App' };
    }
  }

  // ── Utility Helpers ───────────────────────────────────────────────────────

  // Patches a method on a prototype so WCN code runs alongside the original.
  // Used as a manual fallback when libWrapper is not available.
  static _wrapMethod({ target, method, wrapper, name }) {
    const original = target?.[method];
    if (typeof original !== 'function') return;
    const key = `${name ?? target?.constructor?.name ?? 'target'}.${method}`;
    if (WindowControls._patches.has(key)) return;
    WindowControls._patches.set(key, original);
    target[method] = function (...args) {
      return wrapper.call(this, original.bind(this), ...args);
    };
  }


  // ── App Identity & Classification ───────────────────────────────────────────────
  // These methods identify apps and decide whether WCN should manage them.

  // Returns true if a window is currently minimized or hidden to the taskbar.
  static _isMinimized(app) {
    // In taskbar mode, a hidden-to-taskbar window should be treated as minimized.
    if (WindowControls._isHiddenToTaskbar(app)) return true;
    if (typeof app?.minimized === 'boolean') return app.minimized;
    return !!app?._minimized;
  }

  // Returns the Foundry Document UUID for an app (e.g. 'Actor.abc123'), or null for non-document windows.
  static _getAppDocumentUuid(app) {
    const docUuid = app?.document?.uuid ?? app?.object?.uuid;
    if (typeof docUuid === 'string' && docUuid.length) return docUuid;
    return null;
  }

  // Returns true if WCN should manage this app. Excludes Dialogs, sub-editors, and non-document windows.
  static _isTargetSheet(app) {
    if (!app) return false;

    // Always exclude Dialog (AppV1) and DialogV2 (AppV2) — transient, never taskbar-managed.
    if (app instanceof Dialog) return false;
    const DialogV2 = foundry?.applications?.api?.DialogV2;
    if (DialogV2 && app instanceof DialogV2) return false;

    // Check the third-party opt-in registry first (standalone AppV2 windows registered
    // by module devs via WindowControls.registerApp()).
    if (WindowControls._registeredAppClasses.size > 0) {
      for (const entry of WindowControls._registeredAppClasses) {
        if (typeof entry === 'function' && app instanceof entry) return true;
        if (typeof entry === 'string' && app.constructor?.name === entry) return true;
      }
    }

    // Document-backed apps: only manage the canonical sheet (document.sheet === app).
    // Sub-sheets (SheetConfig, PermissionControl, etc.) reference the same document
    // but are not the primary sheet — exclude them to avoid inheriting pinned state.
    const uuid = WindowControls._getAppDocumentUuid(app);
    if (!uuid) return false;
    const docSheet = app?.document?.sheet ?? app?.object?.sheet;
    if (docSheet && docSheet !== app) return false;

    return true;
  }

  // Returns the stable, reload-safe ID for an app (its Document UUID). Used for pin persistence.
  static _getAppPersistentId(app) {
    if (!app) return null;

    // Only persist Document UUIDs.
    return WindowControls._getAppDocumentUuid(app);
  }

  // Returns the best available runtime ID for an app within the current session.
  // Used for taskbar bookkeeping (not persisted across reloads).
  static _getAppRuntimeId(app) {
    if (!app) return null;

    const appUuid = app?.uuid;
    if (typeof appUuid === 'string' && appUuid.length) return appUuid;

    const persistentId = WindowControls._getAppPersistentId(app);
    if (typeof persistentId === 'string' && persistentId.length) return persistentId;

    if (app.appId != null) return String(app.appId);
    return null;
  }

  // Returns a unique key for the app, generating a temporary fallback key if no UUID is available.
  static _getAppKey(app) {
    if (!app) return null;

    const runtimeId = WindowControls._getAppRuntimeId(app);
    if (typeof runtimeId === 'string' && runtimeId.length) return runtimeId;

    // Absolute fallback: stable per-instance key when neither app.uuid nor a document uuid is available.
    if (app._wcAppKey) return app._wcAppKey;
    const makeId = foundry?.utils?.randomID ?? (() => String(Math.random()).slice(2));
    const base = app.id != null ? String(app.id) : (app?.constructor?.name ?? 'app');
    app._wcAppKey = `wc-${base}-${makeId()}`;
    return app._wcAppKey;
  }

  // If the same document's sheet is already open, closes the duplicate and brings the original to front.
  static async _enforceSingleInstanceByPersistentId(app) {
    // Only enforce for apps WCN manages. Sub-sheets and document-relative editors
    // (e.g. PF1e ChangeEditor) share a document UUID with the canonical sheet but
    // are NOT the canonical sheet — _isTargetSheet returns false for them.
    // Without this guard they were incorrectly identified as duplicates and closed.
    if (!WindowControls._isTargetSheet(app)) return;

    // Only enforce for real documents; allow SidebarTab popouts.
    const persistentId = WindowControls._getAppDocumentUuid(app);
    if (!persistentId) return;

    // Avoid recursion if close triggers another render hook.
    if (app._wcClosingDuplicate === true) return;

    const myKey = WindowControls._getAppKey(app);
    if (!myKey) return;

    const windows = Object.values(ui?.windows ?? {});
    const others = windows.filter(w => w && w !== app && WindowControls._getAppDocumentUuid(w) === persistentId);
    if (!others.length) return;

    // Keep the first existing one, transfer pinned state if needed, and close the new duplicate.
    const existing = others[0];
    try {
      if (app?._pinned === true && existing?._pinned !== true) {
        WindowControls.applyPinnedMode(existing, { mode: 'pin' });
        if (game.settings.get(WindowControls.MODULE_ID, 'rememberPinnedWindows')) void WindowControls.persistPinned(existing);
      }

      // Ensure existing is visible and focused.
      if (WindowControls._isHiddenToTaskbar(existing) || WindowControls._isMinimized(existing)) {
        await WindowControls._restoreFromTaskbar(existing);
      } else {
        WindowControls._bringToFront(existing);
      }

      // Close the duplicate (this one).
      app._wcClosingDuplicate = true;
      if (typeof app.close === 'function') {
        try { await app.close({ force: true }); }
        catch { await app.close(); }
      } else if (typeof app.render === 'function') {
        app.render(false);
      }
    } finally {
      app._wcClosingDuplicate = false;
    }
  }

  // ── Taskbar Button Sorting & Hover Preview ────────────────────────────────────

  // Extracts the sortable properties (pinned, type, title) from a taskbar button entry.
  static _getTaskbarSortData(entry, key) {
    const app = entry?.app;
    const pinned = entry?.pinned === true || app?._pinned === true;
    const docName = app?.document?.documentName;
    const type = docName || (app?.tabName ? 'SidebarTab' : (app?.constructor?.name ?? 'App'));
    const title = String(app?.title ?? app?.options?.title ?? app?.constructor?.name ?? 'Window');
    return {
      pinnedRank: pinned ? 0 : 1,
      type: type.toLowerCase(),
      title: title.toLowerCase(),
      key: String(key ?? ''),
    };
  }

  // Re-sorts all taskbar buttons: pinned first, then by document type, then alphabetically by title.
  static _sortTaskbarButtons() {
    const section = WindowControls._getTaskbarSection();
    if (!section) return;
    const container = WindowControls._getTaskbarButtonsContainer();
    if (!container) return;

    const buttons = Array.from(container.querySelectorAll('button.wc-taskbar-btn'))
      .filter(b => b instanceof HTMLElement);
    if (buttons.length <= 1) return;

    const getKey = (btn) => btn?.dataset?.wcAppKey;
    buttons.sort((a, b) => {
      const aKey = getKey(a);
      const bKey = getKey(b);
      const aEntry = aKey ? WindowControls._taskbarEntries.get(String(aKey)) : null;
      const bEntry = bKey ? WindowControls._taskbarEntries.get(String(bKey)) : null;

      const aa = WindowControls._getTaskbarSortData(aEntry, aKey);
      const bb = WindowControls._getTaskbarSortData(bEntry, bKey);

      if (aa.pinnedRank !== bb.pinnedRank) return aa.pinnedRank - bb.pinnedRank; // pinned first
      if (aa.type !== bb.type) return aa.type.localeCompare(bb.type);
      if (aa.title !== bb.title) return aa.title.localeCompare(bb.title);
      return aa.key.localeCompare(bb.key);
    });

    for (const btn of buttons) container.appendChild(btn);
    WindowControls._updateTaskbarFadeClasses();
  }

  // Attaches hover-preview mouse listeners to a taskbar button the first time it is created.
  static _ensureHoverPreviewHandlers(entry, app) {
    if (!entry || !entry.button || !(entry.button instanceof HTMLElement) || !app) return;
    if (entry._wcHoverHandlersInstalled === true) return;
    entry._wcHoverHandlersInstalled = true;

    const btn = entry.button;

    const startTimer = () => {
      entry._wcHoveringButton = true;
      if (entry._wcHoverTimer) clearTimeout(entry._wcHoverTimer);
      entry._wcHoverTimer = setTimeout(() => {
        if (!entry._wcHoveringButton) return;
        const targetApp = entry.app;
        if (!targetApp) return;
        if (!WindowControls._isHiddenToTaskbar(targetApp)) return;
        WindowControls._startTaskbarHoverPreview(entry, targetApp);
      }, WindowControls._TASKBAR_HOVER_PREVIEW_DELAY_MS);
    };

    const stopTimerAndMaybeHide = () => {
      entry._wcHoveringButton = false;
      if (entry._wcHoverTimer) {
        clearTimeout(entry._wcHoverTimer);
        entry._wcHoverTimer = null;
      }
      WindowControls._stopTaskbarHoverPreviewIfNeeded(entry);
    };

    btn.addEventListener('mouseenter', startTimer);
    btn.addEventListener('mouseleave', stopTimerAndMaybeHide);
  }

  // Temporarily shows a hidden window when the user hovers over its taskbar button.
  static _startTaskbarHoverPreview(entry, app) {
    if (!entry || !app) return;
    if (!WindowControls._isHiddenToTaskbar(app)) return;

    // Mark preview state and show the window.
    entry._wcPreviewing = true;
    WindowControls._showFromTaskbar(app);
    WindowControls._bringToFront(app);

    const el = WindowControls._getElement(app);
    if (el && el.dataset) el.dataset.wcTaskbarPreview = '1';

    // Keep it open while hovering the window too.
    if (el && entry._wcWindowHoverHandlersInstalled !== true) {
      entry._wcWindowHoverHandlersInstalled = true;
      const onEnter = () => {
        entry._wcHoveringWindow = true;
      };
      const onLeave = () => {
        entry._wcHoveringWindow = false;
        WindowControls._stopTaskbarHoverPreviewIfNeeded(entry);
      };
      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
      entry._wcWindowHoverHandlers = { el, onEnter, onLeave };
    }
  }

  // Re-hides the preview window if the user is no longer hovering the button or the window itself.
  static _stopTaskbarHoverPreviewIfNeeded(entry) {
    if (!entry?._wcPreviewing) return;
    if (entry._wcHoveringButton || entry._wcHoveringWindow) return;

    const app = entry.app;
    if (!app) return;

    // If user actually restored it (not hidden anymore), do not re-hide.
    if (!WindowControls._isHiddenToTaskbar(app)) {
      // But if it was only shown by preview, it *will* be visible; we still want to hide.
      // Use the dataset marker to decide.
      const el = WindowControls._getElement(app);
      if (!el || el.dataset?.wcTaskbarPreview !== '1') {
        entry._wcPreviewing = false;
        return;
      }
    }

    // Re-hide the previewed window.
    const el = WindowControls._getElement(app);
    if (el && el.dataset) delete el.dataset.wcTaskbarPreview;
    WindowControls._hideToTaskbar(app);
    entry._wcPreviewing = false;
  }

  // ── Remembered Pinning ────────────────────────────────────────────────────────────
  // Stored in the user's Foundry flags so pinned windows reopen on the next session.

  // Returns the list of remembered-pinned entries from the user's flags.
  static _getRememberedPinnedList() {
    const raw = game.user.getFlag(WindowControls._PINNED_FLAG_SCOPE, WindowControls._PINNED_FLAG_KEY);
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return [];
  }

  // Rebuilds the in-memory Set of remembered-pinned IDs from stored user flags.
  static _syncRememberedPinnedCache() {
    const list = WindowControls._getRememberedPinnedList();
    const ids = list
      .map(e => (typeof e === 'string' ? e : e?.id))
      .filter(id => typeof id === 'string' && id.length);
    WindowControls._rememberedPinnedIds = new Set(ids);
  }

  // Returns true if this app's document is in the user's remembered-pinned list.
  static _isRememberedPinned(app) {
    if (!game.settings.get(WindowControls.MODULE_ID, 'rememberPinnedWindows')) return false;
    const id = WindowControls._getAppPersistentId(app);
    if (!id) return false;
    return WindowControls._rememberedPinnedIds.has(id);
  }

  // ── DOM Element Helpers ────────────────────────────────────────────────────────

  // Returns the HTML element for an app, normalizing AppV1 (jQuery .element[0]) and AppV2.
  static _getElement(app) {
    const el = app?.element;
    if (!el) return null;
    if (el instanceof HTMLElement) return el;
    return el?.[0] ?? null;
  }

  // Returns the jQuery wrapper for an app's element.
  static _get$Element(app) {
    const el = WindowControls._getElement(app);
    return el ? $(el) : null;
  }

  // Brings a window to the top of the z-order, capped below tooltip and notification layers.
  static _bringToFront(app) {
    if (!app) return;

    // Get the element before calling Foundry's bringToFront so we can identify
    // it in the peer list after the call.
    const el = app.element?.[0] instanceof HTMLElement ? app.element[0]
      : app.element instanceof HTMLElement ? app.element : null;

    // Always call Foundry's implementation first to keep its internal counter in sync.
    if (typeof app.bringToFront === 'function') app.bringToFront();
    else if (typeof app.bringToTop === 'function') app.bringToTop();

    if (!el) return;

    // After Foundry assigns a z-index, clamp to peerMax + 1 so windows never
    // climb into tooltip / UI-chrome z territory.
    const base = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--z-index-window')
    ) || 100;

    const peerEls = [
      ...Object.values(ui.windows ?? {}).map(a => a.element?.[0] ?? a.element),
      ...Array.from(foundry?.applications?.instances?.values?.() ?? []).map(a => a.element)
    ].filter(e => e instanceof HTMLElement && e !== el);

    const peerMax = peerEls.reduce((max, e) => {
      const z = parseInt(getComputedStyle(e).zIndex);
      return isNaN(z) ? max : Math.max(max, z);
    }, base);

    el.style.zIndex = String(Math.min(peerMax + 1, WindowControls.WCN_Z_MAX));
  }

  // ── Taskbar Infrastructure ─────────────────────────────────────────────────────
  // Creation, layout, scroll, and entry tracking for the taskbar element itself.

  // Returns the current taskbar location setting, migrating any old stored values to current ones.
  static _getTaskbarSetting() {
    const raw = game.settings.get(WindowControls.MODULE_ID, 'organizedMinimize');
    // Migrate legacy values to taskbar modes.
    if (raw === 'persistentTop' || raw === 'persistentBottom' || raw === 'disabled') return raw;
    if (raw === 'top' || raw === 'topBar') return 'persistentTop';
    if (raw === 'bottom' || raw === 'bottomBar') return 'persistentBottom';
    return 'disabled';
  }

  // Returns true if the taskbar is currently enabled (top or bottom mode).
  static _isTaskbarMode(setting) {
    return setting === 'persistentTop' || setting === 'persistentBottom';
  }

  // Returns true if the user has turned off all WCN features for their client.
  static _isWcnDisabled() {
    try { return game.settings.get(WindowControls.MODULE_ID, 'wcDisabled') === true; } catch { return false; }
  }

  // Returns the taskbar <section> element from the DOM, or null if it doesn't exist.
  static _getTaskbarSection() {
    return document.getElementById('window-controls-persistent');
  }

  // Returns the scroll container inside the taskbar that holds the buttons.
  static _getTaskbarButtonsContainer() {
    const section = WindowControls._getTaskbarSection();
    if (!section) return null;
    // Newer versions wrap buttons in a scroll container.
    return section.querySelector(':scope > .wc-taskbar-scroll') ?? section;
  }

  // Creates the taskbar <section> if it doesn't exist, wires up the scroll-wheel and fade handlers.
  static _ensureTaskbarSection() {
    let section = WindowControls._getTaskbarSection();
    if (!section) {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<section id="window-controls-persistent"><div class="wc-taskbar-scroll"></div></section>'
      );
      section = WindowControls._getTaskbarSection();
    }
    if (!section) return;

    // Upgrade legacy markup by ensuring a dedicated scroll container exists.
    let container = section.querySelector(':scope > .wc-taskbar-scroll');
    if (!container) {
      container = document.createElement('div');
      container.className = 'wc-taskbar-scroll';
      const existingChildren = Array.from(section.children);
      section.appendChild(container);
      for (const child of existingChildren) {
        if (child === container) continue;
        container.appendChild(child);
      }
    }

    // Allow mouse wheel / trackpad to scroll the taskbar horizontally without a visible scrollbar.
    if (container && container.dataset && container.dataset.wcWheelScroll !== '1') {
      container.dataset.wcWheelScroll = '1';
      container.addEventListener('wheel', (ev) => {
        // Map vertical wheel to horizontal *only* when useful.
        // Let native horizontal (trackpads / shift+wheel) behave normally.
        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        if (maxScrollLeft <= 0) return;

        // If this is already a horizontal scroll gesture, don't interfere.
        if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;

        const delta = ev.deltaY;
        if (!delta) return;

        const prev = container.scrollLeft;
        const next = Math.max(0, Math.min(maxScrollLeft, prev + delta));
        if (next === prev) return;

        container.scrollLeft = next;
        ev.preventDefault();
        WindowControls._updateTaskbarFadeClasses();
      }, { passive: false });

      // Also update fades when the container is scrolled natively.
      container.addEventListener('scroll', () => {
        WindowControls._updateTaskbarFadeClasses();
      }, { passive: true });
    }
  }

  // Adds or removes the left/right fade-mask CSS classes based on the current scroll position.
  static _updateTaskbarFadeClasses() {
    const container = WindowControls._getTaskbarButtonsContainer();
    if (!(container instanceof HTMLElement)) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    container.classList.toggle('wc-fade-left',  scrollLeft > 1);
    container.classList.toggle('wc-fade-right', scrollLeft < scrollWidth - clientWidth - 1);
  }

  // Creates or removes the taskbar element and applies the correct top/bottom body class.
  static _applyTaskbarDockLayout() {
    if (WindowControls._isWcnDisabled()) {
      const existing = WindowControls._getTaskbarSection();
      if (existing?.parentElement) existing.parentElement.removeChild(existing);
      return;
    }
    const setting = WindowControls._getTaskbarSetting();

    // Always-on, low-noise state log (only when it changes).
    try {
      const state = WindowControls._getTaskbarStateLabel(setting);
      if (WindowControls._lastLoggedTaskbarState !== state) {
        WindowControls._lastLoggedTaskbarState = state;
        WindowControls._logAlways('Taskbar mode', state);
      }
    } catch { /* ignore */ }

    WindowControls._debugDockLayoutSnapshot('before', setting);

    document.body.classList.remove('wc-taskbar-top', 'wc-taskbar-bottom');

    // Keep CSS variable in sync with our expected height.
    const rootStyle = document.documentElement?.style;
    if (rootStyle) rootStyle.setProperty('--wc-taskbar-height', '40px');

    if (!WindowControls._isTaskbarMode(setting)) {
      const existing = WindowControls._getTaskbarSection();
      if (existing?.parentElement) existing.parentElement.removeChild(existing);
      // Kick Foundry layout/canvas to recompute sizes.
      window.dispatchEvent(new Event('resize'));

      WindowControls._debugDockLayoutSnapshot('after-disable', setting);
      requestAnimationFrame(() => WindowControls._debugDockLayoutSnapshot('after-disable-rAF', setting));
      return;
    }

    WindowControls._ensureTaskbarSection();
    if (setting === 'persistentTop') document.body.classList.add('wc-taskbar-top');
    if (setting === 'persistentBottom') document.body.classList.add('wc-taskbar-bottom');

    WindowControls._debugDockLayoutSnapshot('after-class', setting);

    // Kick Foundry layout/canvas to recompute sizes.
    window.dispatchEvent(new Event('resize'));

    // Layout can settle across multiple frames (Foundry + theme modules).
    requestAnimationFrame(() => {
      WindowControls._debugDockLayoutSnapshot('after-resize-rAF1', setting);
      requestAnimationFrame(() => WindowControls._debugDockLayoutSnapshot('after-resize-rAF2', setting));
    });
  }

  // Gets the internal tracking record for a window's taskbar button.
  static _getTaskbarEntry(app) {
    const key = WindowControls._getAppKey(app);
    if (!key) return undefined;
    return WindowControls._taskbarEntries.get(String(key));
  }

  // Saves the internal tracking record for a window's taskbar button.
  static _setTaskbarEntry(app, entry) {
    const key = WindowControls._getAppKey(app);
    if (!key) return;
    WindowControls._taskbarEntries.set(String(key), entry);
  }

  // Removes the internal tracking record for a window's taskbar button.
  static _deleteTaskbarEntry(app) {
    const key = WindowControls._getAppKey(app);
    if (!key) return;
    WindowControls._taskbarEntries.delete(String(key));
  }

  // Returns true if the window's HTML element is currently hidden (the window is on the taskbar).
  static _isHiddenToTaskbar(app) {
    const el = WindowControls._getElement(app);
    if (!el) return false;
    return el.style.display === 'none' || el.dataset?.wcTaskbarHidden === '1';
  }

  // Makes a hidden window's element visible again without triggering Foundry's maximize flow.
  static _showFromTaskbar(app) {
    const el = WindowControls._getElement(app);
    if (!el) return;
    el.style.display = '';
    if (el.dataset) delete el.dataset.wcTaskbarHidden;
    // Maintain our own minimized state when we bypass Foundry's minimize/maximize.
    if (app?._minimized) app._minimized = false;
  }

  // Hides a window's element so only its taskbar button is visible.
  static _hideToTaskbar(app) {
    const el = WindowControls._getElement(app);
    if (!el) return;
    el.style.display = 'none';
    if (el.dataset) el.dataset.wcTaskbarHidden = '1';
    // Maintain our own minimized state when we bypass Foundry's minimize/maximize.
    app._minimized = true;
  }

  // ── Taskbar Button Management ────────────────────────────────────────────────
  // Creating, updating, and removing the per-window buttons that appear in the taskbar.

  // Strips the leading 'Type: ' prefix from a sheet title so the button shows just the document name.
  static _getShortTaskbarTitle(fullTitle) {
    const title = String(fullTitle ?? '').trim();
    if (!title) return '';

    // Common pattern for Document sheets: "Type: Name".
    // Show only the "Name" portion on the taskbar (we already have an icon),
    // while the full title remains available via the tooltip.
    const colonIndex = title.lastIndexOf(':');
    if (colonIndex > -1 && colonIndex < title.length - 1) {
      const after = title.slice(colonIndex + 1).trim();
      if (after) return after;
    }

    return title;
  }

  // Returns the icon class and short title to display on a taskbar button.
  static _getTaskbarButtonLabel(app) {
    const fullTitle = (app?.title ?? app?.options?.title ?? app?.constructor?.name ?? 'Window');
    const short = WindowControls._getShortTaskbarTitle(fullTitle);

    const docName = app?.document?.documentName;
    const ctor = app?.constructor?.name ?? '';

    let icon = 'far fa-window-maximize';
    if (docName === 'Actor' || ctor.includes('Actor')) icon = 'fas fa-user';
    else if (docName === 'Item' || ctor.includes('Item')) icon = 'fas fa-sword';
    else if (docName === 'JournalEntry' || ctor.includes('Journal')) icon = 'fas fa-book-open';
    else if (docName === 'RollTable' || ctor.includes('RollTable')) icon = 'fas fa-list';

    return { icon, text: short };
  }

  // Returns true if this window currently has the highest z-index of all open windows.
  static _isTopmost(app) {
    const el = WindowControls._getElement(app);
    if (!el) return false;
    const getZ = (node) => {
      const z = Number(getComputedStyle(node).zIndex);
      return Number.isFinite(z) ? z : 0;
    };
    const myZ = getZ(el);
    const nodes = Array.from(document.querySelectorAll('.window-app, .app'))
      .filter(n => n instanceof HTMLElement && n.id !== 'window-controls-persistent' && getComputedStyle(n).display !== 'none');
    const maxZ = Math.max(0, ...nodes.map(getZ));
    return myZ >= maxZ;
  }

  // Creates or refreshes the taskbar button for a window, wiring click and context-menu handlers.
  static _createOrUpdateTaskbarButton(app, { pinned } = {}) {
    WindowControls._ensureTaskbarSection();
    const section = WindowControls._getTaskbarSection();
    if (!section) return;
    const container = WindowControls._getTaskbarButtonsContainer();
    if (!container) return;

    const key = WindowControls._getAppKey(app);
    if (!key) return;

    const strKey = String(key);
    const existingEntry = WindowControls._taskbarEntries.get(strKey) ?? { app };
    existingEntry.app = app;
    existingEntry.pinned = pinned ?? existingEntry.pinned ?? false;
    existingEntry.persistentId = WindowControls._getAppPersistentId(app);

    let btn = existingEntry.button;
    if (!btn || !(btn instanceof HTMLElement) || !btn.isConnected) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wc-taskbar-btn';
      btn.dataset.wcAppKey = strKey;

      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const entry = WindowControls._taskbarEntries.get(strKey);
        const targetApp = entry?.app;
        if (!targetApp) return;

        const targetEl = WindowControls._getElement(targetApp);
        const wasHoverPreview = entry?._wcPreviewing === true || targetEl?.dataset?.wcTaskbarPreview === '1';

        // If this button was previewing, stop preview tracking now.
        if (entry) {
          entry._wcPreviewing = false;
          entry._wcHoveringButton = false;
          entry._wcHoveringWindow = false;
          if (entry._wcHoverTimer) {
            clearTimeout(entry._wcHoverTimer);
            entry._wcHoverTimer = null;
          }
          if (targetEl && targetEl.dataset) delete targetEl.dataset.wcTaskbarPreview;
        }

        // If the window is currently shown only because of hover-preview, clicking should
        // commit it to a real restored/open state (so mouseleave won't re-hide it).
        if (wasHoverPreview) {
          await WindowControls._restoreFromTaskbar(targetApp);
          return;
        }

        // If hidden/minimized-to-taskbar: restore.
        if (WindowControls._isHiddenToTaskbar(targetApp) || WindowControls._isMinimized(targetApp)) {
          await WindowControls._restoreFromTaskbar(targetApp);
          return;
        }

        // Visible pinned window: bring-to-front, then if already topmost, minimize-to-taskbar.
        if (targetApp._pinned === true) {
          if (WindowControls._isTopmost(targetApp)) {
            // Avoid Foundry minimize animation/state; hide directly.
            WindowControls.organizedMinimize(targetApp, WindowControls._getTaskbarSetting());
          } else {
            WindowControls._bringToFront(targetApp);
          }
        } else {
          // Unpinned visible window: just bring to top.
          WindowControls._bringToFront(targetApp);
        }
      });

      container.appendChild(btn);
      existingEntry.button = btn;
    }

    // Tooltip should show the full window title.
    const fullTitle = String(app?.title ?? app?.options?.title ?? app?.constructor?.name ?? 'Window');
    btn.title = fullTitle;

    const { icon, text } = WindowControls._getTaskbarButtonLabel(app);
    btn.innerHTML = `<i class="${icon}"></i><span class="wc-taskbar-label">${foundry.utils.escapeHTML(text)}</span>`;
    btn.classList.toggle('pinned', !!existingEntry.pinned);

    WindowControls._ensureHoverPreviewHandlers(existingEntry, app);
    WindowControls._ensureTaskbarButtonContextMenu(existingEntry, app);

    WindowControls._taskbarEntries.set(strKey, existingEntry);
    WindowControls._sortTaskbarButtons();
  }

  // Attaches the right-click context menu to a taskbar button once (safe to call repeatedly).
  static _ensureTaskbarButtonContextMenu(entry, app) {
    if (!entry || !(entry.button instanceof HTMLElement) || !app) return;
    if (entry._wcContextMenuInstalled === true) return;
    entry._wcContextMenuInstalled = true;

    entry.button.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      // Close any existing WCN context menu.
      document.getElementById('wc-context-menu')?.remove();

      const isPinned = app._pinned === true;
      const pinnedEnabled = game?.settings?.get(WindowControls.MODULE_ID, 'pinnedButton') === 'enabled';

      const items = [
        {
          label: game.i18n.localize('WindowControls.ContextRestore'),
          icon: 'fa-solid fa-window-restore',
          action: () => { void WindowControls._restoreFromTaskbar(app); }
        },
        {
          label: game.i18n.localize('WindowControls.DefaultSize'),
          icon: 'fa-solid fa-compress',
          action: () => { void WindowControls._restoreDefaultSize(app); }
        },
        {
          label: game.i18n.localize('WindowControls.ContextMaximize'),
          icon: 'fa-solid fa-expand',
          action: () => { void WindowControls._maximizeToViewport(app); }
        },
      ];

      if (pinnedEnabled) {
        items.push({
          label: isPinned
            ? game.i18n.localize('WindowControls.ContextUnpin')
            : game.i18n.localize('WindowControls.ContextPin'),
          icon: 'fa-solid fa-map-pin',
          action: () => { WindowControls.applyPinnedMode(app); }
        });
      }

      items.push({
        label: game.i18n.localize('WindowControls.ContextClose'),
        icon: 'fa-solid fa-times',
        action: () => {
          WindowControls.organizedClose(app, WindowControls._getTaskbarSetting());
          if (typeof app.close === 'function') void app.close();
        }
      });

      const menu = document.createElement('nav');
      menu.id = 'wc-context-menu';
      menu.className = 'context-menu';
      menu.innerHTML = items.map(item =>
        `<li class="context-item"><a><i class="${foundry.utils.escapeHTML(item.icon)}"></i>${foundry.utils.escapeHTML(item.label)}</a></li>`
      ).join('');

      document.body.appendChild(menu);

      // Position above the button (taskbar is at bottom or top).
      const btnRect = entry.button.getBoundingClientRect();
      const menuH = menu.offsetHeight || 100;
      const above = btnRect.top > window.innerHeight / 2;
      menu.style.position = 'fixed';
      menu.style.left = Math.min(ev.clientX, window.innerWidth - menu.offsetWidth - 4) + 'px';
      menu.style.top = above
        ? (btnRect.top - menuH - 4) + 'px'
        : (btnRect.bottom + 4) + 'px';
      menu.style.zIndex = String(WindowControls.WCN_Z_MAX + 1);

      // Wire up click handlers.
      menu.querySelectorAll('li.context-item').forEach((li, i) => {
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          menu.remove();
          items[i].action();
        });
      });

      // Close on any outside click.
      const close = (e) => {
        if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close, true); }
      };
      setTimeout(() => document.addEventListener('click', close, true), 0);
    });
  }

  // Removes a window's taskbar button from the DOM and deletes its tracking entry.
  static _removeTaskbarButton(app) {
    const key = WindowControls._getAppKey(app);
    if (!key) return;
    const entry = WindowControls._taskbarEntries.get(String(key));
    if (!entry) return;
    if (entry.button?.parentElement) entry.button.parentElement.removeChild(entry.button);
    WindowControls._taskbarEntries.delete(String(key));
    WindowControls._sortTaskbarButtons();
  }

  // ── Window Size & Position ───────────────────────────────────────────────────

  // Resizes a window to fill the configured percentage of the canvas area.
  static async _maximizeToViewport(app) {
    if (WindowControls._isHiddenToTaskbar(app)) {
      await WindowControls._restoreFromTaskbar(app);
    }
    await new Promise(r => requestAnimationFrame(r));
    const el = WindowControls._getElement(app);
    if (!el) return;
    const board  = document.getElementById('board');
    const boardW = board ? board.offsetWidth  : window.innerWidth;
    const boardH = board ? board.offsetHeight : window.innerHeight;
    const widthPct  = Math.min(100, Math.max(10, game.settings.get(WindowControls.MODULE_ID, 'maximizeWidth')))  / 100;
    const heightPct = Math.min(100, Math.max(10, game.settings.get(WindowControls.MODULE_ID, 'maximizeHeight'))) / 100;
    const maxW = Math.round(boardW * widthPct);
    const maxH = Math.round(boardH * heightPct);
    if (typeof app.setPosition === 'function') {
      app.setPosition({ width: maxW, height: maxH });
    } else {
      el.style.width  = `${maxW}px`;
      el.style.height = `${maxH}px`;
    }
  }

  // Looks up the default width/height for an app from static options, learned sizes, or CSS.
  static _getDefaultSize(app) {
    // AppV2: DEFAULT_OPTIONS.position may carry width / height.
    const defV2 = app?.constructor?.DEFAULT_OPTIONS?.position;
    if (defV2?.width || defV2?.height) return { width: defV2.width ?? undefined, height: defV2.height ?? undefined };
    // AppV1: static defaultOptions.
    const defV1 = app?.constructor?.defaultOptions;
    if (defV1?.width || defV1?.height) return { width: defV1.width ?? undefined, height: defV1.height ?? undefined };
    // Last resort: options recorded at instantiation time.
    const w = app?.options?.width;
    const h = app?.options?.height;
    if ((w && w !== 'auto') || (h && h !== 'auto')) {
      return { width: (w && w !== 'auto') ? w : undefined, height: (h && h !== 'auto') ? h : undefined };
    }
    // Known Foundry core sheet defaults (sheets that declare no size in their options).
    const knownName = app?.constructor?.name;
    // Per-world learned defaults take priority — they reflect the actual system default for
    // this world (captured automatically on the first ever render of each sheet class).
    if (knownName) {
      const learnedAll = (() => { try { return game?.settings?.get(WindowControls.MODULE_ID, 'learnedSheetDefaults'); } catch { return null; } })();
      if (learnedAll?.[knownName]) return { ...learnedAll[knownName] };
    }
    if (knownName && WindowControls._KNOWN_DEFAULT_SIZES[knownName]) {
      return { ...WindowControls._KNOWN_DEFAULT_SIZES[knownName] };
    }
    // Final fallback: CSS min-width/min-height (e.g. journals in v14 declare no position
    // defaults but do set min-width/height via stylesheet — use those as the natural default).
    const el = app?.element instanceof HTMLElement ? app.element
      : app?.element?.[0] instanceof HTMLElement ? app.element[0] : null;
    if (el) {
      const cs = getComputedStyle(el);
      const minW = parseFloat(cs.minWidth);
      const minH = parseFloat(cs.minHeight);
      if (minW > 0 || minH > 0) {
        return { width: minW > 0 ? minW : undefined, height: minH > 0 ? minH : undefined };
      }
    }
    return { width: undefined, height: undefined };
  }

  // Restores a window to its default size, showing it first if it was hidden to the taskbar.
  static async _restoreDefaultSize(app) {
    if (WindowControls._isHiddenToTaskbar(app)) {
      await WindowControls._restoreFromTaskbar(app);
      await new Promise(r => requestAnimationFrame(r));
    }
    const size = WindowControls._getDefaultSize(app);
    if (!size.width && !size.height) {
      const name = app?.constructor?.name ?? 'this sheet type';
      ui?.notifications?.info?.(
        `Window Controls: No default size has been captured for "${name}" yet. ` +
        `Open any sheet of this type once and WCN will record its dimensions automatically.`
      );
      return;
    }
    if (typeof app.setPosition === 'function') {
      app.setPosition(size);
    } else {
      const el = WindowControls._getElement(app);
      if (el) {
        if (size.width)  el.style.width  = `${size.width}px`;
        if (size.height) el.style.height = `${size.height}px`;
      }
    }
  }

  // On first render of a sheet type not seen before in this world, records its size as the learned default (GM only).
  static _maybeCaptureFirstRenderSize(app) {
    if (!WindowControls._isTargetSheet(app)) return;
    if (!game.user?.isGM) return;
    const name = app?.constructor?.name;
    if (!name) return;
    let learned;
    try {
      learned = game.settings.get(WindowControls.MODULE_ID, 'learnedSheetDefaults') ?? {};
    } catch { return; }
    if (learned[name]) return;
    requestAnimationFrame(() => {
      const el = WindowControls._getElement(app);
      if (!(el instanceof HTMLElement)) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      // Re-read in case another render already stored this class.
      let current;
      try {
        current = game.settings.get(WindowControls.MODULE_ID, 'learnedSheetDefaults') ?? {};
      } catch { return; }
      if (current[name]) return;
      const updated = { ...current, [name]: { width: w, height: h } };
      game.settings.set(WindowControls.MODULE_ID, 'learnedSheetDefaults', updated)?.catch?.(() => {});
      WindowControls._debug(`Learned default size for "${name}": ${w}×${h}`);
    });
  }

  // Shows a hidden-to-taskbar window, brings it to front, and removes its button if it is not pinned.
  static _restoreFromTaskbar(app) {
    WindowControls._showFromTaskbar(app);
    // If this was previously shown via hover-preview, ensure it cannot be re-hidden by preview cleanup.
    const el = WindowControls._getElement(app);
    if (el && el.dataset) delete el.dataset.wcTaskbarPreview;
    const p = (async () => {
      WindowControls._bringToFront(app);
      WindowControls.setRestoredStyle(app);
      // Remove taskbar button only if not pinned.
      if (app._pinned !== true) WindowControls._removeTaskbarButton(app);
    })();
    return p;
  }

  // Updates or removes the taskbar button for a window to reflect its current pinned state.
  static _syncPinnedTaskbarButton(app) {
    if (!WindowControls._isTaskbarMode(WindowControls._getTaskbarSetting())) return;
    if (app._pinned === true) {
      WindowControls._createOrUpdateTaskbarButton(app, { pinned: true });
    } else {
      // If not pinned: remove the button only when visible.
      if (!WindowControls._isHiddenToTaskbar(app) && !WindowControls._isMinimized(app)) {
        WindowControls._removeTaskbarButton(app);
      } else {
        // Still hidden: keep the button but remove pinned styling.
        WindowControls._createOrUpdateTaskbarButton(app, { pinned: false });
      }
    }
  }

  // ── Header Controls ───────────────────────────────────────────────────────────────
  // Injecting and managing WCN's extra buttons (minimize, default size, maximize, pin) in window headers.

  // Returns the <header> element of a window.
  static _getHeaderElement(app, rootElement) {
    const el = rootElement ?? WindowControls._getElement(app);
    if (!el) return null;
    return el.querySelector('.window-header') ?? el.querySelector('header') ?? null;
  }

  // Returns the close button element inside a window's header.
  static _getCloseControlElement(app, rootElement) {
    // Prefer the AppV2 Window API if present.
    const closeEl = app?.window?.close;
    if (closeEl instanceof HTMLElement) return closeEl;
    const header = WindowControls._getHeaderElement(app, rootElement);
    if (!header) return null;
    return (
      header.querySelector('.close') ||
      header.querySelector('[data-action="close"]') ||
      header.querySelector('button[aria-label*="Close" i]') ||
      header.querySelector('a[aria-label*="Close" i]')
    );
  }

  // Shows or hides the close button in a window's header.
  static _setCloseControlHidden(app, hidden, rootElement) {
    const closeEl = WindowControls._getCloseControlElement(app, rootElement);
    if (!closeEl) return;
    closeEl.style.display = hidden ? 'none' : '';
  }

  // Sets the text content of the window's title element (works for both AppV1 and AppV2).
  static _setWindowTitleText(app, text, rootElement) {
    const titleEl = app?.window?.title;
    if (titleEl instanceof HTMLElement) {
      titleEl.textContent = text;
      return;
    }
    const header = WindowControls._getHeaderElement(app, rootElement);
    if (!header) return;
    const h = header.querySelector('h1, h2, h3, h4, .window-title');
    if (h) h.textContent = text;
  }

  // Injects WCN's header buttons (minimize, default size, maximize, pin) into an AppV2 window.
  static _ensureInlineControlsV2(app, rootElement) {
    if (WindowControls._isWcnDisabled()) return;
    if (WindowControls._shouldIgnoreApp(app)) return;
    const el = rootElement ?? WindowControls._getElement(app);
    if (!el) return;

    const header = WindowControls._getHeaderElement(app, el);
    if (!header) return;

    // Avoid duplicates on re-render.
    if (header.querySelector('.window-controls-inline')) return;

    const minimizeSetting   = game.settings.get(WindowControls.MODULE_ID, 'minimizeButton');
    const pinnedSetting     = game.settings.get(WindowControls.MODULE_ID, 'pinnedButton');
    const defaultSizeSetting = game.settings.get(WindowControls.MODULE_ID, 'defaultSizeButton');
    const maximizeSetting   = game.settings.get(WindowControls.MODULE_ID, 'maximizeButton');
    if (minimizeSetting !== 'enabled' && pinnedSetting !== 'enabled' && defaultSizeSetting !== 'enabled' && maximizeSetting !== 'enabled') return;

    const closeControl = WindowControls._getCloseControlElement(app, el);
    const controls = document.createElement('div');
    controls.className = 'window-controls-inline';

    const makeControl = ({ cls, icon, titleKey, onClick }) => {
      // Important: do NOT inherit classes from the close button.
      // Many Foundry themes implement close via ::before icon rules which would render an extra "x".
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('header-control', 'window-controls-inline-btn', cls);

      const title = game.i18n.localize(titleKey);
      btn.setAttribute('title', title);
      btn.setAttribute('aria-label', title);
      btn.innerHTML = `<i class="${icon}"></i>`;
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        await onClick();
      });
      return btn;
    };

    if (minimizeSetting === 'enabled') {
      controls.appendChild(makeControl({
        cls: 'minimize',
        icon: 'far fa-window-minimize',
        titleKey: 'WindowControls.Minimize',
        onClick: async () => {
          if (WindowControls._isMinimized(app)) await app.maximize();
          else await app.minimize();
        }
      }));
    }

    if (defaultSizeSetting === 'enabled') {
      controls.appendChild(makeControl({
        cls: 'wc-default-size',
        icon: 'fa-solid fa-compress',
        titleKey: 'WindowControls.DefaultSize',
        onClick: async () => { await WindowControls._restoreDefaultSize(app); }
      }));
    }

    if (maximizeSetting === 'enabled') {
      controls.appendChild(makeControl({
        cls: 'wc-maximize',
        icon: 'fa-solid fa-expand',
        titleKey: 'WindowControls.Maximize',
        onClick: async () => { await WindowControls._maximizeToViewport(app); }
      }));
    }

    if (pinnedSetting === 'enabled') {
      controls.appendChild(makeControl({
        cls: 'pin',
        icon: 'fas fa-map-pin',
        titleKey: 'WindowControls.Pin',
        onClick: async () => {
          WindowControls.applyPinnedMode(app);
          if (app.appId != null) {
            const linked = Object.values(ui.windows).find(w => w.targetApp?.appId === app.appId);
            if (linked) WindowControls.applyPinnedMode(linked);
          }
        }
      }));
    }

    // Insert immediately left of the close control if possible.
    if (closeControl?.parentElement) closeControl.parentElement.insertBefore(controls, closeControl);
    else header.appendChild(controls);

    // Sync close visibility if already pinned.
    if (app._pinned === true) WindowControls._setCloseControlHidden(app, true, el);

    // Auto-apply remembered pin for this window.
    if (!app._pinned && WindowControls._isRememberedPinned(app)) {
      WindowControls.applyPinnedMode(app);
    }
  }

  // ── Window Lifecycle ─────────────────────────────────────────────────────────────
  // Minimize, restore, close, and title-transformation for all managed windows.

  // Minimizes all non-pinned, non-dialog open windows at once.
  static minimizeAll() {
    for (const w of Object.values(ui.windows)) {
      const ctr = w.constructor.name;
      if (WindowControls._isMinimized(w) === true || w._pinned === true || ctr === 'DestinyTracker' || ctr === 'ee')
        continue;
      if ( // Do not minimize Dialogs
        !(ctr.includes('Config') ||
          ctr === 'RollTableConfig' ||
          ctr.includes('Dialog') ||
          ctr === 'FilePicker')
      ) w.minimize();
      if (game.modules.get('gm-screen')?.active && $(".gm-screen-app").hasClass('expanded'))
        $(".gm-screen-button").click();
    }
  }

  // Adjusts a window title for compact taskbar display (strips token prefix, abbreviates table names).
  static curateTitle(title) {
    if (!title || typeof title !== 'string') return "";
    return title.replace("[Token] ", "~ ").replace("Table Configuration: ", "");
  }

  // Reverses the title transformation applied by curateTitle.
  static uncurateTitle(title) {
    if (!title || typeof title !== 'string') return "";
    return title.replace("~ ", "[Token] ");
  }

  // ── Pinning ────────────────────────────────────────────────────────────────
  // Pinning keeps a window open and its close button hidden across sessions.

  // Saves a window's Document UUID to the user's flags so it reopens pinned next session.
  static async persistPinned(app) {
    const id = WindowControls._getAppPersistentId(app);
    if (!id) return;
    const list = WindowControls._getRememberedPinnedList();
    const exists = list.some(e => (typeof e === 'string' ? e === id : e?.id === id));
    if (exists) return;
    list.push({ id, position: app?.position ?? null });
    await game.user.setFlag(WindowControls._PINNED_FLAG_SCOPE, WindowControls._PINNED_FLAG_KEY, list);
    WindowControls._syncRememberedPinnedCache();
  }

  // Removes a window from the user's remembered-pinned flags.
  static async unpersistPinned(app) {
    const id = WindowControls._getAppPersistentId(app);
    if (!id) return;
    const list = WindowControls._getRememberedPinnedList();
    const filtered = list.filter(e => (typeof e === 'string' ? e !== id : e?.id !== id));
    await game.user.setFlag(WindowControls._PINNED_FLAG_SCOPE, WindowControls._PINNED_FLAG_KEY, filtered);
    WindowControls._syncRememberedPinnedCache();
  }

  // Polls until a sheet is rendered, then applies pin state and hides it to the taskbar.
  static _persistRenderMinimizeRetry(app, { position, tries = 0 } = {}) {
    const maxTries = 10;
    const delay = 250;
    setTimeout(async () => {
      if (!app) return;
      if (app.rendered) {
        try {
          if (WindowControls._isTargetSheet(app)) WindowControls.applyPinnedMode(app, { mode: 'pin' });
          if (position && typeof app.setPosition === 'function') app.setPosition(position);
          const taskbarSetting = WindowControls._getTaskbarSetting();
          if (WindowControls._isTaskbarMode(taskbarSetting)) {
            // Skip Foundry's minimize/maximize; hide directly.
            WindowControls.organizedMinimize(app, taskbarSetting);
            WindowControls._syncPinnedTaskbarButton(app);
          }
        } catch (e) {
          console.warn('Window Controls: Failed to initialize remembered pinned window.', e);
        }
        return;
      }

      if (tries >= maxTries) {
        console.warn('Window Controls: Gave up restoring a remembered pinned window (too slow to render).');
        return;
      }
      WindowControls._persistRenderMinimizeRetry(app, { position, tries: tries + 1 });
    }, delay);
  }

  // On world load, reopens all documents the user had pinned in their previous session.
  static async _restoreRememberedPinnedWindows() {
    if (!game.settings.get(WindowControls.MODULE_ID, 'rememberPinnedWindows')) return;
    WindowControls._syncRememberedPinnedCache();
    const list = WindowControls._getRememberedPinnedList();

    for (const entry of list) {
      const id = typeof entry === 'string' ? entry : entry?.id;
      const position = typeof entry === 'object' ? entry?.position : null;
      if (typeof id !== 'string' || !id.length) continue;

      // Ignore any legacy stored non-document ids.
      if (id.startsWith('SidebarTab.')) continue;

      // Document UUIDs.
      try {
        const fromUuid = foundry?.utils?.fromUuid ?? globalThis.fromUuid;
        if (typeof fromUuid !== 'function') continue;
        const doc = await fromUuid(id);
        const sheet = doc?.sheet;
        if (!sheet || typeof sheet.render !== 'function') continue;

        const taskbarSetting = WindowControls._getTaskbarSetting();
        const isTaskbarMode = WindowControls._isTaskbarMode(taskbarSetting);
        const isAppV2 = !!(foundry?.applications?.api?.ApplicationV2 &&
          sheet instanceof foundry.applications.api.ApplicationV2);

        if (isAppV2 && isTaskbarMode && typeof sheet.maximize === 'function') {
          // AppV2's render(force=true) fires maximize().then(bringToFront()) as a floating
          // promise AFTER render() resolves (and after our finally). Override both to no-ops
          // for the duration so the hidden window never claims a high z-index slot.
          const _origMaximize    = sheet.maximize;
          const _origBringToFront = sheet.bringToFront;
          sheet.maximize     = async function() { return this; };
          sheet.bringToFront = function()       { return this; };
          try {
            await sheet.render(true);
          } finally {
            sheet.maximize     = _origMaximize;
            sheet.bringToFront = _origBringToFront;
          }
          WindowControls.organizedMinimize(sheet, taskbarSetting);
        } else {
          // AppV1 or non-taskbar mode: flag-based approach handled in the render hook.
          sheet._wcRestoringFromPersist = true;
          sheet.render(true);
        }
        WindowControls._persistRenderMinimizeRetry(sheet, { position });
      } catch (e) {
        console.warn(`Window Controls: Failed restoring pinned window for id ${id}`, e);
      }
    }
  }

  // Updates the window's header icon to show a restore symbol and trims the title when hidden to taskbar.
  static setMinimizedStyle(app) {
    const el = WindowControls._getElement(app);
    if (!el) return;
    const $el = $(el);
    WindowControls._setWindowTitleText(app, WindowControls.curateTitle(app.title), el);
    const $min = $el.find('.minimize');
    $min.empty();
    $min.append(`<i class="far fa-window-restore"></i>`);
    $min.show();
  }

  // Restores the window's header icon and title to their normal state after being brought back from the taskbar.
  static setRestoredStyle(app) {
    const el = WindowControls._getElement(app);
    if (!el) return;
    const $el = $(el);
    WindowControls._setWindowTitleText(app, WindowControls.uncurateTitle(app.title), el);
    const $min = $el.find('.minimize');
    $min.empty();
    $min.append(`<i class="far fa-window-minimize"></i>`);
    if (app._pinned === true) {
      $el.find(".entry-image").hide();
      $el.find(".entry-text").hide();
      WindowControls._setCloseControlHidden(app, true, el);
    }
  }

  // Applies pinned styling to a window: locks the close button and persists the pin to user flags.
  static _applyPinnedState(app, el, header) {
    if (!header.hasClass('minimized-pinned')) header.addClass('minimized-pinned');
    app._pinned = true;

    if (!app._closeBkp) app._closeBkp = app.close;

    if (game.settings.get(WindowControls.MODULE_ID, 'pinnedDoubleTapping') === false) {
      app.close = async function () {
        if (!WindowControls._isMinimized(this)) await this.minimize();
      };
    } else {
      app.close = async function () {
        if (WindowControls._isMinimized(this)) return;
        if (app._pinned_marked) {
          delete app._pinned_marked;
          this.minimize();
        } else {
          app._pinned_marked = true;
          setTimeout(() => {
            delete app._pinned_marked;
          }, 2000);
        }
      };
    }

    WindowControls._setCloseControlHidden(app, true, el);
    header.find(".entry-image").hide();
    header.find(".entry-text").hide();
    if (game.settings.get(WindowControls.MODULE_ID, 'rememberPinnedWindows')) void WindowControls.persistPinned(app);
    WindowControls._syncPinnedTaskbarButton(app);
  }

  // Removes pinned styling: restores the close button and removes the pin from user flags.
  static _removePinnedState(app, el, header) {
    if (header.hasClass('minimized-pinned')) header.removeClass('minimized-pinned');
    delete app._pinned;

    if (app._closeBkp) {
      app.close = app._closeBkp;
      delete app._closeBkp;
    }

    // Dirty hack to prevent very fast minimization (messes up windows size)
    const _bkpMinimize = app.minimize;
    app.minimize = function () {};
    setTimeout(() => {
      app.minimize = _bkpMinimize;
    }, 200);

    header.find(".entry-image").show();
    header.find(".entry-text").show();
    WindowControls._setCloseControlHidden(app, false, el);
    if (game.settings.get(WindowControls.MODULE_ID, 'rememberPinnedWindows')) void WindowControls.unpersistPinned(app);
    WindowControls._syncPinnedTaskbarButton(app);
  }

  // Toggles, sets, or removes pin state on a window. Pass { mode: 'pin' | 'unpin' } to force a direction.
  static applyPinnedMode(app, { mode = 'toggle' } = {}) {
    if (!WindowControls._isTargetSheet(app)) return;
    const el = WindowControls._getElement(app);
    if (!el) return;
    const $el = $(el);
    const header = $el.find(".window-header");
    if (!header?.length) return;

    const hasClass = header.hasClass('minimized-pinned');
    const isPinned = app._pinned === true || hasClass;

    if (mode === 'pin') {
      if (isPinned) {
        // Ensure side-effects are applied even if only the class exists.
        WindowControls._applyPinnedState(app, el, header);
        return;
      }
      WindowControls._applyPinnedState(app, el, header);
      return;
    }

    if (mode === 'unpin') {
      if (!isPinned) return;
      WindowControls._removePinnedState(app, el, header);
      return;
    }

    // toggle
    if (!isPinned) WindowControls._applyPinnedState(app, el, header);
    else WindowControls._removePinnedState(app, el, header);
  }

  // Returns true if WCN should always skip this app entirely (incompatible apps or non-target sheets).
  static _shouldIgnoreApp(app) {
    if (!app) return true;
    if (!WindowControls._isTargetSheet(app)) return true;
    return app.id === 'tokenizer-control' || app.constructor?.name === 'QuestTracker' || app.constructor?.name === 'ee';
  }

  // Adds WCN's header buttons (minimize, default size, maximize, pin) into an AppV1 window's button list.
  static _injectHeaderControlsV1(app, buttons) {
    if (WindowControls._isWcnDisabled()) return;
    if (WindowControls._shouldIgnoreApp(app)) return;

    // Idempotency: skip if WCN buttons are already present (prototype wrap + hook both call this).
    const alreadyInjected = buttons.some(b => b._wcn === true);
    if (alreadyInjected) return;

    const close = buttons.find(b => b.class === 'close');
    if (close) close.label = '';

    const newButtons = [];

    const minimizeSetting    = game.settings.get(WindowControls.MODULE_ID, 'minimizeButton');
    const defaultSizeSetting  = game.settings.get(WindowControls.MODULE_ID, 'defaultSizeButton');
    const maximizeSetting    = game.settings.get(WindowControls.MODULE_ID, 'maximizeButton');
    if (minimizeSetting === 'enabled') {
      newButtons.push({
        label: "",
        class: "minimize",
        icon: "far fa-window-minimize",
        _wcn: true,
        onclick: function () {
          if (WindowControls._isMinimized(this)) this.maximize(true);
          else {
            this.minimize();
            const _bkpMinimize = this.minimize;
            this.minimize = () => {};
            setTimeout(() => { this.minimize = _bkpMinimize; }, 200);
          }
        }.bind(app)
      });
    }
    if (defaultSizeSetting === 'enabled') {
      newButtons.push({
        label: "",
        class: "wc-default-size",
        icon: "fa-solid fa-compress",
        _wcn: true,
        onclick: () => { void WindowControls._restoreDefaultSize(app); }
      });
    }
    if (maximizeSetting === 'enabled') {
      newButtons.push({
        label: "",
        class: "wc-maximize",
        icon: "fa-solid fa-expand",
        _wcn: true,
        onclick: () => { void WindowControls._maximizeToViewport(app); }
      });
    }

    const pinnedSetting = game.settings.get(WindowControls.MODULE_ID, 'pinnedButton');
    if (pinnedSetting === 'enabled') {
      newButtons.push({
        label: "",
        class: "pin",
        icon: "fas fa-map-pin",
        _wcn: true,
        onclick: () => {
          WindowControls.applyPinnedMode(app);
          if (app.appId != null) {
            const linked = Object.values(ui.windows).find(w => w.targetApp?.appId === app.appId);
            if (linked) WindowControls.applyPinnedMode(linked);
          }
        }
      });
    }

    // Move close to the end so it is always the rightmost button (×), with
    // WCN buttons immediately left of it and all system buttons before them.
    const closeIndex = buttons.indexOf(close);
    if (closeIndex !== -1) buttons.splice(closeIndex, 1);

    buttons.push(...newButtons);

    if (close) buttons.push(close);
  }

  // Hides a window to the taskbar: updates its appearance and creates its taskbar button.
  static organizedMinimize(app, settings) {
    if (!WindowControls._isTaskbarMode(settings)) return;
    if (WindowControls._shouldIgnoreApp(app)) return;

    WindowControls._createOrUpdateTaskbarButton(app, { pinned: app._pinned === true });
    WindowControls.setMinimizedStyle(app);
    WindowControls._hideToTaskbar(app);
  }

  // Shows a taskbar-hidden window: updates its appearance and removes or keeps its taskbar button.
  static organizedRestore(app, settings) {
    if (!WindowControls._isTaskbarMode(settings)) return;
    if (WindowControls._shouldIgnoreApp(app)) return;

    WindowControls._showFromTaskbar(app);
    WindowControls.setRestoredStyle(app);
    if (app._pinned !== true) {
      WindowControls._removeTaskbarButton(app);
    } else {
      WindowControls._createOrUpdateTaskbarButton(app, { pinned: app._pinned === true });
    }
  }

  // Cleans up the taskbar button and unhides the window element when a window is closed.
  static organizedClose(app, settings) {
    if (!WindowControls._isTaskbarMode(settings)) return;
    WindowControls._removeTaskbarButton(app);
    WindowControls._showFromTaskbar(app);
  }

  // ── Settings Registration ──────────────────────────────────────────────────────

  // Registers all WCN settings with Foundry's settings system. Called once on init.
  static initSettings() {
    game.settings.register(WindowControls.MODULE_ID, 'wcDisabled', {
      name: game.i18n.localize("WindowControls.WcDisabledName"),
      hint: game.i18n.localize("WindowControls.WcDisabledHint"),
      scope: 'client',
      config: true,
      type: Boolean,
      default: false,
      onChange: WindowControls.debouncedReload
    });
    game.settings.register(WindowControls.MODULE_ID, 'organizedMinimize', {
      name: game.i18n.localize("WindowControls.OrganizedMinimizeName"),
      hint: game.i18n.localize("WindowControls.OrganizedMinimizeHint"),
      scope: 'client',
      config: true,
      type: String,
      choices: {
        "persistentTop": game.i18n.localize("WindowControls.OrganizedPersistentTop"),
        "persistentBottom": game.i18n.localize("WindowControls.OrganizedPersistentBottom"),
        "disabled": game.i18n.localize("WindowControls.Disabled")
      },
      default: "persistentTop",
      onChange: WindowControls.debouncedReload
    });
    // To add or change dropdown sizes, update these labels and _setButtonSize below.
    // Values map to a fixed px size so existing user selections remain stable.
    game.settings.register(WindowControls.MODULE_ID, 'buttonSize', {
      name: game.i18n.localize('WindowControls.ButtonSizeName'),
      hint: game.i18n.localize('WindowControls.ButtonSizeHint'),
      scope: 'client',
      config: true,
      type: String,
      choices: {
        small: game.i18n.localize('WindowControls.ButtonSizeSmall'),
        medium: game.i18n.localize('WindowControls.ButtonSizeMedium'),
        large: game.i18n.localize('WindowControls.ButtonSizeLarge')
      },
      default: 'large',
      onChange: () => {
        WindowControls._applyButtonSizeFromSetting();
      }
    });
    game.settings.register(WindowControls.MODULE_ID, 'minimizeButton', {
      name: game.i18n.localize("WindowControls.MinimizeButtonName"),
      hint: game.i18n.localize("WindowControls.MinimizeButtonHint"),
      scope: 'client',
      config: true,
      type: String,
      choices: {
        "enabled": game.i18n.localize("WindowControls.Enabled"),
        "disabled": game.i18n.localize("WindowControls.Disabled")
      },
      default: "enabled",
      onChange: WindowControls.debouncedReload
    });
    game.settings.register(WindowControls.MODULE_ID, 'defaultSizeButton', {
      name: game.i18n.localize("WindowControls.DefaultSizeButtonName"),
      hint: game.i18n.localize("WindowControls.DefaultSizeButtonHint"),
      scope: 'client',
      config: true,
      type: String,
      choices: {
        "enabled": game.i18n.localize("WindowControls.Enabled"),
        "disabled": game.i18n.localize("WindowControls.Disabled")
      },
      default: "enabled",
      onChange: WindowControls.debouncedReload
    });
    game.settings.register(WindowControls.MODULE_ID, 'maximizeButton', {
      name: game.i18n.localize("WindowControls.MaximizeButtonName"),
      hint: game.i18n.localize("WindowControls.MaximizeButtonHint"),
      scope: 'client',
      config: true,
      type: String,
      choices: {
        "enabled": game.i18n.localize("WindowControls.Enabled"),
        "disabled": game.i18n.localize("WindowControls.Disabled")
      },
      default: "enabled",
      onChange: WindowControls.debouncedReload
    });
    game.settings.register(WindowControls.MODULE_ID, 'pinnedButton', {
      name: game.i18n.localize("WindowControls.PinnedButtonName"),
      hint: game.i18n.localize("WindowControls.PinnedButtonHint"),
      scope: 'client',
      config: true,
      type: String,
      choices: {
        "enabled": game.i18n.localize("WindowControls.Enabled"),
        "disabled": game.i18n.localize("WindowControls.Disabled")
      },
      default: "enabled",
      onChange: WindowControls.debouncedReload
    });
    game.settings.register(WindowControls.MODULE_ID, 'clickOutsideMinimize', {
      name: game.i18n.localize("WindowControls.ClickOutsideMinimizeName"),
      hint: game.i18n.localize("WindowControls.ClickOutsideMinimizeHint"),
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
      onChange: WindowControls.debouncedReload
    });
    game.settings.register(WindowControls.MODULE_ID, 'pinnedDoubleTapping', {
      name: game.i18n.localize("WindowControls.PinnedDoubleTappingName"),
      hint: game.i18n.localize("WindowControls.PinnedDoubleTappingHint"),
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });
    game.settings.register(WindowControls.MODULE_ID, 'rememberPinnedWindows', {
      name: game.i18n.localize("WindowControls.RememberPinnedName"),
      hint: game.i18n.localize("WindowControls.RememberPinnedHint"),
      scope: 'client',
      config: true,
      type: Boolean,
      default: false,
      onChange: () => {
        game.user.unsetFlag(WindowControls._PINNED_FLAG_SCOPE, WindowControls._PINNED_FLAG_KEY);
        WindowControls._rememberedPinnedIds = new Set();
      }
    });

    game.settings.register(WindowControls.MODULE_ID, 'pinnedHeaderColor', {
      name: game.i18n.localize("WindowControls.PinnedHeaderColorName"),
      hint: game.i18n.localize("WindowControls.PinnedHeaderColorHint"),
      scope: 'client',
      config: false,
      type: String,
      default: "#ff8800",
      onChange: (newValue) => {
        WindowControls._setPinnedHeaderColor(newValue);
      }
    });
    game.settings.register(WindowControls.MODULE_ID, 'taskbarColor', {
      name: game.i18n.localize("WindowControls.TaskbarColorName"),
      hint: game.i18n.localize("WindowControls.TaskbarColorHint"),
      scope: 'client',
      config: false,
      type: String,
      default: "#0000",
      onChange: (newValue) => {
        WindowControls._setTaskbarColor(newValue);
      }
    });

    game.settings.register(WindowControls.MODULE_ID, 'taskbarScrollbarColor', {
      name: game.i18n.localize("WindowControls.TaskbarScrollbarColorName"),
      hint: game.i18n.localize("WindowControls.TaskbarScrollbarColorHint"),
      scope: 'client',
      config: false,
      type: String,
      default: "",
      onChange: (newValue) => {
        WindowControls._setTaskbarScrollbarColor(newValue);
      }
    });

    game.settings.register(WindowControls.MODULE_ID, 'taskbarPattern', {
      scope: 'client', config: false, type: String, default: 'diagonal',
      onChange: () => WindowControls._applyTaskbarPatternFromSettings()
    });
    game.settings.register(WindowControls.MODULE_ID, 'taskbarPatternColor', {
      scope: 'client', config: false, type: String, default: '#000000',
      onChange: () => WindowControls._applyTaskbarPatternFromSettings()
    });
    game.settings.register(WindowControls.MODULE_ID, 'taskbarPatternOpacity', {
      scope: 'client', config: false, type: Number, default: 80,
      onChange: () => WindowControls._applyTaskbarPatternFromSettings()
    });
    game.settings.register(WindowControls.MODULE_ID, 'taskbarPatternSize', {
      scope: 'client', config: false, type: Number, default: 4,
      onChange: () => WindowControls._applyTaskbarPatternFromSettings()
    });
    game.settings.register(WindowControls.MODULE_ID, 'taskbarPatternCustomSvgPath', {
      scope: 'client', config: false, type: String, default: '',
      onChange: () => WindowControls._applyTaskbarPatternFromSettings()
    });

    game.settings.register(WindowControls.MODULE_ID, 'taskbarWidth', {
      name: game.i18n.localize("WindowControls.TaskbarWidthName"),
      hint: game.i18n.localize("WindowControls.TaskbarWidthHint"),
      scope: 'client',
      config: true,
      type: String,
      choices: {
        "fullWidth": game.i18n.localize("WindowControls.TaskbarWidthFull"),
        "canvasOnly": game.i18n.localize("WindowControls.TaskbarWidthCanvas"),
      },
      default: "fullWidth",
      requiresReload: true,
      onChange: () => {
        WindowControls._applyTaskbarWidthFromSetting();
      }
    });
    game.settings.register(WindowControls.MODULE_ID, 'taskbarButtonHeight', {
      name: game.i18n.localize('WindowControls.TaskbarButtonHeightName'),
      hint: game.i18n.localize('WindowControls.TaskbarButtonHeightHint'),
      scope: 'client',
      config: true,
      type: String,
      choices: {
        '22': '22px',
        '23': '23px',
        '24': '24px',
        '25': '25px',
        '26': '26px',
        '27': '27px',
        '28': '28px'
      },
      default: '28',
      onChange: () => {
        WindowControls._applyTaskbarButtonHeightFromSetting();
      }
    });

    game.settings.register(WindowControls.MODULE_ID, 'maximizeWidth', {
      name: game.i18n.localize('WindowControls.MaximizeWidthName'),
      hint: game.i18n.localize('WindowControls.MaximizeWidthHint'),
      scope: 'client',
      config: true,
      type: Number,
      range: { min: 10, max: 100, step: 5 },
      default: 60
    });

    game.settings.register(WindowControls.MODULE_ID, 'maximizeHeight', {
      name: game.i18n.localize('WindowControls.MaximizeHeightName'),
      hint: game.i18n.localize('WindowControls.MaximizeHeightHint'),
      scope: 'client',
      config: true,
      type: Number,
      range: { min: 10, max: 100, step: 5 },
      default: 80
    });

    game.settings.register(WindowControls.MODULE_ID, 'debugLogging', {
      name: game.i18n.localize('WindowControls.DebugLoggingName'),
      hint: game.i18n.localize('WindowControls.DebugLoggingHint'),
      scope: 'client',
      config: true,
      type: Boolean,
      default: false,
      onChange: (enabled) => {
        // Always print a visible confirmation so users know the toggle is working.
        if (enabled === true) {
          console.log('Window Controls Next | Debug logging enabled.');
          try { ui?.notifications?.info?.('Window Controls Next: Debug logging enabled'); } catch { /* ignore */ }
        } else {
          console.log('Window Controls Next | Debug logging disabled.');
          try { ui?.notifications?.info?.('Window Controls Next: Debug logging disabled'); } catch { /* ignore */ }
        }
      }
    });

    game.settings.register(WindowControls.MODULE_ID, 'debugVerbose', {
      name: game.i18n.localize('WindowControls.DebugVerboseName'),
      hint: game.i18n.localize('WindowControls.DebugVerboseHint'),
      scope: 'client',
      config: true,
      type: Boolean,
      default: false
    });

    // Theme system settings.
    game.settings.register(WindowControls.MODULE_ID, 'wcThemeEnabled', {
      name: game.i18n.localize('WindowControls.ThemeEnabledName'),
      hint: game.i18n.localize('WindowControls.ThemeEnabledHint'),
      scope: 'client',
      config: true,
      type: Boolean,
      default: true,
      onChange: () => {
        WindowControls._applyThemeFromSetting();
      }
    });
    game.settings.register(WindowControls.MODULE_ID, 'wcThemeMode', {
      scope: 'world',
      config: false,
      type: String,
      default: 'gm'
    });
    game.settings.register(WindowControls.MODULE_ID, 'wcWorldTheme', {
      scope: 'world',
      config: false,
      type: String,
      default: 'theme2'
    });
    game.settings.register(WindowControls.MODULE_ID, 'activeTheme', {
      scope: 'client',
      config: false,
      type: String,
      default: 'theme2'
    });
    game.settings.register(WindowControls.MODULE_ID, 'wcCustomThemes', {
      scope: 'client',
      config: false,
      type: Object,
      default: {}
    });

    // Per-world learned sheet default sizes: keyed by constructor name, captured on first render.
    // Hidden from the standard settings UI; populated automatically by _maybeCaptureFirstRenderSize.
    game.settings.register(WindowControls.MODULE_ID, 'learnedSheetDefaults', {
      scope: 'world',
      config: false,
      type: Object,
      default: {}
    });

  }

  // ── Hooks & Initialization ─────────────────────────────────────────────────────

  // Sets up all Foundry hooks and prototype method patches that drive WCN's behaviour.
  // This is the central wiring point for the module's features.
  static initHooks() {

    // Patch Application.prototype._getHeaderButtons at the prototype level so WCN
    // buttons survive sheet systems (e.g. Twilight 2000) that rebuild their header
    // DOM after the getApplicationV1HeaderButtons hook fires.  Using a direct
    // prototype wrap (equivalent to libWrapper WRAPPER mode) ensures the injection
    // runs on every render regardless of third-party render order.
    const _ghbWrapper = function (wrapped, ...args) {
      const buttons = wrapped(...args);
      WindowControls._injectHeaderControlsV1(this, buttons);
      return buttons;
    };
    if (typeof globalThis.libWrapper !== 'undefined' && !globalThis.libWrapper.is_fallback) {
      libWrapper.register(WindowControls.MODULE_ID, 'Application.prototype._getHeaderButtons', _ghbWrapper, 'WRAPPER');
    } else {
      WindowControls._wrapMethod({
        target: Application.prototype,
        method: '_getHeaderButtons',
        name: 'Application.prototype',
        wrapper: _ghbWrapper
      });
    }

    // Keep the hook as a secondary safety net for any AppV1 that doesn't go
    // through Application.prototype._getHeaderButtons (e.g. heavily overriding
    // subclasses).  _injectHeaderControlsV1 is idempotent so double-injection
    // is not a problem — it checks for existing buttons by class name.
    Hooks.on('getApplicationV1HeaderButtons', (app, buttons) => {
      WindowControls._injectHeaderControlsV1(app, buttons);
    });

    Hooks.on('renderApplicationV2', (app, element) => {
      if (WindowControls._isWcnDisabled()) return;
      WindowControls._ensureInlineControlsV2(app, element);
      WindowControls._maybeCaptureFirstRenderSize(app);

      // Enforce single open instance per persisted Document UUID.
      void WindowControls._enforceSingleInstanceByPersistentId(app);

      // Safety: don't permanently hide windows across refresh unless we know why.
      // NOTE: also skip un-hiding if this app is already tracked in the taskbar (e.g. journal
      // page re-renders replace the element, losing the wcTaskbarHidden dataset marker).
      const key = WindowControls._getAppKey(app);
      const isTaskbarTracked = key && WindowControls._taskbarEntries.has(String(key));
      if (element?.style?.display === 'none' && element?.dataset?.wcTaskbarHidden !== '1' && !isTaskbarTracked) {
        element.style.display = '';
      }

      // If this app is taskbar-tracked and hidden, re-apply the hidden marker to the new element
      // (AppV2 re-renders replace the DOM element, losing the dataset marker).
      if (isTaskbarTracked && app._minimized) {
        WindowControls._hideToTaskbar(app);
        // Re-apply after AppV2 finishes its own post-render steps (element replacement loses the marker).
        setTimeout(() => { if (app._minimized) WindowControls._hideToTaskbar(app); }, 0);
        return;
      }

      // Auto-apply remembered pin (for windows opened later).
      if (WindowControls._isRememberedPinned(app)) {
        WindowControls.applyPinnedMode(app, { mode: 'pin' });
      }
    });

    Hooks.on('renderApplicationV1', (app, html) => {
      if (WindowControls._isWcnDisabled()) return;
      const el = html?.[0];
      if (!(el instanceof HTMLElement)) return;
      WindowControls._maybeCaptureFirstRenderSize(app);

      // One-time notification: remind users that AppV1 sheets are deprecated in
      // Foundry v13 and WCN header controls may not appear until the system/module
      // providing this sheet is updated to ApplicationV2.
      if (!WindowControls._shownAppV1Warning) {
        WindowControls._shownAppV1Warning = true;
        const name = app?.constructor?.name ?? 'Unknown';
        ui?.notifications?.warn?.(
          `Window Controls Next: The sheet "${name}" uses the legacy Application (v1) API which is deprecated in Foundry v13. ` +
          `WCN header buttons may not appear on AppV1 sheets until the system or module that provides them is updated to ApplicationV2. ` +
          `This warning can be safely ignored.`,
          { permanent: false }
        );
      }

      // Enforce single open instance per persisted Document UUID.
      void WindowControls._enforceSingleInstanceByPersistentId(app);

      const key = WindowControls._getAppKey(app);
      if (el.style.display === 'none' && el?.dataset?.wcTaskbarHidden !== '1' && (!key || !WindowControls._taskbarEntries.has(String(key)))) {
        el.style.display = '';
      }

      if (WindowControls._isRememberedPinned(app)) {
        WindowControls.applyPinnedMode(app, { mode: 'pin' });
      }

      if (app._wcRestoringFromPersist) {
        delete app._wcRestoringFromPersist;
        const taskbarSetting = WindowControls._getTaskbarSetting();
        if (WindowControls._isTaskbarMode(taskbarSetting)) {
          WindowControls.organizedMinimize(app, taskbarSetting);
          setTimeout(() => { if (app._minimized) WindowControls._hideToTaskbar(app); }, 0);
        }
      }
    });

    Hooks.on('renderSettingsConfig', (app, html) => {
      try {
        WindowControls._organizeSettingsConfig(html);
      } catch (e) {
        console.warn('Window Controls: Failed to organize settings UI.', e);
      }
    });

    Hooks.once('ready', async function () {

      // Apply saved taskbar color on startup (settings onChange does not run on load).
      WindowControls._applyTaskbarColorFromSetting();
      WindowControls._applyTaskbarScrollbarColorFromSetting();
      WindowControls._applyPinnedHeaderColorFromSetting();
      WindowControls._applyButtonSizeFromSetting();
      WindowControls._applyTaskbarWidthFromSetting();
      WindowControls._applyTaskbarButtonHeightFromSetting();

      // Load preset theme definitions then apply the active theme.
      await WindowControls._loadThemesFromCSS();
      WindowControls._applyThemeFromSetting();

      // Detect real libWrapper (not a shim/polyfill bundled by another module).
      // When present, route all prototype wraps through it so libWrapper can manage
      // dispatch order and prevent re-entrancy conflicts with modules like
      // Mobile Improvements that also wrap these methods via libWrapper.
      const hasLibWrapper = typeof globalThis.libWrapper !== 'undefined' && !globalThis.libWrapper.is_fallback;
      if (hasLibWrapper) {
        WindowControls._logAlways('libWrapper detected — prototype wraps will use libWrapper for conflict-free dispatch.');
      }

      const wrapAppV1 = (method, fn, type = 'MIXED') => {
        if (hasLibWrapper) {
          return libWrapper.register(WindowControls.MODULE_ID, `Application.prototype.${method}`, fn, type);
        }
        return WindowControls._wrapMethod({
          target: Application.prototype,
          method,
          wrapper: fn,
          name: 'Application.prototype'
        });
      };

      const wrapAppV2 = (method, fn, type = 'MIXED') => {
        const proto = foundry?.applications?.api?.ApplicationV2?.prototype;
        if (!proto) return;
        if (hasLibWrapper) {
          return libWrapper.register(WindowControls.MODULE_ID, `foundry.applications.api.ApplicationV2.prototype.${method}`, fn, type);
        }
        return WindowControls._wrapMethod({
          target: proto,
          method,
          wrapper: fn,
          name: 'ApplicationV2.prototype'
        });
      };

      // Debugging: default mode logs only when a dragged window hits/clears the taskbar barrier.
      // Very noisy internal method tracing is behind the separate Verbose Debug Logs toggle.
      WindowControls._installTaskbarBarrierWatcher();
      // Safety: prevent releasing windows behind the taskbar (independent of drag hook detection).
      WindowControls._installTaskbarBarrierEnforcer();

      const shouldVerboseDebugApp = (app) => {
        if (!WindowControls._isVerboseDebugLoggingEnabled()) return false;
        if (WindowControls._shouldIgnoreApp(app)) return false;
        return WindowControls._isTargetSheet(app);
      };

      const verboseWrap = (wrapFn, method, type = 'WRAPPER') => {
        wrapFn(method, function (wrapped, ...args) {
          if (shouldVerboseDebugApp(this)) {
            const first = args?.[0];
            const pos = (first && typeof first === 'object') ? first : undefined;
            WindowControls._debugVerbose(method, WindowControls._debugDescribeApp(this), pos ?? first ?? null);
          }
          return wrapped(...args);
        }, type);
      };

      // Positioning hooks (verbose only). Always-call-wrapped = WRAPPER type.
      verboseWrap(wrapAppV1, 'setPosition', 'WRAPPER');
      verboseWrap(wrapAppV2, 'setPosition', 'WRAPPER');

      if (WindowControls._isDebugLoggingEnabled()) {
        WindowControls._debug('Debug logging active (barrier contact mode).', {
          verbose: WindowControls._isVerboseDebugLoggingEnabled(),
          viewport: { w: window.innerWidth, h: window.innerHeight },
          taskbar: {
            el: !!document.getElementById('window-controls-persistent'),
            computedHeight: document.getElementById('window-controls-persistent')?.getBoundingClientRect?.().height ?? null,
          }
        });
      }

      // Migrate legacy Organized Minimize values to taskbar modes.
      const current = game.settings.get(WindowControls.MODULE_ID, 'organizedMinimize');
      const migrated = WindowControls._getTaskbarSetting();
      if (current !== migrated) {
        await game.settings.set(WindowControls.MODULE_ID, 'organizedMinimize', migrated);
        return;
      }

      const settingOrganized = migrated;

      if (WindowControls._isTaskbarMode(settingOrganized)) {
        wrapAppV1('minimize', function (wrapped, ...args) {
          if (WindowControls._isWcnDisabled()) return wrapped(...args);
          if (WindowControls._shouldIgnoreApp(this)) return wrapped(...args);
          WindowControls.organizedMinimize(this, settingOrganized);
          return Promise.resolve();
        }, 'MIXED');

        wrapAppV1('maximize', function (wrapped, ...args) {
          if (WindowControls._isWcnDisabled()) return wrapped(...args);
          if (WindowControls._shouldIgnoreApp(this)) return wrapped(...args);
          WindowControls.organizedRestore(this, settingOrganized);
          return Promise.resolve();
        }, 'MIXED');

        wrapAppV1('close', function (wrapped, ...args) {
          if (WindowControls._isWcnDisabled()) return wrapped(...args);
          WindowControls.organizedClose(this, settingOrganized);
          return wrapped(...args).then(() => {
            WindowControls._removeTaskbarButton(this);
          });
        }, 'WRAPPER');
      }

      // AppV2 windows require wrapping their lifecycle methods separately.
      if (WindowControls._isTaskbarMode(settingOrganized)) {
        wrapAppV2('minimize', async function (wrapped, ...args) {
          if (WindowControls._isWcnDisabled()) return await wrapped(...args);
          if (WindowControls._shouldIgnoreApp(this)) return await wrapped(...args);
          WindowControls.organizedMinimize(this, settingOrganized);
          return;
        }, 'MIXED');

        wrapAppV2('maximize', async function (wrapped, ...args) {
          if (WindowControls._isWcnDisabled()) return await wrapped(...args);
          if (WindowControls._shouldIgnoreApp(this)) return await wrapped(...args);
          WindowControls.organizedRestore(this, settingOrganized);
          return this;
        }, 'MIXED');

        wrapAppV2('close', async function (wrapped, ...args) {
          if (WindowControls._isWcnDisabled()) { await wrapped(...args); return; }
          WindowControls.organizedClose(this, settingOrganized);
          await wrapped(...args);
          WindowControls._removeTaskbarButton(this);
        }, 'WRAPPER');
      }

      if (game.settings.get(WindowControls.MODULE_ID, 'rememberPinnedWindows')) {
        await WindowControls._restoreRememberedPinnedWindows();
      }

      // No-op: old persistent dummy windows are no longer used.

      if (game.settings.get(WindowControls.MODULE_ID, 'clickOutsideMinimize')) {
        $("#board").click(() => {
          if (canvas.tokens.controlled.length)
            return;
          WindowControls.minimizeAll();
        });
      }

      // Log any per-world learned sheet default sizes that have been captured so far.
      try {
        const learned = game.settings.get(WindowControls.MODULE_ID, 'learnedSheetDefaults') ?? {};
        const entries = Object.entries(learned);
        if (entries.length) {
          WindowControls._logAlways(
            `Learned sheet defaults for this world (${entries.length}):`,
            Object.fromEntries(entries.map(([k, v]) => [k, `${v.width}×${v.height}`]))
          );
        } else {
          WindowControls._logAlways('No learned sheet defaults recorded for this world yet.');
        }
      } catch { /* ignore */ }

      // Signal to third-party modules that WCN is fully initialised and
      // WindowControls.registerApp() is ready to accept registrations.
      Hooks.callAll('window-controls-next.ready');

      // Sweep: catch any windows that rendered during a third-party module's ready
      // callback that ran before ours — _registeredAppClasses was empty at render time.
      const liveApps = [
        ...Object.values(ui.windows ?? {}),
        ...Array.from(foundry?.applications?.instances?.values?.() ?? []),
      ];
      for (const app of liveApps) {
        if (!WindowControls._isTargetSheet(app)) continue;
        WindowControls._ensureInlineControlsV2(app);
        if (WindowControls._isRememberedPinned(app)) WindowControls.applyPinnedMode(app, { mode: 'pin' });
      }

    });

    Hooks.on('closeSidebarTab', function (app) {
      WindowControls._removeTaskbarButton(app);
      WindowControls._showFromTaskbar(app);
    });

    // Keep --wc-sidebar-width in sync when the sidebar collapses or expands.
    Hooks.on('collapseSidebar', () => { WindowControls._updateSidebarWidthVariable(); });
    Hooks.on('expandSidebar',   () => { WindowControls._updateSidebarWidthVariable(); });

    // Update taskbar scroll fades when the window is resized (taskbar width changes).
    window.addEventListener('resize', () => {
      WindowControls._updateTaskbarFadeClasses();
    }, { passive: true });

    Hooks.on('closeApplication', function (app) {
      WindowControls._removeTaskbarButton(app);
      WindowControls._showFromTaskbar(app);
    });

    Hooks.on('closeItemSheet', function (app) {
      WindowControls._removeTaskbarButton(app);
      WindowControls._showFromTaskbar(app);
    });

    Hooks.on('closeActorSheet', function (app) {
      WindowControls._removeTaskbarButton(app);
      WindowControls._showFromTaskbar(app);
    });

  }

  // ── Visual Appearance ───────────────────────────────────────────────────────────
  // CSS variable setters for taskbar and pinned-header colors, sidebar width, and taskbar width.

  // Sets the taskbar background color CSS variable to the given hex color.
  static _setTaskbarColor(value) {
    if (typeof value !== 'string') return;
    const rootStyle = document.documentElement?.style;
    if (rootStyle) rootStyle.setProperty('--taskbarcolor', value);

    // Do not set an inline background-color here. The taskbar background is rendered
    // via CSS (including alpha) and the bar itself is click-through.
    // Clear any previously set inline value from older versions.
    const bar = document.getElementById('window-controls-persistent');
    if (bar) bar.style.removeProperty('background-color');
  }

  // Sets the header control button size variable.
  // To add more dropdown options, keep this map synchronized with the buttonSize choices.
  static _setButtonSize(sizeKey) {
    const pxByKey = {
      small: 18,
      medium: 20,
      large: 24,
    };
    const px = pxByKey[sizeKey] ?? pxByKey.large;
    const rootStyle = document.documentElement?.style;
    if (rootStyle) rootStyle.setProperty('--wc-control-btn-size', `${px}px`);
  }

  // Reads the buttonSize setting and applies the CSS variable (called once at startup).
  static _applyButtonSizeFromSetting() {
    try {
      const key = game?.settings?.get(WindowControls.MODULE_ID, 'buttonSize') ?? 'large';
      WindowControls._setButtonSize(key);
    } catch (e) {
      // Ignore (e.g. before game/settings available).
    }
  }

  // Sets the taskbar button height CSS variable.
  static _setTaskbarButtonHeight(heightValue) {
    const px = Number.parseInt(heightValue, 10);
    const clampedPx = Number.isFinite(px) ? Math.min(28, Math.max(22, px)) : 28;
    const rootStyle = document.documentElement?.style;
    if (rootStyle) rootStyle.setProperty('--wc-taskbar-btn-height', `${clampedPx}px`);
  }

  // Reads the taskbarButtonHeight setting and applies the CSS variable (called once at startup).
  static _applyTaskbarButtonHeightFromSetting() {
    try {
      const value = game?.settings?.get(WindowControls.MODULE_ID, 'taskbarButtonHeight') ?? '28';
      WindowControls._setTaskbarButtonHeight(value);
    } catch (e) {
      // Ignore (e.g. before game/settings available).
    }
  }

  // Sets the taskbar scrollbar thumb color CSS variable.
  static _setTaskbarScrollbarColor(value) {
    if (typeof value !== 'string') return;
    const v = value.trim();

    const rootStyle = document.documentElement?.style;
    const bar = document.getElementById('window-controls-persistent');

    if (!v) {
      if (rootStyle) rootStyle.removeProperty('--wc-taskbar-scrollbar-color');
      if (bar) bar.style.removeProperty('--wc-taskbar-scrollbar-color');
      return;
    }

    if (rootStyle) rootStyle.setProperty('--wc-taskbar-scrollbar-color', v);
    if (bar) bar.style.setProperty('--wc-taskbar-scrollbar-color', v);
  }

  // Parses a hex color string (#RGB, #RGBA, #RRGGBB, or #RRGGBBAA) into {r, g, b} components (0–255).
  static _parseHexColor(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    if (!v.startsWith('#')) return null;

    const hex = v.slice(1);
    const isHex = /^[0-9a-fA-F]+$/.test(hex);
    if (!isHex) return null;

    // #RGB / #RGBA
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b };
    }

    // #RRGGBB / #RRGGBBAA
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return { r, g, b };
    }

    return null;
  }

  // Derives and applies the header-highlight and pinned-button colors from the chosen pin color.
  static _setPinnedHeaderColor(value) {
    // User chooses base color; pinned header is always 25% alpha.
    // Taskbar pinned buttons are 20% darker and fully opaque.
    const rgb = WindowControls._parseHexColor(value) ?? { r: 255, g: 136, b: 0 };
    const headerBg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`;
    const dark = {
      r: Math.max(0, Math.min(255, Math.round(rgb.r * 0.8))),
      g: Math.max(0, Math.min(255, Math.round(rgb.g * 0.8))),
      b: Math.max(0, Math.min(255, Math.round(rgb.b * 0.8))),
    };
    const btnBg = `rgb(${dark.r}, ${dark.g}, ${dark.b})`;

    const rootStyle = document.documentElement?.style;
    if (rootStyle) {
      rootStyle.setProperty('--wc-pinned-header-bg', headerBg);
      rootStyle.setProperty('--wc-pinned-taskbar-btn-bg', btnBg);
    }
  }

  // Reads the pinnedHeaderColor setting and applies it (called once at startup).
  static _applyPinnedHeaderColorFromSetting() {
    try {
      // Skip if the theme system is managing this variable.
      const themeEnabled = game?.settings?.get(WindowControls.MODULE_ID, 'wcThemeEnabled');
      if (themeEnabled) return;
      const value = game?.settings?.get(WindowControls.MODULE_ID, 'pinnedHeaderColor');
      if (typeof value === 'string') WindowControls._setPinnedHeaderColor(value);
    } catch (e) {
      // Ignore (e.g. before game/settings available).
    }
  }

  // Reads the taskbarColor setting and applies it (called once at startup).
  static _applyTaskbarColorFromSetting() {
    try {
      const value = game?.settings?.get(WindowControls.MODULE_ID, 'taskbarColor');
      if (typeof value === 'string') WindowControls._setTaskbarColor(value);
    } catch (e) {
      // Ignore (e.g. before game/settings available).
    }
  }

  // Reads the taskbarScrollbarColor setting and applies it (called once at startup).
  static _applyTaskbarScrollbarColorFromSetting() {
    try {
      const value = game?.settings?.get(WindowControls.MODULE_ID, 'taskbarScrollbarColor');
      if (typeof value === 'string') WindowControls._setTaskbarScrollbarColor(value);
    } catch (e) {
      // Ignore (e.g. before game/settings available).
    }
  }

  // ── Taskbar Pattern System ─────────────────────────────────────────────────────

  // All available background patterns.  Key is the stored setting value.
  static get TASKBAR_PATTERNS() {
    return WCN_PATTERNS.list;
  }

  static _isCustomSvgPatternKey(key) {
    return String(key ?? '').trim() === 'custom-svg';
  }

  static _isLikelySvgPath(path) {
    const p = String(path ?? '').trim();
    if (!p) return false;
    // Accept .svg with optional query/hash suffixes.
    return /\.svg(?:$|[?#])/i.test(p);
  }

  static _classifyStrictBWColorToken(token) {
    const raw = String(token ?? '').trim();
    if (!raw) return { kind: 'ignore', token: raw };
    const compact = raw.toLowerCase().replace(/\s+/g, '');

    if (
      compact === 'none' ||
      compact === 'transparent' ||
      compact === 'inherit' ||
      compact === 'currentcolor' ||
      compact === 'unset' ||
      compact === 'initial' ||
      compact.startsWith('url(') ||
      compact.startsWith('var(')
    ) {
      return { kind: 'ignore', token: raw };
    }

    if (compact === 'white' || compact === '#fff' || compact === '#ffffff' || compact === 'rgb(255,255,255)' || compact === 'rgba(255,255,255,1)' || compact === 'rgba(255,255,255,1.0)') {
      return { kind: 'white', token: raw };
    }
    if (compact === 'black' || compact === '#000' || compact === '#000000' || compact === 'rgb(0,0,0)' || compact === 'rgba(0,0,0,1)' || compact === 'rgba(0,0,0,1.0)') {
      return { kind: 'black', token: raw };
    }

    // Any explicit color token that is not strict black/white remains unchanged.
    if (/^#[0-9a-f]{3,8}$/i.test(compact) || /^rgba?\(/i.test(compact) || /^[a-z-]+$/i.test(compact)) {
      return { kind: 'other-color', token: raw };
    }

    return { kind: 'ignore', token: raw };
  }

  static _mapStrictBWColorToken(token, primaryHex, secondaryHex) {
    const classified = WindowControls._classifyStrictBWColorToken(token);
    if (classified.kind === 'white') return { value: primaryHex, hadOtherColor: false };
    if (classified.kind === 'black') return { value: secondaryHex, hadOtherColor: false };
    if (classified.kind === 'other-color') return { value: token, hadOtherColor: true };
    return { value: token, hadOtherColor: false };
  }

  static _recolorSvgStrictBW(svgText, primaryHex, secondaryHex) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(svgText, 'image/svg+xml');
    if (xml.querySelector('parsererror')) {
      throw new Error('Invalid SVG data.');
    }

    let hadOtherColors = false;
    const colorAttrs = ['fill', 'stroke', 'stop-color', 'color'];

    xml.querySelectorAll('*').forEach((el) => {
      for (const attr of colorAttrs) {
        if (!el.hasAttribute(attr)) continue;
        const original = el.getAttribute(attr) ?? '';
        const mapped = WindowControls._mapStrictBWColorToken(original, primaryHex, secondaryHex);
        if (mapped.hadOtherColor) hadOtherColors = true;
        el.setAttribute(attr, String(mapped.value ?? original));
      }

      if (!el.hasAttribute('style')) return;
      const styleRaw = el.getAttribute('style') ?? '';
      const styleParts = styleRaw.split(';');
      const rewritten = styleParts.map((part) => {
        const idx = part.indexOf(':');
        if (idx < 0) return part;
        const prop = part.slice(0, idx).trim().toLowerCase();
        const value = part.slice(idx + 1).trim();
        if (!['fill', 'stroke', 'stop-color', 'color'].includes(prop)) return part;
        const mapped = WindowControls._mapStrictBWColorToken(value, primaryHex, secondaryHex);
        if (mapped.hadOtherColor) hadOtherColors = true;
        return `${prop}: ${mapped.value}`;
      }).join(';');
      el.setAttribute('style', rewritten);
    });

    const serializer = new XMLSerializer();
    const svgRoot = xml.documentElement;
    if (!svgRoot || svgRoot.nodeName.toLowerCase() !== 'svg') {
      throw new Error('Selected file is not a valid SVG document.');
    }

    return {
      svgText: serializer.serializeToString(svgRoot),
      hadOtherColors,
    };
  }

  static async _loadSvgTextFromPath(svgPath) {
    const path = String(svgPath ?? '').trim();
    if (!WindowControls._isLikelySvgPath(path)) {
      throw new Error('Please select an .svg file.');
    }
    if (WindowControls._customSvgSourceCache.has(path)) {
      return WindowControls._customSvgSourceCache.get(path);
    }
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Unable to load SVG (${response.status}).`);
    }
    const text = await response.text();
    if (!/<svg[\s>]/i.test(text)) {
      throw new Error('The selected file does not contain SVG markup.');
    }
    WindowControls._customSvgSourceCache.set(path, text);
    return text;
  }

  static async _buildCustomSvgPatternCSS(svgPath, primaryHex, secondaryHex, sizePx, { notify = false } = {}) {
    const rawSvg = await WindowControls._loadSvgTextFromPath(svgPath);
    const recolored = WindowControls._recolorSvgStrictBW(rawSvg, primaryHex, secondaryHex);
    const tile = Math.max(2, Math.min(128, parseInt(sizePx, 10) || 8));
    if (notify && recolored.hadOtherColors) {
      const noticeKey = `${svgPath}|other-colors`;
      if (!WindowControls._customSvgNoticeCache.has(noticeKey)) {
        WindowControls._customSvgNoticeCache.add(noticeKey);
        ui?.notifications?.info?.('Window Controls: Non-black/white SVG colors were left unchanged. Only white and black are remapped.');
      }
    }
    return {
      image: `url("data:image/svg+xml,${encodeURIComponent(recolored.svgText)}")`,
      size: `${tile}px ${tile}px`,
    };
  }

  // Delegates to the WCN_PATTERNS global defined in taskbarPatterns.js.
  // hexColor: Secondary color '#rrggbb' (pattern lines), sizePx: tile size in pixels.
  // bgHexColor: Primary color '#rrggbb' (scale body fill — used by seigaiha).
  // Opacity is NOT baked into the color — it is applied as element opacity by _setTaskbarPattern.
  static _taskbarPatternCSS(key, hexColor, sizePx, bgHexColor) {
    return WCN_PATTERNS.getCSS(key, hexColor, sizePx, bgHexColor);
  }

  // Injects a <style> element to apply the chosen pattern to the real taskbar ::before.
  // opacityPct (0–100) is applied as element-level opacity so both back and front colors
  // remain solid (no alpha blending between them).
  static async _setTaskbarPattern(key, hexColor, opacityPct, sizePx, bgHexColor, { svgPath = '', notify = false, nonce = null } = {}) {
    let css = null;
    let styleEl = document.getElementById('wc-taskbar-pattern-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'wc-taskbar-pattern-style';
      document.head.appendChild(styleEl);
    }
    const opVal = Math.max(0, Math.min(1, (opacityPct ?? 80) / 100)).toFixed(2);
    const clearAfter = `#window-controls-persistent::after { content: none; }`;

    if (WindowControls._isCustomSvgPatternKey(key)) {
      const customPath = String(svgPath ?? '').trim();
      if (!customPath) {
        if (notify) ui?.notifications?.warn?.('Window Controls: Select a custom SVG file first.');
        styleEl.textContent = `#window-controls-persistent::before { background-image: none; opacity: ${opVal}; }\n${clearAfter}`;
        return;
      }
      try {
        css = await WindowControls._buildCustomSvgPatternCSS(customPath, bgHexColor, hexColor, sizePx, { notify });
      } catch (e) {
        if (notify) ui?.notifications?.warn?.('Window Controls: Custom SVG pattern could not be loaded. ' + e.message);
        styleEl.textContent = `#window-controls-persistent::before { background-image: none; opacity: ${opVal}; }\n${clearAfter}`;
        return;
      }
    } else {
      css = WindowControls._taskbarPatternCSS(key, hexColor, sizePx, bgHexColor);
    }

    if (nonce != null && nonce !== WindowControls._taskbarPatternApplyNonce) return;

    if (!css || css.image === 'none') {
      styleEl.textContent = `#window-controls-persistent::before { background-image: none; opacity: ${opVal}; }\n${clearAfter}`;
      return;
    }
    const pos = css.position ? `\n  background-position: ${css.position};` : '';
    styleEl.textContent =
      `#window-controls-persistent::before {\n  background-image: ${css.image};\n  background-size: ${css.size};${pos}\n  opacity: ${opVal};\n}\n${clearAfter}`;
  }

  // Reads the four pattern settings and applies the pattern to the real taskbar.
  static async _applyTaskbarPatternFromSettings({ notify = false } = {}) {
    try {
      const nonce = ++WindowControls._taskbarPatternApplyNonce;
      const key     = game?.settings?.get(WindowControls.MODULE_ID, 'taskbarPattern')        ?? 'diagonal';
      const color   = game?.settings?.get(WindowControls.MODULE_ID, 'taskbarPatternColor')   ?? '#000000';
      const opacity = game?.settings?.get(WindowControls.MODULE_ID, 'taskbarPatternOpacity') ?? 80;
      const size    = game?.settings?.get(WindowControls.MODULE_ID, 'taskbarPatternSize')    ?? 4;
      const svgPath = game?.settings?.get(WindowControls.MODULE_ID, 'taskbarPatternCustomSvgPath') ?? '';
      const rawBg   = game?.settings?.get(WindowControls.MODULE_ID, 'taskbarColor')          ?? '#808080';
      const bgHex   = WindowControls._cssColorToHex(rawBg);
      await WindowControls._setTaskbarPattern(key, color, opacity, size, bgHex, { svgPath, notify, nonce });
    } catch (e) {
      // Ignore (e.g. before game/settings available).
    }
  }

  // ── Theme System ───────────────────────────────────────────────────────────────

  // Fetches themes.css and parses all WCN-THEME comment headers into _wcnThemes.
  static async _loadThemesFromCSS() {
    try {
      const path = `modules/${WindowControls.MODULE_ID}/themes.css`;
      const response = await fetch(path);
      if (!response.ok) {
        WindowControls._logAlways('_loadThemesFromCSS: Failed to fetch themes.css, status:', response.status);
        return;
      }
      const text = await response.text();
      const regex = /\/\*\s*WCN-THEME\s+id="([^"]+)"\s+name="([^"]+)"\s*\*\//g;
      const themes = [];
      let match;
      while ((match = regex.exec(text)) !== null) {
        themes.push({ id: match[1], name: match[2] });
      }
      WindowControls._wcnThemes = themes;
      WindowControls._logAlways('_loadThemesFromCSS: Loaded', themes.length, 'theme(s):', themes.map(t => t.id).join(', '));
    } catch (e) {
      WindowControls._logAlways('_loadThemesFromCSS: Error loading themes.css', e);
    }
  }

  // Returns the saved custom themes object from the wcCustomThemes setting.
  static _loadCustomThemes() {
    try {
      return game?.settings?.get(WindowControls.MODULE_ID, 'wcCustomThemes') ?? {};
    } catch {
      return {};
    }
  }

  // Removes all wc-theme-* body classes and applies the given theme id.
  // Preset themes (theme1, theme2 …) get a body class; custom themes get inline CSS vars.
  static _applyTheme(id) {
    const body = document.body;
    const rootStyle = document.documentElement?.style;
    if (!body || !rootStyle) return;

    // Remove all previously active preset theme classes.
    const toRemove = [];
    body.classList.forEach(cls => { if (cls.startsWith('wc-theme-')) toRemove.push(cls); });
    toRemove.forEach(cls => body.classList.remove(cls));

    // Always clear any inline theme vars so they don't bleed onto a preset theme.
    WindowControls._WCN_THEME_VARS.forEach(v => rootStyle.removeProperty(v));

    if (!id) return;

    // Custom saved theme: apply variables directly on :root inline style.
    const customThemes = WindowControls._loadCustomThemes();
    if (customThemes[id]) {
      const vars = customThemes[id].variables ?? {};
      for (const [key, value] of Object.entries(vars)) {
        if (key.startsWith('--wc-')) rootStyle.setProperty(key, value);
      }
      WindowControls._logAlways('_applyTheme: Applied custom theme:', id);
      return;
    }

    // Preset theme: add the matching body class.
    body.classList.add(`wc-theme-${id}`);
    WindowControls._logAlways('_applyTheme: Applied preset theme:', id);
  }

  // Reads the current theme mode and active theme setting, then calls _applyTheme.
  static _applyThemeFromSetting() {
    try {
      const enabled = game?.settings?.get(WindowControls.MODULE_ID, 'wcThemeEnabled');
      if (enabled === false) {
        // User opted out — strip all theme classes and inline vars, leave :root defaults.
        const body = document.body;
        const rootStyle = document.documentElement?.style;
        const toRemove = [];
        body?.classList?.forEach(cls => { if (cls.startsWith('wc-theme-')) toRemove.push(cls); });
        toRemove.forEach(cls => body.classList.remove(cls));
        WindowControls._WCN_THEME_VARS.forEach(v => rootStyle?.removeProperty(v));
        return;
      }
      const mode = game?.settings?.get(WindowControls.MODULE_ID, 'wcThemeMode') ?? 'gm';
      const id = mode === 'gm'
        ? (game?.settings?.get(WindowControls.MODULE_ID, 'wcWorldTheme') ?? 'theme2')
        : (game?.settings?.get(WindowControls.MODULE_ID, 'activeTheme') ?? 'theme2');
      WindowControls._applyTheme(id);
    } catch (e) {
      // Ignore (e.g. before settings available).
    }
  }

  // Reads the resolved CSS variable value for a given var name, checking the body element
  // (where theme class overrides live) first, then :root, then the inline :root style.
  static _resolveThemeVar(varName) {
    const bodyStyle = getComputedStyle(document.body);
    const rootStyle = getComputedStyle(document.documentElement);
    return (
      bodyStyle.getPropertyValue(varName).trim() ||
      rootStyle.getPropertyValue(varName).trim() ||
      ''
    );
  }

  // Returns an object of all WCN theme variable current values (resolved from the live DOM).
  static _captureCurrentThemeVars() {
    const vars = {};
    for (const v of WindowControls._WCN_THEME_VARS) {
      vars[v] = WindowControls._resolveThemeVar(v);
    }
    return vars;
  }

  // Builds the HTML for the theme variable editor rows.
  // Converts a CSS color value to the nearest #rrggbb hex string acceptable by <input type="color">.
  // Alpha channel is intentionally dropped — the full value is still shown in the text field.
  static _cssColorToHex(val) {
    if (!val) return '#000000';
    const v = val.trim();
    if (!v || v === 'inherit' || v === 'transparent' || v === 'unset' || v === '0') return '#000000';
    // Already #rrggbb or #rrggbbaa — return the 6-digit portion
    if (/^#[0-9a-f]{8}$/i.test(v)) return v.slice(0, 7);
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    // #rgb → #rrggbb
    if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + [v[1]+v[1], v[2]+v[2], v[3]+v[3]].join('');
    // rgb() / rgba()
    const rgb = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgb) return '#' + [rgb[1], rgb[2], rgb[3]].map(n => parseInt(n, 10).toString(16).padStart(2, '0')).join('');
    // Named colours used in default theme vars
    const named = { white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff', orange: '#ffa500' };
    if (named[v.toLowerCase()]) return named[v.toLowerCase()];
    return '#000000';
  }

  // Extracts alpha as an integer 0–100 from any CSS color value.
  // Returns 100 if the value is opaque or non-colour.
  static _extractColorAlpha(val) {
    if (!val) return 100;
    const v = val.trim();
    if (!v || v === 'inherit' || v === 'transparent' || v === 'unset' || v === '0') return 100;
    // 8-digit hex  #rrggbbaa
    if (/^#[0-9a-f]{8}$/i.test(v)) return Math.round(parseInt(v.slice(7, 9), 16) / 255 * 100);
    // 6-digit or 3-digit hex — fully opaque
    if (/^#[0-9a-f]{6}$/i.test(v) || /^#[0-9a-f]{3}$/i.test(v)) return 100;
    // rgba(r,g,b,a)
    const rgba = v.match(/^rgba\s*\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/i);
    if (rgba) return Math.round(parseFloat(rgba[1]) * 100);
    return 100;
  }

  // Builds the Taskbar section HTML for the Theme Manager.
  // Uses dedicated classes (wc-taskbar-*) so it stays independent of the theme var system.
  static _buildTaskbarEditorRows(taskbarColor, scrollbarColor, patternKey, patternColor, patternOpacity, patternSize, patternSvgPath, isGM) {
    const tbHex   = WindowControls._cssColorToHex(taskbarColor   || '#0000');
    const tbAlpha = WindowControls._extractColorAlpha(taskbarColor || '#0000');
    const scHex   = WindowControls._cssColorToHex(scrollbarColor || '#000000');
    const scAlpha = WindowControls._extractColorAlpha(scrollbarColor || '#000000');

    const pcHex = WindowControls._cssColorToHex(patternColor || '#000000');
    const pKey  = patternKey ?? 'diagonal';
    const pOpac   = patternOpacity ?? 80;
    const pSize   = patternSize    ?? 4;
    const svgPath = String(patternSvgPath ?? '').trim();
    const includeCustomSvgOption = isGM || WindowControls._isCustomSvgPatternKey(pKey);

    const patterns = [...WindowControls.TASKBAR_PATTERNS];
    if (includeCustomSvgOption && !patterns.some((p) => p.key === 'custom-svg')) {
      patterns.push({ key: 'custom-svg', label: 'Custom SVG (GM)' });
    }

    const patternOptions = patterns
      .map(p => `<option value="${p.key}"${p.key === pKey ? ' selected' : ''}>${p.label}</option>`)
      .join('');

    const svgHint = 'GMs only: Only black and white SVGs are supported. White = Primary color, Black = Secondary color. Seamless tiling patterns work best.';

    const customSvgRow = includeCustomSvgOption ? `
      <tr class="wc-theme-row" id="wc-taskbar-custom-svg-row" style="display:${WindowControls._isCustomSvgPatternKey(pKey) ? '' : 'none'};">
        <td class="wc-te-label" title="${svgHint}">Custom SVG</td>
        <td class="wc-te-fields" colspan="2">
          <div class="wc-taskbar-svg-controls">
            <input type="text" id="wc-taskbar-svg-path-display" class="wc-theme-value-input" value="${foundry.utils.escapeHTML(svgPath)}" placeholder="Select SVG file..." readonly>
            <input type="hidden" id="wc-taskbar-svg-path" value="${foundry.utils.escapeHTML(svgPath)}">
            ${isGM ? '<button type="button" id="wc-taskbar-svg-browse" class="wc-taskbar-svg-btn"><i class="fas fa-folder-open"></i> Browse</button>' : ''}
            ${isGM ? '<button type="button" id="wc-taskbar-svg-clear" class="wc-taskbar-svg-btn"><i class="fas fa-xmark"></i> Clear</button>' : ''}
          </div>
          <p class="wc-taskbar-svg-hint" title="${svgHint}">${svgHint}</p>
          <p class="wc-taskbar-svg-hint">Users can share their SVGs in the Window Controls Next Discord channel.</p>
        </td>
      </tr>` : '';

    return `
      <div class="wc-theme-group">
        <h4 class="wc-theme-group-label">Taskbar</h4>
        <table class="wc-theme-table"><tbody>
          <tr class="wc-theme-row">
            <td class="wc-te-label">Pattern</td>
            <td class="wc-te-fields" colspan="2">
              <select id="wc-taskbar-pattern" class="wc-taskbar-pattern-select">${patternOptions}</select>
            </td>
          </tr>
          ${customSvgRow}
          <tr class="wc-theme-row wc-theme-row-color">
            <td class="wc-te-label">Primary</td>
            <td class="wc-te-fields">
              <input type="text" class="wc-theme-color-input wc-taskbar-color-text" id="wc-taskbar-color-text" value="${tbHex}" placeholder="#rrggbb" maxlength="9">
              <input type="text" class="wc-theme-percent-input wc-taskbar-color-alpha" id="wc-taskbar-color-alpha" value="${tbAlpha}" placeholder="100" maxlength="3" title="Opacity % (0–100)">
              <span class="wc-te-alpha-label">%</span>
            </td>
            <td class="wc-te-swatch">
              <input type="color" class="wc-theme-swatch wc-taskbar-color-swatch" id="wc-taskbar-color-swatch" value="${tbHex}" title="Primary (background) color">
            </td>
          </tr>
          <tr class="wc-theme-row wc-theme-row-color" id="wc-taskbar-pattern-color-row">
            <td class="wc-te-label">Secondary</td>
            <td class="wc-te-fields">
              <input type="text" class="wc-theme-color-input" id="wc-taskbar-pattern-color-text" value="${pcHex}" placeholder="#rrggbb" maxlength="9">
            </td>
            <td class="wc-te-swatch">
              <input type="color" class="wc-theme-swatch" id="wc-taskbar-pattern-color-swatch" value="${pcHex}" title="Secondary (pattern) color">
            </td>
          </tr>
          <tr class="wc-theme-row" id="wc-taskbar-pattern-size-row">
            <td class="wc-te-label">Pattern Size</td>
            <td class="wc-te-fields" colspan="2">
              <input type="text" class="wc-theme-value-input" id="wc-taskbar-pattern-size" value="${pSize}" placeholder="4" title="Pattern tile size in px">
              <span class="wc-te-alpha-label">px</span>
            </td>
          </tr>
          <tr class="wc-theme-row wc-theme-row-color">
            <td class="wc-te-label">Scrollbar</td>
            <td class="wc-te-fields">
              <input type="text" class="wc-theme-color-input wc-taskbar-scroll-text" id="wc-taskbar-scroll-text" value="${scHex}" placeholder="#rrggbb" maxlength="9">
              <input type="text" class="wc-theme-percent-input wc-taskbar-scroll-alpha" id="wc-taskbar-scroll-alpha" value="${scAlpha}" placeholder="100" maxlength="3" title="Opacity % (0–100)">
              <span class="wc-te-alpha-label">%</span>
            </td>
            <td class="wc-te-swatch">
              <input type="color" class="wc-theme-swatch wc-taskbar-scroll-swatch" id="wc-taskbar-scroll-swatch" value="${scHex}" title="Scrollbar thumb color">
            </td>
          </tr>
          <tr class="wc-theme-row" id="wc-taskbar-pattern-opacity-row">
            <td class="wc-te-label">Taskbar Opacity</td>
            <td class="wc-te-fields" colspan="2">
              <input type="text" class="wc-theme-percent-input" id="wc-taskbar-pattern-opacity" value="${pOpac}" placeholder="80" title="Pattern opacity % (0-100)">
              <span class="wc-te-alpha-label">%</span>
            </td>
          </tr>
        </tbody></table>
      </div>`;
  }

  static _buildThemeEditorRows(vars) {
    // FVTT bundled fonts available in all worlds.
    const WCN_FONTS = [
      { value: 'inherit',            label: '— Inherit (default) —' },
      { value: 'Signika',            label: 'Signika' },
      { value: 'Modesto Condensed',  label: 'Modesto Condensed' },
      { value: 'Palatino Linotype',  label: 'Palatino Linotype' },
      { value: 'Ethnocentric',       label: 'Ethnocentric' },
      { value: 'Bruno Ace SC',       label: 'Bruno Ace SC' },
      { value: 'Roboto',             label: 'Roboto' },
      { value: 'Arial',              label: 'Arial' },
      { value: 'serif',              label: 'serif' },
      { value: 'sans-serif',         label: 'sans-serif' },
      { value: 'monospace',          label: 'monospace' },
    ];

    const fontOptions = (current) => WCN_FONTS.map(f =>
      `<option value="${f.value}"${current === f.value || (f.value === 'inherit' && !current) ? ' selected' : ''}>${f.label}</option>`
    ).join('');

    // Each helper returns a <tr> for the containing <table>.
    const colorRow = (key, label, val) => {
      const hex   = WindowControls._cssColorToHex(val);
      const alpha = WindowControls._extractColorAlpha(val);
      return `<tr class="wc-theme-row wc-theme-row-color" data-var="${key}">
        <td class="wc-te-label">${label}</td>
        <td class="wc-te-fields">
          <input type="text" class="wc-theme-color-input" data-var="${key}" value="${hex}" placeholder="#rrggbb" maxlength="9">
          <input type="text" class="wc-theme-percent-input" data-var="${key}" value="${alpha}" placeholder="100" maxlength="3" title="Opacity % (0–100)">
          <span class="wc-te-alpha-label">%</span>
        </td>
        <td class="wc-te-swatch">
          <input type="color" class="wc-theme-swatch" data-var="${key}" value="${hex}" title="${key}">
        </td>
      </tr>`;
    };

    const fontRow = (key, label, val) => {
      const clean = (val ?? '').replace(/['"/]/g, '').trim();
      return `<tr class="wc-theme-row" data-var="${key}">
        <td class="wc-te-label">${label}</td>
        <td class="wc-te-fields" colspan="2">
          <select class="wc-theme-select wc-theme-value-input" data-var="${key}">
            ${fontOptions(clean)}
          </select>
        </td>
      </tr>`;
    };

    const textRow = (key, label, val, placeholder) => `<tr class="wc-theme-row" data-var="${key}">
      <td class="wc-te-label">${label}</td>
      <td class="wc-te-fields" colspan="2">
        <input type="text" class="wc-theme-value-input" data-var="${key}" value="${val ?? ''}" placeholder="${placeholder ?? key}">
      </td>
    </tr>`;

    // Stroke row: size field + color text field + swatch. Stored as "1px #000000".
    const strokeRow = (key, label, val) => {
      const parts = (val ?? '').trim().split(/\s+/);
      const sizeVal  = (parts.length >= 2) ? parts[0] : (val === '0' ? '0' : (val ?? ''));
      const colorVal = (parts.length >= 2) ? parts.slice(1).join(' ') : '';
      const hex = WindowControls._cssColorToHex(colorVal || '#000000');
      return `<tr class="wc-theme-row wc-theme-row-stroke" data-var="${key}">
        <td class="wc-te-label">${label}</td>
        <td class="wc-te-fields">
          <input type="text" class="wc-theme-value-input wc-theme-stroke-size" data-var="${key}" value="${sizeVal}" placeholder="1px" title="Size (px, decimals ok)">
          <input type="text" class="wc-theme-color-input wc-theme-stroke-color-text" data-var="${key}" value="${hex}" placeholder="#000000" maxlength="9" title="Stroke color">
        </td>
        <td class="wc-te-swatch">
          <input type="color" class="wc-theme-swatch wc-theme-stroke-swatch" data-var="${key}" value="${hex}" title="Stroke color">
        </td>
      </tr>`;
    };

    // Shadow row: offset/blur text + color hex + alpha + swatch. Stored as "0 0 10px #000000".
    const shadowRow = (key, label, val) => {
      const v = (val ?? '').trim();
      // Split blur/offset from color: color token is the last token starting with # or rgb
      const tokens = v.split(/\s+/);
      let offsetPart = 'none', colorPart = '#000000', alpha = 100;
      if (v === '' || v === 'none' || v === '0') {
        offsetPart = v || 'none';
      } else {
        const lastToken = tokens[tokens.length - 1];
        const isColor = /^#|^rgba?/i.test(lastToken);
        if (isColor && tokens.length > 1) {
          offsetPart = tokens.slice(0, -1).join(' ');
          colorPart  = lastToken;
        } else if (isColor) {
          offsetPart = '0 0 10px';
          colorPart  = lastToken;
        } else {
          offsetPart = v;
        }
      }
      const hex = WindowControls._cssColorToHex(colorPart);
      alpha = WindowControls._extractColorAlpha(colorPart);
      return `<tr class="wc-theme-row wc-theme-row-shadow" data-var="${key}">
        <td class="wc-te-label">${label}</td>
        <td class="wc-te-fields">
          <input type="text" class="wc-theme-value-input wc-theme-shadow-offset" data-var="${key}" value="${offsetPart}" placeholder="0 0 10px" title="Offset X, Offset Y, Blur (e.g. 0 0 10px (or 0 for hard line))">
          <input type="text" class="wc-theme-color-input wc-theme-shadow-color-text" data-var="${key}" value="${hex}" placeholder="#000000" maxlength="9" title="Shadow color">
          <input type="text" class="wc-theme-percent-input wc-theme-shadow-alpha" data-var="${key}" value="${alpha}" placeholder="100" maxlength="3" title="Opacity % (0–100)">
          <span class="wc-te-alpha-label">%</span>
        </td>
        <td class="wc-te-swatch">
          <input type="color" class="wc-theme-swatch wc-theme-shadow-swatch" data-var="${key}" value="${hex}" title="Shadow color">
        </td>
      </tr>`;
    };

    const groups = [
      {
        label: 'Window Headers & Buttons',
        rows: () => [
          colorRow('--wc-pinned-header-bg',      'Window Header Tint',    vars['--wc-pinned-header-bg']),
          colorRow('--wc-pinned-taskbar-btn-bg', 'Pinned Button BG Color', vars['--wc-pinned-taskbar-btn-bg']),
          colorRow('--wc-btn-bg',                'Non-pinned Button BG Color', vars['--wc-btn-bg']),
        ].join('')
      },
      {
        label: 'Pinned Taskbar Button Text',
        rows: () => [
          colorRow('--wc-btn-pinned-color',       'Text Color',   vars['--wc-btn-pinned-color']),
          fontRow( '--wc-btn-pinned-font-family', 'Font Family',  vars['--wc-btn-pinned-font-family']),
          textRow( '--wc-btn-pinned-font-size',   'Font Size',    vars['--wc-btn-pinned-font-size'],  'e.g. 1.3rem or 16px'),
          textRow( '--wc-btn-pinned-font-weight', 'Font Weight',  vars['--wc-btn-pinned-font-weight'], 'e.g. bold or 700'),
          strokeRow('--wc-btn-pinned-text-stroke','Text Stroke',  vars['--wc-btn-pinned-text-stroke']),
          shadowRow('--wc-btn-pinned-text-shadow', 'Text Shadow',  vars['--wc-btn-pinned-text-shadow']),
        ].join('')
      },
      {
        label: 'Non-pinned Taskbar Button Text',
        rows: () => [
          colorRow('--wc-btn-color',      'Text Color',  vars['--wc-btn-color']),
          fontRow( '--wc-btn-font-family','Font Family', vars['--wc-btn-font-family']),
          textRow( '--wc-btn-font-size',  'Font Size',   vars['--wc-btn-font-size'],   'e.g. 1rem or 14px'),
          textRow( '--wc-btn-font-weight','Font Weight', vars['--wc-btn-font-weight'], 'e.g. bold or 700'),
          strokeRow('--wc-btn-text-stroke','Text Stroke',vars['--wc-btn-text-stroke']),
          shadowRow('--wc-btn-text-shadow','Text Shadow', vars['--wc-btn-text-shadow']),
        ].join('')
      },
      {
        label: 'Header Inject Buttons',
        rows: () => [
          colorRow('--wc-header-btn-color',        'Icon Color',      vars['--wc-header-btn-color']),
          colorRow('--wc-header-btn-bg',           'Background',      vars['--wc-header-btn-bg']),
          colorRow('--wc-header-btn-pinned-color', 'Pin Active Color',vars['--wc-header-btn-pinned-color']),
        ].join('')
      },
    ];

    return groups.map(group => `
      <div class="wc-theme-group">
        <h4 class="wc-theme-group-label">${group.label}</h4>
        <table class="wc-theme-table"><tbody>
          ${group.rows()}
        </tbody></table>
      </div>`).join('');
  }

  // Builds the live preview — simulated window header + taskbar chip row.
  static _buildThemePreviewHtml() {
    return `
      <div class="wc-theme-preview" id="wc-theme-preview">
        <div class="wc-preview-window">
          <div class="wc-preview-window-header" id="wc-preview-header">
            <span class="wc-preview-window-title">My Window</span>
            <div class="wc-preview-window-btns">
              <span class="wc-preview-header-btn wc-preview-header-pin-inactive" title="Pin (inactive)"><i class="fas fa-thumbtack"></i></span>
              <span class="wc-preview-header-btn wc-preview-header-pin-active" title="Pin (active)"><i class="fas fa-thumbtack"></i></span>
              <span class="wc-preview-header-btn wc-preview-header-minimize" title="Minimize"><i class="fas fa-minus"></i></span>
            </div>
          </div>
          <div class="wc-preview-window-body">Window content…</div>
        </div>
        <div class="wc-preview-taskbar" id="wc-preview-taskbar">
          <span class="wc-preview-btn wc-preview-btn-normal">Normal Window</span>
          <span class="wc-preview-btn wc-preview-btn-pinned">Pinned Window</span>
        </div>
      </div>`;
  }

  // Reads the current variable editor values from a dialog HTMLElement into a plain object.
  // Stroke rows: assembles size + color fields back into "1px #000000" format.
  static _readEditorVars(dialogEl) {
    const vars = {};
    // Color fields — combine with alpha if a matching percent field exists.
    dialogEl.querySelectorAll('.wc-theme-color-input[data-var]:not(.wc-theme-stroke-color-text):not(.wc-theme-shadow-color-text)').forEach(input => {
      const varName = input.dataset.var;
      const hex = input.value.trim();
      const alphaInput = dialogEl.querySelector(`.wc-theme-percent-input[data-var="${varName}"]:not(.wc-theme-shadow-alpha)`);
      if (alphaInput) {
        const pct = Math.max(0, Math.min(100, parseInt(alphaInput.value) || 100));
        if (pct < 100) {
          const aa = Math.round(pct / 100 * 255).toString(16).padStart(2, '0');
          const base = /^#[0-9a-f]{6}$/i.test(hex) ? hex : WindowControls._cssColorToHex(hex);
          vars[varName] = base + aa;
        } else {
          vars[varName] = hex;
        }
      } else {
        vars[varName] = hex;
      }
    });
    // Plain value fields (font family, font size, weight) that are not composite rows.
    dialogEl.querySelectorAll('.wc-theme-value-input[data-var]:not(.wc-theme-stroke-size):not(.wc-theme-shadow-offset)').forEach(input => {
      vars[input.dataset.var] = input.value.trim();
    });
    // Stroke rows: combine size + color into "<size> <color>".
    dialogEl.querySelectorAll('.wc-theme-stroke-size[data-var]').forEach(sizeInput => {
      const varName = sizeInput.dataset.var;
      const size = sizeInput.value.trim();
      const colorText = dialogEl.querySelector(`.wc-theme-stroke-color-text[data-var="${varName}"]`);
      const color = colorText?.value?.trim() ?? '';
      if (size === '0' || size === 'none' || size === '') {
        vars[varName] = size || '0';
      } else {
        vars[varName] = color ? `${size} ${color}` : size;
      }
    });
    // Shadow rows: combine offset/blur + color + alpha into "x y blur #rrggbbaa".
    dialogEl.querySelectorAll('.wc-theme-shadow-offset[data-var]').forEach(offsetInput => {
      const varName   = offsetInput.dataset.var;
      const offset    = offsetInput.value.trim();
      const colorText = dialogEl.querySelector(`.wc-theme-shadow-color-text[data-var="${varName}"]`);
      const alphaInput= dialogEl.querySelector(`.wc-theme-shadow-alpha[data-var="${varName}"]`);
      const hex       = colorText?.value?.trim() || '#000000';
      const pct       = Math.max(0, Math.min(100, parseInt(alphaInput?.value) || 100));
      let colorFinal;
      if (pct < 100) {
        const aa = Math.round(pct / 100 * 255).toString(16).padStart(2, '0');
        const base = /^#[0-9a-f]{6}$/i.test(hex) ? hex : WindowControls._cssColorToHex(hex);
        colorFinal = base + aa;
      } else {
        colorFinal = hex;
      }
      if (offset === '' || offset === 'none' || offset === '0') {
        vars[varName] = offset || 'none';
      } else {
        vars[varName] = `${offset} ${colorFinal}`;
      }
    });
    return vars;
  }

  // Reads the current values of all taskbar panel fields in the Theme Manager dialog.
  static _readTaskbarEditorValues(dialogEl) {
    const tbHex  = dialogEl.querySelector('#wc-taskbar-color-text')?.value?.trim() || '#000000';
    const tbPct  = Math.max(0, Math.min(100, parseInt(dialogEl.querySelector('#wc-taskbar-color-alpha')?.value) || 100));
    const tbAA   = tbPct < 100 ? Math.round(tbPct / 100 * 255).toString(16).padStart(2, '0') : '';
    const tbBase = /^#[0-9a-f]{6}$/i.test(tbHex) ? tbHex : WindowControls._cssColorToHex(tbHex);

    const scHex  = dialogEl.querySelector('#wc-taskbar-scroll-text')?.value?.trim() || '';
    const scPct  = Math.max(0, Math.min(100, parseInt(dialogEl.querySelector('#wc-taskbar-scroll-alpha')?.value) || 100));
    const scAA   = scPct < 100 ? Math.round(scPct / 100 * 255).toString(16).padStart(2, '0') : '';
    const scBase = scHex ? (/^#[0-9a-f]{6}$/i.test(scHex) ? scHex : WindowControls._cssColorToHex(scHex)) : '';

    const pcHex  = dialogEl.querySelector('#wc-taskbar-pattern-color-text')?.value?.trim() || '#000000';
    const pcBase = /^#[0-9a-f]{6}$/i.test(pcHex) ? pcHex : WindowControls._cssColorToHex(pcHex);
    const svgPath = dialogEl.querySelector('#wc-taskbar-svg-path')?.value?.trim() || '';

    return {
      color:          tbAA ? tbBase + tbAA : tbBase,
      scrollbarColor: scBase ? (scAA ? scBase + scAA : scBase) : '',
      pattern:        dialogEl.querySelector('#wc-taskbar-pattern')?.value || 'diagonal',
      patternColor:   pcBase,
      patternOpacity: parseInt(dialogEl.querySelector('#wc-taskbar-pattern-opacity')?.value) || 80,
      patternSize:    parseInt(dialogEl.querySelector('#wc-taskbar-pattern-size')?.value) || 4,
      patternSvgPath: svgPath,
    };
  }

  // Populates the taskbar panel fields from a stored taskbar settings object.
  static _populateTaskbarFields(dialogEl, taskbar) {
    const tbBase  = WindowControls._cssColorToHex(taskbar.color || '#000000');
    const tbAlpha = WindowControls._extractColorAlpha(taskbar.color || '#000000');
    const scBase  = taskbar.scrollbarColor ? WindowControls._cssColorToHex(taskbar.scrollbarColor) : '';
    const scAlpha = taskbar.scrollbarColor ? WindowControls._extractColorAlpha(taskbar.scrollbarColor) : '100';
    const pcBase  = taskbar.patternColor || '#000000';
    const svgPath = String(taskbar.patternSvgPath || '').trim();

    const set = (id, val) => { const el = dialogEl.querySelector(`#${id}`); if (el) el.value = val; };
    set('wc-taskbar-color-text',          tbBase);
    set('wc-taskbar-color-alpha',         tbAlpha);
    set('wc-taskbar-color-swatch',        tbBase);
    set('wc-taskbar-scroll-text',         scBase);
    set('wc-taskbar-scroll-alpha',        scAlpha);
    set('wc-taskbar-scroll-swatch',       scBase || '#000000');
    set('wc-taskbar-pattern',             taskbar.pattern || 'diagonal');
    set('wc-taskbar-pattern-color-text',  pcBase);
    set('wc-taskbar-pattern-color-swatch', pcBase);
    set('wc-taskbar-svg-path',            svgPath);
    set('wc-taskbar-svg-path-display',    svgPath);

    const opacityEl = dialogEl.querySelector('#wc-taskbar-pattern-opacity');
    if (opacityEl) {
      opacityEl.value = taskbar.patternOpacity ?? 80;
    }
    const sizeEl = dialogEl.querySelector('#wc-taskbar-pattern-size');
    if (sizeEl) {
      sizeEl.value = taskbar.patternSize ?? 4;
    }
  }

  // Updates the live preview strip in the dialog to reflect the current editor values.
  static _updateThemePreview(dialogEl) {
    const vars = WindowControls._readEditorVars(dialogEl);
    const preview = dialogEl.querySelector('#wc-theme-preview');
    if (!preview) return;

    // Pinned header tint — value from _readEditorVars already includes alpha as #rrggbbaa if set.
    const headerTintVal = vars['--wc-pinned-header-bg'] || 'rgba(0,0,0,0.5)';
    const previewHeader = preview.querySelector('.wc-preview-window-header');
    if (previewHeader) previewHeader.style.background = headerTintVal;

    // Pinned taskbar button
    const pinnedBg      = vars['--wc-pinned-taskbar-btn-bg']    || 'transparent';
    const pinnedColor   = vars['--wc-btn-pinned-color']         || 'inherit';
    const pinnedFont    = vars['--wc-btn-pinned-font-family']   || 'inherit';
    const pinnedSize    = vars['--wc-btn-pinned-font-size']     || 'inherit';
    const pinnedWeight  = vars['--wc-btn-pinned-font-weight']   || vars['--wc-btn-font-weight'] || 'inherit';
    const pinnedStroke  = vars['--wc-btn-pinned-text-stroke']   || '0';
    const pinnedShadow  = vars['--wc-btn-pinned-text-shadow']   || 'none';
    const pinnedBtn = preview.querySelector('.wc-preview-btn-pinned');
    if (pinnedBtn) {
      pinnedBtn.style.backgroundColor  = pinnedBg;
      pinnedBtn.style.color            = pinnedColor;
      pinnedBtn.style.fontFamily       = pinnedFont;
      pinnedBtn.style.fontSize         = pinnedSize;
      pinnedBtn.style.fontWeight       = pinnedWeight;
      pinnedBtn.style.webkitTextStroke = pinnedStroke;
      pinnedBtn.style.textStroke       = pinnedStroke;
      pinnedBtn.style.textShadow       = pinnedShadow;
      pinnedBtn.style.paintOrder       = 'stroke fill';
    }

    // Normal taskbar button (all-taskbar vars)
    const btnBg      = vars['--wc-btn-bg']           || '#00000066';
    const btnColor   = vars['--wc-btn-color']        || 'inherit';
    const btnFont    = vars['--wc-btn-font-family']  || 'inherit';
    const btnSize    = vars['--wc-btn-font-size']    || 'inherit';
    const btnWeight  = vars['--wc-btn-font-weight']  || 'inherit';
    const btnStroke  = vars['--wc-btn-text-stroke']  || '0';
    const btnShadow  = vars['--wc-btn-text-shadow']  || 'none';
    const normalBtn = preview.querySelector('.wc-preview-btn-normal');
    if (normalBtn) {
      normalBtn.style.backgroundColor  = btnBg;
      normalBtn.style.color            = btnColor;
      normalBtn.style.fontFamily       = btnFont;
      normalBtn.style.fontSize         = btnSize;
      normalBtn.style.fontWeight       = btnWeight;
      normalBtn.style.webkitTextStroke = btnStroke;
      normalBtn.style.textStroke       = btnStroke;
      normalBtn.style.textShadow       = btnShadow;
      normalBtn.style.paintOrder       = 'stroke fill';
    }

    // Header inject buttons
    const headerColor       = vars['--wc-header-btn-color']        || 'inherit';
    const headerBg          = vars['--wc-header-btn-bg']           || 'transparent';
    const headerPinnedColor = vars['--wc-header-btn-pinned-color'] || headerColor;
    preview.querySelectorAll('.wc-preview-header-btn').forEach(btn => {
      btn.style.color           = headerColor;
      btn.style.backgroundColor = headerBg;
    });
    const activePinBtn = preview.querySelector('.wc-preview-header-pin-active');
    if (activePinBtn) activePinBtn.style.color = headerPinnedColor;

    // Taskbar strip background — read live from the taskbar color fields.
    const taskbarColorText  = dialogEl.querySelector('#wc-taskbar-color-text');
    const taskbarAlphaInput = dialogEl.querySelector('#wc-taskbar-color-alpha');
    const previewTaskbar = preview.querySelector('#wc-preview-taskbar');
    if (previewTaskbar && taskbarColorText) {
      const hex  = taskbarColorText.value.trim() || '#000000';
      const pct  = Math.max(0, Math.min(100, parseInt(taskbarAlphaInput?.value) || 100));
      const aa   = pct < 100 ? Math.round(pct / 100 * 255).toString(16).padStart(2, '0') : '';
      const base = /^#[0-9a-f]{6}$/i.test(hex) ? hex : WindowControls._cssColorToHex(hex);
      previewTaskbar.style.backgroundColor = aa ? base + aa : base;

      // Apply pattern overlay.
      const patKey   = dialogEl.querySelector('#wc-taskbar-pattern')?.value || 'diagonal';
      const patHex   = dialogEl.querySelector('#wc-taskbar-pattern-color-text')?.value?.trim() || '#000000';
      const patOpac  = parseInt(dialogEl.querySelector('#wc-taskbar-pattern-opacity')?.value) || 80;
      const patSize  = parseInt(dialogEl.querySelector('#wc-taskbar-pattern-size')?.value) || 4;
      const patSvgPath = dialogEl.querySelector('#wc-taskbar-svg-path')?.value?.trim() || '';
      const patBgHex = /^#[0-9a-f]{6}$/i.test(base) ? base : WindowControls._cssColorToHex(base);
      const opVal    = (Math.max(0, Math.min(100, patOpac)) / 100).toFixed(2);
      // Reset before applying.
      previewTaskbar.style.backgroundImage    = '';
      previewTaskbar.style.backgroundSize     = '';
      previewTaskbar.style.backgroundPosition = '';
      previewTaskbar.style.webkitMaskImage    = '';
      previewTaskbar.style.maskImage          = '';
      previewTaskbar.style.webkitMaskSize     = '';
      previewTaskbar.style.maskSize           = '';
      previewTaskbar.style.webkitMaskRepeat   = '';
      previewTaskbar.style.maskRepeat         = '';
      previewTaskbar.style.opacity            = '1';
      if (WindowControls._isCustomSvgPatternKey(patKey)) {
        if (patSvgPath) {
          void (async () => {
            try {
              const custom = await WindowControls._buildCustomSvgPatternCSS(patSvgPath, patBgHex, patHex, patSize, { notify: false });
              previewTaskbar.style.backgroundImage = custom.image;
              previewTaskbar.style.backgroundSize = custom.size;
              previewTaskbar.style.backgroundPosition = '0 0';
              previewTaskbar.style.opacity = opVal;
            } catch {
              previewTaskbar.style.backgroundImage = 'none';
            }
          })();
        }
      } else {
        const patCSS = WindowControls._taskbarPatternCSS(patKey, patHex, patSize, patBgHex);
        if (patCSS && patCSS.image !== 'none') {
          previewTaskbar.style.backgroundImage    = patCSS.image;
          previewTaskbar.style.backgroundSize     = patCSS.size;
          previewTaskbar.style.backgroundPosition = patCSS.position || '0 0';
          previewTaskbar.style.opacity            = opVal;
        }
      }
    }
  }

  // Downloads wcCustomThemes as a JSON file.
  // Opens a DialogV2 letting the user pick which custom themes to export,
  // then triggers a save-file dialog via foundry.utils.saveDataToFile.
  static async _exportCustomThemes() {
    const DialogV2 = foundry?.applications?.api?.DialogV2;
    if (!DialogV2) return;

    let allThemes;
    try { allThemes = game.settings.get(WindowControls.MODULE_ID, 'wcCustomThemes') ?? {}; }
    catch { allThemes = {}; }

    const ids = Object.keys(allThemes);
    if (!ids.length) {
      ui?.notifications?.info?.('Window Controls: No custom themes to export.');
      return;
    }

    const checkboxRows = ids.map(id => {
      const name = allThemes[id]?.name ?? id;
      return `<label class="wc-export-row">
        <input type="checkbox" name="wc-export-theme" value="${id}" checked>
        ${name}
      </label>`;
    }).join('');

    const content = `
      <div class="wc-export-dialog">
        <p style="margin:0 0 8px">Select themes to export:</p>
        <div class="wc-export-checklist">${checkboxRows}</div>
      </div>`;

    await DialogV2.wait({
      window: { title: 'Export Custom Themes' },
      content,
      buttons: [
        {
          label: 'Export',
          icon: 'fas fa-file-export',
          action: 'export',
          callback: (event, button, dialog) => {
            const el = dialog?.element ?? button.closest('.application, .dialog') ?? document;
            const checked = [...el.querySelectorAll('input[name="wc-export-theme"]:checked')].map(cb => cb.value);
            if (!checked.length) {
              ui?.notifications?.warn?.('Window Controls: No themes selected.');
              return;
            }
            const subset = {};
            for (const id of checked) subset[id] = allThemes[id];
            const json = JSON.stringify(subset, null, 2);
            foundry.utils.saveDataToFile(json, 'application/json', 'wcn-themes.json');
          },
        },
        { label: 'Cancel', icon: 'fas fa-times', action: 'cancel' },
      ],
      rejectClose: false,
    });
  }

  // Opens a file-picker input and reads the selected JSON, merging valid themes into wcCustomThemes.
  static async _importCustomThemes() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';
      document.body.appendChild(input);

      const cleanup = () => { try { document.body.removeChild(input); } catch {} };

      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        cleanup();
        if (!file) { resolve(false); return; }
        try {
          const text = await foundry.utils.readTextFromFile(file);
          const imported = JSON.parse(text);
          if (typeof imported !== 'object' || imported === null || Array.isArray(imported)) {
            ui?.notifications?.error?.('Window Controls: Import failed — file must contain a JSON object.');
            resolve(false); return;
          }
          const valid = {};
          for (const [id, entry] of Object.entries(imported)) {
            if (typeof entry?.variables === 'object' && entry.variables !== null) {
              const taskbar = (entry.taskbar && typeof entry.taskbar === 'object') ? entry.taskbar : undefined;
              valid[id] = { name: entry.name ?? id, variables: entry.variables, ...(taskbar ? { taskbar } : {}) };
            }
          }
          if (!Object.keys(valid).length) {
            ui?.notifications?.warn?.('Window Controls: No valid theme entries found.');
            resolve(false); return;
          }
          let current;
          try { current = game.settings.get(WindowControls.MODULE_ID, 'wcCustomThemes') ?? {}; }
          catch { current = {}; }
          await game.settings.set(WindowControls.MODULE_ID, 'wcCustomThemes', { ...current, ...valid });
          ui?.notifications?.info?.(`Window Controls: Imported ${Object.keys(valid).length} custom theme(s).`);
          resolve(true);
        } catch (e) {
          ui?.notifications?.error?.('Window Controls: Import failed — ' + e.message);
          resolve(false);
        }
      });

      input.addEventListener('cancel', () => { cleanup(); resolve(false); });
      input.click();
    });
  }

  // Opens the Theme Manager dialog — theme picker, variable editor, live preview, save/export/import.
  static async _showThemeManagerDialog() {
    const UNSAVED_THEME_ID = WindowControls._UNSAVED_THEME_ID;
    const UNSAVED_THEME_NAME = WindowControls._UNSAVED_THEME_NAME;

    const DialogV2 = foundry?.applications?.api?.DialogV2;
    if (!DialogV2) {
      ui?.notifications?.warn?.('Window Controls: DialogV2 not available in this version of Foundry.');
      return;
    }

    const isGM = game.user.isGM;
    let customThemes;
    try { customThemes = game.settings.get(WindowControls.MODULE_ID, 'wcCustomThemes') ?? {}; }
    catch { customThemes = {}; }

    let mode;
    try { mode = game.settings.get(WindowControls.MODULE_ID, 'wcThemeMode') ?? 'gm'; }
    catch { mode = 'gm'; }

    let worldThemeId;
    try { worldThemeId = game.settings.get(WindowControls.MODULE_ID, 'wcWorldTheme') ?? 'theme2'; }
    catch { worldThemeId = 'theme2'; }

    let playerThemeId;
    try { playerThemeId = game.settings.get(WindowControls.MODULE_ID, 'activeTheme') ?? 'theme2'; }
    catch { playerThemeId = 'theme2'; }

    // Build the theme option list (presets + custom).
    const buildThemeOptions = (selectedId) => {
      const presetOpts = WindowControls._wcnThemes.map(t =>
        `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${t.name}</option>`
      ).join('');
      const customEntries = Object.entries(customThemes);
      const customOpts = customEntries.length
        ? customEntries.map(([id, t]) =>
            `<option value="${id}" ${id === selectedId ? 'selected' : ''}>${id === UNSAVED_THEME_ID ? UNSAVED_THEME_NAME : `${t.name ?? id} (Custom)`}</option>`
          ).join('')
        : '';
      return `<optgroup label="Presets">${presetOpts}</optgroup>${customOpts ? `<optgroup label="Custom">${customOpts}</optgroup>` : ''}`;
    };

    // Determine the initially selected theme for the editor.
    const initialThemeId = (WindowControls._themeUnsavedPending || !!customThemes?.[UNSAVED_THEME_ID])
      ? UNSAVED_THEME_ID
      : (mode === 'gm' ? worldThemeId : playerThemeId);
    const capturedVars = WindowControls._captureCurrentThemeVars();

    const modeSection = isGM ? `
      <div class="form-group wc-theme-mode-row">
        <label>Theme Control</label>
        <div class="form-fields">
          <select name="wcThemeMode">
            <option value="gm" ${mode === 'gm' ? 'selected' : ''}>GM sets theme for everyone</option>
            <option value="player" ${mode === 'player' ? 'selected' : ''}>Each player picks their own</option>
          </select>
        </div>
      </div>
      <div class="form-group wc-theme-active-row">
        <label>Active Theme</label>
        <div class="form-fields">
          <select name="wcActiveTheme">${buildThemeOptions(initialThemeId)}</select>
        </div>
      </div>` : `
      <div class="form-group wc-theme-active-row">
        <label>Your Theme</label>
        <div class="form-fields">
          <select name="wcActiveTheme">${buildThemeOptions(playerThemeId)}</select>
        </div>
      </div>`;

    const editorRows = WindowControls._buildThemeEditorRows(capturedVars);
    const previewHtml = WindowControls._buildThemePreviewHtml();

    let taskbarColorVal = '#0000';
    let scrollbarColorVal = '';
    let patternKeyVal = 'diagonal';
    let patternColorVal = '#000000';
    let patternOpacityVal = 80;
    let patternSizeVal = 4;
    let patternSvgPathVal = '';
    try { taskbarColorVal    = game.settings.get(WindowControls.MODULE_ID, 'taskbarColor')          ?? '#0000'; } catch {}
    try { scrollbarColorVal  = game.settings.get(WindowControls.MODULE_ID, 'taskbarScrollbarColor') ?? ''; } catch {}
    try { patternKeyVal      = game.settings.get(WindowControls.MODULE_ID, 'taskbarPattern')        ?? 'diagonal'; } catch {}
    try { patternColorVal    = game.settings.get(WindowControls.MODULE_ID, 'taskbarPatternColor')   ?? '#000000'; } catch {}
    try { patternOpacityVal  = game.settings.get(WindowControls.MODULE_ID, 'taskbarPatternOpacity') ?? 80; } catch {}
    try { patternSizeVal     = game.settings.get(WindowControls.MODULE_ID, 'taskbarPatternSize')    ?? 4; } catch {}
    try { patternSvgPathVal  = game.settings.get(WindowControls.MODULE_ID, 'taskbarPatternCustomSvgPath') ?? ''; } catch {}
    const taskbarRows = WindowControls._buildTaskbarEditorRows(taskbarColorVal, scrollbarColorVal, patternKeyVal, patternColorVal, patternOpacityVal, patternSizeVal, patternSvgPathVal, isGM);

    const content = `
      <div class="wc-theme-manager">
        <div class="wc-theme-manager-top">
          ${modeSection}
        </div>
        <hr>
        <div class="wc-theme-manager-middle">
          ${previewHtml}
          <div class="wc-theme-middle-controls">
            <div class="wc-theme-save-row">
              <input type="text" id="wc-custom-theme-name" placeholder="Custom theme name…">
            </div>
            <div class="wc-theme-actions-row">
              <button type="button" id="wc-save-custom-btn" title="Save as new custom theme">
                <i class="fas fa-floppy-disk"></i> Save Custom
              </button>
              <div class="wc-theme-delete-row" id="wc-delete-row" style="display:none;">
                <button type="button" id="wc-delete-custom-btn" class="wc-danger-btn" title="Delete selected custom theme">
                  <i class="fas fa-trash"></i> Delete Theme
                </button>
              </div>
              <button type="button" id="wc-export-btn" title="Export all custom themes to file">
                <i class="fas fa-file-export"></i> Export
              </button>
              <button type="button" id="wc-import-btn" title="Import custom themes from file">
                <i class="fas fa-file-import"></i> Import
              </button>
            </div>
          </div>
        </div>
        <hr>
        <div class="wc-theme-editor-scroll">
          ${taskbarRows}
          ${editorRows}
        </div>
      </div>`;

    await DialogV2.wait({
      window: { title: 'WCN: Theme Manager', positioned: true },
      position: { width: 680 },
      content,
      rejectClose: false,
      buttons: [
        {
          action: 'apply',
          label: 'Apply & Close',
          default: true,
          callback: async (event, button, dialog) => {
            await WindowControls._themeManagerApply(dialog.element, customThemes, isGM);
          }
        },
        { action: 'cancel', label: 'Cancel', callback: () => {} }
      ],
      render: (event, dialog) => {
        const el = dialog.element;

        const syncCustomSvgRowVisibility = () => {
          const pattern = el.querySelector('#wc-taskbar-pattern')?.value || 'diagonal';
          const row = el.querySelector('#wc-taskbar-custom-svg-row');
          if (!row) return;
          row.style.display = WindowControls._isCustomSvgPatternKey(pattern) ? '' : 'none';
        };

        const applySvgPathToDialog = async (pickedPath) => {
          const svgPath = String(pickedPath ?? '').trim();
          if (!svgPath) return;
          if (!WindowControls._isLikelySvgPath(svgPath)) {
            ui?.notifications?.warn?.('Window Controls: Please select an SVG file.');
            return;
          }
          try {
            await WindowControls._loadSvgTextFromPath(svgPath);
          } catch (e) {
            ui?.notifications?.warn?.('Window Controls: Could not read SVG file. ' + e.message);
            return;
          }
          const hidden = el.querySelector('#wc-taskbar-svg-path');
          const display = el.querySelector('#wc-taskbar-svg-path-display');
          if (hidden) hidden.value = svgPath;
          if (display) display.value = svgPath;
          const patternSel = el.querySelector('#wc-taskbar-pattern');
          if (patternSel) patternSel.value = 'custom-svg';
          syncCustomSvgRowVisibility();
          WindowControls._updateThemePreview(el);
        };

        // Live preview on any input/change event.
        el.addEventListener('input', (e) => {
          const t = e.target;
          const varName = t.dataset.var;

          // Swatch → sync to matching text field (plain color, stroke color, or shadow color).
          if (t.classList.contains('wc-theme-stroke-swatch')) {
            const colorText = el.querySelector(`.wc-theme-stroke-color-text[data-var="${varName}"]`);
            if (colorText) colorText.value = t.value;
          } else if (t.classList.contains('wc-theme-shadow-swatch')) {
            const colorText = el.querySelector(`.wc-theme-shadow-color-text[data-var="${varName}"]`);
            if (colorText) colorText.value = t.value;
          } else if (t.classList.contains('wc-theme-swatch')) {
            const textField = el.querySelector(`.wc-theme-color-input[data-var="${varName}"]:not(.wc-theme-stroke-color-text):not(.wc-theme-shadow-color-text)`);
            if (textField) textField.value = t.value;
          }

          // Plain color text field → sync to swatch.
          if (t.classList.contains('wc-theme-color-input') && !t.classList.contains('wc-theme-stroke-color-text') && !t.classList.contains('wc-theme-shadow-color-text')) {
            const swatch = el.querySelector(`.wc-theme-swatch[data-var="${varName}"]:not(.wc-theme-stroke-swatch):not(.wc-theme-shadow-swatch)`);
            if (swatch && t.value.startsWith('#') && t.value.length >= 4) {
              swatch.value = WindowControls._cssColorToHex(t.value);
            }
          }

          // Stroke color text → sync to stroke swatch.
          if (t.classList.contains('wc-theme-stroke-color-text')) {
            const swatch = el.querySelector(`.wc-theme-stroke-swatch[data-var="${varName}"]`);
            if (swatch && t.value.startsWith('#') && t.value.length >= 4) {
              swatch.value = WindowControls._cssColorToHex(t.value);
            }
          }

          // Shadow color text → sync to shadow swatch.
          if (t.classList.contains('wc-theme-shadow-color-text')) {
            const swatch = el.querySelector(`.wc-theme-shadow-swatch[data-var="${varName}"]`);
            if (swatch && t.value.startsWith('#') && t.value.length >= 4) {
              swatch.value = WindowControls._cssColorToHex(t.value);
            }
          }

          // Taskbar color swatch → sync text field.
          if (t.id === 'wc-taskbar-color-swatch') {
            const tf = el.querySelector('#wc-taskbar-color-text');
            if (tf) tf.value = t.value;
          }
          // Taskbar color text → sync swatch.
          if (t.id === 'wc-taskbar-color-text') {
            const sw = el.querySelector('#wc-taskbar-color-swatch');
            if (sw && t.value.startsWith('#') && t.value.length >= 4) sw.value = WindowControls._cssColorToHex(t.value);
          }
          // Scrollbar swatch → sync text field.
          if (t.id === 'wc-taskbar-scroll-swatch') {
            const tf = el.querySelector('#wc-taskbar-scroll-text');
            if (tf) tf.value = t.value;
          }
          // Scrollbar text → sync swatch.
          if (t.id === 'wc-taskbar-scroll-text') {
            const sw = el.querySelector('#wc-taskbar-scroll-swatch');
            if (sw && t.value.startsWith('#') && t.value.length >= 4) sw.value = WindowControls._cssColorToHex(t.value);
          }

          // Pattern color swatch → sync text field.
          if (t.id === 'wc-taskbar-pattern-color-swatch') {
            const tf = el.querySelector('#wc-taskbar-pattern-color-text');
            if (tf) tf.value = t.value;
          }
          // Pattern color text → sync swatch.
          if (t.id === 'wc-taskbar-pattern-color-text') {
            const sw = el.querySelector('#wc-taskbar-pattern-color-swatch');
            if (sw && t.value.startsWith('#') && t.value.length >= 4) sw.value = WindowControls._cssColorToHex(t.value);
          }
          WindowControls._updateThemePreview(el);
        });
        // Font selects and pattern dropdown fire 'change', not 'input'.
        el.addEventListener('change', (e) => {
          if (e.target.classList.contains('wc-theme-select')) {
            WindowControls._updateThemePreview(el);
          }
          if (e.target.id === 'wc-taskbar-pattern') {
            syncCustomSvgRowVisibility();
            WindowControls._updateThemePreview(el);
          }
        });

        // Populate editor when theme selector changes.
        const themeSelect = el.querySelector('[name="wcActiveTheme"]');
        if (themeSelect) {
          themeSelect.addEventListener('change', () => {
            const selectedId = themeSelect.value;
            // Show delete button only for custom themes.
            const deleteRow = el.querySelector('#wc-delete-row');
            if (deleteRow) deleteRow.style.display = customThemes[selectedId] ? '' : 'none';
            // Load vars from DOM (apply the theme temporarily to read vars).
            const savedBodyClasses = [...document.body.classList];
            const savedInlineVars = {};
            WindowControls._WCN_THEME_VARS.forEach(v => {
              savedInlineVars[v] = document.documentElement.style.getPropertyValue(v);
            });
            // Apply temp to read resolved values.
            WindowControls._applyTheme(selectedId);
            const liveVars = WindowControls._captureCurrentThemeVars();
            // Restore original state.
            WindowControls._WCN_THEME_VARS.forEach(v => {
              if (savedInlineVars[v]) {
                document.documentElement.style.setProperty(v, savedInlineVars[v]);
              } else {
                document.documentElement.style.removeProperty(v);
              }
            });
            document.body.className = '';
            savedBodyClasses.forEach(c => document.body.classList.add(c));

            // Repopulate all editor fields from the freshly-captured vars.
            // 1. Plain color swatches + their text fields + alpha fields.
            el.querySelectorAll('.wc-theme-swatch:not(.wc-theme-stroke-swatch):not(.wc-theme-shadow-swatch)[data-var]').forEach(swatch => {
              const rawVal = liveVars[swatch.dataset.var] ?? '';
              const hex    = WindowControls._cssColorToHex(rawVal);
              const alpha  = WindowControls._extractColorAlpha(rawVal);
              swatch.value = hex;
              const textField = el.querySelector(`.wc-theme-color-input:not(.wc-theme-stroke-color-text):not(.wc-theme-shadow-color-text)[data-var="${swatch.dataset.var}"]`);
              if (textField) textField.value = hex;
              const alphaField = el.querySelector(`.wc-theme-percent-input:not(.wc-theme-shadow-alpha)[data-var="${swatch.dataset.var}"]`);
              if (alphaField) alphaField.value = alpha;
            });
            // 2. Stroke rows — split "1px #000000" back into size + color fields.
            el.querySelectorAll('.wc-theme-stroke-size[data-var]').forEach(sizeInput => {
              const varName = sizeInput.dataset.var;
              const raw = liveVars[varName] ?? '0';
              const parts = raw.trim().split(/\s+/);
              sizeInput.value = parts.length >= 2 ? parts[0] : raw;
              const colorRaw = parts.length >= 2 ? parts.slice(1).join(' ') : '';
              const hex = WindowControls._cssColorToHex(colorRaw || '#000000');
              const colorText = el.querySelector(`.wc-theme-stroke-color-text[data-var="${varName}"]`);
              if (colorText) colorText.value = hex;
              const strokeSwatch = el.querySelector(`.wc-theme-stroke-swatch[data-var="${varName}"]`);
              if (strokeSwatch) strokeSwatch.value = hex;
            });
            // 2b. Shadow rows — split "0 0 10px #000000" into offset + color + alpha.
            el.querySelectorAll('.wc-theme-shadow-offset[data-var]').forEach(offsetInput => {
              const varName = offsetInput.dataset.var;
              const raw     = (liveVars[varName] ?? 'none').trim();
              const tokens  = raw.split(/\s+/);
              const lastToken = tokens[tokens.length - 1];
              const isColor   = /^#|^rgba?/i.test(lastToken);
              let offset = 'none', colorRaw = '#000000';
              if (raw === 'none' || raw === '0' || raw === '') {
                offset = raw || 'none';
              } else if (isColor && tokens.length > 1) {
                offset   = tokens.slice(0, -1).join(' ');
                colorRaw = lastToken;
              } else {
                offset = raw;
              }
              const hex   = WindowControls._cssColorToHex(colorRaw);
              const alpha = WindowControls._extractColorAlpha(colorRaw);
              offsetInput.value = offset;
              const colorText   = el.querySelector(`.wc-theme-shadow-color-text[data-var="${varName}"]`);
              if (colorText) colorText.value = hex;
              const alphaField  = el.querySelector(`.wc-theme-shadow-alpha[data-var="${varName}"]`);
              if (alphaField) alphaField.value = alpha;
              const shadowSwatch = el.querySelector(`.wc-theme-shadow-swatch[data-var="${varName}"]`);
              if (shadowSwatch) shadowSwatch.value = hex;
            });
            // 3. Plain text fields (font size, weight) that have no swatch.
            el.querySelectorAll('.wc-theme-value-input[data-var]:not(.wc-theme-stroke-size):not(.wc-theme-shadow-offset)').forEach(input => {
              if (!el.querySelector(`.wc-theme-swatch:not(.wc-theme-stroke-swatch):not(.wc-theme-shadow-swatch)[data-var="${input.dataset.var}"]`)) {
                input.value = liveVars[input.dataset.var] ?? '';
              }
            });
            // 4. Font-family selects.
            el.querySelectorAll('.wc-theme-select[data-var]').forEach(sel => {
              const raw = (liveVars[sel.dataset.var] ?? '').replace(/['"]/g, '').trim();
              const opt = [...sel.options].find(o => o.value === raw);
              if (opt) sel.value = raw;
            });

            // If this custom theme has stored taskbar settings, populate the taskbar panel.
            const storedTaskbar = customThemes[selectedId]?.taskbar;
            if (storedTaskbar?.pattern === 'custom-svg') {
              const patSel = el.querySelector('#wc-taskbar-pattern');
              if (patSel && ![...patSel.options].some((o) => o.value === 'custom-svg')) {
                const opt = document.createElement('option');
                opt.value = 'custom-svg';
                opt.textContent = 'Custom SVG (GM)';
                patSel.appendChild(opt);
              }
            }
            if (storedTaskbar) WindowControls._populateTaskbarFields(el, storedTaskbar);

            syncCustomSvgRowVisibility();
            WindowControls._updateThemePreview(el);
          });
        }

        // GM-only SVG picker controls.
        el.querySelector('#wc-taskbar-svg-browse')?.addEventListener('click', () => {
          if (!isGM) return;
          const Picker = foundry?.applications?.apps?.FilePicker ?? globalThis.FilePicker;
          if (!Picker) {
            ui?.notifications?.warn?.('Window Controls: FilePicker not available in this Foundry version.');
            return;
          }
          const currentPath = el.querySelector('#wc-taskbar-svg-path')?.value?.trim() || '';
          const picker = new Picker({
            type: 'image',
            current: currentPath,
            callback: (path) => { void applySvgPathToDialog(path); }
          });
          picker.render(true);
        });

        el.querySelector('#wc-taskbar-svg-clear')?.addEventListener('click', () => {
          if (!isGM) return;
          const hidden = el.querySelector('#wc-taskbar-svg-path');
          const display = el.querySelector('#wc-taskbar-svg-path-display');
          if (hidden) hidden.value = '';
          if (display) display.value = '';
          const patternSel = el.querySelector('#wc-taskbar-pattern');
          if (patternSel && patternSel.value === 'custom-svg') patternSel.value = 'diagonal';
          syncCustomSvgRowVisibility();
          WindowControls._updateThemePreview(el);
        });

        // Save as custom theme.
        el.querySelector('#wc-save-custom-btn')?.addEventListener('click', async () => {
          const nameInput = el.querySelector('#wc-custom-theme-name');
          const name = nameInput?.value?.trim();
          if (!name) {
            ui?.notifications?.warn?.('Window Controls: Enter a name for the custom theme.');
            return;
          }

          const vars    = WindowControls._readEditorVars(el);
          const taskbar = WindowControls._readTaskbarEditorValues(el);
          let current;
          try { current = game.settings.get(WindowControls.MODULE_ID, 'wcCustomThemes') ?? {}; }
          catch { current = {}; }

          // Saving a named custom theme from an applied unsaved draft clears the temp draft entry.
          if (current[UNSAVED_THEME_ID]) delete current[UNSAVED_THEME_ID];

          const existing = Object.entries(current).find(([id, theme]) => {
            const existingName = String(theme?.name ?? '').trim().toLowerCase();
            return existingName && existingName === name.toLowerCase();
          });

          let id;
          let wasOverwrite = false;
          if (existing) {
            const [existingId, existingTheme] = existing;
            const existingName = existingTheme?.name ?? name;
            const overwrite = await DialogV2.confirm({
              window: { title: 'Overwrite Custom Theme?', positioned: true },
              content: `<p>A custom theme named <strong>${foundry.utils.escapeHTML(existingName)}</strong> already exists. Overwrite it?</p>`,
              yes: { label: 'Overwrite', icon: 'fas fa-save', callback: () => true },
              no:  { label: 'Cancel', callback: () => false },
              rejectClose: false,
            });
            if (!overwrite) return;
            id = existingId;
            wasOverwrite = true;
          } else {
            id = 'custom_' + name.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 32) + '_' + Date.now().toString(36);
          }

          customThemes = { ...current, [id]: { name, variables: vars, taskbar } };
          await game.settings.set(WindowControls.MODULE_ID, 'wcCustomThemes', customThemes);

          // Saving a named custom theme clears the session unsaved reminder.
          WindowControls._themeUnsavedPending = false;
          WindowControls._themeUnsavedBaseId = id;

          ui?.notifications?.info?.(
            wasOverwrite
              ? `Window Controls: Overwrote custom theme "${name}".`
              : `Window Controls: Saved custom theme "${name}".`
          );
          if (nameInput) nameInput.value = '';
          // Refresh select options.
          if (themeSelect) {
            themeSelect.innerHTML = buildThemeOptions(id);
            el.querySelector('#wc-delete-row').style.display = '';
          }
        });

        // Delete custom theme.
        el.querySelector('#wc-delete-custom-btn')?.addEventListener('click', async () => {
          const selectedId = themeSelect?.value;
          if (!selectedId || !customThemes[selectedId]) return;
          const themeName = customThemes[selectedId]?.name ?? selectedId;
          const confirmed = await DialogV2.confirm({
            window: { title: 'Delete Custom Theme?', positioned: true },
            content: `<p>Delete custom theme <strong>${themeName}</strong>? This cannot be undone.</p>`,
            yes: { label: 'Delete', icon: 'fas fa-trash', callback: () => true },
            no:  { label: 'Cancel', callback: () => false },
            rejectClose: false,
          });
          if (!confirmed) return;
          delete customThemes[selectedId];
          await game.settings.set(WindowControls.MODULE_ID, 'wcCustomThemes', { ...customThemes });
          ui?.notifications?.info?.(`Window Controls: Deleted custom theme "${themeName}".`);
          const fallbackId = WindowControls._wcnThemes[0]?.id ?? 'theme1';
          if (themeSelect) {
            themeSelect.innerHTML = buildThemeOptions(fallbackId);
            el.querySelector('#wc-delete-row').style.display = 'none';
          }
        });

        // Export.
        el.querySelector('#wc-export-btn')?.addEventListener('click', async () => {
          await WindowControls._exportCustomThemes();
        });

        // Import.
        el.querySelector('#wc-import-btn')?.addEventListener('click', async () => {
          const imported = await WindowControls._importCustomThemes();
          if (imported) {
            try { customThemes = game.settings.get(WindowControls.MODULE_ID, 'wcCustomThemes') ?? {}; }
            catch { customThemes = {}; }
            const currentSel = themeSelect?.value ?? initialThemeId;
            if (themeSelect) themeSelect.innerHTML = buildThemeOptions(currentSel);
          }
        });

        // Init preview on open.
        syncCustomSvgRowVisibility();
        WindowControls._updateThemePreview(el);
      }
    });
  }

  // Applies the selected theme/mode plus current editor values from the Theme Manager dialog.
  // This allows testing unsaved tweaks immediately without saving a custom theme first.
  static async _themeManagerApply(dialogEl, customThemes, isGM) {
    const UNSAVED_THEME_ID = WindowControls._UNSAVED_THEME_ID;
    const UNSAVED_THEME_NAME = WindowControls._UNSAVED_THEME_NAME;
    const themeSelect = dialogEl.querySelector('[name="wcActiveTheme"]');
    const modeSelect  = dialogEl.querySelector('[name="wcThemeMode"]');
    const selectedId  = themeSelect?.value ?? 'theme2';
    const selectedMode = modeSelect?.value ?? 'gm';

    const currentWorldTheme = (() => {
      try { return game.settings.get(WindowControls.MODULE_ID, 'wcWorldTheme') ?? 'theme2'; }
      catch { return 'theme2'; }
    })();
    const currentPlayerTheme = (() => {
      try { return game.settings.get(WindowControls.MODULE_ID, 'activeTheme') ?? 'theme2'; }
      catch { return 'theme2'; }
    })();

    // Base theme for persisted selected theme settings (never set world/client theme to temp unsaved id).
    const baseThemeId = selectedId === UNSAVED_THEME_ID
      ? (WindowControls._themeUnsavedBaseId || (selectedMode === 'gm' ? currentWorldTheme : currentPlayerTheme))
      : selectedId;

    // Save taskbar color settings.
    const tbText  = dialogEl.querySelector('#wc-taskbar-color-text');
    const tbAlpha = dialogEl.querySelector('#wc-taskbar-color-alpha');
    const scText  = dialogEl.querySelector('#wc-taskbar-scroll-text');
    const scAlpha = dialogEl.querySelector('#wc-taskbar-scroll-alpha');
    if (tbText) {
      const hex  = tbText.value.trim() || '#000000';
      const pct  = Math.max(0, Math.min(100, parseInt(tbAlpha?.value) || 100));
      const aa   = pct < 100 ? Math.round(pct / 100 * 255).toString(16).padStart(2, '0') : '';
      const base = /^#[0-9a-f]{6}$/i.test(hex) ? hex : WindowControls._cssColorToHex(hex);
      try { await game.settings.set(WindowControls.MODULE_ID, 'taskbarColor', aa ? base + aa : base); } catch {}
    }
    if (scText) {
      const hex  = scText.value.trim() || '';
      const pct  = Math.max(0, Math.min(100, parseInt(scAlpha?.value) || 100));
      const aa   = pct < 100 ? Math.round(pct / 100 * 255).toString(16).padStart(2, '0') : '';
      const base = /^#[0-9a-f]{6}$/i.test(hex) ? hex : (hex ? WindowControls._cssColorToHex(hex) : '');
      try { await game.settings.set(WindowControls.MODULE_ID, 'taskbarScrollbarColor', aa ? base + aa : base); } catch {}
    }

    // Save taskbar pattern settings.
    const patSelect = dialogEl.querySelector('#wc-taskbar-pattern');
    const patColorText  = dialogEl.querySelector('#wc-taskbar-pattern-color-text');
    const patOpacityEl  = dialogEl.querySelector('#wc-taskbar-pattern-opacity');
    const patSizeEl     = dialogEl.querySelector('#wc-taskbar-pattern-size');
    const patSvgPathEl  = dialogEl.querySelector('#wc-taskbar-svg-path');
    const selectedPattern = patSelect?.value || 'diagonal';
    const selectedSvgPath = String(patSvgPathEl?.value ?? '').trim();

    if (WindowControls._isCustomSvgPatternKey(selectedPattern) && !selectedSvgPath) {
      ui?.notifications?.warn?.('Window Controls: Select a custom SVG file before applying.');
      return;
    }
    if (WindowControls._isCustomSvgPatternKey(selectedPattern) && !WindowControls._isLikelySvgPath(selectedSvgPath)) {
      ui?.notifications?.warn?.('Window Controls: Please select an SVG file.');
      return;
    }

    if (patSelect) {
      try { await game.settings.set(WindowControls.MODULE_ID, 'taskbarPattern', selectedPattern); } catch {}
    }
    if (patColorText) {
      const hex  = patColorText.value.trim() || '#000000';
      const base = /^#[0-9a-f]{6}$/i.test(hex) ? hex : WindowControls._cssColorToHex(hex);
      try { await game.settings.set(WindowControls.MODULE_ID, 'taskbarPatternColor', base); } catch {}
    }
    if (patOpacityEl) {
      try { await game.settings.set(WindowControls.MODULE_ID, 'taskbarPatternOpacity', parseInt(patOpacityEl.value) || 80); } catch {}
    }
    if (patSizeEl) {
      try { await game.settings.set(WindowControls.MODULE_ID, 'taskbarPatternSize', parseInt(patSizeEl.value) || 4); } catch {}
    }
    if (patSvgPathEl) {
      try {
        await game.settings.set(
          WindowControls.MODULE_ID,
          'taskbarPatternCustomSvgPath',
          WindowControls._isCustomSvgPatternKey(selectedPattern) ? selectedSvgPath : ''
        );
      } catch {}
    }

    if (selectedId !== UNSAVED_THEME_ID) {
      try {
        if (isGM) {
          await game.settings.set(WindowControls.MODULE_ID, 'wcThemeMode', selectedMode);
          if (selectedMode === 'gm') {
            await game.settings.set(WindowControls.MODULE_ID, 'wcWorldTheme', selectedId);
          } else {
            await game.settings.set(WindowControls.MODULE_ID, 'activeTheme', selectedId);
          }
        } else {
          await game.settings.set(WindowControls.MODULE_ID, 'activeTheme', selectedId);
        }
      } catch (e) {
        ui?.notifications?.error?.('Window Controls: Failed to save theme settings — ' + e.message);
        return;
      }
    }

    // Persist a temporary client-side Unsaved Theme snapshot so users can switch away and
    // back to it during later edits. It is cleared when Save Custom is used.
    const vars = WindowControls._readEditorVars(dialogEl);
    const taskbar = WindowControls._readTaskbarEditorValues(dialogEl);
    let currentCustomThemes;
    try { currentCustomThemes = game.settings.get(WindowControls.MODULE_ID, 'wcCustomThemes') ?? {}; }
    catch { currentCustomThemes = {}; }
    currentCustomThemes = {
      ...currentCustomThemes,
      [UNSAVED_THEME_ID]: {
        name: UNSAVED_THEME_NAME,
        variables: vars,
        taskbar,
      }
    };
    await game.settings.set(WindowControls.MODULE_ID, 'wcCustomThemes', currentCustomThemes);

    // Apply the persisted temp unsaved theme directly (instead of only inline overlay).
    WindowControls._applyTheme(UNSAVED_THEME_ID);

    const rootStyle = document.documentElement?.style;
    if (rootStyle) {
      for (const key of WindowControls._WCN_THEME_VARS) {
        if (!key.startsWith('--wc-')) continue;
        const value = vars[key];
        if (typeof value === 'string' && value.trim() !== '') {
          rootStyle.setProperty(key, value.trim());
        }
      }
    }

    // Ensure immediate visual sync without requiring a full page reload.
    WindowControls._applyTaskbarColorFromSetting();
    WindowControls._applyTaskbarScrollbarColorFromSetting();
    await WindowControls._applyTaskbarPatternFromSettings({ notify: true });

    // Mark session as unsaved so the Theme Manager shows an explicit reminder option.
    WindowControls._themeUnsavedPending = true;
    WindowControls._themeUnsavedBaseId = baseThemeId;
  }

  // Measures the sidebar element width and updates the --wc-sidebar-width CSS variable.
  static _updateSidebarWidthVariable() {
    // Measure from #sidebar's left edge so the taskbar extends behind #ui-right-column-1
    // (the chat/notifications column). That column is nudged away from the bar via CSS.
    const sidebar = document.getElementById('sidebar');
    const width = sidebar
      ? Math.max(0, Math.round(window.innerWidth - sidebar.getBoundingClientRect().left) + 6)
      : 0;
    document.documentElement.style.setProperty('--wc-sidebar-width', `${width}px`);
  }

  // Sets up a ResizeObserver that keeps the --wc-sidebar-width variable current when the sidebar resizes.
  static _applySidebarWidthObserver() {
    // Tear down any previous observer.
    if (WindowControls._sidebarResizeObserver) {
      WindowControls._sidebarResizeObserver.disconnect();
      WindowControls._sidebarResizeObserver = null;
    }

    const targets = ['sidebar', 'ui-right']
      .map(id => document.getElementById(id))
      .filter(Boolean);
    if (!targets.length) return;

    WindowControls._updateSidebarWidthVariable();

    WindowControls._sidebarResizeObserver = new ResizeObserver(() => {
      WindowControls._updateSidebarWidthVariable();
    });
    for (const target of targets) {
      WindowControls._sidebarResizeObserver.observe(target);
    }
  }

  // Applies the canvas-only or full-width taskbar body class based on the current setting.
  static _applyTaskbarWidthFromSetting() {
    const canvasOnly = game?.settings?.get(WindowControls.MODULE_ID, 'taskbarWidth') === 'canvasOnly';
    document.body.classList.toggle('wc-taskbar-canvas-only', canvasOnly);
    if (canvasOnly) {
      WindowControls._applySidebarWidthObserver();
    } else {
      if (WindowControls._sidebarResizeObserver) {
        WindowControls._sidebarResizeObserver.disconnect();
        WindowControls._sidebarResizeObserver = null;
      }
      document.documentElement.style.setProperty('--wc-sidebar-width', '0px');
    }
  }

  // ── Settings UI ───────────────────────────────────────────────────────────────
  // Dialogs and enhancements used within Foundry's Settings panel.

  // Opens the GM-only dialog for viewing, editing, or clearing captured sheet default sizes.
  static async _showSheetDefaultsDialog() {
    const DialogV2 = foundry?.applications?.api?.DialogV2;
    if (!DialogV2) {
      ui?.notifications?.warn?.('Window Controls: DialogV2 not available in this version of Foundry.');
      return;
    }

    let learned;
    try { learned = game.settings.get(WindowControls.MODULE_ID, 'learnedSheetDefaults') ?? {}; }
    catch { learned = {}; }
    const entries = Object.entries(learned).sort(([a], [b]) => a.localeCompare(b));

    let bodyHtml;
    if (!entries.length) {
      bodyHtml = `<p class="notification info">No default sizes have been captured yet. Open any sheet once and WCN will record its dimensions automatically.</p>`;
    } else {
      const rows = entries.map(([name, size]) =>
        `<tr>
          <td class="wc-dsd-name">${name}</td>
          <td class="wc-dsd-size">${size.width} &times; ${size.height}</td>
          <td class="wc-dsd-actions">
            <button type="button" class="wc-dsd-edit-btn" data-action="editEntry" data-sheet-name="${name}" title="Edit">
              <i class="fas fa-pencil"></i>
            </button>
          </td>
        </tr>`
      ).join('');
      bodyHtml = `
        <table class="wc-defaults-table">
          <thead><tr><th>Sheet Type</th><th>Size (w &times; h)</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="wc-dsd-clear-row">
          <button type="button" class="wc-dsd-clear-btn" data-action="clearAll" title="Remove all captured sizes">
            <i class="fas fa-trash"></i> Clear All
          </button>
        </div>`;
    }

    await DialogV2.wait({
      window: { title: 'WCN: Learned Sheet Defaults', positioned: true },
      position: { width: 540 },
      content: `<div class="wc-sheet-defaults-dialog">${bodyHtml}</div>`,
      rejectClose: false,
      buttons: [{ action: 'close', label: 'Close', default: true, callback: () => {} }],
      actions: {
        editEntry: async function(event, target) {
          const name = target.dataset.sheetName;
          await this.close({ animate: false });
          await WindowControls._showEditSheetDefaultDialog(name);
          await WindowControls._showSheetDefaultsDialog();
        },
        clearAll: async function(event, target) {
          const confirmed = await DialogV2.confirm({
            window: { title: 'Clear All Learned Defaults?', positioned: true },
            content: '<p>Remove all captured sheet default sizes? They will be re-learned the next time each sheet type is opened.</p>',
            yes: { label: 'Clear All', icon: 'fas fa-trash', callback: () => true },
            no:  { label: 'Cancel',    callback: () => false },
            rejectClose: false,
          });
          if (confirmed) {
            await game.settings.set(WindowControls.MODULE_ID, 'learnedSheetDefaults', {});
            await this.close({ animate: false });
            await WindowControls._showSheetDefaultsDialog();
          }
        }
      }
    });
  }

  // Opens a small dialog to edit one specific sheet type's captured default width and height.
  static async _showEditSheetDefaultDialog(sheetName) {
    const DialogV2 = foundry?.applications?.api?.DialogV2;
    if (!DialogV2) return;

    let learned;
    try { learned = game.settings.get(WindowControls.MODULE_ID, 'learnedSheetDefaults') ?? {}; }
    catch { learned = {}; }
    const current = learned[sheetName] ?? { width: 800, height: 600 };

    const result = await DialogV2.input({
      window: { title: `Edit Default: ${sheetName}`, positioned: true },
      position: { width: 360 },
      content: `
        <div class="wc-edit-default-dialog">
          <p>Override the learned default size for <strong>${sheetName}</strong>.</p>
          <div class="form-group">
            <label>Width (px)</label>
            <div class="form-fields">
              <input type="number" name="width" min="100" max="3840" step="1" value="${current.width}">
            </div>
          </div>
          <div class="form-group">
            <label>Height (px)</label>
            <div class="form-fields">
              <input type="number" name="height" min="100" max="2160" step="1" value="${current.height}">
            </div>
          </div>
        </div>`,
      ok: {
        label: 'Save',
        icon: 'fas fa-save',
        callback: (event, button) => ({
          width:  button.form.elements.width.valueAsNumber,
          height: button.form.elements.height.valueAsNumber
        })
      },
      rejectClose: false
    });

    if (!result) return;
    const { width: w, height: h } = result;
    if (!w || !h || w < 100 || h < 100) {
      ui?.notifications?.warn?.('Window Controls: Width and Height must be at least 100 px.');
      return;
    }
    let cur;
    try { cur = game.settings.get(WindowControls.MODULE_ID, 'learnedSheetDefaults') ?? {}; }
    catch { cur = {}; }
    await game.settings.set(WindowControls.MODULE_ID, 'learnedSheetDefaults', { ...cur, [sheetName]: { width: w, height: h } });
  }

  // Reorganizes the WCN section in the Foundry Settings UI into grouped sections with headers.
  static _organizeSettingsConfig(html) {
    if (!html) return;

    // Foundry hooks sometimes provide jQuery, sometimes a raw HTMLElement.
    const $html = (html?.jquery ? html : $(html));
    if (!$html?.length) return;

    const getGroup = (key) => {
      const input = $html.find(`[name="${WindowControls.MODULE_ID}.${key}"]`);
      if (!input?.length) return null;
      return input.closest('.form-group');
    };

    const organizedMinimize = getGroup('organizedMinimize');
    if (!organizedMinimize?.length) return;

    // Foundry typically renders module settings inside a <fieldset> within the module's category block.
    // Prefer that as our container so we don't accidentally move settings outside this module.
    let moduleRoot = organizedMinimize.closest('fieldset');
    if (!moduleRoot?.length) moduleRoot = organizedMinimize.parent();
    if (!moduleRoot?.length) return;

    // Remove previous injected headers and GM-only buttons if SettingsConfig re-renders.
    moduleRoot.find('.wc-settings-header, .wc-settings-btn-group').remove();

    const taskbarKeys = ['organizedMinimize', 'taskbarWidth', 'taskbarButtonHeight', 'clickOutsideMinimize', 'debugLogging', 'debugVerbose'];
    const windowControlsKeys = ['buttonSize', 'minimizeButton', 'defaultSizeButton', 'maximizeButton', 'maximizeWidth', 'maximizeHeight'];
    const pinningKeys = ['pinnedButton', 'pinnedDoubleTapping', 'rememberPinnedWindows'];
    const themingKeys = ['wcThemeEnabled'];

    const taskbarHeader = $('<h3 class="wc-settings-header">Taskbar</h3>');
    const windowControlsHeader = $('<h3 class="wc-settings-header">Window Controls</h3>');
    const pinningHeader = $('<h3 class="wc-settings-header">Pinning</h3>');
    const themingHeader = $('<h3 class="wc-settings-header">Theming</h3>');

    // WCN master kill-switch comes first, above section headers.
    const wcDisabledGroup = getGroup('wcDisabled');
    if (wcDisabledGroup?.length) moduleRoot.append(wcDisabledGroup);

    // Move settings into a stable order with section headers.
    moduleRoot.append(taskbarHeader);
    for (const key of taskbarKeys) {
      const g = getGroup(key);
      if (g?.length) {
        moduleRoot.append(g);
      }
    }

    moduleRoot.append(windowControlsHeader);
    for (const key of windowControlsKeys) {
      const g = getGroup(key);
      if (g?.length) {
        moduleRoot.append(g);
        if (key === 'defaultSizeButton' && game.user?.isGM) {
          const $btn = $(`
            <div class="form-group wc-settings-btn-group">
              <label>Learned Sheet Defaults</label>
              <div class="form-fields">
                <button type="button" class="wc-sheet-defaults-open-btn">
                  <i class="fas fa-ruler-combined"></i> View / Edit Defaults
                </button>
              </div>
              <p class="hint">View, edit, or clear the per-world default sizes captured the first time each sheet type is opened.</p>
            </div>`);
          $btn.find('.wc-sheet-defaults-open-btn').on('click', () => {
            void WindowControls._showSheetDefaultsDialog();
          });
          moduleRoot.append($btn);
        }
      }
    }

    moduleRoot.append(pinningHeader);
    for (const key of pinningKeys) {
      const g = getGroup(key);
      if (g?.length) moduleRoot.append(g);
    }

    // Theming section: opt-out toggle + Theme Manager button.
    moduleRoot.append(themingHeader);
    for (const key of themingKeys) {
      const g = getGroup(key);
      if (g?.length) moduleRoot.append(g);
    }
    const $themeBtn = $(`
      <div class="form-group wc-settings-btn-group">
        <label>Theme Manager</label>
        <div class="form-fields">
          <button type="button" class="wc-theme-manager-open-btn">
            <i class="fas fa-palette"></i> Open Theme Manager
          </button>
        </div>
        <p class="hint">Choose a preset or custom theme. Create, save, export and import custom themes.</p>
      </div>`);
    $themeBtn.find('.wc-theme-manager-open-btn').on('click', () => {
      void WindowControls._showThemeManagerDialog();
    });
    moduleRoot.append($themeBtn);

    // Hide GM-only settings from non-GM players.
    if (!game.user?.isGM) {
      getGroup('debugLogging')?.remove();
      getGroup('debugVerbose')?.remove();
    }

    // Foundry SettingsConfig escapes HTML in setting labels, so apply bold styling here.
    const debugGroup = getGroup('debugLogging');
    if (debugGroup?.length) {
      const label = debugGroup.find('label').first();
      if (label?.length && label.data('wcDebugLabelBolded') !== 1) {
        label.data('wcDebugLabelBolded', 1);
        const text = label.text();
        label.html(`<b>${text}</b>`);
      }
    }
  }

  // Adds a color-swatch picker widget next to a hex text input in the settings panel.
  static _enhanceColorPickerSetting($html, key) {
    const $text = $html.find(`[name="${WindowControls.MODULE_ID}.${key}"]`);
    if (!$text?.length) return;
    if ($text.data('wcColorEnhanced') === 1) return;
    $text.data('wcColorEnhanced', 1);

    const $fields = $text.closest('.form-fields');
    if (!$fields?.length) return;

    const normalizeForPicker = (value) => {
      if (typeof value !== 'string') return null;
      const v = value.trim();
      if (!v.startsWith('#')) return null;

      // Expand shorthand #RGB/#RGBA.
      if (v.length === 4 || v.length === 5) {
        const r = v[1], g = v[2], b = v[3];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
      }

      // Use the first 6 hex digits (#RRGGBB) even if alpha is present.
      if (v.length >= 7) return v.slice(0, 7).toLowerCase();
      return null;
    };

    const initial = normalizeForPicker($text.val()) ?? '#000000';

    // Foundry core often renders a text field plus a color input; we mirror that behavior.
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.className = 'wc-color-picker';
    picker.value = initial;

    picker.addEventListener('input', () => {
      const color = picker.value;
      $text.val(color);
      // Ensure SettingsConfig notices the update.
      $text.trigger('input');
      $text.trigger('change');
    });

    $text.on('input change', () => {
      const v = normalizeForPicker($text.val());
      if (v) picker.value = v;
    });

    // Insert immediately after the text field.
    $text.after(picker);
  }

}

Hooks.once('init', () => {
  // Expose the class so other modules can call WindowControls.registerApp()
  // from within their window-controls-next.ready listener.
  game.modules.get(WindowControls.MODULE_ID).api = WindowControls;

  if (game.modules.get('minimize-button')?.active) {
    WindowControls.externalMinimize = true;
  }

  if (WindowControls.externalMinimize) return;
  WindowControls.initSettings();
  WindowControls.initHooks();

  // Always-on module startup log.
  if (!WindowControls._loggedStartup) {
    WindowControls._loggedStartup = true;
    const version = WindowControls._getModuleVersion() ?? 'unknown';
    const setting = WindowControls._getTaskbarSetting();
    const state = WindowControls._getTaskbarStateLabel(setting);
    WindowControls._lastLoggedTaskbarState = state;
    WindowControls._logAlways(`Init v${version}`, `(taskbar: ${state})`);
  }
});

Hooks.once('ready', () => {
  if (WindowControls.externalMinimize && game.user.isGM)
    ui.notifications.error("Window Controls: Disabled Minimize Feature because 'Minimize Button' module is active and is not compatible.");

  const rootStyle = document.querySelector(':root').style;
  if (game.modules.get('minimal-ui')?.active) {
    rootStyle.setProperty('--wcbordercolor', game.settings.get('minimal-ui', 'borderColor'));
    rootStyle.setProperty('--wcshadowcolor', game.settings.get('minimal-ui', 'shadowColor'));
    rootStyle.setProperty('--wcshadowstrength', game.settings.get('minimal-ui', 'shadowStrength') + 'px');
  } else {
    rootStyle.setProperty('--wcbordercolor', '#ff730048');
  }

  // Ensure taskbar section exists in taskbar mode.
  WindowControls._applyTaskbarDockLayout();

  // Apply taskbar visual settings after DOM is ready.
  WindowControls._applyTaskbarColorFromSetting();
  WindowControls._applyTaskbarScrollbarColorFromSetting();
  WindowControls._applyTaskbarPatternFromSettings();
  WindowControls._applyPinnedHeaderColorFromSetting();


})
