import type { SessionEvent } from '@shared';
import { http } from './http.client';

export interface StreamHandlers {
  onEvent: (event: SessionEvent) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

/** 구독 해제 함수 */
export type Unsubscribe = () => void;

/**
 * 세션 진행 상황 구독.
 *
 * 서버가 `POST /sessions` 와 `GET /sessions/:id/events` 를 분리해 뒀기 때문에
 * 브라우저 표준 EventSource 를 그대로 쓸 수 있습니다.
 * (fetch 스트림을 수동 파싱할 필요가 없어 재접속·에러 처리가 훨씬 단순합니다)
 */
export function subscribeToSession(
  streamUrl: string,
  handlers: StreamHandlers,
): Unsubscribe {
  // streamUrl 은 '/api/sessions/:id/events' 형태로 내려옵니다
  const source = new EventSource(http.resolve(streamUrl.replace(/^\/api/, '')));
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    source.close();
    handlers.onClose();
  };

  source.onmessage = (message: MessageEvent<string>) => {
    let event: SessionEvent;
    try {
      event = JSON.parse(message.data) as SessionEvent;
    } catch {
      handlers.onError('서버 이벤트를 해석하지 못했습니다.');
      return;
    }

    handlers.onEvent(event);

    // 종료 이벤트를 받으면 스스로 끊는다 (EventSource 자동 재연결 방지)
    if (event.type === 'done' || event.type === 'error' || event.type === 'cancelled') {
      close();
    }
  };

  source.onerror = () => {
    // 정상 종료 직후에도 onerror 가 한 번 호출될 수 있으므로 상태를 확인
    if (source.readyState === EventSource.CLOSED && !closed) {
      handlers.onError('스트림 연결이 끊어졌습니다.');
      close();
    }
  };

  return close;
}
