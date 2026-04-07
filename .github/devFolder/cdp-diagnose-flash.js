// CDP diagnostic: inspect WCN + GM Screen journal state
// Run: node .github/devFolder/cdp-diagnose-flash.js
const WebSocket = require('ws');

const WS_URL = 'ws://localhost:9222/devtools/page/B9E9A6C8C95FAB481FE18A213B610115';

const expression = `(function() {
  const wcn = game.modules.get('window-controls-next')?.api;
  const windows = Object.values(ui.windows ?? {});
  // foundry.applications.instances is a Map in v13, not a plain object
  const instancesMap = foundry?.applications?.instances;
  const appV2 = instancesMap instanceof Map
    ? Array.from(instancesMap.values())
    : Object.values(instancesMap ?? {});
  const instancesType = instancesMap?.constructor?.name ?? typeof instancesMap;

  const allApps = [...windows, ...appV2];

  // GM Screen saved data
  let gmScreenData = null;
  try {
    const gmMod = game.modules.get('gm-screen');
    if (gmMod?.active) {
      const gmSettings = {};
      for (const [key] of game.settings.settings.entries()) {
        if (key.startsWith('gm-screen.')) {
          try { gmSettings[key] = game.settings.get('gm-screen', key.replace('gm-screen.', '')); }
          catch(e) { gmSettings[key] = '(error: ' + e.message + ')'; }
        }
      }
      gmScreenData = { active: true, settings: gmSettings };
    } else { gmScreenData = { active: false }; }
  } catch(e) { gmScreenData = { error: e.message }; }

  return JSON.stringify({
    instancesType,
    taskbarSetting: game.modules.get('window-controls-next')?.api?._getTaskbarSetting?.(),
    isTaskbarMode: (() => { const wcn = game.modules.get('window-controls-next')?.api; const s = wcn?._getTaskbarSetting?.(); return wcn?._isTaskbarMode?.(s); })(),
    rememberedPinnedIds: Array.from(wcn?._rememberedPinnedIds ?? []),
    taskbarEntries: Array.from(wcn?._taskbarEntries?.keys() ?? []),
    openSheets: allApps.map(a => {
      const el = a.element instanceof HTMLElement ? a.element : a.element?.[0];
      const key = wcn?._getAppKey?.(a);
      return {
        name: a.constructor?.name,
        title: a.title ?? a.options?.title,
        rendered: a.rendered,
        _pinned: a._pinned,
        _minimized: a._minimized,
        _wcRestoringFromPersist: a._wcRestoringFromPersist,
        appKey: key,
        isTaskbarTracked: key ? wcn?._taskbarEntries?.has(String(key)) : false,
        wcTaskbarHidden: el?.dataset?.wcTaskbarHidden,
        display: el?.style?.display,
        docUuid: a.document?.uuid ?? a.object?.uuid ?? null,
        appUuid: a.uuid ?? null,
      };
    }),
    gmScreen: gmScreenData,
  }, null, 2);
})()`;

const ws = new WebSocket(WS_URL);
ws.on('open', () => {
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
});
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.id === 1) {
    if (msg.result?.result?.value) {
      console.log(msg.result.result.value);
    } else {
      console.log(JSON.stringify(msg.result, null, 2));
    }
    ws.close();
  }
});
ws.on('error', e => console.error('WS error:', e.message));
