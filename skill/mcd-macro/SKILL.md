---
name: mcd-macro
description: 麦克罗 · 麦当劳热量透视镜。当用户想在麦当劳吃得健康、问「麦当劳吃什么不胖 / 怎么点更健康 / 某个餐品多少热量多少钠 / 早餐怎么搭 / 今天吃啥」时使用。基于麦当劳中国官方 MCP 的营养数据，按用户身体数据给出「这一餐」的套餐推荐（蛋白质优先、热量不超、兼顾性价比），以及热量小贴士、单品营养查询和随机配餐。
---

# 麦克罗 · 麦当劳热量透视镜

帮普通人在麦当劳**认真对待每一餐**：不追求吃够热量，只要不超标；蛋白质够才是重点。

数据来自麦当劳中国官方 MCP（`list-nutrition-foods`、`query-meals`、`query-meal-detail` 等）。设置环境变量 `MCD_MCP_TOKEN` 时营养数据实时拉取；未设置时使用随 Skill 附带的官方数据快照，离线也能用。

## 运行环境

- Node.js 18+，零依赖
- 可选：`MCD_MCP_TOKEN`（在 https://open.mcd.cn/mcp 申请）。**不要把 Token 写进任何文件或对话记录**，只通过环境变量传入

所有命令都在本 Skill 目录下执行：`node scripts/macro.mjs <命令> [参数]`。加 `--json` 输出结构化结果，便于你二次组织语言。

## 命令

### 1. `plan` —— 为这一餐配套餐（最常用）

```bash
node scripts/macro.mjs plan --sex f --height 162 --weight 55 --activity light --goal keep --scene normal --price value
```

| 参数 | 取值 | 默认 | 说明 |
|---|---|---|---|
| `--sex` | `m` / `f` | `m` | 性别 |
| `--height` `--weight` | 数字 | 175 / 70 | 身高 cm、体重 kg（年龄统一按 23 岁计算） |
| `--activity` | `light` / `regular` / `daily` | `light` | 偶尔动动 / 经常运动（每周 3–5 次）/ 天天运动 |
| `--goal` | `lose` / `keep` / `gain` | `keep` | 想瘦一点 / 保持现在 / 想壮一点 |
| `--scene` | `normal` / `light` / `hungry` / `breakfast` | `normal` | 正常一顿 / 少吃也能饱 / 饿了吃顿好的 / 早餐专区 |
| `--price` | `value` / `nutrition` / `protein` | `value` | 性价比优先 / 只看营养 / 蛋白最便宜 |
| `--gold-card` `--breakfast-card` | 开关 | 关 | 用户有麦金卡 / 早餐卡时按会员价计算 |
| `--top` | 数字 | 3 | 返回几个方案 |

推荐规则（向用户解释时可以引用）：
- 只推荐套餐、1+1、组合（几乎没人单点），套餐里每一轮选什么也会挑好，并提示「点单时把 A 换成 B」
- 热量、碳水、脂肪只看有没有超标，**少吃不扣分**；蛋白质达标最重要
- 超过 ¥40 的方案会少推荐；不为补营养额外单点饮品；饮品优先零卡 / 黑咖
- 早餐专区只用早餐菜单，饮品选黑咖，少油炸、少钠

### 2. `tips` —— 热量小贴士

```bash
node scripts/macro.mjs tips
```
列出「份量小但能量足」（换算成几碗米饭、走多少步）、「钠含量较高」、「口味清淡钠不低」、「解馋款」。

### 3. `food <关键词>` —— 单品营养查询

```bash
node scripts/macro.mjs food 板烧
```

### 4. `gacha` —— 今天吃啥（随机配一顿）

```bash
node scripts/macro.mjs gacha --mode ok      # ok 不超标 / treat 吃顿好的 / random 完全随机
```
可同时带上 `plan` 的档案参数。

## 与用户对话时

1. 用户没给身体数据时，先用默认值出结果，再一句话问他「方便告诉我身高体重和目标吗？可以算得更准」，**不要先盘问再给结果**
2. 先给 1 个最推荐的方案（套餐名、价格、要换的选项、热量和蛋白），其余方案简短列出
3. 语气友好、轻松；描述餐品时客观中性，不贬低任何产品，不鼓励过量进食
4. 始终说明：价格为参考价，以门店实际为准；结果仅供参考，不构成医疗或营养建议
5. 用户要下单时，引导他到麦当劳官方 App / 小程序完成；本 Skill 不代替用户下单或支付

## 已连接麦当劳 MCP 时

如果当前环境已经接入 `mcd-mcp` 连接器，也可以直接调用 MCP 工具补充信息，例如 `campaign-calendar` 查当月活动、`query-nearby-stores` 查附近门店。推荐与营养计算仍以本 Skill 的 `plan` 结果为准，保证口径一致。
