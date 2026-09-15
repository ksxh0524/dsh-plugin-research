/** host.ts —— 宿主边界窄接口（结构化类型，不依赖 dsh 内部类；与写作包 host.ts 同形）。 */
import type { ToolRunContext } from "@deepseek-ai/dsh-tools";
import type { WebSeam } from "../web.ts";

export interface HostContext {
  tools?: { register(tool: unknown): unknown; get?(name: string): unknown };
  inject?(names: readonly string[], cb: (resolved: unknown) => void): void;
  /** cordis reflect 面（配置服务 ctx.reflect.provide 注册 Remote；官方 cordis ctx 能力，窄脸收口）。 */
  reflect?: { provide(name: string, instance: unknown): unknown };
  subagents?: {
    start(provider: string, request: unknown): Promise<{ result: Promise<unknown> }>;
  };
  /** web seam（dsh-tool-web 持有 web_search/web_fetch；搜索 provider 注册面，窄脸见 web.ts）。 */
  web?: WebSeam;
  logger?: { info?(message: string): void; warn?(message: string): void };
}

/** 工具 execute 的 exec 窄面（ToolRunContext 的插件用面）。 */
export type ToolExec = ToolRunContext & {
  agent?: {
    session?: { meta?: { cwd?: string }; requestHeader?(): unknown; header?: { cwd?: string } };
    options?: { provider?: string; model?: string };
  };
  /** 过程播报（官方 onUpdate 同位；编排 say 透传）。 */
  onProgress?(update: { content: Array<{ type: string; text: string }> }): void;
  signal?: AbortSignal;
};
