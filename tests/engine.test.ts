/** engine.test.ts —— research 编排 v3.1（纯通用）：fake dispatch 全链（主题/来源核查/拉取门/账本/单路由口径）。
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
  "研究线一（可口可乐财报）：FY2025 营收 470 亿美元 [SRC-1]；研究线二（百事财报）：FY2025 营收 920 亿美元〔单一来源〕 [SRC-2]。",
  "## 矛盾与缺口",
  "第三方研报全文未见公开版，缺口如实留待办。",
  "## 方法与局限说明",
  "检索预算限八次，数据以两家公司官网财报页为准。",
  "## 待核实余项",
  "- 第三方研报全文",
  "## 来源清单",
  "- [SRC-1] KO FY2025 Annual Report — https://investor.example.com/ko-2025（2026-02-15，investor.example.com）〔可靠性：官方一手〕",
  "- [SRC-2] PE FY2025 10-K — https://investor.example.com/pe-2025（2026-02-10，investor.example.com）〔可靠性：权威媒体〕",
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
      reliability: "官方一手",
      corroboration: ["SRC-2"],
    },
    {
      assertion: "百事 2025 财年营收 920 亿美元",
      url: "https://investor.example.com/pe-2025",
      date: "2026-02-10",
      domain: "investor.example.com",
      reliability: "权威媒体",
    },
  ],
  open_questions: ["第三方研报全文未见公开版"],
};

const FETCH_DELIVERY: ResearchDelivery = {
  ...DELIVERY,
  sources: [
    {
      src: "SRC-1",
      title: "KO FY2025 Annual Report",
      url: "https://investor.example.com/ko-2025",
      date: "2026-02-15",
      domain: "investor.example.com",
      reliability: "官方一手",
      content: "年报正文：FY2025 营收 470 亿美元，同比 +3%。（足够长以过拉取判定）".repeat(4),
    },
    {
      src: "SRC-2",
      title: "PE FY2025 10-K",
      url: "https://investor.example.com/pe-2025",
      date: "2026-02-10",
      domain: "investor.example.com",
      reliability: "权威媒体",
    },
  ],
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

const okStep = (delivery: ResearchDelivery = DELIVERY) => ({ ok: true, output: "ok", structured: delivery, stopReason: "completed" }) as RunnerDispatchResult;

test("research 快乐链（纯通用）：主题 → 单路由派单 → 内容门 → 收据回报告全文（默认不带附录）", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const ledger: RunnerLedgerRecord[] = [];
    const req: ResearchRequest = { topic: "2025 财年可口可乐与百事的财报对比" };
    const out = await runResearch(req, deps(ws, fakeDispatch([() => okStep()], calls), ledger, seam([["exa", true]])));
    assert.equal(out.verdict, "pass");
    assert.ok(out.report.startsWith("# 调研报告"), "报告全文随收据回调用方");
    assert.equal(out.appendix, "", "默认不拉来源，无附录");
    assert.match(out.text, /2 条事实/);
    assert.match(out.text, /provider=exa/u);
    assert.ok(!("path" in out.details), "零宿主概念：收据无落档路径");
    // 任务书：四段流程 + 来源核查默认内建 + provider 行 + 主题 + 守则
    assert.equal(calls.length, 1, "单路由：一次派单");
    const task = calls[0].task;
    assert.ok(task.includes("研究流程（四段"));
    assert.ok(task.includes("你是调研员（Researcher）"), "身份是调研员不是写手");
    assert.ok(task.includes("来源核查（本职"), "来源核查默认内建，不占参数面");
    assert.ok(task.includes("单一来源"));
    assert.ok(task.includes("可靠性"));
    assert.ok(task.includes("独立性"));
    assert.ok(task.includes("有用性"));
    assert.ok(task.includes("多方比对") || task.includes("并列呈现"), "跨来源比对在流程里");
    assert.ok(task.includes("provider=exa"));
    assert.ok(task.includes("不落盘"));
    assert.ok(task.includes("2025 财年可口可乐与百事的财报对比"));
    assert.ok(task.includes("禁止凭记忆编造"));
    assert.ok(!task.includes("已知待查清单"), "无 strands 不出该节");
    assert.ok(!task.includes("来源拉取（本单要求"), "默认不拉来源，任务书无拉取段");
    // 账本：open/attempt/finish 三笔 + 信封目录落点
    assert.ok(ledger.some((r) => r.kind === "open"));
    assert.ok(ledger.some((r) => r.kind === "attempt" && r.attempt.kind === "fresh" && r.attempt.ok));
    assert.ok(ledger.some((r) => r.kind === "finish" && r.ok));
    assert.ok(existsSync(join(ws, ".runtime", "sessions", "researcher", "research")));
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research fetch_sources=true：任务书带来源拉取交付段；交付含 sources → pass 带附录与元数据", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const out = await runResearch(
      { topic: "可乐财报", fetchSources: true },
      deps(ws, fakeDispatch([() => okStep(FETCH_DELIVERY)], calls), undefined, seam([["exa", true]])),
    );
    assert.equal(out.verdict, "pass");
    const task = calls[0].task;
    assert.ok(task.includes("来源拉取（本单要求，必须执行）"), "拉取段进任务书");
    assert.ok(task.includes('"content":"<页面正文 markdown'));
    // 附录：报告之外独立文本块，带成功/失败标注
    assert.ok(out.appendix.includes("## 附：来源全文"));
    assert.ok(out.appendix.includes("### [SRC-1] KO FY2025 Annual Report"));
    assert.ok(out.appendix.includes("（拉取失败，无全文）"), "content 缺席的来源如实标注");
    assert.ok(out.appendix.includes("（拉取成功 1/2 份）"));
    assert.match(out.text, /来源全文 1\/2 份/u);
    assert.equal(out.details.sources, 2);
    assert.equal(out.details.sources_fetched, 1);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research fetch_sources=true 但交付无 sources[] → 拉取门拦截（error，不放宽）", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const out = await runResearch(
      { topic: "可乐财报", fetchSources: true },
      deps(ws, async () => okStep(), undefined, seam([["exa", true]])),
    );
    assert.equal(out.verdict, "error");
    assert.match(out.text, /fetch_sources=true 但交付未附 sources/u);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research：库级可选 strands（调用方自带已知条目）进任务书；工具面不暴露该参数", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const out = await runResearch(
      { topic: "主题甲", strands: ["待查事项乙"] },
      deps(ws, fakeDispatch([() => okStep()], calls), undefined, seam([["exa", true]])),
    );
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
    const out = await runResearch({ topic: "t" }, deps(ws, fakeDispatch([() => okStep()], calls), undefined, seam([])));
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

test("research：调研员全轮失败（fresh+nudge 仍 structured 缺失）→ 收据 error 全量保全，无 fallback 第三轮", async () => {
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
    const out = await runResearch({ topic: "t" }, deps(ws, fakeDispatch([() => bad, () => okStep()], calls), ledger, seam([["exa", true]])));
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
      deps(ws, async () => okStep(thinDelivery), undefined, seam([["exa", true]])),
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

test("buildResearchTask：四段流程与来源核查内建；strands 并入；fetchSources 开关增删拉取段", () => {
  const task = buildResearchTask({ caseId: "research-x", topic: "主题甲", strands: ["待查事项乙"], providerId: "exa", fetchSources: false });
  assert.ok(task.includes("你是调研员（Researcher）"));
  assert.ok(task.includes("case_id: research-x"));
  assert.ok(task.includes("provider=exa"));
  assert.ok(task.includes("已知待查清单"));
  assert.ok(task.includes("1. 待查事项乙"));
  assert.ok(task.includes("来源核查（本职"));
  assert.ok(task.includes("〔单一来源〕"));
  assert.ok(task.includes('"report_markdown":"<完整报告全文>"'));
  assert.ok(task.includes("[SRC-1]"));
  assert.ok(!task.includes("来源拉取（本单要求"), "false 不出拉取段");
  // fetchSources=true：拉取段 + 交付示例带 sources
  const fetchTask = buildResearchTask({ caseId: "r", topic: "t", providerId: "exa", fetchSources: true });
  assert.ok(fetchTask.includes("来源拉取（本单要求，必须执行）"));
  assert.ok(fetchTask.includes('"sources":['));
  const bare = buildResearchTask({ caseId: "r", topic: "t", providerId: "exa", fetchSources: false });
  assert.ok(!bare.includes("已知待查清单"));
});
