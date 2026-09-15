/** 两端契约配对门（STANDARDS §2：每含 Remote 的插件必接；与 usage-stats 同款本地实现）：
 *  服务端真解析（运行时 SRC 标记 + 网关 methodParameterNames 语义的函数源码形参解析）
 *  ↔ 浏览器半真声明（lib/client.js 文本提取的 descriptor 调用点与固定字段）。
 *  改任一端而忘另一端 = 本测试红灯；sourceLocation 锚定服务端真实定义行，挪位/改名/签名形变三向漂移各自红。 */

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { ResearchConfigService } from "../src/cordis.ts";

const MARKER_KEY = "@deepseek-ai/dsh-typert-protocol/remote-methods";
const ROOT = new URL("..", import.meta.url);
const CLIENT = readFileSync(new URL("lib/client.js", ROOT), "utf8");
const SERVER = readFileSync(new URL("src/cordis.ts", ROOT), "utf8");

/** client 调用点的真声明提取（第三参 sourceLocation 必填——官方产物恒带）。 */
interface ClientCall {
  method: string;
  param: string;
  file: string;
  line: number;
  column: number;
}
function clientDescriptorCalls(): ClientCall[] {
  const calls: ClientCall[] = [];
  for (const m of CLIENT.matchAll(/descriptor\(\s*"([^"]+)",\s*"([^"]+)",\s*\{\s*file:\s*"([^"]+)",\s*line:\s*(\d+),\s*column:\s*(\d+)\s*\}\s*\)/g)) {
    calls.push({ method: m[1], param: m[2], file: m[3], line: Number(m[4]), column: Number(m[5]) });
  }
  return calls;
}

/** 网关 methodParameterNames 的解析复刻（与网关同规则）：括号内 → 逗号切分 → trim → 纯标识符。 */
function srcParamNames(fn: Function): string[] {
  const source = Function.prototype.toString.call(fn);
  const open = source.indexOf("(");
  const close = source.indexOf(")", open + 1);
  const inside = source.slice(open + 1, close);
  return inside
    .split(",")
    .map((token) => token.trim())
    .filter((token) => /^[A-Za-z_$][\w$]*$/.test(token));
}

interface RemoteMethodsMarker {
  version: number;
  methods: Array<{ method: string; invocation: { kind: string } }>;
}

test("client descriptor 调用点全部提取且无漏网（防绕过式新增方法）", () => {
  const calls = clientDescriptorCalls();
  assert.ok(calls.length > 0, "必须至少有一个带 sourceLocation 的 descriptor 调用点");
  const occurrences = (CLIENT.match(/\bdescriptor\(/g) ?? []).length;
  assert.equal(occurrences, calls.length + 1, "descriptor 调用点数与提取数不一致（提取正则失配）");
});

test("两端方法集与 wire 参数名一一对应（getConfig/_hint、setConfig/patch）", () => {
  const marker = Object.getOwnPropertyDescriptor(ResearchConfigService.prototype, MARKER_KEY) as { value: RemoteMethodsMarker } | undefined;
  assert.ok(marker, "服务端必须挂 remote-methods 标记（原型字符串键）");
  const proto = ResearchConfigService.prototype as unknown as Record<string, Function>;
  const serverMethods = new Map<string, string[]>();
  for (const entry of marker!.value.methods) {
    assert.equal(entry.invocation.kind, "direct", `方法 ${entry.method} 的 invocation 形态`);
    assert.equal(typeof proto[entry.method], "function", `标记声明了 ${entry.method} 但实现缺失`);
    serverMethods.set(entry.method, srcParamNames(proto[entry.method]!));
  }
  const clientCalls = clientDescriptorCalls();
  assert.equal(clientCalls.length, serverMethods.size, "方法数量两端不一致");
  for (const call of clientCalls) {
    assert.ok(serverMethods.has(call.method), `client 声明了服务端没有的方法 ${call.method}`);
    const params = serverMethods.get(call.method)!;
    assert.equal(params.length, 1, `服务端 ${call.method} 应为单参数（descriptor() 只编码单参数形态）`);
    assert.equal(params[0], call.param, `两端 ${call.method} 的 wire 参数名错位：server=${params[0]} client=${call.param}`);
  }
});

test("sourceLocation 锚定服务端真实定义行（官方 codegen 产物规范）", () => {
  for (const call of clientDescriptorCalls()) {
    const path = new URL(call.file, ROOT);
    assert.ok(existsSync(path), `sourceLocation.file 不存在：${call.file}`);
    const line = readFileSync(path, "utf8").split("\n")[call.line - 1] ?? "";
    assert.ok(
      line.slice(call.column - 1).startsWith(`${call.method}(`),
      `sourceLocation ${call.file}:${call.line}:${call.column} 未直指 ${call.method} 的定义行（内容：${JSON.stringify(line.trim())}）——方法挪位/改名后同步 descriptor 的 line`,
    );
  }
});

test("descriptor 固定字段与客户端挂载路径两端一致（research 命名空间）", () => {
  assert.match(CLIENT, /id:\s*SETTINGS_NS\s*\+\s*"#research\/"\s*\+\s*method/);
  assert.match(CLIENT, /service:\s*"research"/);
  assert.match(CLIENT, /namespace:\s*"research"/);
  assert.match(CLIENT, /source:\s*"json"/);
  assert.match(CLIENT, /mode:\s*"strict"/);
  assert.match(CLIENT, /acceptsUndefined:\s*true/, "_hint 可省略必须用官方显式字段声明（codegen 规范）");
  assert.match(SERVER, /provide\?\.\(\s*"research"/);
  // 浏览器半取服务必须走名字解析（属性式在动态 fiber 被可见性隔离拒绝，见 STANDARDS §7）。
  assert.match(CLIENT, /ctx\.get\("remote\.research"\)/);
  assert.doesNotMatch(CLIENT, /ctx\.remote\.research\b/, "属性式访问会 throw without inject");
});
