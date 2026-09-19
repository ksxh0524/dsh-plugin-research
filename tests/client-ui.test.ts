/** client-ui.test.ts —— 浏览器半的离线检测件（索引仓 `docs/design-tokens.md` §4.3 两条 + `docs/settings-cards.md` §1.2 封闭值域直写例外）：
 *  ① 设计令牌必须 DSH 实例主题**真定义**（防自造 `--dsw-*` 假名——真机曾整片浮层解析成黑）；
 *  ② 复用面不回潮：Tag 走 `require("@deepseek-ai/dsh-client-ui-primitives")`（种子表内词），
 *     手搓替身只许当兜底；page 直出表单不套折叠（真机路径由 tests/browser/research.ui.test.ts 守）。
 *  ③ 交互模型：下拉/勾选单字段直写（不进草稿、不依赖保存），文本框保留草稿 + 保存；
 *     无丢弃按钮（离页即弃），下拉样式照 DSH 实例 selectInput 同形（appearance:none + chevron）。
 *  DSH 实例主题不在本机时 ① skip（交 check:browser 的 __TOKEN_AUDIT__ 兜底），②③ 仍硬判。
 *  席位门（索引仓 `docs/settings-cards.md` §1.1 三席位）：卡注册进 `plugins.item`（id === settings 命名空间），组件按 `{view}`
 *  双态分流；上一代 keyed 槽字面量出现即错位，硬判。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CLIENT = readFileSync(fileURLToPath(new URL("../lib/client.js", import.meta.url)), "utf8");
const CSS_BLOCK = (() => {
  const start = CLIENT.indexOf("var CSS = [");
  const end = CLIENT.indexOf("];", start);
  return start === -1 || end === -1 ? "" : CLIENT.slice(start, end);
})();

test("浏览器半引用的每个 --dsw-* token 都由宿主主题真定义（离线 __TOKEN_AUDIT__）", (t) => {
  const theme =
    process.env.DSH_THEME_CLIENT_JS ??
    `${process.env.HOME ?? ""}/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js`;
  if (!existsSync(theme)) {
    t.skip("宿主主题包不在本机——token 审计交 check:browser 兜底");
    return;
  }
  const defined = new Set([...readFileSync(theme, "utf8").matchAll(/--dsw-[a-z0-9-]+(?=\s*:)/g)].map((m) => m[0]));
  const referenced = [...new Set([...CLIENT.matchAll(/var\((--dsw-[a-z0-9-]+)/g)].map((m) => m[1]))];
  assert.ok(referenced.length >= 10, `token 提取异常（只抓到 ${referenced.length} 个，CSS 块定位失败？）`);
  assert.deepEqual(
    referenced.filter((x) => !defined.has(x)),
    [],
    "引用了宿主未定义的 token（假名在真页解析为空/黑）",
  );
});

test("已知假名 token 禁回潮（label-error 等，主题从未定义）", () => {
  for (const fake of ["--dsw-alias-label-error", "--dsw-alias-separator", "--dsw-alias-fill-quinary"]) {
    assert.ok(!CLIENT.includes(fake), `出现已知假名 token ${fake}`);
  }
});

test("复用面与结构件：primitives 走 require，page 直出表单不套折叠", () => {
  assert.match(CLIENT, /require\("@deepseek-ai\/dsh-client-ui-primitives"\)/, "未复用 DSH 实例 primitives（索引仓 docs/design-tokens.md §4.3）");
  assert.match(CLIENT, /create: function \(\)/, "网关 ≥0.1.6 硬门：strict codec 必须带 create() 工厂");
  assert.match(CLIENT, /UI\.Tag\b/, "DSH 实例 Tag 未接常路——只剩手搓替身即回潮");
  assert.doesNotMatch(CLIENT, /"aria-expanded"/, "page 内出现折叠头 aria-expanded——详情里再套折叠即返工（索引仓 docs/settings-cards.md §1.1）");
  assert.doesNotMatch(CLIENT, /rsch-card|rsch-head|rsch-chev/, "折叠卡壳样式回潮（li 卡壳/折叠头/chevron 已退役，page 只出 div.rsch-form）");
  assert.ok(CSS_BLOCK.length > 500, "CSS 块定位失败（结构断言无对象）");
  assert.doesNotMatch(CSS_BLOCK, /height:100%[^}]*overflow:auto/, "根容器自开整页滚动面板 = 嵌套双滚动");
  assert.match(CSS_BLOCK, /\.rsch-form\{[^}]*flex-direction:column/, "表单根未照 DSH 实例 .form 值（索引仓 docs/settings-cards.md §1.1）");
  assert.match(CLIENT, /list: "rsch-model-list"/, "模型框未挂 datalist（用户要下拉直选配好的模型，不是手填背诵）");
  assert.match(CLIENT, /"datalist",\s+\{ id: "rsch-model-list" \}/, "模型 datalist 未渲染（三模型框共用一下拉源）");
  assert.doesNotMatch(CLIENT, /当前生效：/, "静态“当前生效”瞎报回潮（发起会话不同值就不同，卡上显示不了）");
  assert.match(CLIENT, /留空 = 跟随主会话/, "模型 hint 必须一句话（废话注脚已删，不许复生）");
  assert.doesNotMatch(CLIENT, /保存后对下一次/, "footer 废话注脚回潮（用户：删掉的别回来）");
});

test("交互模型：封闭值域直写 + 文本框草稿保存 + 无丢弃按钮（索引仓 docs/settings-cards.md §1.2 例外节）", () => {
  // 下拉/勾选 onChange 单字段直写，不进草稿。
  assert.match(CLIENT, /var directWrite = useCallback/, "封闭值域无直写路径（下拉/勾选改了必须即时单字段 setConfig）");
  assert.match(CLIENT, /directWrite\(key, ev\.target\.value\)/, "思考强度下拉未走直写（还在进草稿等保存）");
  assert.match(CLIENT, /directWrite\("split", ev\.target\.checked\)/, "分开配勾选未走直写（还在进草稿等保存）");
  assert.match(CLIENT, /value: loaded\[key\]/, "下拉未读基线渲染（直写失败无法自动回滚）");
  // 文本框保留草稿 + 保存是其唯一写点；保存只写文本字段，不重写直写过的键。
  assert.match(CLIENT, /onChange: edit\(key\)/, "模型文本框未走草稿（自由文本必须可预览校验）");
  assert.doesNotMatch(CLIENT, /thinking: draft\.thinking/, "保存仍在重写直写字段（单字段写过的不重写）");
  assert.doesNotMatch(CLIENT, /split: draft\.split/, "保存仍在重写直写字段（单字段写过的不重写）");
  // 无丢弃按钮回潮闸：离页即弃，不设显式丢弃入口。
  assert.doesNotMatch(CLIENT, /rsch-discard/, "丢弃按钮样式回潮（离页即弃，不设丢弃入口）");
  assert.doesNotMatch(CLIENT, /"丢弃"/, "丢弃按钮文案回潮（离页即弃，不设丢弃入口）");
  assert.doesNotMatch(CLIENT, /var discard = function/, "丢弃函数回潮（离页即弃，不设丢弃入口）");
  // 即时写例外三件（与 dsh-check pluginsItemInstantSave 门同口径，注释剥离后判）：写点唯一 + 失败重试入口。
  const codeNoComments = CLIENT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)[ \t]*\/\/[^\n]*/g, "$1");
  assert.equal([...codeNoComments.matchAll(/\.setConfig\s*\(/g)].length, 1, "全卡 setConfig 不是唯一写点（直写与保存必须同走 writePatch 一处）");
  assert.match(codeNoComments, /重试/, "写失败缺重试入口（footer 错误行须带重试按钮）");
});

test("下拉样式：DSH 实例 selectInput 同形，不自创（chevron + 右槽位 + 短宽）", () => {
  assert.match(CSS_BLOCK, /\.rsch-select\{[^}]*appearance:none/, "下拉未 appearance:none（OS 原生箭头即用户说的丑）");
  assert.match(
    CSS_BLOCK,
    /\.rsch-select\{[^}]*background-image:url\(\\?"data:image\/svg/,
    "下拉缺 chevron data-URI（照抄 DSH 实例 ui-settings-models selectInput）",
  );
  assert.match(CSS_BLOCK, /\.rsch-select\{[^}]*padding-right:32px/, "下拉缺右 32px 槽位（chevron 会压字）");
  assert.match(CSS_BLOCK, /\.rsch-select\{[^}]*max-width:240px/, "下拉撑满字段宽（短选项下拉读起来像文本框，上游同形 max-width 240px）");
});

test("席位：plugins.item 注册 + view 双态 + 旧槽零字面量（索引仓 docs/settings-cards.md §1.1 配对门）", () => {
  assert.doesNotMatch(CLIENT, /settings\.plugin\.item/, "上一代 keyed 槽已下线，字面量出现即错位——卡会静默隐身");
  assert.match(CLIENT, /ctx\.slots\.inject\("plugins\.item"/, "未注册进 plugins.item（插件管理页不派发）");
  assert.match(
    CLIENT,
    /\{\s*name:\s*"plugins\.item",\s*id:\s*SETTINGS_NS,\s*order:\s*CARD_ORDER,\s*label:\s*CARD_TITLE\s*\}/,
    "entry 必须带 id/order/label（id 须 === settings 命名空间，靠它与服务端配对）",
  );
  assert.match(CLIENT, /var SETTINGS_NS = "research"/, "entry id 源头必须是 research（与 installSection 同名）");
  assert.match(CLIENT, /props\.view === "summary"/, "组件未按 {view} 分流（summary 一句话 / page 表单）");
  assert.match(CLIENT, /return CARD_DESC;/, "summary 视图必须回一句话简介");
});
