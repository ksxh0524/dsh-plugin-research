# dsh-plugin-research

通用主题式深度调研 DSH 插件。`research(topic, fetch_sources?)`（唯一入口）：给一个主题（如「收集 2025 财年可口可乐与百事的全部财报与研报」），隔离调研员（Researcher）子会话自主分解研究线 → web_search/web_fetch 定向查证 → 逐条核查来源（有用性过滤、单一来源检测与可靠性五档评级〔官方一手/权威媒体/行业报告/自媒体/论坛〕、多方比对——默认内建，不占参数）→ 合成带来源的完整调研报告（正文内联 `[SRC-n]` + 编号来源清单带可靠性标注）交回调用方。`fetch_sources=true`（可选，缺省 false）把引用来源的页面全文拉下来随报告附回。**主题进、报告出——零宿主概念。** 报告存哪、怎么留档是调用方自己的事，本包不做任何文件 IO，也不知道「项目」是什么。

形态对齐通用 deep research 实证（[gpt-researcher](https://docs.gptr.dev/docs/gpt-researcher/gptr/pip-package)：query 进 → 报告 + 来源元数据出；[open_deep_research](https://github.com/langchain-ai/open_deep_research)：messages 进 → 最终报告出）。

## 合同

- structured 交付：`{case_id, status: "completed|partial", report_markdown, facts: [{assertion,url,date,domain,title?,reliability?,corroboration?}], open_questions: string[], sources?}`——报告是人读面，facts[] 是机器面原子（corroboration = 佐证同一断言的其他 [SRC-n] 编号，缺席 = 单一来源），随收据 details 回调用方；`fetch_sources=true` 时 sources[] 带每条来源全文。
- 来源核查默认内建（不是开关）：写手（调研员）过滤不相关来源、同一事实尽量 ≥2 个独立来源佐证、关键事实单一来源句尾打〔单一来源〕、来源清单按五档标可靠性、跨来源冲突并列各方说法不硬凑结论。
- 拉取门：`fetch_sources=true` 时 sources 空数组 = 门不过；content 缺席 = 拉取失败（如实标注，禁止编造全文）。
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
