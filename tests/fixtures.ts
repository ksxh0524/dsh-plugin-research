/** fixtures.ts —— engine/cordis 测试共用的最小语义交付夹具（OK 报告/交付/审查回执）。
 *  OK_REPORT 自带可靠性五档标注 + 〔单一来源〕标记，能过 verifyFinalReport 全链。 */
import type { ResearchDelivery, ReviewDelivery, ReviewIssue } from "../src/contract.ts";

export const OK_REPORT = [
  "# 调研报告 — 可乐双雄 2025 财年（2026-09-15）",
  "## 摘要",
  "两条研究线均有着落：营收口径、财报发布时点均已确认，置信度高。",
  "## 正文",
  "研究线一（可口可乐财报）：FY2025 营收 470 亿美元 [SRC-1]；研究线二（百事财报）：FY2025 营收 920 亿美元〔单一来源〕 [SRC-2]。",
  "## 矛盾与缺口",
  "第三方研报全文未见公开版，缺口如实留待办。",
  "## 方法与局限说明",
  "检索预算限八次，数据以两家公司官网财报页为准。",
  "## 待核实余项",
  "- 第三方研报全文",
  "## 来源清单",
  "- [SRC-1] KO FY2025 Annual Report — https://investor.example.com/ko-2025（2026-02-15，investor.example.com）〔可靠性：官方一手〕",
  "- [SRC-2] PE FY2025 10-K — https://investor.example.com/pe-2025（2026-02-10，investor.example.com）〔可靠性：权威媒体〕",
].join("\n");

export const DELIVERY: ResearchDelivery = {
  case_id: "c",
  status: "completed",
  report_markdown: OK_REPORT,
  facts: [
    {
      assertion: "可口可乐 2025 财年营收 470 亿美元",
      url: "https://investor.example.com/ko-2025",
      date: "2026-02-15",
      domain: "investor.example.com",
      title: "KO FY2025",
      reliability: "官方一手",
      corroboration: ["SRC-2"],
    },
    {
      assertion: "百事 2025 财年营收 920 亿美元",
      url: "https://investor.example.com/pe-2025",
      date: "2026-02-10",
      domain: "investor.example.com",
      reliability: "权威媒体",
    },
  ],
  open_questions: ["第三方研报全文未见公开版"],
};

export const SOURCES = [
  {
    src: "SRC-1",
    title: "KO FY2025 Annual Report",
    url: "https://investor.example.com/ko-2025",
    date: "2026-02-15",
    domain: "investor.example.com",
    reliability: "官方一手",
    content: "年报正文：FY2025 营收 470 亿美元，同比 +3%。".repeat(8),
  },
  {
    src: "SRC-2",
    title: "PE FY2025 10-K",
    url: "https://investor.example.com/pe-2025",
    date: "2026-02-10",
    domain: "investor.example.com",
    reliability: "权威媒体",
  },
];

export const REVIEW_PASS: ReviewDelivery = { case_id: "c", verdict: "pass", issues: [], report_markdown: OK_REPORT };
export const REVIEW_ISSUES: ReviewIssue[] = [
  { point: "PE 营收 920 亿美元（SRC-2）", problem: "单一来源且页面打不开，佐证不足", fix_hint: "补查 PE 官网 10-K 或权威媒体二手引用，死链换源" },
];
export const REVIEW_FIX: ReviewDelivery = { case_id: "c", verdict: "fix", issues: REVIEW_ISSUES, report_markdown: "" };
export const REVIEW_FIX_NO_ISSUES: ReviewDelivery = { case_id: "c", verdict: "fix", issues: [], report_markdown: "" };
export const REVIEW_PASS_WITH_ISSUES: ReviewDelivery = { case_id: "c", verdict: "pass", issues: REVIEW_ISSUES, report_markdown: OK_REPORT };
