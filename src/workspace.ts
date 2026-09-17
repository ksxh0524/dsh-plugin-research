/** workspace.ts —— research 工作区定位（本包自有 helper，anchor+env 两级；裸名猜测已删）。
 *
 * 优先级：env AUTOVIDEO_WORKSPACE > 自起点向上找中性锚 `autovideo/workspace.json`（kind=auto-cut）。
 * 三类全 miss 即 fail-loud，报错直接给两条出路——绝不猜、绝不回落某个绝对路径。
 * 调用方（config.resolveResearchWorkspace）在此之上再做：config.workspace 优先、
 * 锚找不到回落会话 cwd 本身（插件会话 cwd 不必然在锚下）。
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
export function resolveWorkspaceRoot(startDir?: string, env?: Record<string, string | undefined>): string {
  const e = String((env ?? process.env).AUTOVIDEO_WORKSPACE ?? "").trim();
  if (e) return resolve(e);
  let dir = resolve(startDir || process.cwd());
  const tried: string[] = [];
  for (;;) {
    const anchor = join(dir, "autovideo", "workspace.json");
    tried.push(anchor);
    try {
      const kind = (JSON.parse(readFileSync(anchor, "utf8")) as { kind?: unknown })?.kind;
      if (kind === "auto-cut") return dir;
    } catch {
      /* 非有效锚，继续向上 */
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`[工作区未找到] 出路：① 设 AUTOVIDEO_WORKSPACE=<工作区根>；② 在工作区根放 autovideo/workspace.json。已试：\n${tried.join("\n")}`);
}
