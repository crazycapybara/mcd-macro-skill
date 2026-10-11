# 麦当劳 MCP 集成说明

## 一、使用的 MCP Server

| 项 | 值 |
|---|---|
| Server | 麦当劳中国官方 MCP：`https://mcp.mcd.cn`（Streamable HTTP，JSON-RPC `tools/call`） |
| 鉴权 | `Authorization: Bearer <MCD_MCP_TOKEN>`，Token 仅保存在服务端 `.env` / 环境变量 |
| 文档 | https://open.mcd.cn/mcp/doc |
| 调用方 | 网页端：`server.js` 只读代理；Skill：`skill/mcd-macro/scripts/macro.mjs` |

## 二、实际调用的 Tool

| Tool | 用途 | 在产品中的位置 |
|---|---|---|
| `list-nutrition-foods` | 官方营养数据（热量、蛋白、碳水、脂肪、钠），**唯一营养数据源** | 所有页面；Skill 的 `plan / tips / food / gacha` |
| `query-meals` | 门店菜单、价格、商品图；带 `reservationDate` 查预约时段（打烊门店 / 早餐线与正餐线互补） | 配餐价格、在售目录、默认菜单快照 |
| `query-meal-detail` | 套餐结构：每一「轮」的可选项与差价 | 套餐求解器（穷举每轮选项） |
| `query-nearby-stores` | 按城市 + 地标搜门店 | 选取参考门店生成在售目录 |
| `query-my-coupons` | 券包：券名、用券价、生效时间段 | 配餐时把券当作「特价套餐」参与求解 |
| `query-store-coupons` | 门店当前可用券及对应商品编码 | 把券映射到具体套餐 / 单品，计算营养 |
| `available-coupons` | 可领取的券（只展示，不代领） | 配餐提示 |
| `campaign-calendar` | 当月活动日历 | Skill 对话补充信息 |

**只读原则**：只调用上表中的查询类 Tool；下单、支付、领券、积分等写操作一律不调用。

## 三、调用流程

### 1. 网页端

```
浏览器 ──GET /api/*──▶ server.js（白名单只读代理 + 缓存）──Bearer──▶ mcp.mcd.cn
   │                        营养 6h / 菜单 10min / 套餐结构 30min / 在售目录 6h
   └── 离线兜底：public/data/foods.snapshot.js + menu.default.js（同源 MCP 快照）
```

| 接口 | 背后的 MCP 调用 |
|---|---|
| `GET /api/foods` | `list-nutrition-foods` |
| `GET /api/menu` | `query-meals`；门店不营业时改用 `reservationDate` 预约时段；早餐 / 正餐菜单互相补全 |
| `GET /api/bundles` | 对菜单中的套餐编码并发（4 路）调用 `query-meal-detail`，失败自动重试 |
| `GET /api/catalog` | 多家参考门店的 `query-meals` 合并 → 当前在售目录（隐藏往期产品，标注新品） |
| `GET /api/coupons` | `query-my-coupons` + `query-store-coupons` + `available-coupons`，解析可用时间窗；券码 / 券 ID 不下发前端 |
| `GET /api/stores` | `query-nearby-stores` |
| `GET /api/campaigns` | `campaign-calendar` |

### 2. 配餐一次完整流程

1. `list-nutrition-foods` → 按名称把营养数据挂到菜单商品上
2. `query-meals` → 拿到单品价、套餐价（区分单点价与套餐价，识别早餐卡 / 麦金卡会员价）
3. `query-meal-detail` → 每个套餐的轮次和差价，逐套餐穷举选项组合
4. `query-my-coupons` / `query-store-coupons` → 未来 7 天可用的券作为额外候选
5. 浏览器内求解：健康优先评分 + 价格偏好 → 输出「点哪个套餐、每轮换成什么、多少钱、营养是否达标」

### 3. Agent Skill

```
AI 助手 ──▶ node scripts/macro.mjs plan ...
              │ 有 MCD_MCP_TOKEN：实时调用 list-nutrition-foods
              │ 无 Token：使用 assets/ 内的官方快照
              └ 在 Node vm 中运行与网页端相同的引擎（assets/app.js）→ Markdown / JSON
```

已接入麦当劳 MCP 连接器的 AI 助手，也可以直接调用 `campaign-calendar`、`query-nearby-stores` 等 Tool 补充信息，推荐结果以 Skill 为准以保证口径一致。

## 四、业务价值

- **把营养数据变成点餐决策**：MCP 提供的是营养表、菜单、套餐结构；麦克罗把它们组合成「这一顿点哪个套餐、换成什么」，用户不用自己算
- **贴合真实点餐习惯**：基于 `query-meal-detail` 的套餐结构推荐，结果可以直接照着在官方 App / 小程序下单，自然引导到麦当劳官方渠道
- **让健康选择更容易**：蛋白优先、热量不超、早餐少油少钠、饮品优先零卡 / 黑咖——帮助用户在麦当劳吃得更均衡，提升对品牌的好感
- **用好会员与优惠**：会员价、优惠券参与求解，让用户看到「健康又划算」的组合，提升券的使用率
- **多端复用**：同一套引擎同时服务网页与 AI 助手 Skill，MCP 数据一次接入、多处使用

## 五、数据诚信与合规

- 营养数据只用官方来源，已与官网营养成分表交叉核对；没有官方营养数据的新品只显示价格，不估算
- 价格标注「参考价，以门店实际为准」
- Token 不进入代码仓库、不下发前端；所有 MCP 输出在前端渲染前做 HTML 转义
