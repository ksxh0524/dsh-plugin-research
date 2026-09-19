/** research.ui.test.ts —— UI 自动化验证（索引仓 `docs/settings-cards.md` §4.1/§4.2 + 索引仓 `docs/runbooks/live-verify.md` 机器件，dsh-check 底座）：
 *  一次性实例真启、真浏览器载入，走「侧边栏插件面板 → research 卡 → 点开详情」全链 DOM 断言。
 *  卡形态断言 = DSH 实例 PluginConfigForm 同形的四件套：① plugins.item 注册（data-plugin-item）
 *  ② 详情里默认折叠（点开才有控件）③ 暂存草稿（改输入不落盘，未保存标 + 丢弃可回基线）
 *  ④ 保存是唯一写点（成功后收起、重开回读新值）。
 *  跑法：pnpm check:browser。 */
import { uiScenarioSuite } from "dsh-check";
import { fileURLToPath } from "node:url";

const pluginRoot = fileURLToPath(new URL("../../", import.meta.url));

/** 打开侧边栏插件面板（返回面板就绪后的页面，供调用方先断卡片行再点开详情；
 *  点开详情后列表卸载，卡片行断言必须在点开之前做）。 */
async function openPluginsPanel(page: any) {
  const panelBtn = page.getByRole("button", { name: /^插件$/ }).first();
  await panelBtn.waitFor({ timeout: 20_000 });
  await panelBtn.click({ timeout: 10_000 });
  const card = page.locator('li[data-plugin-item="research"]').first();
  await card.waitFor({ timeout: 15_000 });
  return card;
}

/** 点开 research 详情（调用方已断完卡片行之后调；返回详情根）。 */
async function openResearchDetail(card: any, page: any) {
  const openBtn = card.getByRole("button", { name: /Research 调研/ }).first();
  await openBtn.waitFor({ timeout: 15_000 });
  await openBtn.click({ timeout: 10_000 });
  const detail = page.locator('[data-plugin-item-detail="research"]').first();
  await detail.waitFor({ timeout: 15_000 });
  return detail;
}

uiScenarioSuite({
  pluginRoot,
  scenarios: [
    {
      name: "卡结构 = DSH 实例配置卡：plugins.item 注册 + 简介 + 详情默认折叠 + 点开真 label 控件",
      async run({ page }) {
        const card = await openPluginsPanel(page);
        // 注册：plugins.item entry 按 id 认领（上一代 keyed 槽下线后无此属性即隐身）。
        await card.waitFor({ timeout: 10_000 });
        // 简介：summary 视图的一句话（卡片行 + 详情页头共用）。
        const cardText = await card.innerText();
        if (!cardText.includes("路由配置")) throw new Error(`summary 简介缺失：${JSON.stringify(cardText.slice(0, 120))}`);
        const detail = await openResearchDetail(card, page);
        // 表单：page 视图是折叠卡（li.rsch-card），默认折叠，body 未渲染。
        const root = detail.locator("li.rsch-card").first();
        await root.waitFor({ timeout: 10_000 });
        const header = detail.getByRole("button", { name: /Research 调研/ }).first();
        if ((await header.getAttribute("aria-expanded")) !== "false")
          throw new Error("卡默认未折叠（aria-expanded ≠ false）——违索引仓 docs/settings-cards.md §4.1");
        if (await detail.locator(".rsch-input").count()) throw new Error("折叠态就渲染了控件——平铺常开，多吃多占");
        await header.click();
        await header.waitFor({ state: "visible" });
        if ((await header.getAttribute("aria-expanded")) !== "true") throw new Error("点开没生效（aria-expanded 未转 true）");
        // 远端 getConfig 是异步读：等草稿回填再断（索引仓 docs/runbooks/live-verify.md 冷扫描纪律）。
        const modelInput = detail.locator("input#rsch-f-model").first();
        await modelInput.waitFor({ state: "visible", timeout: 20_000 }).catch(async () => {
          throw new Error("卡未渲染控件；body 文本=" + JSON.stringify((await detail.locator(".rsch-body").first().innerText()).slice(0, 200)));
        });
        if ((await modelInput.count()) < 1) throw new Error("模型控件缺失");
        // 模型框必须挂 datalist（配好的模型下拉直选；一次性实例可能零商，选项数不断言，只断接线）。
        if ((await modelInput.getAttribute("list")) !== "rsch-model-list") throw new Error("模型框未挂 datalist——用户还得手填背诵 provider/model");
        // 真 label：DSH 实例同款 htmlFor/id 关联（旧版是裸 span，读屏到此是无名控件）。
        const labelText = await detail.locator('label[for="rsch-f-model"]').first().innerText();
        if (!labelText.includes("模型")) throw new Error(`label 未关联或文案缺失：${JSON.stringify(labelText)}`);
        const selects = await detail.locator(".rsch-select").count();
        if (selects < 1) throw new Error(`思考强度下拉缺失：select=${String(selects)}`);
        if ((await detail.locator(".rsch-select option").count()) < 1) throw new Error("下拉无选项——远端读配置链路未通");
        // footer 必须有保存/丢弃成对（旧版只有单保存，草稿无处可丢）。
        if (!(await detail.locator(".rsch-discard").first().isVisible())) throw new Error("footer 缺丢弃");
      },
    },
    {
      name: "暂存草稿：改输入不落盘、未保存标出现、丢弃回基线；保存唯一写点后收起并回读新值",
      async run({ page }) {
        // 详情由场景一打开后驻留；若单独重跑本场景，则自己走一遍导航（幂等，不依赖执行顺序）。
        let detail = page.locator('[data-plugin-item-detail="research"]').first();
        if (!(await detail.count())) {
          detail = await openResearchDetail(await openPluginsPanel(page), page);
        }
        const header = detail.getByRole("button", { name: /Research 调研/ }).first();
        if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
        const modelInput = detail.locator("input#rsch-f-model").first();
        await modelInput.waitFor({ state: "visible", timeout: 20_000 });
        const baseline = await modelInput.inputValue();
        // ① 改输入：只落草稿，未保存 Tag 挂上折叠头，保存按钮从禁用转可用。
        await modelInput.fill("deepseek/draft-model");
        await detail.locator(".rsch-save:not([disabled])").first().waitFor({ state: "visible", timeout: 10_000 });
        if (!(await detail.getByText("未保存", { exact: false }).first().count())) throw new Error("草稿态无未保存标记");
        // 复用面实证（索引仓 `docs/design-tokens.md` §4.3）：未保存标记必须是 DSH 实例 primitives 的 Tag——require("@deepseek-ai/dsh-client-ui-primitives")
        // 命中才会带 data-tone + 自有 CSS-module class；走手搓替身即 require 未通，此处必须红。
        if (!(await detail.locator("span[data-tone][class*='rsch-pending']").first().count()))
          throw new Error("未保存标记走了替身路径——ui-primitives require 未命中（索引仓 docs/design-tokens.md §4.3 复用面断裂）");
        // ② 非法草稿 block 保存（不静默丢）：填一段不带 "/" 的文本，保存必须回禁用。
        await modelInput.fill("nope");
        await detail.locator(".rsch-save[disabled]").first().waitFor({ state: "visible", timeout: 10_000 });
        if (!(await detail.locator(".rsch-invalid").first().count())) throw new Error("非法草稿缺字段内错误提示");
        // ③ 丢弃：草稿回基线，未保存标记消失——全程没写过盘（远端只被点开时读过一次）。
        await detail.locator(".rsch-discard").first().click();
        if ((await modelInput.inputValue()) !== baseline)
          throw new Error(`丢弃未回基线：${JSON.stringify(await modelInput.inputValue())} ≠ ${JSON.stringify(baseline)}`);
        // ④ 唯一写点：合法草稿 → 保存 → 收起 → 重开走远端回读，值必须是新写的。
        await modelInput.fill("deepseek/test-model");
        await detail.locator(".rsch-save").first().click();
        // 落盘确认后收起（DSH 实例同款时序）：折叠头回到 aria-expanded=false。
        await detail.locator("button.rsch-head[aria-expanded='false']").first().waitFor({ state: "visible", timeout: 15_000 });
        await header.click();
        await modelInput.waitFor({ state: "visible", timeout: 20_000 });
        const value = await modelInput.inputValue();
        if (value !== "deepseek/test-model") throw new Error(`回读失配：${JSON.stringify(value)}`);
      },
    },
  ],
});
