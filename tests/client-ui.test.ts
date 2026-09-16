/** client-ui.test.ts —— 浏览器半的离线检测件（STANDARDS §4.3 两条）：
 *  ① 设计令牌必须宿主主题**真定义**（防自造 `--dsw-*` 假名——真机曾整片浮层解析成黑）；
 *  ② 复用面不回潮：Tag/chevron 走 `require("@deepseek-ai/dsh-client-ui-primitives")`（种子表内词），
 *     手搓替身只许当兜底；卡壳结构件不许退回平铺面板（真机路径由 tests/browser/research.ui.test.ts 守）。
 *  宿主主题不在本机时 ① skip（交 check:browser 的 __TOKEN_AUDIT__ 兜底），② 仍硬判。
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

test("复用面与结构件：primitives 走 require，卡壳不退回平铺面板", () => {
  assert.match(CLIENT, /require\("@deepseek-ai\/dsh-client-ui-primitives"\)/, "未复用宿主 primitives（§4.3）");
  assert.match(CLIENT, /UI\.Tag\b/, "宿主 Tag 未接常路——只剩手搓替身即回潮");
  assert.match(CLIENT, /UI\.IconChevronDownOutline14\b/, "宿主 chevron 图标未接常路");
  assert.match(CLIENT, /"aria-expanded"/, "缺折叠头 aria-expanded（§4.1）");
  assert.ok(CSS_BLOCK.length > 500, "CSS 块定位失败（结构断言无对象）");
  assert.doesNotMatch(CSS_BLOCK, /height:100%[^}]*overflow:auto/, "根容器自开整页滚动面板 = 平铺常开形态");
  assert.match(CSS_BLOCK, /\.rsch-card\{[^}]*border-radius:16px/, "卡壳圆角未照宿主 .card 值（§4.1）");
  assert.match(CLIENT, /list: "rsch-model-list"/, "模型框未挂 datalist（用户要下拉直选配好的模型，不是手填背诵）");
  assert.match(CLIENT, /"datalist",\s+\{ id: "rsch-model-list" \}/, "模型 datalist 未渲染（三模型框共用一下拉源）");
  assert.doesNotMatch(CLIENT, /当前生效：/, "静态“当前生效”瞎报回潮（发起会话不同值就不同，卡上显示不了）");
});
