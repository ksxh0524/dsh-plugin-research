# dsh-plugin-research

Generic topic-driven deep-research DSH plugin. `research(topic, fetch_sources?)` (the only entry point): hand it a topic (e.g. "collect all FY2025 earnings reports and analyst research on Coca-Cola and Pepsi") and an isolated Researcher subagent plans its own research strands, runs targeted `web_search`/`web_fetch` passes, verifies every source (relevance filter, single-source detection with reliability tiering 官方一手/权威媒体/行业报告/自媒体/论坛, cross-source comparison — built in by default, no parameter), then composes a complete source-backed report (inline `[SRC-n]` citations + numbered source list with reliability tags) returned to the caller. `fetch_sources=true` (optional, default false) additionally pulls the cited pages' full text back as an appendix. **Topic in, report out — zero host concepts.** Saving/archiving the report is the caller's job; this plugin does no file IO and knows nothing about projects.

Shape follows the generic deep-research references ([gpt-researcher](https://docs.gptr.dev/docs/gpt-researcher/gptr/pip-package): `query` in → report + sources metadata out; [open_deep_research](https://github.com/langchain-ai/open_deep_research): messages in → final report out).

## 合同

- Structured delivery: `{case_id, status: "completed|partial", report_markdown, facts: [{assertion,url,date,domain,title?,reliability?,corroboration?}], open_questions: string[], sources?}` — the report is the human-facing artifact, `facts[]` are machine-parseable atoms returned as receipt metadata (the `get_research_sources()` analog; `corroboration` lists corroborating `[SRC-n]` ids — absent = single source), `sources[]` carries per-source full text when `fetch_sources=true`.
- Source verification is built in (not a parameter): the researcher filters irrelevant sources, prefers ≥2 independent sources per fact, flags single-source key facts with 〔单一来源〕, tiers reliability in the source list, and surfaces cross-source conflicts instead of forcing a conclusion.
- Fetch gate: when `fetch_sources=true`, an empty `sources[]` fails the gate; `content` absent = fetch failed (reported honestly, never fabricated).
- Content gate: report must reach the substance floor (`REPORT_MIN_CHARS`), fact URLs must parse, `completed` requires facts, facts and open_questions must not both be empty.
- Search provider: read from the host **web seam** (`ctx.web`) — whichever provider the profile configures (exa / deepseek) is the one used; explicit-config-miss and multi-provider ambiguity are reported honestly, never silently resolved.
- Routing: **single route** (primary only — fallback deliberately not enabled for now). Source: `config.routes[0]` > workspace routes key (default `content-writer.researcher`) > fail-loud. `workspace` is cordis config (route resolution), not a call parameter.
- Shared infrastructure comes from `aivideo-core` via `link:../aivideo-core` (the five-stage subagent runner true source).
- Project-side archiving (evidence rows into `底稿/调研.md` for the outline citation gate) is **not** this plugin's business — the writing cluster wraps this engine in its own repo (planned).

## Config

| key         | Description                                                                      |
| ----------- | -------------------------------------------------------------------------------- |
| `workspace` | Workspace root; default = session cwd probing (route resolution only)            |
| `routeKey`  | Workspace routes key (default `content-writer.researcher`)                       |
| `routes`    | Explicit primary route (`[{provider, model, thinkingLevel?}]`, first entry only) |

## Install

Add the dependency and bundle name to the profile's `package.json`; the package ships its own `cordis.patch.yml` bundle row. Host restart is user-owned.
