/** engine.test.ts —— research 编排 v4（纯通用）：fake dispatch 全链（三道隔离工序 + 代码门控 + 账本/单路由口径）。
 *
 * dispatch 注入点隔离（不烧钱、不真派）；runner 五段照跑（合同段预检 + validate + nudge 真语义）。
 * 工序链：初稿（调研员）→ 引擎门 → 审查（审查员 issue 清单）→ 一致性门 →（fix? 修订轮）→ 终稿门。
 * 路由固定走工作区路由表 fixture（.av/model-router.json content-writer.researcher 键——工作区路由表锚 2026-09-15 晚随 aivideo-core 迁 .pi→.av，
 * fallbacks 混入脏行以证「明确不消费」）；web seam 换 fake seam 验 provider 识别各分支。
 * 宿主概念（project/留档/证据行）已摘除——主题进、报告出，零文件 IO。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runResearch, resolvePrimaryRoute, buildResearchTask, buildReviewTask, buildFixTask, type ResearchDeps, type ResearchRequest } from "../src/engine.ts";
import { DELIVERY, OK_REPORT, REVIEW_FIX, REVIEW_FIX_NO_ISSUES, REVIEW_PASS, REVIEW_PASS_WITH_ISSUES, REVIEW_ISSUES, SOURCES } from "./fixtures.ts";
import type { ResearchDelivery, ReviewDelivery, ReviewIssue } from "../src/contract.ts";
import type { RunnerDispatchRequest, RunnerDispatchResult, RunnerLedgerRecord } from "aivideo-core/src/subagent/runner.ts";
import type { WebSeam } from "../src/web.ts";

function makeWs(): string {
  return mkdtempSync(join(tmpdir(), "dsh-research-"));
}

/** 工作区路由表 fixture（单主路由 + 脏 fallback 行，证「明确不消费」）。 */
function seedRoutes(ws: string): void {
  mkdirSync(join(ws, ".av"), { recursive: true });
  writeFileSync(
    join(ws, ".av", "model-router.json"),
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

/** fake dispatch：记录请求；按脚本逐轮回据（索引跨工序累计，末位保持最后一步）。 */
function fakeDispatch(
  script: Array<() => RunnerDispatchResult>,
  calls: RunnerDispatchRequest[],
): (req: RunnerDispatchRequest) => Promise<RunnerDispatchResult> {
  let i = 0;
  return async (req) => {
    calls.push(req);
    const step = script[Math.min(i, script.length - 1)];
    i += 1;
    return step();
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
const reviewStep = (review: ReviewDelivery) => ({ ok: true, output: "ok", structured: review, stopReason: "completed" }) as RunnerDispatchResult;

const draftTaskOf = (calls: RunnerDispatchRequest[]): string => calls[0].task;
const reviewTaskOf = (calls: RunnerDispatchRequest[]): string => calls[1].task;

test("research 快乐链（审查 pass）：初稿 → 审查放行 → 收据（终稿过代码门，零修订轮）", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const ledger: RunnerLedgerRecord[] = [];
    const req: ResearchRequest = { topic: "2025 财年可口可乐与百事的财报对比" };
    const out = await runResearch(req, deps(ws, fakeDispatch([() => okStep(), () => reviewStep(REVIEW_PASS)], calls), ledger, seam([["exa", true]])));
    assert.equal(out.verdict, "pass");
    assert.ok(out.report.startsWith("# 调研报告"), "终稿报告随收据回调用方");
    assert.equal(out.appendix, "", "默认不拉来源，无附录");
    assert.match(out.text, /初稿审查通过/);
    assert.match(out.text, /2 条事实/);
    assert.match(out.text, /provider=exa/u);
    assert.equal(out.details.reviewed, "pass");
    assert.ok(!("path" in out.details), "零宿主概念：收据无落档路径");
    // 工序任务书：调研员（自判详略+交叉比对+打标）与审查员（亲核+issue 三段式+不重写主体）
    assert.equal(calls.length, 2, "审查 pass = 两道隔离工序");
    const draftTask = draftTaskOf(calls);
    assert.ok(draftTask.includes("你是调研员（Researcher）"), "身份是调研员不是写手");
    assert.ok(draftTask.includes("自判"), "主题详略自判进任务书");
    assert.ok(draftTask.includes("逐源交叉比对"));
    assert.ok(draftTask.includes("〔单一来源〕"));
    assert.ok(draftTask.includes("corroboration"));
    assert.ok(draftTask.includes("provider=exa"));
    assert.ok(draftTask.includes("不落盘"));
    assert.ok(draftTask.includes("2025 财年可口可乐与百事的财报对比"));
    assert.ok(draftTask.includes("禁止凭记忆编造"));
    assert.ok(!draftTask.includes("已知待查清单"), "无 strands 不出该节");
    const reviewTask = reviewTaskOf(calls);
    assert.ok(reviewTask.includes("你是审查员（Reviewer）"));
    assert.ok(reviewTask.includes("复核维度（逐条过，不得抽查豁免）"));
    assert.ok(reviewTask.includes("fix_hint"));
    assert.ok(reviewTask.includes("不重写报告主体"));
    assert.ok(reviewTask.includes("```markdown"), "审查任务书嵌冻结初稿");
    // 账本：open/attempt×2/finish + 信封目录落点
    assert.ok(ledger.some((r) => r.kind === "open"));
    assert.ok(ledger.some((r) => r.kind === "attempt" && r.attempt.kind === "fresh" && r.attempt.ok));
    assert.ok(ledger.some((r) => r.kind === "finish" && r.ok));
    assert.ok(existsSync(join(ws, ".runtime", "sessions", "researcher", "research")));
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research fix 链：审查退回 → 修订轮 → 终稿（三道工序，issue 清单进修订任务书）", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const out = await runResearch(
      { topic: "可乐财报" },
      deps(ws, fakeDispatch([() => okStep(), () => reviewStep(REVIEW_FIX), () => okStep()], calls), undefined, seam([["exa", true]])),
    );
    assert.equal(out.verdict, "pass");
    assert.equal(calls.length, 3, "初稿/审查/修订三道工序");
    const fixTask = calls[2].task;
    assert.ok(fixTask.includes("你是调研员（Researcher，修订轮）"));
    assert.ok(fixTask.includes("issue 清单（必须逐条有着落）"));
    assert.ok(fixTask.includes("佐证不足"), "审查 issue 进修订任务书");
    assert.ok(fixTask.includes("补查 PE 官网 10-K"), "fix_hint 进修订任务书");
    assert.match(out.text, /三道工序含修订/u);
    assert.equal(out.details.reviewed, "fix-revised");
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research 审查结论一致性门：fix 却无 issues → 拒；pass 却带 issues → 拒（都不派修订轮）", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const noIssues = await runResearch(
      { topic: "t" },
      deps(ws, fakeDispatch([() => okStep(), () => reviewStep(REVIEW_FIX_NO_ISSUES), () => okStep()], calls), undefined, seam([["exa", true]])),
    );
    assert.equal(noIssues.verdict, "error");
    assert.match(noIssues.text, /判 fix 却未给 issue 清单/u);
    assert.equal(calls.length, 2, "一致性门先拦，修订轮未派");
    const withIssues = await runResearch(
      { topic: "t" },
      deps(ws, fakeDispatch([() => okStep(), () => reviewStep(REVIEW_PASS_WITH_ISSUES), () => okStep()], calls), undefined, seam([["exa", true]])),
    );
    assert.equal(withIssues.verdict, "error");
    assert.match(withIssues.text, /判 pass 却附带 issue 清单/u);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research 修订轮失败（审查退回后 structured 缺失）→ error，不给未修订报告", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const bad = { ok: true, output: "无结构化交付", structured: null, stopReason: "completed" } as RunnerDispatchResult;
    const out = await runResearch(
      { topic: "t" },
      deps(ws, fakeDispatch([() => okStep(), () => reviewStep(REVIEW_FIX), () => bad], []), undefined, seam([["exa", true]])),
    );
    assert.equal(out.verdict, "error");
    assert.match(out.text, /修订阶段失败/u);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research 终稿标注门（fix 链）：来源行缺〔可靠性：〕标注 → 代码门拒收", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const unmarked = {
      ...DELIVERY,
      report_markdown: OK_REPORT.replace("〔可靠性：官方一手〕", "").replace("〔可靠性：权威媒体〕", ""),
    } as ResearchDelivery;
    const out = await runResearch(
      { topic: "t" },
      deps(ws, fakeDispatch([() => okStep(), () => reviewStep(REVIEW_FIX), () => okStep(unmarked)], []), undefined, seam([["exa", true]])),
    );
    assert.equal(out.verdict, "error");
    assert.match(out.text, /\[来源标注\] 来源行缺可靠性标注/u);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research fetch_sources=true（pass 链）：审查任务书带拉取段；审查交付 sources → 收据带附录与计数", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const reviewPassWithSources: ReviewDelivery = { ...REVIEW_PASS, sources: SOURCES };
    const out = await runResearch(
      { topic: "可乐财报", fetchSources: true },
      deps(ws, fakeDispatch([() => okStep(), () => reviewStep(reviewPassWithSources)], calls), undefined, seam([["exa", true]])),
    );
    assert.equal(out.verdict, "pass");
    assert.ok(reviewTaskOf(calls).includes("来源拉取（本单要求，必须执行）"), "拉取段进审查任务书");
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

test("research fetch_sources=true（fix 链）：审查员已拉来源进修订任务书；修订交付 sources 过拉取门", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const reviewFixWithSources: ReviewDelivery = { ...REVIEW_FIX, sources: SOURCES };
    const fixed: ResearchDelivery = { ...DELIVERY, sources: SOURCES };
    const out = await runResearch(
      { topic: "可乐财报", fetchSources: true },
      deps(ws, fakeDispatch([() => okStep(), () => reviewStep(reviewFixWithSources), () => okStep(fixed)], calls), undefined, seam([["exa", true]])),
    );
    assert.equal(out.verdict, "pass");
    const fixTask = calls[2].task;
    assert.ok(fixTask.includes("审查员已拉的来源全文"), "审查员 sources 带给修订轮，避免重复拉取");
    assert.ok(fixTask.includes("来源拉取（本单要求"));
    assert.equal(out.details.sources_fetched, 1);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research fetch_sources=true 但审查交付无 sources[] → 终稿拉取门拦截（error）", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const out = await runResearch(
      { topic: "可乐财报", fetchSources: true },
      deps(ws, fakeDispatch([() => okStep(), () => reviewStep(REVIEW_PASS), () => okStep()], []), undefined, seam([["exa", true]])),
    );
    assert.equal(out.verdict, "error");
    assert.match(out.text, /\[拉取\] fetch_sources=true 但交付未附 sources/u);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research：库级可选 strands（调用方自带已知条目）进初稿任务书；工具面不暴露该参数", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const out = await runResearch(
      { topic: "主题甲", strands: ["待查事项乙"] },
      deps(ws, fakeDispatch([() => okStep(), () => reviewStep(REVIEW_PASS)], calls), undefined, seam([["exa", true]])),
    );
    assert.equal(out.verdict, "pass");
    assert.ok(draftTaskOf(calls).includes("已知待查清单"));
    assert.ok(draftTaskOf(calls).includes("1. 待查事项乙"));
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

test("research：初稿全轮失败（fresh+nudge 仍 structured 缺失）→ 收据 error，无审查轮", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const bad = { ok: true, output: "无结构化交付", structured: null, stopReason: "completed" } as RunnerDispatchResult;
    const out = await runResearch({ topic: "t" }, deps(ws, fakeDispatch([() => bad, () => bad], calls), undefined, seam([["exa", true]])));
    assert.equal(out.verdict, "error");
    assert.match(out.text, /调研派单失败（初稿阶段/);
    assert.equal(calls.length, 2, "fresh + nudge 各一轮（单路由口径，routes 长度 1）");
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research：初稿 nudge 一轮翻盘 → 审查继续，收据 pass", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const ledger: RunnerLedgerRecord[] = [];
    const bad = { ok: true, output: "无结构化交付", structured: null, stopReason: "completed" } as RunnerDispatchResult;
    const out = await runResearch(
      { topic: "t" },
      deps(ws, fakeDispatch([() => bad, () => okStep(), () => reviewStep(REVIEW_PASS)], calls), ledger, seam([["exa", true]])),
    );
    assert.equal(out.verdict, "pass");
    assert.equal(calls.length, 3);
    const attempts = ledger.filter((r) => r.kind === "attempt").map((r) => (r as { attempt: { kind: string } }).attempt.kind);
    assert.deepEqual(attempts, ["fresh", "nudge", "fresh"], "初稿轮 fresh 败→nudge 翻盘 + 审查轮 fresh");
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research：初稿内容门拦短报告交付 → 收据 error，无审查轮", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const thinDelivery = { ...DELIVERY, report_markdown: "太短" } as ResearchDelivery;
    const out = await runResearch(
      { topic: "t", caseId: "research-thin" },
      deps(ws, fakeDispatch([() => okStep(thinDelivery), () => reviewStep(REVIEW_PASS)], calls), undefined, seam([["exa", true]])),
    );
    assert.equal(out.verdict, "error");
    assert.match(out.text, /初稿内容门未过.*实质不足/u);
    assert.equal(calls.length, 1, "初稿门先拦，审查轮未派");
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

test("任务书单元：三工序任务书形态（draft 自判/打标；review 复核维度+判据；fix 逐条有着落）", () => {
  const draft = buildResearchTask({ caseId: "r", topic: "主题甲", strands: ["待查事项乙"], providerId: "exa" });
  assert.ok(draft.includes("你是调研员（Researcher）"));
  assert.ok(draft.includes("case_id: r"));
  assert.ok(draft.includes("provider=exa"));
  assert.ok(draft.includes("已知待查清单"));
  assert.ok(draft.includes("1. 待查事项乙"));
  assert.ok(draft.includes("自判"));
  assert.ok(draft.includes("逐源交叉比对"));
  assert.ok(draft.includes("〔单一来源〕"));
  assert.ok(draft.includes('"report_markdown":"<完整初稿全文>"'));
  assert.ok(draft.includes("[SRC-1]"));

  const review = buildReviewTask({ caseId: "r", topic: "主题甲", draft: DELIVERY, providerId: "exa", fetchSources: false });
  assert.ok(review.includes("你是审查员（Reviewer）"));
  assert.ok(review.includes("复核维度"));
  assert.ok(review.includes("verdict 判据"));
  assert.ok(review.includes("可乐双雄 2025 财年"), "初稿冻结嵌入");
  assert.ok(!review.includes("来源拉取（本单要求"), "fetchSources=false 无拉取段");
  const reviewFetch = buildReviewTask({ caseId: "r", topic: "t", draft: DELIVERY, providerId: "exa", fetchSources: true });
  assert.ok(reviewFetch.includes("来源拉取（本单要求，必须执行）"));

  const fix = buildFixTask({
    caseId: "r",
    topic: "主题甲",
    draft: DELIVERY,
    issues: REVIEW_ISSUES,
    providerId: "exa",
    fetchSources: false,
    reviewerSources: "",
  });
  assert.ok(fix.includes("你是调研员（Researcher，修订轮）"));
  assert.ok(fix.includes("issue 清单"));
  assert.ok(fix.includes("佐证不足"));
  assert.ok(!fix.includes("审查员已拉"), "无已拉材料不出该节");
  const fixFetch = buildFixTask({
    caseId: "r",
    topic: "t",
    draft: DELIVERY,
    issues: [],
    providerId: "exa",
    fetchSources: true,
    reviewerSources: '[{"src":"SRC-1"}]',
  });
  assert.ok(fixFetch.includes("审查员已拉的来源全文"));
  assert.ok(fixFetch.includes('"sources":['));
});

test("reviewRoutes：审查员路由只进工序②（初稿/修订轮仍用调研员路由——UI「分开配」口径）", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    const out = await runResearch(
      {
        topic: "可乐财报",
        routes: [{ provider: "res", model: "draft-model", thinkingLevel: "medium" }],
        reviewRoutes: [{ provider: "rev", model: "review-model", thinkingLevel: "low" }],
      },
      deps(ws, fakeDispatch([() => okStep(), () => reviewStep(REVIEW_FIX), () => okStep()], calls), undefined, seam([["exa", true]])),
    );
    assert.equal(out.verdict, "pass");
    assert.equal(calls.length, 3);
    assert.equal(calls[0].provider, "res");
    assert.equal(calls[0].model, "draft-model");
    assert.equal(calls[1].provider, "rev", "工序②用审查员路由");
    assert.equal(calls[1].model, "review-model");
    assert.equal(calls[1].thinkingLevel, "low");
    assert.equal(calls[2].provider, "res", "修订轮（工序③）仍用调研员路由");
    assert.equal(calls[2].model, "draft-model");
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("reviewRoutes 缺省：工序②与调研员同路由（默认共用一份配置的口径）", async () => {
  const ws = makeWs();
  try {
    seedRoutes(ws);
    const calls: RunnerDispatchRequest[] = [];
    await runResearch(
      { topic: "可乐财报", routes: [{ provider: "res", model: "shared-model", thinkingLevel: "high" }] },
      deps(ws, fakeDispatch([() => okStep(), () => reviewStep(REVIEW_PASS)], calls), undefined, seam([["exa", true]])),
    );
    assert.equal(calls[1].provider, "res", "未拆分 = 审查员跟随调研员路由");
    assert.equal(calls[1].model, "shared-model");
    assert.equal(calls[1].thinkingLevel, "high");
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});
