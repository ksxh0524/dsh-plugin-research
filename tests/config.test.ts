/** config.test.ts —— 配置纯函数面：缺省/patch 归一化/形状预检/拆分链/归一化（宿主 settings 段消费的值语义）。 */

import assert from "node:assert/strict";
import test from "node:test";
import { applyConfigPatch, defaultConfig, effectiveRoutes, normalizeConfig, validateConfigPatch } from "../src/config.ts";

test("缺省配置：全空（走宿主默认派单），split=false", () => {
  assert.deepEqual(defaultConfig(), { model: "", thinking: "", split: false, researchModel: "", researchThinking: "", reviewModel: "", reviewThinking: "" });
});

test("applyConfigPatch：undefined 字段保留现值，字符串 trim，split 严格布尔", () => {
  const cur = defaultConfig();
  const out = applyConfigPatch(cur, { model: " buzzai/qwen ", split: true });
  assert.equal(out.model, "buzzai/qwen");
  assert.equal(out.split, true);
  assert.equal(out.thinking, "", "未传字段保留现值");
  const keep = applyConfigPatch(out, { reviewModel: "rv/reviewer" });
  assert.equal(keep.model, "buzzai/qwen", "二次 patch 不丢已有值");
  assert.equal(keep.reviewModel, "rv/reviewer");
  const bool = applyConfigPatch(defaultConfig(), { split: "yes" as unknown as boolean });
  assert.equal(bool.split, false, "非布尔 = false（类型级校验由宿主 schema 兜底）");
});

test("validateConfigPatch：模型二段式 / 思考档枚举 / split 布尔 / 未知字段", () => {
  assert.deepEqual(validateConfigPatch({}), []);
  assert.deepEqual(validateConfigPatch({ model: "buzzai/m1", thinking: "high" }), []);
  assert.ok(validateConfigPatch({ model: "no-slash" })[0].includes("二段式"));
  assert.ok(validateConfigPatch({ thinking: "ultra" })[0].includes("thinking"));
  for (const t of ["low", "medium", "high", "xhigh"]) assert.deepEqual(validateConfigPatch({ thinking: t }), []);
  assert.ok(validateConfigPatch({ split: "yes" })[0].includes("布尔"));
  assert.ok(validateConfigPatch({ bogus: 1 })[0].includes("未知字段"));
  assert.deepEqual(validateConfigPatch("not-an-object").length, 1);
});

test("normalizeConfig：缺键补空缺省（schemastery 可选字段 unset 时缺键）", () => {
  assert.deepEqual(normalizeConfig(undefined), defaultConfig());
  assert.deepEqual(normalizeConfig({ model: "p/m", split: true }), { ...defaultConfig(), model: "p/m", split: true });
  assert.deepEqual(normalizeConfig({ split: "yes" }), { ...defaultConfig(), split: false }, "split 非真布尔 = false");
});

test("effectiveRoutes：默认共用一份；split 拆双角色；空覆盖字段回落默认链", () => {
  const shared = { model: "p/shared", thinking: "high", split: false, researchModel: "", researchThinking: "", reviewModel: "", reviewThinking: "" } as const;
  let eff = effectiveRoutes(shared);
  assert.deepEqual(eff.researcher, { provider: "p", model: "shared", thinkingLevel: "high" });
  assert.deepEqual(eff.reviewer, eff.researcher, "未拆分 = 两角色同路由");

  const split = { ...shared, split: true, reviewModel: "q/reviewer-only" };
  eff = effectiveRoutes(split);
  assert.deepEqual(eff.researcher, { provider: "p", model: "shared", thinkingLevel: "high" });
  assert.deepEqual(eff.reviewer, { provider: "q", model: "reviewer-only", thinkingLevel: "high" }, "审查员 thinking 空 = 回落默认档");

  const splitNone = { ...shared, split: true, researchModel: "", reviewModel: "" };
  eff = effectiveRoutes(splitNone);
  assert.deepEqual(eff.researcher, { provider: "p", model: "shared", thinkingLevel: "high" });
  assert.deepEqual(eff.reviewer, { provider: "p", model: "shared", thinkingLevel: "high" }, "拆分但未填 = 回落默认");

  assert.deepEqual(effectiveRoutes({ ...shared, model: "" }).researcher, null, "默认链也空 = 未配（走宿主默认派单）");
});
