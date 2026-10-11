/* 麦克罗 MAC·RO —— 健身人群的麦当劳宏量营养计算器
 * 纯原生 JS，无构建。模块：数据层 / 档案计算 / 配餐求解器 / 组餐托盘 / 洞察 / 门店实时 / 记录 / 战报海报 */
'use strict';

// ============================================================ utils
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r0 = n => Math.round(n);
const r1 = n => Math.round(n * 10) / 10;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const store = {
  get(k, d) { try { const v = localStorage.getItem('macro.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('macro.' + k, JSON.stringify(v)); } catch { /* 隐私模式 */ } },
};
function toast(msg, ms = 2400) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms);
}
async function api(path) {
  const res = await fetch(path);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}
const ZERO = () => ({ kcal: 0, p: 0, c: 0, f: 0, na: 0, ca: 0, price: 0, priced: true, n: 0 });

// ============================================================ 数据层：分类 / 规格 / 价格匹配
// 只在开心乐园餐内供应、无法单点的单品
const KIDS_ONLY = new Set(['儿童鱼排堡', '麦乐鸡4块']);
const COMBOS = new Set(['果然多肉', '“苹板”支撑Pro', '专“薯鱼”你', '绝代双翅', '牛气满满', '蜜汁快乐']);
// 麦当劳官方「500大卡套餐」：营养库里是整套合计值。组成来自 MCP query-meal-detail（门店在售的才有）
const COMBO_INFO = {
  '“苹板”支撑Pro': '板烧鸡腿堡 + 小杯玉米杯 + 苹果片 + 零卡饮料',
  牛气满满: '培根蔬萃双层牛堡 + 小杯玉米杯 + 零卡饮料',
};
const comboNote = f => COMBO_INFO[f.name] ? `500大卡套餐：${COMBO_INFO[f.name]}` : '500大卡套餐（整套营养合计）· 门店菜单暂未见，可能为往期或地区限定';
const CATS = [
  { key: 'combo', label: '500大卡套餐', emoji: '🎯', color: '#B794F6', test: n => COMBOS.has(n) },
  { key: 'breakfast', label: '早餐', emoji: '🌅', color: '#F6AD55', re: /麦满分|早安|粥|油条|薯饼|炒双蛋|图林根|豆浆/ },
  { key: 'burger', label: '汉堡/卷', emoji: '🍔', color: '#FC8181', re: /堡|巨无霸|麦香鸡|麦香鱼|叠叠卷/ },
  { key: 'chicken', label: '炸鸡小食', emoji: '🍗', color: '#F6875A', re: /麦乐鸡|翅|脆汁鸡|鸡排|鸡球|多笋卷/ },
  { key: 'side', label: '薯条配餐', emoji: '🍟', color: '#F6E05E', re: /薯条|玉米杯|苹果片/ },
  { key: 'dessert', label: '甜品', emoji: '🍦', color: '#F687B3', re: /新地|麦旋风|派|冰淇淋|拉明顿|yeyeyeye|阿芙佳朵|雪冰/ },
  { key: 'cafe', label: '麦咖啡/奶', emoji: '☕', color: '#C4A484', re: /咖啡|美式|奶铁|玛奇朵|卡布奇诺|牛奶|燕麦奶|黑巧|抹茶|朱古力/ },
  { key: 'drink', label: '饮料', emoji: '🥤', color: '#63B3ED', re: /./ },
];
const CAT = Object.fromEntries(CATS.map(c => [c.key, c]));
const classify = n => CATS.find(c => (c.test ? c.test(n) : c.re.test(n))).key;
const SIZE_RE = /^(大杯|中杯|小杯|迷你|大|中|小)(?=.)|(大杯|中杯|小杯)$/;

// 营养表名称 → 门店菜单名称（菜单默认规格）
const PRICE_ALIAS = {
  中薯条: '薯条', 麦乐鸡5块: '麦乐鸡', '纯牛奶（盒装）': '纯牛奶(盒装)', '100%苹果汁': '100% 苹果汁(盒装)', 麦旋酷阳光橙: '阳光橙麦炫酷',
  那么大鸡排: '那么大鸡排（椒盐风味）', '麦麦脆汁鸡-琵琶腿': '麦麦脆汁鸡1块', '麦麦脆汁鸡-带骨里脊': '麦麦脆汁鸡1块',
  草莓新地: '新地', 朱古力新地: '新地', 菠萝派: '派', 香芋派: '派', 奥利奥麦旋风: '经典麦旋风', 小杯鲜萃咖啡: '鲜萃咖啡',
  '麦辣鸡翅-2块': '麦辣鸡翅', 可乐中杯: '可乐',
  // 麦咖啡：菜单按饮品卖（冰热同价、默认中杯），营养库按冰/热 + 杯型拆分
  冰美式中杯: '麦咖啡™美式', 冰奶铁中杯: '麦咖啡™奶铁', 冰燕麦奶铁中杯: '燕麦奶铁', 热燕麦奶铁中杯: '燕麦奶铁',
  冰浓浓黑巧中杯: '浓浓黑巧（冰/热）', 热浓浓黑巧中杯: '浓浓黑巧（冰/热）', 冰浓浓燕麦黑巧中杯: '浓浓燕麦黑巧（冰/热）', 热浓浓燕麦黑巧中杯: '浓浓燕麦黑巧（冰/热）',
  卡布奇诺中杯: '卡布奇诺', 热牛奶中杯: '牛奶', 雪碧中杯: '雪碧', 阳光柠檬红茶中杯: '阳光柠檬红茶', '中杯怡泉+C': '怡泉+C',
};
const normName = s => String(s).replace(/^麦咖啡™?/, '').replace(/[\s()（）【】“”"·]/g, '').replace(/套餐$/, '');

function buildFood(raw) {
  const cat = classify(raw.name);
  const sm = raw.name.match(SIZE_RE);
  const size = sm ? (sm[1] || sm[2]).replace('杯', '') : '';
  const kcal = raw.kcal || 0;
  // 雪冰是一大杯冰饮、豆浆是含糖饮品：都按饮品算（套餐里的饮料轮优先零卡/黑咖）
  const isDrink = cat === 'drink' || cat === 'cafe' || /雪冰|豆浆/.test(raw.name);
  return {
    id: raw.name, name: raw.name, cat, size, note: raw.note,
    kcal, p: raw.p, c: raw.c, f: raw.f, na: raw.na, ca: raw.ca,
    pd: kcal > 0 ? raw.p * 4 / kcal : 0, // 蛋白供能比
    isDrink, kidsOnly: KIDS_ONLY.has(raw.name),
    zeroCal: isDrink && kcal <= 20,
    maxQty: cat === 'combo' || cat === 'dessert' || isDrink ? 1 : 2,
  };
}

// ============================================================ 吉祥物「麦小薯」
const MASCOT_RAW = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 132"><g stroke="#2B2118" stroke-width="3.5" stroke-linejoin="round"><rect x="30" y="16" width="13" height="56" rx="5" fill="#FFD23F" transform="rotate(-12 36 44)"/><rect x="46" y="6" width="13" height="64" rx="5" fill="#FFD23F"/><rect x="62" y="9" width="13" height="60" rx="5" fill="#FFD23F" transform="rotate(7 68 39)"/><rect x="77" y="20" width="13" height="52" rx="5" fill="#FFD23F" transform="rotate(16 83 46)"/><path d="M17 56 Q60 68 103 56 L92 122 Q60 131 28 122 Z" fill="#EE4B3B"/></g><circle cx="47" cy="91" r="5.5" fill="#2B2118"/><circle cx="73" cy="91" r="5.5" fill="#2B2118"/><circle cx="48.8" cy="89.2" r="1.9" fill="#fff"/><circle cx="74.8" cy="89.2" r="1.9" fill="#fff"/><ellipse cx="37" cy="101" rx="6.5" ry="3.8" fill="#FF9AA2"/><ellipse cx="83" cy="101" rx="6.5" ry="3.8" fill="#FF9AA2"/><path d="M54 100 Q60 107 66 100" fill="none" stroke="#2B2118" stroke-width="3" stroke-linecap="round"/></svg>`;
const MASCOT = MASCOT_RAW.replace('<svg ', '<svg class="mascot" aria-hidden="true" ');
const MASCOT_SM = MASCOT_RAW.replace('<svg ', '<svg class="mascot sm" aria-hidden="true" ');

// ============================================================ 全局状态
// 旧版本保存的档案：年龄统一 23 岁；五档运动并为三档
function normalizeProfile(p) {
  p.age = 23; // 不再询问年龄
  p.act = +p.act <= 1.4 ? 1.3 : +p.act >= 1.7 ? 1.725 : 1.55;
  return p;
}
const DEFAULT_PROFILE = { sex: 'm', age: 23, height: 175, weight: 75, bf: '', act: 1.3, goal: 'maintain', ppk: 1.2, fatPct: 28, meals: 3, cycling: false, training: true };
const state = {
  foods: [], byId: new Map(), meta: { source: 'snapshot', fetchedAt: '' },
  profile: normalizeProfile({ ...DEFAULT_PROFILE, ...store.get('profile', {}) }),
  hasProfile: !!store.get('profile', null),
  log: store.get('log', {}),
  tray: new Map(),
  cards: { breakfast: false, gold: false, ...store.get('cards', {}) },
  catalog: window.MENU_DEFAULT?.catalog || [], onSale: new Set(), newItems: [],
  storeSel: null, // 不再选店：默认所有在售产品都能买到，价格用多家门店菜单汇总的参考价
  prices: new Map(),
  bundles: [], coupons: [], couponsRaw: null,
  solver: { coupons: 'now', claimable: false, buy: 'smart', priceW: 1, scene: 'balanced', maxItems: 4, drinks: 'milk', daypart: 'auto', noDessert: true, kids: false, naCap: 2000, budget: 0, pricedOnly: false, custom: null },
  insightsSort: 'pd',
  builder: { q: '', cat: 'all', sort: 'default', highP: false, showPast: false },
};

function setFoods(items, meta) {
  state.foods = items.map(buildFood);
  state.byId = new Map(state.foods.map(f => [f.id, f]));
  state.meta = meta;
  applyPrices();
  buildBundles();
  buildCoupons();
}

function applyPrices() {
  state.prices.clear();
  // 先用默认菜单，再用多家门店的在售目录补齐价格
  const menu = [...(menuSrc()?.items || []), ...(state.catalog || [])];
  // 单品只匹配单品菜单、500大卡套餐只匹配套餐菜单：避免「吉士汉堡包」被「吉士汉堡包套餐」的价格覆盖
  const isSet = n => /套餐$|件套|组合$|随心|双人|多人/.test(n);
  const single = new Map(), sets = new Map();
  for (const m of menu) { const idx = isSet(m.name) ? sets : single; const k = normName(m.name); if (!idx.has(k)) idx.set(k, m); }
  for (const f of state.foods) {
    const m = (f.cat === 'combo' ? sets : single).get(normName(PRICE_ALIAS[f.name] || f.name));
    if (m && m.price > 0) state.prices.set(f.id, m);
  }
  computeOnSale();
}

// ── 在售判定：多家参考门店菜单（正餐+早餐）∪ 当前门店菜单 ∪ 套餐子项。都不在 → 往期/限定
// 菜单名 → 营养库里对应的多个单品（规格/口味在 App 里点单时再选）
const SALE_ALIAS = {
  玉米杯: ['小杯玉米杯', '大杯玉米杯'], 燕麦奶: ['冰燕麦奶中杯', '热燕麦奶中杯'], 优品豆浆: ['优品豆浆小杯', '优品豆浆大杯'],
  粥王系列精选: ['皮蛋鸡肉粥', '雪菜脆笋鸡肉粥'], 新地: ['草莓新地', '朱古力新地'], 派: ['菠萝派', '香芋派'],
  牛奶: ['热牛奶中杯'], 浓浓黑巧雪冰: ['浓浓黑巧雪冰中杯'],
};
const NOT_FOOD = /帽|挠|捶|饼干|周边|丝巾|卡$|随心选|单品精选|学生|开心乐园|套$|套餐|餐$|盒|拼|盘|酱$|组合$|两件套/;
const sizeBase = n => n.replace(SIZE_RE, '');
function computeOnSale() {
  const menuNames = new Map(); // normName → 菜单条目
  const add = m => { const k = normName(m.name); if (!menuNames.has(k)) menuNames.set(k, m); };
  (state.catalog || []).forEach(add);
  (menuSrc()?.items || []).forEach(add);
  const on = new Set();
  for (const f of state.foods) if (menuNames.has(normName(PRICE_ALIAS[f.name] || f.name))) on.add(f.id);
  for (const [menuName, ids] of Object.entries(SALE_ALIAS)) if (menuNames.has(normName(menuName))) ids.forEach(id => on.add(id));
  for (const b of menuSrc()?.bundles || []) for (const r of b.rounds) for (const c of r.choices) { const m = matchChoice(c.name); if (m) on.add(m.food.id); }
  // 开心乐园餐专属单品：菜单里有开心乐园餐就算在售（只是不能单点）
  if ([...menuNames.keys()].some(k => k.includes('开心乐园'))) for (const f of state.foods) if (f.kidsOnly) on.add(f.id);
  // 同一产品的其他杯型也算在售（App 里点单时可选大/中/小）
  const bases = new Set([...on].map(id => sizeBase(id)));
  for (const f of state.foods) if (f.size && bases.has(sizeBase(f.name))) on.add(f.id);
  state.onSale = on;
  // 菜单里有、营养库没有的 → 新品（官方营养数据未公布）
  const matched = new Set();
  for (const f of state.foods) matched.add(normName(PRICE_ALIAS[f.name] || f.name));
  Object.keys(SALE_ALIAS).forEach(k => matched.add(normName(k)));
  const seen = new Set();
  state.newItems = [...menuNames.values()].filter(m => {
    const k = normName(m.name);
    if (matched.has(k) || seen.has(k) || /^99/.test(m.code || '') || NOT_FOOD.test(m.name) || !(m.price >= 5)) return false;
    if (state.foods.some(f => normName(f.name).includes(k) || k.includes(normName(f.name)) && k.length - normName(f.name).length <= 2)) return false;
    seen.add(k);
    return true;
  });
}
const isOnSale = f => !state.onSale?.size || state.onSale.has(f.id);
// 价格/套餐来源：已选门店（实时或预约菜单）→ 否则默认菜单（内置快照，参考价）
function menuSrc() {
  const s = state.storeSel;
  if (s?.items?.length) return { ...s, kind: s.mode === 'reservation' ? 'reservation' : 'live' };
  const d = window.MENU_DEFAULT;
  return d ? { ...d, kind: 'default', unavailableStore: s?.mode === 'unavailable' ? s.name : null } : null;
}
function priceLabel(src = menuSrc()) {
  if (!src) return '暂无价格';
  if (src.kind === 'live') return `实时价格 · ${src.name.replace(/^麦当劳/, '')}`;
  if (src.kind === 'reservation') return `${src.name.replace(/^麦当劳/, '')} 打烊中 · 按 ${src.reservationDate} 预约菜单的价格`;
  return '参考价 · 多家门店菜单汇总，实际以门店为准';
}
// 会员价：MCP 的「现价」可能是早餐卡 / 麦金卡价，没卡的人按原价算
function effPrice(m) {
  const d = m.discount || '';
  const needs = /早餐卡/.test(d) ? 'breakfast' : /麦金卡/.test(d) ? 'gold' : null;
  return needs && !state.cards[needs] ? (m.originalPrice || m.price) : m.price;
}
const memberTag = m => { const d = m.discount || ''; return (/早餐卡/.test(d) && state.cards.breakfast) ? '🌅 早餐卡价' : (/麦金卡/.test(d) && state.cards.gold) ? '👑 麦金卡价' : ''; };
function cardChipsHtml() {
  const src = menuSrc();
  const all = [...(src?.items || []), ...(src?.bundles || [])];
  const n = k => all.filter(m => new RegExp(k).test(m.discount || '')).length;
  const gold = n('麦金卡'), bf = n('早餐卡');
  const note = !src ? '' : gold + bf === 0
    ? `<p class="card-note">菜单里没有会员价商品，开不开卡价格都一样。</p>`
    : `<p class="card-note">会员价商品：麦金卡 ${gold} 款（主要是四件套系列）· 早餐卡 ${bf} 款</p>`;
  return `<div class="field"><label>我有的会员卡 <small>MCP 的现价有些是会员价，没卡按原价算</small></label>${note}<div class="chips">
    <button type="button" class="chip ${state.cards.breakfast ? 'on' : ''}" data-card="breakfast">🌅 早餐卡</button>
    <button type="button" class="chip ${state.cards.gold ? 'on' : ''}" data-card="gold">👑 麦金卡</button></div></div>`;
}
const priceOf = f => { const m = state.prices.get(f.id); return m ? effPrice(m) : undefined; };
const imageOf = f => state.prices.get(f.id)?.image;

// ============================================================ 档案计算（BMR / TDEE / 宏量）
const GOALS = {
  cut: { label: '想瘦一点', adj: -0.20, ppk: 1.6, tip: '每天少吃约 20%' },
  maintain: { label: '保持现在', adj: 0, ppk: 1.2, tip: '吃够、不超标' },
  bulk: { label: '想壮一点', adj: 0.10, ppk: 1.8, tip: '多吃 10%，配合运动' },
  recomp: { label: '重组', adj: 0, ppk: 2.0, tip: '维持热量，靠训练日/休息日碳循环做身体重组', hidden: true },
};
const ACTS = [
  [1.3, '偶尔动动', '久坐上班，偶尔运动'], [1.55, '经常运动', '每周 3-5 次'], [1.725, '天天运动', '每周 6-7 次'],
];

function calcTargets(p = state.profile) {
  const w = +p.weight, h = +p.height, a = +p.age, bf = +p.bf;
  const useKatch = bf > 3 && bf < 60;
  const lbm = useKatch ? w * (1 - bf / 100) : null;
  const bmr = useKatch ? 370 + 21.6 * lbm : 10 * w + 6.25 * h - 5 * a + (p.sex === 'm' ? 5 : -161);
  const tdee = bmr * p.act;
  const dayAdj = p.cycling ? (p.training ? 0.05 : -0.08) : 0;
  const kcal = tdee * (1 + GOALS[p.goal].adj + dayAdj);
  const prot = p.ppk * w;
  const fat = Math.max(0.6 * w, kcal * p.fatPct / 100 / 9);
  const carb = Math.max(0, (kcal - prot * 4 - fat * 9) / 4);
  return { bmr, tdee, kcal, p: prot, c: carb, f: fat, method: useKatch ? 'Katch-McArdle（按去脂体重）' : 'Mifflin-St Jeor', lbm, dayAdj };
}

function eatenOn(day = todayKey()) {
  const t = ZERO();
  for (const e of state.log[day] || []) for (const k of ['kcal', 'p', 'c', 'f', 'na']) t[k] += e.totals[k];
  return t;
}

// ============================================================ 求解器：宏量目标 → 最优组合（束搜索）
const SCENES = {
  balanced: { label: '正常一顿', icon: '🍽️', desc: '按你每天的需要来', kcalMul: 1 },
  cut: { label: '少吃也能饱', icon: '🥗', desc: '控热量、蛋白照样吃够', kcalMul: 0.8, pMul: 1.0 },
  bulk: { label: '饿了吃顿好的', icon: '🍔', desc: '吃饱吃好，热量放宽些', kcalMul: 1.3, pMul: 1.2 },
  breakfast: { label: '早餐专区', icon: '🌅', desc: '早餐菜单里最健康的搭配', kcalMul: 0.55, pMul: 0.85 }, // 早餐宜清爽：热量约这一餐的 55%，蛋白不跟着降太多
};

const MEAL_SHARE = 0.35;
function mealBudget() {
  const T = calcTargets();
  const per = MEAL_SHARE; // 大多数人一天只吃一顿麦当劳：按一顿正餐占全天约 35% 给建议
  return { kcal: T.kcal * per, p: T.p * per, c: T.c * per, f: T.f * per };
}

function sceneTarget(key = state.solver.scene) {
  if (state.solver.custom) return state.solver.custom;
  const T = calcTargets();
  if (key === 'remain') {
    const e = eatenOn();
    const rem = { kcal: T.kcal - e.kcal, p: T.p - e.p, c: T.c - e.c, f: T.f - e.f };
    const mb = mealBudget();
    // 剩余太少时至少给一顿“轻餐”的量，防止目标为负
    return { kcal: Math.max(rem.kcal, mb.kcal * 0.35), p: Math.max(rem.p, 15), c: Math.max(rem.c, 10), f: Math.max(rem.f, 5) };
  }
  const mb = mealBudget();
  const s = SCENES[key];
  if (!s.split) return { kcal: mb.kcal * s.kcalMul, p: mb.p * (s.pMul ?? s.kcalMul), c: mb.c * s.kcalMul, f: mb.f * s.kcalMul };
  const kcal = mb.kcal * s.kcalMul;
  return { kcal, p: kcal * s.split[0] / 4, c: kcal * s.split[1] / 4, f: kcal * s.split[2] / 9 };
}

function addTotals(t, f, q = 1) {
  const pr = priceOf(f);
  return {
    kcal: t.kcal + f.kcal * q, p: t.p + f.p * q, c: t.c + f.c * q, f: t.f + f.f * q, na: t.na + f.na * q, ca: t.ca + f.ca * q,
    price: t.price + (pr || 0) * q, priced: t.priced && pr != null, n: t.n + q,
  };
}
function totalsOf(entries) { // entries: [[food, qty]]
  return entries.reduce((t, [f, q]) => addTotals(t, f, q), ZERO());
}

// 非对称损失：减脂时超热量罚得重，蛋白不足罚得重；钠/预算为软约束
function lossOf(t, T, o = state.solver) {
  const rel = (a, b) => (b > 1 ? (a - b) / b : (a - b) / 10);
  const goal = state.profile.goal;
  const dk = rel(t.kcal, T.kcal), dp = rel(t.p, T.p), dc = rel(t.c, T.c), df = rel(t.f, T.f);
  // 健康优先：热量/碳水/脂肪只怕超、不追求吃够；蛋白质达标最重要
  let L = dk > 0 ? (goal === 'bulk' ? 1.2 : 3.2) * dk * dk
    : goal === 'bulk' ? 1.5 * dk * dk // 「想壮一点」才需要吃够
    : dk < -0.45 ? 1.0 * (dk + 0.45) ** 2 : 0; // 少吃不扣分，只有少得离谱才轻扣
  L += dp < 0 ? 4.0 * dp * dp : 0.1 * dp * dp;
  L += dc > 0 ? 1.0 * dc * dc : dc < -0.5 ? 0.3 * (dc + 0.5) ** 2 : 0;
  L += df > 0 ? 2.0 * df * df : 0;
  if (o.naCap && t.na > o.naCap) L += 1.2 * ((t.na - o.naCap) / o.naCap) ** 2 + 0.015;
  if (o.budget && t.price > o.budget) L += 4 * ((t.price - o.budget) / o.budget) ** 2 + 0.03;
  L += 0.006 * t.n;
  return L;
}
const fitScore = L => clamp(Math.round(100 * Math.exp(-0.9 * L)), 0, 100);

// 单项评价（全站统一）：蛋白看够不够；热量/碳水/脂肪只看超没超
function judge(k, v, tg) {
  const ratio = tg > 0 ? v / tg : 0;
  const d = r0(Math.abs(v - tg)), u = k === 'kcal' ? 'kcal' : 'g';
  if (k === 'p') return ratio >= 0.9 ? ['ok', ratio > 1.15 ? '✓ 充足' : '✓ 达标'] : ['under', `少 ${d}${u}`];
  if (k === 'kcal' && state.profile.goal === 'bulk' && ratio < 0.85) return ['under', `少 ${d}${u}`];
  return ratio <= 1.1 ? ['ok', ratio < 0.9 ? '✓ 没超' : '✓ 刚好'] : ['over', `多 ${d}${u}`];
}

// 麦当劳早餐时段（约 5:00–10:30）只供应早餐线，正餐时段不供应早餐线
const isBreakfastTime = (d = new Date()) => { const h = d.getHours() + d.getMinutes() / 60; return h >= 4.5 && h < 10.5; };
function activeDaypart(o = state.solver) { return o.daypart === 'auto' ? (isBreakfastTime() ? 'breakfast' : 'regular') : o.daypart; }

// 「牛奶补蛋白」只算牛奶/奶咖，巧克力、抹茶、焦糖这类甜味奶饮不算
const SWEET_MILK = /黑巧|抹茶|朱古力|焦糖/;
function solverPool(o = state.solver) {
  const dp = activeDaypart(o);
  return state.foods.filter(f => {
    if (f.kcal <= 0 && f.p <= 0) return false;
    if (dp === 'breakfast' && !['breakfast', 'cafe', 'drink'].includes(f.cat)) return false;
    if (dp === 'regular' && f.cat === 'breakfast') return false;
    if (o.noDessert && f.cat === 'dessert') return false;
    if (!o.kids && f.kidsOnly) return false;
    if (o.noCombo && f.cat === 'combo') return false;
    if (!isOnSale(f)) return false; // 往期/限定不推荐
    if (o.pricedOnly && state.prices.size && priceOf(f) == null) return false;
    if (f.isDrink) {
      if (o.drinks === 'none') return false;
      if (o.drinks === 'zero') return f.zeroCal;
      if (o.drinks === 'milk') return f.zeroCal || (f.cat === 'cafe' && f.p >= 7 && !SWEET_MILK.test(f.name));
    }
    return true;
  });
}

function solve(T, o = state.solver, K = 6) {
  const pool = solverPool(o);
  const W = 360;
  const seen = new Set();
  const results = [];
  let beam = [{ idx: [], t: ZERO(), drinks: 0 }];
  for (let depth = 0; depth < o.maxItems; depth++) {
    const next = [];
    for (const s of beam) {
      const start = s.idx.length ? s.idx[s.idx.length - 1] : 0;
      for (let i = start; i < pool.length; i++) {
        const f = pool[i];
        let cnt = 0;
        for (const j of s.idx) if (j === i) cnt++;
        if (cnt >= f.maxQty) continue;
        if (f.isDrink && s.drinks >= 1) continue;
        const t = addTotals(s.t, f);
        if (t.kcal > T.kcal * 1.5 + 80) continue;
        const idx = [...s.idx, i];
        const key = idx.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ idx, t, drinks: s.drinks + (f.isDrink ? 1 : 0), L: lossOf(t, T, o) });
      }
    }
    next.sort((a, b) => a.L - b.L);
    beam = next.slice(0, W);
    results.push(...beam.slice(0, 80));
  }
  results.sort((a, b) => a.L - b.L);
  // 束搜索候选 → 局部搜索抛光 → 去重
  const polished = new Map();
  for (const r of results.slice(0, 50)) {
    const ids = polish(r.idx.map(i => pool[i].id), T, o, pool).sort();
    const key = ids.join('|');
    if (polished.has(key)) continue;
    const t = totalsOf(groupIds(ids).map(([id, q]) => [state.byId.get(id), q]));
    polished.set(key, { ids, t, L: lossOf(t, T, o) });
  }
  const ranked = [...polished.values()].sort((a, b) => a.L - b.L);
  // 多样性：与已选方案物品重合度 ≤ 50%，且“主力”(最高热量单品) 不重复超过 2 次
  const picked = [];
  const mainCount = {};
  for (const r of ranked) {
    const ids = r.ids;
    const main = ids.reduce((a, b) => (state.byId.get(a).kcal >= state.byId.get(b).kcal ? a : b));
    if ((mainCount[main] || 0) >= 2) continue;
    const ok = picked.every(p => {
      const a = [...p.ids], b = [...ids];
      let inter = 0;
      for (const x of b) { const k = a.indexOf(x); if (k >= 0) { inter++; a.splice(k, 1); } }
      return inter / Math.max(p.ids.length, ids.length) <= 0.5;
    });
    if (!ok) continue;
    picked.push({ ids, t: r.t, L: r.L, fit: fitScore(r.L), main });
    mainCount[main] = (mainCount[main] || 0) + 1;
    if (picked.length >= K) break;
  }
  return { picked, poolSize: pool.length, evaluated: seen.size };
}

const groupIds = ids => { const m = new Map(); for (const id of ids) m.set(id, (m.get(id) || 0) + 1); return [...m]; };

// 组合是否满足硬约束：件数、单品份数上限、饮品最多一杯
function validCombo(ids, o = state.solver) {
  if (!ids.length || ids.length > o.maxItems) return false;
  let drinks = 0;
  for (const [id, q] of groupIds(ids)) {
    const f = state.byId.get(id);
    if (q > f.maxQty) return false;
    if (f.isDrink) drinks += q;
  }
  return drinks <= 1;
}

// 一步微调：再加 / 去掉 / 替换哪一个能最大幅度提升契合度（只在硬约束内搜索）
function bestTweak(ids, T, o = state.solver, pool = solverPool(o)) {
  const base = totalsOf(groupIds(ids).map(([id, q]) => [state.byId.get(id), q]));
  const L0 = lossOf(base, T, o);
  const uniq = [...new Set(ids)].map(id => state.byId.get(id));
  let best = null;
  const consider = (kind, t, next, a, b) => {
    const L = lossOf(t, T, o);
    if (L < L0 - 0.004 && (!best || L < best.L) && validCombo(next, o)) best = { kind, a, b, L, fit: fitScore(L), ids: next };
  };
  const without = id => { const k = ids.indexOf(id); return [...ids.slice(0, k), ...ids.slice(k + 1)]; };
  if (ids.length < o.maxItems) for (const f of pool) consider('add', addTotals(base, f), [...ids, f.id], f);
  for (const f of uniq) {
    if (ids.length > 1) consider('remove', addTotals(base, f, -1), without(f.id), f);
    for (const g of pool) if (g.cat === f.cat && g.id !== f.id) consider('swap', addTotals(addTotals(base, f, -1), g), [...without(f.id), g.id], f, g);
  }
  return best;
}

// 局部搜索抛光：反复应用最佳微调直到收敛，保证每个方案都是局部最优
function polish(ids, T, o, pool) {
  for (let k = 0; k < 8; k++) {
    const tw = bestTweak(ids, T, o, pool);
    if (!tw) break;
    ids = tw.ids;
  }
  return ids;
}

function tweakText(tw) {
  if (!tw) return '已是局部最优：任何单步增减替换都不会更好。';
  if (tw.kind === 'add') return `再加一份「${tw.a.name}」→ 契合度 ${tw.fit}%`;
  if (tw.kind === 'remove') return `去掉一份「${tw.a.name}」→ 契合度 ${tw.fit}%`;
  return `把「${tw.a.name}」换成「${tw.b.name}」→ 契合度 ${tw.fit}%`;
}

// 解读：哪项偏离最大
function diagnose(t, T) {
  const name = { kcal: '热量', p: '蛋白质', c: '碳水', f: '脂肪' };
  const parts = [];
  const [pc, pt] = judge('p', t.p, T.p);
  parts.push(pc === 'ok' ? `蛋白质${pt.replace('✓ ', '')}` : `蛋白质${pt}`);
  const over = ['kcal', 'f', 'c'].map(k => [k, judge(k, t[k], T[k])]).filter(([, j]) => j[0] !== 'ok');
  if (!over.length) parts.push('热量、脂肪、碳水都没超');
  else for (const [k, [, txt]] of over) parts.push(`${name[k]}${txt}`);
  return parts.join('；');
}

// 燃烧换算（MET 法）
const BURN = [['🏃', '慢跑 8km/h', 8.3], ['🏋️', '力量训练', 5.0], ['🪢', '跳绳', 11.0], ['🚶', '快走', 4.3]];
const burnMin = (kcal, met) => kcal / (met * 3.5 * state.profile.weight / 200);

// ============================================================ 套餐引擎：套餐（每轮选项 + 差价）+ 单点加购，按营养 × 价格求最优
// 套餐子项名称 → 营养库名称（必要时带份数）；对不上的子项直接不参与，绝不估算
const CHOICE_ALIAS = {
  纯牛奶: '纯牛奶（盒装）', '5块麦乐鸡': '麦乐鸡5块', 麦辣鸡翅2块: '麦辣鸡翅-2块', 麦辣鸡翅4块: ['麦辣鸡翅-2块', 2], '麦辣鸡翅-4块': ['麦辣鸡翅-2块', 2],
  '那么大鸡排（椒盐风味）': '那么大鸡排', '苹果片一袋(60g)': '苹果片', 新升级巨无霸: '巨无霸',
  // 鲜萃冰咖 = 冰的鲜萃黑咖啡，官方营养库未单列；黑咖热量≈0，按鲜萃咖啡计，免得让用户为数据去换饮品
  鲜萃冰咖: '小杯鲜萃咖啡',
};
function matchChoice(name) {
  const a = CHOICE_ALIAS[name] ?? name.replace(/^麦咖啡™/, '');
  const [id, qty] = Array.isArray(a) ? a : [a, 1];
  const food = state.byId.get(id);
  return food ? { food, qty } : null;
}

function buildBundles() {
  state.bundles = (menuSrc()?.bundles || []).map(b => {
    const rounds = b.rounds.map(r => ({
      name: r.name,
      def: r.choices.find(c => c.isDefault)?.name || r.choices[0]?.name,
      options: r.choices.map(c => { const m = matchChoice(c.name); return m && { ...m, name: c.name, diff: c.diff || 0 }; }).filter(Boolean),
    }));
    // 任何一轮完全没有官方营养数据（如新品龙焰鸡腿堡），整个套餐不参与推荐
    if (rounds.some(r => !r.options.length)) return null;
    return { code: b.code, name: b.name, price: effPrice(b), listPrice: b.originalPrice, member: memberTag(b), image: b.image, rounds };
  }).filter(Boolean);
}

function daypartOK(f, dp) {
  if (dp === 'breakfast') return ['breakfast', 'cafe', 'drink'].includes(f.cat);
  if (dp === 'regular') return f.cat !== 'breakfast';
  return true;
}
function prefOK(f, o) {
  if (o.noDessert && f.cat === 'dessert') return false;
  if (f.isDrink) {
    if (o.drinks === 'zero' || o.drinks === 'none') return f.zeroCal;
    if (o.drinks === 'milk') return f.zeroCal || (f.cat === 'cafe' && f.p >= 7 && !SWEET_MILK.test(f.name));
  }
  return true;
}

const PRICE_W = [0, 0.015, 0.003]; // 2 = 早餐专区：只在营养相近时挑便宜的 // 只看营养 / 性价比优先（原「兼顾性价比」「省钱优先」合并）；3 = 蛋白最便宜
const PRICY = 40; // 一顿麦当劳超过 ¥40 就偏贵：任何模式下都降权，少推荐
function priceTerm(price, o) {
  let L = (PRICE_W[o.priceW] || 0) * price;
  if (price > PRICY) L += 0.08 + 0.02 * (price - PRICY);
  if (o.budget && price > o.budget) L += 4 * ((price - o.budget) / o.budget) ** 2 + 0.03;
  return L;
}

// parts: [{ bundle, picks }]，支持「两份 1+1」这类多套餐组合
const FRIED_SIDE = /油条|薯饼|香肠|薯条|派$/;
function makePlan(kind, T, o, { parts = [], addons = [], price }) {
  const picks = parts.flatMap(x => x.picks);
  const ids = [...picks.flatMap(p => Array(p.qty).fill(p.food.id)), ...addons.map(f => f.id)];
  const t = totalsOf(groupIds(ids).map(([id, q]) => [state.byId.get(id), q]));
  const nutL = lossOf(t, T, { ...o, budget: 0 });
  // 单点同样内容要花多少（全部能查到单点价时才计算）
  // 单点同样内容要花多少：查不到单点价的子项不计入，所以是"至少"
  let alone = null, aloneExact = false;
  if (parts.length) {
    const each = picks.map(p => (priceOf(p.food) != null ? priceOf(p.food) * p.qty : null));
    alone = each.reduce((a, b) => a + (b || 0), 0) + addons.reduce((a, f) => a + priceOf(f), 0);
    aloneExact = each.every(x => x != null);
  }
  const sig = [...ids].sort().join('|') + '@' + r1(price ?? 0);
  const ppg = price != null && t.p > 0 ? price / t.p : null; // 每克蛋白多少钱
  // 「蛋白最便宜」：主要按 ¥/g 蛋白排序，营养契合度作为次要约束，避免推出蛋白便宜但离谱的组合
  let rankL = o.priceW === 3 && ppg != null ? 0.5 * nutL + 1.5 * ppg + priceTerm(price, o) : nutL + (price != null ? priceTerm(price, o) : 0);
  // 早餐专区「最健康」：油炸配餐（油条/薯饼/香肠/薯条/派）按热量扣分
  if (o.health) for (const id of ids) if (FRIED_SIDE.test(id)) rankL += 0.04 + 0.0008 * state.byId.get(id).kcal; // 越油越重扣得越多（油条 > 薯饼）
  return { kind, parts, addons, ids, t, price, ppg, alone, aloneExact, sig, nutL, rankL, fit: fitScore(nutL) };
}

function solveSmart(T, o = state.solver) {
  const dp = activeDaypart(o);
  const singles = solverPool({ ...o, pricedOnly: true }).filter(f => priceOf(f) != null && !f.isDrink && f.cat !== 'combo');
  let evaluated = 0;
  const cands = [];
  const cheap = [];
  const couponBest = []; // 每张券的最优配置，可以作为「加一张券」叠到其他方案上
  for (const b of [...state.bundles, ...couponBundles(o)]) {
    const rounds = [];
    let ok = true;
    for (const r of b.rounds) {
      // 券包里的券有自己的生效时间段，不再按当前时段过滤；待领取的券没有时间信息，仍按时段过滤
      const opts = b.coupon?.source === 'mine' ? r.options : r.options.filter(x => daypartOK(x.food, dp));
      if (!opts.length) { ok = false; break; }
      const pref = opts.filter(x => prefOK(x.food, o));
      rounds.push({ ...r, opts: pref.length ? pref : opts });
    }
    if (!ok) continue;
    // 每个套餐穷举所有选项组合（单人套餐通常 ≤ 3000 种）
    const local = [];
    const rec = (i, picks) => {
      if (i === rounds.length) {
        evaluated++;
        const price = b.price + picks.reduce((a, p) => a + p.diff, 0);
        local.push(makePlan('bundle', T, o, { parts: [{ bundle: b, picks }], price }));
        return;
      }
      for (const x of rounds[i].opts) rec(i + 1, [...picks, { ...x, round: rounds[i].name, def: rounds[i].def }]);
    };
    rec(0, []);
    local.sort((a, c) => a.rankL - c.rankL);
    cands.push(...local.slice(0, 4));
    if (b.coupon && local[0]) couponBest.push(local[0]);
    if (b.price < 20) cheap.push(...local.slice(0, 8));
  }
  // 两份平价套餐（如两份 1+1）：真实点餐里很常见的省钱搭法
  cheap.sort((a, c) => a.rankL - c.rankL);
  const cheapTop = cheap.slice(0, 16);
  for (let i = 0; i < cheapTop.length; i++) for (let j = i; j < cheapTop.length; j++) {
    const A = cheapTop[i], B = cheapTop[j];
    const cps = [...A.parts, ...B.parts].filter(x => x.bundle.coupon);
    if (cps.length > 1 && !(cps[0].bundle.code === cps[1].bundle.code && cps[0].bundle.coupon.count > 1)) continue; // 一单最多用一种券
    const drinks = [...A.ids, ...B.ids].filter(id => state.byId.get(id).isDrink).length;
    if (drinks > 1 && o.drinks !== 'any') continue;
    evaluated++;
    cands.push(makePlan('bundle', T, o, { parts: [...A.parts, ...B.parts], price: A.price + B.price }));
  }
  // 加购：在最好的套餐方案上尝试再单点 1–2 件（不重复加饮品）
  cands.sort((a, c) => a.rankL - c.rankL);
  const withAddons = [];
  const hasCoupon = p => p.parts.some(x => x.bundle.coupon);
  const bases = [...new Set([...cands.slice(0, 40), ...cands.filter(hasCoupon)])];
  for (const base of bases) {
    let cur = base;
    for (let k = 0; k < (o.health ? 0 : 2); k++) { // 早餐专区不加点：组合/套餐本身就够
      const hasDrink = cur.ids.some(id => state.byId.get(id).isDrink);
      let best = null;
      // 叠一张券（一单最多一种券）
      if (!hasCoupon(cur)) for (const cb of couponBest.filter(c => !c.ids.every(id => state.byId.get(id).isDrink))) { // 纯饮品券不叠加
        const cbDrink = cb.ids.some(id => state.byId.get(id).isDrink);
        if (hasDrink && cbDrink && o.drinks !== 'any') continue;
        evaluated++;
        const p = makePlan('bundle', T, o, { parts: [...cur.parts, ...cb.parts], addons: cur.addons, price: cur.price + cb.price });
        if (p.rankL < cur.rankL - 0.02 && (!best || p.rankL < best.rankL)) best = p;
      }
      for (const f of o.health ? singles.filter(f => !FRIED_SIDE.test(f.id)) : singles) { // 不为补营养单点饮品；早餐专区不加点油炸/加工肉配餐
        if (cur.addons.filter(a => a.id === f.id).length >= f.maxQty) continue;
        evaluated++;
        const p = makePlan('bundle', T, o, { parts: cur.parts, addons: [...cur.addons, f], price: cur.price + priceOf(f) });
        if (p.rankL < cur.rankL - 0.02 && (!best || p.rankL < best.rankL)) best = p;
      }
      if (!best) break;
      cur = best;
      withAddons.push(cur);
    }
  }
  const all = [...cands, ...withAddons].sort((a, c) => a.rankL - c.rankL); // 不推荐纯单点：没人在麦当劳单点
  // 多样性：同样内容只留最便宜的一份；每种套餐组合只出现一次
  const picked = [];
  const used = new Set();
  const seenSig = new Set();
  let singleCount = 0;
  for (const p of all) {
    const key = p.parts.map(x => x.bundle.code).sort().join('+');
    const contentKey = [...p.ids].sort().join('|');
    if (seenSig.has(contentKey)) continue;
    if (p.parts.length ? used.has(key) : singleCount >= 1) continue;
    if (p.parts.length) used.add(key); else singleCount++;
    seenSig.add(contentKey);
    picked.push(p);
    if (picked.length >= 6) break;
  }
  return { picked, evaluated, poolSize: state.bundles.length, couponCount: couponBundles(o).length, smart: true, _all: all };
}

function solveSingles(T, o = state.solver) {
  const r = solve(T, o);
  return {
    picked: r.picked.map(p => ({ ...makePlan('single', T, o, { addons: p.ids.map(id => state.byId.get(id)), price: p.t.priced && state.prices.size ? p.t.price : null }), fit: p.fit })),
    evaluated: r.evaluated, poolSize: r.poolSize, smart: false,
  };
}

// ============================================================ 优惠券：券 → 能吃什么（营养）+ 用券价 + 什么时候能用
const WD = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const parseDT = s => { const [d, t] = s.split(' '); const [Y, M, D] = d.split('-').map(Number); const [h, m] = t.split(':').map(Number); return new Date(Y, M - 1, D, h, m); };
const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

function couponValidAt(c, d) {
  if (c.start && d < parseDT(c.start)) return false;
  if (c.end && d > parseDT(c.end)) return false;
  if (c.weekdays && ![...c.weekdays].filter(ch => ch in WD).map(ch => WD[ch]).includes(d.getDay())) return false;
  if (c.from && c.to) { const x = d.getHours() * 60 + d.getMinutes(); if (x < hm(c.from) || x > hm(c.to)) return false; }
  return true;
}
// 从现在起最近一次可用的时间点（最多看 days 天）
function couponNext(c, days = 7, now = new Date()) {
  if (couponValidAt(c, now)) return now;
  for (let i = 0; i <= days; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i);
    const [h, m] = (c.from || '00:00').split(':').map(Number);
    d.setHours(h, m, 0, 0);
    if (d >= now && couponValidAt(c, d)) return d;
  }
  return null;
}
const fmtWhen = d => `${d.getMonth() + 1}/${d.getDate()} 周${'日一二三四五六'[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function resolveFood(name) {
  const n = String(name).replace(/\s/g, '');
  for (const t of [n, CHOICE_ALIAS[n], n.replace(/^(大杯|中杯|小杯)(.+)$/, '$2$1'), n.replace(/^麦咖啡™/, '')]) {
    if (typeof t === 'string' && state.byId.has(t)) return state.byId.get(t);
  }
  return null;
}

function roundsFromRaw(raw) {
  const rounds = raw.map(r => ({
    name: r.name,
    def: r.choices.find(c => c.isDefault)?.name || r.choices[0]?.name,
    options: r.choices.map(c => { const m = matchChoice(c.name); return m && { ...m, name: c.name, diff: c.diff || 0 }; }).filter(Boolean),
  }));
  return rounds.length && rounds.every(r => r.options.length) ? rounds : null;
}
const fixedRound = (food, qty, name) => ({ name, def: name, options: [{ food, qty, name, diff: 0 }] });

// 把一张券翻译成「套餐结构」；翻译不出来就返回 why（不做猜测）
function couponContent(title) {
  // ① 门店此刻可用券带商品编码 → 套餐结构
  const st = (state.couponsRaw?.atStore || []).find(c => c.title === title);
  if (st) {
    const rounds = [];
    for (const p of st.products) {
      const r = p.rounds && roundsFromRaw(p.rounds);
      if (r) rounds.push(...r);
      else { const f = resolveFood(p.name); if (!f) return { why: `「${p.name}」暂无官方营养数据` }; rounds.push(fixedRound(f, 1, p.name)); }
    }
    if (rounds.length) return { rounds, via: '门店券商品' };
  }
  // ② 券名就是门店里某个套餐
  const sb = (menuSrc()?.bundles || []).find(b => normName(b.name) === normName(title));
  if (sb) { const r = roundsFromRaw(sb.rounds); return r ? { rounds: r, via: '同名套餐' } : { why: '套餐内含暂无营养数据的新品' }; }
  // ③ 「X买一送一」
  let m = title.match(/^(?:人气)?(.+?)买一送一$/);
  if (m) { const f = resolveFood(m[1]); return f ? { rounds: [fixedRound(f, 2, `${m[1]}×2`)], via: '买一送一', unitFood: f } : { why: `「${m[1]}」口味未指定或暂无营养数据` }; }
  // ④ 「9.9元中杯冰美式」
  m = title.match(/^[\d.]+元(.+)$/);
  if (m) { const f = resolveFood(m[1]); return f ? { rounds: [fixedRound(f, 1, m[1])], via: '特价单品' } : { why: `「${m[1]}」暂无营养数据` }; }
  // ⑤ 券名就是单品
  const f = resolveFood(title.replace(/^免费/, ''));
  if (f) return { rounds: [fixedRound(f, 1, title)], via: '单品' };
  return { why: '券内商品组成未公开（MCP 只在券生效时提供商品明细）' };
}

function buildCoupons() {
  const raw = state.couponsRaw;
  if (!raw) { state.coupons = []; return; }
  const groups = new Map();
  for (const c of raw.mine) {
    const g = groups.get(c.title) || { title: c.title, source: 'mine', price: c.price, image: c.image, tags: c.tags, items: [] };
    g.items.push(c);
    groups.set(c.title, g);
  }
  for (const c of raw.claimable.filter(x => x.status === '可领取')) {
    if (groups.has(c.title)) continue;
    const pm = c.title.match(/^([\d.]+)元/);
    groups.set(c.title, { title: c.title, source: 'claimable', price: pm ? +pm[1] : c.title.startsWith('免费') ? 0 : null, items: [], tags: [] });
  }
  state.coupons = [...groups.values()].map(g => {
    const content = couponContent(g.title);
    // 买一送一：用券价 = 单买一份的门店价
    if (g.price == null && content.unitFood && priceOf(content.unitFood) != null) g.price = priceOf(content.unitFood);
    const nexts = g.items.map(c => couponNext(c)).filter(Boolean).sort((a, b) => a - b);
    const now = g.items.some(c => couponValidAt(c, new Date()));
    return {
      ...g, ...content, count: g.items.length,
      validNow: g.source === 'claimable' ? null : now,
      next: nexts[0] || null,
      usable: !!content.rounds && g.price != null,
    };
  });
}

// 求解器用：把可用的券变成「特价套餐」
function couponBundles(o = state.solver) {
  if (o.coupons === 'off') return [];
  return state.coupons.filter(c => c.usable && (c.source === 'mine' ? (o.coupons === 'now' ? c.validNow : !!c.next) : o.claimable)).map(c => ({
    code: 'cp:' + c.title, name: c.title, price: c.price, image: c.image, rounds: c.rounds, coupon: c,
  }));
}

async function loadCoupons(quiet = true) {
  try {
    // 券包不依赖门店；「门店当前可用券」只在选了真实门店时查
    const code = state.storeSel?.storeCode;
    state.couponsRaw = await api(`/api/coupons${code ? `?storeCode=${encodeURIComponent(code)}` : ''}`);
    if (state.couponsRaw.disabled) { state.couponsDisabled = true; state.solver.coupons = 'off'; }
    buildCoupons();
  } catch (e) { state.couponsRaw = null; state.coupons = []; if (!quiet) toast('优惠券同步失败：' + e.message, 4000); }
}

function couponWhen(c) {
  if (c.source === 'claimable') return '需先在 App「麦麦省」领取';
  if (c.validNow) return '现在可用';
  return c.next ? `📅 ${fmtWhen(c.next)} 起可用` : '7 天内不可用';
}

function couponSummary() {
  if (!state.couponsRaw) return '同步中…';
  const mine = state.coupons.filter(c => c.source === 'mine');
  return `券包 ${mine.reduce((s, c) => s + c.count, 0)} 张 · 现在可用 ${mine.filter(c => c.validNow).length} 种 · 能算营养 ${state.coupons.filter(c => c.usable).length} 种`;
}

// ============================================================ 可视化组件
const MAC = { kcal: { label: '热量', unit: 'kcal', color: 'var(--kcal)' }, p: { label: '蛋白质', unit: 'g', color: 'var(--p)' }, c: { label: '碳水', unit: 'g', color: 'var(--c)' }, f: { label: '脂肪', unit: 'g', color: 'var(--f)' } };

function rings(t, T, size = 168) {
  const R = [[78, 'p'], [62, 'c'], [46, 'f']];
  const sw = 13;
  const arcs = R.map(([r, k]) => {
    const C = 2 * Math.PI * r;
    const v = T[k] > 0 ? t[k] / T[k] : 0;
    const first = clamp(v, 0, 1), over = clamp(v - 1, 0, 1);
    return `<circle r="${r}" class="ring-bg" style="stroke:${MAC[k].color}" stroke-width="${sw}"/>
      <circle r="${r}" class="ring-fg" style="stroke:${MAC[k].color}" stroke-width="${sw}" stroke-dasharray="${C * first} ${C}"/>
      ${over > 0 ? `<circle r="${r}" class="ring-over" stroke-width="${sw - 5}" stroke-dasharray="${C * over} ${C}"/>` : ''}`;
  }).join('');
  return `<svg class="rings" viewBox="-92 -92 184 184" width="${size}" height="${size}" role="img" aria-label="蛋白 ${r0(t.p)}g 碳水 ${r0(t.c)}g 脂肪 ${r0(t.f)}g">
    <g transform="rotate(-90)">${arcs}</g>
    <text y="-4" class="ring-num">${r0(t.kcal)}</text><text y="16" class="ring-unit">/ ${r0(T.kcal)} kcal</text></svg>`;
}

function bullets(t, T) {
  return `<div class="bullets">${['kcal', 'p', 'c', 'f'].map(k => {
    const v = t[k], tg = T[k];
    const ratio = tg > 0 ? v / tg : 0;
    const w = clamp(ratio / 1.5, 0, 1) * 100;
    const d = v - tg;
    const [cls, txt] = judge(k, v, tg);
    return `<div class="bullet ${cls}">
      <span class="bl">${MAC[k].label}</span>
      <span class="bt"><span class="bf" style="width:${w}%;background:${MAC[k].color}"></span><span class="bm" title="目标"></span></span>
      <span class="bv"><b>${r0(v)}</b><small>/${r0(tg)}${MAC[k].unit === 'g' ? 'g' : ''}</small><em>${txt.replace(' ', '')}</em></span>
    </div>`;
  }).join('')}</div>`;
}

function macroStrip(f) { // 单品供能构成条
  const pk = f.p * 4, ck = f.c * 4, fk = f.f * 9, s = pk + ck + fk || 1;
  return `<span class="strip" title="供能比 蛋白${r0(pk / s * 100)}% 碳水${r0(ck / s * 100)}% 脂肪${r0(fk / s * 100)}%"><i style="width:${pk / s * 100}%;background:var(--p)"></i><i style="width:${ck / s * 100}%;background:var(--c)"></i><i style="width:${fk / s * 100}%;background:var(--f)"></i></span>`;
}

function thumb(f, cls = '') {
  const img = imageOf(f);
  return img
    ? `<span class="thumb ${cls}"><img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.textContent='${CAT[f.cat].emoji}'"></span>`
    : `<span class="thumb ${cls}" style="--cc:${CAT[f.cat].color}">${CAT[f.cat].emoji}</span>`;
}

function tierOf(f) {
  const fatShare = f.kcal ? f.f * 9 / f.kcal : 0;
  if (f.pd >= 0.30 && fatShare <= 0.45) return 'S';
  if (f.pd >= 0.22) return 'A';
  if (f.pd >= 0.17) return 'B';
  if (f.pd >= 0.12) return 'C';
  return 'D';
}

// ============================================================ HUD（今日剩余）
function renderHud() {
  if (!$('#hud')) return; // 全天额度条已下线：我们只关心这一餐
  const T = calcTargets();
  const e = eatenOn();
  const g = GOALS[state.profile.goal];
  $('#hud').innerHTML = `
    <div class="hud-goal"><span class="pill pill-y">${g.label}</span>${state.profile.cycling ? `<span class="pill">${state.profile.training ? '训练日' : '休息日'}</span>` : ''}</div>
    ${['kcal', 'p', 'c', 'f'].map(k => {
      const rem = T[k] - e[k];
      const pct = clamp(e[k] / T[k], 0, 1.2) / 1.2 * 100;
      return `<div class="hud-cell"><div class="hud-top"><span>${MAC[k].label}</span><b class="${rem < 0 ? 'neg' : ''}">${rem < 0 ? '超' : '剩'} ${r0(Math.abs(rem))}<small>${MAC[k].unit}</small></b></div>
        <div class="hud-bar"><i style="width:${pct}%;background:${MAC[k].color}"></i><s style="left:${100 / 1.2}%"></s></div></div>`;
    }).join('')}`;
}

function renderStatus() {
  const s = $('#dataStatus');
  const live = state.meta.source === 'mcp';
  s.className = 'status ' + (live ? 'live' : 'off');
  const src = menuSrc();
  const shop = state.bundles.length ? ` · ${state.bundles.length} 个套餐` : '';
  const priced = state.prices.size ? ` · ${state.prices.size} 款实时价格` : '';
  s.querySelector('.txt').textContent = `${live ? 'MCP 实时' : '离线快照'} · 在售 ${state.onSale.size || state.foods.length} 款${shop}`;
  s.title = `营养数据：${live ? '麦当劳 MCP list-nutrition-foods' : '内置快照'} ${state.meta.fetchedAt || ''}\n价格：${priceLabel()}`;
}

// ============================================================ 视图：训练档案
function heroStatsHtml() {
  const T = calcTargets();
  const kc = { p: T.p * 4, c: T.c * 4, f: T.f * 9 };
  const sum = kc.p + kc.c + kc.f;
  const C = 2 * Math.PI * 54;
  const seg = (k, off) => `<circle r="54" stroke="${MAC[k].color}" stroke-dasharray="${Math.max(kc[k] / sum * C - 2, 0)} ${C}" stroke-dashoffset="${-off * C / sum}"/>`;
  return `<div class="stat-big"><span>每日目标</span><b>${r0(T.kcal)}</b><small>kcal</small></div>
    <div class="donut-wrap">
      <svg viewBox="-70 -70 140 140" class="donut"><g transform="rotate(-90)" fill="none" stroke-width="16">${seg('p', 0)}${seg('c', kc.p)}${seg('f', kc.p + kc.c)}</g></svg>
      <div class="donut-legend">${['p', 'c', 'f'].map(k => `<div><i style="background:${MAC[k].color}"></i>${MAC[k].label}<b>${r0(T[k])}g</b><small>${r0(kc[k] / sum * 100)}%</small></div>`).join('')}</div>
    </div>`;
}

function calcHtml() {
  const p = state.profile;
  const T = calcTargets();
  const mb = mealBudget();
  const g = GOALS[p.goal];
  return `<ol class="calc-steps">
        <li><span>基础代谢 BMR</span><b>${r0(T.bmr)}</b><small>${T.method}${T.lbm ? ` · 去脂体重 ${r1(T.lbm)}kg` : ''}</small></li>
        <li><span>× 活动系数 ${p.act}</span><b>${r0(T.tdee)}</b><small>每日总消耗 TDEE</small></li>
        <li><span>${g.label} ${g.adj >= 0 ? '+' : ''}${r0(g.adj * 100)}%${T.dayAdj ? ` ${T.dayAdj > 0 ? '+' : ''}${r0(T.dayAdj * 100)}% ${p.training ? '训练日' : '休息日'}` : ''}</span><b class="y">${r0(T.kcal)}</b><small>每日目标热量</small></li>
        <li><span>蛋白 ${p.ppk}g × ${p.weight}kg</span><b class="mp">${r0(T.p)}g</b><small>${r0(T.p * 4)} kcal</small></li>
        <li><span>脂肪 ${p.fatPct}% 热量</span><b class="mf">${r0(T.f)}g</b><small>${r0(T.f * 9)} kcal</small></li>
        <li><span>碳水 = 剩余热量 ÷ 4</span><b class="mc">${r0(T.c)}g</b><small>${r0(T.c * 4)} kcal${T.c < 50 ? ' ⚠ 偏低，训练表现可能受影响' : ''}</small></li>
        <li><span>这一餐 = 全天 × 35%</span><b>${r0(mb.kcal)}</b><small>一顿正餐的常见占比</small></li>
      </ol>`;
}

// 填完身体数据，紧接着就是结果和「去配餐」按钮：一步到位
function ctaHtml() {
  const mb = mealBudget();
  return `<p class="eyebrow">你这一餐建议吃</p>
    <div class="cta-kcal"><b>${r0(mb.kcal)}</b><span>kcal</span></div>
    <div class="mb-row">${['p', 'c', 'f'].map(k => `<div><span>${MAC[k].label}</span><b class="m${k}">${r0(mb[k])}</b><small>g</small></div>`).join('')}</div>
    <a class="btn btn-y btn-block btn-xl" href="#solver" data-go-solve>✨ 按这个建议配这一餐 →</a>
    <small class="cta-note">一顿正餐 ≈ 全天的 35% · 改上面的数据，这里实时变化</small>`;
}

function renderProfile() {
  const p = state.profile;
  const chip = (name, val, label, cur) => `<button type="button" class="chip ${String(cur) === String(val) ? 'on' : ''}" data-set="${name}" data-val="${val}">${label}</button>`;

  $('#view-profile').innerHTML = `
  <div class="hero">
    <div class="hero-copy">
      <p class="eyebrow">McDonald's × Macro · 麦当劳热量透视镜</p>
      <h1>吃麦当劳，<br><span class="hl">也能心里有数</span> 🍟</h1>
      <p class="lede">一个派≈1.3 碗饭，一碗粥的钠≈全天的三成 —— 很多东西<b>份量不大，能量却不少</b>。麦小薯帮你把每一口的<b>热量和钠</b>看清楚，再从 ${state.onSale.size || state.foods.length} 款在售餐品和门店的<b>套餐、1+1</b> 里，挑一顿吃得饱、不超标、还划算的。</p>
      <div class="hero-cta"><a class="btn btn-y" href="#insights">🔍 看看热量小贴士</a><a class="btn" href="#solver">✨ 帮我配一餐</a></div>
    </div>
    <div class="hero-side"><div class="hero-mascot">${MASCOT}<span class="bubble">嗨～我是麦小薯！<br>帮你看清每一口 🔍</span></div><div class="hero-stats" id="heroStats">${heroStatsHtml()}</div></div>
  </div>

  <form class="card form" id="profileForm" autocomplete="off">
    <div class="form-split">
    <div>
      <h2 class="card-h"><span class="num">01</span>你的目标</h2>
      <div class="goal-grid">${Object.entries(GOALS).filter(([, g]) => !g.hidden).map(([k, g]) => `<button type="button" class="goal ${p.goal === k ? 'on' : ''}" data-goal="${k}"><b>${g.label}</b><small>${g.tip}</small></button>`).join('')}</div>
      <h2 class="card-h"><span class="num">02</span>身体数据</h2>
      <div class="field"><label>性别</label><div class="chips">${chip('sex', 'm', '男', p.sex)}${chip('sex', 'f', '女', p.sex)}</div></div>
      <div class="row-2">
        <div class="field"><label for="f-height">身高</label><div class="input-u"><input id="f-height" name="height" type="number" inputmode="decimal" min="120" max="230" value="${p.height}"><span>cm</span></div></div>
        <div class="field"><label for="f-weight">体重</label><div class="input-u"><input id="f-weight" name="weight" type="number" inputmode="decimal" min="30" max="250" step="0.1" value="${p.weight}"><span>kg</span></div></div>
      </div>
      <div class="field"><label>平时运动</label><div class="chips chips-wrap">${ACTS.map(([v, l, d]) => `<button type="button" class="chip ${+p.act === v ? 'on' : ''}" data-set="act" data-val="${v}" title="${d}">${l}<small>${d}</small></button>`).join('')}</div></div>
    </div>
    <div class="cta-block" id="ctaBlock"></div>
    </div>
      <details class="more adv" ${state._advOpen ? 'open' : ''}>
      <summary>🏋️ 进阶设置（健身党可选）</summary>
      <div class="field"><label for="f-bf">体脂率 <small>选填 · 填写后改用 Katch-McArdle 公式，更适合肌肉量大的人</small></label><div class="input-u"><input id="f-bf" name="bf" type="number" inputmode="decimal" min="3" max="60" step="0.1" placeholder="如 15" value="${p.bf}"><span>%</span></div></div>
      <div class="field"><label for="f-ppk">蛋白质摄入 <b class="val" id="lblPpk"></b> <small>ISSN 建议力量训练者 1.6–2.2，减脂期可到 2.4+</small></label><input id="f-ppk" name="ppk" type="range" min="1.2" max="3.0" step="0.1" value="${p.ppk}"></div>
      <div class="field"><label for="f-fat">脂肪供能 <b class="val" id="lblFat"></b> <small>下限 0.6 g/kg 保护激素水平</small></label><input id="f-fat" name="fatPct" type="range" min="15" max="40" step="1" value="${p.fatPct}"></div>
      <div class="field toggles">
        <label class="switch"><input type="checkbox" name="cycling" ${p.cycling ? 'checked' : ''}><span></span>碳循环</label>
        <div class="chips" ${p.cycling ? '' : 'hidden'}>${chip('training', 'true', '🏋️ 今天训练', p.training)}${chip('training', 'false', '🛌 今天休息', p.training)}</div>
      </div>
      </details>
  </form>
  <details class="card calc-box">
    <summary>🧮 看看是怎么算的 <small>基础代谢 → 每日消耗 → 你的目标 → 这一餐</small></summary>
    <div id="calcCard"></div>
  </details>`;
  updateProfileLive();
}

// 只刷新计算结果，不重建表单（避免拖动滑块/输入时丢焦点）
function updateProfileLive() {
  const p = state.profile;
  $('#heroStats').innerHTML = heroStatsHtml();
  $('#calcCard').innerHTML = calcHtml();
  $('#ctaBlock').innerHTML = ctaHtml();
  $('#lblPpk').textContent = `${p.ppk} g/kg = ${r0(p.ppk * p.weight)} g/天`;
  $('#lblFat').textContent = `${p.fatPct}%`;
}

function bindProfile() {
  const v = $('#view-profile');
  v.addEventListener('toggle', e => { if (e.target.matches('details.adv')) state._advOpen = e.target.open; }, true);
  v.addEventListener('click', e => {
    if (e.target.closest('[data-go-solve]')) { state.hasProfile = true; store.set('profile', state.profile); state.solver.custom = null; return; }
    const b = e.target.closest('[data-set],[data-goal]');
    if (!b) return;
    const p = state.profile;
    if (b.dataset.goal) { p.goal = b.dataset.goal; p.ppk = GOALS[p.goal].ppk; }
    else {
      const k = b.dataset.set, val = b.dataset.val;
      p[k] = k === 'sex' ? val : k === 'training' ? val === 'true' : +val;
    }
    saveProfile(true);
  });
  v.addEventListener('input', e => {
    const el = e.target;
    if (!el.name) return;
    const p = state.profile;
    if (el.type === 'checkbox') { p[el.name] = el.checked; return saveProfile(true); }
    if (el.name === 'bf') p.bf = el.value;
    else if (el.value !== '' && !isNaN(+el.value)) p[el.name] = +el.value;
    else return;
    saveProfile(false);
  });
}

function saveProfile(full) {
  state.hasProfile = true;
  store.set('profile', state.profile);
  state.solver.custom = null;
  if (full) renderProfile(); else updateProfileLive();
  renderHud();
}

// ============================================================ 视图：智能配餐
let lastSolve = null;

// 迷你选店组件：配餐页和门店页共用
function storePickerHtml(compact) {
  return `<form class="store-form js-store-form ${compact ? 'compact' : ''}" autocomplete="off">
      <input name="city" placeholder="城市" value="${esc(store.get('city', '上海'))}" required aria-label="城市">
      <input name="keyword" placeholder="地标 / 商圈，如 人民广场" value="${esc(store.get('kw', ''))}" required aria-label="关键词">
      <button class="btn btn-y" type="submit">找店</button>
    </form>
    <div class="store-list js-store-list"></div>`;
}

function renderSolver() {
  const o = state.solver;
  const T = sceneTarget();
  const s = menuSrc();
  const hasPrices = state.prices.size > 0;
  const smartOn = o.buy === 'smart' && state.bundles.length > 0;
  $('#view-solver').innerHTML = `
  <div class="view-head">
    <div class="vh-mascot">${MASCOT}</div>
    <div><p class="eyebrow">Macro Solver · 套餐 × 营养 × 价格</p><h1>说说想怎么吃，<span class="hl">麦小薯帮你配！</span></h1></div>
  </div>
  <div class="solver">
    <aside class="card solver-panel">
      <h2 class="card-h"><span class="num">A</span>吃饭场景</h2>
      <div class="scene-grid">${Object.entries(SCENES).map(([k, sc]) => `<button type="button" class="scene ${k === 'breakfast' ? 'bfast' : ''} ${o.scene === k ? 'on' : ''}" data-scene="${k}"><span>${sc.icon}</span><b>${sc.label}</b><small>${sc.desc}</small></button>`).join('')}</div>

      <h2 class="card-h"><span class="num">B</span>价格偏好 <small>参考价，实际以门店为准</small></h2>
      <div class="chips">${[[0, '🥦 只看营养'], [1, '⚖️ 性价比优先'], [3, '💪 蛋白最便宜']].map(([i, l]) => `<button type="button" class="chip ${o.priceW === i ? 'on' : ''}" data-opt="priceW" data-val="${i}">${l}</button>`).join('')}</div>
      <p class="hint">超过 ¥${PRICY} 的方案会少推荐${state.couponsDisabled ? '' : ' · 已自动算上你未来 7 天能用的优惠券'}</p>
      ${s ? cardChipsHtml() : ''}

      <details class="more" ${o._moreOpen ? 'open' : ''}>
        <summary>更多偏好</summary>
        <div class="field"><label>饮品</label><div class="chips chips-wrap">${[['zero', '零卡/黑咖'], ['milk', '牛奶补蛋白'], ['any', '随便']].map(([v, l]) => `<button type="button" class="chip ${o.drinks === v ? 'on' : ''}" data-opt="drinks" data-val="${v}">${l}</button>`).join('')}</div></div>
        <div class="field"><label for="naCap">钠上限 <b class="val">${o.naCap ? o.naCap + ' mg' : '不限'}</b> <small>全天建议 &lt; 2000mg</small></label><input id="naCap" type="range" min="0" max="2500" step="100" value="${o.naCap}" data-opt-range="naCap"></div>
        <label class="switch"><input type="checkbox" data-opt-check="noDessert" ${o.noDessert ? 'checked' : ''}><span></span>不要甜品</label>
      </details>
    </aside>
    <section class="solver-out" id="solverOut"><div class="loading">${MASCOT_SM}麦小薯计算中…</div></section>
  </div>`;
  runSolver();
}

// 用户只选场景和价格偏好，其余由麦小薯替用户决定：只推荐套餐（没人单点）、优惠券按未来 7 天、不设预算
function effectiveOpts() {
  const o = state.solver;
  const bf = o.scene === 'breakfast';
  return {
    ...o, buy: 'smart', coupons: 'week', claimable: false, budget: 0, custom: null,
    daypart: bf ? 'breakfast' : 'regular',
    // 早餐专区：最健康优先 —— 只看营养，钠卡得更严（早餐普遍偏咸）
    priceW: bf ? 2 : o.priceW, naCap: bf ? Math.min(o.naCap || 1000, 1000) : o.naCap,
    health: bf,
    drinks: bf ? 'zero' : o.drinks, // 早餐饮品：黑咖 / 无糖茶优先，不要含糖豆浆和奶咖换购
  };
}

function runSolver() {
  const o = effectiveOpts();
  const T = sceneTarget();
  const t0 = performance.now();
  const res = state.bundles.length ? solveSmart(T, o) : solveSingles(T, o);
  const ms = performance.now() - t0;
  lastSolve = { T, res };
  const out = $('#solverOut');
  if (!out) return;
  if (!res.picked.length) { out.innerHTML = `<div class="empty">${MASCOT_SM}<p>这些条件下配不出来…<br>试试放宽饮品或钠的限制？</p></div>`; return; }
  out.innerHTML = `
    <div class="solve-meta"><span class="sm-target">🎯 这一餐目标 <b>${r0(T.kcal)}</b> kcal · 蛋白 <b>${r0(T.p)}</b>g · 碳水 <b>${r0(T.c)}</b>g · 脂肪 <b>${r0(T.f)}</b>g</span><span>${o.scene === 'breakfast' ? '🌅 早餐专区：最健康的在前（少油炸、少钠、饮品选黑咖）' : `🎁 从 ${res.poolSize} 个套餐里算了 ${res.evaluated.toLocaleString()} 种组合 · ${r0(ms)} ms`}</span></div>
    <div class="results">${res.picked.map((p, i) => resultCard(p, T, i)).join('')}</div>`;
}

function resultCard(p, T, i) {
  const line = (f, q, extra = '') => `<li>${thumb(f)}<span class="ri-name" ${f.cat === 'combo' ? `title="${esc(comboNote(f))}"` : ''}>${esc(f.name)}${f.cat === 'combo' ? '<span class="swapped">500大卡套餐</span>' : ''}${q > 1 ? `<b class="qty">×${q}</b>` : ''}${extra}</span><span class="ri-mac"><i class="mp">P${r0(f.p * q)}</i><i class="mc">C${r0(f.c * q)}</i><i class="mf">F${r0(f.f * q)}</i><em>${r0(f.kcal * q)}</em></span></li>`;
  const changed = p.parts.flatMap(x => x.picks).filter(x => x.def && x.name !== x.def);
  let body;
  if (p.parts.length) {
    body = p.parts.map((part, k) => `<div class="bundle-box ${part.bundle.coupon ? 'is-coupon' : ''}">
        <div class="bb-h">${part.bundle.image ? `<img src="${esc(part.bundle.image)}" alt="" referrerpolicy="no-referrer">` : '🎁'}<div><b>${p.parts.length > 1 ? `第${k + 1}份 · ` : ''}${part.bundle.coupon ? '<span class="cp-tag">🎟️ 用券</span>' : ''}${esc(part.bundle.name)}</b><small>${part.bundle.coupon ? `用券价 ¥${part.bundle.price} · ${esc(couponWhen(part.bundle.coupon))}` : `套餐 ¥${part.bundle.price}${part.bundle.listPrice > part.bundle.price ? ` <s>¥${part.bundle.listPrice}</s>` : ''}${part.bundle.member ? ` · ${part.bundle.member}` : part.bundle.listPrice > part.bundle.price ? ' · 门店促销价' : ''}`}${part.picks.some(x => x.diff) ? ' · 含换购差价' : ''}</small></div></div>
        <ul class="res-items">${part.picks.map(x => line(x.food, x.qty, `${x.diff ? `<span class="diff">${x.diff > 0 ? '+' : '−'}¥${Math.abs(x.diff)}</span>` : ''}${x.def && x.name !== x.def ? '<span class="swapped">已换</span>' : ''}`)).join('')}</ul>
      </div>`).join('') + `
      ${p.addons.length ? `<p class="addon-h">➕ 再单点</p><ul class="res-items">${groupIds(p.addons.map(f => f.id)).map(([id, q]) => { const f = state.byId.get(id); return line(f, q, `<span class="diff">¥${r1(priceOf(f) * q)}</span>`); }).join('')}</ul>` : ''}`;
  } else {
    body = `${p.price != null && state.bundles.length ? '<p class="addon-h">🧩 纯单点</p>' : ''}<ul class="res-items">${groupIds(p.ids).map(([id, q]) => line(state.byId.get(id), q, priceOf(state.byId.get(id)) ? `<span class="diff">¥${r1(priceOf(state.byId.get(id)) * q)}</span>` : '')).join('')}</ul>`;
  }
  const save = p.alone != null && p.alone - p.price >= 1 ? `<span class="save">比单点${p.aloneExact ? '' : '至少'}省 ¥${r1(p.alone - p.price)}</span>` : '';
  const tips = [];
  const cp = p.parts.find(x => x.bundle.coupon)?.bundle.coupon;
  if (cp && cp.source === 'claimable') tips.push(`🎟️ 先去麦当劳 App「麦麦省」领取「${esc(cp.title)}」再下单`);
  else if (cp && !cp.validNow) tips.push(`🎟️ 「${esc(cp.title)}」${esc(couponWhen(cp))}，到时候再点哦`);
  if (changed.length) tips.push(`🔁 点单时记得换：${changed.map(x => `「${esc(x.def)}」→「${esc(x.name)}」`).join('，')}`);
  if (!p.parts.length) tips.push('💡 ' + esc(tweakText(bestTweak(p.ids, T))));
  const C = 2 * Math.PI * 26;
  return `<article class="card result ${i === 0 ? 'top' : ''}" data-idx="${i}">
    ${i === 0 ? '<span class="crown">👑 最推荐</span>' : ''}
    <header class="res-h">
      <div class="fit"><svg viewBox="-32 -32 64 64"><circle r="26" class="fit-bg"/><circle r="26" class="fit-fg" transform="rotate(-90)" stroke-dasharray="${C * p.fit / 100} ${C}"/></svg><b>${p.fit}</b></div>
      <div class="res-title"><span class="rank">营养契合度</span><p>${esc(diagnose(p.t, T))}</p></div>
      ${p.price != null ? `<div class="price-box"><span class="price">¥${r1(p.price)}</span>${p.price > PRICY ? '<span class="pricy">💸 偏贵</span>' : ''}${p.ppg ? `<span class="ppg ${state.solver.priceW === 3 ? 'hot' : ''}">¥${p.ppg.toFixed(2)}/g蛋白</span>` : ''}${save}</div>` : ''}
    </header>
    ${body}
    ${bullets(p.t, T)}
    <div class="res-foot">
      <span class="na ${p.t.na > 1200 ? 'warn' : ''}">🧂 钠 ${r0(p.t.na)}mg</span>
      <span class="burn">${BURN.slice(0, 2).map(([e, l, m]) => `${e} ${l} ${r0(burnMin(p.t.kcal, m))}分钟`).join(' · ')}</span>
    </div>
    ${tips.map(t => `<p class="tweak">${t}</p>`).join('')}
    <div class="res-actions">
      <button type="button" class="btn btn-sm" data-act="tray">🍔 我没吃够</button>
      <button type="button" class="btn btn-sm btn-y" data-act="poster">生成战报</button>
    </div>
  </article>`;
}

const planLabel = p => {
  if (!p.parts.length) return SCENES[state.solver.scene]?.label || '智能配餐';
  const names = p.parts.map(x => x.bundle.name);
  return names.length === 2 && names[0] === names[1] ? `两份${names[0]}` : names.join(' + ');
};

function bindSolver() {
  const v = $('#view-solver');
  let debounce;
  v.addEventListener('toggle', e => { if (e.target.matches('details.more')) state.solver._moreOpen = e.target.open; }, true);
  v.addEventListener('click', e => {
    const o = state.solver;
    const sc = e.target.closest('[data-scene]');
    if (sc) { o.scene = sc.dataset.scene; o.custom = null; return renderSolver(); }
    const op = e.target.closest('[data-opt]');
    if (op) { const k = op.dataset.opt; o[k] = ['maxItems', 'priceW'].includes(k) ? +op.dataset.val : op.dataset.val; return renderSolver(); }
    if (e.target.closest('[data-reset-target]')) { o.custom = null; return renderSolver(); }
    const act = e.target.closest('[data-act]');
    if (act) {
      const p = lastSolve.res.picked[+act.closest('[data-idx]').dataset.idx];
      if (act.dataset.act === 'tray') { state.tray = new Map(groupIds(p.ids)); state.trayMeta = { label: planLabel(p), price: p.price, edited: false }; saveTray(); location.hash = '#builder'; toast('没吃够？加点什么都行，麦小薯帮你盯着 👀'); }
      if (act.dataset.act === 'log') logMeal(p.ids, planLabel(p), p.price);
      if (act.dataset.act === 'poster') showPoster(p.ids, lastSolve.T, planLabel(p), p.price);
    }
  });
  v.addEventListener('input', e => {
    const o = state.solver;
    const el = e.target;
    if (el.dataset.target) {
      o.custom = { ...sceneTarget(), [el.dataset.target]: +el.value || 0 };
      clearTimeout(debounce); debounce = setTimeout(runSolver, 250);
    } else if (el.dataset.optRange) {
      o[el.dataset.optRange] = +el.value;
      el.previousElementSibling.querySelector('.val').textContent = +el.value ? (el.dataset.optRange === 'budget' ? '¥' + el.value : el.value + ' mg') : '不限';
      clearTimeout(debounce); debounce = setTimeout(runSolver, 200);
    } else if (el.dataset.optCheck) {
      o[el.dataset.optCheck] = el.checked; runSolver();
    }
  });
}

// ============================================================ 视图：自由组餐
function saveTray() {
  store.set('tray', [...state.tray]);
  store.set('trayMeta', state.tray.size ? state.trayMeta || null : null); // 记住是从哪个方案来的
}
function trayEntries() { return [...state.tray].map(([id, q]) => [state.byId.get(id), q]).filter(([f]) => f); }

function renderBuilder() {
  const b = state.builder;
  const hasPrices = state.prices.size > 0;
  $('#view-builder').innerHTML = `
  <section class="card meal-top" id="mealTop"></section>
  <section class="card addon-card" id="addonCard"></section>
  <details class="card catalog-box" id="catalogBox" ${b.open ? 'open' : ''}>
    <summary><span class="num">🔍</span>查看全部餐品 <small>想自己找？搜索或按分类挑</small></summary>
    <div class="toolbar">
      <input type="search" id="bq" placeholder="搜索餐品，如 板烧 / 麦乐鸡 / 玉米杯" value="${esc(b.q)}" aria-label="搜索餐品">
      <select id="bsort" aria-label="排序">
        ${[['default', '默认分类'], ['pd', '蛋白供能比 ↓'], ['p', '蛋白质 ↓'], ['kcal', '热量 ↑'], ['na', '钠 ↑'], ...(hasPrices ? [['ppy', '每元蛋白 ↓']] : [])].map(([v, l]) => `<option value="${v}" ${b.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <label class="switch sm"><input type="checkbox" id="bhp" ${b.highP ? 'checked' : ''}><span></span>蛋白 ≥ 20g</label>
      <div class="chips chips-scroll">${[['all', '全部'], ...CATS.map(c => [c.key, c.emoji + ' ' + c.label])].map(([k, l]) => `<button type="button" class="chip ${b.cat === k ? 'on' : ''}" data-bcat="${k}">${l}</button>`).join('')}</div>
    </div>
    <p class="hint price-hint">🟢 在售 ${state.onSale.size} 款 · 💰 ${esc(priceLabel())}</p>
    <div class="food-grid" id="foodGrid"></div>
  </details>
  <button type="button" class="tray-mini" id="trayMini" hidden></button>`;
  renderFoodGrid(); renderTray();
}

function renderFoodGrid() {
  const b = state.builder;
  const q = b.q.trim().toLowerCase();
  const pastCount = state.foods.filter(f => !isOnSale(f)).length;
  let list = state.foods.filter(f => (b.cat === 'all' || f.cat === b.cat) && (!q || f.name.toLowerCase().includes(q)) && (!b.highP || f.p >= 20) && (b.showPast || isOnSale(f)));
  const news = []; // 没有官方营养数据的新品不在组餐里显示
  if (b.cat === 'new') list = [];
  const ppy = f => (priceOf(f) ? f.p / priceOf(f) : -1);
  const sorters = { pd: (a, c) => c.pd - a.pd, p: (a, c) => c.p - a.p, kcal: (a, c) => a.kcal - c.kcal, na: (a, c) => a.na - c.na, ppy: (a, c) => ppy(c) - ppy(a) };
  if (sorters[b.sort]) list = [...list].sort(sorters[b.sort]);
  else list = [...list].sort((a, c) => CATS.findIndex(x => x.key === a.cat) - CATS.findIndex(x => x.key === c.cat));
  const newCards = news.map(m => `<div class="food new-item">
      <span class="thumb"><img src="${esc(m.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>
      <div class="food-body">
        <div class="food-name">${esc(m.name)}<span class="new-tag">新品</span></div>
        <div class="food-kcal"><span class="pr">¥${effPrice(m)}</span></div>
        <p class="new-note">麦当劳官方营养数据尚未公布，暂不参与计算</p>
      </div>
    </div>`).join('');
  const pastToggle = `<button type="button" class="past-toggle" data-past>${b.showPast ? `🙈 隐藏往期/限定（${pastCount}）` : `🕰 显示往期/限定产品（${pastCount}）`}</button>`;
  $('#foodGrid').innerHTML = (newCards + list.map(f => {
    const q = state.tray.get(f.id) || 0;
    const pr = priceOf(f);
    const tier = tierOf(f);
    return `<div class="food ${q ? 'in' : ''} ${isOnSale(f) ? '' : 'past'}" data-id="${esc(f.id)}">
      ${thumb(f)}
      <div class="food-body">
        <div class="food-name">${esc(f.name)}${isOnSale(f) ? '' : '<span class="past-tag">往期/限定</span>'}</div>
        ${bombBadges(f).length ? `<div class="bombs">${bombBadges(f).map(([i, l, d]) => `<span class="bomb-tag" title="${esc(d)}">${i} ${l}</span>`).join('')}</div>` : ''}
        ${f.cat === 'combo' ? `<div class="combo-note" title="${esc(comboNote(f))}">🎯 ${esc(COMBO_INFO[f.name] || '500大卡套餐 · 整套合计')}${!pr && menuSrc() ? ' · <b>门店菜单未见</b>' : ''}</div>` : ''}
        <div class="food-kcal"><b>${r0(f.kcal)}</b> kcal ${pr ? `<span class="pr">¥${pr}</span>${state.prices.get(f.id)?.daypart === 'breakfast' && f.cat !== 'breakfast' ? '<small> 早餐时段价</small>' : ''}` : '<small class="nopr">· 无单点价</small>'}</div>
        ${macroStrip(f)}
        <div class="food-mac"><span class="mp">P ${f.p}</span><span class="mc">C ${f.c}</span><span class="mf">F ${f.f}</span></div>
      </div>
      <div class="stepper">${q ? `<button type="button" data-dec aria-label="减少">−</button><b>${q}</b>` : ''}<button type="button" data-inc aria-label="添加 ${esc(f.name)}">＋</button></div>
    </div>`;
  }).join('')) + pastToggle || '<div class="empty">没有符合条件的餐品</div>';
}

// 托盘价格：从配餐带来且没改动 → 套餐价；改动后 → 单点合计（参考）
function trayPrice(t) {
  const m = state.trayMeta;
  if (m && !m.edited && m.price != null) return { v: m.price, label: '套餐价' };
  return t.priced && state.prices.size ? { v: t.price, label: '单点合计' } : null;
}

// 「我没吃够」时加点什么：蛋白多、热量不高、钠低、不油炸，不推饮品
function suggestAddons(t, T) {
  const dp = state.solver.scene === 'breakfast' ? 'breakfast' : 'regular';
  const pGap = Math.max(0, T.p - t.p);
  return state.foods
    .filter(f => isOnSale(f) && !f.isDrink && !f.kidsOnly && f.cat !== 'combo' && priceOf(f) != null && f.kcal > 0 && f.kcal <= 420 && daypartOK(f, dp) && !bombBadges(f).length // 不推荐带「热量不低 / 钠偏高」提示的
      && f.cat !== 'dessert' && !FRIED_SIDE.test(f.id) && (f.p >= 8 || /玉米杯|苹果片/.test(f.name))) // 没吃够要的是能吃饱的：不推甜品/油炸，清爽配餐例外
    .map(f => ({ f, s: f.pd * 100 - f.na / 80 - (pGap > 0 ? 0 : f.kcal / 80) + Math.min(f.p, pGap) * 0.3 }))
    .sort((a, b) => b.s - a.s).slice(0, 6).map(x => x.f);
}

// 组餐页顶部：这一餐 = 吃什么（可直接加减）+ 四项数据 + 操作
function renderMealTop(entries, t, T, L) {
  const el = $('#mealTop');
  if (!el) return;
  if (!entries.length) {
    el.innerHTML = `<div class="mt-empty">${MASCOT_SM}<div><b>这一餐还是空的</b><small>先去「智能配餐」选一个方案，或者直接从下面加</small></div><a class="btn btn-sm btn-y" href="#solver">✨ 去配餐</a></div>`;
    return;
  }
  const meta = state.trayMeta;
  const title = meta ? (meta.edited ? `「${meta.label}」+ 加点` : meta.label) : '我的这一餐';
  const tp = trayPrice(t);
  const warn = [
    t.na > 2000 ? `🧂 钠 ${r0(t.na)}mg，已超全天建议上限` : t.na > 1200 ? `🧂 钠 ${r0(t.na)}mg，占全天建议 ${r0(t.na / NA_DAY * 100)}%` : '',
  ].filter(Boolean);
  el.innerHTML = `
    <div class="mt-head">
      <div><p class="eyebrow">这一餐 · 对标「${esc(SCENES[state.solver.scene]?.label || '正常一顿')}」</p><h2>${esc(title)}</h2></div>
      <div class="mt-side">${tp ? `<b class="mt-price">¥${r1(tp.v)}</b><small class="mt-pl">${tp.label} · 参考价</small>` : ''}<span class="mt-fit">契合度 <b>${fitScore(L)}</b>%</span></div>
    </div>
    <ul class="mt-list">${entries.map(([f, q]) => `<li data-id="${esc(f.id)}">${thumb(f, 'sm')}<span class="tl-name">${esc(f.name)}</span><span class="tl-k">${r0(f.kcal * q)} kcal</span><span class="stepper sm"><button type="button" data-dec aria-label="减少">−</button><b>${q}</b><button type="button" data-inc aria-label="增加">＋</button></span></li>`).join('')}</ul>
    <div class="mt-stats">${['kcal', 'p', 'c', 'f'].map(k => {
      const v = t[k], tg = T[k], ratio = tg > 0 ? v / tg : 0;
      const [cls, txt] = judge(k, v, tg);
      return `<div class="mt-stat ${cls}">
        <span class="mt-l">${MAC[k].label}</span>
        <span class="mt-v"><b class="${k === 'kcal' ? '' : 'm' + k}">${r0(v)}</b><small>/ ${r0(tg)}${MAC[k].unit}</small></span>
        <span class="mt-bar"><i style="width:${clamp(ratio / 1.5, 0, 1) * 100}%;background:${MAC[k].color}"></i><s></s></span>
        <span class="mt-d">${txt}</span>
      </div>`;
    }).join('')}</div>
    ${warn.map(w => `<p class="mt-warn">${w}</p>`).join('')}
    <div class="mt-actions">
      <button type="button" class="btn btn-sm btn-y" data-tray="poster">生成战报</button>
      <button type="button" class="btn btn-sm" data-tray="share">分享</button>
      <button type="button" class="btn btn-sm" data-tray="clear">清空</button>
    </div>`;
}

function renderAddons(entries, t, T) {
  const el = $('#addonCard');
  if (!el) return;
  const list = suggestAddons(t, T);
  el.innerHTML = `
    <h2 class="card-h"><span class="num">🍔</span>${entries.length ? '没吃够？加一点这些' : '从这些开始'} <small>按「蛋白多、热量适中、钠不高」挑的</small></h2>
    <div class="addon-grid">${list.map(f => {
      const q = state.tray.get(f.id) || 0;
      return `<div class="addon ${q ? 'in' : ''}" data-id="${esc(f.id)}">
        ${thumb(f)}
        <div class="ad-body"><b>${esc(f.name)}</b>
          <small><span class="mp">蛋白 +${f.p}g</span> · +${r0(f.kcal)} kcal${priceOf(f) ? ` · ¥${priceOf(f)}` : ''}</small></div>
        <button type="button" class="ad-add" data-inc aria-label="加一份 ${esc(f.name)}">${q ? `已加 ${q}` : '＋ 加'}</button>
      </div>`;
    }).join('')}</div>`;
}

function renderTray() {
  const entries = trayEntries();
  const T = sceneTarget(state.solver.scene);
  const t = totalsOf(entries);
  const L = lossOf(t, T);
  renderMealTop(entries, t, T, L);
  renderAddons(entries, t, T);
  // 展开全部餐品往下翻时，用悬浮小结实时反馈，点一下回到顶部
  const mini = $('#trayMini');
  if (mini) {
    mini.hidden = !entries.length;
    mini.innerHTML = entries.length ? `<span class="tm-n">🍔 ${t.n}</span><span class="tm-k"><b>${r0(t.kcal)}</b>kcal</span><span class="tm-m"><i class="mp">P${r0(t.p)}</i><i class="mc">C${r0(t.c)}</i><i class="mf">F${r0(t.f)}</i></span><span class="tm-fit">${fitScore(L)}%</span><span class="tm-go">看这一餐 ↑</span>` : '';
  }
}

function bindBuilder() {
  const v = $('#view-builder');
  v.addEventListener('input', e => {
    const b = state.builder;
    if (e.target.id === 'bq') { b.q = e.target.value; renderFoodGrid(); }
    if (e.target.id === 'bhp') { b.highP = e.target.checked; renderFoodGrid(); }
  });
  v.addEventListener('change', e => { if (e.target.id === 'bsort') { state.builder.sort = e.target.value; renderFoodGrid(); } });
  v.addEventListener('toggle', e => { if (e.target.id === 'catalogBox') state.builder.open = e.target.open; }, true);
  v.addEventListener('click', e => {
    if (e.target.closest('#trayMini')) return window.scrollTo({ top: 0, behavior: 'smooth' });
    if (e.target.closest('[data-past]')) { state.builder.showPast = !state.builder.showPast; return renderFoodGrid(); }
    const cat = e.target.closest('[data-bcat]');
    if (cat) { state.builder.cat = cat.dataset.bcat; $$('[data-bcat]', v).forEach(x => x.classList.toggle('on', x === cat)); return renderFoodGrid(); }
    const inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]');
    if (inc || dec) {
      const id = e.target.closest('[data-id]').dataset.id;
      const q = (state.tray.get(id) || 0) + (inc ? 1 : -1);
      if (q <= 0) state.tray.delete(id); else state.tray.set(id, q);
      if (inc) { const f = state.byId.get(id); const bb = bombBadges(f); if (bb.length) toast(`🍟 麦小薯小贴士：「${f.name}」${bb.map(x => x[1] + '（' + x[2] + '）').join('，')}`, 2600); }
      if (state.trayMeta) state.trayMeta.edited = true;
      saveTray(); renderFoodGrid(); renderTray();
      return;
    }
    const sw = e.target.closest('[data-swap]');
    if (sw) {
      const q = state.tray.get(sw.dataset.swap);
      state.tray.delete(sw.dataset.swap);
      state.tray.set(sw.dataset.to, q);
      if (state.trayMeta) state.trayMeta.edited = true;
      saveTray(); renderFoodGrid(); renderTray(); toast('已替换');
      return;
    }
    const act = e.target.closest('[data-tray]');
    if (!act) return;
    const ids = trayEntries().flatMap(([f, q]) => Array(q).fill(f.id));
    if (act.dataset.tray === 'clear') { state.tray.clear(); state.trayMeta = null; saveTray(); renderFoodGrid(); renderTray(); }
    if (act.dataset.tray === 'log') logMeal(ids, state.trayMeta?.label || '自由组餐', trayPrice(totalsOf(trayEntries()))?.v ?? null);
    if (act.dataset.tray === 'poster') { const t = totalsOf(trayEntries()); showPoster(ids, sceneTarget(state.solver.scene), state.trayMeta?.label || '自由组餐', trayPrice(t)?.v ?? null); }
    if (act.dataset.tray === 'share') {
      const url = `${location.origin}${location.pathname}#builder?m=${encodeURIComponent(trayEntries().map(([f, q]) => `${f.id}*${q}`).join('|'))}`;
      (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast('链接已复制，朋友打开即是同一份托盘'), () => prompt('复制这个链接：', url));
    }
  });
}

// ============================================================ 视图：热量小贴士（面向普通人：份量小、能量足的也要心里有数）
// 换算锚点：一碗米饭约 150g ≈ 174 kcal；《中国居民膳食指南（2022）》食盐 < 5g/天 ≈ 钠 2000mg；1g 盐 ≈ 393mg 钠
const RICE_KCAL = 174, NA_DAY = 2000, NA_PER_SALT = 393;
const rice = kcal => r1(kcal / RICE_KCAL);
const isDrinkish = f => f.isDrink;
// 「小东西」：小食、甜品、炸鸡小食，以及油条/薯饼/香肠这类早餐配角
const isSmall = f => !isDrinkish(f) && (['side', 'dessert', 'chicken'].includes(f.cat) || /油条|薯饼|香肠$/.test(f.name));
function bombBadges(f) {
  const b = [];
  if (isSmall(f) && f.kcal >= 200) b.push(['🍚', '热量不低', `≈ ${rice(f.kcal)} 碗米饭`]);
  if (f.na >= 800) b.push(['🧂', '钠偏高', `占全天 ${r0(f.na / NA_DAY * 100)}%`]);
  else if (!isDrinkish(f) && f.kcal > 0 && f.kcal < 300 && f.na / f.kcal >= 3) b.push(['🧂', '钠偏高', `钠 ${r0(f.na)}mg`]);
  return b;
}

// 「你以为 vs 实际」：常见直觉，数据核验成立才展示
const MYTHS = [
  ['麦香鱼', '汉堡包', 'kcal', '鱼肉听起来更清淡'],
  ['麦香鸡', '吉士汉堡包', 'kcal', '鸡肉堡应该比牛肉堡轻'],
  ['大薯条', '吉士汉堡包', 'kcal', '薯条只是个配角'],
  ['那么大鸡排', '板烧鸡腿堡', 'kcal', '一块鸡排当零食而已'],
  ['奥利奥麦旋风', '汉堡包', 'kcal', '甜品就是饭后一口'],
  ['双层猪柳蛋麦满分', '巨无霸', 'kcal', '早餐总归吃得清淡些'],
  ['麦乐鸡5块', '汉堡包', 'kcal', '几块鸡块垫垫肚子'],
  ['菠萝派', '汉堡包', 'kcal', '一个小派没多少热量'],
  ['皮蛋鸡肉粥', '麦乐鸡5块', 'na', '喝碗粥最清淡'],
  ['麦辣鸡腿汉堡', '巨无霸', 'na', '巨无霸肯定是最咸的'],
];

const STEP_KCAL = 0.04; // 成人步行约 0.04 kcal/步
const steps = kcal => Math.round(kcal / STEP_KCAL / 100) * 100;

function renderInsights() {
  const sale = state.foods.filter(isOnSale);
  const food = sale.filter(f => !isDrinkish(f));
  const smalls = food.filter(isSmall).sort((a, b) => b.kcal - a.kcal).slice(0, 10);
  const naTop = food.filter(f => f.cat !== 'combo').sort((a, b) => b.na - a.na).slice(0, 8);
  const sneaky = food.filter(f => f.kcal > 0 && f.kcal < 300 && f.na >= 300).map(f => ({ f, v: f.na / f.kcal * 100 })).sort((a, b) => b.v - a.v).slice(0, 5);
  // 空热量：排除饮品（大家都知道饮料没蛋白），只看吃的：蛋白供能 < 8% 且 ≥ 120 kcal
  const traps = food.filter(f => f.kcal >= 120 && f.pd < 0.08).sort((a, b) => b.kcal - a.kcal).slice(0, 8);
  const myths = MYTHS.map(([a, b, k, belief]) => ({ a: state.byId.get(a), b: state.byId.get(b), k, belief }))
    .filter(m => m.a && m.b && isOnSale(m.a) && isOnSale(m.b) && m.a[m.k] >= m.b[m.k] * 0.85);
  const swapsList = [
    ['中薯条', '小杯玉米杯'], ['可乐中杯', '无糖可口可乐中杯'], ['麦辣鸡腿汉堡', '板烧鸡腿堡'], ['巨无霸', '双层吉士汉堡'], ['菠萝派', '苹果片'], ['猪柳蛋麦满分', '原味板烧鸡腿麦满分'],
  ].map(([a, b]) => [state.byId.get(a), state.byId.get(b)]).filter(([a, b]) => a && b && isOnSale(a) && isOnSale(b));
  const top = smalls[0], salty = sneaky[0]?.f;
  const maxSmall = smalls[0]?.kcal || 1, maxNa = naTop[0]?.na || 1;
  const riceIcons = n => '🍚'.repeat(Math.floor(n)) + (n - Math.floor(n) >= 0.5 ? '<span class="half">🍚</span>' : '');

  $('#view-insights').innerHTML = `
  <div class="view-head"><div class="vh-mascot">${MASCOT}</div><div><p class="eyebrow">热量小贴士 · 基于麦当劳官方营养数据 · ${sale.length} 款在售餐品</p>
    <h1>看着小、吃着香，<span class="hl">热量和钠一点不少。</span></h1>
    <p class="lede" style="margin-bottom:0">${top ? `一份「${esc(top.name)}」${r0(top.kcal)} kcal，≈ <b>${rice(top.kcal)} 碗米饭</b>` : ''}${salty ? `；一份「${esc(salty.name)}」只有 ${r0(salty.kcal)} kcal，钠却有 <b>${r0(salty.na)}mg</b>，是全天建议量的 ${r0(salty.na / NA_DAY * 100)}%。` : '。'}</p></div></div>

  <div class="card bomb-card">
    <h2 class="card-h"><span class="num">🍚</span>小份也有能量 <small>小食 / 甜品 / 炸鸡小食，按热量排序 · 🍚 = 一碗米饭（约 174 kcal）</small></h2>
    <div class="bomb-list">${smalls.map((f, i) => `<div class="bomb-row">
      <span class="br-n">${i + 1}</span>${thumb(f, 'sm')}
      <span class="br-name">${esc(f.name)}</span>
      <span class="br-bar"><i style="width:${f.kcal / maxSmall * 100}%"></i></span>
      <span class="br-v"><b>${r0(f.kcal)}</b><small>kcal</small></span>
      <span class="br-rice" title="≈ ${rice(f.kcal)} 碗米饭 · 要走约 ${steps(f.kcal).toLocaleString()} 步">${riceIcons(f.kcal / RICE_KCAL)}<small>${rice(f.kcal)}碗 · 🚶${(steps(f.kcal) / 1000).toFixed(1)}k步</small></span>
    </div>`).join('')}</div>
  </div>

  ${myths.length ? `<div class="card">
    <h2 class="card-h"><span class="num">🤔</span>你以为 vs 实际 <small>常见直觉 × 官方数据</small></h2>
    <div class="myth-grid">${myths.map(m => {
      const unit = m.k === 'na' ? 'mg 钠' : 'kcal';
      const ratio = m.a[m.k] / m.b[m.k];
      const verdict = ratio >= 1.05 ? `比「${esc(m.b.name)}」还多 ${r0((ratio - 1) * 100)}%` : `和一个「${esc(m.b.name)}」差不多`;
      return `<div class="myth">
        <p class="m-think">💭 你以为：${esc(m.belief)}</p>
        <div class="m-vs"><div>${thumb(m.a, 'sm')}<b>${esc(m.a.name)}</b><span class="m-num hot">${r0(m.a[m.k])}<small>${unit}</small></span></div><span class="m-op">${ratio >= 1.05 ? '＞' : '≈'}</span><div>${thumb(m.b, 'sm')}<b>${esc(m.b.name)}</b><span class="m-num">${r0(m.b[m.k])}<small>${unit}</small></span></div></div>
        <p class="m-real">实际：${verdict}</p>
      </div>`;
    }).join('')}</div>
  </div>` : ''}

  <div class="grid-2">
    <div class="card">
      <h2 class="card-h"><span class="num">🧂</span>钠含量较高 <small>单份含钠 · 全天建议 &lt; 2000mg（约 5g 盐）</small></h2>
      <div class="na-list">${naTop.map(f => `<div class="na-row">
        <span class="br-name">${CAT[f.cat].emoji} ${esc(f.name)}</span>
        <span class="na-bar"><i style="width:${f.na / maxNa * 100}%"></i></span>
        <span class="na-v"><b>${r0(f.na)}</b>mg<small>${r0(f.na / NA_DAY * 100)}% · ≈${r1(f.na / NA_PER_SALT)}g盐</small></span>
      </div>`).join('')}</div>
    </div>
    <div class="card">
      <h2 class="card-h"><span class="num">🥣</span>口味清淡，钠不低 <small>热量不高、钠相对多：每 100 kcal 含钠</small></h2>
      <div class="list-mini">${sneaky.map(({ f, v }) => `<div><span>${CAT[f.cat].emoji} ${esc(f.name)} <small>${r0(f.kcal)} kcal</small></span><b>${r0(v)}<small>mg / 100kcal</small></b></div>`).join('')}</div>
      <p class="hint">参考：一份汉堡包每 100 kcal 含钠约 ${r0((state.byId.get('汉堡包')?.na || 0) / (state.byId.get('汉堡包')?.kcal || 1) * 100)}mg。</p>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2 class="card-h"><span class="num">🍟</span>解馋款（蛋白较少） <small>只看吃的（饮料不算）：适合偶尔犒劳自己</small></h2>
      <div class="list-mini">${traps.map(f => `<div><span>${CAT[f.cat].emoji} ${esc(f.name)} <small>蛋白只占 ${r0(f.pd * 100)}%</small></span><b>${r0(f.kcal)}<small>kcal</small></b></div>`).join('')}</div>
    </div>
    <div class="card">
      <h2 class="card-h"><span class="num">🔁</span>一换就省 <small>同样的位置，换个选择</small></h2>
      <div class="list-mini swaps-static">${swapsList.map(([a, b]) => `<div><span>${esc(a.name)} → <b>${esc(b.name)}</b></span><b class="${b.kcal <= a.kcal ? 'good' : ''}">${b.kcal - a.kcal <= 0 ? '−' : '+'}${r0(Math.abs(b.kcal - a.kcal))}<small>kcal</small></b></div>`).join('')}</div>
    </div>
  </div>

  <details class="card pro-box" id="proBox">
    <summary><span class="num">📊</span>给健身党的专业数据 <small>热量×蛋白全景图、蛋白分级、蛋白密度、每元蛋白</small></summary>
    <div id="proBody"></div>
  </details>`;
  $('#proBox').addEventListener('toggle', e => { if (e.target.open && !$('#proBody').innerHTML) $('#proBody').innerHTML = proInsightsHtml(sale); });
}

function proInsightsHtml(sale) {
  const foods = sale.filter(f => f.kcal >= 40);
  const W = 760, H = 420, PL = 48, PB = 40, PT = 16, PR = 16;
  const maxK = Math.ceil(Math.max(...foods.map(f => f.kcal)) / 100) * 100;
  const maxP = Math.ceil(Math.max(...foods.map(f => f.p)) / 10) * 10;
  const x = k => PL + k / maxK * (W - PL - PR);
  const y = p => H - PB - p / maxP * (H - PB - PT);
  const line = pct => { const k2 = Math.min(maxK, maxP * 4 / pct); return `<line x1="${x(0)}" y1="${y(0)}" x2="${x(k2)}" y2="${y(k2 * pct / 4)}" class="ref"/><text x="${x(k2) - 4}" y="${y(k2 * pct / 4) - 6}" class="ref-t" text-anchor="end">蛋白供能 ${pct * 100}%</text>`; };
  const scatter = `<svg viewBox="0 0 ${W} ${H}" class="scatter" role="img" aria-label="热量与蛋白质散点图">
    ${[0, 0.25, 0.5, 0.75, 1].map(t => `<line x1="${PL}" x2="${W - PR}" y1="${y(maxP * t)}" y2="${y(maxP * t)}" class="grid"/><text x="${PL - 8}" y="${y(maxP * t) + 4}" text-anchor="end" class="ax">${r0(maxP * t)}</text>`).join('')}
    ${[0, 0.25, 0.5, 0.75, 1].map(t => `<text x="${x(maxK * t)}" y="${H - PB + 20}" text-anchor="middle" class="ax">${r0(maxK * t)}</text>`).join('')}
    <text x="${W - PR}" y="${H - 6}" text-anchor="end" class="ax-t">热量 kcal →</text><text x="${PL}" y="${PT - 4}" class="ax-t">↑ 蛋白质 g</text>
    <polygon points="${x(0)},${y(0)} ${x(Math.min(maxK, maxP * 4 / 0.3))},${y(Math.min(maxK, maxP * 4 / 0.3) * 0.3 / 4)} ${x(0)},${y(maxP)}" class="zone"/>
    ${line(0.3)}${line(0.15)}
    ${foods.map(f => `<circle cx="${x(f.kcal)}" cy="${y(f.p)}" r="${4 + Math.sqrt(f.na) / 9}" fill="${CAT[f.cat].color}" class="pt"><title>${esc(f.name)}\n${r0(f.kcal)}kcal · 蛋白${f.p}g · 钠${f.na}mg</title></circle>`).join('')}
  </svg>`;
  const mains = sale.filter(f => ['burger', 'chicken', 'breakfast', 'combo'].includes(f.cat));
  const tiers = ['S', 'A', 'B', 'C', 'D'].map(t => [t, mains.filter(f => tierOf(f) === t).sort((a, b) => b.pd - a.pd)]).filter(([, l]) => l.length);
  const topPD = [...sale].filter(f => f.p >= 5).sort((a, b) => b.pd - a.pd).slice(0, 12);
  const maxPD = topPD[0]?.pd || 1;
  const priced = sale.filter(f => priceOf(f) && f.p >= 8).map(f => ({ f, v: f.p / priceOf(f) })).sort((a, b) => b.v - a.v).slice(0, 10);
  return `
    <h3 class="pro-h">热量 × 蛋白质全景图 <small>左上阴影区 = 蛋白供能 ≥30% · 点大小 = 钠</small></h3>
    <div class="scatter-wrap">${scatter}</div>
    <div class="legend">${CATS.map(c => `<span><i style="background:${c.color}"></i>${c.label}</span>`).join('')}</div>
    <div class="grid-2" style="margin-top:18px">
      <div><h3 class="pro-h">蛋白分级 <small>S ≥30% 且脂肪 ≤45% · A ≥22% · B ≥17% · C ≥12%</small></h3>
        <div class="tiers">${tiers.map(([t, list]) => `<div class="tier-row"><span class="tier big t-${t}">${t}</span><div class="tier-items">${list.map(f => `<span class="ti">${CAT[f.cat].emoji} ${esc(f.name)}<small>${r0(f.pd * 100)}%</small></span>`).join('')}</div></div>`).join('')}</div></div>
      <div><h3 class="pro-h">蛋白密度榜 <small>每 100 kcal 含蛋白</small></h3>
        <div class="hbars">${topPD.map((f, i) => `<div class="hbar"><span class="hb-n">${i + 1}</span><span class="hb-l">${esc(f.name)}</span><span class="hb-t"><i style="width:${f.pd / maxPD * 100}%"></i></span><b>${r1(f.p / f.kcal * 100)}g</b></div>`).join('')}</div>
        ${priced.length ? `<h3 class="pro-h" style="margin-top:18px">每元蛋白 <small>${esc(priceLabel())}</small></h3><div class="hbars">${priced.map((x, i) => `<div class="hbar"><span class="hb-n">${i + 1}</span><span class="hb-l">${esc(x.f.name)} <small>¥${priceOf(x.f)}</small></span><span class="hb-t"><i style="width:${x.v / priced[0].v * 100}%;background:var(--y)"></i></span><b>${r1(x.v)}g/元</b></div>`).join('')}</div>` : ''}
      </div>
    </div>`;
}

// ============================================================ 视图：门店实时（MCP）
let campaignsCache = null;
function renderStore() {
  const s = state.storeSel;
  const src = menuSrc();
  const matchedSet = new Set(state.prices.values());
  $('#view-store').innerHTML = `
  <div class="view-head"><div class="vh-mascot">${MASCOT}</div><div><p class="eyebrow">Live via McDonald's MCP · mcp.mcd.cn</p><h1>选一家店，<span class="hl">价格和套餐实时同步。</span></h1></div></div>
  <div class="grid-2">
    <div class="card">
      <h2 class="card-h"><span class="num">01</span>找门店 <small>query-nearby-stores</small></h2>
      ${storePickerHtml(false)}
      <div style="margin-top:14px">${cardChipsHtml()}</div>
      ${s ? `<div class="store-sel ${src.kind}">
        <div><p class="eyebrow">当前门店</p><h3>${src.kind === 'reservation' ? '🌙' : src.kind === 'default' ? '⚠️' : '🏪'} ${esc(s.name)}</h3><p class="muted">${esc(s.address)} · 同步于 ${esc(s.fetchedAt || '')}</p>
        ${src.kind === 'reservation' ? `<p class="mode-note">这家店现在不在营业时间，麦小薯用 <b>${esc(src.reservationDate)}</b> 的预约菜单查到了它的真实菜单和价格。</p>` : ''}
        ${src.kind === 'default' ? '<p class="mode-note">这家店现在查不到菜单（不在营业时间且不支持预约），先用默认菜单的参考价，营业后点「刷新」即可。</p>' : ''}</div>
        <div class="ss-stats"><div><b>${src.items.length}</b><small>${src.kind === 'live' ? '在售餐品' : '菜单餐品'}</small></div><div><b>${state.bundles.length}</b><small>可算营养的套餐</small></div><div><b>${state.prices.size}</b><small>单品有价格</small></div></div>
        <a class="btn btn-sm btn-y" href="#solver">去配餐 →</a> <button class="btn btn-sm" data-refresh-menu>刷新</button> <button class="btn btn-sm" data-clear-store>取消门店</button>
      </div>` : `<div class="store-sel default"><p class="eyebrow">当前价格来源</p><h3>📋 默认菜单 · 参考价</h3><p class="mode-note">还没选门店，先用上海一家 24 小时门店的菜单快照（${esc(String(src?.fetchedAt || '').slice(0, 16))}）显示价格和套餐。选一家附近的店就能换成它的实时价格。</p></div>`}
    </div>
    <div class="card">
      <h2 class="card-h"><span class="num">02</span>本月活动 <small>campaign-calendar</small></h2>
      <div id="campaigns" class="campaigns"><div class="loading">${MASCOT_SM}加载活动日历…</div></div>
    </div>
  </div>
  ${state.couponsDisabled ? '' : couponCardHtml()}
  ${src?.bundles?.length ? `<div class="card">
    <h2 class="card-h"><span class="num">03</span>套餐结构 <small>${esc(priceLabel(src))} · 绿色 = 每一轮都有官方营养数据，可进入算法</small></h2>
    <div class="bundle-grid">${src.bundles.map(b => {
      const ok = state.bundles.some(x => x.code === b.code);
      return `<div class="bundle-card ${ok ? 'ok' : ''}">
        <div class="bc-h">${b.image ? `<img src="${esc(b.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<div><b>${esc(b.name)}</b><span>¥${effPrice(b)}</span>${effPrice(b) < b.originalPrice ? `<s class="was">¥${b.originalPrice}</s>` : ''}${memberTag(b) ? `<small class="mtag">${memberTag(b)}</small>` : ''}${b.discount && !memberTag(b) && effPrice(b) !== b.price ? `<small class="mtag off">${esc(b.discount.replace('随单购', ''))}可 ¥${b.price}</small>` : ''}</div></div>
        <p>${b.rounds.map(r => `${esc(r.name)}<small>(${r.choices.length}选1)</small>`).join(' + ')}</p>
        ${ok ? '' : '<small class="muted">含暂无官方营养数据的新品，不参与推荐</small>'}
      </div>`;
    }).join('')}</div>
  </div>` : ''}
  ${src ? `<div class="card">
    <h2 class="card-h"><span class="num">04</span>单品价格 × 营养匹配 <small>${esc(priceLabel(src))} · 绿色 = 已有官方营养数据</small></h2>
    <div class="menu-grid">${src.items.filter(m => m.price > 0 && !/^99/.test(m.code)).sort((a, b) => matchedSet.has(b) - matchedSet.has(a)).map(m => `<div class="menu-item ${matchedSet.has(m) ? 'ok' : ''}"><img src="${esc(m.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${esc(m.name)}</span><b>¥${effPrice(m)}</b>${m.originalPrice > effPrice(m) ? `<s>¥${m.originalPrice}</s>` : ''}${m.discount && effPrice(m) !== m.price ? `<small class="mtag off">${esc(m.discount.replace('随单购', ''))} ¥${m.price}</small>` : memberTag(m) ? `<small class="mtag">${memberTag(m)}</small>` : ''}</div>`).join('')}</div>
    <p class="hint">没匹配上的多为联名新品：官方营养库暂未收录，麦小薯不做猜测 —— 宁缺毋错。</p>
  </div>` : ''}`;
  loadCampaigns();
  if (state._scrollCoupons) { state._scrollCoupons = false; setTimeout(() => $('#couponCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
}

function couponCardHtml() {
  const list = [...state.coupons].sort((a, b) => (b.usable - a.usable) || ((b.validNow ? 1 : 0) - (a.validNow ? 1 : 0)) || ((a.next || Infinity) - (b.next || Infinity)));
  return `<div class="card" id="couponCard">
    <h2 class="card-h"><span class="num">🎟️</span>我的券包 <small>query-my-coupons · query-store-coupons · available-coupons · 只读，不会替你领券或用券</small></h2>
    ${!state.couponsRaw ? `<div class="loading">${MASCOT_SM}同步优惠券…</div>` : list.length ? `<div class="coupon-grid">${list.map(c => `<div class="coupon ${c.usable ? 'ok' : ''} ${c.validNow ? 'now' : ''}">
        ${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="cp-ico">🎟️</span>'}
        <div class="cp-body">
          <b>${esc(c.title)}${c.count > 1 ? ` <small>×${c.count}张</small>` : ''}</b>
          <span class="cp-price">${c.price != null ? `用券价 ¥${c.price}` : '价格未知'}</span>
          <span class="cp-when">${esc(couponWhen(c))}</span>
          <span class="cp-nut">${c.usable ? `✓ 营养可算（${esc(c.via)}）：${esc(c.rounds.map(r => r.name).join(' + '))}` : `✗ ${esc(c.why || '缺少价格')}`}</span>
        </div>
      </div>`).join('')}</div>
      <p class="hint">绿色的券会作为「特价套餐」进入智能配餐。券内商品组成只有在券生效时 MCP 才会返回，所以有些券要等到能用的那天才能算出营养 —— 麦小薯不做猜测。</p>`
      : '<p class="hint">券包是空的～去麦当劳 App「麦麦省」看看有没有可领的券吧</p>'}
  </div>`;
}

async function loadCampaigns() {
  const el = $('#campaigns');
  try {
    campaignsCache ||= (await api('/api/campaigns')).items;
    const seen = new Set();
    const items = campaignsCache.filter(c => c.tag !== '往期回顾' && !seen.has(c.title) && seen.add(c.title)).slice(0, 10);
    el.innerHTML = items.length ? items.map(c => `<article class="camp">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<div><p class="eyebrow">${esc(c.date)} ${c.tag && c.tag !== '往期回顾' ? `<span class="pill pill-y">${esc(c.tag)}</span>` : ''}</p><h4>${esc(c.title)}</h4><p>${esc(c.content).replace(/\n/g, ' ').slice(0, 90)}</p></div></article>`).join('') : '<p class="hint">本月暂无活动</p>';
  } catch (e) {
    el.innerHTML = `<p class="hint">活动日历暂不可用（${esc(e.message)}）</p>`;
  }
}

// 选店交互全局委托：配餐页、门店页里的选店组件都走这里
function bindStore() {
  document.addEventListener('submit', async e => {
    if (!e.target.matches('.js-store-form')) return;
    e.preventDefault();
    const fd = new FormData(e.target);
    const city = fd.get('city').trim(), kw = fd.get('keyword').trim();
    store.set('city', city); store.set('kw', kw);
    const list = e.target.nextElementSibling;
    list.innerHTML = `<div class="loading">${MASCOT_SM}正在找附近的麦当劳…</div>`;
    try {
      const { stores } = await api(`/api/stores?city=${encodeURIComponent(city)}&keyword=${encodeURIComponent(kw)}`);
      list.innerHTML = stores.length ? stores.slice(0, 8).map(s => `<button type="button" class="store" data-code="${esc(s.storeCode)}" data-name="${esc(s.name)}" data-addr="${esc(s.address)}"><b>${esc(s.name.replace(/^麦当劳/, ''))}</b><span>${esc(s.address)}</span><small>${s.distance != null ? '📍' + s.distance + 'm · ' : ''}${s.open ? '🟢 营业中' : '⚪ 休息中'} ${esc(s.hours)}</small></button>`).join('') : '<p class="hint">附近没找到门店，换个关键词试试</p>';
    } catch (err) { list.innerHTML = `<p class="hint err">查询失败：${esc(err.message)}</p>`; }
  });
  document.addEventListener('click', async e => {
    const st = e.target.closest('.store[data-code]');
    if (st) return selectStore(st.dataset.code, st.dataset.name, st.dataset.addr);
    if (e.target.closest('[data-goto-coupons]')) state._scrollCoupons = true;
    const card = e.target.closest('[data-card]');
    if (card) { const k = card.dataset.card; state.cards[k] = !state.cards[k]; store.set('cards', state.cards); buildBundles(); buildCoupons(); renderStatus(); route(); return; }
    if (e.target.closest('[data-refresh-menu]')) return selectStore(state.storeSel.storeCode, state.storeSel.name, state.storeSel.address);
    if (e.target.closest('[data-clear-store]')) { state.storeSel = null; store.set('store', null); state.solver.budget = 0; state.couponsRaw = null; applyPrices(); buildBundles(); buildCoupons(); renderStatus(); route(); }
  });
}

async function selectStore(code, name, address, quiet = false) {
  if (!quiet) toast('🏪 正在同步菜单和套餐…', 6000);
  try {
    const [m, b] = await Promise.all([api(`/api/menu?storeCode=${encodeURIComponent(code)}`), api(`/api/bundles?storeCode=${encodeURIComponent(code)}`)]);
    state.storeSel = { storeCode: code, name, address, fetchedAt: m.fetchedAt, items: m.items, bundles: b.items, mode: m.mode, reservationDate: m.reservationDate || null };
    store.set('store', state.storeSel);
    applyPrices(); buildBundles();
    await loadCoupons(quiet);
    renderStatus(); route();
    if (!quiet) {
      if (m.mode === 'reservation') toast(`🌙 这家店打烊了，已按 ${m.reservationDate} 的预约菜单同步：${state.bundles.length} 个套餐、${state.prices.size} 款单品`, 5000);
      else if (m.mode === 'unavailable') toast('⚠️ 这家店现在查不到菜单，先用默认菜单的参考价', 5000);
      else toast(`✅ 同步完成：${state.bundles.length} 个套餐、${state.prices.size} 款单品${state.coupons.length ? `、${state.coupons.length} 种优惠券` : ''}`);
    }
  } catch (e) { if (!quiet) toast('同步失败：' + e.message, 4000); }
}

// ============================================================ 视图：今日记录
function logMeal(ids, label, price = null) {
  const entries = groupIds(ids).map(([id, q]) => [state.byId.get(id), q]);
  const t = totalsOf(entries);
  const day = todayKey();
  (state.log[day] ||= []).push({
    at: new Date().toTimeString().slice(0, 5), label,
    items: entries.map(([f, q]) => [f.id, q]),
    totals: { kcal: t.kcal, p: t.p, c: t.c, f: t.f, na: t.na }, price,
  });
  store.set('log', state.log);
  renderHud();
  toast(`已记入今日：${r0(t.kcal)} kcal · 蛋白 ${r0(t.p)}g`);
}

function renderLog() {
  const T = calcTargets();
  const day = todayKey();
  const list = state.log[day] || [];
  const e = eatenOn(day);
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d; });
  const week = days.map(d => ({ d, t: eatenOn(todayKey(d)) }));
  const maxK = Math.max(T.kcal * 1.3, ...week.map(w => w.t.kcal));
  const streak = (() => { let n = 0; for (let i = 0; ; i++) { const d = new Date(); d.setDate(d.getDate() - i); const t = eatenOn(todayKey(d)); if (t.p >= T.p * 0.9) n++; else if (i > 0 || t.kcal > 0) break; else continue; if (i > 365) break; } return n; })();
  $('#view-log').innerHTML = `
  <div class="view-head"><div class="vh-mascot">${MASCOT}</div><div><p class="eyebrow">Daily Log · 数据只存在你的手机/电脑里</p><h1>今天吃了什么，<span class="hl">还差多少？</span></h1></div></div>
  <div class="grid-2">
    <div class="card log-today">
      <div class="lt-viz">${rings(e, T, 190)}
        <div class="tray-legend">${['p', 'c', 'f'].map(k => `<div><i style="background:${MAC[k].color}"></i>${MAC[k].label}<b>${r0(e[k])}</b><small>/${r0(T[k])}g</small></div>`).join('')}
          <div class="fit-inline">🔥 蛋白达标连续 <b>${streak}</b> 天</div></div>
      </div>
      ${list.length ? `<ul class="log-list">${list.map((x, i) => `<li><span class="ll-time">${esc(x.at)}</span><div><b>${esc(x.label)}${x.price != null ? ` <span class="diff">¥${r1(x.price)}</span>` : ''}</b><small>${x.items.map(([id, q]) => esc(id) + (q > 1 ? '×' + q : '')).join(' + ')}</small></div><span class="ll-k">${r0(x.totals.kcal)}<small>kcal</small></span><button type="button" class="x" data-del="${i}" aria-label="删除">×</button></li>`).join('')}</ul>`
        : `<div class="empty">${MASCOT_SM}<p>今天还没有记录哦～<br>在「智能配餐」或「自由组餐」里点「记入今日」</p></div>`}
      <a class="btn btn-y btn-block" href="#solver" data-remain>🧩 用剩下的额度配下一餐</a>
    </div>
    <div class="card">
      <h2 class="card-h"><span class="num">7D</span>近 7 天 <small>柱 = 热量 · 点 = 蛋白达成率</small></h2>
      <svg viewBox="0 0 420 220" class="week">
        <line x1="20" x2="410" y1="${190 - T.kcal / maxK * 160}" y2="${190 - T.kcal / maxK * 160}" class="ref"/><text x="410" y="${184 - T.kcal / maxK * 160}" text-anchor="end" class="ref-t">目标 ${r0(T.kcal)}</text>
        ${week.map((w, i) => { const xx = 30 + i * 55, h = w.t.kcal / maxK * 160; const pr = clamp(w.t.p / T.p, 0, 1.3); return `<rect x="${xx}" y="${190 - h}" width="32" height="${Math.max(h, 1)}" rx="5" class="${todayKey(w.d) === day ? 'bar today' : 'bar'}"/><circle cx="${xx + 16}" cy="${190 - pr / 1.3 * 160}" r="${w.t.p ? 5 : 0}" class="pdot"/><text x="${xx + 16}" y="210" text-anchor="middle" class="ax">${'日一二三四五六'[w.d.getDay()]}</text>`; }).join('')}
      </svg>
      <div class="log-actions"><button type="button" class="btn btn-sm" data-export>导出 JSON</button><button type="button" class="btn btn-sm" data-clear-today>清空今日</button></div>
    </div>
  </div>`;
}

function bindLog() {
  const v = $('#view-log');
  v.addEventListener('click', e => {
    const d = e.target.closest('[data-del]');
    if (d) { state.log[todayKey()].splice(+d.dataset.del, 1); store.set('log', state.log); renderLog(); renderHud(); }
    if (e.target.closest('[data-remain]')) { state.solver.scene = 'remain'; state.solver.custom = null; }
    if (e.target.closest('[data-clear-today]') && confirm('清空今天的全部记录？')) { delete state.log[todayKey()]; store.set('log', state.log); renderLog(); renderHud(); }
    if (e.target.closest('[data-export]')) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ profile: state.profile, log: state.log }, null, 2)], { type: 'application/json' }));
      a.download = `macro-log-${todayKey()}.json`; a.click();
    }
  });
}

// ============================================================ 视图：今天吃啥（扭蛋机 + 热量翻译机）
// 热量翻译：MET 法（kcal/分钟 = MET × 3.5 × 体重 / 200）。数值为估算，图个乐
const FUN_UNITS = [
  ['🍚', '米饭', kcal => `${rice(kcal)} 碗`],
  ['🚶', '走路', kcal => `${steps(kcal).toLocaleString()} 步`],
  ['💃', '广场舞', kcal => `${r0(burnMin(kcal, 5.0))} 分钟`],
  ['🧗', '爬楼梯', kcal => `${r0(burnMin(kcal, 8.8))} 分钟`],
  ['🧹', '拖地', kcal => `${r0(burnMin(kcal, 3.5))} 分钟`],
  ['🎮', '打游戏', kcal => `${r1(burnMin(kcal, 1.5) / 60)} 小时`],
  ['😴', '睡觉', kcal => `${r1(burnMin(kcal, 0.95) / 60)} 小时`],
];
const REELS = [
  ['main', '主食', f => f.cat === 'burger' || (f.cat === 'breakfast' && f.kcal >= 200 && !/粥/.test(f.name)) || /鸡排|脆汁鸡/.test(f.name)],
  ['side', '小食', f => !f.isDrink && (['side', 'dessert'].includes(f.cat) || (f.cat === 'chicken' && !/鸡排|脆汁鸡/.test(f.name)) || /油条|薯饼|香肠$|粥/.test(f.name))],
  ['drink', '饮品', f => f.isDrink && f.kcal >= 0],
];
const GACHA_MODES = [['ok', '😇 不超标'], ['free', '🍔 吃顿好的'], ['rand', '🎲 完全随机']];
const gacha = { mode: 'ok', picks: null, locks: {}, spinning: false };

function reelPool(key) {
  const dp = activeDaypart(state.solver);
  const test = REELS.find(r => r[0] === key)[2];
  return state.foods.filter(f => isOnSale(f) && !f.kidsOnly && f.cat !== 'combo' && daypartOK(f, dp) && test(f));
}

function rollGacha() {
  const T = mealBudget();
  const pools = Object.fromEntries(REELS.map(([k]) => [k, reelPool(k)]));
  const rnd = arr => arr[Math.floor(Math.random() * arr.length)];
  let best = null;
  for (let i = 0; i < 300; i++) {
    const p = Object.fromEntries(REELS.map(([k]) => [k, gacha.locks[k] && gacha.picks?.[k] ? gacha.picks[k] : rnd(pools[k])]));
    if (Object.values(p).some(x => !x)) continue;
    const kcal = Object.values(p).reduce((s, f) => s + f.kcal, 0);
    const ok = gacha.mode === 'rand' || (gacha.mode === 'ok' ? kcal <= T.kcal * 1.05 && kcal >= T.kcal * 0.6 : kcal >= T.kcal * 1.15);
    if (ok) { best = p; break; }
    if (!best) best = p;
  }
  return best;
}

function gachaVerdict(kcal, target) {
  const r = kcal / target;
  if (r <= 0.75) return ['🥗', '吃得挺克制，下午可能会饿哦'];
  if (r <= 1.05) return ['😇', '刚刚好！这顿可以安心吃'];
  if (r <= 1.3) return ['😋', '稍微超一点点，饮料换无糖就完美了'];
  if (r <= 1.7) return ['😋', '这顿吃得挺满足，晚饭清淡些就好'];
  return ['🤝', '分量很足，适合和朋友一起分享'];
}

function renderGacha() {
  const T = mealBudget();
  $('#view-gacha').innerHTML = `
  <div class="view-head"><div class="vh-mascot">${MASCOT}</div><div><p class="eyebrow">选择困难？交给麦小薯</p><h1>今天吃啥？<span class="hl">拉一下就知道！</span></h1></div></div>
  <div class="card gacha-card">
    <div class="chips gacha-modes">${GACHA_MODES.map(([v, l]) => `<button type="button" class="chip ${gacha.mode === v ? 'on' : ''}" data-gmode="${v}">${l}</button>`).join('')}<small>这一餐建议约 ${r0(T.kcal)} kcal</small></div>
    <div class="slot">
      <div class="slot-top">🍟 麦小薯扭蛋机 🍟</div>
      <div class="reels">${REELS.map(([k, label]) => `<div class="reel-wrap"><span class="reel-label">${label}</span><div class="reel" id="reel-${k}"></div><button type="button" class="lock ${gacha.locks[k] ? 'on' : ''}" data-lock="${k}">${gacha.locks[k] ? '🔒 已锁定' : '🔓 锁住'}</button></div>`).join('')}</div>
      <button type="button" class="btn btn-y btn-xl spin-btn" data-spin>🎰 拉一下！</button>
    </div>
    <div id="gachaResult"></div>
  </div>`;
  paintReels();
  paintResult();
}

function reelFace(f) {
  return f ? `${thumb(f)}<b>${esc(f.name)}</b><small>${r0(f.kcal)} kcal</small>` : '<span class="reel-q">？</span>';
}
function paintReels() {
  for (const [k] of REELS) { const el = $('#reel-' + k); if (el) el.innerHTML = reelFace(gacha.picks?.[k]); }
}

function paintResult() {
  const el = $('#gachaResult');
  if (!el) return;
  if (!gacha.picks || gacha.spinning) { el.innerHTML = gacha.spinning ? '' : `<p class="hint" style="text-align:center">点「拉一下」，麦小薯帮你随机配一顿${gacha.mode === 'ok' ? '（不超这一餐建议）' : ''}</p>`; return; }
  const items = REELS.map(([k]) => gacha.picks[k]);
  const t = totalsOf(items.map(f => [f, 1]));
  const T = mealBudget();
  let [emo, line] = gachaVerdict(t.kcal, T.kcal);
  if (t.na > 1500) line += `；就是有点咸（钠 ≈ 全天的 ${r0(t.na / NA_DAY * 100)}%），记得多喝水 💧`;
  const bombs = items.flatMap(f => bombBadges(f).map(b => `${b[0]} ${f.name}：${b[1]}`));
  el.innerHTML = `
    <div class="g-verdict">${MASCOT_SM}<div><b>${emo} ${line}</b><small>${items.map(f => esc(f.name)).join(' + ')}${t.priced && state.prices.size ? ` · 参考价约 ¥${r1(t.price)}` : ''}</small></div></div>
    <div class="g-totals">
      <div><span>热量</span><b>${r0(t.kcal)}</b><small>/ 建议 ${r0(T.kcal)} kcal</small></div>
      <div><span>蛋白质</span><b class="mp">${r0(t.p)}</b><small>g</small></div>
      <div><span>钠</span><b class="${t.na > 1500 ? 'mp' : ''}">${r0(t.na)}</b><small>mg · ≈${r1(t.na / NA_PER_SALT)}g 盐</small></div>
    </div>
    ${bombs.length ? `<p class="g-bombs">${bombs.map(esc).join('　')}</p>` : ''}
    <p class="eyebrow fun-h">🔮 热量翻译机：这一顿相当于……</p>
    <div class="fun-grid">${FUN_UNITS.map(([e, l, fmt]) => `<div class="fun"><span>${e}</span><b>${fmt(t.kcal)}</b><small>${l}</small></div>`).join('')}</div>
    <p class="hint">运动消耗按你档案里的体重估算，图个乐，别当真 😉</p>
    <div class="res-actions">
      <button type="button" class="btn btn-sm" data-gtray>放进组餐微调</button>
      <button type="button" class="btn btn-sm btn-y" data-gposter>生成战报</button>
    </div>`;
}

function spinGacha() {
  if (gacha.spinning) return;
  const target = rollGacha();
  if (!target) return toast('这个时段没有合适的餐品，换个模式试试');
  gacha.spinning = true;
  paintResult();
  const pools = Object.fromEntries(REELS.map(([k]) => [k, reelPool(k)]));
  REELS.forEach(([k], i) => {
    const el = $('#reel-' + k);
    if (gacha.locks[k] && gacha.picks?.[k]) return;
    el.classList.add('spinning');
    const timer = setInterval(() => { el.innerHTML = reelFace(pools[k][Math.floor(Math.random() * pools[k].length)]); }, 70);
    setTimeout(() => {
      clearInterval(timer);
      el.classList.remove('spinning');
      el.classList.add('stop');
      el.innerHTML = reelFace(target[k]);
      setTimeout(() => el.classList.remove('stop'), 400);
    }, 700 + i * 380);
  });
  setTimeout(() => { gacha.picks = target; gacha.spinning = false; paintResult(); }, 700 + REELS.length * 380 + 100);
}

function bindGacha() {
  const v = $('#view-gacha');
  v.addEventListener('click', e => {
    if (e.target.closest('[data-spin]')) return spinGacha();
    const m = e.target.closest('[data-gmode]');
    if (m) { gacha.mode = m.dataset.gmode; return renderGacha(); }
    const l = e.target.closest('[data-lock]');
    if (l) { if (!gacha.picks) return toast('先拉一次，再锁住喜欢的那格～'); gacha.locks[l.dataset.lock] = !gacha.locks[l.dataset.lock]; return renderGacha(); }
    if (!gacha.picks) return;
    const items = REELS.map(([k]) => gacha.picks[k]);
    if (e.target.closest('[data-gtray]')) {
      state.tray = new Map(items.map(f => [f.id, 1]));
      const t = totalsOf(items.map(f => [f, 1]));
      state.trayMeta = { label: '扭蛋机抽中的一餐', price: t.priced && state.prices.size ? t.price : null, edited: false };
      saveTray(); location.hash = '#builder';
    }
    if (e.target.closest('[data-gposter]')) {
      const t = totalsOf(items.map(f => [f, 1]));
      showPoster(items.map(f => f.id), mealBudget(), '扭蛋机抽中的一餐', t.priced && state.prices.size ? t.price : null);
    }
  });
}

// ============================================================ 战报海报（Canvas · 可爱贴纸风）
async function showPoster(ids, T, label, price = null) {
  const entries = groupIds(ids).map(([id, q]) => [state.byId.get(id), q]);
  const t = totalsOf(entries);
  const fit = fitScore(lossOf(t, T, { ...state.solver, budget: 0 }));
  const n = Math.min(entries.length, 7);
  const W = 1080, H = 1000 + n * 70 + 170;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const FONT = '"Arial Rounded MT Bold", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  const INK = '#2B2118', CREAM = '#FFF7E8';
  const rr = (x, y, w, h, r, fill, stroke = INK, lw = 6, shadow = 10) => {
    if (shadow) { g.fillStyle = INK; g.beginPath(); g.roundRect(x, y + shadow, w, h, r); g.fill(); }
    g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
    if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
  };
  g.fillStyle = CREAM; g.fillRect(0, 0, W, H);
  g.fillStyle = '#F2DFBC';
  for (let y = 20; y < H; y += 36) for (let x = (y / 36) % 2 ? 20 : 38; x < W; x += 36) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  rr(48, 150, W - 96, H - 260, 48, '#fff');
  // 吉祥物 + 气泡
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(MASCOT_RAW);
  await img.decode().catch(() => {});
  g.drawImage(img, W - 290, 18, 210, 231);
  rr(W - 560, 52, 260, 84, 42, '#FFD23F', INK, 5, 6);
  g.fillStyle = INK; g.font = `800 36px ${FONT}`; g.textAlign = 'center';
  g.fillText(fit >= 85 ? '吃对啦！' : fit >= 65 ? '还不错哦～' : '下次更好！', W - 430, 106);
  g.textAlign = 'left'; g.font = `700 30px ${FONT}`; g.fillStyle = '#8A7A66';
  g.fillText(`麦克罗 · ${todayKey()} · ${GOALS[state.profile.goal].label}`, 60, 100);
  // 标题与热量
  g.fillStyle = INK;
  let fs = 64; do { g.font = `900 ${fs}px ${FONT}`; fs -= 4; } while (g.measureText(label).width > W - 480 && fs > 34);
  g.fillText(label, 100, 270);
  g.fillStyle = '#FFD23F'; g.beginPath(); g.roundRect(96, 380, 440, 36, 18); g.fill();
  g.fillStyle = INK; g.font = `900 170px ${FONT}`; g.fillText(r0(t.kcal), 100, 420);
  const kw = g.measureText(r0(t.kcal)).width;
  g.font = `800 44px ${FONT}`; g.fillStyle = '#8A7A66'; g.fillText('kcal', 100 + kw + 14, 420);
  // 契合度圆环
  g.save(); g.translate(W - 210, 330);
  g.lineWidth = 26; g.lineCap = 'round'; g.strokeStyle = '#FFF0D0'; g.beginPath(); g.arc(0, 0, 90, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#FF6B6B'; g.beginPath(); g.arc(0, 0, 90, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fit / 100); g.stroke();
  g.fillStyle = INK; g.textAlign = 'center'; g.font = `900 72px ${FONT}`; g.fillText(fit, 0, 22);
  g.font = `700 24px ${FONT}`; g.fillStyle = '#8A7A66'; g.fillText('营养契合度', 0, 142); g.restore(); g.textAlign = 'left';
  // 三大宏量
  [['蛋白质', t.p, T?.p, '#FF6B6B'], ['碳水', t.c, T?.c, '#FFB020'], ['脂肪', t.f, T?.f, '#4DABF7']].forEach(([l, v, tg, col], i) => {
    const y = 530 + i * 120;
    g.fillStyle = INK; g.font = `800 38px ${FONT}`; g.fillText(l, 100, y);
    g.textAlign = 'right'; g.font = `900 50px ${FONT}`; g.fillStyle = col; g.fillText(`${r0(v)}g`, W - 100, y + 4);
    if (tg) { g.font = `700 26px ${FONT}`; g.fillStyle = '#B5A58E'; g.fillText(`目标 ${r0(tg)}g`, W - 240, y); }
    g.textAlign = 'left';
    g.fillStyle = '#FFF0D0'; g.beginPath(); g.roundRect(100, y + 26, W - 200, 30, 15); g.fill();
    g.fillStyle = col; g.beginPath(); g.roundRect(100, y + 26, Math.max(30, (W - 200) * clamp(tg ? v / tg / 1.4 : 0.5, 0, 1)), 30, 15); g.fill();
    if (tg) { g.fillStyle = INK; g.beginPath(); g.roundRect(100 + (W - 200) / 1.4 - 3, y + 16, 6, 50, 3); g.fill(); }
  });
  // 清单
  g.fillStyle = '#8A7A66'; g.font = `700 30px ${FONT}`; g.fillText('这一餐吃了', 100, 930);
  entries.slice(0, n).forEach(([f, q], i) => {
    const y = 1000 + i * 70;
    g.fillStyle = '#FFF7E8'; g.beginPath(); g.roundRect(90, y - 48, W - 180, 60, 30); g.fill();
    g.fillStyle = INK; g.font = `800 34px ${FONT}`; g.fillText(`${CAT[f.cat].emoji}  ${f.name}${q > 1 ? ' ×' + q : ''}`, 116, y - 6);
    g.textAlign = 'right'; g.fillStyle = '#8A7A66'; g.font = `700 30px ${FONT}`; g.fillText(`${r0(f.kcal * q)} kcal`, W - 116, y - 6); g.textAlign = 'left';
  });
  // 底部
  const fy = H - 40;
  g.fillStyle = INK; g.font = `800 30px ${FONT}`;
  g.fillText(`${price != null ? `💰 ¥${r1(price)}   ` : ''}🏃 慢跑 ${r0(burnMin(t.kcal, 8.3))} 分钟   🧂 ${r0(t.na)}mg`, 60, fy);
  g.textAlign = 'right'; g.fillStyle = '#EE4B3B'; g.font = `900 32px ${FONT}`; g.fillText('吃对每一克 ♥', W - 60, fy);
  const url = cv.toDataURL('image/png');
  openModal(`<img class="poster" src="${url}" alt="战报海报"><div class="modal-actions"><a class="btn btn-y" href="${url}" download="macro-${todayKey()}.png">保存图片</a></div>`);
}

function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) $('#modal').hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#modal').hidden = true; });

// ============================================================ 路由
const VIEWS = { profile: renderProfile, solver: renderSolver, builder: renderBuilder, insights: renderInsights, gacha: renderGacha };
function route() {
  const [name, query] = location.hash.slice(1).split('?');
  const RETIRED = { store: 'solver', log: 'gacha' }; // 已下线的页面跳到替代页
  const view = VIEWS[name] ? name : RETIRED[name] || (state.hasProfile ? 'solver' : 'profile');
  if (view === 'builder' && query) {
    const m = new URLSearchParams(query).get('m');
    if (m) {
      state.tray = new Map(m.split('|').map(s => s.split('*')).filter(([id]) => state.byId.has(id)).map(([id, q]) => [id, clamp(+q || 1, 1, 9)]));
      saveTray(); history.replaceState(null, '', '#builder');
    }
  }
  document.body.dataset.view = view; // 组餐页用「这一餐」摘要取代全天 HUD
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + view));
  $$('[data-view]').forEach(a => a.classList.toggle('on', a.dataset.view === view));
  VIEWS[view]();
  window.scrollTo({ top: 0 });
}

// ============================================================ 启动
async function boot() {
  $('#brandMark').innerHTML = MASCOT;
  const snap = window.FOODS_SNAPSHOT;
  setFoods(snap.items, { source: 'snapshot', fetchedAt: snap.fetchedAt });
  state.tray = new Map((store.get('tray', [])).filter(([id]) => state.byId.has(id)));
  state.trayMeta = state.tray.size ? store.get('trayMeta', null) : null;
  bindProfile(); bindSolver(); bindBuilder(); bindStore(); bindGacha();
  window.addEventListener('hashchange', route);
  renderHud(); renderStatus(); route();
  // 后台拉取 MCP 实时营养库，成功后无缝替换
  try {
    const live = await api('/api/foods');
    if (live.items?.length) {
      setFoods(live.items, { source: 'mcp', fetchedAt: live.fetchedAt });
      state.tray = new Map([...state.tray].filter(([id]) => state.byId.has(id)));
      renderStatus(); route();
    }
  } catch (e) { console.info('MCP 不可用，使用离线快照：', e.message); }
  // 在售目录（多家门店实时菜单并集）：用于隐藏往期产品、展示新品
  api('/api/catalog').then(c => { if (c.items?.length) { state.catalog = c.items; applyPrices(); buildBundles(); renderStatus(); route(); } }).catch(() => {});
  store.set('store', null); // 旧版本保存的门店不再使用
  loadCoupons().then(() => { renderStatus(); route(); });
}
// skill 命令行（Node）复用同一套算法时不启动网页界面
if (!window.__MACRO_HEADLESS__) boot();
