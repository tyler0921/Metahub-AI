import { useCallback, useEffect, useState } from 'react';
import { Markdown } from '@/components/common/Markdown';
import { ReviewCard } from '@/components/panels/ReviewCard';
import { API_BASE_URL } from '@/config/env';
import { useSessionStore } from '@/store/session.store';
import styles from './DeliverableFocus.module.css';

const formatBytes = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

/**
 * 산출물 집중 모드.
 *
 * 오피스·사이드바를 통째로 덮고 결과물만 봅니다. 사이드바 폭(360px 남짓)에서는
 * 코드형 미리보기가 사실상 읽히지 않아서, 다 만든 뒤 확인하는 화면을 따로
 * 뒀습니다. 여기서 바로 "이어서 지시"로 넘어갈 수 있어야 왕복이 줄어듭니다.
 */
export function DeliverableFocus(): React.JSX.Element | null {
  const focusMode = useSessionStore((s) => s.focusMode);
  const setFocusMode = useSessionStore((s) => s.setFocusMode);
  const result = useSessionStore((s) => s.result);
  const artifacts = useSessionStore((s) => s.artifacts);
  const previewUrl = useSessionStore((s) => s.previewUrl);
  const reviews = useSessionStore((s) => s.reviews);
  const isRunning = useSessionStore((s) => s.isRunning);
  const brief = useSessionStore((s) => s.brief);
  const requestFollowUp = useSessionStore((s) => s.requestFollowUp);

  const [reloadKey, setReloadKey] = useState(0);

  const close = useCallback(() => setFocusMode(false), [setFocusMode]);

  useEffect(() => {
    if (!focusMode) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode, close]);

  if (!focusMode) return null;
  if (!result && !previewUrl) return null;

  const absoluteUrl = previewUrl ? `${API_BASE_URL}${previewUrl}` : null;
  const fileBase = previewUrl ? previewUrl.replace(/[^/]+$/, '') : '';
  const files = artifacts.length > 0 ? artifacts : (result?.artifacts ?? []);

  const startFollowUp = (): void => {
    if (!result) return;
    requestFollowUp(result.sessionId);
    close();
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="산출물 집중 모드">
      <header className={styles.head}>
        <div className={styles.headText}>
          <span className={styles.eyebrow}>
            산출물{isRunning && <em className={styles.live}> · 만드는 중</em>}
          </span>
          <h2 className={styles.title}>{result?.brief || brief || '산출물'}</h2>
        </div>

        <div className={styles.headActions}>
          {absoluteUrl && (
            <>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => setReloadKey((n) => n + 1)}
              >
                새로고침
              </button>
              <a className={styles.ghost} href={absoluteUrl} target="_blank" rel="noreferrer">
                새 탭
              </a>
            </>
          )}
          <button type="button" className={styles.close} onClick={close}>
            닫기 <kbd>Esc</kbd>
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <main className={styles.stage}>
          {absoluteUrl ? (
            <iframe
              key={reloadKey}
              className={styles.frame}
              src={absoluteUrl}
              title="산출물 미리보기"
              // ArtifactPanel 과 같은 이유로 최소 권한만 줍니다
              sandbox="allow-scripts"
            />
          ) : (
            <div className={styles.doc}>
              <Markdown content={result?.body ?? ''} />
            </div>
          )}
        </main>

        <aside className={styles.side}>
          {result && (
            <section className={styles.block}>
              <h3 className={styles.blockTitle}>저장 위치</h3>
              <p className={styles.path}>
                <span>Obsidian</span>
                <code>{result.vaultFolder}</code>
              </p>
              {result.workspaceFolder && (
                <p className={styles.path}>
                  <span>workspace</span>
                  <code>{result.workspaceFolder}</code>
                </p>
              )}
            </section>
          )}

          {files.length > 0 && (
            <section className={styles.block}>
              <h3 className={styles.blockTitle}>파일 {files.length}개</h3>
              <ul className={styles.files}>
                {files.map((file) => (
                  <li key={file.path} className={styles.file}>
                    {previewUrl ? (
                      <a
                        href={`${API_BASE_URL}${fileBase}${file.path}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {file.path}
                      </a>
                    ) : (
                      <span>{file.path}</span>
                    )}
                    <em>{formatBytes(file.bytes)}</em>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {reviews.length > 0 && (
            <section className={styles.block}>
              <h3 className={styles.blockTitle}>검수 기록</h3>
              <div className={styles.reviews}>
                {reviews.map((item) => (
                  <ReviewCard
                    key={`${item.attempt}-${item.at}`}
                    review={item.review}
                    attempt={item.attempt}
                    compact
                  />
                ))}
              </div>
            </section>
          )}

          {/* 코드형이면 본문이 설명문이라 미리보기 옆에 같이 둡니다 */}
          {absoluteUrl && result?.body && (
            <section className={styles.block}>
              <h3 className={styles.blockTitle}>작업 요약</h3>
              <div className={styles.summary}>
                <Markdown content={result.body} />
              </div>
            </section>
          )}
        </aside>
      </div>

      <footer className={styles.foot}>
        <span className={styles.meta}>
          {result
            ? `${result.elapsedSeconds}초 소요 · LLM ${result.usage.calls}회 호출 · 토큰 ${(
                result.usage.inputTokens + result.usage.outputTokens
              ).toLocaleString()}`
            : '작업이 진행 중입니다…'}
        </span>
        <button
          type="button"
          className={styles.followUp}
          disabled={!result || isRunning}
          onClick={startFollowUp}
        >
          이 결과 이어서 수정하기
        </button>
      </footer>
    </div>
  );
}
