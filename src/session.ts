/** session.ts —— research 会话薄写层（本包自有真源，自域仓旧基建 session-ledger.ts 删除前 vendor 精简：只留会话信封面）。
 *
 * 每个编排工具运行，在工作区根 `.runtime/sessions/<skill>/<tool>/<case>/manifest.json`
 * 留一本统一小信封：{ schema, skill, tool, case_id, project?, mode?, subject?, verdict,
 * reason?, started_at, updated_at, duration_ms?, artifacts? }。大件证据不搬家，信封只存指针。
 *
 * - 家在工作区根 `.runtime/`：会话账本不寄生技能目录；各技能按 <skill>/<tool> 分目录，互不串门。
 * - 留存：每 `<tool>/` 目录保留最近 keep 本（缺省 60），只删带本 schema 标记的 case 目录，其它一律不动。
 * - 全部 fail-open：open/finish 内部吞掉一切异常，账本永不阻断主链。
 * - 只依赖 node:fs/node:path。schema 值冻结：extension-session.v1（一字不改，账本格式归 dsh-plugin-ledger（在建））。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SESSION_SCHEMA = "extension-session.v1";
/** 每 tool 目录保留最近多少本会话信封（用户口径：最近 60 条）。 */
export const SESSION_KEEP_DEFAULT = 60;

export type SessionVerdict = "running" | "pass" | "fix" | "insufficient" | "error" | string;

export interface SessionOpen {
  ws: string;
  skill: string;
  tool: string;
  case_id: string;
  project?: string;
  mode?: string;
  subject?: string;
}

export interface SessionFinish {
  verdict: SessionVerdict;
  reason?: string;
  /** 证据指针（receipt/report/raw 等绝对路径），不搬大件。 */
  artifacts?: Record<string, string>;
  duration_ms?: number;
}

export interface SessionHandle {
  ok: boolean;
  dir: string;
  manifestPath: string;
  openedAt: string;
}

/** case_id 入目录前消毒：只留基座同款字符集，其它一律折成 `_`（防 `../` 越狱）。 */
export function sanitizeCaseId(caseId: string): string {
  const s = String(caseId || "")
    .trim()
    .slice(0, 120);
  if (!s) return "";
  return s.replace(/[^\p{L}\p{N}._-]+/gu, "_");
}

/** 编排运行 case_id 合成：`<prefix>-<pid36>-<time36>`（同毫秒并行不撞车，字符集可直接入目录）。 */
export function newRunId(prefix = "run"): string {
  const p =
    String(prefix || "run")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .slice(0, 24) || "run";
  return `${p}-${process.pid.toString(36)}-${Date.now().toString(36)}`;
}

/** 会话账本根：`<ws>/.runtime/sessions/<skill>/<tool>`。 */
export function sessionToolDir(ws: string, skill: string, tool: string): string {
  const safeSkill = String(skill || "unknown").replace(/[^A-Za-z0-9._-]+/g, "_");
  const safeTool = String(tool || "unknown").replace(/[^A-Za-z0-9._-]+/g, "_");
  return join(ws, ".runtime", "sessions", safeSkill, safeTool);
}

export function sessionCaseDir(ws: string, skill: string, tool: string, caseId: string): string {
  return join(sessionToolDir(ws, skill, tool), sanitizeCaseId(caseId));
}

function skeleton(open: SessionOpen, nowIso: string): Record<string, string | number | Record<string, string>> {
  return {
    schema: SESSION_SCHEMA,
    skill: open.skill,
    tool: open.tool,
    case_id: open.case_id,
    project: open.project ?? "",
    mode: open.mode ?? "",
    subject: String(open.subject ?? "").slice(0, 200),
    verdict: "running",
    reason: "",
    started_at: nowIso,
    updated_at: nowIso,
    duration_ms: 0,
    artifacts: {},
  };
}

/** 起案即落第一笔（零留痕不可能）。任何异常都吞掉，返回 ok:false 的降级句柄。 */
export function openSession(open: SessionOpen): SessionHandle {
  const bad: SessionHandle = { ok: false, dir: "", manifestPath: "", openedAt: "" };
  try {
    const caseId = sanitizeCaseId(open.case_id);
    if (!open.ws || !open.skill || !open.tool || !caseId) return bad;
    const dir = sessionCaseDir(open.ws, open.skill, open.tool, caseId);
    const manifestPath = join(dir, "manifest.json");
    const nowIso = new Date().toISOString();
    mkdirSync(dir, { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(skeleton({ ...open, case_id: caseId }, nowIso), null, 2) + "\n", "utf8");
    return { ok: true, dir, manifestPath, openedAt: nowIso };
  } catch {
    return bad;
  }
}

/** 收口：重写信封 + 同 tool 目录 prune 到 keep 本。异常一律吞掉。 */
export function finishSession(handle: SessionHandle, fin: SessionFinish, keep = SESSION_KEEP_DEFAULT): void {
  if (!handle?.ok || !handle.manifestPath) return;
  try {
    const nowIso = new Date().toISOString();
    let prev: Record<string, string | number | Record<string, string>> = {};
    try {
      prev = JSON.parse(readFileSync(handle.manifestPath, "utf8"));
    } catch {}
    if (prev?.schema !== SESSION_SCHEMA)
      prev = skeleton(
        { ws: "", skill: String(prev?.skill ?? ""), tool: String(prev?.tool ?? ""), case_id: String(prev?.case_id ?? "") },
        String(prev?.started_at ?? nowIso),
      );
    const artifacts: Record<string, string> = {};
    for (const [k, v] of Object.entries(fin.artifacts ?? {})) {
      if (typeof v === "string" && v) artifacts[k] = v;
    }
    const next = {
      ...prev,
      schema: SESSION_SCHEMA,
      verdict: fin.verdict || "error",
      reason: String(fin.reason ?? "").slice(0, 500),
      updated_at: nowIso,
      duration_ms: Number.isFinite(fin.duration_ms) ? Math.max(0, Math.round(fin.duration_ms as number)) : 0,
      artifacts: { ...((prev.artifacts ?? {}) as Record<string, string>), ...artifacts },
    };
    writeFileSync(handle.manifestPath, JSON.stringify(next, null, 2) + "\n", "utf8");
  } catch {}
  try {
    pruneSessions(join(handle.dir, ".."), keep);
  } catch {}
}

/** 剪枝：tool 目录下只保留最近 keep 个带本 schema 标记的 case 目录。返回删除数。 */
export function pruneSessions(toolDir: string, keep = SESSION_KEEP_DEFAULT): number {
  try {
    if (!toolDir || !existsSync(toolDir)) return 0;
    const names = readdirSync(toolDir);
    const scored: Array<{ name: string; ts: number }> = [];
    for (const name of names) {
      const full = join(toolDir, name);
      let st: { isDirectory(): boolean; mtimeMs: number };
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;
      // 只认自家信封：无 manifest 或 schema 不对的一律不动（防误删他家目录）。
      let stamp = 0;
      try {
        const m = JSON.parse(readFileSync(join(full, "manifest.json"), "utf8"));
        if (m?.schema !== SESSION_SCHEMA) continue;
        stamp = Date.parse(m.updated_at || m.started_at || "") || st.mtimeMs;
      } catch {
        continue;
      }
      scored.push({ name, ts: stamp });
    }
    scored.sort((a, b) => b.ts - a.ts);
    let removed = 0;
    for (const v of scored.slice(Math.max(0, keep))) {
      try {
        rmSync(join(toolDir, v.name), { recursive: true, force: true });
        removed++;
      } catch {}
    }
    return removed;
  } catch {
    return 0;
  }
}
