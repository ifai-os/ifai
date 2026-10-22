/**
 * The seven Skill categories of docs/specs/resources.md, fixed in code. The admin shows the
 * labels below; the site reads the five-language names from messages/*.json (`skillCategories`).
 */
export const skillCategories = ['coding', 'knowledge', 'writing', 'design', 'data', 'productivity', 'life'] as const

export type SkillCategory = (typeof skillCategories)[number]

export const skillCategoryLabels: Record<SkillCategory, { en: string; zh: string }> = {
  coding: { en: 'Coding', zh: '开发编程' },
  knowledge: { en: 'Knowledge', zh: '知识管理' },
  writing: { en: 'Writing', zh: '写作创作' },
  design: { en: 'Design', zh: '设计' },
  data: { en: 'Data analysis', zh: '数据分析' },
  productivity: { en: 'Productivity', zh: '办公效率' },
  life: { en: 'Everyday life', zh: '生活服务' },
}
