/** Locale dictionaries for the Desktop agent status panel. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

export const zh = {
  title: '代理状态',
  mcp: 'MCP',
  lsp: 'LSP',
  todo: '待办',
  empty: '暂无进行中的项目',
  close: '关闭',
  loading: '加载中…',
  error: '状态不可用',
  enabled: '已启用',
  disabled: '已禁用',
  todoEmpty: '暂无待办',
  refresh: '刷新',
} as const

export type DesktopStatusLocaleKey = keyof typeof zh

export const en: Record<DesktopStatusLocaleKey, string> = {
  title: 'Agent Status',
  mcp: 'MCP',
  lsp: 'LSP',
  todo: 'Todo',
  empty: 'Nothing active yet',
  close: 'Close',
  loading: 'Loading…',
  error: 'Status unavailable',
  enabled: 'Enabled',
  disabled: 'Disabled',
  todoEmpty: 'No todos',
  refresh: 'Refresh',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Desktop-owned agent status panel copy. */
    'desktop.status': DesktopStatusLocaleKey
  }
}
