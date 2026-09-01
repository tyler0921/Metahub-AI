import type { ToolKind } from '@shared';

const TOOL_DISPLAY_NAME: Record<ToolKind, string> = {
  vault: 'Vault',
  'web-search': '웹 검색',
  'file-write': '파일 작성',
};

/** 타임라인·시스템 로그에 쓰는 도구 이름 */
export function toolDisplayName(tool: ToolKind): string {
  return TOOL_DISPLAY_NAME[tool];
}

/** 도구 이벤트 상태 한글 라벨 */
export function toolStatusLabel(status: 'started' | 'completed' | 'failed'): string {
  if (status === 'started') return '시작';
  if (status === 'failed') return '실패';
  return '완료';
}
