/** contract.test.ts —— 调研交付合同 v3.1：报告实质门、事实原子、来源拉取门、附录渲染（fixture 真语义数据）。
 * 证据行/落档小节/待核实提取已随宿主概念摘除——那是写作簇的库标准，不在本包。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  validateDelivery,
  validateSourceFetch,
  verifyFinalReport,
  renderSourceAppendix,
  REPORT_MIN_CHARS,
  RESEARCH_DELIVERY_SCHEMA,
  REVIEW_DELIVERY_SCHEMA,
  type ResearchDelivery,
} from "../src/contract.ts";

const OK_REPORT = [
  "# 调研报告 — 测试主题（2026-09-15）",
  "## 摘要",
  "三条研究线均有着落，结论置信度高：主结论如下。",
  "## 正文",
  "研究线一（财务）：营收 470 亿美元 [SRC-1]；研究线二（产品线）：新品占比提升〔单一来源〕 [SRC-2]。",
  "## 矛盾与缺口",
  "两家对市场份额口径不一致，如实并列。",
  "## 方法与局限说明",
  "检索预算限六次，数据以两家公司官网财报页为准，第三方研报全文未见公开版。",
  "## 待核实余项",
  "- 研报数据缺口",
  "## 来源清单",
  "- [SRC-1] KO FY2025 Annual Report — https://investor.example.com/ko-2025（2026-02-15，investor.example.com）〔可靠性：官方一手〕",
  "- [SRC-2] PE FY2025 10-K — https://investor.example.com/pe-2025（2026-02-10，investor.example.com）〔可靠性：权威媒体〕",
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

const FETCH_DELIVERY: ResearchDelivery = {
  case_id: "c",
  status: "completed",
  report_markdown: OK_REPORT,
  facts: [],
  open_questions: ["x"],
  sources: [
    {
      src: "SRC-1",
      title: "KO 年报",
      url: "https://investor.example.com/ko-2025",
      date: "2026-02-15",
      domain: "investor.example.com",
      reliability: "官方一手",
      content: "年报正文（足够长以过拉取判定）".repeat(6),
    },
    {
      src: "SRC-2",
      title: "PE 10-K",
      url: "https://investor.example.com/pe-2025",
      date: "2026-02-10",
      domain: "investor.example.com",
      reliability: "权威媒体",
    },
    {
      src: "SRC-3",
      title: "第三方研报",
      url: "https://research.example.org/report-2025",
      date: "unknown",
      domain: "research.example.org",
      reliability: "行业报告",
      content: "摘要",
    },
  ],
};

test("validateSourceFetch：合法通过；sources 空/字段缺失/URL 非法 各自拦截（content 缺席合法）", () => {
  const ok = validateSourceFetch(FETCH_DELIVERY);
  assert.deepEqual(ok, { ok: true, errors: [] });

  const none = validateSourceFetch({ ...FETCH_DELIVERY, sources: [] });
  assert.equal(none.ok, false);
  assert.match(none.errors[0], /fetch_sources=true 但交付未附 sources/u);

  const missingFields = validateSourceFetch({
    ...FETCH_DELIVERY,
    sources: [{ src: "", title: "t", url: "https://a.b/c", date: "d", domain: "a.b", reliability: "" }],
  });
  assert.equal(missingFields.ok, false);
  assert.match(missingFields.errors[0], /src\/title\/reliability 缺失/u);

  const badUrl = validateSourceFetch({
    ...FETCH_DELIVERY,
    sources: [{ src: "SRC-9", title: "坏源", url: "不是URL", date: "unknown", domain: "example.org", reliability: "论坛" }],
  });
  assert.equal(badUrl.ok, false, "非法 URL 必须被拦");
  assert.ok(badUrl.errors.some((e) => e.includes("url 非法")));
});

test("renderSourceAppendix：逐源小节 + 失败标注 + 超长截断 + 成功计数；顺序按数组原样（src 对应来源清单）", () => {
  const longBody = "正文段落。".repeat(5000);
  const appendix = renderSourceAppendix([
    {
      src: "SRC-1",
      title: "KO 年报",
      url: "https://investor.example.com/ko-2025",
      date: "2026-02-15",
      domain: "investor.example.com",
      reliability: "官方一手",
      content: longBody,
    },
    {
      src: "SRC-2",
      title: "PE 10-K",
      url: "https://investor.example.com/pe-2025",
      date: "2026-02-10",
      domain: "investor.example.com",
      reliability: "权威媒体",
    },
  ]);
  assert.ok(appendix.startsWith("\n## 附：来源全文\n"));
  assert.ok(appendix.includes("### [SRC-1] KO 年报 — https://investor.example.com/ko-2025"));
  assert.ok(appendix.includes("（2026-02-15，investor.example.com，官方一手）"));
  assert.ok(appendix.includes("（全文过长，截断至 20000 字符）"));
  assert.ok(appendix.includes("### [SRC-2] PE 10-K"));
  assert.ok(appendix.includes("（拉取失败，无全文）"));
  assert.ok(appendix.includes("（拉取成功 1/2 份）"));
});

test("RESEARCH_DELIVERY_SCHEMA：facts 项含 reliability/corroboration 可选字段；sources 项必填五字段", () => {
  const factItems = (RESEARCH_DELIVERY_SCHEMA.properties as Record<string, { items: { properties: Record<string, unknown> } }>).facts.items.properties;
  assert.ok("reliability" in factItems);
  assert.ok("corroboration" in factItems);
  const sourceItems = (RESEARCH_DELIVERY_SCHEMA.properties as Record<string, { items: { required: string[] } }>).sources.items.required;
  assert.deepEqual([...sourceItems].sort(), ["domain", "reliability", "src", "title", "url"].sort());
});

test("verifyFinalReport：来源行缺/错档可靠性、单源未打标、corroboration 引用不存在 各自拦截；合规通过", () => {
  const good: ResearchDelivery = {
    case_id: "c",
    status: "completed",
    report_markdown: OK_REPORT,
    facts: [
      { assertion: "a", url: "https://a.example.com/1", date: "unknown", domain: "a.example.com", corroboration: ["SRC-2"] },
      { assertion: "b", url: "https://a.example.com/2", date: "unknown", domain: "a.example.com" },
    ],
    open_questions: ["x"],
  };
  assert.deepEqual(verifyFinalReport(good), { ok: true, errors: [] });

  const noTier = verifyFinalReport({ ...good, report_markdown: OK_REPORT.replace("〔可靠性：官方一手〕", "") });
  assert.equal(noTier.ok, false);
  assert.ok(noTier.errors.some((e) => e.includes("来源行缺可靠性标注")));

  const badTier = verifyFinalReport({ ...good, report_markdown: OK_REPORT.replace("〔可靠性：权威媒体〕", "〔可靠性：五星级〕") });
  assert.equal(badTier.ok, false);
  assert.ok(badTier.errors.some((e) => e.includes("可靠性不在五档")));

  const noList = verifyFinalReport({ ...good, report_markdown: OK_REPORT.replace(/^- \[SRC-\d+\].*$/gmu, "") });
  assert.equal(noList.ok, false);
  assert.ok(noList.errors.some((e) => e.includes("无来源清单行")));

  const noSingleMark = verifyFinalReport({ ...good, report_markdown: OK_REPORT.replace("〔单一来源〕", "") });
  assert.equal(noSingleMark.ok, false);
  assert.ok(noSingleMark.errors.some((e) => e.includes("单一来源事实但正文无")));

  const deadRef = verifyFinalReport({ ...good, facts: [{ ...good.facts[0], corroboration: ["SRC-9"] }] });
  assert.equal(deadRef.ok, false);
  assert.ok(deadRef.errors.some((e) => e.includes("SRC-9 不在报告来源清单")));
});

test("REVIEW_DELIVERY_SCHEMA：verdict 枚举 + issues 项三段必填 + sources 项五字段必填", () => {
  const schema = REVIEW_DELIVERY_SCHEMA as { properties: Record<string, Record<string, unknown>> };
  assert.deepEqual((schema.properties.verdict as { enum: string[] }).enum, ["pass", "fix"]);
  const issueItems = (schema.properties.issues as { items: { required: string[] } }).items.required;
  assert.deepEqual([...issueItems].sort(), ["fix_hint", "point", "problem"].sort());
  const sourceItems = (schema.properties.sources as { items: { required: string[] } }).items.required;
  assert.deepEqual([...sourceItems].sort(), ["domain", "reliability", "src", "title", "url"].sort());
});
