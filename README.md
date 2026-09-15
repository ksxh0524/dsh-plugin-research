# dsh-plugin-research

Topic-driven deep-research DSH plugin. `research` (the only entry point): hand it a topic (e.g. "collect all FY2025 earnings reports and analyst research on Coca-Cola and Pepsi") and an isolated researcher subagent plans its own research strands, runs targeted `web_search`/`web_fetch` passes, self-checks coverage, then composes a complete source-backed report (inline `[SRC-n]` citations + numbered source list) returned to the caller. Optional `project` archives the full report plus machine-parseable evidence rows into the project's evidence file (`底稿/调研.md` by default; outline citation-gate compatible; when no topic is given the outline's **待核实** items become the research strands).

## 合同

- Structured delivery: `{case_id, status: "completed|partial", report_markdown, facts: [{assertion,url,date,domain,title?}], open_questions: string[]}` — the report is the human-facing artifact, `facts[]` are machine-parseable atoms.
- Evidence row format (same source as the outline citation gate, rendered on archive):
  `- [事实] <断言>；来源：<URL>（<日期>，<域名>）；用于：<用途|待归属>`
- Content gate: report must reach the substance floor (`REPORT_MIN_CHARS`), fact URLs must parse, `completed` requires facts, facts and open_questions must not both be empty.
- Search provider: read from the host **web seam** (`ctx.web`) — whichever provider the profile configures (exa / deepseek) is the one used; explicit-config-miss and multi-provider ambiguity are reported honestly, never silently resolved.
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
