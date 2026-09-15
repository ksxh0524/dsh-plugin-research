/** contract.test.ts —— 调研证据行合同：格式逐字、待核实提取、内容门、小节渲染（fixture 真语义数据）。 */

import assert from "node:assert/strict";
import test from "node:test";
import { domainOf, extractPendingItems, renderEvidenceRow, renderResearchSection, validateDelivery, type ResearchDelivery } from "../src/contract.ts";

const OK_FACT = {
  assertion: "HyperFrames 的默认动效运行时是 GSAP",
  url: "https://example.com/hf-docs",
  date: "2026-09-01",
  domain: "example.com",
  title: "HF 运行时",
  used_for: "第2节",
};

test("renderEvidenceRow：证据行格式与写作包证据线标准逐字同构", () => {
  assert.equal(
    renderEvidenceRow(OK_FACT),
    "- [事实] HyperFrames 的默认动效运行时是 GSAP；来源：https://example.com/hf-docs（2026-09-01，example.com）；用于：第2节",
  );
});

test("renderEvidenceRow：used_for 缺省 = 待归属；断言/URL 两端空白裁剪", () => {
  assert.equal(
    renderEvidenceRow({ ...OK_FACT, assertion: "  断言  ", used_for: undefined }),
    "- [事实] 断言；来源：https://example.com/hf-docs（2026-09-01，example.com）；用于：待归属",
  );
});

test("domainOf：合法 URL 出域名；非法回未知域名（留档行总要能生成，不抛）", () => {
  assert.equal(domainOf("https://docs.x.dev/a?b=1"), "docs.x.dev");
  assert.equal(domainOf("不是URL"), "未知域名");
});

test("extractPendingItems：**待核实** 小节的列表行提取；新标题/非列表正文即止", () => {
  const md = [
    "# 大纲 — 主题",
    "全片主线：……",
    "## 第1节",
    "正文行",
    "**待核实**",
    "- 问题甲",
    "- 问题乙（含**加粗**）",
    "* 问题丙（星号列表也算）",
    "",
    "## 第2节",
    "**待核实**",
    "- 问题丁",
    "非列表正文（说明文字）",
    "- 这条不算（节已结束）",
    "",
    "开头无标题直接给待核实也认：**待核实**",
    "- 问题戊",
  ].join("\n");
  assert.deepEqual(extractPendingItems(md), ["问题甲", "问题乙（含**加粗**）", "问题丙（星号列表也算）", "问题丁", "问题戊"]);
});

test("validateDelivery：合法通过；断言空/URL 非法/completed 空事实/双空各自拦截", () => {
  const ok = validateDelivery({ case_id: "c", status: "completed", facts: [OK_FACT], open_questions: [] });
  assert.deepEqual(ok, { ok: true, errors: [] });

  const emptyAssertion = validateDelivery({
    case_id: "c",
    status: "partial",
    facts: [{ ...OK_FACT, assertion: "  " }],
    open_questions: ["x"],
  });
  assert.equal(emptyAssertion.ok, false);
  assert.ok(emptyAssertion.errors[0].includes("assertion 为空"));

  const badUrl = validateDelivery({
    case_id: "c",
    status: "partial",
    facts: [{ ...OK_FACT, url: "ftp://[bad" }],
    open_questions: [],
  });
  assert.equal(badUrl.ok, false);
  assert.ok(badUrl.errors[0].includes("url 非法"));

  const completedEmpty = validateDelivery({ case_id: "c", status: "completed", facts: [], open_questions: [] });
  assert.equal(completedEmpty.ok, false);
  assert.ok(completedEmpty.errors.some((e) => e.includes("status=completed 但 facts 为空")));
  assert.ok(completedEmpty.errors.some((e) => e.includes("双空")));

  const partialWithTodo = validateDelivery({ case_id: "c", status: "partial", facts: [], open_questions: ["查不到的"] });
  assert.deepEqual(partialWithTodo, { ok: true, errors: [] });
});

test("renderResearchSection：小节头 + 事实行 + 待核实余项；facts 空则无余项头", () => {
  const delivery: ResearchDelivery = {
    case_id: "c",
    status: "partial",
    facts: [OK_FACT],
    open_questions: ["问题丁查不到"],
  };
  const section = renderResearchSection("定向调研", "2026-09-15", delivery);
  assert.ok(section.startsWith("\n## 定向调研（2026-09-15）\n\n"), "小节以单空行起头（append 兼容：engine 负责前文件收尾换行）");
  assert.ok(section.includes(renderEvidenceRow(OK_FACT)));
  assert.ok(section.includes("### 待核实余项"));
  assert.ok(section.includes("- 问题丁查不到"));

  const noTodo = renderResearchSection("主题", "2026-09-15", { ...delivery, facts: [], open_questions: [] });
  assert.ok(!noTodo.includes("待核实余项"));
});
