const KEY = 'metahub.activeSessionId';

/**
 * 진행 중인 세션 id 를 브라우저에 남겨 둡니다.
 *
 * 로컬 모델은 한 건에 수 분이 걸리기 때문에, 새로고침 한 번으로
 * 진행 상황을 통째로 잃으면 사실상 처음부터 다시 시켜야 합니다.
 * 서버가 세션을 들고 있으니 id 만 기억해 두면 다시 붙을 수 있습니다.
 */
export const activeSession = {
  save(sessionId: string): void {
    try {
      localStorage.setItem(KEY, sessionId);
    } catch {
      /* 시크릿 모드 등에서 저장이 막혀도 동작에는 지장이 없습니다 */
    }
  },

  load(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* 무시 */
    }
  },
};
