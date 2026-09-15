# dsh-plugin-research

Cross-domain research DSH plugin. `research_build` (the only entry point): hand a question list (or point it at a source doc's **待核实** items) and isolated subagent sessions do the web research (`web_search`/`web_fetch`), returning fact rows with sources and archiving them into the project's evidence file (`底稿/调研.md` by default).

## 合同

- Evidence row format (same source as the outline citation gate):
  `- [事实] <断言>；来源：<URL>（<日期>，<域名>）；用于：<用途|待归属>`
- Structured delivery: `{case_id, status: "completed|partial", facts: [{assertion,url,date,domain,title?,used_for?}], open_questions: string[]}`
- Routing: **single route** (primary only — fallback deliberately not enabled for now). Source: `config.routes[0]` > workspace routes key (default `content-writer.researcher`) > fail-loud.
- Shared infrastructure comes from `aivideo-core` via `link:../aivideo-core` (the five-stage subagent runner true source).

## Config

| key         | Description                                                                      |
| ----------- | -------------------------------------------------------------------------------- |
| `workspace` | Workspace root; default = session cwd probing                                    |
| `routeKey`  | Workspace routes key (default `content-writer.researcher`)                       |
| `routes`    | Explicit primary route (`[{provider, model, thinkingLevel?}]`, first entry only) |

## Install

Add the dependency and bundle name to the profile's `package.json`; the package ships its own `cordis.patch.yml` bundle row. Host restart is user-owned.
