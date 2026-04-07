const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9222/devtools/page/B9E9A6C8C95FAB481FE18A213B610115');
ws.on('open', () => {
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
    expression: `(function() {
      const src = foundry.applications.api.ApplicationV2.toString();
      const idx = src.indexOf('async #render');
      return src.slice(idx, idx + 4000);
    })()`,
    returnByValue: true
  }}));
});
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.id === 1) {
    console.log(msg.result?.result?.value ?? JSON.stringify(msg.result));
    ws.close();
  }
});
ws.on('error', e => console.error(e.message));
