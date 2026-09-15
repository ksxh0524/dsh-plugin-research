/** contract.test.ts —— 调研交付合同 v3：报告实质门与事实原子校验（fixture 真语义数据）。
 * 证据行/落档小节/待核实提取已随宿主概念摘除——那是写作簇的库标准，不在本包。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { validateDelivery, REPORT_MIN_CHARS, type ResearchDelivery } from "../src/contract.ts";

const OK_REPORT = [
  "# 调研报告 — 测试主题（2026-09-15）",
  "## 摘要",
  "三条研究线均有着落，结论置信度高：主结论如下。",
  "## 正文",
  "研究线一（财务）：营收 470 亿美元 [SRC-1]；研究线二（产品线）：新品占比提升 [SRC-2]。",
  "## 矛盾与缺口",
  "两家对市场份额口径不一致，如实并列。",
  "## 方法与局限说明",
  "检索预算限六次，数据以两家公司官网财报页为准，第三方研报全文未见公开版。",
  "## 待核实余项",
  "- 研报数据缺口",
  "## 来源清单",
  "- [SRC-1] KO FY2025 Annual Report — https://investor.example.com/ko-2025（2026-02-15，investor.example.com）",
  "- [SRC-2] PE FY2025 10-K — https://investor.example.com/pe-2025（2026-02-10，investor.example.com）",
].join("\n");

const OK_DELIVERY: ResearchDelivery = {
  case_id: "c",
  status: "completed",
  report_markdown: OK_REPORT,
  facts: [
    {
      assertion: "2025 财年可口可乐营收 470 亿美元",
      url: "https://investor.example.com/ko-2025",
      date: "2026-02-10",
      domain: "investor.example.com",
      title: "KO FY2025 Annual Report",
    },
    { assertion: "百事 2025 财年营收 920 亿美元", url: "https://investor.example.com/pe-2025", date: "2026-02-10", domain: "investor.example.com" },
  ],
  open_questions: ["第三方研报全文未见公开版"],
};

test("validateDelivery：合法通过（报告实质 + 事实原子 + completed 有事实 + 单边留待办）", () => {
  const ok = validateDelivery({ case_id: "c", status: "completed", report_markdown: OK_REPORT, facts: [OK_DELIVERY.facts[0]!], open_questions: [] });
  assert.deepEqual(ok, { ok: true, errors: [] });

  const partialWithTodo = validateDelivery({ case_id: "c", status: "partial", report_markdown: OK_REPORT, facts: [], open_questions: ["查不到的"] });
  assert.deepEqual(partialWithTodo, { ok: true, errors: [] });
});

test("validateDelivery：报告不足实质线 → 拦（下限 REPORT_MIN_CHARS，像没干活）", () => {
  const thin = validateDelivery({ case_id: "c", status: "partial", report_markdown: "太短的报告", facts: [], open_questions: ["查不到"] });
  assert.equal(thin.ok, false);
  assert.ok(thin.errors[0].includes("实质不足"));
  assert.ok(thin.errors[0].includes(String(REPORT_MIN_CHARS)));
});

test("validateDelivery：断言空 / URL 非法 / completed 空事实 / 双空 各自拦截", () => {
  const emptyAssertion = validateDelivery({
    case_id: "c",
    status: "partial",
    report_markdown: OK_REPORT,
    facts: [{ ...OK_DELIVERY.facts[0]!, assertion: "  " }],
    open_questions: ["x"],
  });
  assert.equal(emptyAssertion.ok, false);
  assert.ok(emptyAssertion.errors[0].includes("assertion 为空"));

  const badUrl = validateDelivery({
    case_id: "c",
    status: "partial",
    report_markdown: OK_REPORT,
    facts: [{ ...OK_DELIVERY.facts[0]!, url: "ftp://[bad" }],
    open_questions: [],
  });
  assert.equal(badUrl.ok, false);
  assert.ok(badUrl.errors[0].includes("url 非法"));

  const completedEmpty = validateDelivery({ case_id: "c", status: "completed", report_markdown: OK_REPORT, facts: [], open_questions: [] });
  assert.equal(completedEmpty.ok, false);
  assert.ok(completedEmpty.errors.some((e) => e.includes("status=completed 但 facts 为空")));

  const doubleEmpty = validateDelivery({ case_id: "c", status: "partial", report_markdown: OK_REPORT, facts: [], open_questions: [] });
  assert.equal(doubleEmpty.ok, false);
  assert.ok(doubleEmpty.errors.some((e) => e.includes("双空")));
});
