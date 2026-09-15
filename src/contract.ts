/** contract.ts —— 调研合同 v2（通用主题式）。
 *
 * structured 交付 = {case_id, status, report_markdown, facts[], open_questions[]}：
 * report_markdown 是给人读的完整调研报告（内联 [SRC-n] + 编号来源清单）；
 * facts[] 是机器可解析的原子事实（URL/日期/域名），project 模式落档时机械渲染成证据行——
 * 格式与 outline 引用覆盖门同源（消费方向只增不改，改格式须与写作包证据线标准同步）。
 * 证据行：`- [事实] <断言>；来源：<URL>（<日期>，<域名>）；用于：<用途|待归属>`
 */

/** 单条调研事实（facts[] 元素；SRC-n 编号即来源清单序号）。 */
export type ResearchFact = {
  assertion: string;
  url: string;
  date: string;
  domain: string;
  title?: string;
};

/** 调研写手 structured 交付（v2：主题式完整报告）。 */
export type ResearchDelivery = {
  case_id: string;
  status: "completed" | "partial";
  report_markdown: string;
  facts: ResearchFact[];
  open_questions: string[];
};

/** 交付 schema（object-rooted 最小子集；形态门由 runner validateStructured 执行）。 */
export const RESEARCH_DELIVERY_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["case_id", "status", "report_markdown", "facts", "open_questions"],
  properties: {
    case_id: { type: "string" },
    status: { type: "string", enum: ["completed", "partial"] },
    report_markdown: { type: "string" },
    facts: {
      type: "array",
      items: {
        type: "object",
        required: ["assertion", "url", "date", "domain"],
        properties: {
          assertion: { type: "string" },
          url: { type: "string" },
          date: { type: "string" },
          domain: { type: "string" },
          title: { type: "string" },
        },
      },
    },
    open_questions: { type: "array", items: { type: "string" } },
  },
};

/** 报告实质门下限：短于它 = 没写出真报告（不是格式问题，是没干活）。 */
export const REPORT_MIN_CHARS = 400;

/** URL → 域名（非法 URL 回「未知域名」，不抛——留档行总要能生成）。 */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "未知域名";
  }
}

/** 证据行渲染（与写作包证据线标准逐字同构；outline 引用门按「- [事实]」行匹配）。 */
export function renderEvidenceRow(fact: ResearchFact): string {
  return `- [事实] ${fact.assertion.trim()}；来源：${fact.url}（${fact.date}，${fact.domain}）；用于：待归属`;
}

/**
 * 交付内容门（runner 段③形态门之外的业务门）：
 * - report_markdown 非空且达实质线（REPORT_MIN_CHARS）；
 * - 每条 fact 断言/URL 非空、URL 可解析；
 * - status=completed 须 facts 非空；
 * - facts 与 open_questions 双空 = 失败（既没查到也没留待办，等于没干活）。
 */
export function validateDelivery(delivery: ResearchDelivery): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const report = String(delivery.report_markdown ?? "");
  if (report.trim().length < REPORT_MIN_CHARS) errors.push(`report_markdown 实质不足（${report.trim().length} < ${REPORT_MIN_CHARS} 字，像没干活）`);
  const facts = Array.isArray(delivery.facts) ? delivery.facts : [];
  facts.forEach((f, i) => {
    if (!f?.assertion?.trim()) errors.push(`facts[${i}].assertion 为空`);
    try {
      new URL(f.url);
    } catch {
      errors.push(`facts[${i}].url 非法：${String(f.url).slice(0, 80)}`);
    }
  });
  if (delivery.status === "completed" && facts.length === 0) errors.push("status=completed 但 facts 为空");
  const openQ = Array.isArray(delivery.open_questions) ? delivery.open_questions : [];
  if (facts.length === 0 && openQ.length === 0) errors.push("facts 与 open_questions 双空（既无产出也无待办 = 空转）");
  return { ok: errors.length === 0, errors };
}

/**
 * 落档小节渲染（project 模式，append 进 底稿/调研.md）：
 * 主题标题 + 报告全文（人读面）+ 证据行 atoms（机器面：outline 引用门吃这些行）。
 */
export function renderResearchSection(label: string, at: string, delivery: ResearchDelivery): string {
  const lines: string[] = ["", `## ${label}（${at}）`, ""];
  lines.push(String(delivery.report_markdown ?? "").trim());
  lines.push("", "### 证据行（机器可解析原子，[SRC-n] 对应上方来源清单）", "");
  const facts = Array.isArray(delivery.facts) ? delivery.facts : [];
  for (const f of facts) lines.push(renderEvidenceRow(f));
  const openQ = Array.isArray(delivery.open_questions) ? delivery.open_questions : [];
  if (openQ.length) {
    lines.push("", "### 待核实余项", "");
    for (const q of openQ) lines.push(`- ${q}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** 待核实提取：扫 markdown 的 **待核实** 标记之后的列表行（project-only 调用时内建扫大纲用）。 */
export function extractPendingItems(markdown: string): string[] {
  const items: string[] = [];
  let inPending = false;
  for (const raw of String(markdown ?? "").split(/\r?\n/u)) {
    const line = raw.trimEnd();
    if (line.includes("**待核实**")) {
      inPending = true;
      continue;
    }
    if (!inPending) continue;
    const t = line.trim();
    if (!t) continue;
    if (/^#{1,6}\s/u.test(t)) {
      inPending = false;
      continue;
    }
    if (/^[-*]\s+/u.test(t)) {
      items.push(t.replace(/^[-*]\s+/u, "").trim());
    } else {
      inPending = false;
    }
  }
  return items;
}
