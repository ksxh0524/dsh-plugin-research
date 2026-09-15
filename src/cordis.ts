/** cordis.ts —— dsh-plugin-research 挂载适配层（官方插件形：default={name,inject,apply}）。
 *
 * inject 声明 tools/subagents（派单通道依赖 ctx.subagents）；
 * config 由 bundle patch 行注入（workspace/routeKey/routes；patch 行整体替换目标 config，
 * 所有键都要在 patch 行重述）。无 guard 挂点：调研编排自身是唯一写者（收据驱动），子会话无写权。
 */

import { createResearchTools } from "./tools.ts";
import type { HostContext } from "./lib/host.ts";

export const name = "dsh-plugin-research";

export const inject = ["tools", "subagents"];

/** bundle 行 config 形（cordis.patch.yml 的 config 段与此对齐）。 */
export type CordisConfig = {
  workspace?: string;
  routeKey?: string;
  routes?: unknown;
};

export function apply(ctx: HostContext, config?: CordisConfig): { unregister: () => void } {
  for (const tool of createResearchTools({ workspace: config?.workspace, routeKey: config?.routeKey, routes: config?.routes, ctx })) {
    ctx.tools?.register?.(tool);
  }
  ctx.logger?.info?.("[dsh-plugin-research] research_build 已注册（跨域调研；单路由口径，fallback 未启用）");
  return { unregister: () => {} };
}

export default { name, inject, apply };
