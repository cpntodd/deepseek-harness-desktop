# Agent Note: Desktop full-width status bar

Status: implemented

English | [English](2026-08-24-desktop-full-width-status-bar.md)

## Problem

DSH Desktop 的会话统计行受上游对话内容列宽限制。指标较长时，即使窗口仍有可用横向空间，文本也可能被省略。

## Decision

Advanced DSH Desktop 通过桌面自有的 advanced-shell 样式，把现有统计槽位提升为贯穿窗口底部的状态栏。指标生产者仍由上游对话插件负责，因此计数、延迟、吞吐、缓存和 token 统计继续使用原有 projection 与本地化行为。Compatibility 模式以及固定的上游子模块保持不变。

提升后的状态栏使用固定底部定位、顶部隔离线和当前主题背景；当窗口窄于完整指标行时，横向滚动作为最后的回退方式。对话滚动区域预留状态栏高度，避免 sticky composer 和 transcript 被状态栏遮挡。Hero 布局没有统计行，因此不预留该空间。

## Verification

桌面包的类型检查与测试覆盖自有样式 bundle 和客户端组合。根构建会先生成 Electron runtime，再进行 AppImage 打包；生成的 AppImage 以文件存在性作为发布产物证据。

## Consequences

Advanced DSH Desktop 在不修改上游 UI 包的情况下，使用整个窗口宽度展示可用会话指标。状态栏仅作用于 advanced desktop 模式，并随 advanced shell 的样式 effect 一起移除。
