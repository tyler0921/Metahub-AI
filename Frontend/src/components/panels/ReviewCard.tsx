import type { ReviewResult } from '@shared';
import styles from './ReviewCard.module.css';

interface ReviewCardProps {
  review: ReviewResult;
  attempt: number;
  /** 타임라인·산출물 패널에서 약간 다른 밀도 */
  compact?: boolean;
}

/** 검수 점수·승인/반려·강점·이슈를 한 카드로 보여줍니다. */
export function ReviewCard({
  review,
  attempt,
  compact = false,
}: ReviewCardProps): React.JSX.Element {
  const approved = review.verdict === 'approve';

  return (
    <article
      className={[
        styles.card,
        approved ? styles.approved : styles.rework,
        compact ? styles.compact : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className={styles.head}>
        <span className={styles.score}>{review.score}</span>
        <div className={styles.headText}>
          <strong>{approved ? '승인' : '재작업 요청'}</strong>
          <small>{attempt + 1}차 검수</small>
        </div>
      </header>

      {review.note && <p className={styles.note}>{review.note}</p>}

      {review.strengths.length > 0 && (
        <section className={styles.section}>
          <span className={styles.eyebrow}>잘된 점</span>
          <ul>
            {review.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {review.issues.length > 0 && (
        <section className={styles.section}>
          <span className={styles.eyebrow}>수정 요청</span>
          <ul className={styles.issues}>
            {review.issues.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
