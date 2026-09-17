/** runner.ts —— research 子代理 runner（本包自有真源，自域仓旧基建 runner.ts 删除前全文 vendor）。
 *
 * 去旧基建化差异（唯一语义改）：
 * - RunnerTaskRequest.routes 可选，空时用默认路由 { provider: "", model: "" }（替代抛错）；
 * - makeDshDispatch 在 provider/model 为空时不发 agentOptions（走宿主默认模型）。
 * 其余五段语义与 vendor 前完全一致。
 *
 * 五段语义：
 * ① 合同：任务书 + outputSchema 预检——交付契约唯一落点；完整 schema 校验在 host 端，本段只拦形态；
 * ② spawn：ctx.subagents.start("spawn", {label, prompt:[{type:"text",text}], signal,
 *    agentOptions:{provider,model,reasoningEffort,maxTokens}, outputSchema, toolFilter})——
 *    provider id 经 normalizeProviderId 归一（PI 目录 id→DSH 裸名）；prompt 契约 = ContentBlock[]；
 * ③ validate：structured 缺失/形态不对 = 失败（object-rooted 最小子集门）；
 * ④ nudge：失败回喂一轮（仅主路由，上限 DEFAULT_NUDGE_LIMIT = 1）；
 * ⑤ fallback：nudge 耗尽后按 route 配置逐条 fallback 路由再 spawn 一轮；
 * ⑥ 收据：{ok,failed,output,structured,stopReason,failureDetail,route,attempts,nudges,durationMs}；
 * ⑦ 账本：经 runToLedger 回调注入（open/attempt/finish 三笔；fail-open 不阻主链）；
 * ⑧ 失败保全：全败时收据带 failed:true + 全量 attempts 原样返回，不抛不吞，不静默。
 *
 * 限流/熔断不进本层。per-run 上下文全部由参数注入（不读全局）；真实模型调用由 dispatch 注入点隔离（单测换 fake）。
 */

/** 路由规格（primary + fallbacks 取自 route 配置；thinkingLevel 缺省不传 = DSH 默认档）。 */
export type RouteSpec = { provider: string; model: string; thinkingLevel?: string };

/** 一次派发请求（dispatch 注入点入参；与金标件 DshDispatchRequest 同形，零业务名词）。 */
export type RunnerDispatchRequest = {
  label: string;
  /** 任务书全文（本层不二次加工；nudge 轮由 runner 组装回喂版） */
  task: string;
  /** 结构化交付 schema（object-rooted 子集；缺省 = 不做 structured 门） */
  outputSchema?: Record<string, unknown>;
  /** 子代理工具白名单（如 {allow:["read","glob","grep"]}；缺省不围栏） */
  toolFilter?: { allow: string[] };
  signal?: AbortSignal;
  provider: string;
  model: string;
  thinkingLevel?: string;
  maxTokens?: number;
  /** 宿主执行 exec.agent（透传 parent；无宿主会话时缺省） */
  agent?: unknown;
};

/** 一次派发结果（归一后形态；ok=false 不抛，由 runner 记账）。 */
export type RunnerDispatchResult = {
  ok: boolean;
  output: string;
  structured?: unknown;
  stopReason?: string;
  failureDetail?: string;
  usage?: Record<string, number>;
  durationMs?: number;
};

/** 派发注入点：单测换 fake；缺省实现 = makeDshDispatch（DSH spawn 接线）。 */
export type SubagentDispatch = (req: RunnerDispatchRequest) => Promise<RunnerDispatchResult>;

/** 一次尝试的收据行（全量留档：fresh/nudge、轮次、失败原因，保全审计用）。 */
export type RunnerAttempt = {
  route: RouteSpec;
  kind: "fresh" | "nudge";
  /** 本路由第几轮（1 起） */
  round: number;
  ok: boolean;
  stopReason: string;
  error: string;
  durationMs: number;
};

/** 账本回调记录（三笔，字段对齐 session-ledger openSession/finishSession 实参形状）。 */
export type RunnerLedgerRecord =
  | { kind: "open"; caseId: string; sessionPath: string; label: string; route: RouteSpec | null; at: string }
  | { kind: "attempt"; caseId: string; attempt: RunnerAttempt; at: string }
  | { kind: "finish"; caseId: string; ok: boolean; verdict: string; reason: string; artifacts: Record<string, string>; durationMs: number; at: string };

/** 账本注入点：返回值忽略；回调内部异常一律吞掉（fail-open，ledger 同款）。 */
export type RunToLedger = (record: RunnerLedgerRecord) => unknown;

/** runner 任务请求：per-run 上下文全参数注入，禁读全局。 */
export type RunnerTaskRequest = {
  task: string;
  outputSchema?: Record<string, unknown>;
  /** 路由配置：routes[0] = 主路由（fresh + nudge），其余 = fallback（各一轮）；缺省/空 = 宿主默认模型 */
  routes?: RouteSpec[];
  toolFilter?: { allow: string[] };
  maxTokens?: number;
  label?: string;
  caseId?: string;
  /** 看门狗：每轮派发限时（超时判卡死记失败，进 nudge/fallback）；未设 = 不限时。 */
  watchdogMs?: number;
  /** DSH 会话目录（回执/账本口径；缺省空串） */
  sessionPath?: string;
  signal?: AbortSignal;
  agent?: unknown;
  nudgeLimit?: number;
  dispatch?: SubagentDispatch;
  /** cordis 宿主上下文（subagents 服务注入面；缺省 dispatch 时与 dispatch 二者必居其一） */
  ctx?: unknown;
  runToLedger?: RunToLedger;
};

/** runner 收据（成功路由 + 全量尝试；失败带 failed 保全标记）。 */
export type RunnerReceipt = {
  ok: boolean;
  /** 失败保全标记：ok=false 时恒为 true，不静默吞 */
  failed: boolean;
  output: string;
  structured: unknown;
  stopReason: string;
  failureDetail: string;
  /** 成功路由（全败 = null） */
  route: RouteSpec | null;
  /** 本次配置的全部路由（回执可见 primary+fallbacks） */
  routes: RouteSpec[];
  attempts: RunnerAttempt[];
  nudges: number;
  durationMs: number;
  sessionPath: string;
};

/** 主路由 nudge 循环上限（A 段④；fallback 路由不再 nudge，一轮即收）。 */
export const DEFAULT_NUDGE_LIMIT = 1;

/**
 * PI 目录 provider id → DSH provider 裸名：
 * PI 目录 id 尾缀 -<数字> 是 PI 目录代次，DSH 侧裸名才是注册名；
 * 未知 id：先剥尾缀数字试一次，再原样透传（子代理 NO_ADAPTER 自然 fail-loud）。
 */
export function normalizeProviderId(raw: string): string {
  const id = String(raw ?? "").trim();
  if (!id) return id;
  const ALIAS: Record<string, string> = {
    "opencode-zen-1": "opencode",
    "opencode-go-1": "opencode-go",
    // PI 目录 id buzzai（settings.yaml DSH 裸名是 buzz，baseURL=buzzai.cc）——活体 e2e 实证。
    buzzai: "buzz",
  };
  if (ALIAS[id]) return ALIAS[id];
  const stripped = id.replace(/-\d+$/u, "");
  return stripped || id;
}

/** 路由清洗：provider/model 去空白，空项剔除（fallbacks 配置脏行不进派发）。 */
function normalizeRoute(raw: unknown): RouteSpec | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const provider = String(r.provider ?? "").trim();
  const model = String(r.model ?? "").trim();
  const thinkingLevel = String(r.thinkingLevel ?? "").trim();
  if (!provider || !model) return null;
  return thinkingLevel ? { provider, model, thinkingLevel } : { provider, model };
}

/** 子代理运行结果 → 派发结果归一（fromRun；structured 有值即成功态，否则看 stopReason/文本）。 */
function fromRun(result: unknown): RunnerDispatchResult {
  const run = (result ?? {}) as { stopReason?: unknown; structured?: unknown; output?: unknown; failureDetail?: unknown; usage?: unknown };
  const stopReason = String(run.stopReason ?? "");
  const structured = run.structured ?? null;
  const blocks = Array.isArray(run.output) ? (run.output as Array<Record<string, unknown>>) : [];
  const text = blocks
    .map((b) => (b?.type === "text" && typeof b?.text === "string" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
  if (structured && typeof structured === "object") {
    return {
      ok: true,
      output: JSON.stringify(structured),
      structured,
      stopReason: stopReason || "completed",
      failureDetail: "",
      usage: (run.usage ?? undefined) as Record<string, number> | undefined,
    };
  }
  if (stopReason === "completed" || stopReason === "") {
    return text.trim()
      ? {
          ok: true,
          output: text,
          structured: null,
          stopReason: stopReason || "completed",
          failureDetail: "",
          usage: (run.usage ?? undefined) as Record<string, number> | undefined,
        }
      : { ok: false, output: "", structured: null, stopReason: stopReason || "completed", failureDetail: "子代理完成但输出为空（structured 缺失且无文本）" };
  }
  return {
    ok: false,
    output: text,
    structured: null,
    stopReason,
    failureDetail: String(run.failureDetail ?? `子代理未完成（stopReason=${stopReason || "unknown"}）`).slice(0, 300),
    usage: (run.usage ?? undefined) as Record<string, number> | undefined,
  };
}

/**
 * 缺省派发实现：DSH spawn 接线。失败返回 {ok:false} 不抛；ctx.subagents.start 不可用返回 null。
 * provider/model 为空 = 走宿主默认模型：不发 agentOptions（host 按发起会话默认派单）。
 */
export function makeDshDispatch(ctx?: unknown, agent?: unknown): SubagentDispatch | null {
  const subagents = (ctx as { subagents?: { start?: unknown } } | undefined)?.subagents;
  if (!subagents || typeof subagents.start !== "function") return null;
  // DSH Service 方法依赖 this（providers 表），不得解引用后裸调——包闭包保绑定（金标件活体实证）。
  const start = ((kind: string, request: Record<string, unknown>) =>
    (subagents.start as (k: string, r: Record<string, unknown>) => Promise<{ result: Promise<unknown> }>).call(subagents, kind, request)) as (
    kind: string,
    request: Record<string, unknown>,
  ) => Promise<{ result: Promise<unknown> }>;
  return async (req: RunnerDispatchRequest): Promise<RunnerDispatchResult> => {
    const startedAt = performance.now();
    try {
      const provider = String(req.provider ?? "").trim();
      const model = String(req.model ?? "").trim();
      const hasRoute = Boolean(provider && model);
      const agentOptions: Record<string, unknown> | null = hasRoute
        ? {
            provider: normalizeProviderId(provider),
            model,
            ...(req.thinkingLevel ? { reasoningEffort: req.thinkingLevel } : {}),
            ...(req.maxTokens ? { maxTokens: req.maxTokens } : {}),
          }
        : null;
      const request: Record<string, unknown> = {
        label: req.label,
        // prompt 契约 = ContentBlock[]（SubagentStartRequest.prompt）；禁塞整条 Message（双层嵌套）。
        prompt: [{ type: "text", text: req.task }],
        // parent = 发起调用的宿主 Agent（工具 exec.agent 优先；缺位 = delegationDepthOf 读 parent.options 秒炸）。
        ...((agent ?? req.agent) ? { parent: agent ?? req.agent } : {}),
        signal: req.signal ?? new AbortController().signal,
        ...(agentOptions ? { agentOptions } : {}),
        ...(req.toolFilter ? { toolFilter: req.toolFilter } : {}),
        ...(req.outputSchema ? { outputSchema: req.outputSchema } : {}),
      };
      const run = await start("spawn", request);
      const result = await run.result;
      return { ...fromRun(result), durationMs: Math.round(performance.now() - startedAt) };
    } catch (err: unknown) {
      return {
        ok: false,
        output: "",
        structured: null,
        stopReason: "error",
        failureDetail: String((err as Error)?.message ?? err).slice(0, 300),
        durationMs: Math.round(performance.now() - startedAt),
      };
    }
  };
}

/** 限时竞速：超时判卡死返回，不把命赌在 abort 生效上（隔离基座活性合同）。 */
export async function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (!(ms > 0)) throw new Error(`${label}：预算耗尽（0ms），不开跑`);
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}：${Math.round(ms)}ms 未返回，判卡死`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 结构化交付形态门（段③ validate）的最小子集递归实现。 */
const MAX_SCHEMA_DEPTH = 8;

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** 单个 schema 节点校验：enum 白名单 → type 分派（object 递归 required/properties，array 递归 items）。 */
function walkSchema(schema: unknown, value: unknown, at: string, depth: number, errors: string[]): void {
  if (depth > MAX_SCHEMA_DEPTH) return; // 深层不展开（host 端兜底）
  if (!schema || typeof schema !== "object") return;
  const s = schema as Record<string, unknown>;
  if (Array.isArray(s.enum) && s.enum.length && !s.enum.some((e) => e === value)) {
    errors.push(`${at}: 值不在 enum 白名单（实收 ${describeValue(value)}）`);
    return;
  }
  const t = typeof s.type === "string" ? s.type : "";
  if (t === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${at}: 期望 object，实收 ${describeValue(value)}`);
      return;
    }
    const rec = value as Record<string, unknown>;
    const required = Array.isArray(s.required) ? s.required.map(String) : [];
    for (const key of required) {
      if (!(key in rec) || rec[key] === undefined) errors.push(`${at}.${key}: required 缺失`);
    }
    const props = s.properties && typeof s.properties === "object" && !Array.isArray(s.properties) ? (s.properties as Record<string, unknown>) : {};
    for (const [key, sub] of Object.entries(props)) {
      if (key in rec && rec[key] !== undefined) walkSchema(sub, rec[key], `${at}.${key}`, depth + 1, errors);
    }
    return;
  }
  if (t === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${at}: 期望 array，实收 ${describeValue(value)}`);
      return;
    }
    const items = s.items && typeof s.items === "object" && !Array.isArray(s.items) ? (s.items as Record<string, unknown>) : null;
    if (items) value.forEach((item, i) => walkSchema(items, item, `${at}[${i}]`, depth + 1, errors));
    return;
  }
  if (t === "string") {
    if (typeof value !== "string") errors.push(`${at}: 期望 string，实收 ${describeValue(value)}`);
    return;
  }
  if (t === "number" || t === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${at}: 期望 number，实收 ${describeValue(value)}`);
    return;
  }
  if (t === "boolean") {
    if (typeof value !== "boolean") errors.push(`${at}: 期望 boolean，实收 ${describeValue(value)}`);
    return;
  }
  // 无 type 声明的节点：不校验（形态门只拦明确不符，完整解释器归 host）
}

/** 段③ validate 的对外入口：structured 缺失/形态不对 = 失败（errors 非空即拒）。 */
export function validateStructured(schema: Record<string, unknown>, value: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  walkSchema(schema, value, "structured", 0, errors);
  return { ok: errors.length === 0, errors };
}

/** 段④ nudge 回喂任务书：原任务全文 + 上轮失败原因 + 重交指令（不缩水、不换题）。 */
export function nudgeTask(task: string, reason: string, nth: number): string {
  return `${task}\n\n---\n\n## 上一次交付未被验收（第 ${nth} 次续推）\n失败原因：${reason.slice(0, 600)}\n\n请基于上方原任务书重新完整交付：交付结构仍按原 outputSchema，必填字段一个不少，case_id 原样回填；只修不合格之处，不复述失败过程。收到本条即为「重交」指令。`;
}

/**
 * 子代理 runner（五段语义主体）：
 * 主路由 fresh + ≤nudgeLimit 轮 nudge → fallback 路由各一轮 → 收据（成功/全败保全）。
 * 空路由 = 宿主默认模型（默认路由 { provider: "", model: "" }，派发时不带 agentOptions）。
 * 结构性预检失败（空任务书/schema 形态/无派发通道）直接抛——配置错误不进重试语义。
 */
export async function runSubagentTask(req: RunnerTaskRequest): Promise<RunnerReceipt> {
  const startedAt = performance.now();
  // —— 段① 合同：任务书 + outputSchema 预检（唯一落点，host 校验；本段只拦形态）——
  const task = String(req.task ?? "");
  if (!task.trim()) throw new Error("runner 合同段预检失败：任务书为空");
  const schema = req.outputSchema;
  if (
    schema !== undefined &&
    (schema === null || typeof schema !== "object" || Array.isArray(schema) || (schema as Record<string, unknown>).type !== "object")
  ) {
    throw new Error('runner 合同段预检失败：outputSchema 必须是 object-rooted JSON Schema（type:"object"）');
  }
  let routes = (Array.isArray(req.routes) ? req.routes : []).map(normalizeRoute).filter((r): r is RouteSpec => r !== null);
  if (!routes.length) routes = [{ provider: "", model: "" }];
  const dispatch = req.dispatch ?? makeDshDispatch(req.ctx, req.agent);
  if (!dispatch) throw new Error("runner 无派发通道：既未注入 dispatch，ctx.subagents.start 也不可用（dsh-subagent / dsh-subagent-spawn-in-process 未挂载）");
  const nudgeLimit = Math.max(0, Math.floor(Number(req.nudgeLimit ?? DEFAULT_NUDGE_LIMIT)));
  const label = String(req.label ?? "").trim() || `research:${routes[0].model || "default"}`;
  const caseId = String(req.caseId ?? "").trim();
  const sessionPath = String(req.sessionPath ?? "");
  // —— 段⑦ 账本：回调 fail-open（回调炸不阻主链，ledger 同款原则）——
  const emit = (record: RunnerLedgerRecord): void => {
    try {
      req.runToLedger?.(record);
    } catch {
      /* 账本永不阻断主链 */
    }
  };
  emit({ kind: "open", caseId, sessionPath, label, route: routes[0], at: new Date().toISOString() });

  const attempts: RunnerAttempt[] = [];
  const failures: string[] = [];
  let winner: RouteSpec | null = null;
  let winOutput = "";
  let winStructured: unknown = null;
  let winStop = "";
  let nudges = 0;
  let lastOutput = "";
  let lastStop = "";

  outer: for (let ri = 0; ri < routes.length; ri++) {
    const route = routes[ri];
    // 段②③④⑤：主路由 fresh + nudge 循环；fallback 路由一轮即收（nudges 只记主路由）。
    const rounds = ri === 0 ? 1 + nudgeLimit : 1;
    let lastRouteError = "";
    for (let round = 1; round <= rounds; round++) {
      if (req.signal?.aborted) break outer;
      const kind: RunnerAttempt["kind"] = round === 1 ? "fresh" : "nudge";
      if (kind === "nudge" && nudges < nudgeLimit) nudges++;
      // 段④ nudge 回喂：原任务 + 失败原因 + 「重交」。
      const roundTask = kind === "fresh" ? task : nudgeTask(task, lastRouteError || "上轮失败（无失败详情）", round - 1);
      const attemptAt = performance.now();
      const dispatchPromise = dispatch({
        label: round === 1 ? label : `${label}:nudge${round - 1}`,
        task: roundTask,
        outputSchema: schema,
        toolFilter: req.toolFilter,
        signal: req.signal,
        provider: route.provider,
        model: route.model,
        thinkingLevel: route.thinkingLevel,
        maxTokens: req.maxTokens,
        agent: req.agent,
      });
      // 看门狗：watchdogMs 未设 = 不限时；超时判卡死 → 本轮记失败，进 nudge/fallback（失败保全）。
      let r: RunnerDispatchResult;
      try {
        r = await (req.watchdogMs ? withDeadline(dispatchPromise, req.watchdogMs, `${label}#${route.model || "default"}`) : dispatchPromise);
      } catch (err: unknown) {
        const msg = String((err as Error)?.message ?? err).slice(0, 300);
        const attempt: RunnerAttempt = {
          route,
          kind,
          round,
          ok: false,
          stopReason: "error",
          error: msg,
          durationMs: Math.max(0, Math.round(performance.now() - attemptAt)),
        };
        attempts.push(attempt);
        emit({ kind: "attempt", caseId, attempt, at: new Date().toISOString() });
        failures.push(`${route.provider || "default"}/${route.model || "default"}#${round}(${kind}): ${msg}`);
        lastRouteError = msg;
        continue;
      }
      lastOutput = r.output;
      lastStop = String(r.stopReason ?? "");
      // —— 段③ validate：structured 缺失/形态不对 = 失败 ——
      const gate = schema ? validateStructured(schema, r.structured) : { ok: true, errors: [] as string[] };
      const ok = r.ok === true && gate.ok;
      const error = !ok ? (r.ok === false ? String(r.failureDetail || "spawn 失败（无失败详情）") : gate.errors.join("；") || "structured 形态不符") : "";
      const attempt: RunnerAttempt = { route, kind, round, ok, stopReason: lastStop, error, durationMs: Math.max(0, Math.round(r.durationMs ?? 0)) };
      attempts.push(attempt);
      emit({ kind: "attempt", caseId, attempt, at: new Date().toISOString() });
      if (ok) {
        winner = route;
        winOutput = r.output;
        winStructured = r.structured;
        winStop = lastStop;
        break outer;
      }
      failures.push(`${route.provider || "default"}/${route.model || "default"}#${round}(${kind}): ${error}`);
      lastRouteError = error;
    }
  }

  const durationMs = Math.round(performance.now() - startedAt);
  if (!winner) {
    // —— 段⑧ 失败保全：失败收据原样返回（failed 标记 + 全量 attempts），不抛不吞 ——
    const reason = `全部路由失败（${routes.length} 路由）：${failures.join(" | ")}`.slice(0, 2000);
    emit({ kind: "finish", caseId, ok: false, verdict: "error", reason, artifacts: {}, durationMs, at: new Date().toISOString() });
    return {
      ok: false,
      failed: true,
      output: lastOutput,
      structured: null,
      stopReason: lastStop,
      failureDetail: reason,
      route: null,
      routes,
      attempts,
      nudges,
      durationMs,
      sessionPath,
    };
  }
  emit({ kind: "finish", caseId, ok: true, verdict: "pass", reason: "", artifacts: {}, durationMs, at: new Date().toISOString() });
  return {
    ok: true,
    failed: false,
    output: winOutput,
    structured: winStructured,
    stopReason: winStop,
    failureDetail: "",
    route: winner,
    routes,
    attempts,
    nudges,
    durationMs,
    sessionPath,
  };
}
