/** research.ui.test.ts —— UI 自动化验证（STANDARDS §4.1/§4.2 + §5 机器件，dsh-check 底座）：
 *  一次性实例真启、真浏览器载入，走「设置 → 插件 → research 折叠卡」全链 DOM 断言。
 *  卡形态断言 = 宿主 PluginCard 同形的四件套：① <li> 卡壳 ② 默认折叠（点开才有控件）
 *  ③ 暂存草稿（改输入不落盘，未保存标 + 丢弃可回基线）④ 保存是唯一写点（成功后收起、重开回读新值）。
 *  跑法：pnpm check:browser。 */
import { uiScenarioSuite } from "dsh-check";
import { fileURLToPath } from "node:url";

const pluginRoot = fileURLToPath(new URL("../../", import.meta.url));

/** 打开设置并在「插件」分区里点开本卡（宿主官方卡同样按折叠头派发，标题唯一）。 */
async function openResearchCard(page: any, dialog: any) {
  const settingsBtn = page.locator('[aria-label="设置"]').first();
  await settingsBtn.waitFor({ timeout: 20_000 });
  await settingsBtn.click({ timeout: 10_000 });
  await dialog.locator("span", { hasText: "插件" }).first().waitFor({ timeout: 10_000 });
  await dialog.locator("span", { hasText: "插件" }).first().click();
  const header = dialog.getByRole("button", { name: /Research 调研/ }).first();
  await header.waitFor({ timeout: 15_000 });
  return header;
}

uiScenarioSuite({
  pluginRoot,
  scenarios: [
    {
      name: "卡结构 = 宿主折叠卡：<li> 卡壳 + 默认折叠 + 点开真 label 控件",
      async run({ page }) {
        const dialog = page.locator('[role="dialog"]').last();
        const header = await openResearchCard(page, dialog);
        // 卡壳：宿主列表是 <ul>，本卡必须是 <li>（v2 是 div 直接进 ul，卡壳与边框底色全丢）。
        const root = dialog.locator("li.rsch-card").first();
        await root.waitFor({ timeout: 10_000 });
        // 折叠态：头是 aria-expanded=false 的按钮，body 未渲染（配置未回填时也不该有控件）。
        if ((await header.getAttribute("aria-expanded")) !== "false") throw new Error("卡默认未折叠（aria-expanded ≠ false）——违 §4.1");
        if (await dialog.locator(".rsch-input").count()) throw new Error("折叠态就渲染了控件——平铺常开，多吃多占");
        await header.click();
        await header.waitFor({ state: "visible" });
        if ((await header.getAttribute("aria-expanded")) !== "true") throw new Error("点开没生效（aria-expanded 未转 true）");
        // 远端 getConfig 是异步读：等草稿回填再断（§5 冷扫描纪律）。
        const modelInput = dialog.locator("input#rsch-f-model").first();
        await modelInput.waitFor({ state: "visible", timeout: 20_000 }).catch(async () => {
          throw new Error("卡未渲染控件；body 文本=" + JSON.stringify((await dialog.locator(".rsch-body").first().innerText()).slice(0, 200)));
        });
        if ((await modelInput.count()) < 1) throw new Error("模型控件缺失");
        // 真 label：宿主同款 htmlFor/id 关联（v2 是裸 span，读屏到此是无名控件）。
        const labelText = await dialog.locator('label[for="rsch-f-model"]').first().innerText();
        if (!labelText.includes("模型")) throw new Error(`label 未关联或文案缺失：${JSON.stringify(labelText)}`);
        const selects = await dialog.locator(".rsch-select").count();
        if (selects < 1) throw new Error(`思考强度下拉缺失：select=${String(selects)}`);
        if ((await dialog.locator(".rsch-select option").count()) < 1) throw new Error("下拉无选项——远端读配置链路未通");
        // 折叠态收起的 footer 必须有保存/丢弃成对（v2 只有单保存，草稿无处可丢）。
        if (!(await dialog.locator(".rsch-discard").first().isVisible())) throw new Error("footer 缺丢弃");
      },
    },
    {
      name: "暂存草稿：改输入不落盘、未保存标出现、丢弃回基线；保存唯一写点后收起并回读新值",
      async run({ page }) {
        const dialog = page.locator('[role="dialog"]').last();
        const header = dialog.getByRole("button", { name: /Research 调研/ }).first();
        await header.waitFor({ timeout: 15_000 });
        if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
        const modelInput = dialog.locator("input#rsch-f-model").first();
        await modelInput.waitFor({ state: "visible", timeout: 20_000 });
        const baseline = await modelInput.inputValue();
        // ① 改输入：只落草稿，未保存 Tag 挂上折叠头，保存按钮从禁用转可用。
        await modelInput.fill("deepseek/draft-model");
        await dialog.locator(".rsch-save:not([disabled])").first().waitFor({ state: "visible", timeout: 10_000 });
        if (!(await dialog.getByText("未保存", { exact: false }).first().count())) throw new Error("草稿态无未保存标记");
        // 复用面实证（STANDARDS §4.3）：未保存标记必须是宿主 primitives 的 Tag——require("@deepseek-ai/dsh-client-ui-primitives")
        // 命中才会带 data-tone + 自有 CSS-module class；走手搓替身即 require 未通，此处必须红。
        if (!(await dialog.locator("span[data-tone][class*='rsch-pending']").first().count()))
          throw new Error("未保存标记走了替身路径——ui-primitives require 未命中（§4.3 复用面断裂）");
        // ② 非法草稿 block 保存（不静默丢）：填一段不带 "/" 的文本，保存必须回禁用。
        await modelInput.fill("nope");
        await dialog.locator(".rsch-save[disabled]").first().waitFor({ state: "visible", timeout: 10_000 });
        if (!(await dialog.locator(".rsch-invalid").first().count())) throw new Error("非法草稿缺字段内错误提示");
        // ③ 丢弃：草稿回基线，未保存标记消失——全程没写过盘（远端只被点开时读过一次）。
        await dialog.locator(".rsch-discard").first().click();
        if ((await modelInput.inputValue()) !== baseline)
          throw new Error(`丢弃未回基线：${JSON.stringify(await modelInput.inputValue())} ≠ ${JSON.stringify(baseline)}`);
        // ④ 唯一写点：合法草稿 → 保存 → 收起 → 重开走远端回读，值必须是新写的。
        await modelInput.fill("deepseek/test-model");
        await dialog.locator(".rsch-save").first().click();
        // 落盘确认后收起（宿主同款时序）：折叠头回到 aria-expanded=false。
        await dialog.locator("button.rsch-head[aria-expanded='false']").first().waitFor({ state: "visible", timeout: 15_000 });
        await header.click();
        await modelInput.waitFor({ state: "visible", timeout: 20_000 });
        const value = await modelInput.inputValue();
        if (value !== "deepseek/test-model") throw new Error(`回读失配：${JSON.stringify(value)}`);
      },
    },
  ],
});
