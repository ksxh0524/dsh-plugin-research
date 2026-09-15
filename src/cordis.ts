/** cordis.ts —— dsh-plugin-research 挂载适配层（官方插件形：default={name,inject,apply}）。
 *
 * 双职责：
 * ① 注册 research 工具（tools/subagents/web；派单通道依赖 ctx.subagents，搜索 provider 识别依赖 web seam）；
 * ② 把 research 配置段装进宿主 settings 系统（`settings.installSection("research", SCHEMA, entry)`，
 *    官方插件设置的正位——宿主设置页「插件」分区按 served namespace ∩ settings.plugin.item 卡派发，
 *    值落 ~/.dsh/settings.yaml 热推送；官方样板 = dsh-agent-default-model 的 agent-default-model 段）。
 *
 * inject 声明 tools/subagents/web/reflect/settings；config 由 bundle patch 行注入（workspace/routeKey/routes；
 * patch 行整体替换目标 config，所有键都要在 patch 行重述）。无 guard 挂点：调研编排自身是唯一写者。
 *
 * 零依赖铁律（勿改 import 官方协议包）：本包运行在宿主 node 进程里但被 pnpm 链接在文件目录下，import
 * `@deepseek-ai/dsh-typert-protocol` / `@deepseek-ai/cordis` 会解析出第二副本，Service 原型链与
 * instanceof 判定跨副本失效——Remote 标记按协议形态手工落两件套（① 实例字段 `typertRemote`；
 * ② 原型字符串键 "@deepseek-ai/dsh-typert-protocol/remote-methods"）。schemastery 不在此列：
 * 它是被宿主按数据消费的 schema 库（无 Service 原型语义），插件自装同包实例安全（官方插件同款姿势）。
 * SRC 模式参数约束：方法参数 = 不带默认值/解构/rest 的单一标识符（`: unknown` strip 后空白可安全携带）。
 * 两端契约：lib/client.js 的 descriptor（方法名+参数名+sourceLocation）与本文件隐式配对，
 * 改任何一端必须跑 tests/contract-pair.test.ts。
 */

import z from "@deepseek-ai/schemastery";
import { applyConfigPatch, defaultConfig, normalizeConfig, resolveResearchWorkspace, validateConfigPatch, type ResearchConfig } from "./config.ts";
import { resolvePrimaryRoute } from "./engine.ts";
import type { HostContext } from "./lib/host.ts";
import { createResearchTools } from "./tools.ts";

export const name = "dsh-plugin-research";

export const inject = ["tools", "subagents", "web", "reflect", "settings"];

/** bundle 行 config 形（cordis.patch.yml 的 config 段与此对齐）。 */
export type CordisConfig = {
  workspace?: string;
  routeKey?: string;
  routes?: unknown;
};

/** 宿主 settings 系统里本插件的 namespace（lowercase hyphenated；插件卡 key 与之一致）。 */
export const RESEARCH_SETTINGS_NAMESPACE = "research";

/** 配置段 schema（schemastery；宿主 settings 系统按它解析/校验/持久化文档层）。字段全可选：空 = 跟随。 */
export const RESEARCH_SETTINGS_SCHEMA = z.object({
  model: z.string(),
  thinking: z.string(),
  split: z.boolean(),
  researchModel: z.string(),
  researchThinking: z.string(),
  reviewModel: z.string(),
  reviewThinking: z.string(),
});

/** 宿主 settings 面窄脸（agent-default-model 同款读写位：installSection 注册段 / replace 写值）。 */
interface SettingsFace {
  installSection?(owner: unknown, ns: string, schema: unknown, entry: unknown, hooks: unknown): void;
  replace?(ns: string, value: unknown): Promise<void> | void;
}

/** 配置服务（插件卡 Remote：getConfig/setConfig；live 配置由 installSection setSource 回灌）。 */
export class ResearchConfigService {
  ctx: HostContext;
  workspace: string;
  typertRemote: { service: ResearchConfigService; serviceKey: string; namespace: string };
  /** 当前生效配置（installSection 回灌的 live 闭包；settings 面缺席 = 空配置——完全跟随工作区路由）。 */
  source: () => ResearchConfig;

  constructor(ctx: HostContext, workspace: string) {
    this.ctx = ctx;
    this.workspace = workspace;
    this.typertRemote = Object.freeze({ service: this, serviceKey: "research", namespace: "research" });
    this.source = defaultConfig;
  }

  private settingsFace(): SettingsFace | undefined {
    return (this.ctx as { get?(name: string): unknown }).get?.("settings") as SettingsFace | undefined;
  }

  /** 读配置 + 附 UI 所需事实（workspaceRoute = 当前工作区路由缺省，供 placeholder；路由缺位留空不抛）。 */
  async getConfig(_hint: unknown) {
    let workspaceRoute = "";
    try {
      const r = resolvePrimaryRoute(this.workspace, {});
      workspaceRoute = `${r.provider}/${r.model}${r.thinkingLevel ? `/${r.thinkingLevel}` : ""}`;
    } catch {
      /* 工作区路由键缺位：placeholder 走通用提示，不抛 */
    }
    return { config: this.source(), workspaceRoute };
  }

  /** 写配置：patch 归一化 + 形状预检 → 宿主 settings.replace（schema 校验/持久化 settings.yaml/热推送）。
   *  settings 面缺席 = 抛（fail-loud：没有宿主就没有持久化位，不静默吞写）。 */
  async setConfig(patch: unknown) {
    const errors = validateConfigPatch(patch);
    if (errors.length > 0) throw new Error(`research 配置校验失败：${errors.join("；")}`);
    const settings = this.settingsFace();
    if (!settings?.replace) throw new Error("宿主 settings 服务缺席：无法写入 research 配置段（settings.yaml）");
    const next = applyConfigPatch(this.source(), patch);
    await settings.replace(RESEARCH_SETTINGS_NAMESPACE, next);
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
  // 配置段装进宿主 settings 系统（served namespace = 插件卡派发的服务端半）：
  // installSection 把 schema + base 装进宿主，setSource 回灌 live 闭包；settings.yaml 变更热推送 → 工具即时生效。
  ctx.inject?.(["settings"], (settingsCtx: unknown) => {
    const face = (settingsCtx ?? {}) as { settings?: SettingsFace };
    face.settings?.installSection?.(ctx, RESEARCH_SETTINGS_NAMESPACE, RESEARCH_SETTINGS_SCHEMA, defaultConfig(), {
      setSource: (source: () => unknown) => {
        service.source = () => normalizeConfig(source());
      },
      onChange: () => {},
    });
  });
  for (const tool of createResearchTools({
    workspace: config?.workspace,
    routeKey: config?.routeKey,
    routes: config?.routes,
    readConfig: () => service.source(),
    ctx,
  })) {
    ctx.tools?.register?.(tool);
  }
  ctx.logger?.info?.("[dsh-plugin-research] research 已注册（工具 + settings 段 research + Remote 服务）");
  return { unregister: () => {} };
}

export default { name, inject, apply };
