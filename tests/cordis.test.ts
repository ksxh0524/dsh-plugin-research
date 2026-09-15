/** cordis.test.ts —— 注册面：createResearchTools 名册、无通道收据、cordis default 形与 apply 接线。
 * ctx/工具对象按 AGENTS「模拟宿主注入对象的桩可宽断言」处理（any 桩 + 注明）。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { name, inject, default as plugin, apply } from "../src/cordis.ts";
import { createResearchTools, resolveResearchWorkspace } from "../src/tools.ts";
import type { ToolExec } from "../src/lib/host.ts";

test("createResearchTools：单工具名册（research_build；退役 researcher 线不再有独立工具面）", () => {
  const tools = createResearchTools({ workspace: "/tmp/x", ctx: {} }) as Array<{ name: string }>;
  assert.deepEqual(
    tools.map((t) => t.name),
    ["research_build"],
  );
});

test("research_build execute：宿主无 subagents 通道 → 收据 error 不抛（fail 保全，非 throw）", async () => {
  const tools = createResearchTools({ workspace: "/tmp/x", ctx: {} }) as Array<{
    name: string;
    execute(args: Record<string, unknown>, exec: unknown): Promise<{ verdict: string; summary: string }>;
  }>;
  const out = await tools[0].execute({ project: "甲", questions: ["q"] }, undefined);
  assert.equal(out.verdict, "error");
  assert.match(out.summary, /派单通道/u);
});

test("cordis default 形（官方插件协议）：name/inject/default.name 三处同源", () => {
  assert.equal(name, "dsh-plugin-research");
  assert.deepEqual([...inject].sort(), ["subagents", "tools"]);
  assert.equal((plugin as { name: string }).name, "dsh-plugin-research");
});

test("cordis apply：工具全注册进 ctx.tools.register；config 透传（routeKey/routes 进闭包）", () => {
  const registered: Array<{ name: string }> = [];
  // 宿主注入对象桩（AGENTS 允许）：register 只收名册。
  const ctx = {
    tools: { register: (t: { name: string }) => registered.push(t) },
    subagents: { start: () => undefined },
    logger: { info: () => undefined, warn: () => undefined },
  };
  apply(ctx as never, { workspace: "/Volumes/DATA/AI视频/自动剪辑", routeKey: "content-writer.researcher", routes: [{ provider: "p", model: "m" }] });
  assert.deepEqual(
    registered.map((t) => t.name),
    ["research_build"],
  );
});

test("cordis apply：无 tools.register 的宿主（缺注册点）静默不炸（可选链收口）", () => {
  apply({} as never, undefined);
});

test("resolveResearchWorkspace：config 优先；exec.agent 会话 cwd 兜底锚探测（无锚回落 cwd 不炸）", () => {
  assert.equal(resolveResearchWorkspace(undefined, "/tmp/ws-a"), "/tmp/ws-a");
  const cwd = process.cwd();
  // exec 桩（AGENTS 允许宽断言）：agent/session 只给窄面字段。
  const exec = { agent: { session: { meta: { cwd } } } } as unknown as ToolExec;
  const ws = resolveResearchWorkspace(exec);
  assert.ok(ws.length > 0, "锚探测回落 cwd 必有落点");
});
