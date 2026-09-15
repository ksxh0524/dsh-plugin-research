/** contract.ts —— 调研证据行合同（格式真源 = plugin-writing orchestrations.ts 证据线标准，同源引用）。
 *
 * 证据行：`- [事实] <断言>；来源：<URL>（<日期>，<域名>）；用于：<用途|待归属>`
 * outline rework 门按「- [事实]」行匹配关键事实断言并校验引用覆盖——本包只产不改消费侧，
 * 改格式必须与写作包证据线标准两处同步（消费方向只增不改）。
 */

/** 单条调研事实（structured 交付 facts[] 元素）。 */
export type ResearchFact = {
  assertion: string;
  url: string;
  date: string;
  domain: string;
  title?: string;
  used_for?: string;
};

/** 调研写手 structured 交付（outputSchema 唯一落点；runner 段③消费）。 */
export type ResearchDelivery = {
  case_id: string;
  status: "completed" | "partial";
  facts: ResearchFact[];
  open_questions: string[];
};

/** 交付 schema（object-rooted 最小子集；形态门由 runner validateStructured 执行）。 */
export const RESEARCH_DELIVERY_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["case_id", "status", "facts", "open_questions"],
  properties: {
    case_id: { type: "string" },
    status: { type: "string", enum: ["completed", "partial"] },
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
          used_for: { type: "string" },
        },
      },
    },
    open_questions: { type: "array", items: { type: "string" } },
  },
};

/** URL → 域名（非法 URL 回「未知域名」，不抛——留档行总要能生成）。 */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "未知域名";
  }
}

/** 证据行渲染（与写作包证据线标准逐字同构）。 */
export function renderEvidenceRow(fact: ResearchFact): string {
  return `- [事实] ${fact.assertion.trim()}；来源：${fact.url}（${fact.date}，${fact.domain}）；用于：${fact.used_for?.trim() || "待归属"}`;
}

/** 待核实提取：扫 markdown 的 **待核实** 标记之后的列表行；遇新标题或非列表正文即止。 */
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

/**
 * 交付内容门（runner 段③形态门之外的业务门）：
 * - 每条 fact 断言/URL 非空、URL 可解析；
 * - status=completed 须 facts 非空；
 * - facts 与 open_questions 双空 = 失败（既没查到也没留待办，等于没干活）。
 */
export function validateDelivery(delivery: ResearchDelivery): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
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

/** 证据小节渲染：日期小节头 + 事实行 + 待核实余项（append 进调研文件的内容单元）。 */
export function renderResearchSection(label: string, at: string, delivery: ResearchDelivery): string {
  const lines: string[] = ["", `## ${label}（${at}）`, ""];
  for (const f of delivery.facts) lines.push(renderEvidenceRow(f));
  if (delivery.facts.length) lines.push("");
  if (delivery.open_questions.length) {
    lines.push("### 待核实余项", "");
    for (const q of delivery.open_questions) lines.push(`- ${q}`);
    lines.push("");
  }
  return lines.join("\n");
}
