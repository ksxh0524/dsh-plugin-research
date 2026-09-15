/** config.ts —— research 插件的用户配置存取（settings 页 UI 的数据面）。
 *
 * 设计约束：
 * - 形态 = 落盘 JSON（`<ws>/.runtime/research/config.json`），与 session 账本同根（.runtime 是
 *   基础设施面，不进 research 工具契约——主题进报告出的零宿主概念不动）。
 * - 逻辑版本门（AGENTS 增量状态铁律）：RESEARCH_CONFIG_VERSION 之外的存量快照一律作废回默认——
 *   语义一变必须 bump 常量，代码修复永不追溯旧文件。
 * - 模型字段 = "provider/model" 二段式（与 RouteInput 同形）；空串 = 跟随工作区路由键
 *   （现状行为，配置面永远可选不填）。
 * - 思考强度枚举 = ""（跟随工作区）+ low|medium|high|xhigh（runner 原样透传 reasoningEffort）。
 * - 写入原子化：tmp + rename；校验失败的 patch 整体拒收（fail-loud 收据，不静默部分应用）。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { findAutomationWorkspace } from "aivideo-core/src/project/index.ts";
import type { RouteInput } from "./engine.ts";
import type { ToolExec } from "./lib/host.ts";
import { join } from "node:path";

/** 落盘快照版本：语义变更时 bump，旧文件整体作废（版本门，拒收测试兜底）。 */
export const RESEARCH_CONFIG_VERSION = 1;

/** 思考强度可选档（"" = 跟随工作区路由声明）。 */
export const THINKING_LEVELS = ["low", "medium", "high", "xhigh"] as const;

export type ResearchConfig = {
  version: number;
  /** 默认模型（"provider/model"）；空 = 两角色都跟随工作区路由键。 */
  model: string;
  /** 默认思考强度；空 = 跟随工作区路由声明。 */
  thinking: string;
  /** 高级：Research / Review 分开配（false = 两角色共用 model/thinking）。 */
  split: boolean;
  /** 分开配时 Research 角色的覆盖（空 = 跟随默认）。 */
  researchModel: string;
  researchThinking: string;
  /** 分开配时 Review 角色的覆盖（空 = 跟随默认）。 */
  reviewModel: string;
  reviewThinking: string;
};

/** 缺省配置：全空 = 完全跟随工作区路由（现状行为，UI 装出来就是这个态）。 */
export function defaultConfig(): ResearchConfig {
  return {
    version: RESEARCH_CONFIG_VERSION,
    model: "",
    thinking: "",
    split: false,
    researchModel: "",
    researchThinking: "",
    reviewModel: "",
    reviewThinking: "",
  };
}

export function researchConfigPath(ws: string): string {
  return join(ws, ".runtime", "research", "config.json");
}

/** 读取（ws 缺省走 cwd 探测）：缺文件 → 默认；版本不符 → 作废回默认；JSON 坏 → 抛（fail-loud，用户改对再跑）。 */
export function readResearchConfig(ws?: string): ResearchConfig {
  const root = ws ? ws : resolveResearchWorkspace(undefined, undefined);
  let raw: string;
  try {
    raw = readFileSync(researchConfigPath(root), "utf8");
  } catch {
    return defaultConfig();
  }
  const data = JSON.parse(raw) as Record<string, unknown>;
  if (data.version !== RESEARCH_CONFIG_VERSION) return defaultConfig();
  const d = defaultConfig();
  return {
    version: RESEARCH_CONFIG_VERSION,
    model: typeof data.model === "string" ? data.model.trim() : d.model,
    thinking: typeof data.thinking === "string" ? data.thinking.trim() : d.thinking,
    split: data.split === true,
    researchModel: typeof data.researchModel === "string" ? data.researchModel.trim() : d.researchModel,
    researchThinking: typeof data.researchThinking === "string" ? data.researchThinking.trim() : d.researchThinking,
    reviewModel: typeof data.reviewModel === "string" ? data.reviewModel.trim() : d.reviewModel,
    reviewThinking: typeof data.reviewThinking === "string" ? data.reviewThinking.trim() : d.reviewThinking,
  };
}

export type ConfigPatch = Partial<Omit<ResearchConfig, "version">>;

/** 校验 patch：模型二段式（空合法）、思考档枚举（空合法）、split 布尔。返回错误清单（空 = 通过）。 */
export function validateConfigPatch(patch: unknown): string[] {
  const errors: string[] = [];
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return ["patch 必须是对象"];
  const p = patch as Record<string, unknown>;
  const known = ["model", "thinking", "split", "researchModel", "researchThinking", "reviewModel", "reviewThinking"];
  for (const key of Object.keys(p)) {
    if (!known.includes(key)) errors.push(`未知字段「${key}」（可用：${known.join("、")}）`);
  }
  for (const key of ["model", "researchModel", "reviewModel"]) {
    const v = p[key];
    if (v === undefined || v === "") continue;
    if (typeof v !== "string") {
      errors.push(`${key} 必须是字符串`);
      continue;
    }
    const t = v.trim();
    if (!t) continue;
    const i = t.indexOf("/");
    if (i <= 0 || i === t.length - 1 || !t.slice(0, i).trim() || !t.slice(i + 1).trim()) {
      errors.push(`${key} 必须是 "provider/model" 二段式（收到：${t}）`);
    }
  }
  for (const key of ["thinking", "researchThinking", "reviewThinking"]) {
    const v = p[key];
    if (v === undefined || v === "") continue;
    if (typeof v !== "string" || !THINKING_LEVELS.includes(v as (typeof THINKING_LEVELS)[number])) {
      errors.push(`${key} 只接受 ${THINKING_LEVELS.join("|")}（收到：${String(v)}）`);
    }
  }
  if (p.split !== undefined && typeof p.split !== "boolean") errors.push("split 必须是布尔");
  return errors;
}

/** 写入（读-改-写 + 原子 rename）：patch 校验失败 = 抛（fail-loud）；成功返回合并后的完整配置。 */
export function writeResearchConfig(ws: string, patch: unknown): ResearchConfig {
  const errors = validateConfigPatch(patch);
  if (errors.length > 0) throw new Error(`research 配置校验失败：${errors.join("；")}`);
  const current = readResearchConfig(ws);
  const p = (patch ?? {}) as Record<string, unknown>;
  const next: ResearchConfig = {
    version: RESEARCH_CONFIG_VERSION,
    model: p.model !== undefined ? String(p.model ?? "").trim() : current.model,
    thinking: p.thinking !== undefined ? String(p.thinking ?? "").trim() : current.thinking,
    split: p.split !== undefined ? p.split === true : current.split,
    researchModel: p.researchModel !== undefined ? String(p.researchModel ?? "").trim() : current.researchModel,
    researchThinking: p.researchThinking !== undefined ? String(p.researchThinking ?? "").trim() : current.researchThinking,
    reviewModel: p.reviewModel !== undefined ? String(p.reviewModel ?? "").trim() : current.reviewModel,
    reviewThinking: p.reviewThinking !== undefined ? String(p.reviewThinking ?? "").trim() : current.reviewThinking,
  };
  const path = researchConfigPath(ws);
  mkdirSync(join(ws, ".runtime", "research"), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
  return next;
}

/** 单角色生效路由（split 拆分 + 空字段回落默认链）。 */
function roleRoute(cfg: ResearchConfig, role: "research" | "review"): RouteInput | null {
  const model = (role === "review" ? (cfg.split ? cfg.reviewModel : "") : cfg.split ? cfg.researchModel : "") || cfg.model;
  const thinking = (role === "review" ? (cfg.split ? cfg.reviewThinking : "") : cfg.split ? cfg.researchThinking : "") || cfg.thinking;
  if (!model.trim()) return null;
  const i = model.indexOf("/");
  if (i <= 0) return null;
  const provider = model.slice(0, i).trim();
  const name = model.slice(i + 1).trim();
  if (!provider || !name) return null;
  const t = thinking.trim();
  return t ? { provider, model: name, thinkingLevel: t } : { provider, model: name };
}

/** 生效路由（UI 配置 → 引擎输入）：researcher 供工序①③，reviewer 供工序②；未配 = null（跟随工作区路由键）。 */
export function effectiveRoutes(cfg: ResearchConfig): { researcher: RouteInput | null; reviewer: RouteInput | null } {
  return { researcher: roleRoute(cfg, "research"), reviewer: roleRoute(cfg, "review") };
}

/** 工具/服务落点工作区：config.workspace 优先；cwd 向上锚探测兜底（锚找不到不炸——插件的
 * 会话 cwd 不必然在锚下，回落会话 cwd 本身），再兜进程 cwd。仅用于路由/配置解析，不是调用参数。 */
export function resolveResearchWorkspace(exec: ToolExec | undefined, configWorkspace?: string): string {
  if (configWorkspace) return configWorkspace;
  const cwd = String(exec?.agent?.session?.meta?.cwd ?? exec?.agent?.session?.header?.cwd ?? process.cwd());
  try {
    const anchored = findAutomationWorkspace(cwd);
    if (anchored) return anchored;
  } catch {
    /* 无锚：回落 cwd 本身 */
  }
  return cwd;
}
