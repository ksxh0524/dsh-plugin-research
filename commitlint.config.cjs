/**
 * Commitlint 配置 - 强制 Conventional Commits（scope 按「模块/位置」组织，agent 从改动文件路径机械推导）。
 *
 * scope → 路径映射：
 *   cordis  → src/cordis.ts（注册入口）
 *   engine  → src/engine.ts（research_build 编排）
 *   contract→ src/contract.ts（证据行合同：格式/校验/渲染）
 *   tools   → src/tools.ts（工具面）
 *   tests   → tests/**
 *   infra   → 根级（package.json/.husky/.github/README/DEBT/tsconfig）
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-empty": [2, "never"],
    "scope-case": [2, "always", "lower-case"],
    "subject-case": [0],
  },
};
