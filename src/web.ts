/** web.ts —— 宿主 web seam 窄脸读口（识别用户配置的搜索 provider，配谁用谁）。
 *
 * 依据（发布物实证，dsh-web/lib/index.js WebRuntime）：
 * - searchProviders: Map<id, provider>，provider.available() 判可用；
 * - searchProviderId = config.searchProvider ?? env DSH_WEB_SEARCH_PROVIDER（显式选择）；
 * - 选择规则：显式配置命中且可用 → 用它；否则唯一可用者当选；多可用未配置 → 宿主侧
 *   WEB_PROVIDER_AMBIGUOUS（本件只如实上报，不代选）。
 * 本件零 import（结构化窄脸），不碰宿主协议包。
 */

/** web seam 窄脸（只声明用到的面）。 */
export type WebSeam = {
  searchProviders?: Map<string, { id: string; available?: () => boolean }>;
  fetchProviders?: Map<string, { id: string; available?: () => boolean }>;
  searchProviderId?: string;
  fetchProviderId?: string;
};

/** 搜索 provider 识别结果。 */
export type SearchProviderInfo = {
  /** 实际可用的 provider id（null = 不可用/不可判） */
  effective: string | null;
  usable: string[];
  configured?: string;
  /** 不可用时的排障文案（effective=null 时给） */
  note: string;
};

/** 读 web seam：识别当前搜索 provider（镜像 WebRuntime.resolveProvider 的选择规则，但不抛）。
 * 显式配置命中 = 严格用配置（配置指向未注册/不可用 provider 时如实点名，不回落单可用——
 * 宿主 web_search 自身也是这个语义：WEB_PROVIDER_CONFIGURED_MISSING/UNAVAILABLE）。
 */
export function detectSearchProvider(web: WebSeam | undefined): SearchProviderInfo {
  if (!web || !(web.searchProviders instanceof Map)) {
    return { effective: null, usable: [], note: "宿主无 web seam（dsh-tool-web 未挂载），research 无法检索" };
  }
  const registered = [...web.searchProviders.values()];
  const usable = registered.filter((p) => p?.available?.() !== false && p?.id).map((p) => p.id);
  const configured = web.searchProviderId;
  if (configured !== undefined && configured.trim() !== "") {
    const hit = registered.find((p) => p?.id === configured && p?.available?.() !== false);
    if (hit) return { effective: configured, usable, configured, note: "" };
    return {
      effective: null,
      usable,
      configured,
      note: `配置的搜索 provider「${configured}」未注册或不可用（已注册：${registered.map((p) => p.id).join("、") || "无"}）`,
    };
  }
  if (usable.length === 1) {
    return { effective: usable[0]!, usable, note: "" };
  }
  if (usable.length > 1) {
    return {
      effective: null,
      usable,
      note: `多个可用搜索 provider（${usable.join("、")}）且未显式配置 searchProvider——宿主 web_search 本身会报 WEB_PROVIDER_AMBIGUOUS，请先在 profile 的 web 行配 searchProvider`,
    };
  }
  return {
    effective: null,
    usable,
    note: "无可用的搜索 provider（web_search 会报 WEB_PROVIDER_UNAVAILABLE）",
  };
}
