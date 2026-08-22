# Agent Note: Desktop permission preset startup default

Status: implemented

English | [中文](2026-08-23-desktop-permission-preset-startup-default.zh.md)

## Decision

`dsh-desktop.permissionPreset` is a startup and fresh-session default, defaulting to `workspace-write`. `prepareDesktopProfile` projects it into the final Loader rows `sandbox-policy`, `approval`, and `permission`. Desktop-generated patches are applied after user profile and home patches, so the Desktop choice is authoritative for the generation.

Enforcement remains with the upstream sandbox and approval services. Existing session logs (`permission/preset`, `sandbox/mode`, and `approval/policy`) remain authoritative. `/permission` can still switch a live session by design; this is not a permanent session lock.

Full Access maps exactly to `danger-full-access` sandbox mode and `never` approval policy. No upstream code was modified.
