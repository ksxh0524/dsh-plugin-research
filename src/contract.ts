/** contract.ts —— 调研交付合同 v3（纯通用：主题进、报告出，零宿主概念）。
 *
 * structured 交付 = {case_id, status, report_markdown, facts[], open_questions[]}：
 * report_markdown 是给人读的完整调研报告（内联 [SRC-n] + 编号来源清单）——这是通用交付物；
 * facts[] 是机器可解析的原子事实（URL/日期/域名），作为元数据随收据 details 回调用方
 * （对应 gpt-researcher 的 get_research_sources() 形）。留档（写盘）从来是调用方自己的事，
 * 本包不做任何文件 IO；证据行格式是写作簇（autovideo）的库标准，不在本包定义。
 */

/** 单条调研事实（facts[] 元素；SRC-n 编号即来源清单序号）。 */
export type ResearchFact = {
  assertion: string;
  url: string;
  date: string;
  domain: string;
  title?: string;
};

/** 调研写手 structured 交付。 */
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
