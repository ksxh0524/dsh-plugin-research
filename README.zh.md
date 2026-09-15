# dsh-plugin-research

通用主题式深度调研 DSH 插件。`research`（唯一入口，就一个参数）：给一个主题（如「收集 2025 财年可口可乐与百事的全部财报与研报」），隔离调研写手子会话自主分解研究线 → web_search/web_fetch 定向查证 → 自检补漏 → 合成带来源的完整调研报告（正文内联 `[SRC-n]` + 编号来源清单）交回调用方。**主题进、报告出——零宿主概念。** 报告存哪、怎么留档是调用方自己的事，本包不做任何文件 IO，也不知道「项目」是什么。

形态对齐通用 deep research 实证（[gpt-researcher](https://docs.gptr.dev/docs/gpt-researcher/gptr/pip-package)：query 进 → 报告 + 来源元数据出；[open_deep_research](https://github.com/langchain-ai/open_deep_research)：messages 进 → 最终报告出）。

## 合同

- structured 交付：`{case_id, status: "completed|partial", report_markdown, facts: [{assertion,url,date,domain,title?}], open_questions: string[]}`——报告是人读面，facts[] 是机器面原子，随收据 details 回调用方（对应 `get_research_sources()` 形）。
- 内容门：报告须达实质线（`REPORT_MIN_CHARS`）、fact URL 可解析、completed 须有 facts、facts 与 open_questions 不得双空。
- 搜索 provider：读宿主 **web seam**（`ctx.web`）——用户配的哪家（exa/deepseek）就用哪家；显式配置落空与多 provider 歧义如实上报，不代选不静默。
- 路由：**单路由**（2026-09-15 拍板：fallback 暂不启用，只取 primary）。来源：`config.routes[0]` > 工作区 routes 键（缺省 `content-writer.researcher`）> fail-loud。`workspace` 是 cordis 配置（供路由解析），不是调用参数。
- 基建取 `aivideo-core`（link:../aivideo-core——runner 五段真源）。
- 项目侧留档（证据行进 `底稿/调研.md` 供 outline 引用覆盖门消费）**不是**本插件的事——写作簇在自己的仓里包一层（挂账）。

## config

| key         | 说明                                                            |
| ----------- | --------------------------------------------------------------- |
| `workspace` | 工作区根；缺省 = 会话 cwd 探测（仅供路由解析）                  |
| `routeKey`  | 工作区 routes 键（缺省 `content-writer.researcher`）            |
| `routes`    | 显式主路由（`[{provider, model, thinkingLevel?}]`，只取第一条） |

## 挂载

profile `package.json` 加依赖 + `dsh.profile.bundles` 加包名；本包自带 `cordis.patch.yml` bundle 行。宿主重启只归用户。
