// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const zh = {
  title: 'Agent',
  intro:
    '会员在设置页「Agent」分区给自己的 AI Agent 起名字、发密钥，Agent 带着密钥用开放 API 和 MCP。这里看每个 Agent 的主人、密钥和今天的用量。停用后它的密钥马上失效，主人在设置页看到停用和原因；恢复后原来的密钥接着能用。请求数按上海时间的今天算。',
  number: (value: number) => value.toLocaleString('zh-CN'),
  summary: (agents: string, disabled: number, withKey: string, withoutKey: string) =>
    `共 ${agents} 个 Agent${disabled ? `，${disabled} 个已停用` : ''}。今天带密钥的请求 ${withKey} 次，不带密钥的 ${withoutKey} 次。`,
  filters: {
    all: '全部',
    disabled: '已停用',
    one: (name: string) => `只看「${name}」`,
    showAll: '看全部',
  },
  columns: { agent: 'Agent', owner: '主人', keys: '密钥', lastUsed: '最近使用', today: '今天的请求', status: '状态' },
  created: (time: string) => `${time} 创建`,
  keys: (working: number, total: number, write: number) =>
    total === 0 ? '没有' : `${working} 把有效${total > working ? `（共 ${total} 把）` : ''}${write ? `，${write} 把能写` : ''}`,
  never: '没用过',
  active: '正常',
  disabledAt: (time: string) => `${time} 停用`,
  reason: (reason: string) => `原因：${reason}`,
  noReason: '没写原因',
  disable: '停用',
  reasonLabel: '原因（主人在设置页看得到，可以不写）',
  confirmDisable: '确定停用',
  cancel: '取消',
  restore: '恢复',
  disabledToast: '已停用，它的密钥马上失效。',
  restoredToast: '已恢复，它的密钥又能用了。',
  reasonTooLong: (max: number) => `原因最多 ${max} 个字。`,
  failed: '操作失败',
  none: '还没有 Agent。',
  noneFiltered: '没有符合的 Agent。',
  previous: '上一页',
  next: '下一页',
  page: (page: number, pages: number) => `第 ${page} / ${pages} 页`,
  history: '操作记录',
}

export type AgentsAdminText = typeof zh

const en: AgentsAdminText = {
  title: 'Agents',
  intro:
    'Members name their AI agents and make them keys in the Agents section of their settings; agents use the keys with the open API and MCP. This page shows each agent’s owner, keys and use today. Turning one off stops its keys at once, and its owner sees that and the reason in their settings; turning it back on makes the same keys work again. Requests count from midnight, Shanghai time.',
  number: (value: number) => value.toLocaleString('en-US'),
  summary: (agents: string, disabled: number, withKey: string, withoutKey: string) =>
    `${agents} agents${disabled ? `, ${disabled} turned off` : ''}. Today: ${withKey} requests with a key, ${withoutKey} without.`,
  filters: {
    all: 'All',
    disabled: 'Turned off',
    one: (name: string) => `Only “${name}”`,
    showAll: 'Show all',
  },
  columns: { agent: 'Agent', owner: 'Owner', keys: 'Keys', lastUsed: 'Last used', today: 'Requests today', status: 'Status' },
  created: (time: string) => `Created ${time}`,
  keys: (working: number, total: number, write: number) =>
    total === 0 ? 'None' : `${working} working${total > working ? ` (of ${total})` : ''}${write ? `, ${write} can write` : ''}`,
  never: 'Never',
  active: 'On',
  disabledAt: (time: string) => `Turned off ${time}`,
  reason: (reason: string) => `Reason: ${reason}`,
  noReason: 'No reason given',
  disable: 'Turn off',
  reasonLabel: 'Reason (its owner sees it in their settings; optional)',
  confirmDisable: 'Turn it off',
  cancel: 'Cancel',
  restore: 'Turn back on',
  disabledToast: 'Turned off; its keys stopped working.',
  restoredToast: 'Turned back on; its keys work again.',
  reasonTooLong: (max: number) => `The reason can be at most ${max} characters.`,
  failed: 'Failed',
  none: 'No agents yet.',
  noneFiltered: 'No agents match.',
  previous: 'Previous',
  next: 'Next',
  page: (page: number, pages: number) => `Page ${page} of ${pages}`,
  history: 'Admin log',
}

export function agentsAdminText(language: string): AgentsAdminText {
  return language.startsWith('zh') ? zh : en
}
