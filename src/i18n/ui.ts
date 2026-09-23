/** UI strings for custom components (Starlight's own UI is translated upstream). */
export const ui = {
  en: {
    'eq.details': 'Assumptions, convention and source',
    'eq.assumptions': 'Assumptions',
    'eq.convention': 'Convention',
    'eq.notes': 'Notes',
    'eq.source': 'Source',
    'eq.verified': (n: number) => `verified by ${n} test${n === 1 ? '' : 's'}`,
    'eq.yaml': 'equations.yaml entry',
    'eq.id': 'Equation id',
  },
  ko: {
    'eq.details': '가정, 표기 규약, 출처',
    'eq.assumptions': '가정',
    'eq.convention': '표기 규약',
    'eq.notes': '비고',
    'eq.source': '출처',
    'eq.verified': (n: number) => `테스트 ${n}개로 검증됨`,
    'eq.yaml': 'equations.yaml 항목',
    'eq.id': '수식 id',
  },
} as const;

export type Locale = keyof typeof ui;

export function localeOf(value: string | undefined): Locale {
  return value === 'ko' ? 'ko' : 'en';
}
