# dsh-plugin-research

通用主题式深度调研 DSH 插件。`research(topic, fetch_sources?)`（唯一入口；主题给得粗或细都行，流程自判）。**引擎代码驱动的三道隔离工序**：① 调研员（Researcher）子会话自主分解研究线 → web_search/web_fetch 定向查证 → 逐源交叉比对 → 全量打标（可靠性五档〔官方一手/权威媒体/行业报告/自媒体/论坛〕、单一来源标注、佐证编号）合成初稿；② 审查员（Reviewer，隔离会话只拿冻结初稿）亲自复核来源并出具结构化 issue 清单（`verdict: pass | fix`，每条 issue 三段式 point/problem/fix_hint）；③ 判 fix 时 issue 清单退回调研员修订轮，对存疑点重新调研补足。终稿必须过引擎**代码门**（来源清单逐行带〔可靠性：…〕、单源事实必标〔单一来源〕、corroboration 引用存在、fetch_sources 交付在场）才交回调用方——信任门，不信任模型自觉。`fetch_sources=true`（可选，缺省 false）把引用来源的页面全文拉下来随报告附回。**主题进、报告出——零宿主概念。** 报告存哪、怎么留档是调用方自己的事，本包不做任何文件 IO，也不知道「项目」是什么。

形态对齐通用 deep research 实证（[gpt-researcher](https://docs.gptr.dev/docs/gpt-researcher/gptr/pip-package)：query 进 → 报告 + 来源元数据出；[open_deep_research](https://github.com/langchain-ai/open_deep_research)：messages 进 → 最终报告出）。

## 合同

- structured 交付：`{case_id, status: "completed|partial", report_markdown, facts: [{assertion,url,date,domain,title?,reliability?,corroboration?}], open_questions: string[], sources?}`——报告是人读面，facts[] 是机器面原子（corroboration = 佐证同一断言的其他 [SRC-n] 编号，缺席 = 单一来源），随收据 details 回调用方；`fetch_sources=true` 时 sources[] 带每条来源全文。
- 审查员交付（工序②）：`{case_id, verdict: "pass"|"fix", issues: [{point, problem, fix_hint}], report_markdown, sources?}`——代码门拒收「判 fix 却没给 issue 清单」与「判 pass 却带 issue」两种不一致。
- 来源打标三层不豁免：调研员自己打标（工序①）→ 审查员独立复核（工序②）→ 引擎 `verifyFinalReport` 代码门确定性复查（工序③产出）——哪层都不过就出不了收据。
- 拉取门：`fetch_sources=true` 时 sources 空数组 = 门不过；content 缺席 = 拉取失败（如实标注，禁止编造全文）。
- 内容门：报告须达实质线（`REPORT_MIN_CHARS`）、fact URL 可解析、completed 须有 facts、facts 与 open_questions 不得双空。
- 搜索 provider：读宿主 **web seam**（`ctx.web`）——用户配的哪家（exa/deepseek）就用哪家；显式配置落空与多 provider 歧义如实上报，不代选不静默。
- 路由：**单路由**（2026-09-15 拍板：fallback 暂不启用，只取 primary）。来源：`config.routes[0]` > 发起会话模型 > 宿主默认派单（空 provider/model——runner 不发 `agentOptions`）。`workspace` 是 cordis 配置（供路由解析），不是调用参数。
- 派单基建归本包（`src/runner.ts`，五段 runner 自有真源），账本格式归 dsh-plugin-ledger（在建）。
- 项目侧留档（证据行进 `底稿/调研.md` 供 outline 引用覆盖门消费）**不是**本插件的事——写作簇在自己的仓里包一层（挂账）。

## 流程图

![research 全流程图](docs/pipeline.svg)

<details>
<summary>mermaid 源码</summary>

```mermaid
flowchart TD
    A["research(topic, fetch_sources?)<br/>topic 必填——工具 schema required 已拦（直连 engine 空主题 = 防御 throw，不占主链）"] --> C{"web seam 搜索 provider 可用？"}
    C -- "无可用" --> Z2["error 收据：provider 不可用（不派单）"]
    C -- "多 provider 歧义 / 配置落空" --> Z3["error 收据：点名上报，不代选"]
    C -- "命中" --> D["路由解析（单路由，只取第一条）<br/>插件卡配置 &gt; patch 行 routes &gt; 发起会话模型；皆无 = 宿主默认派单（不抛错）<br/>审查员缺省同调研员路由"]
    D --> E["开账本信封（skill=researcher，tool=research）"]
    E --> S1["工序① 调研员 Researcher（隔离会话）<br/>主题详略自判 → 规划 4-8 条研究线<br/>→ web_search/web_fetch 检索取证<br/>→ 逐源交叉比对 + 全量打标（可靠性五档/单一来源/佐证编号）→ 初稿"]
    S1 -- "structured 缺失" --> N1{"nudge ×1"}
    N1 -- "仍缺失" --> Z4["error 收据：初稿派单失败（全轮保全）"]
    N1 -- "有交付" --> G1{"初稿代码门：实质线 + facts 原子"}
    G1 -- "不过" --> Z5["error 收据：初稿内容门未过"]
    G1 -- "过" --> S2["工序② 审查员 Reviewer（隔离会话，只拿冻结初稿）<br/>自己 web_fetch 亲核来源（事实一致/死链/独立性/标注/口径）<br/>→ 结构化 issue 清单（point/problem/fix_hint）<br/>fetch_sources=true 时顺路收各来源全文进 sources[]"]
    S2 -- "structured 缺失" --> N2{"nudge ×1"}
    N2 -- "仍缺失" --> Z6["error 收据：审查阶段失败（未审不交付）"]
    N2 -- "有结论" --> G2{"审查一致性门"}
    G2 -- "判 fix 却无清单 / 判 pass 却带 issue" --> Z7["error 收据：审查结论不一致"]
    G2 -- "pass（issues 空）" --> F["终稿 = 初稿<br/>（采纳审查员笔误级修订 + sources）"]
    G2 -- "fix（issues 非空）" --> S3["工序③ 调研员修订轮（隔离会话）<br/>issue 逐条重新调研补足（审查员已拉来源带过去防重拉）→ 终稿"]
    S3 -- "structured 缺失 → nudge ×1 仍失败" --> Z8["error 收据：修订阶段失败"]
    S3 -- "有终稿" --> G3
    F --> G3{"终稿代码门<br/>① 实质线+facts ② 来源清单逐行〔可靠性：五档〕<br/>③ 单源事实必标〔单一来源〕 ④ corroboration 引用存在<br/>⑤ fetch_sources=true 时 sources 在场"}
    G3 -- "任一不过" --> Z9["error 收据：点名哪道门、什么问题"]
    G3 -- "全过" --> OK["pass 收据<br/>report 全文 + 来源全文附录 + details（facts/sources/reviewed…）"]
    OK --> R["工具 render 回调用方：三段文本块<br/>summary / 报告 / 来源附录"]
    OK -.-> L["账本信封收口（fail-open）"]
    style Z1 fill:#f9d6d6,color:#5a1414
    style Z2 fill:#f9d6d6,color:#5a1414
    style Z3 fill:#f9d6d6,color:#5a1414
    style Z4 fill:#f9d6d6,color:#5a1414
    style Z5 fill:#f9d6d6,color:#5a1414
    style Z6 fill:#f9d6d6,color:#5a1414
    style Z7 fill:#f9d6d6,color:#5a1414
    style Z8 fill:#f9d6d6,color:#5a1414
    style Z9 fill:#f9d6d6,color:#5a1414
    style OK fill:#d8efdb,color:#14401a
```

</details>

要点：**三道隔离工序互不可见会话**（只经引擎传冻结 JSON），**所有环节由引擎代码判定推进**，任何一道门不过 = error 收据，绝不给未复核的报告。

## 插件配置（模型 / 思考强度）

宿主「设置 → 插件」分区里的 **research 配置卡**（官方插件设置正位：服务端 `settings.installSection("research")` + 浏览器半 `settings.plugin.item` 同 key 卡，缺一隐身）。卡形态照宿主 `PluginCard` 同形（STANDARDS §4.1/§4.2）：**默认折叠成一行**，点开才渲染控件；**改输入只落草稿，保存是唯一写点**（未保存标记挂折叠头、「丢弃」回基线、非法草稿 block 保存）；宿主文档只读时禁用控件并说明；`Tag`/chevron 复用宿主 `dsh-client-ui-primitives`。

- **默认一份配置**：模型（输入框带下拉：已配好的模型都在里面直接点，也可手填 `provider/model` 二段式；**留空 = 跟随主会话**）+ 思考强度（low/medium/high/xhigh，留空 = 宿主默认档）——调研员与审查员两道隔离工序共用；
- **高级：分开配**：勾选后拆出调研员（初稿+修订轮）与审查员两块，各自模型/思考强度，留空字段回落默认配置；
- 配置持久化归宿主 settings 系统（`~/.dsh/settings.yaml` 的 research 段，schemastery schema 校验，变更热推送）；保存落盘后对下一次 research 调用即生效，无需重启 host。优先级：**插件卡配置 > patch 行 routes > 发起会话模型 > 宿主默认派单**（审查员路由缺省 = 调研员同路由）。

## config

| key         | 说明                                                                            |
| ----------- | ------------------------------------------------------------------------------- |
| `workspace` | 工作区根；缺省 = 会话 cwd 探测（仅供路由解析）                                  |
| `routeKey`  | 工作区 routes 键（缺省 `content-writer.researcher`）                            |
| `routes`    | 显式主路由（`[{provider, model, thinkingLevel?}]`，只取第一条；被 UI 配置覆盖） |

## 挂载

profile `package.json` 加依赖 + `dsh.profile.bundles` 加包名；本包自带 `cordis.patch.yml` bundle 行。宿主重启只归用户。

## 已知边界

- 只走单路由（无 fallback）：只取第一条显式配置；皆无则跟随发起会话或宿主默认派单——不抛错、不代选服务商。
- 搜索 provider 必须由宿主 web seam 供给（exa / deepseek）；缺失或歧义 = error 收据，不静默。
- 报告是自由文本 markdown + 机器 `facts[]` 原子；模型只认自由文本 `provider/model`（无 adapter 目录可配）。
- 本包不做文件 IO、不知项目为何物；报告留档归调用方。账本信封 fail-open。

## 浏览器 E2E（UI 验证）

`pnpm check:browser` 自起一次性实例（隔离 `DSH_HOME`、port 0），真驱动无头 Chrome 走
「设置 → 插件 → 点开 research 卡」全链 DOM 断言：卡壳是 `<li>`、默认折叠（折叠态无控件）、`aria-expanded` 翻转、
`label[for]` 真关联、草稿态（未保存标 / 丢弃回基线 / 非法草稿 block 保存）、保存是唯一写点（落盘后收起再回读）。
浏览器半任何改动必须过它（STANDARDS §4.1/§4.2/§5；静态形态判定在 dsh-check `pluginStandardSuite` 第 5 用例）。
