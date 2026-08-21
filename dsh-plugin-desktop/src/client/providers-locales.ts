/** Desktop-owned Providers settings copy (the combined API-key + Subscriptions page). */

export const zh = {
  nav: '服务商',
  title: '服务商',
  intro: '统一管理模型服务商的 API 密钥与订阅登录。',
  apiKeysTitle: 'API 密钥',
  apiKeysIntro: '为每个模型服务商添加 API 密钥。密钥通过设置服务安全保存，不会在此页面回显。',
  subscriptionsTitle: '订阅',
  configured: '已配置',
  notConfigured: '未配置',
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
  apiKeysTitle: 'API keys',
  apiKeysIntro: 'Add an API key for each model provider. Keys are stored securely through the settings service and are never shown back on this page.',
  subscriptionsTitle: 'Subscriptions',
  configured: 'Configured',
  notConfigured: 'Not configured',
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
