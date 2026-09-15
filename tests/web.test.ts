/** web.test.ts —— web seam provider 识别：镜像 WebRuntime.resolveProvider 选择规则（不抛版）。 */

import assert from "node:assert/strict";
import test from "node:test";
import { detectSearchProvider, type WebSeam } from "../src/web.ts";

function seam(entries: Array<[string, boolean]>, configured?: string): WebSeam {
  return {
    searchProviders: new Map(entries.map(([id, ok]) => [id, { id, available: () => ok }])),
    searchProviderId: configured,
  };
}

test("detectSearchProvider：显式配置命中且可用 → 用配置（aivideo profile 现配 exa 的形态）", () => {
  const info = detectSearchProvider(
    seam(
      [
        ["exa", true],
        ["deepseek", false],
      ],
      "exa",
    ),
  );
  assert.equal(info.effective, "exa");
  assert.equal(info.configured, "exa");
  assert.deepEqual(info.usable, ["exa"]);
});

test("detectSearchProvider：无配置 + 唯一可用 → 当选", () => {
  const info = detectSearchProvider(
    seam([
      ["exa", true],
      ["deepseek", false],
    ]),
  );
  assert.equal(info.effective, "exa");
});

test("detectSearchProvider：多可用未配置 → 不代选，报 AMBIGUOUS 排障文案", () => {
  const info = detectSearchProvider(
    seam([
      ["exa", true],
      ["deepseek", true],
    ]),
  );
  assert.equal(info.effective, null);
  assert.match(info.note, /多个可用搜索 provider/);
  assert.match(info.note, /WEB_PROVIDER_AMBIGUOUS/u);
});

test("detectSearchProvider：配置项指向未注册/不可用 provider → null + 点名", () => {
  const miss = detectSearchProvider(seam([["exa", true]], "deepseek"));
  assert.equal(miss.effective, null);
  assert.match(miss.note, /「deepseek」未注册或不可用/u);
  const dead = detectSearchProvider(seam([["exa", false]], "exa"));
  assert.equal(dead.effective, null);
  assert.match(dead.note, /未注册或不可用/u);
});

test("detectSearchProvider：全部不可用 / 无 seam / 空 Map → null + 各自文案", () => {
  const none = detectSearchProvider(seam([]));
  assert.equal(none.effective, null);
  assert.match(none.note, /无可用的搜索 provider/u);
  assert.match(detectSearchProvider(undefined).note, /web seam/u);
  const emptySeam = { fetchProviders: new Map() } as unknown as WebSeam;
  assert.match(detectSearchProvider(emptySeam).note, /web seam/u);
});
