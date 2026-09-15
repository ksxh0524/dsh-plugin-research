/** config.test.ts —— 用户配置存取：默认/读写回环/校验矩阵/版本门/effectiveRoutes 拆分链。 */

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig, effectiveRoutes, readResearchConfig, researchConfigPath, validateConfigPatch, writeResearchConfig } from "../src/config.ts";

function mkWs(): string {
  return mkdtempSync(join(tmpdir(), "rsch-cfg-"));
}

test("默认配置：缺文件全空（跟随工作区路由），split=false", () => {
  const ws = mkWs();
  assert.deepEqual(readResearchConfig(ws), defaultConfig());
  assert.equal(defaultConfig().split, false);
});

test("写读回环：patch 合并、落盘路径在 .runtime/research 下、tmp 原子替换无残留", () => {
  const ws = mkWs();
  const out = writeResearchConfig(ws, { model: "buzzai/qwen3.8-flash-free", thinking: "high" });
  assert.equal(out.model, "buzzai/qwen3.8-flash-free");
  const reread = readResearchConfig(ws);
  assert.equal(reread.model, "buzzai/qwen3.8-flash-free");
  assert.equal(reread.thinking, "high");
  assert.match(researchConfigPath(ws), /[.]runtime[\/\\]research[\/\\]config[.]json$/u);
  assert.equal(readFileSyncExists(ws, "config.json.tmp"), false, "tmp 文件应已被 rename 消化");
});

function readFileSyncExists(ws: string, name: string): boolean {
  try {
    rmSync(join(ws, ".runtime", "research", name));
    return true;
  } catch {
    return false;
  }
}

test("校验矩阵：模型二段式 / 思考档枚举 / split 布尔 / 未知字段，错误逐条给", () => {
  assert.deepEqual(validateConfigPatch({}), []);
  assert.deepEqual(validateConfigPatch({ model: "buzzai/m1" }), []);
  assert.deepEqual(validateConfigPatch({ model: "" }), []);
  assert.ok(validateConfigPatch({ model: "no-slash" })[0].includes("二段式"));
  assert.ok(validateConfigPatch({ model: "/x" })[0].includes("二段式"));
  assert.ok(validateConfigPatch({ thinking: "ultra" })[0].includes("thinking"));
  for (const t of ["low", "medium", "high", "xhigh"]) assert.deepEqual(validateConfigPatch({ thinking: t }), []);
  assert.ok(validateConfigPatch({ split: "yes" })[0].includes("布尔"));
  assert.ok(validateConfigPatch({ bogus: 1 })[0].includes("未知字段"));
  assert.deepEqual(validateConfigPatch("not-an-object").length, 1);
});

test("writeResearchConfig 校验失败抛错（fail-loud）且不落盘", () => {
  const ws = mkWs();
  assert.throws(() => writeResearchConfig(ws, { model: "bad" }), /校验失败/u);
  assert.deepEqual(readResearchConfig(ws), defaultConfig(), "拒收时配置文件不存在（不部分应用）");
});

test("版本门：version 不符的存量快照整体作废回默认（语义变更不追溯）", () => {
  const ws = mkWs();
  mkdirSync(join(ws, ".runtime", "research"), { recursive: true });
  writeFileSync(join(ws, ".runtime", "research", "config.json"), JSON.stringify({ version: 999, model: "stale/model", split: true }), "utf8");
  assert.deepEqual(readResearchConfig(ws), defaultConfig());
});

test("JSON 坏文件 fail-loud（用户改对再跑，不静默回落）", () => {
  const ws = mkWs();
  mkdirSync(join(ws, ".runtime", "research"), { recursive: true });
  writeFileSync(join(ws, ".runtime", "research", "config.json"), "{oops", "utf8");
  assert.throws(() => readResearchConfig(ws), /JSON/u);
});

test("effectiveRoutes：默认共用一份；split 拆双角色；空覆盖字段回落默认链", () => {
  const shared = {
    version: 1,
    model: "p/shared",
    thinking: "high",
    split: false,
    researchModel: "",
    researchThinking: "",
    reviewModel: "",
    reviewThinking: "",
  } as const;
  let eff = effectiveRoutes(shared);
  assert.deepEqual(eff.researcher, { provider: "p", model: "shared", thinkingLevel: "high" });
  assert.deepEqual(eff.reviewer, eff.researcher, "未拆分 = 两角色同路由");

  const split = { ...shared, split: true, reviewModel: "q/reviewer-only", reviewThinking: "" };
  eff = effectiveRoutes(split);
  assert.deepEqual(eff.researcher, { provider: "p", model: "shared", thinkingLevel: "high" });
  assert.deepEqual(eff.reviewer, { provider: "q", model: "reviewer-only", thinkingLevel: "high" }, "审查员 thinking 空 = 回落默认档");

  const splitNone = { ...shared, split: true, researchModel: "", reviewModel: "" };
  eff = effectiveRoutes(splitNone);
  assert.deepEqual(eff.researcher, { provider: "p", model: "shared", thinkingLevel: "high" });
  assert.deepEqual(eff.reviewer, { provider: "p", model: "shared", thinkingLevel: "high" }, "拆分但未填 = 回落默认");

  assert.deepEqual(effectiveRoutes({ ...shared, model: "" }).researcher, null, "默认链也空 = 未配（跟随工作区路由键）");
});
