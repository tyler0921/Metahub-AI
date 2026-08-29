import type { ArtifactFile } from '@shared';

/**
 * 코드형 산출물 자동 QA.
 *
 * `ReviewPhase`는 지금까지 LLM 이 코드를 "읽고" 판단했습니다 — 8B 급 모델은
 * 자리표시자나 깨진 링크 같은 기계적인 결함을 놓치는 일이 잦습니다.
 * 여기 있는 검사는 LLM 을 거치지 않는 **결정적** 검사만 담습니다.
 * ("HTML 에 없는 CSS 클래스" 같은 건 오탐이 나기 쉬워 일부러 넣지 않았습니다 —
 * 그건 여전히 검수 LLM 의 판단에 맡깁니다.)
 *
 * 반환값이 비어 있지 않으면 `ReviewPhase`가 검수 LLM 의 승인 여부와 무관하게
 * 반려로 강제합니다 — 이 항목들은 "의견"이 아니라 "사실"이기 때문입니다.
 */

const PLACEHOLDER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /lorem ipsum/i, label: 'Lorem ipsum 자리표시자' },
  { pattern: /\bTODO\b/, label: 'TODO 자리표시자' },
  { pattern: /여기에\s*(내용|텍스트|콘텐츠)/, label: '"여기에 내용" 류 자리표시자' },
  { pattern: /\bPLACEHOLDER\b/i, label: 'PLACEHOLDER 자리표시자' },
  { pattern: /\bcoming soon\b/i, label: '"coming soon" 자리표시자' },
];

const REF_ATTR = /\b(?:src|href)="([^"]*)"/g;

/** 존재 여부를 따질 필요가 없는 참조 (앵커·인라인 데이터·전화/메일 링크) */
function isSkippable(ref: string): boolean {
  return (
    ref === '' ||
    ref.startsWith('#') ||
    ref.startsWith('data:') ||
    ref.startsWith('mailto:') ||
    ref.startsWith('tel:') ||
    ref.startsWith('javascript:')
  );
}

/** http(s):// 나 // 로 시작하는, 인터넷이 있어야 열리는 외부 참조 */
function isExternal(ref: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(ref);
}

export function lintWebsiteArtifacts(files: ArtifactFile[]): string[] {
  const issues: string[] = [];
  if (files.length === 0) return ['생성된 파일이 없습니다.'];

  const byPath = new Set(files.map((f) => f.path.toLowerCase()));
  const htmlFiles = files.filter((f) => f.path.toLowerCase().endsWith('.html'));

  if (!byPath.has('index.html')) {
    issues.push('index.html 이 없습니다 — 미리보기가 열리지 않습니다.');
  }

  for (const file of files) {
    for (const { pattern, label } of PLACEHOLDER_PATTERNS) {
      if (pattern.test(file.content)) {
        issues.push(`${file.path}: ${label}가 남아 있습니다. 실제 내용으로 채워야 합니다.`);
        break; // 파일 하나당 한 줄이면 충분합니다 — 같은 파일에서 여러 개 잡아도 지적은 하나로
      }
    }
  }

  for (const file of htmlFiles) {
    if (!/<!DOCTYPE html>/i.test(file.content)) {
      issues.push(`${file.path}: <!DOCTYPE html> 선언이 없습니다.`);
    }
    if (!/<html[\s>]/i.test(file.content)) {
      issues.push(`${file.path}: <html> 태그가 없습니다.`);
    }
    if (!/<\/html>\s*$/i.test(file.content.trim())) {
      issues.push(`${file.path}: </html> 로 끝나지 않습니다 — 문서가 잘렸을 수 있습니다.`);
    }

    for (const match of file.content.matchAll(REF_ATTR)) {
      const ref = match[1];
      if (isSkippable(ref)) continue;

      if (isExternal(ref)) {
        issues.push(
          `${file.path}: "${ref}" 는 외부 리소스입니다 — 인터넷 없이 열려야 하므로 참조하면 안 됩니다.`,
        );
        continue;
      }

      const clean = ref.split(/[?#]/)[0].replace(/^\.\//, '');
      if (clean && !byPath.has(clean.toLowerCase())) {
        issues.push(
          `${file.path}: "${ref}" 를 참조하지만 그런 파일이 만들어지지 않았습니다.`,
        );
      }
    }
  }

  // 중복 제거 — 같은 문구가 여러 파일에서 반복되면 검수 LLM 프롬프트만 길어집니다
  return [...new Set(issues)];
}
