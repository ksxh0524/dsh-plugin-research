/** standard.test.ts —— 插件标准门（dsh-check）：cordis 形态/零依赖铁律/双语 README/工具链 + 两端契约配对。
 *  全部断言逻辑在 dsh-check（工作区检测工具）里；本文件只做注册，门规则漂移在共享包统一升级。 */
import { contractPairSuite, pluginStandardSuite } from "dsh-check";
import { ResearchConfigService } from "../src/cordis.ts";

pluginStandardSuite({
  metaUrl: import.meta.url,
  // 即时写例外字据（dsh-check pluginsItemInstantSave）：封闭值域（下拉/勾选）选项皆为完整合法值、无需预览校验，
  // 用户明确要选中即存、不要丢弃按钮；文本框仍走草稿 + 保存（索引仓 docs/settings-cards.md §1.2 封闭值域直写例外节）。
  pluginsItemInstantSave: "封闭值域下拉/勾选选中即存（无非法中间态），文本框仍草稿+保存；无丢弃按钮，草稿离页即弃（用户明确要求）",
});
contractPairSuite({
  service: ResearchConfigService,
  namespace: "research",
  idPrefix: "research",
  metaUrl: import.meta.url,
  optionalParams: true,
});
