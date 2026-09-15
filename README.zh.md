# dsh-plugin-research

主题驱动的深度调研 DSH 插件。`research`（唯一入口）：给一个主题（如「收集 2025 财年可口可乐与百事的全部财报与研报」），隔离调研写手子会话自主分解研究线 → web_search/web_fetch 定向查证 → 自检补漏 → 合成带来源的完整调研报告（正文内联 `[SRC-n]` + 编号来源清单）交回调用方。可选 `project`：把报告全文与机器可解析证据行留档进项目证据文件（缺省 `底稿/调研.md`，兼容 outline 引用覆盖门）；不传 topic 时自动扫大纲 **待核实** 条目当研究线。

## 合同

- structured 交付：`{case_id, status: "completed|partial", report_markdown, facts: [{assertion,url,date,domain,title?}], open_questions: string[]}`——报告是人读面，facts[] 是机器面原子。
- 证据行格式（与 outline 引用覆盖门同源，落档时由 facts 机械渲染）：
  `- [事实] <断言>；来源：<URL>（<日期>，<域名>）；用于：<用途|待归属>`
- 内容门：报告须达实质线（`REPORT_MIN_CHARS`）、fact URL 可解析、completed 须有 facts、facts 与 open_questions 不得双空。
- 搜索 provider：读宿主 **web seam**（`ctx.web`）——用户配的哪家（exa/deepseek）就用哪家；显式配置落空与多 provider 歧义如实上报，不代选不静默。
- 路由：**单路由**（2026-09-15 拍板：fallback 暂不启用，只取 primary）。来源：`config.routes[0]` > 工作区 routes 键（缺省 `content-writer.researcher`）> fail-loud。
- 基建取 `aivideo-core`（link:../aivideo-core——runner 五段真源）。

## config

| key         | 说明                                                            |
| ----------- | --------------------------------------------------------------- |
| `workspace` | 工作区根；缺省 = 会话 cwd 探测                                  |
| `routeKey`  | 工作区 routes 键（缺省 `content-writer.researcher`）            |
| `routes`    | 显式主路由（`[{provider, model, thinkingLevel?}]`，只取第一条） |

## 挂载

profile `package.json` 加依赖 + `dsh.profile.bundles` 加包名；本包自带 `cordis.patch.yml` bundle 行。宿主重启只归用户。
