import type { Locale } from '@/i18n/config'

/**
 * Sample content for the home page until the Apps and Resources modules read from
 * Payload (「今天的 AI」already reads the published stories). The page shows a "demo data" banner while this is in use.
 * Heat scores are illustrative, not measurements.
 */

type Localized = Record<Locale, string>

export type DemoCategory = 'product' | 'industry' | 'open' | 'assistant' | 'search' | 'design' | 'coding'

export type DemoApp = {
  slug: string
  name: string
  initials: string
  tone: number
  category: DemoCategory
  heat: number
  description: Localized
}

export const demoApps: DemoApp[] = [
  {
    slug: 'chatgpt',
    name: 'ChatGPT',
    initials: 'G',
    tone: 0,
    category: 'assistant',
    heat: 99,
    description: {
      en: 'Chat, writing and task automation',
      'zh-Hans': '对话、写作与任务自动化',
      'zh-Hant': '對話、寫作與任務自動化',
      ja: '対話・文章作成・タスク自動化',
      ko: '대화, 글쓰기, 작업 자동화',
    },
  },
  {
    slug: 'gemini',
    name: 'Gemini',
    initials: 'Ge',
    tone: 1,
    category: 'assistant',
    heat: 97,
    description: {
      en: 'Multimodal personal assistant',
      'zh-Hans': '多模态个人助手',
      'zh-Hant': '多模態個人助理',
      ja: 'マルチモーダルなパーソナルアシスタント',
      ko: '멀티모달 개인 비서',
    },
  },
  {
    slug: 'claude',
    name: 'Claude',
    initials: 'C',
    tone: 2,
    category: 'assistant',
    heat: 95,
    description: {
      en: 'Long-document reading and coding help',
      'zh-Hans': '长文本理解与编程协作',
      'zh-Hant': '長文理解與程式協作',
      ja: '長文読解とコーディング支援',
      ko: '긴 문서 이해와 코딩 협업',
    },
  },
  {
    slug: 'deepseek',
    name: 'DeepSeek',
    initials: 'D',
    tone: 3,
    category: 'assistant',
    heat: 91,
    description: {
      en: 'Open model and chat app',
      'zh-Hans': '开源大模型与对话应用',
      'zh-Hant': '開源大模型與對話應用',
      ja: 'オープンモデルとチャットアプリ',
      ko: '오픈 모델과 채팅 앱',
    },
  },
  {
    slug: 'perplexity',
    name: 'Perplexity',
    initials: 'P',
    tone: 4,
    category: 'search',
    heat: 88,
    description: {
      en: 'AI search with citations',
      'zh-Hans': '带引用的 AI 搜索',
      'zh-Hant': '附引用來源的 AI 搜尋',
      ja: '出典付きのAI検索',
      ko: '출처를 보여 주는 AI 검색',
    },
  },
  {
    slug: 'canva-ai',
    name: 'Canva AI',
    initials: 'Ca',
    tone: 5,
    category: 'design',
    heat: 86,
    description: {
      en: 'Templates and AI-generated designs',
      'zh-Hans': '模板设计与 AI 生成',
      'zh-Hant': '範本設計與 AI 生成',
      ja: 'テンプレートデザインとAI生成',
      ko: '템플릿 디자인과 AI 생성',
    },
  },
]

export const demoPickApp = {
  slug: 'cursor',
  name: 'Cursor',
  initials: 'Cu',
  tone: 0,
  category: 'coding' as DemoCategory,
  heat: 85,
  description: {
    en: 'AI-native code editor',
    'zh-Hans': 'AI 原生代码编辑器',
    'zh-Hant': 'AI 原生程式碼編輯器',
    ja: 'AIネイティブのコードエディタ',
    ko: 'AI 네이티브 코드 에디터',
  } satisfies Localized,
}

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
