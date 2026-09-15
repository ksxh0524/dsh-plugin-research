/** research.ui.test.ts —— UI 自动化验证（STANDARDS §5 机器化首案，dsh-check 底座）：
 *  一次性实例真启、真浏览器载入，走「打开设置 → 插件分区 → research 卡渲染」全链 DOM 断言。
 *  跑法：pnpm check:browser（gate 门 #8 的件面）。 */
import { uiScenarioSuite } from "dsh-check";
import { fileURLToPath } from "node:url";

const pluginRoot = fileURLToPath(new URL("../../", import.meta.url));

uiScenarioSuite({
  pluginRoot,
  scenarios: [
    {
      name: "设置 → 插件 分区里 research 卡渲染出配置控件",
      async run({ page }) {
        // 开设置对话框（引导弹层已由底座 dismissOnboarding 请离）。
        const settingsBtn = page.locator('[aria-label="设置"]').first();
        await settingsBtn.waitFor({ timeout: 20_000 });
        await settingsBtn.click({ timeout: 10_000 });
        // 三层结构实测：nav「插件」→ 子区「插件配置」列表 → 本插件卡「网页搜索」。
        const dialog = page.locator('[role="dialog"]').last();
        await dialog.locator("span", { hasText: "插件" }).first().waitFor({ timeout: 10_000 });
        await dialog.locator("span", { hasText: "插件" }).first().click();
        await dialog.getByText("网页搜索", { exact: true }).first().click();
        // research 卡：命名空间标题 + provider 下拉 + 至少一个输入框。
        await page.locator(".rsch-root").first().waitFor({ timeout: 15_000 });
        // getConfig 是异步 remote 读，首帧是「读取配置…」占位——等控件真渲染再断（§5 冷扫描纪律）。
        await page
          .locator(".rsch-root .rsch-input")
          .first()
          .waitFor({ timeout: 20_000 })
          .catch(async () => {
            throw new Error("卡未渲染控件；root 文本=" + JSON.stringify((await page.locator(".rsch-root").first().innerText()).slice(0, 200)));
          });
        const selects = await page.locator(".rsch-root .rsch-select").count();
        const inputs = await page.locator(".rsch-root .rsch-input").count();
        if (selects < 1 || inputs < 1) throw new Error(`research 卡控件缺失：select=${String(selects)} input=${String(inputs)}`);
        // 交互活性：点第一个下拉应展开原生 select 选项（值集合非空即证 remote 数据已回填）。
        const optionCount = await page.locator(".rsch-root .rsch-select option").count();
        if (optionCount < 1) throw new Error("provider 下拉无选项——remote 读配置链路未通");
      },
    },
    {
      name: "写链：改模型 → 保存 → 收起重开回读新值（settings 段落真持久化）",
      async run({ page }) {
        const dialog = page.locator('[role="dialog"]').last();
        // 模型输入框（.rsch-row 里 label「模型」同排 input）。
        const modelRow = dialog.locator(".rsch-row", { hasText: "模型" }).first();
        const modelInput = modelRow.locator("input").first();
        await modelInput.fill("deepseek/test-model");
        await dialog.locator(".rsch-save").click();
        await dialog.getByText("已保存", { exact: false }).first().waitFor({ timeout: 10_000 });
        // 收起再开：切走 nav 再切回，组件重挂走远端读回。
        await dialog.locator("span", { hasText: "通用设置" }).first().click();
        await dialog.locator("span", { hasText: "插件" }).first().click();
        await dialog.getByText("网页搜索", { exact: true }).first().click();
        await page.locator(".rsch-root .rsch-input").first().waitFor({ state: "visible", timeout: 20_000 });
        const value = await dialog.locator(".rsch-row", { hasText: "模型" }).first().locator("input").first().inputValue();
        if (value !== "deepseek/test-model") throw new Error(`回读失配：${JSON.stringify(value)}`);
      },
    },
  ],
});
