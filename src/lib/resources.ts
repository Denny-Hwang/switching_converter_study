/**
 * External learning resources (resources.yaml at the repository root).
 * Every entry was verified (URL opened / title matched, see
 * scripts/resources_check.py) and carries a retrieval date.
 */
import yaml from 'js-yaml';
import raw from '../../resources.yaml?raw';

export interface Resource {
  id: string;
  type: string;
  title: string;
  author: string;
  url: string;
  tags: string[];
  level: 'intro' | 'intermediate' | 'advanced';
  language: 'en' | 'ko';
  retrieved: string;
  why: string;
  why_ko: string;
  title_match: string;
  urlkind?: 'html' | 'pdf' | 'login';
  cite?: string;
}

/** YAML reads an unquoted 2026-09-23 as a Date; show it as that date again. */
function isoDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

const data = yaml.load(raw) as { resources: Resource[] };
export const resources: readonly Resource[] = data.resources.map((r) => ({ ...r, retrieved: isoDate(r.retrieved) }));

/** Labels of the resource types, and the order the resource pages list them in. */
export const RESOURCE_TYPES = {
  book: { en: 'Book', ko: '도서' },
  chapter: { en: 'Book chapter', ko: '도서 장' },
  course: { en: 'Course', ko: '강좌' },
  lecture: { en: 'Lecture notes', ko: '강의 노트' },
  video: { en: 'Video', ko: '동영상' },
  channel: { en: 'Video channel', ko: '동영상 채널' },
  'app-note': { en: 'Application note', ko: '응용 노트' },
  article: { en: 'Technical article', ko: '기술 기사' },
  datasheet: { en: 'Data sheet', ko: '데이터시트' },
  tool: { en: 'Tool', ko: '도구' },
  paper: { en: 'Paper', ko: '논문' },
} as const;
export type ResourceType = keyof typeof RESOURCE_TYPES;

export const RESOURCE_LEVELS = {
  intro: { en: 'Introductory', ko: '입문' },
  intermediate: { en: 'Intermediate', ko: '중급' },
  advanced: { en: 'Advanced', ko: '고급' },
} as const;

export function typeLabel(type: string, locale: 'en' | 'ko'): string {
  return RESOURCE_TYPES[type as ResourceType]?.[locale] ?? type;
}

export function getResource(id: string): Resource {
  const r = resources.find((x) => x.id === id);
  if (!r) throw new Error(`unknown resource id "${id}" (resources.yaml)`);
  return r;
}
