# 🍟 麦克罗 MAC·RO —— 麦当劳热量透视镜

> **麦克罗，认真对待每一餐。**
> 麦克罗 = 麦（McDonald's）× Macro（宏量营养素）。基于麦当劳中国官方 MCP，帮普通人在麦当劳看清每一口、点好这一餐。

本项目提供 **两种使用形态**，共用同一套营养引擎：

| 形态 | 适合谁 | 入口 |
|---|---|---|
| 🌐 **网页端** | 打开浏览器就能用的普通用户 | `npm start` → http://localhost:8787 |
| 🤖 **Agent Skill** | 在 Claude 等 AI 助手里用对话问「麦当劳吃什么」 | [`skill/mcd-macro`](skill/mcd-macro/SKILL.md) |

🎬 宣传片：[media/麦克罗宣传片.mp4](media/麦克罗宣传片.mp4)（竖屏 30 秒）

---

## 一、为什么做这个

大多数人对麦当劳的态度不是「不吃」，而是「不知道怎么吃」：

- 官方营养表有了，但要自己拿计算器加；
- 真正点餐时点的是**套餐、1+1、优惠券**，而不是单品列表；
- 「这一顿该吃多少」因人而异，没有人帮你算。

现有的营养计算器回答的是「这个东西多少卡」。麦克罗回答的是：**「按我的身体和目标，这一顿点哪个套餐、里面换成什么」**。

## 二、目标用户

- **核心**：偶尔 / 经常吃麦当劳、想吃得心里有数的普通人（上班族、学生）
- **延伸**：有减脂 / 增肌目标、会看蛋白质的运动人群（进阶设置里提供体脂率、蛋白 g/kg 等专业参数）

设计原则：**热量永远不是第一位**——热量、碳水、脂肪只要不超标就好，少吃不扣分；**蛋白质够才是重点**；不鼓励过量进食，不贬低任何产品。

## 三、功能一览

| 页面 | 做什么 |
|---|---|
| 👤 **我的档案** | 性别 / 身高 / 体重 / 运动频率（3 档）/ 目标（瘦一点、保持、壮一点）→ 这一餐建议的热量与蛋白，计算过程可展开查看 |
| 🔍 **热量小贴士** | 份量小但能量足的餐品（换算成几碗米饭、走多少步）、钠含量较高、口味清淡但钠不低、解馋款 |
| ✨ **智能配餐** | 只选「吃饭场景」（正常一顿 / 少吃也能饱 / 饿了吃顿好的 / 🌅 早餐专区）和价格偏好，直接给出套餐方案：选哪个套餐、每一轮换成什么、多少钱、营养是否达标；自动考虑未来 7 天优惠券、会员价 |
| 🍔 **自由组餐** | 配餐后觉得「我没吃够」？在这一餐基础上加减，四项营养实时对比，生成分享海报 |
| 🎰 **今天吃啥** | 主食 / 小食 / 饮品三个转轮随机配一顿，可锁定重抽，用「热量翻译机」换算成米饭、步数等趣味单位 |

## 四、安装与运行

### 环境要求

- Node.js **18+**，**零第三方依赖**（不需要 `npm install`）
- 可选：麦当劳 MCP Token（在 https://open.mcd.cn/mcp 申请）。不填也能运行，会使用内置的官方营养与菜单快照

### 网页端（本地部署）

```bash
git clone <本仓库地址>
cd mcd-macro-skill
cp .env.example .env      # 编辑 .env，填入你自己的 MCD_MCP_TOKEN（可留空）
npm start                 # → http://localhost:8787
```

`.env` 可配置项：

| 变量 | 默认 | 说明 |
|---|---|---|
| `MCD_MCP_TOKEN` | 空 | 麦当劳 MCP Token，只在服务端使用，前端拿不到 |
| `PORT` | `8787` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址，放在反向代理后可设为 `127.0.0.1` |
| `PUBLIC_MODE` | `0` | 设为 `1` 时关闭券包相关接口（Token 绑定的是申请者自己的麦当劳账号，公开部署时可按需关闭） |

在 Claude Code 等 MCP 客户端中直接接入麦当劳 MCP 时，可参考脱敏配置 [`mcp-config.example.json`](mcp-config.example.json)（Token 只用环境变量 `${MCD_MCP_TOKEN}` 占位）。

服务器部署（可选）：[`deploy/deploy.sh`](deploy/deploy.sh) 通过环境变量指定目标主机，一键配置 systemd + nginx + HTTPS：

```bash
DEPLOY_HOST=ubuntu@your-server DEPLOY_KEY=~/.ssh/your-key.pem DEPLOY_DOMAIN=your.domain.com bash deploy/deploy.sh
```

### Agent Skill（本地部署）

把 `skill/mcd-macro` 整个目录放进你的 AI 助手的 skills 目录即可，例如 Claude Code：

```bash
cp -r skill/mcd-macro ~/.claude/skills/
```

之后直接对助手说「我 162cm 55kg，平时不怎么运动，麦当劳午饭吃什么好？」，助手会调用 Skill 给出方案。也可以直接用命令行：

```bash
node skill/mcd-macro/scripts/macro.mjs plan --sex f --height 162 --weight 55 --activity light --goal keep
node skill/mcd-macro/scripts/macro.mjs plan --scene breakfast      # 早餐专区
node skill/mcd-macro/scripts/macro.mjs tips                        # 热量小贴士
node skill/mcd-macro/scripts/macro.mjs food 板烧                   # 单品营养查询
node skill/mcd-macro/scripts/macro.mjs gacha --mode ok             # 今天吃啥
```

设置环境变量 `MCD_MCP_TOKEN` 时，Skill 实时从麦当劳 MCP 拉取营养数据；否则使用附带的官方数据快照，离线可用。全部参数见 [SKILL.md](skill/mcd-macro/SKILL.md)。

> Skill 与网页端共用同一个引擎：`skill/mcd-macro/assets/` 是 `public/` 下文件的副本，修改网页逻辑后运行 `npm run build:skill` 同步。

## 五、使用示例

**网页端**：打开首页 → 「我的档案」填身高体重（数字实时变化）→ 点「按这个建议配这一餐」→ 智能配餐页直接出 3 个套餐方案 → 想再加点，点「🍔 我没吃够」进入组餐。

**Skill 输出示例**（162cm / 55kg 女生，正常一顿，性价比优先）：

```
## 🍟 麦克罗为你配的这一餐（正常一顿）

🎯 这一餐目标：585 kcal · 蛋白 23g（热量只要不超就好，蛋白质够才是重点）

### 👑 1. 人气经典随心配 —— ¥13.9 · 契合度 94%
- 那么大鸡排（椒盐风味）（−¥1） · 385 kcal 👉 点单时把「双层吉士汉堡」换成它
- 鲜萃冰咖 · 15 kcal 👉 点单时把「阳光柠檬红茶中杯」换成它
- 热量 400 kcal · 蛋白 25g · 碳水 27g · 脂肪 21g · 钠 998mg
- ✅ 蛋白质达标；脂肪多 3g
```

> 价格为参考价，菜单与价格随时间变化，实际以门店为准。

## 六、核心算法

1. **这一餐需要多少**：Mifflin-St Jeor 计算基础代谢（填了体脂率时改用 Katch-McArdle）× 活动系数（1.3 / 1.55 / 1.725）→ 按目标调整 → 一顿正餐取全天的 35%；场景再调整（少吃也能饱：热量 ×0.8 蛋白不降；饿了吃顿好的：热量 ×1.3 蛋白 ×1.2；早餐：热量 ×0.55）
2. **只推荐真实能点的组合**：`query-meal-detail` 返回每个套餐的「轮」（主食 / 小食 / 饮料）和每个可选项的差价。逐套餐穷举所有选项组合，精确计算营养和到手价；两份平价套餐（如两份 1+1）两两组合；优惠券当作「特价套餐」参与求解
3. **健康优先的评分**：热量 / 碳水 / 脂肪只罚超标，不罚吃少；蛋白不足罚得最重；钠作为软约束；早餐专区额外收紧钠上限、对多份油炸配餐扣分、饮品优先黑咖 / 无糖
4. **价格**：三档偏好（只看营养 / 性价比优先 / 蛋白最便宜）；超过 ¥40 的方案降权；默认按原价，勾选早餐卡 / 麦金卡后才用会员价
5. **数据诚信**：营养数据只用官方来源；菜单里有但官方营养库没有的新品只展示价格、不估算；有任何一轮缺营养数据的套餐不参与推荐；往期 / 下架产品通过多家门店实时菜单合并出的「在售目录」自动隐藏
6. **全部在本地完成**：求解在浏览器（或 Skill 的 Node 进程）内运行，单次 < 50ms

MCP 的具体使用见 [MCP_INTEGRATION.md](MCP_INTEGRATION.md)。

## 七、项目结构

```
server.js                     后端：静态托管 + 麦当劳 MCP 只读代理（零依赖）
public/index.html             页面骨架
public/app.js                 前端全部逻辑：档案 / 配餐求解器 / 组餐 / 小贴士 / 今天吃啥 / 海报
public/styles.css             奶油底 + 贴纸风，吉祥物「麦小薯」，移动端底栏
public/data/foods.snapshot.js 官方营养数据快照（MCP list-nutrition-foods，离线兜底）
public/data/menu.default.js   默认菜单 / 套餐结构 / 在售目录快照（离线兜底）
skill/mcd-macro/              Agent Skill：SKILL.md + scripts/macro.mjs + assets（引擎副本）
deploy/deploy.sh              可选的服务器部署脚本（参数全部走环境变量）
promo/                        宣传片源码：HTML 逐帧动画 + 无头 Chrome 渲染 + 纯 Python 合成配乐
media/麦克罗宣传片.mp4          30 秒宣传片
```

## 八、安全与隐私

- 仓库中**不包含任何真实 Token / 密钥**；Token 只通过 `.env`（已在 `.gitignore`）或环境变量传入
- 服务端只代理**只读**的 MCP 工具，不开放下单、支付、领券等写操作；券码、券 ID 不会下发到网页
- 不收集用户数据：身体数据只保存在用户自己浏览器的 localStorage 中

## 免责声明

热量与营养数据为麦当劳官方每份标准值，实际制作存在差异；价格为参考价，以门店实际为准。本工具仅为饮食参考，不构成医疗或营养建议。本项目为麦当劳中国 MCP 创意开发大赛参赛作品，参赛声明见 [CONTEST_DECLARATION.md](CONTEST_DECLARATION.md)。
