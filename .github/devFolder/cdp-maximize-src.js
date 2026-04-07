const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9222/devtools/page/B9E9A6C8C95FAB481FE18A213B610115');
ws.on('open', () => {
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
    expression: `(function() {
      const proto = foundry.applications.api.ApplicationV2.prototype;
      const maxSrc = proto.maximize?.toString() ?? 'not found';
      const btfSrc = proto.bringToFront?.toString() ?? 'not found';
      return JSON.stringify({ maximize: maxSrc.slice(0, 1500), bringToFront: btfSrc.slice(0, 1500) });
    })()`,
    returnByValue: true
  }}));
});
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.id === 1) {
    const val = msg.result?.result?.value;
    if (val) {
      const obj = JSON.parse(val);
      console.log('=== maximize ===\n' + obj.maximize);
      console.log('\n=== bringToFront ===\n' + obj.bringToFront);
    } else {
      console.log(JSON.stringify(msg.result));
    }
    ws.close();
  }
});
ws.on('error', e => console.error(e.message));
