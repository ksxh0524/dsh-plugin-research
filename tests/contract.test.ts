/** contract.test.ts —— 调研合同 v2：报告实质门、证据行格式、落档小节、待核实提取（fixture 真语义数据）。 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  domainOf,
  extractPendingItems,
  renderEvidenceRow,
  renderResearchSection,
  validateDelivery,
  REPORT_MIN_CHARS,
  type ResearchDelivery,
} from "../src/contract.ts";

const OK_FACT = {
  assertion: "2025 财年可口可乐营收 470 亿美元",
  url: "https://investor.example.com/ko-2025",
  date: "2026-02-10",
  domain: "investor.example.com",
  title: "KO FY2025 Annual Report",
};

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
    OK_FACT,
    { assertion: "百事 2025 财年营收 920 亿美元", url: "https://investor.example.com/pe-2025", date: "2026-02-10", domain: "investor.example.com" },
  ],
  open_questions: ["第三方研报全文未见公开版"],
};

test("renderEvidenceRow：证据行格式与写作包证据线标准逐字同构（used_for 由落档层统一为待归属）", () => {
  assert.equal(
    renderEvidenceRow(OK_FACT),
    "- [事实] 2025 财年可口可乐营收 470 亿美元；来源：https://investor.example.com/ko-2025（2026-02-10，investor.example.com）；用于：待归属",
  );
});

test("domainOf：合法 URL 出域名；非法回未知域名（留档行总要能生成，不抛）", () => {
  assert.equal(domainOf("https://docs.x.dev/a?b=1"), "docs.x.dev");
  assert.equal(domainOf("不是URL"), "未知域名");
});

test("extractPendingItems：**待核实** 小节的列表行提取；新标题/非列表正文即止", () => {
  const md = [
    "# 大纲 — 主题",
    "## 第1节",
    "**待核实**",
    "- 问题甲",
    "* 问题丙（星号列表也算）",
    "",
    "## 第2节",
    "**待核实**",
    "- 问题丁",
    "非列表正文（说明文字）",
    "- 这条不算（节已结束）",
  ].join("\n");
  assert.deepEqual(extractPendingItems(md), ["问题甲", "问题丙（星号列表也算）", "问题丁"]);
});

test("validateDelivery：合法通过；报告不足线/断言空/URL 非法/completed 空事实/双空各自拦截", () => {
  const ok = validateDelivery({ case_id: "c", status: "completed", report_markdown: OK_REPORT, facts: [OK_FACT], open_questions: [] });
  assert.deepEqual(ok, { ok: true, errors: [] });

  const thin = validateDelivery({
    case_id: "c",
    status: "partial",
    report_markdown: "太短的报告",
    facts: [],
    open_questions: ["查不到"],
  });
  assert.equal(thin.ok, false);
  assert.ok(thin.errors[0].includes("实质不足"));
  assert.ok(thin.errors[0].includes(String(REPORT_MIN_CHARS)));

  const emptyAssertion = validateDelivery({
    case_id: "c",
    status: "partial",
    report_markdown: OK_REPORT,
    facts: [{ ...OK_FACT, assertion: "  " }],
    open_questions: ["x"],
  });
  assert.equal(emptyAssertion.ok, false);
  assert.ok(emptyAssertion.errors[0].includes("assertion 为空"));

  const badUrl = validateDelivery({
    case_id: "c",
    status: "partial",
    report_markdown: OK_REPORT,
    facts: [{ ...OK_FACT, url: "ftp://[bad" }],
    open_questions: [],
  });
  assert.equal(badUrl.ok, false);
  assert.ok(badUrl.errors[0].includes("url 非法"));

  const completedEmpty = validateDelivery({ case_id: "c", status: "completed", report_markdown: OK_REPORT, facts: [], open_questions: [] });
  assert.equal(completedEmpty.ok, false);
  assert.ok(completedEmpty.errors.some((e) => e.includes("status=completed 但 facts 为空")));

  const partialWithTodo = validateDelivery({ case_id: "c", status: "partial", report_markdown: OK_REPORT, facts: [], open_questions: ["查不到的"] });
  assert.deepEqual(partialWithTodo, { ok: true, errors: [] });
});

test("renderResearchSection：主题头 + 报告全文 + 证据行 atoms + 余项；含 [事实] 行供 outline 门匹配", () => {
  const section = renderResearchSection("可乐财报调研", "2026-09-15", OK_DELIVERY);
  assert.ok(section.startsWith("\n## 可乐财报调研（2026-09-15）\n\n# 调研报告 — 测试主题"));
  assert.ok(section.includes("### 证据行（机器可解析原子"));
  assert.ok(section.includes("- [事实] 2025 财年可口可乐营收 470 亿美元；来源：https://investor.example.com/ko-2025"));
  assert.ok(section.includes("### 待核实余项"));
  assert.ok(section.includes("- 研报数据缺口"));
});
