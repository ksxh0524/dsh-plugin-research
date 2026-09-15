/** engine.test.ts —— research_build 编排：fake dispatch 全链（清单合并/门禁/留档/账本/单路由口径）。
 *
 * dispatch 注入点隔离（不烧钱、不真派）；runner 五段照跑（合同段预检 + validate + nudge 真语义）。
 * 路由固定走工作区路由表 fixture（.pi/model-router.json content-writer.researcher 键，
 * fallbacks 混入脏行以证「明确不消费」）。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runResearchBuild, resolvePrimaryRoute, buildResearchTask, type ResearchDeps } from "../src/engine.ts";
import type { ResearchDelivery } from "../src/contract.ts";
import type { RunnerDispatchRequest, RunnerDispatchResult, RunnerLedgerRecord } from "aivideo-core/src/subagent/runner.ts";

const DELIVERY: ResearchDelivery = {
  case_id: "c",
  status: "completed",
  facts: [
    {
      assertion: "CNB 是国内代码托管平台",
      url: "https://cnb.cool/about",
      date: "2026-08-30",
      domain: "cnb.cool",
      title: "关于 CNB",
      used_for: "第1节",
    },
    {
      assertion: "Git subtree 支持子目录粒度推送",
      url: "https://git-scm.com/book/zh/v2",
      date: "unknown",
      domain: "git-scm.com",
    },
  ],
  open_questions: ["CNB 免费额度具体多少"],
};

function makeWs(): string {
  return mkdtempSync(join(tmpdir(), "dsh-research-"));
}

/** 项目 fixture：底稿/大纲.md（待核实清单）+ 工作区路由表（单主路由 + 脏 fallback 行）。 */
function seedProject(ws: string, projectRel: string, outlineTodo: string[] = []): void {
  mkdirSync(join(ws, projectRel, "底稿"), { recursive: true });
  writeFileSync(
    join(ws, projectRel, "底稿", "大纲.md"),
    ["# 大纲 — 测试主题", "全片主线：无因果断言", "## 第1节", "**待核实**", ...outlineTodo.map((q) => `- ${q}`), ""].join("\n"),
  );
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

function deps(ws: string, dispatch: (req: RunnerDispatchRequest) => Promise<RunnerDispatchResult>, ledger: RunnerLedgerRecord[] = []): ResearchDeps {
  return { ws, dispatch, say: undefined, runToLedger: (r) => void ledger.push(r) };
}

test("research_build 快乐链：显式问题 ∪ 源待核实合并去重 → 单路由派单 → 内容门 → 留档收据", async () => {
  const ws = makeWs();
  try {
    seedProject(ws, "制作中/甲", ["CNB 免费额度具体多少", "CNB 免费额度具体多少"]);
    const calls: RunnerDispatchRequest[] = [];
    const ledger: RunnerLedgerRecord[] = [];
    const out = await runResearchBuild(
      {
        project: "甲",
        questions: ["Git subtree 怎么推送子目录", "CNB 免费额度具体多少"],
        label: "托管调研",
      },
      deps(ws, fakeDispatch([() => ({ ok: true, output: "ok", structured: DELIVERY, stopReason: "completed" })], calls), ledger),
    );
    assert.equal(out.verdict, "pass");
    assert.match(out.text, /2 条事实已留档/);
    assert.match(out.text, /1 条待核实余项/);
    // 留档：append 进项目底稿，日期小节 + 证据行 + 余项
    const evidence = readFileSync(join(ws, "制作中", "甲", "底稿", "调研.md"), "utf8");
    assert.ok(evidence.includes("## 托管调研（"));
    assert.ok(evidence.includes("- [事实] CNB 是国内代码托管平台；来源：https://cnb.cool/about（2026-08-30，cnb.cool）；用于：第1节"));
    assert.ok(evidence.includes("### 待核实余项"));
    assert.ok(evidence.includes("- CNB 免费额度具体多少"));
    // 任务书：合并去重（源待核实与显式重复合并后仅一条）+ case_id + 守则
    assert.equal(calls.length, 1, "单路由：一次派单");
    const task = calls[0].task;
    assert.ok(task.includes("case_id: research-"));
    assert.ok(task.includes("禁止凭记忆编造"));
    assert.ok(task.includes("不落盘"), "写手不落盘约定在任务书");
    assert.equal(task.split("CNB 免费额度具体多少").length - 1, 1, "重复合并去重");
    assert.ok(task.includes("Git subtree 怎么推送子目录"));
    // 单路由：routes 只取 primary（fallbacks 配了也明确不消费）；thinking 映射 thinkingLevel
    assert.equal(calls[0].provider, "buzzai");
    assert.equal(calls[0].model, "qwen3.8-flash-free");
    assert.equal(calls[0].thinkingLevel, "xhigh");
    // 账本：open/attempt/finish 三笔 + 信封目录落点
    assert.ok(ledger.some((r) => r.kind === "open"));
    assert.ok(ledger.some((r) => r.kind === "attempt" && r.attempt.kind === "fresh" && r.attempt.ok));
    assert.ok(ledger.some((r) => r.kind === "finish" && r.ok));
    assert.ok(existsSync(join(ws, ".runtime", "sessions", "researcher", "research_build")));
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research_build：仅源文档待核实（无显式 questions）也能成链", async () => {
  const ws = makeWs();
  try {
    seedProject(ws, "制作中/乙", ["问题一是什么"]);
    const calls: RunnerDispatchRequest[] = [];
    const out = await runResearchBuild(
      { project: "乙" },
      deps(ws, fakeDispatch([() => ({ ok: true, output: "ok", structured: { ...DELIVERY, open_questions: [] }, stopReason: "completed" })], calls)),
    );
    assert.equal(out.verdict, "pass");
    assert.ok(calls[0].task.includes("1. 问题一是什么"));
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research_build：questions 与源待核实双空 → fail-loud 不空跑（路由缺位不背锅，先报清单）", async () => {
  const ws = makeWs();
  try {
    seedProject(ws, "制作中/丙", []);
    await assert.rejects(
      () =>
        runResearchBuild(
          { project: "丙" },
          deps(ws, async () => ({ ok: false, output: "" })),
        ),
      /问题清单为空/,
    );
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research_build：显式 source 不可读 → fail-loud 点名文件", async () => {
  const ws = makeWs();
  try {
    seedProject(ws, "制作中/丁", []);
    await assert.rejects(
      () =>
        runResearchBuild(
          { project: "丁", questions: ["q1"], source: "底稿/不存在.md" },
          deps(ws, async () => ({ ok: false, output: "" })),
        ),
      /调研源文档不可读.*不存在\.md/u,
    );
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research_build：写手全轮失败（fresh+nudge 仍 structured 缺失）→ 收据 error 全量保全，无 fallback 第三轮", async () => {
  const ws = makeWs();
  try {
    seedProject(ws, "制作中/戊", []);
    const calls: RunnerDispatchRequest[] = [];
    const bad = { ok: true, output: "无结构化交付", structured: null, stopReason: "completed" };
    const out = await runResearchBuild({ project: "戊", questions: ["q1"] }, deps(ws, fakeDispatch([() => bad, () => bad], calls)));
    assert.equal(out.verdict, "error");
    assert.match(out.text, /调研派单失败/);
    assert.ok(!existsSync(join(ws, "制作中", "戊", "底稿", "调研.md")), "失败不留档");
    assert.equal(calls.length, 2, "fresh + nudge 各一轮（单路由口径，routes 长度 1）");
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research_build：nudge 一轮翻盘（第2轮 structured 合规）→ pass 且 attempts 记 fresh/nudge", async () => {
  const ws = makeWs();
  try {
    seedProject(ws, "制作中/己", []);
    const calls: RunnerDispatchRequest[] = [];
    const ledger: RunnerLedgerRecord[] = [];
    const bad = { ok: true, output: "无结构化交付", structured: null, stopReason: "completed" };
    const out = await runResearchBuild(
      { project: "己", questions: ["q1"] },
      deps(ws, fakeDispatch([() => bad, () => ({ ok: true, output: "ok", structured: DELIVERY, stopReason: "completed" })], calls), ledger),
    );
    assert.equal(out.verdict, "pass");
    assert.equal(calls.length, 2);
    const attempts = ledger.filter((r) => r.kind === "attempt").map((r) => (r as { attempt: { kind: string } }).attempt.kind);
    assert.deepEqual(attempts, ["fresh", "nudge"]);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research_build：内容门拦非法 URL 交付 → error 不留档", async () => {
  const ws = makeWs();
  try {
    seedProject(ws, "制作中/庚", []);
    const badDelivery = { ...DELIVERY, facts: [{ ...DELIVERY.facts[0], url: "not-a-url" }] };
    const out = await runResearchBuild(
      { project: "庚", questions: ["q1"] },
      deps(ws, async () => ({ ok: true, output: "ok", structured: badDelivery, stopReason: "completed" })),
    );
    assert.equal(out.verdict, "error");
    assert.match(out.text, /交付内容门未过.*url 非法/u);
    assert.ok(!existsSync(join(ws, "制作中", "庚", "底稿", "调研.md")), "门未过不落盘");
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("research_build：path 参数覆写证据落点；裸项目名自动补 制作中/ 前缀", async () => {
  const ws = makeWs();
  try {
    seedProject(ws, "制作中/辛", []);
    const out = await runResearchBuild(
      { project: "辛", questions: ["q1"], path: "底稿/专项调研.md", label: "专项" },
      deps(ws, async () => ({ ok: true, output: "ok", structured: DELIVERY, stopReason: "completed" })),
    );
    assert.equal(out.verdict, "pass");
    assert.ok(existsSync(join(ws, "制作中", "辛", "底稿", "专项调研.md")));
    assert.match(String(out.details.path), /制作中[/\\]辛[/\\]底稿[/\\]专项调研\.md/u);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("resolvePrimaryRoute：config.routes 显式第一优先（多给忽略）；工作区路由表键次之（fallbacks 不消费）；皆无 fail-loud", () => {
  const ws = makeWs();
  try {
    // ① config.routes 显式（只取第一条）
    const explicit = resolvePrimaryRoute(ws, {
      routes: [
        { provider: "p1", model: "m1" },
        { provider: "p2", model: "m2" },
      ],
    });
    assert.deepEqual(explicit, { provider: "p1", model: "m1" });
    // ② 工作区路由表（.pi/model-router.json）键命中（fallbacks 明确不消费）
    mkdirSync(join(ws, ".pi"), { recursive: true });
    writeFileSync(
      join(ws, ".pi", "model-router.json"),
      JSON.stringify({ routes: { "content-writer.researcher": { primary: "prov/mdl", fallbacks: [{ model: "x/y" }], thinking: "medium" } } }),
    );
    assert.deepEqual(resolvePrimaryRoute(ws, {}), { provider: "prov", model: "mdl", thinkingLevel: "medium" });
    // ③ 皆无 → 抛
    assert.throws(() => resolvePrimaryRoute(join(tmpdir(), "dsh-research-empty-zz"), {}), /路由缺位/);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("buildResearchTask：任务书内建守则与交付格式（不因外部提示覆盖的口径写死）", () => {
  const task = buildResearchTask({ caseId: "research-x", questions: ["问题甲"], project: "制作中/甲", label: "定向调研" });
  assert.ok(task.includes("你是调研写手（researcher）"));
  assert.ok(task.includes("case_id: research-x"));
  assert.ok(task.includes("1. 问题甲"));
  assert.ok(task.includes('"status":"completed|partial"'));
  assert.ok(task.includes("facts 与 open_questions 双空不算完成"));
});
