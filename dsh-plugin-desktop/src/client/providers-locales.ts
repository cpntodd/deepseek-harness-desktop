/** Desktop-owned Providers settings copy (the combined API-key + Subscriptions page). */

export const zh = {
  nav: '服务商',
  title: '服务商',
  intro: '统一管理模型服务商的 API 密钥与订阅登录。',
  configured: '已配置',
  keyLabel: 'API 密钥',
  keyPlaceholder: '粘贴你的 API 密钥',
  saveKey: '保存',
  savingKey: '保存中…',
  keySaved: '已保存',
  loading: '正在加载服务商…',
  loadFailed: '无法加载服务商。',
  retry: '重试',
  unavailable: '连接不可用，无法加载服务商。',
} as const

export type ProvidersKey = keyof typeof zh

export const en: Record<ProvidersKey, string> = {
  nav: 'Providers',
  title: 'Providers',
  intro: 'Manage model-provider API keys and subscription logins in one place.',
  configured: 'Configured',
  keyLabel: 'API key',
  keyPlaceholder: 'Paste your API key',
  saveKey: 'Save',
  savingKey: 'Saving…',
  keySaved: 'Saved',
  loading: 'Loading providers…',
  loadFailed: 'Providers could not be loaded.',
  retry: 'Try again',
  unavailable: 'Connection unavailable; providers cannot be loaded.',
}
