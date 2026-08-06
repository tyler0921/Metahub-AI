import { Markdown } from '@/components/common/Markdown';
import { useSessionStore } from '@/store/session.store';
import styles from './DeliverablePanel.module.css';

export function DeliverablePanel({
  theme = 'light',
}: {
  theme?: 'light' | 'sidebar';
}): React.JSX.Element {
  const result = useSessionStore((s) => s.result);
  const isRunning = useSessionStore((s) => s.isRunning);
  const requestFollowUp = useSessionStore((s) => s.requestFollowUp);
  const isSidebar = theme === 'sidebar';

  if (!result) {
    return (
      <p className={`${styles.empty} ${isSidebar ? styles.sidebarEmpty : ''}`}>
        {isRunning ? '부서들이 작업 중입니다…' : '아직 산출물이 없습니다.'}
      </p>
    );
  }

  const { review } = result;
  const approved = review?.verdict === 'approve';

  return (
    <div className={isSidebar ? styles.sidebarRoot : undefined}>
      <section
        className={`${styles.verdict} ${approved ? styles.approved : styles.rework}`}
      >
        <div>
          <span className={styles.score}>{review?.score ?? '-'}</span>
          <span className={styles.scoreSuffix}>
            {' '}
            / 100 · {approved ? '승인' : '조건부 승인'}
          </span>
        </div>

        {review?.note && <p className={styles.note}>{review.note}</p>}

        {review && review.issues.length > 0 && (
          <p className={styles.issues}>남은 이슈: {review.issues.join(' · ')}</p>
        )}
      </section>

      <div className={styles.savebar}>
        💾 Obsidian 저장 완료 · <code>{result.vaultFolder}</code>
      </div>

      {/* 마음에 안 드는 부분만 짚어 다시 시키면 처음부터 다시 만들지 않습니다 */}
      <button
        type="button"
        className={styles.followUp}
        disabled={isRunning}
        onClick={() => requestFollowUp(result.sessionId)}
      >
        ✍️ 이 산출물에 이어서 지시하기
      </button>

      <Markdown content={result.body} />

      <footer className={styles.footer}>
        {result.elapsedSeconds}초 소요 · LLM {result.usage.calls}회 호출 · 토큰{' '}
        {(result.usage.inputTokens + result.usage.outputTokens).toLocaleString()}
      </footer>
    </div>
  );
}
