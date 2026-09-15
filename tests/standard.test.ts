/** standard.test.ts —— 插件标准门（dsh-check）：cordis 形态/零依赖铁律/双语 README/工具链 + 两端契约配对。
 *  全部断言逻辑在 dsh-check（工作区检测工具）里；本文件只做注册，门规则漂移在共享包统一升级。 */
import { contractPairSuite, pluginStandardSuite } from "dsh-check";
import { ResearchConfigService } from "../src/cordis.ts";

pluginStandardSuite({ metaUrl: import.meta.url });
contractPairSuite({
  service: ResearchConfigService,
  namespace: "research",
  idPrefix: "research",
  metaUrl: import.meta.url,
  optionalParams: true,
});
