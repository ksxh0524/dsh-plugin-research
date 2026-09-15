# dsh-plugin-research

Generic topic-driven deep-research DSH plugin. `research(topic, fetch_sources?)` (the only entry point; give a terse or a detailed topic — the flow self-judges). **Engine-code-driven three isolated stages**: ① a Researcher subagent plans its own research strands → targeted `web_search`/`web_fetch` passes → cross-checks every source → tags everything (reliability tiers 官方一手/权威媒体/行业报告/自媒体/论坛, single-source flags, corroboration ids) → composes the draft; ② an isolated Reviewer subagent (frozen draft only) re-verifies sources itself and returns a structured issue list (`verdict: pass | fix` + per-issue `point/problem/fix_hint`); ③ on `fix` the issues are handed back to a Researcher revision round that re-researches the flagged points. The final report must pass engine **code gates** (every source-list row carries 〔可靠性：…〕, single-source facts carry 〔单一来源〕, corroboration references exist, `fetch_sources` delivery present) or the receipt errors — trust is in the gates, not the model's goodwill. `fetch_sources=true` (optional, default false) additionally pulls the cited pages' full text back as an appendix. **Topic in, report out — zero host concepts.** Saving/archiving the report is the caller's job; this plugin does no file IO and knows nothing about projects.

Shape follows the generic deep-research references ([gpt-researcher](https://docs.gptr.dev/docs/gpt-researcher/gptr/pip-package): `query` in → report + sources metadata out; [open_deep_research](https://github.com/langchain-ai/open_deep_research): messages in → final report out).

## 合同

- Structured delivery: `{case_id, status: "completed|partial", report_markdown, facts: [{assertion,url,date,domain,title?,reliability?,corroboration?}], open_questions: string[], sources?}` — the report is the human-facing artifact, `facts[]` are machine-parseable atoms returned as receipt metadata (the `get_research_sources()` analog; `corroboration` lists corroborating `[SRC-n]` ids — absent = single source), `sources[]` carries per-source full text when `fetch_sources=true`.
- Review delivery (stage ②): `{case_id, verdict: "pass"|"fix", issues: [{point, problem, fix_hint}], report_markdown, sources?}` — code gate rejects `fix` with an empty issue list and `pass` with issues attached.
- Source tagging is the Researcher's own duty (stage ①), the Reviewer independently audits it (stage ②), and the engine's `verifyFinalReport` gate re-checks it deterministically (stage ③ output) — three layers, none optional.
- Fetch gate: when `fetch_sources=true`, an empty `sources[]` fails the gate; `content` absent = fetch failed (reported honestly, never fabricated).
- Content gate: report must reach the substance floor (`REPORT_MIN_CHARS`), fact URLs must parse, `completed` requires facts, facts and open_questions must not both be empty.
- Search provider: read from the host **web seam** (`ctx.web`) — whichever provider the profile configures (exa / deepseek) is the one used; explicit-config-miss and multi-provider ambiguity are reported honestly, never silently resolved.
- Routing: **single route** (primary only — fallback deliberately not enabled for now). Source: `config.routes[0]` > workspace routes key (default `content-writer.researcher`) > fail-loud. `workspace` is cordis config (route resolution), not a call parameter.
- Shared infrastructure comes from `aivideo-core` via `link:../aivideo-core` (the five-stage subagent runner true source).
- Project-side archiving (evidence rows into `底稿/调研.md` for the outline citation gate) is **not** this plugin's business — the writing cluster wraps this engine in its own repo (planned).

## Pipeline

![research 全流程图](docs/pipeline.svg)

<details>
<summary>mermaid source</summary>

```mermaid
flowchart TD
    A["research(topic, fetch_sources?)<br/>topic required — rejected by the tool schema; direct engine calls hit the defensive throw (not on the main chain)"] --> C{"web seam search provider available?"}
    C -- "none" --> Z2["error receipt: provider unavailable (no dispatch)"]
    C -- "ambiguous / config miss" --> Z3["error receipt: named report, never silently resolved"]
    C -- "hit" --> D["route resolution (single-route primary)<br/>config.routes &gt; workspace routes key; none = throw"]
    D --> E["open ledger envelope (skill=researcher, tool=research)"]
    E --> S1["Stage 1 Researcher (isolated session)<br/>self-judge topic detail → plan 4-8 strands<br/>→ web_search/web_fetch passes<br/>→ cross-check every source + tag all (reliability tiers / single-source / corroboration) → draft"]
    S1 -- "structured missing" --> N1{"nudge ×1"}
    N1 -- "still missing" --> Z4["error receipt: draft dispatch failed (all rounds kept)"]
    N1 -- "delivered" --> G1{"draft gate: substance floor + fact atoms"}
    G1 -- "fail" --> Z5["error receipt: draft gate rejected"]
    G1 -- "pass" --> S2["Stage 2 Reviewer (isolated, frozen draft only)<br/>opens sources itself via web_fetch (fact match / dead links / independence / tags / conflicts)<br/>→ structured issue list (point/problem/fix_hint)<br/>when fetch_sources=true, also collects per-source full text into sources[]"]
    S2 -- "structured missing" --> N2{"nudge ×1"}
    N2 -- "still missing" --> Z6["error receipt: review failed (unreviewed reports never ship)"]
    N2 -- "verdict returned" --> G2{"review consistency gate"}
    G2 -- "fix with no issues / pass with issues" --> Z7["error receipt: inconsistent review verdict"]
    G2 -- "pass (issues empty)" --> F["final = draft<br/>(adopts reviewer's typo-level fixes + sources)"]
    G2 -- "fix (issues present)" --> S3["Stage 3 Researcher revision round (isolated)<br/>re-research per issue (reviewer's fetched sources passed over to avoid re-fetching) → final"]
    S3 -- "structured missing → nudge ×1 still failing" --> Z8["error receipt: revision failed"]
    S3 -- "delivered" --> G3
    F --> G3{"final code gates<br/>① substance + facts ② every source-list row carries 〔可靠性：tier〕<br/>③ single-source facts carry 〔单一来源〕 ④ corroboration refs exist<br/>⑤ sources present when fetch_sources=true"}
    G3 -- "any fail" --> Z9["error receipt: names the gate and the problem"]
    G3 -- "all pass" --> OK["pass receipt<br/>report full text + source full-text appendix + details (facts/sources/reviewed…)"]
    OK --> R["tool render returns three text blocks<br/>summary / report / source appendix"]
    OK -.-> L["ledger envelope closed (fail-open)"]
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

Key property: the three stages are **mutually blind sessions** (only frozen JSON crosses between them via the engine), **every transition is decided by engine code**, and any gate failure = error receipt — an unreviewed report is never delivered.

## Config

| key         | Description                                                                      |
| ----------- | -------------------------------------------------------------------------------- |
| `workspace` | Workspace root; default = session cwd probing (route resolution only)            |
| `routeKey`  | Workspace routes key (default `content-writer.researcher`)                       |
| `routes`    | Explicit primary route (`[{provider, model, thinkingLevel?}]`, first entry only) |

## Install

Add the dependency and bundle name to the profile's `package.json`; the package ships its own `cordis.patch.yml` bundle row. Host restart is user-owned.
