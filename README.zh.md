# dsh-plugin-research

跨域调研 DSH 插件。`research_build`（唯一入口）：给一份问题清单（或指向带 **待核实** 条目的源文档），隔离写手子会话去做 web 调研（web_search/web_fetch），产出带来源的事实行并留档进项目的证据文件（缺省 `底稿/调研.md`）。

## 合同

- 证据行格式（与 outline 引用覆盖门同源）：
  `- [事实] <断言>；来源：<URL>（<日期>，<域名>）；用于：<用途|待归属>`
- structured 交付：`{case_id, status: "completed|partial", facts: [{assertion,url,date,domain,title?,used_for?}], open_questions: string[]}`
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
