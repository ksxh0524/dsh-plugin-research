/** tools.ts —— dsh-plugin-research DSH 工具面（注册形与写作包同构；跨域调研唯一入口 research_build）。
 *
 * 注册面（cordis apply 一次性 register，行名=包名三处同步）：
 * - research_build：问题清单（显式 questions ∪ 源文档 **待核实** 提取）→ 隔离写手子会话做
 *   web 调研（web_search/web_fetch）→ 内容门 → 留档 <项目>/底稿/调研.md（append）→ 收据；
 * - 派单 = makeDshDispatch 裸接线（**单路由口径** 2026-09-15 用户拍板：fallback 暂不写；调研频次低，
 *   限流/熔断包装 v1 不接——写作簇 makeRatelimitedDispatch 同位，将来接则在此处包一层）；
 * - 无读门无围栏：写手任务书自带问题全文，子会话不需要项目读权（v1 不 toolFilter；
 *   R2 若收围栏，须先实测 web 工具的运行时 id 名册再 allow，防错名静默断检）。
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import { findAutomationWorkspace } from "aivideo-core/src/project/index.ts";
import { makeDshDispatch } from "aivideo-core/src/subagent/runner.ts";
import { runResearchBuild } from "./engine.ts";
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

/** 工具落点工作区：config.workspace 优先；cwd 向上锚探测兜底（锚找不到不炸——跨域插件
 * 的会话 cwd 不必然在自动剪辑锚下，回落会话 cwd 本身），再兜进程 cwd。 */
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
    name: "research_build",
    description:
      "跨域调研（唯一入口）：给问题清单（questions 显式传，或从源文档 **待核实** 条目提取，缺省扫 底稿/大纲.md）→ 隔离写手子会话用 web_search/web_fetch 定向查证 → 证据行留档进 底稿/调研.md（append，日期小节隔离）。单路由口径：fallback 未启用。查不到的如实进待核实余项，不编造。",
    parameters: {
      project: { type: "string", required: true, description: "项目（裸项目名或「制作中/<项目名>」，裸名自动定位）" },
      questions: {
        type: "array",
        items: { type: "string" },
        description: "显式问题清单（与源文档待核实条目合并去重；两者皆空则 fail-loud 不空跑）",
      },
      source: { type: "string", description: "源文档项目相对路径（从中提取 **待核实** 条目；缺省 底稿/大纲.md，显式给定则不可读直接报错）" },
      path: { type: "string", description: "证据落点项目相对路径（缺省 底稿/调研.md；append 追加日期小节）" },
      label: { type: "string", description: "调研主题（留档小节标题，缺省「定向调研」）" },
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
      render: (_args: unknown, value: unknown) => [{ type: "text", text: String((value as { summary?: string })?.summary ?? "") }],
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
      const out = await runResearchBuild(
        {
          project: String(args?.project || ""),
          questions: args?.questions,
          source: args?.source,
          path: args?.path,
          label: args?.label,
          routes: spec.routes,
          routeKey: spec.routeKey,
        },
        { ws, dispatch, say, signal: exec?.signal, agent: exec?.agent },
      );
      return { summary: out.text, verdict: out.verdict, details: out.details };
    },
  });
}

/** 注册面（tests 直接消费；ctx 换 fake）。 */
export function createResearchTools(config?: { workspace?: string; routeKey?: string; routes?: unknown; ctx?: HostContext }): unknown[] {
  const ctx = config?.ctx ?? {};
  return [makeResearchTool({ configWorkspace: config?.workspace, routeKey: config?.routeKey, routes: config?.routes, ctx })];
}
