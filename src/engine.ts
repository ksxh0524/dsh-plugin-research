/** engine.ts —— research 编排 v2（通用主题式）：主题 → 子代理自分解研究线 → 检索取证 → 自检补漏 → 合成报告。
 *
 * 借鉴 open_deep_research / gpt-researcher 的骨架，收进单子代理四段流程（规划→检索→自检→合成），
 * 交付 = 完整 report_markdown（内联 [SRC-n] + 编号来源清单）+ facts[] 原子事实。
 * **单路由口径**（2026-09-15 拍板：fallback 暂不写——routes 只取 primary，失败如实透出不备路）。
 * 写手不落盘：project 模式的留档由本编排执行（收据驱动单一写者，子会话无需写权）。
 * 账本：openSession/finishSession 信封（skill=researcher，tool=research，fail-open）。
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { performance } from "node:perf_hooks";
import { runSubagentTask, type RouteSpec, type RunToLedger, type SubagentDispatch } from "aivideo-core/src/subagent/runner.ts";
import { getTaskSpecSync } from "aivideo-core/src/router/index.ts";
import { resolveProject, type ResolvedProject } from "aivideo-core/src/project/index.ts";
import { finishSession, openSession, type SessionHandle } from "aivideo-core/src/ledger/session-ledger.ts";
import { RESEARCH_DELIVERY_SCHEMA, extractPendingItems, renderResearchSection, validateDelivery, type ResearchDelivery } from "./contract.ts";
import { detectSearchProvider, type WebSeam } from "./web.ts";

/** 证据落点/源文档的项目相对缺省（写作链同款约定）。 */
export const DEFAULT_EVIDENCE_PATH = "底稿/调研.md";
export const DEFAULT_SOURCE = "底稿/大纲.md";

/** 单路由输入（provider/model 二段式；thinkingLevel 可选）。 */
export type RouteInput = { provider: string; model: string; thinkingLevel?: string };

type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

/** 编排收据（verdict 三键对齐写作包 BuildOutput 形；report 全文走工具 render 面回调用方）。 */
export type ResearchReceipt = {
  verdict: "pass" | "error";
  text: string;
  report: string;
  details: Record<string, JsonValue>;
};

/** "provider/model" 二段式解析（工作区 routes 的 primary 形态；非法回 null）。 */
function parseRouteRef(ref: string, thinking?: string): RouteInput | null {
  const i = ref.indexOf("/");
  if (i <= 0) return null;
  const provider = ref.slice(0, i).trim();
  const model = ref.slice(i + 1).trim();
  if (!provider || !model) return null;
  return thinking ? { provider, model, thinkingLevel: thinking } : { provider, model };
}

/**
 * 主路由解析（**单路由口径**——2026-09-15 用户拍板 fallback 暂不写）：
 * ① config.routes 显式——只取第一条（多给的忽略）；
 * ② 工作区 routes 文件键（getTaskSpecSync 三级回落，缺省键 content-writer.researcher）的 primary；
 * ③ 皆无 → 抛（fail-loud，不猜路由）。
 */
export function resolvePrimaryRoute(ws: string, opts: { routes?: unknown; routeKey?: string }): RouteInput {
  const explicit = Array.isArray(opts.routes) ? (opts.routes[0] as Record<string, unknown> | undefined) : undefined;
  if (explicit && typeof explicit.provider === "string" && typeof explicit.model === "string") {
    const provider = explicit.provider.trim();
    const model = explicit.model.trim();
    if (provider && model) {
      const thinking = typeof explicit.thinkingLevel === "string" ? explicit.thinkingLevel.trim() : "";
      return thinking ? { provider, model, thinkingLevel: thinking } : { provider, model };
    }
  }
  const key = opts.routeKey?.trim() || "content-writer.researcher";
  const spec = getTaskSpecSync(ws, key) as { primary?: unknown; thinking?: unknown } | null;
  if (spec && typeof spec.primary === "string") {
    const thinking = typeof spec.thinking === "string" && spec.thinking.trim() ? spec.thinking.trim() : undefined;
    const parsed = parseRouteRef(spec.primary, thinking);
    if (parsed) return parsed;
  }
  throw new Error(`research 路由缺位：config.routes 未配且工作区 routes 无键「${key}」（profile patch 行或工作区路由表二选一配 primary）`);
}

/** 调研简报（任务书输入）：显式主题 ∪ 大纲 **待核实** 条目（合并去重）。
 *
 * 通用件的一条干净规则（别人传什么进来是什么，无暗门条件）：
 * - topic → 主题式主输入，原样进任务书；
 * - source 显式指名 → 必须可读，读不到 = fail-loud 点名文件（caller 点了名就得给）；
 * - project → 项目背景进任务书 + 缺省扫 底稿/大纲.md 的待核实条目并入（有就并入，没有就
 *   没有，不算错——caller 没点名那个文件）；
 * - 空简报（topic 与待核实全无）→ gatherBrief 原样返回空，由 runResearch 主链统一 fail-loud。
 */
export async function gatherBrief(req: { topic?: unknown; source?: unknown; project: ResolvedProject | null }): Promise<{ topic: string; strands: string[] }> {
  const topic = String(req.topic ?? "").trim();
  const sourceRaw = typeof req.source === "string" ? req.source : "";
  const sourceGiven = sourceRaw.trim().length > 0;
  const strands: string[] = [];
  if (req.project) {
    const sourceRel = sourceGiven ? sourceRaw.trim() : DEFAULT_SOURCE;
    try {
      const md = await readFile(join(req.project.abs, sourceRel), "utf8");
      strands.push(
        ...extractPendingItems(md)
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } catch (e) {
      if (sourceGiven) throw new Error(`调研源文档不可读：${sourceRel}（${(e as Error).message}）`);
    }
  }
  return { topic, strands: [...new Set(strands)] };
}

/** 调研写手任务书 v2（四段流程内建 + 报告格式内建；不因外部提示覆盖）。 */
export function buildResearchTask(req: { caseId: string; topic: string; strands: string[]; project: string; providerId: string }): string {
  const strandBlock =
    req.strands.length > 0 ? ["", "## 已知待查清单（把它们并入研究线，不遗漏）", ...req.strands.map((s, i) => `${i + 1}. ${s}`)].join("\n") : "";
  return [
    "你是调研写手（researcher）。你独立完成一次主题式深度调研：自己规划、自己检索取证、自己合成报告，不落盘（留档由编排代码做），最后调用 structured_output 工具按交付格式提交（JSON 作为工具参数，不要写在回复文本里）。",
    "",
    `case_id: ${req.caseId}`,
    `调研主题: ${req.topic}`,
    req.project ? `项目背景: ${req.project}` : "",
    `搜索工具: 本会话的 web_search（provider=${req.providerId}）与 web_fetch 可用，直接用。`,
    "",
    "## 研究流程（四段，全由你在本会话内完成）",
    "1. 规划：把主题分解成 4-8 条研究线（角度/实体/时间段/对立面），每线 1-3 条具体检索式；覆盖主题没明说但该查的维度。",
    "2. 检索取证：逐线 web_search 定向检索 + web_fetch 读原文；引语与数字必须来自页面原文，禁止凭记忆编造。每条事实记 URL + 页面日期（找不到写 unknown）+ 域名 + 页面标题。",
    "3. 自检补漏：对照研究线清单，薄弱/查不到的线补查 1-2 轮；来源互相矛盾的，两边都记录并如实标注冲突，不硬凑结论。",
    "4. 合成交付：按下方报告格式写完整报告（来源清单编号与 facts 一一对应），查不到的如实进 open_questions。",
    strandBlock,
    "",
    "## 报告格式（report_markdown，按此结构）",
    "# 调研报告 — <主题>（<日期>）",
    "## 摘要（3-5 句：结论 + 置信度）",
    "## 正文（按研究线分节，事实句尾内联 [SRC-n]）",
    "## 矛盾与缺口（来源冲突/查不到的，如实写）",
    "## 待核实余项",
    "## 来源清单",
    "- [SRC-1] <标题> — <URL>（<日期>，<域名>）",
    "（编号连续，与正文内联引用一一对应）",
    "",
    "## 交付（末步调用 structured_output 工具提交，JSON 是工具参数）",
    `{"case_id":"${req.caseId}","status":"completed|partial","report_markdown":"<完整报告全文>","facts":[{"assertion":"一句话断言","url":"来源URL","date":"YYYY-MM-DD|unknown","domain":"域名","title":"页面标题"}],"open_questions":["查不到的问题"]}`,
    "status：研究线全部有着落 = completed；有查不到的 = partial。report_markdown 为空或 facts 与 open_questions 双空不算完成。",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** 编排依赖（dispatch 注入点隔离，单测换 fake；web seam 由工具面注入）。 */
export type ResearchDeps = {
  ws: string;
  dispatch: SubagentDispatch;
  web?: WebSeam;
  say?: (t: string) => void;
  signal?: AbortSignal;
  agent?: unknown;
  runToLedger?: RunToLedger;
};

export type ResearchRequest = {
  project?: unknown;
  topic?: unknown;
  source?: unknown;
  path?: unknown;
  label?: unknown;
  routes?: unknown;
  routeKey?: unknown;
  caseId?: unknown;
  watchdogMs?: unknown;
};

/** research 主链：定位 → 入参一致性 → 简报 → provider 识别 → 路由 → 派单 → 内容门 → 留档 → 收据（报告全文回调用方）。 */
export async function runResearch(req: ResearchRequest, deps: ResearchDeps): Promise<ResearchReceipt> {
  const startedAt = performance.now();
  const say = deps.say;
  // ① 项目定位（可选——通用模式可以不带项目）
  const projectName = String(req.project ?? "").trim();
  let project: ResolvedProject | null = null;
  if (projectName) {
    project = resolveProject(deps.ws, projectName);
    if (!project.existed) throw new Error(`项目定位失败：${projectName}（候选：${project.candidates.join(" | ")}）`);
    say?.(`[research] 项目定位：${project.rel}${project.autoPrefixed ? "（自动补前缀）" : ""}`);
  }
  // ② 入参一致性：path 只在 project 模式有意义（传了就得有效果，否则明说）
  if (!project && typeof req.path === "string" && req.path.trim()) {
    throw new Error("path 参数仅在 project 模式生效：给了 path 但未给 project（留档无处可放，fail-loud）");
  }
  // ③ 简报：主题 ∪ 大纲待核实
  const brief = await gatherBrief({ topic: req.topic, source: req.source, project });
  if (!brief.topic && brief.strands.length === 0) {
    throw new Error("调研主题为空：请给 topic（主题句），或带 project 且其大纲含 **待核实** 条目（fail-loud，不空跑）");
  }
  const topic = brief.topic || `${project!.rel} 的大纲待核实事项逐条查证`;
  say?.(`[research] 主题：${topic}`);
  // ④ provider 识别（配谁用谁；无可用 = 不派注定失败的写手——先于路由：硬前提先检）
  const providerInfo = detectSearchProvider(deps.web);
  if (!providerInfo.effective) {
    return {
      verdict: "error",
      text: `宿主搜索 provider 不可用：${providerInfo.note}`,
      report: "",
      details: { failure_detail: providerInfo.note },
    };
  }
  say?.(`[research] 搜索 provider：${providerInfo.effective}`);
  // ⑤ 路由（单条，fallback 明确不消费）
  const route = resolvePrimaryRoute(deps.ws, {
    routes: req.routes,
    routeKey: typeof req.routeKey === "string" ? req.routeKey : undefined,
  });
  const routeSpec: RouteSpec = route.thinkingLevel
    ? { provider: route.provider, model: route.model, thinkingLevel: route.thinkingLevel }
    : { provider: route.provider, model: route.model };
  say?.(`[research] 路由 ${route.provider}/${route.model}（单路由口径）`);
  // ⑥ caseId + 账本信封
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/gu, "");
  const caseId = String(req.caseId ?? "").trim() || `research-${stamp}`;
  const label = String(req.label ?? "").trim() || topic.slice(0, 40);
  const handle = openSession({
    ws: deps.ws,
    skill: "researcher",
    tool: "research",
    case_id: caseId,
    project: project?.rel ?? "",
    mode: "research",
    subject: topic.slice(0, 200),
  });
  const runDir = handle.ok ? handle.dir : "";
  const finishLedger = (verdict: string, reason: string, artifacts: Record<string, string>): void => {
    if (handle.ok) {
      try {
        finishSession(handle, { verdict, reason: reason.slice(0, 300), artifacts });
      } catch {
        /* 收口也 fail-open */
      }
    }
  };
  try {
    // ⑦ 派单（单路由 + nudge 缺省 1；routes 长度 1 ⇒ runner fallback 段自然不触）
    const receipt = await runSubagentTask({
      label: `research:${label}`,
      task: buildResearchTask({ caseId, topic, strands: brief.strands, project: project?.rel ?? "", providerId: providerInfo.effective }),
      outputSchema: RESEARCH_DELIVERY_SCHEMA,
      routes: [routeSpec],
      caseId,
      sessionPath: runDir,
      signal: deps.signal,
      agent: deps.agent,
      watchdogMs: typeof req.watchdogMs === "number" && req.watchdogMs > 0 ? req.watchdogMs : undefined,
      dispatch: deps.dispatch,
      runToLedger: deps.runToLedger,
    });
    if (!receipt.ok || !receipt.structured) {
      const reason = receipt.failureDetail || receipt.stopReason || "无收据";
      finishLedger("error", reason, {});
      return {
        verdict: "error",
        text: `调研派单失败（全轮保全）：${reason}`,
        report: "",
        details: { case_id: caseId, failure_detail: receipt.failureDetail ?? receipt.stopReason ?? "" },
      };
    }
    const delivery = receipt.structured as ResearchDelivery;
    // ⑧ 内容门
    const gate = validateDelivery(delivery);
    if (!gate.ok) {
      finishLedger("error", gate.errors.join("；"), {});
      return {
        verdict: "error",
        text: `交付内容门未过：${gate.errors.join("；")}`,
        report: "",
        details: { case_id: caseId, failure_detail: gate.errors.join("；").slice(0, 500) },
      };
    }
    // ⑨ 留档（project 模式：调研.md append 报告全文 + 证据行 atoms）
    let evidenceRel = "";
    if (project) {
      evidenceRel = typeof req.path === "string" && req.path.trim() ? req.path.trim() : DEFAULT_EVIDENCE_PATH;
      const evidenceAbs = join(project.abs, evidenceRel);
      await mkdir(dirname(evidenceAbs), { recursive: true });
      const at = new Date().toISOString().slice(0, 10);
      let prefix = "";
      try {
        const existing = await readFile(evidenceAbs, "utf8");
        if (existing.length && !existing.endsWith("\n")) prefix = "\n";
      } catch {
        /* 新文件无前缀 */
      }
      await appendFile(evidenceAbs, prefix + renderResearchSection(label, at, delivery), "utf8");
    }
    // ⑩ 收据（报告全文回调用方）
    const rel = project ? relative(deps.ws, join(project.abs, evidenceRel)) || evidenceRel : "";
    const facts = Array.isArray(delivery.facts) ? delivery.facts : [];
    const openCount = Array.isArray(delivery.open_questions) ? delivery.open_questions.length : 0;
    const duration = Math.round(performance.now() - startedAt);
    finishLedger("pass", "", {
      ...(rel ? { evidence: rel } : {}),
      facts: String(facts.length),
      open_questions: String(openCount),
      provider: providerInfo.effective,
    });
    return {
      verdict: "pass",
      text: `调研完成（${Math.round(duration / 100) / 10}s，provider=${providerInfo.effective}）：${facts.length} 条事实、${openCount} 条待核实余项${rel ? `；已留档 ${rel}` : ""}`,
      report: String(delivery.report_markdown ?? ""),
      details: {
        ...(rel ? { path: rel } : {}),
        facts: facts.length,
        open_questions: openCount,
        provider: providerInfo.effective,
        case_id: caseId,
      },
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    finishLedger("error", reason, {});
    throw e;
  }
}
