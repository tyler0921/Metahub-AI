import { useCallback, useEffect, useRef } from 'react';
import { activeSession } from '@/lib/session-storage';
import { companyService } from '@/services/company.service';
import { ApiError } from '@/services/http.client';
import {
  subscribeToSession,
  type Unsubscribe,
} from '@/services/session-stream.service';
import { useSessionStore } from '@/store/session.store';

interface CompanySession {
  isRunning: boolean;
  isCancelling: boolean;
  /** 대표 지시를 접수하고 진행 상황 구독을 시작합니다 */
  submit: (brief: string, parentSessionId?: string) => Promise<void>;
  /** 진행 중인 업무를 서버에서 실제로 중단시킵니다 */
  cancel: () => Promise<void>;
  /** 진행 중인 세션 구독만 끊습니다 (서버 작업은 계속됩니다) */
  detach: () => void;
}

const streamUrlOf = (sessionId: string): string =>
  `/api/sessions/${sessionId}/events`;

/**
 * 세션 생성 → 스트림 구독 → 스토어 갱신의 수명주기를 담당합니다.
 * 컴포넌트는 `submit()` / `cancel()` 만 호출하면 됩니다.
 */
export function useCompanySession(): CompanySession {
  const isRunning = useSessionStore((s) => s.isRunning);
  const isCancelling = useSessionStore((s) => s.isCancelling);
  const beginSession = useSessionStore((s) => s.beginSession);
  const resumeSession = useSessionStore((s) => s.resumeSession);
  const markCancelling = useSessionStore((s) => s.markCancelling);
  const applyEvent = useSessionStore((s) => s.applyEvent);
  const failSession = useSessionStore((s) => s.failSession);
  const finishSession = useSessionStore((s) => s.finishSession);

  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  const detach = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  /** 구독을 거는 지점을 하나로 모읍니다 (신규 접수와 새로고침 복귀가 같은 경로) */
  const attach = useCallback(
    (streamUrl: string) => {
      unsubscribeRef.current = subscribeToSession(streamUrl, {
        onEvent: (event) => {
          // 끝난 세션 id 를 들고 있으면 다음 새로고침 때 헛되이 복귀를 시도합니다
          if (event.type === 'done' || event.type === 'error' || event.type === 'cancelled') {
            activeSession.clear();
          }
          applyEvent(event);
        },
        onError: failSession,
        onClose: finishSession,
      });
    },
    [applyEvent, failSession, finishSession],
  );

  // 언마운트 시 스트림 정리 (EventSource 누수 방지)
  useEffect(() => detach, [detach]);

  /**
   * 새로고침 복귀.
   *
   * 서버가 세션을 들고 있고 이벤트 스트림이 ReplaySubject 라서,
   * id 만 기억해 두면 재구독만으로 그동안의 진행 상황이 그대로 흘러옵니다.
   * 로컬 모델은 한 건에 수 분이 걸리므로 이게 없으면 새로고침 한 번에
   * 사실상 처음부터 다시 시켜야 합니다.
   */
  useEffect(() => {
    const saved = activeSession.load();
    if (!saved) return;

    let stale = false;

    void (async () => {
      try {
        const { session } = await companyService.getSession(saved);
        if (stale) return;

        // 이미 끝난 세션이면 다시 붙을 이유가 없습니다
        if (session.status !== 'running' && session.status !== 'pending') {
          activeSession.clear();
          return;
        }

        resumeSession(session.id, session.brief);
        attach(streamUrlOf(session.id));
      } catch {
        // 서버가 재시작됐거나 TTL 로 정리된 세션 — 조용히 잊습니다
        activeSession.clear();
      }
    })();

    return () => {
      stale = true;
    };
  }, [attach, resumeSession]);

  const submit = useCallback(
    async (brief: string, parentSessionId?: string): Promise<void> => {
      detach();

      try {
        const { session, streamUrl } = await companyService.createSession(
          brief,
          parentSessionId,
        );
        beginSession(session.id, session.brief);
        activeSession.save(session.id);
        attach(streamUrl);
      } catch (err) {
        failSession(
          err instanceof ApiError ? err.message : '지시를 접수하지 못했습니다.',
        );
      }
    },
    [attach, beginSession, detach, failSession],
  );

  const cancel = useCallback(async (): Promise<void> => {
    const { sessionId, isRunning: running } = useSessionStore.getState();
    if (!sessionId || !running) return;

    markCancelling();
    try {
      await companyService.cancelSession(sessionId);
      // 실제 상태 전환은 서버가 보내는 'cancelled' 이벤트가 처리합니다
      activeSession.clear();
    } catch (err) {
      failSession(
        err instanceof ApiError ? err.message : '중단 요청에 실패했습니다.',
      );
    }
  }, [failSession, markCancelling]);

  return { isRunning, isCancelling, submit, cancel, detach };
}
