/** contract.ts —— 调研交付合同 v3.1（纯通用：主题进、报告出，零宿主概念）。
 *
 * structured 交付 = {case_id, status, report_markdown, facts[], open_questions[], sources?}：
 * - report_markdown 是给人读的完整调研报告（内联 [SRC-n] + 编号来源清单带可靠性标注）——通用交付物；
 * - facts[] 是机器可解析的原子事实（URL/日期/域名 + 可选佐证/可靠性元数据），随收据回调用方
 *   （对应 gpt-researcher 的 get_research_sources() 形）；
 * - sources[] 是来源拉取面（fetch_sources=true 时要求）：每条来源的可靠性评级 + 全文 content
 *   （缺席 = 拉取失败，如实不编造）。
 * 留档（写盘）从来是调用方自己的事，本包不做任何文件 IO；证据行格式是写作簇（autovideo）
 * 的库标准，不在本包定义。
 */

/** 来源可靠性分档（写手在报告与 facts 里标注的口径）。 */
export const RELIABILITY_TIERS = ["官方一手", "权威媒体", "行业报告", "自媒体", "论坛"] as const;

/** 单条调研事实（facts[] 元素；SRC-n 编号即来源清单序号）。
 * corroboration = 佐证同一断言的其他 [SRC-n] 编号：空数组/缺席 = 单一来源（报告须打标）。
 */
export type ResearchFact = {
  assertion: string;
  url: string;
  date: string;
  domain: string;
  title?: string;
  /** 该来源可靠性分档（RELIABILITY_TIERS 之一；缺席 = 未评，报告里按未评处理）。 */
  reliability?: string;
  /** 佐证同一断言的其他 [SRC-n] 编号（如 ["SRC-2"]）；缺席 = 单一来源。 */
  corroboration?: string[];
};

/** 单条来源（sources[] 元素；fetch_sources=true 时交付）。 */
export type ResearchSource = {
  /** 对应来源清单编号（如 "SRC-1"）。 */
  src: string;
  title: string;
  url: string;
  date: string;
  domain: string;
  /** 可靠性分档（RELIABILITY_TIERS 之一）。 */
  reliability: string;
  /** 拉取的页面正文 markdown；缺席 = 拉取失败（如实，不编造）。 */
  content?: string;
};

/** 调研写手 structured 交付。 */
export type ResearchDelivery = {
  case_id: string;
  status: "completed" | "partial";
  report_markdown: string;
  facts: ResearchFact[];
  open_questions: string[];
  /** 来源拉取面（fetch_sources=true 时要求非空；每条尽力带 content）。 */
  sources?: ResearchSource[];
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
          reliability: { type: "string" },
          corroboration: { type: "array", items: { type: "string" } },
        },
      },
    },
    open_questions: { type: "array", items: { type: "string" } },
    sources: {
      type: "array",
      items: {
        type: "object",
        required: ["src", "title", "url", "domain", "reliability"],
        properties: {
          src: { type: "string" },
          title: { type: "string" },
          url: { type: "string" },
          date: { type: "string" },
          domain: { type: "string" },
          reliability: { type: "string" },
          content: { type: "string" },
        },
      },
    },
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
 * fetch_sources 的 sources 门在 engine 层（contract 不感知请求参数）。
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
 * 来源拉取门（fetch_sources=true 时）：
 * - sources 必须非空（一条都没拉 = 没执行拉取指令）；
 * - 每条 src/title/url/reliability 齐全、url 可解析；content 缺席合法（拉取失败如实）。
 */
export function validateSourceFetch(delivery: ResearchDelivery): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const sources = Array.isArray(delivery.sources) ? delivery.sources : [];
  if (sources.length === 0) {
    errors.push("fetch_sources=true 但交付未附 sources[]（来源拉取指令未执行）");
    return { ok: false, errors };
  }
  sources.forEach((s, i) => {
    if (!s?.src?.trim() || !s?.title?.trim() || !s?.reliability?.trim()) errors.push(`sources[${i}] src/title/reliability 缺失`);
    try {
      new URL(s.url);
    } catch {
      errors.push(`sources[${i}].url 非法：${String(s?.url ?? "").slice(0, 80)}`);
    }
  });
  return { ok: errors.length === 0, errors };
}

/** 渲染附录：来源全文（按 src 排回来源清单顺序；单份超长截断并标注）。 */
export function renderSourceAppendix(sources: ResearchSource[]): string {
  const lines: string[] = ["", "## 附：来源全文", ""];
  let fetched = 0;
  for (const s of sources) {
    const content = String(s.content ?? "").trim();
    if (!content) {
      lines.push(`### [${s.src}] ${s.title} — ${s.url}`, "", "（拉取失败，无全文）", "");
      continue;
    }
    fetched += 1;
    const capped = content.length > 20000 ? `${content.slice(0, 20000)}\n\n（全文过长，截断至 20000 字符）` : content;
    lines.push(`### [${s.src}] ${s.title} — ${s.url}`, "", `（${s.date || "日期不详"}，${s.domain}，${s.reliability}）`, "", capped, "", "---", "");
  }
  lines.push(`（拉取成功 ${fetched}/${sources.length} 份）`, "");
  return lines.join("\n");
}
