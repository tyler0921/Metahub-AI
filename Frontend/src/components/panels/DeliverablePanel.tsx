import { ArtifactPanel } from '@/components/panels/ArtifactPanel';
import { Markdown } from '@/components/common/Markdown';
import { ReviewCard } from '@/components/panels/ReviewCard';
import { useSessionStore } from '@/store/session.store';
import styles from './DeliverablePanel.module.css';

export function DeliverablePanel({
  theme = 'light',
}: {
  theme?: 'light' | 'sidebar';
}): React.JSX.Element {
  const result = useSessionStore((s) => s.result);
  const isRunning = useSessionStore((s) => s.isRunning);
  const previewUrl = useSessionStore((s) => s.previewUrl);
  const reviews = useSessionStore((s) => s.reviews);
  const requestFollowUp = useSessionStore((s) => s.requestFollowUp);
  const setFocusMode = useSessionStore((s) => s.setFocusMode);
  const isSidebar = theme === 'sidebar';

  /* 좁은 사이드바에서는 확인이 어려우니 크게 보는 길을 항상 열어 둡니다 */
  const focusButton = (
    <button type="button" className={styles.focus} onClick={() => setFocusMode(true)}>
      집중 모드로 크게 보기
    </button>
  );

  if (!result) {
    const latestReview = reviews[reviews.length - 1];

    return (
      <div className={isSidebar ? styles.sidebarRoot : undefined}>
        {previewUrl && focusButton}
        {/* 아직 안 끝났어도 파일이 생기는 대로 보여줍니다 */}
        <ArtifactPanel />
        {latestReview && (
          <div className={styles.liveReview}>
            <ReviewCard
              review={latestReview.review}
              attempt={latestReview.attempt}
            />
          </div>
        )}
        {!previewUrl && !latestReview && (
          <p className={`${styles.empty} ${isSidebar ? styles.sidebarEmpty : ''}`}>
            {isRunning ? '부서들이 작업 중입니다…' : '아직 산출물이 없습니다.'}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={isSidebar ? styles.sidebarRoot : undefined}>
      {focusButton}

      {/* 코드형이면 실물을 맨 위에 — 점수보다 먼저 눈에 들어와야 합니다 */}
      <ArtifactPanel />

      {reviews.length > 0 ? (
        <div className={styles.reviewStack}>
          {reviews.map((item) => (
            <ReviewCard
              key={`${item.attempt}-${item.at}`}
              review={item.review}
              attempt={item.attempt}
            />
          ))}
        </div>
      ) : result.review ? (
        <ReviewCard review={result.review} attempt={0} />
      ) : null}

      <div className={styles.savebar}>
        Obsidian 저장 완료 · <code>{result.vaultFolder}</code>
      </div>

      {/* 마음에 안 드는 부분만 짚어 다시 시키면 처음부터 다시 만들지 않습니다 */}
      <button
        type="button"
        className={styles.followUp}
        disabled={isRunning}
        onClick={() => requestFollowUp(result.sessionId)}
      >
        이 산출물에 이어서 지시하기
      </button>

      <Markdown content={result.body} />

      <footer className={styles.footer}>
        {result.elapsedSeconds}초 소요 · LLM {result.usage.calls}회 호출 · 토큰{' '}
        {(result.usage.inputTokens + result.usage.outputTokens).toLocaleString()}
      </footer>
    </div>
  );
}
