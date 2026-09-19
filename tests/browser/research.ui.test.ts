/** research.ui.test.ts —— UI 自动化验证（索引仓 `docs/settings-cards.md` §1.1/§1.2 + 索引仓 `docs/runbooks/live-verify.md` 机器件，dsh-check 底座）：
 *  一次性实例真启、真浏览器载入，走「侧边栏插件面板 → research 卡 → 点开详情」全链 DOM 断言。
 *  卡形态断言 = 宿主 ItemCard/ItemDetail 同形的四件套：① plugins.item 注册（data-plugin-item）
 *  ② 详情直出表单（无折叠、无第二次点击）③ 文本框暂存草稿（改输入不落盘，未保存标；离页即弃，无丢弃按钮）
 *  ④ 文本框保存是其唯一写点（成功刷新基线不清屏、重开回读新值）；下拉/勾选单字段直写（改了即存，不点亮保存）。
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

/** 回插件列表（详情页左上「‹ 插件列表」）并等卡片行重现：详情卸载，
 *  再点进即整卡重挂载 → getConfig 重读（reload 会撞宿主 API-Key 引导窗，禁 reload——usage-stats 卡同形先例）。 */
async function backToPluginList(page: any) {
  await page.locator("a,button").filter({ hasText: "插件列表" }).first().click({ timeout: 10_000 });
  const card = page.locator('li[data-plugin-item="research"]').first();
  await card.waitFor({ state: "visible", timeout: 15_000 });
  return card;
}

uiScenarioSuite({
  pluginRoot,
  scenarios: [
    {
      name: "卡结构 = 宿主 ItemCard/ItemDetail：plugins.item 注册 + 简介 + 详情直出表单无折叠",
      async run({ page }) {
        const card = await openPluginsPanel(page);
        // 注册：plugins.item entry 按 id 认领（上一代 keyed 槽下线后无此属性即隐身）。
        await card.waitFor({ timeout: 10_000 });
        // 简介：summary 视图的一句话（卡片行 + 详情页头共用）。
        const cardText = await card.innerText();
        if (!cardText.includes("路由配置")) throw new Error(`summary 简介缺失：${JSON.stringify(cardText.slice(0, 120))}`);
        const detail = await openResearchDetail(card, page);
        // 表单：page 视图直出 div.rsch-form，无折叠头、无第二次点击。
        const root = detail.locator("div.rsch-form").first();
        await root.waitFor({ timeout: 10_000 });
        if (await detail.locator(".rsch-head,.rsch-card").count()) throw new Error("详情里套了折叠卡壳——page 该直出表单（索引仓 docs/settings-cards.md §1.1）");
        // 远端 getConfig 是异步读：等草稿回填再断（索引仓 docs/runbooks/live-verify.md 冷扫描纪律）。
        const modelInput = detail.locator("input#rsch-f-model").first();
        await modelInput.waitFor({ state: "visible", timeout: 20_000 }).catch(async () => {
          throw new Error("表单未渲染控件；表单文本=" + JSON.stringify((await root.innerText()).slice(0, 200)));
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
        // footer 只有保存（文本草稿唯一写点；草稿离页即弃，不设丢弃入口）。
        if (await detail.locator(".rsch-discard").count()) throw new Error("丢弃按钮回潮——离页即弃，不设丢弃入口");
        if (!(await detail.locator(".rsch-save").first().isVisible())) throw new Error("footer 缺保存（文本草稿唯一写点）");
      },
    },
    {
      name: "文本框暂存+保存唯一写点；下拉/勾选直写即存；草稿离页即弃、无丢弃按钮",
      async run({ page }) {
        // 详情由场景一打开后驻留；若单独重跑本场景，则自己走一遍导航（幂等，不依赖执行顺序）。
        let detail = page.locator('[data-plugin-item-detail="research"]').first();
        if (!(await detail.count())) {
          detail = await openResearchDetail(await openPluginsPanel(page), page);
        }
        const modelInput = detail.locator("input#rsch-f-model").first();
        await modelInput.waitFor({ state: "visible", timeout: 20_000 });
        const baseline = await modelInput.inputValue();
        const thinkingBaseline = await detail.locator("select#rsch-f-thinking").first().inputValue();

        // 无丢弃按钮（离页即弃，不设显式丢弃入口）。
        if (await detail.locator(".rsch-discard").count()) throw new Error("丢弃按钮回潮——离页即弃，不设丢弃入口");

        // ① 文本框：改输入只落草稿，未保存 Tag 挂上 footer，保存按钮从禁用转可用。
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
        // ③ 离页即弃：回列表（详情卸载）再点进，草稿消失、回基线——全程没写过盘（远端只被点开时读过）。
        detail = await openResearchDetail(await backToPluginList(page), page);
        const modelInput2 = detail.locator("input#rsch-f-model").first();
        await modelInput2.waitFor({ state: "visible", timeout: 20_000 });
        if ((await modelInput2.inputValue()) !== baseline)
          throw new Error(`草稿离页未弃：${JSON.stringify(await modelInput2.inputValue())} ≠ ${JSON.stringify(baseline)}`);
        if (await detail.getByText("未保存", { exact: false }).first().count()) throw new Error("重进仍有未保存标记——草稿该随页走");
        // ④ 文本框唯一写点：合法草稿 → 保存 → 不清屏（表单常驻）→ 保存按钮回禁用。
        await modelInput2.fill("deepseek/test-model");
        await detail.locator(".rsch-save").first().click();
        // 保存成功只刷新基线不清屏：表单仍在，保存回到禁用（dirty 消）。
        await detail.locator(".rsch-save[disabled]").first().waitFor({ state: "visible", timeout: 15_000 });
        if (!(await detail.locator("div.rsch-form").first().isVisible())) throw new Error("保存后表单消失——详情页常驻不清屏");
        const value = await modelInput2.inputValue();
        if (value !== "deepseek/test-model") throw new Error(`保存后本地值失配：${JSON.stringify(value)}`);
        // ⑤ 下拉直写：改选项即存，不用按保存（保存保持禁用）；回列表再进，回读即新值；用完恢复基线。
        const thinking2 = detail.locator("select#rsch-f-thinking").first();
        const target = thinkingBaseline === "high" ? "low" : "high";
        await thinking2.selectOption(target);
        // 直写落盘是异步：等本地写完（控件写途中禁用，落盘后回到可用）再离页，否则重进的 getConfig 读到旧值。
        await page.waitForTimeout(1000);
        if ((await thinking2.inputValue()) !== target) throw new Error("下拉直写未生效");
        if (!(await detail.locator(".rsch-save[disabled]").first().count())) throw new Error("下拉改了却点亮保存——直写字段不该进草稿");
        detail = await openResearchDetail(await backToPluginList(page), page);
        const thinking3 = detail.locator("select#rsch-f-thinking").first();
        await thinking3.waitFor({ state: "visible", timeout: 20_000 });
        if ((await thinking3.inputValue()) !== target)
          throw new Error(`下拉直写未落盘：${JSON.stringify(await thinking3.inputValue())} ≠ ${JSON.stringify(target)}`);
        await thinking3.selectOption(thinkingBaseline);
        await page.waitForTimeout(1000);
        if ((await thinking3.inputValue()) !== thinkingBaseline) throw new Error("下拉恢复基线未落盘——测试污染了配置");
        // ⑥ 勾选直写：点一次翻转即存（子表单随显隐），保存全程禁用；再点一次恢复原状。
        const splitBox = detail.locator("input#rsch-f-split").first();
        const splitWas = await splitBox.isChecked();
        await splitBox.click();
        await page.waitForTimeout(1000);
        const nowOn = await splitBox.isChecked();
        if (nowOn === splitWas) throw new Error("勾选直写未生效——开关没翻转");
        if (nowOn && !(await detail.locator(".rsch-split").first().count())) throw new Error("勾选直写未生效——子表单未现身");
        if (!(await detail.locator(".rsch-save[disabled]").first().count())) throw new Error("勾选改了却点亮保存——直写字段不该进草稿");
        await splitBox.click();
        await page.waitForTimeout(1000);
        if ((await splitBox.isChecked()) !== splitWas) throw new Error("勾选未恢复原状——测试污染了用户配置");
      },
    },
  ],
});
