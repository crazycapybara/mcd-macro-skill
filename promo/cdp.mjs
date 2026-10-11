// 零依赖 Chrome DevTools Protocol 小工具：启动无头 Chrome，提供 send / screenshot
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'promo-chrome-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    '--force-color-profile=srgb', '--font-render-hinting=none', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsBrowser = await new Promise((resolve, reject) => {
    let buf = '';
    proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
    setTimeout(() => reject(new Error('Chrome 启动超时')), 15000);
  });
  const port = new URL(wsBrowser).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
    else if (msg.method && listeners.has(msg.method)) listeners.get(msg.method).forEach(fn => fn(msg.params));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
  const once = method => new Promise(r => { const fn = p => { listeners.set(method, (listeners.get(method) || []).filter(f => f !== fn)); r(p); }; listeners.set(method, [...(listeners.get(method) || []), fn]); });
  await send('Page.enable');
  await send('Runtime.enable');
  return {
    send,
    async viewport(width, height, scale = 1, mobile = false) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
    },
    async goto(url, waitMs = 0) {
      const loaded = once('Page.loadEventFired');
      await send('Page.navigate', { url });
      await loaded;
      if (waitMs) await new Promise(r => setTimeout(r, waitMs));
    },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async shot(format = 'png', quality) {
      const r = await send('Page.captureScreenshot', { format, ...(quality ? { quality } : {}), captureBeyondViewport: false });
      return Buffer.from(r.data, 'base64');
    },
    close() { try { ws.close(); } catch {} proc.kill(); },
  };
}
