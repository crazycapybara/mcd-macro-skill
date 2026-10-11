// 宣传片素材：官方商品图（MCP 菜单图片）+ 真实产品页面截图（手机尺寸）
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { launch } from './cdp.mjs';

const OUT = new URL('./build/img/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const SITE = process.argv[2] || 'http://localhost:8787/';

// 1) 官方商品图
const snap = readFileSync(new URL('../public/data/menu.default.js', import.meta.url), 'utf8');
const menu = JSON.parse(snap.slice(snap.indexOf('{'), snap.lastIndexOf('}') + 1));
const all = [...menu.items, ...(menu.catalog || [])];
const want = {
  pie: '派', congee: '粥王系列精选', nugget: '麦乐鸡',
  m1: '板烧鸡腿堡', m2: '麦香鱼', m3: '双层吉士汉堡', m4: '巨无霸',
  s1: '玉米杯', s2: '薯条', s3: '苹果片',
  d1: '可乐', d2: '鲜萃咖啡', d3: '雪碧',
};
for (const [key, name] of Object.entries(want)) {
  const m = all.find(x => x.name === name && x.image);
  if (!m) { console.warn('没找到图片', name); continue; }
  const res = await fetch(m.image);
  writeFileSync(`${OUT}${key}.png`, Buffer.from(await res.arrayBuffer()));
  console.log('img', key, name);
}

// 2) 真实页面截图（全新访客状态）
const b = await launch();
await b.viewport(390, 844, 3, true);
await b.goto(SITE);
await b.eval(`localStorage.clear()`);
const shots = [
  ['screen-solver', '#solver', `document.querySelector('.solve-meta').scrollIntoView(); scrollBy(0, -78)`],
  ['screen-bombs', '#insights', `document.querySelector('.bomb-card').scrollIntoView(); scrollBy(0, -78)`],
];
for (const [name, hash, js] of shots) {
  await b.goto(SITE + '?promo=' + name + hash, 6000);
  await b.eval(`(async () => { ${js}; await new Promise(r => setTimeout(r, 1200)); })()`);
  writeFileSync(`${OUT}${name}.png`, await b.shot('png'));
  console.log('shot', name);
}
b.close();
