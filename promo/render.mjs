// 逐帧渲染宣传片：node render.mjs [--stills 1.5,5,9]  → build/frames/*.jpg 或 build/stills/*.png
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { launch } from './cdp.mjs';

const FPS = 30, DUR = 30;
const here = new URL('./', import.meta.url).pathname;
const stillsArg = process.argv.indexOf('--stills');
const b = await launch();
await b.viewport(1080, 1920, 1, false);
await b.goto('file://' + here + 'promo.html', 1500);
// 等图片都加载完
await b.eval(`Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })))`);

if (stillsArg > 0) {
  const dir = here + 'build/stills/';
  mkdirSync(dir, { recursive: true });
  for (const t of process.argv[stillsArg + 1].split(',').map(Number)) {
    await b.eval(`render(${t})`);
    writeFileSync(`${dir}t${t}.png`, await b.shot('png'));
    console.log('still', t);
  }
} else {
  const dir = here + 'build/frames/';
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const total = FPS * DUR;
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    await b.eval(`render(${(i / FPS).toFixed(4)})`);
    writeFileSync(`${dir}f${String(i).padStart(4, '0')}.jpg`, await b.shot('jpeg', 92));
    if (i % 90 === 0) console.log(`frame ${i}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  console.log('done', ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
b.close();
