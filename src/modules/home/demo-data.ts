import type { Locale } from '@/i18n/config'

/**
 * Sample content for the home page until the Resources module reads from Payload (「今天的
 * AI」and the apps already read real data). The page shows a "demo data" banner while this is
 * in use.
 */

type Localized = Record<Locale, string>

export const demoFeaturedSkill = {
  slug: 'full-stack-coder',
  name: {
    en: 'Full-stack Coder',
    'zh-Hans': '全栈编程助手',
    'zh-Hant': '全端程式設計助手',
    ja: 'フルスタック開発アシスタント',
    ko: '풀스택 코딩 도우미',
  } satisfies Localized,
  description: {
    en: 'From a one-line request to a running project',
    'zh-Hans': '从一句需求到可运行的项目',
    'zh-Hant': '從一句需求到可執行的專案',
    ja: '一言の要望から動くプロジェクトまで',
    ko: '한 줄 요청에서 실행되는 프로젝트까지',
  } satisfies Localized,
}

export type DemoSkill = {
  slug: string
  initials: string
  tone: number
  author: string
  rating: number
  installs: number
  name: Localized
  description: Localized
}

export const demoSkills: DemoSkill[] = [
  {
    slug: 'multi-engine-search',
    initials: '多',
    tone: 1,
    author: '林栖',
    rating: 4.8,
    installs: 588000,
    name: {
      en: 'Multi-engine Search',
      'zh-Hans': '多引擎检索',
      'zh-Hant': '多引擎檢索',
      ja: 'マルチエンジン検索',
      ko: '멀티 엔진 검색',
    },
    description: {
      en: 'Queries several engines, cross-checks, and links the sources',
      'zh-Hans': '同时查询多个搜索引擎，交叉验证后附上原始链接',
      'zh-Hant': '同時查詢多個搜尋引擎，交叉驗證後附上原始連結',
      ja: '複数の検索エンジンを横断し、照合したうえで元リンクを添付',
      ko: '여러 검색 엔진을 동시에 조회하고 교차 검증 후 원문 링크 첨부',
    },
  },
  {
    slug: 'weekly-report-writer',
    initials: '周',
    tone: 5,
    author: '周一不加班',
    rating: 4.7,
    installs: 412000,
    name: {
      en: 'Weekly Report Writer',
      'zh-Hans': '周报生成器',
      'zh-Hant': '週報產生器',
      ja: '週報ジェネレーター',
      ko: '주간 보고서 작성기',
    },
    description: {
      en: "Turns this week's commits, calendar and notes into a report",
      'zh-Hans': '读取本周提交、日程和笔记，整理成周报',
      'zh-Hant': '讀取本週提交、行程與筆記，整理成週報',
      ja: '今週のコミット・予定・メモから週報を作成',
      ko: '이번 주 커밋, 일정, 메모를 주간 보고서로 정리',
    },
  },
  {
    slug: 'paper-deep-read',
    initials: '论',
    tone: 4,
    author: '算力观察',
    rating: 4.8,
    installs: 356000,
    name: {
      en: 'Paper Deep Read',
      'zh-Hans': '论文精读',
      'zh-Hant': '論文精讀',
      ja: '論文精読',
      ko: '논문 정독',
    },
    description: {
      en: 'Explains methods and experiments section by section, flagging results and limits',
      'zh-Hans': '逐段解释方法与实验，标出结论和局限',
      'zh-Hant': '逐段解釋方法與實驗，標出結論與局限',
      ja: '手法と実験を段落ごとに解説し、結論と限界を明示',
      ko: '방법과 실험을 단락별로 설명하고 결론과 한계를 표시',
    },
  },
  {
    slug: 'ui-review',
    initials: 'UI',
    tone: 3,
    author: '半格',
    rating: 4.6,
    installs: 214000,
    name: {
      en: 'UI Review',
      'zh-Hans': 'UI 走查',
      'zh-Hant': 'UI 走查',
      ja: 'UIレビュー',
      ko: 'UI 검수',
    },
    description: {
      en: 'Checks screenshots against your design spec and lists fixes',
      'zh-Hans': '对照设计规范检查截图，输出修改清单',
      'zh-Hant': '對照設計規範檢查截圖，輸出修改清單',
      ja: 'デザイン規約と照らしてスクリーンショットを確認し、修正リストを出力',
      ko: '디자인 규칙에 맞춰 스크린샷을 검사하고 수정 목록 출력',
    },
  },
]
