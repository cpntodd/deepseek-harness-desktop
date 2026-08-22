# Agent Note：Desktop 权限预设启动默认值

状态：已实现

[English](2026-08-23-desktop-permission-preset-startup-default.md) | 中文

## 决策

`dsh-desktop.permissionPreset` 是启动和新会话默认值，默认使用 `workspace-write`。`prepareDesktopProfile` 将其投影到最终 Loader 的 `sandbox-policy`、`approval` 和 `permission` 行。Desktop 生成的补丁在用户 Profile 和 home 补丁之后应用，因此该选择对本次 generation 具有权威性。

实际执行仍由上游 sandbox 和 approval service 负责。现有 session log（`permission/preset`、`sandbox/mode`、`approval/policy`）仍是权威记录。按设计，`/permission` 仍可切换活动 session；这不是永久 session lock。

完全访问精确映射为 `danger-full-access` sandbox mode 和 `never` approval policy。未修改上游代码。
