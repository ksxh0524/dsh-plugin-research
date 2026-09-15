/** engine.test.ts —— research 编排 v3（纯通用）：fake dispatch 全链（主题/报告门/账本/单路由口径）。
 *
 * dispatch 注入点隔离（不烧钱、不真派）；runner 五段照跑（合同段预检 + validate + nudge 真语义）。
 * 路由固定走工作区路由表 fixture（.pi/model-router.json content-writer.researcher 键，
 * fallbacks 混入脏行以证「明确不消费」）；web seam 换 fake seam 验 provider 识别各分支。
 * 宿主概念（project/留档/证据行）已摘除——主题进、报告出，零文件 IO。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runResearch, resolvePrimaryRoute, buildResearchTask, type ResearchDeps, type ResearchRequest } from "../src/engine.ts";
import type { ResearchDelivery } from "../src/contract.ts";
import type { RunnerDispatchRequest, RunnerDispatchResult, RunnerLedgerRecord } from "aivideo-core/src/subagent/runner.ts";
import type { WebSeam } from "../src/web.ts";

const OK_REPORT = [
  "# 调研报告 — 可乐双雄 2025 财年（2026-09-15）",
  "## 摘要",
  "两条研究线均有着落：营收口径、财报发布时点均已确认，置信度高。",
  "## 正文",
  "研究线一（可口可乐财报）：FY2025 营收 470 亿美元 [SRC-1]；研究线二（百事财报）：FY2025 营收 920 亿美元 [SRC-2]。",
  "## 矛盾与缺口",
  "第三方研报全文未见公开版，缺口如实留待办。",
  "## 方法与局限说明",
  "检索预算限八次，数据以两家公司官网财报页为准。",
  "## 待核实余项",
  "- 第三方研报全文",
  "## 来源清单",
  "- [SRC-1] KO FY2025 Annual Report — https://investor.example.com/ko-2025（2026-02-15，investor.example.com）",
  "- [SRC-2] PE FY2025 10-K — https://investor.example.com/pe-2025（2026-02-10，investor.example.com）",
].join("\n");

const DELIVERY: ResearchDelivery = {
  case_id: "c",
  status: "completed",
  report_markdown: OK_REPORT,
  facts: [
    {
      assertion: "可口可乐 2025 财年营收 470 亿美元",
      url: "https://investor.example.com/ko-2025",
      date: "2026-02-15",
      domain: "investor.example.com",
      title: "KO FY2025",
    },
    { assertion: "百事 2025 财年营收 920 亿美元", url: "https://investor.example.com/pe-2025", date: "2026-02-10", domain: "investor.example.com" },
  ],
  open_questions: ["第三方研报全文未见公开版"],
};

function makeWs(): string {
  return mkdtempSync(join(tmpdir(), "dsh-research-"));
}

/** 工作区路由表 fixture（单主路由 + 脏 fallback 行，证「明确不消费」）。 */
function seedRoutes(ws: string): void {
  mkdirSync(join(ws, ".pi"), { recursive: true });
  writeFileSync(
    join(ws, ".pi", "model-router.json"),
    JSON.stringify({
      routes: {
        "content-writer.researcher": {
          primary: "buzzai/qwen3.8-flash-free",
          fallbacks: [{ model: "opencode-zen-1/muse-spark-1.3-contributor-free", thinking_level: "medium" }],
          thinking: "xhigh",
        },
      },
    }),
  );
}

/** web seam fake：给一组 provider（id + available）。 */
function seam(entries: Array<[string, boolean]>, configured?: string): WebSeam {
  return {
    searchProviders: new Map(entries.map(([id, ok]) => [id, { id, available: () => ok }])),
    searchProviderId: configured,
  };
}

/** fake dispatch：记录请求；按脚本逐轮回据。 */
function fakeDispatch(
  script: Array<(req: RunnerDispatchRequest) => RunnerDispatchResult>,
  calls: RunnerDispatchRequest[],
): (req: RunnerDispatchRequest) => Promise<RunnerDispatchResult> {
  let i = 0;
  return async (req) => {
    calls.push(req);
    const step = script[Math.min(i, script.length - 1)];
    i += 1;
    return step(req);
  };
}

function deps(
  ws: string,
  dispatch: (req: RunnerDispatchRequest) => Promise<RunnerDispatchResult>,
  ledger: RunnerLedgerRecord[] = [],
  web?: WebSeam,
): ResearchDeps {
  return { ws, dispatch, web, say: undefined, runToLedger: (r) => void ledger.push(r) };
}

const okStep = () => ({ ok: true, output: "ok", structured: DELIVERY, stopReason: "completed" }) as RunnerDispatchResult;

test("research 快乐链（纯通用）：主题 → 单路由派单 → 内容门 → 收据回报告全文", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const ledger: RunnerLedgerRecord[] = [];
    const req: ResearchRequest = { topic: "2025 财年可口可乐与百事的财报对比" };
    const out = await runResearch(req, deps(ws, fakeDispatch([okStep], calls), ledger, seam([["exa", true]])));
    assert.equal(out.verdict, "pass");
    assert.ok(out.report.startsWith("# 调研报告"), "报告全文随收据回调用方");
    assert.match(out.text, /2 条事实/);
    assert.match(out.text, /provider=exa/u);
    assert.ok(!("path" in out.details), "零宿主概念：收据无落档路径");
    // 任务书：四段流程 + provider 行 + 主题 + 守则
    assert.equal(calls.length, 1, "单路由：一次派单");
    const task = calls[0].task;
    assert.ok(task.includes("研究流程（四段"));
    assert.ok(task.includes("provider=exa"));
    assert.ok(task.includes("不落盘"), "写手不落盘约定在任务书");
    assert.ok(task.includes("2025 财年可口可乐与百事的财报对比"));
    assert.ok(task.includes("禁止凭记忆编造"));
    assert.ok(!task.includes("已知待查清单"), "无 strands 不出该节");
    // 账本：open/attempt/finish 三笔 + 信封目录落点
    assert.ok(ledger.some((r) => r.kind === "open"));
    assert.ok(ledger.some((r) => r.kind === "attempt" && r.attempt.kind === "fresh" && r.attempt.ok));
    assert.ok(ledger.some((r) => r.kind === "finish" && r.ok));
    assert.ok(existsSync(join(ws, ".runtime", "sessions", "researcher", "research")));
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research：库级可选 strands（调用方自带已知条目）进任务书；工具面不暴露该参数", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const out = await runResearch({ topic: "主题甲", strands: ["待查事项乙"] }, deps(ws, fakeDispatch([okStep], calls), undefined, seam([["exa", true]])));
    assert.equal(out.verdict, "pass");
    const task = calls[0].task;
    assert.ok(task.includes("已知待查清单"));
    assert.ok(task.includes("1. 待查事项乙"));
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research：直连 engine 且 topic 为空 → fail-loud 不空跑（schema 层 required 已拦工具面）", async () => {
  const ws = makeWs();
  try {
    await assert.rejects(
      () =>
        runResearch(
          { topic: "" },
          deps(ws, async () => ({ ok: false, output: "" })),
        ),
      /调研主题为空/u,
    );
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research：web seam 无可用 provider → 收据 error 不派单（不烧路由轮次）", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const out = await runResearch({ topic: "t" }, deps(ws, fakeDispatch([okStep], calls), undefined, seam([])));
    assert.equal(out.verdict, "error");
    assert.match(out.text, /provider 不可用/u);
    assert.equal(calls.length, 0, "提前拒，未派单");
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research：多 provider 可用且未显式配置 → 收据 error（不代选，如实上报 AMBIGUOUS 语义）", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const out = await runResearch(
      { topic: "t" },
      deps(
        ws,
        async () => ({ ok: false, output: "" }),
        undefined,
        seam([
          ["exa", true],
          ["deepseek", true],
        ]),
      ),
    );
    assert.equal(out.verdict, "error");
    assert.match(out.text, /多个可用搜索 provider/u);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research：配置 provider 落空（未注册/不可用）→ 收据 error 点名，不回落单可用", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const miss = await runResearch(
      { topic: "t" },
      deps(ws, async () => ({ ok: false, output: "" }), undefined, seam([["exa", true]], "deepseek")),
    );
    assert.equal(miss.verdict, "error");
    assert.match(miss.text, /「deepseek」未注册或不可用/u);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research：写手全轮失败（fresh+nudge 仍 structured 缺失）→ 收据 error 全量保全，无 fallback 第三轮", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const bad = { ok: true, output: "无结构化交付", structured: null, stopReason: "completed" } as RunnerDispatchResult;
    const out = await runResearch({ topic: "t" }, deps(ws, fakeDispatch([() => bad, () => bad], calls), undefined, seam([["exa", true]])));
    assert.equal(out.verdict, "error");
    assert.match(out.text, /调研派单失败/);
    assert.equal(calls.length, 2, "fresh + nudge 各一轮（单路由口径，routes 长度 1）");
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research：nudge 一轮翻盘 → pass 且 attempts 记 fresh/nudge", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const ledger: RunnerLedgerRecord[] = [];
    const bad = { ok: true, output: "无结构化交付", structured: null, stopReason: "completed" } as RunnerDispatchResult;
    const out = await runResearch({ topic: "t" }, deps(ws, fakeDispatch([() => bad, okStep], calls), ledger, seam([["exa", true]])));
    assert.equal(out.verdict, "pass");
    assert.equal(calls.length, 2);
    const attempts = ledger.filter((r) => r.kind === "attempt").map((r) => (r as { attempt: { kind: string } }).attempt.kind);
    assert.deepEqual(attempts, ["fresh", "nudge"]);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research：内容门拦短报告交付 → 收据 error", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const thinDelivery = { ...DELIVERY, report_markdown: "太短" } as ResearchDelivery;
    const out = await runResearch(
      { topic: "t", caseId: "research-thin" },
      deps(
        ws,
        async () => ({ ok: true, output: "ok", structured: thinDelivery, stopReason: "completed" }) as RunnerDispatchResult,
        undefined,
        seam([["exa", true]]),
      ),
    );
    assert.equal(out.verdict, "error");
    assert.match(out.text, /交付内容门未过.*实质不足/u);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("resolvePrimaryRoute：config.routes 显式第一优先（多给忽略）；工作区路由表键次之（fallbacks 不消费）；皆无 fail-loud", () => {
  const ws = makeWs();
  try {
    const explicit = resolvePrimaryRoute(ws, {
      routes: [
        { provider: "p1", model: "m1" },
        { provider: "p2", model: "m2" },
      ],
    });
    assert.deepEqual(explicit, { provider: "p1", model: "m1" });
    seedRoutes(ws);
    assert.deepEqual(resolvePrimaryRoute(ws, {}), { provider: "buzzai", model: "qwen3.8-flash-free", thinkingLevel: "xhigh" });
    assert.throws(() => resolvePrimaryRoute(join(tmpdir(), "dsh-research-empty-zz"), {}), /路由缺位/);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("buildResearchTask：四段流程与报告格式内建；strands 并入研究线；provider 行在", () => {
  const task = buildResearchTask({ caseId: "research-x", topic: "主题甲", strands: ["待查事项乙"], providerId: "exa" });
  assert.ok(task.includes("你是调研写手（researcher）"));
  assert.ok(task.includes("case_id: research-x"));
  assert.ok(task.includes("provider=exa"));
  assert.ok(task.includes("已知待查清单"));
  assert.ok(task.includes("1. 待查事项乙"));
  assert.ok(task.includes('"report_markdown":"<完整报告全文>"'));
  assert.ok(task.includes("[SRC-1]"));
  // 无 strands 时不出该节
  const bare = buildResearchTask({ caseId: "r", topic: "t", providerId: "exa" });
  assert.ok(!bare.includes("已知待查清单"));
});
