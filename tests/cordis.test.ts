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
  assert.deepEqual([...inject].sort(), ["subagents", "tools", "web"], "inject 声明 tools/subagents/web + reflect（Remote）+ settings（配置段安装面）");
  assert.equal((plugin as { name: string }).name, "dsh-plugin-research");
});

test("cordis apply：工具注册 + settings 段安装 + Remote 服务（插件卡两端半齐）", () => {
  const registered: Array<{ name: string }> = [];
  const provided: Record<string, unknown> = {};
  let installed: { ns: string; schema: unknown; entry: unknown; hooks: { setSource: (s: () => unknown) => void } } | null = null;
  let source: () => unknown = () => undefined;
  const ctx = {
    tools: { register: (t: { name: string }) => registered.push(t) },
    reflect: {
      provide: (n: string, s: unknown) => {
        provided[n] = s;
      },
    },
    inject: (names: readonly string[], cb: (resolved: unknown) => void) => {
      assert.deepEqual([...names], ["settings"]);
      cb({
        settings: {
          installSection: (owner: unknown, ns: string, schema: unknown, entry: unknown, h: { setSource: (s: () => unknown) => void }) => {
            installed = { ns, schema, entry, hooks: h };
            h.setSource(() => ({ model: "cfg/primary", thinking: "medium", split: true, reviewModel: "rv/reviewer", reviewThinking: "low" }));
          },
        },
      });
    },
    subagents: { start: () => undefined },
    web: { searchProviders: new Map([["exa", { id: "exa", available: () => true }]]) },
    logger: { info: () => undefined, warn: () => undefined },
  };
  apply(ctx as never, { workspace: "/tmp/ws-x", routeKey: "content-writer.researcher", routes: [{ provider: "p", model: "m" }] });
  assert.deepEqual(
    registered.map((t) => t.name),
    ["research"],
  );
  assert.ok(provided.research, "配置服务已 provide（research 命名空间，插件卡 Remote 数据面）");
  assert.ok(installed, "settings 段已安装（served namespace，插件卡派发的服务端半）");
  const section = installed as { ns: string; schema: unknown; hooks: { setSource: (s: () => unknown) => void } };
  assert.equal(section.ns, "research");
  assert.ok(
    section.schema && (typeof section.schema === "function" || typeof section.schema === "object"),
    "schema 为 schemastery schema（宿主按数据消费）——z.object() 返回可调用对象",
  );
  assert.ok(typeof section.hooks.setSource === "function", "setSource 回灌钩子就位（settings 变更热推送 → 工具即时生效）");
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

test("research execute：插件卡配置拆分双路由（settings 段 > patch routes；readConfig live 闭包）", async () => {
  const ws = mkdtempSync(join(tmpdir(), "rsch-exec-"));
  try {
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
    // readConfig = settings 段 live 闭包桩（apply() 里由 installSection setSource 回灌同形）。
    const readConfig = () => ({
      model: "cfg/primary",
      thinking: "medium",
      split: true,
      researchModel: "",
      researchThinking: "",
      reviewModel: "rv/reviewer",
      reviewThinking: "low",
    });
    const tools = createResearchTools({ workspace: ws, routes: [{ provider: "patch", model: "patch-route" }], readConfig, ctx }) as unknown as ResearchTool[];
    const out = await tools[0].execute({ topic: "可乐财报" }, { agent: { session: { meta: { cwd: ws } } } });
    assert.equal(out.verdict, "pass");
    assert.equal(starts.length, 2);
    assert.equal(starts[0].agentOptions.provider, "cfg", "插件卡配置研究员路由覆盖 patch 行 routes");
    assert.equal(starts[0].agentOptions.model, "primary");
    assert.equal(starts[0].agentOptions.reasoningEffort, "medium");
    assert.equal(starts[1].agentOptions.provider, "rv", "拆分后工序②走审查员路由");
    assert.equal(starts[1].agentOptions.model, "reviewer");
    assert.equal(starts[1].agentOptions.reasoningEffort, "low");
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});
