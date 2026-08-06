import styles from './BootingNotice.module.css';

/**
 * 백엔드가 아직 뜨는 중일 때 잠깐 보이는 화면.
 *
 * `npm run dev` 는 프론트와 백엔드를 동시에 켜는데 프론트가 1~2초 먼저 뜹니다.
 * 그 짧은 틈에 "연결할 수 없습니다" 경고를 띄우면 실제로는 아무 문제가 없는데도
 * 사용자가 놀라게 되므로, 기다리는 중임을 알려주기만 합니다.
 */
export function BootingNotice(): React.JSX.Element {
  return (
    <div className={styles.notice} role="status" aria-live="polite">
      <div className={styles.spinner} aria-hidden="true" />
      <b className={styles.title}>사무실 문을 여는 중…</b>
      <p className={styles.detail}>백엔드 서버가 준비되면 자동으로 연결됩니다.</p>
    </div>
  );
}
