class WindowControls {

  static MODULE_ID = 'window-controls-next';

  static externalMinimize = false;

  static _PINNED_FLAG_SCOPE = 'window-controls-next';
  static _PINNED_FLAG_KEY = 'pinned-window-ids';

  static _rememberedPinnedIds = new Set();

  static minimizedStash = {};
  static cssMinimizedSize = 150;
  static cssMinimizedBottomBaseline = 70;
  static cssMinimizedTopBaseline = 0;
  static cssTopBarLeftStart = 120;
  static cssTopBarPersistentLeftStart = -5;
  static cssBottomBarLeftStart = 250;

  static getTaskbarTop = () => 2;
  static getTaskbarBot = () => $("#board").height() - 40;

  static debouncedReload = (foundry?.utils?.debounce ?? globalThis.debounce)(() => window.location.reload(), 100);

  static _taskbarEntries = new Map();

  // Hover preview (taskbar buttons)
  static _TASKBAR_HOVER_PREVIEW_DELAY_MS = 1000;

  static _patches = new Map();

  static _barrierWatcherInstalled = false;
  static _barrierEnforcerInstalled = false;

  static _isDebugLoggingEnabled() {
    try {
      return game?.settings?.get(WindowControls.MODULE_ID, 'debugLogging') === true;
    } catch (e) {
      return false;
    }
  }

  static _isVerboseDebugLoggingEnabled() {
    try {
      if (!WindowControls._isDebugLoggingEnabled()) return false;
      return game?.settings?.get(WindowControls.MODULE_ID, 'debugVerbose') === true;
    } catch (e) {
      return false;
    }
  }

  static _debug(...args) {
    if (!WindowControls._isDebugLoggingEnabled()) return;
    // Use console.warn so it shows up even when Info logs are hidden.
    console.warn('Window Controls Next |', ...args);
  }

  static _debugVerbose(...args) {
    if (!WindowControls._isVerboseDebugLoggingEnabled()) return;
    console.log('Window Controls Next |', ...args);
  }

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

  static _getAppHTMLElement(app) {
    const el = app?.element ?? app?._element;
    if (el instanceof HTMLElement) return el;
    if (Array.isArray(el) && el[0] instanceof HTMLElement) return el[0];
    if (el?.jquery && el[0] instanceof HTMLElement) return el[0];
    return null;
  }

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

  static _enforceAllWindowsAgainstTaskbarBarrier() {
    const barrier = WindowControls._getTaskbarBarrierInfo();
    if (!barrier) return;

    const windows = Object.values(ui?.windows ?? {});
    for (const app of windows) {
      WindowControls._clampAppAgainstTaskbarBarrier(app, barrier);
    }
  }

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


  static _isMinimized(app) {
    // In taskbar mode, a hidden-to-taskbar window should be treated as minimized.
    if (WindowControls._isHiddenToTaskbar(app)) return true;
    if (typeof app?.minimized === 'boolean') return app.minimized;
    return !!app?._minimized;
  }

  static _getAppDocumentUuid(app) {
    const docUuid = app?.document?.uuid ?? app?.object?.uuid;
    if (typeof docUuid === 'string' && docUuid.length) return docUuid;
    return null;
  }

  static _isTargetSheet(app) {
    // Only affect Document-backed sheets.
    // Sidebar directories/tabs and other UI apps do not have a Document UUID.
    return !!WindowControls._getAppDocumentUuid(app);
  }

  /**
   * Stable identity used for persistence (remember pinned) and for de-duplicating sheets.
   * IMPORTANT: this must be resolvable after a reload.
   */
  static _getAppPersistentId(app) {
    if (!app) return null;

    // Only persist Document UUIDs.
    return WindowControls._getAppDocumentUuid(app);
  }

  /**
   * Runtime identity for taskbar bookkeeping.
   * Prefer per-instance UUIDs when available (AppV2), otherwise fall back to a persisted id.
   */
  static _getAppRuntimeId(app) {
    if (!app) return null;

    const appUuid = app?.uuid;
    if (typeof appUuid === 'string' && appUuid.length) return appUuid;

    const persistentId = WindowControls._getAppPersistentId(app);
    if (typeof persistentId === 'string' && persistentId.length) return persistentId;

    if (app.appId != null) return String(app.appId);
    return null;
  }

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

  static async _enforceSingleInstanceByPersistentId(app) {
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
  }

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

  static _getRememberedPinnedList() {
    const raw = game.user.getFlag(WindowControls._PINNED_FLAG_SCOPE, WindowControls._PINNED_FLAG_KEY);
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return [];
  }

  static _syncRememberedPinnedCache() {
    const list = WindowControls._getRememberedPinnedList();
    const ids = list
      .map(e => (typeof e === 'string' ? e : e?.id))
      .filter(id => typeof id === 'string' && id.length);
    WindowControls._rememberedPinnedIds = new Set(ids);
  }

  static _isRememberedPinned(app) {
    if (!game.settings.get(WindowControls.MODULE_ID, 'rememberPinnedWindows')) return false;
    const id = WindowControls._getAppPersistentId(app);
    if (!id) return false;
    return WindowControls._rememberedPinnedIds.has(id);
  }

  static _getElement(app) {
    const el = app?.element;
    if (!el) return null;
    if (el instanceof HTMLElement) return el;
    return el?.[0] ?? null;
  }

  static _get$Element(app) {
    const el = WindowControls._getElement(app);
    return el ? $(el) : null;
  }

  static _bringToFront(app) {
    if (!app) return;
    // AppV2: bringToFront is the supported method. AppV1 historically used bringToTop.
    if (typeof app.bringToFront === 'function') return app.bringToFront();
    if (typeof app.bringToTop === 'function') return app.bringToTop();
  }

  static _getTaskbarSetting() {
    const raw = game.settings.get(WindowControls.MODULE_ID, 'organizedMinimize');
    // Migrate legacy values to taskbar modes.
    if (raw === 'persistentTop' || raw === 'persistentBottom' || raw === 'disabled') return raw;
    if (raw === 'top' || raw === 'topBar') return 'persistentTop';
    if (raw === 'bottom' || raw === 'bottomBar') return 'persistentBottom';
    return 'disabled';
  }

  static _isTaskbarMode(setting) {
    return setting === 'persistentTop' || setting === 'persistentBottom';
  }

  static _getTaskbarSection() {
    return document.getElementById('window-controls-persistent');
  }

  static _getTaskbarButtonsContainer() {
    const section = WindowControls._getTaskbarSection();
    if (!section) return null;
    // Newer versions wrap buttons in a scroll container.
    return section.querySelector(':scope > .wc-taskbar-scroll') ?? section;
  }

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
      }, { passive: false });
    }
  }

  static _applyTaskbarDockLayout() {
    const setting = WindowControls._getTaskbarSetting();

    document.body.classList.remove('wc-taskbar-top', 'wc-taskbar-bottom');

    // Keep CSS variable in sync with our expected height.
    const rootStyle = document.documentElement?.style;
    if (rootStyle) rootStyle.setProperty('--wc-taskbar-height', '40px');

    if (!WindowControls._isTaskbarMode(setting)) {
      const existing = WindowControls._getTaskbarSection();
      if (existing?.parentElement) existing.parentElement.removeChild(existing);
      // Kick Foundry layout/canvas to recompute sizes.
      window.dispatchEvent(new Event('resize'));
      return;
    }

    WindowControls._ensureTaskbarSection();
    if (setting === 'persistentTop') document.body.classList.add('wc-taskbar-top');
    if (setting === 'persistentBottom') document.body.classList.add('wc-taskbar-bottom');

    // Kick Foundry layout/canvas to recompute sizes.
    window.dispatchEvent(new Event('resize'));
  }

  static _getTaskbarEntry(app) {
    const key = WindowControls._getAppKey(app);
    if (!key) return undefined;
    return WindowControls._taskbarEntries.get(String(key));
  }

  static _setTaskbarEntry(app, entry) {
    const key = WindowControls._getAppKey(app);
    if (!key) return;
    WindowControls._taskbarEntries.set(String(key), entry);
  }

  static _deleteTaskbarEntry(app) {
    const key = WindowControls._getAppKey(app);
    if (!key) return;
    WindowControls._taskbarEntries.delete(String(key));
  }

  static _isHiddenToTaskbar(app) {
    const el = WindowControls._getElement(app);
    if (!el) return false;
    return el.style.display === 'none' || el.dataset?.wcTaskbarHidden === '1';
  }

  static _showFromTaskbar(app) {
    const el = WindowControls._getElement(app);
    if (!el) return;
    el.style.display = '';
    if (el.dataset) delete el.dataset.wcTaskbarHidden;
    // Maintain our own minimized state when we bypass Foundry's minimize/maximize.
    if (app?._minimized) app._minimized = false;
  }

  static _hideToTaskbar(app) {
    const el = WindowControls._getElement(app);
    if (!el) return;
    el.style.display = 'none';
    if (el.dataset) el.dataset.wcTaskbarHidden = '1';
    // Maintain our own minimized state when we bypass Foundry's minimize/maximize.
    app._minimized = true;
  }

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

    WindowControls._taskbarEntries.set(strKey, existingEntry);
    WindowControls._sortTaskbarButtons();
  }

  static _removeTaskbarButton(app) {
    const key = WindowControls._getAppKey(app);
    if (!key) return;
    const entry = WindowControls._taskbarEntries.get(String(key));
    if (!entry) return;
    if (entry.button?.parentElement) entry.button.parentElement.removeChild(entry.button);
    WindowControls._taskbarEntries.delete(String(key));
    WindowControls._sortTaskbarButtons();
  }

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

  static _getHeaderElement(app, rootElement) {
    const el = rootElement ?? WindowControls._getElement(app);
    if (!el) return null;
    return el.querySelector('.window-header') ?? el.querySelector('header') ?? null;
  }

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

  static _setCloseControlHidden(app, hidden, rootElement) {
    const closeEl = WindowControls._getCloseControlElement(app, rootElement);
    if (!closeEl) return;
    closeEl.style.display = hidden ? 'none' : '';
  }

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

  static _ensureInlineControlsV2(app, rootElement) {
    if (WindowControls._shouldIgnoreApp(app)) return;
    const el = rootElement ?? WindowControls._getElement(app);
    if (!el) return;

    const header = WindowControls._getHeaderElement(app, el);
    if (!header) return;

    // Avoid duplicates on re-render.
    if (header.querySelector('.window-controls-inline')) return;

    const minimizeSetting = game.settings.get(WindowControls.MODULE_ID, 'minimizeButton');
    const pinnedSetting = game.settings.get(WindowControls.MODULE_ID, 'pinnedButton');
    if (minimizeSetting !== 'enabled' && pinnedSetting !== 'enabled') return;

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

    if (pinnedSetting === 'enabled') {
      controls.appendChild(makeControl({
        cls: 'pin',
        icon: 'fas fa-map-pin',
        titleKey: 'WindowControls.Pin',
        onClick: async () => {
          WindowControls.applyPinnedMode(app);
          WindowControls.applyPinnedMode(Object.values(ui.windows).find(w => w.targetApp?.appId === app.appId));
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

  static getStashedKeys() {
    return Object.keys(WindowControls.minimizedStash).map(w => parseInt(w));
  }

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

  static curateId(text) {
    return text.replace(/\W/g, '_');
  }

  static curateTitle(title) {
    return title.replace("[Token] ", "~ ").replace("Table Configuration: ", "");
  }

  static uncurateTitle(title) {
    return title.replace("~ ", "[Token] ");
  }

  static getCurrentMaxGap() {
    const setting = game.settings.get(WindowControls.MODULE_ID, 'organizedMinimize');
    const sidebarGap = WindowControls.cssMinimizedSize * (setting === 'persistentTop' || setting === 'persistentBottom' ? 3 : 4);
    const boardSize = parseInt($("#board").css('width'));
    return boardSize - sidebarGap;
  }

  static getOverflowedState() {
    return Math.max(...WindowControls.getStashedKeys()) >= WindowControls.getCurrentMaxGap();
  }

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

  static async unpersistPinned(app) {
    const id = WindowControls._getAppPersistentId(app);
    if (!id) return;
    const list = WindowControls._getRememberedPinnedList();
    const filtered = list.filter(e => (typeof e === 'string' ? e !== id : e?.id !== id));
    await game.user.setFlag(WindowControls._PINNED_FLAG_SCOPE, WindowControls._PINNED_FLAG_KEY, filtered);
    WindowControls._syncRememberedPinnedCache();
  }

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
        sheet.render(true);
        WindowControls._persistRenderMinimizeRetry(sheet, { position });
      } catch (e) {
        console.warn(`Window Controls: Failed restoring pinned window for id ${id}`, e);
      }
    }
  }

  static toggleMovement(app) {
    const elementJS = WindowControls._getElement(app);
    const stashOverflowed = WindowControls.getOverflowedState();
    if (stashOverflowed) {
      return;
    }

    if (!elementJS) return;

    elementJS.addEventListener('pointerdown', function (ev) {
      if (app._minimized)
        ev.stopImmediatePropagation();
    }, true)

  }

  static positionMinimizeBar() {
    // Legacy minibar feature removed (taskbar-only minimize).
    return;
  }

  static getTopPosition() {
    const minimizedSetting = game.settings.get(WindowControls.MODULE_ID, 'organizedMinimize');
    if (['bottomBar', 'bottom'].includes(minimizedSetting)) {
      let hotbarSetting;
      if (game.modules.get('minimal-ui')?.active)
        hotbarSetting = game.settings.get('minimal-ui', 'hotbar');
      let availableHeight = $("#board").height();
      if (hotbarSetting && (hotbarSetting === 'hidden' || (hotbarSetting === 'onlygm' && !game.user?.isGM)))
        return availableHeight - WindowControls.cssMinimizedBottomBaseline + 65 - 41;
      else
        return availableHeight - WindowControls.cssMinimizedBottomBaseline - 41;
    } else {
      let sceneNavigationSetting;
      let logoSetting;
      if (game.modules.get('minimal-ui')?.active) {
        sceneNavigationSetting = game.settings.get('minimal-ui', 'sceneNavigation');
        logoSetting = game.settings.get('minimal-ui', 'foundryLogoSize');
      }
      let offset;
      if (logoSetting === 'hidden' && sceneNavigationSetting === 'hidden')
        offset = WindowControls.cssMinimizedTopBaseline + 6;
      else {
        const navigation = (
          document.querySelector('#navigation') ||
          document.querySelector('#scene-navigation') ||
          document.querySelector('#ui-top') ||
          ui?.navigation?.element?.[0] ||
          ui?.nav?.element?.[0]
        );
        const navHeight = navigation?.offsetHeight;
        offset = (typeof navHeight === 'number' && navHeight > 0)
          ? navHeight + WindowControls.cssMinimizedTopBaseline + 20
          : WindowControls.cssMinimizedTopBaseline + 6;
      }
      return offset;
    }
  }

  static getLeftPosition(app) {
    const appKey = WindowControls._getAppKey(app);
    const minimizedSetting = game.settings.get(WindowControls.MODULE_ID, 'organizedMinimize');
    const minGap = ['top', 'topBar'].includes(minimizedSetting) ? WindowControls.cssTopBarLeftStart + 10 : (minimizedSetting === 'persistentTop' || minimizedSetting === 'persistentBottom' ? WindowControls.cssTopBarPersistentLeftStart + 10 : WindowControls.cssBottomBarLeftStart + 10);
    const jumpGap = WindowControls.cssMinimizedSize + 10;
    const maxGap = WindowControls.getCurrentMaxGap();
    let targetPos;
    for (let i = minGap; i < maxGap + jumpGap; i = i + jumpGap) {
      const stashEntry = WindowControls.minimizedStash[i];
      if (appKey && stashEntry?.appKey === appKey) {
        stashEntry.oldPosition = Object.assign({}, app.position);
        targetPos = i;
        return targetPos;
      } else if (!targetPos && !stashEntry?.app?.rendered) {
        WindowControls.minimizedStash[i] = {app: app, appKey, oldPosition: Object.assign({}, app.position)};
        targetPos = i;
        return targetPos;
      }
    }
    let appI = app?.position?.left ?? minGap;
    while (appI in WindowControls.minimizedStash) appI += 20;
    WindowControls.minimizedStash[appI] = {app: app, appKey, oldPosition: Object.assign({}, app.position)};
    return appI;
  }

  static setMinimizedPosition(app) {
    const setting = game.settings.get(WindowControls.MODULE_ID, 'organizedMinimize');
    const alreadyStashedWindow = WindowControls.appInStash(WindowControls._getAppKey(app));
    if (!alreadyStashedWindow && WindowControls.getOverflowedState()) return;
    const leftPos = WindowControls.getLeftPosition(app);
    const topPos = WindowControls.getTopPosition();
    app.setPosition({
      left: leftPos ?? app.position.left,
      top: setting === 'persistentTop' ? WindowControls.getTaskbarTop() : setting === 'persistentBottom' ? WindowControls.getTaskbarBot() : (topPos ?? app.position.top),
      width: WindowControls.cssMinimizedSize
    });

    // Foundry's minimized state often anchors windows via "bottom" CSS.
    // Clear the opposing axis so our setPosition top/bottom intent actually applies.
    const el = WindowControls._getElement(app);
    if (el) {
      if (['top', 'topBar', 'persistentTop'].includes(setting)) el.style.bottom = '';
      if (['bottom', 'bottomBar', 'persistentBottom'].includes(setting)) el.style.top = '';
    }

    const z = WindowControls.getOverflowedState() ? 10 : 1;
    const $el = WindowControls._get$Element(app);
    if ($el) $el.css({'z-index': z});
    else {
      if (el) el.style.zIndex = String(z);
    }
  }

  static setRestoredPosition(app) {
    app.setPosition(WindowControls.appInStash(WindowControls._getAppKey(app))?.oldPosition ?? app.position);
  }

  static deleteFromStash(app, keys) {
    const appKey = WindowControls._getAppKey(app);
    let lastDeleted;
    keys.forEach(i => {
      const stash = WindowControls.minimizedStash[i];
      if (stash?.app && appKey && stash.appKey === appKey) {
        lastDeleted = i;
        delete WindowControls.minimizedStash[i];
      } else if (stash && lastDeleted) {
        WindowControls.minimizedStash[lastDeleted] = stash;
        if (WindowControls._isMinimized(stash.app))
          stash.app.setPosition({left: lastDeleted});
        lastDeleted = i;
        delete WindowControls.minimizedStash[i];
      }
    });
  }

  static appInStash(targetId) {
    if (!targetId) return undefined;
    return Object.values(WindowControls.minimizedStash).find(a => a?.appKey === targetId)
  }

  static refreshMinimizeBar() {
    // Legacy minibar feature removed (taskbar-only minimize).
    return;
  }

  static cleanupMinimizeBar(app) {
    // Legacy minibar feature removed (taskbar-only minimize).
    return;
  }

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

  static _removePinnedState(app, el, header) {
    if (header.hasClass('minimized-pinned')) header.removeClass('minimized-pinned');
    delete app._pinned;

    if (app._closeBkp) {
      app.close = app._closeBkp;
      delete app._closeBkp;
    }

    // Dirty hack to prevent very fast minimization (messes up windows size)
    var _bkpMinimize = app.minimize;
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

  static _shouldIgnoreApp(app) {
    if (!app) return true;
    if (!WindowControls._isTargetSheet(app)) return true;
    return app.id === 'tokenizer-control' || app.constructor?.name === 'QuestTracker' || app.constructor?.name === 'ee';
  }

  static _injectHeaderControlsV1(app, buttons) {
    if (WindowControls._shouldIgnoreApp(app)) return;
    const close = buttons.find(b => b.class === 'close');
    if (close) close.label = '';

    const newButtons = [];

    const minimizeSetting = game.settings.get(WindowControls.MODULE_ID, 'minimizeButton');
    if (minimizeSetting === 'enabled') {
      newButtons.push({
        label: "",
        class: "minimize",
        icon: "far fa-window-minimize",
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

    const pinnedSetting = game.settings.get(WindowControls.MODULE_ID, 'pinnedButton');
    if (pinnedSetting === 'enabled') {
      newButtons.push({
        label: "",
        class: "pin",
        icon: "fas fa-map-pin",
        onclick: () => {
          WindowControls.applyPinnedMode(app);
          WindowControls.applyPinnedMode(Object.values(ui.windows).find(w => w.targetApp?.appId === app.appId));
        }
      });
    }

    buttons.unshift(...newButtons);
  }

  static _injectHeaderControlsV2(app, controls) {
    // Intentionally do not add these controls to the AppV2 hamburger menu.
    // We render inline window buttons (left of close) in the `renderApplicationV2` hook.
    return;
  }

  static async renderDummyPanelApp(app) {
    // Legacy persistent dummy windows removed (taskbar-only minimize).
    return;
  }

  static organizedMinimize(app, settings) {
    if (!WindowControls._isTaskbarMode(settings)) return;
    if (WindowControls._shouldIgnoreApp(app)) return;

    WindowControls._createOrUpdateTaskbarButton(app, { pinned: app._pinned === true });
    WindowControls.setMinimizedStyle(app);
    WindowControls._hideToTaskbar(app);
  }

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

  static organizedClose(app, settings) {
    if (!WindowControls._isTaskbarMode(settings)) return;
    WindowControls._removeTaskbarButton(app);
    WindowControls._showFromTaskbar(app);
  }

  static initSettings() {
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
    game.settings.register(WindowControls.MODULE_ID, 'minimizeButton', {
      name: game.i18n.localize("WindowControls.MinimizeButtonName"),
      hint: game.i18n.localize("WindowControls.MinimizeButtonHint"),
      scope: 'world',
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
      scope: 'world',
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
      scope: 'world',
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
      scope: 'world',
      config: true,
      type: String,
      default: "#ff8800",
      onChange: (newValue) => {
        WindowControls._setPinnedHeaderColor(newValue);
      }
    });
    game.settings.register(WindowControls.MODULE_ID, 'taskbarColor', {
      name: game.i18n.localize("WindowControls.TaskbarColorName"),
      hint: game.i18n.localize("WindowControls.TaskbarColorHint"),
      scope: 'world',
      config: true,
      type: String,
      default: "#0000",
      onChange: (newValue) => {
        WindowControls._setTaskbarColor(newValue);
      }
    });

    game.settings.register(WindowControls.MODULE_ID, 'taskbarScrollbarColor', {
      name: game.i18n.localize("WindowControls.TaskbarScrollbarColorName"),
      hint: game.i18n.localize("WindowControls.TaskbarScrollbarColorHint"),
      scope: 'world',
      config: true,
      type: String,
      default: "",
      onChange: (newValue) => {
        WindowControls._setTaskbarScrollbarColor(newValue);
      }
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
          console.warn('Window Controls Next | Debug logging enabled.');
          try { ui?.notifications?.info?.('Window Controls Next: Debug logging enabled'); } catch { /* ignore */ }
        } else {
          console.warn('Window Controls Next | Debug logging disabled.');
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

  }

  static initHooks() {

    Hooks.on('getApplicationV1HeaderButtons', (app, buttons) => {
      WindowControls._injectHeaderControlsV1(app, buttons);
    });

    Hooks.on('getHeaderControlsApplicationV2', (app, controls) => {
      WindowControls._injectHeaderControlsV2(app, controls);
    });

    Hooks.on('renderApplicationV2', (app, element) => {
      WindowControls._ensureInlineControlsV2(app, element);

      // Enforce single open instance per persisted Document UUID.
      void WindowControls._enforceSingleInstanceByPersistentId(app);

      // Safety: don't permanently hide windows across refresh unless we know why.
      const key = WindowControls._getAppKey(app);
      if (element?.style?.display === 'none' && (!key || !WindowControls._taskbarEntries.has(String(key)))) {
        element.style.display = '';
      }

      // Auto-apply remembered pin (for windows opened later).
      if (WindowControls._isRememberedPinned(app)) WindowControls.applyPinnedMode(app, { mode: 'pin' });
    });

    Hooks.on('renderApplicationV1', (app, html) => {
      const el = html?.[0];
      if (!(el instanceof HTMLElement)) return;

      // Enforce single open instance per persisted Document UUID.
      void WindowControls._enforceSingleInstanceByPersistentId(app);

      const key = WindowControls._getAppKey(app);
      if (el.style.display === 'none' && (!key || !WindowControls._taskbarEntries.has(String(key)))) {
        el.style.display = '';
      }

      if (WindowControls._isRememberedPinned(app)) WindowControls.applyPinnedMode(app, { mode: 'pin' });
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

      const wrapAppV1 = (method, fn) => {
        return WindowControls._wrapMethod({
          target: Application.prototype,
          method,
          wrapper: fn,
          name: 'Application.prototype'
        });
      };

      const wrapAppV2 = (method, fn) => {
        const proto = foundry?.applications?.api?.ApplicationV2?.prototype;
        if (!proto) return;
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

      const verboseWrap = (wrapFn, method) => {
        wrapFn(method, function (wrapped, ...args) {
          if (shouldVerboseDebugApp(this)) {
            const first = args?.[0];
            const pos = (first && typeof first === 'object') ? first : undefined;
            WindowControls._debugVerbose(method, WindowControls._debugDescribeApp(this), pos ?? first ?? null);
          }
          return wrapped(...args);
        });
      };

      // Positioning hooks (verbose only).
      verboseWrap(wrapAppV1, 'setPosition');
      verboseWrap(wrapAppV2, 'setPosition');

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
          if (WindowControls._shouldIgnoreApp(this)) return wrapped(...args);
          WindowControls.organizedMinimize(this, settingOrganized);
          return Promise.resolve();
        });

        wrapAppV1('maximize', function (wrapped, ...args) {
          if (WindowControls._shouldIgnoreApp(this)) return wrapped(...args);
          WindowControls.organizedRestore(this, settingOrganized);
          return Promise.resolve();
        });

        wrapAppV1('close', function (wrapped, ...args) {
          WindowControls.organizedClose(this, settingOrganized);
          return wrapped(...args).then(() => {
            WindowControls._removeTaskbarButton(this);
          });
        });
      }

      // AppV2 windows require wrapping their lifecycle methods separately.
      if (WindowControls._isTaskbarMode(settingOrganized)) {
        wrapAppV2('minimize', async function (wrapped, ...args) {
          if (WindowControls._shouldIgnoreApp(this)) return await wrapped(...args);
          WindowControls.organizedMinimize(this, settingOrganized);
          return;
        });

        wrapAppV2('maximize', async function (wrapped, ...args) {
          if (WindowControls._shouldIgnoreApp(this)) return await wrapped(...args);
          WindowControls.organizedRestore(this, settingOrganized);
          return this;
        });

        wrapAppV2('close', async function (wrapped, ...args) {
          WindowControls.organizedClose(this, settingOrganized);
          await wrapped(...args);
          WindowControls._removeTaskbarButton(this);
        });
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

    });

    Hooks.on('closeSidebarTab', function (app) {
      WindowControls._removeTaskbarButton(app);
      WindowControls._showFromTaskbar(app);
    });

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

  static _setTaskbarColor(value) {
    if (typeof value !== 'string') return;
    const rootStyle = document.documentElement?.style;
    if (rootStyle) rootStyle.setProperty('--taskbarcolor', value);

    // Optional direct style fallback (helps if a theme overrides the CSS variable).
    const bar = document.getElementById('window-controls-persistent');
    if (bar) bar.style.backgroundColor = value;
  }

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

  static _applyPinnedHeaderColorFromSetting() {
    try {
      const value = game?.settings?.get(WindowControls.MODULE_ID, 'pinnedHeaderColor');
      if (typeof value === 'string') WindowControls._setPinnedHeaderColor(value);
    } catch (e) {
      // Ignore (e.g. before game/settings available).
    }
  }

  static _applyTaskbarColorFromSetting() {
    try {
      const value = game?.settings?.get(WindowControls.MODULE_ID, 'taskbarColor');
      if (typeof value === 'string') WindowControls._setTaskbarColor(value);
    } catch (e) {
      // Ignore (e.g. before game/settings available).
    }
  }

  static _applyTaskbarScrollbarColorFromSetting() {
    try {
      const value = game?.settings?.get(WindowControls.MODULE_ID, 'taskbarScrollbarColor');
      if (typeof value === 'string') WindowControls._setTaskbarScrollbarColor(value);
    } catch (e) {
      // Ignore (e.g. before game/settings available).
    }
  }

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

    // Remove previous injected headers if SettingsConfig re-renders.
    moduleRoot.find('.wc-settings-header').remove();

    const taskbarKeys = ['organizedMinimize', 'minimizeButton', 'clickOutsideMinimize', 'taskbarColor', 'taskbarScrollbarColor', 'debugLogging', 'debugVerbose'];
    const pinningKeys = ['pinnedButton', 'pinnedHeaderColor', 'pinnedDoubleTapping', 'rememberPinnedWindows'];

    const taskbarHeader = $('<h3 class="wc-settings-header">Taskbar</h3>');
    const pinningHeader = $('<h3 class="wc-settings-header">Pinning</h3>');

    // Move settings into a stable order with section headers.
    moduleRoot.append(taskbarHeader);
    for (const key of taskbarKeys) {
      const g = getGroup(key);
      if (g?.length) moduleRoot.append(g);
    }

    moduleRoot.append(pinningHeader);
    for (const key of pinningKeys) {
      const g = getGroup(key);
      if (g?.length) moduleRoot.append(g);
    }

    // Enhance color settings with a color picker control.
    WindowControls._enhanceColorPickerSetting($html, 'taskbarColor');
    WindowControls._enhanceColorPickerSetting($html, 'taskbarScrollbarColor');
    WindowControls._enhanceColorPickerSetting($html, 'pinnedHeaderColor');

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

Hooks.once('setup', () => {
  // Legacy persistent taskbar layout adjustments removed.
  // Taskbar is now a standalone section with taskbar buttons; windows remain in their normal layer.
})

Hooks.once('init', () => {
  if (game.modules.get('minimize-button')?.active) {
    WindowControls.externalMinimize = true;
  }

  if (WindowControls.externalMinimize) return;
  WindowControls.initSettings();
  WindowControls.initHooks();
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
  WindowControls._applyPinnedHeaderColorFromSetting();


})
