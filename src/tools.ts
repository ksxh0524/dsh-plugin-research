/** tools.ts —— dsh-plugin-research DSH 工具面（通用主题式调研，唯一入口 research）。
 *
 * 形态对齐通用 deep research 实证（gpt-researcher / open_deep_research）：**主题进、报告出**。
 * - research(topic, fetch_sources?)：给主题（如「收集 2025 财年可口可乐与百事的全部财报与研报」），
 *   隔离调研员（Researcher）子会话自主分解研究线 → web_search/web_fetch 定向查证 → 来源核查
 *   （有用性/单一来源检测/可靠性评级/多方比对——默认内建，不占参数）→ 合成带来源完整报告 →
 *   收据回全文。零宿主参数——留档是调用方自己的事；fetch_sources（缺省 false）= 把引用来源
 *   全文拉下来随报告附回；
 * - 搜索 provider 识别 = 宿主 web seam（配 exa/deepseek 哪个用哪个；无可用 provider 提前拒，
 *   不派注定失败的调研员）；
 * - 派单 = makeDshDispatch 裸接线（**单路由口径** 2026-09-15：fallback 暂不写；调研频次低，
 *   限流/熔断包装 v1 不接——写作簇 makeRatelimitedDispatch 同位，将来接则在此处包一层）；
 * - 无读门无围栏：任务书自带主题与守则，子会话不需要任何读权（v1 不 toolFilter；
 *   收围栏前须先实测 web 工具运行时 id 名册，防错名静默断检）。
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import { makeDshDispatch } from "aivideo-core/src/subagent/runner.ts";
import { effectiveRoutes, readResearchConfig, resolveResearchWorkspace } from "./config.ts";
import { runResearch } from "./engine.ts";
import type { HostContext, ToolExec } from "./lib/host.ts";

/** 工具 defineTool 桥面：参数为 rootless properties 简写（DSH 运行时接受，dsh-tools 面为
 * rootful ParameterSchemaSpec）——类型桥在此，逻辑面不撒类型谎（写作包同款）。 */
const dtool = defineTool as unknown as (def: {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output: { schema: Record<string, unknown>; render?: (args: unknown, value: unknown) => Array<{ type: string; text: string }> };
  execute: (args: unknown, exec: unknown) => Promise<unknown>;
}) => unknown;

/** JSON 值域（dsh-util-values 非直接依赖，本地同构别名——写作包同款）。 */
type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

function makeResearchTool(spec: { configWorkspace?: string; routeKey?: string; routes?: unknown; ctx: HostContext }): unknown {
  return dtool({
    name: "research",
    description:
      "通用主题式深度调研（deep-research 型，唯一入口）：给一个主题（如「收集 2025 财年可口可乐与百事的全部财报与研报」，给得粗或细都行，流程自判），引擎代码驱动三道隔离工序——① 调研员（Researcher）子会话自主分解研究线 → web_search/web_fetch 定向查证 → 逐源交叉比对 → 全量打标（可靠性五档/单一来源/佐证编号）合成初稿；② 审查员（Reviewer，隔离会话只拿冻结初稿）亲核来源出具结构化 issue 清单；③ 有疑问退回调研员修订轮补研。终稿必须过引擎代码门（来源清单逐行带〔可靠性：…〕、单源事实必标〔单一来源〕）才交回调用方（内联 [SRC-n] + 编号来源清单 + 可选来源全文附录）。可选 fetch_sources=true 把引用来源的全文拉下来随报告附回（缺省不要）。搜索 provider 读宿主 web seam 配置（exa/deepseek，配谁用谁）。单路由口径：fallback 未启用。",
    parameters: {
      topic: { type: "string", required: true, description: "调研主题（一句话，如「收集 2025 财年可口可乐与百事的全部财报与研报」）" },
      fetch_sources: { type: "boolean", description: "把引用来源的页面全文拉下来随报告附回（缺省 false——报告默认只带来源链接与可靠性标注）" },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          verdict: { type: "string", required: true },
          summary: { type: "string", required: true },
          details: { type: "object", additionalProperties: true },
        },
      },
      render: (_args: unknown, value: unknown): Array<{ type: string; text: string }> => {
        const v = value as { summary?: string; details?: { report?: string; source_appendix?: string } };
        const blocks = [{ type: "text", text: String(v?.summary ?? "") }];
        const report = String(v?.details?.report ?? "");
        if (report) blocks.push({ type: "text", text: report });
        const appendix = String(v?.details?.source_appendix ?? "");
        if (appendix) blocks.push({ type: "text", text: appendix });
        return blocks;
      },
    },
    async execute(rawArgs, rawExec) {
      const args = rawArgs as Record<string, unknown>;
      const exec = rawExec as unknown as ToolExec; // DSH 运行时实传 ToolRunContext + onProgress（类型面滞后），窄脸收口
      const ws = resolveResearchWorkspace(exec, spec.configWorkspace);
      const say = (text: string) => exec?.onProgress?.({ content: [{ type: "text", text }] });
      // exec.agent = 发起调用的宿主 Agent（DSH spawn 的 parent 必传；缺席 = 接线异常，warn 不阻断）。
      if (!exec?.agent) {
        spec.ctx?.logger?.warn?.("[dsh-plugin-research] exec.agent 缺席：spawn parent 将缺位（DSH agent-loop 实证 exec.agent 必在）");
      }
      const dispatch = makeDshDispatch(spec.ctx, exec?.agent);
      if (!dispatch) return { verdict: "error", summary: "宿主无 subagents 派单通道：调研员会话无法建立", details: {} };
      // UI 配置（.runtime/research/config.json）> patch 行 routes > 工作区路由键；审查员路由缺省 = 调研员同路由
      let routes: unknown = spec.routes;
      let reviewRoutes: unknown = undefined;
      const cfg = readResearchConfig(ws);
      const eff = effectiveRoutes(cfg);
      if (eff.researcher) {
        routes = [eff.researcher];
        reviewRoutes = eff.reviewer ? [eff.reviewer] : undefined;
      }
      const out = await runResearch(
        { topic: args?.topic, fetchSources: args?.fetch_sources, routes, reviewRoutes, routeKey: spec.routeKey },
        { ws, dispatch, web: spec.ctx?.web, say, signal: exec?.signal, agent: exec?.agent },
      );
      return { summary: out.text, verdict: out.verdict, details: { ...out.details, report: out.report, source_appendix: out.appendix } };
    },
  });
}

/** 注册面（tests 直接消费；ctx 换 fake）。 */
export function createResearchTools(config?: { workspace?: string; routeKey?: string; routes?: unknown; ctx?: HostContext }): unknown[] {
  const ctx = config?.ctx ?? {};
  return [makeResearchTool({ configWorkspace: config?.workspace, routeKey: config?.routeKey, routes: config?.routes, ctx })];
}
