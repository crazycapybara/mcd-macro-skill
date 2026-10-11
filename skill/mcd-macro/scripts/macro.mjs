#!/usr/bin/env node
// 麦克罗 MAC·RO —— 麦当劳健康点餐 Skill 命令行
// 复用网页端同一套推荐算法（assets/app.js），零依赖，Node 18+。
// 有 MCD_MCP_TOKEN 环境变量时，营养数据实时来自麦当劳 MCP；否则用内置的官方数据快照。
//
//   node macro.mjs plan  [--sex m|f] [--height 175] [--weight 70] [--activity light|regular|daily]
//                        [--goal lose|keep|gain] [--scene normal|light|hungry|breakfast]
//                        [--price nutrition|value|protein] [--gold-card] [--breakfast-card] [--top 3] [--json]
//   node macro.mjs tips   [--json]            热量小贴士：份量小但能量足、钠含量较高、解馋款
//   node macro.mjs food   <关键词> [--json]    查单品营养、价格和小贴士
//   node macro.mjs gacha  [--mode ok|treat|random] [...档案参数] [--json]   今天吃啥：随机配一顿
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, '..', 'assets');

// ---------------- 参数 ----------------
const [cmd = 'help', ...rest] = process.argv.slice(2);
const args = { _: [] };
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a.startsWith('--')) { const k = a.slice(2); const v = rest[i + 1]; if (v === undefined || v.startsWith('--')) args[k] = true; else { args[k] = v; i++; } }
  else args._.push(a);
}

// ---------------- 加载网页端算法（无界面模式） ----------------
const stubEl = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stubEl), apply: () => stubEl, set: () => true });
const ctx = vm.createContext({
  console, performance, setTimeout, clearTimeout, URL, URLSearchParams, fetch, Math, JSON, Date,
  document: { querySelector: () => stubEl, querySelectorAll: () => [], addEventListener() {}, body: { dataset: {} } },
  navigator: {}, location: { hash: '', origin: '', pathname: '/' }, history: { replaceState() {} },
});
ctx.window = ctx;
ctx.__MACRO_HEADLESS__ = true;
for (const f of ['foods.snapshot.js', 'menu.default.js', 'app.js']) vm.runInContext(readFileSync(join(ASSETS, f), 'utf8'), ctx, { filename: f });
const E = code => vm.runInContext(code, ctx);

// ---------------- 实时营养数据（可选） ----------------
async function liveFoods() {
  const token = process.env.MCD_MCP_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(process.env.MCD_MCP_URL || 'https://mcp.mcd.cn', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list-nutrition-foods', arguments: {} } }),
      signal: AbortSignal.timeout(15000),
    });
    let raw = await res.text();
    if (!raw.trim().startsWith('{')) raw = raw.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5)).join('');
    const text = (JSON.parse(raw).result?.content || []).map(c => c.text || '').join('\n');
    const j = JSON.parse(text.slice(text.indexOf('{"success'), text.lastIndexOf('}') + 1));
    const lines = String(j.data).trim().split('\n');
    const fields = lines[0].match(/\{(.+)\}/)[1].split(',');
    const seen = new Set(), items = [];
    for (const line of lines.slice(1)) {
      const c = line.trim().split(',');
      if (c.length !== fields.length) continue;
      const r = Object.fromEntries(fields.map((f, i) => [f, c[i]]));
      if (seen.has(r.productName)) continue;
      seen.add(r.productName);
      items.push({ name: r.productName, note: r.nutritionDescription === 'null' ? null : r.nutritionDescription, kj: +r.energyKj, kcal: +r.energyKcal, p: +r.protein, f: +r.fat, c: +r.carbohydrate, na: +r.sodium, ca: +r.calcium });
    }
    return { items, fetchedAt: j.datetime };
  } catch (e) {
    console.error(`⚠️ 实时数据获取失败（${e.message}），改用内置快照`);
    return null;
  }
}

const live = await liveFoods();
ctx.__live = live;
E(`
  state.catalog = window.MENU_DEFAULT.catalog || [];
  if (__live) setFoods(__live.items, { source: 'mcp', fetchedAt: __live.fetchedAt });
  else setFoods(window.FOODS_SNAPSHOT.items, { source: 'snapshot', fetchedAt: window.FOODS_SNAPSHOT.fetchedAt });
`);
const SOURCE = live ? `麦当劳 MCP 实时数据（${live.fetchedAt}）` : `内置官方数据快照（${E('window.FOODS_SNAPSHOT.fetchedAt')}，设置 MCD_MCP_TOKEN 可用实时数据）`;

// ---------------- 档案 ----------------
const ACT = { light: 1.3, regular: 1.55, daily: 1.725 };
const GOAL = { lose: 'cut', keep: 'maintain', gain: 'bulk' };
const SCENE = { normal: 'balanced', light: 'cut', hungry: 'bulk', breakfast: 'breakfast' };
const PRICE = { nutrition: 0, value: 1, protein: 3 };
ctx.__profile = {
  sex: args.sex === 'f' ? 'f' : 'm', height: +(args.height || 175), weight: +(args.weight || 70),
  act: ACT[args.activity] || 1.3, goal: GOAL[args.goal] || 'maintain',
};
ctx.__opts = { scene: SCENE[args.scene] || 'balanced', priceW: PRICE[args.price] ?? 1, gold: !!args['gold-card'], bf: !!args['breakfast-card'] };
E(`
  Object.assign(state.profile, __profile, { ppk: GOALS[__profile.goal].ppk });
  normalizeProfile(state.profile);
  state.solver.scene = __opts.scene; state.solver.priceW = __opts.priceW;
  state.cards = { gold: __opts.gold, breakfast: __opts.bf };
  buildBundles();
`);

const r0 = n => Math.round(n);
const out = (json, md) => console.log(args.json ? JSON.stringify(json, null, 2) : md);
const macroLine = t => `热量 ${r0(t.kcal)} kcal · 蛋白 ${r0(t.p)}g · 碳水 ${r0(t.c)}g · 脂肪 ${r0(t.f)}g · 钠 ${r0(t.na)}mg`;
const FOOT = `\n> 数据来源：${SOURCE}。价格为多家门店菜单汇总的参考价，实际以门店为准；结果仅供参考，不构成医疗或营养建议。`;

// ---------------- 命令 ----------------
if (cmd === 'plan') {
  const top = +(args.top || 3);
  const r = E(`(() => {
    const T = sceneTarget(); const o = effectiveOpts(); const res = solveSmart(T, o);
    return { T, scene: SCENES[o.scene].label, plans: res.picked.slice(0, ${top}).map(p => ({
      name: planLabel(p), price: p.price, fit: p.fit, verdict: diagnose(p.t, T), totals: p.t,
      items: p.parts.flatMap(x => x.picks.map(k => ({ name: k.name, kcal: k.food.kcal * k.qty, swapFrom: k.def && k.name !== k.def ? k.def : null, diff: k.diff, bundle: x.bundle.name }))).concat(p.addons.map(f => ({ name: f.name, kcal: f.kcal, addon: true, price: priceOf(f) }))),
    })) };
  })()`);
  const md = [`## 🍟 麦克罗为你配的这一餐（${r.scene}）`, '',
    `🎯 这一餐目标：${r0(r.T.kcal)} kcal · 蛋白 ${r0(r.T.p)}g（热量只要不超就好，蛋白质够才是重点）`, '',
    ...r.plans.map((p, i) => [
      `### ${i === 0 ? '👑 ' : ''}${i + 1}. ${p.name} —— ¥${p.price ?? '—'} · 契合度 ${p.fit}%`,
      ...p.items.map(it => `- ${it.name}${it.addon ? `（再单点 ¥${it.price}）` : ''}${it.diff ? `（${it.diff > 0 ? '+' : '−'}¥${Math.abs(it.diff)}）` : ''} · ${r0(it.kcal)} kcal${it.swapFrom ? ` 👉 点单时把「${it.swapFrom}」换成它` : ''}`),
      `- ${macroLine(p.totals)}`,
      `- ✅ ${p.verdict}`, ''].join('\n')),
    FOOT].join('\n');
  out(r, md);
} else if (cmd === 'tips') {
  const r = E(`(() => {
    const food = state.foods.filter(isOnSale).filter(f => !f.isDrink);
    const pick = f => ({ name: f.name, kcal: f.kcal, protein: f.p, sodium: f.na, rice: rice(f.kcal), steps: steps(f.kcal) });
    return {
      smallButFilling: food.filter(isSmall).sort((a, b) => b.kcal - a.kcal).slice(0, 8).map(pick),
      higherSodium: food.filter(f => f.cat !== 'combo').sort((a, b) => b.na - a.na).slice(0, 6).map(f => ({ ...pick(f), dayPct: Math.round(f.na / NA_DAY * 100), saltG: Math.round(f.na / NA_PER_SALT * 10) / 10 })),
      lightButSalty: food.filter(f => f.kcal > 0 && f.kcal < 300 && f.na >= 300).sort((a, b) => b.na / b.kcal - a.na / a.kcal).slice(0, 4).map(pick),
      treats: food.filter(f => f.kcal >= 120 && f.pd < 0.08).sort((a, b) => b.kcal - a.kcal).slice(0, 6).map(f => ({ ...pick(f), proteinShare: Math.round(f.pd * 100) })),
    };
  })()`);
  const md = ['## 🔍 麦当劳热量小贴士', '',
    '### 🍚 小份也有能量（🍚 = 一碗米饭约 174 kcal）', ...r.smallButFilling.map(x => `- ${x.name}：${r0(x.kcal)} kcal ≈ ${x.rice} 碗米饭，约走 ${x.steps.toLocaleString()} 步`), '',
    '### 🧂 钠含量较高（全天建议 < 2000mg）', ...r.higherSodium.map(x => `- ${x.name}：钠 ${x.sodium}mg，约全天的 ${x.dayPct}%（≈ ${x.saltG}g 盐）`), '',
    '### 🥣 口味清淡，钠不低', ...r.lightButSalty.map(x => `- ${x.name}：${r0(x.kcal)} kcal，钠 ${x.sodium}mg`), '',
    '### 🍟 解馋款（蛋白较少，适合偶尔犒劳自己）', ...r.treats.map(x => `- ${x.name}：${r0(x.kcal)} kcal，蛋白供能约 ${x.proteinShare}%`),
    FOOT].join('\n');
  out(r, md);
} else if (cmd === 'food') {
  ctx.__q = args._.join(' ').trim();
  if (!ctx.__q) { console.error('用法：node macro.mjs food <关键词>'); process.exit(1); }
  const r = E(`state.foods.filter(f => f.name.includes(__q)).slice(0, 12).map(f => ({ name: f.name, kcal: f.kcal, protein: f.p, carbs: f.c, fat: f.f, sodium: f.na, price: priceOf(f) ?? null, onSale: isOnSale(f), tips: bombBadges(f).map(b => b[1] + '：' + b[2]) }))`);
  const md = r.length ? [`## 「${ctx.__q}」的营养信息`, '', '| 餐品 | 热量 | 蛋白 | 碳水 | 脂肪 | 钠 | 参考价 | 小贴士 |', '|---|---|---|---|---|---|---|---|',
    ...r.map(x => `| ${x.name}${x.onSale ? '' : '（往期/限定）'} | ${r0(x.kcal)} | ${x.protein}g | ${x.carbs}g | ${x.fat}g | ${x.na ?? x.sodium}mg | ${x.price != null ? '¥' + x.price : '—'} | ${x.tips.join('；') || '—'} |`), FOOT].join('\n')
    : `没找到包含「${ctx.__q}」的餐品。`;
  out(r, md);
} else if (cmd === 'gacha') {
  ctx.__mode = { ok: 'ok', treat: 'free', random: 'rand' }[args.mode] || 'ok';
  const r = E(`(() => { gacha.mode = __mode; gacha.locks = {}; const p = rollGacha(); const items = REELS.map(([k]) => p[k]); const t = totalsOf(items.map(f => [f, 1])); const T = mealBudget();
    return { items: items.map(f => f.name), totals: t, target: T.kcal, verdict: gachaVerdict(t.kcal, T.kcal).join(' '), fun: FUN_UNITS.map(([e, l, fmt]) => e + ' ' + l + ' ' + fmt(t.kcal)) }; })()`);
  const md = ['## 🎰 今天吃啥？麦小薯扭蛋机', '', `**${r.items.join(' + ')}**`, '', `- ${macroLine(r.totals)}（这一餐建议约 ${r0(r.target)} kcal）`, `- ${r.verdict}`, `- 🔮 相当于：${r.fun.join(' / ')}`, FOOT].join('\n');
  out(r, md);
} else {
  console.log(readFileSync(join(HERE, '..', 'SKILL.md'), 'utf8').split('## 命令')[1] ? '用法见 SKILL.md「命令」一节：plan / tips / food / gacha' : 'plan | tips | food | gacha');
}
