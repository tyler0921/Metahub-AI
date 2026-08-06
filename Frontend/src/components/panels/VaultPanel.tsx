import { useVaultProjects } from '@/hooks/useVaultProjects';
import { useSessionStore } from '@/store/session.store';
import styles from './VaultPanel.module.css';

export function VaultPanel({
  theme = 'light',
}: {
  theme?: 'light' | 'sidebar';
}): React.JSX.Element {
  const result = useSessionStore((s) => s.result);
  const { data, isLoading } = useVaultProjects(result?.sessionId ?? null);
  const isSidebar = theme === 'sidebar';

  if (isLoading && !data) {
    return (
      <p className={`${styles.empty} ${isSidebar ? styles.sidebarEmpty : ''}`}>
        불러오는 중…
      </p>
    );
  }

  if (!data) {
    return (
      <p className={`${styles.empty} ${isSidebar ? styles.sidebarEmpty : ''}`}>
        볼트 정보를 가져오지 못했습니다.
      </p>
    );
  }

  return (
    <div className={isSidebar ? styles.sidebarRoot : undefined}>
      <p className={styles.path}>📂 {data.basePath}</p>

      {data.projects.length === 0 ? (
        <p className={styles.empty}>아직 저장된 프로젝트가 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {data.projects.map((project) => (
            <li key={project.folder} className={styles.item}>
              <span className={styles.date}>{project.date}</span>
              <span className={styles.title}>{project.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
