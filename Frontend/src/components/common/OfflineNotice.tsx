import styles from './OfflineNotice.module.css';

interface OfflineNoticeProps {
  message: string;
  onRetry: () => void;
}

/** 백엔드가 꺼져 있을 때 무엇을 해야 하는지 알려주는 안내 */
export function OfflineNotice({
  message,
  onRetry,
}: OfflineNoticeProps): React.JSX.Element {
  return (
    <div className={styles.notice} role="alert">
      <b className={styles.title}>Backend 서버에 연결할 수 없습니다.</b>

      <p>다른 터미널에서 아래를 실행하세요.</p>
      <pre className={styles.code}>{'cd Backend\nnpm run start:dev'}</pre>

      <p>
        다른 주소의 백엔드를 쓰신다면 <code>Frontend/.env</code> 의{' '}
        <code>VITE_API_PROXY_TARGET</code> 을 바꾸세요.
      </p>

      <p className={styles.detail}>{message}</p>

      <button type="button" className={styles.retry} onClick={onRetry}>
        다시 연결
      </button>
    </div>
  );
}
