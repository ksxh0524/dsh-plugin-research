/** engine.ts —— research 编排 v4（纯通用 + 隔离三工序 + 代码门控）。
 *
 * 形态对齐通用 deep research 实证（gpt-researcher / open_deep_research）：**主题进、报告出**，
 * 调用方不传任何宿主概念（无 project/落盘/证据行——留档是调用方自己的事，本编排零文件 IO）。
 * **隔离三工序（引擎代码驱动流程，不赌单会话自觉；JSON 合同是底线）**：
 *   工序1 调研员（Researcher，隔离会话）：主题详略自判 → 规划 → 检索取证 + 逐源交叉比对 →
 *   全量打标（可靠性五档/单一来源/corroboration）→ 合成初稿；
 *   ——引擎代码门：初稿实质线 + facts 原子，不过即拒；
 *   工序2 审查员（Reviewer，**另一个隔离会话**，只拿冻结初稿）：亲核来源（web_fetch 对勘）
 *   + 审标注/死链/独立性/冲突并列，出结构化 issue 清单；verdict=pass 放行 / fix 退回；
 *   ——引擎代码门：fix 却无 issue 清单（或 pass 却带 issue）= 不合格即拒；
 *   工序3（条件）：verdict=fix → 退回调研员修订轮（隔离会话，拿初稿+issues 重新调研补足）→ 终稿；
 *   ——引擎代码门（终稿，pass/fix 都过）：实质线 + 来源标注完整性（清单行逐行〔可靠性：五档〕、
 *   单源事实必标〔单一来源〕、corroboration 引用存在）+ fetch_sources 拉取门——任一不过即拒。
 * **单路由口径**（2026-09-15 拍板：fallback 暂不写）。账本：openSession/finishSession 信封
 * （skill=researcher，tool=research，fail-open）。
 */

import { performance } from "node:perf_hooks";
import { runSubagentTask, type RouteSpec, type RunToLedger, type SubagentDispatch } from "aivideo-core/src/subagent/runner.ts";
import { getTaskSpecSync } from "aivideo-core/src/router/index.ts";
import { finishSession, openSession, type SessionHandle } from "aivideo-core/src/ledger/session-ledger.ts";
import {
  RESEARCH_DELIVERY_SCHEMA,
  REVIEW_DELIVERY_SCHEMA,
  renderSourceAppendix,
  validateDelivery,
  validateSourceFetch,
  verifyFinalReport,
  type ResearchDelivery,
  type ReviewDelivery,
  type ReviewIssue,
} from "./contract.ts";
import { detectSearchProvider, type WebSeam } from "./web.ts";

/** 单路由输入（provider/model 二段式；thinkingLevel 可选）。 */
export type RouteInput = { provider: string; model: string; thinkingLevel?: string };

type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

/** 编排收据（verdict 三键对齐写作包 BuildOutput 形；report/appendix 全文走工具 render 面回调用方）。 */
export type ResearchReceipt = {
  verdict: "pass" | "error";
  text: string;
  report: string;
  appendix: string;
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

const REPORT_FORMAT_BLOCK = [
  "## 报告格式（report_markdown，按此结构）",
  "# 调研报告 — <主题>（<日期>）",
  "## 摘要（3-5 句：结论 + 置信度 + 来源可靠性总评）",
  "## 正文（按研究线分节，事实句尾内联 [SRC-n]；单一来源支撑的关键事实句尾加〔单一来源〕）",
  "## 矛盾与缺口（来源冲突并列各方说法/查不到的，如实写）",
  "## 待核实余项",
  "## 来源清单",
  "- [SRC-1] <标题> — <URL>（<日期>，<域名>）〔可靠性：官方一手|权威媒体|行业报告|自媒体|论坛〕",
  "（编号连续，与正文内联引用一一对应；来源清单每行必须带〔可靠性：…〕五档标注）",
].join("\n");

/** 工序1 任务书：调研员初稿（详略自判 → 检索取证+逐源交叉比对+全量打标 → 自检补漏 → 初稿）。 */
export function buildResearchTask(req: { caseId: string; topic: string; strands?: string[]; providerId: string }): string {
  const strandBlock =
    req.strands && req.strands.length > 0 ? ["", "## 已知待查清单（把它们并入研究线，不遗漏）", ...req.strands.map((s, i) => `${i + 1}. ${s}`)].join("\n") : "";
  return [
    "你是调研员（Researcher）。你完成一次主题式深度调研的初稿：自己规划、自己检索取证、自己交叉比对、自己打标合成，不落盘（交付由编排代码回传），最后调用 structured_output 工具按交付格式提交（JSON 作为工具参数，不要写在回复文本里）。你的初稿会交给独立审查员复核，有问题会被退回给你修订——如实标注你拿不准的地方。",
    "",
    `case_id: ${req.caseId}`,
    `调研主题: ${req.topic}`,
    `搜索工具: 本会话的 web_search（provider=${req.providerId}）与 web_fetch 可用，直接用。`,
    "",
    "## 研究流程（四段，全由你在本会话内完成）",
    "1. 规划：主题给得粗还是细由你自判——够细就按细节拆线，太粗就先补一轮背景检索再拆线。把主题分解成 4-8 条研究线（角度/实体/时间段/对立面），每线 1-3 条具体检索式；覆盖主题没明说但该查的维度。",
    "2. 检索取证 + 逐源交叉比对：逐线 web_search 定向检索 + web_fetch 读原文；引语与数字必须来自页面原文，禁止凭记忆编造。每条事实记 URL + 页面日期（找不到写 unknown）+ 域名 + 页面标题。",
    "   来源核查（本职，逐条做）：① 有用性——来源必须与断言直接相关，不相关/只是沾边的丢弃，不进清单；② 独立性——同一事实尽量找 ≥2 个独立来源（不同域名/不同机构，转载不算独立），facts 的 corroboration 记佐证编号；③ 单一来源——单源支撑的关键事实句尾标〔单一来源〕，并按五档（官方一手/权威媒体/行业报告/自媒体/论坛）评估该来源可靠性，可靠性不足的断言如实降级或弃用；④ 交叉比对——逐源对勘数字与口径，跨源冲突在「矛盾与缺口」并列各方说法，不硬凑结论。",
    "3. 自检补漏：对照研究线清单，薄弱/查不到的线补查 1-2 轮；查不到的如实进 open_questions。",
    "4. 合成初稿：按下方报告格式写完整初稿（来源清单编号与 facts 一一对应，标注纪律齐全——审查员会逐条核）。",
    strandBlock,
    "",
    REPORT_FORMAT_BLOCK,
    "",
    "## 交付（末步调用 structured_output 工具提交，JSON 是工具参数）",
    `{"case_id":"${req.caseId}","status":"completed|partial","report_markdown":"<完整初稿全文>","facts":[{"assertion":"一句话断言","url":"来源URL","date":"YYYY-MM-DD|unknown","domain":"域名","title":"页面标题","reliability":"官方一手|…","corroboration":["SRC-2"]}],"open_questions":["查不到的问题"]}`,
    "status：研究线全部有着落 = completed；有查不到的 = partial。report_markdown 为空或 facts 与 open_questions 双空不算完成。",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** 工序2 任务书：审查员（隔离会话，只拿冻结初稿；亲核来源 + 结构化 issue 清单，不重写报告主体）。 */
export function buildReviewTask(req: { caseId: string; topic: string; draft: ResearchDelivery; providerId: string; fetchSources: boolean }): string {
  const factsJson = JSON.stringify(req.draft.facts ?? []);
  const fetchBlock = req.fetchSources
    ? [
        "",
        "## 来源拉取（本单要求，必须执行）",
        "复核中反正要逐条打开来源；把每条来源的页面正文收进交付的 sources[]（与报告来源清单一一对应）：",
        `{"src":"SRC-1","title":"页面标题","url":"来源URL","date":"YYYY-MM-DD|unknown","domain":"域名","reliability":"官方一手|权威媒体|行业报告|自媒体|论坛","content":"<页面正文 markdown，尽量全文，超长可截断并在尾部标 (截断)>"}`,
        "content 缺席 = 该页拉取失败（如实标注，禁止编造全文）。一条 sources 都不交付 = 本单不合格。",
      ].join("\n")
    : "";
  return [
    "你是审查员（Reviewer）。一位调研员交来调研初稿与事实清单；你的职责：**独立审稿 + 亲自复核来源**，找出所有问题与疑问，形成结构化 issue 清单交回流程——有疑问就退回调研员补足。你与调研员是两个隔离会话，初稿里的一切断言对你只是待验材料，不信任初稿，只信页面原文。你不重写报告主体（修订是调研员下一道工序的活）。最后调用 structured_output 工具提交（JSON 作为工具参数，不要写在回复文本里）。",
    "",
    `case_id: ${req.caseId}`,
    `调研主题: ${req.topic}`,
    `搜索工具: 本会话的 web_search（provider=${req.providerId}）与 web_fetch 可用——对存疑点直接打开来源核对，不要凭感觉判。`,
    "",
    "## 复核维度（逐条过，不得抽查豁免）",
    "1. 事实与来源一致：抽每条 fact 的 URL 用 web_fetch 打开——页面可达？断言与原文一致？数字/引语与原文逐字对得上？",
    "2. 来源质量：死链/打不开的来源；与断言不相关的来源（有用性）；转载/同源镜像被当独立佐证（独立性）。",
    "3. 标注与评级：来源清单是否每行带〔可靠性：…〕五档标注；单一来源事实是否标了〔单一来源〕；可靠性评级是否给错档（如自媒体标成权威媒体）。",
    "4. 口径与覆盖：跨来源冲突是否在「矛盾与缺口」并列；研究线有没有明显缺口/薄弱处没查。",
    "",
    "## issue 写法（每条三段，可定位可执行）",
    "- point：哪里有问题（哪条事实/哪个 [SRC-n]/哪条研究线）",
    "- problem：什么问题（与原文不符/死链/佐证不足/标注缺失/评级错档/冲突未并列/覆盖缺口…）",
    "- fix_hint：怎么补（补查什么检索式、换什么来源、怎么改写）",
    "- 宁可多报不可漏报；笔误级小问题可并入 point 说明。",
    "",
    "## verdict 判据",
    "- 无实质问题（事实全对得上、标注齐全、无死链、冲突已并列）= pass，issues 留空数组，report_markdown 回传（笔误级修正后的）报告全文；",
    "- 有任何实质问题 = fix，issues 逐条列全，report_markdown 给空串。",
    "",
    "## 待审材料（调研员初稿，冻结原样）",
    "### 初稿报告",
    "```markdown",
    String(req.draft.report_markdown ?? "").trim(),
    "```",
    `facts[]：${factsJson}`,
    "",
    "## 交付（structured_output 工具，JSON 是工具参数）",
    `{"case_id":"${req.caseId}","verdict":"pass|fix","issues":[{"point":"…","problem":"…","fix_hint":"…"}],"report_markdown":"<pass=报告全文 / fix=空串>"${req.fetchSources ? ',"sources":[{"src":"SRC-1","title":"…","url":"…","date":"…","domain":"…","reliability":"…","content":"…"}]' : ""}}`,
    fetchBlock,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** 工序3 任务书：调研员修订轮（只拿初稿+issue 清单，重新调研补足，产出终稿）。 */
export function buildFixTask(req: {
  caseId: string;
  topic: string;
  draft: ResearchDelivery;
  issues: ReviewIssue[];
  providerId: string;
  fetchSources: boolean;
  reviewerSources: string;
}): string {
  const factsJson = JSON.stringify(req.draft.facts ?? "");
  const issuesJson = JSON.stringify(req.issues, null, 2);
  const reviewerBlock = req.reviewerSources ? ["", "## 审查员已拉的来源全文（直接复用 content，缺的再补拉）", req.reviewerSources].join("\n") : "";
  const fetchBlock = req.fetchSources
    ? [
        "",
        "## 来源拉取（本单要求，必须执行）",
        "终稿交付必须附 sources[]（与终稿来源清单一一对应；审查员已拉的直接复用，新增来源补拉）：",
        `{"src":"SRC-1","title":"页面标题","url":"来源URL","date":"YYYY-MM-DD|unknown","domain":"域名","reliability":"官方一手|权威媒体|行业报告|自媒体|论坛","content":"<页面正文 markdown，尽量全文，超长可截断并在尾部标 (截断)>"}`,
        "content 缺席 = 该页拉取失败（如实标注，禁止编造全文）。一条 sources 都不交付 = 本单不合格。",
      ].join("\n")
    : "";
  return [
    "你是调研员（Researcher，修订轮）。你此前交了调研初稿，独立审查员退回一份 issue 清单；你的职责：逐条重新调研补足/修正，产出**最终交付**。最后调用 structured_output 工具提交（JSON 作为工具参数，不要写在回复文本里）。",
    "",
    `case_id: ${req.caseId}`,
    `调研主题: ${req.topic}`,
    `搜索工具: 本会话的 web_search（provider=${req.providerId}）与 web_fetch 可用，直接用。`,
    "",
    "## 修订流程",
    "1. 逐条处理 issue 清单（不挑肥拣瘦）：与原文不符的改写或删除；死链换源；佐证不足的补查独立来源并校正 corroboration；标注缺失/评级错档的补正；冲突未并列的补多方说法；覆盖缺口补查研究线。",
    "2. 维持打标纪律：来源清单每行〔可靠性：…〕五档标注、单源关键事实〔单一来源〕、正文内联 [SRC-n] 与 facts 一一对应。",
    "3. 输出修订后的整稿（不是补丁），格式同下，查不到的如实进 open_questions。",
    "",
    "## 待修订材料（初稿冻结原样）",
    "### 初稿报告",
    "```markdown",
    String(req.draft.report_markdown ?? "").trim(),
    "```",
    `facts[]：${factsJson}`,
    "",
    "## 审查员 issue 清单（必须逐条有着落）",
    issuesJson,
    reviewerBlock,
    "",
    REPORT_FORMAT_BLOCK,
    "",
    "## 交付（structured_output 工具，JSON 是工具参数）",
    `{"case_id":"${req.caseId}","status":"completed|partial","report_markdown":"<修订后终稿全文>","facts":[{"assertion":"…","url":"…","date":"…","domain":"…","title":"…","reliability":"…","corroboration":["SRC-2"]}],"open_questions":["…"]${req.fetchSources ? ',"sources":[{"src":"SRC-1","title":"…","url":"…","date":"…","domain":"…","reliability":"…","content":"…"}]' : ""}}`,
    "status：修订后研究线全部有着落 = completed；仍有查不到的 = partial。report_markdown 为空或 facts 与 open_questions 双空不算完成。",
    fetchBlock,
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
  topic: unknown;
  /** 已知待查条目（库级可选输入，通用概念：调用方自带材料清单；工具面不暴露）。 */
  strands?: string[];
  /** 拉取来源全文（可选层，缺省 false；审查员/修订轮拉全文随报告附回）。 */
  fetchSources?: unknown;
  routes?: unknown;
  routeKey?: unknown;
  caseId?: unknown;
  watchdogMs?: unknown;
};

/** research 主链：主题 → provider → 路由 → 工序1(初稿) → 门 → 工序2(审查) → 门 → (fix? 工序3修订) → 终稿门 → 收据。 */
export async function runResearch(req: ResearchRequest, deps: ResearchDeps): Promise<ResearchReceipt> {
  const startedAt = performance.now();
  const say = deps.say;
  // ① 主题（schema required:true 已拦；这里只对直连 engine 的调用做防御）
  const topic = String(req.topic ?? "").trim();
  if (!topic) throw new Error("调研主题为空：请给 topic（主题句）");
  const fetchSources = req.fetchSources === true;
  say?.(`[research] 主题：${topic}${fetchSources ? "（含来源拉取）" : ""}`);
  // ② provider 识别（配谁用谁；无可用 = 不派注定失败的会话——先于路由：硬前提先检）
  const providerInfo = detectSearchProvider(deps.web);
  if (!providerInfo.effective) {
    return {
      verdict: "error",
      text: `宿主搜索 provider 不可用：${providerInfo.note}`,
      report: "",
      appendix: "",
      details: { failure_detail: providerInfo.note },
    };
  }
  say?.(`[research] 搜索 provider：${providerInfo.effective}`);
  // ③ 路由（单条，fallback 明确不消费；三工序共用同一路由）
  const route = resolvePrimaryRoute(deps.ws, {
    routes: req.routes,
    routeKey: typeof req.routeKey === "string" ? req.routeKey : undefined,
  });
  const routeSpec: RouteSpec = route.thinkingLevel
    ? { provider: route.provider, model: route.model, thinkingLevel: route.thinkingLevel }
    : { provider: route.provider, model: route.model };
  say?.(`[research] 路由 ${route.provider}/${route.model}（单路由口径）`);
  // ④ caseId + 账本信封（三工序共用同一信封，attempt 记录自然分笔）
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/gu, "");
  const caseId = String(req.caseId ?? "").trim() || `research-${stamp}`;
  const handle = openSession({
    ws: deps.ws,
    skill: "researcher",
    tool: "research",
    case_id: caseId,
    project: "",
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
  const baseDispatch = {
    outputSchema: RESEARCH_DELIVERY_SCHEMA,
    routes: [routeSpec],
    caseId,
    sessionPath: runDir,
    signal: deps.signal,
    agent: deps.agent,
    watchdogMs: typeof req.watchdogMs === "number" && req.watchdogMs > 0 ? req.watchdogMs : undefined,
    dispatch: deps.dispatch,
    runToLedger: deps.runToLedger,
  };
  const stageError = (text: string, failure: string): ResearchReceipt => ({
    verdict: "error",
    text,
    report: "",
    appendix: "",
    details: { case_id: caseId, failure_detail: failure.slice(0, 500) },
  });
  try {
    // ⑤ 工序1：调研员初稿（隔离会话；nudge 缺省 1 兜结构失败）
    say?.("[research] 工序1/调研员：检索取证+交叉比对+打标合成初稿");
    const draft = await runSubagentTask({
      ...baseDispatch,
      label: `research:${topic.slice(0, 40)}#draft`,
      task: buildResearchTask({ caseId, topic, strands: req.strands, providerId: providerInfo.effective }),
    });
    if (!draft.ok || !draft.structured) {
      const reason = draft.failureDetail || draft.stopReason || "无收据";
      finishLedger("error", reason, {});
      return stageError(`调研派单失败（初稿阶段，全轮保全）：${reason}`, reason);
    }
    const draftDelivery = draft.structured as ResearchDelivery;
    // ⑥ 引擎代码门（初稿）：实质线 + facts 原子
    const draftGate = validateDelivery(draftDelivery);
    if (!draftGate.ok) {
      finishLedger("error", draftGate.errors.join("；"), {});
      return stageError(`初稿内容门未过：${draftGate.errors.join("；")}`, draftGate.errors.join("；"));
    }
    // ⑦ 工序2：审查员独立审稿（隔离会话，只拿冻结初稿）
    say?.("[research] 工序2/审查员亲核来源并出具 issue 清单");
    const review = await runSubagentTask({
      ...baseDispatch,
      outputSchema: REVIEW_DELIVERY_SCHEMA,
      label: `research:${topic.slice(0, 40)}#review`,
      task: buildReviewTask({ caseId, topic, draft: draftDelivery, providerId: providerInfo.effective, fetchSources }),
    });
    if (!review.ok || !review.structured) {
      const reason = review.failureDetail || review.stopReason || "无收据";
      finishLedger("error", reason, {});
      return stageError(`审查阶段失败（未审报告不予交付）：${reason}`, reason);
    }
    const reviewDelivery = review.structured as ReviewDelivery;
    // ⑧ 引擎代码门（审查结论一致性）：fix 必须带 issues；pass 不得带 issues
    const reviewIssues = Array.isArray(reviewDelivery.issues) ? reviewDelivery.issues : [];
    if (reviewDelivery.verdict === "fix" && reviewIssues.length === 0) {
      finishLedger("error", "verdict=fix 但 issues 为空", {});
      return stageError("审查结论不一致：判 fix 却未给 issue 清单", "verdict=fix 但 issues 为空");
    }
    if (reviewDelivery.verdict === "pass" && reviewIssues.length > 0) {
      finishLedger("error", "verdict=pass 但 issues 非空", {});
      return stageError("审查结论不一致：判 pass 却附带 issue 清单", "verdict=pass 但 issues 非空");
    }
    // ⑨ 工序3（条件）：verdict=fix → 退回调研员修订轮
    let final: ResearchDelivery;
    if (reviewDelivery.verdict === "pass") {
      final = {
        ...draftDelivery,
        report_markdown: String(reviewDelivery.report_markdown ?? "").trim() || draftDelivery.report_markdown,
        sources: (Array.isArray(reviewDelivery.sources) ? reviewDelivery.sources : []).length > 0 ? reviewDelivery.sources : draftDelivery.sources,
      };
    } else {
      say?.("[research] 工序3/调研员修订轮：按 issue 清单补研出终稿");
      const fixed = await runSubagentTask({
        ...baseDispatch,
        label: `research:${topic.slice(0, 40)}#fix`,
        task: buildFixTask({
          caseId,
          topic,
          draft: draftDelivery,
          issues: reviewIssues,
          providerId: providerInfo.effective,
          fetchSources,
          reviewerSources: fetchSources ? JSON.stringify(reviewDelivery.sources ?? []) : "",
        }),
      });
      if (!fixed.ok || !fixed.structured) {
        const reason = fixed.failureDetail || fixed.stopReason || "无收据";
        finishLedger("error", reason, {});
        return stageError(`修订阶段失败（审查退回后未产出合格终稿）：${reason}`, reason);
      }
      final = fixed.structured as ResearchDelivery;
    }
    // ⑩ 引擎代码门（终稿）：实质线 + 来源标注完整性 + 拉取门——任一不过即拒
    const gate = validateDelivery(final);
    const markGate = verifyFinalReport(final);
    const fetchGate = fetchSources ? validateSourceFetch(final) : { ok: true, errors: [] };
    const gateErrors = [
      ...gate.errors.map((e) => `[内容] ${e}`),
      ...markGate.errors.map((e) => `[来源标注] ${e}`),
      ...fetchGate.errors.map((e) => `[拉取] ${e}`),
    ];
    if (gateErrors.length > 0) {
      finishLedger("error", gateErrors.join("；"), {});
      return stageError(`终稿代码门未过：${gateErrors.join("；")}`, gateErrors.join("；"));
    }
    // ⑪ 收据（报告 + 来源附录全文回调用方；facts/sources 元数据进 details）
    const facts = Array.isArray(final.facts) ? final.facts : [];
    const sources = Array.isArray(final.sources) ? final.sources : [];
    const openCount = Array.isArray(final.open_questions) ? final.open_questions.length : 0;
    const fetched = sources.filter((s) => String(s?.content ?? "").trim().length > 0).length;
    const duration = Math.round(performance.now() - startedAt);
    finishLedger("pass", "", {
      facts: String(facts.length),
      open_questions: String(openCount),
      provider: providerInfo.effective,
      sources: String(sources.length),
      sources_fetched: String(fetched),
      reviewed: reviewDelivery.verdict === "fix" ? "fix-revised" : "pass",
    });
    return {
      verdict: "pass",
      text: `调研完成（${Math.round(duration / 100) / 10}s，provider=${providerInfo.effective}，${reviewDelivery.verdict === "fix" ? "三道工序含修订" : "初稿审查通过"}）：${facts.length} 条事实、${openCount} 条待核实余项${sources.length > 0 ? `，来源全文 ${fetched}/${sources.length} 份` : ""}`,
      report: String(final.report_markdown ?? ""),
      appendix: sources.length > 0 ? renderSourceAppendix(sources) : "",
      details: {
        facts: facts.length,
        open_questions: openCount,
        provider: providerInfo.effective,
        case_id: caseId,
        sources: sources.length,
        sources_fetched: fetched,
        reviewed: reviewDelivery.verdict === "fix" ? "fix-revised" : "pass",
      },
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    finishLedger("error", reason, {});
    throw e;
  }
}
