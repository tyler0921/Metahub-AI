import { useCallback, useState } from 'react';
import { API_BASE_URL } from '@/config/env';
import { useSessionStore } from '@/store/session.store';
import styles from './ArtifactPanel.module.css';

const formatBytes = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

/**
 * 코드형 산출물 미리보기.
 *
 * 서버가 workspace 폴더를 정적으로 서빙하므로, 만들어진 페이지를
 * iframe 에 그대로 띄웁니다. 마크다운으로 옮겨 그리지 않고 **실물**을
 * 보여주는 게 핵심입니다 — 그래야 레이아웃이 깨졌는지 알 수 있습니다.
 */
export function ArtifactPanel(): React.JSX.Element | null {
  const artifacts = useSessionStore((s) => s.artifacts);
  const previewUrl = useSessionStore((s) => s.previewUrl);
  const isRunning = useSessionStore((s) => s.isRunning);

  /**
   * iframe 을 강제로 다시 그리기 위한 키.
   *
   * 재작업으로 파일이 바뀌어도 주소가 같으면 브라우저가 다시 읽지
   * 않습니다. 키를 바꿔 요소를 통째로 갈아끼웁니다.
   */
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  if (!previewUrl) return null;

  const absoluteUrl = `${API_BASE_URL}${previewUrl}`;

  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <span className={styles.title}>
          미리보기
          {isRunning && <span className={styles.building}> · 만드는 중…</span>}
        </span>

        <span className={styles.actions}>
          <button type="button" className={styles.action} onClick={reload}>
            새로고침
          </button>
          <a
            className={styles.action}
            href={absoluteUrl}
            target="_blank"
            rel="noreferrer"
          >
            새 탭에서 열기
          </a>
        </span>
      </header>

      <div className={styles.frameWrap}>
        <iframe
          key={reloadKey}
          className={styles.frame}
          src={absoluteUrl}
          title="산출물 미리보기"
          // 만든 주체가 LLM 이므로 최소 권한만 줍니다.
          // same-origin 을 주지 않으므로 이 페이지의 쿠키·스토리지에 닿지 못합니다.
          sandbox="allow-scripts"
        />
      </div>

      {artifacts.length > 0 && (
        <ul className={styles.files}>
          {artifacts.map((file) => (
            <li key={file.path} className={styles.file}>
              <a
                href={`${API_BASE_URL}${previewUrl.replace(/[^/]+$/, '')}${file.path}`}
                target="_blank"
                rel="noreferrer"
                className={styles.fileName}
              >
                {file.path}
              </a>
              <span className={styles.fileMeta}>{formatBytes(file.bytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
