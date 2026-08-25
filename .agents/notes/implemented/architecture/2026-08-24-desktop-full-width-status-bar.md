# Agent Note: Desktop full-width status bar

Status: implemented

English | [中文](2026-08-24-desktop-full-width-status-bar.zh.md)

## Problem

The conversation statistics row is constrained to the upstream conversation content column. In DSH Desktop, long metric groups can therefore be ellipsized even when the application window has unused horizontal space.

## Decision

Advanced DSH Desktop promotes the existing statistics slot occupant to a viewport-wide bottom status bar through the desktop-owned advanced-shell stylesheet. The metrics producer remains the upstream conversation plugin, so counts, latency, throughput, cache, and token accounting keep their existing projection and localization behavior. Compatibility mode and the pinned upstream checkout remain unchanged.

The promoted row uses a fixed bottom position, a top separator, the active theme surface, and horizontal scrolling as the final fallback for windows narrower than the complete metric line. Conversation scrolling reserves status-bar clearance so the sticky composer and transcript do not sit beneath the bar. The hero layout does not reserve that clearance because it has no statistics row.

## Verification

The desktop package typecheck and tests cover the owned stylesheet bundle and client composition. The root build produces the Electron runtime before AppImage packaging; the generated AppImage is checked for existence and recorded as the release artifact.

## Consequences

Advanced DSH Desktop displays all available session metrics across the full window width without modifying the upstream UI package. The status bar remains scoped to the advanced desktop mode and is removed with the advanced shell's style effect.
