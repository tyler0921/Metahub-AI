import type { PhaseKey } from '@shared';

export interface PhaseDescriptor {
  key: PhaseKey;
  label: string;
}

/** 상단 진행 표시줄에 나오는 단계 순서 */
export const PHASE_SEQUENCE: readonly PhaseDescriptor[] = [
  { key: 'recall', label: '회상' },
  { key: 'kickoff', label: '착수' },
  { key: 'draft', label: '초안' },
  { key: 'feedback', label: '교차검토' },
  { key: 'revise', label: '개정' },
  { key: 'integrate', label: '통합' },
  { key: 'review', label: '검수' },
  { key: 'save', label: '저장' },
];

export const phaseIndexOf = (key: PhaseKey): number =>
  PHASE_SEQUENCE.findIndex((p) => p.key === key);
