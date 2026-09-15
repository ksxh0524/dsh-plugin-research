/** config.ts —— research 用户配置的纯函数面（宿主插件卡的配置数据模型）。
 *
 * 设计约束：
 * - **持久化归宿主**：配置值走宿主 settings 系统（cordis 侧 `settings.installSection(ns, schema, entry)`
 *   注册 namespace "research"，落 `~/.dsh/settings.yaml`，热推送；官方样板 = dsh-agent-default-model）。
 *   本文件不做文件 IO——v0.5.0 初版的手搓 JSON 文件路径随宿主 settings 方案退场（未发布无存量，无迁移负担）。
 * - 本文件只留：配置类型、空配置缺省、UI 配置 → 引擎路由的拆分链（roleRoute/effectiveRoutes）。
 * - 写入校验交给宿主 settings schema（schemastery，见 cordis.ts RESEARCH_SETTINGS_SCHEMA）——replace fail-loud。
 * - 模型字段 = "provider/model" 二段式（与 RouteInput 同形）；空串 = 跟随工作区路由键
 *   （现状行为，配置面永远可选不填）。
 * - 思考强度枚举 = ""（跟随工作区）+ low|medium|high|xhigh（runner 原样透传 reasoningEffort）。
 */
import { findAutomationWorkspace } from "aivideo-core/src/project/index.ts";
import { join } from "node:path";
import type { RouteInput } from "./engine.ts";
import type { ToolExec } from "./lib/host.ts";

/** 思考强度可选档（"" = 跟随工作区路由声明）。 */
export const THINKING_LEVELS = ["low", "medium", "high", "xhigh"] as const;

export type ResearchConfig = {
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

/** 空配置：全空 = 完全跟随工作区路由（现状行为，插件卡装出来就是这个态）。 */
export function defaultConfig(): ResearchConfig {
  return { model: "", thinking: "", split: false, researchModel: "", researchThinking: "", reviewModel: "", reviewThinking: "" };
}

/** patch 合并（undefined 字段保留现值；字符串 trim；split 严格布尔）——settings.replace 前的归一化。 */
export function applyConfigPatch(current: ResearchConfig, patch: unknown): ResearchConfig {
  const p = (patch ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    model: p.model !== undefined ? str(p.model) : current.model,
    thinking: p.thinking !== undefined ? str(p.thinking) : current.thinking,
    split: p.split !== undefined ? p.split === true : current.split,
    researchModel: p.researchModel !== undefined ? str(p.researchModel) : current.researchModel,
    researchThinking: p.researchThinking !== undefined ? str(p.researchThinking) : current.researchThinking,
    reviewModel: p.reviewModel !== undefined ? str(p.reviewModel) : current.reviewModel,
    reviewThinking: p.reviewThinking !== undefined ? str(p.reviewThinking) : current.reviewThinking,
  };
}

/** patch 形状预检（settings.replace 前的快速失败；类型级校验由宿主 schema 兜底）。 */
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

/** settings 段值归一化（缺字段补空缺省——schemastery 可选字段 unset 时缺键）。 */
export function normalizeConfig(value: unknown): ResearchConfig {
  const v = (value ?? {}) as Record<string, unknown>;
  const d = defaultConfig();
  const str = (k: "model" | "thinking" | "researchModel" | "researchThinking" | "reviewModel" | "reviewThinking") =>
    typeof v[k] === "string" ? (v[k] as string) : d[k];
  return {
    model: str("model"),
    thinking: str("thinking"),
    split: v.split === true,
    researchModel: str("researchModel"),
    researchThinking: str("researchThinking"),
    reviewModel: str("reviewModel"),
    reviewThinking: str("reviewThinking"),
  };
}

/** 生效路由（UI 配置 → 引擎输入）：researcher 供工序①③，reviewer 供工序②；未配 = null（跟随工作区路由键）。 */
export function effectiveRoutes(cfg: ResearchConfig): { researcher: RouteInput | null; reviewer: RouteInput | null } {
  return { researcher: roleRoute(cfg, "research"), reviewer: roleRoute(cfg, "review") };
}

/** 工具/服务落点工作区：config.workspace 优先；cwd 向上锚探测兜底（锚找不到不炸——插件的
 * 会话 cwd 不必然在锚下，回落会话 cwd 本身），再兜进程 cwd。仅用于路由解析，不是调用参数。 */
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
