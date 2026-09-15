/** tools.ts —— dsh-plugin-research DSH 工具面（通用主题式调研，唯一入口 research）。
 *
 * 注册面（cordis apply 一次性 register，行名=包名三处同步）：
 * - research：给主题（如「收集 2025 财年可口可乐与百事的全部财报与研报」），隔离写手子会话
 *   自主分解研究线 → web_search/web_fetch 定向查证 → 自检补漏 → 合成带来源完整报告 →
 *   收据回全文；project 可选（给了就留档 底稿/调研.md，证据行合同兼容 outline 引用门；
 *   无 topic 时自动扫大纲 **待核实** 条目当研究线）；
 * - 搜索 provider 识别 = 宿主 web seam（配 exa/deepseek 哪个用哪个；无可用 provider 提前拒，
 *   不派注定失败的写手）；
 * - 派单 = makeDshDispatch 裸接线（**单路由口径** 2026-09-15：fallback 暂不写；调研频次低，
 *   限流/熔断包装 v1 不接——写作簇 makeRatelimitedDispatch 同位，将来接则在此处包一层）；
 * - 无读门无围栏：任务书自带主题与守则，子会话不需要项目读权（v1 不 toolFilter；
 *   收围栏前须先实测 web 工具运行时 id 名册，防错名静默断检）。
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import { findAutomationWorkspace } from "aivideo-core/src/project/index.ts";
import { makeDshDispatch } from "aivideo-core/src/subagent/runner.ts";
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

/** 工具落点工作区：config.workspace 优先；cwd 向上锚探测兜底（锚找不到不炸——跨域插件的
 * 会话 cwd 不必然在自动剪辑锚下，回落会话 cwd 本身），再兜进程 cwd。 */
export function resolveResearchWorkspace(exec: ToolExec | undefined, configWorkspace?: string): string {
  if (configWorkspace) return configWorkspace;
  const cwd = String(exec?.agent?.session?.meta?.cwd ?? exec?.agent?.session?.header?.cwd ?? process.cwd());
  try {
    const anchored = findAutomationWorkspace(cwd);
    if (anchored) return anchored;
  } catch {
    /* 无锚：回落 cwd 本身（跨域会话 cwd 即工作区根的常态） */
  }
  return cwd;
}

/** JSON 值域（dsh-util-values 非直接依赖，本地同构别名——写作包同款）。 */
type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];
type BuildOutput = { verdict: string; text: string; details: Record<string, JsonValue> };

function makeResearchTool(spec: { configWorkspace?: string; routeKey?: string; routes?: unknown; ctx: HostContext }): unknown {
  return dtool({
    name: "research",
    description:
      "通用主题式深度调研（deep-research 型，唯一入口）：给一个主题（如「收集 2025 财年可口可乐与百事的全部财报与研报」），隔离写手子会话自主分解研究线 → web_search/web_fetch 定向查证 → 自检补漏 → 合成带来源的完整调研报告（内联 [SRC-n] + 编号来源清单）交回调用方。注意：这是深度调研工具，不是轻量单查——单点小问题直接 web_search 即可，别占这里。可选 project（裸项目名或「制作中/<项目名>」）：给了就把报告与证据行留档进 <项目>/底稿/调研.md（证据行兼容 outline 引用覆盖门），且无 topic 时自动扫大纲 **待核实** 条目当研究线。搜索 provider 读宿主 web seam 配置（exa/deepseek，配谁用谁）。单路由口径：fallback 未启用。",
    parameters: {
      topic: { type: "string", description: "调研主题（一句话；带项目且不传时自动扫 底稿/大纲.md 的 **待核实** 条目）" },
      project: { type: "string", description: "项目（可选；裸项目名或「制作中/<项目名>」。给了就留档 底稿/调研.md，不给则纯返回报告" },
      path: { type: "string", description: "证据落点项目相对路径（缺省 底稿/调研.md；仅 project 模式生效）" },
      label: { type: "string", description: "调研主题标签（缺省取主题前 40 字）" },
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
        const v = value as { summary?: string; details?: { report?: string } };
        const blocks = [{ type: "text", text: String(v?.summary ?? "") }];
        const report = String(v?.details?.report ?? "");
        if (report) blocks.push({ type: "text", text: report });
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
      if (!dispatch) return { verdict: "error", summary: "宿主无 subagents 派单通道：调研写手会话无法建立", details: {} };
      const out = await runResearch(
        {
          topic: args?.topic,
          project: args?.project,
          path: args?.path,
          label: args?.label,
          routes: spec.routes,
          routeKey: spec.routeKey,
        },
        { ws, dispatch, web: spec.ctx?.web, say, signal: exec?.signal, agent: exec?.agent },
      );
      return { summary: out.text, verdict: out.verdict, details: { ...out.details, report: out.report } };
    },
  });
}

/** 注册面（tests 直接消费；ctx 换 fake）。 */
export function createResearchTools(config?: { workspace?: string; routeKey?: string; routes?: unknown; ctx?: HostContext }): unknown[] {
  const ctx = config?.ctx ?? {};
  return [makeResearchTool({ configWorkspace: config?.workspace, routeKey: config?.routeKey, routes: config?.routes, ctx })];
}
