/** cordis.ts —— dsh-plugin-research 挂载适配层（官方插件形：default={name,inject,apply}）。
 *
 * 双职责：
 * ① 注册 research 工具（tools/subagents/web；派单通道依赖 ctx.subagents，搜索 provider 识别依赖 web seam）；
 * ② 注册 research 配置服务（Remote 只两方法 getConfig/setConfig，settings 页 UI 的数据面；
 *    配置落 `<ws>/.runtime/research/config.json`，见 src/config.ts——工具 execute 时读同一份）。
 *
 * inject 声明 tools/subagents/web/reflect；config 由 bundle patch 行注入（workspace/routeKey/routes；
 * patch 行整体替换目标 config，所有键都要在 patch 行重述）。无 guard 挂点：调研编排自身是唯一写者。
 *
 * 零依赖铁律（勿改 import 官方包）：本包运行在宿主 node 进程里但被 pnpm 链接在文件目录下，import
 * `@deepseek-ai/dsh-typert-protocol` / `@deepseek-ai/cordis` 会解析出第二副本，Service 原型链与
 * instanceof 判定跨副本失效。Remote 标记按协议形态手工落两件套：
 *   ① 实例字段 `typertRemote = { service, serviceKey, namespace }`（gateway validateBinding 读它）；
 *   ② 原型字符串键 `"@deepseek-ai/dsh-typert-protocol/remote-methods"`（跨副本可读，version 1 认领）。
 * SRC 模式参数约束：方法参数 = 不带默认值/解构/rest 的单一标识符（`: unknown` strip 后空白可安全携带）。
 * 两端契约：lib/client.js 的 descriptor（方法名+参数名+sourceLocation）与本文件隐式配对，
 * 改任何一端必须跑 tests/contract-pair.test.ts。
 */

import {
  defaultConfig,
  readResearchConfig,
  researchConfigPath,
  resolveResearchWorkspace,
  validateConfigPatch,
  writeResearchConfig,
  type ConfigPatch,
  type ResearchConfig,
} from "./config.ts";
import { resolvePrimaryRoute } from "./engine.ts";
import type { HostContext } from "./lib/host.ts";
import { createResearchTools } from "./tools.ts";

export const name = "dsh-plugin-research";

export const inject = ["tools", "subagents", "web", "reflect"];

/** bundle 行 config 形（cordis.patch.yml 的 config 段与此对齐）。 */
export type CordisConfig = {
  workspace?: string;
  routeKey?: string;
  routes?: unknown;
};

/** 配置服务（settings 页 Remote：getConfig/setConfig；零依赖手搓 SRC 标记，见 usage-stats 同形注释）。 */
export class ResearchConfigService {
  ctx: HostContext;
  workspace: string;
  typertRemote: { service: ResearchConfigService; serviceKey: string; namespace: string };

  constructor(ctx: HostContext, workspace: string) {
    this.ctx = ctx;
    this.workspace = workspace;
    this.typertRemote = Object.freeze({ service: this, serviceKey: "research", namespace: "research" });
  }

  /** 读配置 + 附 UI 所需事实（workspaceRoute = 当前工作区路由缺省，供 placeholder；路由缺位留空不抛）。 */
  async getConfig(_hint: unknown) {
    const cfg = readResearchConfig(this.workspace);
    let workspaceRoute = "";
    try {
      const r = resolvePrimaryRoute(this.workspace, {});
      workspaceRoute = `${r.provider}/${r.model}${r.thinkingLevel ? `/${r.thinkingLevel}` : ""}`;
    } catch {
      /* 工作区路由键缺位：placeholder 走通用提示，不抛 */
    }
    return { config: cfg, configPath: researchConfigPath(this.workspace), workspaceRoute, defaults: defaultConfig() };
  }

  /** 写配置（校验失败抛错 → 网关错误收据；成功返回合并后的完整配置）。 */
  async setConfig(patch: unknown) {
    const errors = validateConfigPatch(patch);
    if (errors.length > 0) throw new Error(`research 配置校验失败：${errors.join("；")}`);
    const next = writeResearchConfig(this.workspace, patch as ConfigPatch);
    this.ctx?.logger?.info?.("[dsh-plugin-research] 配置已更新（settings 页）");
    return next;
  }
}

/** 手写 SRC Remote 标记（形态 = typert-protocol mark() 产物：{version:1, methods:[...]}）。 */
const REMOTE_METHODS_KEY = "@deepseek-ai/dsh-typert-protocol/remote-methods";
Object.defineProperty(ResearchConfigService.prototype, REMOTE_METHODS_KEY, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      Object.freeze({ method: "getConfig", invocation: Object.freeze({ kind: "direct" }) }),
      Object.freeze({ method: "setConfig", invocation: Object.freeze({ kind: "direct" }) }),
    ]),
  }),
});

export function apply(ctx: HostContext, config?: CordisConfig): { unregister: () => void } {
  const workspace = resolveResearchWorkspace(undefined, config?.workspace);
  const service = new ResearchConfigService(ctx, workspace);
  ctx.reflect?.provide?.("research", service);
  for (const tool of createResearchTools({ workspace: config?.workspace, routeKey: config?.routeKey, routes: config?.routes, ctx })) {
    ctx.tools?.register?.(tool);
  }
  ctx.logger?.info?.("[dsh-plugin-research] research 已注册（工具 + 配置服务；配置页 = research 命名空间）");
  return { unregister: () => {} };
}

export default { name, inject, apply };
