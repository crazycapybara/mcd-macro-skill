// 麦克罗 MAC·RO —— 轻量后端：静态托管 + 麦当劳 MCP 只读代理
// 设计原则：MCP Token 只存在服务端；前端只能调用白名单内的只读工具。
// 零依赖，Node 18+ 直接 `node server.js`。

const http = require('http');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ---------- env ----------
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const TOKEN = process.env.MCD_MCP_TOKEN;
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
// 公网模式：Token 属于部署者本人，券包等个人数据不能展示给所有访客
const PUBLIC_MODE = process.env.PUBLIC_MODE === '1';
const MCP_URL = process.env.MCD_MCP_URL || 'https://mcp.mcd.cn';
const PUBLIC = path.join(__dirname, 'public');

// ---------- MCP client ----------
let rpcId = 0;
async function mcpCall(name, args = {}) {
  if (!TOKEN) throw new Error('服务端未配置 MCD_MCP_TOKEN');
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401) throw new Error('MCP Token 无效或已过期 (401)');
  if (res.status === 429) throw new Error('请求过于频繁，请稍后再试 (429)');
  let raw = await res.text();
  // 兼容 Streamable HTTP 的 SSE 响应
  if (/^(event|data):/m.test(raw) && !raw.trim().startsWith('{')) {
    raw = raw.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5)).join('');
  }
  let msg;
  try { msg = JSON.parse(raw); } catch { throw Object.assign(new Error(`MCP 网关繁忙（HTTP ${res.status}）`), { retryable: true }); }
  if (msg.error) throw new Error(msg.error.message || 'MCP error');
  const text = (msg.result?.content || []).map(c => c.text || '').join('\n');
  if (msg.result?.isError) throw new Error(text.slice(0, 200));
  return text;
}

// MCP 返回的是“说明文字 + 原始 JSON”，把 JSON 抠出来
function extractJson(text) {
  const start = text.indexOf('{"success"');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  return null;
}

// list-nutrition-foods 的 data 是紧凑表格字符串：[N]{fields}:\n  row,row...
function parseNutrition(data) {
  const lines = String(data).trim().split('\n');
  const fields = (lines[0].match(/\{(.+)\}/) || [])[1]?.split(',') || [];
  const seen = new Set();
  const items = [];
  for (const line of lines.slice(1)) {
    const cols = line.trim().split(',');
    if (cols.length !== fields.length) continue;
    const r = Object.fromEntries(fields.map((f, i) => [f, cols[i]]));
    if (seen.has(r.productName)) continue;
    seen.add(r.productName);
    items.push({
      name: r.productName,
      note: r.nutritionDescription === 'null' ? null : r.nutritionDescription,
      kj: +r.energyKj, kcal: +r.energyKcal, p: +r.protein, f: +r.fat, c: +r.carbohydrate, na: +r.sodium, ca: +r.calcium,
    });
  }
  return items;
}

// 活动日历是 markdown，解析成结构化卡片
function parseCampaigns(md) {
  const out = [];
  let date = '', tag = '';
  for (const block of md.split(/\n(?=####|-\s+\*\*活动标题)/)) {
    const h = block.match(/####\s*(\d{4}年\d+月\d+日)\s*(\S*)/);
    if (h) { date = h[1]; tag = h[2]; }
    const t = block.match(/\*\*活动标题\*\*：(.+)/);
    if (!t) continue;
    const body = (block.match(/\*\*活动内容介绍\*\*：([\s\S]*?)(?:\n\s*\*\*活动图片介绍|$)/) || [])[1] || '';
    const img = (block.match(/src="([^"]+)"/) || [])[1] || '';
    out.push({ date, tag, title: t[1].trim(), content: body.trim(), image: img });
  }
  return out;
}

// 打烊门店的预约时段候选：今天/明天/后天的正餐时间（菜单与价格以正餐为准）
function nextLunchSlots(now = new Date()) {
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const out = [];
  for (let day = 0; day < 3 && out.length < 3; day++) {
    for (const [h, m] of [[11, 30], [17, 30]]) {
      const d = new Date(now); d.setDate(d.getDate() + day); d.setHours(h, m, 0, 0);
      if (d - now > 30 * 60e3) out.push(fmt(d));
    }
  }
  return out.slice(0, 3);
}

const isBreakfastNow = (d = new Date()) => { const h = d.getHours() + d.getMinutes() / 60; return h >= 4.5 && h < 10.5; };
function nextBreakfastSlot(now = new Date()) {
  const d = new Date(now); d.setHours(7, 30, 0, 0);
  if (d - now < 30 * 60e3) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 07:30`;
}

// ---------- tiny cache ----------
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

// ---------- API routes（只读白名单） ----------
const routes = {
  async '/api/health'() {
    return { ok: true, mcp: !!TOKEN, server: MCP_URL, features: { coupons: !PUBLIC_MODE } };
  },
  async '/api/foods'() {
    return cached('foods', 6 * 3600e3, async () => {
      const j = extractJson(await mcpCall('list-nutrition-foods'));
      return { source: 'mcp', fetchedAt: j.datetime, items: parseNutrition(j.data) };
    });
  },
  async '/api/stores'(q) {
    const city = (q.get('city') || '').slice(0, 20);
    const keyword = (q.get('keyword') || '').slice(0, 40);
    if (!city || !keyword) throw Object.assign(new Error('请填写城市和关键词'), { status: 400 });
    return cached(`stores:${city}:${keyword}`, 10 * 60e3, async () => {
      const j = extractJson(await mcpCall('query-nearby-stores', { beType: 1, searchType: 2, city, keyword }));
      return {
        stores: (j?.data || []).map(s => ({
          storeCode: s.storeCode, name: s.storeName, address: s.address, distance: s.distance,
          open: s.businessStatus, hours: `${s.businessStartTime}-${s.businessEndTime}`,
        })),
      };
    });
  },
  async '/api/menu'(q) {
    const storeCode = q.get('storeCode') || '';
    if (!/^\d{3,12}$/.test(storeCode)) throw Object.assign(new Error('storeCode 不合法'), { status: 400 });
    const forceLunch = q.get('slot') === 'lunch'; // 生成默认菜单快照用：固定取正餐时段
    return cached(`menu:${storeCode}:${forceLunch ? 'lunch' : ''}`, 10 * 60e3, async () => {
      const fetchMenu = async reservationDate => extractJson(await mcpCall('query-meals', { storeCode, orderType: 1, beType: 1, ...(reservationDate ? { reservationDate } : {}) }));
      const hasMeals = j => Object.keys(j?.data?.meals || {}).length > 0;
      let j = forceLunch ? null : await fetchMenu();
      let mode = 'live', reservationDate = null;
      // 门店打烊时实时菜单为空：用「预约下单」的正餐时段查这家店自己的菜单和价格
      if (!hasMeals(j)) {
        for (const slot of nextLunchSlots()) {
          const r = await fetchMenu(slot).catch(() => null);
          if (hasMeals(r)) { j = r; mode = 'reservation'; reservationDate = slot; break; }
        }
      }
      // 不支持预约：交给前端用默认菜单兜底
      if (!hasMeals(j)) return { mode: 'unavailable', fetchedAt: j?.datetime, message: j?.message || '门店暂不可查', items: [] };
      const toItems = (jj, daypart) => {
        const catOf = {};
        for (const c of jj.data.categories || []) for (const m of c.meals) catOf[m.code] ??= c.name.replace(/\s+/g, '');
        return Object.entries(jj.data.meals).map(([code, m]) => ({
          code, name: m.name, price: +m.currentPrice, originalPrice: +m.originalPrice,
          image: m.image, discount: m.discountType || null, category: catOf[code] || '', daypart,
        }));
      };
      // 早餐线和正餐线菜单不同：再用预约时段补查另一条线，让早餐/正餐单品都有价格
      const mainIsBreakfast = mode === 'live' ? isBreakfastNow() : false;
      const items = toItems(j, mainIsBreakfast ? 'breakfast' : 'regular');
      const other = await fetchMenu(mainIsBreakfast ? nextLunchSlots()[0] : nextBreakfastSlot()).catch(() => null);
      if (hasMeals(other)) {
        const have = new Set(items.map(x => x.name));
        for (const x of toItems(other, mainIsBreakfast ? 'regular' : 'breakfast')) if (!have.has(x.name)) items.push(x);
      }
      return { mode, reservationDate, fetchedAt: j.datetime, items };
    });
  },
  // 单人套餐结构：主食/小食/饮料各轮可选项 + 差价。多人餐、开心乐园餐、学生专享等不适合健身单人场景的过滤掉
  async '/api/bundles'(q) {
    const storeCode = q.get('storeCode') || '';
    if (!/^\d{3,12}$/.test(storeCode)) throw Object.assign(new Error('storeCode 不合法'), { status: 400 });
    return cached(`bundles:${storeCode}:${q.get('slot') || ''}`, 30 * 60e3, async () => {
      const menu = await routes['/api/menu'](q);
      const SKIP = /双人|多人|亲子|十翅|四宫格|7件|学生|开心乐园|随心拼|盘|分享/;
      const candidates = menu.items.filter(m => /^99/.test(m.code) && m.price > 0 && !SKIP.test(m.name) && !SKIP.test(m.category));
      const out = [];
      const queue = [...candidates];
      await Promise.all(Array.from({ length: 4 }, async () => {
        for (let m = queue.shift(); m; m = queue.shift()) {
          try {
            // MCP 在并发下偶尔返回非 JSON 的繁忙提示，退避重试，避免套餐被静默漏掉
            let j = null, text = '';
            for (let attempt = 0; attempt < 3 && !j?.data; attempt++) {
              if (attempt) await new Promise(r => setTimeout(r, 400 * attempt));
              try {
                // 不在该餐品供应时段时，用预约时间查详情（早餐套餐晚上也能查到结构）
                const offHours = m.daypart === 'breakfast' ? !isBreakfastNow() : (isBreakfastNow() || menu.mode === 'reservation');
                const rsv = !offHours ? null : m.daypart === 'breakfast' ? nextBreakfastSlot() : (menu.reservationDate || nextLunchSlots()[0]);
                text = await mcpCall('query-meal-detail', { storeCode, orderType: 1, beType: 1, code: m.code, ...(rsv ? { reservationDate: rsv } : {}) });
                j = extractJson(text);
              } catch (e) { text = e.message; }
            }
            if (!j?.data) { console.warn('[bundle] 详情获取失败', m.name, text.slice(0, 120).replace(/\s+/g, ' ')); continue; }
            const rounds = (j?.data?.rounds || []).map(r => ({
              name: r.name, min: r.minQuantity, max: r.maxQuantity,
              choices: (r.choices || []).map(c => ({
                code: c.code, name: c.name, isDefault: c.isDefault === 1,
                diff: (/-/.test(c.diffPrice) ? -1 : 1) * parseFloat(String(c.diffPrice).replace(/[^\d.]/g, '') || 0),
              })),
            }));
            if (rounds.length >= 2) out.push({ code: m.code, name: m.name, price: m.price, originalPrice: m.originalPrice, discount: m.discount, daypart: m.daypart, image: m.image, category: m.category, rounds });
          } catch (e) { console.warn('[bundle]', m.name, e.message); }
        }
      }));
      return { mode: menu.mode, fetchedAt: menu.fetchedAt, items: out };
    });
  },
  // 优惠券：我的券包（价格+生效时间）+ 门店当前可用券（含商品编码→套餐结构）+ 麦麦省可领券。全部只读
  async '/api/coupons'(q) {
    if (PUBLIC_MODE) return { disabled: true, mine: [], atStore: [], claimable: [] };
    const storeCode = q.get('storeCode') || '';
    if (storeCode && !/^\d{3,12}$/.test(storeCode)) throw Object.assign(new Error('storeCode 不合法'), { status: 400 });
    return cached(`coupons:${storeCode}`, 5 * 60e3, async () => {
      const [mineText, storeText, availText] = await Promise.all([
        mcpCall('query-my-coupons', { page: '1', pageSize: '200' }),
        storeCode ? mcpCall('query-store-coupons', { storeCode, orderType: 1, beType: 1 }).catch(() => '') : '',
        mcpCall('available-coupons').catch(() => ''),
      ]);
      // 我的券包是 markdown：## 券名 / 优惠 ¥x (用券价格) / 有效期 / 标签 / 图片
      const mine = mineText.split(/\n(?=## )/).filter(s => s.startsWith('## ')).map(s => {
        const title = s.match(/^## (.+)/)[1].trim();
        const price = parseFloat((s.match(/\*\*优惠\*\*:\s*¥([\d.]+)/) || [])[1]);
        const v = (s.match(/\*\*有效期\*\*:\s*(.+)/) || [])[1] || '';
        const m = v.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2})-(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*(周[一二三四五六日、]+)?\s*(\d{2}:\d{2})?-?(\d{2}:\d{2})?/) || [];
        return {
          title, price: isNaN(price) ? null : price, validText: v.trim(),
          start: m[1] || null, end: m[2] || null, weekdays: m[3] || null, from: m[4] || null, to: m[5] || null,
          tags: ((s.match(/\*\*标签\*\*:\s*(.+)/) || [])[1] || '').split(/[、,，]/).map(x => x.trim()).filter(Boolean),
          image: (s.match(/src="([^"]+)"/) || [])[1] || '',
        };
      });
      // 门店此刻可用的券带商品编码：查套餐结构，供营养计算
      const storeJson = storeText ? extractJson(storeText) : null;
      const atStore = [];
      for (const c of storeJson?.data || []) {
        const products = [];
        for (const p of c.products || []) {
          let rounds = null;
          try {
            const j = extractJson(await mcpCall('query-meal-detail', { storeCode, orderType: 1, beType: 1, code: p.productCode }));
            rounds = (j?.data?.rounds || []).map(r => ({ name: r.name, choices: (r.choices || []).map(ch => ({ code: ch.code, name: ch.name, isDefault: ch.isDefault === 1, diff: (/-/.test(ch.diffPrice) ? -1 : 1) * parseFloat(String(ch.diffPrice).replace(/[^\d.]/g, '') || 0) })) }));
          } catch { /* 单品券没有套餐结构 */ }
          products.push({ code: p.productCode, name: p.productName, rounds: rounds?.length ? rounds : null });
        }
        // 券码 / 券 ID 不下发到网页：前端用不到，且可能被他人直接使用
        atStore.push({ title: c.title, tradeDateTime: c.tradeDateTime, products });
      }
      const claimable = [...availText.matchAll(/优惠券标题：(.+?)\s*\\?\s*\n\s*状态：(\S+)/g)].map(x => ({ title: x[1].trim(), status: x[2].replace(/\\$/, '').trim() }));
      return { mine, atStore, claimable };
    });
  },
  // 当前在售目录：多家参考门店（正餐 + 早餐时段）菜单的并集，用来区分「在售」与「往期/限定」
  async '/api/catalog'() {
    return cached('catalog', 6 * 3600e3, async () => {
      const REF = ['1450713', '1450441', '1450056'];
      const names = new Map();
      for (const storeCode of REF) {
        const q = new URLSearchParams({ storeCode, slot: 'lunch' });
        try {
          const m = await routes['/api/menu'](q);
          for (const x of m.items) if (!names.has(x.name)) names.set(x.name, { name: x.name, code: x.code, price: x.price, originalPrice: x.originalPrice, discount: x.discount, image: x.image, category: x.category, daypart: x.daypart });
        } catch (e) { console.warn('[catalog]', storeCode, e.message); }
      }
      return { stores: REF, fetchedAt: new Date().toISOString(), items: [...names.values()] };
    });
  },
  async '/api/campaigns'() {
    return cached('campaigns', 30 * 60e3, async () => ({ items: parseCampaigns(await mcpCall('campaign-calendar')) }));
  },
};

// ---------- static ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const wantsGzip = req => /\bgzip\b/.test(req.headers['accept-encoding'] || '');
function send(req, res, status, headers, buf) {
  if (buf.length > 1024 && wantsGzip(req)) {
    buf = zlib.gzipSync(buf);
    headers = { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' };
  }
  res.writeHead(status, { ...headers, 'Content-Length': buf.length });
  res.end(buf);
}
function sendJson(req, res, status, body) {
  send(req, res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, Buffer.from(JSON.stringify(body)));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const route = routes[url.pathname];
  if (route) {
    if (req.method !== 'GET') return sendJson(req, res, 405, { error: 'GET only' });
    try {
      sendJson(req, res, 200, await route(url.searchParams));
    } catch (e) {
      console.error(`[api] ${url.pathname}:`, e.message);
      sendJson(req, res, e.status || 502, { error: e.message });
    }
    return;
  }
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    // 弱 ETag：浏览器每次校验，未改动返回 304，改动后立即生效
    const etag = `W/"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
    fs.readFile(file, (err2, buf) => {
      if (err2) { res.writeHead(404); return res.end('Not found'); }
      send(req, res, 200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag }, buf);
    });
  });
}).on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用：麦克罗可能已经在运行 → http://localhost:${PORT}\n如需换端口：PORT=8788 npm start`);
    process.exit(1);
  }
  throw e;
}).listen(PORT, HOST, () => {
  console.log(`麦克罗 MAC·RO 已启动 → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (MCP ${TOKEN ? '已配置' : '未配置，使用离线快照'}${PUBLIC_MODE ? ' · 公网模式：券包已关闭' : ''})`);
});
