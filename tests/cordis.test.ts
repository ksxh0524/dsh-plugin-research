/** cordis.test.ts —— 注册面：createResearchTools 名册、无通道/无 provider 收据、cordis default 形与 apply 接线。
 * ctx/工具对象按 AGENTS「模拟宿主注入对象的桩可宽断言」处理（any 桩 + 注明）。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { name, inject, default as plugin, apply } from "../src/cordis.ts";
import { resolveResearchWorkspace } from "../src/config.ts";
import { createResearchTools } from "../src/tools.ts";
import { DELIVERY, REVIEW_PASS } from "./fixtures.ts";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolExec } from "../src/lib/host.ts";

type ResearchTool = {
  name: string;
  description: string;
  /** rootful 形（dtool 桥把 rootless properties 简写包成 object schema）。 */
  parameters: { type: "object"; properties: Record<string, { type: string; description: string }>; required?: string[] };
  execute(args: Record<string, unknown>, exec: unknown): Promise<{ verdict: string; summary: string; details?: Record<string, unknown> }>;
};

test("createResearchTools：单工具名册（research）+ 参数面 = topic + fetch_sources（topic required，零宿主参数）", () => {
  const tools = createResearchTools({ workspace: "/tmp/x", ctx: {} }) as unknown as ResearchTool[];
  assert.deepEqual(
    tools.map((t) => t.name),
    ["research"],
  );
  const schema = tools[0].parameters;
  assert.equal(schema.type, "object");
  assert.deepEqual(Object.keys(schema.properties).sort(), ["fetch_sources", "topic"].sort());
  assert.deepEqual(schema.required, ["topic"], "rootful 形：required 数组点名 topic（fetch_sources 可选）");
  assert.ok(!("project" in schema.properties), "project 已摘除（通用件不传宿主概念）");
  assert.ok(!("source" in schema.properties) && !("path" in schema.properties) && !("label" in schema.properties));
});

test("research execute：宿主无 subagents 通道 → 收据 error 不抛（fail 保全，非 throw）", async () => {
  const tools = createResearchTools({ workspace: "/tmp/x", ctx: {} }) as unknown as ResearchTool[];
  const out = await tools[0].execute({ topic: "主题甲" }, undefined);
  assert.equal(out.verdict, "error");
  assert.match(out.summary, /派单通道/u);
});

test("research execute：无可用搜索 provider → 收据 error（不派单，fail 保全）", async () => {
  const tools = createResearchTools({
    workspace: "/tmp/x",
    // 宿主注入对象桩（AGENTS 允许宽断言）：subagents 通在、web seam 空。
    ctx: { subagents: { start: () => undefined }, web: { searchProviders: new Map() } } as never,
  }) as unknown as ResearchTool[];
  const out = await tools[0].execute({ topic: "主题甲" }, { agent: { session: { meta: { cwd: "/tmp" } } } });
  assert.equal(out.verdict, "error");
  assert.match(out.summary, /provider 不可用/u);
});

test("cordis default 形（官方插件协议）：name/inject 含 web/default.name 三处同源", () => {
  assert.equal(name, "dsh-plugin-research");
  assert.deepEqual([...inject].sort(), ["reflect", "subagents", "tools", "web"], "inject 声明 tools/subagents/web + reflect（配置服务 Remote）");
  assert.equal((plugin as { name: string }).name, "dsh-plugin-research");
});

test("cordis apply：工具全注册进 ctx.tools.register；config 透传（routeKey/routes 进闭包）", () => {
  const registered: Array<{ name: string }> = [];
  const provided: Record<string, unknown> = {};
  const ctx = {
    tools: { register: (t: { name: string }) => registered.push(t) },
    reflect: {
      provide: (n: string, s: unknown) => {
        provided[n] = s;
      },
    },
    subagents: { start: () => undefined },
    web: { searchProviders: new Map([["exa", { id: "exa", available: () => true }]]) },
    logger: { info: () => undefined, warn: () => undefined },
  };
  apply(ctx as never, { workspace: "/Volumes/DATA/AI视频/自动剪辑", routeKey: "content-writer.researcher", routes: [{ provider: "p", model: "m" }] });
  assert.deepEqual(
    registered.map((t) => t.name),
    ["research"],
  );
  assert.ok(provided.research, "配置服务已 provide（research 命名空间，settings 页数据面）");
  assert.equal((provided.research as { workspace?: string }).workspace, "/Volumes/DATA/AI视频/自动剪辑");
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

test("research execute：UI 配置拆分双路由（config > patch routes；配置文件落 .runtime/research）", async () => {
  const ws = mkdtempSync(join(tmpdir(), "rsch-exec-"));
  try {
    mkdirSync(join(ws, ".runtime", "research"), { recursive: true });
    writeFileSync(
      join(ws, ".runtime", "research", "config.json"),
      JSON.stringify({ version: 1, model: "cfg/primary", thinking: "medium", split: true, reviewModel: "rv/reviewer", reviewThinking: "low" }),
      "utf8",
    );
    const starts: Array<{ agentOptions: { provider?: string; model?: string; reasoningEffort?: string }; label: string }> = [];
    const scripted = [DELIVERY, REVIEW_PASS];
    // 宿主注入对象桩（AGENTS 允许宽断言）：subagents.start 脚本化回据 + web seam 命中 exa。
    const ctx = {
      subagents: {
        start: (_kind: string, request: { agentOptions: { provider?: string; model?: string; reasoningEffort?: string }; label: string }) => {
          starts.push(request);
          return { result: Promise.resolve({ stopReason: "completed", structured: scripted[starts.length - 1] ?? null }) };
        },
      },
      web: { searchProviders: new Map([["exa", { id: "exa", available: () => true }]]) },
      logger: { info: () => undefined },
    } as never;
    const tools = createResearchTools({ workspace: ws, routes: [{ provider: "patch", model: "patch-route" }], ctx }) as unknown as ResearchTool[];
    const out = await tools[0].execute({ topic: "可乐财报" }, { agent: { session: { meta: { cwd: ws } } } });
    assert.equal(out.verdict, "pass");
    assert.equal(starts.length, 2);
    assert.equal(starts[0].agentOptions.provider, "cfg", "UI 配置研究员路由覆盖 patch 行 routes");
    assert.equal(starts[0].agentOptions.model, "primary");
    assert.equal(starts[0].agentOptions.reasoningEffort, "medium");
    assert.equal(starts[1].agentOptions.provider, "rv", "拆分后工序②走审查员路由");
    assert.equal(starts[1].agentOptions.model, "reviewer");
    assert.equal(starts[1].agentOptions.reasoningEffort, "low");
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});
