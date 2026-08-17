import type { PhaseKey } from '@shared';

export interface PhaseDescriptor {
  key: PhaseKey;
  label: string;
}

/**
 * 상단 진행 표시줄에 나오는 단계 순서.
 *
 * `integrate` 와 `build` 는 **같은 자리**입니다. 지시가 문서형이면 통합이,
 * 코드형이면 구현이 그 자리에 들어갑니다. 둘을 나란히 놓으면 항상 한 칸이
 * 비어 보이므로 하나의 슬롯으로 묶었습니다.
 */
export const PHASE_SEQUENCE: readonly PhaseDescriptor[] = [
  { key: 'recall', label: '회상' },
  { key: 'kickoff', label: '착수' },
  { key: 'draft', label: '초안' },
  { key: 'feedback', label: '교차검토' },
  { key: 'revise', label: '개정' },
  { key: 'integrate', label: '통합·구현' },
  { key: 'review', label: '검수' },
  { key: 'save', label: '저장' },
];

/** 표시줄에서 이 단계가 차지하는 칸 */
export const displayPhase = (key: PhaseKey): PhaseKey => {
  if (key === 'build') return 'integrate';
  // 회고는 저장 직전 부가 단계 — 별도 칸을 두지 않고 저장 칸에 묶습니다
  if (key === 'reflect') return 'save';
  return key;
};

/** 단계 키 → 짧은 라벨 (사용량·타임라인 등 표시줄 밖에서도 씀) */
export const phaseLabelOf = (key: PhaseKey | null | undefined): string => {
  if (!key) return '기타';
  if (key === 'reflect') return '회고';
  if (key === 'build') return '구현';
  return PHASE_SEQUENCE.find((p) => p.key === displayPhase(key))?.label ?? '기타';
};

export const phaseIndexOf = (key: PhaseKey): number =>
  PHASE_SEQUENCE.findIndex((p) => p.key === displayPhase(key));
